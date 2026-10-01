using System.Globalization;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;

namespace HCMUSSupportV2.Backend.Modules.Identity.Groups;

/// <summary>A failure the controller turns into a ProblemDetails response (Vietnamese <see cref="Exception.Message"/>).</summary>
public sealed class GroupsException(int status, string title, string detail, IDictionary<string, string[]>? errors = null)
    : Exception(detail)
{
    public int Status { get; } = status;
    public string Title { get; } = title;
    public IDictionary<string, string[]>? Errors { get; } = errors;

    public static GroupsException BadRequest(string title, string detail) => new(400, title, detail);
    public static GroupsException NotFound() => new(404, "Group not found", "Không tìm thấy nhóm.");
    public static GroupsException Conflict(string title, string detail) => new(409, title, detail);
}

/// <summary>SQL helpers shared by manual edits, import and recompute (parameterized; no value is concatenated).</summary>
internal static class GroupSql
{
    /// <summary>Inserts the codes as members, ignoring those already in the group.</summary>
    public static Task<int> InsertMembersAsync(DbContext db, long groupId, IReadOnlyCollection<string> codes, string source, string? addedBy, CancellationToken ct)
    {
        if (codes.Count == 0) return Task.FromResult(0);
        return db.Database.ExecuteSqlRawAsync(
            "INSERT INTO group_members (group_id, employee_code, source, added_by, added_at) " +
            "SELECT @gid, c, @src, @by, now() FROM unnest(@codes) AS c ON CONFLICT DO NOTHING",
            [
                new NpgsqlParameter("gid", NpgsqlDbType.Bigint) { Value = groupId },
                new NpgsqlParameter("src", NpgsqlDbType.Text) { Value = source },
                new NpgsqlParameter("by", NpgsqlDbType.Text) { Value = (object?)addedBy ?? DBNull.Value },
                new NpgsqlParameter("codes", NpgsqlDbType.Array | NpgsqlDbType.Text) { Value = codes.ToArray() },
            ], ct);
    }

    /// <summary>Recounts <c>groups.member_count</c> from <c>group_members</c>.</summary>
    public static Task<int> RefreshMemberCountAsync(DbContext db, long groupId, CancellationToken ct) =>
        db.Database.ExecuteSqlRawAsync(
            "UPDATE groups SET member_count = (SELECT count(*) FROM group_members WHERE group_id = groups.id), updated_at = now() " +
            "WHERE id = @gid",
            [new NpgsqlParameter("gid", NpgsqlDbType.Bigint) { Value = groupId }], ct);

    public static bool IsUniqueViolation(DbUpdateException ex) =>
        ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation };
}

/// <summary>Opaque keyset cursors (base64url of the last sort key).</summary>
internal static class Cursor
{
    public static string Encode(string key) =>
        Convert.ToBase64String(Encoding.UTF8.GetBytes(key)).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    public static string? Decode(string? cursor)
    {
        if (string.IsNullOrEmpty(cursor)) return null;
        try
        {
            var s = cursor.Replace('-', '+').Replace('_', '/');
            s = s.PadRight(s.Length + (4 - s.Length % 4) % 4, '=');
            return Encoding.UTF8.GetString(Convert.FromBase64String(s));
        }
        catch (FormatException)
        {
            throw GroupsException.BadRequest("Invalid cursor", "Con trỏ phân trang không hợp lệ.");
        }
    }
}

internal static class TextSearch
{
    /// <summary>Removes diacritics like PostgreSQL <c>unaccent</c> (including Vietnamese d-stroke).</summary>
    public static string Unaccent(string s)
    {
        var sb = new StringBuilder(s.Length);
        foreach (var ch in s.Normalize(NormalizationForm.FormD))
        {
            if (CharUnicodeInfo.GetUnicodeCategory(ch) == UnicodeCategory.NonSpacingMark) continue;
            sb.Append(ch switch { 'đ' => 'd', 'Đ' => 'D', _ => ch });
        }
        return sb.ToString().Normalize(NormalizationForm.FormC);
    }

    public static string EscapeLike(string s) => s.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_");

    public static string ContainsPattern(string q) => "%" + EscapeLike(Unaccent(q.Trim())) + "%";
}

public static class GroupAuditActions
{
    public const string Created = "group.created";
    public const string Updated = "group.updated";
    public const string Archived = "group.archived";
    public const string Restored = "group.restored";
    public const string MembersAdded = "group.members_added";
    public const string MembersRemoved = "group.members_removed";
    public const string MembersImported = "group.members_imported";
    public const string Recomputed = "group.recomputed";
}
