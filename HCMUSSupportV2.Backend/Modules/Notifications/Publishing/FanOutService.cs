using System.Text;
using System.Text.Json;
using HCMUSSupportV2.Backend.Data;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;

namespace HCMUSSupportV2.Backend.Modules.Notifications.Publishing;

public static class NotifyChannel
{
    public const string Name = "notifications";

    /// <summary>Payload type: new deliveries (<c>t=d</c>), or "your unread count changed" (<c>t=u</c>).</summary>
    public const string Delivered = "d";
    public const string UnreadChanged = "u";

    // NOTIFY payloads must stay below 8000 bytes; keep a margin.
    private const int MaxPayloadBytes = 7000;

    /// <summary>Sends <c>pg_notify</c> messages for <paramref name="codes"/>, split so every payload stays under the limit.</summary>
    public static async Task NotifyAsync(NpgsqlConnection conn, string type, Guid? notificationId, string? title,
        IReadOnlyList<string> codes, CancellationToken ct)
    {
        if (codes.Count == 0) return;
        var head = new Dictionary<string, object?> { ["t"] = type };
        if (notificationId is not null) head["id"] = notificationId.Value;
        if (title is not null) head["title"] = title.Length > 500 ? title[..500] : title;
        var baseBytes = Encoding.UTF8.GetByteCount(JsonSerializer.Serialize(head)) + 12;

        var batch = new List<string>();
        var size = baseBytes;
        async Task Flush()
        {
            if (batch.Count == 0) return;
            var payload = new Dictionary<string, object?>(head) { ["codes"] = batch };
            await using var cmd = new NpgsqlCommand("SELECT pg_notify(@ch, @p)", conn);
            cmd.Parameters.AddWithValue("ch", Name);
            cmd.Parameters.AddWithValue("p", JsonSerializer.Serialize(payload));
            await cmd.ExecuteNonQueryAsync(ct);
            batch = [];
            size = baseBytes;
        }

        foreach (var code in codes)
        {
            var add = Encoding.UTF8.GetByteCount(code) + 4;
            if (size + add > MaxPayloadBytes) await Flush();
            batch.Add(code);
            size += add;
        }
        await Flush();
    }
}

/// <summary>
/// Resolves a notification's audiences into delivery rows (PLAN 3.3). Idempotent: running it again only adds the
/// recipients that are missing, so it serves publishing, late-joiner backfill and re-fan-out after audience edits.
/// </summary>
public class FanOutService(AppDbContext db, ILogger<FanOutService> logger)
{
    private const string ImportSql = """
        INSERT INTO notification_deliveries (employee_code, notification_id, vars, delivered_at)
        SELECT e.code, @nid, r.value, now()
        FROM notification_audiences a
        JOIN notification_recipient_imports i ON i.id = a.import_id AND i.status = 'applied'
        CROSS JOIN LATERAL jsonb_each(i.rows) r
        JOIN employees e ON e.code = r.key
        WHERE a.notification_id = @nid AND a.kind = 'import' AND e.status = 'active'
          AND (@codes::text[] IS NULL OR e.code = ANY(@codes))
        ON CONFLICT (employee_code, notification_id) DO UPDATE SET vars = EXCLUDED.vars
            WHERE notification_deliveries.vars IS DISTINCT FROM EXCLUDED.vars
        RETURNING employee_code, (xmax = 0) AS inserted
        """;

    private const string OthersSql = """
        INSERT INTO notification_deliveries (employee_code, notification_id, delivered_at)
        SELECT e.code, @nid, now()
        FROM employees e
        WHERE e.status = 'active'
          AND (@codes::text[] IS NULL OR e.code = ANY(@codes))
          AND (
            (@all AND EXISTS (SELECT 1 FROM employee_emails m WHERE m.employee_code = e.code))
            OR EXISTS (SELECT 1 FROM notification_audiences a JOIN group_members gm ON gm.group_id = a.group_id
                       WHERE a.notification_id = @nid AND a.kind = 'group' AND gm.employee_code = e.code)
            OR EXISTS (SELECT 1 FROM notification_audiences a
                       WHERE a.notification_id = @nid AND a.kind = 'employee' AND a.employee_code = e.code))
        ON CONFLICT (employee_code, notification_id) DO NOTHING
        RETURNING employee_code
        """;

    private const string CountersSql = """
        UPDATE notifications n SET recipient_count = c.total, read_count = c.reads, ack_count = c.acks
        FROM (SELECT count(*)::int AS total, count(read_at)::int AS reads, count(acknowledged_at)::int AS acks
              FROM notification_deliveries WHERE notification_id = @nid) c
        WHERE n.id = @nid
        """;

    /// <summary>
    /// Creates the missing deliveries of a published notification (all audiences, or only for <paramref name="codes"/>),
    /// refreshes the counters and sends the <c>NOTIFY</c> messages. Returns the number of new deliveries.
    /// </summary>
    public async Task<int> FanOutAsync(Guid notificationId, IReadOnlyCollection<string>? codes, CancellationToken ct)
    {
        var conn = (NpgsqlConnection)db.Database.GetDbConnection();
        await db.Database.OpenConnectionAsync(ct);
        try
        {
            string title;
            bool all;
            await using (var cmd = new NpgsqlCommand("SELECT title, audience_all FROM notifications WHERE id = @nid AND status = 'published'", conn))
            {
                cmd.Parameters.AddWithValue("nid", notificationId);
                await using var r = await cmd.ExecuteReaderAsync(ct);
                if (!await r.ReadAsync(ct)) return 0; // not published (any more): nothing to deliver
                title = r.GetString(0);
                all = r.GetBoolean(1);
            }

            var inserted = new List<string>();
            var codeArray = codes?.ToArray();

            await using (var cmd = new NpgsqlCommand(ImportSql, conn))
            {
                cmd.Parameters.AddWithValue("nid", notificationId);
                cmd.Add("codes", NpgsqlDbType.Array | NpgsqlDbType.Text, codeArray);
                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct))
                    if (r.GetBoolean(1)) inserted.Add(r.GetString(0));
            }

            await using (var cmd = new NpgsqlCommand(OthersSql, conn))
            {
                cmd.Parameters.AddWithValue("nid", notificationId);
                cmd.Parameters.AddWithValue("all", all);
                cmd.Add("codes", NpgsqlDbType.Array | NpgsqlDbType.Text, codeArray);
                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct)) inserted.Add(r.GetString(0));
            }

            await using (var cmd = new NpgsqlCommand(CountersSql, conn))
            {
                cmd.Parameters.AddWithValue("nid", notificationId);
                await cmd.ExecuteNonQueryAsync(ct);
            }

            await NotifyChannel.NotifyAsync(conn, NotifyChannel.Delivered, notificationId, title, inserted, ct);
            logger.LogInformation("Notification {Id}: {Count} new deliveries", notificationId, inserted.Count);
            return inserted.Count;
        }
        finally
        {
            await db.Database.CloseConnectionAsync();
        }
    }
}
