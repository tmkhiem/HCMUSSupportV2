using System.Security.Claims;
using HCMUSSupportV2.Backend.Modules.Identity.Authentication;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using HCMUSSupportV2.Backend.Tests.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using static HCMUSSupportV2.Backend.Tests.Infrastructure.IdentityTestSupport;

namespace HCMUSSupportV2.Backend.Tests.Identity;

/// <summary>The application rules applied after Google's id token has been validated (OnTokenValidated logic).</summary>
[Collection(PostgresCollection.Name)]
public class GoogleSignInTests(PostgresFixture database) : IAsyncLifetime
{
    private readonly TestApiFactory _factory = new(database);

    public Task InitializeAsync()
    {
        _ = _factory.Server;
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    private async Task<SignInResult> EvaluateAsync(ClaimsPrincipal token)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<GoogleSignInService>().EvaluateAsync(token);
    }

    [Fact]
    public async Task Valid_verified_registered_email_of_an_active_employee_signs_in()
    {
        var code = await CreateEmployeeAsync(_factory, roles: [Roles.Editor], fullName: "Nguyễn Thử Một");

        var result = await EvaluateAsync(GoogleIdToken(DefaultEmail(code)));

        Assert.True(result.Succeeded);
        Assert.Equal(code, result.EmployeeCode);
        var principal = result.Principal!;
        Assert.True(principal.Identity!.IsAuthenticated);
        Assert.Equal(code, principal.FindFirst("code")!.Value);
        Assert.Equal("Nguyễn Thử Một", principal.FindFirst("name")!.Value);
        Assert.Equal(["editor", "employee"], principal.FindAll("role").Select(c => c.Value).Order().ToArray());
        Assert.True(principal.IsInRole("editor"));
        Assert.Null(principal.FindFirst("email")); // Google claims are not carried into the session
        Assert.Null(principal.FindFirst("sub"));
    }

    [Fact]
    public async Task Email_matching_is_case_insensitive()
    {
        var code = await CreateEmployeeAsync(_factory, emails: ["mixed.case@test.hcmus.local"]);

        var result = await EvaluateAsync(GoogleIdToken("  Mixed.CASE@Test.HCMUS.local "));

        Assert.True(result.Succeeded);
        Assert.Equal(code, result.EmployeeCode);
    }

    [Fact]
    public async Task Every_email_of_an_employee_maps_to_the_same_mscb()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var emails = new[] { $"a.{suffix}@hcmus.edu.vn", $"a.{suffix}@fit.hcmus.edu.vn", $"a.{suffix}@gmail.com" };
        var code = await CreateEmployeeAsync(_factory, emails: emails);

        foreach (var email in emails)
        {
            var result = await EvaluateAsync(GoogleIdToken(email));
            Assert.True(result.Succeeded, email);
            Assert.Equal(code, result.EmployeeCode);
            Assert.Equal(code, result.Principal!.FindFirst("code")!.Value);
        }
    }

    [Theory]
    [InlineData("false")]
    [InlineData("")]
    [InlineData(null)]
    public async Task Unverified_email_is_rejected_even_when_registered(string? verified)
    {
        var code = await CreateEmployeeAsync(_factory);

        var result = await EvaluateAsync(GoogleIdToken(DefaultEmail(code), emailVerified: verified));

        Assert.Equal(SignInOutcome.UnverifiedEmail, result.Outcome);
        Assert.Equal("unverified_email", result.ErrorCode);
        Assert.Null(result.Principal);
    }

    [Fact]
    public async Task Token_without_an_email_is_rejected()
    {
        var result = await EvaluateAsync(GoogleIdToken(email: null));

        Assert.Equal(SignInOutcome.UnverifiedEmail, result.Outcome);
    }

    [Fact]
    public async Task Unknown_email_is_not_registered()
    {
        var result = await EvaluateAsync(GoogleIdToken($"nobody-{Guid.NewGuid():N}@hcmus.edu.vn"));

        Assert.Equal(SignInOutcome.NotRegistered, result.Outcome);
        Assert.Equal("not_registered", result.ErrorCode);
        Assert.Null(result.EmployeeCode);
    }

    [Theory]
    [InlineData(EmployeeStatuses.Inactive)]
    [InlineData(EmployeeStatuses.Retired)]
    public async Task Employee_who_is_not_active_is_rejected(string status)
    {
        var code = await CreateEmployeeAsync(_factory, status: status);

        var result = await EvaluateAsync(GoogleIdToken(DefaultEmail(code)));

        Assert.Equal(SignInOutcome.Inactive, result.Outcome);
        Assert.Equal("inactive", result.ErrorCode);
        Assert.Equal(code, result.EmployeeCode);
        Assert.Null(result.Principal);
    }

    [Fact]
    public async Task Changed_google_picture_is_stored_as_the_photo_url()
    {
        var code = await CreateEmployeeAsync(_factory);

        var result = await EvaluateAsync(GoogleIdToken(DefaultEmail(code), picture: "https://lh3.example.test/photo-1"));

        Assert.Equal("https://lh3.example.test/photo-1", result.Principal!.FindFirst("picture")!.Value);
        var stored = await _factory.WithDbAsync(db => db.Set<Employee>().AsNoTracking().SingleAsync(e => e.Code == code));
        Assert.Equal("https://lh3.example.test/photo-1", stored.PhotoUrl);
    }

    [Fact]
    public async Task Bootstrap_email_becomes_admin_on_first_sign_in_when_no_admin_exists()
    {
        var email = $"boss-{Guid.NewGuid():N}@test.hcmus.local";
        await using var factory = new TestApiFactory(database, new() { ["Admin:BootstrapEmails:0"] = email });
        _ = factory.Server;
        await ClearAdminsAsync(factory);
        var code = await CreateEmployeeAsync(factory, emails: [email]);

        await using var scope = factory.Services.CreateAsyncScope();
        var result = await scope.ServiceProvider.GetRequiredService<GoogleSignInService>().EvaluateAsync(GoogleIdToken(email));

        Assert.True(result.Succeeded);
        Assert.Contains("admin", result.Principal!.FindAll("role").Select(c => c.Value));
        var roles = await factory.WithDbAsync(db => db.Set<RoleAssignment>().Where(r => r.EmployeeCode == code).Select(r => r.Role).ToListAsync());
        Assert.Equal(["admin"], roles);
    }

    // OnTokenValidated itself: replaces the principal on success, redirects to /login?error=... on failure.

    private async Task<(TokenValidatedContext Context, DefaultHttpContext Http)> RunOnTokenValidatedAsync(ClaimsPrincipal googleToken)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var http = new DefaultHttpContext { RequestServices = scope.ServiceProvider };
        var accessor = _factory.Services.GetRequiredService<IHttpContextAccessor>();
        accessor.HttpContext = http;
        try
        {
            var context = new TokenValidatedContext(
                http,
                new AuthenticationScheme(AuthSchemes.Google, null, typeof(OpenIdConnectHandler)),
                new OpenIdConnectOptions(),
                googleToken,
                new AuthenticationProperties())
            {
                ProtocolMessage = new OpenIdConnectMessage(),
            };
            await GoogleOidcEvents.OnTokenValidated(context);
            return (context, http);
        }
        finally
        {
            accessor.HttpContext = null;
        }
    }

    [Fact]
    public async Task OnTokenValidated_success_swaps_in_the_app_principal_and_audits_the_login()
    {
        var code = await CreateEmployeeAsync(_factory);

        var (context, http) = await RunOnTokenValidatedAsync(GoogleIdToken(DefaultEmail(code)));

        Assert.Null(context.Result); // the OIDC handler carries on and signs in the cookie
        Assert.Equal(code, context.Principal!.FindFirst("code")!.Value);
        Assert.Equal(StatusCodes.Status200OK, http.Response.StatusCode);
        var audit = await _factory.WithDbAsync(db => db.Set<AuditLogEntry>().AsNoTracking()
            .SingleAsync(a => a.Action == "auth.login" && a.TargetId == code));
        Assert.Equal(code, audit.ActorCode);
        Assert.Contains("google", audit.Details);
    }

    [Theory]
    [InlineData("unknown", "not_registered")]
    [InlineData("inactive", "inactive")]
    [InlineData("unverified", "unverified_email")]
    public async Task OnTokenValidated_failure_redirects_to_login_with_the_reason_and_audits_the_denial(string scenario, string error)
    {
        var email = scenario switch
        {
            "unknown" => $"nobody-{Guid.NewGuid():N}@hcmus.edu.vn",
            "inactive" => DefaultEmail(await CreateEmployeeAsync(_factory, status: EmployeeStatuses.Inactive)),
            _ => DefaultEmail(await CreateEmployeeAsync(_factory)),
        };

        var (context, http) = await RunOnTokenValidatedAsync(
            GoogleIdToken(email, emailVerified: scenario == "unverified" ? "false" : "true"));

        Assert.True(context.Result?.Handled);
        Assert.Equal(StatusCodes.Status302Found, http.Response.StatusCode);
        Assert.Equal($"/login?error={error}", http.Response.Headers.Location.ToString());
        var denied = await _factory.WithDbAsync(db => db.Set<AuditLogEntry>().AsNoTracking()
            .Where(a => a.Action == "auth.denied").ToListAsync());
        var row = Assert.Single(denied, a => a.Details!.Contains(email));
        Assert.Contains(error, row.Details);
        Assert.Null(row.ActorCode);
    }

    internal static async Task ClearAdminsAsync(TestApiFactory factory) =>
        await factory.WithDbAsync(async db =>
        {
            await db.Set<RoleAssignment>().Where(r => r.Role == Roles.Admin).ExecuteDeleteAsync();
            return 0;
        });
}
