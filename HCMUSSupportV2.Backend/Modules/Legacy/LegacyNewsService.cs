using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Modules.Notifications;
using HCMUSSupportV2.Backend.Modules.Notifications.Domain;
using HCMUSSupportV2.Backend.Modules.Notifications.Editor;
using HCMUSSupportV2.Backend.Modules.Notifications.Markdown;
using HCMUSSupportV2.Backend.Modules.Notifications.Publishing;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using UUIDNext;

namespace HCMUSSupportV2.Backend.Modules.Legacy;

/// <summary>
/// The admin import endpoint behind <c>tools/legacy-news</c>: turns each converted v1 news file into a <b>published</b> notification
/// with <c>published_at</c> (and the deliveries' <c>delivered_at</c>) set to the v1 <c>datestr</c>. Audience: <c>audience_all</c> when the
/// post has no variables and covers at least <c>AllCoverage</c> of the active roster (people with a mapped email), otherwise an applied
/// recipient import built from the rows. Idempotent through <c>legacy_import_marks</c> (key = v1 file name): an imported key is reported
/// as <c>unchanged</c> (or <c>changed_skipped</c> when the file changed since), never imported twice. Imported deliveries are marked
/// read by default, because v1 had no read state and 56 old announcements must not become 56 unread badges.
/// </summary>
public class LegacyNewsService(AppDbContext db, FanOutService fanOut, IAuditLogger audit)
{
    private static readonly TimeSpan Vietnam = TimeSpan.FromHours(7);
    private static readonly JsonSerializerOptions HashJson = new(JsonSerializerDefaults.Web);

    public async Task<LegacyNewsReportDto> ImportAsync(LegacyNewsRequest request, bool dryRun, CancellationToken ct)
    {
        var kind = request.Kind switch { null or "" or LegacyKinds.News => LegacyKinds.News, LegacyKinds.Banner => LegacyKinds.Banner,
            _ => throw ApiException.Invalid("kind", "Kind phải là news hoặc banner.") };
        if (request.AllCoverage is <= 0 or > 1) throw ApiException.Invalid("allCoverage", "allCoverage phải trong khoảng (0, 1].");

        var roster = await LoadRosterAsync(ct);
        var items = new List<LegacyNewsItemDto>();
        // Oldest first, so UUID v7 ids (the editor's list order) follow the v1 dates.
        var posts = (request.Posts ?? []).OrderBy(p => p.PublishedOn, StringComparer.Ordinal).ThenBy(p => p.Key, StringComparer.Ordinal).ToList();
        foreach (var post in posts)
            items.Add(await ImportOneAsync(post, kind, request, roster, dryRun, ct));

        return new LegacyNewsReportDto(dryRun,
            items.Count(i => i.Action is "created" or "would_create"), items.Count(i => i.Action == "unchanged"),
            items.Count(i => i.Action == "changed_skipped"), items.Count(i => i.Action == "rejected"), items);
    }

    private sealed record Roster(HashSet<string> All, HashSet<string> Active, HashSet<string> ActiveWithEmail);

    private async Task<Roster> LoadRosterAsync(CancellationToken ct)
    {
        var employees = await db.Set<Employee>().AsNoTracking().Select(e => new { e.Code, e.Status }).ToListAsync(ct);
        var withEmail = await db.Set<EmployeeEmail>().AsNoTracking().Select(m => m.EmployeeCode).Distinct().ToListAsync(ct);
        var active = employees.Where(e => e.Status == EmployeeStatuses.Active).Select(e => e.Code).ToHashSet(StringComparer.Ordinal);
        return new Roster(employees.Select(e => e.Code).ToHashSet(StringComparer.Ordinal), active,
            withEmail.Where(active.Contains).ToHashSet(StringComparer.Ordinal));
    }

    private async Task<LegacyNewsItemDto> ImportOneAsync(LegacyNewsPostDto post, string kind, LegacyNewsRequest request, Roster roster, bool dryRun, CancellationToken ct)
    {
        var key = post.Key?.Trim() ?? "";
        var issues = new List<string>();
        LegacyNewsItemDto Reject(string audience = "none") => new(key, "rejected", audience, 0, 0, 0, 0, post.SeriesName, post.TagNames ?? [], issues);

        // ---- validation
        if (key.Length is 0 or > 300) issues.Add("Thiếu key hoặc key dài quá 300 ký tự.");
        var title = post.Title?.Trim() ?? "";
        if (title.Length is 0 or > 500) issues.Add("Tiêu đề phải có 1 đến 500 ký tự.");
        if (!DateOnly.TryParseExact(post.PublishedOn, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var publishedOn))
            issues.Add("publishedOn phải có dạng yyyy-MM-dd.");
        var body = post.BodyMd ?? "";
        if (string.IsNullOrWhiteSpace(body)) issues.Add("Nội dung rỗng.");

        var variables = new List<VariableDto>();
        foreach (var v in post.Variables ?? [])
        {
            var vk = v.Key?.Trim() ?? "";
            if (!NotificationMarkdown.IsValidVarKey(vk)) { issues.Add($"Tên biến \"{vk}\" không hợp lệ."); continue; }
            if (variables.Any(x => x.Key == vk)) { issues.Add($"Biến \"{vk}\" bị trùng."); continue; }
            variables.Add(new VariableDto(vk, string.IsNullOrWhiteSpace(v.Label) ? vk : v.Label.Trim(), string.IsNullOrWhiteSpace(v.Type) ? "text" : v.Type.Trim().ToLowerInvariant()));
        }
        DateTimeOffset? pinnedUntil = null;
        if (!string.IsNullOrWhiteSpace(post.PinnedUntil))
        {
            if (DateOnly.TryParseExact(post.PinnedUntil, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var pu))
                pinnedUntil = MidnightVn(pu);
            else issues.Add("pinnedUntil phải có dạng yyyy-MM-dd.");
        }
        var analysis = string.IsNullOrWhiteSpace(body) ? null : NotificationMarkdown.Analyze(body, variables.Select(v => v.Key).ToList());
        if (analysis is not null)
            foreach (var issue in analysis.Issues) issues.Add(NotificationEditorService.FormatIssue(issue));
        if (issues.Count > 0) return Reject();

        // ---- idempotency
        var rows = Normalize(post.Rows, variables);
        var hash = Hash(title, publishedOn, body, variables, rows, post);
        var mark = await db.Set<LegacyImportMark>().AsNoTracking().FirstOrDefaultAsync(m => m.Kind == kind && m.Key == key, ct);

        // ---- audience
        var distinct = rows.Keys.ToList();
        var known = distinct.Count(roster.All.Contains);
        var inactive = distinct.Count(c => roster.All.Contains(c) && !roster.Active.Contains(c));
        var covered = distinct.Count(roster.ActiveWithEmail.Contains);
        var coverage = roster.ActiveWithEmail.Count == 0 ? 0 : Math.Round(covered / (double)roster.ActiveWithEmail.Count, 3);
        var all = post.AudienceAll ?? (variables.Count == 0 && coverage >= request.AllCoverage);
        var audience = all ? "all" : "import";
        var recipients = all ? roster.ActiveWithEmail.Count : distinct.Count(roster.Active.Contains);
        var unknown = distinct.Count - known;

        if (mark is not null)
        {
            var action = mark.ContentHash == hash ? "unchanged" : "changed_skipped";
            if (action == "changed_skipped") issues.Add("Tệp v1 đã thay đổi từ lần nhập trước; bài đã đăng không bị sửa.");
            // A crash between "post created" and "deliveries created" leaves a post with no recipients: finish it. Otherwise nothing is touched.
            if (!dryRun && Guid.TryParse(mark.TargetId, out var existingId)
                && await db.Set<Notification>().AsNoTracking().AnyAsync(x => x.Id == existingId && x.RecipientCount == 0 && x.Status == NotificationStatuses.Published, ct))
                await HealFanOutAsync(existingId, publishedOn, request.MarkRead, ct);
            return new LegacyNewsItemDto(key, action, audience, recipients, unknown, inactive, coverage, post.SeriesName, post.TagNames ?? [], issues);
        }

        if (!all && recipients == 0)
        {
            issues.Add("Không có người nhận hợp lệ (danh sách rỗng hoặc toàn MSCB chưa có trong HRM).");
            return Reject(audience);
        }

        // ---- tags and series
        var tagNames = (post.TagNames ?? []).Select(t => t.Trim()).Where(t => t.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        var tags = await db.Set<Tag>().AsNoTracking().Where(t => tagNames.Contains(t.Name)).ToListAsync(ct);
        foreach (var missing in tagNames.Where(n => tags.All(t => !string.Equals(t.Name, n, StringComparison.OrdinalIgnoreCase))))
            issues.Add($"Không có nhãn \"{missing}\"; bỏ qua nhãn này.");

        if (dryRun) return new LegacyNewsItemDto(key, "would_create", audience, recipients, unknown, inactive, coverage, post.SeriesName, tags.Select(t => t.Name).ToList(), issues);

        // ---- create (one SaveChanges = one transaction: notification, tags, audience, import, revision and the mark)
        long? seriesId = null;
        if (!string.IsNullOrWhiteSpace(post.SeriesName))
        {
            var name = post.SeriesName.Trim();
            var series = await db.Set<NotificationSeries>().FirstOrDefaultAsync(s => s.Name == name, ct);
            if (series is null)
            {
                series = new NotificationSeries { Name = name.Length > 200 ? name[..200] : name };
                db.Set<NotificationSeries>().Add(series);
                await db.SaveChangesAsync(ct);
            }
            seriesId = series.Id;
        }

        var publishedAt = MidnightVn(publishedOn);
        var id = Uuid.NewDatabaseFriendly(Database.PostgreSql);
        var variablesJson = JsonSerializer.Serialize(variables, NotificationJson.Options);
        var n = new Notification
        {
            Id = id, SeriesId = seriesId, Title = title, Summary = analysis!.Summary, SummaryIsCustom = false, BodyMd = body,
            ContentText = analysis.ContentText, Variables = variablesJson, Status = NotificationStatuses.Published,
            PublishAt = publishedAt, PublishedAt = publishedAt, PinnedUntil = pinnedUntil, RequiresAck = post.RequiresAck,
            AudienceAll = all, Version = 1, CreatedAt = publishedAt, UpdatedAt = publishedAt,
        };
        db.Set<Notification>().Add(n);
        await db.SaveChangesAsync(ct); // tags, audiences and revisions reference the notification row
        foreach (var t in tags) db.Set<NotificationTag>().Add(new NotificationTag { NotificationId = id, TagId = t.Id });
        if (!all)
        {
            var importId = Uuid.NewDatabaseFriendly(Database.PostgreSql);
            db.Set<NotificationRecipientImport>().Add(new NotificationRecipientImport
            {
                Id = importId, NotificationId = id, Status = ImportStatuses.Applied, AppliedAt = publishedAt, CreatedAt = publishedAt,
                Columns = JsonSerializer.Serialize(variables.Select(v => new { v.Key, v.Label, header = v.Key }), NotificationJson.Options),
                Rows = JsonSerializer.Serialize(rows, NotificationJson.Options),
                Report = JsonSerializer.Serialize(new { rows = rows.Values.Sum(r => r.Count), distinctEmployees = distinct.Count, source = "legacy-migration" }, NotificationJson.Options),
            });
            await db.SaveChangesAsync(ct); // the audience references the import
            db.Set<NotificationAudience>().Add(new NotificationAudience { NotificationId = id, Kind = AudienceKinds.Import, ImportId = importId });
        }
        db.Set<NotificationRevision>().Add(new NotificationRevision
        {
            NotificationId = id, Version = 1, Title = title, Summary = n.Summary, Content = body, Variables = variablesJson, EditedAt = publishedAt,
        });
        db.Set<LegacyImportMark>().Add(new LegacyImportMark { Kind = kind, Key = key, TargetId = id.ToString(), ContentHash = hash, CreatedAt = DateTimeOffset.UtcNow });
        await db.SaveChangesAsync(ct);

        await HealFanOutAsync(id, publishedOn, request.MarkRead, ct);
        await audit.LogAsync("legacy.news_imported", "notification", id.ToString(), new { key, kind, audience, recipients }, ct);
        db.ChangeTracker.Clear();
        return new LegacyNewsItemDto(key, "created", audience, recipients, unknown, inactive, coverage, post.SeriesName, tags.Select(t => t.Name).ToList(), issues);
    }

    /// <summary>
    /// Creates the missing deliveries of an imported post (a no-op when they exist) and, for the ones this call created, sets
    /// <c>delivered_at</c> to the v1 date and (by default) <c>read_at</c> to the same moment.
    /// </summary>
    private async Task HealFanOutAsync(Guid id, DateOnly publishedOn, bool markRead, CancellationToken ct)
    {
        var started = DateTimeOffset.UtcNow.AddSeconds(-1);
        var inserted = await fanOut.FanOutAsync(id, null, ct);
        if (inserted == 0) return;

        var when = MidnightVn(publishedOn);
        var conn = (NpgsqlConnection)db.Database.GetDbConnection();
        await db.Database.OpenConnectionAsync(ct);
        try
        {
            await using (var cmd = new NpgsqlCommand("""
                UPDATE notification_deliveries SET delivered_at = @when, read_at = CASE WHEN @read THEN @when END
                WHERE notification_id = @id AND delivered_at >= @started
                """, conn))
            {
                cmd.Parameters.AddWithValue("when", when);
                cmd.Parameters.AddWithValue("read", markRead);
                cmd.Parameters.AddWithValue("id", id);
                cmd.Parameters.AddWithValue("started", started);
                await cmd.ExecuteNonQueryAsync(ct);
            }
            await using var counters = new NpgsqlCommand("""
                UPDATE notifications SET read_count = (SELECT count(read_at)::int FROM notification_deliveries WHERE notification_id = @id)
                WHERE id = @id
                """, conn);
            counters.Parameters.AddWithValue("id", id);
            await counters.ExecuteNonQueryAsync(ct);
        }
        finally { await db.Database.CloseConnectionAsync(); }
    }

    /// <summary>00:00 on the v1 date in Vietnam time, as a UTC instant (Npgsql writes only offset 0).</summary>
    internal static DateTimeOffset MidnightVn(DateOnly date) => new DateTimeOffset(date.ToDateTime(TimeOnly.MinValue), Vietnam).ToUniversalTime();

    /// <summary>Rows keyed by trimmed MSCB, restricted to the declared variables, values trimmed, null and empty kept as empty text.</summary>
    internal static SortedDictionary<string, List<SortedDictionary<string, string>>> Normalize(
        Dictionary<string, List<Dictionary<string, string?>>>? rows, IReadOnlyList<VariableDto> variables)
    {
        var keys = variables.Select(v => v.Key).ToHashSet(StringComparer.Ordinal);
        var result = new SortedDictionary<string, List<SortedDictionary<string, string>>>(StringComparer.Ordinal);
        foreach (var (mscb, list) in rows ?? [])
        {
            var code = mscb.Trim();
            if (code.Length == 0) continue;
            if (!result.TryGetValue(code, out var target)) result[code] = target = [];
            foreach (var row in list ?? [])
            {
                var clean = new SortedDictionary<string, string>(StringComparer.Ordinal);
                foreach (var (k, v) in row)
                    if (keys.Contains(k)) clean[k] = v?.Trim() ?? "";
                target.Add(clean);
            }
            if (keys.Count == 0) target.Clear(); // a post without variables carries no row data
        }
        return result;
    }

    private static string Hash(string title, DateOnly publishedOn, string body, IReadOnlyList<VariableDto> variables,
        SortedDictionary<string, List<SortedDictionary<string, string>>> rows, LegacyNewsPostDto post)
    {
        var canonical = JsonSerializer.Serialize(new
        {
            title, publishedOn = publishedOn.ToString("yyyy-MM-dd"), body, variables, rows,
            series = post.SeriesName, tags = (post.TagNames ?? []).Order().ToList(), post.AudienceAll, post.PinnedUntil, post.RequiresAck,
        }, HashJson);
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(canonical))).ToLowerInvariant();
    }
}
