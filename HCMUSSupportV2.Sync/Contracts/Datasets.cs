namespace HCMUSSupportV2.Sync.Contracts;

/// <summary>Ingest dataset names (route segment of POST /api/integration/v1/{dataset}) in dependency order.</summary>
public static class Datasets
{
    public const string OrgUnits = "org-units";
    public const string Employees = "employees";
    public const string Profiles = "profiles";
    public const string Salary = "salary";
    public const string Positions = "positions";
    public const string Commendations = "commendations";
    public const string Degrees = "degrees";
    public const string Trainings = "trainings";
    public const string BusinessTrips = "business-trips";
    public const string Innovations = "innovations";

    /// <summary>Posting order: org units and employees first, child rows reference them.</summary>
    public static readonly IReadOnlyList<string> All =
    [
        OrgUnits, Employees, Profiles, Salary, Positions, Commendations, Degrees, Trainings, BusinessTrips, Innovations,
    ];

    /// <summary>Resolve a <c>--datasets</c> value: <c>all</c> or a comma-separated list. Result is in dependency order.</summary>
    public static IReadOnlyList<string> Parse(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Trim().Equals("all", StringComparison.OrdinalIgnoreCase)) return All;
        var wanted = value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(v => v.ToLowerInvariant()).ToHashSet();
        var unknown = wanted.Where(w => !All.Contains(w)).ToList();
        if (unknown.Count > 0)
            throw new ArgumentException($"Unknown dataset(s): {string.Join(", ", unknown)}. Valid: {string.Join(", ", All)}.");
        return All.Where(wanted.Contains).ToList();
    }
}
