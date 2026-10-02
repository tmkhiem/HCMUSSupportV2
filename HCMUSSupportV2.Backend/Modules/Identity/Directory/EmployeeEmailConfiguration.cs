using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace HCMUSSupportV2.Backend.Modules.Identity.Directory;

public class EmployeeEmailConfiguration : IEntityTypeConfiguration<EmployeeEmail>
{
    public void Configure(EntityTypeBuilder<EmployeeEmail> b)
    {
        b.ToTable("employee_emails");
        b.HasKey(x => x.Email);
        // No domain CHECK: some staff use external addresses.
        b.Property(x => x.Email).HasColumnType("citext");
        b.Property(x => x.EmployeeCode).IsRequired().HasMaxLength(50);
        b.Property(x => x.Note).HasMaxLength(500);
        b.Property(x => x.AddedBy).HasMaxLength(50);
        b.Property(x => x.AddedAt).HasDefaultValueSql("now()");

        b.HasIndex(x => new { x.EmployeeCode, x.AddedAt });
        // At most one primary email per employee (D14c).
        b.HasIndex(x => x.EmployeeCode).IsUnique().HasFilter("is_primary").HasDatabaseName("ux_employee_emails_one_primary");

        b.HasOne<Employee>().WithMany().HasForeignKey(x => x.EmployeeCode).OnDelete(DeleteBehavior.Cascade);
        b.HasOne<Employee>().WithMany().HasForeignKey(x => x.AddedBy).OnDelete(DeleteBehavior.SetNull);
    }
}
