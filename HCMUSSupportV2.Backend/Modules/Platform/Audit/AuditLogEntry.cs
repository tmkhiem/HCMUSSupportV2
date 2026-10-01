using System.Net;

namespace HCMUSSupportV2.Backend.Modules.Platform.Audit;

/// <summary>Append-only record of a security- or data-relevant action (<c>audit_log</c>).</summary>
public class AuditLogEntry
{
    public long Id { get; set; }
    public DateTimeOffset At { get; set; }

    /// <summary>Employee code (MSCB) of the signed-in user; null for system actions.</summary>
    public string? ActorCode { get; set; }

    /// <summary>Employee code being impersonated ("view as"), when the actor acts as someone else.</summary>
    public string? ActingAsCode { get; set; }

    public string Action { get; set; } = "";
    public string? TargetType { get; set; }
    public string? TargetId { get; set; }

    /// <summary>JSON document (jsonb).</summary>
    public string? Details { get; set; }

    public IPAddress? Ip { get; set; }
    public string? UserAgent { get; set; }
}
