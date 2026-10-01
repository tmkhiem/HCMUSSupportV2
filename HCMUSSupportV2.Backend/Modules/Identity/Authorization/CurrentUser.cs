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

    /// <summary>MSCB an admin is viewing as (view-as, see PLAN D14a); null when not acting as anyone.</summary>
    string? ActingAsCode { get; }

    /// <summary>True while an admin is viewing as another employee. Mutations must be rejected in this state.</summary>
    bool IsActingAs { get; }

    /// <summary>
    /// The employee whose own data a "me"-style read should return: <see cref="ActingAsCode"/> when acting as
    /// someone, otherwise <see cref="Code"/>. Use this (not <see cref="Code"/>) for every self-service read.
    /// </summary>
    string? EffectiveCode { get; }

    /// <summary><see cref="EffectiveCode"/>, or throws when anonymous.</summary>
    string RequireEffectiveCode();
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

    public string? ActingAsCode => IsAuthenticated ? User?.FindFirst(IdentityClaims.ActingAs)?.Value : null;

    public bool IsActingAs => ActingAsCode is not null;

    public string? EffectiveCode => ActingAsCode ?? Code;

    public string RequireEffectiveCode() => EffectiveCode ?? throw new InvalidOperationException("No signed-in employee.");
}
