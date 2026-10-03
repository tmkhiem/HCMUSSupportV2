using HCMUSSupportV2.Backend.Modules.Admin.EmployeeEmails;
using HCMUSSupportV2.Backend.Modules.Notifications.Editor;

namespace HCMUSSupportV2.Backend.Modules.Legacy;

// ---- roster and emails (config/users.json) ----

/// <summary>One entry of the v1 <c>config/users.json</c>: <c>{id, name, emails[]}</c> (<c>id</c> is the MSCB).</summary>
public record LegacyUserDto(string? Id, string? Name, List<string>? Emails);

public record LegacyRosterRequest(List<LegacyUserDto>? Users);

/// <summary>
/// The email import report plus the roster-level findings. The lists inside <see cref="Import"/> contain emails and, in
/// warning texts, names: the migration tool prints counts only and writes the details to a file the operator names.
/// </summary>
public record LegacyRosterReportDto(
    EmailImportReportDto Import,
    int InputUsers,
    int EmptyIdCount,
    int NoEmailCount,
    int DuplicateIdCount,
    int InactiveCount,
    IReadOnlyList<string> InactiveCodes);

// ---- roles ----

/// <summary>A role to grant to the person with this MSCB and/or email (at least one of the two).</summary>
public record LegacyGrantDto(string? Role, string? Code, string? Email);

public record LegacyRolesRequest(List<LegacyGrantDto>? Grants, bool MapEmail = true);

/// <summary>Outcome: <c>granted</c>, <c>already</c>, or a refusal (<c>invalid_role</c>, <c>invalid_request</c>, <c>employee_not_found</c>, <c>email_not_mapped</c>, <c>email_mismatch</c>, <c>email_conflict</c>).</summary>
public record LegacyGrantResultDto(string? Code, string Role, string Outcome, bool EmailMapped, bool EmployeeActive, string? Message);

public record LegacyRolesReportDto(bool DryRun, IReadOnlyList<LegacyGrantResultDto> Results);

// ---- news ----

/// <summary>One converted v1 news file (or the update-info banner). Rows are <c>MSCB -> [ {variable key -> value} ]</c>.</summary>
public record LegacyNewsPostDto(
    string? Key,
    string? Title,
    string? PublishedOn,
    string? BodyMd,
    List<VariableDto>? Variables,
    Dictionary<string, List<Dictionary<string, string?>>>? Rows,
    string? SeriesName,
    List<string>? TagNames,
    bool? AudienceAll);

/// <summary><c>Kind</c> is <c>news</c> (default) or <c>banner</c>. <c>AllCoverage</c> is the share of the active roster (people with an email) a post without variables must cover to become <c>audience_all</c>.</summary>
public record LegacyNewsRequest(List<LegacyNewsPostDto>? Posts, string? Kind = null, double AllCoverage = 0.9);

/// <summary>Action: <c>created</c>, <c>would_create</c>, <c>unchanged</c>, <c>changed_skipped</c> (the v1 file changed since it was imported; nothing is touched) or <c>rejected</c>.</summary>
public record LegacyNewsItemDto(
    string Key,
    string Action,
    string Audience,
    int Recipients,
    int UnknownMscbs,
    int InactiveMscbs,
    double Coverage,
    string? Series,
    IReadOnlyList<string> Tags,
    IReadOnlyList<string> Issues);

public record LegacyNewsReportDto(bool DryRun, int Created, int Unchanged, int Changed, int Rejected, IReadOnlyList<LegacyNewsItemDto> Items);

// ---- datasets ----

public record LegacyTeachingRowDto(
    string? EmployeeCode, string? AcademicYear, string? Program, int? Term, string? Module, string? CourseCode, string? CourseName,
    string? ClassCode, string? Track, string? Activity, int Periods, decimal StandardHours);

public record LegacyTeachingRequest(List<LegacyTeachingRowDto>? Rows);

/// <summary>One line per member (the project columns repeat), like the xlsx template.</summary>
public record LegacyResearchRowDto(
    string? Code, string? Title, string? Level, string? Type, decimal? Funding, string? Period, string? AcceptedOn, string? Result,
    string? Mscb, string? Role);

public record LegacyResearchRequest(List<LegacyResearchRowDto>? Rows);

public record LegacyPublicationDto(string? Doi, string? Eid, string? Title, string? Venue, int? Year, string? Details, string? Url, List<string>? Authors);

public record LegacyPublicationsRequest(List<LegacyPublicationDto>? Rows);

public record LegacyIssueDto(int Row, string Column, string Message);

/// <summary>
/// Result of a dataset step. <c>Applied</c> is false for a dry run and for a no-op. <c>Skipped</c> lists scopes left alone
/// because an admin import already owns them (the legacy migration never overwrites those). <c>NormalizedMscbCount</c> counts
/// distinct v1 ids that were not an MSCB as typed but became one after removing a leading underscore or quote (Excel text) or
/// padding a short number to four digits (Excel dropped the zero).
/// </summary>
public record LegacyDatasetReportDto(
    string Dataset,
    bool DryRun,
    bool Applied,
    int Total,
    int NewCount,
    int UpdatedCount,
    int RemovedCount,
    IReadOnlyList<string> UnknownMscbs,
    int UnknownMscbCount,
    int DroppedMemberRows,
    int NormalizedMscbCount,
    IReadOnlyList<LegacyIssueDto> Bad,
    int BadCount,
    IReadOnlyList<string> Skipped,
    IReadOnlyList<string> Years);
