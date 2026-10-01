using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Hrm.Domain;
using HCMUSSupportV2.Backend.Modules.Hrm.Me;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HCMUSSupportV2.Backend.Modules.Hrm.Sync;

public record SyncRunDto(
    long Id, string Source, string Dataset, DateTimeOffset StartedAt, DateTimeOffset? FinishedAt, string Status,
    int Received, int Inserted, int Updated, int Deleted, string? Error, int IssueCount, int OpenIssueCount);

public record SyncIssueDto(
    long Id, long SyncRunId, string Dataset, string Kind, string SourceKey, string? DetailsJson,
    DateTimeOffset CreatedAt, DateTimeOffset? ResolvedAt, string? ResolvedBy);

/// <summary>Sync visibility for admins: the ingest runs and the issues (duplicate MSCB, unknown unit, bad date, ...) to resolve.</summary>
[ApiController]
[Route("api/admin")]
[Authorize(Policy = Policies.Admin)]
public class SyncAdminController(AppDbContext db, ICurrentUser user, IAuditLogger audit, TimeProvider time) : ControllerBase
{
    /// <summary>Runs, newest first. <c>cursor</c> is the id of the last run of the previous page.</summary>
    [HttpGet("sync-runs")]
    [ProducesResponseType<PageDto<SyncRunDto>>(StatusCodes.Status200OK)]
    public async Task<PageDto<SyncRunDto>> Runs([FromQuery] string? dataset, [FromQuery] long? cursor, [FromQuery] int? limit, CancellationToken ct)
    {
        var query = db.Set<SyncRun>().AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(dataset)) query = query.Where(r => r.Dataset == dataset);
        if (cursor is { } c) query = query.Where(r => r.Id < c);
        var size = Math.Clamp(limit ?? 50, 1, 200);

        var page = await query.OrderByDescending(r => r.Id).Take(size + 1).ToListAsync(ct);
        var more = page.Count > size;
        if (more) page.RemoveAt(size);

        var ids = page.Select(r => r.Id).ToList();
        var counts = await db.Set<SyncIssue>().AsNoTracking().Where(i => ids.Contains(i.SyncRunId))
            .GroupBy(i => i.SyncRunId).Select(g => new { Id = g.Key, Total = g.Count(), Open = g.Count(i => i.ResolvedAt == null) }).ToListAsync(ct);
        var items = page.Select(r =>
        {
            var n = counts.FirstOrDefault(x => x.Id == r.Id);
            return new SyncRunDto(r.Id, r.Source, r.Dataset, r.StartedAt, r.FinishedAt, r.Status, r.Received, r.Inserted, r.Updated, r.Deleted, r.Error, n?.Total ?? 0, n?.Open ?? 0);
        }).ToList();
        return new PageDto<SyncRunDto>(items, more ? page[^1].Id : null);
    }

    /// <summary>Issues, newest first. <c>resolved=false</c> lists the open ones, <c>true</c> the resolved ones, omitted both.</summary>
    [HttpGet("sync-issues")]
    [ProducesResponseType<PageDto<SyncIssueDto>>(StatusCodes.Status200OK)]
    public async Task<PageDto<SyncIssueDto>> Issues(
        [FromQuery] bool? resolved, [FromQuery] string? dataset, [FromQuery] string? kind, [FromQuery] long? cursor, [FromQuery] int? limit, CancellationToken ct)
    {
        var query = db.Set<SyncIssue>().AsNoTracking().AsQueryable();
        if (resolved is { } r) query = r ? query.Where(i => i.ResolvedAt != null) : query.Where(i => i.ResolvedAt == null);
        if (!string.IsNullOrWhiteSpace(dataset)) query = query.Where(i => i.Dataset == dataset);
        if (!string.IsNullOrWhiteSpace(kind)) query = query.Where(i => i.Kind == kind);
        if (cursor is { } c) query = query.Where(i => i.Id < c);
        var size = Math.Clamp(limit ?? 50, 1, 200);

        var page = await query.OrderByDescending(i => i.Id).Take(size + 1).ToListAsync(ct);
        var more = page.Count > size;
        if (more) page.RemoveAt(size);
        return new PageDto<SyncIssueDto>(page.Select(ToDto).ToList(), more ? page[^1].Id : null);
    }

    /// <summary>Marks an issue resolved (idempotent). The admin fixes the cause in HRM; the next sync no longer reports it.</summary>
    [HttpPut("sync-issues/{id:long}/resolve")]
    [ProducesResponseType<SyncIssueDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Resolve(long id, CancellationToken ct)
    {
        var issue = await db.Set<SyncIssue>().FirstOrDefaultAsync(i => i.Id == id, ct);
        if (issue is null) return NotFound();
        if (issue.ResolvedAt is null)
        {
            issue.ResolvedAt = time.GetUtcNow();
            issue.ResolvedBy = user.Code;
            await db.SaveChangesAsync(ct);
            await audit.LogAsync("sync.issue_resolve", "sync_issue", id.ToString(), new { issue.Dataset, issue.Kind, issue.SourceKey }, ct);
        }
        return Ok(ToDto(issue));
    }

    private static SyncIssueDto ToDto(SyncIssue i) =>
        new(i.Id, i.SyncRunId, i.Dataset, i.Kind, i.SourceKey, i.Details, i.CreatedAt, i.ResolvedAt, i.ResolvedBy);
}
