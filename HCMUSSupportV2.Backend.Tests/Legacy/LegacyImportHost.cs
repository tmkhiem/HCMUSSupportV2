using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using HCMUSSupportV2.Backend.Modules.Hrm.Integration;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Modules.Identity.Groups;
using HCMUSSupportV2.Backend.Tests.Hrm;
using HCMUSSupportV2.Backend.Tests.Identity;
using HCMUSSupportV2.Backend.Tests.Infrastructure;
using HCMUSSupportV2.Backend.Tests.Notifications;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static HCMUSSupportV2.Backend.Tests.Infrastructure.IdentityTestSupport;
using RecordingObserver = HCMUSSupportV2.Backend.Tests.Hrm.RecordingObserver;

namespace HCMUSSupportV2.Backend.Tests.Legacy;

/// <summary>A running app with an API client holding <c>legacy.import</c>, plus helpers to create synthetic employees and read rows back.</summary>
public sealed class LegacyImportHost : IAsyncDisposable
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public TestApiFactory Factory { get; }
    public RecordingObserver Observer { get; } = new();
    public HttpClient Legacy { get; private set; } = null!;

    public LegacyImportHost(PostgresFixture database)
    {
        Factory = new TestApiFactory(database, configureServices: services =>
        {
            TestControllers.Add(services);
            services.AddSingleton<IEmployeeActivationObserver>(Observer);
        });
        _ = Factory.Server;
    }

    public async Task StartAsync() =>
        Legacy = await HrmTestSupport.CreateIngestClientAsync(Factory, [ApiScopes.LegacyImport]);

    public HttpClient Anonymous() => HrmTestSupport.ApiClientFor(Factory, null);

    /// <summary>A client whose key only has the HRM ingest scope.</summary>
    public Task<HttpClient> IngestOnlyAsync() => HrmTestSupport.CreateIngestClientAsync(Factory, [ApiScopes.HrmIngest]);

    public async Task<(HttpStatusCode Status, JsonNode Body)> PostAsync(HttpClient client, string path, object body, bool dryRun = false)
    {
        var response = await client.PostAsJsonAsync($"/api/integration/v1/legacy/{path}{(dryRun ? "?dryRun=true" : "")}", body, Json);
        var text = await response.Content.ReadAsStringAsync();
        return (response.StatusCode, string.IsNullOrEmpty(text) ? new JsonObject() : JsonNode.Parse(text)!);
    }

    /// <summary>Posts with the legacy client and expects 200.</summary>
    public async Task<JsonNode> PostOkAsync(string path, object body, bool dryRun = false)
    {
        var (status, json) = await PostAsync(Legacy, path, body, dryRun);
        Assert.True(status == HttpStatusCode.OK, $"{path}: {(int)status} {json.ToJsonString()}");
        return json;
    }

    public static string NewCode() => "L" + Guid.NewGuid().ToString("N")[..10].ToUpperInvariant();

    public static string NewEmail(string? tag = null) => $"{tag ?? "u"}.{Guid.NewGuid():N}@legacy-test.local";

    public Task<string> EmployeeAsync(string status = EmployeeStatuses.Active, string[]? emails = null, string? fullName = null, string? code = null) =>
        CreateEmployeeAsync(Factory, status, emails ?? [], fullName: fullName, code: code ?? NewCode());

    public Task<T> DbAsync<T>(Func<Backend.Data.AppDbContext, Task<T>> action) => Factory.WithDbAsync(action);

    public Task<int> ScalarAsync(string sql, params object[] args) =>
        Factory.WithDbAsync(db => db.Database.SqlQueryRaw<int>(sql, args).SingleAsync());

    /// <summary>A signed-in employee session (test sign-in endpoint) with the antiforgery token.</summary>
    public async Task<Api> SignInAsync(string code)
    {
        var client = Factory.CreateSessionClient();
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsync($"/api/test/sign-in/{code}", null)).StatusCode);
        var token = (await client.GetAsync("/api/auth/me")).XsrfToken();
        Assert.False(string.IsNullOrEmpty(token));
        return new Api(client, token!, code);
    }

    public ValueTask DisposeAsync() => new(Factory.DisposeAsync().AsTask());
}
