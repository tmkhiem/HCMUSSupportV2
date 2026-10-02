using System.Diagnostics;
using System.Text.Json;
using HCMUSSupportV2.Sync.Contracts;
using HCMUSSupportV2.Sync.Sources;

namespace HCMUSSupportV2.Sync.Legacy;

/// <summary>
/// <c>sync legacy-emails</c> and <c>sync legacy-datasets</c> (D15): read the v1 data repo, post to <c>/api/integration/v1/legacy/*</c>.
/// The console shows counts only. The detailed server reports (MSCBs, emails) and the privileged-holder list go to the report directory.
/// <para>
/// <b>Dry run:</b> <c>--dry-run</c> alone only reads and parses (nothing is posted, no API settings are needed), like <c>legacy-git</c>.
/// <c>--dry-run --server-dry-run</c> also posts with <c>?dryRun=true</c> so the server validates and reports without writing.
/// </para>
/// </summary>
public sealed class LegacyCommands(string dataPath, IJsonPoster? poster, ReportDirectory reports, TextWriter output)
{
    private const string EmailsPath = "api/integration/v1/legacy/emails";
    private static string DatasetPath(string dataset) => $"api/integration/v1/legacy/datasets/{dataset}";

    public sealed record Options(bool DryRun, bool ServerDryRun, int? UnknownTerm = null);

    // ------------------------------------------------------------------ emails

    /// <returns>0 success, 1 the post failed or the server rejected the batch.</returns>
    public async Task<int> RunEmailsAsync(Options o, CancellationToken ct)
    {
        var map = new MappingReport();
        var config = UsersReader.ResolveConfigDir(dataPath);
        var users = UsersReader.ReadUsers(config, map);
        output.WriteLine($"[legacy-emails] read users={users.Count} emails={users.Sum(u => u.Emails.Count)}");

        // For the owner to decide. Written even on a dry run (it is a local read); never granted by this tool.
        var privileged = UsersReader.ReadPrivileged(config, users);
        if (privileged is not null)
        {
            var file = reports.Write("legacy-privileged-holders", new
            {
                note = "v1 privileged users, resolved through users.json. Nothing is granted automatically: the owner decides who gets which v2 role.",
                permissions = privileged.Permissions, holders = privileged.Holders, unresolved = privileged.Unresolved,
            });
            output.WriteLine($"[legacy-emails] v1 privileged: {string.Join(", ", privileged.Permissions.Select(p => $"{p.Key}={p.Value}"))}; " +
                             $"distinct holders={privileged.Holders.Count} unresolved={privileged.Unresolved.Count}; list written to {file}");
        }
        else output.WriteLine("[legacy-emails] privileged.users.json not found, no holder list written");

        var failed = false;
        if (!Posting(o)) output.WriteLine("[legacy-emails] dry-run: parsed only, nothing posted");
        else
        {
            var sw = Stopwatch.StartNew();
            var outcome = await poster!.PostJsonAsync(EmailsPath, new { users = UsersReader.ToRequest(users) }, o.DryRun, ct);
            failed = !ReportOutcome("legacy-emails", outcome, "legacy-emails", sw, rejectedMeans: null);
        }

        PrintNotes(map);
        return failed ? 1 : 0;
    }

    // ------------------------------------------------------------------ datasets

    /// <returns>0 success, 1 a dataset failed (HTTP error, or the server rejected the rows as invalid).</returns>
    public async Task<int> RunDatasetsAsync(IReadOnlyList<string> datasets, Options o, CancellationToken ct)
    {
        var map = new MappingReport();
        var notifications = V1Reader.ResolveNotificationsDir(dataPath);
        var failures = 0;
        foreach (var dataset in datasets)
        {
            var sw = Stopwatch.StartNew();
            // Each unit is one request. Teaching goes year by year (the server replaces per academic year anyway, and it keeps every
            // request well under the 20 MB limit); research and publications are replaced whole, so they are one request each.
            List<(string Label, string FileLabel, object Body)> requests;
            int rowCount;
            try
            {
                switch (dataset)
                {
                    case LegacyDatasets.Teaching:
                    {
                        var years = TeachingParser.ReadAll(notifications, o.UnknownTerm, map);
                        rowCount = years.Sum(y => y.Rows.Count);
                        output.WriteLine($"[teaching] parsed rows={rowCount} years={years.Count} ({string.Join(", ", years.Select(y => $"{y.AcademicYear}={y.Rows.Count}"))})");
                        requests = years.Select(y => ($"teaching {y.AcademicYear}", $"teaching-{y.AcademicYear}", (object)new { rows = y.Rows })).ToList();
                        break;
                    }
                    case LegacyDatasets.Research:
                    {
                        var rows = ResearchParser.ReadAll(notifications, map);
                        rowCount = rows.Count;
                        output.WriteLine($"[research] parsed rows={rowCount} projects={rows.Select(r => r.Code).Distinct().Count()}");
                        requests = [("research", "research", new { rows })];
                        break;
                    }
                    default:
                    {
                        var rows = PublicationParser.ReadAll(notifications, map);
                        rowCount = rows.Count;
                        output.WriteLine($"[publications] parsed rows={rowCount}");
                        requests = [("publications", "publications", new { rows })];
                        break;
                    }
                }
            }
            catch (Exception e) when (e is IOException or JsonException or InvalidOperationException)
            {
                failures++;
                output.WriteLine($"[{dataset}] FAILED reading: {e.GetType().Name}: {e.Message}");
                continue;
            }

            if (!Posting(o)) { output.WriteLine($"[{dataset}] dry-run: parsed only, nothing posted ({sw.ElapsedMilliseconds} ms)"); continue; }
            if (rowCount == 0) { output.WriteLine($"[{dataset}] nothing to post (no rows found)"); continue; }

            foreach (var (label, fileLabel, body) in requests)
            {
                var outcome = await poster!.PostJsonAsync(DatasetPath(dataset), body, o.DryRun, ct);
                if (!ReportOutcome(label, outcome, "legacy-datasets-" + fileLabel, sw, rejectedMeans: "status"))
                {
                    failures++;
                    if (outcome.StatusCode is 0 or 401 or 403)
                    {
                        output.WriteLine("Aborting: the API is unreachable or rejects the token; remaining datasets not attempted.");
                        PrintNotes(map);
                        return 1;
                    }
                }
            }
        }

        PrintNotes(map);
        return failures == 0 ? 0 : 1;
    }

    // ------------------------------------------------------------------ output

    private static bool Posting(Options o) => !o.DryRun || o.ServerDryRun;

    private void PrintNotes(MappingReport map)
    {
        if (map.Counts.Count > 0) output.WriteLine($"mapping notes: {map}");
    }

    /// <summary>Writes the detailed report to the report dir and prints the counters. False when the post failed or the server rejected the rows.</summary>
    private bool ReportOutcome(string label, JsonPostOutcome outcome, string reportName, Stopwatch sw, string? rejectedMeans)
    {
        if (!outcome.Success)
        {
            output.WriteLine($"[{label}] FAILED: {outcome.Error}");
            return false;
        }

        var file = reports.Write(reportName, outcome.Body!);
        using var doc = JsonDocument.Parse(outcome.Body!);
        var root = doc.RootElement;
        var rejected = rejectedMeans is not null && root.TryGetProperty(rejectedMeans, out var st) && st.ValueKind == JsonValueKind.String && st.GetString() == "rejected";
        output.WriteLine($"[{label}] {(rejected ? "REJECTED " : "")}{Summarize(root)} ({sw.ElapsedMilliseconds} ms); report: {file}");
        return !rejected;
    }

    /// <summary>
    /// Counters of a server report, never its details: numbers and flags as <c>name=value</c>, <c>status</c>, <c>issues</c> as
    /// <c>[kind=count]</c>, and every other array or object as its size (the MSCB and email lists are only in the report file).
    /// </summary>
    public static string Summarize(JsonElement report)
    {
        if (report.ValueKind != JsonValueKind.Object) return "";
        var parts = new List<string>();
        foreach (var p in report.EnumerateObject())
        {
            switch (p.Value.ValueKind)
            {
                case JsonValueKind.Number or JsonValueKind.True or JsonValueKind.False:
                    parts.Add($"{p.Name}={p.Value.ToString().ToLowerInvariant()}");
                    break;
                case JsonValueKind.String when p.Name is "status":
                    parts.Add($"status={p.Value.GetString()}");
                    break;
                case JsonValueKind.Object when p.Name is "issues":
                    parts.Add("issues=" + p.Value.EnumerateObject().Sum(i => i.Value.ValueKind == JsonValueKind.Number ? i.Value.GetInt32() : 0)
                              + (p.Value.EnumerateObject().Any() ? " [" + string.Join(", ", p.Value.EnumerateObject().Select(i => $"{i.Name}={i.Value}")) + "]" : ""));
                    break;
                case JsonValueKind.Array:
                    parts.Add($"{p.Name}={p.Value.GetArrayLength()}");
                    break;
            }
        }
        return string.Join(' ', parts);
    }
}
