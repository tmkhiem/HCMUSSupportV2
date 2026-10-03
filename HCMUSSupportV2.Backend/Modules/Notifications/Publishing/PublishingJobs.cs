using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Identity.Groups;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using HCMUSSupportV2.Backend.Modules.Platform.Jobs;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Npgsql;

namespace HCMUSSupportV2.Backend.Modules.Notifications.Publishing;

public static class NotificationJobTypes
{
    public const string Publish = "notifications.publish";
    public const string Backfill = "notifications.backfill";
}

public record PublishPayload(Guid NotificationId);

public record BackfillPayload(string Kind, long? GroupId, List<string> Codes);

/// <summary>Raw SQL for the state transition to <c>published</c> (a posted notification goes live at once).</summary>
public static class PublishTransition
{
    /// <summary>Moves a draft to published. Returns true when this call did it.</summary>
    public static async Task<bool> TryPublishAsync(AppDbContext db, Guid id, CancellationToken ct)
    {
        var conn = (NpgsqlConnection)db.Database.GetDbConnection();
        await db.Database.OpenConnectionAsync(ct);
        try
        {
            await using var cmd = new NpgsqlCommand("""
                UPDATE notifications SET status = 'published', published_at = now(), updated_at = now()
                WHERE id = @id AND status = 'draft'
                """, conn);
            cmd.Parameters.AddWithValue("id", id);
            if (await cmd.ExecuteNonQueryAsync(ct) == 0) return false;

            // The history of a published post starts with the content as published.
            await using var rev = new NpgsqlCommand("""
                INSERT INTO notification_revisions (notification_id, version, title, summary, content, variables, edited_by, edited_at)
                SELECT id, version, title, summary, body_md, variables, updated_by, now() FROM notifications WHERE id = @id
                ON CONFLICT DO NOTHING
                """, conn);
            rev.Parameters.AddWithValue("id", id);
            await rev.ExecuteNonQueryAsync(ct);
            return true;
        }
        finally { await db.Database.CloseConnectionAsync(); }
    }
}

/// <summary>
/// <c>notifications.publish</c>: fans a published notification out to its recipients. Also used to re-run the fan-out after
/// the audience of a published post changed. Idempotent.
/// </summary>
public class PublishNotificationJob(FanOutService fanOut) : IJobHandler
{
    public string Type => NotificationJobTypes.Publish;

    public async Task HandleAsync(JobContext context, CancellationToken ct)
    {
        var payload = context.GetPayload<PublishPayload>() ?? throw new InvalidOperationException("Missing payload");
        await fanOut.FanOutAsync(payload.NotificationId, null, ct);
    }
}

/// <summary>
/// <c>notifications.backfill</c>: late joiners. Delivers published, unexpired notifications to employees who just joined a
/// group (<c>Kind=group</c>) or became eligible (<c>Kind=employees</c>: activated, or got a first email).
/// </summary>
public class BackfillNotificationsJob(AppDbContext db, FanOutService fanOut) : IJobHandler
{
    public string Type => NotificationJobTypes.Backfill;

    public async Task HandleAsync(JobContext context, CancellationToken ct)
    {
        var payload = context.GetPayload<BackfillPayload>() ?? throw new InvalidOperationException("Missing payload");
        if (payload.Codes.Count == 0) return;

        var candidates = db.Set<Domain.Notification>().AsNoTracking()
            .Where(n => n.Status == Domain.NotificationStatuses.Published);
        if (payload.Kind == "group")
        {
            var groupId = payload.GroupId ?? throw new InvalidOperationException("Missing groupId");
            candidates = candidates.Where(n => db.Set<Domain.NotificationAudience>()
                .Any(a => a.NotificationId == n.Id && a.Kind == Domain.AudienceKinds.Group && a.GroupId == groupId));
        }

        var ids = await candidates.OrderBy(n => n.PublishedAt).Select(n => n.Id).ToListAsync(ct);
        foreach (var id in ids) await fanOut.FanOutAsync(id, payload.Codes, ct);
    }
}

/// <summary>Late-joiner hooks called by the groups engine (D06) and the roster/email code (D03/D04/D14a).</summary>
public class NotificationAudienceObserver(IJobQueue jobs) : IGroupMembershipObserver, IEmployeeActivationObserver
{
    private const int ChunkSize = 500;

    public async Task OnMembersAddedAsync(long groupId, IReadOnlyCollection<string> employeeCodes, CancellationToken ct)
    {
        foreach (var chunk in employeeCodes.Chunk(ChunkSize))
            await jobs.EnqueueAsync(NotificationJobTypes.Backfill, new BackfillPayload("group", groupId, chunk.ToList()), cancellationToken: ct);
    }

    public async Task OnEmployeesActivatedAsync(IReadOnlyCollection<string> employeeCodes, CancellationToken ct)
    {
        foreach (var chunk in employeeCodes.Chunk(ChunkSize))
            await jobs.EnqueueAsync(NotificationJobTypes.Backfill, new BackfillPayload("employees", null, chunk.ToList()), cancellationToken: ct);
    }
}
