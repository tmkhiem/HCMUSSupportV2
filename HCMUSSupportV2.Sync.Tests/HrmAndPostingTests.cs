using System.Data;
using System.IO.Compression;
using System.Net;
using System.Text;
using System.Text.Json;
using HCMUSSupportV2.Sync.Contracts;
using HCMUSSupportV2.Sync.Sources;

namespace HCMUSSupportV2.Sync.Tests;

public class HrmRowMapperTests
{
    private static DataTableReader Reader(params (string Col, Type Type, object?[] Values)[] cols)
    {
        var t = new DataTable();
        foreach (var c in cols) t.Columns.Add(c.Col, c.Type);
        for (var i = 0; i < cols[0].Values.Length; i++) t.Rows.Add(cols.Select(c => c.Values[i] ?? DBNull.Value).ToArray());
        return t.CreateDataReader();
    }

    [Fact]
    public void Every_dataset_has_an_embedded_query()
    {
        foreach (var d in Datasets.All)
            Assert.False(string.IsNullOrWhiteSpace(HrmSource.LoadQuery(d)), d);
    }

    [Fact]
    public void Queries_select_only_and_carry_the_documented_fixes()
    {
        foreach (var d in Datasets.All)
        {
            var sql = HrmSource.LoadQuery(d);
            Assert.DoesNotContain("INSERT ", sql, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("UPDATE ", sql, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("DELETE ", sql, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("hrm_id", sql);
        }
        var trips = HrmSource.LoadQuery(Datasets.BusinessTrips);
        Assert.DoesNotContain("ns.MA =", trips);              // the one-MSCB debug filter is gone
        Assert.DoesNotContain("TOP (1000)", trips);
        Assert.Contains("qtdt.MaQuocTich     = qt.MaQuocTich", HrmSource.LoadQuery(Datasets.Degrees)); // code joins code
    }

    [Fact]
    public void Employees_map_real_ids_and_default_status()
    {
        var src = new HrmSource("Server=none");
        var rows = src.Map(Datasets.Employees, Reader(
            ("hrm_id", typeof(int), [7001, 7002, 7003]),
            ("code", typeof(string), ["T0101 ", "T0102", ""]),
            ("full_name", typeof(string), ["Nguyen Van Thu", null, "X"]),
            ("org_unit_hrm_id", typeof(int), [101, null, 101]),
            ("department_hrm_id", typeof(int), [1000102, null, null]),
            ("position_title", typeof(string), ["GV", null, null]),
            ("academic_rank", typeof(string), ["PGS", null, null]),
            ("degree", typeof(string), ["TS", null, null]),
            ("status", typeof(string), ["retired", null, "active"])));

        Assert.Equal(2, rows.Count); // the row without an MSCB is skipped
        var a = (EmployeeRow)rows[0];
        Assert.Equal((7001, "T0101", "Nguyen Van Thu", 101, 1000102, "retired"), (a.HrmId, a.Code, a.FullName, a.OrgUnitHrmId, a.DepartmentHrmId, a.Status));
        var b = (EmployeeRow)rows[1];
        Assert.Equal(("T0102", "T0102", "active", null), (b.Code, b.FullName, b.Status, b.OrgUnitHrmId)); // name falls back to the code
        Assert.Equal(1, src.Report.Counts["employee_empty_mscb"]);
    }

    [Fact]
    public void Profiles_compose_partial_birth_date_and_accept_date_or_text_columns()
    {
        var src = new HrmSource("Server=none");
        var rows = src.Map(Datasets.Profiles, Reader(
            ("hrm_id", typeof(int), [1, 2]),
            ("employee_code", typeof(string), ["T1", "T2"]),
            ("birth_day", typeof(string), ["14", ""]),
            ("birth_month", typeof(string), ["7", "7"]),
            ("birth_year", typeof(string), ["1985", "1990"]),
            ("is_party_member", typeof(bool), [true, false]),
            ("party_joined_on", typeof(DateTime), [new DateTime(2010, 5, 19), null]),
            ("is_trade_union_member", typeof(int), [1, 0]),
            ("trade_union_joined_on", typeof(string), ["03/2015", "not a date"]),
            ("salary_step", typeof(int), [3, null]),
            ("salary_coefficient", typeof(decimal), [4.65m, null]),
            ("tax_code", typeof(string), ["8000000001", null]),
            ("national_id_issued_on", typeof(string), ["2/3/2015", null])));

        Assert.Equal(2, rows.Count);
        var a = (ProfileRow)rows[0];
        Assert.Equal(("1985-07-14", "2010-05-19", "2015-03", 3, 4.65m), (a.DateOfBirth, a.PartyJoinedOn, a.TradeUnionJoinedOn, a.SalaryStep, a.SalaryCoefficient));
        Assert.True(a.IsPartyMember);
        Assert.True(a.IsTradeUnionMember);
        Assert.Equal(("8000000001", "2015-03-02"), (a.Sensitive!.TaxCode, a.Sensitive.NationalIdIssuedOn));
        var b = (ProfileRow)rows[1];
        Assert.Equal("1990-07", b.DateOfBirth);
        Assert.False(b.IsTradeUnionMember);
        Assert.Null(b.Sensitive);
        Assert.Equal("not a date", b.TradeUnionJoinedOn);
        Assert.Equal(1, src.Report.Counts["bad_date:trade_union_joined_on"]);
    }

    [Fact]
    public void Child_datasets_map_source_keys_dates_and_skip_rows_without_keys()
    {
        var src = new HrmSource("Server=none");

        var deg = src.Map(Datasets.Degrees, Reader(
            ("hrm_id", typeof(int), [11, null]),
            ("employee_code", typeof(string), ["T1", "T1"]),
            ("degree_type", typeof(string), ["Thac si", "x"]),
            ("enrolled_on", typeof(string), ["2012", ""]),
            ("graduated_on", typeof(DateTime), [new DateTime(2014, 6, 30), null]),
            ("country", typeof(string), ["Viet Nam", null])));
        var d = Assert.IsType<DegreeRow>(Assert.Single(deg));
        Assert.Equal((11, "2012", "2014-06-30", "Viet Nam"), (d.HrmId, d.EnrolledOn, d.GraduatedOn, d.Country));
        Assert.Equal(1, src.Report.Counts["degree_no_hrm_id"]);

        var com = src.Map(Datasets.Commendations, Reader(
            ("hrm_id", typeof(int), [1, 2]), ("employee_code", typeof(string), ["T1", "T1"]),
            ("kind", typeof(string), ["award", "title"]), ("name", typeof(string), ["A", "B"]),
            ("decided_on", typeof(DateTime), [new DateTime(2021, 9, 1), new DateTime(2022, 1, 2)])));
        Assert.Equal(["award", "title"], com.Cast<CommendationRow>().Select(c => c.Kind));

        var org = src.Map(Datasets.OrgUnits, Reader(
            ("hrm_id", typeof(int), [101, 1000102]), ("parent_hrm_id", typeof(int), [null, 101]),
            ("kind", typeof(string), ["unit", "department"]), ("name", typeof(string), ["Khoa Thu", "Bo mon Thu"]),
            ("code", typeof(string), [null, null]), ("is_active", typeof(bool), [true, true])));
        Assert.Equal([(101, (int?)null), (1000102, 101)], org.Cast<OrgUnitRow>().Select(o => (o.HrmId, o.ParentHrmId)));

        var pos = src.Map(Datasets.Positions, Reader(
            ("hrm_id", typeof(int), [5]), ("employee_code", typeof(string), ["T1"]), ("title", typeof(string), ["Truong khoa"]),
            ("unit_description", typeof(string), ["Khoa Thu"]), ("coefficient", typeof(decimal), [0.7m]),
            ("appointed_on", typeof(string), ["2019"]), ("decision_no", typeof(string), [null]), ("signed_on", typeof(string), [""]),
            ("ended_on", typeof(DateTime), [null])));
        var p = Assert.IsType<PositionRow>(Assert.Single(pos));
        Assert.Equal(("2019", null, null, 0.7m), (p.AppointedOn, p.SignedOn, p.EndedOn, p.Coefficient));
    }

    [Fact]
    public void Missing_column_gives_a_readable_error()
    {
        var src = new HrmSource("Server=none");
        var ex = Assert.Throws<InvalidOperationException>(() => src.Map(Datasets.Salary, Reader(("hrm_id", typeof(int), [1]))));
        Assert.Contains("employee_code", ex.Message);
    }
}

public class PostingTests
{
    private sealed class Handler(Func<HttpRequestMessage, byte[], HttpResponseMessage> respond) : HttpMessageHandler
    {
        public List<(HttpRequestMessage Request, byte[] Body)> Calls { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var body = request.Content is null ? [] : await request.Content.ReadAsByteArrayAsync(ct);
            Calls.Add((request, body));
            return respond(request, body);
        }
    }

    private static HttpResponseMessage Json(HttpStatusCode code, object body) =>
        new(code) { Content = new StringContent(JsonSerializer.Serialize(body, IngestClient.Json), Encoding.UTF8, "application/json") };

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

    private static readonly IngestResultDto Ok = new(42, "salary", "success", 2, 1, 1, 0, 1, new Dictionary<string, int> { ["bad_date"] = 1 }, []);

    [Fact]
    public async Task Posts_gzip_json_with_apikey_camelcase_and_force_flag()
    {
        var h = new Handler((_, _) => Json(HttpStatusCode.OK, Ok));
        using var client = Client(h);
        IReadOnlyList<object> rows = [new SalaryRow(1, "T1", "V.07", "G", 3, 4.65m, null, "QD", "2024-12-01", "2025-01", null, null)];

        var o = await client.PostAsync(Datasets.Salary, rows, force: true, CancellationToken.None);

        Assert.True(o.Success);
        Assert.Equal(42, o.Result!.RunId);
        var (req, body) = Assert.Single(h.Calls);
        Assert.Equal("/api/integration/v1/salary", req.RequestUri!.AbsolutePath);
        Assert.Equal("?force=true", req.RequestUri.Query);
        Assert.Equal("ApiKey", req.Headers.Authorization!.Scheme);
        Assert.Equal("tok", req.Headers.Authorization.Parameter);
        Assert.Contains("gzip", req.Content!.Headers.ContentEncoding);
        using var doc = JsonDocument.Parse(Gunzip(body));
        var row = doc.RootElement.GetProperty("rows")[0];
        Assert.Equal("T1", row.GetProperty("employeeCode").GetString());
        Assert.Equal(4.65m, row.GetProperty("coefficient").GetDecimal());
        Assert.Equal("2025-01", row.GetProperty("effectiveFrom").GetString());
        Assert.Equal(JsonValueKind.Null, row.GetProperty("nextRaiseOn").ValueKind);
    }

    [Fact]
    public async Task Conflict_is_a_failure_with_a_force_hint()
    {
        var h = new Handler((_, _) => Json(HttpStatusCode.Conflict, new { title = "Truncation guard", detail = "received 10 of previous 100" }));
        using var client = Client(h);
        var o = await client.PostAsync(Datasets.Salary, [], false, CancellationToken.None);
        Assert.False(o.Success);
        Assert.Equal(409, o.StatusCode);
        Assert.Contains("--force", o.Error);
        Assert.Contains("received 10 of previous 100", o.Error);
        Assert.Equal("", h.Calls[0].Request.RequestUri!.Query);
    }

    private sealed class FakeSource(Func<string, IReadOnlyList<object>> read) : IDatasetSource
    {
        public string Name => "fake";
        public IReadOnlyCollection<string> Supported => Datasets.All;
        public MappingReport Report { get; } = new();
        public Task<IReadOnlyList<object>> ReadAsync(string dataset, CancellationToken ct) => Task.FromResult(read(dataset));
    }

    private sealed class FakePoster(Func<string, PostOutcome> post) : IIngestPoster
    {
        public List<string> Posted { get; } = [];
        public Task<PostOutcome> PostAsync(string dataset, IReadOnlyList<object> rows, bool force, CancellationToken ct)
        {
            Posted.Add(dataset);
            return Task.FromResult(post(dataset));
        }
    }

    [Fact]
    public async Task Dry_run_prints_counts_and_never_posts()
    {
        var poster = new FakePoster(_ => throw new InvalidOperationException("must not post"));
        var output = new StringWriter();
        var code = await new SyncRunner(new FakeSource(d => d == Datasets.Salary ? [new object(), new object()] : []), poster, output)
            .RunAsync([Datasets.Salary, Datasets.Positions], dryRun: true, force: false, CancellationToken.None);
        Assert.Equal(0, code);
        Assert.Empty(poster.Posted);
        Assert.Contains("[salary] dry-run rows=2", output.ToString());
        Assert.Contains("[positions] dry-run rows=0", output.ToString());
    }

    [Fact]
    public async Task Summary_line_has_the_api_counters_and_failure_gives_nonzero_exit()
    {
        var poster = new FakePoster(d => d == Datasets.Salary
            ? new PostOutcome(d, 2, true, 200, Ok, null)
            : new PostOutcome(d, 0, false, 409, null, "HTTP 409 (truncation guard)"));
        var output = new StringWriter();
        var code = await new SyncRunner(new FakeSource(_ => [new object(), new object()]), poster, output)
            .RunAsync([Datasets.Salary, Datasets.Positions, Datasets.Degrees], false, false, CancellationToken.None);

        var text = output.ToString();
        Assert.Contains("[salary] sent=2 received=2 inserted=1 updated=1 deleted=0 issues=1 [bad_date=1]", text);
        Assert.Contains("[positions] FAILED", text);
        Assert.Equal(1, code);
        Assert.Equal(["salary", "positions", "degrees"], poster.Posted); // a 409 does not stop the other datasets
    }

    [Fact]
    public async Task Auth_failure_aborts_remaining_datasets()
    {
        var poster = new FakePoster(d => new PostOutcome(d, 0, false, 401, null, "HTTP 401"));
        var code = await new SyncRunner(new FakeSource(_ => []), poster, new StringWriter())
            .RunAsync([Datasets.OrgUnits, Datasets.Employees], false, false, CancellationToken.None);
        Assert.Equal(1, code);
        Assert.Single(poster.Posted);
    }

    [Fact]
    public async Task Read_failure_is_reported_and_nonzero()
    {
        var output = new StringWriter();
        var code = await new SyncRunner(new FakeSource(_ => throw new InvalidOperationException("boom")), null, output)
            .RunAsync([Datasets.Salary], dryRun: true, false, CancellationToken.None);
        Assert.Equal(1, code);
        Assert.Contains("FAILED reading", output.ToString());
    }
}

public class CliTests
{
    [Fact]
    public void Parses_options_and_datasets()
    {
        var o = Cli.Parse(["sync", "legacy-git", "--path", "D:\\x", "--datasets", "salary,employees", "--dry-run", "--force"], TextWriter.Null)!;
        Assert.Equal(("legacy-git", "D:\\x", true, true), (o.Source, o.Path, o.DryRun, o.Force));
        Assert.Equal(["employees", "salary"], Datasets.Parse(o.Datasets)); // dependency order, not the order typed
        Assert.Equal(Datasets.All, Datasets.Parse("all"));
        Assert.Throws<ArgumentException>(() => Datasets.Parse("salary,nope"));
    }

    [Theory]
    [InlineData("hrm", "--bogus")]
    [InlineData("oracle")]
    public void Bad_usage_returns_null(params string[] args) => Assert.Null(Cli.Parse(["sync", .. args], TextWriter.Null));
}
