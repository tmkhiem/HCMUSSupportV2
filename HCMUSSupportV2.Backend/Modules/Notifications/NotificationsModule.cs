using HCMUSSupportV2.Backend.Modules.Identity.Groups;
using HCMUSSupportV2.Backend.Modules.Notifications.Editor;
using HCMUSSupportV2.Backend.Modules.Notifications.Import;
using HCMUSSupportV2.Backend.Modules.Notifications.Inbox;
using HCMUSSupportV2.Backend.Modules.Notifications.Publishing;
using HCMUSSupportV2.Backend.Modules.Notifications.Realtime;
using HCMUSSupportV2.Backend.Modules.Platform;

namespace HCMUSSupportV2.Backend.Modules.Notifications;

/// <summary>
/// Notifications module (D07): the Markdown contract, editor API, recipient imports, publishing and fan-out jobs,
/// late-joiner backfill, the inbox API and the SSE stream. See docs/NOTIFICATIONS.md.
/// </summary>
public static class NotificationsModule
{
    public static IServiceCollection AddNotificationsModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<NotificationOptions>(configuration.GetSection(NotificationOptions.SectionName));

        services.AddScoped<NotificationEditorService>();
        services.AddScoped<RecipientImportService>();
        services.AddScoped<InboxService>();
        services.AddScoped<FanOutService>();

        services.AddJobHandler<PublishNotificationJob>();
        services.AddJobHandler<BackfillNotificationsJob>();
        services.AddHostedService<ScheduledNotificationSweeper>();

        // Late joiners: the groups engine and the roster/email code call these (every registered observer is called).
        services.AddScoped<IGroupMembershipObserver, NotificationAudienceObserver>();
        services.AddScoped<IEmployeeActivationObserver, NotificationAudienceObserver>();

        // Live updates (off by default, Notifications:Realtime:Enabled): one LISTEN connection per process, fanned
        // out to the connected SSE clients. When off, the stream endpoint answers 404 and the listener exits at
        // start without opening a connection; the pg_notify calls on publish/read are harmless without a listener.
        services.AddSingleton<SseHub>();
        services.AddHostedService<NotificationListener>();
        return services;
    }
}
