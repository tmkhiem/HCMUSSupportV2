using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using ClosedXML.Excel;
using CsvHelper;
using CsvHelper.Configuration;
using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Modules.Notifications.Domain;
using HCMUSSupportV2.Backend.Modules.Notifications.Editor;
using HCMUSSupportV2.Backend.Modules.Notifications.Markdown;
using HCMUSSupportV2.Backend.Modules.Notifications.Publishing;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using HCMUSSupportV2.Backend.Modules.Platform.Files;
using HCMUSSupportV2.Backend.Modules.Platform.Jobs;
using Microsoft.EntityFrameworkCore;
using UUIDNext;

namespace HCMUSSupportV2.Backend.Modules.Notifications.Import;

public record ImportColumn(string Key, string Label, string Header);

public record ImportReport(
    string? FileName,
    string? MscbColumn,
    int Rows,
    int DistinctEmployees,
    int EmployeesWithMultipleRows,
    List<ImportColumn> Columns,
    List<string> UnknownCodes,
    int UnknownCodeCount,
    List<string> InactiveCodes,
    int InactiveCodeCount,
    List<string> DuplicateRowCodes,
    int DuplicateRows,
    int RowsWithoutCode,
    List<string> MissingInFile,
    List<string> UnusedColumns,
    List<string> Errors,
    bool CanApply);

public record RecipientImportDto(Guid ImportId, string Status, ImportReport Report);

/// <summary>Reads a recipient sheet (xlsx/csv): an MSCB column plus one variable per other column (PLAN 3.3, D07).</summary>
public partial class RecipientImportService(
    AppDbContext db,
    ICurrentUser user,
    IAuditLogger audit,
    IFileStore files,
    IJobQueue jobs,
    NotificationEditorService editor)
{
    public const long MaxFileBytes = 10L * 1024 * 1024;
    public const int MaxRows = 50_000;
    public const int MaxColumns = 60;
    private const int ListCap = 200;

    private static readonly HashSet<string> MscbHeaders = ["mscb", "maso", "manhansu"];

    public async Task<RecipientImportDto> ImportAsync(Guid notificationId, string fileName, Stream content, CancellationToken ct)
    {
        var n = await db.Set<Notification>().AsNoTracking().FirstOrDefaultAsync(x => x.Id == notificationId, ct)
            ?? throw ApiException.NotFound("Không tìm thấy thông báo.");
        if (n.Status == NotificationStatuses.Archived) throw ApiException.Conflict("Thông báo đã lưu trữ.");

        var ext = Path.GetExtension(fileName ?? "").ToLowerInvariant();
        if (ext is not (".xlsx" or ".csv")) throw ApiException.Invalid("file", "Chỉ nhận tệp .xlsx hoặc .csv.");

        // Keep the original for the audit trail (and re-download), and parse from the buffered copy.
        var buffer = new MemoryStream();
        await content.CopyToAsync(buffer, ct);
        if (buffer.Length == 0) throw ApiException.Invalid("file", "Tệp rỗng.");
        if (buffer.Length > MaxFileBytes) throw ApiException.Invalid("file", "Tệp vượt quá 10 MB.");
        buffer.Position = 0;

        Sheet sheet;
        try { sheet = ext == ".xlsx" ? ReadXlsx(buffer) : ReadCsv(buffer); }
        catch (ApiException) { throw; }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            throw ApiException.Invalid("file", "Không đọc được tệp. Hãy kiểm tra định dạng.");
        }

        var variables = NotificationEditorService.ParseVariables(n.Variables);
        var analysis = NotificationMarkdown.Analyze(n.BodyMd, null);
        var (report, rows) = await BuildReportAsync(fileName!, sheet, variables, analysis.Placeholders, ct);

        Guid? fileId = null;
        try
        {
            buffer.Position = 0;
            var stored = await files.SaveAsync(buffer, fileName!, ext == ".csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", user.Code, ct);
            fileId = stored.Id;
        }
        catch (FileRejectedException) { /* the report is still useful without the stored original */ }

        var import = new NotificationRecipientImport
        {
            Id = Uuid.NewDatabaseFriendly(Database.PostgreSql),
            NotificationId = notificationId,
            FileId = fileId,
            Status = report.CanApply ? ImportStatuses.Validated : ImportStatuses.Rejected,
            Columns = JsonSerializer.Serialize(report.Columns, NotificationJson.Options),
            Rows = rows.ToJsonString(),
            Report = JsonSerializer.Serialize(report, NotificationJson.Options),
            CreatedBy = user.Code,
        };
        db.Set<NotificationRecipientImport>().Add(import);
        await db.SaveChangesAsync(ct);
        return new RecipientImportDto(import.Id, import.Status, report);
    }

    public async Task<RecipientImportDto> GetAsync(Guid notificationId, Guid importId, CancellationToken ct)
    {
        var i = await db.Set<NotificationRecipientImport>().AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == importId && x.NotificationId == notificationId, ct)
            ?? throw ApiException.NotFound("Không tìm thấy bản nhập danh sách.");
        return new RecipientImportDto(i.Id, i.Status, JsonSerializer.Deserialize<ImportReport>(i.Report, NotificationJson.Options)!);
    }

    public async Task<ManageNotificationDto> ApplyAsync(Guid notificationId, Guid importId, CancellationToken ct)
    {
        var import = await db.Set<NotificationRecipientImport>().FirstOrDefaultAsync(x => x.Id == importId && x.NotificationId == notificationId, ct)
            ?? throw ApiException.NotFound("Không tìm thấy bản nhập danh sách.");
        if (import.Status != ImportStatuses.Validated)
            throw ApiException.Conflict(import.Status == ImportStatuses.Applied ? "Bản nhập này đã được áp dụng." : "Bản nhập này không hợp lệ nên không áp dụng được.");
        var n = await db.Set<Notification>().FirstAsync(x => x.Id == notificationId, ct);
        if (n.Status == NotificationStatuses.Archived) throw ApiException.Conflict("Thông báo đã lưu trữ.");

        var columns = JsonSerializer.Deserialize<List<ImportColumn>>(import.Columns, NotificationJson.Options) ?? [];
        var declared = NotificationEditorService.ParseVariables(n.Variables).ToList();
        var added = 0;
        foreach (var c in columns.Where(c => declared.All(v => v.Key != c.Key)))
        {
            declared.Add(new VariableDto(c.Key, c.Label, "text"));
            added++;
        }

        var now = DateTimeOffset.UtcNow;
        if (added > 0)
        {
            n.Variables = JsonSerializer.Serialize(declared, NotificationJson.Options);
            n.Version++;
            n.UpdatedAt = now;
            n.UpdatedBy = user.Code;
            if (n.Status == NotificationStatuses.Published)
            {
                n.ContentUpdatedAt = now;
                db.Set<NotificationRevision>().Add(new NotificationRevision
                {
                    NotificationId = n.Id, Version = n.Version, Title = n.Title, Summary = n.Summary,
                    Content = n.BodyMd, Variables = n.Variables, EditedBy = user.Code, EditedAt = now,
                });
            }
        }

        // One import audience per notification: a newly applied sheet replaces the previous one.
        var previous = await db.Set<NotificationAudience>().Where(a => a.NotificationId == n.Id && a.Kind == AudienceKinds.Import).ToListAsync(ct);
        var previousIds = previous.Select(a => a.ImportId).ToList();
        foreach (var old in await db.Set<NotificationRecipientImport>().Where(i => previousIds.Contains(i.Id)).ToListAsync(ct))
            old.Status = ImportStatuses.Rejected; // superseded
        db.Set<NotificationAudience>().RemoveRange(previous);
        db.Set<NotificationAudience>().Add(new NotificationAudience { NotificationId = n.Id, Kind = AudienceKinds.Import, ImportId = import.Id });
        import.Status = ImportStatuses.Applied;
        import.AppliedAt = now;

        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { throw ApiException.Conflict("Thông báo vừa được thay đổi. Hãy thử lại."); }

        if (n.Status == NotificationStatuses.Published)
            await jobs.EnqueueAsync(NotificationJobTypes.Publish, new PublishPayload(n.Id), cancellationToken: ct);
        await audit.LogAsync("notification.recipients_applied", "notification", n.Id.ToString(),
            new { importId = import.Id, addedVariables = added }, ct);
        db.ChangeTracker.Clear();
        return await editor.GetAsync(n.Id, ct);
    }

    /// <summary>An .xlsx with the MSCB column and one column per declared variable (the header is the variable key).</summary>
    public async Task<byte[]> TemplateAsync(Guid notificationId, CancellationToken ct)
    {
        var vars = await db.Set<Notification>().AsNoTracking().Where(n => n.Id == notificationId).Select(n => n.Variables).FirstOrDefaultAsync(ct)
            ?? throw ApiException.NotFound("Không tìm thấy thông báo.");
        using var wb = new XLWorkbook();
        var ws = wb.AddWorksheet("Danh sách");
        ws.Cell(1, 1).Value = "MSCB";
        var col = 2;
        foreach (var v in NotificationEditorService.ParseVariables(vars))
        {
            var cell = ws.Cell(1, col++);
            cell.Value = v.Key;
            if (!string.IsNullOrWhiteSpace(v.Label) && v.Label != v.Key) cell.CreateComment().AddText(v.Label);
        }
        ws.Row(1).Style.Font.Bold = true;
        ws.Columns().AdjustToContents();
        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    // ---------------------------------------------------------------- parsing

    private sealed record Sheet(string?[] Headers, List<string?[]> Rows);

    private static Sheet ReadXlsx(Stream stream)
    {
        using var wb = new XLWorkbook(stream);
        var ws = wb.Worksheets.FirstOrDefault(w => w.RangeUsed() is not null) ?? throw ApiException.Invalid("file", "Bảng tính không có dữ liệu.");
        var used = ws.RangeUsed()!;
        var first = used.FirstRow().RowNumber();
        var firstCol = used.FirstColumn().ColumnNumber();
        var width = used.ColumnCount();
        if (width > MaxColumns) throw ApiException.Invalid("file", $"Tối đa {MaxColumns} cột.");
        if (used.RowCount() - 1 > MaxRows) throw ApiException.Invalid("file", $"Tối đa {MaxRows} dòng dữ liệu.");

        string?[] Read(int row) => Enumerable.Range(0, width).Select(i => CellText(ws.Cell(row, firstCol + i))).ToArray();
        var headers = Read(first);
        var rows = new List<string?[]>();
        for (var r = first + 1; r <= used.LastRow().RowNumber(); r++) rows.Add(Read(r));
        return new Sheet(headers, rows);
    }

    private static string? CellText(IXLCell cell)
    {
        if (cell.IsEmpty()) return null;
        string text;
        if (cell.DataType == XLDataType.DateTime && cell.TryGetValue<DateTime>(out var dt))
            text = dt.TimeOfDay == TimeSpan.Zero ? dt.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture) : dt.ToString("dd/MM/yyyy HH:mm", CultureInfo.InvariantCulture);
        else text = cell.GetFormattedString();
        text = text.Trim();
        return text.Length == 0 ? null : text;
    }

    private static Sheet ReadCsv(Stream stream)
    {
        using var reader = new StreamReader(stream, new UTF8Encoding(false), detectEncodingFromByteOrderMarks: true, leaveOpen: true);
        var config = new CsvConfiguration(CultureInfo.InvariantCulture)
        {
            DetectDelimiter = true,
            HasHeaderRecord = false,
            BadDataFound = null,
            MissingFieldFound = null,
            TrimOptions = TrimOptions.Trim,
        };
        using var csv = new CsvReader(reader, config);
        string?[]? headers = null;
        var rows = new List<string?[]>();
        while (csv.Read())
        {
            var record = csv.Parser.Record ?? [];
            var cells = record.Select(c => string.IsNullOrWhiteSpace(c) ? null : c.Trim()).ToArray();
            if (headers is null) { headers = cells; if (headers.Length > MaxColumns) throw ApiException.Invalid("file", $"Tối đa {MaxColumns} cột."); continue; }
            if (rows.Count >= MaxRows) throw ApiException.Invalid("file", $"Tối đa {MaxRows} dòng dữ liệu.");
            rows.Add(cells);
        }
        if (headers is null) throw ApiException.Invalid("file", "Tệp không có dữ liệu.");
        return new Sheet(headers, rows);
    }

    // ---------------------------------------------------------------- report

    private async Task<(ImportReport Report, JsonObject Rows)> BuildReportAsync(
        string fileName, Sheet sheet, IReadOnlyList<VariableDto> declared, IReadOnlyList<string> usedInBody, CancellationToken ct)
    {
        var errors = new List<string>();
        var mscbIndex = Array.FindIndex(sheet.Headers, h => h is not null && MscbHeaders.Contains(Simplify(h)));
        if (mscbIndex < 0) errors.Add("Không tìm thấy cột mã số (MSCB, Mã số hoặc MaNhanSu).");

        // Every other non-blank header becomes a variable.
        var columns = new List<ImportColumn>();
        var columnIndex = new List<int>();
        var taken = new HashSet<string>(StringComparer.Ordinal);
        for (var i = 0; i < sheet.Headers.Length; i++)
        {
            var header = sheet.Headers[i];
            if (i == mscbIndex || string.IsNullOrWhiteSpace(header)) continue;
            var key = KeyFor(header, declared, columns.Count + 1);
            for (var suffix = 2; !taken.Add(key); suffix++) key = TrimKey(KeyFor(header, declared, columns.Count + 1), 60) + "_" + suffix;
            columns.Add(new ImportColumn(key, header.Trim(), header.Trim()));
            columnIndex.Add(i);
        }

        var rows = new JsonObject();
        var rowsWithoutCode = 0;
        var dataRows = 0;
        var duplicateCodes = new List<string>();
        var duplicateRows = 0;
        if (mscbIndex >= 0)
        {
            foreach (var cells in sheet.Rows)
            {
                if (cells.All(c => c is null)) continue; // blank line
                var code = mscbIndex < cells.Length ? cells[mscbIndex]?.Trim() : null;
                if (string.IsNullOrEmpty(code)) { rowsWithoutCode++; continue; }
                var row = new JsonObject();
                for (var c = 0; c < columns.Count; c++)
                {
                    var idx = columnIndex[c];
                    row[columns[c].Key] = idx < cells.Length ? cells[idx] : null;
                }
                var list = rows[code] as JsonArray;
                if (list is null) rows[code] = list = [];
                if (list.Any(existing => existing!.ToJsonString() == row.ToJsonString()))
                {
                    duplicateRows++;
                    if (!duplicateCodes.Contains(code)) duplicateCodes.Add(code);
                }
                list.Add(row);
                dataRows++;
            }
        }

        var codes = rows.Select(kv => kv.Key).ToList();
        var known = await db.Set<Employee>().AsNoTracking().Where(e => codes.Contains(e.Code)).Select(e => new { e.Code, e.Status }).ToListAsync(ct);
        var knownSet = known.ToDictionary(k => k.Code, k => k.Status);
        var unknown = codes.Where(c => !knownSet.ContainsKey(c)).ToList();
        var inactive = known.Where(k => k.Status != EmployeeStatuses.Active).Select(k => k.Code).OrderBy(c => c, StringComparer.Ordinal).ToList();

        if (mscbIndex >= 0 && codes.Count == 0) errors.Add("Tệp không có dòng dữ liệu hợp lệ.");

        var keys = columns.Select(c => c.Key).ToHashSet(StringComparer.Ordinal);
        var missing = usedInBody.Where(k => !keys.Contains(k)).ToList();
        var unused = columns.Where(c => !usedInBody.Contains(c.Key)).Select(c => c.Label).ToList();

        var report = new ImportReport(
            fileName, mscbIndex >= 0 ? sheet.Headers[mscbIndex]?.Trim() : null, dataRows, codes.Count,
            rows.Count(kv => kv.Value is JsonArray a && a.Count > 1), columns,
            unknown.Take(ListCap).ToList(), unknown.Count, inactive.Take(ListCap).ToList(), inactive.Count,
            duplicateCodes.Take(ListCap).ToList(), duplicateRows, rowsWithoutCode, missing, unused, errors, errors.Count == 0);
        return (report, rows);
    }

    private static string KeyFor(string header, IReadOnlyList<VariableDto> declared, int position)
    {
        header = header.Trim();
        if (NotificationMarkdown.IsValidVarKey(header)) return header;
        // A column named like the label of a declared variable keeps that variable's key (re-imports, clones).
        var simple = Simplify(header);
        var match = declared.FirstOrDefault(v => Simplify(v.Label ?? "") == simple || Simplify(v.Key) == simple);
        if (match is not null) return match.Key;

        var words = NonAlnum().Split(RemoveDiacritics(header)).Where(w => w.Length > 0)
            .Select(w => char.ToUpperInvariant(w[0]) + w[1..]);
        var key = string.Concat(words);
        if (key.Length == 0) key = "Cot" + position;
        if (!char.IsAsciiLetter(key[0])) key = "C" + key;
        return TrimKey(key, 64);
    }

    private static string TrimKey(string key, int max) => key.Length <= max ? key : key[..max];

    /// <summary>Lower-case, no diacritics, letters and digits only: how headers are compared.</summary>
    private static string Simplify(string text) =>
        NonAlnum().Replace(RemoveDiacritics(text), "").ToLowerInvariant();

    private static string RemoveDiacritics(string text)
    {
        var sb = new StringBuilder(text.Length);
        foreach (var ch in text.Replace('đ', 'd').Replace('Đ', 'D').Normalize(NormalizationForm.FormD))
            if (CharUnicodeInfo.GetUnicodeCategory(ch) != UnicodeCategory.NonSpacingMark) sb.Append(ch);
        return sb.ToString().Normalize(NormalizationForm.FormC);
    }

    [GeneratedRegex("[^A-Za-z0-9]+")]
    private static partial Regex NonAlnum();
}
