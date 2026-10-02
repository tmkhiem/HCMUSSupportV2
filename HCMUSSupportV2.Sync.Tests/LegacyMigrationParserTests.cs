using System.Text;
using System.Text.Json;
using HCMUSSupportV2.Sync.Contracts;
using HCMUSSupportV2.Sync.Legacy;
using HCMUSSupportV2.Sync.Sources;

namespace HCMUSSupportV2.Sync.Tests;

/// <summary>Synthetic fixtures only (MSCB T0001..., made-up names and courses): D15 parsers of teaching, research, publications and users.</summary>
internal static class LegacyFixture
{
    public static string TeachingFile(string header, params (string Mscb, string[][] Rows)[] teachers)
    {
        var values = teachers.ToDictionary(
            t => t.Mscb,
            t => new[] { new Dictionary<string, string> { ["{rows}"] = string.Concat(t.Rows.Select(r => "<tr>" + string.Concat(r.Select(c => $"<td>{c}</td>")) + "</tr>")) } });
        return JsonSerializer.Serialize(new
        {
            header,
            template = "<table class=\"teaching-stats-table\"><thead><td>Môn học</td><td>Lớp</td><td>Bậc đào tạo</td><td>Giờ chuẩn</td></thead>{rows}</table>",
            datestr = "2022-09-18", category = "teaching-stats", values,
        });
    }

    public static string[] Line(string course, string cls, string levelTerm, string hours) => [course, cls, levelTerm, hours];

    public static List<V1Row> V1Rows(string json)
    {
        var rows = new List<V1Row>();
        V1Reader.ParseChunk(Encoding.UTF8.GetBytes(json), rows);
        return rows;
    }

    public static string ResearchFile(params (string Mscb, Dictionary<string, string> Row)[] rows)
    {
        var values = rows.GroupBy(r => r.Mscb).ToDictionary(
            g => g.Key,
            g => g.Select(r => r.Row.ToDictionary(kv => "{" + kv.Key + "}", kv => kv.Value)).ToArray());
        return JsonSerializer.Serialize(new { header = "{ten_de_tai}", template = "<ul></ul>", datestr = "2024-11-06", category = "research-stats", values });
    }

    public static Dictionary<string, string> Project(string code, string title, string role = "Thành Viên", string funding = "550.000.000",
        string accepted = "24/12/2012", string period = "04/2009-03/2011", string level = "Cấp Trường", string result = "Khá") =>
        new()
        {
            ["MSCBGV"] = "x", ["ma_so"] = code, ["ten_de_tai"] = title, ["tu_cach_tham_gia"] = role, ["kinh_phi"] = funding, ["NgayNghiemThu"] = accepted,
            ["thoi_gian_thuc_hien"] = period, ["TenCapDeTai"] = level, ["TenLoaiHinhNC"] = "Nghiên cứu cơ bản", ["TenKetQuaDT"] = result,
        };
}

public class TeachingParserTests
{
    [Theory]
    [InlineData("Đại học (CLC), HK3", "Đại học (CLC)", 3)]
    [InlineData("Đại học (LYTHUYET), HK1", "Đại học (LYTHUYET)", 1)]
    [InlineData("Đại học (None), HK2", "Đại học", 2)]
    [InlineData("Đại học, HK3", "Đại học", 3)]
    [InlineData("Đại học (CH), HKHP3", "Đại học (CH)", null)]      // module number, not a term
    [InlineData("Đại học (HPTS), HKNone", "Đại học (HPTS)", null)]
    [InlineData("Cao học, Học phần 4", "Cao học, Học phần 4", null)]
    [InlineData("Học phần Cao học (Hóa phân tích)", "Học phần Cao học (Hóa phân tích)", null)]
    [InlineData("Chuyên đề TS", "Chuyên đề TS", null)]
    [InlineData("Đại học (CLC), HK4", "Đại học (CLC)", null)]      // outside 1..3
    [InlineData("  Đại học (CQ) ,  HK1  ", "Đại học (CQ)", 1)]
    public void Level_and_term_come_from_the_text_around_HK(string text, string level, int? term)
    {
        Assert.Equal((level, term), TeachingParser.LevelAndTerm(text));
    }

    [Theory]
    [InlineData("9.12", 9.12)]
    [InlineData("45", 45)]
    [InlineData("9,12", 9.12)]          // decimal comma
    [InlineData("1.234,5", 1234.5)]     // thousands dot, decimal comma
    [InlineData("1,234.5", 1234.5)]     // thousands comma, decimal dot
    [InlineData(" 7.5 ", 7.5)]
    [InlineData("0", 0)]
    public void Hours_accept_dot_and_comma(string text, double expected)
    {
        Assert.True(TeachingParser.TryHours(text, out var hours));
        Assert.Equal((decimal)expected, hours);
    }

    [Theory]
    [InlineData("")]
    [InlineData("abc")]
    [InlineData("-3")]
    [InlineData("1.2.3")]
    public void Bad_hours_are_refused(string text) => Assert.False(TeachingParser.TryHours(text, out _));

    [Theory]
    [InlineData("Thông tin giảng dạy trong năm học 2020-2021 tại Trường", "teaching-stats-2019-2021.json", "2020-2021")]  // header beats a two-year file name
    [InlineData("Thông tin giảng dạy trong năm học 2023-2024 tại Trường (cập nhật đến 31/10/2024)", "teaching-stats-2023-2024.json", "2023-2024")]
    [InlineData("không có năm", "teaching-stats-2021-2022.json", "2021-2022")]    // file name fallback
    [InlineData("", "teaching-stats-2019-2021.json", null)]                         // not consecutive, nothing else to go on
    [InlineData("năm học 2020-2022", "teaching-stats-2019-2021.json", null)]
    public void Academic_year_comes_from_the_header_then_the_file_name(string header, string file, string? expected)
    {
        Assert.Equal(expected, TeachingParser.AcademicYearOf(header, file));
    }

    [Fact]
    public void A_header_that_disagrees_with_the_file_name_is_counted_and_the_header_wins()
    {
        var report = new MappingReport();
        Assert.Equal("2020-2021", TeachingParser.AcademicYearOf("năm học 2020-2021", "teaching-stats-2021-2022.json", report));
        Assert.Equal(1, report.Counts["teaching_header_year_differs_from_file_name"]);
    }

    [Fact]
    public void Table_rows_are_parsed_with_a_real_html_parser()
    {
        var html = "<tr><td>Giải&nbsp;tích  1 &amp; 2</td><td>22CS_CLC1</td><td>Đại học (CLC), HK3</td><td>9.12</td></tr>\r\n<tr><td> Đại số </td><td></td><td>x</td></tr>";
        var rows = TeachingParser.TableRows(html).ToList();
        Assert.Equal(2, rows.Count);
        Assert.Equal(["Giải tích 1 & 2", "22CS_CLC1", "Đại học (CLC), HK3", "9.12"], rows[0]);
        Assert.Equal(["Đại số", "", "x"], rows[1]);
        Assert.Empty(TeachingParser.TableRows(""));
        Assert.Empty(TeachingParser.TableRows("no table here"));
    }

    private static TeachingYear Parse(string json, string file, MappingReport report, int? unknownTerm = null) =>
        TeachingParser.ParseFile(Encoding.UTF8.GetBytes(json), file, unknownTerm, report)!;

    [Fact]
    public void A_file_maps_to_rows_with_term_level_and_zero_periods()
    {
        var json = LegacyFixture.TeachingFile("Thông tin giảng dạy trong năm học 2023-2024 tại Trường",
            ("T0001", [
                LegacyFixture.Line("Thực tập Sinh đại cương 2", "22CS_CLC1", "Đại học (CLC), HK3", "9.12"),
                LegacyFixture.Line("Giải tích", "CQ", "Đại học (None), HK1", "45"),
            ]),
            ("T0002", [LegacyFixture.Line("Đại số", "22CS_CLC2", "Đại học (CQ), HK2", "30,5")]));
        var report = new MappingReport();

        var year = Parse(json, "teaching-stats-2023-2024.json", report);

        Assert.Equal("2023-2024", year.AcademicYear);
        Assert.Equal(3, year.Rows.Count);
        Assert.Equal(new LegacyTeachingRow("T0001", "2023-2024", 3, null, "Thực tập Sinh đại cương 2", "22CS_CLC1", "Đại học (CLC)", 0, 9.12m), year.Rows[0]);
        Assert.Equal(new LegacyTeachingRow("T0001", "2023-2024", 1, null, "Giải tích", "CQ", "Đại học", 0, 45m), year.Rows[1]);
        Assert.Equal(30.5m, year.Rows[2].StandardHours);
        Assert.Empty(report.Counts);
    }

    [Fact]
    public void The_two_year_file_name_carries_the_header_year_only()
    {
        // teaching-stats-2019-2021.json: the header says 2020-2021 and every line is filed under it (see docs/SYNC.md).
        var json = LegacyFixture.TeachingFile("Thông tin giảng dạy trong năm học 2020-2021 tại Trường",
            ("T0001", [LegacyFixture.Line("Giải tích", "19CTT1", "Đại học (LYTHUYET), HK1", "45")]));
        var year = Parse(json, "teaching-stats-2019-2021.json", new MappingReport());
        Assert.Equal("2020-2021", year.AcademicYear);
        Assert.All(year.Rows, r => Assert.Equal("2020-2021", r.AcademicYear));
    }

    [Fact]
    public void A_file_whose_year_cannot_be_told_is_skipped_and_counted()
    {
        var json = LegacyFixture.TeachingFile("Thông tin giảng dạy", ("T0001", [LegacyFixture.Line("A", "B", "Đại học, HK1", "1")]));
        var report = new MappingReport();
        Assert.Null(TeachingParser.ParseFile(Encoding.UTF8.GetBytes(json), "teaching-stats-2019-2021.json", null, report));
        Assert.Equal(1, report.Counts["teaching_file_year_unknown"]);
    }

    [Fact]
    public void Lines_of_one_course_and_class_add_up_but_other_levels_stay_apart()
    {
        var json = LegacyFixture.TeachingFile("năm học 2022-2023",
            ("T0001", [
                LegacyFixture.Line("Cơ sở dữ liệu", "19CTT1", "Đại học (LYTHUYET), HK1", "10.126"),
                LegacyFixture.Line("Cơ sở dữ liệu", "19CTT1", "Đại học (LYTHUYET), HK1", "5.1"),     // same line again: adds up
                LegacyFixture.Line("Cơ sở dữ liệu", "19CTT1", "Đại học (THUCHANH), HK1", "15"),    // other level
                LegacyFixture.Line("Cơ sở dữ liệu", "19CTT1", "Đại học (LYTHUYET), HK2", "20"),    // other term
                LegacyFixture.Line("Lập trình", "19CTT1", "Đại học (LYTHUYET), HK1", "30"),        // other course
            ]),
            ("T0002", [LegacyFixture.Line("Cơ sở dữ liệu", "19CTT1", "Đại học (LYTHUYET), HK1", "7")]));   // other teacher
        var report = new MappingReport();

        var rows = Parse(json, "teaching-stats-2022-2023.json", report).Rows;

        Assert.Equal(5, rows.Count);
        Assert.Equal(15.23m, rows[0].StandardHours);     // 10.126 + 5.1 rounded to two decimals
        Assert.Equal(1, report.Counts["teaching_merged_lines"]);
        Assert.Equal(rows.Count, rows.Select(r => (r.EmployeeCode, r.Term, r.CourseName, r.ClassCode, r.Level)).Distinct().Count());
    }

    [Fact]
    public void Lines_without_a_term_are_skipped_by_default_or_filed_under_the_chosen_term()
    {
        var json = LegacyFixture.TeachingFile("năm học 2021-2022",
            ("T0001", [
                LegacyFixture.Line("Hóa phân tích", "Khóa 29", "Cao học, Học phần 4", "13.5"),
                LegacyFixture.Line("Chuyên đề", "x", "Tiến sĩ, CĐTS", "10"),
                LegacyFixture.Line("Giải tích", "CQ", "Đại học (CQ), HK1", "45"),
            ]));

        var skipped = new MappingReport();
        Assert.Single(Parse(json, "teaching-stats-2021-2022.json", skipped).Rows);
        Assert.Equal(2, skipped.Counts["teaching_no_term"]);

        var assigned = new MappingReport();
        var rows = Parse(json, "teaching-stats-2021-2022.json", assigned, unknownTerm: 1).Rows;
        Assert.Equal(3, rows.Count);
        Assert.All(rows, r => Assert.Equal(1, r.Term));
        Assert.Equal("Cao học, Học phần 4", rows.Single(r => r.CourseName == "Hóa phân tích").Level);
        Assert.Equal(2, assigned.Counts["teaching_no_term_assigned"]);
    }

    [Fact]
    public void Malformed_lines_are_dropped_and_counted()
    {
        var json = LegacyFixture.TeachingFile("năm học 2021-2022",
            ("T0001", [
                ["Chỉ ba ô", "x", "Đại học, HK1"],
                LegacyFixture.Line("", "x", "Đại học, HK1", "1"),
                LegacyFixture.Line("Giờ lạ", "x", "Đại học, HK1", "abc"),
                LegacyFixture.Line("Giờ quá lớn", "x", "Đại học, HK1", "100000"),
                LegacyFixture.Line("Tốt", "", "Đại học, HK1", "1"),
            ]));
        var report = new MappingReport();

        var rows = Parse(json, "teaching-stats-2021-2022.json", report).Rows;

        var only = Assert.Single(rows);
        Assert.Null(only.ClassCode); // an empty class is null, not ""
        Assert.Equal((1, 1, 1, 1), (report.Counts["teaching_bad_row"], report.Counts["teaching_no_course"], report.Counts["teaching_bad_hours"], report.Counts["teaching_hours_too_large"]));
    }

    [Fact]
    public void Two_files_for_one_year_keep_the_first_and_count_the_second()
    {
        var dir = Path.Combine(Path.GetTempPath(), "sync-tests-" + Guid.NewGuid().ToString("N"));
        try
        {
            var teaching = Path.Combine(dir, "teaching-stats");
            Directory.CreateDirectory(teaching);
            File.WriteAllText(Path.Combine(teaching, "teaching-stats-2020-2021.json"), LegacyFixture.TeachingFile("năm học 2020-2021", ("T0001", [LegacyFixture.Line("A", "B", "Đại học, HK1", "1")])));
            File.WriteAllText(Path.Combine(teaching, "teaching-stats-2019-2021.json"), LegacyFixture.TeachingFile("năm học 2020-2021", ("T0002", [LegacyFixture.Line("A", "B", "Đại học, HK1", "1")])));
            File.WriteAllText(Path.Combine(teaching, "teaching-stats-2022-2023.json"), LegacyFixture.TeachingFile("năm học 2022-2023", ("T0003", [LegacyFixture.Line("A", "B", "Đại học, HK1", "1")])));
            var report = new MappingReport();

            var years = TeachingParser.ReadAll(dir, null, report);

            Assert.Equal(["2020-2021", "2022-2023"], years.Select(y => y.AcademicYear));
            Assert.Equal(1, report.Counts["teaching_year_in_several_files"]);
        }
        finally { if (Directory.Exists(dir)) Directory.Delete(dir, true); }
    }

    [Fact]
    public void A_missing_teaching_folder_gives_nothing() => Assert.Empty(TeachingParser.ReadAll(Path.Combine(Path.GetTempPath(), "does-not-exist-" + Guid.NewGuid().ToString("N")), null, new MappingReport()));
}

public class ResearchParserTests
{
    private static (IReadOnlyList<LegacyResearchRow> Rows, MappingReport Report) Parse(params (string Mscb, Dictionary<string, string> Row)[] rows)
    {
        var report = new MappingReport();
        return (ResearchParser.Parse(LegacyFixture.V1Rows(LegacyFixture.ResearchFile(rows)), report), report);
    }

    [Theory]
    [InlineData("Chủ Nhiệm", "chu_nhiem")]
    [InlineData("chủ nhiệm", "chu_nhiem")]
    [InlineData("Đồng Chủ Nhiệm", "dong_chu_nhiem")]
    [InlineData("Thành Viên", "thanh_vien")]
    [InlineData("THÀNH VIÊN", "thanh_vien")]
    [InlineData("", "thanh_vien")]
    [InlineData("Cố vấn", "thanh_vien")]
    public void Role_text_maps_to_snake_case_codes(string text, string code) => Assert.Equal(code, ResearchParser.RoleOf(text));

    [Fact]
    public void Unknown_and_blank_roles_are_counted()
    {
        var (_, report) = Parse(("T0001", LegacyFixture.Project("P1", "Một", role: "Cố vấn")), ("T0002", LegacyFixture.Project("P1", "Một", role: "")));
        Assert.Equal((1, 1), (report.Counts["research_role_unknown"], report.Counts["research_role_blank"]));
    }

    [Theory]
    [InlineData("550.000.000", 550_000_000)]
    [InlineData("9.999.999.999", 9_999_999_999)]
    [InlineData("1.500", 1500)]
    [InlineData("0", 0)]
    [InlineData("  12 ", 12)]
    public void Funding_drops_the_thousands_dots(string text, long expected) => Assert.Equal((decimal)expected, ResearchParser.Funding(text));

    [Theory]
    [InlineData("")]
    [InlineData("  ")]
    public void Blank_funding_is_null(string text) => Assert.Null(ResearchParser.Funding(text));

    [Theory]
    [InlineData("abc")]
    [InlineData("12x")]
    [InlineData("999.999.999.999.999")]   // beyond numeric(14,0)
    public void Bad_funding_is_null_and_counted(string text)
    {
        var report = new MappingReport();
        Assert.Null(ResearchParser.Funding(text, report));
        Assert.Equal(1, report.Counts["research_bad_funding"]);
    }

    [Theory]
    [InlineData("24/12/2012", "2012-12-24")]
    [InlineData("1/2/2013", "2013-02-01")]
    [InlineData("", null)]
    public void Full_dates_become_iso(string text, string? expected) => Assert.Equal(expected, ResearchParser.AcceptedOn(text));

    [Theory]
    [InlineData("2013", "research_partial_accepted_date")]
    [InlineData("05/2013", "research_partial_accepted_date")]
    [InlineData("31/02/2013", "research_bad_accepted_date")]
    [InlineData("tuần sau", "research_bad_accepted_date")]
    public void Partial_or_invalid_dates_are_dropped_and_counted(string text, string kind)
    {
        var report = new MappingReport();
        Assert.Null(ResearchParser.AcceptedOn(text, report));
        Assert.Equal(1, report.Counts[kind]);
    }

    [Fact]
    public void One_row_per_member_with_the_project_fields_repeated()
    {
        var (rows, report) = Parse(
            ("T0001", LegacyFixture.Project("B2009-18-01", "Đề tài một", role: "Chủ Nhiệm")),
            ("T0002", LegacyFixture.Project("B2009-18-01", "Đề tài một")),
            ("T0003", LegacyFixture.Project("T2010-01", "Đề tài hai", role: "Đồng Chủ Nhiệm", funding: "", accepted: "", result: "")));

        Assert.Equal(3, rows.Count);
        Assert.Equal(new LegacyResearchRow("B2009-18-01", "Đề tài một", "Cấp Trường", "Nghiên cứu cơ bản", 550_000_000m, "04/2009-03/2011", "2012-12-24", "Khá", "T0001", "chu_nhiem"), rows[0]);
        Assert.Equal(("T0002", "thanh_vien"), (rows[1].EmployeeCode, rows[1].Role));
        Assert.Equal(("T2010-01", null, null, null, "dong_chu_nhiem"), (rows[2].Code, rows[2].Funding, rows[2].AcceptedOn, rows[2].Result, rows[2].Role));
        Assert.Empty(report.Counts);
    }

    [Fact]
    public void An_empty_code_gets_a_stable_synthetic_one_and_is_counted_per_project()
    {
        var a = Parse(("T0001", LegacyFixture.Project("", "Đề tài không mã")), ("T0002", LegacyFixture.Project("  ", "Đề tài không mã")), ("T0003", LegacyFixture.Project("", "Đề tài khác")));
        var b = Parse(("T0009", LegacyFixture.Project("", "ĐỀ TÀI KHÔNG MÃ")));

        var codes = a.Rows.Select(r => r.Code).Distinct().ToList();
        Assert.Equal(2, codes.Count);
        Assert.All(codes, c => Assert.StartsWith("V1-", c));
        Assert.Equal(a.Rows[0].Code, a.Rows[1].Code);        // the same project shares one code
        Assert.Equal(a.Rows[0].Code, b.Rows[0].Code);        // stable across runs, case and accents ignored
        Assert.Equal(2, a.Report.Counts["research_code_synthesized"]);
    }

    [Fact]
    public void One_code_with_different_titles_becomes_separate_projects()
    {
        var (rows, report) = Parse(
            ("T0001", LegacyFixture.Project("P1", "Tên một")),
            ("T0002", LegacyFixture.Project("P1", "Tên khác")),
            ("T0003", LegacyFixture.Project("P1", "tên MỘT")),     // the same title as the first one, differently written
            ("T0004", LegacyFixture.Project("P1", "Tên thứ ba")));

        Assert.Equal(["P1", "P1", "P1~2", "P1~3"], rows.Select(r => r.Code));          // grouped by project, members in file order
        Assert.Equal(2, report.Counts["research_code_reused_for_other_title"]);
        Assert.Equal(rows.Count, rows.Select(r => (r.Code, r.EmployeeCode)).Distinct().Count());   // nothing the server would call a duplicate
    }

    [Fact]
    public void A_member_listed_twice_keeps_the_stronger_role()
    {
        var (rows, report) = Parse(
            ("T0001", LegacyFixture.Project("P1", "Một", role: "Thành Viên")),
            ("T0001", LegacyFixture.Project("P1", "Một", role: "Chủ Nhiệm")),
            ("T0001", LegacyFixture.Project("P1", "Một", role: "Thành Viên")));

        var row = Assert.Single(rows);
        Assert.Equal("chu_nhiem", row.Role);
        Assert.Equal(2, report.Counts["research_duplicate_member"]);
    }

    [Fact]
    public void Rows_without_a_title_are_dropped_and_a_project_without_members_keeps_one_memberless_row()
    {
        var noMember = new Dictionary<string, string>(LegacyFixture.Project("P2", "Không thành viên"));
        var json = JsonSerializer.Serialize(new { values = new Dictionary<string, object[]> { [""] = [noMember.ToDictionary(kv => "{" + kv.Key + "}", kv => kv.Value)] } });
        var rows = LegacyFixture.V1Rows(json);
        rows.AddRange(LegacyFixture.V1Rows(LegacyFixture.ResearchFile(("T0001", LegacyFixture.Project("P3", "")))));
        var report = new MappingReport();

        var parsed = ResearchParser.Parse(rows.Select(r => r.Mscb == "" ? new V1Row("", new Dictionary<string, string>(r.Columns) { ["MSCBGV"] = "" }) : r), report);

        var only = Assert.Single(parsed);
        Assert.Equal(("P2", null, "thanh_vien"), (only.Code, only.EmployeeCode, only.Role));
        Assert.Equal((1, 1), (report.Counts["research_no_title"], report.Counts["research_no_member"]));
    }

    [Fact]
    public void Project_fields_that_differ_between_member_rows_are_counted_once_per_project()
    {
        var (rows, report) = Parse(
            ("T0001", LegacyFixture.Project("P1", "Một", funding: "100.000")),
            ("T0002", LegacyFixture.Project("P1", "Một", funding: "200.000")),
            ("T0003", LegacyFixture.Project("P1", "Một", funding: "300.000")));
        Assert.All(rows, r => Assert.Equal(100_000m, r.Funding));   // the first row decides
        Assert.Equal(1, report.Counts["research_project_fields_differ"]);
    }
}

public class PublicationParserTests
{
    [Fact]
    public void A_dblp_like_text_is_split_into_title_venue_and_year()
    {
        var (title, venue, year) = PublicationParser.ParseDetails(
            "An Nguyen, Binh Tran, C. D. Le: DEMO-Net: Enhancing segmentation with dynamic masks for imaging. Comput. Biol. Med. 197: 110952 (2025)");
        Assert.Equal("DEMO-Net: Enhancing segmentation with dynamic masks for imaging", title);
        Assert.Equal("Comput. Biol. Med.", venue);
        Assert.Equal(2025, year);
    }

    [Theory]
    [InlineData("A One: Title of the paper. Journal of Things 12(3): 45-67 (2024)", "Title of the paper", "Journal of Things", 2024)]
    [InlineData("A One, B Two: A question? Some Venue 5: 1-9 (2020)", "A question?", "Some Venue", 2020)]
    [InlineData("A One: Conference paper. CVPR 2019: 1-10", "Conference paper", "CVPR", 2019)]       // year only as the volume
    [InlineData("A One: Dr. J. Smith's method. Venue X (2021)", "Dr. J. Smith's method", "Venue X", 2021)] // initials do not end the title
    [InlineData("A One: A title with no venue (2022)", "A title with no venue", null, 2022)]
    [InlineData("Free text without authors or year", "Free text without authors or year", null, null)]
    public void Edge_cases(string details, string title, string? venue, int? year) =>
        Assert.Equal((title, venue, year), PublicationParser.ParseDetails(details));

    private static (IReadOnlyList<LegacyPublicationRow> Rows, MappingReport Report) Parse(string json)
    {
        var report = new MappingReport();
        return (PublicationParser.Parse(Encoding.UTF8.GetBytes(json), report), report);
    }

    [Fact]
    public void Rows_keep_the_full_details_the_eid_and_the_authors_in_order()
    {
        var (rows, report) = Parse("""
            [ { "Eid": "2-s2.0-1", "Details": "A One, B Two: First paper. Journal X 1: 2-3 (2025)", "Mscb": ["T0002", " T0001 ", "T0002", ""] } ]
            """);
        var row = Assert.Single(rows);
        Assert.Equal((null, "2-s2.0-1", "First paper", "Journal X", 2025, "A One, B Two: First paper. Journal X 1: 2-3 (2025)", null), (row.Doi, row.Eid, row.Title, row.Venue, row.Year, row.Details, row.Url));
        Assert.Equal(["T0002", "T0001"], row.Authors);
        Assert.Empty(report.Counts);
    }

    [Fact]
    public void Duplicates_by_eid_merge_their_authors_and_unusable_entries_are_dropped()
    {
        var (rows, report) = Parse("""
            [
              { "Eid": "e1", "Details": "A: One. V (2020)", "Mscb": ["T0001"] },
              { "Eid": "E1", "Details": "A: One. V (2020)", "Mscb": ["T0002", "T0001"] },
              { "Eid": "e2", "Details": "", "Mscb": ["T0001"] },
              { "Eid": "e3", "Details": "A: Three. V (2020)", "Mscb": [] },
              { "Details": "B: No eid. V (2021)", "Mscb": "T0003" },
              { "Eid": null, "Details": "No venue or year", "Mscb": ["T0004"] }
            ]
            """);
        Assert.Equal(3, rows.Count);
        Assert.Equal(["T0001", "T0002"], rows[0].Authors);
        Assert.Null(rows[1].Eid);
        Assert.Equal(["T0003"], rows[1].Authors);
        Assert.Equal((1, 1, 1, 1, 1), (report.Counts["paper_duplicate_eid"], report.Counts["paper_no_details"], report.Counts["paper_no_authors"], report.Counts["paper_no_venue"], report.Counts["paper_no_year"]));
    }

    [Fact]
    public void Braced_keys_are_tolerated_and_a_non_array_is_an_error()
    {
        var (rows, _) = Parse("""[ { "{Eid}": "e1", "{Details}": "A: T. V (2020)", "{Mscb}": ["T0001"] } ]""");
        Assert.Equal("e1", Assert.Single(rows).Eid);
        Assert.Throws<InvalidOperationException>(() => Parse("{}"));
    }
}

public class UsersReaderTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "sync-tests-" + Guid.NewGuid().ToString("N"));

    public UsersReaderTests() => Directory.CreateDirectory(_dir);

    public void Dispose() { if (Directory.Exists(_dir)) Directory.Delete(_dir, true); }

    private void Write(string name, string json) => File.WriteAllText(Path.Combine(_dir, name), json);

    [Fact]
    public void Users_are_trimmed_deduplicated_and_unusable_ones_counted()
    {
        Write("users.json", """
            [
              { "id": " T0001 ", "name": "Nguyễn Văn A", "emails": ["a@x.test", " A@X.TEST ", "", "a2@x.test"] },
              { "id": "T0002", "name": "Trần B", "emails": [] },
              { "id": "T0001", "name": "Trùng", "emails": ["dup@x.test"] },
              { "id": "", "name": "Không id", "emails": ["n@x.test"] },
              { "id": "T0003_OLD", "name": "Cũ", "emails": ["old@x.test"] }
            ]
            """);
        var report = new MappingReport();

        var users = UsersReader.ReadUsers(_dir, report);

        Assert.Equal(["T0001", "T0003_OLD"], users.Select(u => u.Id));
        Assert.Equal(["a@x.test", "a2@x.test"], users[0].Emails);
        Assert.Equal((1, 1, 1, 1, 1), (report.Counts["email_duplicate_in_user"], report.Counts["email_blank"], report.Counts["user_no_email"], report.Counts["user_duplicate_id"], report.Counts["user_no_id"]));
        var request = UsersReader.ToRequest(users);
        Assert.Equal(("T0001", "Nguyễn Văn A"), (request[0].Code, request[0].Name));
        Assert.Equal(["a@x.test", "a2@x.test"], request[0].Emails);
    }

    [Fact]
    public void Privileged_holders_resolve_by_id_or_email_and_merge_their_permissions()
    {
        Write("users.json", """
            [ { "id": "T0001", "name": "A", "emails": ["a@x.test"] }, { "id": "T0002", "name": "B", "emails": ["b@x.test", "b2@x.test"] }, { "id": "T0003", "name": "C", "emails": ["c@x.test"] } ]
            """);
        Write("privileged.users.json", """
            { "ViewAs": ["T0001", "B2@X.test", "ghost"], "Lookup": ["T0001"], "Statistics": ["b@x.test", "T0009"] }
            """);
        var users = UsersReader.ReadUsers(_dir, new MappingReport());

        var report = UsersReader.ReadPrivileged(_dir, users)!;

        Assert.Equal(["T0001", "T0002"], report.Holders.Select(h => h.Code));
        Assert.Equal(["ViewAs", "Lookup"], report.Holders[0].Permissions);
        Assert.Equal(["ViewAs", "Statistics"], report.Holders[1].Permissions);   // once by email in ViewAs, once by another email in Statistics
        Assert.Equal(["ghost", "T0009"], report.Unresolved.Select(u => u.Value));
        Assert.Equal((3, 1, 2), (report.Permissions["ViewAs"], report.Permissions["Lookup"], report.Permissions["Statistics"]));
    }

    [Fact]
    public void Missing_privileged_file_is_null_and_missing_users_file_is_an_error()
    {
        Assert.Null(UsersReader.ReadPrivileged(_dir, []));
        Assert.Throws<FileNotFoundException>(() => UsersReader.ReadUsers(_dir, new MappingReport()));
    }

    [Fact]
    public void Config_dir_is_the_config_folder_or_the_path_itself()
    {
        Assert.Equal(_dir, UsersReader.ResolveConfigDir(_dir));
        Directory.CreateDirectory(Path.Combine(_dir, "config"));
        Assert.Equal(Path.Combine(_dir, "config"), UsersReader.ResolveConfigDir(_dir));
    }
}
