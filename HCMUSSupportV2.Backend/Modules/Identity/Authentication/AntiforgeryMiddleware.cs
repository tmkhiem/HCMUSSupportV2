using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Mvc;

namespace HCMUSSupportV2.Backend.Modules.Identity.Authentication;

/// <summary>
/// Double-submit CSRF protection for the cookie session. Every unsafe request (anything except GET, HEAD, OPTIONS,
/// TRACE) to <c>/api/*</c> that is authenticated by the session cookie must carry the antiforgery request token in the
/// <c>X-XSRF-TOKEN</c> header; the token is delivered in the JS-readable <c>XSRF-TOKEN</c> cookie. Exempt:
/// <c>/api/integration/*</c> (ApiKey, no cookie), <c>/api/auth/callback</c> (Google redirect) and
/// <c>/api/auth/dev-login</c> (Development only, anonymous). Anonymous requests have no session to forge.
/// </summary>
public class AntiforgeryMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, IAntiforgery antiforgery, IWebHostEnvironment env)
    {
        if (context.Request.Path.StartsWithSegments("/api") &&
            context.User.Identity?.IsAuthenticated == true &&
            !IsExempt(context.Request.Path))
        {
            if (IsSafeMethod(context.Request.Method))
            {
                // Hand out the token the first time an authenticated client calls the API.
                if (!context.Request.Cookies.ContainsKey(AuthSchemes.XsrfCookieName))
                    XsrfTokens.Issue(context, antiforgery, env);
            }
            else
            {
                try
                {
                    await antiforgery.ValidateRequestAsync(context);
                }
                catch (AntiforgeryValidationException)
                {
                    context.Response.StatusCode = StatusCodes.Status400BadRequest;
                    await context.Response.WriteAsJsonAsync(new ProblemDetails
                    {
                        Status = StatusCodes.Status400BadRequest,
                        Title = "Antiforgery token missing or invalid",
                        Detail = "Thiếu hoặc sai mã chống giả mạo yêu cầu (X-XSRF-TOKEN). Hãy tải lại trang rồi thử lại.",
                    });
                    return;
                }
            }
        }

        await next(context);
    }

    private static bool IsSafeMethod(string method) =>
        HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method) || HttpMethods.IsTrace(method);

    private static bool IsExempt(PathString path) =>
        path.StartsWithSegments("/api/integration") ||
        path.StartsWithSegments("/api/auth/callback") ||
        path.StartsWithSegments("/api/auth/dev-login");
}

public static class XsrfTokens
{
    private const string IssuedKey = "hcmus.xsrf-issued";

    /// <summary>
    /// Writes the antiforgery cookie token and the JS-readable <c>XSRF-TOKEN</c> cookie for the current
    /// (authenticated) user. The request token is bound to the user's identity, so call it again after the identity
    /// changes (sign-in).
    /// </summary>
    public static void Issue(HttpContext context, IAntiforgery antiforgery, IWebHostEnvironment env)
    {
        if (context.Items.ContainsKey(IssuedKey)) return; // once per request: a second Set-Cookie would be redundant
        context.Items[IssuedKey] = true;

        var tokens = antiforgery.GetAndStoreTokens(context);
        // Plain http is allowed only in Development (the cookie is then non-Secure).
        var secure = !env.IsDevelopment() || context.Request.IsHttps;
        context.Response.Cookies.Append(AuthSchemes.XsrfCookieName, tokens.RequestToken!, new CookieOptions
        {
            HttpOnly = false, // the SPA must read it
            Secure = secure,
            SameSite = SameSiteMode.Lax,
            Path = "/",
            IsEssential = true,
        });
    }

    public static void Clear(HttpContext context) => context.Response.Cookies.Delete(AuthSchemes.XsrfCookieName, new CookieOptions { Path = "/" });
}
