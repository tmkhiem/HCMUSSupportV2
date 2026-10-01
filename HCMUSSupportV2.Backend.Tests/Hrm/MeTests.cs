using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json;
using HCMUSSupportV2.Backend.Modules.Hrm.Domain;
using HCMUSSupportV2.Backend.Modules.Hrm.Integration;
using HCMUSSupportV2.Backend.Modules.Identity.Authentication;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using HCMUSSupportV2.Backend.Tests.Identity;
using HCMUSSupportV2.Backend.Tests.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using static HCMUSSupportV2.Backend.Tests.Hrm.HrmTestSupport;

namespace HCMUSSupportV2.Backend.Tests.Hrm;

/// <summary>Test-only sign-in that can simulate the <c>acting_as</c> claim (D14a implements view-as for real).</summary>
[ApiController]
[Route("api/test/hrm")]
public class HrmTestSignInController : ControllerBase
{
    [HttpPost("sign-in/{code}"), AllowAnonymous]
    public async Task<IActionResult> SignIn(string code, [FromQuery] string? actingAs, [FromServices] PrincipalFactory principals)
    {
        var principal = await principals.CreateAsync(code);
        if (principal is null) return NotFound();
        // D14a: a view-as claim without an unexpired acting_as_until is dropped by the cookie revalidator.
        if (actingAs is not null) principal = PrincipalFactory.WithActingAs(principal, actingAs, DateTimeOffset.UtcNow.AddHours(1));
        await HttpContext.SignInAsync(AuthSchemes.Cookie, principal);
        return NoContent();
    }
}

[Collection(PostgresCollection.Name)]
public class MeTests : IAsyncLifetime
{
    private readonly TestApiFactory _factory;
    private HttpClient _ingest = null!;

    public MeTests(PostgresFixture database) =>
        _factory = new TestApiFactory(database,
            settings: new() { ["Auth:RevalidateSeconds"] = "3600" },   // keep the simulated acting_as claim in the cookie
            configureServices: TestControllers.Add);

    public async Task InitializeAsync()
    {
        _ = _factory.Server;
        await ResetAsync(_factory);
        _ingest = await CreateIngestClientAsync(_factory);
        await SeedAsync();
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    private const string Alice = "T0801", Bob = "T0802";

    private async Task SeedAsync()
    {
        await SeedEmployeesAsync(_ingest, Alice, Bob, "T0803");
        await _ingest.PostOkAsync("salary", new object[]
        {
            new { hrmId = 1, employeeCode = Alice, gradeCode = "V.07.01.03", gradeName = "Giảng viên chính", step = 2, coefficient = 4.32m, overGradePct = (decimal?)null, decisionNo = "L1", signedOn = "2021-12-01", effectiveFrom = "2022-01-01", nextRaiseOn = "2025-01-01", note = (string?)null },
            new { hrmId = 2, employeeCode = Alice, gradeCode = "V.07.01.03", gradeName = "Giảng viên chính", step = 3, coefficient = 4.65m, overGradePct = (decimal?)5m, decisionNo = "L2", signedOn = "2024-12-01", effectiveFrom = "2025-01-01", nextRaiseOn = "2099-06-15", note = "Nâng bậc" },
            new { hrmId = 3, employeeCode = Bob, gradeCode = "V.07.01.02", gradeName = "Giảng viên cao cấp", step = 1, coefficient = 6.20m, overGradePct = (decimal?)null, decisionNo = "B1", signedOn = "2020-01-01", effectiveFrom = "2020-01-01", nextRaiseOn = (string?)null, note = (string?)null },
        });
        await _ingest.PostOkAsync("positions", new object[]
        {
            new { hrmId = 1, employeeCode = Alice, title = "Phó trưởng bộ môn", unitDescription = "Bộ môn Thử", coefficient = 0.3m, appointedOn = "2010-01-15", decisionNo = "CV1", signedOn = "2010-01-01", endedOn = "2015-01-14" },
            new { hrmId = 2, employeeCode = Alice, title = "Trưởng bộ môn", unitDescription = "Bộ môn Thử", coefficient = 0.4m, appointedOn = "2015-01-15", decisionNo = "CV2", signedOn = "2015-01-01", endedOn = (string?)null },
            new { hrmId = 3, employeeCode = Bob, title = "Trưởng khoa", unitDescription = "Khoa Khác", coefficient = 0.6m, appointedOn = "2020-01-01", decisionNo = "CV3", signedOn = "2020-01-01", endedOn = (string?)null },
        });
        await _ingest.PostOkAsync("commendations", new object[]
        {
            new { hrmId = 1, employeeCode = Alice, kind = "award", name = "Bằng khen A", academicYear = "2022-2023", decisionNo = "KT1", decidedOn = "2023-07-01" },
            new { hrmId = 2, employeeCode = Alice, kind = "award", name = "Giấy khen B", academicYear = "2022-2023", decisionNo = "KT2", decidedOn = "2023-06-01" },
            new { hrmId = 3, employeeCode = Alice, kind = "award", name = "Bằng khen C", academicYear = "2021-2022", decisionNo = "KT3", decidedOn = "2022-07-01" },
            new { hrmId = 4, employeeCode = Alice, kind = "title", name = "CSTĐ cơ sở", academicYear = "2022-2023", decisionNo = "DH1", decidedOn = "2023-08-01" },
            new { hrmId = 5, employeeCode = Bob, kind = "award", name = "Của Bob", academicYear = "2022-2023", decisionNo = "KT9", decidedOn = "2023-07-01" },
        });
        await _ingest.PostOkAsync("degrees", new object[]
        {
            new { hrmId = 1, employeeCode = Alice, degreeType = "Cử nhân", major = "Toán", institution = "ĐH Thử", country = "Việt Nam", trainingForm = "Chính quy", enrolledOn = "2003-09-01", graduatedOn = "2007-06-30", thesisTitle = (string?)null },
            new { hrmId = 2, employeeCode = Alice, degreeType = "Tiến sĩ", major = "CNTT", institution = "ĐH Thử 2", country = "Pháp", trainingForm = "Chính quy", enrolledOn = "2012", graduatedOn = "2016-12", thesisTitle = "Luận án thử" },
            new { hrmId = 3, employeeCode = Bob, degreeType = "Thạc sĩ", major = "Lý", institution = "ĐH X", country = "Việt Nam", trainingForm = "Chính quy", enrolledOn = (string?)null, graduatedOn = "2010-01-01", thesisTitle = (string?)null },
        });
        await _ingest.PostOkAsync("trainings", new object[]
        {
            new { hrmId = 1, employeeCode = Alice, content = "Bồi dưỡng A", place = "HN", trainingForm = "Tập trung", startOn = "2021-01-01", endOn = "2021-01-05" },
            new { hrmId = 2, employeeCode = Bob, content = "Của Bob", place = "HN", trainingForm = "Tập trung", startOn = "2021-01-01", endOn = "2021-01-05" },
        });
        await _ingest.PostOkAsync("business-trips", new object[]
        {
            new { hrmId = 1, employeeCode = Alice, fromOn = "2023-05-01", toOn = "2023-05-07", place = "Singapore", purpose = "Hội thảo", transport = "Máy bay", decisionNo = "CT1", decidedOn = "2023-04-20", note = (string?)null },
            new { hrmId = 2, employeeCode = Alice, fromOn = "2022-02-10", toOn = "2022-02-10", place = "Đà Lạt", purpose = "Họp", transport = "Ô tô", decisionNo = "CT2", decidedOn = "2022-02-01", note = (string?)null },
            new { hrmId = 3, employeeCode = Bob, fromOn = "2022-02-10", toOn = "2022-02-12", place = "Của Bob", purpose = "Họp", transport = "Ô tô", decisionNo = "CT3", decidedOn = "2022-02-01", note = (string?)null },
        });
        await _ingest.PostOkAsync("innovations", Enumerable.Range(1, 5).Select(i => (object)new
        {
            hrmId = i, employeeCode = Alice, code = $"SK-{i:00}", title = i % 2 == 0 ? $"Sáng kiến chẵn {i}" : $"Sáng kiến lẻ {i}", type = i < 3 ? "Cấp cơ sở" : "Cấp bộ", decisionNo = $"QD{i}", recognizedOn = "2023-01-10", academicYear = "2022-2023",
        }).Append(new { hrmId = 6, employeeCode = Bob, code = "SK-BOB", title = "Của Bob", type = "Cấp bộ", decisionNo = "QD6", recognizedOn = "2023-01-10", academicYear = "2022-2023" }).ToArray());

        object Profile(string code, int hrm, string? nationalId, string? bank) => new
        {
            employeeCode = code, hrmId = hrm, lastName = "Họ", firstName = code, dateOfBirth = "1985-03", gender = "Nữ", ethnicity = "Kinh", religion = "Không", nationality = "Việt Nam",
            birthPlace = "TP.HCM", hometown = "Long An", phoneMobile = "0900000000", phoneHome = (string?)null, personalEmail = (string?)null,
            permanentAddress = "1 Đường Thử", permanentWard = "P1", permanentDistrict = "Q1", permanentProvince = "TP.HCM",
            contactAddress = (string?)null, contactWard = (string?)null, contactDistrict = (string?)null, contactProvince = (string?)null,
            salaryGradeCode = "V.07.01.03", salaryGradeName = "Giảng viên chính", salaryStep = 3, salaryCoefficient = 4.65m, overGradePct = (decimal?)null,
            educationLevel = "Tiến sĩ", major = "CNTT", politicalTheory = "Trung cấp",
            isPartyMember = true, partyJoinedOn = "2010-05-19", partyFileNo = "HS1", partyCardNo = "T1",
            isYouthUnionMember = false, youthUnionJoinedOn = (string?)null, youthFileNo = (string?)null, youthCardNo = (string?)null,
            isTradeUnionMember = true, tradeUnionJoinedOn = "2012-01-01", tradeUnionCardNo = "CD1",
            sensitive = nationalId is null ? null : new { nationalId, nationalIdIssuedOn = "2021-04-10", nationalIdIssuedBy = "Cục CSQLHC", taxCode = "8000000001", bankName = "Vietcombank", bankBranch = "TP.HCM", bankAccount = bank, socialInsuranceNo = "7900000001", healthInsuranceNo = "DN4790000001" },
        };
        await _ingest.PostOkAsync("profiles", new[] { Profile(Alice, 901, "079000000001", "0011000000123"), Profile(Bob, 902, "079000000002", "0099000000777") });

        await _factory.WithDbAsync(async db =>
        {
            db.Set<TeachingLoad>().AddRange(
                new TeachingLoad { EmployeeCode = Alice, AcademicYear = "2023-2024", Term = 1, CourseCode = "MTH101", CourseName = "Giải tích", ClassCode = "23A1", Level = "dh", Periods = 45, StandardHours = 45 },
                new TeachingLoad { EmployeeCode = Alice, AcademicYear = "2023-2024", Term = 2, CourseCode = "MTH102", CourseName = "Đại số", ClassCode = "23A1", Level = "dh", Periods = 30, StandardHours = 30.5m },
                new TeachingLoad { EmployeeCode = Alice, AcademicYear = "2022-2023", Term = 1, CourseCode = "MTH101", CourseName = "Giải tích", ClassCode = "22A1", Level = "dh", Periods = 45, StandardHours = 45 },
                new TeachingLoad { EmployeeCode = Bob, AcademicYear = "2024-2025", Term = 1, CourseCode = "PHY1", CourseName = "Của Bob", ClassCode = "B", Level = "dh", Periods = 10, StandardHours = 10 });
            var p1 = new ResearchProject { Code = "DT-ALICE", Title = "Đề tài của Alice", Level = "Cơ sở", ResearchType = "Cơ bản", Funding = 50_000_000m, PeriodText = "2022-2023", Result = "Đạt" };
            var p2 = new ResearchProject { Code = "DT-BOB", Title = "Đề tài của Bob", Level = "Bộ" };
            db.Set<ResearchProject>().AddRange(p1, p2);
            var pub = new Publication { Doi = "10.0000/alice", Title = "Bài báo của Alice và Bob", Venue = "Tạp chí Thử", Year = 2023 };
            var pubBob = new Publication { Doi = "10.0000/bob", Title = "Bài báo của riêng Bob", Venue = "Tạp chí X", Year = 2022 };
            db.Set<Publication>().AddRange(pub, pubBob);
            await db.SaveChangesAsync();
            db.Set<ResearchProjectMember>().AddRange(
                new ResearchProjectMember { ProjectId = p1.Id, EmployeeCode = Alice, Role = "chu_nhiem" },
                new ResearchProjectMember { ProjectId = p1.Id, EmployeeCode = Bob, Role = "thanh_vien" },
                new ResearchProjectMember { ProjectId = p2.Id, EmployeeCode = Bob, Role = "chu_nhiem" });
            db.Set<PublicationAuthor>().AddRange(
                new PublicationAuthor { PublicationId = pub.Id, EmployeeCode = Alice, Ordinal = 1 },
                new PublicationAuthor { PublicationId = pub.Id, EmployeeCode = Bob, Ordinal = 2 },
                new PublicationAuthor { PublicationId = pubBob.Id, EmployeeCode = Bob, Ordinal = 1 });
            await db.SaveChangesAsync();
            return 0;
        });
    }

    private async Task<HttpClient> SignInAsync(string code, string? actingAs = null)
    {
        var client = _factory.CreateSessionClient();
        var response = await client.PostAsync($"/api/test/hrm/sign-in/{code}{(actingAs is null ? "" : "?actingAs=" + actingAs)}", null);
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        // The first authenticated GET hands out the antiforgery cookie used by the POST tests.
        var me = await client.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        client.DefaultRequestHeaders.Remove("X-XSRF-TOKEN");
        if (me.XsrfToken() is { } token) client.DefaultRequestHeaders.Add("X-XSRF-TOKEN", token);
        return client;
    }

    private static async Task<JsonElement> GetJsonAsync(HttpClient client, string url)
    {
        var response = await client.GetAsync(url);
        var text = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, $"{url}: {(int)response.StatusCode} {text}");
        return JsonDocument.Parse(text).RootElement;
    }

    [Theory]
    [InlineData("/api/me/profile/overview")]
    [InlineData("/api/me/profile/general")]
    [InlineData("/api/me/profile/detailed")]
    [InlineData("/api/me/salary")]
    [InlineData("/api/me/positions")]
    [InlineData("/api/me/commendations")]
    [InlineData("/api/me/degrees")]
    [InlineData("/api/me/trainings")]
    [InlineData("/api/me/business-trips")]
    [InlineData("/api/me/innovations")]
    [InlineData("/api/me/teaching")]
    [InlineData("/api/me/teaching/years")]
    [InlineData("/api/me/research/projects")]
    [InlineData("/api/me/research/publications")]
    public async Task Anonymous_requests_are_401(string url) =>
        Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.CreateSessionClient().GetAsync(url)).StatusCode);

    [Fact]
    public async Task Profile_pages_return_own_data_with_sensitive_values_masked()
    {
        var alice = await SignInAsync(Alice);

        var overview = await GetJsonAsync(alice, "/api/me/profile/overview");
        Assert.Equal(Alice, overview.GetProperty("hero").GetProperty("code").GetString());
        Assert.Equal("Trưởng bộ môn", overview.GetProperty("positions").GetProperty("currentTitle").GetString());
        Assert.Equal(3, overview.GetProperty("commendations").GetProperty("awards").GetInt32());
        Assert.Equal(1, overview.GetProperty("commendations").GetProperty("titles").GetInt32());
        Assert.Equal(2, overview.GetProperty("degrees").GetProperty("count").GetInt32());
        Assert.Equal("Tiến sĩ", overview.GetProperty("degrees").GetProperty("latestDegreeType").GetString());

        var general = await GetJsonAsync(alice, "/api/me/profile/general");
        Assert.Equal("month", general.GetProperty("dateOfBirth").GetProperty("precision").GetString());
        Assert.Equal("1985-03-01", general.GetProperty("dateOfBirth").GetProperty("date").GetString());
        Assert.Equal("Long An", general.GetProperty("hometown").GetString());

        var detailedText = await alice.GetStringAsync("/api/me/profile/detailed");
        Assert.DoesNotContain("079000000001", detailedText);
        Assert.DoesNotContain("0011000000123", detailedText);
        var detailed = JsonDocument.Parse(detailedText).RootElement;
        Assert.Equal("•••• 0001", detailed.GetProperty("nationalId").GetProperty("masked").GetString());
        Assert.Equal("•••• 0123", detailed.GetProperty("bankAccount").GetProperty("masked").GetString());
        Assert.True(detailed.GetProperty("taxCode").GetProperty("hasValue").GetBoolean());
        Assert.Equal("Vietcombank", detailed.GetProperty("bankName").GetString());
        Assert.True(detailed.GetProperty("party").GetProperty("isMember").GetBoolean());
        Assert.Equal("••••", MaskOf("123"));
    }

    private static string MaskOf(string v) => HCMUSSupportV2.Backend.Modules.Hrm.Me.MeService.Mask(v)!;

    [Fact]
    public async Task Salary_positions_commendations_are_shaped_for_their_pages_and_only_own_rows()
    {
        var alice = await SignInAsync(Alice);

        var salary = await GetJsonAsync(alice, "/api/me/salary");
        var current = salary.GetProperty("current");
        Assert.Equal(3, current.GetProperty("step").GetInt32());
        Assert.Equal(4.65m, current.GetProperty("coefficient").GetDecimal());
        Assert.Equal(5m, current.GetProperty("overGradePct").GetDecimal());
        Assert.Equal("2099-06-15", current.GetProperty("nextRaiseOn").GetString());
        Assert.True(current.GetProperty("monthsToNextRaise").GetInt32() > 12);
        var history = salary.GetProperty("history").EnumerateArray().ToList();
        Assert.Equal(["L2", "L1"], history.Select(h => h.GetProperty("decisionNo").GetString()).ToArray());

        var positions = await GetJsonAsync(alice, "/api/me/positions");
        Assert.Equal("Trưởng bộ môn", positions.GetProperty("current").GetProperty("title").GetString());
        var items = positions.GetProperty("items").EnumerateArray().ToList();
        Assert.Equal(2, items.Count);
        Assert.True(items[0].GetProperty("isCurrent").GetBoolean());
        Assert.True(items[0].GetProperty("tenureYears").GetInt32() >= 10);
        Assert.Equal(4, items[1].GetProperty("tenureYears").GetInt32());   // 2010-01-15 .. 2015-01-14: 4y 11m
        Assert.Equal(11, items[1].GetProperty("tenureMonths").GetInt32());

        var commendations = await GetJsonAsync(alice, "/api/me/commendations");
        Assert.Equal(3, commendations.GetProperty("awardCount").GetInt32());
        var groups = commendations.GetProperty("awards").EnumerateArray().ToList();
        Assert.Equal(["2022-2023", "2021-2022"], groups.Select(g => g.GetProperty("academicYear").GetString()).ToArray());
        Assert.Equal(2, groups[0].GetProperty("items").GetArrayLength());
        Assert.DoesNotContain("Của Bob", commendations.GetRawText());
    }

    [Fact]
    public async Task Degrees_trainings_trips_innovations_teaching_and_research_return_only_own_rows()
    {
        var alice = await SignInAsync(Alice);

        var degrees = await GetJsonAsync(alice, "/api/me/degrees");
        Assert.Equal(["Tiến sĩ", "Cử nhân"], degrees.EnumerateArray().Select(d => d.GetProperty("degreeType").GetString()).ToArray());
        Assert.Equal("year", degrees[0].GetProperty("enrolledOn").GetProperty("precision").GetString());

        var trainings = await GetJsonAsync(alice, "/api/me/trainings");
        Assert.Equal(1, trainings.GetArrayLength());
        Assert.Equal(2021, trainings[0].GetProperty("year").GetInt32());

        var trips = await GetJsonAsync(alice, "/api/me/business-trips");
        Assert.Equal(2, trips.GetProperty("stats").GetProperty("tripCount").GetInt32());
        Assert.Equal(8, trips.GetProperty("stats").GetProperty("totalDays").GetInt32());   // 7 + 1
        Assert.Equal([2023, 2022], trips.GetProperty("years").EnumerateArray().Select(y => y.GetInt32()).ToArray());

        var first = await GetJsonAsync(alice, "/api/me/innovations?limit=2");
        Assert.Equal(5, first.GetProperty("stats").GetProperty("count").GetInt32());
        Assert.Equal(2, first.GetProperty("items").GetArrayLength());
        var cursor = first.GetProperty("nextCursor").GetInt64();
        var second = await GetJsonAsync(alice, $"/api/me/innovations?limit=10&cursor={cursor}");
        Assert.Equal(3, second.GetProperty("items").GetArrayLength());
        Assert.Equal(JsonValueKind.Null, second.GetProperty("nextCursor").ValueKind);
        var search = await GetJsonAsync(alice, "/api/me/innovations?q=ch%E1%BA%B5n");   // "chẵn"
        Assert.Equal(2, search.GetProperty("items").GetArrayLength());
        Assert.DoesNotContain("Của Bob", first.GetRawText() + second.GetRawText());

        Assert.Equal(["2023-2024", "2022-2023"], (await GetJsonAsync(alice, "/api/me/teaching/years")).EnumerateArray().Select(y => y.GetString()).ToArray());
        var teaching = await GetJsonAsync(alice, "/api/me/teaching");   // defaults to the latest year
        Assert.Equal("2023-2024", teaching.GetProperty("academicYear").GetString());
        Assert.Equal(75.5m, teaching.GetProperty("stats").GetProperty("totalStandardHours").GetDecimal());
        Assert.Equal(2, teaching.GetProperty("terms").GetArrayLength());
        var older = await GetJsonAsync(alice, "/api/me/teaching?year=2022-2023");
        Assert.Equal(45m, older.GetProperty("stats").GetProperty("totalStandardHours").GetDecimal());
        var none = await GetJsonAsync(alice, "/api/me/teaching?year=1999-2000");
        Assert.Equal(0, none.GetProperty("terms").GetArrayLength());

        var projects = await GetJsonAsync(alice, "/api/me/research/projects");
        var project = Assert.Single(projects.GetProperty("items").EnumerateArray().ToList());
        Assert.Equal("DT-ALICE", project.GetProperty("code").GetString());
        Assert.Equal("chu_nhiem", project.GetProperty("myRole").GetString());
        Assert.Equal(2, project.GetProperty("members").GetArrayLength());
        Assert.Empty((await GetJsonAsync(alice, "/api/me/research/projects?q=zzz")).GetProperty("items").EnumerateArray());

        var pubs = await GetJsonAsync(alice, "/api/me/research/publications");
        var pub = Assert.Single(pubs.GetProperty("items").EnumerateArray().ToList());
        Assert.Equal(1, pub.GetProperty("myOrdinal").GetInt32());
        Assert.Equal(2, pub.GetProperty("authors").GetArrayLength());
    }

    [Fact]
    public async Task Acting_as_reads_the_viewed_employees_rows()
    {
        // T0803 stands in for an admin who is viewing as Bob.
        var viewer = await SignInAsync("T0803", actingAs: Bob);

        var salary = await GetJsonAsync(viewer, "/api/me/salary");
        Assert.Equal("B1", salary.GetProperty("history")[0].GetProperty("decisionNo").GetString());
        var commendations = await GetJsonAsync(viewer, "/api/me/commendations");
        Assert.Contains("Của Bob", commendations.GetRawText());
        Assert.DoesNotContain("Bằng khen A", commendations.GetRawText());
        Assert.Equal(Bob, (await GetJsonAsync(viewer, "/api/me/profile/overview")).GetProperty("hero").GetProperty("code").GetString());
    }

    [Fact]
    public async Task Reveal_returns_the_full_value_and_is_audited()
    {
        var alice = await SignInAsync(Alice);

        var response = await alice.PostAsJsonAsync("/api/me/profile/sensitive/reveal", new { field = "bank_account" });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("0011000000123", body.GetProperty("value").GetString());

        var entries = await _factory.WithDbAsync(db => db.Set<AuditLogEntry>().AsNoTracking().Where(a => a.Action == "profile.sensitive_reveal" && a.ActorCode == Alice).ToListAsync());
        var entry = Assert.Single(entries);
        Assert.Equal(Alice, entry.TargetId);
        Assert.Contains("bank_account", entry.Details);
        Assert.DoesNotContain("0011000000123", entry.Details);   // the audit never stores the secret itself
    }

    [Fact]
    public async Task Reveal_rejects_unknown_fields_missing_values_and_acting_as()
    {
        var alice = await SignInAsync(Alice);
        Assert.Equal(HttpStatusCode.BadRequest, (await alice.PostAsJsonAsync("/api/me/profile/sensitive/reveal", new { field = "password" })).StatusCode);

        // T0803 has no sensitive row at all.
        var carol = await SignInAsync("T0803");
        Assert.Equal(HttpStatusCode.NotFound, (await carol.PostAsJsonAsync("/api/me/profile/sensitive/reveal", new { field = "tax_code" })).StatusCode);

        // Acting as Bob: forbidden, and nothing is audited.
        var viewer = await SignInAsync(Alice, actingAs: Bob);
        Assert.Equal(HttpStatusCode.Forbidden, (await viewer.PostAsJsonAsync("/api/me/profile/sensitive/reveal", new { field = "bank_account" })).StatusCode);
        Assert.Equal(0, await _factory.WithDbAsync(db => db.Set<AuditLogEntry>().CountAsync(a => a.Action == "profile.sensitive_reveal" && a.ActorCode == Alice)));

        // Anonymous
        Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.CreateSessionClient().PostAsJsonAsync("/api/me/profile/sensitive/reveal", new { field = "tax_code" })).StatusCode);
    }
}
