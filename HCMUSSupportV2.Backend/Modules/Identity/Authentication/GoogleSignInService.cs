using System.Security.Claims;
using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using Microsoft.EntityFrameworkCore;

namespace HCMUSSupportV2.Backend.Modules.Identity.Authentication;

public enum SignInOutcome
{
    Success,

    /// <summary>The id token carries no email, or <c>email_verified</c> is not true.</summary>
    UnverifiedEmail,

    /// <summary>The email is not in <c>employee_emails</c>.</summary>
    NotRegistered,

    /// <summary>The email maps to an employee whose status is not <c>active</c>.</summary>
    Inactive,
}

/// <param name="Outcome">Result of the check.</param>
/// <param name="Principal">The application principal (only on success).</param>
/// <param name="Email">The normalised email from the id token, when present.</param>
/// <param name="EmployeeCode">The mapped MSCB, when the email is registered.</param>
public sealed record SignInResult(SignInOutcome Outcome, ClaimsPrincipal? Principal, string? Email, string? EmployeeCode)
{
    public bool Succeeded => Outcome == SignInOutcome.Success;

    /// <summary>Value of the <c>error</c> query parameter on <c>/login</c>.</summary>
    public string ErrorCode => Outcome switch
    {
        SignInOutcome.NotRegistered => "not_registered",
        SignInOutcome.Inactive => "inactive",
        SignInOutcome.UnverifiedEmail => "unverified_email",
        _ => "",
    };
}

/// <summary>
/// Maps a validated Google id-token principal to an application principal. The OIDC handler has already validated the
/// signature, issuer, audience, nonce and lifetime; this adds the application rules: the email must be verified, be
/// registered in <c>employee_emails</c> and belong to an active employee.
/// </summary>
public class GoogleSignInService(AppDbContext db, PrincipalFactory principals, AdminBootstrapper bootstrapper)
{
    public async Task<SignInResult> EvaluateAsync(ClaimsPrincipal google, CancellationToken ct = default)
    {
        var email = Normalize(FirstValue(google, "email", ClaimTypes.Email));
        var verified = string.Equals(FirstValue(google, "email_verified"), "true", StringComparison.OrdinalIgnoreCase);
        if (email is null || !verified)
            return new SignInResult(SignInOutcome.UnverifiedEmail, null, email, null);

        // employee_emails.email is citext, so the match is case-insensitive.
        var employee = await (
            from m in db.Set<EmployeeEmail>()
            join e in db.Set<Employee>() on m.EmployeeCode equals e.Code
            where m.Email == email
            select e).FirstOrDefaultAsync(ct);
        if (employee is null) return new SignInResult(SignInOutcome.NotRegistered, null, email, null);
        if (!employee.IsActive) return new SignInResult(SignInOutcome.Inactive, null, email, employee.Code);

        // First sign-in of a configured bootstrap email while the system has no admin.
        await bootstrapper.TryGrantForEmailAsync(email, ct);

        var picture = FirstValue(google, "picture");
        if (!string.IsNullOrWhiteSpace(picture) && picture.Length <= 2000 && picture != employee.PhotoUrl)
        {
            employee.PhotoUrl = picture;
            employee.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);
        }

        var principal = await principals.CreateAsync(employee.Code, ct);
        return principal is null
            ? new SignInResult(SignInOutcome.Inactive, null, email, employee.Code)
            : new SignInResult(SignInOutcome.Success, principal, email, employee.Code);
    }

    private static string? FirstValue(ClaimsPrincipal principal, params string[] types)
    {
        foreach (var type in types)
        {
            var value = principal.FindFirst(type)?.Value;
            if (!string.IsNullOrWhiteSpace(value)) return value;
        }
        return null;
    }

    private static string? Normalize(string? email) => string.IsNullOrWhiteSpace(email) ? null : email.Trim().ToLowerInvariant();
}
