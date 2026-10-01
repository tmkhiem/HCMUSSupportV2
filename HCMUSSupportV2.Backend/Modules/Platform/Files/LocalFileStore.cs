using System.Security.Cryptography;
using HCMUSSupportV2.Backend.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using UUIDNext;

namespace HCMUSSupportV2.Backend.Modules.Platform.Files;

/// <summary>Local-disk <see cref="IFileStore"/>. Content is written to <c>{LocalRoot}/{yyyy}/{MM}/{id}</c>.</summary>
public class LocalFileStore(
    AppDbContext db,
    IOptions<StorageOptions> options,
    IHostEnvironment env,
    ILogger<LocalFileStore> logger) : IFileStore
{
    private readonly StorageOptions _options = options.Value;

    private string Root => Path.GetFullPath(Path.IsPathRooted(_options.LocalRoot)
        ? _options.LocalRoot
        : Path.Combine(env.ContentRootPath, _options.LocalRoot));

    public async Task<StoredFile> SaveAsync(Stream content, string fileName, string contentType, string? uploadedBy = null,
        CancellationToken cancellationToken = default)
    {
        contentType = string.IsNullOrWhiteSpace(contentType) ? "application/octet-stream" : contentType.Trim().ToLowerInvariant();
        EnsureAllowed(contentType);

        var id = Uuid.NewDatabaseFriendly(Database.PostgreSql); // UUID v7
        var now = DateTimeOffset.UtcNow;
        var key = $"{now:yyyy}/{now:MM}/{id:N}";
        var path = ResolvePath(key);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);

        long size = 0;
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        try
        {
            await using (var target = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, useAsync: true))
            {
                var buffer = new byte[81920];
                int read;
                while ((read = await content.ReadAsync(buffer, cancellationToken)) > 0)
                {
                    size += read;
                    if (size > _options.MaxBytes)
                        throw new FileRejectedException($"File exceeds the maximum size of {_options.MaxBytes} bytes");
                    hash.AppendData(buffer, 0, read);
                    await target.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
                }
            }

            var file = new StoredFile
            {
                Id = id,
                StorageKey = key,
                FileName = SanitizeFileName(fileName),
                ContentType = contentType,
                SizeBytes = size,
                Sha256 = Convert.ToHexString(hash.GetHashAndReset()).ToLowerInvariant(),
                UploadedBy = uploadedBy,
            };
            db.Set<StoredFile>().Add(file);
            await db.SaveChangesAsync(cancellationToken);
            return file;
        }
        catch
        {
            TryDelete(path);
            throw;
        }
    }

    public Task<StoredFile?> GetAsync(Guid id, CancellationToken cancellationToken = default) =>
        db.Set<StoredFile>().AsNoTracking().FirstOrDefaultAsync(f => f.Id == id, cancellationToken);

    public async Task<FileContent?> OpenReadAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var file = await GetAsync(id, cancellationToken);
        if (file is null) return null;
        var path = ResolvePath(file.StorageKey);
        if (!File.Exists(path))
        {
            logger.LogError("File {FileId} has metadata but no content at {Key}", id, file.StorageKey);
            return null;
        }
        var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, useAsync: true);
        return new FileContent(file, stream);
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var file = await db.Set<StoredFile>().FirstOrDefaultAsync(f => f.Id == id, cancellationToken);
        if (file is null) return false;
        db.Set<StoredFile>().Remove(file);
        await db.SaveChangesAsync(cancellationToken);
        TryDelete(ResolvePath(file.StorageKey));
        return true;
    }

    private void EnsureAllowed(string contentType)
    {
        var allowed = _options.AllowedContentTypes;
        if (allowed.Length == 0) return;
        var ok = allowed.Any(a => a.EndsWith("/*", StringComparison.Ordinal)
            ? contentType.StartsWith(a[..^1], StringComparison.OrdinalIgnoreCase)
            : string.Equals(a, contentType, StringComparison.OrdinalIgnoreCase));
        if (!ok) throw new FileRejectedException($"Content type '{contentType}' is not allowed");
    }

    private string ResolvePath(string key)
    {
        var root = Root;
        var full = Path.GetFullPath(Path.Combine(root, key));
        if (!full.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Storage key escapes the storage root");
        return full;
    }

    private static string SanitizeFileName(string name)
    {
        name = Path.GetFileName((name ?? "").Replace('\\', '/'));
        foreach (var c in Path.GetInvalidFileNameChars()) name = name.Replace(c, '_');
        if (string.IsNullOrWhiteSpace(name)) name = "file";
        return name.Length <= 255 ? name : name[^255..];
    }

    private void TryDelete(string path)
    {
        try { File.Delete(path); }
        catch (Exception ex) { logger.LogWarning(ex, "Could not delete {Path}", path); }
    }
}
