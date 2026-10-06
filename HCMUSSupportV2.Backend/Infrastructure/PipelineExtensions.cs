using HCMUSSupportV2.Backend.Data;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
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

        // Read wwwroot straight from disk on every request. The default web root provider (in Development, the static web
        // assets manifest) is a snapshot of the files present at build/startup, so a rebuilt frontend would need a restart.
        var files = WebRootFiles(app);
        app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = files });
        app.UseStaticFiles(new StaticFileOptions { FileProvider = files, OnPrepareResponse = NoCacheIndexHtml });

        app.UseRateLimiter();
        return app;
    }

    public static WebApplication MapPlatformEndpoints(this WebApplication app)
    {
        app.MapHealthChecks("/healthz");
        app.MapControllers();
        // SPA fallback for client-side routes; unknown /api/* and /assets/* paths must stay 404, not index.html
        // (a stale hashed script answered with HTML fails in the browser with a module-script MIME type error).
        // Paths ending in a file extension (/icons/32/bell.png, /bg-logo.svg) are excluded too: the static file middleware
        // skips a request that already matched an endpoint, so a catch-all that matched them would answer index.html.
        app.MapFallbackToFile("{*path:regex(^(?!(api|assets)(/|$))(?!.*[.][A-Za-z0-9]+$).*$)}", "index.html",
            new StaticFileOptions { FileProvider = WebRootFiles(app), OnPrepareResponse = NoCacheIndexHtml });
        return app;
    }

    private static IFileProvider? WebRootFiles(WebApplication app) =>
        Directory.Exists(app.Environment.WebRootPath) ? new PhysicalFileProvider(app.Environment.WebRootPath) : null;

    // index.html names the content-hashed bundles, and the other files in wwwroot (bg-logo.svg, icons/) keep their
    // names across builds, so all of them must be revalidated (ETag, 304 when unchanged) after every frontend build.
    // Without a Cache-Control header the browser may reuse a copy it considers fresh from Last-Modified alone and a
    // replaced file would not show up. Only the content-hashed files under /assets can be cached freely.
    private static void NoCacheIndexHtml(StaticFileResponseContext ctx)
    {
        if (!ctx.Context.Request.Path.StartsWithSegments("/assets"))
            ctx.Context.Response.Headers.CacheControl = "no-cache";
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
