using NpgsqlTypes;

namespace HCMUSSupportV2.Backend.Modules.Notifications.Domain;

public class Tag
{
    public long Id { get; set; }
    public string Name { get; set; } = "";
    public string? Color { get; set; }
    public int Sort { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public class NotificationSeries
{
    public long Id { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public static class NotificationStatuses
{
    public const string Draft = "draft";
    public const string Scheduled = "scheduled";
    public const string Published = "published";
    public const string Archived = "archived";
}

public class Notification
{
    /// <summary>UUID v7 generated in the app.</summary>
    public Guid Id { get; set; }
    public long? SeriesId { get; set; }
    public string Title { get; set; } = "";
    public string Summary { get; set; } = "";

    /// <summary>True when an editor typed the summary; false when it is derived from the first paragraph.</summary>
    public bool SummaryIsCustom { get; set; }
    public string BodyMd { get; set; } = "";

    /// <summary>Plain text of the body (placeholders as their key); feeds the search column.</summary>
    public string ContentText { get; set; } = "";

    /// <summary>jsonb: [{key,label,type}].</summary>
    public string Variables { get; set; } = "[]";
    public string Status { get; set; } = NotificationStatuses.Draft;
    public DateTimeOffset? PublishAt { get; set; }
    public DateTimeOffset? PublishedAt { get; set; }
    public DateTimeOffset? ExpiresAt { get; set; }
    public bool AudienceAll { get; set; }
    public int RecipientCount { get; set; }
    public int Version { get; set; } = 1;

    /// <summary>Set when the content is edited after publishing; the inbox shows "updated" for deliveries older than this.</summary>
    public DateTimeOffset? ContentUpdatedAt { get; set; }
    public string? CreatedBy { get; set; }
    public string? UpdatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    /// <summary>Stored generated tsvector (never set by the app).</summary>
    public NpgsqlTsVector Search { get; private set; } = null!;

    /// <summary>PostgreSQL xmin; database-level optimistic concurrency.</summary>
    public uint RowVersion { get; set; }
}

public class NotificationTag
{
    public Guid NotificationId { get; set; }
    public long TagId { get; set; }
}

public class NotificationRevision
{
    public Guid NotificationId { get; set; }
    public int Version { get; set; }
    public string Title { get; set; } = "";
    public string Summary { get; set; } = "";
    public string Content { get; set; } = "";
    public string Variables { get; set; } = "[]";
    public string? EditedBy { get; set; }
    public DateTimeOffset EditedAt { get; set; }
}

public static class AudienceKinds
{
    public const string All = "all";
    public const string Group = "group";
    public const string Employee = "employee";
    public const string Import = "import";
}

public class NotificationAudience
{
    public long Id { get; set; }
    public Guid NotificationId { get; set; }
    public string Kind { get; set; } = AudienceKinds.Group;
    public long? GroupId { get; set; }
    public string? EmployeeCode { get; set; }
    public Guid? ImportId { get; set; }
}

public class NotificationDelivery
{
    public string EmployeeCode { get; set; } = "";
    public Guid NotificationId { get; set; }

    /// <summary>jsonb array of row objects (one item per imported row); null when the recipient has no variables.</summary>
    public string? Vars { get; set; }
    public DateTimeOffset DeliveredAt { get; set; }
    public DateTimeOffset? DismissedAt { get; set; }

    /// <summary>Telemetry for editors/admins only: the employee's client has fetched the inbox listing containing this notification.</summary>
    public bool Fetched { get; set; }

    /// <summary>Telemetry for editors/admins only: the employee opened the notification to read its details.</summary>
    public bool Opened { get; set; }
}

public class NotificationAttachment
{
    public Guid Id { get; set; }
    public Guid NotificationId { get; set; }
    public Guid FileId { get; set; }
    public int Sort { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public static class ImportStatuses
{
    public const string Validated = "validated";
    public const string Applied = "applied";
    public const string Rejected = "rejected";
}

public class NotificationRecipientImport
{
    public Guid Id { get; set; }
    public Guid NotificationId { get; set; }
    public Guid? FileId { get; set; }
    public string Status { get; set; } = ImportStatuses.Validated;

    /// <summary>jsonb: [{key,label,header}] the variable columns found in the file.</summary>
    public string Columns { get; set; } = "[]";

    /// <summary>jsonb object: MSCB -> array of row objects (variable key -> text).</summary>
    public string Rows { get; set; } = "{}";

    /// <summary>jsonb validation report.</summary>
    public string Report { get; set; } = "{}";
    public string? CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? AppliedAt { get; set; }
}
