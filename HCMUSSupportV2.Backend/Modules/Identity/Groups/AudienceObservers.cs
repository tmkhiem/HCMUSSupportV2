namespace HCMUSSupportV2.Backend.Modules.Identity.Groups;

/// <summary>
/// Notified after employees join a group, whether added by hand, by import, or by a rule or org-unit recompute.
/// Register implementations with <c>services.AddScoped&lt;IGroupMembershipObserver, …&gt;()</c>. Every registered
/// observer is called. The notifications module uses this to backfill deliveries for late joiners (PLAN §3.3).
/// Implementations should enqueue a job rather than do heavy work inline.
/// </summary>
public interface IGroupMembershipObserver
{
    Task OnMembersAddedAsync(long groupId, IReadOnlyCollection<string> employeeCodes, CancellationToken ct);
}

/// <summary>
/// Notified after employees become eligible to receive notifications: they became <c>active</c> (roster sync,
/// admin status change) or got their first mapped email. The notifications module uses this to backfill
/// <c>audience_all</c> posts that are still live.
/// </summary>
public interface IEmployeeActivationObserver
{
    Task OnEmployeesActivatedAsync(IReadOnlyCollection<string> employeeCodes, CancellationToken ct);
}
