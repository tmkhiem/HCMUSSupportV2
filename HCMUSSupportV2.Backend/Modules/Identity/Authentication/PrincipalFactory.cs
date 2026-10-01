using System.Security.Claims;
using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using Microsoft.EntityFrameworkCore;

namespace HCMUSSupportV2.Backend.Modules.Identity.Authentication;

/// <summary>Builds the application principal (the contents of the session cookie) for an employee.</summary>
public class PrincipalFactory(AppDbContext db, TimeProvider time)
{
    /// <summary>
    /// Returns the principal for an active employee, or null when the employee does not exist or is not active.
    /// Claims: <c>code</c>, <c>name</c>, <c>picture</c>, one <c>role</c> per role (always <c>employee</c>, plus the
    /// assigned <c>editor</c>/<c>admin</c>), the standard name identifier (needed for stable antiforgery tokens) and
    /// <c>chk</c> (when the principal was last checked against the database).
    /// </summary>
    public async Task<ClaimsPrincipal?> CreateAsync(string employeeCode, CancellationToken ct = default)
    {
        var employee = await db.Set<Employee>().AsNoTracking().FirstOrDefaultAsync(e => e.Code == employeeCode, ct);
        if (employee is null || !employee.IsActive) return null;

        var assigned = await db.Set<RoleAssignment>().AsNoTracking()
            .Where(r => r.EmployeeCode == employeeCode)
            .Select(r => r.Role)
            .ToListAsync(ct);
        return Build(employee, assigned);
    }

    /// <summary>
    /// Re-creates the principal of <paramref name="previous"/> from the database (fresh roles, name, photo). An
    /// unexpired view-as session is carried over while the viewed employee still exists. Null when the signed-in
    /// employee no longer exists or is not active.
    /// </summary>
    public async Task<ClaimsPrincipal?> RefreshAsync(ClaimsPrincipal previous, CancellationToken ct = default)
    {
        var code = IdentityClaims.CodeOf(previous);
        var fresh = code is null ? null : await CreateAsync(code, ct);
        if (fresh is null) return null;

        var actingAs = previous.FindFirst(IdentityClaims.ActingAs)?.Value;
        if (actingAs is not null && !IsViewAsExpired(previous) &&
            long.TryParse(previous.FindFirst(IdentityClaims.ActingAsUntil)?.Value, out var until) &&
            await db.Set<Employee>().AsNoTracking().AnyAsync(e => e.Code == actingAs, ct))
            return WithActingAs(fresh, actingAs, DateTimeOffset.FromUnixTimeSeconds(until));
        return fresh;
    }

    /// <summary>True when the principal's view-as session has expired (a missing expiry counts as expired).</summary>
    public bool IsViewAsExpired(ClaimsPrincipal principal) =>
        !long.TryParse(principal.FindFirst(IdentityClaims.ActingAsUntil)?.Value, out var until) ||
        time.GetUtcNow().ToUnixTimeSeconds() >= until;

    /// <summary>Copy of the principal with the view-as claims (<c>acting_as</c>, <c>acting_as_until</c>) set.</summary>
    public static ClaimsPrincipal WithActingAs(ClaimsPrincipal principal, string actingAsCode, DateTimeOffset until)
    {
        var claims = principal.Claims
            .Where(c => c.Type is not (IdentityClaims.ActingAs or IdentityClaims.ActingAsUntil)).ToList();
        claims.Add(new Claim(IdentityClaims.ActingAs, actingAsCode));
        claims.Add(new Claim(IdentityClaims.ActingAsUntil, until.ToUnixTimeSeconds().ToString()));
        return Clone(claims);
    }

    /// <summary>Copy of the principal without any view-as claims.</summary>
    public static ClaimsPrincipal WithoutActingAs(ClaimsPrincipal principal) =>
        Clone(principal.Claims.Where(c => c.Type is not (IdentityClaims.ActingAs or IdentityClaims.ActingAsUntil)).ToList());

    private static ClaimsPrincipal Clone(List<Claim> claims) =>
        new(new ClaimsIdentity(claims, IdentityClaims.AuthenticationType, IdentityClaims.Name, IdentityClaims.Role));

    public ClaimsPrincipal Build(Employee employee, IEnumerable<string> assignedRoles)
    {
        var claims = new List<Claim>
        {
            new(IdentityClaims.Code, employee.Code),
            new(ClaimTypes.NameIdentifier, employee.Code),
            new(IdentityClaims.Name, employee.FullName),
            new(IdentityClaims.Role, Roles.Employee),
            new(IdentityClaims.CheckedAt, time.GetUtcNow().ToUnixTimeSeconds().ToString()),
        };
        if (!string.IsNullOrEmpty(employee.PhotoUrl)) claims.Add(new Claim(IdentityClaims.Picture, employee.PhotoUrl));
        foreach (var role in assignedRoles.Distinct().OrderBy(r => r, StringComparer.Ordinal))
            claims.Add(new Claim(IdentityClaims.Role, role));

        var identity = new ClaimsIdentity(claims, IdentityClaims.AuthenticationType, IdentityClaims.Name, IdentityClaims.Role);
        return new ClaimsPrincipal(identity);
    }
}
