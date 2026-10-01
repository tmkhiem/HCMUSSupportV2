using System.Security.Cryptography;
using System.Text;
using HCMUSSupportV2.Backend.Modules.Platform.Files;
using HCMUSSupportV2.Backend.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace HCMUSSupportV2.Backend.Tests;

[Collection(PostgresCollection.Name)]
public class FileStoreTests(PostgresFixture database) : IAsyncLifetime
{
    private readonly TestApiFactory _factory = new(database, new() { ["Storage:MaxBytes"] = "1024" });

    public Task InitializeAsync()
    {
        _ = _factory.Server;
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    [Fact]
    public async Task Save_read_and_delete_round_trip()
    {
        var bytes = Encoding.UTF8.GetBytes("Xin chào HCMUS - synthetic test content");
        await using var scope = _factory.Services.CreateAsyncScope();
        var store = scope.ServiceProvider.GetRequiredService<IFileStore>();

        var saved = await store.SaveAsync(new MemoryStream(bytes), "bao-cao.txt", "text/plain", uploadedBy: "T0001");

        Assert.Equal('7', saved.Id.ToString()[14]); // UUID version 7
        Assert.Equal(bytes.Length, saved.SizeBytes);
        Assert.Equal(Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant(), saved.Sha256);
        Assert.Equal("text/plain", saved.ContentType);
        Assert.Equal("T0001", saved.UploadedBy);

        var meta = await _factory.WithDbAsync(db => db.Set<StoredFile>().AsNoTracking().SingleAsync(f => f.Id == saved.Id));
        Assert.Equal("bao-cao.txt", meta.FileName);
        Assert.Equal(saved.StorageKey, meta.StorageKey);

        await using (var content = await store.OpenReadAsync(saved.Id))
        {
            Assert.NotNull(content);
            using var ms = new MemoryStream();
            await content.Stream.CopyToAsync(ms);
            Assert.Equal(bytes, ms.ToArray());
        }

        Assert.True(await store.DeleteAsync(saved.Id));
        Assert.Null(await store.GetAsync(saved.Id));
        Assert.Null(await store.OpenReadAsync(saved.Id));
        Assert.False(await store.DeleteAsync(saved.Id));
    }

    [Fact]
    public async Task Disallowed_content_type_is_rejected()
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var store = scope.ServiceProvider.GetRequiredService<IFileStore>();

        await Assert.ThrowsAsync<FileRejectedException>(() =>
            store.SaveAsync(new MemoryStream([1, 2, 3]), "virus.exe", "application/x-msdownload"));
    }

    [Fact]
    public async Task Oversized_file_is_rejected_and_leaves_nothing_behind()
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var store = scope.ServiceProvider.GetRequiredService<IFileStore>();
        var before = await _factory.WithDbAsync(db => db.Set<StoredFile>().CountAsync());

        await Assert.ThrowsAsync<FileRejectedException>(() =>
            store.SaveAsync(new MemoryStream(new byte[2048]), "big.txt", "text/plain"));

        Assert.Equal(before, await _factory.WithDbAsync(db => db.Set<StoredFile>().CountAsync()));
        // The partially written temp content must have been removed (nothing larger than the limit is left on disk).
        var leftovers = Directory.Exists(_factory.StorageRoot)
            ? Directory.EnumerateFiles(_factory.StorageRoot, "*", SearchOption.AllDirectories).Where(f => new FileInfo(f).Length > 1024)
            : [];
        Assert.Empty(leftovers);
    }

    [Fact]
    public async Task File_name_is_sanitized_to_a_bare_name()
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var store = scope.ServiceProvider.GetRequiredService<IFileStore>();

        var saved = await store.SaveAsync(new MemoryStream([1]), @"..\..\evil/path\x.png", "image/png");

        Assert.Equal("x.png", saved.FileName);
    }
}
