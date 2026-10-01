using System.Net;
using System.Text.Json;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Modules.Identity.Groups;
using HCMUSSupportV2.Backend.Modules.Identity.Groups.Rules;
using HCMUSSupportV2.Backend.Tests.Infrastructure;
using static HCMUSSupportV2.Backend.Tests.Identity.GroupsTestHost;

namespace HCMUSSupportV2.Backend.Tests.Identity;

/// <summary>Strict validation of the rule JSON (no database).</summary>
public class GroupRuleParserTests
{
    private static readonly GroupRuleParser Parser = new(
    [
        new OrgUnitField(), new PositionTitleField(), new AcademicRankField(), new DegreeField(), new StatusField(), new HasEmailField(),
    ]);

    private static RuleParseResult Parse(string json)
    {
        using var doc = JsonDocument.Parse(json);
        return Parser.Parse(doc.RootElement);
    }

    [Theory]
    [InlineData("""{"all":[{"field":"org_unit","id":5,"includeDescendants":true}]}""")]
    [InlineData("""{"any":[{"field":"position_title","op":"eq","value":"Trưởng khoa"},{"field":"position_title","op":"contains","value":"phó"}]}""")]
    [InlineData("""{"all":[{"field":"academic_rank","op":"in","value":["GS","PGS"]},{"field":"degree","op":"in","value":["TS"]},{"field":"status","op":"in","value":["active","retired"]},{"field":"has_email","value":false}]}""")]
    [InlineData("""{"all":[{"any":[{"field":"degree","op":"in","value":["TS"]},{"field":"academic_rank","op":"in","value":["GS"]}]},{"field":"has_email","value":true}]}""")]
    public void Valid_rules_parse(string json) => Assert.True(Parse(json).IsValid);

    [Theory]
    [InlineData("""[]""", "$")]
    [InlineData("""{}""", "$")]
    [InlineData("""{"all":[]}""", "$.all")]
    [InlineData("""{"all":[{"field":"org_unit","id":1}],"any":[{"field":"org_unit","id":1}]}""", "$")]
    [InlineData("""{"all":[{"field":"org_unit","id":1}],"extra":1}""", "$.extra")]
    [InlineData("""{"field":"has_email","value":true}""", "$")]
    [InlineData("""{"all":[{"field":"salary","op":"eq","value":1}]}""", "$.all[0].field")]
    [InlineData("""{"all":[{"field":"org_unit","id":"5"}]}""", "$.all[0].id")]
    [InlineData("""{"all":[{"field":"org_unit","id":0}]}""", "$.all[0].id")]
    [InlineData("""{"all":[{"field":"org_unit","id":5,"includeDescendants":"yes"}]}""", "$.all[0].includeDescendants")]
    [InlineData("""{"all":[{"field":"org_unit","id":5,"depth":2}]}""", "$.all[0].depth")]
    [InlineData("""{"all":[{"field":"position_title","op":"startswith","value":"x"}]}""", "$.all[0].op")]
    [InlineData("""{"all":[{"field":"position_title","op":"eq","value":""}]}""", "$.all[0].value")]
    [InlineData("""{"all":[{"field":"academic_rank","op":"in","value":"GS"}]}""", "$.all[0].value")]
    [InlineData("""{"all":[{"field":"academic_rank","op":"in","value":[]}]}""", "$.all[0].value")]
    [InlineData("""{"all":[{"field":"academic_rank","op":"in","value":["GS",3]}]}""", "$.all[0].value[1]")]
    [InlineData("""{"all":[{"field":"academic_rank","op":"eq","value":["GS"]}]}""", "$.all[0].op")]
    [InlineData("""{"all":[{"field":"status","op":"in","value":["fired"]}]}""", "$.all[0].value")]
    [InlineData("""{"all":[{"field":"has_email","value":"true"}]}""", "$.all[0].value")]
    [InlineData("""{"all":[{"field":"has_email"}]}""", "$.all[0].value")]
    public void Invalid_rules_are_rejected_with_the_offending_path(string json, string path)
    {
        var result = Parse(json);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.Path == path);
    }

    [Fact]
    public void Nesting_deeper_than_the_limit_and_too_many_conditions_are_rejected()
    {
        var json = """{"all":[{"field":"has_email","value":true}]}""";
        for (var i = 0; i < GroupRuleParser.MaxDepth + 1; i++) json = $$"""{"all":[{{json}}]}""";
        Assert.False(Parse(json).IsValid);

        var many = string.Join(",", Enumerable.Repeat("""{"field":"has_email","value":true}""", GroupRuleParser.MaxConditions + 1));
        Assert.False(Parse($$"""{"all":[{{many}}]}""").IsValid);
    }

    [Fact]
    public void Compiled_sql_has_no_values_in_its_text()
    {
        var compiler = new GroupRuleCompiler(Parser);
        var evil = "x'); DROP TABLE employees;--";
        var rule = Parse($$"""{"all":[{"field":"position_title","op":"contains","value":"{{evil.Replace("'", "\\u0027")}}"},{"field":"academic_rank","op":"in","value":["GS"]},{"field":"org_unit","id":987654321,"includeDescendants":true}]}""").Rule!;

        var compiled = compiler.Compile(rule);

        Assert.DoesNotContain("DROP", compiled.EmployeesSql);
        Assert.DoesNotContain("987654321", compiled.EmployeesSql);
        Assert.DoesNotContain("GS", compiled.EmployeesSql);
        Assert.Contains("WITH RECURSIVE", compiled.EmployeesSql);
        Assert.Equal(3, compiled.CreateParameters().Length); // title, rank list, unit id
        Assert.Contains("status = 'active'", compiled.EmployeesSql);
    }

    [Fact]
    public void A_status_condition_switches_off_the_implicit_active_filter()
    {
        var compiler = new GroupRuleCompiler(Parser);
        var sql = compiler.Compile(Parse("""{"all":[{"field":"status","op":"in","value":["retired"]}]}""").Rule!).EmployeesSql;
        Assert.DoesNotContain("= 'active'", sql);
    }
}

/// <summary>Every rule condition against real rows, through <c>preview-rule</c>.</summary>
[Collection(PostgresCollection.Name)]
public class GroupRulePreviewTests(PostgresFixture database) : IAsyncLifetime
{
    private GroupsTestHost _host = null!;

    public Task InitializeAsync()
    {
        _host = new GroupsTestHost(database);
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    private async Task<PreviewRuleResultDto> PreviewAsync(ApiSession editor, object rule) =>
        await ApiSession.ReadAsync<PreviewRuleResultDto>(await editor.PostAsync("/api/manage/groups/preview-rule", new { rule }));

    private static object Org(long id, bool descendants = false) => new { field = "org_unit", id, includeDescendants = descendants };

    [Fact]
    public async Task Org_unit_matches_the_unit_and_its_department_and_optionally_all_descendants()
    {
        var editor = await _host.EditorAsync();
        var root = await _host.UnitAsync();
        var child = await _host.UnitAsync(parentId: root);
        var grandchild = await _host.UnitAsync(parentId: child);
        var dept = await _host.UnitAsync(parentId: child, kind: OrgUnitKinds.Department);
        var elsewhere = await _host.UnitAsync();
        var inRoot = await _host.EmployeeAsync(root);
        var inChild = await _host.EmployeeAsync(child);
        var inGrandchild = await _host.EmployeeAsync(grandchild);
        var viaDepartment = await _host.EmployeeAsync(child, dept);
        await _host.EmployeeAsync(elsewhere);

        var own = await PreviewAsync(editor, new { all = new[] { Org(root) } });
        Assert.Equal([inRoot], own.Sample.Select(s => s.Code));

        var tree = await PreviewAsync(editor, new { all = new[] { Org(root, true) } });
        Assert.Equal(new[] { inRoot, inChild, inGrandchild, viaDepartment }.Order(), tree.Sample.Select(s => s.Code).Order());
        Assert.Equal(4, tree.Count);

        var deptOnly = await PreviewAsync(editor, new { all = new[] { Org(dept) } });
        Assert.Equal([viaDepartment], deptOnly.Sample.Select(s => s.Code));

        var leaf = await PreviewAsync(editor, new { all = new[] { Org(grandchild, true) } });
        Assert.Equal([inGrandchild], leaf.Sample.Select(s => s.Code));
    }

    [Fact]
    public async Task Position_title_eq_and_contains_ignore_case_and_accents_and_treat_wildcards_literally()
    {
        var editor = await _host.EditorAsync();
        var unit = await _host.UnitAsync();
        var token = Unique("Chức").Replace("0", "o");
        var head = await _host.EmployeeAsync(unit, title: $"Trưởng khoa {token}");
        var deputy = await _host.EmployeeAsync(unit, title: $"Phó trưởng khoa {token}");
        var percent = await _host.EmployeeAsync(unit, title: $"Giảm 100% {token}");
        await _host.EmployeeAsync(unit, title: "Chuyên viên");
        await _host.EmployeeAsync(unit);
        var inUnit = Org(unit);

        var eq = await PreviewAsync(editor, new { all = new object[] { inUnit, new { field = "position_title", op = "eq", value = $"TRUONG KHOA {token.ToUpperInvariant()}" } } });
        Assert.Equal([head], eq.Sample.Select(s => s.Code));

        var contains = await PreviewAsync(editor, new { all = new object[] { inUnit, new { field = "position_title", op = "contains", value = $"truong khoa {token}" } } });
        Assert.Equal(new[] { head, deputy }.Order(), contains.Sample.Select(s => s.Code).Order());

        var literal = await PreviewAsync(editor, new { all = new object[] { inUnit, new { field = "position_title", op = "contains", value = "100%" } } });
        Assert.Equal([percent], literal.Sample.Select(s => s.Code));
        var wildcard = await PreviewAsync(editor, new { all = new object[] { inUnit, new { field = "position_title", op = "contains", value = "%" } } });
        Assert.Equal([percent], wildcard.Sample.Select(s => s.Code)); // "%" is a literal, not "match everything"

        var injection = await PreviewAsync(editor, new { all = new object[] { inUnit, new { field = "position_title", op = "eq", value = "x'; DROP TABLE employees; --" } } });
        Assert.Equal(0, injection.Count);
        Assert.Equal(HttpStatusCode.OK, (await editor.GetAsync("/api/manage/groups")).StatusCode);
    }

    [Fact]
    public async Task Rank_degree_status_and_has_email_conditions_combine_with_all_and_any()
    {
        var editor = await _host.EditorAsync();
        var unit = await _host.UnitAsync();
        var gsTs = await _host.EmployeeAsync(unit, rank: "GS", degree: "TS");
        var pgsThs = await _host.EmployeeAsync(unit, rank: "PGS", degree: "ThS");
        var tsOnly = await _host.EmployeeAsync(unit, degree: "ts", email: false);
        var retiredGs = await _host.EmployeeAsync(unit, rank: "GS", status: EmployeeStatuses.Retired);
        var inactiveTs = await _host.EmployeeAsync(unit, degree: "TS", status: EmployeeStatuses.Inactive);
        var plain = await _host.EmployeeAsync(unit);
        var inUnit = Org(unit);

        static string[] Codes(PreviewRuleResultDto r) => r.Sample.Select(s => s.Code).Order().ToArray();

        var rank = await PreviewAsync(editor, new { all = new object[] { inUnit, new { field = "academic_rank", op = "in", value = new[] { "gs", "PGS" } } } });
        Assert.Equal(new[] { gsTs, pgsThs }.Order(), Codes(rank)); // retired GS excluded by the implicit active filter

        var degree = await PreviewAsync(editor, new { all = new object[] { inUnit, new { field = "degree", op = "in", value = new[] { "TS" } } } });
        Assert.Equal(new[] { gsTs, tsOnly }.Order(), Codes(degree));

        var noEmail = await PreviewAsync(editor, new { all = new object[] { inUnit, new { field = "has_email", value = false } } });
        Assert.Equal([tsOnly], Codes(noEmail));
        var withEmail = await PreviewAsync(editor, new { all = new object[] { inUnit, new { field = "has_email", value = true } } });
        Assert.Equal(new[] { gsTs, pgsThs, plain }.Order(), Codes(withEmail));

        var any = await PreviewAsync(editor, new
        {
            all = new object[]
            {
                inUnit,
                new { any = new object[] { new { field = "academic_rank", op = "in", value = new[] { "PGS" } }, new { field = "has_email", value = false } } },
            },
        });
        Assert.Equal(new[] { pgsThs, tsOnly }.Order(), Codes(any));

        var retired = await PreviewAsync(editor, new { all = new object[] { inUnit, new { field = "status", op = "in", value = new[] { "retired", "inactive" } } } });
        Assert.Equal(new[] { retiredGs, inactiveTs }.Order(), Codes(retired));
    }

    [Fact]
    public async Task Preview_returns_count_and_a_capped_sample_ordered_by_code()
    {
        var editor = await _host.EditorAsync();
        var unit = await _host.UnitAsync("Khoa Mẫu");
        var all = new List<string>();
        for (var i = 0; i < 13; i++) all.Add(await _host.EmployeeAsync(unit));

        var result = await PreviewAsync(editor, new { all = new[] { Org(unit) } });

        Assert.Equal(13, result.Count);
        Assert.Equal(10, result.Sample.Count);
        Assert.Equal(result.Sample.Select(s => s.Code).Order(StringComparer.Ordinal), result.Sample.Select(s => s.Code));
        Assert.All(result.Sample, s => Assert.Equal("Khoa Mẫu", s.Unit));
    }

    [Fact]
    public async Task Invalid_rules_answer_400_with_paths_and_unknown_units_are_reported()
    {
        var editor = await _host.EditorAsync();

        var bad = await editor.PostAsync("/api/manage/groups/preview-rule", new { rule = new { all = new object[] { new { field = "nope" } } } });
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
        Assert.Contains("$.all[0].field", await bad.Content.ReadAsStringAsync());

        var missingUnit = await editor.PostAsync("/api/manage/groups/preview-rule", new { rule = new { all = new[] { Org(987654321) } } });
        Assert.Equal(HttpStatusCode.BadRequest, missingUnit.StatusCode);
        Assert.Contains("$.all[0].id", await missingUnit.Content.ReadAsStringAsync());

        Assert.Equal(HttpStatusCode.BadRequest, (await editor.PostAsync("/api/manage/groups/preview-rule", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await editor.PostAsync("/api/manage/groups", new { name = Unique("r"), kind = "rule" })).StatusCode);
    }
}
