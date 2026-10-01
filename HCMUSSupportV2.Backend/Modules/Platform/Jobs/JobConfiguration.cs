using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace HCMUSSupportV2.Backend.Modules.Platform.Jobs;

public class JobConfiguration : IEntityTypeConfiguration<Job>
{
    public void Configure(EntityTypeBuilder<Job> b)
    {
        b.ToTable("jobs");
        b.HasKey(x => x.Id);
        b.Property(x => x.Type).IsRequired().HasMaxLength(200);
        b.Property(x => x.Payload).HasColumnType("jsonb").IsRequired();
        b.Property(x => x.RunAt).HasDefaultValueSql("now()");
        b.Property(x => x.Attempts).HasDefaultValue(0);
        b.Property(x => x.MaxAttempts).HasDefaultValue(5);
        b.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
        b.Property(x => x.UpdatedAt).HasDefaultValueSql("now()");

        // The worker only ever scans unfinished jobs.
        b.HasIndex(x => x.RunAt).HasFilter("done_at IS NULL").HasDatabaseName("ix_jobs_run_at_pending");
    }
}
