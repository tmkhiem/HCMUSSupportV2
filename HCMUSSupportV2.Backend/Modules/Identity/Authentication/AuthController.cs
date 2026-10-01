using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Infrastructure;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace HCMUSSupportV2.Backend.Modules.Identity.Authentication;

/// <summary>Employee the admin is viewing the portal as (view-as, D14a). Always null until that lands.</summary>
public record ActingAsDto(string Code, string FullName);

/// <summary>The signed-in employee. <c>Roles</c> always contains <c>employee</c>; an admin also has every editor right.</summary>
public record MeDto(
    string Code,
    string FullName,
    string? Unit,
    string? PhotoUrl,
    IReadOnlyList<string> Emails,
    IReadOnlyList<string> Roles,
    ActingAsDto? ActingAs);

public record DevLoginRequest(string EmployeeCode);

[ApiController]
[Route("api/auth")]
[EnableRateLimiting(InfrastructureExtensions.AuthRateLimitPolicy)]
public class AuthController(
    AppDbContext db,
    PrincipalFactory principals,
    IAuditLogger audit,
    IAntiforgery antiforgery,
    IWebHostEnvironment env,
    IOptions<AuthOptions> options) : ControllerBase
{
    /// <summary>
    /// Starts the Google sign-in (redirects to Google, which returns to <c>/api/auth/callback</c>). On success the
    /// browser lands on <paramref name="returnUrl"/> (local paths only, default <c>/</c>); on failure on
    /// <c>/login?error=not_registered|inactive|unverified_email|oauth_failed|access_denied</c>.
    /// </summary>
    [HttpGet("login")]
    [ProducesResponseType(StatusCodes.Status302Found)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public IActionResult Login([FromQuery] string? returnUrl = null)
    {
        if (!options.Value.Google.IsConfigured)
            return Problem(
                title: "Google sign-in is not configured",
                detail: "Đăng nhập bằng Google chưa được cấu hình (Auth:Google:ClientId/ClientSecret).",
                statusCode: StatusCodes.Status503ServiceUnavailable);

        var properties = new AuthenticationProperties { RedirectUri = SafeReturnUrl(returnUrl) };
        return Challenge(properties, AuthSchemes.Google);
    }

    /// <summary>Ends the session. Requires the antiforgery header when a session exists.</summary>
    [HttpPost("logout")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Logout(CancellationToken ct)
    {
        var code = IdentityClaims.CodeOf(User);
        if (code is not null) await audit.LogAsync(AuthAuditActions.Logout, "employee", code, null, ct);
        await HttpContext.SignOutAsync(AuthSchemes.Cookie);
        XsrfTokens.Clear(HttpContext);
        return NoContent();
    }

    /// <summary>
    /// The signed-in employee (fresh from the database). 401 when anonymous. Every successful call also (re)issues the
    /// <c>XSRF-TOKEN</c> cookie, so the SPA calls this on load and after signing in.
    /// </summary>
    [HttpGet("me")]
    [DisableRateLimiting]
    [Authorize(Policy = Policies.Employee)]
    [ProducesResponseType<MeDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Me(CancellationToken ct)
    {
        var me = await BuildMeAsync(IdentityClaims.CodeOf(User)!, ct);
        if (me is null)
        {
            await HttpContext.SignOutAsync(AuthSchemes.Cookie);
            return Unauthorized();
        }

        XsrfTokens.Issue(HttpContext, antiforgery, env);
        return Ok(me);
    }

    /// <summary>
    /// Development only: signs in as an existing active employee without Google. Answers 404 unless the environment is
    /// Development and <c>Auth:DevLogin:Enabled</c> is true. Exempt from antiforgery; returns the same body as <c>me</c>.
    /// </summary>
    [HttpPost("dev-login")]
    [ProducesResponseType<MeDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DevLogin([FromBody] DevLoginRequest request, CancellationToken ct)
    {
        if (!env.IsDevelopment() || !options.Value.DevLogin.Enabled) return NotFound();

        var principal = string.IsNullOrWhiteSpace(request.EmployeeCode)
            ? null
            : await principals.CreateAsync(request.EmployeeCode.Trim(), ct);
        if (principal is null)
            return Problem(title: "Unknown or inactive employee",
                detail: "Không tìm thấy nhân viên đang hoạt động với mã này.", statusCode: StatusCodes.Status400BadRequest);

        await HttpContext.SignInAsync(AuthSchemes.Cookie, principal);
        HttpContext.User = principal;
        var code = IdentityClaims.CodeOf(principal)!;
        await audit.LogAsync(AuthAuditActions.DevLogin, "employee", code, new { method = "dev" }, ct);

        XsrfTokens.Issue(HttpContext, antiforgery, env);
        return Ok(await BuildMeAsync(code, ct));
    }

    private async Task<MeDto?> BuildMeAsync(string code, CancellationToken ct)
    {
        var employee = await (
            from e in db.Set<Employee>().AsNoTracking()
            join u in db.Set<OrgUnit>().AsNoTracking() on e.OrgUnitId equals u.Id into units
            from u in units.DefaultIfEmpty()
            where e.Code == code
            select new { e.Code, e.FullName, e.PhotoUrl, e.Status, Unit = u != null ? u.Name : null }).FirstOrDefaultAsync(ct);
        if (employee is null || employee.Status != EmployeeStatuses.Active) return null;

        var emails = await db.Set<EmployeeEmail>().AsNoTracking()
            .Where(m => m.EmployeeCode == code)
            .OrderByDescending(m => m.IsPrimary).ThenBy(m => m.Email)
            .Select(m => m.Email)
            .ToListAsync(ct);
        var roles = User.FindAll(IdentityClaims.Role).Select(c => c.Value).Distinct()
            .OrderBy(r => r == Roles.Employee ? 0 : r == Roles.Editor ? 1 : 2).ToList();

        return new MeDto(employee.Code, employee.FullName, employee.Unit, employee.PhotoUrl, emails, roles, ActingAs: null);
    }

    /// <summary>Only same-site paths are allowed: "/x" is fine; "//host", "/\host" and absolute URLs are not.</summary>
    public static string SafeReturnUrl(string? returnUrl) =>
        !string.IsNullOrEmpty(returnUrl) && returnUrl[0] == '/' && !returnUrl.Any(char.IsControl) &&
        (returnUrl.Length == 1 || (returnUrl[1] != '/' && returnUrl[1] != '\\'))
            ? returnUrl
            : "/";
}
