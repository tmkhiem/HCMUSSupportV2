using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace HCMUSSupportV2.Backend.Modules.Legacy;

/// <summary>
/// Remembers what the one-off legacy migration (D15) already imported (<c>legacy_import_marks</c>), so a re-run is a no-op:
/// <c>kind</c> is the family (<c>news</c>, <c>banner</c>), <c>key</c> the stable v1 identity (the news file name), and
/// <c>content_hash</c> the SHA-256 of what was imported. A changed hash is reported, never re-applied (editors may have
/// edited the post since).
/// </summary>
public class LegacyImportMark
{
    public string Kind { get; set; } = "";
    public string Key { get; set; } = "";
    public string? TargetId { get; set; }
    public string ContentHash { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
}

public static class LegacyKinds
{
    public const string News = "news";
    public const string Banner = "banner";
}

public class LegacyImportMarkConfiguration : IEntityTypeConfiguration<LegacyImportMark>
{
    public void Configure(EntityTypeBuilder<LegacyImportMark> b)
    {
        b.ToTable("legacy_import_marks");
        b.HasKey(x => new { x.Kind, x.Key });
        b.Property(x => x.Kind).HasMaxLength(32);
        b.Property(x => x.Key).HasMaxLength(300);
        b.Property(x => x.TargetId).HasMaxLength(100);
        b.Property(x => x.ContentHash).IsRequired().HasMaxLength(64).IsFixedLength();
        b.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
    }
}
