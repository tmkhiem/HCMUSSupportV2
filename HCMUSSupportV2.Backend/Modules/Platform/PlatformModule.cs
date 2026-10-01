using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using HCMUSSupportV2.Backend.Modules.Platform.Files;
using HCMUSSupportV2.Backend.Modules.Platform.Jobs;
using Microsoft.AspNetCore.DataProtection;

namespace HCMUSSupportV2.Backend.Modules.Platform;

/// <summary>
/// Platform module: the shared core other modules build on (job queue, file store, audit log, data-protection keys,
/// system info). Cross-cutting host setup (Serilog, OpenTelemetry, database, health, rate limiting) lives in
/// <c>Infrastructure/</c>.
/// </summary>
public static class PlatformModule
{
    public static IServiceCollection AddPlatformModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<JobOptions>(configuration.GetSection(JobOptions.SectionName));
        services.Configure<StorageOptions>(configuration.GetSection(StorageOptions.SectionName));

        // Jobs
        services.AddSingleton<JobStore>();
        services.AddSingleton<IJobQueue, JobQueue>();
        services.AddHostedService<JobWorker>();
        services.AddJobHandler<NoopJobHandler>();

        // Files
        services.AddScoped<IFileStore, LocalFileStore>();

        // Audit
        services.AddHttpContextAccessor();
        services.AddSingleton<IAuditLogger, AuditLogger>();

        // Cookie / antiforgery keys survive restarts and are shared between instances.
        services.AddDataProtection()
            .SetApplicationName("hcmus-support")
            .PersistKeysToDbContext<AppDbContext>();

        return services;
    }

    /// <summary>Registers a handler for background jobs of <see cref="IJobHandler.Type"/>.</summary>
    public static IServiceCollection AddJobHandler<THandler>(this IServiceCollection services)
        where THandler : class, IJobHandler
        => services.AddScoped<IJobHandler, THandler>();
}
