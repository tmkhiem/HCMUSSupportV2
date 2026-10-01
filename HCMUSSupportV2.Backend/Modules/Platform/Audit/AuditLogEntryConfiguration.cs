using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace HCMUSSupportV2.Backend.Modules.Platform.Audit;

public class AuditLogEntryConfiguration : IEntityTypeConfiguration<AuditLogEntry>
{
    public void Configure(EntityTypeBuilder<AuditLogEntry> b)
    {
        b.ToTable("audit_log");
        b.HasKey(x => x.Id);
        b.Property(x => x.At).HasDefaultValueSql("now()");
        b.Property(x => x.ActorCode).HasMaxLength(50);
        b.Property(x => x.ActingAsCode).HasMaxLength(50);
        b.Property(x => x.Action).IsRequired().HasMaxLength(100);
        b.Property(x => x.TargetType).HasMaxLength(100);
        b.Property(x => x.TargetId).HasMaxLength(200);
        b.Property(x => x.Details).HasColumnType("jsonb");
        b.Property(x => x.Ip).HasColumnType("inet");
        b.Property(x => x.UserAgent).HasMaxLength(500);

        // Append-only, naturally ordered by time: a BRIN index is tiny and enough for range scans.
        b.HasIndex(x => x.At).HasMethod("brin").HasDatabaseName("ix_audit_log_at");
    }
}
