using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.Extensions.Options;

namespace HCMUSSupportV2.Backend.Modules.Identity.Authentication;

/// <summary>Audit action names written by the authentication flow.</summary>
public static class AuthAuditActions
{
    public const string Login = "auth.login";
    public const string Denied = "auth.denied";
    public const string Logout = "auth.logout";
    public const string DevLogin = "auth.dev_login";
}

/// <summary>Event handlers for the Google OIDC scheme. Public so tests can drive them with crafted contexts.</summary>
public static class GoogleOidcEvents
{
    public const string LoginPath = "/login";

    /// <summary>
    /// Runs after the OIDC handler validated the id token (signature, issuer, audience, nonce, lifetime). Replaces the
    /// Google principal with the application principal, or redirects to <c>/login?error=...</c> and stops the flow.
    /// No Google token is kept: <c>SaveTokens</c> is off, so only the application principal reaches the cookie.
    /// </summary>
    public static async Task OnTokenValidated(TokenValidatedContext context)
    {
        var http = context.HttpContext;
        var ct = http.RequestAborted;
        var signIn = http.RequestServices.GetRequiredService<GoogleSignInService>();
        var audit = http.RequestServices.GetRequiredService<IAuditLogger>();

        var result = await signIn.EvaluateAsync(context.Principal!, ct);
        if (result.Succeeded)
        {
            context.Principal = result.Principal;
            http.User = result.Principal!; // so the audit record carries the actor
            await audit.LogAsync(AuthAuditActions.Login, "employee", result.EmployeeCode,
                new { method = "google", email = result.Email }, ct);
            return;
        }

        await audit.LogAsync(AuthAuditActions.Denied, "employee", result.EmployeeCode,
            new { method = "google", reason = result.ErrorCode, email = result.Email }, ct);
        RedirectToLogin(context, result.ErrorCode);
    }

    public static async Task OnRemoteFailure(RemoteFailureContext context)
    {
        var audit = context.HttpContext.RequestServices.GetRequiredService<IAuditLogger>();
        // Only the failure type, never the message: protocol errors can echo request parameters.
        await audit.LogAsync(AuthAuditActions.Denied, null, null,
            new { method = "google", reason = "oauth_failed", error = context.Failure?.GetType().Name }, context.HttpContext.RequestAborted);
        context.Response.Redirect($"{LoginPath}?error=oauth_failed");
        context.HandleResponse();
    }

    public static Task OnAccessDenied(AccessDeniedContext context)
    {
        context.Response.Redirect($"{LoginPath}?error=access_denied");
        context.HandleResponse();
        return Task.CompletedTask;
    }

    /// <summary>Always show the account chooser: staff may hold several HCMUS Google accounts.</summary>
    public static Task OnRedirectToIdentityProvider(RedirectContext context)
    {
        context.ProtocolMessage.Prompt = "select_account";
        return Task.CompletedTask;
    }

    private static void RedirectToLogin(TokenValidatedContext context, string error)
    {
        context.Response.Redirect($"{LoginPath}?error={Uri.EscapeDataString(error)}");
        context.HandleResponse();
    }
}

/// <summary>Event handlers for the session cookie.</summary>
public static class SessionCookieEvents
{
    /// <summary>
    /// Re-checks the principal against the database at most every <c>Auth:RevalidateSeconds</c>: a deactivated employee
    /// is signed out, and role changes take effect without a new sign-in. <see cref="SessionInvalidator"/> forces an
    /// earlier re-check after an admin changes roles or status; an expired view-as session is dropped here too.
    /// </summary>
    public static async Task ValidatePrincipal(CookieValidatePrincipalContext context)
    {
        var services = context.HttpContext.RequestServices;
        var options = services.GetRequiredService<IOptions<AuthOptions>>().Value;
        var time = services.GetRequiredService<TimeProvider>();

        var principals = services.GetRequiredService<PrincipalFactory>();
        var invalidator = services.GetRequiredService<SessionInvalidator>();

        // A view-as session ends on its own after its expiry (D14a), whatever the revalidation interval.
        if (context.Principal is { } current && current.HasClaim(c => c.Type == IdentityClaims.ActingAs) &&
            principals.IsViewAsExpired(current))
        {
            context.ReplacePrincipal(PrincipalFactory.WithoutActingAs(current));
            context.ShouldRenew = true;
        }

        var code = context.Principal is null ? null : IdentityClaims.CodeOf(context.Principal);
        if (options.RevalidateSeconds > 0 &&
            long.TryParse(context.Principal?.FindFirst(IdentityClaims.CheckedAt)?.Value, out var checkedAt) &&
            time.GetUtcNow().ToUnixTimeSeconds() - checkedAt < options.RevalidateSeconds &&
            !(code is not null && invalidator.IsStale(code, checkedAt)))
            return;

        var fresh = context.Principal is null
            ? null
            : await principals.RefreshAsync(context.Principal, context.HttpContext.RequestAborted);
        if (fresh is null)
        {
            context.RejectPrincipal();
            await context.HttpContext.SignOutAsync(AuthSchemes.Cookie);
            return;
        }

        context.ReplacePrincipal(fresh);
        context.ShouldRenew = true;
    }

    /// <summary>The API never redirects to a login page: anonymous requests get 401.</summary>
    public static Task RedirectToLogin(RedirectContext<CookieAuthenticationOptions> context)
    {
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        return Task.CompletedTask;
    }

    public static Task RedirectToAccessDenied(RedirectContext<CookieAuthenticationOptions> context)
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        return Task.CompletedTask;
    }
}
