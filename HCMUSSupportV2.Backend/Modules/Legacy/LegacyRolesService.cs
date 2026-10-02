using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Admin.EmployeeEmails;
using HCMUSSupportV2.Backend.Modules.Admin.RoleGrants;
using HCMUSSupportV2.Backend.Modules.Identity.Authentication;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using Microsoft.EntityFrameworkCore;

namespace HCMUSSupportV2.Backend.Modules.Legacy;

/// <summary>
/// The roles step of the legacy migration: grants roles to the named people and nothing else (PLAN Q5, resolved: the two repo
/// owners become admin; the other v1 ViewAs/Lookup holders are listed for the owner, never granted here). Additive and idempotent:
/// a role the person already has is reported as <c>already</c>. The identities come from the caller (tool argument or config),
/// never from the code. An email that is not mapped yet is mapped to the person when <c>MapEmail</c> is set and the address is free.
/// </summary>
public class LegacyRolesService(AppDbContext db, IAuditLogger audit, SessionInvalidator sessions, TimeProvider time)
{
    public async Task<LegacyRolesReportDto> GrantAsync(LegacyRolesRequest request, bool dryRun, CancellationToken ct)
    {
        var results = new List<LegacyGrantResultDto>();
        foreach (var grant in request.Grants ?? [])
            results.Add(await GrantOneAsync(grant, request.MapEmail, dryRun, ct));
        return new LegacyRolesReportDto(dryRun, results);
    }

    private async Task<LegacyGrantResultDto> GrantOneAsync(LegacyGrantDto grant, bool mapEmail, bool dryRun, CancellationToken ct)
    {
        var role = grant.Role?.Trim().ToLowerInvariant() ?? "";
        var code = grant.Code?.Trim();
        var email = EmployeeEmailsService.NormalizeEmail(grant.Email);
        if (!Roles.Assignable.Contains(role))
            return Fail(code, role, "invalid_role", "Vai trò phải là editor hoặc admin.");
        if (string.IsNullOrEmpty(code) && email is null)
            return Fail(code, role, "invalid_request", "Cần MSCB hoặc email.");
        if (!string.IsNullOrWhiteSpace(grant.Email) && email is null)
            return Fail(code, role, "invalid_request", "Email không hợp lệ.");

        EmployeeEmail? mapping = email is null ? null : await db.Set<EmployeeEmail>().FirstOrDefaultAsync(m => m.Email == email, ct);
        if (string.IsNullOrEmpty(code))
        {
            if (mapping is null) return Fail(null, role, "email_not_mapped", "Email chưa gắn với MSCB nào và không có MSCB để gắn.");
            code = mapping.EmployeeCode;
        }
        else if (mapping is not null && mapping.EmployeeCode != code)
            return Fail(code, role, "email_mismatch", $"Email đã gắn với MSCB {mapping.EmployeeCode}, không phải {code}.");

        var employee = await db.Set<Employee>().AsNoTracking().Where(e => e.Code == code)
            .Select(e => new { e.Code, e.Status }).FirstOrDefaultAsync(ct);
        if (employee is null) return Fail(code, role, "employee_not_found", $"Không có nhân sự MSCB {code} (chưa nhập HRM?).");
        var active = employee.Status == EmployeeStatuses.Active;

        var emailWillBeMapped = false;
        if (email is not null && mapping is null)
        {
            if (!mapEmail) return Fail(code, role, "email_not_mapped", "Email chưa được gắn với MSCB này.", active);
            emailWillBeMapped = true;
        }

        var has = await db.Set<RoleAssignment>().AnyAsync(r => r.EmployeeCode == code && r.Role == role, ct);
        if (!dryRun)
        {
            if (emailWillBeMapped) await MapEmailAsync(code, email!, ct);
            if (!has)
            {
                db.Set<RoleAssignment>().Add(new RoleAssignment { EmployeeCode = code, Role = role, GrantedAt = time.GetUtcNow() });
                try { await db.SaveChangesAsync(ct); }
                catch (DbUpdateException)
                {
                    db.ChangeTracker.Clear(); // another writer granted it at the same moment
                    return new LegacyGrantResultDto(code, role, "already", emailWillBeMapped, active, null);
                }
                await audit.LogAsync(RoleAdminService.GrantedAction, "employee", code, new { role, via = "legacy-migration" }, ct);
                sessions.Invalidate(code);
            }
        }
        return new LegacyGrantResultDto(code, role, has ? "already" : "granted", emailWillBeMapped, active,
            active ? null : "Nhân sự chưa ở trạng thái active nên chưa đăng nhập được.");
    }

    private async Task MapEmailAsync(string code, string email, CancellationToken ct)
    {
        var hasAny = await db.Set<EmployeeEmail>().AnyAsync(m => m.EmployeeCode == code, ct);
        db.Set<EmployeeEmail>().Add(new EmployeeEmail
        {
            Email = email, EmployeeCode = code, IsPrimary = !hasAny, Note = "Gắn khi cấp quyền (legacy)", AddedAt = time.GetUtcNow(),
        });
        await db.SaveChangesAsync(ct);
        await audit.LogAsync(EmployeeEmailAuditActions.Added, "employee", code, new { email, via = "legacy-migration" }, ct);
    }

    private static LegacyGrantResultDto Fail(string? code, string role, string outcome, string message, bool active = false) =>
        new(code, role, outcome, false, active, message);
}
