// Request bodies of POST /api/integration/v1/legacy/{emails|datasets/...} (D15, docs/LEGACY-MIGRATION.md). Property names are
// serialised camelCase. The dataset rows copy Modules/Legacy/Datasets/LegacyDatasetDtos.cs of the backend.
namespace HCMUSSupportV2.Sync.Contracts;

/// <summary>One v1 user of <c>config/users.json</c>: <c>code</c> is the MSCB (the v1 <c>id</c>).</summary>
public record LegacyEmailUser(string Code, string Name, IReadOnlyList<string> Emails);

public record LegacyTeachingRow(
    string EmployeeCode, string AcademicYear, int Term, string? CourseCode, string CourseName, string? ClassCode,
    string? Level, int Periods, decimal StandardHours);

public record LegacyResearchRow(
    string Code, string Title, string? Level, string? ResearchType, decimal? Funding, string? PeriodText, string? AcceptedOn,
    string? Result, string? EmployeeCode, string Role);

public record LegacyPublicationRow(
    string? Doi, string? Eid, string Title, string? Venue, int? Year, string? Details, string? Url, IReadOnlyList<string> Authors);

public static class LegacyDatasets
{
    public const string Teaching = "teaching";
    public const string Research = "research";
    public const string Publications = "publications";

    /// <summary>Posting order (the three are independent).</summary>
    public static readonly IReadOnlyList<string> All = [Teaching, Research, Publications];

    public static IReadOnlyList<string> Parse(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Trim().Equals("all", StringComparison.OrdinalIgnoreCase)) return All;
        var wanted = value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Select(v => v.ToLowerInvariant()).ToHashSet();
        var unknown = wanted.Where(w => !All.Contains(w)).ToList();
        if (unknown.Count > 0) throw new ArgumentException($"Unknown dataset(s): {string.Join(", ", unknown)}. Valid: {string.Join(", ", All)}.");
        return All.Where(wanted.Contains).ToList();
    }
}
