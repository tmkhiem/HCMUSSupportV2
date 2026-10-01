using System.Globalization;
using System.Text.Json;
using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Admin.Common;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using Microsoft.EntityFrameworkCore;

namespace HCMUSSupportV2.Backend.Modules.Admin.Audit;

/// <summary>An audit event with the actor and acting-as names joined from employees. <c>Details</c> is the stored JSON.</summary>
public record AuditEntryDto(
    long Id,
    DateTimeOffset At,
    string? ActorCode,
    string? ActorName,
    string? ActingAsCode,
    string? ActingAsName,
    string Action,
    string? TargetType,
    string? TargetId,
    JsonElement? Details,
    string? Ip,
    string? UserAgent);

public record AuditFilter(
    string? Actor = null,
    string? Action = null,
    string? TargetType = null,
    string? TargetId = null,
    DateTimeOffset? From = null,
    DateTimeOffset? To = null);

public class AuditQueryService(AppDbContext db)
{
    /// <summary>
    /// Audit events newest first, keyset-paged on (at, id). <c>Actor</c> matches the actor code; <c>Action</c> is exact,
    /// or a prefix when it ends with <c>*</c> (<c>viewas.*</c>); <c>From</c> is inclusive and <c>To</c> exclusive.
    /// </summary>
    public async Task<AdminPage<AuditEntryDto>> QueryAsync(AuditFilter filter, string? cursor, int? limit, CancellationToken ct)
    {
        var take = AdminQuery.ClampLimit(limit);
        var entries = db.Set<AuditLogEntry>().AsNoTracking();

        if (!string.IsNullOrWhiteSpace(filter.Actor)) { var a = filter.Actor.Trim(); entries = entries.Where(x => x.ActorCode == a); }
        if (!string.IsNullOrWhiteSpace(filter.Action))
        {
            var action = filter.Action.Trim();
            if (action.EndsWith('*'))
            {
                var prefix = AdminQuery.EscapeLike(action[..^1]) + "%";
                entries = entries.Where(x => EF.Functions.Like(x.Action, prefix, "\\"));
            }
            else entries = entries.Where(x => x.Action == action);
        }
        if (!string.IsNullOrWhiteSpace(filter.TargetType)) { var t = filter.TargetType.Trim(); entries = entries.Where(x => x.TargetType == t); }
        if (!string.IsNullOrWhiteSpace(filter.TargetId)) { var t = filter.TargetId.Trim(); entries = entries.Where(x => x.TargetId == t); }
        if (filter.From is { } from) entries = entries.Where(x => x.At >= from);
        if (filter.To is { } to) entries = entries.Where(x => x.At < to);

        if (DecodeCursor(cursor) is var (cAt, cId))
            entries = entries.Where(x => x.At < cAt || (x.At == cAt && x.Id < cId));

        var rows = await Project(entries.OrderByDescending(x => x.At).ThenByDescending(x => x.Id).Take(take + 1)).ToListAsync(ct);
        var items = rows.Take(take).Select(ToDto).ToList();
        var next = rows.Count > take ? EncodeCursor(items[^1].At, items[^1].Id) : null;
        return new AdminPage<AuditEntryDto>(items, next);
    }

    /// <summary>The newest events, for the dashboard.</summary>
    public async Task<IReadOnlyList<AuditEntryDto>> RecentAsync(int count, CancellationToken ct) =>
        (await Project(db.Set<AuditLogEntry>().AsNoTracking().OrderByDescending(x => x.At).ThenByDescending(x => x.Id).Take(count))
            .ToListAsync(ct)).Select(ToDto).ToList();

    /// <summary>Distinct action names, for the filter drop-down.</summary>
    public async Task<IReadOnlyList<string>> ActionsAsync(CancellationToken ct) =>
        await db.Set<AuditLogEntry>().AsNoTracking().Select(x => x.Action).Distinct().OrderBy(x => x).ToListAsync(ct);

    private sealed record Row(AuditLogEntry Entry, string? ActorName, string? ActingAsName);

    private IQueryable<Row> Project(IQueryable<AuditLogEntry> entries) =>
        from x in entries
        join a in db.Set<Employee>().AsNoTracking() on x.ActorCode equals a.Code into actors
        from a in actors.DefaultIfEmpty()
        join v in db.Set<Employee>().AsNoTracking() on x.ActingAsCode equals v.Code into viewed
        from v in viewed.DefaultIfEmpty()
        orderby x.At descending, x.Id descending
        select new Row(x, a != null ? a.FullName : null, v != null ? v.FullName : null);

    private static AuditEntryDto ToDto(Row r)
    {
        JsonElement? details = null;
        if (!string.IsNullOrEmpty(r.Entry.Details))
        {
            using var doc = JsonDocument.Parse(r.Entry.Details);
            details = doc.RootElement.Clone();
        }

        var e = r.Entry;
        return new AuditEntryDto(e.Id, e.At, e.ActorCode, r.ActorName, e.ActingAsCode, r.ActingAsName, e.Action,
            e.TargetType, e.TargetId, details, e.Ip?.ToString(), e.UserAgent);
    }

    private static string EncodeCursor(DateTimeOffset at, long id) =>
        AdminQuery.EncodeCursor($"{at.UtcTicks.ToString(CultureInfo.InvariantCulture)}:{id.ToString(CultureInfo.InvariantCulture)}");

    private static (DateTimeOffset At, long Id)? DecodeCursor(string? cursor)
    {
        var parts = AdminQuery.DecodeCursor(cursor)?.Split(':');
        return parts is { Length: 2 } &&
               long.TryParse(parts[0], NumberStyles.None, CultureInfo.InvariantCulture, out var ticks) &&
               long.TryParse(parts[1], NumberStyles.None, CultureInfo.InvariantCulture, out var id) &&
               ticks > 0 && ticks <= DateTime.MaxValue.Ticks
            ? (new DateTimeOffset(ticks, TimeSpan.Zero), id)
            : null;
    }
}
