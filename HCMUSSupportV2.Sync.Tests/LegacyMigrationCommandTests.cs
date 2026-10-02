using System.IO.Compression;
using System.Net;
using System.Text;
using System.Text.Json;
using HCMUSSupportV2.Sync.Legacy;

namespace HCMUSSupportV2.Sync.Tests;

/// <summary>A scratch directory tree that is removed afterwards.</summary>
internal sealed class TempTree : IDisposable
{
    public string Root { get; } = Path.Combine(Path.GetTempPath(), "sync-tests-" + Guid.NewGuid().ToString("N"));

    public TempTree() => Directory.CreateDirectory(Root);

    public string Write(string relative, string content)
    {
        var path = Path.Combine(Root, relative);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, content);
        return path;
    }

    public void Dispose() { if (Directory.Exists(Root)) Directory.Delete(Root, true); }
}

public class CliLegacyVerbTests
{
    private static Cli.Options? Parse(params string[] args) => Cli.Parse(["sync", .. args], TextWriter.Null);

    [Fact]
    public void Parses_legacy_datasets_options()
    {
        var o = Parse("legacy-datasets", "--path", "D:\\data", "--datasets", "research,teaching", "--dry-run", "--server-dry-run", "--report", "D:\\out", "--unknown-term", "1")!;
        Assert.Equal(("legacy-datasets", "D:\\data", "research,teaching", true, "D:\\out", true, "1"), (o.Source, o.Path, o.Datasets, o.DryRun, o.ReportDir, o.ServerDryRun, o.UnknownTerm));
        Assert.True(o.IsLegacyMigration);
        Assert.Equal(["teaching", "research"], Contracts.LegacyDatasets.Parse(o.Datasets));      // fixed order, not the order typed
        Assert.Equal(Contracts.LegacyDatasets.All, Contracts.LegacyDatasets.Parse("all"));
        Assert.Throws<ArgumentException>(() => Contracts.LegacyDatasets.Parse("teaching,salary"));
    }

    [Fact]
    public void Parses_legacy_emails_and_keeps_the_old_verbs_working()
    {
        var o = Parse("legacy-emails", "--path", "D:\\data")!;
        Assert.Equal(("legacy-emails", false, false, null), (o.Source, o.DryRun, o.ServerDryRun, o.ReportDir));
        Assert.False(Parse("legacy-git", "--path", "D:\\x", "--dry-run", "--force")!.IsLegacyMigration);
        Assert.False(Parse("hrm")!.IsLegacyMigration);
    }

    [Theory]
    [InlineData("legacy-datasets", "--server-dry-run")]                                  // a plain run cannot be a server dry run
    [InlineData("legacy-datasets", "--force")]
    [InlineData("legacy-emails", "--datasets", "teaching")]
    [InlineData("legacy-emails", "--unknown-term", "1")]
    [InlineData("legacy-git", "--report", "D:\\out")]                                    // migration-only options
    [InlineData("hrm", "--server-dry-run", "--dry-run")]
    [InlineData("legacy-datasets", "--report")]                                          // value missing
    public void Bad_combinations_return_null(params string[] args) => Assert.Null(Parse(args));

    [Fact]
    public void Usage_documents_the_new_verbs()
    {
        Assert.Contains("legacy-emails", Cli.Usage);
        Assert.Contains("legacy-datasets", Cli.Usage);
        Assert.Contains("--server-dry-run", Cli.Usage);
        Assert.Contains("--report", Cli.Usage);
    }

    [Fact]
    public async Task Run_without_path_or_with_a_bad_value_exits_2()
    {
        var err = new StringWriter();
        Assert.Equal(2, await Cli.RunAsync(["sync", "legacy-emails"], new StringWriter(), err));
        Assert.Contains("--path", err.ToString());
        using var tree = new TempTree();
        Assert.Equal(2, await Cli.RunAsync(["sync", "legacy-datasets", "--path", tree.Root, "--datasets", "nope", "--dry-run"], new StringWriter(), new StringWriter()));
        Assert.Equal(2, await Cli.RunAsync(["sync", "legacy-datasets", "--path", tree.Root, "--unknown-term", "9", "--dry-run"], new StringWriter(), new StringWriter()));
        Assert.Equal(2, await Cli.RunAsync(["sync", "legacy-datasets", "--path", Path.Combine(tree.Root, "missing"), "--dry-run"], new StringWriter(), new StringWriter()));
    }

    [Fact]
    public async Task A_report_dir_inside_a_git_work_tree_exits_2_before_anything_is_read()
    {
        using var tree = new TempTree();
        Directory.CreateDirectory(Path.Combine(tree.Root, "repo", ".git"));
        var err = new StringWriter();
        var code = await Cli.RunAsync(["sync", "legacy-emails", "--path", tree.Root, "--dry-run", "--report", Path.Combine(tree.Root, "repo", "out")], new StringWriter(), err);
        Assert.Equal(2, code);
        Assert.Contains("git work tree", err.ToString());
        Assert.False(Directory.Exists(Path.Combine(tree.Root, "repo", "out")));
    }
}

public class ReportDirectoryTests
{
    [Fact]
    public void A_plain_folder_is_accepted_and_created_on_first_write()
    {
        using var tree = new TempTree();
        var dir = ReportDirectory.Resolve(Path.Combine(tree.Root, "reports", "legacy"));
        Assert.False(Directory.Exists(dir.Path));

        var file = dir.Write("legacy-test", new { a = 1 });

        Assert.True(File.Exists(file));
        Assert.StartsWith("legacy-test-", Path.GetFileName(file));
        Assert.EndsWith(".json", file);
        Assert.Equal(1, JsonDocument.Parse(File.ReadAllText(file)).RootElement.GetProperty("a").GetInt32());
    }

    [Fact]
    public void A_json_string_is_written_indented_as_it_is()
    {
        using var tree = new TempTree();
        var file = ReportDirectory.Resolve(tree.Root).Write("r", """{"status":"applied","details":[]}""");
        var text = File.ReadAllText(file);
        Assert.Contains("\n", text);
        Assert.Equal("applied", JsonDocument.Parse(text).RootElement.GetProperty("status").GetString());
    }

    [Fact]
    public void A_directory_inside_or_below_a_git_work_tree_is_refused()
    {
        using var tree = new TempTree();
        Directory.CreateDirectory(Path.Combine(tree.Root, "repo", ".git"));
        var inside = Path.Combine(tree.Root, "repo");
        var below = Path.Combine(tree.Root, "repo", "a", "b", "not-created-yet");

        var ex = Assert.Throws<InvalidOperationException>(() => ReportDirectory.Resolve(inside));
        Assert.Contains("git work tree", ex.Message);
        Assert.Throws<InvalidOperationException>(() => ReportDirectory.Resolve(below));
        Assert.Equal(inside, ReportDirectory.FindGitRoot(below));
    }

    [Fact]
    public void A_dot_git_file_counts_too_as_in_a_linked_worktree()
    {
        using var tree = new TempTree();
        tree.Write(Path.Combine("wt", ".git"), "gitdir: /somewhere/else");
        Assert.Throws<InvalidOperationException>(() => ReportDirectory.Resolve(Path.Combine(tree.Root, "wt", "out")));
    }

    [Fact]
    public void A_relative_path_is_resolved_before_checking()
    {
        // The test process runs from a build output folder; whether that is inside a work tree decides the outcome, but it must
        // never be a silent pass: either it resolves to a full path outside any work tree, or it is refused.
        try { Assert.True(Path.IsPathRooted(ReportDirectory.Resolve("reports-relative").Path)); }
        catch (InvalidOperationException) { }
    }

    [Fact]
    public void The_default_is_under_the_local_app_data_folder()
    {
        Assert.EndsWith(Path.Combine("HCMUSSupportV2", "legacy"), ReportDirectory.DefaultPath);
    }
}

public class IngestClientJsonPostTests
{
    private sealed class Handler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        public List<(HttpRequestMessage Request, byte[] Body)> Calls { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Calls.Add((request, request.Content is null ? [] : await request.Content.ReadAsByteArrayAsync(ct)));
            return respond(request);
        }
    }

    private static IngestClient Client(Handler h)
    {
        var http = new HttpClient(h) { BaseAddress = new Uri("http://api.test/") };
        http.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("ApiKey", "tok");
        return new IngestClient(http);
    }

    private static string Gunzip(byte[] body)
    {
        using var gz = new GZipStream(new MemoryStream(body), CompressionMode.Decompress);
        using var sr = new StreamReader(gz, Encoding.UTF8);
        return sr.ReadToEnd();
    }

    [Theory]
    [InlineData(false, "")]
    [InlineData(true, "?dryRun=true")]
    public async Task Posts_gzip_json_with_the_api_key_and_the_dry_run_flag_only_when_asked(bool serverDryRun, string query)
    {
        var h = new Handler(_ => new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("""{"status":"applied"}""") });
        using var client = Client(h);

        var o = await client.PostJsonAsync("api/integration/v1/legacy/datasets/teaching", new { rows = new[] { new { employeeCode = "T0001" } } }, serverDryRun, CancellationToken.None);

        Assert.True(o.Success);
        Assert.Equal("""{"status":"applied"}""", o.Body);
        var (req, body) = Assert.Single(h.Calls);
        Assert.Equal("/api/integration/v1/legacy/datasets/teaching", req.RequestUri!.AbsolutePath);
        Assert.Equal(query, req.RequestUri.Query);
        Assert.Equal(("ApiKey", "tok"), (req.Headers.Authorization!.Scheme, req.Headers.Authorization.Parameter));
        Assert.Contains("gzip", req.Content!.Headers.ContentEncoding);
        Assert.Equal("application/json", req.Content.Headers.ContentType!.MediaType);
        Assert.Equal("T0001", JsonDocument.Parse(Gunzip(body)).RootElement.GetProperty("rows")[0].GetProperty("employeeCode").GetString());
    }

    [Fact]
    public async Task Errors_carry_the_problem_detail_and_never_a_body()
    {
        var h = new Handler(_ => new HttpResponseMessage(HttpStatusCode.Forbidden) { Content = new StringContent("""{"title":"Forbidden","detail":"missing scope"}""") });
        using var client = Client(h);
        var o = await client.PostJsonAsync("/api/integration/v1/legacy/emails", new { users = Array.Empty<object>() }, false, CancellationToken.None);
        Assert.False(o.Success);
        Assert.Equal(403, o.StatusCode);
        Assert.Null(o.Body);
        Assert.Contains("missing scope", o.Error);
        Assert.Equal("/api/integration/v1/legacy/emails", h.Calls[0].Request.RequestUri!.AbsolutePath);   // a leading slash is fine
    }

    [Fact]
    public async Task A_network_failure_is_status_0()
    {
        var h = new Handler(_ => throw new HttpRequestException("connection refused"));
        using var client = Client(h);
        var o = await client.PostJsonAsync("api/x", new { }, false, CancellationToken.None);
        Assert.False(o.Success);
        Assert.Equal(0, o.StatusCode);
    }
}

public class LegacyCommandsTests : IDisposable
{
    private readonly TempTree _tree = new();

    public void Dispose() => _tree.Dispose();

    private sealed class FakePoster(Func<string, bool, JsonPostOutcome> respond) : IJsonPoster
    {
        public List<(string Path, string Json, bool ServerDryRun)> Calls { get; } = [];

        public Task<JsonPostOutcome> PostJsonAsync(string path, object body, bool serverDryRun, CancellationToken ct)
        {
            Calls.Add((path, JsonSerializer.Serialize(body, IngestClient.Json), serverDryRun));
            return Task.FromResult(respond(path, serverDryRun));
        }
    }

    private static JsonPostOutcome Ok(string json) => new(true, 200, json, null);

    /// <summary>A synthetic v1 data repo: users, privileged users, two teaching files, research and papers.</summary>
    private string SeedRepo()
    {
        _tree.Write("data/config/users.json", """
            [ { "id": "T0001", "name": "Nguyễn Văn A", "emails": ["a@x.test"] }, { "id": "T0002", "name": "Trần B", "emails": ["b@x.test", "b2@x.test"] } ]
            """);
        _tree.Write("data/config/privileged.users.json", """{ "ViewAs": ["T0001"], "Lookup": ["b@x.test"], "Statistics": [] }""");
        _tree.Write("data/notifications/teaching-stats/teaching-stats-2019-2021.json", LegacyFixture.TeachingFile("năm học 2020-2021",
            ("T0001", [LegacyFixture.Line("Giải tích", "19CTT1", "Đại học (LYTHUYET), HK1", "45"), LegacyFixture.Line("Giải tích", "19CTT1", "Đại học (LYTHUYET), HK1", "5")])));
        _tree.Write("data/notifications/teaching-stats/teaching-stats-2023-2024.json", LegacyFixture.TeachingFile("năm học 2023-2024",
            ("T0002", [LegacyFixture.Line("Đại số", "22CS_CLC1", "Đại học (CLC), HK3", "9.12"), LegacyFixture.Line("Hóa", "Khóa 29", "Cao học, Học phần 4", "13.5")])));
        _tree.Write("data/notifications/research-stats.json", LegacyFixture.ResearchFile(
            ("T0001", LegacyFixture.Project("P1", "Đề tài một", role: "Chủ Nhiệm")), ("T0002", LegacyFixture.Project("P1", "Đề tài một"))));
        _tree.Write("data/notifications/paper-details.json", """[ { "Eid": "e1", "Details": "A One: A paper. Journal X 1: 2-3 (2025)", "Mscb": ["T0001"] } ]""");
        return Path.Combine(_tree.Root, "data");
    }

    private ReportDirectory Reports() => ReportDirectory.Resolve(Path.Combine(_tree.Root, "reports"));

    private const string DatasetReport = """{"id":"0196","dataset":"x","status":"applied","fileName":"legacy-x.json","totalRows":3,"newRows":3,"updatedRows":0,"removedRows":0,"unknownMscbs":["T0777"],"badValues":[],"academicYears":["2023-2024"]}""";

    [Fact]
    public async Task A_plain_dry_run_parses_prints_counts_and_posts_nothing()
    {
        var output = new StringWriter();
        var poster = new FakePoster((_, _) => throw new InvalidOperationException("must not post"));

        var code = await new LegacyCommands(SeedRepo(), poster, Reports(), output)
            .RunDatasetsAsync(Contracts.LegacyDatasets.All, new LegacyCommands.Options(DryRun: true, ServerDryRun: false), CancellationToken.None);

        Assert.Equal(0, code);
        Assert.Empty(poster.Calls);
        var text = output.ToString();
        Assert.Contains("[teaching] parsed rows=2 years=2 (2020-2021=1, 2023-2024=1)", text);   // the 2020-2021 lines were merged; the term-less one skipped
        Assert.Contains("[research] parsed rows=2 projects=1", text);
        Assert.Contains("[publications] parsed rows=1", text);
        Assert.Contains("teaching_merged_lines=1", text);
        Assert.Contains("teaching_no_term=1", text);
        Assert.Equal(3, System.Text.RegularExpressions.Regex.Matches(text, "dry-run: parsed only").Count);
        Assert.False(Directory.Exists(Path.Combine(_tree.Root, "reports"))); // nothing to report from a local parse
    }

    [Fact]
    public async Task A_server_dry_run_posts_with_the_flag_one_request_per_teaching_year()
    {
        var output = new StringWriter();
        var poster = new FakePoster((_, _) => Ok(DatasetReport));

        var code = await new LegacyCommands(SeedRepo(), poster, Reports(), output)
            .RunDatasetsAsync(Contracts.LegacyDatasets.All, new LegacyCommands.Options(DryRun: true, ServerDryRun: true), CancellationToken.None);

        Assert.Equal(0, code);
        Assert.Equal(4, poster.Calls.Count);      // teaching 2020-2021, teaching 2023-2024, research, publications
        Assert.All(poster.Calls, c => Assert.True(c.ServerDryRun));
        Assert.Equal(["api/integration/v1/legacy/datasets/teaching", "api/integration/v1/legacy/datasets/teaching", "api/integration/v1/legacy/datasets/research", "api/integration/v1/legacy/datasets/publications"],
            poster.Calls.Select(c => c.Path));
        using var first = JsonDocument.Parse(poster.Calls[0].Json);
        var row = first.RootElement.GetProperty("rows")[0];
        Assert.Equal(("T0001", "2020-2021", 1, 50m, 0), (row.GetProperty("employeeCode").GetString(), row.GetProperty("academicYear").GetString(), row.GetProperty("term").GetInt32(),
            row.GetProperty("standardHours").GetDecimal(), row.GetProperty("periods").GetInt32()));
        Assert.Equal(JsonValueKind.Null, row.GetProperty("courseCode").ValueKind);
        using var research = JsonDocument.Parse(poster.Calls[2].Json);
        Assert.Equal("chu_nhiem", research.RootElement.GetProperty("rows")[0].GetProperty("role").GetString());
    }

    [Fact]
    public async Task Console_output_is_counts_only_and_the_detailed_report_goes_to_the_report_dir()
    {
        var output = new StringWriter();
        var reports = Reports();
        var poster = new FakePoster((_, _) => Ok(DatasetReport));

        await new LegacyCommands(SeedRepo(), poster, reports, output)
            .RunDatasetsAsync([Contracts.LegacyDatasets.Research], new LegacyCommands.Options(false, false), CancellationToken.None);

        var text = output.ToString();
        Assert.Contains("status=applied totalRows=3 newRows=3 updatedRows=0 removedRows=0 unknownMscbs=1 badValues=0 academicYears=1", text);
        Assert.DoesNotContain("T0777", text);      // the unknown MSCB is only in the report file
        Assert.DoesNotContain("T0001", text);
        var file = Assert.Single(Directory.GetFiles(reports.Path, "legacy-datasets-research-*.json"));
        Assert.Contains("T0777", File.ReadAllText(file));
        Assert.Contains(file, text);
    }

    [Fact]
    public async Task A_rejected_import_is_a_failure_with_exit_code_1()
    {
        var output = new StringWriter();
        var poster = new FakePoster((_, _) => Ok("""{"status":"rejected","totalRows":2,"badValues":[{"row":1,"column":"term","message":"x"}],"unknownMscbs":[]}"""));

        var code = await new LegacyCommands(SeedRepo(), poster, Reports(), output)
            .RunDatasetsAsync([Contracts.LegacyDatasets.Publications], new LegacyCommands.Options(false, false), CancellationToken.None);

        Assert.Equal(1, code);
        Assert.Contains("[publications] REJECTED status=rejected totalRows=2 badValues=1 unknownMscbs=0", output.ToString());
    }

    [Fact]
    public async Task An_auth_failure_aborts_the_remaining_datasets()
    {
        var poster = new FakePoster((_, _) => new JsonPostOutcome(false, 401, null, "HTTP 401: Unauthorized"));
        var output = new StringWriter();

        var code = await new LegacyCommands(SeedRepo(), poster, Reports(), output)
            .RunDatasetsAsync(Contracts.LegacyDatasets.All, new LegacyCommands.Options(false, false), CancellationToken.None);

        Assert.Equal(1, code);
        Assert.Single(poster.Calls);
        Assert.Contains("Aborting", output.ToString());
    }

    [Fact]
    public async Task Another_http_failure_does_not_stop_the_other_datasets()
    {
        var poster = new FakePoster((path, _) => path.EndsWith("/research") ? new JsonPostOutcome(false, 400, null, "HTTP 400: bad") : Ok(DatasetReport));
        var output = new StringWriter();

        var code = await new LegacyCommands(SeedRepo(), poster, Reports(), output)
            .RunDatasetsAsync(Contracts.LegacyDatasets.All, new LegacyCommands.Options(false, false), CancellationToken.None);

        Assert.Equal(1, code);
        Assert.Equal(4, poster.Calls.Count);
        Assert.Contains("[research] FAILED: HTTP 400: bad", output.ToString());
    }

    [Fact]
    public async Task Unknown_term_option_files_postgraduate_lines_under_that_term()
    {
        var poster = new FakePoster((_, _) => Ok(DatasetReport));
        await new LegacyCommands(SeedRepo(), poster, Reports(), new StringWriter())
            .RunDatasetsAsync([Contracts.LegacyDatasets.Teaching], new LegacyCommands.Options(false, false, UnknownTerm: 2), CancellationToken.None);

        using var doc = JsonDocument.Parse(poster.Calls[1].Json);
        var rows = doc.RootElement.GetProperty("rows").EnumerateArray().ToList();
        Assert.Equal(2, rows.Count);
        Assert.Equal(2, rows.Single(r => r.GetProperty("courseName").GetString() == "Hóa").GetProperty("term").GetInt32());
    }

    [Fact]
    public async Task Emails_post_the_users_and_write_the_privileged_list_without_printing_it()
    {
        var output = new StringWriter();
        var reports = Reports();
        var poster = new FakePoster((_, _) => Ok("""{"dryRun":false,"users":2,"emails":3,"inserted":3,"unchanged":0,"issues":{"unknown_employee":1,"name_mismatch":2},"details":[{"kind":"unknown_employee","code":"T0777"}]}"""));

        var code = await new LegacyCommands(SeedRepo(), poster, reports, output).RunEmailsAsync(new LegacyCommands.Options(false, false), CancellationToken.None);

        Assert.Equal(0, code);
        var call = Assert.Single(poster.Calls);
        Assert.Equal(("api/integration/v1/legacy/emails", false), (call.Path, call.ServerDryRun));
        using var body = JsonDocument.Parse(call.Json);
        var users = body.RootElement.GetProperty("users");
        Assert.Equal(2, users.GetArrayLength());
        Assert.Equal(("T0002", "Trần B"), (users[1].GetProperty("code").GetString(), users[1].GetProperty("name").GetString()));
        Assert.Equal(["b@x.test", "b2@x.test"], users[1].GetProperty("emails").EnumerateArray().Select(e => e.GetString()));

        var text = output.ToString();
        Assert.Contains("[legacy-emails] read users=2 emails=3", text);
        Assert.Contains("v1 privileged: ViewAs=1, Lookup=1, Statistics=0; distinct holders=2 unresolved=0", text);
        Assert.Contains("users=2 emails=3 inserted=3 unchanged=0 issues=3 [unknown_employee=1, name_mismatch=2] details=1", text);
        foreach (var secret in new[] { "T0001", "T0002", "T0777", "a@x.test", "Nguyễn" }) Assert.DoesNotContain(secret, text);

        // The owner's list: who held what in v1, resolved through users.json. Nothing is granted.
        var list = JsonDocument.Parse(File.ReadAllText(Assert.Single(Directory.GetFiles(reports.Path, "legacy-privileged-holders-*.json")))).RootElement;
        var holders = list.GetProperty("holders").EnumerateArray().ToList();
        Assert.Equal(["T0001", "T0002"], holders.Select(h => h.GetProperty("code").GetString()));
        Assert.Equal("Nguyễn Văn A", holders[0].GetProperty("name").GetString());
        Assert.Equal(["ViewAs"], holders[0].GetProperty("permissions").EnumerateArray().Select(p => p.GetString()));
        Assert.Equal(["Lookup"], holders[1].GetProperty("permissions").EnumerateArray().Select(p => p.GetString()));
        Assert.Contains("T0777", File.ReadAllText(Assert.Single(Directory.GetFiles(reports.Path, "legacy-emails-*.json"))));
    }

    [Fact]
    public async Task Emails_dry_run_posts_nothing_but_still_writes_the_privileged_list()
    {
        var reports = Reports();
        var poster = new FakePoster((_, _) => throw new InvalidOperationException("must not post"));
        var output = new StringWriter();

        var code = await new LegacyCommands(SeedRepo(), poster, reports, output).RunEmailsAsync(new LegacyCommands.Options(true, false), CancellationToken.None);

        Assert.Equal(0, code);
        Assert.Empty(poster.Calls);
        Assert.Single(Directory.GetFiles(reports.Path, "legacy-privileged-holders-*.json"));
        Assert.Contains("dry-run: parsed only, nothing posted", output.ToString());
    }

    [Fact]
    public async Task Emails_server_dry_run_posts_with_the_flag()
    {
        var poster = new FakePoster((_, _) => Ok("""{"dryRun":true,"users":2,"emails":3,"inserted":3,"unchanged":0,"issues":{},"details":[]}"""));
        var output = new StringWriter();
        var code = await new LegacyCommands(SeedRepo(), poster, Reports(), output).RunEmailsAsync(new LegacyCommands.Options(true, true), CancellationToken.None);
        Assert.Equal(0, code);
        Assert.True(Assert.Single(poster.Calls).ServerDryRun);
        Assert.Contains("dryRun=true", output.ToString());
    }

    [Fact]
    public async Task Emails_failure_is_exit_code_1()
    {
        var poster = new FakePoster((_, _) => new JsonPostOutcome(false, 403, null, "HTTP 403: nope"));
        var output = new StringWriter();
        Assert.Equal(1, await new LegacyCommands(SeedRepo(), poster, Reports(), output).RunEmailsAsync(new LegacyCommands.Options(false, false), CancellationToken.None));
        Assert.Contains("FAILED: HTTP 403: nope", output.ToString());
    }
}
