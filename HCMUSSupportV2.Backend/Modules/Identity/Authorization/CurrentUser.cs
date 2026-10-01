using HCMUSSupportV2.Backend.Modules.Identity.Authentication;

namespace HCMUSSupportV2.Backend.Modules.Identity.Authorization;

/// <summary>The signed-in employee of the current request, read from the session principal.</summary>
public interface ICurrentUser
{
    bool IsAuthenticated { get; }

    /// <summary>Employee code (MSCB); null when anonymous.</summary>
    string? Code { get; }

    /// <summary>The roles in the session: always <c>employee</c> when signed in, plus assigned <c>editor</c>/<c>admin</c>.</summary>
    IReadOnlyCollection<string> Roles { get; }

    /// <summary>True for <c>editor</c> and for <c>admin</c> (an admin can do everything an editor can).</summary>
    bool IsEditor { get; }

    /// <summary>True only for <c>admin</c>.</summary>
    bool IsAdmin { get; }

    /// <summary>The code, or throws when anonymous. For code behind an authorization policy.</summary>
    string RequireCode();
}

public class CurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    private System.Security.Claims.ClaimsPrincipal? User => accessor.HttpContext?.User;

    public bool IsAuthenticated => User?.Identity?.IsAuthenticated == true && Code is not null;

    public string? Code => User is null ? null : IdentityClaims.CodeOf(User);

    public IReadOnlyCollection<string> Roles => User is null
        ? []
        : User.FindAll(IdentityClaims.Role).Select(c => c.Value).Distinct().ToArray();

    public bool IsEditor => User is not null && IsAuthenticated && Policies.HasEditorAccess(User);

    public bool IsAdmin => User is not null && IsAuthenticated && Policies.HasAdminAccess(User);

    public string RequireCode() => Code ?? throw new InvalidOperationException("No signed-in employee.");
}
