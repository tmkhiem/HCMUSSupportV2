using System.Collections.Concurrent;

namespace HCMUSSupportV2.Backend.Modules.Identity.Authentication;

/// <summary>
/// Makes a role or status change visible immediately instead of after <c>Auth:RevalidateSeconds</c>: the admin
/// endpoints call <see cref="Invalidate"/>, and the cookie revalidator re-checks any principal whose last check
/// (<c>chk</c>) is not newer than that moment. In-memory, so it is exact for a single backend instance; with several
/// instances the others still catch up at the normal interval. No schema, nothing to migrate.
/// </summary>
public class SessionInvalidator(TimeProvider time)
{
    private readonly ConcurrentDictionary<string, long> _changedAt = new(StringComparer.Ordinal);

    public void Invalidate(string employeeCode) =>
        _changedAt[employeeCode] = time.GetUtcNow().ToUnixTimeSeconds();

    /// <summary>True when the employee was invalidated at or after <paramref name="checkedAtUnixSeconds"/>.</summary>
    public bool IsStale(string employeeCode, long checkedAtUnixSeconds) =>
        _changedAt.TryGetValue(employeeCode, out var at) && at >= checkedAtUnixSeconds;
}
