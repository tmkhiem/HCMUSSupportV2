namespace HCMUSSupportV2.Backend.Modules.Admin.RoleGrants;

/// <summary>One row of the role list. <c>Roles</c> holds the assigned roles only (<c>editor</c>, <c>admin</c>); <c>employee</c> is implicit.</summary>
public record RoleRowDto(string Code, string FullName, string? Unit, string Status, string? PrimaryEmail, IReadOnlyList<string> Roles);

public record RoleGrantDto(string Role, string? GrantedBy, string? GrantedByName, DateTimeOffset GrantedAt);

public record RoleDetailDto(
    string Code,
    string FullName,
    string? Unit,
    string Status,
    IReadOnlyList<string> Emails,
    IReadOnlyList<string> Roles,
    IReadOnlyList<RoleGrantDto> Grants);

/// <summary>The complete set of assigned roles for the employee (<c>editor</c>, <c>admin</c>; <c>employee</c> is ignored).</summary>
public record SetRolesRequest(IReadOnlyList<string> Roles);
