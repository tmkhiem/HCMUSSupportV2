using HCMUSSupportV2.Backend.Modules.Admin.Audit;
using HCMUSSupportV2.Backend.Modules.Admin.Dashboard;
using HCMUSSupportV2.Backend.Modules.Admin.RoleGrants;
using HCMUSSupportV2.Backend.Modules.Admin.ViewAs;

namespace HCMUSSupportV2.Backend.Modules.Admin;

/// <summary>
/// Admin core (D14a): role grants, view-as (read-only impersonation), employee status and manual employees, the audit
/// query and the dashboard. Everything here needs the admin role (named policies from Identity).
/// </summary>
public static class AdminModule
{
    public static IServiceCollection AddAdminModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<ViewAsOptions>(configuration.GetSection(ViewAsOptions.SectionName));
        services.AddScoped<RoleAdminService>();
        services.AddScoped<AuditQueryService>();
        services.AddScoped<DashboardService>();
        services.AddDashboardContributor<IdentityDashboardContributor>();
        return services;
    }

    /// <summary>
    /// Registers a dashboard contributor. Other modules call this from their own <c>AddXxxModule</c>; its tiles appear
    /// on <c>GET /api/admin/dashboard</c> after the ones registered earlier.
    /// </summary>
    public static IServiceCollection AddDashboardContributor<T>(this IServiceCollection services)
        where T : class, IDashboardContributor
        => services.AddScoped<IDashboardContributor, T>();

    /// <summary>The read-only guard for view-as sessions. Place after <c>UseIdentityPipeline</c>.</summary>
    public static WebApplication UseAdminPipeline(this WebApplication app)
    {
        app.UseMiddleware<ViewAsReadOnlyMiddleware>();
        return app;
    }
}
