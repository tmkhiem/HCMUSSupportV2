using HCMUSSupportV2.Backend.Modules.Identity.Groups.Rules;
using HCMUSSupportV2.Backend.Modules.Platform;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace HCMUSSupportV2.Backend.Modules.Identity.Groups;

/// <summary>Registration of the groups engine (D06). Called from <c>AddIdentityModule</c>; lives inside the Identity module.</summary>
public static class GroupsModule
{
    public static IServiceCollection AddGroupsEngine(this IServiceCollection services)
    {
        // Rule fields: add more with services.AddSingleton<IGroupRuleField, ...>() (see docs/GROUP-RULES.md).
        services.AddSingleton<IGroupRuleField, OrgUnitField>();
        services.AddSingleton<IGroupRuleField, PositionTitleField>();
        services.AddSingleton<IGroupRuleField, AcademicRankField>();
        services.AddSingleton<IGroupRuleField, DegreeField>();
        services.AddSingleton<IGroupRuleField, StatusField>();
        services.AddSingleton<IGroupRuleField, HasEmailField>();
        services.AddSingleton<GroupRuleParser>();
        services.AddSingleton<GroupRuleCompiler>();

        services.TryAddSingleton(TimeProvider.System);
        services.AddScoped<GroupMembershipNotifier>();
        services.AddScoped<GroupRecomputeService>();
        services.AddScoped<GroupsService>();
        services.AddScoped<IRosterSyncObserver, RosterSyncGroupsObserver>();
        services.AddJobHandler<GroupsRecomputeJob>();
        return services;
    }
}
