using System.Net;
using System.Net.Http.Json;
using HCMUSSupportV2.Backend.Modules.Hrm.Domain;
using HCMUSSupportV2.Backend.Modules.Hrm.Integration;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Tests.Identity;
using HCMUSSupportV2.Backend.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using static HCMUSSupportV2.Backend.Tests.Admin.AdminTestSupport;
using static HCMUSSupportV2.Backend.Tests.Hrm.HrmTestSupport;

namespace HCMUSSupportV2.Backend.Tests.Admin;

[Collection(PostgresCollection.Name)]
public class ApiClientsAdminTests(PostgresFixture database) : IAsyncLifetime
{
    private readonly TestApiFactory _factory = new(database, configureServices: s => TestControllers.Add(s));

    public Task InitializeAsync()
    {
        _ = _factory.Server;
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    private static object NewClient(string name, params string[] scopes) => new { name, scopes };

    [Fact]
    public async Task Editor_and_employee_get_403_and_anonymous_401_on_every_endpoint()
    {
        var editor = await _factory.SignInNewAsync(Roles.Editor);
        var employee = await _factory.SignInNewAsync();

        foreach (var s in new[] { editor, employee })
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await s.GetAsync("/api/admin/api-clients")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await s.GetAsync("/api/admin/api-clients/scopes")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await s.SendAsync(HttpMethod.Post, "/api/admin/api-clients", NewClient("x", "hrm.ingest"))).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await s.SendAsync(HttpMethod.Post, "/api/admin/api-clients/1/revoke")).StatusCode);
        }
        Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.CreateSessionClient().GetAsync("/api/admin/api-clients")).StatusCode);
    }

    [Fact]
    public async Task Scopes_come_from_the_backend()
    {
        var admin = await _factory.SignInNewAsync(Roles.Admin);
        var scopes = (await (await admin.GetAsync("/api/admin/api-clients/scopes")).ReadAsync()).EnumerateArray()
            .Select(x => x.GetProperty("scope").GetString()).ToArray();
        Assert.Equal(ApiScopes.Known.Select(k => k.Scope).ToArray(), scopes);
        Assert.Contains("hrm.ingest", scopes);
        Assert.Contains("legacy.import", scopes);
    }

    [Fact]
    public async Task Token_is_returned_once_stored_hashed_and_works_as_an_api_key_until_revoked()
    {
        var admin = await _factory.SignInNewAsync(Roles.Admin);
        var name = "ci-" + Guid.NewGuid().ToString("N")[..8];

        var create = await admin.SendAsync(HttpMethod.Post, "/api/admin/api-clients", NewClient(name, "hrm.ingest"));
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var created = await create.ReadAsync();
        var token = created.GetProperty("token").GetString()!;
        var id = created.GetProperty("client").GetProperty("id").GetInt64();
        Assert.True(token.Length >= 40);

        // Stored as the SHA-256 hash the ApiKey handler verifies, never in plain.
        var row = await _factory.WithDbAsync(db => db.Set<ApiClient>().AsNoTracking().SingleAsync(c => c.Id == id));
        Assert.Equal(ApiTokens.Hash(token), row.TokenHash);
        Assert.DoesNotContain(token, row.TokenHash);

        // Listed without any token or hash; a second read never shows the token again.
        var listJson = await (await admin.GetAsync("/api/admin/api-clients")).Content.ReadAsStringAsync();
        Assert.Contains(name, listJson);
        Assert.DoesNotContain(token, listJson);
        Assert.DoesNotContain(row.TokenHash, listJson);
        Assert.DoesNotContain("token", listJson, StringComparison.OrdinalIgnoreCase);

        // The audit entry records the client but not the token or its hash.
        var audit = Assert.Single(await _factory.AuditAsync("apiclient.created", id.ToString()));
        Assert.Equal(admin.Code, audit.ActorCode);
        Assert.Contains(name, audit.Details);
        Assert.DoesNotContain(token, audit.Details);
        Assert.DoesNotContain(row.TokenHash, audit.Details);

        // The key authenticates the integration API.
        var api = ApiClientFor(_factory, token);
        // A malformed body (400): authenticated and in scope, but nothing is ingested (a valid snapshot would replace data other tests rely on).
        Assert.Equal(HttpStatusCode.BadRequest, (await api.PostAsync("/api/integration/v1/employees", JsonContent.Create(Array.Empty<object>()))).StatusCode);

        // Revoke: audited once (idempotent), then the key is rejected.
        var revoke = await admin.SendAsync(HttpMethod.Post, $"/api/admin/api-clients/{id}/revoke");
        Assert.Equal(HttpStatusCode.OK, revoke.StatusCode);
        Assert.NotEqual(System.Text.Json.JsonValueKind.Null, (await revoke.ReadAsync()).GetProperty("revokedAt").ValueKind);
        Assert.Equal(HttpStatusCode.OK, (await admin.SendAsync(HttpMethod.Post, $"/api/admin/api-clients/{id}/revoke")).StatusCode);
        var revoked = Assert.Single(await _factory.AuditAsync("apiclient.revoked", id.ToString()));
        Assert.Equal(admin.Code, revoked.ActorCode);

        Assert.Equal(HttpStatusCode.Unauthorized, (await api.PostAsync("/api/integration/v1/employees", JsonContent.Create(Array.Empty<object>()))).StatusCode);
    }

    [Fact]
    public async Task Invalid_requests_are_400_and_unknown_id_is_404()
    {
        var admin = await _factory.SignInNewAsync(Roles.Admin);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.SendAsync(HttpMethod.Post, "/api/admin/api-clients", NewClient("  ", "hrm.ingest"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.SendAsync(HttpMethod.Post, "/api/admin/api-clients", NewClient(new string('a', 101), "hrm.ingest"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.SendAsync(HttpMethod.Post, "/api/admin/api-clients", NewClient("ok"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.SendAsync(HttpMethod.Post, "/api/admin/api-clients", NewClient("ok", "nope.scope"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.SendAsync(HttpMethod.Post, "/api/admin/api-clients/999999999/revoke")).StatusCode);
    }
}
