using System.Text.Json;
using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Modules.Identity.Groups.Rules;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;

namespace HCMUSSupportV2.Backend.Modules.Identity.Groups;

/// <summary>Group CRUD, manual member edits, imports and rule preview (editor level, see <see cref="GroupsController"/>).</summary>
public class GroupsService(
    AppDbContext db,
    GroupRuleParser parser,
    GroupRuleCompiler compiler,
    GroupRecomputeService recompute,
    GroupMembershipNotifier notifier,
    IAuditLogger audit,
    ICurrentUser user,
    TimeProvider time)
{
    public const int MaxPageSize = 200;
    public const int MaxCodesPerCall = 5000;
    private const int AuditCodeLimit = 200;

    // ---- groups ----

    public async Task<GroupPageDto> ListAsync(string? q, string? kind, bool includeArchived, string? cursor, int limit, CancellationToken ct)
    {
        limit = Math.Clamp(limit, 1, MaxPageSize);
        if (kind is not null && kind is not (GroupKinds.Static or GroupKinds.OrgUnit or GroupKinds.Rule))
            throw GroupsException.BadRequest("Invalid kind", "Loại nhóm phải là static, org_unit hoặc rule.");

        IQueryable<Group> query = string.IsNullOrWhiteSpace(q)
            ? db.Set<Group>().AsNoTracking()
            : db.Set<Group>().FromSqlRaw(
                "SELECT * FROM groups g WHERE f_unaccent(g.name) ILIKE f_unaccent(@q)",
                new NpgsqlParameter("q", NpgsqlDbType.Text) { Value = TextSearch.ContainsPattern(q) }).AsNoTracking();

        if (kind is not null) query = query.Where(g => g.Kind == kind);
        if (!includeArchived) query = query.Where(g => g.ArchivedAt == null);
        if (Cursor.Decode(cursor) is { } after) query = query.Where(g => string.Compare(g.Name, after) > 0);

        var rows = await Project(query).OrderBy(r => r.Group.Name).Take(limit + 1).ToListAsync(ct);
        var next = rows.Count > limit ? Cursor.Encode(rows[limit - 1].Group.Name) : null;
        return new GroupPageDto(rows.Take(limit).Select(ToDto).ToList(), next);
    }

    public async Task<GroupDto> GetAsync(long id, CancellationToken ct)
    {
        var row = await Project(db.Set<Group>().AsNoTracking().Where(g => g.Id == id)).FirstOrDefaultAsync(ct);
        return row is null ? throw GroupsException.NotFound() : ToDto(row);
    }

    public async Task<GroupDto> CreateAsync(CreateGroupRequest request, CancellationToken ct)
    {
        var name = ValidateName(request.Name);
        var kind = request.Kind?.Trim();
        if (kind == GroupKinds.OrgUnit)
            throw GroupsException.BadRequest("Invalid kind", "Nhóm theo đơn vị được tạo tự động cho từng đơn vị, không tạo thủ công.");
        if (kind is not (GroupKinds.Static or GroupKinds.Rule))
            throw GroupsException.BadRequest("Invalid kind", "Loại nhóm phải là static hoặc rule.");

        string? ruleJson = null;
        if (kind == GroupKinds.Rule)
            ruleJson = await ValidateRuleAsync(request.Rule, ct);
        else if (HasValue(request.Rule))
            throw GroupsException.BadRequest("Invalid rule", "Nhóm tĩnh không có quy tắc.");

        await EnsureNameFreeAsync(name, null, ct);
        var group = new Group
        {
            Name = name,
            Description = NormalizeDescription(request.Description),
            Kind = kind,
            Rule = ruleJson,
            CreatedBy = user.Code,
        };
        db.Set<Group>().Add(group);
        await SaveAsync(ct);

        var computed = 0;
        if (kind == GroupKinds.Rule) computed = (await recompute.RecomputeGroupAsync(group.Id, ct)).Added;
        await audit.LogAsync(GroupAuditActions.Created, "group", group.Id.ToString(), new { name, kind, members = computed }, ct);
        return await GetAsync(group.Id, ct);
    }

    public async Task<GroupDto> UpdateAsync(long id, UpdateGroupRequest request, CancellationToken ct)
    {
        var group = await LoadAsync(id, ct);
        if (group.ArchivedAt is not null)
            throw GroupsException.Conflict("Group archived", "Nhóm đã được lưu trữ; hãy khôi phục trước khi sửa.");

        var changed = new List<string>();
        var needsRecompute = false;

        if (group.Kind == GroupKinds.OrgUnit)
        {
            if (HasValue(request.Rule))
                throw GroupsException.BadRequest("Invalid rule", "Nhóm theo đơn vị không có quy tắc.");
            if (request.IncludeDescendants is { } include && include != group.IncludeDescendants)
            {
                group.IncludeDescendants = include;
                changed.Add("includeDescendants");
                needsRecompute = true;
            }
        }
        else
        {
            var name = ValidateName(request.Name);
            if (name != group.Name)
            {
                await EnsureNameFreeAsync(name, group.Id, ct);
                group.Name = name;
                changed.Add("name");
            }
            if (group.Kind == GroupKinds.Rule)
            {
                var ruleJson = await ValidateRuleAsync(request.Rule, ct);
                if (!SameJson(ruleJson, group.Rule))
                {
                    group.Rule = ruleJson;
                    changed.Add("rule");
                    needsRecompute = true;
                }
            }
            else if (HasValue(request.Rule))
                throw GroupsException.BadRequest("Invalid rule", "Nhóm tĩnh không có quy tắc.");
        }

        var description = NormalizeDescription(request.Description);
        if (description != group.Description)
        {
            group.Description = description;
            changed.Add("description");
        }

        if (changed.Count > 0)
        {
            group.UpdatedAt = time.GetUtcNow();
            await SaveAsync(ct);
            if (needsRecompute) await recompute.RecomputeGroupAsync(group.Id, ct);
            await audit.LogAsync(GroupAuditActions.Updated, "group", group.Id.ToString(), new { changed }, ct);
        }
        return await GetAsync(group.Id, ct);
    }

    /// <summary>Soft delete: sets <c>archived_at</c>. Org-unit groups cannot be archived (they follow the org unit).</summary>
    public async Task ArchiveAsync(long id, CancellationToken ct)
    {
        var group = await LoadAsync(id, ct);
        if (group.Kind == GroupKinds.OrgUnit)
            throw GroupsException.Conflict("Org unit group", "Nhóm theo đơn vị được quản lý tự động và không thể xóa.");
        if (group.ArchivedAt is not null) return;

        group.ArchivedAt = time.GetUtcNow();
        group.UpdatedAt = group.ArchivedAt.Value;
        await SaveAsync(ct);
        await audit.LogAsync(GroupAuditActions.Archived, "group", id.ToString(), new { group.Name }, ct);
    }

    public async Task<GroupDto> RestoreAsync(long id, CancellationToken ct)
    {
        var group = await LoadAsync(id, ct);
        if (group.Kind == GroupKinds.OrgUnit)
            throw GroupsException.Conflict("Org unit group", "Nhóm theo đơn vị được quản lý tự động.");
        if (group.ArchivedAt is not null)
        {
            group.ArchivedAt = null;
            group.UpdatedAt = time.GetUtcNow();
            await SaveAsync(ct);
            if (group.Kind == GroupKinds.Rule) await recompute.RecomputeGroupAsync(id, ct);
            await audit.LogAsync(GroupAuditActions.Restored, "group", id.ToString(), new { group.Name }, ct);
        }
        return await GetAsync(id, ct);
    }

    // ---- members ----

    public async Task<GroupMemberPageDto> ListMembersAsync(long id, string? q, string? cursor, int limit, CancellationToken ct)
    {
        await LoadAsync(id, ct, track: false);
        limit = Math.Clamp(limit, 1, MaxPageSize);

        var query =
            from m in db.Set<GroupMember>().AsNoTracking()
            where m.GroupId == id
            join e in db.Set<Employee>().AsNoTracking() on m.EmployeeCode equals e.Code
            join u in db.Set<OrgUnit>().AsNoTracking() on e.OrgUnitId equals u.Id into units
            from u in units.DefaultIfEmpty()
            select new { m.EmployeeCode, e.FullName, e.FullNameUnaccent, Unit = u != null ? u.Name : null, m.Source, m.AddedAt };

        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim();
            var pattern = TextSearch.ContainsPattern(term);
            var codePattern = TextSearch.EscapeLike(term) + "%";
            query = query.Where(r => EF.Functions.ILike(r.EmployeeCode, codePattern) || EF.Functions.ILike(r.FullNameUnaccent, pattern));
        }
        if (Cursor.Decode(cursor) is { } after) query = query.Where(r => string.Compare(r.EmployeeCode, after) > 0);

        var rows = await query.OrderBy(r => r.EmployeeCode).Take(limit + 1).ToListAsync(ct);
        var next = rows.Count > limit ? Cursor.Encode(rows[limit - 1].EmployeeCode) : null;
        return new GroupMemberPageDto(
            rows.Take(limit).Select(r => new GroupMemberDto(r.EmployeeCode, r.FullName, r.Unit, r.Source, r.AddedAt)).ToList(), next);
    }

    public async Task<AddMembersResultDto> AddMembersAsync(long id, IReadOnlyList<string>? codes, CancellationToken ct)
    {
        var group = await RequireStaticAsync(id, ct);
        var plan = await PlanAddAsync(group.Id, Clean(codes), ct);

        await GroupSql.InsertMembersAsync(db, id, plan.Added, GroupMemberSources.Manual, user.Code, ct);
        await GroupSql.RefreshMemberCountAsync(db, id, ct);
        var count = await CountAsync(id, ct);
        if (plan.Added.Count > 0)
        {
            await audit.LogAsync(GroupAuditActions.MembersAdded, "group", id.ToString(), AddedDetails(plan.Added, "manual"), ct);
            await notifier.NotifyAddedAsync(id, plan.Added, ct);
        }
        return new AddMembersResultDto(plan.Added, plan.AlreadyMember, plan.Unknown, plan.Inactive, count);
    }

    public async Task<RemoveMembersResultDto> RemoveMembersAsync(long id, IReadOnlyList<string>? codes, CancellationToken ct)
    {
        await RequireStaticAsync(id, ct);
        var clean = Clean(codes);
        var present = await db.Set<GroupMember>().Where(m => m.GroupId == id && clean.Contains(m.EmployeeCode))
            .Select(m => m.EmployeeCode).ToListAsync(ct);
        if (present.Count > 0)
        {
            await db.Set<GroupMember>().Where(m => m.GroupId == id && present.Contains(m.EmployeeCode)).ExecuteDeleteAsync(ct);
            await GroupSql.RefreshMemberCountAsync(db, id, ct);
            await audit.LogAsync(GroupAuditActions.MembersRemoved, "group", id.ToString(),
                new { count = present.Count, codes = present.Take(AuditCodeLimit) }, ct);
        }
        var presentSet = present.ToHashSet(StringComparer.Ordinal);
        return new RemoveMembersResultDto(present.Order(StringComparer.Ordinal).ToList(),
            clean.Where(c => !presentSet.Contains(c)).ToList(), await CountAsync(id, ct));
    }

    /// <summary>Stateless import: the same file is uploaded for the dry run and for the apply.</summary>
    public async Task<ImportReportDto> ImportMembersAsync(long id, Stream file, string fileName, bool dryRun, CancellationToken ct)
    {
        var group = await RequireStaticAsync(id, ct);
        var rows = MemberFileReader.ReadCodes(file, fileName);

        var seen = new HashSet<string>(StringComparer.Ordinal);
        var duplicate = new List<string>();
        foreach (var code in rows)
            if (!seen.Add(code) && !duplicate.Contains(code)) duplicate.Add(code);
        var unique = seen.ToList();

        var plan = await PlanAddAsync(group.Id, unique, ct);
        if (!dryRun && plan.Added.Count > 0)
        {
            await GroupSql.InsertMembersAsync(db, id, plan.Added, GroupMemberSources.Manual, user.Code, ct);
            await GroupSql.RefreshMemberCountAsync(db, id, ct);
        }
        if (!dryRun)
        {
            await audit.LogAsync(GroupAuditActions.MembersImported, "group", id.ToString(), new
            {
                fileName = Path.GetFileName(fileName), rows = rows.Count, added = plan.Added.Count,
                unknown = plan.Unknown.Count, inactive = plan.Inactive.Count, duplicate = duplicate.Count,
                alreadyMember = plan.AlreadyMember.Count,
            }, ct);
            await notifier.NotifyAddedAsync(id, plan.Added, ct);
        }
        return new ImportReportDto(dryRun, rows.Count, plan.Added, plan.AlreadyMember, duplicate, plan.Unknown, plan.Inactive,
            await CountAsync(id, ct));
    }

    // ---- rules ----

    public async Task<PreviewRuleResultDto> PreviewRuleAsync(JsonElement? ruleJson, CancellationToken ct)
    {
        var json = await ValidateRuleAsync(ruleJson, ct);
        var rule = parser.Parse(json).Rule!;
        var matching = compiler.Compile(rule).Employees(db);

        var count = await matching.CountAsync(ct);
        var sample = await (
            from e in matching
            join u in db.Set<OrgUnit>().AsNoTracking() on e.OrgUnitId equals u.Id into units
            from u in units.DefaultIfEmpty()
            orderby e.Code
            select new PreviewSampleDto(e.Code, e.FullName, u != null ? u.Name : null)).Take(10).ToListAsync(ct);
        return new PreviewRuleResultDto(count, sample);
    }

    // ---- helpers ----

    private sealed record AddPlan(List<string> Added, List<string> AlreadyMember, List<string> Unknown, List<string> Inactive);

    private async Task<AddPlan> PlanAddAsync(long groupId, IReadOnlyList<string> codes, CancellationToken ct)
    {
        var found = await db.Set<Employee>().AsNoTracking().Where(e => codes.Contains(e.Code))
            .Select(e => new { e.Code, e.Status }).ToListAsync(ct);
        var status = found.ToDictionary(e => e.Code, e => e.Status, StringComparer.Ordinal);
        var existing = (await db.Set<GroupMember>().AsNoTracking().Where(m => m.GroupId == groupId && codes.Contains(m.EmployeeCode))
            .Select(m => m.EmployeeCode).ToListAsync(ct)).ToHashSet(StringComparer.Ordinal);

        var plan = new AddPlan([], [], [], []);
        foreach (var code in codes)
        {
            if (!status.TryGetValue(code, out var s)) plan.Unknown.Add(code);
            else if (s != EmployeeStatuses.Active) plan.Inactive.Add(code);
            else if (existing.Contains(code)) plan.AlreadyMember.Add(code);
            else plan.Added.Add(code);
        }
        return plan;
    }

    private static List<string> Clean(IReadOnlyList<string>? codes)
    {
        var clean = (codes ?? []).Select(c => c?.Trim() ?? "").Where(c => c.Length > 0).Distinct(StringComparer.Ordinal).ToList();
        if (clean.Count == 0) throw GroupsException.BadRequest("No codes", "Danh sách mã số cán bộ đang trống.");
        if (clean.Count > MaxCodesPerCall)
            throw GroupsException.BadRequest("Too many codes", $"Tối đa {MaxCodesPerCall} mã mỗi lần; hãy dùng chức năng nhập tệp.");
        return clean;
    }

    private static object AddedDetails(List<string> added, string via) =>
        new { via, count = added.Count, codes = added.Take(AuditCodeLimit) };

    private Task<int> CountAsync(long groupId, CancellationToken ct) =>
        db.Set<GroupMember>().CountAsync(m => m.GroupId == groupId, ct);

    private async Task<Group> LoadAsync(long id, CancellationToken ct, bool track = true)
    {
        var query = track ? db.Set<Group>() : db.Set<Group>().AsNoTracking();
        return await query.FirstOrDefaultAsync(g => g.Id == id, ct) ?? throw GroupsException.NotFound();
    }

    private async Task<Group> RequireStaticAsync(long id, CancellationToken ct)
    {
        var group = await LoadAsync(id, ct, track: false);
        if (group.Kind != GroupKinds.Static)
            throw GroupsException.Conflict("Computed group", "Thành viên của nhóm theo đơn vị hoặc quy tắc được tính tự động, không sửa thủ công.");
        if (group.ArchivedAt is not null)
            throw GroupsException.Conflict("Group archived", "Nhóm đã được lưu trữ.");
        return group;
    }

    private static string ValidateName(string? name)
    {
        var n = name?.Trim() ?? "";
        if (n.Length == 0 || n.Length > 300)
            throw GroupsException.BadRequest("Invalid name", "Tên nhóm phải có từ 1 đến 300 ký tự.");
        return n;
    }

    private static string? NormalizeDescription(string? description)
    {
        var d = description?.Trim();
        if (string.IsNullOrEmpty(d)) return null;
        if (d.Length > 2000) throw GroupsException.BadRequest("Invalid description", "Mô tả dài tối đa 2000 ký tự.");
        return d;
    }

    private async Task EnsureNameFreeAsync(string name, long? exceptId, CancellationToken ct)
    {
        var lower = name.ToLower();
        if (await db.Set<Group>().AnyAsync(g => g.Id != exceptId && g.Name.ToLower() == lower, ct))
            throw GroupsException.Conflict("Name taken", "Tên nhóm đã tồn tại (có thể thuộc một nhóm đã lưu trữ).");
    }

    private async Task SaveAsync(CancellationToken ct)
    {
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException ex) when (GroupSql.IsUniqueViolation(ex))
        {
            throw GroupsException.Conflict("Name taken", "Tên nhóm đã tồn tại.");
        }
    }

    private static bool HasValue(JsonElement? e) => e is { ValueKind: not (JsonValueKind.Null or JsonValueKind.Undefined) };

    /// <summary>Validates a rule (structure and references) and returns its compact JSON; throws a 400 with the path of every problem.</summary>
    private async Task<string> ValidateRuleAsync(JsonElement? rule, CancellationToken ct)
    {
        if (!HasValue(rule))
            throw new GroupsException(400, "Invalid rule", "Quy tắc không hợp lệ.",
                new Dictionary<string, string[]> { ["$"] = ["Thiếu quy tắc."] });

        var result = await parser.ValidateAsync(rule!.Value, db, ct);
        if (!result.IsValid)
            throw new GroupsException(400, "Invalid rule", "Quy tắc không hợp lệ.",
                result.Errors.GroupBy(e => e.Path).ToDictionary(g => g.Key, g => g.Select(e => e.Message).ToArray()));
        return result.Rule!.Json;
    }

    private static bool SameJson(string? a, string? b)
    {
        if (a is null || b is null) return a == b;
        using var da = JsonDocument.Parse(a);
        using var dbDoc = JsonDocument.Parse(b);
        return JsonSerializer.Serialize(da.RootElement) == JsonSerializer.Serialize(dbDoc.RootElement);
    }

    private sealed class GroupRow
    {
        public Group Group { get; init; } = null!;
        public string? OrgUnitName { get; init; }
    }

    private IQueryable<GroupRow> Project(IQueryable<Group> groups) =>
        from g in groups
        join u in db.Set<OrgUnit>().AsNoTracking() on g.OrgUnitId equals u.Id into units
        from u in units.DefaultIfEmpty()
        select new GroupRow { Group = g, OrgUnitName = u != null ? u.Name : null };

    private static GroupDto ToDto(GroupRow r)
    {
        var g = r.Group;
        JsonElement? rule = null;
        if (g.Rule is not null)
        {
            using var doc = JsonDocument.Parse(g.Rule);
            rule = doc.RootElement.Clone();
        }
        return new GroupDto(g.Id, g.Name, g.Description, g.Kind, g.OrgUnitId, r.OrgUnitName, g.IncludeDescendants, rule,
            g.MemberCount, g.CreatedBy, g.ArchivedAt, g.CreatedAt, g.UpdatedAt);
    }
}
