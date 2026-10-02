using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using HCMUSSupportV2.Backend.Modules.Identity.Authentication;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using HCMUSSupportV2.Backend.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using static HCMUSSupportV2.Backend.Tests.Infrastructure.IdentityTestSupport;

namespace HCMUSSupportV2.Backend.Tests.Identity;

/// <summary>Sign-in state over HTTP: /me, dev-login, logout, the session cookie and its revalidation.</summary>
[Collection(PostgresCollection.Name)]
public class AuthEndpointTests(PostgresFixture database) : IAsyncLifetime
{
    // Development host with dev-login on, and the test-only controllers.
    private readonly TestApiFactory _dev = CreateDevFactory(database, TestControllers.Add);

    // Production-like host (environment "Testing"): __Host- cookie, no dev-login. Signs in through the test controller.
    private readonly TestApiFactory _prod = new(database, configureServices: TestControllers.Add);

    public Task InitializeAsync()
    {
        _ = _dev.Server;
        _ = _prod.Server;
        return Task.CompletedTask;
    }

    public async Task DisposeAsync()
    {
        await _dev.DisposeAsync();
        await _prod.DisposeAsync();
    }

    private static async Task SignInAsync(HttpClient client, string code) =>
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsync($"/api/test/sign-in/{code}", null)).StatusCode);

    [Fact]
    public async Task Development_host_uses_the_test_database_even_though_a_local_settings_file_exists()
    {
        var name = await _dev.WithDbAsync(db => Task.FromResult(db.Database.GetDbConnection().Database));

        Assert.StartsWith("hcmus_support_test_", name);
    }

    [Fact]
    public async Task Me_is_401_for_anonymous_and_never_redirects()
    {
        var response = await _prod.CreateSessionClient().GetAsync("/api/auth/me");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Null(response.Headers.Location);
    }

    [Fact]
    public async Task Dev_login_signs_in_and_me_returns_the_profile()
    {
        long unitId = 0;
        var code = await CreateEmployeeAsync(_dev, roles: [Roles.Editor], fullName: "Trần Thử Hai",
            emails: [$"secondary-{Guid.NewGuid():N}@test.hcmus.local", $"primary-{Guid.NewGuid():N}@test.hcmus.local"]);
        await _dev.WithDbAsync(async db =>
        {
            var unit = new OrgUnit { HrmId = Random.Shared.Next(1000, int.MaxValue), Name = "Khoa Thử nghiệm" };
            db.Set<OrgUnit>().Add(unit);
            await db.SaveChangesAsync();
            unitId = unit.Id;
            var emp = await db.Set<Employee>().SingleAsync(e => e.Code == code);
            emp.OrgUnitId = unit.Id;
            emp.PhotoUrl = "https://photos.example.test/p.png";
            // make the second email the primary one
            var mails = await db.Set<EmployeeEmail>().Where(m => m.EmployeeCode == code).OrderBy(m => m.Email).ToListAsync();
            // two steps: the unique index allows one primary per employee at any moment
            foreach (var m in mails) m.IsPrimary = false;
            await db.SaveChangesAsync();
            foreach (var m in mails) m.IsPrimary = m.Email.StartsWith("primary-");
            await db.SaveChangesAsync();
            return 0;
        });
        var client = _dev.CreateSessionClient();

        var login = await client.DevLoginAsync(code);

        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        Assert.NotNull(login.XsrfToken());
        var me = await client.GetFromJsonAsync<MeDto>("/api/auth/me", new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.NotNull(me);
        Assert.Equal(code, me.Code);
        Assert.Equal("Trần Thử Hai", me.FullName);
        Assert.Equal("Khoa Thử nghiệm", me.Unit);
        Assert.Equal("https://photos.example.test/p.png", me.PhotoUrl);
        Assert.Equal(["employee", "editor"], me.Roles);
        Assert.Equal(2, me.Emails.Count);
        Assert.StartsWith("primary-", me.Emails[0]); // primary first
        Assert.Null(me.ActingAs);
        Assert.True(unitId > 0);
    }

    [Fact]
    public async Task Me_serialises_with_the_documented_camelCase_shape()
    {
        var code = await CreateEmployeeAsync(_dev);
        var client = _dev.CreateSessionClient();
        await client.DevLoginAsync(code);

        using var json = JsonDocument.Parse(await client.GetStringAsync("/api/auth/me"));

        var names = json.RootElement.EnumerateObject().Select(p => p.Name).Order().ToArray();
        Assert.Equal(["actingAs", "code", "emails", "fullName", "photoUrl", "roles", "unit"], names);
        Assert.Equal(JsonValueKind.Null, json.RootElement.GetProperty("actingAs").ValueKind);
    }

    [Theory]
    [InlineData(EmployeeStatuses.Inactive)]
    [InlineData(EmployeeStatuses.Retired)]
    [InlineData("missing")]
    public async Task Dev_login_rejects_unknown_and_inactive_employees(string status)
    {
        var code = status == "missing" ? "NOPE" + Guid.NewGuid().ToString("N")[..6] : await CreateEmployeeAsync(_dev, status: status);
        var client = _dev.CreateSessionClient();

        var response = await client.DevLoginAsync(code);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Dev_login_is_audited()
    {
        var code = await CreateEmployeeAsync(_dev);
        await _dev.CreateSessionClient().DevLoginAsync(code);

        var row = await _dev.WithDbAsync(db => db.Set<AuditLogEntry>().AsNoTracking()
            .SingleAsync(a => a.Action == "auth.dev_login" && a.TargetId == code));
        Assert.Equal(code, row.ActorCode);
    }

    [Theory]
    [InlineData("Testing", "true")]       // wrong environment, flag on
    [InlineData("Production", "true")]    // wrong environment, flag on
    [InlineData("Development", "false")]  // right environment, flag off
    public async Task Dev_login_is_404_unless_development_and_enabled(string environment, string? enabled)
    {
        var settings = new Dictionary<string, string?>();
        if (enabled is not null) settings["Auth:DevLogin:Enabled"] = enabled;
        await using var factory = new TestApiFactory(database, settings, environment: environment);
        var code = await CreateEmployeeAsync(factory);
        var client = factory.CreateSessionClient();

        var response = await client.DevLoginAsync(code);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Session_cookie_is_host_prefixed_secure_httponly_and_lax_outside_development()
    {
        var code = await CreateEmployeeAsync(_prod);
        var response = await _prod.CreateSessionClient().PostAsync($"/api/test/sign-in/{code}", null);

        var cookie = response.Headers.GetValues("Set-Cookie").Single(c => c.StartsWith("__Host-hcmus="));
        var lower = cookie.ToLowerInvariant();
        Assert.Contains("; secure", lower);
        Assert.Contains("; httponly", lower);
        Assert.Contains("; samesite=lax", lower);
        Assert.Contains("; path=/", lower);
        Assert.DoesNotContain("domain=", lower);
    }

    [Fact]
    public async Task Development_session_cookie_has_a_plain_name_so_it_works_over_http()
    {
        var code = await CreateEmployeeAsync(_dev);
        var response = await _dev.CreateSessionClient().DevLoginAsync(code);

        var cookies = response.Headers.GetValues("Set-Cookie").ToArray();
        Assert.Contains(cookies, c => c.StartsWith("hcmus="));
        Assert.DoesNotContain(cookies, c => c.StartsWith("__Host-"));
    }

    [Fact]
    public async Task Me_issues_the_xsrf_cookie_readable_by_javascript()
    {
        var code = await CreateEmployeeAsync(_prod);
        var client = _prod.CreateSessionClient();
        await SignInAsync(client, code);

        var response = await client.GetAsync("/api/auth/me");

        var cookie = response.Headers.GetValues("Set-Cookie").Single(c => c.StartsWith("XSRF-TOKEN="));
        Assert.DoesNotContain("httponly", cookie.ToLowerInvariant());
        Assert.Contains("secure", cookie.ToLowerInvariant());
        Assert.Contains("samesite=lax", cookie.ToLowerInvariant());
    }

    [Fact]
    public async Task Logout_ends_the_session_and_is_audited()
    {
        var code = await CreateEmployeeAsync(_prod);
        var client = _prod.CreateSessionClient();
        await SignInAsync(client, code);
        var token = (await client.GetAsync("/api/auth/me")).XsrfToken();

        var response = await client.SendAsync(new HttpRequestMessage(HttpMethod.Post, "/api/auth/logout").WithXsrf(token));

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
        var row = await _prod.WithDbAsync(db => db.Set<AuditLogEntry>().AsNoTracking()
            .SingleAsync(a => a.Action == "auth.logout" && a.TargetId == code));
        Assert.Equal(code, row.ActorCode);
    }

    [Fact]
    public async Task Logout_without_a_session_is_a_harmless_204()
    {
        var response = await _prod.CreateSessionClient().PostAsync("/api/auth/logout", null);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    [Fact]
    public async Task Session_is_revalidated_so_a_deactivated_employee_is_signed_out()
    {
        var code = await CreateEmployeeAsync(_prod);
        var client = _prod.CreateSessionClient();
        await SignInAsync(client, code);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/auth/me")).StatusCode);

        await _prod.WithDbAsync(async db =>
        {
            await db.Set<Employee>().Where(e => e.Code == code).ExecuteUpdateAsync(s => s.SetProperty(e => e.Status, EmployeeStatuses.Inactive));
            return 0;
        });

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/test/employee")).StatusCode);
    }

    [Fact]
    public async Task Session_is_revalidated_so_role_changes_apply_without_signing_in_again()
    {
        var code = await CreateEmployeeAsync(_prod);
        var client = _prod.CreateSessionClient();
        await SignInAsync(client, code);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/test/editor")).StatusCode);

        await _prod.WithDbAsync(async db =>
        {
            db.Set<RoleAssignment>().Add(new RoleAssignment { EmployeeCode = code, Role = Roles.Editor });
            await db.SaveChangesAsync();
            return 0;
        });
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/test/editor")).StatusCode);

        await _prod.WithDbAsync(async db =>
        {
            await db.Set<RoleAssignment>().Where(r => r.EmployeeCode == code).ExecuteDeleteAsync();
            return 0;
        });
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/test/editor")).StatusCode);
    }

    [Fact]
    public async Task Auth_rate_limit_applies_to_logout_but_not_to_me()
    {
        await using var factory = new TestApiFactory(database, new()
        {
            ["RateLimiting:Auth:PermitLimit"] = "2",
            ["RateLimiting:Auth:WindowSeconds"] = "60",
        });
        var client = factory.CreateSessionClient();

        for (var i = 0; i < 5; i++)
            Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsync("/api/auth/logout", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsync("/api/auth/logout", null)).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await client.PostAsync("/api/auth/logout", null)).StatusCode);
    }
}
