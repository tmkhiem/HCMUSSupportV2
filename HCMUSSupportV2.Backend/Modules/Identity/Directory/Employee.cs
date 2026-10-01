namespace HCMUSSupportV2.Backend.Modules.Identity.Directory;

/// <summary>A person who can sign in and receive notifications (<c>employees</c>). The primary key is the MSCB.</summary>
public class Employee
{
    /// <summary>MSCB, the natural key (e.g. <c>T0001</c> for synthetic data).</summary>
    public string Code { get; set; } = "";

    public int? HrmId { get; set; }
    public string FullName { get; set; } = "";

    /// <summary>Stored generated column <c>f_unaccent(full_name)</c> (trigram GIN indexed). Never set by the app.</summary>
    public string FullNameUnaccent { get; private set; } = "";

    public long? OrgUnitId { get; set; }
    public long? DepartmentId { get; set; }
    public string? PositionTitle { get; set; }
    public string? AcademicRank { get; set; }
    public string? Degree { get; set; }

    /// <summary><see cref="EmployeeStatuses"/>.</summary>
    public string Status { get; set; } = EmployeeStatuses.Active;

    public string? PhotoUrl { get; set; }

    /// <summary><see cref="EmployeeSources"/>.</summary>
    public string Source { get; set; } = EmployeeSources.Manual;

    public DateTimeOffset? SyncedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public bool IsActive => Status == EmployeeStatuses.Active;
}

public static class EmployeeStatuses
{
    public const string Active = "active";
    public const string Inactive = "inactive";
    public const string Retired = "retired";
}

public static class EmployeeSources
{
    public const string Hrm = "hrm";
    public const string Manual = "manual";
}
