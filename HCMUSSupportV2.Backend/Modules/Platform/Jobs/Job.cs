namespace HCMUSSupportV2.Backend.Modules.Platform.Jobs;

/// <summary>A row of the PostgreSQL-backed job queue (<c>jobs</c>).</summary>
public class Job
{
    public long Id { get; set; }
    public string Type { get; set; } = "";

    /// <summary>JSON document (jsonb).</summary>
    public string Payload { get; set; } = "{}";

    public DateTimeOffset RunAt { get; set; }
    public int Attempts { get; set; }
    public int MaxAttempts { get; set; } = 5;
    public DateTimeOffset? LockedUntil { get; set; }
    public string? LastError { get; set; }

    /// <summary>
    /// Set when the job is finished. <c>LastError</c> is null for a success; a finished job that still has a
    /// <c>LastError</c> exhausted its attempts (dead).
    /// </summary>
    public DateTimeOffset? DoneAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
