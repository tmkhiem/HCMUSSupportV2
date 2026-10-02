using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using ClosedXML.Excel;
using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Hrm.Datasets;
using HCMUSSupportV2.Backend.Modules.Hrm.Domain;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Tests.Identity;
using HCMUSSupportV2.Backend.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;
using static HCMUSSupportV2.Backend.Tests.Hrm.HrmTestSupport;
using static HCMUSSupportV2.Backend.Tests.Infrastructure.IdentityTestSupport;

namespace HCMUSSupportV2.Backend.Tests.Hrm;

/// <summary>D13b: teaching programs (Đại học, Cao học, Tiến sĩ), the term/program constraint and the import of all three.</summary>
[Collection(PostgresCollection.Name)]
public class TeachingProgramsTests(PostgresFixture database) : IAsyncLifetime
{
    private readonly TestApiFactory _factory = new(database, configureServices: TestControllers.Add);
    private HttpClient _admin = null!;

    private static readonly string[] Headers =
        ["MSCB", "Năm học", "Bậc đào tạo", "Học kỳ", "Học phần/chuyên đề", "Mã môn", "Tên môn", "Mã lớp", "Hệ", "Loại hoạt động", "Số tiết", "Giờ chuẩn"];

    public async Task InitializeAsync()
    {
        _ = _factory.Server;
        await ResetAsync(_factory);
        await SeedEmployeesAsync(await CreateIngestClientAsync(_factory), "T0901", "T0902");
        var client = _factory.CreateSessionClient();
        var code = await CreateEmployeeAsync(_factory, roles: [Roles.Admin]);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsync($"/api/test/sign-in/{code}", null)).StatusCode);
        var me = await client.GetAsync("/api/auth/me");
        if (me.XsrfToken() is { } token) client.DefaultRequestHeaders.Add("X-XSRF-TOKEN", token);
        _admin = client;
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    private static byte[] Workbook(params object?[][] rows)
    {
        using var wb = new XLWorkbook();
        var ws = wb.AddWorksheet("Dữ liệu");
        for (var c = 0; c < Headers.Length; c++) ws.Cell(1, c + 1).Value = Headers[c];
        for (var r = 0; r < rows.Length; r++)
            for (var c = 0; c < rows[r].Length; c++)
                if (rows[r][c] is { } v) ws.Cell(r + 2, c + 1).Value = XLCellValue.FromObject(v);
        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    private async Task<JsonElement> ImportAsync(byte[] bytes)
    {
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        var response = await _admin.PostAsync("/api/admin/datasets/teaching/import", new MultipartFormDataContent { { file, "file", "giang-day.xlsx" } });
        var text = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"{(int)response.StatusCode}: {text}");
        return JsonDocument.Parse(text).RootElement;
    }

    private async Task ApplyAsync(JsonElement report) =>
        Assert.Equal(HttpStatusCode.OK, (await _admin.PostAsync($"/api/admin/datasets/imports/{report.GetProperty("id").GetGuid()}/apply", null)).StatusCode);

    private static readonly object?[][] AllPrograms =
    [
        ["T0901", "2024-2025", "Đại học", 1, null, "MTH1", "Giải tích", "23A1", "CQ", "lythuyet", 45, 45.5],
        ["T0901", "2024-2025", "đai hoc", 1, null, "MTH1", "Giải tích", "23A1", "CQ", "THUCHANH", 30, 15],
        ["T0901", "2024-2025", "Cao học", null, "Học phần 3", "MTH601", "Giải tích nâng cao", "CH23", "CH", "LYTHUYET", 30, 20],
        ["T0902", "2024-2025", "CAO HOC", null, null, "MTH602", "Chuyên đề", "CH23", null, "SEMINARTN", 15, 5],
        ["T0901", "2024-2025", "Tiến sĩ", null, "CĐTS", null, "Chuyên đề tiến sĩ", null, null, "CHUANBI", 15, 7.5],
    ];

    // ------------------------------------------------------------ constraint

    private async Task<string?> InsertAsync(TeachingLoad row)
    {
        try
        {
            await _factory.WithDbAsync(async db => { db.Set<TeachingLoad>().Add(row); await db.SaveChangesAsync(); return 0; });
            return null;
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException pg) { return pg.ConstraintName; }
    }

    private static TeachingLoad Row(string program, int? term, string? module = null) => new()
    {
        EmployeeCode = "T0901", AcademicYear = "2024-2025", Program = program, Term = term, Module = module, CourseName = "Môn thử", Periods = 10, StandardHours = 10,
    };

    [Fact]
    public async Task Check_constraint_allows_a_term_only_for_dai_hoc()
    {
        Assert.Equal("ck_teaching_loads_term", await InsertAsync(Row(TeachingPrograms.CaoHoc, 1)));
        Assert.Equal("ck_teaching_loads_term", await InsertAsync(Row(TeachingPrograms.TienSi, 2)));
        Assert.Equal("ck_teaching_loads_term", await InsertAsync(Row(TeachingPrograms.DaiHoc, null)));
        Assert.Equal("ck_teaching_loads_term", await InsertAsync(Row(TeachingPrograms.DaiHoc, 4)));
        Assert.Equal("ck_teaching_loads_program", await InsertAsync(Row("thac_si", null)));

        Assert.Null(await InsertAsync(Row(TeachingPrograms.DaiHoc, 3)));
        Assert.Null(await InsertAsync(Row(TeachingPrograms.CaoHoc, null, "Học phần 3")));
        Assert.Null(await InsertAsync(Row(TeachingPrograms.TienSi, null)));
        Assert.Equal(3, await _factory.WithDbAsync(db => db.Set<TeachingLoad>().CountAsync()));
    }

    // ------------------------------------------------------------ import

    [Fact]
    public async Task Import_of_all_three_programs_validates_applies_and_reimports_idempotently()
    {
        var report = await ImportAsync(Workbook(AllPrograms));
        Assert.Equal("validated", report.GetProperty("status").GetString());
        Assert.Equal(5, report.GetProperty("totalRows").GetInt32());
        Assert.Equal(5, report.GetProperty("newRows").GetInt32());
        Assert.Equal(0, report.GetProperty("updatedRows").GetInt32());
        Assert.Equal(0, report.GetProperty("removedRows").GetInt32());
        Assert.Equal(0, await _factory.WithDbAsync(db => db.Set<TeachingLoad>().CountAsync()));   // dry-run writes nothing

        await ApplyAsync(report);
        var rows = await RowsAsync<TeachingLoad>(_factory);
        Assert.Equal(5, rows.Count);
        Assert.Equal(2, rows.Count(r => r.Program == TeachingPrograms.DaiHoc));
        Assert.All(rows.Where(r => r.Program == TeachingPrograms.DaiHoc), r => { Assert.Equal(1, r.Term); Assert.Null(r.Module); Assert.Equal("CQ", r.Track); });
        Assert.Equal(["LYTHUYET", "THUCHANH"], rows.Where(r => r.Program == TeachingPrograms.DaiHoc).Select(r => r.Activity).Order().ToArray());
        var ch = rows.Where(r => r.Program == TeachingPrograms.CaoHoc).ToList();
        Assert.Equal(2, ch.Count);
        Assert.All(ch, r => Assert.Null(r.Term));
        Assert.Equal("Học phần 3", ch.Single(r => r.CourseCode == "MTH601").Module);
        Assert.Null(ch.Single(r => r.CourseCode == "MTH602").Module);
        var ts = rows.Single(r => r.Program == TeachingPrograms.TienSi);
        Assert.Equal(("CĐTS", null), (ts.Module, ts.Term));

        // Re-importing the identical file changes nothing.
        var again = await ImportAsync(Workbook(AllPrograms));
        Assert.Equal("validated", again.GetProperty("status").GetString());
        Assert.Equal(5, again.GetProperty("totalRows").GetInt32());
        Assert.Equal(0, again.GetProperty("newRows").GetInt32());
        Assert.Equal(0, again.GetProperty("updatedRows").GetInt32());
        Assert.Equal(0, again.GetProperty("removedRows").GetInt32());
        await ApplyAsync(again);
        Assert.Equal(5, await _factory.WithDbAsync(db => db.Set<TeachingLoad>().CountAsync()));
    }

    [Fact]
    public async Task Importing_one_program_leaves_the_other_programs_of_the_same_year_alone()
    {
        await ApplyAsync(await ImportAsync(Workbook(AllPrograms)));

        // A Cao học-only file: one line changes, one disappears, one is new. Đại học and Tiến sĩ must survive.
        var report = await ImportAsync(Workbook(
            ["T0901", "2024-2025", "Cao học", null, "Học phần 3", "MTH601", "Giải tích nâng cao", "CH23", "CH", "LYTHUYET", 30, 25],
            ["T0902", "2024-2025", "Cao học", null, "Học phần 4", "MTH603", "Đại số nâng cao", "CH23", "CH", "LYTHUYET", 30, 10]));
        Assert.Equal(1, report.GetProperty("newRows").GetInt32());
        Assert.Equal(1, report.GetProperty("updatedRows").GetInt32());
        Assert.Equal(1, report.GetProperty("removedRows").GetInt32());   // MTH602 only; the other programs are not in scope
        await ApplyAsync(report);

        var rows = await RowsAsync<TeachingLoad>(_factory);
        Assert.Equal(2, rows.Count(r => r.Program == TeachingPrograms.DaiHoc));
        Assert.Single(rows, r => r.Program == TeachingPrograms.TienSi);
        var ch = rows.Where(r => r.Program == TeachingPrograms.CaoHoc).ToList();
        Assert.Equal(["MTH601", "MTH603"], ch.Select(r => r.CourseCode).Order().ToArray());
        Assert.Equal(25m, ch.Single(r => r.CourseCode == "MTH601").StandardHours);
    }

    [Fact]
    public async Task Validator_enforces_term_and_module_rules_per_program()
    {
        var report = await ImportAsync(Workbook(
            ["T0901", "2024-2025", "Đại học", null, null, "A", "Thiếu học kỳ", "L", null, null, 1, 1],            // dai_hoc needs a term
            ["T0901", "2024-2025", "Đại học", 5, null, "B", "Học kỳ sai", "L", null, null, 1, 1],                // term out of range
            ["T0901", "2024-2025", "Đại học", 1, "Học phần 1", "C", "Có học phần", "L", null, null, 1, 1],       // module on dai_hoc
            ["T0901", "2024-2025", "Cao học", 1, null, "D", "Cao học có học kỳ", "L", null, null, 1, 1],         // term on postgrad
            ["T0901", "2024-2025", "Tiến sĩ", 2, null, "E", "Tiến sĩ có học kỳ", "L", null, null, 1, 1],
            ["T0901", "2024-2025", "Thạc sĩ", null, null, "F", "Bậc lạ", "L", null, null, 1, 1],                 // unknown program
            ["T0901", "2024-2025", null, null, null, "G", "Thiếu bậc", "L", null, null, 1, 1],
            ["T0901", "2024-2025", "Cao học", null, "HP1", "H", "Trùng 1", "L", null, "LYTHUYET", 1, 1],
            ["T0901", "2024-2025", "Cao học", null, "HP1", "H", "Trùng 2", "L", null, "lythuyet", 1, 1]));         // same key as the line above
        Assert.Equal("rejected", report.GetProperty("status").GetString());
        var issues = report.GetProperty("badValues").EnumerateArray().Select(i => (Row: i.GetProperty("row").GetInt32(), Column: i.GetProperty("column").GetString(), Message: i.GetProperty("message").GetString())).ToList();
        Assert.Contains(issues, i => i.Row == 2 && i.Column == "Học kỳ" && i.Message!.Contains("đối với bậc Đại học"));
        Assert.Contains(issues, i => i.Row == 3 && i.Column == "Học kỳ");
        Assert.Contains(issues, i => i.Row == 4 && i.Column == "Học phần/chuyên đề");
        Assert.Contains(issues, i => i.Row == 5 && i.Column == "Học kỳ" && i.Message!.Contains("để trống"));
        Assert.Contains(issues, i => i.Row == 6 && i.Column == "Học kỳ" && i.Message!.Contains("để trống"));
        Assert.Contains(issues, i => i.Row == 7 && i.Column == "Bậc đào tạo");
        Assert.Contains(issues, i => i.Row == 8 && i.Column == "Bậc đào tạo");
        Assert.Contains(issues, i => i.Row == 10 && i.Message!.Contains("dòng 9"));
        Assert.Equal(8, issues.Count);
    }

    [Fact]
    public void Row_model_normalises_for_any_feed()
    {
        var bad = new List<ImportIssueDto>();
        Assert.True(TeachingLoadRules.TryNormalize(
            new TeachingLoadRow("T0901", "2024-2025", "dai_hoc", 2, "  ", " MTH1 ", "Giải tích", null, " CQ ", "baitap", 0, 3m), 1, bad, out var row));
        Assert.Empty(bad);
        Assert.Equal(("dai_hoc", 2, null, "MTH1", "CQ", "BAITAP"), (row.Program, row.Term, row.Module, row.CourseCode, row.Track, row.Activity));
        Assert.Equal("dai_hoc", TeachingLoadRules.ParseProgram("Đại học"));
        Assert.Equal("tien_si", TeachingLoadRules.ParseProgram("Tiến Sĩ"));
        Assert.Null(TeachingLoadRules.ParseProgram("khác"));
    }

    // ------------------------------------------------------------ migration backfill

    [Fact]
    public async Task Migration_backfills_existing_rows_as_dai_hoc_and_renames_level_to_activity()
    {
        var admin = new NpgsqlConnectionStringBuilder(database.ConnectionString) { Database = "postgres", Pooling = false };
        var name = $"hcmus_support_test_{Guid.NewGuid():N}";
        await using (var conn = new NpgsqlConnection(admin.ConnectionString))
        {
            await conn.OpenAsync();
            await new NpgsqlCommand($"CREATE DATABASE \"{name}\"", conn).ExecuteNonQueryAsync();
        }
        try
        {
            var connectionString = new NpgsqlConnectionStringBuilder(admin.ConnectionString) { Database = name, Pooling = false }.ConnectionString;
            var options = new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connectionString).UseSnakeCaseNamingConvention().Options;
            await using var db = new AppDbContext(options);
            var migrator = db.GetService<IMigrator>();
            await migrator.MigrateAsync("20261002050800_D14c_EmployeeEmails");   // the schema before D13b

            await db.Database.ExecuteSqlRawAsync("""
                SET session_replication_role = replica;
                INSERT INTO teaching_loads (employee_code, academic_year, term, course_name, level, periods, standard_hours)
                VALUES ('T0001', '2023-2024', 2, 'Giải tích', 'dh', 45, 45.5), ('T0001', '2023-2024', 3, 'Đại số', NULL, 30, 30);
                SET session_replication_role = DEFAULT;
                """);

            await migrator.MigrateAsync();
            var rows = await db.Set<TeachingLoad>().AsNoTracking().OrderBy(t => t.Term).ToListAsync();
            Assert.Equal(2, rows.Count);
            Assert.All(rows, r => { Assert.Equal(TeachingPrograms.DaiHoc, r.Program); Assert.Null(r.Module); Assert.Null(r.Track); });
            Assert.Equal([2, 3], rows.Select(r => r.Term!.Value).ToArray());
            Assert.Equal("dh", rows[0].Activity);   // the old free-text level is preserved in activity
            Assert.Null(rows[1].Activity);
        }
        finally
        {
            NpgsqlConnection.ClearAllPools();
            await using var conn = new NpgsqlConnection(admin.ConnectionString);
            await conn.OpenAsync();
            await new NpgsqlCommand($"DROP DATABASE IF EXISTS \"{name}\" WITH (FORCE)", conn).ExecuteNonQueryAsync();
        }
    }
}
