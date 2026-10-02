using HCMUSSupportV2.Sync.Contracts;
using HCMUSSupportV2.Sync.Legacy;
using HCMUSSupportV2.Sync.Sources;
using Microsoft.Extensions.Configuration;

namespace HCMUSSupportV2.Sync;

/// <summary>
/// Hand-rolled argument parsing. Verbs: <c>sync hrm|legacy-git [--path P] [--datasets x,y|all] [--dry-run] [--force]</c> and the one-off
/// D15 migration verbs <c>sync legacy-emails|legacy-datasets --path P [--datasets x,y|all] [--dry-run [--server-dry-run]] [--report DIR]</c>.
/// </summary>
public static class Cli
{
    public const string Usage = """
        HCMUSSupportV2.Sync - pushes HRM snapshots to the ingest API (/api/integration/v1).

        Usage:
          sync legacy-git --path <SupportHCMUSData> [--datasets all|a,b] [--dry-run] [--force]
          sync hrm [--datasets all|a,b] [--dry-run] [--force]
          sync legacy-emails --path <SupportHCMUSData> [--dry-run [--server-dry-run]] [--report <dir>]
          sync legacy-datasets --path <SupportHCMUSData> [--datasets all|teaching,research,publications] [--dry-run [--server-dry-run]]
                               [--report <dir>] [--unknown-term skip|1|2|3]

        Datasets: org-units, employees, profiles, salary, positions, commendations, degrees, trainings, business-trips, innovations
        Options:
          --dry-run   read and map only; print row counts per dataset, post nothing (no API settings needed)
          --force     pass ?force=true (accept a snapshot below 80 percent of the previous one)
        One-off v1 migration (D15, see docs/LEGACY-MIGRATION.md; API key scope legacy.import; the console shows counts only):
          --server-dry-run  together with --dry-run: also post with ?dryRun=true, so the server validates and reports but writes nothing
          --report <dir>    where the detailed reports (MSCBs, emails) go; default %LOCALAPPDATA%\HCMUSSupportV2\legacy.
                            A directory inside a git work tree is refused.
          --unknown-term    teaching lines without a term (postgraduate lines): skip them (default) or file them under term 1, 2 or 3
        Configuration: appsettings.json section "Sync", overridden by environment Sync__ApiBaseUrl, Sync__ApiToken, Sync__HrmConnectionString.
        Exit code: 0 success, 1 a dataset failed, 2 bad usage or configuration.
        """;

    public const string LegacyEmails = "legacy-emails";
    public const string LegacyDatasetsVerb = "legacy-datasets";

    public sealed record Options(string Source, string? Path, string? Datasets, bool DryRun, bool Force,
        string? ReportDir = null, bool ServerDryRun = false, string? UnknownTerm = null)
    {
        /// <summary>The one-off D15 verbs, which post to <c>/legacy/*</c> and write detailed reports to a directory.</summary>
        public bool IsLegacyMigration => Source is LegacyEmails or LegacyDatasetsVerb;
    }

    public static Options? Parse(string[] args, TextWriter err)
    {
        var a = args.ToList();
        if (a.Count > 0 && a[0].Equals("sync", StringComparison.OrdinalIgnoreCase)) a.RemoveAt(0);
        if (a.Count == 0 || a[0] is "-h" or "--help" or "help") return null;
        var source = a[0].ToLowerInvariant();
        string? path = null, datasets = null, report = null, unknownTerm = null;
        bool dry = false, force = false, serverDry = false;
        for (var i = 1; i < a.Count; i++)
        {
            switch (a[i])
            {
                case "--path" when i + 1 < a.Count: path = a[++i]; break;
                case "--datasets" when i + 1 < a.Count: datasets = a[++i]; break;
                case "--dry-run": dry = true; break;
                case "--force": force = true; break;
                case "--report" when i + 1 < a.Count: report = a[++i]; break;
                case "--server-dry-run": serverDry = true; break;
                case "--unknown-term" when i + 1 < a.Count: unknownTerm = a[++i]; break;
                default: err.WriteLine($"Unknown or incomplete argument: {a[i]}"); return null;
            }
        }
        if (source is not ("legacy-git" or "hrm" or LegacyEmails or LegacyDatasetsVerb)) { err.WriteLine($"Unknown source '{a[0]}'."); return null; }

        var migration = source is LegacyEmails or LegacyDatasetsVerb;
        if (!migration && (report is not null || serverDry || unknownTerm is not null))
        {
            err.WriteLine("--report, --server-dry-run and --unknown-term only apply to legacy-emails and legacy-datasets.");
            return null;
        }
        if (migration && force) { err.WriteLine("--force does not apply to legacy-emails and legacy-datasets."); return null; }
        if (serverDry && !dry) { err.WriteLine("--server-dry-run needs --dry-run (a plain dry run posts nothing)."); return null; }
        if (source == LegacyEmails && (datasets is not null || unknownTerm is not null)) { err.WriteLine("legacy-emails takes neither --datasets nor --unknown-term."); return null; }
        return new Options(source, path, datasets, dry, force, report, serverDry, unknownTerm);
    }

    public static SyncOptions LoadOptions()
    {
        var config = new ConfigurationBuilder()
            .SetBasePath(AppContext.BaseDirectory)
            .AddJsonFile("appsettings.json", optional: true)
            .AddJsonFile("appsettings.local.json", optional: true)
            .AddEnvironmentVariables()
            .Build();
        return config.GetSection("Sync").Get<SyncOptions>() ?? new SyncOptions();
    }

    public static async Task<int> RunAsync(string[] args, TextWriter output, TextWriter err)
    {
        var o = Parse(args, err);
        if (o is null) { output.WriteLine(Usage); return 2; }
        if (o.IsLegacyMigration) return await RunLegacyMigrationAsync(o, output, err);

        IReadOnlyList<string> datasets;
        try { datasets = Datasets.Parse(o.Datasets); }
        catch (ArgumentException e) { err.WriteLine(e.Message); return 2; }

        var settings = LoadOptions();
        using var cts = new CancellationTokenSource();
        Console.CancelKeyPress += (_, e) => { e.Cancel = true; cts.Cancel(); };

        IngestClient? client = null;
        try
        {
            IDatasetSource source;
            if (o.Source == "legacy-git")
            {
                if (string.IsNullOrWhiteSpace(o.Path)) { err.WriteLine("legacy-git needs --path <SupportHCMUSData>."); return 2; }
                source = new LegacyGitSource(o.Path);
            }
            else
            {
                if (string.IsNullOrWhiteSpace(settings.HrmConnectionString)) { err.WriteLine("Sync:HrmConnectionString is not configured."); return 2; }
                source = new HrmSource(settings.HrmConnectionString);
            }

            if (!o.DryRun) client = new IngestClient(settings);
            output.WriteLine($"sync {source.Name}: {datasets.Count} dataset(s){(o.DryRun ? " (dry run)" : "")}");
            return await new SyncRunner(source, client, output).RunAsync(datasets, o.DryRun, o.Force, cts.Token);
        }
        catch (InvalidOperationException e) { err.WriteLine(e.Message); return 2; }
        catch (DirectoryNotFoundException e) { err.WriteLine(e.Message); return 2; }
        finally { client?.Dispose(); }
    }

    /// <summary><c>legacy-emails</c> and <c>legacy-datasets</c>: counts on the console, details in the report directory.</summary>
    private static async Task<int> RunLegacyMigrationAsync(Options o, TextWriter output, TextWriter err)
    {
        if (string.IsNullOrWhiteSpace(o.Path)) { err.WriteLine($"{o.Source} needs --path <SupportHCMUSData>."); return 2; }
        if (!Directory.Exists(o.Path)) { err.WriteLine($"Data repo not found: {o.Path}"); return 2; }

        IReadOnlyList<string> datasets = [];
        int? unknownTerm = null;
        try
        {
            if (o.Source == LegacyDatasetsVerb) datasets = LegacyDatasets.Parse(o.Datasets);
            if (o.UnknownTerm is { } t && !t.Equals("skip", StringComparison.OrdinalIgnoreCase))
                unknownTerm = t is "1" or "2" or "3" ? int.Parse(t) : throw new ArgumentException("--unknown-term must be skip, 1, 2 or 3.");
        }
        catch (ArgumentException e) { err.WriteLine(e.Message); return 2; }

        ReportDirectory reports;
        try { reports = ReportDirectory.Resolve(o.ReportDir); }
        catch (InvalidOperationException e) { err.WriteLine(e.Message); return 2; }

        using var cts = new CancellationTokenSource();
        Console.CancelKeyPress += (_, e) => { e.Cancel = true; cts.Cancel(); };

        IngestClient? client = null;
        try
        {
            if (!o.DryRun || o.ServerDryRun) client = new IngestClient(LoadOptions());
            var commands = new LegacyCommands(o.Path, client, reports, output);
            var options = new LegacyCommands.Options(o.DryRun, o.ServerDryRun, unknownTerm);
            output.WriteLine($"sync {o.Source}{(o.DryRun ? (o.ServerDryRun ? " (dry run, the server validates)" : " (dry run)") : "")}");
            return o.Source == LegacyEmails
                ? await commands.RunEmailsAsync(options, cts.Token)
                : await commands.RunDatasetsAsync(datasets, options, cts.Token);
        }
        catch (InvalidOperationException e) { err.WriteLine(e.Message); return 2; }
        catch (IOException e) { err.WriteLine(e.Message); return 2; }
        finally { client?.Dispose(); }
    }
}
