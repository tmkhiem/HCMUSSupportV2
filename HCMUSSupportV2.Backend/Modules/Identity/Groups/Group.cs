namespace HCMUSSupportV2.Backend.Modules.Identity.Groups;

/// <summary>A named set of employees used to target notifications (<c>groups</c>). Schema only: the engine is D06.</summary>
public class Group
{
    public long Id { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }

    /// <summary><see cref="GroupKinds"/>.</summary>
    public string Kind { get; set; } = GroupKinds.Static;

    public long? OrgUnitId { get; set; }
    public bool IncludeDescendants { get; set; }

    /// <summary>JSON filter (jsonb) for rule groups.</summary>
    public string? Rule { get; set; }

    /// <summary>Maintained by the groups engine.</summary>
    public int MemberCount { get; set; }

    public string? CreatedBy { get; set; }
    public DateTimeOffset? ArchivedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public static class GroupKinds
{
    public const string Static = "static";
    public const string OrgUnit = "org_unit";
    public const string Rule = "rule";
}

/// <summary>One employee in one group (<c>group_members</c>).</summary>
public class GroupMember
{
    public long GroupId { get; set; }
    public string EmployeeCode { get; set; } = "";

    /// <summary><see cref="GroupMemberSources"/>.</summary>
    public string Source { get; set; } = GroupMemberSources.Manual;

    public string? AddedBy { get; set; }
    public DateTimeOffset AddedAt { get; set; }
}

public static class GroupMemberSources
{
    public const string Manual = "manual";
    public const string Computed = "computed";
}
