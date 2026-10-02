using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using HCMUSSupportV2.Sync.Contracts;
using HCMUSSupportV2.Sync.Sources;
using HtmlAgilityPack;

namespace HCMUSSupportV2.Sync.Legacy;

/// <summary>The rows of one academic year, from one <c>teaching-stats-*.json</c> file.</summary>
public sealed record TeachingYear(string AcademicYear, string FileName, IReadOnlyList<LegacyTeachingRow> Rows);

/// <summary>
/// Reads <c>notifications/teaching-stats/teaching-stats-*.json</c>: the v1 envelope whose per-MSCB value is a single
/// <c>{rows}</c> string of HTML table rows <c>&lt;tr&gt;&lt;td&gt;course&lt;/td&gt;&lt;td&gt;class&lt;/td&gt;&lt;td&gt;level, HKn&lt;/td&gt;&lt;td&gt;hours&lt;/td&gt;&lt;/tr&gt;</c>.
/// Everything the mapping drops or repairs is counted in the <see cref="MappingReport"/> (counts only).
/// </summary>
public static partial class TeachingParser
{
    private const decimal MaxHours = 99999m; // numeric(7,2) on the server, and its validation limit

    public static IReadOnlyList<TeachingYear> ReadAll(string notificationsDir, int? unknownTerm, MappingReport report)
    {
        var dir = Path.Combine(notificationsDir, "teaching-stats");
        if (!Directory.Exists(dir)) return [];

        var years = new List<TeachingYear>();
        foreach (var file in Directory.GetFiles(dir, "teaching-stats-*.json").OrderBy(f => f, StringComparer.Ordinal))
        {
            var year = ParseFile(File.ReadAllBytes(file), Path.GetFileName(file), unknownTerm, report);
            if (year is null) continue;
            if (years.Any(y => y.AcademicYear == year.AcademicYear))
            {
                // Two files for one year would make the server reject the batch (duplicate lines). The first file wins.
                report.Add("teaching_year_in_several_files");
                continue;
            }
            years.Add(year);
        }
        return years;
    }

    /// <summary>Parses one file. Null when the academic year cannot be determined (counted as <c>teaching_file_year_unknown</c>).</summary>
    public static TeachingYear? ParseFile(byte[] json, string fileName, int? unknownTerm, MappingReport report)
    {
        string header;
        using (var doc = JsonDocument.Parse(json))
            header = doc.RootElement.TryGetProperty("header", out var h) && h.ValueKind == JsonValueKind.String ? h.GetString() ?? "" : "";

        var year = AcademicYearOf(header, fileName, report);
        if (year is null) { report.Add("teaching_file_year_unknown"); return null; }

        var rows = new List<V1Row>();
        V1Reader.ParseChunk(json, rows);

        var merged = new Dictionary<string, (LegacyTeachingRow Row, decimal Hours)>(StringComparer.Ordinal);
        var order = new List<string>();
        foreach (var v1 in rows)
        {
            var mscb = v1.Mscb;
            if (mscb.Length == 0) { report.Add("teaching_no_mscb"); continue; }
            foreach (var cells in TableRows(v1.Get("rows")))
            {
                if (cells.Count < 4) { report.Add("teaching_bad_row"); continue; }
                var course = cells[0];
                if (course.Length == 0) { report.Add("teaching_no_course"); continue; }
                if (!TryHours(cells[3], out var hours)) { report.Add("teaching_bad_hours"); continue; }
                if (hours > MaxHours) { report.Add("teaching_hours_too_large"); continue; }

                var (level, term) = LevelAndTerm(cells[2]);
                if (term is null)
                {
                    if (unknownTerm is null) { report.Add("teaching_no_term"); continue; }
                    report.Add("teaching_no_term_assigned");
                    term = unknownTerm;
                }
                var cls = cells[1].Length == 0 ? null : cells[1];

                // The same teacher can have several lines for one course and class (sessions, groups): they add up, as the
                // server's duplicate check treats them as one line (teacher, year, term, course, class, level).
                var key = string.Join('|', mscb, term, course, cls ?? "", level ?? "");
                if (merged.TryGetValue(key, out var existing))
                {
                    merged[key] = (existing.Row, existing.Hours + hours);
                    report.Add("teaching_merged_lines");
                }
                else
                {
                    merged[key] = (new LegacyTeachingRow(mscb, year, term.Value, null, course, cls, level, 0, 0m), hours);
                    order.Add(key);
                }
            }
        }

        var result = order.Select(k => merged[k]).Select(m => m.Row with { StandardHours = Math.Round(m.Hours, 2, MidpointRounding.AwayFromZero) }).ToList();
        return new TeachingYear(year, fileName, result);
    }

    /// <summary>
    /// The academic year of a file. The header (<c>Thông tin giảng dạy trong năm học 2020-2021 ...</c>) wins over the file name:
    /// <c>teaching-stats-2019-2021.json</c> carries the single year 2020-2021 (see docs/SYNC.md). Only a consecutive pair is a year.
    /// </summary>
    public static string? AcademicYearOf(string header, string fileName, MappingReport? report = null)
    {
        var fromHeader = ConsecutivePair(header);
        var fromName = ConsecutivePair(Path.GetFileNameWithoutExtension(fileName));
        if (fromHeader is not null && fromName is not null && fromHeader != fromName) report?.Add("teaching_header_year_differs_from_file_name");
        return fromHeader ?? fromName;
    }

    private static string? ConsecutivePair(string text)
    {
        foreach (Match m in YearPair().Matches(text))
        {
            var a = int.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture);
            var b = int.Parse(m.Groups[2].Value, CultureInfo.InvariantCulture);
            if (b == a + 1) return $"{a}-{b}";
        }
        return null;
    }

    /// <summary>
    /// <c>Đại học (CLC), HK3</c> becomes level <c>Đại học (CLC)</c> and term 3. The term is only 1, 2 or 3: <c>HKHP3</c>, <c>HKNone</c> and
    /// text without <c>HK</c> (postgraduate lines such as <c>Cao học, Học phần 4</c>) have none, and then the whole text is the level.
    /// v1 prints a missing class type as <c>(None)</c>, which is dropped.
    /// </summary>
    public static (string? Level, int? Term) LevelAndTerm(string text)
    {
        var s = text.Trim();
        int? term = null;
        var m = TermSuffix().Match(s);
        if (m.Success)
        {
            if (m.Groups[1].Value is "1" or "2" or "3") term = int.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture);
            s = s[..m.Index].Trim();
        }
        s = NoneType().Replace(s, "").Trim();
        return (s.Length == 0 ? null : s, term);
    }

    /// <summary>Hours as v1 prints them: <c>9.12</c>, <c>45</c>, tolerating a decimal comma (<c>9,12</c>) and a thousands separator (<c>1.234,5</c>).</summary>
    public static bool TryHours(string text, out decimal hours)
    {
        hours = 0;
        var s = text.Trim().Replace(" ", "").Replace(" ", "");
        if (s.Length == 0) return false;
        var comma = s.LastIndexOf(',');
        var dot = s.LastIndexOf('.');
        if (comma >= 0 && dot >= 0) s = comma > dot ? s.Replace(".", "").Replace(',', '.') : s.Replace(",", "");
        else if (comma >= 0) s = s.Replace(',', '.');
        return decimal.TryParse(s, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out hours) && hours >= 0;
    }

    /// <summary>The cell texts (entities decoded, whitespace collapsed) of every <c>&lt;tr&gt;</c> in an HTML fragment.</summary>
    public static IEnumerable<IReadOnlyList<string>> TableRows(string html)
    {
        if (string.IsNullOrWhiteSpace(html)) yield break;
        var doc = new HtmlDocument();
        doc.LoadHtml(html);
        var trs = doc.DocumentNode.SelectNodes("//tr");
        if (trs is null) yield break;
        foreach (var tr in trs)
        {
            var cells = tr.SelectNodes(".//td|.//th");
            yield return cells is null ? [] : cells.Select(c => Whitespace().Replace(HtmlEntity.DeEntitize(c.InnerText), " ").Trim()).ToList();
        }
    }

    [GeneratedRegex(@"(\d{4})\s*-\s*(\d{4})")] private static partial Regex YearPair();
    [GeneratedRegex(@"(?:,\s*|\s+)HK(\w*)\s*$", RegexOptions.IgnoreCase)] private static partial Regex TermSuffix();
    [GeneratedRegex(@"\s*\(None\)", RegexOptions.IgnoreCase)] private static partial Regex NoneType();
    [GeneratedRegex(@"\s+")] private static partial Regex Whitespace();
}
