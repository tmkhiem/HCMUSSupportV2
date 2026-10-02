using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Hrm.Domain;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using Microsoft.EntityFrameworkCore;

namespace HCMUSSupportV2.Backend.Modules.Hrm.Me;

/// <summary>Self-service reads of one employee's own HRM records. Every method takes the (view-as aware) effective code.</summary>
public class MeService(AppDbContext db, TimeProvider time)
{
    public const int DefaultPageSize = 30;
    public const int MaxPageSize = 100;

    /// <summary>Fields <c>POST me/profile/sensitive/reveal</c> accepts.</summary>
    public static readonly string[] SensitiveFields = ["national_id", "tax_code", "bank_account", "social_insurance_no", "health_insurance_no"];

    private DateOnly Today => DateOnly.FromDateTime(time.GetUtcNow().UtcDateTime);

    private IQueryable<T> Own<T>(string code) where T : class, IHrmRow => db.Set<T>().AsNoTracking().Where(x => x.EmployeeCode == code);

    private static PartialDateDto P(DateOnly? date, string precision) => new(date, date is null ? DatePrecision.Day : precision);

    public static string? Mask(string? value)
    {
        if (string.IsNullOrEmpty(value)) return null;
        return value.Length <= 4 ? "••••" : "•••• " + value[^4..];
    }

    private static MaskedFieldDto Masked(string field, string? value) => new(field, Mask(value), !string.IsNullOrEmpty(value));

    private async Task<(Employee Employee, string? Unit, string? Department)?> LoadEmployeeAsync(string code, CancellationToken ct)
    {
        var e = await db.Set<Employee>().AsNoTracking().FirstOrDefaultAsync(x => x.Code == code, ct);
        if (e is null) return null;
        string? unit = null, dept = null;
        if (e.OrgUnitId is { } u) unit = await db.Set<OrgUnit>().AsNoTracking().Where(x => x.Id == u).Select(x => x.Name).FirstOrDefaultAsync(ct);
        if (e.DepartmentId is { } d) dept = await db.Set<OrgUnit>().AsNoTracking().Where(x => x.Id == d).Select(x => x.Name).FirstOrDefaultAsync(ct);
        return (e, unit, dept);
    }

    // ---------------------------------------------------------------- profile

    public async Task<ProfileOverviewDto?> OverviewAsync(string code, CancellationToken ct)
    {
        if (await LoadEmployeeAsync(code, ct) is not { } loaded) return null;
        var (e, unit, _) = loaded;
        var profile = await db.Set<EmployeeProfile>().AsNoTracking().FirstOrDefaultAsync(p => p.EmployeeCode == code, ct);
        var email = await db.Set<EmployeeEmail>().AsNoTracking().Where(m => m.EmployeeCode == code)
            .OrderByDescending(m => m.IsPrimary).ThenBy(m => m.Email).Select(m => m.Email).FirstOrDefaultAsync(ct);
        var hero = new HeroDto(e.Code, e.FullName, e.PhotoUrl, e.PositionTitle, unit, email, profile?.PhoneMobile ?? profile?.PhoneHome);

        var salary = (await SalaryAsync(code, ct)).Current;
        var positions = await Own<PositionHistory>(code).OrderBy(p => p.EndedOn != null).ThenByDescending(p => p.AppointedOn).ToListAsync(ct);
        var current = positions.FirstOrDefault(p => p.EndedOn == null);
        var kinds = await Own<Commendation>(code).GroupBy(c => c.Kind).Select(g => new { Kind = g.Key, N = g.Count() }).ToListAsync(ct);
        var degreeCount = await Own<AcademicDegree>(code).CountAsync(ct);
        var latestDegree = await Own<AcademicDegree>(code).OrderByDescending(d => d.GraduatedOn).ThenByDescending(d => d.Id).FirstOrDefaultAsync(ct);

        return new ProfileOverviewDto(
            hero,
            new SalaryCardDto(salary?.GradeName, salary?.Step, salary?.Coefficient, salary?.NextRaiseOn),
            new PositionCardDto(current?.Title ?? e.PositionTitle, positions.Count),
            new CommendationCardDto(kinds.FirstOrDefault(k => k.Kind == CommendationKinds.Award)?.N ?? 0, kinds.FirstOrDefault(k => k.Kind == CommendationKinds.Title)?.N ?? 0),
            new DegreeCardDto(degreeCount, latestDegree?.DegreeType, latestDegree?.Major),
            await Own<Training>(code).CountAsync(ct), await Own<BusinessTrip>(code).CountAsync(ct), await Own<Innovation>(code).CountAsync(ct),
            profile is not null);
    }

    public async Task<GeneralProfileDto?> GeneralAsync(string code, CancellationToken ct)
    {
        if (await LoadEmployeeAsync(code, ct) is not { } loaded) return null;
        var e = loaded.Employee;
        var p = await db.Set<EmployeeProfile>().AsNoTracking().FirstOrDefaultAsync(x => x.EmployeeCode == code, ct);
        var emails = await db.Set<EmployeeEmail>().AsNoTracking().Where(m => m.EmployeeCode == code)
            .OrderByDescending(m => m.IsPrimary).ThenBy(m => m.Email).Select(m => m.Email).ToListAsync(ct);
        return new GeneralProfileDto(
            e.Code, e.FullName, p?.LastName, p?.FirstName, P(p?.DateOfBirth, p?.DateOfBirthPrecision ?? DatePrecision.Day),
            p?.Gender, p?.Ethnicity, p?.Religion, p?.Nationality, p?.BirthPlace, p?.Hometown,
            p?.PhoneMobile, p?.PhoneHome, p?.PersonalEmail, emails,
            new AddressDto(p?.PermanentAddress, p?.PermanentWard, p?.PermanentDistrict, p?.PermanentProvince),
            new AddressDto(p?.ContactAddress, p?.ContactWard, p?.ContactDistrict, p?.ContactProvince));
    }

    public async Task<DetailedProfileDto?> DetailedAsync(string code, CancellationToken ct)
    {
        if (await LoadEmployeeAsync(code, ct) is not { } loaded) return null;
        var (e, unit, dept) = loaded;
        var p = await db.Set<EmployeeProfile>().AsNoTracking().FirstOrDefaultAsync(x => x.EmployeeCode == code, ct);
        var s = await db.Set<EmployeeSensitive>().AsNoTracking().FirstOrDefaultAsync(x => x.EmployeeCode == code, ct);
        return new DetailedProfileDto(
            unit, dept, e.PositionTitle, p?.SalaryGradeCode, p?.SalaryGradeName, p?.SalaryStep, p?.SalaryCoefficient, p?.OverGradePct,
            e.AcademicRank, e.Degree, p?.EducationLevel, p?.Major, p?.PoliticalTheory,
            new MembershipDto(p?.IsPartyMember ?? false, p?.PartyJoinedOn, p?.PartyFileNo, p?.PartyCardNo),
            new MembershipDto(p?.IsYouthUnionMember ?? false, p?.YouthUnionJoinedOn, p?.YouthFileNo, p?.YouthCardNo),
            new MembershipDto(p?.IsTradeUnionMember ?? false, p?.TradeUnionJoinedOn, null, p?.TradeUnionCardNo),
            Masked("national_id", s?.NationalId), s?.NationalIdIssuedOn, s?.NationalIdIssuedBy,
            Masked("tax_code", s?.TaxCode), s?.BankName, s?.BankBranch, Masked("bank_account", s?.BankAccount),
            Masked("social_insurance_no", s?.SocialInsuranceNo), Masked("health_insurance_no", s?.HealthInsuranceNo));
    }

    /// <summary>The full value of one sensitive field, or null when the employee has none. <paramref name="field"/> must be in <see cref="SensitiveFields"/>.</summary>
    public async Task<string?> SensitiveValueAsync(string code, string field, CancellationToken ct)
    {
        var s = await db.Set<EmployeeSensitive>().AsNoTracking().FirstOrDefaultAsync(x => x.EmployeeCode == code, ct);
        return field switch
        {
            "national_id" => s?.NationalId,
            "tax_code" => s?.TaxCode,
            "bank_account" => s?.BankAccount,
            "social_insurance_no" => s?.SocialInsuranceNo,
            "health_insurance_no" => s?.HealthInsuranceNo,
            _ => null,
        };
    }

    // ---------------------------------------------------------------- salary, positions

    public async Task<SalaryDto> SalaryAsync(string code, CancellationToken ct)
    {
        var rows = await Own<SalaryHistory>(code)
            .OrderBy(s => s.EffectiveFrom == null).ThenByDescending(s => s.EffectiveFrom).ThenByDescending(s => s.Id).ToListAsync(ct);
        var history = rows.Select(s => new SalaryEntryDto(s.Id, s.GradeCode, s.GradeName, s.Step, s.Coefficient, s.OverGradePct, s.DecisionNo, s.SignedOn, s.EffectiveFrom, s.NextRaiseOn, s.Note)).ToList();

        SalaryCurrentDto? current = null;
        if (rows.FirstOrDefault() is { } latest)
        {
            current = new SalaryCurrentDto(latest.GradeCode, latest.GradeName, latest.Step, latest.Coefficient, latest.OverGradePct,
                latest.EffectiveFrom, latest.NextRaiseOn, MonthsUntil(latest.NextRaiseOn));
        }
        else if (await db.Set<EmployeeProfile>().AsNoTracking().FirstOrDefaultAsync(p => p.EmployeeCode == code, ct) is { SalaryCoefficient: not null } p)
        {
            current = new SalaryCurrentDto(p.SalaryGradeCode, p.SalaryGradeName, p.SalaryStep, p.SalaryCoefficient, p.OverGradePct, null, null, null);
        }
        return new SalaryDto(current, history);
    }

    private int? MonthsUntil(DateOnly? date)
    {
        if (date is null) return null;
        var today = Today;
        if (date <= today) return 0;
        var months = (date.Value.Year - today.Year) * 12 + date.Value.Month - today.Month;
        if (date.Value.Day < today.Day) months--;
        return Math.Max(months, 0);
    }

    public async Task<PositionsDto> PositionsAsync(string code, CancellationToken ct)
    {
        var rows = await Own<PositionHistory>(code)
            .OrderBy(p => p.EndedOn != null).ThenByDescending(p => p.AppointedOn).ThenByDescending(p => p.Id).ToListAsync(ct);
        var today = Today;
        var items = rows.Select(p =>
        {
            int? years = null, months = null;
            if (p.AppointedOn is { } from)
            {
                var to = p.EndedOn ?? today;
                var total = Math.Max((to.Year - from.Year) * 12 + to.Month - from.Month - (to.Day < from.Day ? 1 : 0), 0);
                years = total / 12;
                months = total % 12;
            }
            return new PositionEntryDto(p.Id, p.Title, p.UnitDescription, p.Coefficient, p.AppointedOn, p.DecisionNo, p.SignedOn, p.EndedOn, p.EndedOn is null, years, months);
        }).ToList();
        return new PositionsDto(items.FirstOrDefault(i => i.IsCurrent), items);
    }

    // ---------------------------------------------------------------- commendations, degrees, trainings, trips

    public async Task<CommendationsDto> CommendationsAsync(string code, CancellationToken ct)
    {
        var rows = await Own<Commendation>(code).OrderByDescending(c => c.DecidedOn).ThenByDescending(c => c.Id).ToListAsync(ct);
        IReadOnlyList<CommendationGroupDto> Group(string kind) => rows.Where(c => c.Kind == kind)
            .GroupBy(c => c.AcademicYear)
            .OrderBy(g => g.Key is null).ThenByDescending(g => g.Key, StringComparer.Ordinal)
            .Select(g => new CommendationGroupDto(g.Key, g.Select(c => new CommendationEntryDto(c.Id, c.Name, c.DecisionNo, P(c.DecidedOn, c.DecidedOnPrecision))).ToList()))
            .ToList();
        return new CommendationsDto(rows.Count(c => c.Kind == CommendationKinds.Award), rows.Count(c => c.Kind == CommendationKinds.Title),
            Group(CommendationKinds.Award), Group(CommendationKinds.Title));
    }

    public async Task<IReadOnlyList<DegreeEntryDto>> DegreesAsync(string code, CancellationToken ct) =>
        (await Own<AcademicDegree>(code).OrderBy(d => d.GraduatedOn == null).ThenByDescending(d => d.GraduatedOn).ThenByDescending(d => d.Id).ToListAsync(ct))
        .Select(d => new DegreeEntryDto(d.Id, d.DegreeType, d.Major, d.Institution, d.Country, d.TrainingForm,
            P(d.EnrolledOn, d.EnrolledOnPrecision), P(d.GraduatedOn, d.GraduatedOnPrecision), d.ThesisTitle)).ToList();

    public async Task<IReadOnlyList<TrainingEntryDto>> TrainingsAsync(string code, CancellationToken ct) =>
        (await Own<Training>(code).OrderBy(t => t.StartOn == null).ThenByDescending(t => t.StartOn).ThenByDescending(t => t.Id).ToListAsync(ct))
        .Select(t => new TrainingEntryDto(t.Id, t.Content, t.Place, t.TrainingForm, P(t.StartOn, t.StartOnPrecision), P(t.EndOn, t.EndOnPrecision), t.StartOn?.Year)).ToList();

    public async Task<BusinessTripsDto> BusinessTripsAsync(string code, CancellationToken ct)
    {
        var rows = await Own<BusinessTrip>(code).OrderBy(t => t.FromOn == null).ThenByDescending(t => t.FromOn).ThenByDescending(t => t.Id).ToListAsync(ct);
        var items = rows.Select(t => new BusinessTripEntryDto(t.Id, t.FromOn, t.ToOn,
            t.FromOn is { } f && t.ToOn is { } to && to >= f ? to.DayNumber - f.DayNumber + 1 : null,
            t.Place, t.Purpose, t.Transport, t.DecisionNo, t.DecidedOn, t.Note)).ToList();
        var years = rows.Where(t => t.FromOn != null).Select(t => t.FromOn!.Value.Year).Distinct().OrderByDescending(y => y).ToList();
        return new BusinessTripsDto(new BusinessTripStatsDto(items.Count, items.Sum(i => i.Days ?? 0)), years, items);
    }

    // ---------------------------------------------------------------- innovations (search + cursor)

    public async Task<InnovationsDto> InnovationsAsync(string code, string? q, long? cursor, int? limit, CancellationToken ct)
    {
        var all = Own<Innovation>(code);
        var byType = await all.GroupBy(i => i.Type).Select(g => new InnovationTypeCountDto(g.Key, g.Count())).ToListAsync(ct);
        var stats = new InnovationStatsDto(byType.Sum(t => t.Count), byType.OrderByDescending(t => t.Count).ThenBy(t => t.Type).ToList());

        var query = all;
        if (!string.IsNullOrWhiteSpace(q))
        {
            var pattern = "%" + q.Trim().Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_") + "%";
            query = query.Where(i => EF.Functions.ILike(i.Title, pattern) || (i.Code != null && EF.Functions.ILike(i.Code, pattern)) || (i.Type != null && EF.Functions.ILike(i.Type, pattern)));
        }
        if (cursor is { } c) query = query.Where(i => i.Id < c);

        var size = Math.Clamp(limit ?? DefaultPageSize, 1, MaxPageSize);
        var page = await query.OrderByDescending(i => i.Id).Take(size + 1).ToListAsync(ct);
        var more = page.Count > size;
        if (more) page.RemoveAt(size);
        return new InnovationsDto(stats,
            page.Select(i => new InnovationEntryDto(i.Id, i.Code, i.Title, i.Type, i.DecisionNo, i.RecognizedOn, i.AcademicYear)).ToList(),
            more ? page[^1].Id : null);
    }

    // ---------------------------------------------------------------- teaching

    public async Task<IReadOnlyList<string>> TeachingYearsAsync(string code, CancellationToken ct) =>
        await db.Set<TeachingLoad>().AsNoTracking().Where(t => t.EmployeeCode == code)
            .Select(t => t.AcademicYear).Distinct().OrderByDescending(y => y).ToListAsync(ct);

    public async Task<TeachingDto> TeachingAsync(string code, string? year, CancellationToken ct)
    {
        year ??= (await TeachingYearsAsync(code, ct)).FirstOrDefault();
        if (year is null) return new TeachingDto(null, TeachingStats([]), [], null, null);

        var rows = await db.Set<TeachingLoad>().AsNoTracking()
            .Where(t => t.EmployeeCode == code && t.AcademicYear == year)
            .OrderBy(t => t.Term).ThenBy(t => t.Module).ThenBy(t => t.CourseName).ThenBy(t => t.Id).ToListAsync(ct);

        static TeachingEntryDto Entry(TeachingLoad r) =>
            new(r.Id, r.CourseCode, r.CourseName, r.ClassCode, r.Track, r.Activity, r.Periods, r.StandardHours, r.Module);

        var programs = new List<TeachingProgramDto>();
        foreach (var program in TeachingPrograms.All)
        {
            var own = rows.Where(r => r.Program == program).ToList();
            if (own.Count == 0) continue;
            IReadOnlyList<TeachingTermDto> terms = [];
            IReadOnlyList<TeachingModuleDto> modules = [];
            if (program == TeachingPrograms.DaiHoc)
            {
                terms = own.GroupBy(r => r.Term ?? 0).OrderBy(g => g.Key)
                    .Select(g => new TeachingTermDto(g.Key, g.Select(Entry).ToList())).ToList();
            }
            else
            {
                // Named modules first (alphabetical), the "no module" group last.
                modules = own.GroupBy(r => r.Module).OrderBy(g => g.Key is null).ThenBy(g => g.Key, StringComparer.CurrentCultureIgnoreCase)
                    .Select(g => new TeachingModuleDto(g.Key, g.Select(Entry).ToList())).ToList();
            }
            programs.Add(new TeachingProgramDto(program, TeachingStats(own), terms, modules));
        }
        var updated = rows.Count == 0 ? (DateTimeOffset?)null : rows.Max(r => r.UpdatedAt);
        return new TeachingDto(year, TeachingStats(rows), programs, rows.Count == 0 ? null : $"Nguồn: Phòng Đào tạo, năm học {year}", updated);
    }

    private static TeachingStatsDto TeachingStats(IReadOnlyCollection<TeachingLoad> rows) =>
        new(rows.Sum(r => r.StandardHours),
            rows.Select(r => r.ClassCode ?? r.CourseCode ?? r.CourseName).Distinct().Count(),
            rows.Select(r => r.CourseCode ?? r.CourseName).Distinct().Count());

    // ---------------------------------------------------------------- research

    public async Task<PageDto<ResearchProjectDto>> ResearchProjectsAsync(string code, string? q, long? cursor, int? limit, CancellationToken ct)
    {
        var mine = from m in db.Set<ResearchProjectMember>().AsNoTracking()
                   join p in db.Set<ResearchProject>().AsNoTracking() on m.ProjectId equals p.Id
                   where m.EmployeeCode == code
                   select new { Project = p, m.Role };
        if (!string.IsNullOrWhiteSpace(q))
        {
            var pattern = Like(q);
            mine = mine.Where(x => EF.Functions.ILike(x.Project.Title, pattern) || EF.Functions.ILike(x.Project.Code, pattern));
        }
        if (cursor is { } c) mine = mine.Where(x => x.Project.Id < c);

        var size = Math.Clamp(limit ?? DefaultPageSize, 1, MaxPageSize);
        var page = await mine.OrderByDescending(x => x.Project.Id).Take(size + 1).ToListAsync(ct);
        var more = page.Count > size;
        if (more) page.RemoveAt(size);

        var ids = page.Select(x => x.Project.Id).ToList();
        var members = await (from m in db.Set<ResearchProjectMember>().AsNoTracking()
                             join e in db.Set<Employee>().AsNoTracking() on m.EmployeeCode equals e.Code
                             where ids.Contains(m.ProjectId)
                             orderby m.Role != "chu_nhiem", e.FullName
                             select new { m.ProjectId, m.EmployeeCode, e.FullName, m.Role }).ToListAsync(ct);
        var items = page.Select(x => new ResearchProjectDto(
            x.Project.Id, x.Project.Code, x.Project.Title, x.Project.Level, x.Project.ResearchType, x.Project.Funding, x.Project.PeriodText,
            x.Project.AcceptedOn, x.Project.Result, x.Role,
            members.Where(m => m.ProjectId == x.Project.Id).Select(m => new ResearchMemberDto(m.EmployeeCode, m.FullName, m.Role)).ToList())).ToList();
        return new PageDto<ResearchProjectDto>(items, more ? page[^1].Project.Id : null);
    }

    public async Task<PageDto<PublicationDto>> PublicationsAsync(string code, string? q, long? cursor, int? limit, CancellationToken ct)
    {
        var mine = from a in db.Set<PublicationAuthor>().AsNoTracking()
                   join p in db.Set<Publication>().AsNoTracking() on a.PublicationId equals p.Id
                   where a.EmployeeCode == code
                   select new { Publication = p, a.Ordinal };
        if (!string.IsNullOrWhiteSpace(q))
        {
            var pattern = Like(q);
            mine = mine.Where(x => EF.Functions.ILike(x.Publication.Title, pattern) || (x.Publication.Venue != null && EF.Functions.ILike(x.Publication.Venue, pattern))
                || (x.Publication.Doi != null && EF.Functions.ILike(x.Publication.Doi, pattern)));
        }
        if (cursor is { } c) mine = mine.Where(x => x.Publication.Id < c);

        var size = Math.Clamp(limit ?? DefaultPageSize, 1, MaxPageSize);
        var page = await mine.OrderByDescending(x => x.Publication.Id).Take(size + 1).ToListAsync(ct);
        var more = page.Count > size;
        if (more) page.RemoveAt(size);

        var ids = page.Select(x => x.Publication.Id).ToList();
        var authors = await (from a in db.Set<PublicationAuthor>().AsNoTracking()
                             join e in db.Set<Employee>().AsNoTracking() on a.EmployeeCode equals e.Code
                             where ids.Contains(a.PublicationId)
                             orderby a.Ordinal
                             select new { a.PublicationId, a.EmployeeCode, e.FullName, a.Ordinal }).ToListAsync(ct);
        var items = page.Select(x => new PublicationDto(
            x.Publication.Id, x.Publication.Doi, x.Publication.Eid, x.Publication.Title, x.Publication.Venue, x.Publication.Year,
            x.Publication.Details, x.Publication.Url, x.Ordinal,
            authors.Where(a => a.PublicationId == x.Publication.Id).Select(a => new PublicationAuthorDto(a.EmployeeCode, a.FullName, a.Ordinal)).ToList())).ToList();
        return new PageDto<PublicationDto>(items, more ? page[^1].Publication.Id : null);
    }

    private static string Like(string q) => "%" + q.Trim().Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_") + "%";
}
