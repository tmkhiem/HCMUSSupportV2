using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace HCMUSSupportV2.Backend.Modules.Identity.Authorization;

public class RoleAssignmentConfiguration : IEntityTypeConfiguration<RoleAssignment>
{
    public void Configure(EntityTypeBuilder<RoleAssignment> b)
    {
        b.ToTable("role_assignments", t => t.HasCheckConstraint("ck_role_assignments_role", "role IN ('editor','admin')"));
        b.HasKey(x => new { x.EmployeeCode, x.Role });
        b.Property(x => x.EmployeeCode).HasMaxLength(50);
        b.Property(x => x.Role).HasMaxLength(20);
        b.Property(x => x.GrantedBy).HasMaxLength(50);
        b.Property(x => x.GrantedAt).HasDefaultValueSql("now()");

        b.HasOne<Employee>().WithMany().HasForeignKey(x => x.EmployeeCode).OnDelete(DeleteBehavior.Cascade);
        b.HasOne<Employee>().WithMany().HasForeignKey(x => x.GrantedBy).OnDelete(DeleteBehavior.SetNull);
    }
}
