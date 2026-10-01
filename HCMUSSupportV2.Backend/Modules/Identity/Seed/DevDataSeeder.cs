using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using Microsoft.EntityFrameworkCore;

namespace HCMUSSupportV2.Backend.Modules.Identity.Seed;

/// <summary>
/// Development-only synthetic roster so every agent can dev-login: employees <c>T0001</c>..<c>T0010</c> with the email
/// <c>t0001@dev.hcmus.local</c> etc., <c>T0001</c> admin, <c>T0002</c> editor, all in one synthetic unit.
/// Idempotent: only missing rows are added, existing rows are left alone. Synthetic data only.
/// </summary>
public class DevDataSeeder(AppDbContext db, ILogger<DevDataSeeder> logger)
{
    public const string AdminCode = "T0001";
    public const string EditorCode = "T0002";
    public const string EmailDomain = "dev.hcmus.local";
    public const int Count = 10;

    /// <summary>HRM ids are positive, so a negative id cannot collide with a synced unit.</summary>
    private const int SyntheticUnitHrmId = -1;

    public static string CodeOf(int n) => $"T{n:0000}";

    public static string EmailOf(int n) => $"t{n:0000}@{EmailDomain}";

    public async Task SeedAsync(CancellationToken ct = default)
    {
        var unit = await db.Set<OrgUnit>().FirstOrDefaultAsync(u => u.HrmId == SyntheticUnitHrmId, ct);
        if (unit is null)
        {
            unit = new OrgUnit { HrmId = SyntheticUnitHrmId, Kind = OrgUnitKinds.Unit, Name = "Đơn vị thử nghiệm", Code = "DEV" };
            db.Set<OrgUnit>().Add(unit);
            await db.SaveChangesAsync(ct);
        }

        var added = 0;
        for (var n = 1; n <= Count; n++)
        {
            var code = CodeOf(n);
            if (await db.Set<Employee>().AnyAsync(e => e.Code == code, ct)) continue;

            db.Set<Employee>().Add(new Employee
            {
                Code = code,
                FullName = $"Nhân viên Thử nghiệm {n:00}",
                OrgUnitId = unit.Id,
                PositionTitle = "Chuyên viên",
                Status = EmployeeStatuses.Active,
                Source = EmployeeSources.Manual,
            });
            await db.SaveChangesAsync(ct); // the FK targets below need the employee row
            db.Set<EmployeeEmail>().Add(new EmployeeEmail { Email = EmailOf(n), EmployeeCode = code, IsPrimary = true, Note = "dev seed" });
            if (code == AdminCode) db.Set<RoleAssignment>().Add(new RoleAssignment { EmployeeCode = code, Role = Roles.Admin });
            if (code == EditorCode) db.Set<RoleAssignment>().Add(new RoleAssignment { EmployeeCode = code, Role = Roles.Editor });
            await db.SaveChangesAsync(ct);
            added++;
        }

        if (added > 0) logger.LogInformation("Dev seed: added {Count} synthetic employees ({First}..{Last}).", added, CodeOf(1), CodeOf(Count));
    }
}
