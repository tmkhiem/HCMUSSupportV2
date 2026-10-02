using System.Globalization;
using System.Text.Json;
using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Hrm.Datasets;
using HCMUSSupportV2.Backend.Modules.Hrm.Domain;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using HCMUSSupportV2.Backend.Modules.Platform.Files;
using UUIDNext;

namespace HCMUSSupportV2.Backend.Modules.Legacy.Datasets;

/// <summary>
/// D15: imports the v1 teaching, research and publication datasets from JSON rows (docs/LEGACY-MIGRATION.md). The rows are turned
/// into the same parsed rows the D04 xlsx importer uses, so validation, the report (new, updated, removed, unknown MSCBs) and the
/// replace semantics (teaching per academic year, research and publications whole) are shared with <see cref="DatasetImportService"/>.
/// The payload is stored through <see cref="IFileStore"/> as <c>legacy-&lt;dataset&gt;.json</c>. A dry run validates and reports only.
/// </summary>
public class LegacyDatasetImportService(
    AppDbContext db, DatasetImportService imports, IFileStore files, IAuditLogger audit, TimeProvider time)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    // Row key used by the shared validation -> the JSON field it came from (reported as the "column" of a bad value).
    private static readonly Dictionary<string, string> TeachingFields = new()
    {
        ["mscb"] = "employeeCode", ["year"] = "academicYear", ["term"] = "term", ["course_code"] = "courseCode", ["course_name"] = "courseName",
        ["class_code"] = "classCode", ["level"] = "level", ["periods"] = "periods", ["hours"] = "standardHours",
    };

    private static readonly Dictionary<string, string> ResearchFields = new()
    {
        ["code"] = "code", ["title"] = "title", ["level"] = "level", ["type"] = "researchType", ["funding"] = "funding", ["period"] = "periodText",
        ["accepted"] = "acceptedOn", ["result"] = "result", ["mscb"] = "employeeCode", ["role"] = "role",
    };

    private static readonly Dictionary<string, string> PublicationFields = new()
    {
        ["doi"] = "doi", ["eid"] = "eid", ["title"] = "title", ["venue"] = "venue", ["year"] = "year", ["details"] = "details",
        ["url"] = "url", ["authors"] = "authors",
    };

    public Task<ImportReportDto> ImportTeachingAsync(LegacyTeachingRequest request, bool dryRun, CancellationToken ct)
    {
        var parsed = new DatasetImportService.Parsed();
        var rows = RequireRows(request.Rows, parsed);
        for (var i = 0; i < rows.Count; i++)
        {
            if (rows[i] is not { } r) { parsed.Bad.Add(new(i + 1, "rows", "Dòng trống.")); continue; }
            var text = new Dictionary<string, string?>
            {
                ["mscb"] = Clean(r.EmployeeCode), ["year"] = Clean(r.AcademicYear), ["term"] = r.Term?.ToString(CultureInfo.InvariantCulture),
                ["course_code"] = Clean(r.CourseCode), ["course_name"] = Clean(r.CourseName), ["class_code"] = Clean(r.ClassCode),
                ["level"] = Clean(r.Level), ["periods"] = r.Periods?.ToString(CultureInfo.InvariantCulture),
                // numeric(7,2) in the database: round here, otherwise a re-run would see a difference in the third decimal.
                ["hours"] = r.StandardHours is { } h ? Number(Math.Round(h, 2, MidpointRounding.AwayFromZero)) : null,
            };
            DatasetImportService.ParseTeaching(i + 1, k => text[k], Bad(parsed, TeachingFields), parsed);
        }
        return RunAsync(DatasetNames.Teaching, parsed, request, dryRun, ct);
    }

    public Task<ImportReportDto> ImportResearchAsync(LegacyResearchRequest request, bool dryRun, CancellationToken ct)
    {
        var parsed = new DatasetImportService.Parsed();
        var rows = RequireRows(request.Rows, parsed);
        for (var i = 0; i < rows.Count; i++)
        {
            if (rows[i] is not { } r) { parsed.Bad.Add(new(i + 1, "rows", "Dòng trống.")); continue; }
            var text = new Dictionary<string, string?>
            {
                ["code"] = Clean(r.Code), ["title"] = Clean(r.Title), ["level"] = Clean(r.Level), ["type"] = Clean(r.ResearchType),
                ["funding"] = r.Funding is { } f ? Number(f) : null, ["period"] = Clean(r.PeriodText), ["accepted"] = Clean(r.AcceptedOn),
                ["result"] = Clean(r.Result), ["mscb"] = Clean(r.EmployeeCode), ["role"] = Clean(r.Role),
            };
            DatasetImportService.ParseResearch(i + 1, k => text[k], Bad(parsed, ResearchFields), parsed);
        }
        return RunAsync(DatasetNames.Research, parsed, request, dryRun, ct);
    }

    public Task<ImportReportDto> ImportPublicationsAsync(LegacyPublicationRequest request, bool dryRun, CancellationToken ct)
    {
        var parsed = new DatasetImportService.Parsed();
        var rows = RequireRows(request.Rows, parsed);
        for (var i = 0; i < rows.Count; i++)
        {
            if (rows[i] is not { } r) { parsed.Bad.Add(new(i + 1, "rows", "Dòng trống.")); continue; }
            var text = new Dictionary<string, string?>
            {
                ["doi"] = Clean(r.Doi), ["eid"] = Clean(r.Eid), ["title"] = Clean(r.Title), ["venue"] = Clean(r.Venue),
                ["year"] = r.Year?.ToString(CultureInfo.InvariantCulture), ["details"] = Clean(r.Details), ["url"] = Clean(r.Url),
                ["authors"] = Clean(string.Join(';', (r.Authors ?? []).Select(a => a?.Trim()).Where(a => !string.IsNullOrEmpty(a)))),
            };
            DatasetImportService.ParsePublication(i + 1, k => text[k], Bad(parsed, PublicationFields), parsed);
        }
        return RunAsync(DatasetNames.Publications, parsed, request, dryRun, ct);
    }

    // ------------------------------------------------------------------ shared

    private static IReadOnlyList<T?> RequireRows<T>(IReadOnlyList<T?>? rows, DatasetImportService.Parsed parsed) where T : class
    {
        if (rows is null) throw new DatasetImportException("Thiếu danh sách rows.");
        if (rows.Count == 0) parsed.Bad.Add(new(1, "rows", "Danh sách rows trống."));
        return rows;
    }

    private static Action<int, string, string> Bad(DatasetImportService.Parsed parsed, Dictionary<string, string> fields) =>
        (row, key, message) => parsed.Bad.Add(new(row, fields.GetValueOrDefault(key, key), message));

    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    private static string Number(decimal d) => d.ToString("0.##########", CultureInfo.InvariantCulture);

    private async Task<ImportReportDto> RunAsync(string dataset, DatasetImportService.Parsed parsed, object payload, bool dryRun, CancellationToken ct)
    {
        var fileName = $"legacy-{dataset}.json";
        var report = await imports.BuildReportAsync(dataset, parsed, ct);
        var status = report.BadValues.Count == 0 && report.TotalRows > 0 ? ImportStatuses.Validated : ImportStatuses.Rejected;
        if (dryRun) return report with { Status = status, FileName = fileName };

        var id = Uuid.NewDatabaseFriendly(Database.PostgreSql);
        await using var tx = await db.Database.BeginTransactionAsync(ct);

        StoredFile stored;
        try
        {
            await using var content = new MemoryStream(JsonSerializer.SerializeToUtf8Bytes(payload, Json));
            stored = await files.SaveAsync(content, fileName, "application/json", null, ct);
        }
        catch (FileRejectedException ex) { throw new DatasetImportException(ex.Message); }

        report = report with { Id = id, Status = status, FileName = stored.FileName };
        var (summary, reportJson) = DatasetImportService.SerializeReport(report);
        var import = new DatasetImport { Id = id, Dataset = dataset, FileId = stored.Id, Status = status, CreatedBy = null, Summary = summary, Report = reportJson };
        db.Set<DatasetImport>().Add(import);
        await db.SaveChangesAsync(ct); // the rows below reference the import

        if (status == ImportStatuses.Validated)
        {
            await imports.ApplyRowsAsync(dataset, parsed, id, ct);
            report = report with { Status = ImportStatuses.Applied };
            import.Status = ImportStatuses.Applied;
            import.UpdatedAt = time.GetUtcNow();
            import.Report = DatasetImportService.SerializeReport(report).Report;
            await db.SaveChangesAsync(ct);
        }
        await tx.CommitAsync(ct);

        // Counts only: the report (MSCBs) goes back to the caller, never into the audit log.
        await audit.LogAsync($"legacy.datasets.{dataset}", "dataset_import", id.ToString(),
            new { status = report.Status, report.TotalRows, report.NewRows, report.UpdatedRows, report.RemovedRows, unknownMscbs = report.UnknownMscbs.Count, badValues = report.BadValues.Count }, ct);
        return report;
    }
}
