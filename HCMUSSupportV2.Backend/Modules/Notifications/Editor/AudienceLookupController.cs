using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;

namespace HCMUSSupportV2.Backend.Modules.Notifications.Editor;

public record AudienceEstimateRequest(bool AudienceAll, List<long>? GroupIds, List<string>? EmployeeCodes, Guid? ImportId);

public record AudienceEstimateDto(int Count);

/// <summary>The same choices as <see cref="AudienceEstimateRequest"/>, plus a name / MSCB filter and a page size.</summary>
public record AudienceMembersRequest(bool AudienceAll, List<long>? GroupIds, List<string>? EmployeeCodes, Guid? ImportId, string? Q, int? Limit);

public record EmployeeLookupDto(string Code, string FullName, string? Unit, string Status);

/// <summary>
/// Helpers for the editor's targeting panel (D09): a live recipient count for a draft that is not saved yet, and an
/// employee search for the "Nhân sự" picker and the "Xem trước với tư cách" picker.
/// </summary>
[ApiController]
[ApiException]
[Authorize(Policy = Policies.ManageNotifications)]
[Route("api/manage/notifications")]
public class AudienceLookupController(AppDbContext db) : ControllerBase
{
    /// <summary>The audience union the fan-out uses; shared by the estimate and the member list.</summary>
    private const string AudiencePredicate = """
        e.status = 'active' AND (
            (@all AND EXISTS (SELECT 1 FROM employee_emails m WHERE m.employee_code = e.code))
            OR EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = ANY(@groups) AND gm.employee_code = e.code)
            OR e.code = ANY(@codes)
            OR EXISTS (SELECT 1 FROM notification_recipient_imports i
                       WHERE i.id = @import AND i.status <> 'rejected' AND jsonb_exists(i.rows, e.code)))
        """;

    private const string EstimateSql = "SELECT count(*)::int AS \"Value\" FROM employees e WHERE " + AudiencePredicate;

    /// <summary>
    /// How many active employees the chosen audiences would reach: the same union the fan-out uses (everyone with an email,
    /// active group members, the named employees, the MSCBs of an import sheet). Nothing is saved.
    /// </summary>
    [HttpPost("audience-estimate")]
    public async Task<AudienceEstimateDto> Estimate([FromBody] AudienceEstimateRequest request, CancellationToken ct)
    {
        var groups = (request.GroupIds ?? []).Distinct().ToArray();
        var codes = (request.EmployeeCodes ?? []).Select(c => c.Trim()).Where(c => c.Length > 0).Distinct().ToArray();
        if (groups.Length > 500 || codes.Length > 5000) throw ApiException.BadRequest("Quá nhiều nhóm hoặc nhân sự được chọn.");

        var count = await db.Database.SqlQueryRaw<int>(EstimateSql,
            new NpgsqlParameter("all", request.AudienceAll),
            new NpgsqlParameter("groups", NpgsqlDbType.Array | NpgsqlDbType.Bigint) { Value = groups },
            new NpgsqlParameter("codes", NpgsqlDbType.Array | NpgsqlDbType.Text) { Value = codes },
            new NpgsqlParameter("import", NpgsqlDbType.Uuid) { Value = (object?)request.ImportId ?? DBNull.Value })
            .SingleAsync(ct);
        return new AudienceEstimateDto(count);
    }

    private const string MembersSql = """
        SELECT e.code AS code, e.full_name AS full_name, u.name AS unit, e.status AS status
        FROM employees e
        LEFT JOIN org_units u ON u.id = e.org_unit_id
        WHERE
        """ + " " + AudiencePredicate + """

          AND (@q = '' OR e.code ILIKE @prefix OR f_unaccent(e.full_name) ILIKE f_unaccent(@contains))
        ORDER BY e.full_name, e.code
        LIMIT @limit
        """;

    /// <summary>
    /// The people the chosen audiences reach (nothing is saved), optionally filtered by MSCB prefix or name (accents
    /// ignored). Used by the editor's "preview as a recipient" picker, which offers recipients only.
    /// </summary>
    [HttpPost("audience-members")]
    public async Task<IReadOnlyList<EmployeeLookupDto>> Members([FromBody] AudienceMembersRequest request, CancellationToken ct)
    {
        var groups = (request.GroupIds ?? []).Distinct().ToArray();
        var codes = (request.EmployeeCodes ?? []).Select(c => c.Trim()).Where(c => c.Length > 0).Distinct().ToArray();
        if (groups.Length > 500 || codes.Length > 5000) throw ApiException.BadRequest("Quá nhiều nhóm hoặc nhân sự được chọn.");
        var term = (request.Q ?? "").Trim();
        var escaped = term.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_");
        return await db.Database.SqlQueryRaw<EmployeeLookupDto>(MembersSql,
            new NpgsqlParameter("all", request.AudienceAll),
            new NpgsqlParameter("groups", NpgsqlDbType.Array | NpgsqlDbType.Bigint) { Value = groups },
            new NpgsqlParameter("codes", NpgsqlDbType.Array | NpgsqlDbType.Text) { Value = codes },
            new NpgsqlParameter("import", NpgsqlDbType.Uuid) { Value = (object?)request.ImportId ?? DBNull.Value },
            new NpgsqlParameter("q", term),
            new NpgsqlParameter("prefix", escaped + "%"),
            new NpgsqlParameter("contains", "%" + escaped + "%"),
            new NpgsqlParameter("limit", Math.Clamp(request.Limit ?? 20, 1, 50)))
            .ToListAsync(ct);
    }

    private const string LookupSql = """
        SELECT e.code AS code, e.full_name AS full_name, u.name AS unit, e.status AS status
        FROM employees e
        LEFT JOIN org_units u ON u.id = e.org_unit_id
        WHERE (@q = '' OR e.code ILIKE @prefix OR f_unaccent(e.full_name) ILIKE f_unaccent(@contains))
        ORDER BY (e.status = 'active') DESC, e.full_name, e.code
        LIMIT @limit
        """;

    /// <summary>Finds employees by MSCB prefix or by name (accents ignored). Active ones first.</summary>
    [HttpGet("employees")]
    public async Task<IReadOnlyList<EmployeeLookupDto>> Employees([FromQuery] string? q, [FromQuery] int limit = 20, CancellationToken ct = default)
    {
        limit = Math.Clamp(limit, 1, 50);
        var term = (q ?? "").Trim();
        var escaped = term.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_");
        return await db.Database.SqlQueryRaw<EmployeeLookupDto>(LookupSql,
            new NpgsqlParameter("q", term),
            new NpgsqlParameter("prefix", escaped + "%"),
            new NpgsqlParameter("contains", "%" + escaped + "%"),
            new NpgsqlParameter("limit", limit))
            .ToListAsync(ct);
    }
}
