using HCMUSSupportV2.Backend.Infrastructure;
using HCMUSSupportV2.Backend.Modules.Hrm.Integration;
using HCMUSSupportV2.Backend.Modules.Notifications;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace HCMUSSupportV2.Backend.Modules.Legacy.Emails;

/// <summary>D15 step 2: the v1 email mapping (docs/LEGACY-MIGRATION.md). Scope <c>legacy.import</c>.</summary>
[ApiController]
[ApiException]
[Route(LegacyModule.RoutePrefix + "/emails")]
[Authorize(Policy = LegacyModule.LegacyImportPolicy, AuthenticationSchemes = ApiKeyDefaults.Scheme)]
[EnableRateLimiting(InfrastructureExtensions.IntegrationRateLimitPolicy)]
[IngestBody]
[RequestSizeLimit(IngestBodyAttribute.MaxBytes)]
public class LegacyEmailController(LegacyEmailImportService service) : ControllerBase
{
    [HttpPost]
    [ProducesResponseType<LegacyEmailReport>(StatusCodes.Status200OK)]
    public async Task<LegacyEmailReport> Import([FromBody] LegacyEmailsRequest body, [FromQuery] bool dryRun, CancellationToken ct)
    {
        if (body?.Users is null) throw ApiException.BadRequest("Body must be { \"users\": [ ... ] }.");
        return await service.ImportAsync(body.Users, dryRun, ct);
    }
}
