using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using HCMUSSupportV2.Backend.Modules.Platform.Jobs;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;

namespace HCMUSSupportV2.Backend.Modules.Identity.Groups;

/// <summary>Payload of the <c>groups.recompute</c> job. A null <see cref="GroupId"/> recomputes everything.</summary>
public sealed record RecomputePayload(long? GroupId);

/// <summary>
/// The <c>groups.recompute</c> job: with a <c>groupId</c> recomputes that group, without one it ensures the org-unit
/// groups and recomputes every org-unit and rule group. Audited as <c>group.recomputed</c> when something changed.
/// </summary>
public class GroupsRecomputeJob(GroupRecomputeService recompute, IAuditLogger audit) : IJobHandler
{
    public const string JobType = "groups.recompute";
    public string Type => JobType;

    public async Task HandleAsync(JobContext context, CancellationToken cancellationToken)
    {
        var payload = context.GetPayload<RecomputePayload>();
        var result = payload?.GroupId is { } id
            ? await recompute.RecomputeGroupAsync(id, cancellationToken)
            : await recompute.RecomputeAllAsync(cancellationToken);

        if (result.HasChanges)
            await audit.LogAsync(GroupAuditActions.Recomputed, "group", payload?.GroupId?.ToString(), result, cancellationToken);

        // Individual group failures were logged; fail the attempt so the queue retries the whole (idempotent) run.
        if (result.Failed > 0)
            throw new InvalidOperationException($"{result.Failed} group(s) failed to recompute; see the log.");
    }
}

/// <summary>Roster sync (D04) finished: queue a full recompute, unless one is already waiting to start.</summary>
public class RosterSyncGroupsObserver(AppDbContext db, IJobQueue jobs) : IRosterSyncObserver
{
    public async Task OnRosterSyncedAsync(CancellationToken ct)
    {
        var pending = await db.Database.SqlQueryRaw<bool>(
            "SELECT EXISTS (SELECT 1 FROM jobs WHERE type = @t AND done_at IS NULL AND attempts = 0 AND payload = @p::jsonb) AS \"Value\"",
            new NpgsqlParameter("t", NpgsqlDbType.Text) { Value = GroupsRecomputeJob.JobType },
            new NpgsqlParameter("p", NpgsqlDbType.Text) { Value = "{}" }).SingleAsync(ct);
        if (!pending) await jobs.EnqueueAsync(GroupsRecomputeJob.JobType, payload: null, cancellationToken: ct);
    }
}
