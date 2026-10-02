using System.Text.Json;
using HCMUSSupportV2.Sync.Migration;

namespace HCMUSSupportV2.Sync.Tests;

/// <summary>D15: the legacy-migrate command. Synthetic fixtures only (no real data, no network).</summary>
public class LegacyMigrationTests
{
    private static JsonElement Root(string json) => JsonDocument.Parse(json).RootElement.Clone();

    private static string TeachingFile(string header, params (string Mscb, string[][] Rows)[] people)
    {
        var values = people.ToDictionary(p => p.Mscb, p => new[]
        {
            new Dictionary<string, string> { ["{rows}"] = string.Concat(p.Rows.Select(r => "<tr>" + string.Concat(r.Select(c => $"<td>{c}</td>")) + "</tr>")) },
        });
        return JsonSerializer.Serialize(new { header, datestr = "2024-01-01", template = "<table>{rows}</table>", category = "teaching-stats", values });
    }

    private static string[] Row(string course, string cls, string program, string hours) => [course, cls, program, hours];

    [Fact]
    public void Teaching_year_comes_from_the_header()
    {
        Assert.Equal("2020-2021", TeachingParser.AcademicYearOf("Thông tin giảng dạy trong năm học 2020-2021 tại Trường"));
        Assert.Equal("2023-2024", TeachingParser.AcademicYearOf("Thông tin giảng dạy trong năm học 2023-2024 tại Trường (cập nhật đến 31/10/2024)"));
        Assert.Null(TeachingParser.AcademicYearOf("không có năm"));
        Assert.Null(TeachingParser.AcademicYearOf("năm học 2020-2023"));
    }

    [Fact]
    public void Teaching_old_years_put_the_activity_in_the_parentheses()
    {
        var r = TeachingParser.Parse(Root(TeachingFile("Giảng dạy năm học 2021-2022",
            ("T1", [Row("CSC10004-Cấu trúc dữ liệu", "21CLC1", "Đại học (LYTHUYET), HK1", "45.5"),
                    Row("Môn không mã", "", "Đại học, HK3", "3,25"),
                    Row("CSC20001-Chuyên đề", "CH2021", "Cao học, Học phần 4", "30"),
                    Row("CSC30001-Seminar", "TS1", "Tiến sĩ, CĐTS", "15"),
                    Row("CSC30002-Học phần TS", "TS1", "Tiến sĩ, HPTS", "10")]))));
        Assert.Equal("2021-2022", r.AcademicYear);
        Assert.Equal(5, r.Rows.Count);
        Assert.Equal(new TeachingRowOut("T1", "2021-2022", "dai_hoc", 1, null, "CSC10004", "Cấu trúc dữ liệu", "21CLC1", null, "LYTHUYET", 0, 45.5m), r.Rows[0]);
        Assert.Equal(new TeachingRowOut("T1", "2021-2022", "dai_hoc", 3, null, null, "Môn không mã", null, null, null, 0, 3.25m), r.Rows[1]);
        Assert.Equal(("cao_hoc", (int?)null, "Học phần 4"), (r.Rows[2].Program, r.Rows[2].Term, r.Rows[2].Module));
        Assert.Equal(("tien_si", "CĐTS"), (r.Rows[3].Program, r.Rows[3].Module));
        Assert.Equal(("tien_si", "HPTS"), (r.Rows[4].Program, r.Rows[4].Module));
        Assert.Empty(r.UnparsedPatterns);
    }

    [Fact]
    public void Teaching_2022_2023_postgraduate_labels_and_underscored_activities()
    {
        var r = TeachingParser.Parse(Root(TeachingFile("năm học 2022-2023",
            ("T1", [Row("A-1", "x", "Học phần cao học", "10"),
                    Row("CSC10001", "x", "Chuyên đề tiến sĩ", "5"),
                    Row("CSC2", "x", "Học phần tiến sĩ (Vật lý địa cầu)", "5"),
                    Row("CSC3", "x", "Đại học (HD_KLTN_UV), HK1", "2")]))));
        Assert.Equal([("cao_hoc", (string?)null), ("tien_si", "CĐTS"), ("tien_si", "Vật lý địa cầu"), ("dai_hoc", null)], r.Rows.Select(x => (x.Program, x.Module)).ToArray());
        Assert.Equal("HD_KLTN_UV", r.Rows[3].Activity);
    }

    [Fact]
    public void Teaching_2023_2024_parentheses_hold_the_track_and_postgraduate_hides_in_the_undergraduate_label()
    {
        var r = TeachingParser.Parse(Root(TeachingFile("năm học 2023-2024",
            ("T1", [Row("CSC10001-Một", "23CLC", "Đại học (CLC), HK3", "10"),
                    Row("CSC10001-Một", "23", "Đại học (None), HK1", "10"),
                    Row("PHY1-Cao học", "CH", "Đại học (CH), HKHP3", "6"),
                    Row("PHY2-Cao học", "CH", "Đại học (CH), HKNone", "6"),
                    Row("PHY3-TS", "TS", "Đại học (HPTS), HKNone", "4"),
                    Row("PHY4-TS", "TS", "Đại học (CDTS), HKNone", "4"),
                    Row("PHY5-Lạ", "TS", "Đại học (XYZ), HK9", "4")]))));
        Assert.Equal("CLC", r.Rows[0].Track);
        Assert.Null(r.Rows[0].Activity);
        Assert.Null(r.Rows[1].Track);
        Assert.Equal(("cao_hoc", "Học phần 3", (int?)null), (r.Rows[2].Program, r.Rows[2].Module, r.Rows[2].Term));
        Assert.Equal(("cao_hoc", (string?)null), (r.Rows[3].Program, r.Rows[3].Module));
        Assert.Equal(("tien_si", "HPTS"), (r.Rows[4].Program, r.Rows[4].Module));
        Assert.Equal(("tien_si", "CĐTS"), (r.Rows[5].Program, r.Rows[5].Module));
        Assert.Equal(6, r.Rows.Count);
        Assert.Equal(1, r.UnparsedPatterns["Đại học (XYZ), HK9"]);
    }

    [Fact]
    public void Teaching_cleans_entities_and_multiline_cells_and_counts_bad_rows()
    {
        var r = TeachingParser.Parse(Root(TeachingFile("năm học 2019-2020",
            ("T1", [Row("CSC10001-A&amp;B&nbsp;C", "", "Học phần Cao học (Khoa học môi trường\n)", "12.123456"),
                    Row("CSC20002-B", "", "Đại học (THUCHANH), HK1", "abc"),
                    ["only", "three", "cells"]]))));
        var row = Assert.Single(r.Rows);
        Assert.Equal("A&B C", row.CourseName);
        Assert.Equal(("cao_hoc", "Khoa học môi trường"), (row.Program, row.Module));
        Assert.Equal(12.12m, row.StandardHours);
        Assert.Equal(1, r.BadHours);
        Assert.Equal(1, r.UnparsedPatterns["row without 4 cells"]);
        Assert.Equal(3, r.TableRows);
    }

    [Fact]
    public void Teaching_keeps_repeated_rows()
    {
        var one = Row("CSC10001-A", "L1", "Đại học (THUCHANH), HK1", "5");
        var r = TeachingParser.Parse(Root(TeachingFile("năm học 2020-2021", ("T1", [one, one, one]))));
        Assert.Equal(3, r.Rows.Count);
    }

    [Fact]
    public void Teaching_skips_rows_listed_under_an_empty_mscb()
    {
        var one = Row("CSC10001-A", "L", "Đại học (CQ), HK1", "5");
        var r = TeachingParser.Parse(Root(TeachingFile("năm học 2023-2024", ("T1", [one]), ("", [one, one]))));
        Assert.Single(r.Rows);
        Assert.Equal(2, r.MissingMscb);
    }

    // ------------------------------------------------------------------ research and papers

    private static string ResearchFile(params Dictionary<string, string>[] rows) =>
        JsonSerializer.Serialize(new { header = "{ten_de_tai}", template = "x", datestr = "2024-01-01", category = "research-stats",
            values = rows.GroupBy(r => r["{MSCBGV}"]).ToDictionary(g => g.Key, g => g.ToArray()) });

    private static Dictionary<string, string> Project(string mscb, string role, string code = "T2022-01", string funding = "50.000.000", string accepted = "04/05/2023") => new()
    {
        ["{MSCBGV}"] = mscb, ["{ten_de_tai}"] = "Đề tài " + code, ["{kinh_phi}"] = funding, ["{ma_so}"] = code, ["{tu_cach_tham_gia}"] = role,
        ["{thoi_gian_thuc_hien}"] = "2022-2023", ["{TenCapDeTai}"] = "Cấp Trường", ["{TenLoaiHinhNC}"] = "Nghiên cứu cơ bản",
        ["{NgayNghiemThu}"] = accepted, ["{TenKetQuaDT}"] = "Tốt",
    };

    [Fact]
    public void Research_maps_roles_funding_and_dates()
    {
        var r = ResearchParser.Parse(Root(ResearchFile(
            Project("T1", "Chủ Nhiệm"),
            Project("T2", "Đồng Chủ Nhiệm", funding: "1.250.000.000", accepted: "2023"),
            Project("T3", "Thành Viên", funding: "", accepted: "05/2023"),
            Project("T4", "Cố vấn", funding: "12 triệu", accepted: ""))));
        Assert.Equal(["chu_nhiem", "chu_nhiem", "thanh_vien", "thanh_vien"], r.Rows.Select(x => x.Role).ToArray());
        Assert.Equal([50_000_000m, 1_250_000_000m, null, null], r.Rows.Select(x => x.Funding).ToArray());
        Assert.Equal(["2023-05-04", "2023-01-01", "2023-05-01", null], r.Rows.Select(x => x.AcceptedOn).ToArray());
        Assert.Equal(2, r.PartialAcceptedDates);
        Assert.Equal(1, r.UnknownRoles);
        Assert.Equal(1, r.BadFunding);
        Assert.Equal(("T2022-01", "Cấp Trường", "Nghiên cứu cơ bản", "2022-2023", "Tốt"), (r.Rows[0].Code, r.Rows[0].Level, r.Rows[0].Type, r.Rows[0].Period, r.Rows[0].Result));
    }

    [Fact]
    public void Papers_split_the_citation_into_title_venue_and_year()
    {
        var list = PapersParser.Parse(Root("""
            [{"Eid":"2-s2.0-X","Details":"A B, C D: DYNAFormer: Enhancing segmentation. Comput. Biol. Medicine 197: 110952 (2025)","Mscb":["T1","T2"]},
             {"Eid":"","Details":"Chỉ có một câu không đúng mẫu","Mscb":["T3"]}]
            """));
        Assert.Equal(2, list.Count);
        Assert.Equal("2-s2.0-X", list[0].Eid);
        Assert.Equal("DYNAFormer: Enhancing segmentation", list[0].Title);
        Assert.Equal("Comput. Biol. Medicine 197: 110952", list[0].Venue);
        Assert.Equal(2025, list[0].Year);
        Assert.Equal(["T1", "T2"], list[0].Authors);
        Assert.Contains("(2025)", list[0].Details);
        Assert.Null(list[1].Eid);
        Assert.Equal("Chỉ có một câu không đúng mẫu", list[1].Title);
        Assert.Null(list[1].Year);
    }

    // ------------------------------------------------------------------ arguments

    [Fact]
    public void Admin_identity_needs_an_email_and_an_mscb()
    {
        Assert.Equal(new AdminIdentity("a@b.vn", "0900"), AdminIdentity.TryParse("a@b.vn:0900"));
        Assert.Equal(new AdminIdentity("a@b.vn", "0900"), AdminIdentity.TryParse(" a@b.vn : 0900 "));
        Assert.Null(AdminIdentity.TryParse("0900"));
        Assert.Null(AdminIdentity.TryParse("a@b.vn:"));
        Assert.Null(AdminIdentity.TryParse("nobody:0900"));
        Assert.Null(AdminIdentity.TryParse(null));
    }

    [Fact]
    public void Steps_parse_in_dependency_order()
    {
        Assert.Equal(LegacyMigrator.AllSteps, LegacyMigrator.ParseSteps(null));
        Assert.Equal(["roster", "teaching"], LegacyMigrator.ParseSteps("teaching,roster"));
        Assert.Throws<ArgumentException>(() => LegacyMigrator.ParseSteps("roster,news"));
    }

    [Fact]
    public void Cli_parses_legacy_migrate()
    {
        var m = Cli.ParseMigrate(["sync", "legacy-migrate", "--path", "D:\\data", "--admin", "a@b.vn:1", "--admin", "c@d.vn:2", "--apply", "--steps", "roster", "--report", "r.json"], TextWriter.Null);
        Assert.NotNull(m);
        Assert.Equal(("D:\\data", "roster", true, "r.json"), (m.Path, m.Steps, m.Apply, m.Report));
        Assert.Equal(["a@b.vn:1", "c@d.vn:2"], m.Admins);
        Assert.Null(Cli.ParseMigrate(["legacy-migrate"], TextWriter.Null));
        Assert.Null(Cli.ParseMigrate(["legacy-migrate", "--path", "x", "--bogus"], TextWriter.Null));
        Assert.Null(Cli.ParseMigrate(["hrm"], TextWriter.Null));
    }

    // ------------------------------------------------------------------ the migrator (fake API)

    private sealed class FakeApi : ILegacyApi
    {
        public List<(string Path, JsonElement Body, bool DryRun)> Calls { get; } = [];
        public Func<string, JsonElement>? Respond { get; set; }

        public Task<JsonElement> PostAsync(string path, object body, bool dryRun, CancellationToken ct)
        {
            var json = JsonSerializer.SerializeToElement(body, IngestClient.Json);
            Calls.Add((path, json, dryRun));
            return Task.FromResult(Respond?.Invoke(path) ?? Root("{}"));
        }
    }

    private static string RosterReply() => """
        {"import":{"dryRun":true,"employees":2,"addedCount":2,"unchangedCount":0,"conflictCount":1,"unknownCount":1,"invalidCount":0,
          "conflicts":[{"row":3,"code":"T2","email":"private@example.test","reason":"owned_by_other","ownerCode":"T1","ownerName":"Họ Tên Riêng"}],
          "unknown":[{"row":4,"code":"T9","emails":["secret@example.test"]}],
          "invalid":[],
          "warnings":[{"row":2,"code":"T1","reason":"name_mismatch","message":"Họ tên trong tệp (\"Tên Riêng Tư\") khác"},
                      {"row":5,"code":"T3","reason":"hrm_conflict","message":"Email private@example.test"}],
          "truncated":false},
         "inputUsers":4,"emptyIdCount":0,"noEmailCount":1,"duplicateIdCount":0,"inactiveCount":0,"inactiveCodes":[]}
        """;

    private static string Dataset(string name, bool applied = false, int bad = 0) =>
        $$"""{"dataset":"{{name}}","dryRun":true,"applied":{{(applied ? "true" : "false")}},"total":3,"newCount":3,"updatedCount":0,"removedCount":0,"unknownMscbs":["T9"],"unknownMscbCount":1,"droppedMemberRows":0,"bad":[],"badCount":{{bad}},"skipped":[],"years":[]}""";

    private static string MakeRepo()
    {
        var dir = Path.Combine(Path.GetTempPath(), "legacy-migration-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.Combine(dir, "config"));
        Directory.CreateDirectory(Path.Combine(dir, "notifications", "teaching-stats"));
        File.WriteAllText(Path.Combine(dir, "config", "users.json"), """
            [{"id":"T1","name":"Họ Tên Riêng","emails":["private@example.test"]},
             {"id":"T2","name":"Tên Riêng Tư","emails":["other@example.test","t2@example.test"]},
             {"id":"T3","name":"Người Ba","emails":["t3@example.test"]}]
            """);
        File.WriteAllText(Path.Combine(dir, "config", "privileged.users.json"), """{"ViewAs":["T1","t2@example.test","ghost@example.test"],"Lookup":["T1"],"Statistics":["T3"]}""");
        File.WriteAllText(Path.Combine(dir, "notifications", "teaching-stats", "teaching-stats-2022-2024.json"),
            TeachingFile("năm học 2023-2024", ("T1", [Row("CSC10001-A", "L", "Đại học (CQ), HK1", "5")])));
        File.WriteAllText(Path.Combine(dir, "notifications", "research-stats.json"), ResearchFile(Project("T1", "Chủ Nhiệm")));
        File.WriteAllText(Path.Combine(dir, "notifications", "paper-details.json"), """[{"Eid":"E1","Details":"A: Title. Venue (2020)","Mscb":["T1"]}]""");
        return dir;
    }

    [Fact]
    public async Task Migrator_dry_run_by_default_prints_counts_and_mscb_only_and_never_grants_other_holders()
    {
        var repo = MakeRepo();
        var api = new FakeApi
        {
            Respond = path => path switch
            {
                "roster-emails" => Root(RosterReply()),
                "roles" => Root("""{"dryRun":true,"results":[{"code":"T1","role":"admin","outcome":"granted","emailMapped":false,"employeeActive":true,"message":null}]}"""),
                "datasets/teaching" => Root(Dataset("teaching")),
                "datasets/research" => Root(Dataset("research")),
                "datasets/publications" => Root(Dataset("publications")),
                _ => Root("{}"),
            },
        };
        var output = new StringWriter();
        var admins = new[] { new AdminIdentity("private@example.test", "T1") };

        var exit = await new LegacyMigrator(api, output).RunAsync(new MigrateOptions(repo, LegacyMigrator.AllSteps, admins, Apply: false, ReportFile: null), default);

        Assert.Equal(0, exit);
        Assert.All(api.Calls, c => Assert.True(c.DryRun));
        Assert.Equal(["roster-emails", "roles", "datasets/teaching", "datasets/research", "datasets/publications"], api.Calls.Select(c => c.Path).ToArray());

        var roles = api.Calls.Single(c => c.Path == "roles").Body;
        var grant = Assert.Single(roles.GetProperty("grants").EnumerateArray().ToList());
        Assert.Equal(("admin", "T1", "private@example.test"), (grant.GetProperty("role").GetString(), grant.GetProperty("code").GetString(), grant.GetProperty("email").GetString()));

        var text = output.ToString();
        Assert.Contains("[roster] users=4", text);
        Assert.Contains("MSCB=T2 reason=owned_by_other owner=T1", text);
        Assert.Contains("MSCB=T9", text);
        Assert.Contains("name_mismatch=1", text);
        Assert.Contains("hrm_conflict", text);
        // v1 holders: T1 (ViewAs, Lookup), T2 (by email), T3 (Statistics); one entry unresolved. T1 is the only one granted.
        Assert.Contains("3 people, 1 entries not found", text);
        Assert.Contains("MSCB=T1 v1=Lookup+ViewAs -> admin (granted above)", text);
        Assert.Contains("MSCB=T2 v1=ViewAs -> decide", text);
        Assert.Contains("MSCB=T3 v1=Statistics -> decide", text);
        // personal data never reaches the output
        foreach (var secret in new[] { "example.test", "Họ Tên Riêng", "Tên Riêng Tư", "Người Ba" }) Assert.DoesNotContain(secret, text);
    }

    [Fact]
    public async Task Migrator_apply_posts_with_dry_run_false_and_the_parsed_rows()
    {
        var repo = MakeRepo();
        var api = new FakeApi { Respond = path => path.StartsWith("datasets/") ? Root(Dataset("x", applied: true)) : Root(RosterReply()) };
        var exit = await new LegacyMigrator(api, new StringWriter()).RunAsync(
            new MigrateOptions(repo, ["teaching", "research", "papers"], [], Apply: true, ReportFile: null), default);
        Assert.Equal(0, exit);
        Assert.All(api.Calls, c => Assert.False(c.DryRun));
        var teaching = api.Calls.Single(c => c.Path == "datasets/teaching").Body.GetProperty("rows");
        Assert.Equal("CSC10001", teaching[0].GetProperty("courseCode").GetString());
        Assert.Equal("CQ", teaching[0].GetProperty("track").GetString());
        var research = api.Calls.Single(c => c.Path == "datasets/research").Body.GetProperty("rows");
        Assert.Equal(("T2022-01", "chu_nhiem", "2023-05-04"), (research[0].GetProperty("code").GetString(), research[0].GetProperty("role").GetString(), research[0].GetProperty("acceptedOn").GetString()));
        var papers = api.Calls.Single(c => c.Path == "datasets/publications").Body.GetProperty("rows");
        Assert.Equal("E1", papers[0].GetProperty("eid").GetString());
        Assert.Equal(2020, papers[0].GetProperty("year").GetInt32());
    }

    [Fact]
    public async Task Migrator_fails_on_bad_rows_and_aborts_when_the_token_is_rejected()
    {
        var repo = MakeRepo();
        var output = new StringWriter();
        var bad = new FakeApi { Respond = _ => Root(Dataset("teaching", bad: 2)) };
        Assert.Equal(1, await new LegacyMigrator(bad, output).RunAsync(new MigrateOptions(repo, ["teaching"], [], false, null), default));

        var denied = new DeniedApi();
        var exit = await new LegacyMigrator(denied, output).RunAsync(new MigrateOptions(repo, LegacyMigrator.AllSteps, [], false, null), default);
        Assert.Equal(1, exit);
        Assert.Equal(1, denied.Calls); // aborted after the first 403
        Assert.Contains("Aborting", output.ToString());
    }

    private sealed class DeniedApi : ILegacyApi
    {
        public int Calls { get; private set; }

        public Task<JsonElement> PostAsync(string path, object body, bool dryRun, CancellationToken ct)
        {
            Calls++;
            throw new LegacyApiException(403, "HTTP 403: forbidden");
        }
    }

    [Fact]
    public async Task Migrator_without_admin_identities_grants_nothing()
    {
        var repo = MakeRepo();
        var api = new FakeApi();
        var output = new StringWriter();
        await new LegacyMigrator(api, output).RunAsync(new MigrateOptions(repo, ["roles"], [], true, null), default);
        Assert.Empty(api.Calls);
        Assert.Contains("nothing is granted", output.ToString());
        Assert.Contains("none is granted by this tool", output.ToString());
    }

    [Fact]
    public async Task Api_client_posts_gzip_json_with_the_api_key_and_the_dry_run_flag()
    {
        HttpRequestMessage? seen = null;
        byte[] body = [];
        var http = new HttpClient(new CapturingHandler((req, bytes) =>
        {
            seen = req;
            body = bytes;
            return new HttpResponseMessage(System.Net.HttpStatusCode.OK) { Content = new StringContent("""{"ok":true}""") };
        })) { BaseAddress = new Uri("https://portal.test/") };
        http.DefaultRequestHeaders.Authorization = new("ApiKey", "tok");

        var result = await new LegacyApi(http).PostAsync("roster-emails", new { users = new[] { new { id = "T1" } } }, dryRun: true, default);

        Assert.True(result.GetProperty("ok").GetBoolean());
        Assert.Equal("https://portal.test/api/integration/v1/legacy/roster-emails?dryRun=true", seen!.RequestUri!.ToString());
        Assert.Equal("ApiKey", seen.Headers.Authorization!.Scheme);
        Assert.Contains("gzip", seen.Content!.Headers.ContentEncoding);
        using var gz = new System.IO.Compression.GZipStream(new MemoryStream(body), System.IO.Compression.CompressionMode.Decompress);
        using var reader = new StreamReader(gz);
        Assert.Equal("""{"users":[{"id":"T1"}]}""", await reader.ReadToEndAsync());
    }

    [Fact]
    public async Task Api_client_turns_an_error_answer_into_an_exception_with_the_status()
    {
        var http = new HttpClient(new CapturingHandler((_, _) => new HttpResponseMessage(System.Net.HttpStatusCode.Forbidden) { Content = new StringContent("""{"title":"Forbidden"}""") }))
        { BaseAddress = new Uri("https://portal.test/") };
        var e = await Assert.ThrowsAsync<LegacyApiException>(() => new LegacyApi(http).PostAsync("roles", new { }, true, default));
        Assert.Equal(403, e.Status);
        Assert.Contains("Forbidden", e.Message);
    }

    private sealed class CapturingHandler(Func<HttpRequestMessage, byte[], HttpResponseMessage> respond) : HttpMessageHandler
    {
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
            respond(request, request.Content is null ? [] : await request.Content.ReadAsByteArrayAsync(ct));
    }
}
