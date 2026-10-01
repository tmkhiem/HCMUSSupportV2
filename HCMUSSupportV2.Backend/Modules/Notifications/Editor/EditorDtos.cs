namespace HCMUSSupportV2.Backend.Modules.Notifications.Editor;

/// <summary>A declared placeholder. <c>Type</c> is text, date, number or money.</summary>
public record VariableDto(string Key, string? Label, string? Type);

public record TagDto(long Id, string Name, string? Color, int Sort);

public record SeriesDto(long Id, string Name, string? Description);

public record TagRequest(string Name, string? Color, int? Sort);

public record SeriesRequest(string Name, string? Description);

/// <summary>Create (Version ignored) or update (Version required) a notification.</summary>
public record NotificationWriteRequest(
    int? Version,
    string? Title,
    long? SeriesId,
    string? Summary,
    string? BodyMd,
    List<VariableDto>? Variables,
    List<long>? TagIds,
    DateTimeOffset? ExpiresAt,
    DateTimeOffset? PinnedUntil,
    bool RequiresAck,
    bool AudienceAll,
    List<long>? GroupIds,
    List<string>? EmployeeCodes);

public record ScheduleRequest(DateTimeOffset PublishAt);

public record PersonRef(string Code, string? FullName);

public record GroupRef(long Id, string Name, int MemberCount);

public record EmployeeRef(string Code, string? FullName, string? Status);

public record ImportSummaryDto(Guid ImportId, string Status, int Rows, int DistinctEmployees, DateTimeOffset? AppliedAt);

public record AudienceDto(bool All, IReadOnlyList<GroupRef> Groups, IReadOnlyList<EmployeeRef> Employees, ImportSummaryDto? Import);

public record AttachmentDto(Guid Id, Guid FileId, string FileName, string ContentType, long SizeBytes);

public record ManageNotificationListItem(
    Guid Id,
    string Title,
    string Status,
    long? SeriesId,
    string? SeriesName,
    IReadOnlyList<TagDto> Tags,
    DateTimeOffset? PublishAt,
    DateTimeOffset? PublishedAt,
    DateTimeOffset? ExpiresAt,
    bool RequiresAck,
    bool AudienceAll,
    int RecipientCount,
    int ReadCount,
    int AckCount,
    double ReadPercent,
    int Version,
    DateTimeOffset UpdatedAt);

public record ManageNotificationDto(
    Guid Id,
    string Title,
    string Summary,
    bool SummaryIsCustom,
    string BodyMd,
    string ContentText,
    IReadOnlyList<VariableDto> Variables,
    string Status,
    long? SeriesId,
    string? SeriesName,
    IReadOnlyList<TagDto> Tags,
    DateTimeOffset? PublishAt,
    DateTimeOffset? PublishedAt,
    DateTimeOffset? ExpiresAt,
    DateTimeOffset? PinnedUntil,
    bool RequiresAck,
    AudienceDto Audience,
    IReadOnlyList<AttachmentDto> Attachments,
    int RecipientCount,
    int ReadCount,
    int AckCount,
    int Version,
    PersonRef? CreatedBy,
    PersonRef? UpdatedBy,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public record RevisionDto(int Version, string Title, string Summary, string BodyMd, IReadOnlyList<VariableDto> Variables, PersonRef? EditedBy, DateTimeOffset EditedAt);

public record DayStat(string Date, int Reads, int CumulativeReads, double CumulativePercent);

public record NotificationStatsDto(
    int RecipientCount,
    int ReadCount,
    int AckCount,
    double ReadPercent,
    double AckPercent,
    bool RequiresAck,
    IReadOnlyList<DayStat> ReadsByDay);

public record PreviewVarsDto(
    string EmployeeCode,
    string? FullName,
    bool EmployeeExists,
    string Source,
    Guid? ImportId,
    System.Text.Json.Nodes.JsonNode? Rows,
    bool InAudience,
    IReadOnlyList<string> AudienceReasons,
    bool InPendingImport);

public record ImageUploadDto(string Url, Guid FileId);
