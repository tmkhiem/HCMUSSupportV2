using System.Net;
using System.Reflection;
using System.Threading.RateLimiting;
using HCMUSSupportV2.Backend.Data;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using OpenTelemetry;
using OpenTelemetry.Exporter;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using Serilog;

namespace HCMUSSupportV2.Backend.Infrastructure;

/// <summary>Cross-cutting host setup shared by every module: logging, telemetry, database, health, rate limiting, errors.</summary>
public static class InfrastructureExtensions
{
    public const string AuthRateLimitPolicy = "auth";
    public const string IntegrationRateLimitPolicy = "integration";

    public static WebApplicationBuilder AddPlatformInfrastructure(this WebApplicationBuilder builder)
    {
        builder.AddSerilog();
        builder.AddOpenTelemetry();

        var services = builder.Services;
        services.AddDatabase();
        services.AddProblemDetails();
        services.AddHealthChecks().AddDbContextCheck<AppDbContext>("database");
        services.AddPlatformRateLimiter();
        services.AddForwardedHeaders(builder.Configuration);
        return builder;
    }

    private static void AddSerilog(this WebApplicationBuilder builder)
    {
        builder.Host.UseSerilog((context, services, logger) =>
        {
            logger
                .ReadFrom.Configuration(context.Configuration) // "Serilog" section: MinimumLevel etc.
                .ReadFrom.Services(services)
                .Enrich.FromLogContext()
                .WriteTo.Console();

            if (context.Configuration.GetValue("Logging:File:Enabled", true))
            {
                logger.WriteTo.File(
                    context.Configuration.GetValue("Logging:File:Path", "logs/hcmus-support-.log")!,
                    rollingInterval: RollingInterval.Day,
                    retainedFileCountLimit: context.Configuration.GetValue("Logging:File:RetainedFiles", 30));
            }
        });
    }

    private static void AddOpenTelemetry(this WebApplicationBuilder builder)
    {
        var endpoint = builder.Configuration["OpenTelemetry:Endpoint"];
        var version = typeof(InfrastructureExtensions).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion;

        var otel = builder.Services.AddOpenTelemetry()
            .ConfigureResource(r => r.AddService(
                builder.Configuration["OpenTelemetry:ServiceName"] ?? "hcmus-support", serviceVersion: version))
            .WithTracing(t => t
                .AddAspNetCoreInstrumentation(o => o.Filter = ctx => ctx.Request.Path != "/healthz")
                .AddHttpClientInstrumentation()
                .AddNpgsql())
            .WithMetrics(m => m
                .AddAspNetCoreInstrumentation()
                .AddHttpClientInstrumentation()
                .AddNpgsqlInstrumentation());

        // Export only when an OTLP collector is configured; instrumentation itself is always on (cheap, in-process).
        if (!string.IsNullOrWhiteSpace(endpoint))
        {
            var protocol = string.Equals(builder.Configuration["OpenTelemetry:Protocol"], "http/protobuf", StringComparison.OrdinalIgnoreCase)
                ? OtlpExportProtocol.HttpProtobuf
                : OtlpExportProtocol.Grpc;
            otel.UseOtlpExporter(protocol, new Uri(endpoint));
        }
    }

    private static void AddDatabase(this IServiceCollection services)
    {
        void Configure(IServiceProvider sp, DbContextOptionsBuilder options)
        {
            // Resolved lazily so test hosts and WebApplicationFactory can override configuration.
            var connectionString = sp.GetRequiredService<IConfiguration>().GetConnectionString("Default");
            if (string.IsNullOrWhiteSpace(connectionString))
                throw new InvalidOperationException(
                    "ConnectionStrings:Default is not configured. Copy appsettings.Development.local.json.example to " +
                    "appsettings.Development.local.json and fill it in, or set ConnectionStrings__Default.");
            options.UseNpgsql(connectionString).UseSnakeCaseNamingConvention();
        }

        // Scoped context for request work, plus a factory for components that need a short-lived, independent
        // context (job queue, audit log). Both share one singleton options instance.
        services.AddDbContext<AppDbContext>(Configure, ServiceLifetime.Scoped, ServiceLifetime.Singleton);
        services.AddDbContextFactory<AppDbContext>(Configure);
    }

    private static void AddPlatformRateLimiter(this IServiceCollection services)
    {
        services.AddRateLimiter(o => o.RejectionStatusCode = StatusCodes.Status429TooManyRequests);

        // Policies are registered here and applied later with [EnableRateLimiting("auth")] / ("integration").
        services.AddOptions<RateLimiterOptions>().Configure<IConfiguration>((options, config) =>
        {
            options.AddPolicy(AuthRateLimitPolicy, ctx => PerClientFixedWindow(ctx, config, "RateLimiting:Auth", 20, 60));
            options.AddPolicy(IntegrationRateLimitPolicy, ctx => PerClientFixedWindow(ctx, config, "RateLimiting:Integration", 600, 60));
        });
    }

    private static RateLimitPartition<string> PerClientFixedWindow(
        HttpContext ctx, IConfiguration config, string section, int defaultPermits, int defaultWindowSeconds)
    {
        // RemoteIpAddress is the real client IP once UseForwardedHeaders has run.
        var key = ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(key, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = config.GetValue($"{section}:PermitLimit", defaultPermits),
            Window = TimeSpan.FromSeconds(config.GetValue($"{section}:WindowSeconds", defaultWindowSeconds)),
            QueueLimit = 0,
        });
    }

    private static void AddForwardedHeaders(this IServiceCollection services, IConfiguration configuration)
    {
        var knownNetworks = configuration.GetSection("ReverseProxy:KnownNetworks").Get<string[]>() ?? [];
        var knownProxies = configuration.GetSection("ReverseProxy:KnownProxies").Get<string[]>() ?? [];
        services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            // KnownNetworks takes Microsoft.AspNetCore.HttpOverrides.IPNetwork (CIDR prefix
            // + length), not the System.Net.IPNetwork struct - parse the "a.b.c.d/n" form manually.
            foreach (var network in knownNetworks)
            {
                var parts = network.Split('/');
                options.KnownNetworks.Add(new Microsoft.AspNetCore.HttpOverrides.IPNetwork(IPAddress.Parse(parts[0]), int.Parse(parts[1])));
            }
            foreach (var proxy in knownProxies) options.KnownProxies.Add(IPAddress.Parse(proxy));
        });
    }
}
