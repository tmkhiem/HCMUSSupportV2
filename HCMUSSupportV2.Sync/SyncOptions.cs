namespace HCMUSSupportV2.Sync;

/// <summary>Bound from <c>appsettings.json</c> section <c>Sync</c>; environment variables <c>Sync__ApiBaseUrl</c> etc. override.</summary>
public sealed class SyncOptions
{
    public string ApiBaseUrl { get; set; } = "";
    public string ApiToken { get; set; } = "";
    public string HrmConnectionString { get; set; } = "";
    public int TimeoutSeconds { get; set; } = 300;
}
