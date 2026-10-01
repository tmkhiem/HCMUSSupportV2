using Microsoft.Extensions.Options;

namespace HCMUSSupportV2.Backend.Modules.Platform.Jobs;

/// <summary>
/// Hosted service that drains the <c>jobs</c> table: claims due jobs one at a time (SKIP LOCKED), dispatches each
/// to the <see cref="IJobHandler"/> registered for its type and retries failures with exponential backoff
/// until <c>max_attempts</c> is reached.
/// </summary>
public class JobWorker(
    JobStore store,
    IServiceScopeFactory scopeFactory,
    IOptionsMonitor<JobOptions> options,
    ILogger<JobWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Let the host finish starting before the first poll.
        await Task.Yield();

        var opts = options.CurrentValue;
        if (!opts.Enabled)
        {
            logger.LogInformation("Job worker disabled (Jobs:Enabled=false)");
            return;
        }

        var loops = Enumerable.Range(0, Math.Max(1, opts.WorkerCount)).Select(_ => RunLoopAsync(stoppingToken));
        await Task.WhenAll(loops);
    }

    private async Task RunLoopAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                var opts = options.CurrentValue;
                var job = await store.ClaimAsync(TimeSpan.FromSeconds(opts.LeaseSeconds), ct);
                if (job is null)
                {
                    await Task.Delay(opts.PollIntervalMs, ct);
                    continue;
                }
                await ProcessAsync(job, opts, ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                // Infrastructure failure (e.g. database unreachable): back off and keep the loop alive.
                logger.LogError(ex, "Job worker loop error");
                try { await Task.Delay(TimeSpan.FromSeconds(5), ct); } catch (OperationCanceledException) { break; }
            }
        }
    }

    private async Task ProcessAsync(ClaimedJob job, JobOptions opts, CancellationToken ct)
    {
        // Attempts are counted at claim time, so a job whose worker crashed on its last attempt shows up here
        // over the limit: finish it instead of running it again.
        if (job.Attempts > job.MaxAttempts)
        {
            await store.FailPermanentlyAsync(job.Id, "Abandoned: lease expired after the final attempt", ct);
            logger.LogError("Job {JobId} ({Type}) abandoned after {Attempts} attempts", job.Id, job.Type, job.MaxAttempts);
            return;
        }

        try
        {
            await using var scope = scopeFactory.CreateAsyncScope();
            var handler = scope.ServiceProvider.GetServices<IJobHandler>().FirstOrDefault(h => h.Type == job.Type)
                ?? throw new InvalidOperationException($"No handler registered for job type '{job.Type}'");
            await handler.HandleAsync(new JobContext(job.Id, job.Type, job.Payload, job.Attempts, job.MaxAttempts), ct);
            await store.CompleteAsync(job.Id, CancellationToken.None);
            logger.LogInformation("Job {JobId} ({Type}) done on attempt {Attempt}", job.Id, job.Type, job.Attempts);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // Shutting down mid-job: leave it leased; it becomes due again when the lease expires.
            throw;
        }
        catch (Exception ex)
        {
            var error = Truncate($"{ex.GetType().Name}: {ex.Message}\n{ex.StackTrace}", 4000);
            if (job.Attempts >= job.MaxAttempts)
            {
                await store.FailPermanentlyAsync(job.Id, error, CancellationToken.None);
                logger.LogError(ex, "Job {JobId} ({Type}) failed permanently after {Attempts} attempts", job.Id, job.Type, job.Attempts);
            }
            else
            {
                var delay = Backoff(job.Attempts, opts);
                await store.RetryLaterAsync(job.Id, error, delay, CancellationToken.None);
                logger.LogWarning(ex, "Job {JobId} ({Type}) failed on attempt {Attempt}/{Max}; retrying in {Delay}",
                    job.Id, job.Type, job.Attempts, job.MaxAttempts, delay);
            }
        }
    }

    internal static TimeSpan Backoff(int attempt, JobOptions opts)
    {
        var seconds = opts.BackoffBaseSeconds * Math.Pow(2, Math.Max(0, attempt - 1));
        return TimeSpan.FromSeconds(Math.Min(seconds, opts.BackoffMaxSeconds));
    }

    private static string Truncate(string s, int max) => s.Length <= max ? s : s[..max];
}
