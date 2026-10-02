using HCMUSSupportV2.Backend.Infrastructure;
using HCMUSSupportV2.Backend.Modules.Hrm.Integration;
using HCMUSSupportV2.Backend.Modules.Notifications;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace HCMUSSupportV2.Backend.Modules.Legacy.Notifications;

/// <summary>D15 step 4: the v1 news posts (docs/LEGACY-MIGRATION.md). Scope <c>legacy.import</c>.</summary>
[ApiController]
[ApiException]
[Route(LegacyModule.RoutePrefix + "/notifications")]
[Authorize(Policy = LegacyModule.LegacyImportPolicy, AuthenticationSchemes = ApiKeyDefaults.Scheme)]
[EnableRateLimiting(InfrastructureExtensions.IntegrationRateLimitPolicy)]
[IngestBody]
[RequestSizeLimit(IngestBodyAttribute.MaxBytes)]
public class LegacyNotificationController(LegacyNotificationImportService service) : ControllerBase
{
    [HttpPost]
    [ProducesResponseType<LegacyNotificationReport>(StatusCodes.Status200OK)]
    public async Task<LegacyNotificationReport> Import([FromBody] LegacyNotificationsRequest body, [FromQuery] bool dryRun, CancellationToken ct)
    {
        if (body?.Posts is null) throw ApiException.BadRequest("Body must be { \"posts\": [ ... ] }.");
        return await service.ImportAsync(body.Posts, dryRun, ct);
    }
}
