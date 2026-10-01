namespace HCMUSSupportV2.Backend.Modules.Platform.Jobs;

/// <summary>Bound from the <c>Jobs</c> configuration section.</summary>
public class JobOptions
{
    public const string SectionName = "Jobs";

    /// <summary>Run the hosted worker. Disable on instances that should only enqueue.</summary>
    public bool Enabled { get; set; } = true;

    /// <summary>Number of concurrent worker loops per process.</summary>
    public int WorkerCount { get; set; } = 1;

    /// <summary>Sleep between polls when the queue is empty.</summary>
    public int PollIntervalMs { get; set; } = 2000;

    /// <summary>How long a claimed job is invisible to other workers (a crashed worker's job is retried afterwards).</summary>
    public int LeaseSeconds { get; set; } = 300;

    /// <summary>Retry delay is <c>BackoffBaseSeconds * 2^(attempt-1)</c>, capped at <see cref="BackoffMaxSeconds"/>.</summary>
    public double BackoffBaseSeconds { get; set; } = 10;

    public double BackoffMaxSeconds { get; set; } = 3600;
}
