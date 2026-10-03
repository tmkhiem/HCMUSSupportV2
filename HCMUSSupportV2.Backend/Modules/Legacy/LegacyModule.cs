namespace HCMUSSupportV2.Backend.Modules.Legacy;

/// <summary>
/// Legacy migration (D15): the ApiKey-protected endpoints <c>/api/integration/v1/legacy/*</c> that the migration tools post to
/// (roster emails, roles, news, teaching, research, publications). One-off and idempotent; see docs/MIGRATION.md.
/// </summary>
public static class LegacyModule
{
    public static IServiceCollection AddLegacyModule(this IServiceCollection services)
    {
        services.AddScoped<LegacyRosterService>();
        services.AddScoped<LegacyRolesService>();
        services.AddScoped<LegacyNewsService>();
        services.AddScoped<LegacyDatasetsService>();
        return services;
    }
}
