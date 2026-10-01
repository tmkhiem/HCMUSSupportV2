using System.Text;
using System.Text.Json;
using HCMUSSupportV2.Sync.Contracts;
using HCMUSSupportV2.Sync.Sources;

namespace HCMUSSupportV2.Sync.Tests;

/// <summary>Builds synthetic v1 envelopes: <c>{header, template, datestr, category, values: {MSCB: [ {"{Col}": "str"} ]}}</c>. No real data.</summary>
internal static class V1Fixture
{
    public static string Envelope(string category, params (string Mscb, Dictionary<string, string>[] Rows)[] employees)
    {
        var values = employees.ToDictionary(
            e => e.Mscb,
            e => e.Rows.Select(r => r.ToDictionary(kv => "{" + kv.Key + "}", kv => kv.Value)).ToArray());
        return JsonSerializer.Serialize(new { header = "h {x}", template = "<p>{x}</p>", datestr = "yyyy-MM-dd", category, values });
    }

    public static V1Category Category(string name, params (string Mscb, Dictionary<string, string>[] Rows)[] employees)
    {
        var rows = new List<V1Row>();
        V1Reader.ParseChunk(Encoding.UTF8.GetBytes(Envelope(name, employees)), rows);
        return new V1Category(name, rows);
    }

    public static Dictionary<string, string> Row(params (string K, string V)[] cols) => cols.ToDictionary(c => c.K, c => c.V);
}

public class DateTextTests
{
    [Theory]
    [InlineData("25/12/2020", "2020-12-25")]
    [InlineData("5/3/2019", "2019-03-05")]
    [InlineData("05/2013", "2013-05")]
    [InlineData("5/2013", "2013-05")]
    [InlineData("2012", "2012")]
    [InlineData("2020-02-29", "2020-02-29")]
    [InlineData("2020-02-29T00:00:00", "2020-02-29")]
    [InlineData("  01/01/2000  ", "2000-01-01")]
    public void Normalizes_with_precision(string input, string expected)
    {
        var r = DateText.Normalize(input);
        Assert.True(r.Ok);
        Assert.Equal(expected, r.Value);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Blank_is_null_and_ok(string? input)
    {
        var r = DateText.Normalize(input);
        Assert.True(r.Ok);
        Assert.Null(r.Value);
    }

    [Theory]
    [InlineData("31/02/2020")]
    [InlineData("13/2020")]
    [InlineData("9")]
    [InlineData("99999")]
    [InlineData("abc")]
    [InlineData("1/1/20")]
    public void Garbage_is_flagged_and_passed_through(string input)
    {
        var r = DateText.Normalize(input);
        Assert.False(r.Ok);
        Assert.Equal(input, r.Value);
    }

    [Theory]
    [InlineData("14", "7", "1985", "1985-07-14", true)]
    [InlineData("", "7", "1985", "1985-07", true)]
    [InlineData("  ", "  ", "1985", "1985", true)]
    [InlineData("", "", "", null, true)]
    [InlineData("31", "2", "1985", "1985-02", false)]
    [InlineData("1", "13", "1985", "1985", false)]
    public void Birth_date_parts(string d, string m, string y, string? expected, bool ok)
    {
        var r = DateText.FromParts(d, m, y);
        Assert.Equal(ok, r.Ok);
        Assert.Equal(expected, r.Value);
    }
}

public class V1ReaderTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "sync-tests-" + Guid.NewGuid().ToString("N"));

    public void Dispose() { if (Directory.Exists(_dir)) Directory.Delete(_dir, true); }

    private void WriteChunk(string category, int n, string json)
    {
        var d = Path.Combine(_dir, "notifications", category);
        Directory.CreateDirectory(d);
        File.WriteAllText(Path.Combine(d, $"{category}-{n}.json"), json);
    }

    [Fact]
    public void Strips_braces_trims_padding_and_merges_chunks_in_numeric_order()
    {
        // chunk 10 must come after chunk 2 (numeric, not lexical, order); the same MSCB spans two chunks.
        WriteChunk("position", 10, V1Fixture.Envelope("position", ("T2", [V1Fixture.Row(("TenChucVu", "Z"))])));
        WriteChunk("position", 2, V1Fixture.Envelope("position", ("T1", [V1Fixture.Row(("TenChucVu", "  A      "))]), ("T2", [V1Fixture.Row(("TenChucVu", "B"))])));
        WriteChunk("position", 0, V1Fixture.Envelope("position", ("T1", [V1Fixture.Row(("TenChucVu", "first"))])));

        var cat = V1Reader.ReadCategory(V1Reader.ResolveNotificationsDir(_dir), "position");

        Assert.Equal(["first", "A", "B", "Z"], cat.Rows.Select(r => r.Get("TenChucVu")));
        Assert.Equal(2, cat.ByMscb()["T1"].Count());
        Assert.Equal(2, cat.ByMscb()["T2"].Count());
        Assert.Equal("", cat.Rows[0].Get("DoesNotExist"));
    }

    [Fact]
    public void Missing_category_is_empty()
    {
        Directory.CreateDirectory(Path.Combine(_dir, "notifications"));
        Assert.Empty(V1Reader.ReadCategory(Path.Combine(_dir, "notifications"), "innovation").Rows);
    }

    [Fact]
    public void Accepts_the_notifications_dir_itself()
    {
        WriteChunk("title", 0, V1Fixture.Envelope("title", ("T1", [V1Fixture.Row(("LyDo", "x"))])));
        var viaRoot = V1Reader.ResolveNotificationsDir(_dir);
        var viaDir = V1Reader.ResolveNotificationsDir(Path.Combine(_dir, "notifications"));
        Assert.Equal(viaRoot, viaDir);
    }
}

public class LegacyMapperTests
{
    private static (LegacyMapper Mapper, MappingReport Report) New()
    {
        var rep = new MappingReport();
        return (new LegacyMapper(rep), rep);
    }


    [Fact]
    public void Award_and_title_split_into_kinds_with_distinct_ids()
    {
        var (m, _) = New();
        var awards = V1Fixture.Category("award", ("T1", [V1Fixture.Row(("Ngay", "01/09/2021"), ("SoQuyetDinh", "QD1"), ("LyDo", "Bang khen"), ("MaNhanSu", "T1"))]));
        var titles = V1Fixture.Category("title", ("T1", [V1Fixture.Row(("Ngay", "01/09/2021"), ("SoQuyetDinh", "QD1"), ("LyDo", "Bang khen"), ("MaNhanSu", "T1"))]));

        var rows = m.Commendations(awards, titles);

        Assert.Equal(2, rows.Count);
        Assert.Equal("award", rows[0].Kind);
        Assert.Equal("title", rows[1].Kind);
        Assert.NotEqual(rows[0].HrmId, rows[1].HrmId);
        Assert.All(rows, r => Assert.Equal("2021-09-01", r.DecidedOn));
        Assert.All(rows, r => Assert.Equal("T1", r.EmployeeCode));
    }

    [Fact]
    public void Ids_are_deterministic_unique_and_in_the_synthetic_range()
    {
        var row = V1Fixture.Row(("MA", "T1"), ("TenChucVu", "Truong khoa"), ("HSCV", "0.5"), ("MoTa", "Khoa X"));
        var cat = V1Fixture.Category("position", ("T1", [row, row]), ("T2", [row]));

        var a = New().Mapper.Positions(cat);
        var b = New().Mapper.Positions(cat);

        Assert.Equal(a.Select(r => r.HrmId), b.Select(r => r.HrmId));
        Assert.Equal(3, a.Select(r => r.HrmId).Distinct().Count()); // identical rows still get distinct ids
        Assert.All(a, r => Assert.InRange(r.HrmId, IdSynthesizer.Base, int.MaxValue - 1));
    }

    [Fact]
    public void Changing_a_row_changes_its_id_but_not_its_neighbours()
    {
        string Id(string title, string mscb = "T1") => New().Mapper.Positions(V1Fixture.Category("position", (mscb, [V1Fixture.Row(("TenChucVu", title))]))).Single().HrmId.ToString();
        Assert.Equal(Id("A"), Id("A"));
        Assert.NotEqual(Id("A"), Id("B"));
        Assert.NotEqual(Id("A"), Id("A", "T2"));
    }

    [Fact]
    public void Synthesizer_resolves_collisions_by_probing()
    {
        var ids = new IdSynthesizer("x");
        var set = new HashSet<int>();
        for (var i = 0; i < 50_000; i++) Assert.True(set.Add(ids.Next("k" + i, "c")));
    }

    [Fact]
    public void Dates_keep_precision_and_bad_ones_are_reported()
    {
        var (m, rep) = New();
        var cat = V1Fixture.Category("academic-progress", ("T1", [
            V1Fixture.Row(("MA", "T1"), ("NgayNhapHoc", "2012"), ("NgayTotNghiep", "07/2016"), ("TenLoaiBangCap", "Cu nhan")),
            V1Fixture.Row(("MA", "T1"), ("NgayNhapHoc", "1/9/2016"), ("NgayTotNghiep", "31/02/2020"), ("TenLoaiBangCap", "Thac si")),
            V1Fixture.Row(("MA", "T1"), ("NgayNhapHoc", ""), ("NgayTotNghiep", ""), ("TenLoaiBangCap", "Tien si")),
        ]));

        var rows = m.Degrees(cat);

        Assert.Equal(("2012", "2016-07"), (rows[0].EnrolledOn, rows[0].GraduatedOn));
        Assert.Equal("2016-09-01", rows[1].EnrolledOn);
        Assert.Equal("31/02/2020", rows[1].GraduatedOn); // passed through so the API reports bad_date
        Assert.Equal((null, null), (rows[2].EnrolledOn, rows[2].GraduatedOn));
        Assert.Equal(1, rep.Counts["bad_date:graduatedOn"]);
    }

    [Fact]
    public void Employees_profiles_and_org_units_join_general_and_detailed_by_position_within_mscb()
    {
        var general = V1Fixture.Category("general-profile",
            ("T1", [V1Fixture.Row(("MA", "T1"), ("HODEM", "Nguyen Van"), ("TEN", "A"), ("NGAYSINH", "14"), ("THANGSINH", "7"), ("NAMSINH", "1985"),
                ("TENGIOITINH", "Nam"), ("SOCMND", "000000000001"), ("NGAYCAP", "2/3/2015"), ("DIDONG", "0900000001"), ("TenTinhThanhPho", "TP A"))]),
            ("DUP", [V1Fixture.Row(("MA", "DUP"), ("HODEM", "Le"), ("TEN", "B"), ("NAMSINH", "1990")),
                     V1Fixture.Row(("MA", "DUP"), ("HODEM", "Tran"), ("TEN", "C"), ("THANGSINH", "5"), ("NAMSINH", "1991"))]));
        var detailed = V1Fixture.Category("detailed-profile",
            ("T1", [V1Fixture.Row(("MA", "T1"), ("TenDonVi", "Khoa Thu"), ("TenPhongBan", "Bo mon Thu"), ("TenChucVu", "Truong bo mon"), ("TenHocHam", "PGS"),
                ("TenHocVi", "Tien si"), ("DANGVIENTEXT", "Dang vien"), ("NGAYVAODANG", "19/05/2010"), ("HeSoLuong", "4.65"), ("BacCongChuc", "3"),
                ("Ngach_CongChuc", "V.07.01.03"), ("MST", "8000000001"))]),
            ("DUP", [V1Fixture.Row(("MA", "DUP"), ("TenDonVi", "Khoa Thu")), V1Fixture.Row(("MA", "DUP"), ("TenDonVi", "Phong Mau"))]));
        var (m, rep) = New();

        var units = m.OrgUnits(detailed);
        var emps = m.Employees(general, detailed);
        var profiles = m.Profiles(general, detailed);

        Assert.Equal(3, units.Count); // units "Khoa Thu", "Phong Mau" + department "Bo mon Thu"
        var khoa = units.Single(u => u is { Kind: "unit", Name: "Khoa Thu" });
        var bm = units.Single(u => u.Kind == "department");
        Assert.Equal(khoa.HrmId, bm.ParentHrmId);
        Assert.Null(khoa.ParentHrmId);

        Assert.Equal(3, emps.Count); // duplicates are sent as is; the server quarantines them
        var t1 = emps.Single(e => e.Code == "T1");
        Assert.Equal("Nguyen Van A", t1.FullName);
        Assert.Equal(khoa.HrmId, t1.OrgUnitHrmId);
        Assert.Equal(bm.HrmId, t1.DepartmentHrmId);
        Assert.Equal(("Truong bo mon", "PGS", "Tien si", "active"), (t1.PositionTitle, t1.AcademicRank, t1.Degree, t1.Status));
        var dups = emps.Where(e => e.Code == "DUP").ToList();
        Assert.Equal(khoa.HrmId, dups[0].OrgUnitHrmId);
        Assert.Equal(units.Single(u => u.Name == "Phong Mau").HrmId, dups[1].OrgUnitHrmId);
        Assert.Equal("Tran C", dups[1].FullName);

        var p = profiles.Single(x => x.EmployeeCode == "T1");
        Assert.Equal("1985-07-14", p.DateOfBirth);
        Assert.Equal(("V.07.01.03", 3, 4.65m), (p.SalaryGradeCode, p.SalaryStep, p.SalaryCoefficient));
        Assert.True(p.IsPartyMember);
        Assert.Equal("2010-05-19", p.PartyJoinedOn);
        Assert.False(p.IsYouthUnionMember);
        Assert.Equal("TP A", p.PermanentProvince);
        Assert.Equal("2015-03-02", p.Sensitive!.NationalIdIssuedOn);
        Assert.Equal("8000000001", p.Sensitive.TaxCode);
        Assert.Equal(("1990", "1991-05"), (profiles.Where(x => x.EmployeeCode == "DUP").First().DateOfBirth, profiles.Where(x => x.EmployeeCode == "DUP").Last().DateOfBirth));
        Assert.Null(profiles.First(x => x.EmployeeCode == "DUP").Sensitive); // nothing sensitive present
        Assert.False(rep.Counts.ContainsKey("bad_date:dateOfBirth"));
    }

    [Fact]
    public void Business_trip_purpose_innovation_split_and_required_fields()
    {
        var (m, rep) = New();
        var trips = m.BusinessTrips(V1Fixture.Category("business-mission", ("T1", [V1Fixture.Row(("MaNhanSu", "T1"), ("TuNgay", "01/10/2022"),
            ("DenNgay", "05/10/2022"), ("NoiLamViec", "Ha Noi"), ("DiCongTacTheo", "Thu moi"), ("Ngay", "20/09/2022"), ("Cua", "Truong X"),
            ("SoQuyetDinh1", "QD9"), ("NgayQuyetDinh1", "21/09/2022"), ("PhuongTienDiLai", "May bay"))])));
        Assert.Equal("Thu moi ngày 20/09/2022 của Truong X", trips.Single().Purpose);
        Assert.Equal("2022-10-05", trips.Single().ToOn);

        var inno = m.Innovations(V1Fixture.Category("innovation", ("T1", [
            V1Fixture.Row(("ma", "T1"), ("ma_sk", "SK-01"), ("mo_ta", "Cai tien X"), ("TenLoaiSangKien", "Cap truong"), ("ngay", "2/2/2020")),
            V1Fixture.Row(("ma", "T1"), ("ma_sk", "SK-02"), ("mo_ta", ""), ("ngay", "")),
            V1Fixture.Row(("ma", "T1"), ("ma_sk", ""), ("mo_ta", ""), ("ngay", "")),
        ])));
        Assert.Equal(2, inno.Count);
        Assert.Equal(("SK-01", "Cai tien X", "2020-02-02"), (inno[0].Code, inno[0].Title, inno[0].RecognizedOn));
        Assert.Equal("SK-02", inno[1].Title); // falls back to the code when the description is empty
        Assert.Equal(1, rep.Counts["innovation_empty_title"]);

        var tr = m.Trainings(V1Fixture.Category("training-progress", ("T1", [V1Fixture.Row(("MA", "T1"), ("NoiDung", ""))])));
        Assert.Empty(tr);
        Assert.Equal(1, rep.Counts["training_empty_content"]);
    }

    [Fact]
    public void Salary_maps_columns_and_partial_dates()
    {
        var (m, _) = New();
        var rows = m.Salary(V1Fixture.Category("salary-progress", ("T1", [V1Fixture.Row(("MaNhanSu", "T1"), ("SoQuyetDinh", "QD1"), ("NgayKy", "01/12/2024"),
            ("Ngach_CongChuc", "V.07.01.03"), ("BacCongChuc", "3"), ("HeSoLuong", "4.65"), ("NgayHuong", "01/2025"), ("HeSoVuotKhung", "0.00"),
            ("MocNangLuongTT", "2028"), ("GhiChu", ""))])));
        var s = rows.Single();
        Assert.Equal(("V.07.01.03", 3, 4.65m, 0.00m), (s.GradeCode, s.Step, s.Coefficient, s.OverGradePct));
        Assert.Equal(("2024-12-01", "2025-01", "2028"), (s.SignedOn, s.EffectiveFrom, s.NextRaiseOn));
        Assert.Null(s.Note);
    }

    [Fact]
    public void Legacy_source_reads_a_directory_end_to_end()
    {
        var root = Path.Combine(Path.GetTempPath(), "sync-e2e-" + Guid.NewGuid().ToString("N"));
        try
        {
            var d = Path.Combine(root, "notifications", "position");
            Directory.CreateDirectory(d);
            File.WriteAllText(Path.Combine(d, "position-0.json"), V1Fixture.Envelope("position", ("T1", [V1Fixture.Row(("MA", "T1"), ("TenChucVu", "GV"))])));
            var src = new LegacyGitSource(root);
            var rows = src.ReadAsync(Datasets.Positions, CancellationToken.None).Result;
            Assert.IsType<PositionRow>(Assert.Single(rows));
            Assert.Empty(src.ReadAsync(Datasets.Innovations, CancellationToken.None).Result); // absent category is empty
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
    }
}
