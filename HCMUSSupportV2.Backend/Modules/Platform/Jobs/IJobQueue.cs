namespace HCMUSSupportV2.Backend.Modules.Platform.Jobs;

public interface IJobQueue
{
    /// <summary>Adds a job; returns its id. <paramref name="runAt"/> defaults to now.</summary>
    Task<long> EnqueueAsync(string type, object? payload = null, DateTimeOffset? runAt = null,
        int maxAttempts = 5, CancellationToken cancellationToken = default);
}
