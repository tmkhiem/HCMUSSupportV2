using System.IO.Compression;
using HCMUSSupportV2.Backend.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.RateLimiting;

namespace HCMUSSupportV2.Backend.Modules.Hrm.Integration;

/// <summary>
/// Accepts <c>Content-Encoding: gzip</c> bodies and caps both the compressed and the decompressed size at 20 MB.
/// Runs before model binding, so actions simply take the typed body.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class IngestBodyAttribute : Attribute, IAsyncResourceFilter
{
    public const long MaxBytes = 20L * 1024 * 1024;

    public async Task OnResourceExecutionAsync(ResourceExecutingContext context, ResourceExecutionDelegate next)
    {
        var request = context.HttpContext.Request;
        if (request.ContentLength > MaxBytes)
        {
            context.Result = TooLarge();
            return;
        }

        var encoding = request.Headers.ContentEncoding.ToString();
        if (encoding.Equals("gzip", StringComparison.OrdinalIgnoreCase))
        {
            var buffer = new MemoryStream();
            try
            {
                await using var gzip = new GZipStream(request.Body, CompressionMode.Decompress, leaveOpen: true);
                var chunk = new byte[81920];
                int read;
                while ((read = await gzip.ReadAsync(chunk, context.HttpContext.RequestAborted)) > 0)
                {
                    if (buffer.Length + read > MaxBytes) { context.Result = TooLarge(); return; }
                    buffer.Write(chunk, 0, read);
                }
            }
            catch (InvalidDataException)
            {
                context.Result = new ObjectResult(new ProblemDetails
                {
                    Status = StatusCodes.Status400BadRequest, Title = "Invalid gzip body", Detail = "The request body is not valid gzip data.",
                }) { StatusCode = StatusCodes.Status400BadRequest };
                return;
            }
            buffer.Position = 0;
            request.Body = buffer;
            request.ContentLength = buffer.Length;
            request.Headers.Remove("Content-Encoding");
        }
        else if (encoding.Length > 0 && !encoding.Equals("identity", StringComparison.OrdinalIgnoreCase))
        {
            context.Result = new ObjectResult(new ProblemDetails { Status = StatusCodes.Status415UnsupportedMediaType, Title = "Unsupported Content-Encoding" })
            { StatusCode = StatusCodes.Status415UnsupportedMediaType };
            return;
        }

        await next();
    }

    private static ObjectResult TooLarge() => new(new ProblemDetails
    {
        Status = StatusCodes.Status413PayloadTooLarge, Title = "Payload too large",
        Detail = "The batch exceeds 20 MB (after decompression). Split it or contact the owner.",
    })
    { StatusCode = StatusCodes.Status413PayloadTooLarge };
}

/// <summary>
/// HRM ingest (scope <c>hrm.ingest</c>, <c>Authorization: ApiKey &lt;token&gt;</c>). Every dataset is a full snapshot:
/// rows missing from the batch are removed (employees become inactive, org units are deactivated). A batch smaller than
/// 80% of the last successful run is refused with 409 unless <c>?force=true</c>.
/// </summary>
[ApiController]
[Route("api/integration/v1")]
[Authorize(Policy = HrmModule.IngestHrmPolicy, AuthenticationSchemes = ApiKeyDefaults.Scheme)]
[EnableRateLimiting(InfrastructureExtensions.IntegrationRateLimitPolicy)]
[IngestBody]
[RequestSizeLimit(IngestBodyAttribute.MaxBytes)]
public class IntegrationController(IngestService ingest) : ControllerBase
{
    [HttpPost("org-units")]
    [ProducesResponseType<IngestResultDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> OrgUnits([FromBody] IngestRequest<OrgUnitRow> body, [FromQuery] bool force, CancellationToken ct) =>
        Outcome(await ingest.IngestOrgUnitsAsync(body.Rows, force, ct));

    [HttpPost("employees")]
    [ProducesResponseType<IngestResultDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Employees([FromBody] IngestRequest<EmployeeRow> body, [FromQuery] bool force, CancellationToken ct) =>
        Outcome(await ingest.IngestEmployeesAsync(body.Rows, force, ct));

    [HttpPost("profiles")]
    [ProducesResponseType<IngestResultDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Profiles([FromBody] IngestRequest<ProfileRow> body, [FromQuery] bool force, CancellationToken ct) =>
        Outcome(await ingest.IngestProfilesAsync(body.Rows, force, ct));

    [HttpPost("salary")]
    [ProducesResponseType<IngestResultDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Salary([FromBody] IngestRequest<SalaryRow> body, [FromQuery] bool force, CancellationToken ct) =>
        Outcome(await ingest.IngestSalaryAsync(body.Rows, force, ct));

    [HttpPost("positions")]
    [ProducesResponseType<IngestResultDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Positions([FromBody] IngestRequest<PositionRow> body, [FromQuery] bool force, CancellationToken ct) =>
        Outcome(await ingest.IngestPositionsAsync(body.Rows, force, ct));

    [HttpPost("commendations")]
    [ProducesResponseType<IngestResultDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Commendations([FromBody] IngestRequest<CommendationRow> body, [FromQuery] bool force, CancellationToken ct) =>
        Outcome(await ingest.IngestCommendationsAsync(body.Rows, force, ct));

    [HttpPost("degrees")]
    [ProducesResponseType<IngestResultDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Degrees([FromBody] IngestRequest<DegreeRow> body, [FromQuery] bool force, CancellationToken ct) =>
        Outcome(await ingest.IngestDegreesAsync(body.Rows, force, ct));

    [HttpPost("trainings")]
    [ProducesResponseType<IngestResultDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Trainings([FromBody] IngestRequest<TrainingRow> body, [FromQuery] bool force, CancellationToken ct) =>
        Outcome(await ingest.IngestTrainingsAsync(body.Rows, force, ct));

    [HttpPost("business-trips")]
    [ProducesResponseType<IngestResultDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> BusinessTrips([FromBody] IngestRequest<BusinessTripRow> body, [FromQuery] bool force, CancellationToken ct) =>
        Outcome(await ingest.IngestBusinessTripsAsync(body.Rows, force, ct));

    [HttpPost("innovations")]
    [ProducesResponseType<IngestResultDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Innovations([FromBody] IngestRequest<InnovationRow> body, [FromQuery] bool force, CancellationToken ct) =>
        Outcome(await ingest.IngestInnovationsAsync(body.Rows, force, ct));

    private IActionResult Outcome(IngestOutcome outcome)
    {
        if (outcome.Result is not null) return Ok(outcome.Result);
        var problem = new ProblemDetails
        {
            Status = StatusCodes.Status409Conflict,
            Title = "Snapshot refused: it looks truncated",
            Detail = outcome.RefusedReason,
        };
        problem.Extensions["runId"] = outcome.RunId;
        problem.Extensions["received"] = outcome.Received;
        problem.Extensions["previous"] = outcome.Previous;
        return new ObjectResult(problem) { StatusCode = StatusCodes.Status409Conflict };
    }
}
