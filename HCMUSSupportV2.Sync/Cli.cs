using HCMUSSupportV2.Sync.Contracts;
using HCMUSSupportV2.Sync.Sources;
using Microsoft.Extensions.Configuration;

namespace HCMUSSupportV2.Sync;

/// <summary>Hand-rolled argument parsing (two verbs, four options): <c>sync legacy-git|hrm [--path P] [--datasets x,y|all] [--dry-run] [--force]</c>.</summary>
public static class Cli
{
    public const string Usage = """
        HCMUSSupportV2.Sync - pushes HRM snapshots to the ingest API (/api/integration/v1).

        Usage:
          sync legacy-git --path <SupportHCMUSData> [--datasets all|a,b] [--dry-run] [--force]
          sync hrm [--datasets all|a,b] [--dry-run] [--force]

        Datasets: org-units, employees, profiles, salary, positions, commendations, degrees, trainings, business-trips, innovations
        Options:
          --dry-run   read and map only; print row counts per dataset, post nothing (no API settings needed)
          --force     pass ?force=true (accept a snapshot below 80 percent of the previous one)
        Configuration: appsettings.json section "Sync", overridden by environment Sync__ApiBaseUrl, Sync__ApiToken, Sync__HrmConnectionString.
        Exit code: 0 success, 1 a dataset failed, 2 bad usage or configuration.
        """;

    public sealed record Options(string Source, string? Path, string? Datasets, bool DryRun, bool Force);

    public static Options? Parse(string[] args, TextWriter err)
    {
        var a = args.ToList();
        if (a.Count > 0 && a[0].Equals("sync", StringComparison.OrdinalIgnoreCase)) a.RemoveAt(0);
        if (a.Count == 0 || a[0] is "-h" or "--help" or "help") return null;
        var source = a[0].ToLowerInvariant();
        string? path = null, datasets = null;
        bool dry = false, force = false;
        for (var i = 1; i < a.Count; i++)
        {
            switch (a[i])
            {
                case "--path" when i + 1 < a.Count: path = a[++i]; break;
                case "--datasets" when i + 1 < a.Count: datasets = a[++i]; break;
                case "--dry-run": dry = true; break;
                case "--force": force = true; break;
                default: err.WriteLine($"Unknown or incomplete argument: {a[i]}"); return null;
            }
        }
        if (source is not ("legacy-git" or "hrm")) { err.WriteLine($"Unknown source '{a[0]}'."); return null; }
        return new Options(source, path, datasets, dry, force);
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
}
