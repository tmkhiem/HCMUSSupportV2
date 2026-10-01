using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Identity.Authentication;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace HCMUSSupportV2.Backend.Modules.Identity.Authorization;

/// <summary>
/// Seeds the first admin from <c>Admin:BootstrapEmails</c>: while the database has no active admin, a configured email
/// that maps to an active employee receives the <c>admin</c> role. Runs at startup (<see cref="RunAsync"/>) and when a
/// configured email signs in (<see cref="TryGrantForEmailAsync"/>), so a fresh deployment works even if the roster
/// arrives after the first start.
/// </summary>
public class AdminBootstrapper(
    AppDbContext db,
    LastAdminGuard guard,
    IOptions<AdminOptions> options,
    IAuditLogger audit,
    ILogger<AdminBootstrapper> logger)
{
    public const string AuditAction = "roles.bootstrap_admin";

    private string[] Emails => options.Value.BootstrapEmails
        .Where(e => !string.IsNullOrWhiteSpace(e))
        .Select(e => e.Trim())
        .ToArray();

    /// <summary>Grants admin to every configured email that maps to an active employee. Returns the employee codes granted.</summary>
    public async Task<IReadOnlyList<string>> RunAsync(CancellationToken ct = default)
    {
        var granted = new List<string>();
        if (Emails.Length == 0 || await guard.HasActiveAdminAsync(ct)) return granted;

        foreach (var email in Emails)
            if (await TryGrantAsync(email, ct) is { } code) granted.Add(code);
        return granted;
    }

    /// <summary>Grants admin to the employee behind <paramref name="email"/> when it is a bootstrap email and no admin exists.</summary>
    public async Task<bool> TryGrantForEmailAsync(string email, CancellationToken ct = default)
    {
        if (!Emails.Contains(email, StringComparer.OrdinalIgnoreCase)) return false;
        if (await guard.HasActiveAdminAsync(ct)) return false;
        return await TryGrantAsync(email, ct) is not null;
    }

    private async Task<string?> TryGrantAsync(string email, CancellationToken ct)
    {
        var employee = await (
            from m in db.Set<EmployeeEmail>()
            join e in db.Set<Employee>() on m.EmployeeCode equals e.Code
            where m.Email == email && e.Status == EmployeeStatuses.Active
            select e.Code).FirstOrDefaultAsync(ct);
        if (employee is null)
        {
            logger.LogWarning("Admin bootstrap: {Email} does not map to an active employee yet.", email);
            return null;
        }

        db.Set<RoleAssignment>().Add(new RoleAssignment { EmployeeCode = employee, Role = Roles.Admin, GrantedAt = DateTimeOffset.UtcNow });
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Another instance granted it at the same moment.
            db.ChangeTracker.Clear();
            return null;
        }

        logger.LogInformation("Admin bootstrap: granted admin to {EmployeeCode}.", employee);
        await audit.LogAsync(AuditAction, "employee", employee, new { email }, ct);
        return employee;
    }
}
