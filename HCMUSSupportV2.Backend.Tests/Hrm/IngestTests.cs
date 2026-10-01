using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using HCMUSSupportV2.Backend.Modules.Hrm.Domain;
using HCMUSSupportV2.Backend.Modules.Hrm.Integration;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Modules.Identity.Groups;
using HCMUSSupportV2.Backend.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static HCMUSSupportV2.Backend.Tests.Hrm.HrmTestSupport;

namespace HCMUSSupportV2.Backend.Tests.Hrm;

[Collection(PostgresCollection.Name)]
public class IngestTests : IAsyncLifetime
{
    private readonly RecordingObserver _observer = new();
    private readonly TestApiFactory _factory;
    private HttpClient _ingest = null!;

    public IngestTests(PostgresFixture database) =>
        _factory = new TestApiFactory(database, configureServices: services =>
        {
            services.AddSingleton<IEmployeeActivationObserver>(_observer);
            services.AddSingleton<IRosterSyncObserver>(_observer);
        });

    public async Task InitializeAsync()
    {
        _ = _factory.Server;
        await ResetAsync(_factory);
        _ingest = await CreateIngestClientAsync(_factory);
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    // ------------------------------------------------------------ auth

    [Fact]
    public async Task Missing_or_invalid_key_is_401()
    {
        var none = ApiClientFor(_factory, null);
        var bad = ApiClientFor(_factory, "not-a-real-token");
        Assert.Equal(HttpStatusCode.Unauthorized, (await none.PostAsync("/api/integration/v1/employees", JsonBody(Array.Empty<object>()))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await bad.PostAsync("/api/integration/v1/employees", JsonBody(Array.Empty<object>()))).StatusCode);
    }

    [Fact]
    public async Task Revoked_key_is_401_and_wrong_scope_is_403()
    {
        var revoked = await CreateIngestClientAsync(_factory, revoke: true);
        var wrongScope = await CreateIngestClientAsync(_factory, scopes: ["other.scope"]);

        Assert.Equal(HttpStatusCode.Unauthorized, (await revoked.PostAsync("/api/integration/v1/employees", JsonBody(Array.Empty<object>()))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await wrongScope.PostAsync("/api/integration/v1/employees", JsonBody(Array.Empty<object>()))).StatusCode);
    }

    [Fact]
    public async Task Token_is_stored_as_a_sha256_hash_only()
    {
        var (client, token) = await _factory.WithScopeAsync(sp => sp.GetRequiredService<ApiClientService>().CreateAsync("hash-check", [ApiScopes.HrmIngest]));
        Assert.NotEqual(token, client.TokenHash);
        Assert.Equal(ApiTokens.Hash(token), client.TokenHash);
        Assert.Equal(64, client.TokenHash.Length);
    }

    // ------------------------------------------------------------ org units, employees

    [Fact]
    public async Task Org_units_and_employees_round_trip_with_observers_and_duplicate_mscb_quarantine()
    {
        var unitsResult = await _ingest.PostOkAsync("org-units", new object[]
        {
            new { hrmId = 9000001, parentHrmId = (int?)null, kind = "unit", name = "Khoa Thử Một", code = "K1", isActive = true },
            new { hrmId = 9000002, parentHrmId = (int?)9000001, kind = "department", name = "Bộ môn Thử", code = "BM1", isActive = true },
            new { hrmId = 9000003, parentHrmId = (int?)9999999, kind = "unit", name = "Đơn vị mồ côi", code = (string?)null, isActive = true },
        });
        Assert.Equal(3, unitsResult.Inserted);
        Assert.Equal(1, unitsResult.IssuesByKind[SyncIssueKinds.UnknownUnit]);
        Assert.True(_observer.RosterSyncs >= 1);

        var result = await _ingest.PostOkAsync("employees", new[]
        {
            Emp("T0101", 7001, unit: 1),
            Emp("T0102", 7002, unit: 2),
            Emp("T0103", 7003, unit: 77),           // unknown unit: row kept, issue raised
            Emp("T0109", 7009), Emp("T0109", 7010), // duplicate MSCB: both quarantined
        });
        Assert.Equal(3, result.Inserted);
        Assert.Equal(5, result.Received);
        Assert.Equal(1, result.IssuesByKind[SyncIssueKinds.DuplicateMscb]);
        Assert.Equal(1, result.IssuesByKind[SyncIssueKinds.UnknownUnit]);

        var (employees, units) = await _factory.WithDbAsync(async db => (
            await db.Set<Employee>().AsNoTracking().Where(e => e.Code.StartsWith("T01")).ToListAsync(),
            await db.Set<OrgUnit>().AsNoTracking().Where(u => u.HrmId >= 9000001 && u.HrmId <= 9000003).ToListAsync()));
        Assert.DoesNotContain(employees, e => e.Code == "T0109");
        Assert.Equal(3, employees.Count);
        var dept = units.Single(u => u.HrmId == 9000002);
        Assert.Equal(units.Single(u => u.HrmId == 9000001).Id, dept.ParentId);
        Assert.Equal(dept.Id, employees.Single(e => e.Code == "T0102").OrgUnitId);
        Assert.Null(employees.Single(e => e.Code == "T0103").OrgUnitId);
        Assert.All(employees, e => Assert.Equal(EmployeeSources.Hrm, e.Source));

        Assert.Equal(["T0101", "T0102", "T0103"], _observer.Activated.Where(c => c.StartsWith("T01")).Order().ToArray());

        var issues = await _factory.WithDbAsync(db => db.Set<SyncIssue>().AsNoTracking().Where(i => i.Dataset == "employees" && i.Kind == SyncIssueKinds.DuplicateMscb).ToListAsync());
        Assert.Equal("T0109", Assert.Single(issues).SourceKey);
        Assert.Null(issues[0].ResolvedAt);
    }

    [Fact]
    public async Task Employees_missing_from_the_snapshot_become_inactive_and_are_never_deleted()
    {
        await _ingest.PostOkAsync("employees", new[] { Emp("T0201", 7101), Emp("T0202", 7102), Emp("T0203", 7103), Emp("T0204", 7104), Emp("T0205", 7105) });
        var second = await _ingest.PostOkAsync("employees", new[] { Emp("T0201", 7101), Emp("T0202", 7102), Emp("T0203", 7103), Emp("T0204", 7104, status: "retired") });

        Assert.Equal(0, second.Deleted);
        var rows = await _factory.WithDbAsync(db => db.Set<Employee>().AsNoTracking().Where(e => e.Code.StartsWith("T02")).ToListAsync());
        Assert.Equal(5, rows.Count);
        Assert.Equal(EmployeeStatuses.Inactive, rows.Single(e => e.Code == "T0205").Status);
        Assert.Equal(EmployeeStatuses.Retired, rows.Single(e => e.Code == "T0204").Status);

        // Reappearing makes the employee newly active again: the observer hears about it.
        _observer.Activated.Clear();
        await _ingest.PostOkAsync("employees", new[] { Emp("T0201", 7101), Emp("T0202", 7102), Emp("T0203", 7103), Emp("T0204", 7104), Emp("T0205", 7105) });
        Assert.Contains("T0205", _observer.Activated);
        Assert.DoesNotContain("T0201", _observer.Activated);
    }

    // ------------------------------------------------------------ truncation guard, gzip

    [Fact]
    public async Task Truncated_snapshot_is_refused_with_409_unless_forced()
    {
        var ten = Enumerable.Range(0, 10).Select(i => Emp($"T03{i:00}", 7200 + i)).ToArray();
        await _ingest.PostOkAsync("employees", ten);

        var seven = ten.Take(7).ToArray();
        var refused = await _ingest.PostAsync("/api/integration/v1/employees", JsonBody(seven));
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        var problem = await refused.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(409, problem.GetProperty("status").GetInt32());
        Assert.Equal(7, problem.GetProperty("received").GetInt32());
        // nothing changed
        Assert.Equal(10, await _factory.WithDbAsync(db => db.Set<Employee>().CountAsync(e => e.Code.StartsWith("T03") && e.Status == "active")));

        var run = await _factory.WithDbAsync(db => db.Set<SyncRun>().AsNoTracking().Where(r => r.Status == SyncStatuses.Refused).SingleAsync());
        Assert.Equal("employees", run.Dataset);

        var forced = await _ingest.PostOkAsync("employees", seven, force: true);
        Assert.Equal(7, forced.Received);
        Assert.Equal(7, await _factory.WithDbAsync(db => db.Set<Employee>().CountAsync(e => e.Code.StartsWith("T03") && e.Status == "active")));
    }

    [Fact]
    public async Task Gzip_body_is_accepted_and_garbage_is_400()
    {
        var response = await _ingest.PostAsync("/api/integration/v1/employees", GzipBody(new[] { Emp("T0401", 7301) }));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains(await _factory.WithDbAsync(db => db.Set<Employee>().Select(e => e.Code).ToListAsync()), c => c == "T0401");

        var garbage = new ByteArrayContent([1, 2, 3, 4, 5, 6, 7, 8]);
        garbage.Headers.ContentType = new("application/json");
        garbage.Headers.ContentEncoding.Add("gzip");
        Assert.Equal(HttpStatusCode.BadRequest, (await _ingest.PostAsync("/api/integration/v1/employees", garbage)).StatusCode);
    }

    // ------------------------------------------------------------ child datasets

    [Fact]
    public async Task Salary_round_trip_merge_deletes_missing_rows_and_reports_issues()
    {
        await SeedEmployeesAsync(_ingest, "T0501", "T0502");
        object Row(int id, string code, string effective = "2024-01-01") =>
            new { hrmId = id, employeeCode = code, gradeCode = "V.07.01.03", gradeName = "Giảng viên chính", step = 3, coefficient = 4.65m, overGradePct = (decimal?)null,
                  decisionNo = $"QĐ-{id}", signedOn = "2023-12-20", effectiveFrom = effective, nextRaiseOn = "2027-01-01", note = (string?)null };

        var first = await _ingest.PostOkAsync("salary", new[] { Row(1, "T0501"), Row(2, "T0501", "2022-01-01"), Row(3, "T0502"), Row(4, "T0502", "2021-06"), Row(5, "T0502", "2020") });
        Assert.Equal(5, first.Inserted);

        var rows = await RowsAsync<SalaryHistory>(_factory);
        Assert.Equal(new DateOnly(2021, 6, 1), rows.Single(r => r.HrmId == 4).EffectiveFrom);   // partial date keeps its first day

        // Second snapshot: row 5 is gone (deleted), row 2 changed, an unknown employee and a bad date raise issues.
        var second = await _ingest.PostOkAsync("salary", new object[]
        {
            Row(1, "T0501"), Row(2, "T0501", "2022-02-02"), Row(3, "T0502"), Row(4, "T0502", "2021-06"),
            new { hrmId = 6, employeeCode = "T9999", gradeCode = "x", gradeName = "x", step = 1, coefficient = 1m, overGradePct = (decimal?)null, decisionNo = "x", signedOn = "2020-01-01", effectiveFrom = "2020-01-01", nextRaiseOn = (string?)null, note = (string?)null },
        });
        Assert.Equal(1, second.Deleted);
        Assert.Equal(1, second.Updated);
        Assert.Equal(0, second.Inserted);
        Assert.Equal(1, second.IssuesByKind[SyncIssueKinds.UnknownEmployee]);

        var third = await _ingest.PostOkAsync("salary", new object[]
        {
            Row(1, "T0501", "31/12/2024x"), Row(2, "T0501", "2022-02-02"), Row(3, "T0502"), Row(4, "T0502", "2021-06"),
        });
        Assert.Equal(1, third.IssuesByKind[SyncIssueKinds.BadDate]);
        var after = await RowsAsync<SalaryHistory>(_factory);
        Assert.Equal(4, after.Count);
        Assert.Null(after.Single(r => r.HrmId == 1).EffectiveFrom);
        Assert.DoesNotContain(after, r => r.HrmId == 5);
    }

    [Fact]
    public async Task Every_child_dataset_round_trips()
    {
        await SeedEmployeesAsync(_ingest, "T0601");
        const string e = "T0601";

        Assert.Equal(1, (await _ingest.PostOkAsync("positions", new[] { new { hrmId = 11, employeeCode = e, title = "Trưởng khoa", unitDescription = "Khoa Thử", coefficient = 0.6m, appointedOn = "2020-09-01", decisionNo = "QĐ-1", signedOn = "2020-08-20", endedOn = (string?)null } })).Inserted);
        Assert.Equal(2, (await _ingest.PostOkAsync("commendations", new[]
        {
            new { hrmId = 21, employeeCode = e, kind = "award", name = "Bằng khen", academicYear = "2022-2023", decisionNo = "KT-1", decidedOn = "2023-07-01" },
            new { hrmId = 22, employeeCode = e, kind = "title", name = "Chiến sĩ thi đua cơ sở", academicYear = (string?)null, decisionNo = "KT-2", decidedOn = "2023" },
        })).Inserted);
        Assert.Equal(1, (await _ingest.PostOkAsync("degrees", new[] { new { hrmId = 31, employeeCode = e, degreeType = "Tiến sĩ", major = "Khoa học máy tính", institution = "Đại học Thử", country = "Việt Nam", trainingForm = "Chính quy", enrolledOn = "2015-09", graduatedOn = "2019-12-15", thesisTitle = "Luận án thử" } })).Inserted);
        Assert.Equal(1, (await _ingest.PostOkAsync("trainings", new[] { new { hrmId = 41, employeeCode = e, content = "Bồi dưỡng nghiệp vụ", place = "Hà Nội", trainingForm = "Tập trung", startOn = "2021-03-01", endOn = "2021-03-05" } })).Inserted);
        Assert.Equal(1, (await _ingest.PostOkAsync("business-trips", new[] { new { hrmId = 51, employeeCode = e, fromOn = "2022-05-01", toOn = "2022-05-07", place = "Singapore", purpose = "Hội thảo", transport = "Máy bay", decisionNo = "CT-1", decidedOn = "2022-04-20", note = (string?)null } })).Inserted);
        Assert.Equal(1, (await _ingest.PostOkAsync("innovations", new[] { new { hrmId = 61, employeeCode = e, code = "SK-01", title = "Sáng kiến thử", type = "Cấp cơ sở", decisionNo = "SK-QĐ", recognizedOn = "2023-01-10", academicYear = "2022-2023" } })).Inserted);

        Assert.Equal(DatePrecision.Year, (await RowsAsync<Commendation>(_factory)).Single(c => c.HrmId == 22).DecidedOnPrecision);
        var degree = (await RowsAsync<AcademicDegree>(_factory)).Single();
        Assert.Equal(DatePrecision.Month, degree.EnrolledOnPrecision);
        Assert.Equal(DatePrecision.Day, degree.GraduatedOnPrecision);
        Assert.Single(await RowsAsync<PositionHistory>(_factory));
        Assert.Single(await RowsAsync<Training>(_factory));
        Assert.Single(await RowsAsync<BusinessTrip>(_factory));
        Assert.Single(await RowsAsync<Innovation>(_factory));

        // Idempotent: the same snapshot again changes nothing.
        var again = await _ingest.PostOkAsync("innovations", new[] { new { hrmId = 61, employeeCode = e, code = "SK-01", title = "Sáng kiến thử", type = "Cấp cơ sở", decisionNo = "SK-QĐ", recognizedOn = "2023-01-10", academicYear = "2022-2023" } });
        Assert.Equal((0, 0, 0), (again.Inserted, again.Updated, again.Deleted));
    }

    [Fact]
    public async Task Profiles_with_sensitive_data_round_trip_and_duplicate_mscb_is_quarantined()
    {
        await SeedEmployeesAsync(_ingest, "T0701", "T0702");
        object Profile(string code, int hrm, object? sensitive) => new
        {
            employeeCode = code, hrmId = hrm, lastName = "Nguyễn", firstName = "Thử", dateOfBirth = "1985-03", gender = "Nữ", ethnicity = "Kinh", religion = "Không", nationality = "Việt Nam",
            birthPlace = "TP.HCM", hometown = "Long An", phoneMobile = "0900000000", phoneHome = (string?)null, personalEmail = (string?)null,
            permanentAddress = "1 Đường Thử", permanentWard = "P1", permanentDistrict = "Q1", permanentProvince = "TP.HCM",
            contactAddress = (string?)null, contactWard = (string?)null, contactDistrict = (string?)null, contactProvince = (string?)null,
            salaryGradeCode = "V.07.01.03", salaryGradeName = "Giảng viên chính", salaryStep = 3, salaryCoefficient = 4.65m, overGradePct = (decimal?)null,
            educationLevel = "Tiến sĩ", major = "CNTT", politicalTheory = "Trung cấp",
            isPartyMember = true, partyJoinedOn = "2010-05-19", partyFileNo = (string?)null, partyCardNo = (string?)null,
            isYouthUnionMember = false, youthUnionJoinedOn = (string?)null, youthFileNo = (string?)null, youthCardNo = (string?)null,
            isTradeUnionMember = true, tradeUnionJoinedOn = "2012-01-01", tradeUnionCardNo = (string?)null, sensitive,
        };
        var sens = new { nationalId = "079000000001", nationalIdIssuedOn = "2021-04-10", nationalIdIssuedBy = "Cục CSQLHC", taxCode = "8000000001", bankName = "Vietcombank", bankBranch = "TP.HCM", bankAccount = "0011000000123", socialInsuranceNo = "7900000001", healthInsuranceNo = "DN4790000001" };

        var result = await _ingest.PostOkAsync("profiles", new[] { Profile("T0701", 8001, sens), Profile("T0702", 8002, null), Profile("T0702", 8003, null) });
        Assert.Equal(1, result.Inserted);                       // T0702 appears twice: quarantined
        Assert.Equal(1, result.IssuesByKind[SyncIssueKinds.DuplicateMscb]);

        var profile = (await RowsAsync<EmployeeProfile>(_factory)).Single();
        Assert.Equal(new DateOnly(1985, 3, 1), profile.DateOfBirth);
        Assert.Equal(DatePrecision.Month, profile.DateOfBirthPrecision);
        Assert.True(profile.IsPartyMember);
        var sensitive = (await RowsAsync<EmployeeSensitive>(_factory)).Single();
        Assert.Equal("0011000000123", sensitive.BankAccount);
        Assert.Equal(new DateOnly(2021, 4, 10), sensitive.NationalIdIssuedOn);
    }
}
