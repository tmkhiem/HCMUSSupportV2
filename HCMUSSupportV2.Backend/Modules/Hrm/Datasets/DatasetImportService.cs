using System.Globalization;
using System.Text;
using System.Text.Json;
using ClosedXML.Excel;
using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Hrm.Domain;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using HCMUSSupportV2.Backend.Modules.Platform.Files;
using Microsoft.EntityFrameworkCore;
using UUIDNext;

namespace HCMUSSupportV2.Backend.Modules.Hrm.Datasets;

public record ImportIssueDto(int Row, string Column, string Message);

/// <summary>Result of validating an uploaded workbook (and, later, of applying it).</summary>
public record ImportReportDto(
    Guid Id, string Dataset, string Status, string FileName, int TotalRows, int NewRows, int UpdatedRows, int RemovedRows,
    IReadOnlyList<string> UnknownMscbs, IReadOnlyList<ImportIssueDto> BadValues, IReadOnlyList<string> AcademicYears);

public class DatasetImportException(string message, int status = 400) : Exception(message)
{
    public int Status { get; } = status;
}

public static class DatasetNames
{
    public const string Teaching = "teaching";
    public const string Research = "research";
    public const string Publications = "publications";
    public static readonly string[] All = [Teaching, Research, Publications];
}

/// <summary>
/// Admin Excel datasets (teaching, research, publications): upload and validate (status <c>validated</c> or <c>rejected</c>,
/// nothing is written to the dataset), then apply, which replaces the dataset in one transaction (teaching per academic
/// year, research and publications as a whole).
/// </summary>
public class DatasetImportService(AppDbContext db, IFileStore files, ICurrentUser user, IAuditLogger audit, TimeProvider time)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    // ------------------------------------------------------------------ templates

    private sealed record Column(string Key, string Header, bool Required, string Hint);

    private static readonly Column[] TeachingColumns =
    [
        new("mscb", "MSCB", true, "Mã số cán bộ"),
        new("year", "Năm học", true, "Ví dụ 2024-2025"),
        new("program", "Bậc đào tạo", true, "Đại học, Cao học hoặc Tiến sĩ"),
        new("term", "Học kỳ", false, "1, 2 hoặc 3: bắt buộc với bậc Đại học, phải để trống với Cao học và Tiến sĩ"),
        new("module", "Học phần/chuyên đề", false, "Chỉ dùng cho Cao học và Tiến sĩ, ví dụ Học phần 3, CĐTS, HPTS; để trống với bậc Đại học"),
        new("course_code", "Mã môn", false, ""),
        new("course_name", "Tên môn", true, ""),
        new("class_code", "Mã lớp", false, ""),
        new("track", "Hệ", false, "Loại chương trình, ví dụ CQ, CLC"),
        new("activity", "Loại hoạt động", false, "Ví dụ LYTHUYET, THUCHANH, BAITAP, TROGIANG, CHUANBI, KHOALUANTN, SEMINARTN"),
        new("periods", "Số tiết", false, "Số nguyên"),
        new("hours", "Giờ chuẩn", true, "Số thập phân"),
    ];

    private static readonly Column[] ResearchColumns =
    [
        new("code", "Mã đề tài", true, "Duy nhất cho mỗi đề tài; mỗi thành viên một dòng, lặp lại thông tin đề tài"),
        new("title", "Tên đề tài", true, ""),
        new("level", "Cấp", false, "Cơ sở, Bộ, Nhà nước, ..."),
        new("type", "Loại hình nghiên cứu", false, ""),
        new("funding", "Kinh phí", false, "Đồng, số nguyên"),
        new("period", "Thời gian", false, "Văn bản, ví dụ 2022-2023"),
        new("accepted", "Ngày nghiệm thu", false, "dd/MM/yyyy hoặc yyyy-MM-dd"),
        new("result", "Kết quả", false, ""),
        new("mscb", "MSCB", false, "Mã số cán bộ của thành viên"),
        new("role", "Vai trò", false, "Chủ nhiệm hoặc Thành viên"),
    ];

    private static readonly Column[] PublicationColumns =
    [
        new("doi", "DOI", false, "Duy nhất nếu có"),
        new("eid", "EID", false, "Duy nhất nếu có"),
        new("title", "Tên bài báo", true, ""),
        new("venue", "Tạp chí/Hội nghị", false, ""),
        new("year", "Năm", false, "yyyy"),
        new("details", "Chi tiết", false, "Tập, số, trang, ..."),
        new("url", "Đường dẫn", false, ""),
        new("authors", "MSCB tác giả", true, "Các MSCB cách nhau bởi dấu ; hoặc dấu phẩy, theo thứ tự tác giả"),
    ];

    private static Column[] ColumnsOf(string dataset) => dataset switch
    {
        DatasetNames.Teaching => TeachingColumns,
        DatasetNames.Research => ResearchColumns,
        DatasetNames.Publications => PublicationColumns,
        _ => throw new DatasetImportException("Bộ dữ liệu không hợp lệ.", 404),
    };

    public byte[] BuildTemplate(string dataset)
    {
        var columns = ColumnsOf(dataset);
        using var wb = new XLWorkbook();
        var ws = wb.AddWorksheet("Dữ liệu");
        for (var i = 0; i < columns.Length; i++)
        {
            var cell = ws.Cell(1, i + 1);
            cell.Value = columns[i].Header;
            cell.Style.Font.Bold = true;
            cell.Style.Fill.BackgroundColor = XLColor.FromHtml("#303F9F");
            cell.Style.Font.FontColor = XLColor.White;
            ws.Column(i + 1).Width = Math.Max(14, columns[i].Header.Length + 4);
        }
        ws.SheetView.FreezeRows(1);

        var help = wb.AddWorksheet("Hướng dẫn");
        help.Cell(1, 1).Value = "Cột";
        help.Cell(1, 2).Value = "Bắt buộc";
        help.Cell(1, 3).Value = "Ghi chú";
        help.Range(1, 1, 1, 3).Style.Font.Bold = true;
        for (var i = 0; i < columns.Length; i++)
        {
            help.Cell(i + 2, 1).Value = columns[i].Header;
            help.Cell(i + 2, 2).Value = columns[i].Required ? "Có" : "Không";
            help.Cell(i + 2, 3).Value = columns[i].Hint;
        }
        help.Cell(columns.Length + 4, 1).Value = dataset switch
        {
            DatasetNames.Teaching => "Khi áp dụng, dữ liệu của từng cặp (năm học, bậc đào tạo) có trong tệp sẽ được thay thế hoàn toàn; các bậc khác của cùng năm học được giữ nguyên.",
            _ => "Khi áp dụng, toàn bộ dữ liệu hiện có của bộ dữ liệu này sẽ được thay thế bằng nội dung tệp.",
        };
        help.Columns().AdjustToContents();

        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    // ------------------------------------------------------------------ parsed rows

    private sealed record ResearchRowData(int Row, string Code, string Title, string? Level, string? Type, decimal? Funding, string? Period, DateOnly? Accepted, string? Result, string? Mscb, string Role);

    private sealed record PublicationRowData(int Row, string? Doi, string? Eid, string Title, string? Venue, int? Year, string? Details, string? Url, IReadOnlyList<string> Authors)
    {
        public string Key => !string.IsNullOrEmpty(Doi) ? "doi:" + Doi.ToLowerInvariant() : !string.IsNullOrEmpty(Eid) ? "eid:" + Eid.ToLowerInvariant() : $"title:{Title.ToLowerInvariant()}|{Year}";
    }

    private sealed class Parsed
    {
        public List<ImportIssueDto> Bad { get; } = [];
        public List<TeachingLoadRow> Teaching { get; } = [];
        public List<ResearchRowData> Research { get; } = [];
        public List<PublicationRowData> Publications { get; } = [];
    }

    private static string Normalize(string s)
    {
        var d = s.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder();
        foreach (var c in d)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) == UnicodeCategory.NonSpacingMark) continue;
            if (c is 'đ' or 'Đ') { sb.Append('d'); continue; }
            if (char.IsLetterOrDigit(c)) sb.Append(char.ToLowerInvariant(c));
        }
        return sb.ToString();
    }

    private static Parsed Parse(string dataset, Stream content)
    {
        var parsed = new Parsed();
        var columns = ColumnsOf(dataset);
        XLWorkbook wb;
        try { wb = new XLWorkbook(content); }
        catch (Exception) { throw new DatasetImportException("Không đọc được tệp Excel (.xlsx). Hãy dùng tệp mẫu."); }

        using (wb)
        {
            var ws = wb.Worksheets.FirstOrDefault() ?? throw new DatasetImportException("Tệp Excel không có trang tính nào.");
            var used = ws.RangeUsed();
            if (used is null) { parsed.Bad.Add(new(1, "", "Tệp không có dữ liệu.")); return parsed; }

            var headerRow = used.FirstRow().RowNumber();
            var map = new Dictionary<string, int>();
            foreach (var cell in ws.Row(headerRow).CellsUsed()) map.TryAdd(Normalize(cell.GetString()), cell.Address.ColumnNumber);

            var index = new Dictionary<string, int>();
            foreach (var c in columns)
            {
                if (map.TryGetValue(Normalize(c.Header), out var col)) index[c.Key] = col;
                else if (c.Required) parsed.Bad.Add(new(headerRow, c.Header, $"Thiếu cột bắt buộc \"{c.Header}\"."));
            }
            if (parsed.Bad.Count > 0) return parsed;

            string? Text(IXLRow row, string key)
            {
                if (!index.TryGetValue(key, out var col)) return null;
                var cell = row.Cell(col);
                var s = cell.DataType == XLDataType.Number ? cell.GetDouble().ToString("0.##########", CultureInfo.InvariantCulture) : cell.GetFormattedString();
                s = s.Trim();
                return s.Length == 0 ? null : s;
            }

            void Bad(int row, string key, string message) => parsed.Bad.Add(new(row, columns.First(c => c.Key == key).Header, message));

            foreach (var row in ws.Rows(headerRow + 1, used.LastRow().RowNumber()))
            {
                var r = row.RowNumber();
                if (row.IsEmpty() || columns.All(c => Text(row, c.Key) is null)) continue;

                switch (dataset)
                {
                    case DatasetNames.Teaching: ParseTeaching(row, r, Text, Bad, parsed); break;
                    case DatasetNames.Research: ParseResearch(row, r, Text, Bad, parsed, ws); break;
                    default: ParsePublication(row, r, Text, Bad, parsed); break;
                }
            }
        }
        return parsed;
    }

    private static void ParseTeaching(IXLRow row, int r, Func<IXLRow, string, string?> text, Action<int, string, string> bad, Parsed parsed)
    {
        var errors = parsed.Bad.Count;
        int? term = null;
        if (text(row, "term") is { } t)
        {
            if (int.TryParse(t, NumberStyles.Integer, CultureInfo.InvariantCulture, out var ti)) term = ti;
            else bad(r, "term", TeachingLoadRules.TermMessage);
        }
        var periods = 0;
        if (text(row, "periods") is { } p && (!int.TryParse(p, NumberStyles.Integer, CultureInfo.InvariantCulture, out periods) || periods < 0)) bad(r, "periods", "Số tiết phải là số nguyên không âm.");
        if (!TryDecimal(text(row, "hours"), out var hours) || hours < 0 || hours > 99999) bad(r, "hours", "Giờ chuẩn phải là số không âm.");
        if (parsed.Bad.Count > errors) return;

        var raw = new TeachingLoadRow(text(row, "mscb") ?? "", text(row, "year") ?? "", text(row, "program") ?? "", term, text(row, "module"),
            text(row, "course_code"), text(row, "course_name") ?? "", text(row, "class_code"), text(row, "track"), text(row, "activity"), periods, hours);
        if (TeachingLoadRules.TryNormalize(raw, r, parsed.Bad, out var normalized)) parsed.Teaching.Add(normalized);
    }

    private static void ParseResearch(IXLRow row, int r, Func<IXLRow, string, string?> text, Action<int, string, string> bad, Parsed parsed, IXLWorksheet ws)
    {
        var errors = parsed.Bad.Count;
        var code = text(row, "code");
        if (code is null) bad(r, "code", "Thiếu mã đề tài.");
        var title = text(row, "title");
        if (title is null) bad(r, "title", "Thiếu tên đề tài.");
        decimal? funding = null;
        if (text(row, "funding") is { } f)
        {
            if (TryDecimal(f, out var fd) && fd is >= 0 and < 100_000_000_000_000m) funding = Math.Round(fd);
            else bad(r, "funding", "Kinh phí phải là số không âm.");
        }
        DateOnly? accepted = null;
        if (text(row, "accepted") is { } a)
        {
            if (PartialDateParse(a) is { } d) accepted = d; else bad(r, "accepted", "Ngày nghiệm thu không hợp lệ.");
        }
        var role = text(row, "role") is { } rl ? NormalizeRole(rl) : "thanh_vien";
        if (role is null) bad(r, "role", "Vai trò phải là Chủ nhiệm hoặc Thành viên.");
        if (parsed.Bad.Count == errors)
            parsed.Research.Add(new ResearchRowData(r, code!, title!, text(row, "level"), text(row, "type"), funding, text(row, "period"), accepted, text(row, "result"), text(row, "mscb"), role!));
    }

    private static void ParsePublication(IXLRow row, int r, Func<IXLRow, string, string?> text, Action<int, string, string> bad, Parsed parsed)
    {
        var errors = parsed.Bad.Count;
        var title = text(row, "title");
        if (title is null) bad(r, "title", "Thiếu tên bài báo.");
        int? year = null;
        if (text(row, "year") is { } y)
        {
            if (int.TryParse(y, NumberStyles.Integer, CultureInfo.InvariantCulture, out var yi) && yi is >= 1900 and <= 2200) year = yi;
            else bad(r, "year", "Năm không hợp lệ.");
        }
        var authors = (text(row, "authors") ?? "").Split([';', ',', '\n', ' '], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Distinct().ToList();
        if (authors.Count == 0) bad(r, "authors", "Cần ít nhất một MSCB tác giả.");
        if (parsed.Bad.Count == errors)
            parsed.Publications.Add(new PublicationRowData(r, text(row, "doi"), text(row, "eid"), title!, text(row, "venue"), year, text(row, "details"), text(row, "url"), authors));
    }

    private static bool TryDecimal(string? s, out decimal value)
    {
        value = 0;
        return s is not null && decimal.TryParse(s.Replace(',', '.'), NumberStyles.Number, CultureInfo.InvariantCulture, out value);
    }

    private static DateOnly? PartialDateParse(string s) =>
        DateOnly.TryParseExact(s.Trim().Split(' ')[0], ["dd/MM/yyyy", "d/M/yyyy", "yyyy-MM-dd", "MM/dd/yyyy"], CultureInfo.InvariantCulture, DateTimeStyles.None, out var d) ? d : null;

    private static string? NormalizeRole(string s) => Normalize(s) switch
    {
        "chunhiem" or "chunhiemdetai" or "chair" or "pi" => "chu_nhiem",
        "thanhvien" or "member" or "tham gia" or "thamgia" => "thanh_vien",
        _ => null,
    };

    // ------------------------------------------------------------------ validate

    public async Task<ImportReportDto> ValidateAsync(string dataset, IFormFile file, CancellationToken ct)
    {
        ColumnsOf(dataset); // 404 for unknown datasets
        if (file.Length == 0) throw new DatasetImportException("Tệp rỗng.");
        if (!Path.GetExtension(file.FileName).Equals(".xlsx", StringComparison.OrdinalIgnoreCase))
            throw new DatasetImportException("Chỉ nhận tệp Excel .xlsx. Hãy tải tệp mẫu.");

        // Parse from a buffered copy first so a corrupt workbook is rejected before anything is stored.
        await using var buffer = new MemoryStream();
        await file.CopyToAsync(buffer, ct);
        buffer.Position = 0;
        var parsed = Parse(dataset, buffer);

        buffer.Position = 0;
        StoredFile stored;
        try
        {
            stored = await files.SaveAsync(buffer, Path.GetFileName(file.FileName),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", user.Code, ct);
        }
        catch (FileRejectedException ex) { throw new DatasetImportException(ex.Message); }

        var report = await BuildReportAsync(dataset, parsed, ct);
        var id = Uuid.NewDatabaseFriendly(Database.PostgreSql);
        var status = report.BadValues.Count == 0 && report.TotalRows > 0 ? ImportStatuses.Validated : ImportStatuses.Rejected;
        report = report with { Id = id, Status = status, FileName = stored.FileName };

        db.Set<DatasetImport>().Add(new DatasetImport
        {
            Id = id, Dataset = dataset, FileId = stored.Id, Status = status, CreatedBy = user.Code,
            Summary = JsonSerializer.Serialize(new { report.TotalRows, report.NewRows, report.UpdatedRows, report.RemovedRows, unknownMscbs = report.UnknownMscbs.Count, badValues = report.BadValues.Count }, Json),
            Report = JsonSerializer.Serialize(report, Json),
        });
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("dataset.import_validate", "dataset_import", id.ToString(), new { dataset, status, report.TotalRows }, ct);
        return report;
    }

    public async Task<ImportReportDto?> GetReportAsync(Guid id, CancellationToken ct)
    {
        var import = await db.Set<DatasetImport>().AsNoTracking().FirstOrDefaultAsync(i => i.Id == id, ct);
        if (import is null) return null;
        var report = JsonSerializer.Deserialize<ImportReportDto>(import.Report, Json)!;
        return report with { Status = import.Status };
    }

    private async Task<HashSet<string>> KnownCodesAsync(IEnumerable<string> codes, CancellationToken ct)
    {
        var distinct = codes.Distinct().ToArray();
        return (await db.Set<Employee>().AsNoTracking().Where(e => distinct.Contains(e.Code)).Select(e => e.Code).ToListAsync(ct)).ToHashSet();
    }

    private async Task<ImportReportDto> BuildReportAsync(string dataset, Parsed parsed, CancellationToken ct)
    {
        var bad = parsed.Bad.ToList();
        var unknown = new SortedSet<string>(StringComparer.Ordinal);
        int total, added = 0, updated = 0, removed = 0;
        IReadOnlyList<string> years = [];

        switch (dataset)
        {
            case DatasetNames.Teaching:
            {
                (total, added, updated, removed, years) = await BuildTeachingReportAsync(parsed.Teaching, bad, unknown, ct);
                break;
            }
            case DatasetNames.Research:
            {
                var projects = parsed.Research.GroupBy(r => r.Code).ToList();
                total = projects.Count;
                foreach (var g in projects)
                {
                    var first = g.First();
                    foreach (var other in g.Skip(1).Where(o => o.Title != first.Title))
                        bad.Add(new(other.Row, "Tên đề tài", $"Cùng mã đề tài {g.Key} nhưng tên khác dòng {first.Row}."));
                }
                var known = await KnownCodesAsync(parsed.Research.Where(r => r.Mscb != null).Select(r => r.Mscb!), ct);
                foreach (var r in parsed.Research.Where(r => r.Mscb != null && !known.Contains(r.Mscb))) unknown.Add(r.Mscb!);
                foreach (var dup in parsed.Research.Where(r => r.Mscb != null).GroupBy(r => (r.Code, r.Mscb)).Where(g => g.Count() > 1))
                    bad.Add(new(dup.Skip(1).First().Row, "MSCB", $"MSCB {dup.Key.Mscb} lặp lại trong đề tài {dup.Key.Code}."));
                var existing = await db.Set<ResearchProject>().AsNoTracking().ToListAsync(ct);
                var fileCodes = projects.Select(g => g.Key).ToHashSet();
                foreach (var g in projects)
                {
                    var f = g.First();
                    var e = existing.FirstOrDefault(x => x.Code == f.Code);
                    if (e is null) added++;
                    else if (e.Title != f.Title || e.Level != f.Level || e.ResearchType != f.Type || e.Funding != f.Funding || e.PeriodText != f.Period || e.AcceptedOn != f.Accepted || e.Result != f.Result) updated++;
                }
                removed = existing.Count(e => !fileCodes.Contains(e.Code));
                break;
            }
            default:
            {
                total = parsed.Publications.Count;
                var known = await KnownCodesAsync(parsed.Publications.SelectMany(p => p.Authors), ct);
                foreach (var a in parsed.Publications.SelectMany(p => p.Authors).Where(a => !known.Contains(a))) unknown.Add(a);
                foreach (var dup in parsed.Publications.GroupBy(p => p.Key).Where(g => g.Count() > 1))
                    bad.Add(new(dup.Skip(1).First().Row, "DOI", $"Bài báo trùng với dòng {dup.First().Row} (cùng DOI/EID hoặc tên và năm)."));
                var existing = (await db.Set<Publication>().AsNoTracking().ToListAsync(ct)).GroupBy(PublicationKey).ToDictionary(g => g.Key, g => g.First());
                foreach (var p in parsed.Publications.DistinctBy(p => p.Key))
                {
                    if (!existing.TryGetValue(p.Key, out var e)) added++;
                    else if (e.Title != p.Title || e.Venue != p.Venue || e.Year != p.Year || e.Details != p.Details || e.Url != p.Url) updated++;
                }
                var fileKeys = parsed.Publications.Select(p => p.Key).ToHashSet();
                removed = existing.Count(kv => !fileKeys.Contains(kv.Key));
                break;
            }
        }

        return new ImportReportDto(Guid.Empty, dataset, ImportStatuses.Validated, "", total, added, updated, removed,
            unknown.ToList(), bad.OrderBy(b => b.Row).ToList(), years);
    }

    /// <summary>
    /// Diff of already-validated teaching rows against the stored ones: duplicate and unknown-MSCB findings are appended to
    /// <paramref name="bad"/> and <paramref name="unknown"/>. Reusable for any row source (xlsx today, the legacy JSON endpoint later).
    /// </summary>
    public async Task<(int Total, int New, int Updated, int Removed, IReadOnlyList<string> Years)> BuildTeachingReportAsync(
        IReadOnlyList<TeachingLoadRow> rows, ICollection<ImportIssueDto> bad, ISet<string> unknown, CancellationToken ct)
    {
        var known = await KnownCodesAsync(rows.Select(t => t.EmployeeCode), ct);
        foreach (var dup in rows.GroupBy(t => t.Key).Where(g => g.Count() > 1))
            bad.Add(new(dup.Skip(1).First().SourceRow, "MSCB", $"Dòng trùng với dòng {dup.First().SourceRow} (cùng MSCB, năm học, bậc đào tạo, học kỳ, học phần, môn, lớp, hệ, loại hoạt động)."));
        var ok = rows.Where(t => known.Contains(t.EmployeeCode)).ToList();
        foreach (var t in rows.Where(t => !known.Contains(t.EmployeeCode))) unknown.Add(t.EmployeeCode);
        var years = rows.Select(t => t.AcademicYear).Distinct().OrderByDescending(y => y).ToList();
        var scopes = rows.Select(t => (t.AcademicYear, t.Program)).Distinct().ToList();
        var existing = (await db.Set<TeachingLoad>().AsNoTracking().Where(t => years.Contains(t.AcademicYear)).ToListAsync(ct))
            .Where(e => scopes.Contains((e.AcademicYear, e.Program))).ToList();
        var existingByKey = existing.GroupBy(e => TeachingLoadRow.KeyOf(e)).ToDictionary(g => g.Key, g => g.First());
        var fileKeys = ok.Select(t => t.Key).ToHashSet();
        int added = 0, updated = 0;
        foreach (var t in ok.DistinctBy(t => t.Key))
        {
            if (!existingByKey.TryGetValue(t.Key, out var e)) added++;
            else if (e.CourseName != t.CourseName || e.Periods != t.Periods || e.StandardHours != t.StandardHours) updated++;
        }
        var removed = existing.Count(e => !fileKeys.Contains(TeachingLoadRow.KeyOf(e)));
        return (rows.Count, added, updated, removed, years);
    }

    private static string PublicationKey(Publication p) =>
        !string.IsNullOrEmpty(p.Doi) ? "doi:" + p.Doi.ToLowerInvariant() : !string.IsNullOrEmpty(p.Eid) ? "eid:" + p.Eid.ToLowerInvariant() : $"title:{p.Title.ToLowerInvariant()}|{p.Year}";

    // ------------------------------------------------------------------ apply

    public async Task<ImportReportDto> ApplyAsync(Guid id, CancellationToken ct)
    {
        var import = await db.Set<DatasetImport>().FirstOrDefaultAsync(i => i.Id == id, ct)
            ?? throw new DatasetImportException("Không tìm thấy lần nhập dữ liệu.", 404);
        if (import.Status != ImportStatuses.Validated)
            throw new DatasetImportException(import.Status == ImportStatuses.Applied ? "Lần nhập này đã được áp dụng." : "Lần nhập này không hợp lệ nên không thể áp dụng.", 409);

        await using var content = await files.OpenReadAsync(import.FileId, ct) ?? throw new DatasetImportException("Không tìm thấy tệp đã tải lên.", 409);
        var parsed = Parse(import.Dataset, content.Stream);
        var report = await BuildReportAsync(import.Dataset, parsed, ct);
        if (report.BadValues.Count > 0 || report.TotalRows == 0) throw new DatasetImportException("Dữ liệu không còn hợp lệ. Hãy tải lên lại.", 409);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        switch (import.Dataset)
        {
            case DatasetNames.Teaching: await ApplyTeachingAsync(parsed, id, ct); break;
            case DatasetNames.Research: await ApplyResearchAsync(parsed, id, ct); break;
            default: await ApplyPublicationsAsync(parsed, id, ct); break;
        }
        import.Status = ImportStatuses.Applied;
        import.UpdatedAt = time.GetUtcNow();
        report = report with { Id = id, Status = ImportStatuses.Applied, FileName = (await files.GetAsync(import.FileId, ct))?.FileName ?? "" };
        import.Report = JsonSerializer.Serialize(report, Json);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        await audit.LogAsync("dataset.import_apply", "dataset_import", id.ToString(),
            new { dataset = import.Dataset, report.TotalRows, report.NewRows, report.UpdatedRows, report.RemovedRows }, ct);
        return report;
    }

    private Task ApplyTeachingAsync(Parsed parsed, Guid importId, CancellationToken ct) => ApplyTeachingRowsAsync(parsed.Teaching, importId, ct);

    /// <summary>
    /// Replaces the teaching rows of every (academic year, program) present in <paramref name="rows"/> (other programs and
    /// years are untouched), skipping unknown MSCBs. Callers wrap it in a transaction.
    /// </summary>
    public async Task ApplyTeachingRowsAsync(IReadOnlyList<TeachingLoadRow> rows, Guid? importId, CancellationToken ct)
    {
        var known = await KnownCodesAsync(rows.Select(t => t.EmployeeCode), ct);
        foreach (var (year, program) in rows.Select(t => (t.AcademicYear, t.Program)).Distinct())
            await db.Set<TeachingLoad>().Where(t => t.AcademicYear == year && t.Program == program).ExecuteDeleteAsync(ct);
        db.Set<TeachingLoad>().AddRange(rows.Where(t => known.Contains(t.EmployeeCode)).Select(t => new TeachingLoad
        {
            EmployeeCode = t.EmployeeCode, AcademicYear = t.AcademicYear, Program = t.Program, Term = t.Term, Module = t.Module,
            CourseCode = t.CourseCode, CourseName = t.CourseName, ClassCode = t.ClassCode, Track = t.Track, Activity = t.Activity,
            Periods = t.Periods, StandardHours = t.StandardHours, SourceImportId = importId,
        }));
        await db.SaveChangesAsync(ct);
    }

    private async Task ApplyResearchAsync(Parsed parsed, Guid importId, CancellationToken ct)
    {
        var known = await KnownCodesAsync(parsed.Research.Where(r => r.Mscb != null).Select(r => r.Mscb!), ct);
        await db.Set<ResearchProject>().ExecuteDeleteAsync(ct); // members cascade
        foreach (var g in parsed.Research.GroupBy(r => r.Code))
        {
            var f = g.First();
            var project = new ResearchProject
            {
                Code = f.Code, Title = f.Title, Level = f.Level, ResearchType = f.Type, Funding = f.Funding,
                PeriodText = f.Period, AcceptedOn = f.Accepted, Result = f.Result, SourceImportId = importId,
            };
            db.Set<ResearchProject>().Add(project);
            await db.SaveChangesAsync(ct);
            foreach (var m in g.Where(r => r.Mscb != null && known.Contains(r.Mscb)).DistinctBy(r => r.Mscb))
                db.Set<ResearchProjectMember>().Add(new ResearchProjectMember { ProjectId = project.Id, EmployeeCode = m.Mscb!, Role = m.Role });
        }
        await db.SaveChangesAsync(ct);
    }

    private async Task ApplyPublicationsAsync(Parsed parsed, Guid importId, CancellationToken ct)
    {
        var known = await KnownCodesAsync(parsed.Publications.SelectMany(p => p.Authors), ct);
        await db.Set<Publication>().ExecuteDeleteAsync(ct); // authors cascade
        foreach (var p in parsed.Publications)
        {
            var pub = new Publication { Doi = p.Doi, Eid = p.Eid, Title = p.Title, Venue = p.Venue, Year = p.Year, Details = p.Details, Url = p.Url, SourceImportId = importId };
            db.Set<Publication>().Add(pub);
            await db.SaveChangesAsync(ct);
            var ordinal = 0;
            foreach (var code in p.Authors)
            {
                ordinal++;
                if (known.Contains(code)) db.Set<PublicationAuthor>().Add(new PublicationAuthor { PublicationId = pub.Id, EmployeeCode = code, Ordinal = ordinal });
            }
        }
        await db.SaveChangesAsync(ct);
    }
}

/// <summary>
/// One teaching-load line, the single row model behind the admin xlsx import and the (future) legacy JSON endpoint
/// <c>POST /api/integration/v1/legacy/datasets/teaching</c>. JSON shape: <c>{employeeCode, academicYear, program, term, module,
/// courseCode, courseName, classCode, track, activity, periods, standardHours}</c>.
/// </summary>
public record TeachingLoadRow(
    string EmployeeCode, string AcademicYear, string Program, int? Term, string? Module, string? CourseCode, string CourseName,
    string? ClassCode, string? Track, string? Activity, int Periods, decimal StandardHours)
{
    /// <summary>1-based spreadsheet row (or JSON array index + 1) for report messages; not part of the identity.</summary>
    public int SourceRow { get; init; }

    /// <summary>Identity (and replace) key: reimporting the same rows is idempotent and other programs are never matched.</summary>
    public string Key => KeyOf(EmployeeCode, AcademicYear, Program, Term, Module, CourseCode, ClassCode, Track, Activity);

    public static string KeyOf(TeachingLoad t) => KeyOf(t.EmployeeCode, t.AcademicYear, t.Program, t.Term, t.Module, t.CourseCode, t.ClassCode, t.Track, t.Activity);

    private static string KeyOf(string mscb, string year, string program, int? term, string? module, string? course, string? cls, string? track, string? activity) =>
        string.Join('|', mscb, year, program, term?.ToString(CultureInfo.InvariantCulture) ?? "", module ?? "", course ?? "", cls ?? "", track ?? "", activity ?? "");
}

/// <summary>Validation and normalisation of one <see cref="TeachingLoadRow"/>; shared by the xlsx and JSON feeds.</summary>
public static class TeachingLoadRules
{
    public const string TermMessage = "Học kỳ phải là 1, 2 hoặc 3.";

    /// <summary>Maps "Đại học", "cao hoc", "TIẾN SĨ", "dai_hoc", ... to the stored program code, or null.</summary>
    public static string? ParseProgram(string? text)
    {
        if (text is null) return null;
        var sb = new StringBuilder();
        foreach (var c in text.Normalize(NormalizationForm.FormD))
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) == UnicodeCategory.NonSpacingMark) continue;
            if (c is 'đ' or 'Đ') { sb.Append('d'); continue; }
            if (char.IsLetterOrDigit(c)) sb.Append(char.ToLowerInvariant(c));
        }
        return sb.ToString() switch
        {
            "daihoc" => TeachingPrograms.DaiHoc,
            "caohoc" => TeachingPrograms.CaoHoc,
            "tiensi" => TeachingPrograms.TienSi,
            _ => null,
        };
    }

    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    /// <summary>
    /// Validates <paramref name="raw"/> (its <c>Program</c> may be free text) and returns the normalised row; problems are appended
    /// to <paramref name="bad"/> as Vietnamese messages naming the xlsx column.
    /// </summary>
    public static bool TryNormalize(TeachingLoadRow raw, int sourceRow, ICollection<ImportIssueDto> bad, out TeachingLoadRow normalized)
    {
        var errors = 0;
        void Fail(string column, string message) { bad.Add(new(sourceRow, column, message)); errors++; }

        var mscb = Clean(raw.EmployeeCode);
        if (mscb is null) Fail("MSCB", "Thiếu MSCB.");
        var year = Clean(raw.AcademicYear);
        if (year is null || !System.Text.RegularExpressions.Regex.IsMatch(year, @"^\d{4}-\d{4}$") || int.Parse(year[5..]) != int.Parse(year[..4]) + 1)
            Fail("Năm học", "Năm học phải có dạng 2024-2025.");
        var program = ParseProgram(raw.Program);
        if (program is null) Fail("Bậc đào tạo", "Bậc đào tạo phải là Đại học, Cao học hoặc Tiến sĩ.");
        var module = Clean(raw.Module);
        if (program == TeachingPrograms.DaiHoc)
        {
            if (raw.Term is null or < 1 or > 3) Fail("Học kỳ", "Học kỳ phải là 1, 2 hoặc 3 đối với bậc Đại học.");
            if (module is not null) Fail("Học phần/chuyên đề", "Học phần/chuyên đề chỉ dùng cho bậc Cao học và Tiến sĩ; hãy để trống với bậc Đại học.");
        }
        else if (program is not null && raw.Term is not null) Fail("Học kỳ", "Học kỳ phải để trống đối với bậc Cao học và Tiến sĩ.");
        var name = Clean(raw.CourseName);
        if (name is null) Fail("Tên môn", "Thiếu tên môn.");
        if (raw.Periods < 0) Fail("Số tiết", "Số tiết phải là số nguyên không âm.");
        if (raw.StandardHours is < 0 or > 99999) Fail("Giờ chuẩn", "Giờ chuẩn phải là số không âm.");

        normalized = errors > 0 ? raw : new TeachingLoadRow(mscb!, year!, program!, program == TeachingPrograms.DaiHoc ? raw.Term : null,
            program == TeachingPrograms.DaiHoc ? null : module, Clean(raw.CourseCode), name!, Clean(raw.ClassCode), Clean(raw.Track),
            Clean(raw.Activity)?.ToUpperInvariant(), raw.Periods, raw.StandardHours) { SourceRow = sourceRow };
        return errors == 0;
    }
}
