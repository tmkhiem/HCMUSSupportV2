using HCMUSSupportV2.Backend.Modules.Identity.Authentication;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Modules.Identity.Seed;
using Microsoft.Extensions.Options;

namespace HCMUSSupportV2.Backend.Modules.Identity;

/// <summary>
/// Runs once when the host starts (after migrations): seeds the synthetic Development roster and bootstraps the first
/// admin from <c>Admin:BootstrapEmails</c>. Failures are logged, never fatal: the database may not be migrated yet.
/// </summary>
public class IdentityStartupService(
    IServiceScopeFactory scopes,
    IHostEnvironment env,
    IOptions<DevSeedOptions> devSeed,
    ILogger<IdentityStartupService> logger) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        try
        {
            await using var scope = scopes.CreateAsyncScope();
            if (env.IsDevelopment() && (devSeed.Value.SeedEmployees ?? true))
                await scope.ServiceProvider.GetRequiredService<DevDataSeeder>().SeedAsync(cancellationToken);
            await scope.ServiceProvider.GetRequiredService<AdminBootstrapper>().RunAsync(cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Identity startup tasks (dev seed, admin bootstrap) failed.");
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
