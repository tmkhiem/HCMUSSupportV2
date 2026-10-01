using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Modules.Identity.Groups.Rules;
using HCMUSSupportV2.Backend.Modules.Platform.Jobs;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;

namespace HCMUSSupportV2.Backend.Modules.Identity.Groups;

/// <summary>Calls every registered <see cref="IGroupMembershipObserver"/>. A failing observer is logged and never blocks the others or the caller.</summary>
public class GroupMembershipNotifier(IEnumerable<IGroupMembershipObserver> observers, ILogger<GroupMembershipNotifier> logger)
{
    public async Task NotifyAddedAsync(long groupId, IReadOnlyCollection<string> codes, CancellationToken ct)
    {
        if (codes.Count == 0) return;
        foreach (var observer in observers)
        {
            try { await observer.OnMembersAddedAsync(groupId, codes, ct); }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Group membership observer {Observer} failed for group {GroupId} ({Count} added)",
                    observer.GetType().Name, groupId, codes.Count);
            }
        }
    }
}

public sealed record GroupRecomputeResult(int Groups, int Added, int Removed, int OrgUnitGroupsChanged, int Failed)
{
    public bool HasChanges => Added + Removed + OrgUnitGroupsChanged > 0;
}

/// <summary>
/// Keeps <c>org_unit</c> groups (one per active org unit) and the computed members of <c>org_unit</c> and <c>rule</c>
/// groups up to date. The diff is done in SQL: new employees are inserted (<c>source=computed</c>), employees that no
/// longer match are deleted, the count is refreshed and observers hear about the added codes only.
/// </summary>
public class GroupRecomputeService(
    AppDbContext db,
    GroupRuleParser parser,
    GroupRuleCompiler compiler,
    GroupMembershipNotifier notifier,
    TimeProvider time,
    ILogger<GroupRecomputeService> logger)
{
    private const long OrgUnitGroupsLockKey = 0x0600_0000_0000_0000L;
    private const long GroupLockBase = 0x0600_0001_0000_0000L;
    private const int MaxNameLength = 300;

    /// <summary>Ensures the org-unit groups, then recomputes every non-archived org-unit and rule group.</summary>
    public async Task<GroupRecomputeResult> RecomputeAllAsync(CancellationToken ct)
    {
        var unitChanges = await EnsureOrgUnitGroupsAsync(ct);
        var ids = await db.Set<Group>().AsNoTracking()
            .Where(g => g.ArchivedAt == null && g.Kind != GroupKinds.Static)
            .OrderBy(g => g.Id).Select(g => g.Id).ToListAsync(ct);

        int added = 0, removed = 0, failed = 0;
        foreach (var id in ids)
        {
            try
            {
                var (a, r) = await RecomputeOneAsync(id, ct);
                added += a;
                removed += r;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                failed++;
                logger.LogError(ex, "Recompute of group {GroupId} failed", id);
            }
        }
        return new GroupRecomputeResult(ids.Count, added, removed, unitChanges, failed);
    }

    /// <summary>Recomputes one group (no-op for static or archived groups). Throws when the rule is invalid.</summary>
    public async Task<GroupRecomputeResult> RecomputeGroupAsync(long groupId, CancellationToken ct)
    {
        var (a, r) = await RecomputeOneAsync(groupId, ct);
        return new GroupRecomputeResult(1, a, r, 0, 0);
    }

    private async Task<(int Added, int Removed)> RecomputeOneAsync(long groupId, CancellationToken ct)
    {
        var group = await db.Set<Group>().AsNoTracking().FirstOrDefaultAsync(g => g.Id == groupId, ct);
        if (group is null || group.ArchivedAt is not null || group.Kind == GroupKinds.Static) return (0, 0);

        CompiledRule compiled;
        if (group.Kind == GroupKinds.OrgUnit)
        {
            if (group.OrgUnitId is null) return (0, 0);
            compiled = compiler.CompileOrgUnit(group.OrgUnitId.Value, group.IncludeDescendants);
        }
        else
        {
            var parsed = group.Rule is null ? null : parser.Parse(group.Rule);
            if (parsed is not { IsValid: true })
                throw new InvalidOperationException($"Group {groupId} has no valid rule: {string.Join("; ", parsed?.Errors.Select(e => e.Path + " " + e.Message) ?? ["missing"])}");
            compiled = compiler.Compile(parsed.Rule!);
        }

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(@k)",
            [new NpgsqlParameter("k", NpgsqlDbType.Bigint) { Value = GroupLockBase + groupId }], ct);

        var added = await compiled.Employees(db)
            .Where(e => !db.Set<GroupMember>().Any(m => m.GroupId == groupId && m.EmployeeCode == e.Code))
            .OrderBy(e => e.Code)
            .Select(e => e.Code)
            .ToListAsync(ct);

        var deleteParams = compiled.CreateParameters().Append(new NpgsqlParameter("gid", NpgsqlDbType.Bigint) { Value = groupId }).ToArray();
        var removed = await db.Database.ExecuteSqlRawAsync(
            "DELETE FROM group_members gm WHERE gm.group_id = @gid AND gm.source = 'computed' " +
            $"AND NOT EXISTS (SELECT 1 FROM ({compiled.EmployeesSql}) e WHERE e.code = gm.employee_code)",
            deleteParams, ct);

        await GroupSql.InsertMembersAsync(db, groupId, added, GroupMemberSources.Computed, null, ct);
        await GroupSql.RefreshMemberCountAsync(db, groupId, ct);
        await tx.CommitAsync(ct);

        await notifier.NotifyAddedAsync(groupId, added, ct);
        return (added.Count, removed);
    }

    /// <summary>
    /// One <c>org_unit</c> group per active org unit (name = unit name; a code or id suffix when the name is taken),
    /// renamed with the unit, archived when the unit becomes inactive and restored when it is active again.
    /// Returns the number of groups created, renamed, archived or restored.
    /// </summary>
    public async Task<int> EnsureOrgUnitGroupsAsync(CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(@k)",
            [new NpgsqlParameter("k", NpgsqlDbType.Bigint) { Value = OrgUnitGroupsLockKey }], ct);

        var units = await db.Set<OrgUnit>().AsNoTracking().OrderBy(u => u.Id).ToListAsync(ct);
        var all = await db.Set<Group>().ToListAsync(ct);
        var unitGroups = all.Where(g => g.Kind == GroupKinds.OrgUnit && g.OrgUnitId is not null)
            .GroupBy(g => g.OrgUnitId!.Value).ToDictionary(x => x.Key, x => x.First());
        var taken = new HashSet<string>(all.Select(g => g.Name), StringComparer.OrdinalIgnoreCase);
        var now = time.GetUtcNow();
        var changes = 0;

        foreach (var unit in units)
        {
            unitGroups.TryGetValue(unit.Id, out var group);
            if (group is null)
            {
                if (!unit.IsActive) continue;
                var name = ChooseName(unit, taken, null);
                taken.Add(name);
                db.Set<Group>().Add(new Group
                {
                    Name = name, Kind = GroupKinds.OrgUnit, OrgUnitId = unit.Id, IncludeDescendants = true,
                });
                changes++;
                continue;
            }

            var desired = ChooseName(unit, taken, group.Name);
            if (desired != group.Name)
            {
                taken.Remove(group.Name);
                taken.Add(desired);
                group.Name = desired;
                group.UpdatedAt = now;
                changes++;
            }
            if (!unit.IsActive && group.ArchivedAt is null) { group.ArchivedAt = now; group.UpdatedAt = now; changes++; }
            else if (unit.IsActive && group.ArchivedAt is not null) { group.ArchivedAt = null; group.UpdatedAt = now; changes++; }
        }

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return changes;
    }

    /// <summary>Picks the group name for a unit; keeps <paramref name="current"/> when it is still one of the acceptable names.</summary>
    internal static string ChooseName(OrgUnit unit, HashSet<string> taken, string? current)
    {
        var baseName = unit.Name.Trim();
        string[] candidates =
        [
            Fit(baseName, ""),
            Fit(baseName, $" ({unit.Code ?? unit.HrmId.ToString()})"),
            Fit(baseName, $" (#{unit.Id})"),
        ];
        if (current is not null && candidates.Contains(current, StringComparer.Ordinal)) return current;
        foreach (var c in candidates)
            if (!taken.Contains(c) || (current is not null && string.Equals(c, current, StringComparison.OrdinalIgnoreCase)))
                return c;
        return candidates[^1];
    }

    private static string Fit(string name, string suffix) =>
        (name.Length + suffix.Length <= MaxNameLength ? name : name[..(MaxNameLength - suffix.Length)]) + suffix;
}
