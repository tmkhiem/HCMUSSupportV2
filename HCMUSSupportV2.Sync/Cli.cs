using HCMUSSupportV2.Sync.Contracts;
using HCMUSSupportV2.Sync.Migration;
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
          sync legacy-migrate --path <SupportHCMUSData> [--steps all|roster,roles,teaching,research,papers]
                              [--admin <email:mscb> ...] [--apply] [--report <file>]

        Datasets: org-units, employees, profiles, salary, positions, commendations, degrees, trainings, business-trips, innovations
        Options:
          --dry-run   read and map only; print row counts per dataset, post nothing (no API settings needed)
          --force     pass ?force=true (accept a snapshot below 80 percent of the previous one)
        Configuration: appsettings.json section "Sync", overridden by environment Sync__ApiBaseUrl, Sync__ApiToken, Sync__HrmConnectionString.
        legacy-migrate is the one-off D15 migration (docs/MIGRATION.md): a dry run unless --apply, idempotent, scope legacy.import.
          --admin    grants admin to this person (repeatable; or Sync:Legacy:Admins as "email:mscb" strings in appsettings.local.json)
          --report   writes the full server answers (contains emails and names: keep it outside the repository)
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

    public sealed record MigrateArgs(string Path, string? Steps, List<string> Admins, bool Apply, string? Report);

    public static MigrateArgs? ParseMigrate(string[] args, TextWriter err)
    {
        var a = args.ToList();
        if (a.Count > 0 && a[0].Equals("sync", StringComparison.OrdinalIgnoreCase)) a.RemoveAt(0);
        if (a.Count == 0 || !a[0].Equals("legacy-migrate", StringComparison.OrdinalIgnoreCase)) return null;
        string? path = null, steps = null, report = null;
        var admins = new List<string>();
        var apply = false;
        for (var i = 1; i < a.Count; i++)
        {
            switch (a[i])
            {
                case "--path" when i + 1 < a.Count: path = a[++i]; break;
                case "--steps" when i + 1 < a.Count: steps = a[++i]; break;
                case "--admin" when i + 1 < a.Count: admins.Add(a[++i]); break;
                case "--report" when i + 1 < a.Count: report = a[++i]; break;
                case "--apply": apply = true; break;
                default: err.WriteLine($"Unknown or incomplete argument: {a[i]}"); return null;
            }
        }
        if (string.IsNullOrWhiteSpace(path)) { err.WriteLine("legacy-migrate needs --path <SupportHCMUSData>."); return null; }
        return new MigrateArgs(path, steps, admins, apply, report);
    }

    private static async Task<int> RunMigrateAsync(MigrateArgs m, TextWriter output, TextWriter err)
    {
        IReadOnlyList<string> steps;
        try { steps = LegacyMigrator.ParseSteps(m.Steps); }
        catch (ArgumentException e) { err.WriteLine(e.Message); return 2; }

        var settings = LoadOptions();
        var admins = new List<AdminIdentity>();
        foreach (var text in m.Admins.Concat(settings.Legacy.Admins))
        {
            var identity = AdminIdentity.TryParse(text);
            if (identity is null) { err.WriteLine("--admin must look like <email>:<mscb>."); return 2; }
            if (!admins.Any(x => x.Mscb == identity.Mscb && x.Email.Equals(identity.Email, StringComparison.OrdinalIgnoreCase))) admins.Add(identity);
        }
        if (!Directory.Exists(m.Path)) { err.WriteLine($"Data repo not found: {m.Path}"); return 2; }

        using var cts = new CancellationTokenSource();
        Console.CancelKeyPress += (_, e) => { e.Cancel = true; cts.Cancel(); };
        try
        {
            using var api = new LegacyApi(settings);
            return await new LegacyMigrator(api, output).RunAsync(new MigrateOptions(m.Path, steps, admins, m.Apply, m.Report), cts.Token);
        }
        catch (InvalidOperationException e) { err.WriteLine(e.Message); return 2; }
    }

    public static async Task<int> RunAsync(string[] args, TextWriter output, TextWriter err)
    {
        var first = args.FirstOrDefault(x => !x.Equals("sync", StringComparison.OrdinalIgnoreCase));
        if (first is not null && first.Equals("legacy-migrate", StringComparison.OrdinalIgnoreCase))
        {
            var m = ParseMigrate(args, err);
            if (m is null) { output.WriteLine(Usage); return 2; }
            return await RunMigrateAsync(m, output, err);
        }

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
