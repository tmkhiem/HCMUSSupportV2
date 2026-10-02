using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Modules.Notifications.Domain;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HCMUSSupportV2.Backend.Modules.Notifications.Editor;

/// <summary>Tag lists for any signed-in employee (the inbox filter chips).</summary>
[ApiController]
[Authorize(Policy = Policies.Employee)]
[Route("api/tags")]
public class TagsController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IReadOnlyList<TagDto>> List(CancellationToken ct) =>
        await db.Set<Tag>().AsNoTracking().OrderBy(t => t.Sort).ThenBy(t => t.Name)
            .Select(t => new TagDto(t.Id, t.Name, t.Color, t.Sort)).ToListAsync(ct);
}

[ApiController]
[ApiException]
[Authorize(Policy = Policies.ManageNotifications)]
[Route("api/manage/tags")]
public class ManageTagsController(AppDbContext db, IAuditLogger audit) : ControllerBase
{
    [HttpGet]
    public async Task<IReadOnlyList<TagDto>> List(CancellationToken ct) =>
        await db.Set<Tag>().AsNoTracking().OrderBy(t => t.Sort).ThenBy(t => t.Name)
            .Select(t => new TagDto(t.Id, t.Name, t.Color, t.Sort)).ToListAsync(ct);

    [HttpPost]
    [ProducesResponseType<TagDto>(StatusCodes.Status201Created)]
    public async Task<IActionResult> Create([FromBody] TagRequest request, CancellationToken ct)
    {
        var name = await ValidateAsync(request, null, ct);
        var tag = new Tag { Name = name, Color = request.Color?.Trim(), Sort = request.Sort ?? 100 };
        db.Set<Tag>().Add(tag);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("tag.created", "tag", tag.Id.ToString(), new { tag.Name }, ct);
        return Created($"/api/manage/tags/{tag.Id}", new TagDto(tag.Id, tag.Name, tag.Color, tag.Sort));
    }

    [HttpPut("{id:long}")]
    public async Task<TagDto> Update(long id, [FromBody] TagRequest request, CancellationToken ct)
    {
        var tag = await db.Set<Tag>().FirstOrDefaultAsync(t => t.Id == id, ct) ?? throw ApiException.NotFound("Không tìm thấy nhãn.");
        tag.Name = await ValidateAsync(request, id, ct);
        tag.Color = request.Color?.Trim();
        if (request.Sort is { } sort) tag.Sort = sort;
        tag.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("tag.updated", "tag", id.ToString(), new { tag.Name }, ct);
        return new TagDto(tag.Id, tag.Name, tag.Color, tag.Sort);
    }

    /// <summary>Deletes a tag and removes it from every notification.</summary>
    [HttpDelete("{id:long}")]
    public async Task<IActionResult> Delete(long id, CancellationToken ct)
    {
        var tag = await db.Set<Tag>().FirstOrDefaultAsync(t => t.Id == id, ct) ?? throw ApiException.NotFound("Không tìm thấy nhãn.");
        db.Set<Tag>().Remove(tag);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("tag.deleted", "tag", id.ToString(), new { tag.Name }, ct);
        return NoContent();
    }

    private async Task<string> ValidateAsync(TagRequest request, long? selfId, CancellationToken ct)
    {
        var name = (request.Name ?? "").Trim();
        if (name.Length is 0 or > 100) throw ApiException.Invalid("name", "Tên nhãn từ 1 đến 100 ký tự.");
        if (await db.Set<Tag>().AnyAsync(t => t.Name == name && t.Id != selfId, ct))
            throw ApiException.Conflict("Đã có nhãn cùng tên.");
        return name;
    }
}

[ApiController]
[ApiException]
[Authorize(Policy = Policies.ManageNotifications)]
[Route("api/manage/series")]
public class ManageSeriesController(AppDbContext db, IAuditLogger audit) : ControllerBase
{
    [HttpGet]
    public async Task<IReadOnlyList<SeriesDto>> List(CancellationToken ct) =>
        await db.Set<NotificationSeries>().AsNoTracking().OrderBy(s => s.Name)
            .Select(s => new SeriesDto(s.Id, s.Name, s.Description)).ToListAsync(ct);

    [HttpPost]
    [ProducesResponseType<SeriesDto>(StatusCodes.Status201Created)]
    public async Task<IActionResult> Create([FromBody] SeriesRequest request, CancellationToken ct)
    {
        var name = await ValidateAsync(request, null, ct);
        var series = new NotificationSeries { Name = name, Description = request.Description?.Trim() };
        db.Set<NotificationSeries>().Add(series);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("series.created", "series", series.Id.ToString(), new { series.Name }, ct);
        return Created($"/api/manage/series/{series.Id}", new SeriesDto(series.Id, series.Name, series.Description));
    }

    [HttpPut("{id:long}")]
    public async Task<SeriesDto> Update(long id, [FromBody] SeriesRequest request, CancellationToken ct)
    {
        var series = await db.Set<NotificationSeries>().FirstOrDefaultAsync(s => s.Id == id, ct) ?? throw ApiException.NotFound("Không tìm thấy chuỗi.");
        series.Name = await ValidateAsync(request, id, ct);
        series.Description = request.Description?.Trim();
        series.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("series.updated", "series", id.ToString(), new { series.Name }, ct);
        return new SeriesDto(series.Id, series.Name, series.Description);
    }

    /// <summary>Deletes a series; its notifications stay, without a series.</summary>
    [HttpDelete("{id:long}")]
    public async Task<IActionResult> Delete(long id, CancellationToken ct)
    {
        var series = await db.Set<NotificationSeries>().FirstOrDefaultAsync(s => s.Id == id, ct) ?? throw ApiException.NotFound("Không tìm thấy chuỗi.");
        db.Set<NotificationSeries>().Remove(series);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("series.deleted", "series", id.ToString(), new { series.Name }, ct);
        return NoContent();
    }

    private async Task<string> ValidateAsync(SeriesRequest request, long? selfId, CancellationToken ct)
    {
        var name = (request.Name ?? "").Trim();
        if (name.Length is 0 or > 200) throw ApiException.Invalid("name", "Tên chuỗi từ 1 đến 200 ký tự.");
        if (await db.Set<NotificationSeries>().AnyAsync(s => s.Name == name && s.Id != selfId, ct))
            throw ApiException.Conflict("Đã có chuỗi cùng tên.");
        return name;
    }
}
