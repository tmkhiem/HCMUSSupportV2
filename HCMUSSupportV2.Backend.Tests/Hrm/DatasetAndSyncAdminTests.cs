using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using ClosedXML.Excel;
using HCMUSSupportV2.Backend.Modules.Hrm.Domain;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using HCMUSSupportV2.Backend.Tests.Identity;
using HCMUSSupportV2.Backend.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using static HCMUSSupportV2.Backend.Tests.Hrm.HrmTestSupport;
using static HCMUSSupportV2.Backend.Tests.Infrastructure.IdentityTestSupport;

namespace HCMUSSupportV2.Backend.Tests.Hrm;

[Collection(PostgresCollection.Name)]
public class DatasetAndSyncAdminTests : IAsyncLifetime
{
    private readonly TestApiFactory _factory;
    private HttpClient _ingest = null!;
    private HttpClient _admin = null!;

    public DatasetAndSyncAdminTests(PostgresFixture database) => _factory = new TestApiFactory(database, configureServices: TestControllers.Add);

    public async Task InitializeAsync()
    {
        _ = _factory.Server;
        await ResetAsync(_factory);
        _ingest = await CreateIngestClientAsync(_factory);
        await SeedEmployeesAsync(_ingest, "T0901", "T0902", "T0903");
        _admin = await SignInAsync(await CreateEmployeeAsync(_factory, roles: [Roles.Admin]));
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    private async Task<HttpClient> SignInAsync(string code)
    {
        var client = _factory.CreateSessionClient();
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsync($"/api/test/sign-in/{code}", null)).StatusCode);
        var me = await client.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        if (me.XsrfToken() is { } token) client.DefaultRequestHeaders.Add("X-XSRF-TOKEN", token);
        return client;
    }

    private static byte[] Workbook(string[] headers, params object?[][] rows)
    {
        using var wb = new XLWorkbook();
        var ws = wb.AddWorksheet("Dữ liệu");
        for (var c = 0; c < headers.Length; c++) ws.Cell(1, c + 1).Value = headers[c];
        for (var r = 0; r < rows.Length; r++)
            for (var c = 0; c < rows[r].Length; c++)
                if (rows[r][c] is { } v) ws.Cell(r + 2, c + 1).Value = XLCellValue.FromObject(v);
        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    private static MultipartFormDataContent Upload(byte[] bytes, string fileName = "du-lieu.xlsx")
    {
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        return new MultipartFormDataContent { { file, "file", fileName } };
    }

    private static readonly string[] TeachingHeaders = ["MSCB", "Năm học", "Bậc đào tạo", "Học kỳ", "Học phần/chuyên đề", "Mã môn", "Tên môn", "Mã lớp", "Hệ", "Loại hoạt động", "Số tiết", "Giờ chuẩn"];

    private async Task<JsonElement> ImportAsync(string dataset, byte[] bytes, HttpStatusCode expected = HttpStatusCode.OK)
    {
        var response = await _admin.PostAsync($"/api/admin/datasets/{dataset}/import", Upload(bytes));
        var text = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == expected, $"{(int)response.StatusCode}: {text}");
        return JsonDocument.Parse(text).RootElement;
    }

    // ------------------------------------------------------------ access

    [Fact]
    public async Task Only_admins_reach_dataset_and_sync_endpoints()
    {
        var editor = await SignInAsync(await CreateEmployeeAsync(_factory, roles: [Roles.Editor]));
        var anonymous = _factory.CreateSessionClient();

        foreach (var url in new[] { "/api/admin/datasets/teaching/template", "/api/admin/sync-runs", "/api/admin/sync-issues" })
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await editor.GetAsync(url)).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(url)).StatusCode);
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await editor.PostAsync("/api/admin/datasets/teaching/import", Upload(Workbook(TeachingHeaders)))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await editor.PostAsync($"/api/admin/datasets/imports/{Guid.NewGuid()}/apply", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await editor.PutAsync("/api/admin/sync-issues/1/resolve", null)).StatusCode);
    }

    // ------------------------------------------------------------ templates

    [Theory]
    [InlineData("teaching", "MSCB", "Giờ chuẩn")]
    [InlineData("research", "Mã đề tài", "Vai trò")]
    [InlineData("publications", "DOI", "MSCB tác giả")]
    public async Task Templates_download_as_xlsx_with_vietnamese_headers(string dataset, string firstHeader, string lastHeader)
    {
        var response = await _admin.GetAsync($"/api/admin/datasets/{dataset}/template");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", response.Content.Headers.ContentType!.MediaType);
        using var wb = new XLWorkbook(await response.Content.ReadAsStreamAsync());
        var headers = wb.Worksheet(1).Row(1).CellsUsed().Select(c => c.GetString()).ToList();
        Assert.Equal(firstHeader, headers.First());
        Assert.Equal(lastHeader, headers.Last());

        Assert.Equal(HttpStatusCode.NotFound, (await _admin.GetAsync("/api/admin/datasets/unknown/template")).StatusCode);
    }

    // ------------------------------------------------------------ teaching: validate -> apply

    [Fact]
    public async Task Teaching_import_reports_problems_then_validates_and_applies_per_academic_year()
    {
        // Existing data: 2023-2024 must survive; 2024-2025 is replaced.
        await _factory.WithDbAsync(async db =>
        {
            db.Set<TeachingLoad>().AddRange(
                new TeachingLoad { EmployeeCode = "T0901", AcademicYear = "2023-2024", Program = TeachingPrograms.DaiHoc, Term = 1, CourseCode = "OLD1", CourseName = "Giữ lại", ClassCode = "A", Periods = 10, StandardHours = 10 },
                new TeachingLoad { EmployeeCode = "T0901", AcademicYear = "2024-2025", Program = TeachingPrograms.DaiHoc, Term = 1, Track = "CQ", Activity = "LYTHUYET", CourseCode = "GONE", CourseName = "Sẽ bị xóa", ClassCode = "A", Periods = 10, StandardHours = 10 },
                new TeachingLoad { EmployeeCode = "T0902", AcademicYear = "2024-2025", Program = TeachingPrograms.DaiHoc, Term = 1, Track = "CQ", Activity = "LYTHUYET", CourseCode = "MTH1", CourseName = "Giải tích cũ", ClassCode = "A", Periods = 10, StandardHours = 10 });
            await db.SaveChangesAsync();
            return 0;
        });

        // 1) bad values and an unknown MSCB: rejected, nothing applied.
        var bad = await ImportAsync("teaching", Workbook(TeachingHeaders,
            ["T0901", "2024-2025", "Đại học", 1, null, "MTH1", "Giải tích", "A", "CQ", "lythuyet", 45, 45.5],
            ["T0901", "2024-2025", "Đại học", 7, null, "MTH2", "Đại số", "A", "CQ", "lythuyet", 30, 30],        // bad term
            ["T0901", "2024/2025", "Đại học", 1, null, "MTH3", "Xác suất", "A", "CQ", "lythuyet", 30, 30],      // bad year
            ["T9999", "2024-2025", "Đại học", 1, null, "MTH4", "Của người lạ", "A", "CQ", "lythuyet", 30, 30],  // unknown MSCB
            ["T0902", "2024-2025", "Đại học", 2, null, "MTH5", "Thống kê", "B", "CQ", "lythuyet", "x", 30]));    // bad periods
        Assert.Equal("rejected", bad.GetProperty("status").GetString());
        Assert.Equal(3, bad.GetProperty("badValues").GetArrayLength());
        Assert.Equal("T9999", bad.GetProperty("unknownMscbs")[0].GetString());
        var badId = bad.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.Conflict, (await _admin.PostAsync($"/api/admin/datasets/imports/{badId}/apply", null)).StatusCode);

        // 2) a clean file: validated with a diff report; the dataset is still untouched.
        var good = await ImportAsync("teaching", Workbook(TeachingHeaders,
            ["T0901", "2024-2025", "Đại học", 1, null, "MTH1", "Giải tích", "A", "CQ", "lythuyet", 45, 45.5],
            ["T0902", "2024-2025", "Đại học", 1, null, "MTH1", "Giải tích", "A", "CQ", "lythuyet", 45, 45.5],
            ["T0902", "2024-2025", "Đại học", 2, null, "MTH2", "Đại số", "B", "CQ", "lythuyet", 30, 30],
            ["T9999", "2024-2025", "Đại học", 1, null, "MTH4", "Của người lạ", "A", "CQ", "lythuyet", 30, 30]));
        Assert.Equal("validated", good.GetProperty("status").GetString());
        Assert.Equal(4, good.GetProperty("totalRows").GetInt32());
        Assert.Equal(2, good.GetProperty("newRows").GetInt32());       // T0901 MTH1 and T0902 MTH2
        Assert.Equal(1, good.GetProperty("updatedRows").GetInt32());   // T0902 MTH1 changed
        Assert.Equal(1, good.GetProperty("removedRows").GetInt32());   // T0901 GONE
        Assert.Equal(["T9999"], good.GetProperty("unknownMscbs").EnumerateArray().Select(x => x.GetString()).ToArray());
        Assert.Equal(["2024-2025"], good.GetProperty("academicYears").EnumerateArray().Select(x => x.GetString()).ToArray());
        Assert.Equal(3, await _factory.WithDbAsync(db => db.Set<TeachingLoad>().CountAsync()));

        // 3) apply: only 2024-2025 is replaced; the unknown MSCB row is skipped.
        var goodId = good.GetProperty("id").GetGuid();
        var applied = await _admin.PostAsync($"/api/admin/datasets/imports/{goodId}/apply", null);
        Assert.Equal(HttpStatusCode.OK, applied.StatusCode);
        var rows = await RowsAsync<TeachingLoad>(_factory);
        Assert.Equal(4, rows.Count);
        Assert.Contains(rows, r => r.AcademicYear == "2023-2024" && r.CourseCode == "OLD1");
        Assert.DoesNotContain(rows, r => r.CourseCode == "GONE");
        Assert.DoesNotContain(rows, r => r.EmployeeCode == "T9999");
        Assert.All(rows.Where(r => r.AcademicYear == "2024-2025"), r => Assert.Equal(goodId, r.SourceImportId));
        Assert.Equal(45.5m, rows.Single(r => r.EmployeeCode == "T0902" && r.CourseCode == "MTH1").StandardHours);

        var status = (await _factory.WithDbAsync(db => db.Set<DatasetImport>().AsNoTracking().SingleAsync(i => i.Id == goodId))).Status;
        Assert.Equal("applied", status);
        Assert.Equal(HttpStatusCode.Conflict, (await _admin.PostAsync($"/api/admin/datasets/imports/{goodId}/apply", null)).StatusCode);   // not twice
        Assert.True(await _factory.WithDbAsync(db => db.Set<AuditLogEntry>().AnyAsync(a => a.Action == "dataset.import_apply")));
    }

    [Fact]
    public async Task Non_xlsx_and_header_less_files_are_rejected()
    {
        var text = new MultipartFormDataContent { { new ByteArrayContent("a,b"u8.ToArray()), "file", "x.csv" } };
        Assert.Equal(HttpStatusCode.BadRequest, (await _admin.PostAsync("/api/admin/datasets/teaching/import", text)).StatusCode);

        var missing = await ImportAsync("teaching", Workbook(["MSCB", "Năm học"], ["T0901", "2024-2025"]));
        Assert.Equal("rejected", missing.GetProperty("status").GetString());
        Assert.Contains("Thiếu cột", missing.GetProperty("badValues")[0].GetProperty("message").GetString());
    }

    // ------------------------------------------------------------ research, publications

    [Fact]
    public async Task Research_import_replaces_the_whole_dataset_with_members()
    {
        await _factory.WithDbAsync(async db =>
        {
            db.Set<ResearchProject>().Add(new ResearchProject { Code = "OLD", Title = "Đề tài cũ" });
            await db.SaveChangesAsync();
            return 0;
        });
        string[] headers = ["Mã đề tài", "Tên đề tài", "Cấp", "Loại hình nghiên cứu", "Kinh phí", "Thời gian", "Ngày nghiệm thu", "Kết quả", "MSCB", "Vai trò"];
        var report = await ImportAsync("research", Workbook(headers,
            ["DT01", "Đề tài một", "Cơ sở", "Cơ bản", 120000000, "2022-2023", "30/06/2023", "Đạt", "T0901", "Chủ nhiệm"],
            ["DT01", "Đề tài một", "Cơ sở", "Cơ bản", 120000000, "2022-2023", "30/06/2023", "Đạt", "T0902", "Thành viên"],
            ["DT02", "Đề tài hai", "Bộ", null, null, null, null, null, "T9999", "Thành viên"]));
        Assert.Equal("validated", report.GetProperty("status").GetString());
        Assert.Equal(2, report.GetProperty("totalRows").GetInt32());     // projects
        Assert.Equal(2, report.GetProperty("newRows").GetInt32());
        Assert.Equal(1, report.GetProperty("removedRows").GetInt32());   // OLD
        Assert.Equal("T9999", report.GetProperty("unknownMscbs")[0].GetString());

        var id = report.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await _admin.PostAsync($"/api/admin/datasets/imports/{id}/apply", null)).StatusCode);

        var projects = await RowsAsync<ResearchProject>(_factory);
        Assert.Equal(["DT01", "DT02"], projects.Select(p => p.Code).Order().ToArray());
        Assert.Equal(120000000m, projects.Single(p => p.Code == "DT01").Funding);
        Assert.Equal(new DateOnly(2023, 6, 30), projects.Single(p => p.Code == "DT01").AcceptedOn);
        var members = await RowsAsync<ResearchProjectMember>(_factory);
        Assert.Equal(2, members.Count);
        Assert.Equal("chu_nhiem", members.Single(m => m.EmployeeCode == "T0901").Role);
    }

    [Fact]
    public async Task Publications_import_replaces_the_whole_dataset_with_ordered_authors()
    {
        string[] headers = ["DOI", "EID", "Tên bài báo", "Tạp chí/Hội nghị", "Năm", "Chi tiết", "Đường dẫn", "MSCB tác giả"];
        var report = await ImportAsync("publications", Workbook(headers,
            ["10.1000/a", "2-s2.0-1", "Bài báo A", "Tạp chí Thử", 2023, "Tập 1, trang 1-10", "https://doi.org/10.1000/a", "T0902; T0901"],
            [null, null, "Bài báo B", "Hội nghị Thử", 2022, null, null, "T0901"]));
        Assert.Equal("validated", report.GetProperty("status").GetString());
        Assert.Equal(2, report.GetProperty("newRows").GetInt32());
        var id = report.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await _admin.PostAsync($"/api/admin/datasets/imports/{id}/apply", null)).StatusCode);

        var pubs = await RowsAsync<Publication>(_factory);
        Assert.Equal(2, pubs.Count);
        var a = pubs.Single(p => p.Doi == "10.1000/a");
        var authors = (await RowsAsync<PublicationAuthor>(_factory)).Where(x => x.PublicationId == a.Id).OrderBy(x => x.Ordinal).ToList();
        Assert.Equal(["T0902", "T0901"], authors.Select(x => x.EmployeeCode).ToArray());

        // Same DOI twice in one file: rejected.
        var dup = await ImportAsync("publications", Workbook(headers,
            ["10.1000/z", null, "Z1", null, 2020, null, null, "T0901"],
            ["10.1000/z", null, "Z2", null, 2020, null, null, "T0901"]));
        Assert.Equal("rejected", dup.GetProperty("status").GetString());
    }

    // ------------------------------------------------------------ sync visibility

    [Fact]
    public async Task Admin_sees_sync_runs_and_resolves_issues()
    {
        // The duplicate-MSCB run: seeded employees already ran once; this second snapshot quarantines T0910.
        var emp = (string code, int hrm) => Emp(code, hrm);
        await _ingest.PostOkAsync("employees", new[] { emp("T0901", NextHrmId()), emp("T0902", NextHrmId()), emp("T0903", NextHrmId()), emp("T0910", NextHrmId()), emp("T0910", NextHrmId()) }, force: true);

        var runs = await _admin.GetFromJsonAsync<JsonElement>("/api/admin/sync-runs?dataset=employees");
        var run = runs.GetProperty("items")[0];
        Assert.Equal("employees", run.GetProperty("dataset").GetString());
        Assert.Equal("success", run.GetProperty("status").GetString());
        Assert.Equal(1, run.GetProperty("openIssueCount").GetInt32());

        var open = await _admin.GetFromJsonAsync<JsonElement>("/api/admin/sync-issues?resolved=false");
        var issue = Assert.Single(open.GetProperty("items").EnumerateArray().ToList());
        Assert.Equal("duplicate_mscb", issue.GetProperty("kind").GetString());
        Assert.Equal("T0910", issue.GetProperty("sourceKey").GetString());
        var id = issue.GetProperty("id").GetInt64();

        var resolve = await _admin.PutAsync($"/api/admin/sync-issues/{id}/resolve", null);
        Assert.Equal(HttpStatusCode.OK, resolve.StatusCode);
        Assert.NotEqual(JsonValueKind.Null, (await resolve.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("resolvedAt").ValueKind);

        Assert.Empty((await _admin.GetFromJsonAsync<JsonElement>("/api/admin/sync-issues?resolved=false")).GetProperty("items").EnumerateArray());
        Assert.Single((await _admin.GetFromJsonAsync<JsonElement>("/api/admin/sync-issues?resolved=true")).GetProperty("items").EnumerateArray().ToList());
        Assert.Equal(HttpStatusCode.NotFound, (await _admin.PutAsync("/api/admin/sync-issues/999999/resolve", null)).StatusCode);
    }
}
