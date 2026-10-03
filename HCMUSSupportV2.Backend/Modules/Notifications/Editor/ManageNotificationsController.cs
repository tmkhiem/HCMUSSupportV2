using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Modules.Notifications.Domain;
using HCMUSSupportV2.Backend.Modules.Notifications.Import;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using HCMUSSupportV2.Backend.Modules.Platform.Files;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HCMUSSupportV2.Backend.Modules.Notifications.Editor;

/// <summary>Editor API for notifications (policy <c>ManageNotifications</c>).</summary>
[ApiController]
[ApiException]
[Authorize(Policy = Policies.ManageNotifications)]
[Route("api/manage/notifications")]
public class ManageNotificationsController(NotificationEditorService service, RecipientImportService imports) : ControllerBase
{
    private const string Xlsx = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    /// <summary>Lists notifications, newest first (keyset on the id). Filters: status, tag id, series id, q (full text).</summary>
    [HttpGet]
    public Task<Page<ManageNotificationListItem>> List(
        [FromQuery] string? status, [FromQuery] long? tag, [FromQuery] long? series, [FromQuery] string? q,
        [FromQuery] string? cursor, [FromQuery] int limit = 20, CancellationToken ct = default) =>
        service.ListAsync(status, tag, series, q, cursor, limit, ct);

    [HttpGet("{id:guid}")]
    public Task<ManageNotificationDto> Get(Guid id, CancellationToken ct) => service.GetAsync(id, ct);

    /// <summary>Creates a draft. Validation problems answer 400 with an <c>errors</c> map (<c>bodyMd</c> lists line and column).</summary>
    [HttpPost]
    [ProducesResponseType<ManageNotificationDto>(StatusCodes.Status201Created)]
    public async Task<IActionResult> Create([FromBody] NotificationWriteRequest request, CancellationToken ct)
    {
        var dto = await service.CreateAsync(request, ct);
        return Created($"/api/manage/notifications/{dto.Id}", dto);
    }

    /// <summary>Updates a notification. <c>version</c> must be the current version, otherwise 409.</summary>
    [HttpPut("{id:guid}")]
    public Task<ManageNotificationDto> Update(Guid id, [FromBody] NotificationWriteRequest request, CancellationToken ct) =>
        service.UpdateAsync(id, request, ct);

    /// <summary>Deletes a notification (draft or posted) with its deliveries, attachments and history.</summary>
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await service.DeleteAsync(id, ct);
        return NoContent();
    }

    [HttpPost("{id:guid}/publish")]
    public Task<ManageNotificationDto> Publish(Guid id, CancellationToken ct) => service.PublishAsync(id, ct);

    /// <summary>New draft with the same content, variables, tags, series and group/employee/all audiences (no recipient rows).</summary>
    [HttpPost("{id:guid}/clone")]
    [ProducesResponseType<ManageNotificationDto>(StatusCodes.Status201Created)]
    public async Task<IActionResult> Clone(Guid id, CancellationToken ct)
    {
        var dto = await service.CloneAsync(id, ct);
        return Created($"/api/manage/notifications/{dto.Id}", dto);
    }

    [HttpGet("{id:guid}/revisions")]
    public Task<IReadOnlyList<RevisionDto>> Revisions(Guid id, CancellationToken ct) => service.RevisionsAsync(id, ct);

    [HttpGet("{id:guid}/stats")]
    public Task<NotificationStatsDto> Stats(Guid id, CancellationToken ct) => service.StatsAsync(id, ct);

    /// <summary>The variable rows of an MSCB (applied import, else the latest pending one) and whether it is in the audience.</summary>
    [HttpGet("{id:guid}/preview-vars")]
    public Task<PreviewVarsDto> PreviewVars(Guid id, [FromQuery] string employee, [FromQuery] Guid? importId, CancellationToken ct) =>
        service.PreviewVarsAsync(id, employee, importId, ct);

    // ---- recipients import

    /// <summary>Uploads a recipient sheet (multipart field <c>file</c>, xlsx or csv) and returns the validation report.</summary>
    [HttpPost("{id:guid}/recipients/import")]
    [RequestSizeLimit(12 * 1024 * 1024)]
    [Consumes("multipart/form-data")]
    public async Task<RecipientImportDto> ImportRecipients(Guid id, IFormFile file, CancellationToken ct)
    {
        await using var stream = file.OpenReadStream();
        return await imports.ImportAsync(id, file.FileName, stream, ct);
    }

    [HttpGet("{id:guid}/imports/{importId:guid}")]
    public Task<RecipientImportDto> GetImport(Guid id, Guid importId, CancellationToken ct) => imports.GetAsync(id, importId, ct);

    /// <summary>Merges the sheet's columns into the declared variables and makes the sheet the notification's recipient list.</summary>
    [HttpPost("{id:guid}/imports/{importId:guid}/apply")]
    public Task<ManageNotificationDto> ApplyImport(Guid id, Guid importId, CancellationToken ct) => imports.ApplyAsync(id, importId, ct);

    /// <summary>An xlsx with the MSCB column and one column per declared variable.</summary>
    [HttpGet("{id:guid}/recipients/template")]
    [ProducesResponseType(typeof(FileContentResult), StatusCodes.Status200OK, Xlsx)]
    public async Task<IActionResult> Template(Guid id, CancellationToken ct) =>
        File(await imports.TemplateAsync(id, ct), Xlsx, $"mau-danh-sach-{id.ToString("N")[..8]}.xlsx");

    // ---- attachments

    [HttpPost("{id:guid}/attachments")]
    [RequestSizeLimit(22 * 1024 * 1024)]
    [Consumes("multipart/form-data")]
    public async Task<AttachmentDto> AddAttachment(Guid id, IFormFile file, CancellationToken ct)
    {
        await using var stream = file.OpenReadStream();
        return await service.AddAttachmentAsync(id, file.FileName, file.Length, stream, ct);
    }

    [HttpDelete("{id:guid}/attachments/{attachmentId:guid}")]
    public async Task<IActionResult> DeleteAttachment(Guid id, Guid attachmentId, CancellationToken ct)
    {
        await service.DeleteAttachmentAsync(id, attachmentId, ct);
        return NoContent();
    }

    // ---- images used inside the Markdown body

    /// <summary>Uploads an image for the body (png, jpg, gif, webp, up to 5 MB). Reference it as <c>![alt](/api/files/{id})</c>.</summary>
    [HttpPost("images")]
    [RequestSizeLimit(7 * 1024 * 1024)]
    [Consumes("multipart/form-data")]
    public async Task<ImageUploadDto> UploadImage(IFormFile file, [FromServices] IFileStore files, [FromServices] ICurrentUser user, CancellationToken ct)
    {
        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        var contentType = ext switch { ".png" => "image/png", ".jpg" or ".jpeg" => "image/jpeg", ".gif" => "image/gif", ".webp" => "image/webp", _ => null };
        if (contentType is null) throw ApiException.Invalid("file", "Chỉ nhận ảnh png, jpg, gif, webp.");
        if (file.Length > 5 * 1024 * 1024) throw ApiException.Invalid("file", "Ảnh vượt quá 5 MB.");
        await using var stream = file.OpenReadStream();
        var head = new byte[12];
        var read = await stream.ReadAtLeastAsync(head, head.Length, throwOnEndOfStream: false, ct);
        var ok = contentType switch
        {
            "image/png" => read >= 4 && head[0] == 0x89 && head[1] == 0x50 && head[2] == 0x4E && head[3] == 0x47,
            "image/jpeg" => read >= 3 && head[0] == 0xFF && head[1] == 0xD8 && head[2] == 0xFF,
            "image/gif" => read >= 4 && head[0] == 'G' && head[1] == 'I' && head[2] == 'F' && head[3] == '8',
            _ => read >= 12 && head[0] == 'R' && head[1] == 'I' && head[2] == 'F' && head[3] == 'F' && head[8] == 'W' && head[9] == 'E' && head[10] == 'B' && head[11] == 'P',
        };
        if (!ok) throw ApiException.Invalid("file", "Nội dung tệp không phải ảnh hợp lệ.");
        stream.Seek(0, SeekOrigin.Begin);
        try
        {
            var stored = await files.SaveAsync(stream, file.FileName, contentType, user.Code, ct);
            return new ImageUploadDto($"/api/files/{stored.Id}", stored.Id);
        }
        catch (FileRejectedException ex) { throw ApiException.Invalid("file", ex.Message); }
    }
}

/// <summary>Serves images embedded in notification bodies (<c>![](/api/files/{id})</c>) to signed-in employees.</summary>
[ApiController]
[ApiException]
[Authorize(Policy = Policies.Employee)]
[Route("api/files")]
public class FilesController(AppDbContext db, IFileStore files) : ControllerBase
{
    /// <summary>Only images that are not notification attachments are served here; attachments need a delivery (see the inbox API).</summary>
    [HttpGet("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var meta = await files.GetAsync(id, ct);
        if (meta is null || !meta.ContentType.StartsWith("image/", StringComparison.Ordinal)
            || await db.Set<NotificationAttachment>().AnyAsync(a => a.FileId == id, ct))
            return NotFound();
        var content = await files.OpenReadAsync(id, ct);
        if (content is null) return NotFound();
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        Response.Headers.CacheControl = "private, max-age=86400";
        Response.Headers.ContentSecurityPolicy = "default-src 'none'; sandbox";
        return File(content.Stream, content.File.ContentType);
    }
}
