using HCMUSSupportV2.Backend.Modules.Platform.Jobs;
using HCMUSSupportV2.Backend.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace HCMUSSupportV2.Backend.Tests;

[Collection(PostgresCollection.Name)]
public class JobQueueTests(PostgresFixture database)
{
    private static readonly Dictionary<string, string?> WorkerOn = new() { ["Jobs:Enabled"] = "true" };

    private static Task<Job> LoadAsync(TestApiFactory factory, long id) =>
        factory.WithDbAsync(db => db.Set<Job>().AsNoTracking().SingleAsync(j => j.Id == id));

    [Fact]
    public async Task Enqueued_noop_job_is_processed_and_marked_done()
    {
        await using var factory = new TestApiFactory(database, WorkerOn);
        _ = factory.Server; // start the host (and the hosted worker)
        var queue = factory.Services.GetRequiredService<IJobQueue>();

        var id = await queue.EnqueueAsync(NoopJobHandler.JobType, new { hello = "world" });

        Assert.True(await Wait.UntilAsync(async () => (await LoadAsync(factory, id)).DoneAt is not null),
            "job was not processed in time");
        var job = await LoadAsync(factory, id);
        Assert.Equal(1, job.Attempts);
        Assert.Null(job.LastError);
        Assert.Null(job.LockedUntil);
        Assert.Contains("world", job.Payload);
    }

    [Fact]
    public async Task Failing_handler_is_retried_up_to_max_attempts_and_records_last_error()
    {
        var handler = new ScriptedHandler("test.always-fails", failFirst: int.MaxValue);
        await using var factory = new TestApiFactory(database, WorkerOn, s => s.AddSingleton<IJobHandler>(handler));
        _ = factory.Server;
        var queue = factory.Services.GetRequiredService<IJobQueue>();

        var id = await queue.EnqueueAsync(handler.Type, maxAttempts: 3);

        Assert.True(await Wait.UntilAsync(async () => (await LoadAsync(factory, id)).DoneAt is not null),
            "job did not finish in time");
        var job = await LoadAsync(factory, id);
        Assert.Equal(3, job.Attempts);
        Assert.Equal(3, handler.Calls);
        Assert.NotNull(job.LastError);
        Assert.Contains("boom", job.LastError);
    }

    [Fact]
    public async Task Handler_that_recovers_completes_on_a_later_attempt()
    {
        var handler = new ScriptedHandler("test.flaky", failFirst: 2);
        await using var factory = new TestApiFactory(database, WorkerOn, s => s.AddSingleton<IJobHandler>(handler));
        _ = factory.Server;
        var queue = factory.Services.GetRequiredService<IJobQueue>();

        var id = await queue.EnqueueAsync(handler.Type, maxAttempts: 5);

        Assert.True(await Wait.UntilAsync(async () => (await LoadAsync(factory, id)).DoneAt is not null),
            "job did not finish in time");
        var job = await LoadAsync(factory, id);
        Assert.Equal(3, job.Attempts);
        Assert.Null(job.LastError); // cleared by the successful attempt
    }

    [Fact]
    public async Task Retry_waits_for_the_backoff_delay()
    {
        var handler = new ScriptedHandler("test.slow-retry", failFirst: 1);
        var settings = new Dictionary<string, string?>(WorkerOn) { ["Jobs:BackoffBaseSeconds"] = "30" };
        await using var factory = new TestApiFactory(database, settings, s => s.AddSingleton<IJobHandler>(handler));
        _ = factory.Server;
        var queue = factory.Services.GetRequiredService<IJobQueue>();

        var id = await queue.EnqueueAsync(handler.Type);

        // First attempt fails, then the job is parked ~30s in the future with last_error recorded.
        Assert.True(await Wait.UntilAsync(async () => (await LoadAsync(factory, id)).LastError is not null));
        await Task.Delay(500);
        var job = await LoadAsync(factory, id);
        Assert.Null(job.DoneAt);
        Assert.Equal(1, job.Attempts);
        Assert.Equal(1, handler.Calls);
        Assert.True(job.RunAt > DateTimeOffset.UtcNow.AddSeconds(10));
    }

    [Fact]
    public async Task Job_scheduled_in_the_future_is_not_run_early()
    {
        await using var factory = new TestApiFactory(database, WorkerOn);
        _ = factory.Server;
        var queue = factory.Services.GetRequiredService<IJobQueue>();

        var id = await queue.EnqueueAsync(NoopJobHandler.JobType, runAt: DateTimeOffset.UtcNow.AddHours(1));
        await Task.Delay(600);

        var job = await LoadAsync(factory, id);
        Assert.Null(job.DoneAt);
        Assert.Equal(0, job.Attempts);
    }

    [Fact]
    public async Task Unknown_job_type_fails_with_a_clear_error()
    {
        await using var factory = new TestApiFactory(database, WorkerOn);
        _ = factory.Server;
        var queue = factory.Services.GetRequiredService<IJobQueue>();

        var id = await queue.EnqueueAsync("test.nobody-handles-this", maxAttempts: 1);

        Assert.True(await Wait.UntilAsync(async () => (await LoadAsync(factory, id)).DoneAt is not null));
        var job = await LoadAsync(factory, id);
        Assert.Contains("No handler registered", job.LastError);
    }

    /// <summary>Fails the first <c>failFirst</c> calls with "boom", then succeeds.</summary>
    private sealed class ScriptedHandler(string type, int failFirst) : IJobHandler
    {
        private int _calls;
        public string Type => type;
        public int Calls => Volatile.Read(ref _calls);

        public Task HandleAsync(JobContext context, CancellationToken cancellationToken)
        {
            var call = Interlocked.Increment(ref _calls);
            return call <= failFirst ? throw new InvalidOperationException($"boom (call {call})") : Task.CompletedTask;
        }
    }
}
