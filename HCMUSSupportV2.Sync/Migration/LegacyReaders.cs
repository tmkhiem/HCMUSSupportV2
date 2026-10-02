using System.Globalization;
using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace HCMUSSupportV2.Sync.Migration;

/// <summary>An entry of the v1 <c>config/users.json</c> (<c>{id, name, emails[]}</c>; <c>id</c> is the MSCB).</summary>
public sealed record LegacyUser(string Id, string Name, List<string> Emails);

/// <summary>One person to grant a role to: the email they sign in with and their MSCB. Comes from the operator, never from code.</summary>
public sealed record AdminIdentity(string Email, string Mscb)
{
    /// <summary>Parses <c>email:mscb</c> (the email may contain no colon).</summary>
    public static AdminIdentity? TryParse(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var i = text.LastIndexOf(':');
        if (i <= 0 || i == text.Length - 1) return null;
        var email = text[..i].Trim();
        var mscb = text[(i + 1)..].Trim();
        return email.Contains('@') && mscb.Length > 0 ? new AdminIdentity(email, mscb) : null;
    }
}

/// <summary>Readers of the private v1 data repo. Everything is read in place; nothing is copied or logged.</summary>
public static class LegacyReaders
{
    private static JsonDocument Open(string path) => JsonDocument.Parse(File.ReadAllText(path).TrimStart('﻿'));

    public static List<LegacyUser> ReadUsers(string repo)
    {
        using var doc = Open(Path.Combine(repo, "config", "users.json"));
        var users = new List<LegacyUser>();
        foreach (var e in doc.RootElement.EnumerateArray())
        {
            var emails = e.TryGetProperty("emails", out var list) && list.ValueKind == JsonValueKind.Array
                ? list.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String).Select(x => x.GetString()!).ToList()
                : [];
            users.Add(new LegacyUser(Str(e, "id"), Str(e, "name"), emails));
        }
        return users;
    }

    /// <summary>Feature name -> the ids or emails v1 granted it to (<c>ViewAs</c>, <c>Lookup</c>, <c>Statistics</c>).</summary>
    public static Dictionary<string, List<string>> ReadPrivileged(string repo)
    {
        var path = Path.Combine(repo, "config", "privileged.users.json");
        var result = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        if (!File.Exists(path)) return result;
        using var doc = Open(path);
        foreach (var p in doc.RootElement.EnumerateObject())
            result[p.Name] = p.Value.ValueKind == JsonValueKind.Array
                ? p.Value.EnumerateArray().Select(x => x.ToString().Trim()).Where(x => x.Length > 0).ToList()
                : [];
        return result;
    }

    private static string Str(JsonElement e, string name) =>
        e.TryGetProperty(name, out var v) ? (v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : v.ToString()).Trim() : "";

    // ------------------------------------------------------------------ v1 envelope

    /// <summary>The v1 envelope rows as <c>(MSCB, column values)</c>; braces are stripped from the keys.</summary>
    public static IEnumerable<(string Mscb, Dictionary<string, string> Row)> EnvelopeRows(JsonElement root)
    {
        if (!root.TryGetProperty("values", out var values) || values.ValueKind != JsonValueKind.Object) yield break;
        foreach (var person in values.EnumerateObject())
        {
            if (person.Value.ValueKind != JsonValueKind.Array) continue;
            foreach (var item in person.Value.EnumerateArray())
            {
                if (item.ValueKind != JsonValueKind.Object) continue;
                var row = new Dictionary<string, string>(StringComparer.Ordinal);
                foreach (var c in item.EnumerateObject())
                    row[c.Name.Trim('{', '}')] = c.Value.ValueKind == JsonValueKind.String ? c.Value.GetString() ?? "" : c.Value.ValueKind == JsonValueKind.Null ? "" : c.Value.ToString();
                yield return (person.Name.Trim(), row);
            }
        }
    }

    public static string Clean(string? s) =>
        Regex.Replace(WebUtility.HtmlDecode(s ?? "").Replace(' ', ' '), @"[​-‏⁠﻿]", "").Trim();
}

// ====================================================================== teaching

public sealed record TeachingRowOut(
    string EmployeeCode, string AcademicYear, string Program, int? Term, string? Module, string? CourseCode, string CourseName,
    string? ClassCode, string? Track, string? Activity, int Periods, decimal StandardHours);

/// <summary>
/// Parses the v1 <c>teaching-stats</c> files: each person's <c>{rows}</c> is a pre-built HTML table with the columns
/// Môn học (<c>CODE-Name</c>), Lớp, Bậc đào tạo (the program cell below) and Giờ chuẩn. The program cell changed over the years:
/// <c>Đại học (ACTIVITY), HKn</c> until 2022-2023, <c>Đại học (HỆ), HKn</c> in 2023-2024 (with <c>(CH), HKHPn</c> and
/// <c>(HPTS|CDTS), HKNone</c> standing for Cao học and Tiến sĩ), <c>Cao học, Học phần n</c>, <c>Tiến sĩ, CĐTS</c>,
/// <c>Học phần Cao học (chuyên ngành)</c>, <c>Chuyên đề TS</c>, ... Unrecognised cells are counted per pattern and skipped.
/// </summary>
public static partial class TeachingParser
{
    public sealed class Result
    {
        public List<TeachingRowOut> Rows { get; } = [];
        public int TableRows { get; set; }
        public Dictionary<string, int> UnparsedPatterns { get; } = new(StringComparer.Ordinal);
        public int BadHours { get; set; }
        public string? AcademicYear { get; set; }
    }

    [GeneratedRegex(@"(\d{4})\s*-\s*(\d{4})")] private static partial Regex YearPattern();
    [GeneratedRegex(@"<tr>(.*?)</tr>", RegexOptions.Singleline | RegexOptions.IgnoreCase)] private static partial Regex RowPattern();
    [GeneratedRegex(@"<td>(.*?)</td>", RegexOptions.Singleline | RegexOptions.IgnoreCase)] private static partial Regex CellPattern();
    [GeneratedRegex(@"^([A-Za-z]{2,5}\d{3,6}[A-Za-z0-9]*)\s*-\s*(.+)$", RegexOptions.Singleline)] private static partial Regex CoursePattern();
    [GeneratedRegex(@"^Đại học(?:\s*\(([^)]*)\))?\s*,\s*HK(\w+)$", RegexOptions.IgnoreCase | RegexOptions.Singleline)] private static partial Regex UndergraduatePattern();
    [GeneratedRegex(@"^Cao học\s*,\s*(.+)$", RegexOptions.IgnoreCase | RegexOptions.Singleline)] private static partial Regex MasterCommaPattern();
    [GeneratedRegex(@"^Tiến sĩ\s*,\s*(.+)$", RegexOptions.IgnoreCase | RegexOptions.Singleline)] private static partial Regex DoctoralCommaPattern();
    [GeneratedRegex(@"^Học phần cao học(?:\s*\((.*)\))?$", RegexOptions.IgnoreCase | RegexOptions.Singleline)] private static partial Regex MasterModulePattern();
    [GeneratedRegex(@"^Học phần tiến sĩ(?:\s*\((.*)\))?$", RegexOptions.IgnoreCase | RegexOptions.Singleline)] private static partial Regex DoctoralModulePattern();
    [GeneratedRegex(@"^Chuyên đề (?:TS|tiến sĩ)$", RegexOptions.IgnoreCase)] private static partial Regex DoctoralTopicPattern();

    public const string Master = "cao_hoc";
    public const string Doctoral = "tien_si";
    public const string Undergraduate = "dai_hoc";

    public static string? AcademicYearOf(string header)
    {
        var m = YearPattern().Match(header);
        return m.Success && int.Parse(m.Groups[2].Value, CultureInfo.InvariantCulture) == int.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture) + 1
            ? $"{m.Groups[1].Value}-{m.Groups[2].Value}" : null;
    }

    public static Result Parse(JsonElement root)
    {
        var result = new Result();
        var header = root.TryGetProperty("header", out var h) && h.ValueKind == JsonValueKind.String ? h.GetString() ?? "" : "";
        var year = AcademicYearOf(header) ?? throw new InvalidDataException("The teaching file header has no academic year (yyyy-yyyy).");
        result.AcademicYear = year;
        var trackYear = int.Parse(year[..4], CultureInfo.InvariantCulture) >= 2023; // from 2023-2024 the parentheses hold the Hệ

        foreach (var (mscb, row) in LegacyReaders.EnvelopeRows(root))
        {
            if (!row.TryGetValue("rows", out var html)) continue;
            foreach (Match tr in RowPattern().Matches(html))
            {
                result.TableRows++;
                var cells = CellPattern().Matches(tr.Groups[1].Value).Select(m => LegacyReaders.Clean(m.Groups[1].Value)).ToList();
                if (cells.Count != 4) { Count(result, "row without 4 cells"); continue; }
                if (!decimal.TryParse(cells[3].Replace(',', '.'), NumberStyles.Number, CultureInfo.InvariantCulture, out var hours) || hours < 0 || hours > 99999)
                {
                    result.BadHours++;
                    continue;
                }
                var program = ParseProgramCell(cells[2], trackYear);
                if (program is null) { Count(result, cells[2]); continue; }

                var course = cells[0];
                string? code = null;
                if (CoursePattern().Match(course) is { Success: true } c) (code, course) = (c.Groups[1].Value, c.Groups[2].Value.Trim());
                if (course.Length == 0) { Count(result, "empty course"); continue; }
                result.Rows.Add(new TeachingRowOut(mscb, year, program.Program, program.Term, program.Module, code, course,
                    cells[1].Length == 0 ? null : cells[1], program.Track, program.Activity, 0, Math.Round(hours, 2)));
            }
        }
        return result;
    }

    private static void Count(Result r, string pattern)
    {
        var key = Regex.Replace(pattern, @"\s+", " ");
        if (key.Length > 80) key = key[..80];
        r.UnparsedPatterns[key] = r.UnparsedPatterns.GetValueOrDefault(key) + 1;
    }

    private sealed record ProgramCell(string Program, int? Term, string? Module, string? Track, string? Activity);

    private static string? NullIfNone(string? s)
    {
        var t = s?.Trim();
        return string.IsNullOrEmpty(t) || t.Equals("None", StringComparison.OrdinalIgnoreCase) || t.Equals("null", StringComparison.OrdinalIgnoreCase) ? null : t;
    }

    private static string? Module(string? s)
    {
        var t = NullIfNone(s is null ? null : Regex.Replace(s, @"\s+", " "));
        return t;
    }

    private static ProgramCell? ParseProgramCell(string cell, bool parenthesesAreTrack)
    {
        cell = Regex.Replace(cell, @"\s+", " ").Trim();

        if (UndergraduatePattern().Match(cell) is { Success: true } u)
        {
            var paren = NullIfNone(u.Groups[1].Value);
            var term = u.Groups[2].Value;
            if (int.TryParse(term, NumberStyles.None, CultureInfo.InvariantCulture, out var n))
                return n is >= 1 and <= 3
                    ? new ProgramCell(Undergraduate, n, null, parenthesesAreTrack ? paren : null, parenthesesAreTrack ? null : paren?.ToUpperInvariant())
                    : null;
            // 2023-2024 exported postgraduate teaching as "Đại học (CH), HKHP3" and "Đại học (HPTS), HKNone".
            if (paren is "CH" && Regex.Match(term, @"^HP(\w+)$", RegexOptions.IgnoreCase) is { Success: true } hp) return new ProgramCell(Master, null, $"Học phần {hp.Groups[1].Value}", null, null);
            if (paren is "CH" && term.Equals("None", StringComparison.OrdinalIgnoreCase)) return new ProgramCell(Master, null, null, null, null);
            if (paren is "HPTS" && term.Equals("None", StringComparison.OrdinalIgnoreCase)) return new ProgramCell(Doctoral, null, "HPTS", null, null);
            if (paren is "CDTS" && term.Equals("None", StringComparison.OrdinalIgnoreCase)) return new ProgramCell(Doctoral, null, "CĐTS", null, null);
            return null;
        }
        if (MasterCommaPattern().Match(cell) is { Success: true } mc) return new ProgramCell(Master, null, Module(mc.Groups[1].Value), null, null);
        if (DoctoralCommaPattern().Match(cell) is { Success: true } dc) return new ProgramCell(Doctoral, null, Module(NormalizeDoctoralTag(dc.Groups[1].Value)), null, null);
        if (DoctoralTopicPattern().IsMatch(cell)) return new ProgramCell(Doctoral, null, "CĐTS", null, null);
        if (MasterModulePattern().Match(cell) is { Success: true } mm) return new ProgramCell(Master, null, Module(mm.Groups[1].Value), null, null);
        if (DoctoralModulePattern().Match(cell) is { Success: true } dm) return new ProgramCell(Doctoral, null, Module(dm.Groups[1].Value), null, null);
        return null;
    }

    private static string NormalizeDoctoralTag(string tag) => tag.Trim().Equals("CDTS", StringComparison.OrdinalIgnoreCase) ? "CĐTS" : tag;
}

// ====================================================================== research and papers

public sealed record ResearchRowOut(
    string Code, string Title, string? Level, string? Type, decimal? Funding, string? Period, string? AcceptedOn, string? Result, string Mscb, string Role);

public sealed record PublicationOut(string? Doi, string? Eid, string Title, string? Venue, int? Year, string? Details, string? Url, List<string> Authors);

public static partial class ResearchParser
{
    public sealed class Result
    {
        public List<ResearchRowOut> Rows { get; } = [];
        public int PartialAcceptedDates { get; set; }
        public int UnknownRoles { get; set; }
        public int BadFunding { get; set; }
    }

    [GeneratedRegex(@"^\d{1,3}(?:[.,]\d{3})*$|^\d+$")] private static partial Regex MoneyPattern();

    /// <summary>research-stats.json: one row per (project, member); the project columns repeat on every row.</summary>
    public static Result Parse(JsonElement root)
    {
        var result = new Result();
        foreach (var (mscb, r) in LegacyReaders.EnvelopeRows(root))
        {
            string G(string k) => LegacyReaders.Clean(r.GetValueOrDefault(k));
            string? N(string k) { var v = G(k); return v.Length == 0 ? null : v; }
            var code = G("ma_so");
            var title = G("ten_de_tai");
            if (code.Length == 0 || title.Length == 0) continue;

            decimal? funding = null;
            var money = G("kinh_phi");
            if (money.Length > 0)
            {
                if (MoneyPattern().IsMatch(money)) funding = decimal.Parse(money.Replace(".", "").Replace(",", ""), CultureInfo.InvariantCulture);
                else result.BadFunding++;
            }

            var accepted = AcceptedOn(G("NgayNghiemThu"), result);
            var roleText = G("tu_cach_tham_gia");
            var role = RoleOf(roleText, result);
            result.Rows.Add(new ResearchRowOut(code, title, N("TenCapDeTai"), N("TenLoaiHinhNC"), funding, N("thoi_gian_thuc_hien"), accepted, N("TenKetQuaDT"), mscb, role));
        }
        return result;
    }

    /// <summary>dd/MM/yyyy, MM/yyyy (first day) or yyyy (1 January): the table keeps a date, so partial dates are approximated and counted.</summary>
    public static string? AcceptedOn(string text, Result? counter = null)
    {
        text = text.Trim();
        if (text.Length == 0) return null;
        if (DateOnly.TryParseExact(text, ["dd/MM/yyyy", "d/M/yyyy"], CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)) return d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        if (DateOnly.TryParseExact("01/" + text, ["dd/MM/yyyy", "dd/M/yyyy"], CultureInfo.InvariantCulture, DateTimeStyles.None, out var m)) { if (counter is not null) counter.PartialAcceptedDates++; return m.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture); }
        if (text.Length == 4 && int.TryParse(text, NumberStyles.None, CultureInfo.InvariantCulture, out var y) && y is >= 1900 and <= 2200)
        {
            if (counter is not null) counter.PartialAcceptedDates++;
            return $"{y:0000}-01-01";
        }
        return null;
    }

    /// <summary>Chủ nhiệm and Đồng chủ nhiệm are both <c>chu_nhiem</c> (the UI shows "Chủ nhiệm"); everything else is a member.</summary>
    public static string RoleOf(string text, Result? counter = null)
    {
        var t = TextKey(text);
        if (t is "chunhiem" or "dongchunhiem") return "chu_nhiem";
        if (t is not "thanhvien" && counter is not null) counter.UnknownRoles++;
        return "thanh_vien";
    }

    private static string TextKey(string s)
    {
        var d = s.Normalize(System.Text.NormalizationForm.FormD);
        var sb = new System.Text.StringBuilder();
        foreach (var c in d)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) == UnicodeCategory.NonSpacingMark) continue;
            if (c is 'đ' or 'Đ') { sb.Append('d'); continue; }
            if (char.IsLetterOrDigit(c)) sb.Append(char.ToLowerInvariant(c));
        }
        return sb.ToString();
    }
}

public static partial class PapersParser
{
    [GeneratedRegex(@"\((\d{4})\)\s*$")] private static partial Regex YearPattern();

    /// <summary>
    /// paper-details.json: <c>[{Eid, Details, Mscb[]}]</c>. <c>Details</c> is a citation, "Authors: Title. Venue vol: pages (year)":
    /// the title is the text after the first ": " up to the next ". ", the venue the rest without the year. A citation that does not
    /// fit keeps the whole text as the title (and stays in <c>details</c> either way).
    /// </summary>
    public static List<PublicationOut> Parse(JsonElement root)
    {
        var list = new List<PublicationOut>();
        foreach (var e in root.EnumerateArray())
        {
            string S(string k) => e.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? LegacyReaders.Clean(v.GetString()) : "";
            var details = S("Details");
            var eid = S("Eid");
            var authors = e.TryGetProperty("Mscb", out var m) && m.ValueKind == JsonValueKind.Array
                ? m.EnumerateArray().Select(x => x.ToString().Trim()).Where(x => x.Length > 0).ToList() : [];
            if (details.Length == 0 && eid.Length == 0) continue;

            int? year = YearPattern().Match(details) is { Success: true } y ? int.Parse(y.Groups[1].Value, CultureInfo.InvariantCulture) : null;
            string title = details, venue = "";
            var colon = details.IndexOf(": ", StringComparison.Ordinal);
            if (colon > 0)
            {
                var rest = details[(colon + 2)..];
                var dot = rest.IndexOf(". ", StringComparison.Ordinal);
                if (dot > 0)
                {
                    title = rest[..(dot + 1)].TrimEnd('.');
                    venue = YearPattern().Replace(rest[(dot + 2)..], "").Trim();
                }
                else title = YearPattern().Replace(rest, "").Trim();
            }
            list.Add(new PublicationOut(null, eid.Length == 0 ? null : eid, title.Length == 0 ? details : title, venue.Length == 0 ? null : venue, year,
                details.Length == 0 ? null : details, null, authors));
        }
        return list;
    }
}
