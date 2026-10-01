using System.Globalization;
using System.Text;

namespace HCMUSSupportV2.Backend.Modules.Admin.Common;

/// <summary>Keyset page: <c>{items, nextCursor}</c>. <c>NextCursor</c> is null on the last page.</summary>
public record AdminPage<T>(IReadOnlyList<T> Items, string? NextCursor);

/// <summary>Opaque cursors (url-safe base64 of a short text key) and small query helpers.</summary>
public static class AdminQuery
{
    public const int DefaultLimit = 50;
    public const int MaxLimit = 200;

    public static int ClampLimit(int? limit) => Math.Clamp(limit ?? DefaultLimit, 1, MaxLimit);

    public static string EncodeCursor(string key) =>
        Convert.ToBase64String(Encoding.UTF8.GetBytes(key)).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    /// <summary>Null when the cursor is missing or malformed (callers treat that as the first page).</summary>
    public static string? DecodeCursor(string? cursor)
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
            return null;
        }
    }

    /// <summary>Escapes backslash, percent and underscore for a LIKE pattern that uses backslash as the escape character.</summary>
    public static string EscapeLike(string s) => s.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_");

    /// <summary>Diacritic-free form of Vietnamese text (matches <c>f_unaccent</c>, which maps d-stroke to d).</summary>
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
}
