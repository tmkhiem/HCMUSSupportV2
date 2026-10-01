using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Identity.Authentication;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace HCMUSSupportV2.Backend.Modules.Admin.ViewAs;

/// <summary>Bound from <c>Admin:ViewAs</c>.</summary>
public class ViewAsOptions
{
    public const string SectionName = "Admin:ViewAs";

    /// <summary>A view-as session ends by itself after this many minutes.</summary>
    public int Minutes { get; set; } = 60;
}

public record StartViewAsRequest(string EmployeeCode);

/// <summary>The view-as session that was started; <c>ExpiresAt</c> is when it ends on its own.</summary>
public record ViewAsDto(string Code, string FullName, DateTimeOffset ExpiresAt);

public static class ViewAsAuditActions
{
    public const string Started = "viewas.started";
    public const string Stopped = "viewas.stopped";
    public const string Read = "viewas.read";
}

/// <summary>
/// View-as: an admin sees the portal as another employee, read-only. Starting and stopping re-issues the session
/// cookie with or without the <c>acting_as</c> claim; <see cref="ViewAsReadOnlyMiddleware"/> enforces read-only.
/// </summary>
[ApiController]
[Route("api/admin/view-as")]
[Authorize(Policy = Policies.ViewAs)]
public class ViewAsController(
    AppDbContext db,
    PrincipalFactory principals,
    IAuditLogger audit,
    ICurrentUser user,
    IAntiforgery antiforgery,
    IWebHostEnvironment env,
    IOptions<ViewAsOptions> options,
    TimeProvider time) : ControllerBase
{
    /// <summary>
    /// Starts viewing as an existing employee (any status, not yourself). Re-issues the session cookie with the
    /// <c>acting_as</c> claim; call <c>GET /api/auth/me</c> afterwards. 404 for an unknown employee, 400 for yourself.
    /// </summary>
    [HttpPost]
    [ProducesResponseType<ViewAsDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Start([FromBody] StartViewAsRequest request, CancellationToken ct)
    {
        var adminCode = user.RequireCode();
        var target = request.EmployeeCode?.Trim();
        if (string.IsNullOrEmpty(target))
            return Problem(title: "Employee code required", detail: "Cần nhập mã nhân viên.", statusCode: StatusCodes.Status400BadRequest);
        if (target == adminCode)
            return Problem(title: "Cannot view as yourself", detail: "Không thể xem thử chính mình.", statusCode: StatusCodes.Status400BadRequest);

        var employee = await db.Set<Employee>().AsNoTracking()
            .Where(e => e.Code == target).Select(e => new { e.Code, e.FullName }).FirstOrDefaultAsync(ct);
        if (employee is null) return NotFound();

        var admin = await principals.CreateAsync(adminCode, ct);
        if (admin is null) return Unauthorized();

        var until = time.GetUtcNow().AddMinutes(Math.Max(1, options.Value.Minutes));
        await audit.LogAsync(ViewAsAuditActions.Started, "employee", employee.Code,
            new { expiresAt = until }, ct); // logged as the admin, before the claim exists
        var principal = PrincipalFactory.WithActingAs(admin, employee.Code, until);
        await HttpContext.SignInAsync(AuthSchemes.Cookie, principal);
        HttpContext.User = principal;
        XsrfTokens.Issue(HttpContext, antiforgery, env);
        return Ok(new ViewAsDto(employee.Code, employee.FullName, DateTimeOffset.FromUnixTimeSeconds(until.ToUnixTimeSeconds())));
    }

    /// <summary>Stops viewing as someone (allowed while acting; a no-op otherwise). Re-issues the plain admin session.</summary>
    [HttpDelete]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Stop(CancellationToken ct)
    {
        if (!user.IsActingAs) return NoContent();

        await audit.LogAsync(ViewAsAuditActions.Stopped, "employee", user.ActingAsCode, null, ct); // carries acting_as
        var admin = await principals.CreateAsync(user.RequireCode(), ct);
        if (admin is null)
        {
            await HttpContext.SignOutAsync(AuthSchemes.Cookie);
            return Unauthorized();
        }

        await HttpContext.SignInAsync(AuthSchemes.Cookie, admin);
        HttpContext.User = admin;
        return NoContent();
    }
}
