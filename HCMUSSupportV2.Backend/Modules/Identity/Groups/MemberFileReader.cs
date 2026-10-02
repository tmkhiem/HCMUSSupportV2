using System.Text;
using ClosedXML.Excel;

namespace HCMUSSupportV2.Backend.Modules.Identity.Groups;

/// <summary>
/// Reads employee codes (MSCB) from an uploaded <c>.csv</c> or <c>.xlsx</c>. The code column is the one whose header
/// is <c>MSCB</c>, <c>code</c>, <c>mã số cán bộ</c> ... (accent and case insensitive); without such a header the first
/// column is used and every row is data. Blank cells are skipped; values are trimmed.
/// </summary>
public static class MemberFileReader
{
    public const int MaxRows = 20_000;
    public const long MaxBytes = 5 * 1024 * 1024;

    private static readonly HashSet<string> HeaderNames = new(StringComparer.Ordinal)
    {
        "mscb", "code", "ma", "ma so", "ma so can bo", "ma can bo", "ma cb", "ma nhan vien", "employee code", "employee",
    };

    public static IReadOnlyList<string> ReadCodes(Stream stream, string fileName)
    {
        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        var rows = ext switch
        {
            ".csv" or ".txt" => ReadCsv(stream),
            ".xlsx" => ReadXlsx(stream),
            _ => throw GroupsException.BadRequest("Unsupported file", "Chỉ hỗ trợ tệp .csv hoặc .xlsx."),
        };
        return ExtractCodes(rows);
    }

    internal static IReadOnlyList<string> ExtractCodes(List<string[]> rows)
    {
        if (rows.Count > MaxRows + 1)
            throw GroupsException.BadRequest("Too many rows", $"Tệp có tối đa {MaxRows} dòng.");

        var column = 0;
        var start = 0;
        if (rows.Count > 0)
        {
            for (var i = 0; i < rows[0].Length; i++)
            {
                if (!HeaderNames.Contains(Normalize(rows[0][i]))) continue;
                column = i;
                start = 1;
                break;
            }
        }

        var codes = new List<string>();
        for (var r = start; r < rows.Count; r++)
        {
            if (column >= rows[r].Length) continue;
            var value = rows[r][column].Trim();
            if (value.Length > 0) codes.Add(value);
        }
        return codes;
    }

    internal static string Normalize(string s) => TextSearch.Unaccent(s).Trim().ToLowerInvariant();

    internal static List<string[]> ReadXlsx(Stream stream)
    {
        try
        {
            using var wb = new XLWorkbook(stream);
            var ws = wb.Worksheets.FirstOrDefault() ?? throw GroupsException.BadRequest("Empty workbook", "Tệp Excel không có trang tính.");
            var rows = new List<string[]>();
            var range = ws.RangeUsed();
            if (range is null) return rows;
            var width = range.ColumnCount();
            foreach (var row in range.Rows())
            {
                if (rows.Count > MaxRows + 1) break;
                rows.Add(Enumerable.Range(0, width).Select(c => row.Cell(c + 1).GetFormattedString().Trim()).ToArray());
            }
            return rows;
        }
        catch (GroupsException) { throw; }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            throw GroupsException.BadRequest("Invalid workbook", "Không đọc được tệp Excel.");
        }
    }

    internal static List<string[]> ReadCsv(Stream stream)
    {
        using var reader = new StreamReader(stream, new UTF8Encoding(false), detectEncodingFromByteOrderMarks: true, leaveOpen: true);
        var text = reader.ReadToEnd();
        var firstLine = text.Split('\n', 2)[0];
        var delimiter = new[] { ',', ';', '\t' }.MaxBy(d => firstLine.Count(ch => ch == d));
        if (firstLine.Count(ch => ch == delimiter) == 0) delimiter = ',';
        return ParseCsv(text, delimiter);
    }

    /// <summary>Minimal RFC 4180 reader: quoted fields, doubled quotes, CRLF or LF.</summary>
    internal static List<string[]> ParseCsv(string text, char delimiter)
    {
        var rows = new List<string[]>();
        var fields = new List<string>();
        var field = new StringBuilder();
        var quoted = false;
        var any = false;

        void EndField() { fields.Add(field.ToString()); field.Clear(); }
        void EndRow()
        {
            EndField();
            if (fields.Any(f => f.Length > 0)) rows.Add(fields.ToArray());
            fields.Clear();
            any = false;
        }

        for (var i = 0; i < text.Length; i++)
        {
            var ch = text[i];
            if (quoted)
            {
                if (ch == '"' && i + 1 < text.Length && text[i + 1] == '"') { field.Append('"'); i++; }
                else if (ch == '"') quoted = false;
                else field.Append(ch);
            }
            else if (ch == '"') { quoted = true; any = true; }
            else if (ch == delimiter) { EndField(); any = true; }
            else if (ch == '\r') { }
            else if (ch == '\n') EndRow();
            else { field.Append(ch); any = true; }

            if (rows.Count > MaxRows + 1) break;
        }
        if (any || field.Length > 0) EndRow();
        return rows;
    }
}
