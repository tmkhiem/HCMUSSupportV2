using HCMUSSupportV2.Backend.Modules.Admin.Audit;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace HCMUSSupportV2.Backend.Modules.Admin.Dashboard;

public static class TileSeverity
{
    public const string Info = "info";
    public const string Success = "success";
    public const string Warning = "warning";
    public const string Danger = "danger";
}

/// <summary>One number on the admin dashboard. <c>Label</c> and <c>Hint</c> are Vietnamese, <c>Unit</c> is e.g. "%" or null.</summary>
public record DashboardTile(string Key, string Label, double Value, string? Hint = null, string Severity = TileSeverity.Info, string? Unit = null);

public record DashboardDto(IReadOnlyList<DashboardTile> Tiles, IReadOnlyList<AuditEntryDto> RecentActivity);

/// <summary>
/// A module's contribution to <c>GET /api/admin/dashboard</c>. Implement it, then register it from the module with
/// <c>services.AddDashboardContributor&lt;MyContributor&gt;()</c>. Contributors run in registration order; a
/// contributor that throws is logged and skipped, so one failing module never blanks the dashboard.
/// </summary>
public interface IDashboardContributor
{
    Task<IEnumerable<DashboardTile>> GetTilesAsync(CancellationToken ct);
}

public class DashboardService(
    IEnumerable<IDashboardContributor> contributors,
    AuditQueryService audit,
    ILogger<DashboardService> logger)
{
    public const int RecentCount = 20;

    public async Task<DashboardDto> BuildAsync(CancellationToken ct)
    {
        var tiles = new List<DashboardTile>();
        foreach (var contributor in contributors)
        {
            try
            {
                tiles.AddRange(await contributor.GetTilesAsync(ct));
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Dashboard contributor {Contributor} failed", contributor.GetType().Name);
            }
        }

        return new DashboardDto(tiles, await audit.RecentAsync(RecentCount, ct));
    }
}

[ApiController]
[Route("api/admin/dashboard")]
[Authorize(Policy = Policies.Admin)]
public class DashboardController(DashboardService dashboard) : ControllerBase
{
    /// <summary>Tiles from every registered contributor plus the last 20 audit events.</summary>
    [HttpGet]
    [ProducesResponseType<DashboardDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Get(CancellationToken ct) => Ok(await dashboard.BuildAsync(ct));
}
