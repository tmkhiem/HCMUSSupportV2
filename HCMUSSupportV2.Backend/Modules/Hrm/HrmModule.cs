using HCMUSSupportV2.Backend.Modules.Hrm.Datasets;
using HCMUSSupportV2.Backend.Modules.Hrm.Integration;
using HCMUSSupportV2.Backend.Modules.Hrm.Me;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace HCMUSSupportV2.Backend.Modules.Hrm;

/// <summary>
/// HRM domain module: the typed HRM tables, the ApiKey-protected full-snapshot ingest API (<c>/api/integration/v1</c>),
/// the self-service <c>/api/me/*</c> reads, Excel dataset imports (teaching, research, publications) and sync visibility.
/// </summary>
public static class HrmModule
{
    public const string IngestHrmPolicy = "IngestHrm";

    public static IServiceCollection AddHrmModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.TryAddSingleton(TimeProvider.System);

        services.AddAuthentication()
            .AddScheme<Microsoft.AspNetCore.Authentication.AuthenticationSchemeOptions, ApiKeyAuthenticationHandler>(ApiKeyDefaults.Scheme, _ => { });
        services.AddAuthorization(o => o.AddPolicy(IngestHrmPolicy, p => p
            .AddAuthenticationSchemes(ApiKeyDefaults.Scheme)
            .RequireAuthenticatedUser()
            .RequireClaim(ApiKeyDefaults.ScopeClaim, ApiScopes.HrmIngest)));

        services.AddScoped<ApiClientService>();
        services.AddHostedService<DevApiClientSeeder>();

        services.AddScoped<IngestService>();
        services.AddScoped<MeService>();
        services.AddScoped<DatasetImportService>();
        return services;
    }
}
