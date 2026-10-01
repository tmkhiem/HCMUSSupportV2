namespace HCMUSSupportV2.Backend.Modules.Hrm.Me;

// Response shapes of GET /api/me/*. Each is shaped for one bespoke page (PLAN section 7.3). Dates that may be partial
// travel as PartialDateDto: the client formats by precision (day = dd/MM/yyyy, month = MM/yyyy, year = yyyy).

public record PartialDateDto(DateOnly? Date, string Precision);

public record PageDto<T>(IReadOnlyList<T> Items, long? NextCursor);

// ---- Hồ sơ: overview

public record HeroDto(string Code, string FullName, string? PhotoUrl, string? PositionTitle, string? Unit, string? Email, string? Phone);

public record SalaryCardDto(string? GradeName, int? Step, decimal? Coefficient, DateOnly? NextRaiseOn);
public record PositionCardDto(string? CurrentTitle, int Count);
public record CommendationCardDto(int Awards, int Titles);
public record DegreeCardDto(int Count, string? LatestDegreeType, string? LatestMajor);

public record ProfileOverviewDto(
    HeroDto Hero, SalaryCardDto Salary, PositionCardDto Positions, CommendationCardDto Commendations, DegreeCardDto Degrees,
    int TrainingCount, int BusinessTripCount, int InnovationCount, bool HasProfile);

// ---- Hồ sơ: Thông tin chung

public record AddressDto(string? Address, string? Ward, string? District, string? Province);

public record GeneralProfileDto(
    string Code, string FullName, string? LastName, string? FirstName, PartialDateDto DateOfBirth, string? Gender, string? Ethnicity,
    string? Religion, string? Nationality, string? BirthPlace, string? Hometown,
    string? PhoneMobile, string? PhoneHome, string? PersonalEmail, IReadOnlyList<string> Emails,
    AddressDto PermanentAddress, AddressDto ContactAddress);

// ---- Hồ sơ: Thông tin chi tiết

/// <summary>A sensitive value: only the masked form (<c>•••• 1234</c>) is ever returned here; reveal goes through POST me/profile/sensitive/reveal.</summary>
public record MaskedFieldDto(string Field, string? Masked, bool HasValue);

public record MembershipDto(bool IsMember, DateOnly? JoinedOn, string? FileNo, string? CardNo);

public record DetailedProfileDto(
    string? Unit, string? Department, string? PositionTitle,
    string? SalaryGradeCode, string? SalaryGradeName, int? SalaryStep, decimal? SalaryCoefficient, decimal? OverGradePct,
    string? AcademicRank, string? Degree, string? EducationLevel, string? Major, string? PoliticalTheory,
    MembershipDto Party, MembershipDto YouthUnion, MembershipDto TradeUnion,
    MaskedFieldDto NationalId, DateOnly? NationalIdIssuedOn, string? NationalIdIssuedBy,
    MaskedFieldDto TaxCode, string? BankName, string? BankBranch, MaskedFieldDto BankAccount,
    MaskedFieldDto SocialInsuranceNo, MaskedFieldDto HealthInsuranceNo);

public record RevealRequest(string Field);

public record RevealResponse(string Field, string Value);

// ---- Lương

public record SalaryEntryDto(
    long Id, string? GradeCode, string? GradeName, int? Step, decimal? Coefficient, decimal? OverGradePct,
    string? DecisionNo, DateOnly? SignedOn, DateOnly? EffectiveFrom, DateOnly? NextRaiseOn, string? Note);

public record SalaryCurrentDto(
    string? GradeCode, string? GradeName, int? Step, decimal? Coefficient, decimal? OverGradePct,
    DateOnly? EffectiveFrom, DateOnly? NextRaiseOn, int? MonthsToNextRaise);

/// <summary>Current grade/step/coefficient (latest decision, else the profile) plus every decision, newest effective date first.</summary>
public record SalaryDto(SalaryCurrentDto? Current, IReadOnlyList<SalaryEntryDto> History);

// ---- Chức vụ

public record PositionEntryDto(
    long Id, string Title, string? UnitDescription, decimal? Coefficient, DateOnly? AppointedOn, string? DecisionNo, DateOnly? SignedOn,
    DateOnly? EndedOn, bool IsCurrent, int? TenureYears, int? TenureMonths);

public record PositionsDto(PositionEntryDto? Current, IReadOnlyList<PositionEntryDto> Items);

// ---- Khen thưởng

public record CommendationEntryDto(long Id, string Name, string? DecisionNo, PartialDateDto DecidedOn);

/// <summary>Commendations of one academic year (<c>AcademicYear</c> null for those without one, listed last).</summary>
public record CommendationGroupDto(string? AcademicYear, IReadOnlyList<CommendationEntryDto> Items);

public record CommendationsDto(
    int AwardCount, int TitleCount, IReadOnlyList<CommendationGroupDto> Awards, IReadOnlyList<CommendationGroupDto> Titles);

// ---- Đào tạo / bồi dưỡng / công tác

public record DegreeEntryDto(
    long Id, string? DegreeType, string? Major, string? Institution, string? Country, string? TrainingForm,
    PartialDateDto EnrolledOn, PartialDateDto GraduatedOn, string? ThesisTitle);

public record TrainingEntryDto(
    long Id, string Content, string? Place, string? TrainingForm, PartialDateDto StartOn, PartialDateDto EndOn, int? Year);

public record BusinessTripEntryDto(
    long Id, DateOnly? FromOn, DateOnly? ToOn, int? Days, string? Place, string? Purpose, string? Transport, string? DecisionNo, DateOnly? DecidedOn, string? Note);

public record BusinessTripStatsDto(int TripCount, int TotalDays);

public record BusinessTripsDto(BusinessTripStatsDto Stats, IReadOnlyList<int> Years, IReadOnlyList<BusinessTripEntryDto> Items);

// ---- Sáng kiến

public record InnovationEntryDto(long Id, string? Code, string Title, string? Type, string? DecisionNo, DateOnly? RecognizedOn, string? AcademicYear);

public record InnovationTypeCountDto(string? Type, int Count);

public record InnovationStatsDto(int Count, IReadOnlyList<InnovationTypeCountDto> ByType);

public record InnovationsDto(InnovationStatsDto Stats, IReadOnlyList<InnovationEntryDto> Items, long? NextCursor);

// ---- Giảng dạy

public record TeachingEntryDto(long Id, string? CourseCode, string CourseName, string? ClassCode, string? Level, int Periods, decimal StandardHours);

public record TeachingTermDto(int Term, IReadOnlyList<TeachingEntryDto> Items);

public record TeachingStatsDto(decimal TotalStandardHours, int Classes, int Courses);

public record TeachingDto(
    string? AcademicYear, TeachingStatsDto Stats, IReadOnlyList<TeachingTermDto> Terms, string? SourceCaption, DateTimeOffset? SourceUpdatedAt);

// ---- NCKH

public record ResearchMemberDto(string EmployeeCode, string? FullName, string Role);

public record ResearchProjectDto(
    long Id, string Code, string Title, string? Level, string? ResearchType, decimal? Funding, string? PeriodText, DateOnly? AcceptedOn,
    string? Result, string MyRole, IReadOnlyList<ResearchMemberDto> Members);

public record PublicationAuthorDto(string EmployeeCode, string? FullName, int Ordinal);

public record PublicationDto(
    long Id, string? Doi, string? Eid, string Title, string? Venue, int? Year, string? Details, string? Url, int MyOrdinal,
    IReadOnlyList<PublicationAuthorDto> Authors);
