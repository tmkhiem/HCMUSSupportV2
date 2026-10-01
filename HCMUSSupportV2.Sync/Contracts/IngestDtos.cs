// COPY of HCMUSSupportV2.Backend/Modules/Hrm/Integration/IngestDtos.cs (the Sync tool must not reference the web project).
// Keep in sync with the backend; a drift shows up as ignored/missing properties on the API side.
namespace HCMUSSupportV2.Sync.Contracts;

// Request bodies of POST /api/integration/v1/{dataset}. Every body is { "rows": [ ... ] }, a FULL snapshot of the
// dataset. Dates are strings: yyyy-MM-dd, dd/MM/yyyy, yyyy-MM, MM/yyyy or yyyy (partial dates keep their precision);
// an unparseable date is stored as null and reported as a bad_date issue. See docs/INGEST.md.

public record IngestRequest<TRow>(IReadOnlyList<TRow> Rows);

public record OrgUnitRow(int HrmId, int? ParentHrmId, string Kind, string Name, string? Code, bool IsActive = true);

public record EmployeeRow(
    int? HrmId, string Code, string FullName, int? OrgUnitHrmId, int? DepartmentHrmId,
    string? PositionTitle, string? AcademicRank, string? Degree, string Status = "active");

public record SensitiveRow(
    string? NationalId, string? NationalIdIssuedOn, string? NationalIdIssuedBy, string? TaxCode,
    string? BankName, string? BankBranch, string? BankAccount, string? SocialInsuranceNo, string? HealthInsuranceNo);

public record ProfileRow(
    string EmployeeCode, int? HrmId, string? LastName, string? FirstName, string? DateOfBirth,
    string? Gender, string? Ethnicity, string? Religion, string? Nationality, string? BirthPlace, string? Hometown,
    string? PhoneMobile, string? PhoneHome, string? PersonalEmail,
    string? PermanentAddress, string? PermanentWard, string? PermanentDistrict, string? PermanentProvince,
    string? ContactAddress, string? ContactWard, string? ContactDistrict, string? ContactProvince,
    string? SalaryGradeCode, string? SalaryGradeName, int? SalaryStep, decimal? SalaryCoefficient, decimal? OverGradePct,
    string? EducationLevel, string? Major, string? PoliticalTheory,
    bool IsPartyMember, string? PartyJoinedOn, string? PartyFileNo, string? PartyCardNo,
    bool IsYouthUnionMember, string? YouthUnionJoinedOn, string? YouthFileNo, string? YouthCardNo,
    bool IsTradeUnionMember, string? TradeUnionJoinedOn, string? TradeUnionCardNo,
    SensitiveRow? Sensitive);

public record SalaryRow(
    int HrmId, string EmployeeCode, string? GradeCode, string? GradeName, int? Step, decimal? Coefficient, decimal? OverGradePct,
    string? DecisionNo, string? SignedOn, string? EffectiveFrom, string? NextRaiseOn, string? Note);

public record PositionRow(
    int HrmId, string EmployeeCode, string Title, string? UnitDescription, decimal? Coefficient,
    string? AppointedOn, string? DecisionNo, string? SignedOn, string? EndedOn);

/// <summary><c>Kind</c> is <c>award</c> (khen thuong) or <c>title</c> (danh hieu).</summary>
public record CommendationRow(
    int HrmId, string EmployeeCode, string Kind, string Name, string? AcademicYear, string? DecisionNo, string? DecidedOn);

public record DegreeRow(
    int HrmId, string EmployeeCode, string? DegreeType, string? Major, string? Institution, string? Country,
    string? TrainingForm, string? EnrolledOn, string? GraduatedOn, string? ThesisTitle);

public record TrainingRow(
    int HrmId, string EmployeeCode, string Content, string? Place, string? TrainingForm, string? StartOn, string? EndOn);

public record BusinessTripRow(
    int HrmId, string EmployeeCode, string? FromOn, string? ToOn, string? Place, string? Purpose, string? Transport,
    string? DecisionNo, string? DecidedOn, string? Note);

public record InnovationRow(
    int HrmId, string EmployeeCode, string? Code, string Title, string? Type, string? DecisionNo, string? RecognizedOn, string? AcademicYear);

/// <summary>Outcome of one ingest run (also the 200 body).</summary>
public record IngestResultDto(
    long RunId, string Dataset, string Status, int Received, int Inserted, int Updated, int Deleted,
    int IssueCount, IReadOnlyDictionary<string, int> IssuesByKind, IReadOnlyList<string> Notes);
