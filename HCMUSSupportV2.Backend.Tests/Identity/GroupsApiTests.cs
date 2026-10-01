using System.Net;
using System.Text;
using ClosedXML.Excel;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Modules.Identity.Groups;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using HCMUSSupportV2.Backend.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using static HCMUSSupportV2.Backend.Tests.Identity.GroupsTestHost;

namespace HCMUSSupportV2.Backend.Tests.Identity;

/// <summary>Group CRUD, policy, static members and imports over HTTP.</summary>
[Collection(PostgresCollection.Name)]
public class GroupsApiTests(PostgresFixture database) : IAsyncLifetime
{
    private GroupsTestHost _host = null!;

    public Task InitializeAsync()
    {
        _host = new GroupsTestHost(database);
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    private static async Task<GroupDto> CreateStaticAsync(ApiSession editor, string? name = null, string? description = null) =>
        await ApiSession.ReadAsync<GroupDto>(
            await editor.PostAsync("/api/manage/groups", new { name = name ?? Unique("Nhóm "), description, kind = "static" }),
            HttpStatusCode.Created);

    // ---- policy ----

    [Fact]
    public async Task Employee_is_forbidden_and_anonymous_is_unauthorized()
    {
        var employee = await _host.SignInAsync();
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.GetAsync("/api/manage/groups")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.PostAsync("/api/manage/groups", new { name = "x", kind = "static" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.PostAsync("/api/manage/groups/preview-rule", new { rule = new { all = new object[0] } })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.PostAsync("/api/manage/groups/recompute")).StatusCode);

        var anonymous = _host.Factory.CreateSessionClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/manage/groups")).StatusCode);
    }

    [Fact]
    public async Task Editor_and_admin_can_manage_groups()
    {
        var editor = await _host.EditorAsync();
        var admin = await _host.SignInAsync("admin");
        Assert.Equal(HttpStatusCode.OK, (await editor.GetAsync("/api/manage/groups")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync("/api/manage/groups")).StatusCode);
    }

    // ---- CRUD ----

    [Fact]
    public async Task Create_get_update_archive_restore_a_static_group_and_audit_each_step()
    {
        var editor = await _host.EditorAsync();
        var created = await CreateStaticAsync(editor, description: "  mô tả  ");
        Assert.Equal("static", created.Kind);
        Assert.Equal("mô tả", created.Description);
        Assert.Equal(0, created.MemberCount);
        Assert.Equal(editor.Code, created.CreatedBy);

        var newName = Unique("Đổi tên ");
        var updated = await ApiSession.ReadAsync<GroupDto>(await editor.PutAsync($"/api/manage/groups/{created.Id}", new { name = newName, description = (string?)null }));
        Assert.Equal(newName, updated.Name);
        Assert.Null(updated.Description);

        Assert.Equal(HttpStatusCode.NoContent, (await editor.DeleteAsync($"/api/manage/groups/{created.Id}")).StatusCode);
        var archived = await ApiSession.ReadAsync<GroupDto>(await editor.GetAsync($"/api/manage/groups/{created.Id}"));
        Assert.NotNull(archived.ArchivedAt);
        Assert.Equal(HttpStatusCode.Conflict, (await editor.PutAsync($"/api/manage/groups/{created.Id}", new { name = "x" })).StatusCode);

        var restored = await ApiSession.ReadAsync<GroupDto>(await editor.PostAsync($"/api/manage/groups/{created.Id}/restore"));
        Assert.Null(restored.ArchivedAt);

        var actions = await _host.Factory.WithDbAsync(db => db.Set<AuditLogEntry>().AsNoTracking()
            .Where(a => a.TargetType == "group" && a.TargetId == created.Id.ToString()).Select(a => a.Action).ToListAsync());
        Assert.Contains("group.created", actions);
        Assert.Contains("group.updated", actions);
        Assert.Contains("group.archived", actions);
        Assert.Contains("group.restored", actions);
    }

    [Fact]
    public async Task Duplicate_names_conflict_case_insensitively_and_unknown_ids_are_404()
    {
        var editor = await _host.EditorAsync();
        var name = Unique("Trùng ");
        await CreateStaticAsync(editor, name);

        var again = await editor.PostAsync("/api/manage/groups", new { name = name.ToUpperInvariant(), kind = "static" });
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await editor.PostAsync("/api/manage/groups", new { name = "  ", kind = "static" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await editor.PostAsync("/api/manage/groups", new { name = Unique("a"), kind = "org_unit" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await editor.GetAsync("/api/manage/groups/999999999")).StatusCode);
    }

    [Fact]
    public async Task List_filters_by_name_without_accents_and_kind_and_pages_by_keyset()
    {
        var editor = await _host.EditorAsync();
        var tag = Unique("Lst");
        var names = new[] { $"{tag} Đào tạo", $"{tag} Bộ môn", $"{tag} Khoa học" };
        foreach (var n in names) await CreateStaticAsync(editor, n);
        var archivedName = $"{tag} Cũ";
        var archived = await CreateStaticAsync(editor, archivedName);
        await editor.DeleteAsync($"/api/manage/groups/{archived.Id}");

        var page1 = await ApiSession.ReadAsync<GroupPageDto>(await editor.GetAsync($"/api/manage/groups?q={tag}&limit=2"));
        Assert.Equal(2, page1.Items.Count);
        Assert.NotNull(page1.NextCursor);
        var page2 = await ApiSession.ReadAsync<GroupPageDto>(await editor.GetAsync($"/api/manage/groups?q={tag}&limit=2&cursor={Uri.EscapeDataString(page1.NextCursor!)}"));
        Assert.Single(page2.Items);
        Assert.Null(page2.NextCursor);
        Assert.Equal(3, page1.Items.Concat(page2.Items).Select(g => g.Id).Distinct().Count());
        Assert.DoesNotContain(page1.Items.Concat(page2.Items), g => g.ArchivedAt is not null);

        var accentless = await ApiSession.ReadAsync<GroupPageDto>(await editor.GetAsync($"/api/manage/groups?q={tag}%20dao%20tao"));
        Assert.Single(accentless.Items);

        var withArchived = await ApiSession.ReadAsync<GroupPageDto>(await editor.GetAsync($"/api/manage/groups?q={tag}&includeArchived=true"));
        Assert.Equal(4, withArchived.Items.Count);
        var rules = await ApiSession.ReadAsync<GroupPageDto>(await editor.GetAsync($"/api/manage/groups?q={tag}&kind=rule"));
        Assert.Empty(rules.Items);
        Assert.Equal(HttpStatusCode.BadRequest, (await editor.GetAsync("/api/manage/groups?kind=nope")).StatusCode);
    }

    // ---- static members ----

    [Fact]
    public async Task Add_and_remove_members_reports_unknown_inactive_and_duplicates_and_maintains_the_count()
    {
        var editor = await _host.EditorAsync();
        var unit = await _host.UnitAsync();
        var a = await _host.EmployeeAsync(unit);
        var b = await _host.EmployeeAsync(unit);
        var retired = await _host.EmployeeAsync(unit, status: EmployeeStatuses.Retired);
        var group = await CreateStaticAsync(editor);

        var added = await ApiSession.ReadAsync<AddMembersResultDto>(
            await editor.PutAsync($"/api/manage/groups/{group.Id}/members", new { codes = new[] { a, b, retired, "NOPE-1", a, $" {a} " } }));
        Assert.Equal(new[] { a, b }.Order(), added.Added.Order());
        Assert.Equal(new[] { retired }, added.Inactive);
        Assert.Equal(new[] { "NOPE-1" }, added.Unknown);
        Assert.Equal(2, added.MemberCount);
        Assert.Equal(new[] { a, b }.Order(), _host.Log.AddedFor(group.Id));

        var again = await ApiSession.ReadAsync<AddMembersResultDto>(
            await editor.PutAsync($"/api/manage/groups/{group.Id}/members", new { codes = new[] { a } }));
        Assert.Empty(again.Added);
        Assert.Equal(new[] { a }, again.AlreadyMember);
        Assert.Equal(1, _host.Log.CallsFor(group.Id)); // nothing new, observer not called again

        var members = await ApiSession.ReadAsync<GroupMemberPageDto>(await editor.GetAsync($"/api/manage/groups/{group.Id}/members"));
        Assert.Equal(2, members.Items.Count);
        Assert.All(members.Items, m => Assert.Equal("manual", m.Source));

        var removed = await ApiSession.ReadAsync<RemoveMembersResultDto>(
            await editor.DeleteAsync($"/api/manage/groups/{group.Id}/members", new { codes = new[] { a, "NOPE-1" } }));
        Assert.Equal(new[] { a }, removed.Removed);
        Assert.Equal(new[] { "NOPE-1" }, removed.NotMember);
        Assert.Equal(1, removed.MemberCount);
        Assert.Equal(1, (await ApiSession.ReadAsync<GroupDto>(await editor.GetAsync($"/api/manage/groups/{group.Id}"))).MemberCount);

        Assert.Equal(HttpStatusCode.BadRequest, (await editor.PutAsync($"/api/manage/groups/{group.Id}/members", new { codes = new string[0] })).StatusCode);
        var actions = await _host.Factory.WithDbAsync(db => db.Set<AuditLogEntry>().AsNoTracking()
            .Where(x => x.TargetId == group.Id.ToString()).Select(x => x.Action).ToListAsync());
        Assert.Contains("group.members_added", actions);
        Assert.Contains("group.members_removed", actions);
    }

    [Fact]
    public async Task Members_list_searches_by_code_and_unaccented_name_and_pages()
    {
        var editor = await _host.EditorAsync();
        var unit = await _host.UnitAsync("Khoa Toán");
        var codes = new List<string>();
        for (var i = 0; i < 3; i++) codes.Add(await _host.EmployeeAsync(unit, name: $"Trần Thị Ánh {i}"));
        var other = await _host.EmployeeAsync(unit, name: "Lê Văn Bình");
        var group = await CreateStaticAsync(editor);
        await editor.PutAsync($"/api/manage/groups/{group.Id}/members", new { codes = codes.Append(other) });

        var byName = await ApiSession.ReadAsync<GroupMemberPageDto>(await editor.GetAsync($"/api/manage/groups/{group.Id}/members?q=tran%20thi%20anh"));
        Assert.Equal(3, byName.Items.Count);
        Assert.All(byName.Items, m => Assert.Equal("Khoa Toán", m.Unit));
        var byCode = await ApiSession.ReadAsync<GroupMemberPageDto>(await editor.GetAsync($"/api/manage/groups/{group.Id}/members?q={other.ToLowerInvariant()}"));
        Assert.Equal(other, Assert.Single(byCode.Items).Code);

        var p1 = await ApiSession.ReadAsync<GroupMemberPageDto>(await editor.GetAsync($"/api/manage/groups/{group.Id}/members?limit=3"));
        var p2 = await ApiSession.ReadAsync<GroupMemberPageDto>(await editor.GetAsync($"/api/manage/groups/{group.Id}/members?limit=3&cursor={Uri.EscapeDataString(p1.NextCursor!)}"));
        Assert.Equal(3, p1.Items.Count);
        Assert.Single(p2.Items);
        Assert.Null(p2.NextCursor);
    }

    [Fact]
    public async Task Computed_groups_reject_manual_member_edits()
    {
        var editor = await _host.EditorAsync();
        var unit = await _host.UnitAsync();
        var rule = await ApiSession.ReadAsync<GroupDto>(await editor.PostAsync("/api/manage/groups", new
        {
            name = Unique("Rule "), kind = "rule", rule = new { all = new object[] { new { field = "org_unit", id = unit } } },
        }), HttpStatusCode.Created);
        var code = await _host.EmployeeAsync(unit);

        Assert.Equal(HttpStatusCode.Conflict, (await editor.PutAsync($"/api/manage/groups/{rule.Id}/members", new { codes = new[] { code } })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await editor.DeleteAsync($"/api/manage/groups/{rule.Id}/members", new { codes = new[] { code } })).StatusCode);
    }

    // ---- import ----

    [Fact]
    public async Task Csv_import_dry_run_reports_without_writing_then_apply_adds()
    {
        var editor = await _host.EditorAsync();
        var unit = await _host.UnitAsync();
        var fresh1 = await _host.EmployeeAsync(unit);
        var fresh2 = await _host.EmployeeAsync(unit);
        var already = await _host.EmployeeAsync(unit);
        var inactive = await _host.EmployeeAsync(unit, status: EmployeeStatuses.Inactive);
        var group = await CreateStaticAsync(editor);
        await editor.PutAsync($"/api/manage/groups/{group.Id}/members", new { codes = new[] { already } });

        var csv = Encoding.UTF8.GetBytes($"﻿MSCB,Họ tên\r\n{fresh1},A\r\n{fresh2},\"B, C\"\r\n{already},D\r\n{fresh1},dup\r\nZZ-UNKNOWN,E\r\n{inactive},F\r\n\r\n");
        var url = $"/api/manage/groups/{group.Id}/members/import";

        var dry = await ApiSession.ReadAsync<ImportReportDto>(await editor.PostFileAsync(url + "?dryRun=true", "ds.csv", csv));
        Assert.True(dry.DryRun);
        Assert.Equal(6, dry.Rows);
        Assert.Equal(new[] { fresh1, fresh2 }.Order(), dry.Added.Order());
        Assert.Equal(new[] { already }, dry.AlreadyMember);
        Assert.Equal(new[] { fresh1 }, dry.Duplicate);
        Assert.Equal(new[] { "ZZ-UNKNOWN" }, dry.Unknown);
        Assert.Equal(new[] { inactive }, dry.Inactive);
        Assert.Equal(1, dry.MemberCount);
        Assert.Equal(1, _host.Log.CallsFor(group.Id)); // only the manual add so far

        var applied = await ApiSession.ReadAsync<ImportReportDto>(await editor.PostFileAsync(url + "?dryRun=false", "ds.csv", csv));
        Assert.False(applied.DryRun);
        Assert.Equal(3, applied.MemberCount);
        Assert.Equal(new[] { already, fresh1, fresh2 }.Order(StringComparer.Ordinal), _host.Log.AddedFor(group.Id));

        var actions = await _host.Factory.WithDbAsync(db => db.Set<AuditLogEntry>().AsNoTracking()
            .Where(x => x.TargetId == group.Id.ToString()).Select(x => x.Action).ToListAsync());
        Assert.Contains("group.members_imported", actions);
    }

    [Fact]
    public async Task Xlsx_import_finds_the_code_column_by_its_header()
    {
        var editor = await _host.EditorAsync();
        var a = await _host.EmployeeAsync();
        var b = await _host.EmployeeAsync();
        var group = await CreateStaticAsync(editor);

        using var wb = new XLWorkbook();
        var ws = wb.AddWorksheet("DS");
        ws.Cell(1, 1).Value = "Họ tên";
        ws.Cell(1, 2).Value = "Mã số cán bộ";
        ws.Cell(2, 1).Value = "A";
        ws.Cell(2, 2).Value = a;
        ws.Cell(3, 1).Value = "B";
        ws.Cell(3, 2).Value = b;
        using var ms = new MemoryStream();
        wb.SaveAs(ms);

        var report = await ApiSession.ReadAsync<ImportReportDto>(
            await editor.PostFileAsync($"/api/manage/groups/{group.Id}/members/import?dryRun=false", "ds.xlsx", ms.ToArray()));
        Assert.Equal(new[] { a, b }.Order(), report.Added.Order());
        Assert.Equal(2, report.MemberCount);
    }

    [Fact]
    public async Task Import_rejects_bad_files_and_non_static_groups()
    {
        var editor = await _host.EditorAsync();
        var group = await CreateStaticAsync(editor);
        var url = $"/api/manage/groups/{group.Id}/members/import";

        Assert.Equal(HttpStatusCode.BadRequest, (await editor.PostFileAsync(url, "x.pdf", [1, 2, 3])).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await editor.PostFileAsync(url, "x.xlsx", Encoding.UTF8.GetBytes("not a workbook"))).StatusCode);

        var employee = await _host.SignInAsync();
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.PostFileAsync(url, "x.csv", Encoding.UTF8.GetBytes("T1"))).StatusCode);
    }
}
