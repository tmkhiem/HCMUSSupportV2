using System.Net;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Tests.Infrastructure;
using static HCMUSSupportV2.Backend.Tests.Notifications.NotificationsHost;

namespace HCMUSSupportV2.Backend.Tests.Notifications;

/// <summary>D09 helpers: the draft recipient estimate and the employee lookup of the targeting panel.</summary>
[Collection(PostgresCollection.Name)]
public class AudienceLookupTests(PostgresFixture database) : IAsyncLifetime
{
    private NotificationsHost _host = null!;
    private const string Manage = "/api/manage/notifications";

    public Task InitializeAsync()
    {
        _host = new NotificationsHost(database);
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    [Fact]
    public async Task Both_endpoints_need_the_editor_role()
    {
        var employee = await _host.SignInAsync(await _host.EmployeeAsync());
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.PostAsync($"{Manage}/audience-estimate", new { audienceAll = true })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.GetAsync($"{Manage}/employees?q=a")).StatusCode);
    }

    [Fact]
    public async Task Estimate_is_the_union_of_groups_employees_and_an_import_sheet_counting_active_people_once()
    {
        var a = await _host.EmployeeAsync();
        var b = await _host.EmployeeAsync();
        var c = await _host.EmployeeAsync();
        var inactive = await _host.EmployeeAsync(status: EmployeeStatuses.Inactive);
        var group = await _host.CreateGroupAsync(a, b, inactive);
        var editor = await _host.EditorApiAsync();

        var none = await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Post, $"{Manage}/audience-estimate", new { });
        Assert.Equal(0, (int?)none["count"]);

        var groupOnly = await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Post, $"{Manage}/audience-estimate", new { groupIds = new[] { group } });
        Assert.Equal(2, (int?)groupOnly["count"]); // the inactive member is not counted

        var overlap = await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Post, $"{Manage}/audience-estimate",
            new { groupIds = new[] { group }, employeeCodes = new[] { b, c, inactive, "NOPE" } });
        Assert.Equal(3, (int?)overlap["count"]); // a, b, c

        var all = await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Post, $"{Manage}/audience-estimate", new { audienceAll = true });
        Assert.True((int?)all["count"] >= 4); // everyone active with an email, at least the four created here minus the inactive one

        // An import sheet adds its MSCBs.
        var draftId = await CreateAsync(editor, Draft("Danh sách", "x", variables: new[] { new { key = "K", label = "K", type = "text" } }));
        var report = await editor.UploadAsync($"{Manage}/{draftId}/recipients/import", "ds.xlsx", Xlsx(["MSCB", "K"], [c, "1"], [c, "2"], [a, "3"]));
        var importId = System.Text.Json.Nodes.JsonNode.Parse(await report.Content.ReadAsStringAsync())!["importId"]!.GetValue<string>();
        var withImport = await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Post, $"{Manage}/audience-estimate",
            new { employeeCodes = new[] { b }, importId });
        Assert.Equal(3, (int?)withImport["count"]); // b + (c, a)
    }

    [Fact]
    public async Task Employee_lookup_matches_the_code_prefix_and_the_name_without_accents()
    {
        var code = await _host.EmployeeAsync(fullName: "Nguyễn Thị Đào Tạo");
        var editor = await _host.EditorApiAsync();

        var byName = await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, $"{Manage}/employees?q=dao%20tao");
        Assert.Contains(byName.AsArray(), n => (string?)n!["code"] == code && (string?)n["fullName"] == "Nguyễn Thị Đào Tạo");

        var byCode = await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, $"{Manage}/employees?q={code[..6].ToLowerInvariant()}");
        Assert.Contains(byCode.AsArray(), n => (string?)n!["code"] == code);

        var nothing = await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, $"{Manage}/employees?q=khong-ton-tai-%25");
        Assert.Empty(nothing.AsArray());
    }

    [Fact]
    public async Task Audience_members_lists_only_the_people_the_choices_reach_and_filters_them_by_name()
    {
        var a = await _host.EmployeeAsync(fullName: "Lê Thị Đào Tạo");
        var b = await _host.EmployeeAsync(fullName: "Trần Văn Khác");
        var outsider = await _host.EmployeeAsync(fullName: "Người Ngoài Đào Tạo");
        var inactive = await _host.EmployeeAsync(status: EmployeeStatuses.Inactive, fullName: "Đã Nghỉ Đào Tạo");
        var group = await _host.CreateGroupAsync(a, inactive);
        var editor = await _host.EditorApiAsync();

        var none = await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Post, $"{Manage}/audience-members", new { });
        Assert.Empty(none.AsArray());

        var members = await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Post, $"{Manage}/audience-members",
            new { groupIds = new[] { group }, employeeCodes = new[] { b } });
        var codes = members.AsArray().Select(n => (string?)n!["code"]).ToList();
        Assert.Contains(a, codes);
        Assert.Contains(b, codes);
        Assert.DoesNotContain(outsider, codes);
        Assert.DoesNotContain(inactive, codes);

        var filtered = await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Post, $"{Manage}/audience-members",
            new { groupIds = new[] { group }, employeeCodes = new[] { b }, q = "dao tao" });
        Assert.Equal(a, (string?)Assert.Single(filtered.AsArray())!["code"]);

        var employee = await _host.SignInAsync(await _host.EmployeeAsync());
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.PostAsync($"{Manage}/audience-members", new { audienceAll = true })).StatusCode);
    }
}
