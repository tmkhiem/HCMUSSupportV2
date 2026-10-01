namespace HCMUSSupportV2.Backend.Modules.Platform.Files;

/// <summary>Stores file content and its <c>files</c> metadata row. Local disk today; an S3 implementation can follow.</summary>
public interface IFileStore
{
    /// <summary>
    /// Streams <paramref name="content"/> into the store, computing size and SHA-256 on the way.
    /// Throws <see cref="FileRejectedException"/> when the size or content type is not allowed.
    /// </summary>
    Task<StoredFile> SaveAsync(Stream content, string fileName, string contentType, string? uploadedBy = null,
        CancellationToken cancellationToken = default);

    Task<StoredFile?> GetAsync(Guid id, CancellationToken cancellationToken = default);

    /// <summary>Opens the content for reading, or null when the file does not exist. The caller disposes the result.</summary>
    Task<FileContent?> OpenReadAsync(Guid id, CancellationToken cancellationToken = default);

    /// <summary>Deletes content and metadata; returns false when the file did not exist.</summary>
    Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default);
}

public sealed record FileContent(StoredFile File, Stream Stream) : IAsyncDisposable
{
    public ValueTask DisposeAsync() => Stream.DisposeAsync();
}

public class FileRejectedException(string message) : Exception(message);
