using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace HCMUSSupportV2.Backend.Modules.Identity.Groups;

public class GroupConfiguration : IEntityTypeConfiguration<Group>
{
    public void Configure(EntityTypeBuilder<Group> b)
    {
        b.ToTable("groups", t => t.HasCheckConstraint("ck_groups_kind", "kind IN ('static','org_unit','rule')"));
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).UseIdentityAlwaysColumn();
        b.Property(x => x.Name).IsRequired().HasMaxLength(300);
        b.Property(x => x.Description).HasMaxLength(2000);
        b.Property(x => x.Kind).IsRequired().HasMaxLength(20);
        b.Property(x => x.Rule).HasColumnType("jsonb");
        b.Property(x => x.CreatedBy).HasMaxLength(50);
        b.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
        b.Property(x => x.UpdatedAt).HasDefaultValueSql("now()");

        b.HasIndex(x => x.Name).IsUnique();
        b.HasOne<OrgUnit>().WithMany().HasForeignKey(x => x.OrgUnitId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<Employee>().WithMany().HasForeignKey(x => x.CreatedBy).OnDelete(DeleteBehavior.SetNull);
    }
}

public class GroupMemberConfiguration : IEntityTypeConfiguration<GroupMember>
{
    public void Configure(EntityTypeBuilder<GroupMember> b)
    {
        b.ToTable("group_members", t => t.HasCheckConstraint("ck_group_members_source", "source IN ('manual','computed')"));
        b.HasKey(x => new { x.GroupId, x.EmployeeCode });
        b.Property(x => x.EmployeeCode).HasMaxLength(50);
        b.Property(x => x.Source).IsRequired().HasMaxLength(20);
        b.Property(x => x.AddedBy).HasMaxLength(50);
        b.Property(x => x.AddedAt).HasDefaultValueSql("now()");

        b.HasIndex(x => x.EmployeeCode);
        b.HasOne<Group>().WithMany().HasForeignKey(x => x.GroupId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne<Employee>().WithMany().HasForeignKey(x => x.EmployeeCode).OnDelete(DeleteBehavior.Cascade);
        b.HasOne<Employee>().WithMany().HasForeignKey(x => x.AddedBy).OnDelete(DeleteBehavior.SetNull);
    }
}
