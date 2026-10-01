using System.Diagnostics;
using HCMUSSupportV2.Sync.Sources;

namespace HCMUSSupportV2.Sync;

/// <summary>Reads each requested dataset from a source, then posts it (or only counts it with <c>dryRun</c>) and prints one summary line per dataset.</summary>
public sealed class SyncRunner(IDatasetSource source, IIngestPoster? poster, TextWriter output)
{
    /// <summary>0 = every dataset succeeded; 1 = at least one dataset failed (read or post).</summary>
    public async Task<int> RunAsync(IReadOnlyList<string> datasets, bool dryRun, bool force, CancellationToken ct)
    {
        var failures = 0;
        foreach (var dataset in datasets)
        {
            if (!source.Supported.Contains(dataset))
            {
                output.WriteLine($"[{dataset}] skipped: not provided by source '{source.Name}'");
                continue;
            }

            var sw = Stopwatch.StartNew();
            IReadOnlyList<object> rows;
            try { rows = await source.ReadAsync(dataset, ct); }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                failures++;
                output.WriteLine($"[{dataset}] FAILED reading from '{source.Name}': {e.GetType().Name}: {e.Message}");
                continue;
            }

            if (dryRun)
            {
                output.WriteLine($"[{dataset}] dry-run rows={rows.Count} ({sw.ElapsedMilliseconds} ms), nothing posted");
                continue;
            }

            var outcome = await poster!.PostAsync(dataset, rows, force, ct);
            if (outcome.Success && outcome.Result is { } r)
            {
                var kinds = r.IssuesByKind.Count == 0 ? "" : " [" + string.Join(", ", r.IssuesByKind.OrderBy(k => k.Key).Select(k => $"{k.Key}={k.Value}")) + "]";
                output.WriteLine($"[{dataset}] sent={outcome.Sent} received={r.Received} inserted={r.Inserted} updated={r.Updated} deleted={r.Deleted} issues={r.IssueCount}{kinds} status={r.Status} run={r.RunId}");
                foreach (var note in r.Notes) output.WriteLine($"[{dataset}]   note: {note}");
            }
            else
            {
                failures++;
                output.WriteLine($"[{dataset}] FAILED sent={outcome.Sent}: {outcome.Error}");
                if (outcome.StatusCode is 0 or 401 or 403)
                {
                    output.WriteLine("Aborting: the API is unreachable or rejects the token; remaining datasets not attempted.");
                    return 1;
                }
            }
        }

        if (source.Report.Counts.Count > 0) output.WriteLine($"mapping notes: {source.Report}");
        return failures == 0 ? 0 : 1;
    }
}
