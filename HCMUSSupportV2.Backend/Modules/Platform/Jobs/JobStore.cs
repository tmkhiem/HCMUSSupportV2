using System.Data;
using HCMUSSupportV2.Backend.Data;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;

namespace HCMUSSupportV2.Backend.Modules.Platform.Jobs;

/// <summary>A job claimed by a worker (already counted as one attempt).</summary>
public sealed record ClaimedJob(long Id, string Type, string Payload, int Attempts, int MaxAttempts);

/// <summary>
/// Raw-SQL operations of the queue (claim / complete / fail). Hand-written because EF cannot express
/// <c>UPDATE ... RETURNING</c> with <c>FOR UPDATE SKIP LOCKED</c>.
/// </summary>
public class JobStore(IDbContextFactory<AppDbContext> dbFactory)
{
    /// <summary>
    /// Atomically picks the oldest due, unlocked, unfinished job, bumps <c>attempts</c> and leases it.
    /// Concurrent workers skip rows locked by each other (<c>FOR UPDATE SKIP LOCKED</c>).
    /// </summary>
    public async Task<ClaimedJob?> ClaimAsync(TimeSpan lease, CancellationToken ct)
    {
        const string sql = """
            UPDATE jobs
               SET attempts = attempts + 1,
                   locked_until = now() + make_interval(secs => @lease),
                   updated_at = now()
             WHERE id = (SELECT id FROM jobs
                          WHERE done_at IS NULL
                            AND run_at <= now()
                            AND (locked_until IS NULL OR locked_until < now())
                          ORDER BY run_at, id
                          LIMIT 1
                            FOR UPDATE SKIP LOCKED)
            RETURNING id, type, payload::text, attempts, max_attempts
            """;
        await using var db = await dbFactory.CreateDbContextAsync(ct);
        await using var cmd = await CreateCommandAsync(db, sql, ct);
        cmd.Parameters.AddWithValue("lease", NpgsqlDbType.Double, lease.TotalSeconds);
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct)) return null;
        return new ClaimedJob(reader.GetInt64(0), reader.GetString(1), reader.GetString(2), reader.GetInt32(3), reader.GetInt32(4));
    }

    public Task CompleteAsync(long id, CancellationToken ct) => ExecuteAsync(
        "UPDATE jobs SET done_at = now(), locked_until = NULL, last_error = NULL, updated_at = now() WHERE id = @id",
        ct, ("id", id));

    /// <summary>Schedules a retry after <paramref name="delay"/>, recording the error.</summary>
    public Task RetryLaterAsync(long id, string error, TimeSpan delay, CancellationToken ct) => ExecuteAsync(
        """
        UPDATE jobs SET run_at = now() + make_interval(secs => @delay), locked_until = NULL,
                        last_error = @error, updated_at = now()
         WHERE id = @id
        """, ct, ("id", id), ("delay", delay.TotalSeconds), ("error", error));

    /// <summary>Marks the job finished-with-error (attempts exhausted).</summary>
    public Task FailPermanentlyAsync(long id, string error, CancellationToken ct) => ExecuteAsync(
        "UPDATE jobs SET done_at = now(), locked_until = NULL, last_error = @error, updated_at = now() WHERE id = @id",
        ct, ("id", id), ("error", error));

    private async Task ExecuteAsync(string sql, CancellationToken ct, params (string Name, object Value)[] parameters)
    {
        await using var db = await dbFactory.CreateDbContextAsync(ct);
        await using var cmd = await CreateCommandAsync(db, sql, ct);
        foreach (var (name, value) in parameters) cmd.Parameters.AddWithValue(name, value);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    private static async Task<NpgsqlCommand> CreateCommandAsync(AppDbContext db, string sql, CancellationToken ct)
    {
        var connection = (NpgsqlConnection)db.Database.GetDbConnection();
        if (connection.State != ConnectionState.Open) await connection.OpenAsync(ct);
        return new NpgsqlCommand(sql, connection);
    }
}
