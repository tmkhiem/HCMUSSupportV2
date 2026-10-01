namespace HCMUSSupportV2.Backend.Modules.Identity.Authorization;

/// <summary>Grants <c>editor</c> or <c>admin</c> to an employee (<c>role_assignments</c>). "employee" is implicit.</summary>
public class RoleAssignment
{
    public string EmployeeCode { get; set; } = "";
    public string Role { get; set; } = "";

    /// <summary>Employee code of the admin who granted the role; null for bootstrap or seeded grants.</summary>
    public string? GrantedBy { get; set; }

    public DateTimeOffset GrantedAt { get; set; }
}

public static class Roles
{
    /// <summary>Implicit role of every signed-in employee; never stored in <c>role_assignments</c>.</summary>
    public const string Employee = "employee";
    public const string Editor = "editor";
    public const string Admin = "admin";

    /// <summary>The roles that can be stored in <c>role_assignments</c>.</summary>
    public static readonly string[] Assignable = [Editor, Admin];
}
