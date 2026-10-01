using System.Globalization;

namespace HCMUSSupportV2.Sync.Sources;

/// <summary>
/// Normalises the date strings of the sources into the forms the ingest API accepts, keeping precision:
/// <c>d/M/yyyy</c> becomes <c>yyyy-MM-dd</c>, <c>M/yyyy</c> becomes <c>yyyy-MM</c>, <c>yyyy</c> stays a year.
/// </summary>
public static class DateText
{
    /// <summary>Result: <c>Value</c> null for blank input; <c>Ok=false</c> when the text is not a recognisable date
    /// (<c>Value</c> then carries the trimmed original so the API reports it as <c>bad_date</c>).</summary>
    public readonly record struct Result(string? Value, bool Ok);

    public static Result Normalize(string? text)
    {
        var s = text?.Trim();
        if (string.IsNullOrEmpty(s)) return new(null, true);

        // Already ISO (yyyy-MM-dd[Thh:mm...], yyyy-MM, yyyy).
        if (s.Length >= 10 && s[4] == '-' && s[7] == '-'
            && DateTime.TryParseExact(s[..10], "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var iso))
            return new(iso.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), true);

        var parts = s.Split('/', '-', '.');
        if (parts.All(p => p.Length > 0 && p.All(char.IsAsciiDigit)))
        {
            switch (parts.Length)
            {
                case 3 when parts[2].Length == 4 && TryDate(int.Parse(parts[2]), int.Parse(parts[1]), int.Parse(parts[0]), out var d):
                    return new(d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), true);
                case 2 when parts[1].Length == 4 && int.Parse(parts[0]) is >= 1 and <= 12 && int.Parse(parts[1]) is >= 1900 and <= 2200:
                    return new($"{int.Parse(parts[1]):D4}-{int.Parse(parts[0]):D2}", true);
                case 1 when parts[0].Length == 4 && int.Parse(parts[0]) is >= 1900 and <= 2200:
                    return new(parts[0], true);
            }
        }
        return new(s, false);
    }

    /// <summary>Compose a (possibly partial) date from separate day / month / year strings (NS_NHANSU.NGAYSINH, THANGSINH, NAMSINH).</summary>
    public static Result FromParts(string? day, string? month, string? year)
    {
        var d = day?.Trim(); var m = month?.Trim(); var y = year?.Trim();
        if (string.IsNullOrEmpty(y)) return new(null, true);
        if (!int.TryParse(y, out var yy) || yy is < 1900 or > 2200) return new(y, false);
        if (string.IsNullOrEmpty(m)) return new($"{yy:D4}", true);
        if (!int.TryParse(m, out var mm) || mm is < 1 or > 12) return new($"{yy:D4}", false);
        if (string.IsNullOrEmpty(d)) return new($"{yy:D4}-{mm:D2}", true);
        if (!int.TryParse(d, out var dd) || !TryDate(yy, mm, dd, out var date)) return new($"{yy:D4}-{mm:D2}", false);
        return new(date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), true);
    }

    private static bool TryDate(int y, int m, int d, out DateTime date)
    {
        date = default;
        if (y is < 1900 or > 2200 || m is < 1 or > 12 || d < 1 || d > DateTime.DaysInMonth(y, m)) return false;
        date = new DateTime(y, m, d);
        return true;
    }
}
