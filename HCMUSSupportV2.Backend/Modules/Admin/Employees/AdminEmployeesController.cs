using System.Text.RegularExpressions;
using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Admin.Common;
using HCMUSSupportV2.Backend.Modules.Admin.RoleGrants;
using HCMUSSupportV2.Backend.Modules.Identity.Authentication;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Modules.Identity.Groups;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HCMUSSupportV2.Backend.Modules.Admin.Employees;

public record SetStatusRequest(string Status);

public record CreateEmployeeRequest(string Code, string FullName, long? OrgUnitId = null);

public record AdminEmployeeDto(string Code, string FullName, string Status, string Source, long? OrgUnitId);

public static class EmployeeAuditActions
{
    public const string StatusChanged = "employee.status_changed";
    public const string Created = "employee.created";
}

/// <summary>Employee status and manual employees (admin only).</summary>
[ApiController]
[Route("api/admin/employees")]
[Authorize(Policy = Policies.ManageEmployees)]
public partial class AdminEmployeesController(
    AppDbContext db,
    ICurrentUser user,
    LastAdminGuard guard,
    IAuditLogger audit,
    SessionInvalidator sessions,
    IEnumerable<IEmployeeActivationObserver> activationObservers,
    TimeProvider time) : ControllerBase
{
    [GeneratedRegex("^[A-Za-z0-9._-]{1,50}$")]
    private static partial Regex CodePattern();

    /// <summary>
    /// Sets the status (<c>active</c>, <c>inactive</c>, <c>retired</c>). 409 when it would deactivate yourself or the
    /// last active admin. Becoming active notifies the registered <see cref="IEmployeeActivationObserver"/>s.
    /// </summary>
    [HttpPut("{code}/status")]
    [ProducesResponseType<AdminEmployeeDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> SetStatus(string code, [FromBody] SetStatusRequest request, CancellationToken ct)
    {
        var status = request.Status?.Trim().ToLowerInvariant();
        if (status is not (EmployeeStatuses.Active or EmployeeStatuses.Inactive or EmployeeStatuses.Retired))
            return Problem(title: "Invalid status", detail: "Trạng thái không hợp lệ (active, inactive hoặc retired).",
                statusCode: StatusCodes.Status400BadRequest);
        if (status != EmployeeStatuses.Active && code == user.Code)
            return Problem(title: "Cannot deactivate yourself", detail: "Không thể tự vô hiệu hóa tài khoản của chính mình.",
                statusCode: StatusCodes.Status409Conflict);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlAsync($"SELECT pg_advisory_xact_lock({RoleAdminService.AdminChangeLockKey})", ct);

        var employee = await db.Set<Employee>().FirstOrDefaultAsync(e => e.Code == code, ct);
        if (employee is null) return NotFound();

        var previous = employee.Status;
        if (previous != status)
        {
            if (status != EmployeeStatuses.Active && await guard.IsLastAdminAsync(code, ct))
                return Problem(title: "Cannot deactivate the last admin",
                    detail: "Không thể vô hiệu hóa quản trị viên cuối cùng của hệ thống.", statusCode: StatusCodes.Status409Conflict);

            employee.Status = status;
            employee.UpdatedAt = time.GetUtcNow();
            await db.SaveChangesAsync(ct);
        }

        await tx.CommitAsync(ct);

        if (previous != status)
        {
            await audit.LogAsync(EmployeeAuditActions.StatusChanged, "employee", code, new { from = previous, to = status }, ct);
            sessions.Invalidate(code);
            if (status == EmployeeStatuses.Active)
                foreach (var observer in activationObservers)
                    await observer.OnEmployeesActivatedAsync([code], ct);
        }

        return Ok(ToDto(employee));
    }

    /// <summary>Creates a manual employee (source <c>manual</c>, status <c>active</c>). 409 when the code exists.</summary>
    [HttpPost]
    [ProducesResponseType<AdminEmployeeDto>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Create([FromBody] CreateEmployeeRequest request, CancellationToken ct)
    {
        var code = request.Code?.Trim() ?? "";
        var fullName = request.FullName?.Trim() ?? "";
        if (!CodePattern().IsMatch(code))
            return Problem(title: "Invalid code", detail: "Mã cán bộ chỉ gồm chữ, số, dấu chấm, gạch ngang hoặc gạch dưới (tối đa 50 ký tự).",
                statusCode: StatusCodes.Status400BadRequest);
        if (fullName.Length is 0 or > 300)
            return Problem(title: "Invalid name", detail: "Họ tên là bắt buộc (tối đa 300 ký tự).", statusCode: StatusCodes.Status400BadRequest);
        if (request.OrgUnitId is { } unitId && !await db.Set<OrgUnit>().AnyAsync(u => u.Id == unitId, ct))
            return Problem(title: "Unknown org unit", detail: "Đơn vị không tồn tại.", statusCode: StatusCodes.Status400BadRequest);

        var pattern = AdminQuery.EscapeLike(code);
        if (await db.Set<Employee>().AnyAsync(e => EF.Functions.ILike(e.Code, pattern, "\\"), ct))
            return Conflict(code);

        var now = time.GetUtcNow();
        var employee = new Employee
        {
            Code = code, FullName = fullName, OrgUnitId = request.OrgUnitId, Status = EmployeeStatuses.Active,
            Source = EmployeeSources.Manual, CreatedAt = now, UpdatedAt = now,
        };
        db.Set<Employee>().Add(employee);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            db.ChangeTracker.Clear();
            return Conflict(code);
        }

        await audit.LogAsync(EmployeeAuditActions.Created, "employee", code, new { source = EmployeeSources.Manual }, ct);
        return Created($"/api/admin/roles/{code}", ToDto(employee));
    }

    private ObjectResult Conflict(string code) =>
        Problem(title: "Employee code exists", detail: $"Mã cán bộ {code} đã tồn tại.", statusCode: StatusCodes.Status409Conflict);

    private static AdminEmployeeDto ToDto(Employee e) => new(e.Code, e.FullName, e.Status, e.Source, e.OrgUnitId);
}
