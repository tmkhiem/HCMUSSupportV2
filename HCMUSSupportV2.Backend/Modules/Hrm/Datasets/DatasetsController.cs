using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace HCMUSSupportV2.Backend.Modules.Hrm.Datasets;

/// <summary>
/// Admin Excel datasets: <c>teaching</c> (replaced per academic year), <c>research</c> and <c>publications</c> (replaced
/// whole). Upload and validate first (the report shows new, updated and removed rows, unknown MSCBs and bad values;
/// nothing is written), then apply the validated import.
/// </summary>
[ApiController]
[Route("api/admin/datasets")]
[Authorize(Policy = Policies.ManageDatasets)]
public class DatasetsController(DatasetImportService imports) : ControllerBase
{
    private const string DatasetRoute = "{dataset:regex(^(teaching|research|publications)$)}";

    public class ImportForm
    {
        /// <summary>The .xlsx workbook (use the template).</summary>
        public IFormFile File { get; set; } = null!;
    }

    /// <summary>Uploads an .xlsx workbook, stores it and returns the validation report (status <c>validated</c> or <c>rejected</c>).</summary>
    [HttpPost(DatasetRoute + "/import")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(30L * 1024 * 1024)]
    [ProducesResponseType<ImportReportDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Import(string dataset, [FromForm] ImportForm form, CancellationToken ct)
    {
        if (form.File is null) return Problem(title: "Missing file", detail: "Chưa chọn tệp.", statusCode: StatusCodes.Status400BadRequest);
        try { return Ok(await imports.ValidateAsync(dataset, form.File, ct)); }
        catch (DatasetImportException ex) { return Problem(title: "Invalid import", detail: ex.Message, statusCode: ex.Status); }
    }

    /// <summary>The stored report of an import.</summary>
    [HttpGet("imports/{id:guid}")]
    [ProducesResponseType<ImportReportDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetImport(Guid id, CancellationToken ct) =>
        await imports.GetReportAsync(id, ct) is { } report ? Ok(report) : NotFound();

    /// <summary>Replaces the dataset with the validated import (one transaction). 409 when the import is not in status <c>validated</c>.</summary>
    [HttpPost("imports/{id:guid}/apply")]
    [ProducesResponseType<ImportReportDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Apply(Guid id, CancellationToken ct)
    {
        try { return Ok(await imports.ApplyAsync(id, ct)); }
        catch (DatasetImportException ex) { return Problem(title: "Cannot apply import", detail: ex.Message, statusCode: ex.Status); }
    }

    /// <summary>The empty .xlsx template with Vietnamese headers.</summary>
    [HttpGet(DatasetRoute + "/template")]
    [Produces("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")]
    [ProducesResponseType<FileContentResult>(StatusCodes.Status200OK)]
    public IActionResult Template(string dataset) =>
        File(imports.BuildTemplate(dataset), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", $"mau-{dataset}.xlsx");
}
