using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using HCMUSSupportV2.Backend.Modules.Hrm.Domain;
using HCMUSSupportV2.Backend.Modules.Hrm.Integration;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using HCMUSSupportV2.Backend.Modules.Platform.Files;
using HCMUSSupportV2.Backend.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static HCMUSSupportV2.Backend.Tests.Hrm.HrmTestSupport;

namespace HCMUSSupportV2.Backend.Tests.Legacy;

/// <summary>D15: <c>POST /api/integration/v1/legacy/datasets/{teaching|research|publications}</c>.</summary>
[Collection(PostgresCollection.Name)]
public class LegacyDatasetImportTests : IAsyncLifetime
{
    private const string Base = "/api/integration/v1/legacy/datasets";
    private readonly TestApiFactory _factory;
    private HttpClient _legacy = null!;

    public LegacyDatasetImportTests(PostgresFixture database) => _factory = new TestApiFactory(database);

    public async Task InitializeAsync()
    {
        _ = _factory.Server;
        await ResetAsync(_factory);
        await _factory.WithDbAsync(async db =>
        {
            await db.Set<AuditLogEntry>().Where(a => a.Action.StartsWith("legacy.datasets.")).ExecuteDeleteAsync();
            await db.Set<StoredFile>().Where(f => f.FileName.StartsWith("legacy-")).ExecuteDeleteAsync();
            return 0;
        });
        var hrm = await CreateIngestClientAsync(_factory);
        await SeedEmployeesAsync(hrm, "T0901", "T0902", "T0903");
        _legacy = await CreateIngestClientAsync(_factory, [ApiScopes.LegacyImport]);
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    private async Task<JsonElement> PostAsync(string dataset, object rows, bool dryRun = false, HttpStatusCode expected = HttpStatusCode.OK)
    {
        var response = await _legacy.PostAsync($"{Base}/{dataset}{(dryRun ? "?dryRun=true" : "")}", JsonBody(rows));
        var text = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == expected, $"{(int)response.StatusCode}: {text}");
        return JsonDocument.Parse(text).RootElement;
    }

    private static object Teach(string code, string year, int term, string course, string? cls = "A", string? level = "Đại học (CLC)", decimal hours = 9.12m, string? courseCode = null) =>
        new { employeeCode = code, academicYear = year, term, courseCode, courseName = course, classCode = cls, level, periods = 0, standardHours = hours };

    private static object Member(string code, string title, string? mscb, string role = "thanh_vien", string? accepted = "2012-12-24", decimal funding = 550_000_000m, string? result = "Khá") =>
        new { code, title, level = "Cấp Trường", researchType = "Nghiên cứu cơ bản", funding, periodText = "04/2009-03/2011", acceptedOn = accepted, result, employeeCode = mscb, role };

    private static object Pub(string eid, string title, params string[] authors) =>
        new { doi = (string?)null, eid, title, venue = "Journal X", year = 2025, details = "Tác giả: " + title, url = (string?)null, authors };

    private static IEnumerable<string> Strings(JsonElement e) => e.EnumerateArray().Select(x => x.GetString()!);

    // ------------------------------------------------------------ access

    [Fact]
    public async Task Endpoints_need_the_legacy_import_scope()
    {
        var anonymous = ApiClientFor(_factory, null);
        var hrmOnly = await CreateIngestClientAsync(_factory);
        foreach (var dataset in new[] { "teaching", "research", "publications" })
        {
            var url = $"{Base}/{dataset}";
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsync(url, JsonBody(Array.Empty<object>()))).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await hrmOnly.PostAsync(url, JsonBody(Array.Empty<object>()))).StatusCode);
        }
        // The hrm.ingest endpoints stay closed to a legacy-only key.
        Assert.Equal(HttpStatusCode.Forbidden, (await _legacy.PostAsync("/api/integration/v1/employees", JsonBody(Array.Empty<object>()))).StatusCode);
        Assert.Equal(0, await _factory.WithDbAsync(db => db.Set<DatasetImport>().CountAsync()));
    }

    [Fact]
    public async Task A_body_without_rows_is_a_400()
    {
        var response = await _legacy.PostAsync($"{Base}/teaching", JsonContent.Create(new { }));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // ------------------------------------------------------------ teaching

    [Fact]
    public async Task Teaching_is_applied_and_stored_as_a_json_file_with_a_counts_only_audit()
    {
        var report = await PostAsync("teaching", new[]
        {
            Teach("T0901", "2023-2024", 3, "Thực tập Sinh đại cương 2", "22CS_CLC1", hours: 9.12m),
            Teach("T0901", "2023-2024", 1, "Giải tích", level: "Đại học (CQ)", hours: 45),
            Teach("T0902", "2023-2024", 2, "Đại số", cls: null, level: null, hours: 30.5m, courseCode: "MTH2"),
            Teach("T9999", "2023-2024", 1, "Của người lạ"),
        });

        Assert.Equal("applied", report.GetProperty("status").GetString());
        Assert.Equal("legacy-teaching.json", report.GetProperty("fileName").GetString());
        Assert.Equal(4, report.GetProperty("totalRows").GetInt32());
        Assert.Equal(3, report.GetProperty("newRows").GetInt32());   // the unknown MSCB is not counted as new
        Assert.Equal(["T9999"], Strings(report.GetProperty("unknownMscbs")));
        Assert.Equal(["2023-2024"], Strings(report.GetProperty("academicYears")));
        Assert.Equal(0, report.GetProperty("badValues").GetArrayLength());

        var rows = await RowsAsync<TeachingLoad>(_factory);
        Assert.Equal(3, rows.Count);
        var practice = rows.Single(r => r.CourseName == "Thực tập Sinh đại cương 2");
        Assert.Equal((3, "22CS_CLC1", "Đại học (CLC)", 0, 9.12m), (practice.Term, practice.ClassCode, practice.Level, practice.Periods, practice.StandardHours));
        Assert.Equal("MTH2", rows.Single(r => r.EmployeeCode == "T0902").CourseCode);
        var importId = report.GetProperty("id").GetGuid();
        Assert.All(rows, r => Assert.Equal(importId, r.SourceImportId));

        // The payload is kept as the import's file.
        var import = await _factory.WithDbAsync(db => db.Set<DatasetImport>().AsNoTracking().SingleAsync());
        Assert.Equal((importId, "teaching", "applied"), (import.Id, import.Dataset, import.Status));
        var stored = await _factory.WithDbAsync(db => db.Set<StoredFile>().AsNoTracking().SingleAsync(f => f.Id == import.FileId));
        Assert.Equal(("legacy-teaching.json", "application/json"), (stored.FileName, stored.ContentType));
        var file = await _factory.WithScopeAsync(async sp =>
        {
            await using var content = (await sp.GetRequiredService<IFileStore>().OpenReadAsync(stored.Id))!;
            using var reader = new StreamReader(content.Stream);
            return await reader.ReadToEndAsync();
        });
        Assert.Equal(4, JsonDocument.Parse(file).RootElement.GetProperty("rows").GetArrayLength());

        // Audit: one entry, counts only (no MSCB).
        var audit = await _factory.WithDbAsync(db => db.Set<AuditLogEntry>().AsNoTracking().SingleAsync(a => a.Action == "legacy.datasets.teaching"));
        Assert.DoesNotContain("T09", audit.Details);
        var details = JsonDocument.Parse(audit.Details!).RootElement;
        Assert.Equal(4, details.GetProperty("totalRows").GetInt32());
        Assert.Equal(1, details.GetProperty("unknownMscbs").GetInt32());
    }

    [Fact]
    public async Task Teaching_is_replaced_per_academic_year_only()
    {
        await PostAsync("teaching", new[]
        {
            Teach("T0901", "2022-2023", 1, "Giữ nguyên"),
            Teach("T0901", "2023-2024", 1, "Cũ, sẽ bị xóa"),
            Teach("T0902", "2023-2024", 1, "Cũ giữ lại giá trị", hours: 10),
        });

        var report = await PostAsync("teaching", new[]
        {
            Teach("T0902", "2023-2024", 1, "Cũ giữ lại giá trị", hours: 12),   // changed
            Teach("T0903", "2023-2024", 2, "Mới"),                              // new
        });

        Assert.Equal(["2023-2024"], Strings(report.GetProperty("academicYears")));
        Assert.Equal((1, 1, 1), (report.GetProperty("newRows").GetInt32(), report.GetProperty("updatedRows").GetInt32(), report.GetProperty("removedRows").GetInt32()));
        var rows = await RowsAsync<TeachingLoad>(_factory);
        Assert.Equal(3, rows.Count);
        Assert.Contains(rows, r => r.AcademicYear == "2022-2023" && r.CourseName == "Giữ nguyên");
        Assert.DoesNotContain(rows, r => r.CourseName.StartsWith("Cũ, sẽ"));
        Assert.Equal(12m, rows.Single(r => r.CourseName == "Cũ giữ lại giá trị").StandardHours);
        Assert.Contains(rows, r => r.EmployeeCode == "T0903");
    }

    [Fact]
    public async Task Teaching_rows_differing_in_level_or_course_are_distinct_but_exact_repeats_are_rejected()
    {
        var ok = await PostAsync("teaching", new[]
        {
            Teach("T0901", "2023-2024", 1, "Cơ sở dữ liệu", "19CTT1", "Đại học (LYTHUYET)", 30),
            Teach("T0901", "2023-2024", 1, "Cơ sở dữ liệu", "19CTT1", "Đại học (THUCHANH)", 15),
            Teach("T0901", "2023-2024", 1, "Lập trình", "19CTT1", "Đại học (LYTHUYET)", 30),
        });
        Assert.Equal("applied", ok.GetProperty("status").GetString());
        Assert.Equal(3, await _factory.WithDbAsync(db => db.Set<TeachingLoad>().CountAsync()));

        var dup = await PostAsync("teaching", new[]
        {
            Teach("T0901", "2023-2024", 1, "Cơ sở dữ liệu", "19CTT1", "Đại học (LYTHUYET)", 30),
            Teach("T0901", "2023-2024", 1, "Cơ sở dữ liệu", "19CTT1", "Đại học (LYTHUYET)", 10),
        });
        Assert.Equal("rejected", dup.GetProperty("status").GetString());
        Assert.Equal(1, dup.GetProperty("badValues").GetArrayLength());
        Assert.Equal(3, await _factory.WithDbAsync(db => db.Set<TeachingLoad>().CountAsync())); // untouched
    }

    [Fact]
    public async Task Bad_teaching_values_reject_the_batch_and_write_nothing_to_the_dataset()
    {
        var report = await PostAsync("teaching", new[]
        {
            Teach("T0901", "2023-2024", 1, "Hợp lệ"),
            Teach("T0901", "2023/2024", 1, "Năm sai"),
            Teach("T0901", "2023-2024", 4, "Học kỳ sai"),
            new { employeeCode = "T0902", academicYear = "2023-2024", term = 1, courseName = (string?)null, standardHours = 1m },
        });
        Assert.Equal("rejected", report.GetProperty("status").GetString());
        var bad = report.GetProperty("badValues").EnumerateArray().ToList();
        Assert.Equal([2, 3, 4], bad.Select(b => b.GetProperty("row").GetInt32()).ToArray());
        Assert.Contains(bad, b => b.GetProperty("column").GetString() == "academicYear");
        Assert.Contains(bad, b => b.GetProperty("column").GetString() == "term");
        Assert.Equal(0, await _factory.WithDbAsync(db => db.Set<TeachingLoad>().CountAsync()));
        Assert.Equal("rejected", (await _factory.WithDbAsync(db => db.Set<DatasetImport>().AsNoTracking().SingleAsync())).Status);
    }

    [Fact]
    public async Task Empty_rows_are_rejected()
    {
        var report = await PostAsync("teaching", Array.Empty<object>());
        Assert.Equal("rejected", report.GetProperty("status").GetString());
        Assert.Equal(1, report.GetProperty("badValues").GetArrayLength());
    }

    // ------------------------------------------------------------ research

    [Fact]
    public async Task Research_is_applied_with_roles_and_unknown_mscbs_are_reported()
    {
        var report = await PostAsync("research", new[]
        {
            Member("B2009-18-01", "Đề tài một", "T0901", "chu_nhiem"),
            Member("B2009-18-01", "Đề tài một", "T0902", "thanh_vien"),
            Member("B2009-18-01", "Đề tài một", "T9999", "thanh_vien"),
            Member("T2010-01", "Đề tài hai", "T0903", "dong_chu_nhiem", accepted: null, result: null),
        });

        Assert.Equal("applied", report.GetProperty("status").GetString());
        Assert.Equal(2, report.GetProperty("totalRows").GetInt32());   // projects, not member rows
        Assert.Equal(2, report.GetProperty("newRows").GetInt32());
        Assert.Equal(["T9999"], Strings(report.GetProperty("unknownMscbs")));

        var projects = await RowsAsync<ResearchProject>(_factory);
        var p1 = projects.Single(p => p.Code == "B2009-18-01");
        Assert.Equal((550_000_000m, "04/2009-03/2011", new DateOnly(2012, 12, 24), "Khá"), (p1.Funding, p1.PeriodText, p1.AcceptedOn, p1.Result));
        var p2 = projects.Single(p => p.Code == "T2010-01");
        Assert.Null(p2.AcceptedOn);

        var members = await RowsAsync<ResearchProjectMember>(_factory);
        Assert.Equal(3, members.Count);
        Assert.Equal("chu_nhiem", members.Single(m => m.EmployeeCode == "T0901").Role);
        Assert.Equal("dong_chu_nhiem", members.Single(m => m.EmployeeCode == "T0903").Role);
        Assert.DoesNotContain(members, m => m.EmployeeCode == "T9999");
    }

    [Fact]
    public async Task Research_with_a_bad_role_date_or_conflicting_titles_is_rejected()
    {
        var report = await PostAsync("research", new[]
        {
            Member("P1", "Một", "T0901", "giám đốc"),                       // role not a known code
            Member("P2", "Hai", "T0901", accepted: "không phải ngày"),
            Member("P3", "Ba", "T0901"),
            Member("P3", "Ba khác tên", "T0902"),
            Member("P4", "Bốn", "T0901"),
            Member("P4", "Bốn", "T0901"),                                   // the same member twice
        });
        Assert.Equal("rejected", report.GetProperty("status").GetString());
        var columns = report.GetProperty("badValues").EnumerateArray().Select(b => b.GetProperty("column").GetString()).ToList();
        Assert.Contains("role", columns);
        Assert.Contains("acceptedOn", columns);
        Assert.Equal(4, columns.Count);
        Assert.Equal(0, await _factory.WithDbAsync(db => db.Set<ResearchProject>().CountAsync()));
    }

    // ------------------------------------------------------------ publications

    [Fact]
    public async Task Publications_are_applied_with_ordered_authors()
    {
        var report = await PostAsync("publications", new[]
        {
            Pub("2-s2.0-1", "Bài báo một", "T0902", "T0901", "T9999"),
            Pub("2-s2.0-2", "Bài báo hai", "T0903"),
        });
        Assert.Equal("applied", report.GetProperty("status").GetString());
        Assert.Equal((2, 2), (report.GetProperty("totalRows").GetInt32(), report.GetProperty("newRows").GetInt32()));
        Assert.Equal(["T9999"], Strings(report.GetProperty("unknownMscbs")));

        var pubs = await RowsAsync<Publication>(_factory);
        var first = pubs.Single(p => p.Eid == "2-s2.0-1");
        Assert.Equal((2025, "Journal X"), (first.Year, first.Venue));
        var authors = (await RowsAsync<PublicationAuthor>(_factory)).Where(a => a.PublicationId == first.Id).OrderBy(a => a.Ordinal).ToList();
        Assert.Equal(["T0902", "T0901"], authors.Select(a => a.EmployeeCode).ToArray());
        Assert.Equal([1, 2], authors.Select(a => a.Ordinal).ToArray());
    }

    [Fact]
    public async Task Publications_without_a_title_or_authors_are_rejected()
    {
        var report = await PostAsync("publications", new object[]
        {
            Pub("e1", "Có tên", "T0901"),
            new { eid = "e2", title = (string?)null, authors = new[] { "T0901" } },
            new { eid = "e3", title = "Không tác giả", authors = Array.Empty<string>() },
        });
        Assert.Equal("rejected", report.GetProperty("status").GetString());
        Assert.Equal(2, report.GetProperty("badValues").GetArrayLength());
        Assert.Equal(0, await _factory.WithDbAsync(db => db.Set<Publication>().CountAsync()));
    }

    // ------------------------------------------------------------ dry run and idempotency

    [Theory]
    [InlineData("teaching")]
    [InlineData("research")]
    [InlineData("publications")]
    public async Task A_dry_run_reports_but_writes_and_stores_nothing(string dataset)
    {
        var rows = Rows(dataset);
        var report = await PostAsync(dataset, rows, dryRun: true);

        Assert.Equal("validated", report.GetProperty("status").GetString());
        Assert.Equal(Guid.Empty, report.GetProperty("id").GetGuid());
        Assert.True(report.GetProperty("newRows").GetInt32() > 0);
        await _factory.WithDbAsync(async db =>
        {
            Assert.Equal(0, await db.Set<DatasetImport>().CountAsync());
            Assert.Equal(0, await db.Set<StoredFile>().CountAsync(f => f.FileName.StartsWith("legacy-")));
            Assert.Equal(0, await db.Set<TeachingLoad>().CountAsync());
            Assert.Equal(0, await db.Set<ResearchProject>().CountAsync());
            Assert.Equal(0, await db.Set<Publication>().CountAsync());
            Assert.Equal(0, await db.Set<AuditLogEntry>().CountAsync(a => a.Action.StartsWith("legacy.datasets.")));
            return 0;
        });

        // A dry run of an invalid payload is a rejected report, still nothing stored.
        var bad = await PostAsync(dataset, Array.Empty<object>(), dryRun: true);
        Assert.Equal("rejected", bad.GetProperty("status").GetString());
        Assert.Equal(0, await _factory.WithDbAsync(db => db.Set<DatasetImport>().CountAsync()));
    }

    [Theory]
    [InlineData("teaching")]
    [InlineData("research")]
    [InlineData("publications")]
    public async Task Posting_the_same_rows_again_changes_nothing(string dataset)
    {
        var rows = Rows(dataset);
        var first = await PostAsync(dataset, rows);
        Assert.Equal("applied", first.GetProperty("status").GetString());
        Assert.True(first.GetProperty("newRows").GetInt32() > 0);
        var before = await Counts();

        var second = await PostAsync(dataset, rows);
        Assert.Equal("applied", second.GetProperty("status").GetString());
        Assert.Equal((0, 0, 0), (second.GetProperty("newRows").GetInt32(), second.GetProperty("updatedRows").GetInt32(), second.GetProperty("removedRows").GetInt32()));
        Assert.Equal(first.GetProperty("totalRows").GetInt32(), second.GetProperty("totalRows").GetInt32());
        Assert.Equal(before, await Counts());

        // A dry run after the apply is a no-op report too.
        var dry = await PostAsync(dataset, rows, dryRun: true);
        Assert.Equal((0, 0, 0), (dry.GetProperty("newRows").GetInt32(), dry.GetProperty("updatedRows").GetInt32(), dry.GetProperty("removedRows").GetInt32()));
    }

    private async Task<(int Teaching, int Research, int Members, int Publications, int Authors)> Counts() =>
        await _factory.WithDbAsync(async db => (await db.Set<TeachingLoad>().CountAsync(), await db.Set<ResearchProject>().CountAsync(),
            await db.Set<ResearchProjectMember>().CountAsync(), await db.Set<Publication>().CountAsync(), await db.Set<PublicationAuthor>().CountAsync()));

    private static object Rows(string dataset) => dataset switch
    {
        "teaching" => new[]
        {
            Teach("T0901", "2023-2024", 1, "Giải tích", "22CS_CLC1", hours: 9.12m),
            Teach("T0901", "2023-2024", 2, "Đại số", "22CS_CLC2", hours: 30),
            Teach("T0902", "2022-2023", 1, "Xác suất", "21CS", "Đại học (CQ)", 45),
            Teach("T9999", "2022-2023", 1, "Của người lạ"),
        },
        "research" => new[]
        {
            Member("P1", "Đề tài một", "T0901", "chu_nhiem"),
            Member("P1", "Đề tài một", "T0902"),
            Member("P2", "Đề tài hai", "T0903", accepted: null, result: null),
        },
        _ => new[] { Pub("e1", "Bài một", "T0901", "T0902"), Pub("e2", "Bài hai", "T0903") },
    };
}
