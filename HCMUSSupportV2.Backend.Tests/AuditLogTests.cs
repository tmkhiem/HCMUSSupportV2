using System.Net;
using System.Security.Claims;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using HCMUSSupportV2.Backend.Tests.Infrastructure;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace HCMUSSupportV2.Backend.Tests;

[Collection(PostgresCollection.Name)]
public class AuditLogTests(PostgresFixture database) : IAsyncLifetime
{
    private readonly TestApiFactory _factory = new(database);

    public Task InitializeAsync()
    {
        _ = _factory.Server;
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    [Fact]
    public async Task System_action_without_http_context_is_logged_without_actor()
    {
        var audit = _factory.Services.GetRequiredService<IAuditLogger>();
        var target = $"sys-{Guid.NewGuid():N}";

        await audit.LogAsync("test.system", "thing", target, new { reason = "unit test" });

        var row = await _factory.WithDbAsync(db => db.Set<AuditLogEntry>().AsNoTracking().SingleAsync(a => a.TargetId == target));
        Assert.Equal("test.system", row.Action);
        Assert.Equal("thing", row.TargetType);
        Assert.Null(row.ActorCode);
        Assert.Null(row.Ip);
        Assert.Contains("unit test", row.Details);
        Assert.True(row.At > DateTimeOffset.UtcNow.AddMinutes(-5));
    }

    [Fact]
    public async Task Request_actor_ip_and_user_agent_are_captured()
    {
        var accessor = _factory.Services.GetRequiredService<IHttpContextAccessor>();
        var audit = _factory.Services.GetRequiredService<IAuditLogger>();
        var target = $"req-{Guid.NewGuid():N}";

        var http = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(
                [new Claim("code", "T0001"), new Claim("acting_as", "T0002")], "test")),
        };
        http.Connection.RemoteIpAddress = IPAddress.Parse("10.1.2.3");
        http.Request.Headers.UserAgent = "xunit-agent/1.0";
        accessor.HttpContext = http;
        try
        {
            await audit.LogAsync("test.request", "employee", target);
        }
        finally
        {
            accessor.HttpContext = null;
        }

        var row = await _factory.WithDbAsync(db => db.Set<AuditLogEntry>().AsNoTracking().SingleAsync(a => a.TargetId == target));
        Assert.Equal("T0001", row.ActorCode);
        Assert.Equal("T0002", row.ActingAsCode);
        Assert.Equal(IPAddress.Parse("10.1.2.3"), row.Ip);
        Assert.Equal("xunit-agent/1.0", row.UserAgent);
        Assert.Null(row.Details);
    }

    [Fact]
    public async Task Data_protection_keys_are_persisted_in_the_database()
    {
        var provider = _factory.Services.GetRequiredService<IDataProtectionProvider>();

        var protectedText = provider.CreateProtector("tests").Protect("secret");

        Assert.Equal("secret", provider.CreateProtector("tests").Unprotect(protectedText));
        Assert.True(await _factory.WithDbAsync(db => db.DataProtectionKeys.AnyAsync()));
    }
}
