using HCMUSSupportV2.Backend.Data;
using Microsoft.EntityFrameworkCore;
using Serilog;

namespace HCMUSSupportV2.Backend.Infrastructure;

public static class PipelineExtensions
{
    /// <summary>Middleware that must run first: forwarded headers, error handling, request logging, HTTPS, static files, rate limiter.</summary>
    public static WebApplication UsePlatformPipeline(this WebApplication app)
    {
        app.UseForwardedHeaders();
        app.UseExceptionHandler();
        app.UseStatusCodePages();
        app.UseSerilogRequestLogging(o => o.GetLevel = (ctx, _, ex) =>
            ex is not null || ctx.Response.StatusCode >= 500 ? Serilog.Events.LogEventLevel.Error
            : ctx.Request.Path == "/healthz" ? Serilog.Events.LogEventLevel.Verbose
            : Serilog.Events.LogEventLevel.Information);

        app.UseHttpsRedirection();

        app.UseDefaultFiles();
        app.UseStaticFiles();

        app.UseRateLimiter();
        return app;
    }

    public static WebApplication MapPlatformEndpoints(this WebApplication app)
    {
        app.MapHealthChecks("/healthz");
        app.MapControllers();
        // SPA fallback for client-side routes; unknown /api/* paths must stay 404, not index.html.
        app.MapFallbackToFile("{*path:regex(^(?!api(/|$)).*$)}", "index.html");
        return app;
    }

    /// <summary>
    /// Applies pending EF migrations at startup when <c>Database:MigrateOnStartup</c> is true
    /// (default: true in Development, false elsewhere; production applies migrations explicitly).
    /// </summary>
    public static async Task MigrateDatabaseIfConfiguredAsync(this WebApplication app)
    {
        var enabled = app.Configuration.GetValue("Database:MigrateOnStartup", app.Environment.IsDevelopment());
        if (!enabled) return;

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.MigrateAsync();
    }
}
