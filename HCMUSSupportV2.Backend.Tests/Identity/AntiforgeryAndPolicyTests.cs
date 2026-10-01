using System.Net;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Tests.Infrastructure;
using static HCMUSSupportV2.Backend.Tests.Infrastructure.IdentityTestSupport;

namespace HCMUSSupportV2.Backend.Tests.Identity;

/// <summary>The double-submit antiforgery contract and the role policies, over HTTP against the test-only endpoints.</summary>
[Collection(PostgresCollection.Name)]
public class AntiforgeryAndPolicyTests(PostgresFixture database) : IAsyncLifetime
{
    private readonly TestApiFactory _factory = new(database, configureServices: TestControllers.Add);

    public Task InitializeAsync()
    {
        _ = _factory.Server;
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    /// <summary>Signs in and, like the SPA, calls /me to obtain the XSRF token.</summary>
    private async Task<(HttpClient Client, string Token, string Code)> SignedInAsync(params string[] roles)
    {
        var code = await CreateEmployeeAsync(_factory, roles: roles);
        var client = _factory.CreateSessionClient();
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsync($"/api/test/sign-in/{code}", null)).StatusCode);
        var token = (await client.GetAsync("/api/auth/me")).XsrfToken();
        Assert.False(string.IsNullOrEmpty(token));
        return (client, token!, code);
    }

    // ---- antiforgery ----

    [Fact]
    public async Task Unsafe_request_with_a_session_but_without_the_header_is_rejected_with_400()
    {
        var (client, _, _) = await SignedInAsync();

        var response = await client.PostAsync("/api/test/write", null);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("Antiforgery", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Unsafe_request_with_a_wrong_token_is_rejected()
    {
        var (client, _, _) = await SignedInAsync();

        var response = await client.SendAsync(new HttpRequestMessage(HttpMethod.Post, "/api/test/write").WithXsrf("not-a-real-token"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Unsafe_request_with_the_token_from_the_xsrf_cookie_succeeds()
    {
        var (client, token, _) = await SignedInAsync();

        var response = await client.SendAsync(new HttpRequestMessage(HttpMethod.Post, "/api/test/write").WithXsrf(token));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task A_token_issued_to_another_user_is_rejected()
    {
        var (_, tokenOfA, _) = await SignedInAsync();
        var (clientB, _, _) = await SignedInAsync();

        var response = await clientB.SendAsync(new HttpRequestMessage(HttpMethod.Post, "/api/test/write").WithXsrf(tokenOfA));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Safe_requests_need_no_token()
    {
        var (client, _, _) = await SignedInAsync();

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/test/employee")).StatusCode);
    }

    [Fact]
    public async Task Anonymous_unsafe_request_gets_401_from_authorization_not_400_from_antiforgery()
    {
        var response = await _factory.CreateSessionClient().PostAsync("/api/test/write", null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Integration_routes_are_exempt_from_antiforgery_even_when_a_cookie_is_present()
    {
        var (client, _, _) = await SignedInAsync();

        var response = await client.PostAsync("/api/integration/ping", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Logout_requires_the_token_when_a_session_exists()
    {
        var (client, token, _) = await SignedInAsync();

        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync("/api/auth/logout", null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/auth/me")).StatusCode); // still signed in

        var ok = await client.SendAsync(new HttpRequestMessage(HttpMethod.Post, "/api/auth/logout").WithXsrf(token));
        Assert.Equal(HttpStatusCode.NoContent, ok.StatusCode);
    }

    // ---- policies ----

    [Fact]
    public async Task Anonymous_gets_401_on_every_policy_endpoint()
    {
        var client = _factory.CreateSessionClient();

        foreach (var path in new[] { "employee", "editor", "admin" })
        {
            var response = await client.GetAsync($"/api/test/{path}");
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
            Assert.Null(response.Headers.Location);
        }
    }

    [Fact]
    public async Task Employee_is_forbidden_on_editor_and_admin_endpoints_but_allowed_on_employee()
    {
        var (client, _, _) = await SignedInAsync();

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/test/employee")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/test/editor")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/test/admin")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/test/capability/notifications")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/test/capability/roles")).StatusCode);
    }

    [Fact]
    public async Task Editor_is_allowed_on_editor_level_endpoints_and_forbidden_on_admin_ones()
    {
        var (client, _, code) = await SignedInAsync(Roles.Editor);

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/test/employee")).StatusCode);
        var editor = await client.GetAsync("/api/test/editor");
        Assert.Equal(HttpStatusCode.OK, editor.StatusCode);
        Assert.Contains(code, await editor.Content.ReadAsStringAsync());
        Assert.Contains("\"isEditor\":true", await (await client.GetAsync("/api/test/editor")).Content.ReadAsStringAsync());
        Assert.Contains("\"isAdmin\":false", await (await client.GetAsync("/api/test/editor")).Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/test/capability/notifications")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/test/admin")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/test/capability/roles")).StatusCode);
    }

    [Fact]
    public async Task Admin_is_allowed_everywhere_including_editor_level_endpoints()
    {
        var (client, _, _) = await SignedInAsync(Roles.Admin);

        foreach (var path in new[] { "employee", "editor", "admin", "capability/notifications", "capability/roles" })
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/test/{path}")).StatusCode);
        Assert.Contains("\"isAdmin\":true", await (await client.GetAsync("/api/test/admin")).Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Admin_and_editor_roles_together_work()
    {
        var (client, _, _) = await SignedInAsync(Roles.Editor, Roles.Admin);

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/test/admin")).StatusCode);
    }
}
