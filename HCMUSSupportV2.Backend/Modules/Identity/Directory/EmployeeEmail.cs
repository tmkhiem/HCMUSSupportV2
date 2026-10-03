namespace HCMUSSupportV2.Backend.Modules.Identity.Directory;

/// <summary>
/// An email address allowed to sign in as an employee (<c>employee_emails</c>). The case-insensitive email is the
/// primary key, so an address maps to exactly one MSCB; an employee may have many addresses.
/// </summary>
public class EmployeeEmail
{
    public string Email { get; set; } = "";
    public string EmployeeCode { get; set; } = "";
    public bool IsPrimary { get; set; }
    public string? Note { get; set; }

    /// <summary>Employee code of the editor who added the mapping; null for seeded or system-made rows.</summary>
    public string? AddedBy { get; set; }

    public DateTimeOffset AddedAt { get; set; }

    /// <summary>
    /// Set when an editor confirmed that this address belongs to this employee although it equals another employee's HRM
    /// personal email. An accepted mapping is no longer reported as an HRM conflict.
    /// </summary>
    public DateTimeOffset? HrmConflictAcceptedAt { get; set; }

    /// <summary>Employee code of the editor who accepted the conflict.</summary>
    public string? HrmConflictAcceptedBy { get; set; }
}
