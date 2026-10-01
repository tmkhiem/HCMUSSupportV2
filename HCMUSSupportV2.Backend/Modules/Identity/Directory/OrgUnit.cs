namespace HCMUSSupportV2.Backend.Modules.Identity.Directory;

/// <summary>An organisational unit (faculty, department, office) mirrored from HRM (<c>org_units</c>).</summary>
public class OrgUnit
{
    public long Id { get; set; }

    /// <summary>The unit's id in HRM (unique).</summary>
    public int HrmId { get; set; }

    public long? ParentId { get; set; }

    /// <summary><see cref="OrgUnitKinds"/>.</summary>
    public string Kind { get; set; } = OrgUnitKinds.Unit;

    public string Name { get; set; } = "";
    public string? Code { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public static class OrgUnitKinds
{
    public const string Unit = "unit";
    public const string Department = "department";
}
