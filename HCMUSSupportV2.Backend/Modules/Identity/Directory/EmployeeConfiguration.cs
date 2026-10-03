using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace HCMUSSupportV2.Backend.Modules.Identity.Directory;

public class EmployeeConfiguration : IEntityTypeConfiguration<Employee>
{
    public void Configure(EntityTypeBuilder<Employee> b)
    {
        b.ToTable("employees", t =>
        {
            t.HasCheckConstraint("ck_employees_status", "status IN ('active','inactive','retired')");
            t.HasCheckConstraint("ck_employees_source", "source IN ('hrm','manual')");
        });
        b.HasKey(x => x.Code);
        b.Property(x => x.Code).HasMaxLength(50);
        b.Property(x => x.FullName).IsRequired().HasMaxLength(300);
        b.Property(x => x.FullNameUnaccent).HasComputedColumnSql("f_unaccent(full_name)", stored: true);
        b.Property(x => x.PositionTitle).HasMaxLength(300);
        b.Property(x => x.AcademicRank).HasMaxLength(100);
        b.Property(x => x.Degree).HasMaxLength(100);
        b.Property(x => x.Status).IsRequired().HasMaxLength(20).HasDefaultValue(EmployeeStatuses.Active);
        b.Property(x => x.PhotoUrl).HasMaxLength(2000);
        b.Property(x => x.Source).IsRequired().HasMaxLength(20).HasDefaultValue(EmployeeSources.Manual);
        b.Property(x => x.LastLoginAt);
        b.Property(x => x.PreviousLoginAt);
        b.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
        b.Property(x => x.UpdatedAt).HasDefaultValueSql("now()");
        b.Ignore(x => x.IsActive);

        b.HasIndex(x => x.HrmId).IsUnique();
        b.HasIndex(x => x.FullNameUnaccent)
            .HasMethod("gin")
            .HasOperators("gin_trgm_ops")
            .HasDatabaseName("ix_employees_full_name_unaccent_trgm");
        b.HasIndex(x => x.OrgUnitId);
        b.HasIndex(x => x.Status);

        b.HasOne<OrgUnit>().WithMany().HasForeignKey(x => x.OrgUnitId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<OrgUnit>().WithMany().HasForeignKey(x => x.DepartmentId).OnDelete(DeleteBehavior.Restrict);
    }
}
