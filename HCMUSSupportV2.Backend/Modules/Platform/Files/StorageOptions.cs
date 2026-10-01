namespace HCMUSSupportV2.Backend.Modules.Platform.Files;

/// <summary>Bound from the <c>Storage</c> configuration section.</summary>
public class StorageOptions
{
    public const string SectionName = "Storage";

    /// <summary>Root folder of the local-disk store. Relative paths resolve against the content root.</summary>
    public string LocalRoot { get; set; } = "App_Data/files";

    /// <summary>Maximum accepted size in bytes (default 25 MB).</summary>
    public long MaxBytes { get; set; } = 25L * 1024 * 1024;

    /// <summary>Allowed MIME types (exact, or <c>type/*</c>). Empty means no restriction.</summary>
    public string[] AllowedContentTypes { get; set; } = [];
}
