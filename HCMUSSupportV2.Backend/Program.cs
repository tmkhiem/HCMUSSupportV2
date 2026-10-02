using HCMUSSupportV2.Backend.Infrastructure;
using HCMUSSupportV2.Backend.Modules.Hrm;
using HCMUSSupportV2.Backend.Modules.Identity;
using HCMUSSupportV2.Backend.Modules.Legacy;
using HCMUSSupportV2.Backend.Modules.Admin;
using HCMUSSupportV2.Backend.Modules.Notifications;
using HCMUSSupportV2.Backend.Modules.Platform;

namespace HCMUSSupportV2.Backend;

public class Program
{
    public static async Task Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);

        builder.AddLocalConfiguration(args);   // appsettings.{Environment}.local.json (git-ignored secrets)
        builder.AddPlatformInfrastructure();   // Serilog, OpenTelemetry, database, health, rate limiter, ProblemDetails, forwarded headers

        builder.Services.AddControllers();

        // Registered so the NSwag CLI (generate-api.cmd) can resolve the OpenAPI document
        // generator at design time. No UseOpenApi()/UseSwaggerUi() call, so nothing is
        // exposed at runtime.
        builder.Services.AddOpenApiDocument();

        // Modules: exactly one line per module.
        builder.Services.AddPlatformModule(builder.Configuration);
        builder.Services.AddIdentityModule(builder.Configuration);
        builder.Services.AddAdminModule(builder.Configuration);
        builder.Services.AddHrmModule(builder.Configuration);
        builder.Services.AddNotificationsModule(builder.Configuration);
        builder.Services.AddLegacyModule(builder.Configuration);

        var app = builder.Build();

        await app.MigrateDatabaseIfConfiguredAsync();
        app.UsePlatformPipeline();
        app.UseIdentityPipeline();   // authentication + antiforgery
        app.UseAdminPipeline();      // view-as read-only guard
        app.UseAuthorization();
        app.MapPlatformEndpoints();

        await app.RunAsync();
    }
}
