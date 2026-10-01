using HCMUSSupportV2.Backend.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace HCMUSSupportV2.Backend.Tests.Infrastructure;

/// <summary>
/// Boots the real application against the fixture's database. The job worker is off unless a test turns it on,
/// and file storage goes to a private temp folder that is removed on dispose.
/// </summary>
public sealed class TestApiFactory(
    PostgresFixture database,
    Dictionary<string, string?>? settings = null,
    Action<IServiceCollection>? configureServices = null,
    string environment = "Testing") : WebApplicationFactory<Program>
{
    public string StorageRoot { get; } = Path.Combine(Path.GetTempPath(), "hcmus-support-tests", Guid.NewGuid().ToString("N"));

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(environment);

        builder.ConfigureAppConfiguration((_, config) =>
        {
            var values = new Dictionary<string, string?>
            {
                ["ConnectionStrings:Default"] = database.ConnectionString,
                ["Logging:File:Enabled"] = "false",
                ["Jobs:Enabled"] = "false",
                ["Jobs:PollIntervalMs"] = "50",
                ["Jobs:BackoffBaseSeconds"] = "0",
                ["Storage:LocalRoot"] = StorageRoot,
                // Identity: no synthetic roster in tests (they create their own rows), fake Google client, re-check the
                // session against the database on every request so role/status changes are visible immediately.
                ["Dev:SeedEmployees"] = "false",
                ["Auth:Google:ClientId"] = "test-client-id.apps.googleusercontent.com",
                ["Auth:Google:ClientSecret"] = "test-client-secret",
                ["Auth:RevalidateSeconds"] = "0",
            };
            foreach (var (key, value) in settings ?? []) values[key] = value;
            config.AddInMemoryCollection(values);
        });

        if (configureServices is not null) builder.ConfigureServices(configureServices);
    }

    /// <summary>Runs <paramref name="action"/> with a scoped <see cref="AppDbContext"/>.</summary>
    public async Task<T> WithDbAsync<T>(Func<AppDbContext, Task<T>> action)
    {
        await using var scope = Services.CreateAsyncScope();
        return await action(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing && Directory.Exists(StorageRoot))
        {
            try { Directory.Delete(StorageRoot, recursive: true); } catch (IOException) { }
        }
    }
}

public static class Wait
{
    /// <summary>Polls <paramref name="condition"/> until it returns true or the timeout elapses.</summary>
    public static async Task<bool> UntilAsync(Func<Task<bool>> condition, TimeSpan? timeout = null)
    {
        var deadline = DateTime.UtcNow + (timeout ?? TimeSpan.FromSeconds(20));
        while (DateTime.UtcNow < deadline)
        {
            if (await condition()) return true;
            await Task.Delay(50);
        }
        return await condition();
    }
}
