using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Modules.Identity.Groups;
using HCMUSSupportV2.Backend.Modules.Platform.Files;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace HCMUSSupportV2.Backend.Modules.Notifications.Domain;

public class TagConfiguration : IEntityTypeConfiguration<Tag>
{
    public void Configure(EntityTypeBuilder<Tag> b)
    {
        b.ToTable("tags");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).UseIdentityByDefaultColumn();
        b.Property(x => x.Name).IsRequired().HasMaxLength(100);
        b.Property(x => x.Color).HasMaxLength(20);
        b.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
        b.Property(x => x.UpdatedAt).HasDefaultValueSql("now()");
        b.HasIndex(x => x.Name).IsUnique();

        var seed = new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
        string[] names = ["Lương", "Thâm niên", "Khen thưởng", "Khảo sát", "Đào tạo", "Chung"];
        string[] colors = ["#303F9F", "#00796B", "#F9A825", "#6A1B9A", "#0277BD", "#546E7A"];
        b.HasData(names.Select((n, i) => new Tag { Id = i + 1, Name = n, Color = colors[i], Sort = (i + 1) * 10, CreatedAt = seed, UpdatedAt = seed }));
    }
}

public class NotificationSeriesConfiguration : IEntityTypeConfiguration<NotificationSeries>
{
    public void Configure(EntityTypeBuilder<NotificationSeries> b)
    {
        b.ToTable("notification_series");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).UseIdentityByDefaultColumn();
        b.Property(x => x.Name).IsRequired().HasMaxLength(200);
        b.Property(x => x.Description).HasMaxLength(2000);
        b.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
        b.Property(x => x.UpdatedAt).HasDefaultValueSql("now()");
        b.HasIndex(x => x.Name).IsUnique();
    }
}

public class NotificationConfiguration : IEntityTypeConfiguration<Notification>
{
    public void Configure(EntityTypeBuilder<Notification> b)
    {
        b.ToTable("notifications", t => t.HasCheckConstraint("ck_notifications_status", "status IN ('draft','published')"));
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).ValueGeneratedNever();
        b.Property(x => x.Title).IsRequired().HasMaxLength(500);
        b.Property(x => x.Summary).IsRequired().HasMaxLength(1000).HasDefaultValue("");
        b.Property(x => x.BodyMd).IsRequired().HasColumnType("text").HasDefaultValue("");
        b.Property(x => x.ContentText).IsRequired().HasColumnType("text").HasDefaultValue("");
        b.Property(x => x.Variables).IsRequired().HasColumnType("jsonb").HasDefaultValueSql("'[]'::jsonb");
        b.Property(x => x.Status).IsRequired().HasMaxLength(20).HasDefaultValue(NotificationStatuses.Draft);
        b.Property(x => x.Version).HasDefaultValue(1);
        b.Property(x => x.CreatedBy).HasMaxLength(50);
        b.Property(x => x.UpdatedBy).HasMaxLength(50);
        b.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
        b.Property(x => x.UpdatedAt).HasDefaultValueSql("now()");
        b.Property(x => x.RowVersion).IsRowVersion();
        b.Property(x => x.Search).HasColumnType("tsvector").HasComputedColumnSql(
            "setweight(to_tsvector('vn_unaccent', coalesce(title, '')), 'A') || " +
            "setweight(to_tsvector('vn_unaccent', coalesce(summary, '')), 'B') || " +
            "setweight(to_tsvector('vn_unaccent', coalesce(content_text, '')), 'C')", stored: true);

        b.HasIndex(x => x.Search).HasMethod("gin").HasDatabaseName("ix_notifications_search");
        b.HasIndex(x => x.Status).HasDatabaseName("ix_notifications_status");
        b.HasIndex(x => x.SeriesId);

        b.HasOne<NotificationSeries>().WithMany().HasForeignKey(x => x.SeriesId).OnDelete(DeleteBehavior.SetNull);
        b.HasOne<Employee>().WithMany().HasForeignKey(x => x.CreatedBy).OnDelete(DeleteBehavior.SetNull);
        b.HasOne<Employee>().WithMany().HasForeignKey(x => x.UpdatedBy).OnDelete(DeleteBehavior.SetNull);
    }
}

public class NotificationTagConfiguration : IEntityTypeConfiguration<NotificationTag>
{
    public void Configure(EntityTypeBuilder<NotificationTag> b)
    {
        b.ToTable("notification_tags");
        b.HasKey(x => new { x.NotificationId, x.TagId });
        b.HasOne<Notification>().WithMany().HasForeignKey(x => x.NotificationId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne<Tag>().WithMany().HasForeignKey(x => x.TagId).OnDelete(DeleteBehavior.Cascade);
        b.HasIndex(x => x.TagId);
    }
}

public class NotificationRevisionConfiguration : IEntityTypeConfiguration<NotificationRevision>
{
    public void Configure(EntityTypeBuilder<NotificationRevision> b)
    {
        b.ToTable("notification_revisions");
        b.HasKey(x => new { x.NotificationId, x.Version });
        b.Property(x => x.Title).IsRequired().HasMaxLength(500);
        b.Property(x => x.Summary).IsRequired().HasMaxLength(1000);
        b.Property(x => x.Content).IsRequired().HasColumnType("text");
        b.Property(x => x.Variables).IsRequired().HasColumnType("jsonb");
        b.Property(x => x.EditedBy).HasMaxLength(50);
        b.Property(x => x.EditedAt).HasDefaultValueSql("now()");
        b.HasOne<Notification>().WithMany().HasForeignKey(x => x.NotificationId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne<Employee>().WithMany().HasForeignKey(x => x.EditedBy).OnDelete(DeleteBehavior.SetNull);
    }
}

public class NotificationAudienceConfiguration : IEntityTypeConfiguration<NotificationAudience>
{
    public void Configure(EntityTypeBuilder<NotificationAudience> b)
    {
        b.ToTable("notification_audiences", t => t.HasCheckConstraint("ck_notification_audiences_kind", "kind IN ('all','group','employee','import')"));
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).UseIdentityAlwaysColumn();
        b.Property(x => x.Kind).IsRequired().HasMaxLength(20);
        b.Property(x => x.EmployeeCode).HasMaxLength(50);
        b.HasIndex(x => x.NotificationId);
        b.HasIndex(x => x.GroupId).HasFilter("group_id IS NOT NULL");
        b.HasOne<Notification>().WithMany().HasForeignKey(x => x.NotificationId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne<Group>().WithMany().HasForeignKey(x => x.GroupId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne<Employee>().WithMany().HasForeignKey(x => x.EmployeeCode).OnDelete(DeleteBehavior.Cascade);
        b.HasOne<NotificationRecipientImport>().WithMany().HasForeignKey(x => x.ImportId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class NotificationDeliveryConfiguration : IEntityTypeConfiguration<NotificationDelivery>
{
    public void Configure(EntityTypeBuilder<NotificationDelivery> b)
    {
        b.ToTable("notification_deliveries");
        b.HasKey(x => new { x.EmployeeCode, x.NotificationId });
        b.Property(x => x.EmployeeCode).HasMaxLength(50);
        b.Property(x => x.Vars).HasColumnType("jsonb");
        b.Property(x => x.DeliveredAt).HasDefaultValueSql("now()");
        b.Property(x => x.Fetched).HasDefaultValue(false);
        b.Property(x => x.Opened).HasDefaultValue(false);

        b.HasIndex(x => new { x.EmployeeCode, x.DeliveredAt })
            .IsDescending(false, true)
            .HasDatabaseName("ix_notification_deliveries_inbox");
        b.HasIndex(x => x.NotificationId);

        b.HasOne<Employee>().WithMany().HasForeignKey(x => x.EmployeeCode).OnDelete(DeleteBehavior.Cascade);
        b.HasOne<Notification>().WithMany().HasForeignKey(x => x.NotificationId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class NotificationAttachmentConfiguration : IEntityTypeConfiguration<NotificationAttachment>
{
    public void Configure(EntityTypeBuilder<NotificationAttachment> b)
    {
        b.ToTable("notification_attachments");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).ValueGeneratedNever();
        b.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
        b.HasIndex(x => x.NotificationId);
        b.HasIndex(x => x.FileId);
        b.HasOne<Notification>().WithMany().HasForeignKey(x => x.NotificationId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne<StoredFile>().WithMany().HasForeignKey(x => x.FileId).OnDelete(DeleteBehavior.Restrict);
    }
}

public class NotificationRecipientImportConfiguration : IEntityTypeConfiguration<NotificationRecipientImport>
{
    public void Configure(EntityTypeBuilder<NotificationRecipientImport> b)
    {
        b.ToTable("notification_recipient_imports", t => t.HasCheckConstraint("ck_notification_recipient_imports_status", "status IN ('validated','applied','rejected')"));
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).ValueGeneratedNever();
        b.Property(x => x.Status).IsRequired().HasMaxLength(20);
        b.Property(x => x.Columns).IsRequired().HasColumnType("jsonb");
        b.Property(x => x.Rows).IsRequired().HasColumnType("jsonb");
        b.Property(x => x.Report).IsRequired().HasColumnType("jsonb");
        b.Property(x => x.CreatedBy).HasMaxLength(50);
        b.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
        b.HasIndex(x => x.NotificationId);
        b.HasOne<Notification>().WithMany().HasForeignKey(x => x.NotificationId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne<StoredFile>().WithMany().HasForeignKey(x => x.FileId).OnDelete(DeleteBehavior.SetNull);
        b.HasOne<Employee>().WithMany().HasForeignKey(x => x.CreatedBy).OnDelete(DeleteBehavior.SetNull);
    }
}
