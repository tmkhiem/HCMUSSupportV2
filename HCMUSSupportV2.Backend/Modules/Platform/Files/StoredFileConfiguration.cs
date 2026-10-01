using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace HCMUSSupportV2.Backend.Modules.Platform.Files;

public class StoredFileConfiguration : IEntityTypeConfiguration<StoredFile>
{
    public void Configure(EntityTypeBuilder<StoredFile> b)
    {
        b.ToTable("files");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).ValueGeneratedNever();
        b.Property(x => x.StorageKey).IsRequired().HasMaxLength(500);
        b.Property(x => x.FileName).IsRequired().HasMaxLength(255);
        b.Property(x => x.ContentType).IsRequired().HasMaxLength(200);
        b.Property(x => x.Sha256).IsRequired().HasMaxLength(64).IsFixedLength();
        b.Property(x => x.UploadedBy).HasMaxLength(50);
        b.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
    }
}
