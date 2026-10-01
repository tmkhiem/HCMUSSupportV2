using System.Text.Json;

namespace HCMUSSupportV2.Backend.Modules.Identity.Groups;

/// <summary>A group. <c>Rule</c> is the stored rule JSON (rule groups only).</summary>
public record GroupDto(
    long Id,
    string Name,
    string? Description,
    string Kind,
    long? OrgUnitId,
    string? OrgUnitName,
    bool IncludeDescendants,
    JsonElement? Rule,
    int MemberCount,
    string? CreatedBy,
    DateTimeOffset? ArchivedAt,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public record GroupPageDto(IReadOnlyList<GroupDto> Items, string? NextCursor);

/// <summary><c>Kind</c> is <c>static</c> or <c>rule</c> (org-unit groups are generated automatically).</summary>
public record CreateGroupRequest(string Name, string? Description, string Kind, JsonElement? Rule);

/// <summary>
/// Full update. <c>Name</c> is required except for org-unit groups (their name follows the unit); <c>Rule</c> is
/// required for rule groups and must be absent for static ones; <c>IncludeDescendants</c> applies to org-unit groups.
/// </summary>
public record UpdateGroupRequest(string? Name, string? Description, JsonElement? Rule, bool? IncludeDescendants);

public record GroupMemberDto(string Code, string FullName, string? Unit, string Source, DateTimeOffset AddedAt);

public record GroupMemberPageDto(IReadOnlyList<GroupMemberDto> Items, string? NextCursor);

public record MemberCodesRequest(IReadOnlyList<string> Codes);

public record AddMembersResultDto(
    IReadOnlyList<string> Added,
    IReadOnlyList<string> AlreadyMember,
    IReadOnlyList<string> Unknown,
    IReadOnlyList<string> Inactive,
    int MemberCount);

public record RemoveMembersResultDto(IReadOnlyList<string> Removed, IReadOnlyList<string> NotMember, int MemberCount);

/// <summary>Result of a members import. With <c>DryRun</c> nothing was written.</summary>
public record ImportReportDto(
    bool DryRun,
    int Rows,
    IReadOnlyList<string> Added,
    IReadOnlyList<string> AlreadyMember,
    IReadOnlyList<string> Duplicate,
    IReadOnlyList<string> Unknown,
    IReadOnlyList<string> Inactive,
    int MemberCount);

public record PreviewRuleRequest(JsonElement Rule);

public record PreviewSampleDto(string Code, string FullName, string? Unit);

public record PreviewRuleResultDto(int Count, IReadOnlyList<PreviewSampleDto> Sample);

public record RecomputeAcceptedDto(long JobId);
