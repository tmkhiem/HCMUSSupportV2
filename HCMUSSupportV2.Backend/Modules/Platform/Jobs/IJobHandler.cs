using System.Text.Json;

namespace HCMUSSupportV2.Backend.Modules.Platform.Jobs;

/// <summary>
/// Handles jobs of one <see cref="Type"/>. Register with <c>services.AddJobHandler&lt;T&gt;()</c>.
/// Handlers are resolved from a per-job DI scope. Throw to fail the attempt (the job is retried with backoff).
/// </summary>
public interface IJobHandler
{
    string Type { get; }
    Task HandleAsync(JobContext context, CancellationToken cancellationToken);
}

public sealed record JobContext(long Id, string Type, string Payload, int Attempt, int MaxAttempts)
{
    public T? GetPayload<T>() => JsonSerializer.Deserialize<T>(Payload, JobQueue.JsonOptions);
}
