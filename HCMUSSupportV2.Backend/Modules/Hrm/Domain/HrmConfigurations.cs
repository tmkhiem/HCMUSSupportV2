using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Modules.Platform.Files;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace HCMUSSupportV2.Backend.Modules.Hrm.Domain;

/// <summary>Common mapping of the HRM child tables: identity id, unique hrm_id, FK to the employee, timestamps.</summary>
public abstract class HrmRowConfiguration<T>(string table) : IEntityTypeConfiguration<T> where T : class, IHrmRow
{
    public void Configure(EntityTypeBuilder<T> b)
    {
        b.ToTable(table, Checks);
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).UseIdentityAlwaysColumn();
        b.Property(x => x.EmployeeCode).IsRequired().HasMaxLength(50);
        b.HasIndex(x => x.HrmId).IsUnique();
        b.HasOne<Employee>().WithMany().HasForeignKey(x => x.EmployeeCode).OnDelete(DeleteBehavior.Cascade);
        b.Property("CreatedAt").HasDefaultValueSql("now()");
        b.Property("UpdatedAt").HasDefaultValueSql("now()");
        Extra(b);
    }

    protected virtual void Checks(Microsoft.EntityFrameworkCore.Metadata.Builders.TableBuilder<T> t) { }

    protected abstract void Extra(EntityTypeBuilder<T> b);
}

public class EmployeeProfileConfiguration : IEntityTypeConfiguration<EmployeeProfile>
{
    public void Configure(EntityTypeBuilder<EmployeeProfile> b)
    {
        b.ToTable("employee_profiles", t => t.HasCheckConstraint("ck_employee_profiles_dob_precision", "date_of_birth_precision IN ('day','month','year')"));
        b.HasKey(x => x.EmployeeCode);
        b.Property(x => x.EmployeeCode).HasMaxLength(50);
        b.Property(x => x.DateOfBirthPrecision).IsRequired().HasMaxLength(10).HasDefaultValue(DatePrecision.Day);
        b.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
        b.Property(x => x.UpdatedAt).HasDefaultValueSql("now()");
        b.HasIndex(x => x.HrmId).IsUnique();
        b.HasOne<Employee>().WithOne().HasForeignKey<EmployeeProfile>(x => x.EmployeeCode).OnDelete(DeleteBehavior.Cascade);
    }
}

public class EmployeeSensitiveConfiguration : IEntityTypeConfiguration<EmployeeSensitive>
{
    public void Configure(EntityTypeBuilder<EmployeeSensitive> b)
    {
        b.ToTable("employee_sensitive");
        b.HasKey(x => x.EmployeeCode);
        b.Property(x => x.EmployeeCode).HasMaxLength(50);
        b.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
        b.Property(x => x.UpdatedAt).HasDefaultValueSql("now()");
        b.HasOne<Employee>().WithOne().HasForeignKey<EmployeeSensitive>(x => x.EmployeeCode).OnDelete(DeleteBehavior.Cascade);
    }
}

public class SalaryHistoryConfiguration() : HrmRowConfiguration<SalaryHistory>("salary_history")
{
    protected override void Extra(EntityTypeBuilder<SalaryHistory> b) =>
        b.HasIndex(x => new { x.EmployeeCode, x.EffectiveFrom }).IsDescending(false, true);
}

public class PositionHistoryConfiguration() : HrmRowConfiguration<PositionHistory>("position_history")
{
    protected override void Extra(EntityTypeBuilder<PositionHistory> b)
    {
        b.Property(x => x.Title).IsRequired();
        b.HasIndex(x => new { x.EmployeeCode, x.AppointedOn }).IsDescending(false, true);
    }
}

public class CommendationConfiguration() : HrmRowConfiguration<Commendation>("commendations")
{
    protected override void Checks(TableBuilder<Commendation> t) => t.HasCheckConstraint("ck_commendations_kind", "kind IN ('award','title')");

    protected override void Extra(EntityTypeBuilder<Commendation> b)
    {
        b.Property(x => x.Kind).IsRequired().HasMaxLength(10);
        b.Property(x => x.DecidedOnPrecision).IsRequired().HasMaxLength(10).HasDefaultValue(DatePrecision.Day);
        b.Property(x => x.Name).IsRequired();
        b.HasIndex(x => new { x.EmployeeCode, x.Kind, x.DecidedOn }).IsDescending(false, false, true);
    }
}

public class AcademicDegreeConfiguration() : HrmRowConfiguration<AcademicDegree>("academic_degrees")
{
    protected override void Extra(EntityTypeBuilder<AcademicDegree> b)
    {
        b.Property(x => x.EnrolledOnPrecision).IsRequired().HasMaxLength(10).HasDefaultValue(DatePrecision.Day);
        b.Property(x => x.GraduatedOnPrecision).IsRequired().HasMaxLength(10).HasDefaultValue(DatePrecision.Day);
        b.HasIndex(x => new { x.EmployeeCode, x.GraduatedOn }).IsDescending(false, true);
    }
}

public class TrainingConfiguration() : HrmRowConfiguration<Training>("trainings")
{
    protected override void Extra(EntityTypeBuilder<Training> b)
    {
        b.Property(x => x.Content).IsRequired();
        b.Property(x => x.StartOnPrecision).IsRequired().HasMaxLength(10).HasDefaultValue(DatePrecision.Day);
        b.Property(x => x.EndOnPrecision).IsRequired().HasMaxLength(10).HasDefaultValue(DatePrecision.Day);
        b.HasIndex(x => new { x.EmployeeCode, x.StartOn }).IsDescending(false, true);
    }
}

public class BusinessTripConfiguration() : HrmRowConfiguration<BusinessTrip>("business_trips")
{
    protected override void Extra(EntityTypeBuilder<BusinessTrip> b) =>
        b.HasIndex(x => new { x.EmployeeCode, x.FromOn }).IsDescending(false, true);
}

public class InnovationConfiguration() : HrmRowConfiguration<Innovation>("innovations")
{
    protected override void Extra(EntityTypeBuilder<Innovation> b)
    {
        b.Property(x => x.Title).IsRequired();
        b.HasIndex(x => new { x.EmployeeCode, x.RecognizedOn }).IsDescending(false, true);
    }
}

public class TeachingLoadConfiguration : IEntityTypeConfiguration<TeachingLoad>
{
    public void Configure(EntityTypeBuilder<TeachingLoad> b)
    {
        b.ToTable("teaching_loads", t =>
        {
            t.HasCheckConstraint("ck_teaching_loads_program", "program IN ('dai_hoc','cao_hoc','tien_si')");
            t.HasCheckConstraint("ck_teaching_loads_term",
                "(program = 'dai_hoc' AND term IS NOT NULL AND term BETWEEN 1 AND 3) OR (program <> 'dai_hoc' AND term IS NULL)");
        });
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).UseIdentityAlwaysColumn();
        b.Property(x => x.EmployeeCode).IsRequired().HasMaxLength(50);
        b.Property(x => x.AcademicYear).IsRequired().HasMaxLength(9);
        b.Property(x => x.Program).IsRequired().HasMaxLength(10);
        b.Property(x => x.CourseName).IsRequired();
        b.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
        b.Property(x => x.UpdatedAt).HasDefaultValueSql("now()");
        b.HasIndex(x => new { x.EmployeeCode, x.AcademicYear, x.Program, x.Term });
        b.HasIndex(x => x.AcademicYear);
        b.HasOne<Employee>().WithMany().HasForeignKey(x => x.EmployeeCode).OnDelete(DeleteBehavior.Cascade);
        b.HasOne<DatasetImport>().WithMany().HasForeignKey(x => x.SourceImportId).OnDelete(DeleteBehavior.SetNull);
    }
}

public class ResearchProjectConfiguration : IEntityTypeConfiguration<ResearchProject>
{
    public void Configure(EntityTypeBuilder<ResearchProject> b)
    {
        b.ToTable("research_projects");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).UseIdentityAlwaysColumn();
        b.Property(x => x.Code).IsRequired().HasMaxLength(100);
        b.Property(x => x.Title).IsRequired();
        b.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
        b.Property(x => x.UpdatedAt).HasDefaultValueSql("now()");
        b.HasIndex(x => x.Code).IsUnique();
        b.HasOne<DatasetImport>().WithMany().HasForeignKey(x => x.SourceImportId).OnDelete(DeleteBehavior.SetNull);
    }
}

public class ResearchProjectMemberConfiguration : IEntityTypeConfiguration<ResearchProjectMember>
{
    public void Configure(EntityTypeBuilder<ResearchProjectMember> b)
    {
        b.ToTable("research_project_members");
        b.HasKey(x => new { x.ProjectId, x.EmployeeCode });
        b.Property(x => x.EmployeeCode).HasMaxLength(50);
        b.Property(x => x.Role).IsRequired().HasMaxLength(30);
        b.HasIndex(x => x.EmployeeCode);
        b.HasOne<ResearchProject>().WithMany().HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne<Employee>().WithMany().HasForeignKey(x => x.EmployeeCode).OnDelete(DeleteBehavior.Cascade);
    }
}

public class PublicationConfiguration : IEntityTypeConfiguration<Publication>
{
    public void Configure(EntityTypeBuilder<Publication> b)
    {
        b.ToTable("publications");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).UseIdentityAlwaysColumn();
        b.Property(x => x.Doi).HasMaxLength(300);
        b.Property(x => x.Eid).HasMaxLength(100);
        b.Property(x => x.Title).IsRequired();
        b.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
        b.Property(x => x.UpdatedAt).HasDefaultValueSql("now()");
        b.HasIndex(x => x.Doi).IsUnique();
        b.HasIndex(x => x.Eid).IsUnique();
        b.HasOne<DatasetImport>().WithMany().HasForeignKey(x => x.SourceImportId).OnDelete(DeleteBehavior.SetNull);
    }
}

public class PublicationAuthorConfiguration : IEntityTypeConfiguration<PublicationAuthor>
{
    public void Configure(EntityTypeBuilder<PublicationAuthor> b)
    {
        b.ToTable("publication_authors");
        b.HasKey(x => new { x.PublicationId, x.EmployeeCode });
        b.Property(x => x.EmployeeCode).HasMaxLength(50);
        b.HasIndex(x => x.EmployeeCode);
        b.HasOne<Publication>().WithMany().HasForeignKey(x => x.PublicationId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne<Employee>().WithMany().HasForeignKey(x => x.EmployeeCode).OnDelete(DeleteBehavior.Cascade);
    }
}

public class DatasetImportConfiguration : IEntityTypeConfiguration<DatasetImport>
{
    public void Configure(EntityTypeBuilder<DatasetImport> b)
    {
        b.ToTable("dataset_imports", t =>
        {
            t.HasCheckConstraint("ck_dataset_imports_dataset", "dataset IN ('teaching','research','publications')");
            t.HasCheckConstraint("ck_dataset_imports_status", "status IN ('validated','applied','rejected')");
        });
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).ValueGeneratedNever();
        b.Property(x => x.Dataset).IsRequired().HasMaxLength(20);
        b.Property(x => x.Status).IsRequired().HasMaxLength(20);
        b.Property(x => x.Summary).HasColumnType("jsonb");
        b.Property(x => x.Report).HasColumnType("jsonb");
        b.Property(x => x.CreatedBy).HasMaxLength(50);
        b.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
        b.Property(x => x.UpdatedAt).HasDefaultValueSql("now()");
        b.HasIndex(x => new { x.Dataset, x.CreatedAt });
        b.HasOne<StoredFile>().WithMany().HasForeignKey(x => x.FileId).OnDelete(DeleteBehavior.Restrict);
    }
}

public class ApiClientConfiguration : IEntityTypeConfiguration<ApiClient>
{
    public void Configure(EntityTypeBuilder<ApiClient> b)
    {
        b.ToTable("api_clients");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).UseIdentityAlwaysColumn();
        b.Property(x => x.Name).IsRequired().HasMaxLength(100);
        b.Property(x => x.TokenHash).IsRequired().HasMaxLength(64).IsFixedLength();
        b.Property(x => x.Scopes).HasColumnType("text[]");
        b.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
        b.HasIndex(x => x.Name).IsUnique();
        b.HasIndex(x => x.TokenHash).IsUnique();
    }
}

public class SyncRunConfiguration : IEntityTypeConfiguration<SyncRun>
{
    public void Configure(EntityTypeBuilder<SyncRun> b)
    {
        b.ToTable("sync_runs", t => t.HasCheckConstraint("ck_sync_runs_status", "status IN ('running','success','failed','refused')"));
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).UseIdentityAlwaysColumn();
        b.Property(x => x.Source).IsRequired().HasMaxLength(100);
        b.Property(x => x.Dataset).IsRequired().HasMaxLength(50);
        b.Property(x => x.Status).IsRequired().HasMaxLength(20);
        b.Property(x => x.StartedAt).HasDefaultValueSql("now()");
        b.HasIndex(x => new { x.Dataset, x.StartedAt }).IsDescending(false, true);
    }
}

public class SyncIssueConfiguration : IEntityTypeConfiguration<SyncIssue>
{
    public void Configure(EntityTypeBuilder<SyncIssue> b)
    {
        b.ToTable("sync_issues");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).UseIdentityAlwaysColumn();
        b.Property(x => x.Dataset).IsRequired().HasMaxLength(50);
        b.Property(x => x.Kind).IsRequired().HasMaxLength(50);
        b.Property(x => x.SourceKey).IsRequired().HasMaxLength(200);
        b.Property(x => x.Details).HasColumnType("jsonb");
        b.Property(x => x.ResolvedBy).HasMaxLength(50);
        b.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
        b.HasIndex(x => x.SyncRunId);
        b.HasIndex(x => x.ResolvedAt).HasFilter("resolved_at IS NULL");
        b.HasOne<SyncRun>().WithMany().HasForeignKey(x => x.SyncRunId).OnDelete(DeleteBehavior.Cascade);
    }
}
