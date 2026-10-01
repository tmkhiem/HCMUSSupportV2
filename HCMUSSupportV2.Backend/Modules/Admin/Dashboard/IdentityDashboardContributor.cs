using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Identity.Authentication;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using Microsoft.EntityFrameworkCore;

namespace HCMUSSupportV2.Backend.Modules.Admin.Dashboard;

/// <summary>People and access tiles: active employees, mapped emails, editors, admins and recent sign-ins.</summary>
public class IdentityDashboardContributor(AppDbContext db, TimeProvider time) : IDashboardContributor
{
    public async Task<IEnumerable<DashboardTile>> GetTilesAsync(CancellationToken ct)
    {
        var active = db.Set<Employee>().AsNoTracking().Where(e => e.Status == EmployeeStatuses.Active);
        var emails = db.Set<EmployeeEmail>().AsNoTracking();
        var assignments = db.Set<RoleAssignment>().AsNoTracking();

        var total = await active.CountAsync(ct);
        var withEmail = await active.CountAsync(e => emails.Any(m => m.EmployeeCode == e.Code), ct);
        var editors = await (from r in assignments where r.Role == Roles.Editor
                             join e in active on r.EmployeeCode equals e.Code select r).CountAsync(ct);
        var admins = await (from r in assignments where r.Role == Roles.Admin
                            join e in active on r.EmployeeCode equals e.Code select r).CountAsync(ct);
        var since = time.GetUtcNow().AddDays(-7);
        var signedIn = await db.Set<AuditLogEntry>().AsNoTracking()
            .Where(x => x.Action == AuthAuditActions.Login && x.At >= since && x.ActorCode != null)
            .Select(x => x.ActorCode).Distinct().CountAsync(ct);

        var missing = total - withEmail;
        return
        [
            new DashboardTile("identity.employees.active", "Nhân sự đang hoạt động", total,
                "Số cán bộ có trạng thái đang hoạt động."),
            new DashboardTile("identity.employees.with_email", "Nhân sự đã có email", withEmail,
                missing > 0 ? $"{missing} nhân sự đang hoạt động chưa có email nên chưa đăng nhập được." : "Mọi nhân sự đều đã có email.",
                missing > 0 ? TileSeverity.Warning : TileSeverity.Success),
            new DashboardTile("identity.roles.editors", "Biên tập viên", editors, "Số người có vai trò editor."),
            new DashboardTile("identity.roles.admins", "Quản trị viên", admins,
                admins == 0 ? "Hệ thống chưa có quản trị viên." : admins == 1 ? "Chỉ có một quản trị viên." : "Số người có vai trò admin.",
                admins == 0 ? TileSeverity.Danger : admins == 1 ? TileSeverity.Warning : TileSeverity.Info),
            new DashboardTile("identity.signins.7d", "Đăng nhập trong 7 ngày", signedIn,
                "Số người khác nhau đã đăng nhập bằng Google trong 7 ngày qua."),
        ];
    }
}
