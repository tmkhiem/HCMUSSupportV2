using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using Microsoft.EntityFrameworkCore;

namespace HCMUSSupportV2.Backend.Modules.Identity.Authorization;

/// <summary>Thrown when an operation would leave the system without an active admin (PLAN §4 guard rail).</summary>
public class LastAdminException() : InvalidOperationException("Không thể gỡ quản trị viên cuối cùng của hệ thống.");

/// <summary>
/// "The last admin cannot be removed." Call <see cref="EnsureNotLastAdminAsync"/> before revoking the admin role from
/// an employee or deactivating an employee (D14a does both). "Admin" here means an active employee with the admin role.
/// </summary>
public class LastAdminGuard(AppDbContext db)
{
    public Task<bool> HasActiveAdminAsync(CancellationToken ct = default) =>
        ActiveAdmins().AnyAsync(ct);

    /// <summary>True when <paramref name="employeeCode"/> is an active admin and the only one.</summary>
    public async Task<bool> IsLastAdminAsync(string employeeCode, CancellationToken ct = default)
    {
        var codes = await ActiveAdmins().Select(r => r.EmployeeCode).Take(2).ToListAsync(ct);
        return codes.Count == 1 && codes[0] == employeeCode;
    }

    /// <exception cref="LastAdminException">The employee is the last active admin.</exception>
    public async Task EnsureNotLastAdminAsync(string employeeCode, CancellationToken ct = default)
    {
        if (await IsLastAdminAsync(employeeCode, ct)) throw new LastAdminException();
    }

    private IQueryable<RoleAssignment> ActiveAdmins() =>
        from r in db.Set<RoleAssignment>().AsNoTracking()
        join e in db.Set<Employee>().AsNoTracking() on r.EmployeeCode equals e.Code
        where r.Role == Roles.Admin && e.Status == EmployeeStatuses.Active
        select r;
}
