using System.Net;
using System.Net.Http.Json;
using HCMUSSupportV2.Backend.Modules.Platform.SystemInfo;
using HCMUSSupportV2.Backend.Tests.Infrastructure;

namespace HCMUSSupportV2.Backend.Tests;

[Collection(PostgresCollection.Name)]
public class PlatformEndpointTests(PostgresFixture database) : IAsyncLifetime
{
    private readonly TestApiFactory _factory = new(database);

    public Task InitializeAsync() => Task.CompletedTask;

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    [Fact]
    public async Task Healthz_is_healthy_and_checks_the_database()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/healthz");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Healthy", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task System_info_returns_version_and_environment()
    {
        var client = _factory.CreateClient();

        var info = await client.GetFromJsonAsync<SystemInfoDto>("/api/system/info");

        Assert.NotNull(info);
        Assert.False(string.IsNullOrWhiteSpace(info.Version));
        Assert.StartsWith("2.0.0", info.Version);
        Assert.Equal("Testing", info.Environment);
    }

    [Fact]
    public async Task Unknown_api_route_is_404_not_the_spa_shell()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/does-not-exist");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
