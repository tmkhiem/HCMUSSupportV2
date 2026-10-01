using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;

namespace HCMUSSupportV2.Backend.Tests.Infrastructure;

/// <summary>Helpers that create synthetic employees and drive the cookie session. Synthetic data only.</summary>
public static class IdentityTestSupport
{
    public static readonly Uri BaseAddress = new("https://localhost");

    /// <summary>Settings for a Development host with dev-login switched on.</summary>
    public static Dictionary<string, string?> DevLoginSettings => new() { ["Auth:DevLogin:Enabled"] = "true" };

    public static TestApiFactory CreateDevFactory(PostgresFixture database, Action<Microsoft.Extensions.DependencyInjection.IServiceCollection>? configure = null) =>
        new(database, DevLoginSettings, configure, environment: "Development");

    /// <summary>Creates an employee (and its emails and roles) with a unique code; returns the code.</summary>
    public static async Task<string> CreateEmployeeAsync(
        TestApiFactory factory,
        string status = EmployeeStatuses.Active,
        string[]? emails = null,
        string[]? roles = null,
        string? fullName = null,
        string? code = null)
    {
        code ??= "X" + Guid.NewGuid().ToString("N")[..10].ToUpperInvariant();
        emails ??= [DefaultEmail(code)];
        await factory.WithDbAsync(async db =>
        {
            db.Set<Employee>().Add(new Employee { Code = code, FullName = fullName ?? $"Người dùng {code}", Status = status });
            await db.SaveChangesAsync();
            for (var i = 0; i < emails.Length; i++)
                db.Set<EmployeeEmail>().Add(new EmployeeEmail { Email = emails[i], EmployeeCode = code, IsPrimary = i == 0 });
            foreach (var role in roles ?? [])
                db.Set<RoleAssignment>().Add(new RoleAssignment { EmployeeCode = code, Role = role });
            await db.SaveChangesAsync();
            return 0;
        });
        return code;
    }

    public static string DefaultEmail(string code) => $"{code.ToLowerInvariant()}@test.hcmus.local";

    /// <summary>A principal shaped like the validated Google id token (claim names as in the token, no mapping).</summary>
    public static ClaimsPrincipal GoogleIdToken(string? email, string? emailVerified = "true", string? picture = null, string name = "Google User")
    {
        var claims = new List<Claim> { new("sub", "1234567890"), new("name", name) };
        if (email is not null) claims.Add(new Claim("email", email));
        if (emailVerified is not null) claims.Add(new Claim("email_verified", emailVerified));
        if (picture is not null) claims.Add(new Claim("picture", picture));
        return new ClaimsPrincipal(new ClaimsIdentity(claims, "Google"));
    }

    /// <summary>A client that keeps cookies, talks https (the session cookie is Secure) and never follows redirects.</summary>
    public static HttpClient CreateSessionClient(this TestApiFactory factory) =>
        factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = BaseAddress,
            AllowAutoRedirect = false,
            HandleCookies = true,
        });

    public static async Task<HttpResponseMessage> DevLoginAsync(this HttpClient client, string employeeCode) =>
        await client.PostAsJsonAsync("/api/auth/dev-login", new { employeeCode });

    /// <summary>The XSRF-TOKEN cookie value from a response's Set-Cookie headers.</summary>
    public static string? XsrfToken(this HttpResponseMessage response)
    {
        if (!response.Headers.TryGetValues("Set-Cookie", out var cookies)) return null;
        const string prefix = "XSRF-TOKEN=";
        var cookie = cookies.FirstOrDefault(c => c.StartsWith(prefix, StringComparison.Ordinal));
        return cookie is null ? null : WebUtility.UrlDecode(cookie[prefix.Length..].Split(';')[0]);
    }

    public static HttpRequestMessage WithXsrf(this HttpRequestMessage request, string? token)
    {
        if (token is not null) request.Headers.Add("X-XSRF-TOKEN", token);
        return request;
    }
}
