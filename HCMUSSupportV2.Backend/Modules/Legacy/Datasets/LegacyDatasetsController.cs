using HCMUSSupportV2.Backend.Infrastructure;
using HCMUSSupportV2.Backend.Modules.Hrm.Datasets;
using HCMUSSupportV2.Backend.Modules.Hrm.Integration;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace HCMUSSupportV2.Backend.Modules.Legacy.Datasets;

/// <summary>
/// D15: v1 teaching, research and publication datasets as JSON rows (scope <c>legacy.import</c>). The same validation, report and
/// replace semantics as the D04 xlsx import (teaching replaced per academic year, the others whole). <c>?dryRun=true</c> validates
/// and reports without storing or writing anything. Re-posting the same rows reports no new, updated or removed rows.
/// </summary>
[ApiController]
[Route(LegacyModule.RoutePrefix + "/datasets")]
[Authorize(Policy = LegacyModule.LegacyImportPolicy)]
[EnableRateLimiting(InfrastructureExtensions.IntegrationRateLimitPolicy)]
[IngestBody]
[RequestSizeLimit(IngestBodyAttribute.MaxBytes)]
public class LegacyDatasetsController(LegacyDatasetImportService imports) : ControllerBase
{
    [HttpPost("teaching")]
    [ProducesResponseType<ImportReportDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public Task<IActionResult> Teaching([FromBody] LegacyTeachingRequest body, [FromQuery] bool dryRun, CancellationToken ct) =>
        Run(() => imports.ImportTeachingAsync(body, dryRun, ct));

    [HttpPost("research")]
    [ProducesResponseType<ImportReportDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public Task<IActionResult> Research([FromBody] LegacyResearchRequest body, [FromQuery] bool dryRun, CancellationToken ct) =>
        Run(() => imports.ImportResearchAsync(body, dryRun, ct));

    [HttpPost("publications")]
    [ProducesResponseType<ImportReportDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public Task<IActionResult> Publications([FromBody] LegacyPublicationRequest body, [FromQuery] bool dryRun, CancellationToken ct) =>
        Run(() => imports.ImportPublicationsAsync(body, dryRun, ct));

    private async Task<IActionResult> Run(Func<Task<ImportReportDto>> import)
    {
        try { return Ok(await import()); }
        catch (DatasetImportException ex) { return Problem(title: "Invalid import", detail: ex.Message, statusCode: ex.Status); }
    }
}
