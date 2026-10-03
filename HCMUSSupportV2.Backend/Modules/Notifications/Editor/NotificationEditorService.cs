using System.Text.Json;
using System.Text.Json.Nodes;
using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Modules.Identity.Groups;
using HCMUSSupportV2.Backend.Modules.Notifications.Domain;
using HCMUSSupportV2.Backend.Modules.Notifications.Markdown;
using HCMUSSupportV2.Backend.Modules.Notifications.Publishing;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using HCMUSSupportV2.Backend.Modules.Platform.Files;
using HCMUSSupportV2.Backend.Modules.Platform.Jobs;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using UUIDNext;

namespace HCMUSSupportV2.Backend.Modules.Notifications.Editor;

/// <summary>The editor's side of notifications: drafts, lifecycle, clone, revisions, stats, attachments.</summary>
public class NotificationEditorService(
    AppDbContext db,
    ICurrentUser user,
    IAuditLogger audit,
    IJobQueue jobs,
    IFileStore files)
{
    public const int MaxAttachments = 20;
    public const long MaxAttachmentBytes = 20L * 1024 * 1024;
    private static readonly string[] VariableTypes = ["text", "date", "number", "money"];

    // ---------------------------------------------------------------- list / get

    public async Task<Page<ManageNotificationListItem>> ListAsync(
        string? status, long? tagId, long? seriesId, string? q, string? cursor, int limit, CancellationToken ct)
    {
        limit = Math.Clamp(limit, 1, 100);
        var query = db.Set<Notification>().AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(status)) query = query.Where(n => n.Status == status);
        if (tagId is not null) query = query.Where(n => db.Set<NotificationTag>().Any(t => t.NotificationId == n.Id && t.TagId == tagId));
        if (seriesId is not null) query = query.Where(n => n.SeriesId == seriesId);
        if (!string.IsNullOrWhiteSpace(q))
            query = query.Where(n => n.Search.Matches(EF.Functions.WebSearchToTsQuery("vn_unaccent", q)));
        if (Cursor.Decode(cursor, 1) is { } c)
        {
            if (!Guid.TryParse(c[0], out var last)) throw ApiException.BadRequest("Cursor không hợp lệ.");
            query = query.Where(n => n.Id.CompareTo(last) < 0);
        }

        var rows = await query.OrderByDescending(n => n.Id).Take(limit + 1).ToListAsync(ct);
        var hasMore = rows.Count > limit;
        if (hasMore) rows.RemoveAt(rows.Count - 1);

        var ids = rows.Select(r => r.Id).ToList();
        var tags = await TagsForAsync(ids, ct);
        var seriesIds = rows.Where(r => r.SeriesId != null).Select(r => r.SeriesId!.Value).Distinct().ToList();
        var series = await db.Set<NotificationSeries>().AsNoTracking().Where(s => seriesIds.Contains(s.Id)).ToDictionaryAsync(s => s.Id, s => s.Name, ct);

        var items = rows.Select(n => new ManageNotificationListItem(
            n.Id, n.Title, n.Status, n.SeriesId, n.SeriesId is { } sid && series.TryGetValue(sid, out var sn) ? sn : null,
            tags.GetValueOrDefault(n.Id) ?? [], n.PublishAt, n.PublishedAt, n.ExpiresAt, n.AudienceAll,
            n.RecipientCount, n.Version, n.UpdatedAt)).ToList();
        return new Page<ManageNotificationListItem>(items, hasMore ? Cursor.Encode(rows[^1].Id.ToString()) : null);
    }

    public async Task<ManageNotificationDto> GetAsync(Guid id, CancellationToken ct)
    {
        var n = await db.Set<Notification>().AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct)
            ?? throw ApiException.NotFound("Không tìm thấy thông báo.");
        return await ToDtoAsync(n, ct);
    }

    private async Task<ManageNotificationDto> ToDtoAsync(Notification n, CancellationToken ct)
    {
        var tags = (await TagsForAsync([n.Id], ct)).GetValueOrDefault(n.Id) ?? [];
        var seriesName = n.SeriesId is null ? null
            : await db.Set<NotificationSeries>().Where(s => s.Id == n.SeriesId).Select(s => s.Name).FirstOrDefaultAsync(ct);

        var audiences = await db.Set<NotificationAudience>().AsNoTracking().Where(a => a.NotificationId == n.Id).ToListAsync(ct);
        var groupIds = audiences.Where(a => a.Kind == AudienceKinds.Group).Select(a => a.GroupId!.Value).ToList();
        var groups = await db.Set<Group>().AsNoTracking().Where(g => groupIds.Contains(g.Id))
            .OrderBy(g => g.Name).Select(g => new GroupRef(g.Id, g.Name, g.MemberCount)).ToListAsync(ct);
        var codes = audiences.Where(a => a.Kind == AudienceKinds.Employee).Select(a => a.EmployeeCode!).ToList();
        var employees = await db.Set<Employee>().AsNoTracking().Where(e => codes.Contains(e.Code))
            .OrderBy(e => e.Code).Select(e => new EmployeeRef(e.Code, e.FullName, e.Status)).ToListAsync(ct);

        ImportSummaryDto? import = null;
        var importId = audiences.FirstOrDefault(a => a.Kind == AudienceKinds.Import)?.ImportId;
        if (importId is not null)
        {
            var i = await db.Set<NotificationRecipientImport>().AsNoTracking().Where(x => x.Id == importId)
                .Select(x => new { x.Id, x.Status, x.AppliedAt, x.Report }).FirstOrDefaultAsync(ct);
            if (i is not null)
            {
                var report = JsonNode.Parse(i.Report);
                import = new ImportSummaryDto(i.Id, i.Status, (int?)report?["rows"] ?? 0, (int?)report?["distinctEmployees"] ?? 0, i.AppliedAt);
            }
        }

        var attachments = await (
            from a in db.Set<NotificationAttachment>().AsNoTracking()
            join f in db.Set<StoredFile>().AsNoTracking() on a.FileId equals f.Id
            where a.NotificationId == n.Id
            orderby a.Sort, a.CreatedAt
            select new AttachmentDto(a.Id, f.Id, f.FileName, f.ContentType, f.SizeBytes)).ToListAsync(ct);

        var people = await db.Set<Employee>().AsNoTracking()
            .Where(e => e.Code == n.CreatedBy || e.Code == n.UpdatedBy)
            .Select(e => new PersonRef(e.Code, e.FullName)).ToListAsync(ct);

        return new ManageNotificationDto(
            n.Id, n.Title, n.Summary, n.SummaryIsCustom, n.BodyMd, n.ContentText, ParseVariables(n.Variables), n.Status,
            n.SeriesId, seriesName, tags, n.PublishAt, n.PublishedAt, n.ExpiresAt,
            new AudienceDto(n.AudienceAll, groups, employees, import), attachments,
            n.RecipientCount, n.Version,
            people.FirstOrDefault(p => p.Code == n.CreatedBy), people.FirstOrDefault(p => p.Code == n.UpdatedBy),
            n.CreatedAt, n.UpdatedAt);
    }

    private async Task<Dictionary<Guid, List<TagDto>>> TagsForAsync(List<Guid> ids, CancellationToken ct)
    {
        var rows = await (
            from nt in db.Set<NotificationTag>().AsNoTracking()
            join t in db.Set<Tag>().AsNoTracking() on nt.TagId equals t.Id
            where ids.Contains(nt.NotificationId)
            orderby t.Sort, t.Name
            select new { nt.NotificationId, Tag = new TagDto(t.Id, t.Name, t.Color, t.Sort) }).ToListAsync(ct);
        return rows.GroupBy(r => r.NotificationId).ToDictionary(g => g.Key, g => g.Select(r => r.Tag).ToList());
    }

    // ---------------------------------------------------------------- create / update / delete

    public async Task<ManageNotificationDto> CreateAsync(NotificationWriteRequest req, CancellationToken ct)
    {
        var p = await PrepareAsync(req, null, ct);
        var now = DateTimeOffset.UtcNow;
        var n = new Notification
        {
            Id = Uuid.NewDatabaseFriendly(Database.PostgreSql),
            Status = NotificationStatuses.Draft,
            Version = 1,
            CreatedBy = user.Code,
            CreatedAt = now,
            UpdatedAt = now,
        };
        Apply(n, p, req);
        n.UpdatedBy = user.Code;
        db.Set<Notification>().Add(n);
        await db.SaveChangesAsync(ct); // the notification row first: audiences and tags reference it
        SetTags(n.Id, p.TagIds, []);
        SetAudiences(n.Id, p, []);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("notification.created", "notification", n.Id.ToString(), new { title = n.Title }, ct);
        return await GetAsync(n.Id, ct);
    }

    public async Task<ManageNotificationDto> UpdateAsync(Guid id, NotificationWriteRequest req, CancellationToken ct)
    {
        if (req.Version is null) throw ApiException.Invalid("version", "Thiếu số phiên bản (version).");
        for (var attempt = 0; ; attempt++)
        {
            db.ChangeTracker.Clear();
            var n = await db.Set<Notification>().FirstOrDefaultAsync(x => x.Id == id, ct)
                ?? throw ApiException.NotFound("Không tìm thấy thông báo.");
            if (n.Version != req.Version)
                throw ApiException.Conflict("Thông báo đã được người khác cập nhật. Hãy tải lại trước khi sửa.",
                    new Dictionary<string, object?> { ["currentVersion"] = n.Version });

            var p = await PrepareAsync(req, n, ct);
            var contentChanged = n.Title != p.Title || n.BodyMd != p.Body || n.Variables != p.VariablesJson;
            var existingTags = await db.Set<NotificationTag>().Where(t => t.NotificationId == id).ToListAsync(ct);
            var existingAudiences = await db.Set<NotificationAudience>().Where(a => a.NotificationId == id && a.Kind != AudienceKinds.Import).ToListAsync(ct);
            var audienceChanged = n.AudienceAll != req.AudienceAll || AudienceKeys(existingAudiences) != AudienceKeysOf(p);

            var now = DateTimeOffset.UtcNow;
            Apply(n, p, req);
            n.Version++;
            n.UpdatedAt = now;
            n.UpdatedBy = user.Code;
            var live = n.Status is NotificationStatuses.Published or NotificationStatuses.Archived;
            if (live)
            {
                if (contentChanged) n.ContentUpdatedAt = now;
                db.Set<NotificationRevision>().Add(new NotificationRevision
                {
                    NotificationId = n.Id, Version = n.Version, Title = n.Title, Summary = n.Summary,
                    Content = n.BodyMd, Variables = n.Variables, EditedBy = user.Code, EditedAt = now,
                });
            }
            SetTags(id, p.TagIds, existingTags);
            SetAudiences(id, p, existingAudiences);

            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) when (attempt < 3) { continue; } // e.g. a read counter moved; re-check the version
            catch (DbUpdateConcurrencyException)
            {
                throw ApiException.Conflict("Thông báo đã được người khác cập nhật. Hãy tải lại trước khi sửa.");
            }

            if (n.Status == NotificationStatuses.Published && audienceChanged)
                await jobs.EnqueueAsync(NotificationJobTypes.Publish, new PublishPayload(n.Id), cancellationToken: ct);
            await audit.LogAsync("notification.updated", "notification", n.Id.ToString(), new { version = n.Version, status = n.Status }, ct);
            return await GetAsync(id, ct);
        }
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct)
    {
        var n = await db.Set<Notification>().FirstOrDefaultAsync(x => x.Id == id, ct)
            ?? throw ApiException.NotFound("Không tìm thấy thông báo.");
        if (n.Status != NotificationStatuses.Draft)
            throw ApiException.Conflict("Chỉ xóa được bản nháp. Hãy lưu trữ thông báo đã đăng.");

        var fileIds = await db.Set<NotificationAttachment>().Where(a => a.NotificationId == id).Select(a => a.FileId)
            .Concat(db.Set<NotificationRecipientImport>().Where(i => i.NotificationId == id && i.FileId != null).Select(i => i.FileId!.Value))
            .ToListAsync(ct);
        db.Set<NotificationAttachment>().RemoveRange(db.Set<NotificationAttachment>().Where(a => a.NotificationId == id));
        db.Set<Notification>().Remove(n);
        await db.SaveChangesAsync(ct);
        foreach (var fileId in fileIds) await files.DeleteAsync(fileId, ct);
        await audit.LogAsync("notification.deleted", "notification", id.ToString(), new { title = n.Title }, ct);
    }

    // ---------------------------------------------------------------- lifecycle

    public async Task<ManageNotificationDto> ScheduleAsync(Guid id, DateTimeOffset publishAt, CancellationToken ct)
    {
        if (publishAt <= DateTimeOffset.UtcNow) throw ApiException.Invalid("publishAt", "Thời điểm đăng phải ở tương lai.");
        var n = await db.Set<Notification>().FirstOrDefaultAsync(x => x.Id == id, ct)
            ?? throw ApiException.NotFound("Không tìm thấy thông báo.");
        if (n.Status is not (NotificationStatuses.Draft or NotificationStatuses.Scheduled))
            throw ApiException.Conflict("Chỉ lên lịch được bản nháp hoặc thông báo đang chờ đăng.");
        await EnsureReadyAsync(n, publishAt, ct);

        n.Status = NotificationStatuses.Scheduled;
        n.PublishAt = publishAt.ToUniversalTime();
        n.UpdatedAt = DateTimeOffset.UtcNow;
        n.UpdatedBy = user.Code;
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { throw ApiException.Conflict("Thông báo vừa được thay đổi. Hãy tải lại."); }
        // The job waits for publish_at; if the time is moved, the earlier job finds the post not due and does nothing.
        await jobs.EnqueueAsync(NotificationJobTypes.Publish, new PublishPayload(id), runAt: publishAt, cancellationToken: ct);
        await audit.LogAsync("notification.scheduled", "notification", id.ToString(), new { publishAt }, ct);
        return await GetAsync(id, ct);
    }

    public async Task<ManageNotificationDto> PublishAsync(Guid id, CancellationToken ct)
    {
        var n = await db.Set<Notification>().AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct)
            ?? throw ApiException.NotFound("Không tìm thấy thông báo.");
        if (n.Status is not (NotificationStatuses.Draft or NotificationStatuses.Scheduled))
            throw ApiException.Conflict("Thông báo đã được đăng hoặc đã lưu trữ.");
        await EnsureReadyAsync(n, DateTimeOffset.UtcNow, ct);

        if (!await PublishTransition.TryPublishAsync(db, id, immediate: true, ct))
            throw ApiException.Conflict("Thông báo vừa được thay đổi. Hãy tải lại.");
        await jobs.EnqueueAsync(NotificationJobTypes.Publish, new PublishPayload(id), cancellationToken: ct);
        await audit.LogAsync("notification.published", "notification", id.ToString(), new { by = "editor" }, ct);
        db.ChangeTracker.Clear();
        return await GetAsync(id, ct);
    }

    public async Task<ManageNotificationDto> ArchiveAsync(Guid id, CancellationToken ct)
    {
        var exists = await db.Set<Notification>().Where(x => x.Id == id).Select(x => x.Status).FirstOrDefaultAsync(ct)
            ?? throw ApiException.NotFound("Không tìm thấy thông báo.");
        if (exists is not (NotificationStatuses.Published or NotificationStatuses.Scheduled))
            throw ApiException.Conflict("Chỉ lưu trữ được thông báo đã đăng hoặc đang chờ đăng.");

        var changed = await db.Set<Notification>().Where(x => x.Id == id && (x.Status == NotificationStatuses.Published || x.Status == NotificationStatuses.Scheduled))
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, NotificationStatuses.Archived)
                .SetProperty(x => x.UpdatedAt, DateTimeOffset.UtcNow).SetProperty(x => x.UpdatedBy, user.Code), ct);
        if (changed == 0) throw ApiException.Conflict("Thông báo vừa được thay đổi. Hãy tải lại.");

        await audit.LogAsync("notification.archived", "notification", id.ToString(), null, ct);
        return await GetAsync(id, ct);
    }

    /// <summary>Copies content, variables, tags, series, flags and the group/employee/all audiences into a new draft. Imported rows, attachments and dates are not copied.</summary>
    public async Task<ManageNotificationDto> CloneAsync(Guid id, CancellationToken ct)
    {
        var src = await db.Set<Notification>().AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct)
            ?? throw ApiException.NotFound("Không tìm thấy thông báo.");
        var now = DateTimeOffset.UtcNow;
        var copy = new Notification
        {
            Id = Uuid.NewDatabaseFriendly(Database.PostgreSql),
            SeriesId = src.SeriesId,
            Title = src.Title,
            Summary = src.Summary,
            SummaryIsCustom = src.SummaryIsCustom,
            BodyMd = src.BodyMd,
            ContentText = src.ContentText,
            Variables = src.Variables,
            Status = NotificationStatuses.Draft,
            AudienceAll = src.AudienceAll,
            Version = 1,
            CreatedBy = user.Code,
            UpdatedBy = user.Code,
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.Set<Notification>().Add(copy);
        await db.SaveChangesAsync(ct);
        var tagIds = await db.Set<NotificationTag>().Where(t => t.NotificationId == id).Select(t => t.TagId).ToListAsync(ct);
        foreach (var t in tagIds) db.Set<NotificationTag>().Add(new NotificationTag { NotificationId = copy.Id, TagId = t });
        var audiences = await db.Set<NotificationAudience>().AsNoTracking()
            .Where(a => a.NotificationId == id && (a.Kind == AudienceKinds.Group || a.Kind == AudienceKinds.Employee)).ToListAsync(ct);
        foreach (var a in audiences)
            db.Set<NotificationAudience>().Add(new NotificationAudience { NotificationId = copy.Id, Kind = a.Kind, GroupId = a.GroupId, EmployeeCode = a.EmployeeCode });
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("notification.cloned", "notification", copy.Id.ToString(), new { from = id }, ct);
        return await GetAsync(copy.Id, ct);
    }

    private async Task EnsureReadyAsync(Notification n, DateTimeOffset publishAt, CancellationToken ct)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(n.Title)) errors["title"] = ["Thiếu tiêu đề."];
        if (string.IsNullOrWhiteSpace(n.BodyMd)) errors["bodyMd"] = ["Nội dung đang trống."];
        else
        {
            var analysis = NotificationMarkdown.Analyze(n.BodyMd, ParseVariables(n.Variables).Select(v => v.Key).ToList());
            if (!analysis.IsValid) errors["bodyMd"] = analysis.Issues.Select(FormatIssue).ToArray();
        }
        var hasAudience = n.AudienceAll || await db.Set<NotificationAudience>().AnyAsync(a => a.NotificationId == n.Id, ct);
        if (!hasAudience) errors["audience"] = ["Chưa chọn người nhận."];
        if (n.ExpiresAt is { } exp && exp <= publishAt) errors["expiresAt"] = ["Thời điểm hết hạn phải sau thời điểm đăng."];
        if (errors.Count > 0)
            throw new ApiException(400, "Validation failed", "Thông báo chưa sẵn sàng để đăng.", errors);
    }

    // ---------------------------------------------------------------- revisions / stats / preview

    public async Task<IReadOnlyList<RevisionDto>> RevisionsAsync(Guid id, CancellationToken ct)
    {
        if (!await db.Set<Notification>().AnyAsync(n => n.Id == id, ct)) throw ApiException.NotFound("Không tìm thấy thông báo.");
        var rows = await (
            from r in db.Set<NotificationRevision>().AsNoTracking()
            join e in db.Set<Employee>().AsNoTracking() on r.EditedBy equals e.Code into editors
            from e in editors.DefaultIfEmpty()
            where r.NotificationId == id
            orderby r.Version descending
            select new { r, Name = e != null ? e.FullName : null }).Take(200).ToListAsync(ct);
        return rows.Select(x => new RevisionDto(x.r.Version, x.r.Title, x.r.Summary, x.r.Content, ParseVariables(x.r.Variables),
            x.r.EditedBy is null ? null : new PersonRef(x.r.EditedBy, x.Name), x.r.EditedAt)).ToList();
    }

    public async Task<NotificationStatsDto> StatsAsync(Guid id, CancellationToken ct)
    {
        var n = await db.Set<Notification>().AsNoTracking().Where(x => x.Id == id)
            .Select(x => new { x.RecipientCount }).FirstOrDefaultAsync(ct) ?? throw ApiException.NotFound("Không tìm thấy thông báo.");
        var d = db.Set<NotificationDelivery>().Where(x => x.NotificationId == id);
        return new NotificationStatsDto(n.RecipientCount, await d.CountAsync(x => x.Fetched, ct), await d.CountAsync(x => x.Opened, ct));
    }

    /// <summary>The variable rows of an MSCB from the applied (else the latest pending) import, and whether that MSCB is in the audience.</summary>
    public async Task<PreviewVarsDto> PreviewVarsAsync(Guid id, string? employee, Guid? importId, CancellationToken ct)
    {
        var n = await db.Set<Notification>().AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct)
            ?? throw ApiException.NotFound("Không tìm thấy thông báo.");
        var code = (employee ?? "").Trim();
        if (code.Length == 0) throw ApiException.Invalid("employee", "Thiếu mã nhân sự (employee).");

        var emp = await db.Set<Employee>().AsNoTracking().FirstOrDefaultAsync(e => e.Code == code, ct);
        var audiences = await db.Set<NotificationAudience>().AsNoTracking().Where(a => a.NotificationId == id).ToListAsync(ct);

        NotificationRecipientImport? import = null;
        var source = "none";
        if (importId is not null)
        {
            import = await db.Set<NotificationRecipientImport>().AsNoTracking().FirstOrDefaultAsync(i => i.Id == importId && i.NotificationId == id, ct)
                ?? throw ApiException.NotFound("Không tìm thấy bản nhập danh sách.");
            source = import.Status == ImportStatuses.Applied ? "applied" : "pending";
        }
        else
        {
            var appliedId = audiences.FirstOrDefault(a => a.Kind == AudienceKinds.Import)?.ImportId;
            if (appliedId is not null)
            {
                import = await db.Set<NotificationRecipientImport>().AsNoTracking().FirstOrDefaultAsync(i => i.Id == appliedId, ct);
                source = "applied";
            }
            else
            {
                import = await db.Set<NotificationRecipientImport>().AsNoTracking()
                    .Where(i => i.NotificationId == id && i.Status == ImportStatuses.Validated)
                    .OrderByDescending(i => i.CreatedAt).FirstOrDefaultAsync(ct);
                if (import is not null) source = "pending";
            }
        }

        JsonNode? rows = null;
        var inImportFile = false;
        if (import is not null && JsonNode.Parse(import.Rows) is JsonObject obj && obj[code] is { } found)
        {
            rows = found.DeepClone();
            inImportFile = true;
        }

        var reasons = new List<string>();
        var active = emp is { Status: EmployeeStatuses.Active };
        if (active)
        {
            if (n.AudienceAll && await db.Set<EmployeeEmail>().AnyAsync(m => m.EmployeeCode == code, ct)) reasons.Add("all");
            var groupNames = await (
                from a in db.Set<NotificationAudience>().AsNoTracking()
                join gm in db.Set<GroupMember>().AsNoTracking() on a.GroupId equals gm.GroupId
                join g in db.Set<Group>().AsNoTracking() on a.GroupId equals g.Id
                where a.NotificationId == id && a.Kind == AudienceKinds.Group && gm.EmployeeCode == code
                select g.Name).ToListAsync(ct);
            reasons.AddRange(groupNames.Select(g => "group:" + g));
            if (audiences.Any(a => a.Kind == AudienceKinds.Employee && a.EmployeeCode == code)) reasons.Add("employee");
            if (source == "applied" && inImportFile) reasons.Add("import");
        }

        return new PreviewVarsDto(code, emp?.FullName, emp is not null, source, import?.Id, rows, reasons.Count > 0, reasons,
            source == "pending" && inImportFile);
    }

    // ---------------------------------------------------------------- attachments

    private static readonly Dictionary<string, (string ContentType, byte[][] Signatures)> AttachmentTypes = new()
    {
        [".pdf"] = ("application/pdf", [[0x25, 0x50, 0x44, 0x46]]),
        [".docx"] = ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", [[0x50, 0x4B, 0x03, 0x04]]),
        [".xlsx"] = ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", [[0x50, 0x4B, 0x03, 0x04]]),
        [".png"] = ("image/png", [[0x89, 0x50, 0x4E, 0x47]]),
        [".jpg"] = ("image/jpeg", [[0xFF, 0xD8, 0xFF]]),
        [".jpeg"] = ("image/jpeg", [[0xFF, 0xD8, 0xFF]]),
    };

    public async Task<AttachmentDto> AddAttachmentAsync(Guid id, string fileName, long length, Stream content, CancellationToken ct)
    {
        if (!await db.Set<Notification>().AnyAsync(n => n.Id == id, ct)) throw ApiException.NotFound("Không tìm thấy thông báo.");
        var ext = Path.GetExtension(fileName ?? "").ToLowerInvariant();
        if (!AttachmentTypes.TryGetValue(ext, out var type))
            throw ApiException.Invalid("file", "Chỉ nhận tệp pdf, docx, xlsx, png, jpg.");
        if (length > MaxAttachmentBytes) throw ApiException.Invalid("file", "Tệp vượt quá 20 MB.");
        if (await db.Set<NotificationAttachment>().CountAsync(a => a.NotificationId == id, ct) >= MaxAttachments)
            throw ApiException.Invalid("file", $"Tối đa {MaxAttachments} tệp đính kèm.");

        var head = new byte[8];
        var read = await content.ReadAtLeastAsync(head, head.Length, throwOnEndOfStream: false, ct);
        if (!type.Signatures.Any(sig => read >= sig.Length && head.AsSpan(0, sig.Length).SequenceEqual(sig)))
            throw ApiException.Invalid("file", "Nội dung tệp không khớp với phần mở rộng.");
        content.Seek(0, SeekOrigin.Begin);

        StoredFile stored;
        try { stored = await files.SaveAsync(content, fileName!, type.ContentType, user.Code, ct); }
        catch (FileRejectedException ex) { throw ApiException.Invalid("file", ex.Message); }

        var sort = (await db.Set<NotificationAttachment>().Where(a => a.NotificationId == id).MaxAsync(a => (int?)a.Sort, ct) ?? 0) + 1;
        var att = new NotificationAttachment { Id = Uuid.NewDatabaseFriendly(Database.PostgreSql), NotificationId = id, FileId = stored.Id, Sort = sort };
        db.Set<NotificationAttachment>().Add(att);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("notification.attachment_added", "notification", id.ToString(), new { fileId = stored.Id, stored.FileName }, ct);
        return new AttachmentDto(att.Id, stored.Id, stored.FileName, stored.ContentType, stored.SizeBytes);
    }

    public async Task DeleteAttachmentAsync(Guid id, Guid attachmentId, CancellationToken ct)
    {
        var att = await db.Set<NotificationAttachment>().FirstOrDefaultAsync(a => a.Id == attachmentId && a.NotificationId == id, ct)
            ?? throw ApiException.NotFound("Không tìm thấy tệp đính kèm.");
        db.Set<NotificationAttachment>().Remove(att);
        await db.SaveChangesAsync(ct);
        await files.DeleteAsync(att.FileId, ct);
        await audit.LogAsync("notification.attachment_removed", "notification", id.ToString(), new { fileId = att.FileId }, ct);
    }

    // ---------------------------------------------------------------- validation + mapping

    private sealed record Prepared(
        string Title, string Body, string VariablesJson, string Summary, bool SummaryIsCustom, string ContentText,
        List<long> TagIds, List<long> GroupIds, List<string> EmployeeCodes);

    private async Task<Prepared> PrepareAsync(NotificationWriteRequest req, Notification? current, CancellationToken ct)
    {
        var errors = new Dictionary<string, List<string>>();
        void Err(string field, string msg) => (errors.TryGetValue(field, out var l) ? l : errors[field] = []).Add(msg);

        var title = (req.Title ?? "").Trim();
        if (title.Length == 0) Err("title", "Tiêu đề không được để trống.");
        else if (title.Length > 500) Err("title", "Tiêu đề tối đa 500 ký tự.");
        if (title.Contains('\0')) Err("title", "Tiêu đề chứa ký tự không hợp lệ.");

        var variables = new List<VariableDto>();
        foreach (var v in req.Variables ?? [])
        {
            var key = (v.Key ?? "").Trim();
            if (!NotificationMarkdown.IsValidVarKey(key)) { Err("variables", $"Tên biến \"{key}\" không hợp lệ."); continue; }
            if (variables.Any(x => x.Key == key)) { Err("variables", $"Biến \"{key}\" bị trùng."); continue; }
            var label = string.IsNullOrWhiteSpace(v.Label) ? key : v.Label.Trim();
            if (label.Length > 200) { Err("variables", $"Nhãn của biến \"{key}\" quá dài."); continue; }
            var type = string.IsNullOrWhiteSpace(v.Type) ? "text" : v.Type.Trim().ToLowerInvariant();
            if (!VariableTypes.Contains(type)) { Err("variables", $"Kiểu của biến \"{key}\" không hợp lệ (text, date, number, money)."); continue; }
            variables.Add(new VariableDto(key, label, type));
        }

        var body = req.BodyMd ?? "";
        MarkdownAnalysis analysis;
        analysis = NotificationMarkdown.Analyze(body, variables.Select(v => v.Key).ToList());
        foreach (var issue in analysis.Issues) Err("bodyMd", FormatIssue(issue));

        var tagIds = (req.TagIds ?? []).Distinct().ToList();
        if (tagIds.Count > 0)
        {
            var found = await db.Set<Tag>().Where(t => tagIds.Contains(t.Id)).Select(t => t.Id).ToListAsync(ct);
            var missing = tagIds.Except(found).ToList();
            if (missing.Count > 0) Err("tagIds", "Không tìm thấy nhãn: " + string.Join(", ", missing));
        }
        if (req.SeriesId is { } sid && !await db.Set<NotificationSeries>().AnyAsync(s => s.Id == sid, ct))
            Err("seriesId", "Không tìm thấy chuỗi thông báo.");

        var groupIds = (req.GroupIds ?? []).Distinct().ToList();
        if (groupIds.Count > 0)
        {
            var found = await db.Set<Group>().Where(g => groupIds.Contains(g.Id)).Select(g => g.Id).ToListAsync(ct);
            var missing = groupIds.Except(found).ToList();
            if (missing.Count > 0) Err("groupIds", "Không tìm thấy nhóm: " + string.Join(", ", missing));
        }
        var codes = (req.EmployeeCodes ?? []).Select(c => (c ?? "").Trim()).Where(c => c.Length > 0).Distinct(StringComparer.Ordinal).ToList();
        if (codes.Count > 0)
        {
            var found = await db.Set<Employee>().Where(e => codes.Contains(e.Code)).Select(e => e.Code).ToListAsync(ct);
            var missing = codes.Except(found).ToList();
            if (missing.Count > 0) Err("employeeCodes", "Không tìm thấy mã nhân sự: " + string.Join(", ", missing));
        }

        if (errors.Count > 0)
            throw new ApiException(400, "Validation failed", "Dữ liệu không hợp lệ.", errors.ToDictionary(e => e.Key, e => e.Value.ToArray()));

        var requested = req.Summary?.Trim() ?? "";
        string summary;
        bool custom;
        if (requested.Length == 0 || requested == analysis.Summary || (current is { SummaryIsCustom: false } && requested == current.Summary))
            (summary, custom) = (analysis.Summary, false);
        else
            (summary, custom) = (NotificationMarkdown.Truncate(requested, 1000), true);

        return new Prepared(title, body, JsonSerializer.Serialize(variables, NotificationJson.Options), summary, custom,
            analysis.ContentText, tagIds, groupIds, codes);
    }

    private static void Apply(Notification n, Prepared p, NotificationWriteRequest req)
    {
        n.Title = p.Title;
        n.BodyMd = p.Body;
        n.ContentText = p.ContentText;
        n.Summary = p.Summary;
        n.SummaryIsCustom = p.SummaryIsCustom;
        n.Variables = p.VariablesJson;
        n.SeriesId = req.SeriesId;
        n.ExpiresAt = req.ExpiresAt?.ToUniversalTime();
        n.AudienceAll = req.AudienceAll;
    }

    private void SetTags(Guid id, List<long> wanted, List<NotificationTag> existing)
    {
        foreach (var t in existing.Where(t => !wanted.Contains(t.TagId))) db.Set<NotificationTag>().Remove(t);
        foreach (var tagId in wanted.Where(w => existing.All(t => t.TagId != w)))
            db.Set<NotificationTag>().Add(new NotificationTag { NotificationId = id, TagId = tagId });
    }

    private void SetAudiences(Guid id, Prepared p, List<NotificationAudience> existing)
    {
        foreach (var a in existing.Where(a =>
                     (a.Kind == AudienceKinds.Group && !p.GroupIds.Contains(a.GroupId!.Value)) ||
                     (a.Kind == AudienceKinds.Employee && !p.EmployeeCodes.Contains(a.EmployeeCode!))))
            db.Set<NotificationAudience>().Remove(a);
        foreach (var g in p.GroupIds.Where(g => !existing.Any(a => a.Kind == AudienceKinds.Group && a.GroupId == g)))
            db.Set<NotificationAudience>().Add(new NotificationAudience { NotificationId = id, Kind = AudienceKinds.Group, GroupId = g });
        foreach (var c in p.EmployeeCodes.Where(c => !existing.Any(a => a.Kind == AudienceKinds.Employee && a.EmployeeCode == c)))
            db.Set<NotificationAudience>().Add(new NotificationAudience { NotificationId = id, Kind = AudienceKinds.Employee, EmployeeCode = c });
    }

    private static string AudienceKeys(IEnumerable<NotificationAudience> rows) =>
        string.Join(",", rows.Select(a => a.Kind == AudienceKinds.Group ? "g" + a.GroupId : "e" + a.EmployeeCode).Order());

    private static string AudienceKeysOf(Prepared p) =>
        string.Join(",", p.GroupIds.Select(g => "g" + g).Concat(p.EmployeeCodes.Select(c => "e" + c)).Order());

    internal static IReadOnlyList<VariableDto> ParseVariables(string json) =>
        JsonSerializer.Deserialize<List<VariableDto>>(json, NotificationJson.Options) ?? [];

    internal static string FormatIssue(MarkdownIssue i) => i.Line > 0 ? $"[{i.Code}] Dòng {i.Line}, cột {i.Column}: {i.Message}" : $"[{i.Code}] {i.Message}";

}
