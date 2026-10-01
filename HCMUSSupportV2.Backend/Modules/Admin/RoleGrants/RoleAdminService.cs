using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Admin.Common;
using HCMUSSupportV2.Backend.Modules.Identity.Authentication;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using Microsoft.EntityFrameworkCore;

namespace HCMUSSupportV2.Backend.Modules.Admin.RoleGrants;

public class RoleAdminService(
    AppDbContext db,
    LastAdminGuard guard,
    IAuditLogger audit,
    SessionInvalidator sessions,
    TimeProvider time)
{
    public const string GrantedAction = "roles.granted";
    public const string RevokedAction = "roles.revoked";

    /// <summary>Key of the advisory lock that serialises changes that could remove the last admin.</summary>
    public const long AdminChangeLockKey = 7_140_001;

    public async Task<AdminPage<RoleRowDto>> ListAsync(string? q, string? role, string? cursor, int? limit, CancellationToken ct)
    {
        var take = AdminQuery.ClampLimit(limit);
        var employees = db.Set<Employee>().AsNoTracking();

        if (!string.IsNullOrWhiteSpace(q))
        {
            var text = q.Trim();
            var like = $"%{AdminQuery.EscapeLike(text)}%";
            var plain = $"%{AdminQuery.EscapeLike(AdminQuery.Unaccent(text))}%";
            var emails = db.Set<EmployeeEmail>().AsNoTracking();
            employees = employees.Where(e =>
                EF.Functions.ILike(e.Code, like, "\\") ||
                EF.Functions.ILike(e.FullName, like, "\\") ||
                EF.Functions.ILike(e.FullNameUnaccent, plain, "\\") ||
                emails.Any(m => m.EmployeeCode == e.Code && EF.Functions.ILike(m.Email, like, "\\")));
        }

        var assignments = db.Set<RoleAssignment>().AsNoTracking();
        if (role is Roles.Editor or Roles.Admin)
            employees = employees.Where(e => assignments.Any(r => r.EmployeeCode == e.Code && r.Role == role));
        else if (role == Roles.Employee)
            employees = employees.Where(e => !assignments.Any(r => r.EmployeeCode == e.Code));

        if (AdminQuery.DecodeCursor(cursor) is { } after)
            employees = employees.Where(e => e.Code.CompareTo(after) > 0);

        var rows = await (
            from e in employees.OrderBy(e => e.Code).Take(take + 1)
            join u in db.Set<OrgUnit>().AsNoTracking() on e.OrgUnitId equals u.Id into units
            from u in units.DefaultIfEmpty()
            orderby e.Code
            select new
            {
                e.Code,
                e.FullName,
                Unit = u != null ? u.Name : null,
                e.Status,
                PrimaryEmail = db.Set<EmployeeEmail>().Where(m => m.EmployeeCode == e.Code)
                    .OrderByDescending(m => m.IsPrimary).ThenBy(m => m.Email).Select(m => m.Email).FirstOrDefault(),
            }).ToListAsync(ct);

        var page = rows.Take(take).ToList();
        var codes = page.Select(r => r.Code).ToList();
        var assigned = (await db.Set<RoleAssignment>().AsNoTracking()
                .Where(r => codes.Contains(r.EmployeeCode)).Select(r => new { r.EmployeeCode, r.Role }).ToListAsync(ct))
            .ToLookup(r => r.EmployeeCode, r => r.Role);

        var items = page.Select(r => new RoleRowDto(r.Code, r.FullName, r.Unit, r.Status, r.PrimaryEmail,
            assigned[r.Code].OrderBy(x => x == Roles.Editor ? 0 : 1).ToList())).ToList();
        return new AdminPage<RoleRowDto>(items, rows.Count > take ? AdminQuery.EncodeCursor(page[^1].Code) : null);
    }

    public async Task<RoleDetailDto?> GetAsync(string code, CancellationToken ct)
    {
        var employee = await (
            from e in db.Set<Employee>().AsNoTracking()
            join u in db.Set<OrgUnit>().AsNoTracking() on e.OrgUnitId equals u.Id into units
            from u in units.DefaultIfEmpty()
            where e.Code == code
            select new { e.Code, e.FullName, e.Status, Unit = u != null ? u.Name : null }).FirstOrDefaultAsync(ct);
        if (employee is null) return null;

        var emails = await db.Set<EmployeeEmail>().AsNoTracking().Where(m => m.EmployeeCode == code)
            .OrderByDescending(m => m.IsPrimary).ThenBy(m => m.Email).Select(m => m.Email).ToListAsync(ct);
        var grants = await (
            from r in db.Set<RoleAssignment>().AsNoTracking()
            join g in db.Set<Employee>().AsNoTracking() on r.GrantedBy equals g.Code into granters
            from g in granters.DefaultIfEmpty()
            where r.EmployeeCode == code
            select new RoleGrantDto(r.Role, r.GrantedBy, g != null ? g.FullName : null, r.GrantedAt)).ToListAsync(ct);
        grants = grants.OrderBy(g => g.Role == Roles.Editor ? 0 : 1).ToList();

        return new RoleDetailDto(employee.Code, employee.FullName, employee.Unit, employee.Status, emails,
            grants.Select(g => g.Role).ToList(), grants);
    }

    /// <summary>Outcome of <see cref="SetRolesAsync"/>.</summary>
    public enum SetRolesResult { Ok, NotFound, InvalidRole, LastAdmin }

    /// <summary>
    /// Makes the employee's assigned roles exactly <paramref name="requested"/>. Grants and revocations are audited one
    /// row per role (<c>roles.granted</c> / <c>roles.revoked</c>); removing <c>admin</c> from the only active admin is refused.
    /// </summary>
    public async Task<SetRolesResult> SetRolesAsync(string code, IEnumerable<string> requested, string actorCode, CancellationToken ct)
    {
        var wanted = new HashSet<string>(StringComparer.Ordinal);
        foreach (var raw in requested)
        {
            var role = raw?.Trim().ToLowerInvariant() ?? "";
            if (role == Roles.Employee) continue;
            if (!Roles.Assignable.Contains(role)) return SetRolesResult.InvalidRole;
            wanted.Add(role);
        }

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlAsync($"SELECT pg_advisory_xact_lock({AdminChangeLockKey})", ct);

        if (!await db.Set<Employee>().AnyAsync(e => e.Code == code, ct)) return SetRolesResult.NotFound;

        var current = await db.Set<RoleAssignment>().Where(r => r.EmployeeCode == code).ToListAsync(ct);
        var revoked = current.Where(r => !wanted.Contains(r.Role)).ToList();
        var granted = wanted.Where(r => current.All(c => c.Role != r)).ToList();

        if (revoked.Any(r => r.Role == Roles.Admin) && await guard.IsLastAdminAsync(code, ct))
            return SetRolesResult.LastAdmin;

        db.Set<RoleAssignment>().RemoveRange(revoked);
        foreach (var role in granted)
            db.Set<RoleAssignment>().Add(new RoleAssignment
            {
                EmployeeCode = code, Role = role, GrantedBy = actorCode, GrantedAt = time.GetUtcNow(),
            });
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        foreach (var role in granted) await audit.LogAsync(GrantedAction, "employee", code, new { role }, ct);
        foreach (var r in revoked) await audit.LogAsync(RevokedAction, "employee", code, new { role = r.Role }, ct);
        if (granted.Count + revoked.Count > 0) sessions.Invalidate(code);
        return SetRolesResult.Ok;
    }
}
