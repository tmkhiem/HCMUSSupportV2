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

/// <summary>Raw SQL for the state transition to <c>published</c>; shared by the immediate publish and the scheduled job.</summary>
public static class PublishTransition
{
    /// <summary>Moves a draft/scheduled notification (due, for scheduled ones) to published. Returns true when this call did it.</summary>
    public static async Task<bool> TryPublishAsync(AppDbContext db, Guid id, bool immediate, CancellationToken ct)
    {
        var conn = (NpgsqlConnection)db.Database.GetDbConnection();
        await db.Database.OpenConnectionAsync(ct);
        try
        {
            var due = immediate ? "status IN ('draft','scheduled')" : "status = 'scheduled' AND publish_at <= now()";
            await using var cmd = new NpgsqlCommand($"""
                UPDATE notifications SET status = 'published', published_at = now(), publish_at = COALESCE(publish_at, now()), updated_at = now()
                WHERE id = @id AND {due}
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
/// <c>notifications.publish</c>: publishes a scheduled notification once it is due (no-op while it is not), then fans it
/// out to its recipients. Also used to re-run the fan-out after the audience of a published post changed. Idempotent.
/// </summary>
public class PublishNotificationJob(AppDbContext db, FanOutService fanOut, IAuditLogger audit) : IJobHandler
{
    public string Type => NotificationJobTypes.Publish;

    public async Task HandleAsync(JobContext context, CancellationToken ct)
    {
        var payload = context.GetPayload<PublishPayload>() ?? throw new InvalidOperationException("Missing payload");
        if (await PublishTransition.TryPublishAsync(db, payload.NotificationId, immediate: false, ct))
            await audit.LogAsync("notification.published", "notification", payload.NotificationId.ToString(), new { by = "scheduler" }, ct);
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
            .Where(n => n.Status == Domain.NotificationStatuses.Published && (n.ExpiresAt == null || n.ExpiresAt > DateTimeOffset.UtcNow));
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

public class NotificationOptions
{
    public const string SectionName = "Notifications";

    public SchedulerOptions Scheduler { get; set; } = new();

    public class SchedulerOptions
    {
        /// <summary>How often the sweeper looks for scheduled notifications that are due but have no pending job.</summary>
        public double PollSeconds { get; set; } = 30;
    }
}

/// <summary>
/// Safety net next to the <c>run_at</c> jobs created by <c>schedule</c>: enqueues <c>notifications.publish</c> for scheduled
/// notifications that are due and have no pending job (e.g. publish_at edited in SQL, or a lost job).
/// </summary>
public class ScheduledNotificationSweeper(
    IServiceScopeFactory scopes, IOptionsMonitor<NotificationOptions> options, ILogger<ScheduledNotificationSweeper> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Yield();
        while (!stoppingToken.IsCancellationRequested)
        {
            try { await SweepAsync(stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex) { logger.LogError(ex, "Scheduled notification sweep failed"); }

            try { await Task.Delay(TimeSpan.FromSeconds(Math.Max(0.05, options.CurrentValue.Scheduler.PollSeconds)), stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    public async Task SweepAsync(CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var jobs = scope.ServiceProvider.GetRequiredService<IJobQueue>();

        var due = new List<Guid>();
        var conn = (NpgsqlConnection)db.Database.GetDbConnection();
        await db.Database.OpenConnectionAsync(ct);
        try
        {
            await using var cmd = new NpgsqlCommand("""
                SELECT n.id FROM notifications n
                WHERE n.status = 'scheduled' AND n.publish_at <= now()
                  AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.type = 'notifications.publish' AND j.done_at IS NULL
                                  AND j.run_at <= now() AND j.payload ->> 'notificationId' = n.id::text)
                LIMIT 100
                """, conn);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct)) due.Add(r.GetGuid(0));
        }
        finally { await db.Database.CloseConnectionAsync(); }

        foreach (var id in due)
            await jobs.EnqueueAsync(NotificationJobTypes.Publish, new PublishPayload(id), cancellationToken: ct);
    }
}
