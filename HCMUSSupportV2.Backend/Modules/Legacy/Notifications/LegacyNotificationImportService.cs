using System.Text.Json;
using System.Text.Json.Nodes;
using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Hrm.Integration;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Modules.Notifications;
using HCMUSSupportV2.Backend.Modules.Notifications.Domain;
using HCMUSSupportV2.Backend.Modules.Notifications.Editor;
using HCMUSSupportV2.Backend.Modules.Notifications.Import;
using HCMUSSupportV2.Backend.Modules.Notifications.Markdown;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Npgsql;
using NpgsqlTypes;

namespace HCMUSSupportV2.Backend.Modules.Legacy.Notifications;

/// <summary>
/// D15: imports the v1 news posts (docs/LEGACY-MIGRATION.md). Posts are validated, then written in one transaction:
/// the notification rows through EF, the deliveries with set-based SQL (one statement per post). A dry run runs the
/// very same code and rolls the transaction back, so its report equals the real one. No NOTIFY and no jobs: the
/// deliveries are written directly, already dated <c>publishedAt</c>.
/// </summary>
public class LegacyNotificationImportService(AppDbContext db, IAuditLogger audit, IHttpContextAccessor http)
{
    private const int ListCap = 200;
    private static readonly string[] VariableTypes = ["text", "date", "number", "money"];

    private sealed class Prepared
    {
        public required int Index { get; init; }
        public required string Key { get; init; }
        public required Guid Id { get; init; }
        public required Guid ImportId { get; init; }
        public required DateTimeOffset PublishedAt { get; init; }
        public required string Title { get; init; }
        public required string Summary { get; init; }
        public required bool SummaryIsCustom { get; init; }
        public required string Body { get; init; }
        public required string ContentText { get; init; }
        public required List<VariableDto> Variables { get; init; }
        public required string VariablesJson { get; init; }
        public required List<string> Tags { get; init; }
        public required string? Series { get; init; }
        public required DateTimeOffset? PinnedUntil { get; init; }
        public required bool RequiresAck { get; init; }
        public required bool AudienceAll { get; init; }
        public required bool MarkRead { get; init; }

        /// <summary>MSCB to the recipient's rows (import posts only), merged and ordered by MSCB.</summary>
        public required SortedDictionary<string, List<Dictionary<string, string?>>> Recipients { get; init; }
    }

    // ---------------------------------------------------------------- entry point

    public async Task<LegacyNotificationReport> ImportAsync(IReadOnlyList<LegacyPost> input, bool dryRun, CancellationToken ct)
    {
        var reports = new LegacyPostReport?[input.Count];
        var prepared = new List<Prepared>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        for (var i = 0; i < input.Count; i++)
        {
            var (post, issues) = Prepare(i, input[i], seen);
            if (post is not null) prepared.Add(post);
            else reports[i] = new LegacyPostReport(input[i]?.LegacyKey?.Trim() ?? "", TryId(input[i]), LegacyOutcomes.Rejected, issues, 0, 0, 0, 0, 0);
        }

        var details = new List<LegacyNotificationDetail>();
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var dbTx = (NpgsqlTransaction)tx.GetDbTransaction();
        var conn = (NpgsqlConnection)db.Database.GetDbConnection();
        var now = DateTimeOffset.UtcNow;

        // 1. Preload: employees of the import posts, tags, series and whatever already exists for these posts.
        var codes = prepared.SelectMany(p => p.Recipients.Keys).Distinct(StringComparer.Ordinal).ToList();
        var employeeStatus = await db.Set<Employee>().AsNoTracking().Where(e => codes.Contains(e.Code))
            .ToDictionaryAsync(e => e.Code, e => e.Status, StringComparer.Ordinal, ct);

        var tags = await db.Set<Tag>().ToDictionaryAsync(t => t.Name, StringComparer.Ordinal, ct);
        var seriesByName = await db.Set<NotificationSeries>().ToDictionaryAsync(s => s.Name, StringComparer.Ordinal, ct);
        var nextSort = (tags.Count == 0 ? 0 : tags.Values.Max(t => t.Sort)) + 10;
        foreach (var name in prepared.SelectMany(p => p.Tags).Distinct(StringComparer.Ordinal).Where(n => !tags.ContainsKey(n)))
        {
            var tag = new Tag { Name = name, Sort = nextSort };
            nextSort += 10;
            db.Set<Tag>().Add(tag);
            tags[name] = tag;
        }
        foreach (var name in prepared.Select(p => p.Series).OfType<string>().Distinct(StringComparer.Ordinal).Where(n => !seriesByName.ContainsKey(n)))
        {
            var series = new NotificationSeries { Name = name };
            db.Set<NotificationSeries>().Add(series);
            seriesByName[name] = series;
        }
        await db.SaveChangesAsync(ct); // assigns the ids of the new tags and series

        var ids = prepared.Select(p => p.Id).ToList();
        var importIds = prepared.Select(p => p.ImportId).ToList();
        var existing = await db.Set<Notification>().Where(n => ids.Contains(n.Id)).ToDictionaryAsync(n => n.Id, ct);
        var imports = await db.Set<NotificationRecipientImport>().Where(i => importIds.Contains(i.Id)).ToDictionaryAsync(i => i.Id, ct);
        var tagLinks = (await db.Set<NotificationTag>().Where(t => ids.Contains(t.NotificationId)).ToListAsync(ct))
            .GroupBy(t => t.NotificationId).ToDictionary(g => g.Key, g => g.ToList());
        var importAudiences = (await db.Set<NotificationAudience>()
                .Where(a => ids.Contains(a.NotificationId) && a.Kind == AudienceKinds.Import).ToListAsync(ct))
            .GroupBy(a => a.NotificationId).ToDictionary(g => g.Key, g => g.ToList());

        // 2. Apply the notification rows (create or update in place).
        var outcomes = new Dictionary<Guid, string>();
        foreach (var p in prepared)
        {
            var seriesId = p.Series is null ? (long?)null : seriesByName[p.Series].Id;
            var tagIds = p.Tags.Select(t => tags[t].Id).ToHashSet();
            var columns = JsonSerializer.SerializeToNode(
                p.Variables.Select(v => new ImportColumn(v.Key, v.Label ?? v.Key, v.Label ?? v.Key)).ToList(), NotificationJson.Options)!;
            var rows = BuildRows(p);

            if (!existing.TryGetValue(p.Id, out var n))
            {
                n = new Notification
                {
                    Id = p.Id, Status = NotificationStatuses.Published, Version = 1,
                    PublishAt = p.PublishedAt.ToUniversalTime(), PublishedAt = p.PublishedAt.ToUniversalTime(),
                    CreatedAt = now, UpdatedAt = now,
                };
                Apply(n, p, seriesId);
                db.Set<Notification>().Add(n);
                foreach (var tagId in tagIds) db.Set<NotificationTag>().Add(new NotificationTag { NotificationId = n.Id, TagId = tagId });
                if (!p.AudienceAll) AddImport(p, columns, rows, employeeStatus, now);
                outcomes[p.Id] = LegacyOutcomes.Created;
                continue;
            }

            var linkedTags = tagLinks.GetValueOrDefault(p.Id) ?? [];
            imports.TryGetValue(p.ImportId, out var import);
            var audiences = importAudiences.GetValueOrDefault(p.Id) ?? [];

            var contentChanged = n.Title != p.Title || n.BodyMd != p.Body || !JsonEquals(n.Variables, p.VariablesJson);
            var changed = contentChanged || n.Summary != p.Summary || n.SummaryIsCustom != p.SummaryIsCustom
                || n.SeriesId != seriesId || n.PinnedUntil?.ToUnixTimeMilliseconds() != p.PinnedUntil?.ToUnixTimeMilliseconds()
                || n.RequiresAck != p.RequiresAck || n.AudienceAll != p.AudienceAll
                || !linkedTags.Select(t => t.TagId).ToHashSet().SetEquals(tagIds)
                || (p.AudienceAll
                    ? audiences.Count > 0
                    : import is null || import.Status != ImportStatuses.Applied || audiences.Count != 1 || audiences[0].ImportId != import.Id
                      || !JsonEquals(import.Rows, rows) || !JsonEquals(import.Columns, columns));
            if (!changed) { outcomes[p.Id] = LegacyOutcomes.Unchanged; continue; }

            Apply(n, p, seriesId);
            n.Version++;
            n.UpdatedAt = now;
            if (contentChanged) n.ContentUpdatedAt = now;
            db.Set<NotificationRevision>().Add(new NotificationRevision
            {
                NotificationId = n.Id, Version = n.Version, Title = n.Title, Summary = n.Summary,
                Content = n.BodyMd, Variables = n.Variables, EditedAt = now,
            });
            foreach (var link in linkedTags.Where(t => !tagIds.Contains(t.TagId))) db.Set<NotificationTag>().Remove(link);
            foreach (var tagId in tagIds.Where(t => linkedTags.All(l => l.TagId != t)))
                db.Set<NotificationTag>().Add(new NotificationTag { NotificationId = n.Id, TagId = tagId });

            if (p.AudienceAll)
            {
                db.Set<NotificationAudience>().RemoveRange(audiences);
                if (import is not null) db.Set<NotificationRecipientImport>().Remove(import);
            }
            else if (import is null)
            {
                db.Set<NotificationAudience>().RemoveRange(audiences);
                AddImport(p, columns, rows, employeeStatus, now);
            }
            else
            {
                // Same deterministic import row: refresh it in place and make sure exactly one audience points at it.
                import.Status = ImportStatuses.Applied;
                import.Columns = columns.ToJsonString();
                import.Rows = rows.ToJsonString();
                import.Report = JsonSerializer.Serialize(BuildReport(p, employeeStatus), NotificationJson.Options);
                import.AppliedAt = now;
                var keep = audiences.FirstOrDefault(a => a.ImportId == import.Id);
                db.Set<NotificationAudience>().RemoveRange(audiences.Where(a => a != keep));
                if (keep is null)
                    db.Set<NotificationAudience>().Add(new NotificationAudience { NotificationId = n.Id, Kind = AudienceKinds.Import, ImportId = import.Id });
            }
            outcomes[p.Id] = LegacyOutcomes.Updated;
        }
        await db.SaveChangesAsync(ct);

        // 3. Deliveries and counters, one statement each per post.
        foreach (var p in prepared)
        {
            int recipients, deliveries, newDeliveries, unknown = 0, inactive = 0;
            if (p.AudienceAll)
            {
                newDeliveries = await InsertAudienceAllAsync(conn, dbTx, p, ct);
                recipients = deliveries = await RecomputeCountersAsync(conn, dbTx, p.Id, ct);
            }
            else
            {
                var active = new List<string>();
                foreach (var code in p.Recipients.Keys)
                {
                    if (!employeeStatus.TryGetValue(code, out var status)) { unknown++; details.Add(new(p.Key, "unknown_employee", code)); }
                    else if (status != EmployeeStatuses.Active) { inactive++; details.Add(new(p.Key, "inactive_employee", code)); }
                    else active.Add(code);
                }
                newDeliveries = await InsertImportDeliveriesAsync(conn, dbTx, p, active, ct);
                await RecomputeCountersAsync(conn, dbTx, p.Id, ct);
                recipients = p.Recipients.Count;
                deliveries = active.Count;
            }
            reports[p.Index] = new LegacyPostReport(p.Key, p.Id, outcomes[p.Id], [], recipients, deliveries, newDeliveries, unknown, inactive);
        }

        if (dryRun) await tx.RollbackAsync(ct);
        else await tx.CommitAsync(ct);
        db.ChangeTracker.Clear();

        var postReports = reports.Select(r => r!).ToList();
        var totals = new LegacyNotificationTotals(
            postReports.Count(r => r.Outcome == LegacyOutcomes.Created), postReports.Count(r => r.Outcome == LegacyOutcomes.Updated),
            postReports.Count(r => r.Outcome == LegacyOutcomes.Unchanged), postReports.Count(r => r.Outcome == LegacyOutcomes.Rejected),
            postReports.Sum(r => r.Deliveries), postReports.Sum(r => r.NewDeliveries));

        if (!dryRun)
            await audit.LogAsync("legacy.notifications", "legacy", null,
                new { client = http.HttpContext?.User.FindFirst(ApiKeyDefaults.ClientNameClaim)?.Value, posts = postReports.Count, totals }, ct);
        return new LegacyNotificationReport(dryRun, totals, postReports, details);
    }

    // ---------------------------------------------------------------- validation

    private static Guid? TryId(LegacyPost? post) =>
        post is { LegacyKey: { } key, PublishedAt: { } at } && key.Trim().Length > 0 && LegacyIds.IsValidTimestamp(at)
            ? LegacyIds.NotificationId(key.Trim(), at) : null;

    private static (Prepared? Post, List<string> Issues) Prepare(int index, LegacyPost? post, HashSet<string> seenKeys)
    {
        var issues = new List<string>();
        if (post is null) return (null, [LegacyPostIssues.InvalidKey]);

        var key = (post.LegacyKey ?? "").Trim();
        if (key.Length == 0 || key.Length > 500) issues.Add(LegacyPostIssues.InvalidKey);
        else if (!seenKeys.Add(key)) issues.Add(LegacyPostIssues.DuplicateKey);

        var title = (post.Title ?? "").Trim();
        if (title.Length == 0 || title.Length > 500 || title.Contains('\0')) issues.Add(LegacyPostIssues.InvalidTitle);

        var publishedAt = post.PublishedAt;
        if (publishedAt is null || !LegacyIds.IsValidTimestamp(publishedAt.Value)) issues.Add(LegacyPostIssues.InvalidPublishedAt);

        var variables = new List<VariableDto>();
        foreach (var v in post.Variables ?? [])
        {
            var vkey = (v?.Key ?? "").Trim();
            var label = string.IsNullOrWhiteSpace(v?.Label) ? vkey : v.Label.Trim();
            var type = string.IsNullOrWhiteSpace(v?.Type) ? "text" : v.Type.Trim().ToLowerInvariant();
            if (!NotificationMarkdown.IsValidVarKey(vkey) || variables.Any(x => x.Key == vkey) || label.Length > 200 || label.Contains('\0') || !VariableTypes.Contains(type))
            {
                if (!issues.Contains(LegacyPostIssues.InvalidVariable)) issues.Add(LegacyPostIssues.InvalidVariable);
                continue;
            }
            variables.Add(new VariableDto(vkey, label, type));
        }

        var body = post.BodyMd ?? "";
        var analysis = NotificationMarkdown.Analyze(body, variables.Select(v => v.Key).ToList());
        foreach (var code in analysis.Issues.Select(i => i.Code).Distinct()) issues.Add(code);

        var tagNames = new List<string>();
        foreach (var raw in post.Tags ?? [])
        {
            var name = (raw ?? "").Trim();
            if (name.Length == 0) continue;
            if (name.Length > 100 || name.Contains('\0')) { if (!issues.Contains(LegacyPostIssues.InvalidTag)) issues.Add(LegacyPostIssues.InvalidTag); continue; }
            if (!tagNames.Contains(name, StringComparer.Ordinal)) tagNames.Add(name);
        }
        var series = string.IsNullOrWhiteSpace(post.Series) ? null : post.Series.Trim();
        if (series is not null && (series.Length > 200 || series.Contains('\0'))) issues.Add(LegacyPostIssues.InvalidSeries);

        // Summary: derived from the body unless an editor-style custom one is given (same rule as the editor).
        var requested = post.Summary?.Trim() ?? "";
        if (requested.Contains('\0')) issues.Add(LegacyPostIssues.InvalidSummary);
        var (summary, custom) = requested.Length == 0 || requested == analysis.Summary
            ? (analysis.Summary, false)
            : (NotificationMarkdown.Truncate(requested, 1000), true);

        var recipients = new SortedDictionary<string, List<Dictionary<string, string?>>>(StringComparer.Ordinal);
        if (!post.AudienceAll)
        {
            if (post.Recipients is null || post.Recipients.Count == 0) issues.Add(LegacyPostIssues.RecipientsRequired);
            foreach (var (rawCode, rawRows) in post.Recipients ?? [])
            {
                var code = (rawCode ?? "").Trim();
                var rows = (rawRows ?? []).Select(r => r ?? []).ToList();
                if (code.Length == 0 || code.Length > 50
                    || rows.Any(r => r.Any(kv => kv.Key.Contains('\0') || (kv.Value?.Contains('\0') ?? false))))
                {
                    if (!issues.Contains(LegacyPostIssues.InvalidRecipient)) issues.Add(LegacyPostIssues.InvalidRecipient);
                    continue;
                }
                if (!recipients.TryGetValue(code, out var list)) recipients[code] = list = [];
                list.AddRange(rows);
            }
        }

        if (issues.Count > 0) return (null, issues);
        return (new Prepared
        {
            Index = index, Key = key, Id = LegacyIds.NotificationId(key, publishedAt!.Value),
            ImportId = LegacyIds.RecipientImportId(key, publishedAt.Value),
            PublishedAt = DateTimeOffset.FromUnixTimeMilliseconds(publishedAt.Value.ToUnixTimeMilliseconds()),
            Title = title, Summary = summary, SummaryIsCustom = custom, Body = body, ContentText = analysis.ContentText,
            Variables = variables, VariablesJson = JsonSerializer.Serialize(variables, NotificationJson.Options),
            Tags = tagNames, Series = series,
            PinnedUntil = post.PinnedUntil is { } pin ? DateTimeOffset.FromUnixTimeMilliseconds(pin.ToUnixTimeMilliseconds()) : null,
            RequiresAck = post.RequiresAck, AudienceAll = post.AudienceAll, MarkRead = post.MarkRead,
            Recipients = recipients,
        }, issues);
    }

    // ---------------------------------------------------------------- notification rows

    private static void Apply(Notification n, Prepared p, long? seriesId)
    {
        n.Title = p.Title;
        n.Summary = p.Summary;
        n.SummaryIsCustom = p.SummaryIsCustom;
        n.BodyMd = p.Body;
        n.ContentText = p.ContentText;
        n.Variables = p.VariablesJson;
        n.SeriesId = seriesId;
        n.PinnedUntil = p.PinnedUntil?.ToUniversalTime();
        n.RequiresAck = p.RequiresAck;
        n.AudienceAll = p.AudienceAll;
    }

    private void AddImport(Prepared p, JsonNode columns, JsonObject rows, IReadOnlyDictionary<string, string> codes, DateTimeOffset now)
    {
        db.Set<NotificationRecipientImport>().Add(new NotificationRecipientImport
        {
            Id = p.ImportId, NotificationId = p.Id, Status = ImportStatuses.Applied,
            Columns = columns.ToJsonString(), Rows = rows.ToJsonString(),
            Report = JsonSerializer.Serialize(BuildReport(p, codes), NotificationJson.Options),
            CreatedAt = now, AppliedAt = now,
        });
        db.Set<NotificationAudience>().Add(new NotificationAudience { NotificationId = p.Id, Kind = AudienceKinds.Import, ImportId = p.ImportId });
    }

    /// <summary>MSCB to an array of row objects, as the editor's import stores it. A recipient without values keeps <c>[]</c>.</summary>
    private static JsonObject BuildRows(Prepared p)
    {
        var rows = new JsonObject();
        foreach (var (code, list) in p.Recipients)
            rows[code] = IsEmptyVars(list) ? new JsonArray() : JsonSerializer.SerializeToNode(list, NotificationJson.Options);
        return rows;
    }

    private static ImportReport BuildReport(Prepared p, IReadOnlyDictionary<string, string> employeeStatus)
    {
        var unknown = p.Recipients.Keys.Where(c => !employeeStatus.ContainsKey(c)).ToList();
        var inactive = p.Recipients.Keys.Where(c => employeeStatus.TryGetValue(c, out var s) && s != EmployeeStatuses.Active).ToList();
        return new ImportReport(
            "legacy-import", "MSCB", p.Recipients.Values.Sum(l => l.Count), p.Recipients.Count, p.Recipients.Values.Count(l => l.Count > 1),
            p.Variables.Select(v => new ImportColumn(v.Key, v.Label ?? v.Key, v.Label ?? v.Key)).ToList(),
            unknown.Take(ListCap).ToList(), unknown.Count, inactive.Take(ListCap).ToList(), inactive.Count,
            [], 0, 0, [], [], [], true);
    }

    private static bool IsEmptyVars(List<Dictionary<string, string?>> rows) => rows.All(r => r.Count == 0);

    private static bool JsonEquals(string storedJson, JsonNode other) => JsonEquals(storedJson, other.ToJsonString());

    private static bool JsonEquals(string storedJson, string otherJson) =>
        JsonNode.DeepEquals(JsonNode.Parse(storedJson), JsonNode.Parse(otherJson));

    // ---------------------------------------------------------------- deliveries

    /// <summary>
    /// Adds the missing deliveries of an import post and refreshes <c>vars</c> that differ. Never touches
    /// <c>delivered_at</c>, <c>read_at</c> or <c>acknowledged_at</c> of existing rows. Returns the number of new rows.
    /// </summary>
    private static async Task<int> InsertImportDeliveriesAsync(NpgsqlConnection conn, NpgsqlTransaction tx, Prepared p, List<string> activeCodes, CancellationToken ct)
    {
        if (activeCodes.Count == 0) return 0;
        var vars = activeCodes.Select(c => IsEmptyVars(p.Recipients[c]) ? null : JsonSerializer.Serialize(p.Recipients[c], NotificationJson.Options)).ToArray();

        await using var cmd = new NpgsqlCommand("""
            WITH ins AS (
                INSERT INTO notification_deliveries (employee_code, notification_id, vars, delivered_at, read_at)
                SELECT s.code, @nid, s.vars, @pub, CASE WHEN @read THEN @pub END
                FROM unnest(@codes, @vars) AS s(code, vars)
                JOIN employees e ON e.code = s.code AND e.status = 'active'
                ON CONFLICT (employee_code, notification_id) DO UPDATE SET vars = EXCLUDED.vars
                    WHERE notification_deliveries.vars IS DISTINCT FROM EXCLUDED.vars
                RETURNING (xmax = 0) AS inserted)
            SELECT count(*) FILTER (WHERE inserted)::int FROM ins
            """, conn, tx);
        AddDeliveryParameters(cmd, p);
        cmd.Add("codes", NpgsqlDbType.Array | NpgsqlDbType.Text, activeCodes.ToArray());
        cmd.Add("vars", NpgsqlDbType.Array | NpgsqlDbType.Jsonb, vars);
        return (int)(await cmd.ExecuteScalarAsync(ct))!;
    }

    /// <summary>Every active employee with at least one email: the rule fan-out uses for <c>audience_all</c>.</summary>
    private static async Task<int> InsertAudienceAllAsync(NpgsqlConnection conn, NpgsqlTransaction tx, Prepared p, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand("""
            INSERT INTO notification_deliveries (employee_code, notification_id, vars, delivered_at, read_at)
            SELECT e.code, @nid, NULL, @pub, CASE WHEN @read THEN @pub END
            FROM employees e
            WHERE e.status = 'active' AND EXISTS (SELECT 1 FROM employee_emails m WHERE m.employee_code = e.code)
            ON CONFLICT (employee_code, notification_id) DO NOTHING
            """, conn, tx);
        AddDeliveryParameters(cmd, p);
        return await cmd.ExecuteNonQueryAsync(ct);
    }

    private static void AddDeliveryParameters(NpgsqlCommand cmd, Prepared p)
    {
        cmd.Add("nid", NpgsqlDbType.Uuid, p.Id);
        cmd.Add("pub", NpgsqlDbType.TimestampTz, p.PublishedAt.ToUniversalTime());
        cmd.Add("read", NpgsqlDbType.Boolean, p.MarkRead);
    }

    /// <summary>Recomputes <c>recipient_count</c>, <c>read_count</c> and <c>ack_count</c>; returns the recipient count.</summary>
    private static async Task<int> RecomputeCountersAsync(NpgsqlConnection conn, NpgsqlTransaction tx, Guid id, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand("""
            UPDATE notifications n SET recipient_count = c.total, read_count = c.reads, ack_count = c.acks
            FROM (SELECT count(*)::int AS total, count(read_at)::int AS reads, count(acknowledged_at)::int AS acks
                  FROM notification_deliveries WHERE notification_id = @nid) c
            WHERE n.id = @nid
            RETURNING n.recipient_count
            """, conn, tx);
        cmd.Add("nid", NpgsqlDbType.Uuid, id);
        return (int)(await cmd.ExecuteScalarAsync(ct))!;
    }
}
