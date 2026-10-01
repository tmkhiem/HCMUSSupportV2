using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using Microsoft.AspNetCore.Mvc;

namespace HCMUSSupportV2.Backend.Modules.Admin.ViewAs;

/// <summary>
/// While an admin is viewing as someone else (<see cref="ICurrentUser.IsActingAs"/>) the session is read-only:
/// every unsafe request (POST, PUT, PATCH, DELETE) under <c>/api</c> is answered with 403, except
/// <c>DELETE /api/admin/view-as</c> (stop) and <c>POST /api/auth/logout</c>. Reads of the viewed employee's own data
/// (<see cref="AuditedReadPrefixes"/>) are written to the audit log as <c>viewas.read</c> (path and query only).
/// </summary>
public class ViewAsReadOnlyMiddleware(RequestDelegate next)
{
    /// <summary>GETs under these prefixes are audited while acting; add a prefix to audit another area.</summary>
    public static readonly string[] AuditedReadPrefixes = ["/api/me", "/api/notifications"];

    public async Task InvokeAsync(HttpContext context, ICurrentUser user, IAuditLogger audit)
    {
        if (context.Request.Path.StartsWithSegments("/api") && user.IsActingAs)
        {
            var method = context.Request.Method;
            if (IsSafe(method))
            {
                if (HttpMethods.IsGet(method) && AuditedReadPrefixes.Any(p => context.Request.Path.StartsWithSegments(p)))
                    await audit.LogAsync(ViewAsAuditActions.Read, "employee", user.ActingAsCode,
                        new { path = context.Request.Path.Value, query = context.Request.QueryString.Value },
                        context.RequestAborted);
            }
            else if (!IsAllowedWhileActing(context.Request))
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                await context.Response.WriteAsJsonAsync(new ProblemDetails
                {
                    Status = StatusCodes.Status403Forbidden,
                    Title = "View-as session is read-only",
                    Detail = "Đang ở chế độ xem thử — không thể thay đổi dữ liệu",
                });
                return;
            }
        }

        await next(context);
    }

    private static bool IsSafe(string method) =>
        HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method) || HttpMethods.IsTrace(method);

    private static bool IsAllowedWhileActing(HttpRequest request) =>
        (HttpMethods.IsDelete(request.Method) && request.Path.Equals("/api/admin/view-as", StringComparison.OrdinalIgnoreCase)) ||
        (HttpMethods.IsPost(request.Method) && request.Path.Equals("/api/auth/logout", StringComparison.OrdinalIgnoreCase));
}
