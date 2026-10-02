using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using HCMUSSupportV2.Sync.Contracts;
using HCMUSSupportV2.Sync.Sources;

namespace HCMUSSupportV2.Sync.Legacy;

/// <summary>Accent-insensitive comparison key: lower case letters and digits only (<c>Đồng Chủ Nhiệm</c> becomes <c>dongchunhiem</c>).</summary>
internal static class Fold
{
    public static string Text(string s)
    {
        var sb = new StringBuilder();
        foreach (var c in s.Normalize(NormalizationForm.FormD))
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) == UnicodeCategory.NonSpacingMark) continue;
            if (c is 'đ' or 'Đ') { sb.Append('d'); continue; }
            if (char.IsLetterOrDigit(c)) sb.Append(char.ToLowerInvariant(c));
        }
        return sb.ToString();
    }
}

/// <summary>
/// Reads <c>notifications/research-stats.json</c> (v1 envelope; per MSCB a list of rows with the keys
/// <c>{ma_so}</c>, <c>{ten_de_tai}</c>, <c>{tu_cach_tham_gia}</c>, ...) into one row per project member, the shape of the D04 template.
/// Repairs and drops are counted in the <see cref="MappingReport"/> (counts only).
/// </summary>
public static partial class ResearchParser
{
    private const decimal MaxFunding = 99_999_999_999_999m; // numeric(14,0)

    public static IReadOnlyList<LegacyResearchRow> ReadAll(string notificationsDir, MappingReport report)
    {
        var file = Path.Combine(notificationsDir, "research-stats.json");
        if (!File.Exists(file)) return [];
        var rows = new List<V1Row>();
        V1Reader.ParseChunk(File.ReadAllBytes(file), rows);
        return Parse(rows, report);
    }

    private sealed class Project(string code, string title, V1Row first)
    {
        public string Code { get; } = code;
        public string Title { get; } = title;
        public V1Row First { get; } = first;
        public Dictionary<string, string> Members { get; } = new(StringComparer.Ordinal); // MSCB -> role code, insertion ordered below
        public List<string> MemberOrder { get; } = [];
    }

    public static IReadOnlyList<LegacyResearchRow> Parse(IEnumerable<V1Row> rows, MappingReport report)
    {
        var projects = new List<Project>();
        var variants = new Dictionary<string, List<Project>>(StringComparer.Ordinal); // v1 code -> projects that carry it
        var synthesized = new HashSet<string>(StringComparer.Ordinal);
        var inconsistent = new HashSet<string>(StringComparer.Ordinal);

        foreach (var row in rows)
        {
            var title = Collapse(row.Get("ten_de_tai"));
            if (title.Length == 0) { report.Add("research_no_title"); continue; }

            var code = Collapse(row.Get("ma_so"));
            if (code.Length == 0)
            {
                code = SynthesizeCode(title, row.Get("thoi_gian_thuc_hien"));
                synthesized.Add(code);
            }

            if (!variants.TryGetValue(code, out var list)) variants[code] = list = [];
            var project = list.FirstOrDefault(p => Fold.Text(p.Title) == Fold.Text(title));
            if (project is null)
            {
                // The same code under another title: a reused code. The first title keeps the code, later ones get "~2", "~3", ...
                var unique = list.Count == 0 ? code : $"{code}~{list.Count + 1}";
                if (list.Count > 0) report.Add("research_code_reused_for_other_title");
                project = new Project(unique, title, row);
                list.Add(project);
                projects.Add(project);
            }
            else if (DiffersFromFirst(project.First, row)) inconsistent.Add(project.Code);

            var mscb = row.Mscb.Length > 0 ? row.Mscb : Collapse(row.Get("MSCBGV"));
            if (mscb.Length == 0) continue; // a project without a member row is reported below
            var role = RoleOf(row.Get("tu_cach_tham_gia"), report);
            if (project.Members.TryGetValue(mscb, out var current))
            {
                report.Add("research_duplicate_member");
                if (Rank(role) < Rank(current)) project.Members[mscb] = role; // keep the stronger role
            }
            else { project.Members[mscb] = role; project.MemberOrder.Add(mscb); }
        }

        if (synthesized.Count > 0) report.Add("research_code_synthesized", synthesized.Count);
        if (inconsistent.Count > 0) report.Add("research_project_fields_differ", inconsistent.Count);

        var result = new List<LegacyResearchRow>();
        foreach (var p in projects)
        {
            var f = p.First;
            var funding = Funding(f.Get("kinh_phi"), report);
            var accepted = AcceptedOn(f.Get("NgayNghiemThu"), report);
            LegacyResearchRow Row(string? mscb, string role) => new(p.Code, p.Title, Opt(f.Get("TenCapDeTai")), Opt(f.Get("TenLoaiHinhNC")), funding,
                Opt(f.Get("thoi_gian_thuc_hien")), accepted, Opt(f.Get("TenKetQuaDT")), mscb, role);

            if (p.MemberOrder.Count == 0) { report.Add("research_no_member"); result.Add(Row(null, "thanh_vien")); }
            else result.AddRange(p.MemberOrder.Select(m => Row(m, p.Members[m])));
        }
        return result;
    }

    /// <summary><c>Chủ Nhiệm</c>, <c>Đồng Chủ Nhiệm</c> and <c>Thành Viên</c> are the only v1 values. Anything else becomes a plain member.</summary>
    public static string RoleOf(string text, MappingReport? report = null)
    {
        switch (Fold.Text(text))
        {
            case "chunhiem": return "chu_nhiem";
            case "dongchunhiem": return "dong_chu_nhiem";
            case "thanhvien": return "thanh_vien";
            case "": report?.Add("research_role_blank"); return "thanh_vien";
            default: report?.Add("research_role_unknown"); return "thanh_vien";
        }
    }

    private static int Rank(string role) => role switch { "chu_nhiem" => 0, "dong_chu_nhiem" => 1, _ => 2 };

    /// <summary><c>550.000.000</c> becomes 550000000. Anything that is not a whole number of dong is dropped (counted).</summary>
    public static decimal? Funding(string text, MappingReport? report = null)
    {
        var s = text.Replace(".", "").Replace(",", "").Replace(" ", "").Replace(" ", "");
        if (s.Length == 0) return null;
        if (decimal.TryParse(s, NumberStyles.None, CultureInfo.InvariantCulture, out var d) && d <= MaxFunding) return d;
        report?.Add("research_bad_funding");
        return null;
    }

    /// <summary>
    /// <c>dd/MM/yyyy</c> becomes <c>yyyy-MM-dd</c>. A year or month-year alone (v1 has some) cannot be stored in a date column, and an
    /// invented day would be wrong, so it becomes null (counted as <c>research_partial_accepted_date</c>).
    /// </summary>
    public static string? AcceptedOn(string text, MappingReport? report = null)
    {
        var d = DateText.Normalize(text);
        if (d.Value is null) return null;
        if (d.Ok && d.Value.Length == 10) return d.Value;
        report?.Add(d.Ok ? "research_partial_accepted_date" : "research_bad_accepted_date");
        return null;
    }

    private static string SynthesizeCode(string title, string period)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(Fold.Text(title) + "|" + Fold.Text(period)));
        return "V1-" + Convert.ToHexString(hash)[..10];
    }

    private static bool DiffersFromFirst(V1Row a, V1Row b) =>
        new[] { "TenCapDeTai", "TenLoaiHinhNC", "kinh_phi", "thoi_gian_thuc_hien", "NgayNghiemThu", "TenKetQuaDT" }.Any(k => Collapse(a.Get(k)) != Collapse(b.Get(k)));

    private static string Collapse(string s) => Whitespace().Replace(s, " ").Trim();

    private static string? Opt(string s) => Collapse(s) is { Length: > 0 } c ? c : null;

    [GeneratedRegex(@"\s+")] private static partial Regex Whitespace();
}
