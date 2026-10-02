namespace HCMUSSupportV2.Backend.Modules.Admin.EmployeeEmails;

/// <summary>One mapped email. <c>HrmConflict</c> is true when the address is the HRM personal email of a different employee.</summary>
public record ManagedEmailDto(string Email, bool IsPrimary, string? Note, string? AddedBy, DateTimeOffset AddedAt, bool HrmConflict);

/// <summary>One row of the directory: the person, their unit and every mapped email.</summary>
public record ManagedEmployeeDto(
    string Code,
    string FullName,
    string Status,
    string Source,
    long? UnitId,
    string? Unit,
    string? PositionTitle,
    IReadOnlyList<ManagedEmailDto> Emails,
    bool HasHrmConflict);

/// <summary>Keyset page of the directory. <c>Total</c> counts every row matching the filters, not just this page.</summary>
public record ManagedEmployeePageDto(IReadOnlyList<ManagedEmployeeDto> Items, string? NextCursor, int Total);

public record AddEmployeeEmailRequest(string Email, bool? IsPrimary = null, string? Note = null);

public record ImportedEmailItemDto(int Row, string Code, string? FullName, string Email, bool IsPrimary);

public record ImportConflictDto(int Row, string Code, string Email, string Reason, string Message, string? OwnerCode, string? OwnerName);

public record ImportUnknownCodeDto(int Row, string Code, IReadOnlyList<string> Emails);

public record ImportInvalidDto(int Row, string Code, string? Email, string Reason, string Message);

public record ImportWarningDto(int Row, string Code, string Reason, string Message);

/// <summary>
/// Result of an emails import. With <c>DryRun</c> nothing was written. The lists are capped (<c>Truncated</c> is true
/// when anything was cut); the counts are exact.
/// </summary>
public record EmailImportReportDto(
    bool DryRun,
    bool RemoveMissing,
    int Rows,
    int Employees,
    int SkippedEmptyRows,
    int AddedCount,
    int UnchangedCount,
    int RemovedCount,
    int ConflictCount,
    int UnknownCount,
    int InvalidCount,
    IReadOnlyList<ImportedEmailItemDto> Added,
    IReadOnlyList<ImportedEmailItemDto> Removed,
    IReadOnlyList<ImportConflictDto> Conflicts,
    IReadOnlyList<ImportUnknownCodeDto> Unknown,
    IReadOnlyList<ImportInvalidDto> Invalid,
    IReadOnlyList<ImportWarningDto> Warnings,
    bool Truncated);

public static class EmployeeEmailAuditActions
{
    public const string Added = "employee_email.added";
    public const string Removed = "employee_email.removed";
    public const string PrimarySet = "employee_email.primary_set";
    public const string Imported = "employee_email.imported";
}
