using HCMUSSupportV2.Backend.Modules.Hrm.Integration;
using HCMUSSupportV2.Backend.Modules.Legacy.Datasets;
using HCMUSSupportV2.Backend.Modules.Legacy.Emails;
using HCMUSSupportV2.Backend.Modules.Legacy.Notifications;

namespace HCMUSSupportV2.Backend.Modules.Legacy;

/// <summary>
/// One-off v1 migration (D15): ApiKey endpoints under <c>/api/integration/v1/legacy</c> (scope <c>legacy.import</c>) that
/// seed the v1 email mapping, the v1 news posts and the v1 teaching/research/publication datasets. Every endpoint is
/// idempotent and supports <c>?dryRun=true</c>. Contract: docs/LEGACY-MIGRATION.md.
/// </summary>
public static class LegacyModule
{
    public const string LegacyImportPolicy = "LegacyImport";
    public const string RoutePrefix = "api/integration/v1/legacy";

    public static IServiceCollection AddLegacyModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddAuthorization(o => o.AddPolicy(LegacyImportPolicy, p => p
            .AddAuthenticationSchemes(ApiKeyDefaults.Scheme)
            .RequireAuthenticatedUser()
            .RequireClaim(ApiKeyDefaults.ScopeClaim, ApiScopes.LegacyImport)));

        services.AddScoped<LegacyEmailImportService>();
        services.AddScoped<LegacyNotificationImportService>();
        services.AddScoped<LegacyDatasetImportService>();
        return services;
    }
}
