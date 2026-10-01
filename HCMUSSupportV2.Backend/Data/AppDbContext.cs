using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace HCMUSSupportV2.Backend.Data;

/// <summary>
/// The single application DbContext. Entities are NOT declared here as DbSet properties: each one is
/// registered by its own <c>IEntityTypeConfiguration&lt;T&gt;</c> (<c>&lt;Entity&gt;Configuration.cs</c> next to the
/// entity inside <c>Modules/&lt;Module&gt;/...</c>), which <see cref="ApplyConfigurationsFromAssembly"/> discovers.
/// Query with <c>db.Set&lt;T&gt;()</c>. This keeps parallel deliveries from conflicting in this file.
/// The one exception is <see cref="DataProtectionKeys"/>, which the data-protection EF store requires.
/// </summary>
public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options), IDataProtectionKeyContext
{
    public DbSet<DataProtectionKey> DataProtectionKeys { get; set; } = null!;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Extensions required by the platform (created by the D01_Platform migration).
        modelBuilder.HasPostgresExtension("citext");
        modelBuilder.HasPostgresExtension("unaccent");
        modelBuilder.HasPostgresExtension("pg_trgm");

        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
    }
}
