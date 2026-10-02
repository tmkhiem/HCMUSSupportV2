using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using HCMUSSupportV2.Sync.Contracts;
using HCMUSSupportV2.Sync.Sources;

namespace HCMUSSupportV2.Sync.Legacy;

/// <summary>
/// Reads <c>notifications/paper-details.json</c>: <c>[ { "Eid": "...", "Details": "Authors: Title. Venue vol: pages (year)", "Mscb": ["0300", ...] } ]</c>.
/// The title, venue and year are cut out of <c>Details</c> on a best-effort basis (dblp-like text); <c>details</c> keeps the full text.
/// </summary>
public static partial class PublicationParser
{
    public static IReadOnlyList<LegacyPublicationRow> ReadAll(string notificationsDir, MappingReport report)
    {
        var file = Path.Combine(notificationsDir, "paper-details.json");
        if (!File.Exists(file)) return [];
        return Parse(File.ReadAllBytes(file), report);
    }

    public static IReadOnlyList<LegacyPublicationRow> Parse(byte[] json, MappingReport report)
    {
        using var doc = JsonDocument.Parse(json);
        if (doc.RootElement.ValueKind != JsonValueKind.Array) throw new InvalidOperationException("paper-details.json: an array of {Eid, Details, Mscb} was expected.");

        var byKey = new Dictionary<string, (string? Eid, string Details, List<string> Authors)>(StringComparer.OrdinalIgnoreCase);
        var order = new List<string>();
        foreach (var item in doc.RootElement.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object) continue;
            var eid = Str(item, "Eid");
            var details = Collapse(Str(item, "Details") ?? "");
            if (details.Length == 0) { report.Add("paper_no_details"); continue; }
            var authors = Authors(item);
            if (authors.Count == 0) { report.Add("paper_no_authors"); continue; }

            var key = string.IsNullOrEmpty(eid) ? "details:" + details : "eid:" + eid;
            if (byKey.TryGetValue(key, out var existing))
            {
                report.Add("paper_duplicate_eid");
                existing.Authors.AddRange(authors.Where(a => !existing.Authors.Contains(a)));
                continue;
            }
            byKey[key] = (string.IsNullOrEmpty(eid) ? null : eid, details, authors);
            order.Add(key);
        }

        var rows = new List<LegacyPublicationRow>();
        foreach (var key in order)
        {
            var (eid, details, authors) = byKey[key];
            var (title, venue, year) = ParseDetails(details);
            if (venue is null) report.Add("paper_no_venue");
            if (year is null) report.Add("paper_no_year");
            rows.Add(new LegacyPublicationRow(null, eid, title, venue, year, details, null, authors));
        }
        return rows;
    }

    /// <summary>
    /// <c>A, B, C: Title: with colons. Venue 12(3): 45-67 (2024)</c> gives title <c>Title: with colons</c>, venue <c>Venue</c>, year 2024.
    /// The author list ends at the first <c>: </c> (names have no colon). The title ends at the first sentence end whose last word has at
    /// least three characters (so initials such as <c>J.</c> do not split it) or at <c>?</c>/<c>!</c>. Text that does not fit comes back as the title.
    /// </summary>
    public static (string Title, string? Venue, int? Year) ParseDetails(string details)
    {
        var text = Collapse(details);
        var colon = text.IndexOf(": ", StringComparison.Ordinal);
        var rest = colon > 0 ? text[(colon + 2)..].Trim() : text;

        int? year = null;
        var trailingYear = TrailingYear().Match(rest);
        if (trailingYear.Success)
        {
            year = int.Parse(trailingYear.Groups[1].Value, CultureInfo.InvariantCulture);
            rest = rest[..trailingYear.Index].TrimEnd();
        }

        string title = rest;
        string? venue = null;
        foreach (Match m in SentenceEnd().Matches(rest))
        {
            var punctuation = rest[m.Index];
            var lastWord = LastWord().Match(rest[..m.Index]).Value;
            if (punctuation == '.' && lastWord.Length < 3) continue;
            title = rest[..(m.Index + (punctuation == '.' ? 0 : 1))].Trim();
            venue = rest[(m.Index + 1)..].Trim();
            break;
        }

        if (venue is not null)
        {
            var volume = VolumeAndPages().Match(venue);
            if (volume.Success)
            {
                if (year is null && volume.Groups[1].Value.Length == 4 && int.Parse(volume.Groups[1].Value, CultureInfo.InvariantCulture) is >= 1900 and <= 2200)
                    year = int.Parse(volume.Groups[1].Value, CultureInfo.InvariantCulture); // conference style: "CVPR 2019: 1-10"
                venue = venue[..volume.Index].Trim();
            }
            if (venue.Length == 0) venue = null;
        }
        if (title.Length == 0) title = text;
        return (title, venue, year);
    }

    private static string? Str(JsonElement item, string name)
    {
        foreach (var p in item.EnumerateObject())
            if (p.Name.Trim('{', '}').Equals(name, StringComparison.OrdinalIgnoreCase))
                return p.Value.ValueKind == JsonValueKind.String ? p.Value.GetString()?.Trim() : p.Value.ValueKind == JsonValueKind.Null ? null : p.Value.ToString();
        return null;
    }

    private static List<string> Authors(JsonElement item)
    {
        var list = new List<string>();
        foreach (var p in item.EnumerateObject())
        {
            if (!p.Name.Trim('{', '}').Equals("Mscb", StringComparison.OrdinalIgnoreCase)) continue;
            IEnumerable<string?> values = p.Value.ValueKind == JsonValueKind.Array
                ? p.Value.EnumerateArray().Select(v => v.ValueKind == JsonValueKind.String ? v.GetString() : v.ToString())
                : [p.Value.ValueKind == JsonValueKind.String ? p.Value.GetString() : null];
            foreach (var v in values.Select(v => v?.Trim()))
                if (!string.IsNullOrEmpty(v) && !list.Contains(v)) list.Add(v);
        }
        return list;
    }

    private static string Collapse(string s) => Whitespace().Replace(s, " ").Trim();

    [GeneratedRegex(@"\s+")] private static partial Regex Whitespace();
    [GeneratedRegex(@"\s*\((\d{4})\)\s*$")] private static partial Regex TrailingYear();
    [GeneratedRegex(@"[.?!](?=\s+\S)")] private static partial Regex SentenceEnd();
    [GeneratedRegex(@"[\p{L}\p{N}\-']*$")] private static partial Regex LastWord();
    [GeneratedRegex(@"\s+(\d+)[A-Za-z]?(?:\(\d+[^)]*\))?\s*:\s*\S+$")] private static partial Regex VolumeAndPages();
}
