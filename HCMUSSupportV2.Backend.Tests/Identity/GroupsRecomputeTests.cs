using System.Net;
using System.Text.Json;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Modules.Identity.Groups;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using HCMUSSupportV2.Backend.Modules.Platform.Jobs;
using HCMUSSupportV2.Backend.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static HCMUSSupportV2.Backend.Tests.Identity.GroupsTestHost;

namespace HCMUSSupportV2.Backend.Tests.Identity;

/// <summary>Rule and org-unit groups: recompute diff, observers, automatic org-unit groups, jobs.</summary>
[Collection(PostgresCollection.Name)]
public class GroupsRecomputeTests(PostgresFixture database) : IAsyncLifetime
{
    private GroupsTestHost _host = null!;

    public Task InitializeAsync()
    {
        _host = new GroupsTestHost(database);
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    private Task<GroupRecomputeResult> RecomputeAllAsync() =>
        _host.InScopeAsync(sp => sp.GetRequiredService<GroupRecomputeService>().RecomputeAllAsync(CancellationToken.None));

    private Task<string[]> MembersAsync(long groupId) => _host.Factory.WithDbAsync(async db =>
        (await db.Set<GroupMember>().AsNoTracking().Where(m => m.GroupId == groupId).Select(m => m.EmployeeCode).ToListAsync())
        .Order(StringComparer.Ordinal).ToArray());

    private async Task<GroupDto> CreateRuleGroupAsync(ApiSession editor, object rule, string? name = null) =>
        await ApiSession.ReadAsync<GroupDto>(
            await editor.PostAsync("/api/manage/groups", new { name = name ?? Unique("Rule "), kind = "rule", rule }),
            HttpStatusCode.Created);

    private static object InUnit(long unit, bool descendants = false) =>
        new { all = new object[] { new { field = "org_unit", id = unit, includeDescendants = descendants } } };

    [Fact]
    public async Task Creating_a_rule_group_computes_members_and_notifies_observers()
    {
        var editor = await _host.EditorAsync();
        var unit = await _host.UnitAsync();
        var a = await _host.EmployeeAsync(unit);
        var b = await _host.EmployeeAsync(unit);
        await _host.EmployeeAsync(unit, status: EmployeeStatuses.Inactive);

        var group = await CreateRuleGroupAsync(editor, InUnit(unit));

        Assert.Equal(2, group.MemberCount);
        Assert.NotNull(group.Rule);
        Assert.Equal(new[] { a, b }.Order(StringComparer.Ordinal), await MembersAsync(group.Id));
        Assert.Equal(new[] { a, b }.Order(StringComparer.Ordinal), _host.Log.AddedFor(group.Id));
        var members = await ApiSession.ReadAsync<GroupMemberPageDto>(await editor.GetAsync($"/api/manage/groups/{group.Id}/members"));
        Assert.All(members.Items, m => Assert.Equal("computed", m.Source));
    }

    [Fact]
    public async Task Recompute_diff_inserts_new_matches_deletes_gone_and_notifies_only_the_added()
    {
        var editor = await _host.EditorAsync();
        var unit = await _host.UnitAsync();
        var other = await _host.UnitAsync();
        var stays = await _host.EmployeeAsync(unit);
        var leaves = await _host.EmployeeAsync(unit);
        var retires = await _host.EmployeeAsync(unit);
        var group = await CreateRuleGroupAsync(editor, InUnit(unit));
        Assert.Equal(3, group.MemberCount);
        var before = _host.Log.CallsFor(group.Id);

        var joins = await _host.EmployeeAsync(unit);
        await _host.Factory.WithDbAsync(async db =>
        {
            await db.Set<Employee>().Where(e => e.Code == leaves).ExecuteUpdateAsync(s => s.SetProperty(e => e.OrgUnitId, other));
            await db.Set<Employee>().Where(e => e.Code == retires).ExecuteUpdateAsync(s => s.SetProperty(e => e.Status, EmployeeStatuses.Retired));
            return 0;
        });

        var result = await _host.InScopeAsync(sp => sp.GetRequiredService<GroupRecomputeService>().RecomputeGroupAsync(group.Id, CancellationToken.None));

        Assert.Equal(1, result.Added);
        Assert.Equal(2, result.Removed);
        Assert.Equal(new[] { stays, joins }.Order(StringComparer.Ordinal), await MembersAsync(group.Id));
        Assert.Equal(before + 1, _host.Log.CallsFor(group.Id));
        Assert.Equal([joins], _host.Log.Calls.Last(c => c.GroupId == group.Id).Codes);
        var count = (await ApiSession.ReadAsync<GroupDto>(await editor.GetAsync($"/api/manage/groups/{group.Id}"))).MemberCount;
        Assert.Equal(2, count);

        // A second run changes nothing and notifies nobody.
        var again = await _host.InScopeAsync(sp => sp.GetRequiredService<GroupRecomputeService>().RecomputeGroupAsync(group.Id, CancellationToken.None));
        Assert.Equal(0, again.Added + again.Removed);
        Assert.Equal(before + 1, _host.Log.CallsFor(group.Id));
    }

    [Fact]
    public async Task Changing_the_rule_recomputes_immediately()
    {
        var editor = await _host.EditorAsync();
        var unitA = await _host.UnitAsync();
        var unitB = await _host.UnitAsync();
        var a = await _host.EmployeeAsync(unitA);
        var b = await _host.EmployeeAsync(unitB);
        var name = Unique("Rule ");
        var group = await CreateRuleGroupAsync(editor, InUnit(unitA), name);

        var updated = await ApiSession.ReadAsync<GroupDto>(await editor.PutAsync($"/api/manage/groups/{group.Id}", new { name, rule = InUnit(unitB) }));

        Assert.Equal(1, updated.MemberCount);
        Assert.Equal([b], await MembersAsync(group.Id));
        Assert.Contains(b, _host.Log.AddedFor(group.Id));
        Assert.DoesNotContain(a, await MembersAsync(group.Id));
    }

    [Fact]
    public async Task Archived_groups_are_not_recomputed()
    {
        var editor = await _host.EditorAsync();
        var unit = await _host.UnitAsync();
        var first = await _host.EmployeeAsync(unit);
        var group = await CreateRuleGroupAsync(editor, InUnit(unit));
        await editor.DeleteAsync($"/api/manage/groups/{group.Id}");
        await _host.EmployeeAsync(unit);

        await RecomputeAllAsync();

        Assert.Equal([first], await MembersAsync(group.Id));

        // Restoring brings the group up to date.
        var restored = await ApiSession.ReadAsync<GroupDto>(await editor.PostAsync($"/api/manage/groups/{group.Id}/restore"));
        Assert.Equal(2, restored.MemberCount);
    }

    [Fact]
    public async Task Org_unit_groups_are_created_per_active_unit_with_and_without_descendants()
    {
        var editor = await _host.EditorAsync();
        var root = await _host.UnitAsync(Unique("Khoa "));
        var child = await _host.UnitAsync(Unique("Bộ môn "), root);
        var gone = await _host.UnitAsync(Unique("Cũ "), active: false);
        var inRoot = await _host.EmployeeAsync(root);
        var inChild = await _host.EmployeeAsync(child);
        await _host.EmployeeAsync(root, status: EmployeeStatuses.Inactive);

        var result = await RecomputeAllAsync();
        Assert.True(result.OrgUnitGroupsChanged >= 2);

        var groups = await _host.Factory.WithDbAsync(db => db.Set<Group>().AsNoTracking().Where(g => g.Kind == GroupKinds.OrgUnit).ToListAsync());
        var rootGroup = groups.Single(g => g.OrgUnitId == root);
        var childGroup = groups.Single(g => g.OrgUnitId == child);
        Assert.DoesNotContain(groups, g => g.OrgUnitId == gone);
        Assert.True(rootGroup.IncludeDescendants);

        Assert.Equal(new[] { inRoot, inChild }.Order(StringComparer.Ordinal), await MembersAsync(rootGroup.Id));
        Assert.Equal([inChild], await MembersAsync(childGroup.Id));

        // Editors can switch descendants off; the members follow at once.
        var off = await ApiSession.ReadAsync<GroupDto>(await editor.PutAsync($"/api/manage/groups/{rootGroup.Id}", new { includeDescendants = false, description = "Chỉ đơn vị" }));
        Assert.False(off.IncludeDescendants);
        Assert.Equal(1, off.MemberCount);
        Assert.Equal([inRoot], await MembersAsync(rootGroup.Id));

        // Running again keeps one group per unit.
        await RecomputeAllAsync();
        var again = await _host.Factory.WithDbAsync(db => db.Set<Group>().AsNoTracking().CountAsync(g => g.OrgUnitId == root));
        Assert.Equal(1, again);
    }

    [Fact]
    public async Task Org_unit_groups_follow_renames_deactivation_and_name_collisions_and_cannot_be_deleted()
    {
        var editor = await _host.EditorAsync();
        var name = Unique("Phòng ");
        var unit = await _host.UnitAsync(name);
        // A static group already uses the unit's name.
        await ApiSession.ReadAsync<GroupDto>(await editor.PostAsync("/api/manage/groups", new { name, kind = "static" }), HttpStatusCode.Created);
        await RecomputeAllAsync();
        var group = await _host.Factory.WithDbAsync(db => db.Set<Group>().AsNoTracking().SingleAsync(g => g.OrgUnitId == unit));
        Assert.NotEqual(name, group.Name);
        Assert.StartsWith(name, group.Name);

        Assert.Equal(HttpStatusCode.Conflict, (await editor.DeleteAsync($"/api/manage/groups/{group.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await editor.PutAsync($"/api/manage/groups/{group.Id}", new { rule = InUnit(unit) })).StatusCode);

        var renamed = Unique("Ban ");
        await _host.Factory.WithDbAsync(async db =>
        {
            await db.Set<OrgUnit>().Where(u => u.Id == unit).ExecuteUpdateAsync(s => s.SetProperty(u => u.Name, renamed));
            return 0;
        });
        await RecomputeAllAsync();
        var afterRename = await ApiSession.ReadAsync<GroupDto>(await editor.GetAsync($"/api/manage/groups/{group.Id}"));
        Assert.Equal(renamed, afterRename.Name);

        await _host.Factory.WithDbAsync(async db =>
        {
            await db.Set<OrgUnit>().Where(u => u.Id == unit).ExecuteUpdateAsync(s => s.SetProperty(u => u.IsActive, false));
            return 0;
        });
        await RecomputeAllAsync();
        Assert.NotNull((await ApiSession.ReadAsync<GroupDto>(await editor.GetAsync($"/api/manage/groups/{group.Id}"))).ArchivedAt);
        var visible = await ApiSession.ReadAsync<GroupPageDto>(await editor.GetAsync($"/api/manage/groups?q={renamed}"));
        Assert.Empty(visible.Items);

        await _host.Factory.WithDbAsync(async db =>
        {
            await db.Set<OrgUnit>().Where(u => u.Id == unit).ExecuteUpdateAsync(s => s.SetProperty(u => u.IsActive, true));
            return 0;
        });
        await RecomputeAllAsync();
        Assert.Null((await ApiSession.ReadAsync<GroupDto>(await editor.GetAsync($"/api/manage/groups/{group.Id}"))).ArchivedAt);
    }

    [Fact]
    public async Task The_job_handler_recomputes_and_audits_and_the_endpoint_queues_the_job()
    {
        var editor = await _host.EditorAsync();
        var unit = await _host.UnitAsync();
        var group = await CreateRuleGroupAsync(editor, InUnit(unit));
        var late = await _host.EmployeeAsync(unit);

        var accepted = await ApiSession.ReadAsync<RecomputeAcceptedDto>(
            await editor.PostAsync($"/api/manage/groups/recompute?groupId={group.Id}"), HttpStatusCode.Accepted);
        var queued = await _host.Factory.WithDbAsync(db => db.Set<Job>().AsNoTracking().SingleAsync(j => j.Id == accepted.JobId));
        Assert.Equal("groups.recompute", queued.Type);
        Assert.Contains($"{group.Id}", queued.Payload);

        await _host.InScopeAsync(async sp =>
        {
            var handler = sp.GetServices<IJobHandler>().Single(h => h.Type == "groups.recompute");
            await handler.HandleAsync(new JobContext(queued.Id, queued.Type, queued.Payload, 1, 5), CancellationToken.None);
            return 0;
        });

        Assert.Contains(late, await MembersAsync(group.Id));
        var audited = await _host.Factory.WithDbAsync(db => db.Set<AuditLogEntry>().AsNoTracking()
            .AnyAsync(a => a.Action == "group.recomputed" && a.TargetId == group.Id.ToString()));
        Assert.True(audited);
    }

    [Fact]
    public async Task Roster_sync_queues_one_full_recompute_until_it_starts()
    {
        await _host.Factory.WithDbAsync(async db =>
        {
            await db.Set<Job>().Where(j => j.Type == "groups.recompute").ExecuteDeleteAsync();
            return 0;
        });

        for (var i = 0; i < 3; i++)
            await _host.InScopeAsync(async sp =>
            {
                foreach (var observer in sp.GetServices<IRosterSyncObserver>()) await observer.OnRosterSyncedAsync(CancellationToken.None);
                return 0;
            });

        var jobs = await _host.Factory.WithDbAsync(db => db.Set<Job>().AsNoTracking().Where(j => j.Type == "groups.recompute").ToListAsync());
        var job = Assert.Single(jobs);
        Assert.Equal("{}", job.Payload.Replace(" ", ""));
        _ = JsonDocument.Parse(job.Payload);
    }
}
