using System.Net;
using System.Text.Json;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Tests.Identity;
using HCMUSSupportV2.Backend.Tests.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using static HCMUSSupportV2.Backend.Tests.Admin.AdminTestSupport;
using static HCMUSSupportV2.Backend.Tests.Infrastructure.IdentityTestSupport;

namespace HCMUSSupportV2.Backend.Tests.Admin;

[Collection(PostgresCollection.Name)]
public class ViewAsTests(PostgresFixture database) : IAsyncLifetime
{
    private readonly ManualTimeProvider _time = new(DateTimeOffset.UtcNow);
    private TestApiFactory _factory = null!;

    public Task InitializeAsync()
    {
        _factory = new TestApiFactory(database, configureServices: s =>
        {
            TestControllers.Add(s);
            s.AddSingleton<TimeProvider>(_time);
        });
        _ = _factory.Server;
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    private static object Start(string code) => new { employeeCode = code };

    [Fact]
    public async Task Start_switches_the_effective_code_and_me_reports_actingAs_while_the_top_level_stays_the_admin()
    {
        var admin = await _factory.SignInNewAsync(Roles.Admin);
        var target = await CreateEmployeeAsync(_factory, fullName: "Trần Thị Xem Thử");

        var start = await admin.SendAsync(HttpMethod.Post, "/api/admin/view-as", Start(target));
        Assert.Equal(HttpStatusCode.OK, start.StatusCode);
        var started = await start.ReadAsync();
        Assert.Equal(target, started.GetProperty("code").GetString());
        Assert.True(started.GetProperty("expiresAt").GetDateTimeOffset() > _time.GetUtcNow().AddMinutes(59));

        var me = await (await admin.GetAsync("/api/auth/me")).ReadAsync();
        Assert.Equal(admin.Code, me.GetProperty("code").GetString());
        Assert.Contains("admin", me.GetProperty("roles").EnumerateArray().Select(x => x.GetString()));
        var acting = me.GetProperty("actingAs");
        Assert.Equal(target, acting.GetProperty("code").GetString());
        Assert.Equal("Trần Thị Xem Thử", acting.GetProperty("fullName").GetString());

        var who = await (await admin.GetAsync("/api/me/test/whoami")).ReadAsync();
        Assert.Equal(admin.Code, who.GetProperty("code").GetString());
        Assert.Equal(target, who.GetProperty("effectiveCode").GetString());
        Assert.True(who.GetProperty("isActingAs").GetBoolean());

        var startedAudit = Assert.Single(await _factory.AuditAsync("viewas.started", target));
        Assert.Equal(admin.Code, startedAudit.ActorCode);
        Assert.Null(startedAudit.ActingAsCode);
    }

    [Fact]
    public async Task Unsafe_methods_are_blocked_while_acting_except_stopping_and_logging_out()
    {
        var admin = await _factory.SignInNewAsync(Roles.Admin);
        var target = await CreateEmployeeAsync(_factory);
        await admin.SendAsync(HttpMethod.Post, "/api/admin/view-as", Start(target));

        foreach (var (method, url) in new[]
                 {
                     (HttpMethod.Post, "/api/me/test/write"),
                     (HttpMethod.Put, $"/api/admin/roles/{target}"),
                     (HttpMethod.Delete, "/api/test/delete"),
                     (HttpMethod.Patch, "/api/anything"),
                     (HttpMethod.Post, "/api/admin/view-as"),
                 })
        {
            var response = await admin.SendAsync(method, url, new { roles = new[] { "admin" }, employeeCode = target });
            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
            Assert.Contains("Đang ở chế độ xem thử — không thể thay đổi dữ liệu", await response.Content.ReadAsStringAsync());
        }

        Assert.Empty(await _factory.AuditAsync("roles.granted", target));
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync("/api/test/employee")).StatusCode); // reads still work

        // Stop is allowed and restores a writable session with the same antiforgery token.
        Assert.Equal(HttpStatusCode.NoContent, (await admin.SendAsync(HttpMethod.Delete, "/api/admin/view-as")).StatusCode);
        var me = await (await admin.GetAsync("/api/auth/me")).ReadAsync();
        Assert.Equal(JsonValueKind.Null, me.GetProperty("actingAs").ValueKind);
        Assert.Equal(HttpStatusCode.OK, (await admin.SendAsync(HttpMethod.Post, "/api/me/test/write")).StatusCode);

        var stopped = Assert.Single(await _factory.AuditAsync("viewas.stopped", target));
        Assert.Equal(admin.Code, stopped.ActorCode);
        Assert.Equal(target, stopped.ActingAsCode);
    }

    [Fact]
    public async Task Logout_is_allowed_while_acting()
    {
        var admin = await _factory.SignInNewAsync(Roles.Admin);
        var target = await CreateEmployeeAsync(_factory);
        await admin.SendAsync(HttpMethod.Post, "/api/admin/view-as", Start(target));

        Assert.Equal(HttpStatusCode.NoContent, (await admin.SendAsync(HttpMethod.Post, "/api/auth/logout")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await admin.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Reads_of_me_and_notifications_are_audited_with_path_and_query_but_other_reads_are_not()
    {
        var admin = await _factory.SignInNewAsync(Roles.Admin);
        var target = await CreateEmployeeAsync(_factory);
        await admin.SendAsync(HttpMethod.Post, "/api/admin/view-as", Start(target));

        await admin.GetAsync("/api/me/test/whoami?year=2024");
        await admin.GetAsync("/api/notifications/test/ping");
        await admin.GetAsync("/api/test/employee");
        await admin.GetAsync("/api/auth/me");

        var reads = await _factory.AuditAsync("viewas.read", target);
        Assert.Equal(2, reads.Count);
        Assert.All(reads, r =>
        {
            Assert.Equal(admin.Code, r.ActorCode);
            Assert.Equal(target, r.ActingAsCode);
        });
        Assert.Contains("/api/me/test/whoami", reads[0].Details);
        Assert.Contains("?year=2024", reads[0].Details);
        Assert.Contains("/api/notifications/test/ping", reads[1].Details);
    }

    [Fact]
    public async Task Nothing_is_audited_as_viewas_read_when_not_acting()
    {
        var admin = await _factory.SignInNewAsync(Roles.Admin);
        var before = (await _factory.AuditAsync("viewas.read")).Count;

        await admin.GetAsync("/api/me/test/whoami");

        Assert.Equal(before, (await _factory.AuditAsync("viewas.read")).Count);
        var who = await (await admin.GetAsync("/api/me/test/whoami")).ReadAsync();
        Assert.Equal(admin.Code, who.GetProperty("effectiveCode").GetString());
    }

    [Fact]
    public async Task Cannot_view_as_yourself_or_an_unknown_employee_and_only_admins_may_start()
    {
        var admin = await _factory.SignInNewAsync(Roles.Admin);
        var editor = await _factory.SignInNewAsync(Roles.Editor);
        var target = await CreateEmployeeAsync(_factory);

        Assert.Equal(HttpStatusCode.BadRequest, (await admin.SendAsync(HttpMethod.Post, "/api/admin/view-as", Start(admin.Code))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.SendAsync(HttpMethod.Post, "/api/admin/view-as", Start("NOPE"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await editor.SendAsync(HttpMethod.Post, "/api/admin/view-as", Start(target))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await editor.SendAsync(HttpMethod.Delete, "/api/admin/view-as")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.CreateSessionClient().PostAsync("/api/admin/view-as", null)).StatusCode);
        Assert.Empty(await _factory.AuditAsync("viewas.started", target));
    }

    [Fact]
    public async Task Stopping_when_not_acting_is_a_harmless_no_op()
    {
        var admin = await _factory.SignInNewAsync(Roles.Admin);

        Assert.Equal(HttpStatusCode.NoContent, (await admin.SendAsync(HttpMethod.Delete, "/api/admin/view-as")).StatusCode);
        Assert.Empty(await _factory.AuditAsync("viewas.stopped", admin.Code));
    }

    [Fact]
    public async Task The_session_expires_after_sixty_minutes_and_becomes_writable_again()
    {
        var admin = await _factory.SignInNewAsync(Roles.Admin);
        var target = await CreateEmployeeAsync(_factory);
        await admin.SendAsync(HttpMethod.Post, "/api/admin/view-as", Start(target));

        _time.Advance(TimeSpan.FromMinutes(59));
        Assert.True((await (await admin.GetAsync("/api/me/test/whoami")).ReadAsync()).GetProperty("isActingAs").GetBoolean());

        _time.Advance(TimeSpan.FromMinutes(2));
        var who = await (await admin.GetAsync("/api/me/test/whoami")).ReadAsync();
        Assert.False(who.GetProperty("isActingAs").GetBoolean());
        Assert.Equal(admin.Code, who.GetProperty("effectiveCode").GetString());
        var me = await (await admin.GetAsync("/api/auth/me")).ReadAsync();
        Assert.Equal(JsonValueKind.Null, me.GetProperty("actingAs").ValueKind);
        Assert.Equal(HttpStatusCode.OK, (await admin.SendAsync(HttpMethod.Post, "/api/me/test/write")).StatusCode);
    }
}
