using HCMUSSupportV2.Backend.Modules.Admin.Common;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace HCMUSSupportV2.Backend.Modules.Admin.Audit;

[ApiController]
[Route("api/admin/audit")]
[Authorize(Policy = Policies.ViewAuditLog)]
public class AuditController(AuditQueryService audit) : ControllerBase
{
    /// <summary>
    /// Audit events, newest first (keyset on time and id). Filters: <c>actor</c> (code), <c>action</c> (exact, or a
    /// prefix with a trailing <c>*</c>), <c>targetType</c>, <c>targetId</c>, <c>from</c> (inclusive), <c>to</c> (exclusive).
    /// </summary>
    [HttpGet]
    [ProducesResponseType<AdminPage<AuditEntryDto>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Query([FromQuery] string? actor, [FromQuery] string? action,
        [FromQuery] string? targetType, [FromQuery] string? targetId, [FromQuery] DateTimeOffset? from,
        [FromQuery] DateTimeOffset? to, [FromQuery] string? cursor, [FromQuery] int? limit, CancellationToken ct) =>
        Ok(await audit.QueryAsync(new AuditFilter(actor, action, targetType, targetId, from, to), cursor, limit, ct));

    /// <summary>Distinct action names that appear in the log (for the filter).</summary>
    [HttpGet("actions")]
    [ProducesResponseType<IReadOnlyList<string>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Actions(CancellationToken ct) => Ok(await audit.ActionsAsync(ct));
}
