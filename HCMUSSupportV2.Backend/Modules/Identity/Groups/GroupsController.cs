using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Modules.Platform.Jobs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace HCMUSSupportV2.Backend.Modules.Identity.Groups;

/// <summary>Turns <see cref="GroupsException"/> into a ProblemDetails (or validation problem) response.</summary>
public sealed class GroupsExceptionFilter : IExceptionFilter
{
    public void OnException(ExceptionContext context)
    {
        if (context.Exception is not GroupsException ex) return;
        context.Result = ex.Errors is null
            ? new ObjectResult(new ProblemDetails { Status = ex.Status, Title = ex.Title, Detail = ex.Message }) { StatusCode = ex.Status }
            : new ObjectResult(new ValidationProblemDetails(ex.Errors) { Status = ex.Status, Title = ex.Title, Detail = ex.Message }) { StatusCode = ex.Status };
        context.ExceptionHandled = true;
    }
}

/// <summary>
/// Group management for editors (PLAN §5): <c>/api/manage/groups</c>. Kinds: <c>static</c> (hand-edited members),
/// <c>org_unit</c> (one per org unit, generated and computed) and <c>rule</c> (computed from a JSON rule).
/// </summary>
[ApiController]
[Route("api/manage/groups")]
[Authorize(Policy = Policies.ManageGroups)]
[TypeFilter<GroupsExceptionFilter>]
public class GroupsController(GroupsService groups, IJobQueue jobs) : ControllerBase
{
    /// <summary>Lists groups by name with keyset paging (<c>cursor</c> from <c>nextCursor</c>). <c>q</c> matches the name without accents.</summary>
    [HttpGet]
    [ProducesResponseType<GroupPageDto>(StatusCodes.Status200OK)]
    public async Task<GroupPageDto> List([FromQuery] string? q, [FromQuery] string? kind, [FromQuery] bool includeArchived = false,
        [FromQuery] string? cursor = null, [FromQuery] int limit = 50, CancellationToken ct = default) =>
        await groups.ListAsync(q, kind, includeArchived, cursor, limit, ct);

    [HttpGet("{id:long}")]
    [ProducesResponseType<GroupDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<GroupDto> Get(long id, CancellationToken ct) => await groups.GetAsync(id, ct);

    /// <summary>Creates a <c>static</c> or <c>rule</c> group. A rule group is computed right away.</summary>
    [HttpPost]
    [ProducesResponseType<GroupDto>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Create([FromBody] CreateGroupRequest request, CancellationToken ct)
    {
        var created = await groups.CreateAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = created.Id }, created);
    }

    /// <summary>Updates a group; a changed rule (or <c>includeDescendants</c> of an org-unit group) recomputes the members at once.</summary>
    [HttpPut("{id:long}")]
    [ProducesResponseType<GroupDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<GroupDto> Update(long id, [FromBody] UpdateGroupRequest request, CancellationToken ct) =>
        await groups.UpdateAsync(id, request, ct);

    /// <summary>Archives the group (soft delete). Org-unit groups answer 409.</summary>
    [HttpDelete("{id:long}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Archive(long id, CancellationToken ct)
    {
        await groups.ArchiveAsync(id, ct);
        return NoContent();
    }

    [HttpPost("{id:long}/restore")]
    [ProducesResponseType<GroupDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<GroupDto> Restore(long id, CancellationToken ct) => await groups.RestoreAsync(id, ct);

    /// <summary>Members ordered by code: code, full name, unit and source (<c>manual</c> or <c>computed</c>).</summary>
    [HttpGet("{id:long}/members")]
    [ProducesResponseType<GroupMemberPageDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<GroupMemberPageDto> Members(long id, [FromQuery] string? q, [FromQuery] string? cursor,
        [FromQuery] int limit = 50, CancellationToken ct = default) =>
        await groups.ListMembersAsync(id, q, cursor, limit, ct);

    /// <summary>Adds members to a static group. Unknown and inactive codes are reported, not added.</summary>
    [HttpPut("{id:long}/members")]
    [ProducesResponseType<AddMembersResultDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<AddMembersResultDto> AddMembers(long id, [FromBody] MemberCodesRequest request, CancellationToken ct) =>
        await groups.AddMembersAsync(id, request.Codes, ct);

    /// <summary>Removes members from a static group.</summary>
    [HttpDelete("{id:long}/members")]
    [ProducesResponseType<RemoveMembersResultDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<RemoveMembersResultDto> RemoveMembers(long id, [FromBody] MemberCodesRequest request, CancellationToken ct) =>
        await groups.RemoveMembersAsync(id, request.Codes, ct);

    /// <summary>
    /// Imports MSCB from a csv or xlsx file (multipart field <c>file</c>). <c>dryRun=true</c> (default) only reports;
    /// upload the same file with <c>dryRun=false</c> to apply it.
    /// </summary>
    [HttpPost("{id:long}/members/import")]
    [RequestSizeLimit(MemberFileReader.MaxBytes + 64 * 1024)]
    [ProducesResponseType<ImportReportDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ImportReportDto> ImportMembers(long id, IFormFile file, [FromQuery] bool dryRun = true, CancellationToken ct = default)
    {
        if (file is null || file.Length == 0)
            throw GroupsException.BadRequest("No file", "Chưa chọn tệp hoặc tệp rỗng.");
        if (file.Length > MemberFileReader.MaxBytes)
            throw GroupsException.BadRequest("File too large", "Tệp tối đa 5 MB.");
        await using var stream = file.OpenReadStream();
        return await groups.ImportMembersAsync(id, stream, file.FileName, dryRun, ct);
    }

    /// <summary>Validates a rule and returns how many active employees it matches plus a sample (no group needed).</summary>
    [HttpPost("preview-rule")]
    [ProducesResponseType<PreviewRuleResultDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<PreviewRuleResultDto> PreviewRule([FromBody] PreviewRuleRequest request, CancellationToken ct) =>
        await groups.PreviewRuleAsync(request.Rule, ct);

    /// <summary>Queues a <c>groups.recompute</c> job (all groups, or only <c>groupId</c>). Returns the job id.</summary>
    [HttpPost("recompute")]
    [ProducesResponseType<RecomputeAcceptedDto>(StatusCodes.Status202Accepted)]
    public async Task<IActionResult> Recompute([FromQuery] long? groupId, CancellationToken ct)
    {
        var id = await jobs.EnqueueAsync(GroupsRecomputeJob.JobType, groupId is null ? null : new RecomputePayload(groupId), cancellationToken: ct);
        return Accepted(new RecomputeAcceptedDto(id));
    }
}
