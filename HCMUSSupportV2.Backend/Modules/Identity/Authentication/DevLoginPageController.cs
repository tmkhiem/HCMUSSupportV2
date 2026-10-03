#if DEBUG
using System.Net;
using System.Security.Cryptography;
using System.Text;
using HCMUSSupportV2.Backend.Infrastructure;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

namespace HCMUSSupportV2.Backend.Modules.Identity.Authentication;

/// <summary>
/// Debug builds only (compiled out of Release): <c>/dev-login</c> is a server-rendered MSCB + password form for signing in
/// while debugging from Visual Studio, where the SPA is the production bundle and has no dev-login panel. Besides
/// <c>#if DEBUG</c> it still answers 404 unless the environment is Development and <c>Auth:DevLogin:Enabled</c> is true.
/// The password is hardcoded; this is a stand-in for Google, never a security feature.
/// </summary>
[Route("dev-login")]
[ApiExplorerSettings(IgnoreApi = true)]
[EnableRateLimiting(InfrastructureExtensions.AuthRateLimitPolicy)]
public class DevLoginPageController(
    PrincipalFactory principals,
    LoginRecorder logins,
    IAuditLogger audit,
    IAntiforgery antiforgery,
    IWebHostEnvironment env,
    IOptions<AuthOptions> options) : ControllerBase
{
    private const string DevPassword = "assembler";

    private bool Enabled => env.IsDevelopment() && options.Value.DevLogin.Enabled;

    [HttpGet]
    public IActionResult Form([FromQuery] string? returnUrl = null) =>
        Enabled ? Page(returnUrl, code: null, error: null, StatusCodes.Status200OK) : NotFound();

    [HttpPost]
    public async Task<IActionResult> Submit(
        [FromForm] string? employeeCode, [FromForm] string? password, [FromForm] string? returnUrl, CancellationToken ct)
    {
        if (!Enabled) return NotFound();

        var code = employeeCode?.Trim();
        if (!PasswordMatches(password))
            return Page(returnUrl, code, "Sai mật khẩu.", StatusCodes.Status401Unauthorized);

        var principal = string.IsNullOrEmpty(code) ? null : await principals.CreateAsync(code, ct);
        if (principal is null)
            return Page(returnUrl, code, "Không tìm thấy nhân viên đang hoạt động với mã này.", StatusCodes.Status400BadRequest);

        await HttpContext.SignInAsync(AuthSchemes.Cookie, principal);
        HttpContext.User = principal;
        await logins.RecordAsync(IdentityClaims.CodeOf(principal)!, ct);
        await audit.LogAsync(AuthAuditActions.DevLogin, "employee", IdentityClaims.CodeOf(principal)!, new { method = "dev-password" }, ct);

        XsrfTokens.Issue(HttpContext, antiforgery, env);
        return Redirect(AuthController.SafeReturnUrl(returnUrl));
    }

    private static bool PasswordMatches(string? password) =>
        CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(password ?? ""), Encoding.UTF8.GetBytes(DevPassword));

    private ContentResult Page(string? returnUrl, string? code, string? error, int status)
    {
        static string E(string? s) => WebUtility.HtmlEncode(s ?? "");
        var alert = error is null ? "" : $"<p role=\"alert\" style=\"color:#b3261e\">{E(error)}</p>";
        var html = $$"""
            <!doctype html>
            <html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
            <title>Dev login</title>
            <style>body{font-family:system-ui,sans-serif;max-width:22rem;margin:4rem auto;padding:0 1rem}
            label{display:block;margin:.75rem 0 .25rem}input,button{width:100%;padding:.5rem;box-sizing:border-box}button{margin-top:1rem}</style>
            </head><body>
            <h1>Đăng nhập thử (Debug)</h1>
            {{alert}}
            <form method="post" action="/dev-login" data-testid="dev-login-page">
              <input type="hidden" name="returnUrl" value="{{E(returnUrl)}}">
              <label for="employeeCode">MSCB</label>
              <input id="employeeCode" name="employeeCode" value="{{E(code)}}" autocomplete="off" autofocus required>
              <label for="password">Mật khẩu</label>
              <input id="password" name="password" type="password" autocomplete="off" required>
              <button type="submit">Đăng nhập</button>
            </form>
            </body></html>
            """;
        return new ContentResult { Content = html, ContentType = "text/html; charset=utf-8", StatusCode = status };
    }
}
#endif
