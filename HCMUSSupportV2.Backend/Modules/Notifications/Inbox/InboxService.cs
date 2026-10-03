using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Notifications.Editor;
using HCMUSSupportV2.Backend.Modules.Notifications.Publishing;
using HCMUSSupportV2.Backend.Modules.Platform.Files;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;

namespace HCMUSSupportV2.Backend.Modules.Notifications.Inbox;

public record InboxItemDto(
    Guid Id,
    string Title,
    string Summary,
    IReadOnlyList<TagDto> Tags,
    DateTimeOffset? PublishedAt,
    DateTimeOffset DeliveredAt,
    DateTimeOffset? AckAt,
    bool RequiresAck,
    bool IsNew,
    bool UpdatedAfterDelivery,
    long? SeriesId,
    bool HasAttachments);

public record InboxAttachmentDto(Guid FileId, string FileName, string ContentType, long SizeBytes);

public record SeriesPreviousDto(Guid Id, string Title, DateTimeOffset? PublishedAt);

public record InboxSeriesDto(long Id, string Name, IReadOnlyList<SeriesPreviousDto> Previous);

public record InboxDetailDto(
    Guid Id,
    string Title,
    string Summary,
    IReadOnlyList<TagDto> Tags,
    DateTimeOffset? PublishedAt,
    DateTimeOffset DeliveredAt,
    DateTimeOffset? AckAt,
    bool RequiresAck,
    bool IsNew,
    bool UpdatedAfterDelivery,
    long? SeriesId,
    bool HasAttachments,
    string BodyMd,
    IReadOnlyList<VariableDto> Variables,
    JsonNode Vars,
    IReadOnlyList<InboxAttachmentDto> Attachments,
    InboxSeriesDto? Series);


public record UnreadCountDto(int Count);

public record InboxFilter(string? Q, List<long>? Tags, DateTimeOffset? From, DateTimeOffset? To);

/// <summary>Reads and updates an employee's own deliveries. Callers pass the effective employee code.</summary>
public class InboxService(AppDbContext db, IFileStore files)
{
    // A delivery is visible while its notification is published and not expired.
    private const string Visible = "n.status = 'published' AND (n.expires_at IS NULL OR n.expires_at > now())";

    public async Task<Page<InboxItemDto>> ListAsync(string code, InboxFilter filter, string? cursor, int limit, CancellationToken ct)
    {
        limit = Math.Clamp(limit, 1, 100);
        var sql = new StringBuilder($"""
            SELECT * FROM (
              SELECT n.id, n.title, n.summary, n.published_at, d.delivered_at, d.acknowledged_at, n.requires_ack,
                     (e.previous_login_at IS NULL OR d.delivered_at > e.previous_login_at) AS is_new,
                     (n.content_updated_at IS NOT NULL AND n.content_updated_at > d.delivered_at) AS updated,
                     n.series_id,
                     EXISTS (SELECT 1 FROM notification_attachments a WHERE a.notification_id = n.id) AS has_attachments
              FROM notification_deliveries d
              JOIN notifications n ON n.id = d.notification_id
              JOIN employees e ON e.code = d.employee_code
              WHERE d.employee_code = @code AND {Visible}
            """);
        await using var cmd = new NpgsqlCommand { Connection = (NpgsqlConnection)db.Database.GetDbConnection() };
        cmd.Parameters.AddWithValue("code", code);

        if (!string.IsNullOrWhiteSpace(filter.Q))
        {
            sql.Append(" AND n.search @@ websearch_to_tsquery('vn_unaccent', f_unaccent(@q))");
            cmd.Parameters.AddWithValue("q", filter.Q.Trim());
        }
        if (filter.Tags is { Count: > 0 })
        {
            sql.Append(" AND EXISTS (SELECT 1 FROM notification_tags t WHERE t.notification_id = n.id AND t.tag_id = ANY(@tags))");
            cmd.Add("tags", NpgsqlDbType.Array | NpgsqlDbType.Bigint, filter.Tags.ToArray());
        }
        if (filter.From is { } from)
        {
            sql.Append(" AND d.delivered_at >= @from");
            cmd.Add("from", NpgsqlDbType.TimestampTz, from.ToUniversalTime());
        }
        if (filter.To is { } to)
        {
            sql.Append(" AND d.delivered_at <= @to");
            cmd.Add("to", NpgsqlDbType.TimestampTz, to.ToUniversalTime());
        }
        sql.Append(") x");

        if (Cursor.Decode(cursor, 2) is { } c)
        {
            if (!long.TryParse(c[0], out var ticks) || !Guid.TryParse(c[1], out var lastId))
                throw ApiException.BadRequest("Cursor không hợp lệ.");
            sql.Append(" WHERE (x.delivered_at < @cd OR (x.delivered_at = @cd AND x.id < @cid))");
            cmd.Add("cd", NpgsqlDbType.TimestampTz, new DateTime(ticks, DateTimeKind.Utc));
            cmd.Parameters.AddWithValue("cid", lastId);
        }
        sql.Append(" ORDER BY x.delivered_at DESC, x.id DESC LIMIT @limit");
        cmd.Parameters.AddWithValue("limit", limit + 1);
        cmd.CommandText = sql.ToString();

        var rows = new List<(Guid Id, string Title, string Summary, DateTimeOffset? PublishedAt, DateTimeOffset DeliveredAt,
            DateTimeOffset? AckAt, bool RequiresAck, bool IsNew, bool Updated, long? SeriesId, bool HasAtt)>();
        await db.Database.OpenConnectionAsync(ct);
        try
        {
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
                rows.Add((r.GetGuid(0), r.GetString(1), r.GetString(2),
                    r.IsDBNull(3) ? null : r.GetFieldValue<DateTimeOffset>(3), r.GetFieldValue<DateTimeOffset>(4),
                    r.IsDBNull(5) ? null : r.GetFieldValue<DateTimeOffset>(5),
                    r.GetBoolean(6), r.GetBoolean(7), r.GetBoolean(8), r.IsDBNull(9) ? null : r.GetInt64(9), r.GetBoolean(10)));
        }
        finally { await db.Database.CloseConnectionAsync(); }

        var hasMore = rows.Count > limit;
        if (hasMore) rows.RemoveAt(rows.Count - 1);
        var ids = rows.Select(x => x.Id).ToList();
        var tags = await (
            from nt in db.Set<Domain.NotificationTag>().AsNoTracking()
            join t in db.Set<Domain.Tag>().AsNoTracking() on nt.TagId equals t.Id
            where ids.Contains(nt.NotificationId)
            orderby t.Sort, t.Name
            select new { nt.NotificationId, Tag = new TagDto(t.Id, t.Name, t.Color, t.Sort) }).ToListAsync(ct);
        var byId = tags.GroupBy(t => t.NotificationId).ToDictionary(g => g.Key, g => g.Select(t => t.Tag).ToList());

        var items = rows.Select(x => new InboxItemDto(x.Id, x.Title, x.Summary, byId.GetValueOrDefault(x.Id) ?? [], x.PublishedAt,
            x.DeliveredAt, x.AckAt, x.RequiresAck, x.IsNew, x.Updated, x.SeriesId, x.HasAtt)).ToList();
        string? next = null;
        if (hasMore)
        {
            var last = rows[^1];
            next = Cursor.Encode(last.DeliveredAt.UtcTicks.ToString(), last.Id.ToString());
        }
        return new Page<InboxItemDto>(items, next);
    }

    public async Task<InboxDetailDto> GetAsync(string code, Guid id, CancellationToken ct)
    {
        var row = await (
            from dl in db.Set<Domain.NotificationDelivery>().AsNoTracking()
            join nf in db.Set<Domain.Notification>().AsNoTracking() on dl.NotificationId equals nf.Id
            join em in db.Set<Identity.Directory.Employee>().AsNoTracking() on dl.EmployeeCode equals em.Code
            where dl.EmployeeCode == code && dl.NotificationId == id && nf.Status == Domain.NotificationStatuses.Published
                  && (nf.ExpiresAt == null || nf.ExpiresAt > DateTimeOffset.UtcNow)
            select new { n = nf, d = dl, prev = em.PreviousLoginAt }).FirstOrDefaultAsync(ct) ?? throw ApiException.NotFound("Không tìm thấy thông báo.");
        var n = row.n;
        var d = row.d;

        var tags = await (
            from nt in db.Set<Domain.NotificationTag>().AsNoTracking()
            join t in db.Set<Domain.Tag>().AsNoTracking() on nt.TagId equals t.Id
            where nt.NotificationId == id orderby t.Sort, t.Name
            select new TagDto(t.Id, t.Name, t.Color, t.Sort)).ToListAsync(ct);
        var attachments = await (
            from a in db.Set<Domain.NotificationAttachment>().AsNoTracking()
            join f in db.Set<StoredFile>().AsNoTracking() on a.FileId equals f.Id
            where a.NotificationId == id orderby a.Sort
            select new InboxAttachmentDto(f.Id, f.FileName, f.ContentType, f.SizeBytes)).ToListAsync(ct);

        InboxSeriesDto? series = null;
        if (n.SeriesId is { } sid)
        {
            var name = await db.Set<Domain.NotificationSeries>().Where(s => s.Id == sid).Select(s => s.Name).FirstOrDefaultAsync(ct);
            if (name is not null)
            {
                var previous = await (
                    from other in db.Set<Domain.Notification>().AsNoTracking()
                    join od in db.Set<Domain.NotificationDelivery>().AsNoTracking() on other.Id equals od.NotificationId
                    where od.EmployeeCode == code && other.SeriesId == sid && other.Id != id
                          && other.Status == Domain.NotificationStatuses.Published
                          && (other.ExpiresAt == null || other.ExpiresAt > DateTimeOffset.UtcNow)
                          && other.PublishedAt < n.PublishedAt
                    orderby other.PublishedAt descending
                    select new SeriesPreviousDto(other.Id, other.Title, other.PublishedAt)).Take(50).ToListAsync(ct);
                series = new InboxSeriesDto(sid, name, previous);
            }
        }

        return new InboxDetailDto(n.Id, n.Title, n.Summary, tags, n.PublishedAt, d.DeliveredAt, d.AcknowledgedAt,
            n.RequiresAck, row.prev == null || d.DeliveredAt > row.prev, n.ContentUpdatedAt != null && n.ContentUpdatedAt > d.DeliveredAt,
            n.SeriesId, attachments.Count > 0, n.BodyMd, NotificationEditorService.ParseVariables(n.Variables),
            JsonNode.Parse(d.Vars ?? "[]")!, attachments, series);
    }

    /// <summary>Acknowledges a delivery (also marks it read). 400 when the notification does not require acknowledgment.</summary>
    public async Task<UnreadCountDto> AcknowledgeAsync(string code, Guid id, CancellationToken ct)
    {
        var counts = await ExecuteCountsAsync($"""
            WITH v AS (SELECT d.notification_id, d.read_at, d.acknowledged_at, n.requires_ack
                       FROM notification_deliveries d JOIN notifications n ON n.id = d.notification_id
                       WHERE d.employee_code = @code AND d.notification_id = @id AND {Visible}),
            u AS (UPDATE notification_deliveries d SET acknowledged_at = now(), read_at = COALESCE(d.read_at, now()) FROM v
                  WHERE d.employee_code = @code AND d.notification_id = v.notification_id AND v.acknowledged_at IS NULL AND v.requires_ack
                  RETURNING d.notification_id),
            c AS (UPDATE notifications n SET ack_count = n.ack_count + 1,
                         read_count = n.read_count + (CASE WHEN v.read_at IS NULL THEN 1 ELSE 0 END)
                  FROM u JOIN v ON v.notification_id = u.notification_id WHERE n.id = u.notification_id RETURNING 1)
            SELECT (SELECT count(*) FROM v), (SELECT count(*) FROM v WHERE requires_ack), (SELECT count(*) FROM u)
            """, code, id, ct, 3);
        if (counts[0] == 0) throw ApiException.NotFound("Không tìm thấy thông báo.");
        if (counts[1] == 0) throw ApiException.BadRequest("Thông báo này không yêu cầu xác nhận.");
        if (counts[2] > 0) await NotifyUnreadChangedAsync(code, ct);
        return await UnreadCountAsync(code, ct);
    }

    /// <summary>Deliveries not yet read; only the live stream's seed value (the inbox UI has no read state).</summary>
    public async Task<UnreadCountDto> UnreadCountAsync(string code, CancellationToken ct)
    {
        var counts = await ExecuteCountsAsync($"""
            SELECT count(*) FROM notification_deliveries d JOIN notifications n ON n.id = d.notification_id
            WHERE d.employee_code = @code AND d.read_at IS NULL AND {Visible}
            """, code, null, ct, 1);
        return new UnreadCountDto((int)counts[0]);
    }

    /// <summary>Opens an attachment for download; 404 unless the employee has a visible delivery of the notification.</summary>
    public async Task<FileContent> OpenAttachmentAsync(string code, Guid notificationId, Guid fileId, CancellationToken ct)
    {
        var allowed = await (
            from dl in db.Set<Domain.NotificationDelivery>().AsNoTracking()
            join nt in db.Set<Domain.Notification>().AsNoTracking() on dl.NotificationId equals nt.Id
            join at in db.Set<Domain.NotificationAttachment>().AsNoTracking() on nt.Id equals at.NotificationId
            where dl.EmployeeCode == code && nt.Id == notificationId && at.FileId == fileId
                  && nt.Status == Domain.NotificationStatuses.Published && (nt.ExpiresAt == null || nt.ExpiresAt > DateTimeOffset.UtcNow)
            select at.Id).AnyAsync(ct);
        if (!allowed) throw ApiException.NotFound("Không tìm thấy tệp đính kèm.");
        return await files.OpenReadAsync(fileId, ct) ?? throw ApiException.NotFound("Không tìm thấy tệp đính kèm.");
    }

    private async Task<long[]> ExecuteCountsAsync(string sql, string code, Guid? id, CancellationToken ct, int columns = 2)
    {
        await db.Database.OpenConnectionAsync(ct);
        try
        {
            await using var cmd = new NpgsqlCommand(sql, (NpgsqlConnection)db.Database.GetDbConnection());
            cmd.Parameters.AddWithValue("code", code);
            if (id is not null) cmd.Parameters.AddWithValue("id", id.Value);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            await r.ReadAsync(ct);
            return Enumerable.Range(0, Math.Min(columns, r.FieldCount)).Select(i => r.GetInt64(i)).ToArray();
        }
        finally { await db.Database.CloseConnectionAsync(); }
    }

    /// <summary>Tells the other open tabs of this employee that the unread count moved.</summary>
    private async Task NotifyUnreadChangedAsync(string code, CancellationToken ct)
    {
        await db.Database.OpenConnectionAsync(ct);
        try { await NotifyChannel.NotifyAsync((NpgsqlConnection)db.Database.GetDbConnection(), NotifyChannel.UnreadChanged, null, null, [code], ct); }
        finally { await db.Database.CloseConnectionAsync(); }
    }
}
