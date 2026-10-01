namespace HCMUSSupportV2.Backend.Modules.Platform.Audit;

public interface IAuditLogger
{
    /// <summary>
    /// Appends an audit record. The actor (claim <c>code</c>), the acting-as employee (claim <c>acting_as</c>),
    /// the client IP and the user agent are taken from the current HTTP request when there is one.
    /// The record is committed immediately and independently of any other unit of work.
    /// </summary>
    Task LogAsync(string action, string? targetType = null, string? targetId = null, object? details = null,
        CancellationToken cancellationToken = default);
}
