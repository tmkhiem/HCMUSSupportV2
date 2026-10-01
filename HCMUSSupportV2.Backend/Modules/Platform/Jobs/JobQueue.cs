using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using HCMUSSupportV2.Backend.Data;

namespace HCMUSSupportV2.Backend.Modules.Platform.Jobs;

public class JobQueue(IDbContextFactory<AppDbContext> dbFactory) : IJobQueue
{
    internal static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<long> EnqueueAsync(string type, object? payload = null, DateTimeOffset? runAt = null,
        int maxAttempts = 5, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(type);
        ArgumentOutOfRangeException.ThrowIfLessThan(maxAttempts, 1);

        // A short-lived context so the job is committed independently of any request-scoped unit of work.
        await using var db = await dbFactory.CreateDbContextAsync(cancellationToken);
        var job = new Job
        {
            Type = type,
            Payload = payload is null ? "{}" : JsonSerializer.Serialize(payload, JsonOptions),
            MaxAttempts = maxAttempts,
        };
        // Leaving RunAt unset lets the database default (now()) apply, avoiding app/DB clock skew.
        if (runAt is { } at) job.RunAt = at.ToUniversalTime();
        db.Set<Job>().Add(job);
        await db.SaveChangesAsync(cancellationToken);
        return job.Id;
    }
}
