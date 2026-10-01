namespace HCMUSSupportV2.Backend.Modules.Platform.Jobs;

/// <summary>The <c>platform.noop</c> job: does nothing. Used to smoke-test the queue end to end.</summary>
public class NoopJobHandler(ILogger<NoopJobHandler> logger) : IJobHandler
{
    public const string JobType = "platform.noop";
    public string Type => JobType;

    public Task HandleAsync(JobContext context, CancellationToken cancellationToken)
    {
        logger.LogInformation("platform.noop job {JobId} ran", context.Id);
        return Task.CompletedTask;
    }
}
