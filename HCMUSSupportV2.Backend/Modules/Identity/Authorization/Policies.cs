using HCMUSSupportV2.Backend.Modules.Identity.Authentication;
using Microsoft.AspNetCore.Authorization;

namespace HCMUSSupportV2.Backend.Modules.Identity.Authorization;

/// <summary>
/// Named authorization policies (PLAN §4). Controllers say <c>[Authorize(Policy = Policies.Editor)]</c>; the
/// capability-named policies below map each row of the §4 table to one of the three base levels, so a capability can
/// later move to another level (or role) without touching controllers. Other modules add their own policies.
/// </summary>
public static class Policies
{
    /// <summary>Any signed-in employee (every role includes this one).</summary>
    public const string Employee = "Employee";

    /// <summary><c>editor</c> or <c>admin</c>.</summary>
    public const string Editor = "Editor";

    /// <summary><c>admin</c> only.</summary>
    public const string Admin = "Admin";

    // Editor-level capabilities.
    public const string ViewEmployeeDirectory = "ViewEmployeeDirectory";
    public const string ManageEmployeeEmails = "ManageEmployeeEmails";
    public const string ManageNotifications = "ManageNotifications";
    public const string ManageGroups = "ManageGroups";

    // Admin-only capabilities.
    public const string GrantRoles = "GrantRoles";
    public const string ViewAs = "ViewAs";
    public const string ManageEmployees = "ManageEmployees";
    public const string ManageDatasets = "ManageDatasets";
    public const string ManageApiClients = "ManageApiClients";
    public const string ViewAuditLog = "ViewAuditLog";

    private static readonly string[] EditorCapabilities =
        [ViewEmployeeDirectory, ManageEmployeeEmails, ManageNotifications, ManageGroups];

    private static readonly string[] AdminCapabilities =
        [GrantRoles, ViewAs, ManageEmployees, ManageDatasets, ManageApiClients, ViewAuditLog];

    public static void Register(AuthorizationOptions options)
    {
        options.AddPolicy(Employee, p => p.RequireAssertion(ctx => IsSignedIn(ctx.User)));
        options.AddPolicy(Editor, p => p.RequireAssertion(ctx => IsSignedIn(ctx.User) && HasEditorAccess(ctx.User)));
        options.AddPolicy(Admin, p => p.RequireAssertion(ctx => IsSignedIn(ctx.User) && HasAdminAccess(ctx.User)));

        foreach (var name in EditorCapabilities)
            options.AddPolicy(name, p => p.RequireAssertion(ctx => IsSignedIn(ctx.User) && HasEditorAccess(ctx.User)));
        foreach (var name in AdminCapabilities)
            options.AddPolicy(name, p => p.RequireAssertion(ctx => IsSignedIn(ctx.User) && HasAdminAccess(ctx.User)));
    }

    private static bool IsSignedIn(System.Security.Claims.ClaimsPrincipal user) =>
        user.Identity?.IsAuthenticated == true && !string.IsNullOrEmpty(IdentityClaims.CodeOf(user));

    internal static bool HasAdminAccess(System.Security.Claims.ClaimsPrincipal user) =>
        user.HasClaim(IdentityClaims.Role, Roles.Admin);

    /// <summary>Editors and admins (admin includes everything an editor can do).</summary>
    internal static bool HasEditorAccess(System.Security.Claims.ClaimsPrincipal user) =>
        user.HasClaim(IdentityClaims.Role, Roles.Editor) || HasAdminAccess(user);
}
