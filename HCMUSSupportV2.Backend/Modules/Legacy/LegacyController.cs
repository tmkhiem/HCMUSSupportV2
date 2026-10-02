using HCMUSSupportV2.Backend.Infrastructure;
using HCMUSSupportV2.Backend.Modules.Hrm;
using HCMUSSupportV2.Backend.Modules.Hrm.Integration;
using HCMUSSupportV2.Backend.Modules.Notifications;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace HCMUSSupportV2.Backend.Modules.Legacy;

/// <summary>
/// The one-off legacy migration (D15), ApiKey scope <c>legacy.import</c>, <c>Authorization: ApiKey &lt;token&gt;</c> (under
/// <c>/api/integration</c>, so it is exempt from the cookie antiforgery check). Every endpoint is a <b>dry run unless
/// <c>?dryRun=false</c></b>, and every step is idempotent: running it again reports nothing to do. Bodies may be gzip.
/// </summary>
[ApiController]
[Route("api/integration/v1/legacy")]
[Authorize(Policy = HrmModule.ImportLegacyPolicy, AuthenticationSchemes = ApiKeyDefaults.Scheme)]
[EnableRateLimiting(InfrastructureExtensions.IntegrationRateLimitPolicy)]
[IngestBody]
[RequestSizeLimit(IngestBodyAttribute.MaxBytes)]
[ApiException]
public class LegacyController(
    LegacyRosterService roster, LegacyRolesService roles, LegacyNewsService news, LegacyDatasetsService datasets) : ControllerBase
{
    /// <summary><c>config/users.json</c> to <c>employee_emails</c> (additive), with the conflict report.</summary>
    [HttpPost("roster-emails")]
    [ProducesResponseType<LegacyRosterReportDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> RosterEmails([FromBody] LegacyRosterRequest body, [FromQuery] bool dryRun = true, CancellationToken ct = default) =>
        Ok(await roster.ImportAsync(body, dryRun, ct));

    /// <summary>Grants <c>editor</c>/<c>admin</c> to the named people (additive). The identities are the caller's input.</summary>
    [HttpPost("roles")]
    [ProducesResponseType<LegacyRolesReportDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Roles([FromBody] LegacyRolesRequest body, [FromQuery] bool dryRun = true, CancellationToken ct = default) =>
        Ok(await roles.GrantAsync(body, dryRun, ct));

    /// <summary>Imports converted v1 news (or the update-info banner, <c>kind=banner</c>) as published notifications.</summary>
    [HttpPost("news")]
    [ProducesResponseType<LegacyNewsReportDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> News([FromBody] LegacyNewsRequest body, [FromQuery] bool dryRun = true, CancellationToken ct = default) =>
        Ok(await news.ImportAsync(body, dryRun, ct));

    [HttpPost("datasets/teaching")]
    [ProducesResponseType<LegacyDatasetReportDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Teaching([FromBody] LegacyTeachingRequest body, [FromQuery] bool dryRun = true, CancellationToken ct = default) =>
        Ok(await datasets.TeachingAsync(body, dryRun, ct));

    [HttpPost("datasets/research")]
    [ProducesResponseType<LegacyDatasetReportDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Research([FromBody] LegacyResearchRequest body, [FromQuery] bool dryRun = true, CancellationToken ct = default) =>
        Ok(await datasets.ResearchAsync(body, dryRun, ct));

    [HttpPost("datasets/publications")]
    [ProducesResponseType<LegacyDatasetReportDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Publications([FromBody] LegacyPublicationsRequest body, [FromQuery] bool dryRun = true, CancellationToken ct = default) =>
        Ok(await datasets.PublicationsAsync(body, dryRun, ct));
}
