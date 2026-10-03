namespace HCMUSSupportV2.Sync;

/// <summary>Bound from <c>appsettings.json</c> section <c>Sync</c>; environment variables <c>Sync__ApiBaseUrl</c> etc. override.</summary>
public sealed class SyncOptions
{
    public string ApiBaseUrl { get; set; } = "";
    public string ApiToken { get; set; } = "";
    public string HrmConnectionString { get; set; } = "";
    public int TimeoutSeconds { get; set; } = 300;

    /// <summary>Settings of the one-off legacy migration (<c>sync legacy-migrate</c>).</summary>
    public LegacyOptions Legacy { get; set; } = new();
}

public sealed class LegacyOptions
{
    /// <summary>People to grant admin to, as <c>email:mscb</c> strings (keep them in appsettings.local.json, not in the committed file).</summary>
    public string[] Admins { get; set; } = [];
}
