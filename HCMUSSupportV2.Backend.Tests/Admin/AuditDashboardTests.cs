using System.Net;
using System.Text.Json;
using HCMUSSupportV2.Backend.Modules.Admin;
using HCMUSSupportV2.Backend.Modules.Admin.Dashboard;
using HCMUSSupportV2.Backend.Modules.Identity.Authentication;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using HCMUSSupportV2.Backend.Tests.Identity;
using HCMUSSupportV2.Backend.Tests.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using static HCMUSSupportV2.Backend.Tests.Admin.AdminTestSupport;
using static HCMUSSupportV2.Backend.Tests.Infrastructure.IdentityTestSupport;

namespace HCMUSSupportV2.Backend.Tests.Admin;

public class FakeContributor : IDashboardContributor
{
    public Task<IEnumerable<DashboardTile>> GetTilesAsync(CancellationToken ct) =>
        Task.FromResult<IEnumerable<DashboardTile>>([new DashboardTile("test.fake", "Thử nghiệm", 42, "gợi ý", TileSeverity.Warning, "%")]);
}

public class BrokenContributor : IDashboardContributor
{
    public Task<IEnumerable<DashboardTile>> GetTilesAsync(CancellationToken ct) => throw new InvalidOperationException("boom");
}

[Collection(PostgresCollection.Name)]
public class AuditDashboardTests(PostgresFixture database) : IAsyncLifetime
{
    private readonly TestApiFactory _factory = new(database, configureServices: s =>
    {
        TestControllers.Add(s);
        s.AddDashboardContributor<FakeContributor>();
        s.AddDashboardContributor<BrokenContributor>();
    });

    public Task InitializeAsync()
    {
        _ = _factory.Server;
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    private async Task<string> InsertAuditAsync(string action, string? actor, DateTimeOffset at, string? targetType = "thing", string? targetId = null,
        string? actingAs = null)
    {
        await _factory.WithDbAsync(async db =>
        {
            db.Set<AuditLogEntry>().Add(new AuditLogEntry
            {
                Action = action, ActorCode = actor, ActingAsCode = actingAs, At = at, TargetType = targetType, TargetId = targetId,
                Details = "{\"k\":1}",
            });
            await db.SaveChangesAsync();
            return 0;
        });
        return action;
    }

    // ---- audit ----

    [Fact]
    public async Task Audit_query_filters_by_actor_action_target_and_time_and_joins_names()
    {
        var admin = await _factory.SignInNewAsync(Roles.Admin);
        var actor = await CreateEmployeeAsync(_factory, fullName: "Lê Văn Người Làm");
        var viewed = await CreateEmployeeAsync(_factory, fullName: "Phạm Thị Được Xem");
        var tag = "t." + Guid.NewGuid().ToString("N")[..8];
        var t0 = DateTimeOffset.UtcNow.AddDays(-30);
        await InsertAuditAsync(tag + ".a", actor, t0, "employee", "E1", actingAs: viewed);
        await InsertAuditAsync(tag + ".b", actor, t0.AddHours(1), "group", "G1");
        await InsertAuditAsync(tag + ".b", "someone-else", t0.AddHours(2), "group", "G2");

        Task<JsonElement> Query(string q) => admin.GetAsync("/api/admin/audit?" + q).ContinueWith(t => t.Result.ReadAsync()).Unwrap();

        var byAction = await Query($"action={tag}.b");
        Assert.Equal(2, byAction.GetProperty("items").GetArrayLength());
        Assert.Equal("G2", byAction.GetProperty("items")[0].GetProperty("targetId").GetString()); // newest first

        var byPrefix = await Query($"action={tag}.*");
        Assert.Equal(3, byPrefix.GetProperty("items").GetArrayLength());

        var byActor = await Query($"action={tag}.*&actor={actor}");
        Assert.Equal(2, byActor.GetProperty("items").GetArrayLength());

        var byTarget = await Query($"action={tag}.*&targetType=group&targetId=G1");
        var single = Assert.Single(byTarget.GetProperty("items").EnumerateArray());
        Assert.Equal("Lê Văn Người Làm", single.GetProperty("actorName").GetString());

        var joined = Assert.Single((await Query($"action={tag}.a")).GetProperty("items").EnumerateArray());
        Assert.Equal("Lê Văn Người Làm", joined.GetProperty("actorName").GetString());
        Assert.Equal(viewed, joined.GetProperty("actingAsCode").GetString());
        Assert.Equal("Phạm Thị Được Xem", joined.GetProperty("actingAsName").GetString());
        Assert.Equal(1, joined.GetProperty("details").GetProperty("k").GetInt32());

        var from = Uri.EscapeDataString(t0.AddMinutes(30).ToString("O"));
        var to = Uri.EscapeDataString(t0.AddMinutes(90).ToString("O"));
        var window = Assert.Single((await Query($"action={tag}.*&from={from}&to={to}")).GetProperty("items").EnumerateArray());
        Assert.Equal("G1", window.GetProperty("targetId").GetString());
    }

    [Fact]
    public async Task Audit_query_pages_by_time_and_id_even_when_timestamps_tie()
    {
        var admin = await _factory.SignInNewAsync(Roles.Admin);
        var tag = "k." + Guid.NewGuid().ToString("N")[..8];
        var t = DateTimeOffset.UtcNow.AddDays(-20);
        for (var i = 0; i < 7; i++) // three distinct instants, rows 2..4 share one
            await InsertAuditAsync(tag, null, i is >= 2 and <= 4 ? t.AddMinutes(2) : t.AddMinutes(i), targetId: i.ToString());

        var ids = new List<long>();
        string? cursor = null;
        var pages = 0;
        do
        {
            var page = await (await admin.GetAsync($"/api/admin/audit?action={tag}&limit=3" + (cursor is null ? "" : $"&cursor={cursor}"))).ReadAsync();
            ids.AddRange(page.GetProperty("items").EnumerateArray().Select(x => x.GetProperty("id").GetInt64()));
            cursor = page.GetProperty("nextCursor").GetString();
            pages++;
        } while (cursor is not null && pages < 10);

        Assert.Equal(7, ids.Count);
        Assert.Equal(ids.Distinct().Count(), ids.Count);
        Assert.Equal(3, pages);
    }

    [Fact]
    public async Task Audit_actions_lists_distinct_names()
    {
        var admin = await _factory.SignInNewAsync(Roles.Admin);
        var tag = "d." + Guid.NewGuid().ToString("N")[..8];
        await InsertAuditAsync(tag, null, DateTimeOffset.UtcNow);
        await InsertAuditAsync(tag, null, DateTimeOffset.UtcNow);

        var actions = (await (await admin.GetAsync("/api/admin/audit/actions")).ReadAsync()).EnumerateArray().Select(x => x.GetString()).ToList();

        Assert.Single(actions, tag);
        Assert.Equal(actions.OrderBy(x => x, StringComparer.Ordinal).ToList(), actions.OrderBy(x => x, StringComparer.Ordinal).ToList());
    }

    [Fact]
    public async Task Audit_and_dashboard_are_admin_only()
    {
        var editor = await _factory.SignInNewAsync(Roles.Editor);

        foreach (var url in new[] { "/api/admin/audit", "/api/admin/audit/actions", "/api/admin/dashboard" })
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await editor.GetAsync(url)).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.CreateSessionClient().GetAsync(url)).StatusCode);
        }
    }

    // ---- dashboard ----

    [Fact]
    public async Task Dashboard_has_identity_tiles_contributed_tiles_and_recent_activity_and_skips_a_failing_contributor()
    {
        var admin = await _factory.SignInNewAsync(Roles.Admin);
        var noEmail = await CreateEmployeeAsync(_factory, emails: []);
        await CreateEmployeeAsync(_factory, roles: [Roles.Editor]);
        var loginTag = "dash." + Guid.NewGuid().ToString("N")[..6];
        var before = await TilesAsync(admin);

        await InsertAuditAsync(AuthAuditActions.Login, loginTag + "1", DateTimeOffset.UtcNow.AddDays(-1), "employee");
        await InsertAuditAsync(AuthAuditActions.Login, loginTag + "1", DateTimeOffset.UtcNow.AddDays(-2), "employee");
        await InsertAuditAsync(AuthAuditActions.Login, loginTag + "2", DateTimeOffset.UtcNow.AddHours(-1), "employee");
        await InsertAuditAsync(AuthAuditActions.Login, loginTag + "3", DateTimeOffset.UtcNow.AddDays(-9), "employee"); // too old
        var response = await admin.GetAsync("/api/admin/dashboard");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.ReadAsync();
        var tiles = body.GetProperty("tiles").EnumerateArray().ToDictionary(t => t.GetProperty("key").GetString()!);

        foreach (var key in new[]
                 {
                     "identity.employees.active", "identity.employees.with_email", "identity.roles.editors",
                     "identity.roles.admins", "identity.signins.7d",
                 })
            Assert.True(tiles.ContainsKey(key), key);

        Assert.Equal(before["identity.signins.7d"] + 2, tiles["identity.signins.7d"].GetProperty("value").GetDouble());
        Assert.True(tiles["identity.employees.active"].GetProperty("value").GetDouble() >=
                    tiles["identity.employees.with_email"].GetProperty("value").GetDouble() + 1);
        Assert.Equal("warning", tiles["identity.employees.with_email"].GetProperty("severity").GetString());
        Assert.True(tiles["identity.roles.admins"].GetProperty("value").GetDouble() >= 1);
        Assert.True(tiles["identity.roles.editors"].GetProperty("value").GetDouble() >= 1);
        Assert.Contains("Nhân sự", tiles["identity.employees.active"].GetProperty("label").GetString());

        var fake = tiles["test.fake"];
        Assert.Equal(42, fake.GetProperty("value").GetDouble());
        Assert.Equal("%", fake.GetProperty("unit").GetString());

        var recent = body.GetProperty("recentActivity");
        Assert.True(recent.GetArrayLength() is > 0 and <= 20);
        var times = recent.EnumerateArray().Select(x => x.GetProperty("at").GetDateTimeOffset()).ToList();
        Assert.Equal(times.OrderByDescending(x => x).ToList(), times);
        Assert.NotNull(noEmail);
    }

    private static async Task<Dictionary<string, double>> TilesAsync(Session admin)
    {
        var body = await (await admin.GetAsync("/api/admin/dashboard")).ReadAsync();
        return body.GetProperty("tiles").EnumerateArray()
            .ToDictionary(t => t.GetProperty("key").GetString()!, t => t.GetProperty("value").GetDouble());
    }
}
