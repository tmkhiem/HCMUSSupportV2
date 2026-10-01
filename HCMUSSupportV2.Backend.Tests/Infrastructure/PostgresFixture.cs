using System.Text.Json;
using HCMUSSupportV2.Backend.Data;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace HCMUSSupportV2.Backend.Tests.Infrastructure;

/// <summary>
/// Creates a throw-away database <c>hcmus_support_test_&lt;guid&gt;</c> on the dev PostgreSQL server, applies the
/// application's migrations to it and drops it again when the test run ends.
/// The admin connection string comes from the <c>HCMUS_TEST_PG</c> environment variable, or else from the
/// backend's git-ignored <c>appsettings.Development.local.json</c> (<c>ConnectionStrings:Default</c>).
/// </summary>
public sealed class PostgresFixture : IAsyncLifetime
{
    private NpgsqlConnectionStringBuilder _admin = null!;
    private string _databaseName = null!;

    public string ConnectionString { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        _admin = new NpgsqlConnectionStringBuilder(ResolveAdminConnectionString()) { Pooling = false };
        _databaseName = $"hcmus_support_test_{Guid.NewGuid():N}";

        await using (var admin = new NpgsqlConnection(_admin.ConnectionString))
        {
            await admin.OpenAsync();
            await using var create = new NpgsqlCommand($"CREATE DATABASE \"{_databaseName}\"", admin);
            await create.ExecuteNonQueryAsync();
        }

        ConnectionString = new NpgsqlConnectionStringBuilder(_admin.ConnectionString) { Database = _databaseName, Pooling = true }.ConnectionString;

        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(ConnectionString)
            .UseSnakeCaseNamingConvention()
            .Options;
        await using var db = new AppDbContext(options);
        await db.Database.MigrateAsync();
    }

    public async Task DisposeAsync()
    {
        NpgsqlConnection.ClearAllPools();
        await using var admin = new NpgsqlConnection(_admin.ConnectionString);
        await admin.OpenAsync();
        await using var drop = new NpgsqlCommand($"DROP DATABASE IF EXISTS \"{_databaseName}\" WITH (FORCE)", admin);
        await drop.ExecuteNonQueryAsync();
    }

    private static string ResolveAdminConnectionString()
    {
        var fromEnv = Environment.GetEnvironmentVariable("HCMUS_TEST_PG");
        if (!string.IsNullOrWhiteSpace(fromEnv)) return fromEnv;

        // Walk up from the test binaries to the repository root and read the backend's local settings.
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            var candidate = Path.Combine(dir.FullName, "HCMUSSupportV2.Backend", "appsettings.Development.local.json");
            if (!File.Exists(candidate)) continue;

            using var json = JsonDocument.Parse(File.ReadAllText(candidate));
            if (json.RootElement.TryGetProperty("ConnectionStrings", out var cs) &&
                cs.TryGetProperty("Default", out var value) && value.GetString() is { Length: > 0 } s)
            {
                // Connect to the maintenance database to run CREATE/DROP DATABASE.
                return new NpgsqlConnectionStringBuilder(s) { Database = "postgres" }.ConnectionString;
            }
        }

        throw new InvalidOperationException(
            "No PostgreSQL connection for tests. Set HCMUS_TEST_PG (a superuser connection string) or create " +
            "HCMUSSupportV2.Backend/appsettings.Development.local.json with ConnectionStrings:Default.");
    }
}

[CollectionDefinition(Name)]
public class PostgresCollection : ICollectionFixture<PostgresFixture>
{
    public const string Name = "postgres";
}
