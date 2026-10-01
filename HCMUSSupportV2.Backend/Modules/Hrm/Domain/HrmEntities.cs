using System.ComponentModel.DataAnnotations.Schema;

namespace HCMUSSupportV2.Backend.Modules.Hrm.Domain;

/// <summary>Precision of a partial date: HRM sometimes stores only a month or a year. The <c>date</c> column holds the first day.</summary>
public static class DatePrecision
{
    public const string Day = "day";
    public const string Month = "month";
    public const string Year = "year";
}

/// <summary>Row of an HRM child table: keyed by the HRM source row id and owned by one employee.</summary>
public interface IHrmRow
{
    long Id { get; set; }
    int HrmId { get; set; }
    string EmployeeCode { get; set; }
}

/// <summary>Personal data of one employee (<c>employee_profiles</c>). Not sensitive: see <see cref="EmployeeSensitive"/>.</summary>
public class EmployeeProfile
{
    public string EmployeeCode { get; set; } = "";
    public int? HrmId { get; set; }
    public string? LastName { get; set; }
    public string? FirstName { get; set; }
    public DateOnly? DateOfBirth { get; set; }
    public string DateOfBirthPrecision { get; set; } = DatePrecision.Day;
    public string? Gender { get; set; }
    public string? Ethnicity { get; set; }
    public string? Religion { get; set; }
    public string? Nationality { get; set; }
    public string? BirthPlace { get; set; }
    public string? Hometown { get; set; }
    public string? PhoneMobile { get; set; }
    public string? PhoneHome { get; set; }
    public string? PersonalEmail { get; set; }
    public string? PermanentAddress { get; set; }
    public string? PermanentWard { get; set; }
    public string? PermanentDistrict { get; set; }
    public string? PermanentProvince { get; set; }
    public string? ContactAddress { get; set; }
    public string? ContactWard { get; set; }
    public string? ContactDistrict { get; set; }
    public string? ContactProvince { get; set; }
    public string? SalaryGradeCode { get; set; }
    public string? SalaryGradeName { get; set; }
    public int? SalaryStep { get; set; }
    [Column(TypeName = "numeric(5,2)")] public decimal? SalaryCoefficient { get; set; }
    [Column(TypeName = "numeric(5,2)")] public decimal? OverGradePct { get; set; }
    public string? EducationLevel { get; set; }
    public string? Major { get; set; }
    public string? PoliticalTheory { get; set; }
    public bool IsPartyMember { get; set; }
    public DateOnly? PartyJoinedOn { get; set; }
    public string? PartyFileNo { get; set; }
    public string? PartyCardNo { get; set; }
    public bool IsYouthUnionMember { get; set; }
    public DateOnly? YouthUnionJoinedOn { get; set; }
    public string? YouthFileNo { get; set; }
    public string? YouthCardNo { get; set; }
    public bool IsTradeUnionMember { get; set; }
    public DateOnly? TradeUnionJoinedOn { get; set; }
    public string? TradeUnionCardNo { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

/// <summary>Sensitive identifiers (<c>employee_sensitive</c>): never in a list, masked by default, every reveal audited.</summary>
public class EmployeeSensitive
{
    public string EmployeeCode { get; set; } = "";
    public string? NationalId { get; set; }
    public DateOnly? NationalIdIssuedOn { get; set; }
    public string? NationalIdIssuedBy { get; set; }
    public string? TaxCode { get; set; }
    public string? BankName { get; set; }
    public string? BankBranch { get; set; }
    public string? BankAccount { get; set; }
    public string? SocialInsuranceNo { get; set; }
    public string? HealthInsuranceNo { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public class SalaryHistory : IHrmRow
{
    public long Id { get; set; }
    public int HrmId { get; set; }
    public string EmployeeCode { get; set; } = "";
    public string? GradeCode { get; set; }
    public string? GradeName { get; set; }
    public int? Step { get; set; }
    [Column(TypeName = "numeric(5,2)")] public decimal? Coefficient { get; set; }
    [Column(TypeName = "numeric(5,2)")] public decimal? OverGradePct { get; set; }
    public string? DecisionNo { get; set; }
    public DateOnly? SignedOn { get; set; }
    public DateOnly? EffectiveFrom { get; set; }
    public DateOnly? NextRaiseOn { get; set; }
    public string? Note { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public class PositionHistory : IHrmRow
{
    public long Id { get; set; }
    public int HrmId { get; set; }
    public string EmployeeCode { get; set; } = "";
    public string Title { get; set; } = "";
    public string? UnitDescription { get; set; }
    [Column(TypeName = "numeric(4,2)")] public decimal? Coefficient { get; set; }
    public DateOnly? AppointedOn { get; set; }
    public string? DecisionNo { get; set; }
    public DateOnly? SignedOn { get; set; }
    public DateOnly? EndedOn { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public static class CommendationKinds
{
    public const string Award = "award";
    public const string Title = "title";
}

public class Commendation : IHrmRow
{
    public long Id { get; set; }
    public int HrmId { get; set; }
    public string EmployeeCode { get; set; } = "";
    public string Kind { get; set; } = CommendationKinds.Award;
    public string Name { get; set; } = "";
    public string? AcademicYear { get; set; }
    public string? DecisionNo { get; set; }
    public DateOnly? DecidedOn { get; set; }
    public string DecidedOnPrecision { get; set; } = DatePrecision.Day;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public class AcademicDegree : IHrmRow
{
    public long Id { get; set; }
    public int HrmId { get; set; }
    public string EmployeeCode { get; set; } = "";
    public string? DegreeType { get; set; }
    public string? Major { get; set; }
    public string? Institution { get; set; }
    public string? Country { get; set; }
    public string? TrainingForm { get; set; }
    public DateOnly? EnrolledOn { get; set; }
    public string EnrolledOnPrecision { get; set; } = DatePrecision.Day;
    public DateOnly? GraduatedOn { get; set; }
    public string GraduatedOnPrecision { get; set; } = DatePrecision.Day;
    public string? ThesisTitle { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public class Training : IHrmRow
{
    public long Id { get; set; }
    public int HrmId { get; set; }
    public string EmployeeCode { get; set; } = "";
    public string Content { get; set; } = "";
    public string? Place { get; set; }
    public string? TrainingForm { get; set; }
    public DateOnly? StartOn { get; set; }
    public string StartOnPrecision { get; set; } = DatePrecision.Day;
    public DateOnly? EndOn { get; set; }
    public string EndOnPrecision { get; set; } = DatePrecision.Day;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public class BusinessTrip : IHrmRow
{
    public long Id { get; set; }
    public int HrmId { get; set; }
    public string EmployeeCode { get; set; } = "";
    public DateOnly? FromOn { get; set; }
    public DateOnly? ToOn { get; set; }
    public string? Place { get; set; }
    public string? Purpose { get; set; }
    public string? Transport { get; set; }
    public string? DecisionNo { get; set; }
    public DateOnly? DecidedOn { get; set; }
    public string? Note { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public class Innovation : IHrmRow
{
    public long Id { get; set; }
    public int HrmId { get; set; }
    public string EmployeeCode { get; set; } = "";
    public string? Code { get; set; }
    public string Title { get; set; } = "";
    public string? Type { get; set; }
    public string? DecisionNo { get; set; }
    public DateOnly? RecognizedOn { get; set; }
    public string? AcademicYear { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

// ---- Admin Excel datasets (teaching, research, publications) ----

public class TeachingLoad
{
    public long Id { get; set; }
    public string EmployeeCode { get; set; } = "";
    /// <summary>"2024-2025".</summary>
    public string AcademicYear { get; set; } = "";
    public int Term { get; set; }
    public string? CourseCode { get; set; }
    public string CourseName { get; set; } = "";
    public string? ClassCode { get; set; }
    public string? Level { get; set; }
    public int Periods { get; set; }
    [Column(TypeName = "numeric(7,2)")] public decimal StandardHours { get; set; }
    public Guid? SourceImportId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public class ResearchProject
{
    public long Id { get; set; }
    public string Code { get; set; } = "";
    public string Title { get; set; } = "";
    public string? Level { get; set; }
    public string? ResearchType { get; set; }
    [Column(TypeName = "numeric(14,0)")] public decimal? Funding { get; set; }
    public string? PeriodText { get; set; }
    public DateOnly? AcceptedOn { get; set; }
    public string? Result { get; set; }
    public Guid? SourceImportId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public class ResearchProjectMember
{
    public long ProjectId { get; set; }
    public string EmployeeCode { get; set; } = "";
    /// <summary><c>chu_nhiem</c>, <c>thanh_vien</c>, ...</summary>
    public string Role { get; set; } = "thanh_vien";
}

public class Publication
{
    public long Id { get; set; }
    public string? Doi { get; set; }
    public string? Eid { get; set; }
    public string Title { get; set; } = "";
    public string? Venue { get; set; }
    public int? Year { get; set; }
    public string? Details { get; set; }
    public string? Url { get; set; }
    public Guid? SourceImportId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public class PublicationAuthor
{
    public long PublicationId { get; set; }
    public string EmployeeCode { get; set; } = "";
    public int Ordinal { get; set; }
}

public static class ImportStatuses
{
    public const string Validated = "validated";
    public const string Applied = "applied";
    public const string Rejected = "rejected";
}

/// <summary>An uploaded Excel dataset awaiting (or past) apply (<c>dataset_imports</c>). D07 has its own table for recipient imports.</summary>
public class DatasetImport
{
    public Guid Id { get; set; }
    /// <summary><c>teaching</c>, <c>research</c> or <c>publications</c>.</summary>
    public string Dataset { get; set; } = "";
    public Guid FileId { get; set; }
    public string Status { get; set; } = ImportStatuses.Validated;
    /// <summary>jsonb: counts.</summary>
    public string Summary { get; set; } = "{}";
    /// <summary>jsonb: full validation report.</summary>
    public string Report { get; set; } = "{}";
    public string? CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

// ---- Ingest bookkeeping ----

public class ApiClient
{
    public long Id { get; set; }
    public string Name { get; set; } = "";
    /// <summary>Lower-case hex SHA-256 of the token. The token itself is never stored.</summary>
    public string TokenHash { get; set; } = "";
    public string[] Scopes { get; set; } = [];
    public DateTimeOffset? LastUsedAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public static class SyncStatuses
{
    public const string Running = "running";
    public const string Success = "success";
    public const string Failed = "failed";
    public const string Refused = "refused";
}

public class SyncRun
{
    public long Id { get; set; }
    public string Source { get; set; } = "";
    public string Dataset { get; set; } = "";
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset? FinishedAt { get; set; }
    public string Status { get; set; } = SyncStatuses.Running;
    /// <summary>Rows in the posted snapshot (before quarantine); the truncation guard compares against this.</summary>
    public int Received { get; set; }
    public int Inserted { get; set; }
    public int Updated { get; set; }
    public int Deleted { get; set; }
    public string? Error { get; set; }
}

public static class SyncIssueKinds
{
    public const string DuplicateMscb = "duplicate_mscb";
    public const string UnknownUnit = "unknown_unit";
    public const string BadDate = "bad_date";
    public const string UnknownEmployee = "unknown_employee";
    public const string DuplicateRow = "duplicate_row";
    public const string BadRow = "bad_row";
}

public class SyncIssue
{
    public long Id { get; set; }
    public long SyncRunId { get; set; }
    public string Dataset { get; set; } = "";
    public string Kind { get; set; } = "";
    public string SourceKey { get; set; } = "";
    public string? Details { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ResolvedAt { get; set; }
    public string? ResolvedBy { get; set; }
}
