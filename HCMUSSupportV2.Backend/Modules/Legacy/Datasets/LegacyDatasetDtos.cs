namespace HCMUSSupportV2.Backend.Modules.Legacy.Datasets;

// Request bodies of POST /api/integration/v1/legacy/datasets/{teaching|research|publications}. The rows have the shape of the
// D04 .xlsx templates (see docs/LEGACY-MIGRATION.md). Everything is optional at the binding level, so that a missing or blank
// value shows up as a bad value in the import report instead of failing the whole request with a 400.

/// <summary>One teaching line. <c>academicYear</c> is <c>2023-2024</c>; <c>term</c> is 1, 2 or 3.</summary>
public record LegacyTeachingRow(
    string? EmployeeCode, string? AcademicYear, int? Term, string? CourseCode, string? CourseName, string? ClassCode,
    string? Level, int? Periods, decimal? StandardHours);

public record LegacyTeachingRequest(IReadOnlyList<LegacyTeachingRow?>? Rows);

/// <summary>One project member (the project fields repeat on every member row, as in the template). <c>role</c> is a snake-case code.</summary>
public record LegacyResearchRow(
    string? Code, string? Title, string? Level, string? ResearchType, decimal? Funding, string? PeriodText, string? AcceptedOn,
    string? Result, string? EmployeeCode, string? Role);

public record LegacyResearchRequest(IReadOnlyList<LegacyResearchRow?>? Rows);

/// <summary>One publication with its authors (MSCBs, in author order).</summary>
public record LegacyPublicationRow(
    string? Doi, string? Eid, string? Title, string? Venue, int? Year, string? Details, string? Url, IReadOnlyList<string?>? Authors);

public record LegacyPublicationRequest(IReadOnlyList<LegacyPublicationRow?>? Rows);
