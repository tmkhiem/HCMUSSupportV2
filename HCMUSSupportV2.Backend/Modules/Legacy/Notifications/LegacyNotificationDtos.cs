using HCMUSSupportV2.Backend.Modules.Notifications.Editor;

namespace HCMUSSupportV2.Backend.Modules.Legacy.Notifications;

/// <summary>Body of <c>POST legacy/notifications</c>.</summary>
public record LegacyNotificationsRequest(List<LegacyPost>? Posts);

/// <summary>One v1 news post converted to the v2 shape. <c>Recipients</c> maps MSCB to the recipient's rows of variable values.</summary>
public record LegacyPost(
    string? LegacyKey,
    string? Title,
    string? Summary,
    string? BodyMd,
    List<VariableDto>? Variables,
    DateTimeOffset? PublishedAt,
    bool AudienceAll,
    Dictionary<string, List<Dictionary<string, string?>>>? Recipients,
    List<string>? Tags,
    string? Series,
    DateTimeOffset? PinnedUntil,
    bool RequiresAck,
    bool MarkRead);

public static class LegacyOutcomes
{
    public const string Created = "created";
    public const string Updated = "updated";
    public const string Unchanged = "unchanged";
    public const string Rejected = "rejected";
}

/// <summary>Rejection codes besides the markdown codes of <c>IssueCodes</c>.</summary>
public static class LegacyPostIssues
{
    public const string InvalidKey = "INVALID_KEY";
    public const string DuplicateKey = "DUPLICATE_KEY";
    public const string InvalidTitle = "INVALID_TITLE";
    public const string InvalidPublishedAt = "INVALID_PUBLISHED_AT";
    public const string InvalidVariable = "INVALID_VARIABLE";
    public const string InvalidTag = "INVALID_TAG";
    public const string InvalidSeries = "INVALID_SERIES";
    public const string InvalidSummary = "INVALID_SUMMARY";
    public const string RecipientsRequired = "RECIPIENTS_REQUIRED";
    public const string InvalidRecipient = "INVALID_RECIPIENT";
}

public record LegacyPostReport(
    string LegacyKey,
    Guid? Id,
    string Outcome,
    IReadOnlyList<string> Issues,
    int Recipients,
    int Deliveries,
    int NewDeliveries,
    int UnknownEmployees,
    int InactiveEmployees);

public record LegacyNotificationTotals(int Created, int Updated, int Unchanged, int Rejected, int Deliveries, int NewDeliveries);

/// <summary>A finding about one MSCB of one post (<c>unknown_employee</c> or <c>inactive_employee</c>). Contains MSCBs: not for consoles or logs.</summary>
public record LegacyNotificationDetail(string LegacyKey, string Kind, string Code);

public record LegacyNotificationReport(
    bool DryRun,
    LegacyNotificationTotals Totals,
    IReadOnlyList<LegacyPostReport> Posts,
    IReadOnlyList<LegacyNotificationDetail> Details);
