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
