using System.Security.Claims;

namespace HCMUSSupportV2.Backend.Modules.Identity.Authentication;

/// <summary>Names of the claims in the application principal (the session cookie) and of the auth schemes.</summary>
public static class IdentityClaims
{
    /// <summary>Employee code (MSCB). Same name the audit logger reads.</summary>
    public const string Code = "code";

    public const string Name = "name";
    public const string Role = "role";
    public const string Picture = "picture";

    /// <summary>MSCB of the employee an admin is viewing as (view-as, read-only). Absent when not acting as anyone.</summary>
    public const string ActingAs = "acting_as";

    /// <summary>Unix seconds at which the view-as session ends (D14a). Present whenever <see cref="ActingAs"/> is.</summary>
    public const string ActingAsUntil = "acting_as_until";

    /// <summary>Unix seconds of the last time the principal was checked against the database.</summary>
    public const string CheckedAt = "chk";

    public const string AuthenticationType = "hcmus";

    public static string? CodeOf(ClaimsPrincipal user) => user.FindFirst(Code)?.Value;
}

public static class AuthSchemes
{
    public const string Cookie = "Cookies";
    public const string Google = "Google";

    /// <summary>Cookie name in production: the <c>__Host-</c> prefix needs Secure, Path=/ and no Domain.</summary>
    public const string ProductionCookieName = "__Host-hcmus";

    /// <summary>Development over plain http cannot use <c>__Host-</c> (it requires Secure).</summary>
    public const string DevelopmentCookieName = "hcmus";

    public const string ProductionAntiforgeryCookieName = "__Host-hcmus-af";
    public const string DevelopmentAntiforgeryCookieName = "hcmus-af";

    /// <summary>JS-readable cookie carrying the antiforgery request token; echo it in <see cref="XsrfHeaderName"/>.</summary>
    public const string XsrfCookieName = "XSRF-TOKEN";

    public const string XsrfHeaderName = "X-XSRF-TOKEN";
}
