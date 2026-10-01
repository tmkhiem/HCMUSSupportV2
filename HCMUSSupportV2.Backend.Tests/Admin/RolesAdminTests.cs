using System.Net;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Tests.Identity;
using HCMUSSupportV2.Backend.Tests.Infrastructure;
using static HCMUSSupportV2.Backend.Tests.Admin.AdminTestSupport;
using static HCMUSSupportV2.Backend.Tests.Infrastructure.IdentityTestSupport;

namespace HCMUSSupportV2.Backend.Tests.Admin;

[Collection(PostgresCollection.Name)]
public class RolesAdminTests(PostgresFixture database) : IAsyncLifetime
{
    private readonly TestApiFactory _factory = new(database, configureServices: s =>
    {
        TestControllers.Add(s);
    });

    public Task InitializeAsync()
    {
        _ = _factory.Server;
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    private static object Roles_(params string[] roles) => new { roles };

    [Fact]
    public async Task Admin_grants_editor_and_the_grant_is_listed_and_audited()
    {
        var admin = await _factory.SignInNewAsync(Roles.Admin);
        var target = await CreateEmployeeAsync(_factory);

        var put = await admin.SendAsync(HttpMethod.Put, $"/api/admin/roles/{target}", Roles_("editor"));

        Assert.Equal(HttpStatusCode.OK, put.StatusCode);
        var detail = await put.ReadAsync();
        Assert.Equal(["editor"], detail.GetProperty("roles").EnumerateArray().Select(x => x.GetString()!).ToArray());
        Assert.Equal(admin.Code, detail.GetProperty("grants")[0].GetProperty("grantedBy").GetString());

        var get = await (await admin.GetAsync($"/api/admin/roles/{target}")).ReadAsync();
        Assert.Equal(target, get.GetProperty("code").GetString());
        Assert.Single(get.GetProperty("emails").EnumerateArray());

        var audit = Assert.Single(await _factory.AuditAsync("roles.granted", target));
        Assert.Equal(admin.Code, audit.ActorCode);
        Assert.Contains("editor", audit.Details);
    }

    [Fact]
    public async Task Revoking_a_role_is_audited_and_the_set_is_replaced_exactly()
    {
        var admin = await _factory.SignInNewAsync(Roles.Admin);
        var target = await CreateEmployeeAsync(_factory, roles: [Roles.Editor, Roles.Admin]);

        var put = await admin.SendAsync(HttpMethod.Put, $"/api/admin/roles/{target}", Roles_("editor", "employee"));

        Assert.Equal(HttpStatusCode.OK, put.StatusCode);
        Assert.Equal(["editor"], (await put.ReadAsync()).GetProperty("roles").EnumerateArray().Select(x => x.GetString()!).ToArray());
        Assert.Single(await _factory.AuditAsync("roles.revoked", target));
        Assert.Empty(await _factory.AuditAsync("roles.granted", target));

        Assert.Equal(HttpStatusCode.OK, (await admin.SendAsync(HttpMethod.Put, $"/api/admin/roles/{target}", Roles_())).StatusCode);
        Assert.Equal(2, (await _factory.AuditAsync("roles.revoked", target)).Count);
    }

    [Fact]
    public async Task The_last_admin_cannot_be_demoted_but_can_once_another_admin_exists()
    {
        var admin = await _factory.SignInNewAsync(Roles.Admin);
        await _factory.RemoveOtherAdminsAsync(admin.Code);

        var refused = await admin.SendAsync(HttpMethod.Put, $"/api/admin/roles/{admin.Code}", Roles_("editor"));
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Contains("quản trị viên cuối cùng", await refused.Content.ReadAsStringAsync());
        Assert.Empty(await _factory.AuditAsync("roles.revoked", admin.Code));
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync("/api/test/admin")).StatusCode);

        var second = await CreateEmployeeAsync(_factory, roles: [Roles.Admin]);
        var allowed = await admin.SendAsync(HttpMethod.Put, $"/api/admin/roles/{admin.Code}", Roles_("editor"));
        Assert.Equal(HttpStatusCode.OK, allowed.StatusCode);
        // The demoted admin lost the right immediately (the test host revalidates on every request).
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.GetAsync("/api/test/admin")).StatusCode);
        Assert.NotNull(second);
    }

    [Fact]
    public async Task Granting_an_unknown_role_is_400_and_an_unknown_employee_404()
    {
        var admin = await _factory.SignInNewAsync(Roles.Admin);
        var target = await CreateEmployeeAsync(_factory);

        Assert.Equal(HttpStatusCode.BadRequest, (await admin.SendAsync(HttpMethod.Put, $"/api/admin/roles/{target}", Roles_("superuser"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.SendAsync(HttpMethod.Put, "/api/admin/roles/NOPE", Roles_("editor"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync("/api/admin/roles/NOPE")).StatusCode);
    }

    [Fact]
    public async Task Editors_and_employees_are_forbidden_and_anonymous_is_unauthorized()
    {
        var editor = await _factory.SignInNewAsync(Roles.Editor);
        var employee = await _factory.SignInNewAsync();
        var target = await CreateEmployeeAsync(_factory);

        foreach (var s in new[] { editor, employee })
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await s.GetAsync("/api/admin/roles")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await s.GetAsync($"/api/admin/roles/{target}")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await s.SendAsync(HttpMethod.Put, $"/api/admin/roles/{target}", Roles_("admin"))).StatusCode);
        }

        Assert.Empty(await _factory.AuditAsync("roles.granted", target));
        Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.CreateSessionClient().GetAsync("/api/admin/roles")).StatusCode);
    }

    [Fact]
    public async Task List_filters_by_text_and_role_and_pages_with_a_keyset_cursor()
    {
        var admin = await _factory.SignInNewAsync(Roles.Admin);
        var prefix = "LST" + Guid.NewGuid().ToString("N")[..6].ToUpperInvariant();
        var codes = new List<string>();
        for (var i = 0; i < 5; i++)
            codes.Add(await CreateEmployeeAsync(_factory, code: $"{prefix}{i}", fullName: $"Nguyễn Đức {prefix} {i}",
                roles: i == 1 ? [Roles.Editor] : []));

        var seen = new List<string>();
        string? cursor = null;
        var pages = 0;
        do
        {
            var url = $"/api/admin/roles?q={prefix}&limit=2" + (cursor is null ? "" : $"&cursor={cursor}");
            var page = await (await admin.GetAsync(url)).ReadAsync();
            seen.AddRange(page.GetProperty("items").EnumerateArray().Select(x => x.GetProperty("code").GetString()!));
            cursor = page.GetProperty("nextCursor").GetString();
            pages++;
        } while (cursor is not null && pages < 10);

        Assert.Equal(codes, seen);
        Assert.Equal(3, pages);

        // accent-insensitive name search
        var byName = await (await admin.GetAsync($"/api/admin/roles?q=nguyen%20duc%20{prefix}")).ReadAsync();
        Assert.Equal(5, byName.GetProperty("items").GetArrayLength());

        var editors = await (await admin.GetAsync($"/api/admin/roles?q={prefix}&role=editor")).ReadAsync();
        var only = Assert.Single(editors.GetProperty("items").EnumerateArray());
        Assert.Equal(codes[1], only.GetProperty("code").GetString());
        Assert.Equal("editor", only.GetProperty("roles")[0].GetString());

        var plain = await (await admin.GetAsync($"/api/admin/roles?q={prefix}&role=employee")).ReadAsync();
        Assert.Equal(4, plain.GetProperty("items").GetArrayLength());
    }
}

/// <summary>A role change reaches a live session at once even though the revalidation interval is long.</summary>
[Collection(PostgresCollection.Name)]
public class RoleChangeInvalidationTests(PostgresFixture database) : IAsyncLifetime
{
    private readonly TestApiFactory _factory = new(database,
        new Dictionary<string, string?> { ["Auth:RevalidateSeconds"] = "300" }, TestControllers.Add);

    public Task InitializeAsync()
    {
        _ = _factory.Server;
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    [Fact]
    public async Task Granting_and_revoking_take_effect_on_the_next_request_without_waiting_for_revalidation()
    {
        var admin = await _factory.SignInNewAsync(Roles.Admin);
        var user = await _factory.SignInNewAsync();
        Assert.Equal(HttpStatusCode.Forbidden, (await user.GetAsync("/api/test/editor")).StatusCode);

        await admin.SendAsync(HttpMethod.Put, $"/api/admin/roles/{user.Code}", new { roles = new[] { "editor" } });
        Assert.Equal(HttpStatusCode.OK, (await user.GetAsync("/api/test/editor")).StatusCode);

        await admin.SendAsync(HttpMethod.Put, $"/api/admin/roles/{user.Code}", new { roles = Array.Empty<string>() });
        Assert.Equal(HttpStatusCode.Forbidden, (await user.GetAsync("/api/test/editor")).StatusCode);
    }
}
