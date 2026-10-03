using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Modules.Notifications.Editor;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace HCMUSSupportV2.Backend.Modules.Notifications.Inbox;

/// <summary>The signed-in employee's notification inbox. Reads follow view-as.</summary>
[ApiController]
[ApiException]
[Authorize(Policy = Policies.Employee)]
[Route("api/notifications")]
public class NotificationsController(InboxService inbox, ICurrentUser user) : ControllerBase
{
    /// <summary>
    /// Inbox page, newest delivery first (keyset cursor). Filters: <c>q</c> (accent-insensitive full text),
    /// <c>tags</c> (tag ids, any of), <c>from</c>/<c>to</c> (delivery time, inclusive). Each item says whether it is new
    /// (delivered after the employee's previous sign-in).
    /// </summary>
    [HttpGet]
    public Task<Page<InboxItemDto>> List(
        [FromQuery] string? q, [FromQuery] long[]? tags, [FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? to,
        [FromQuery] string? cursor, [FromQuery] int limit = 20, CancellationToken ct = default) =>
        inbox.ListAsync(user.RequireEffectiveCode(), new InboxFilter(q, tags?.ToList(), from, to), cursor, limit, ct);

    /// <summary>404 when the employee has no delivery of this notification.</summary>
    [HttpGet("{id:guid}")]
    public Task<InboxDetailDto> Get(Guid id, CancellationToken ct) => inbox.GetAsync(user.RequireEffectiveCode(), id, ct);

    /// <summary>Downloads an attachment (404 without a delivery).</summary>
    [HttpGet("{id:guid}/attachments/{fileId:guid}")]
    [ProducesResponseType(typeof(FileStreamResult), StatusCodes.Status200OK, "application/octet-stream")]
    public async Task<IActionResult> Attachment(Guid id, Guid fileId, CancellationToken ct)
    {
        var content = await inbox.OpenAttachmentAsync(user.RequireEffectiveCode(), id, fileId, ct);
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return File(content.Stream, content.File.ContentType, content.File.FileName);
    }
}
