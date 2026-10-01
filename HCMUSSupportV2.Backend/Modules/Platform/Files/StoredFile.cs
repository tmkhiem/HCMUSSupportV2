namespace HCMUSSupportV2.Backend.Modules.Platform.Files;

/// <summary>Metadata row of a stored file (<c>files</c>). The bytes live in the <see cref="IFileStore"/> backend.</summary>
public class StoredFile
{
    /// <summary>UUID v7 (time-ordered), generated in the app.</summary>
    public Guid Id { get; set; }

    /// <summary>Backend-specific location (relative path for local disk, object key for S3).</summary>
    public string StorageKey { get; set; } = "";

    public string FileName { get; set; } = "";
    public string ContentType { get; set; } = "application/octet-stream";
    public long SizeBytes { get; set; }

    /// <summary>Lower-case hex SHA-256 of the content.</summary>
    public string Sha256 { get; set; } = "";

    /// <summary>Employee code (MSCB) of the uploader, when known.</summary>
    public string? UploadedBy { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}
