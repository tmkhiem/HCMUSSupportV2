using System.Text.Json;
using HCMUSSupportV2.Backend.Data;
using Microsoft.EntityFrameworkCore;

namespace HCMUSSupportV2.Backend.Modules.Platform.Audit;

public class AuditLogger(IDbContextFactory<AppDbContext> dbFactory, IHttpContextAccessor httpContextAccessor) : IAuditLogger
{
    /// <summary>Claim carrying the signed-in employee's code (MSCB).</summary>
    public const string ActorClaim = "code";

    /// <summary>Claim carrying the employee code being impersonated, if any.</summary>
    public const string ActingAsClaim = "acting_as";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task LogAsync(string action, string? targetType = null, string? targetId = null, object? details = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(action);

        var http = httpContextAccessor.HttpContext;
        var entry = new AuditLogEntry
        {
            ActorCode = http?.User.FindFirst(ActorClaim)?.Value,
            ActingAsCode = http?.User.FindFirst(ActingAsClaim)?.Value,
            Action = action,
            TargetType = targetType,
            TargetId = targetId,
            Details = details is null ? null : JsonSerializer.Serialize(details, JsonOptions),
            Ip = http?.Connection.RemoteIpAddress,
            UserAgent = Truncate(http?.Request.Headers.UserAgent.ToString(), 500),
        };

        await using var db = await dbFactory.CreateDbContextAsync(cancellationToken);
        db.Set<AuditLogEntry>().Add(entry);
        await db.SaveChangesAsync(cancellationToken);
    }

    private static string? Truncate(string? s, int max) =>
        string.IsNullOrEmpty(s) ? null : s.Length <= max ? s : s[..max];
}
