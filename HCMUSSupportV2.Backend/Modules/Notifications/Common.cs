using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Npgsql;
using NpgsqlTypes;

namespace HCMUSSupportV2.Backend.Modules.Notifications;

/// <summary>A failure with an HTTP meaning, thrown by notification services and turned into ProblemDetails.</summary>
public class ApiException(int status, string title, string detail, IDictionary<string, string[]>? errors = null, IDictionary<string, object?>? extensions = null)
    : Exception(detail)
{
    public int Status { get; } = status;
    public string Title { get; } = title;
    public string Detail { get; } = detail;
    public IDictionary<string, string[]>? Errors { get; } = errors;
    public IDictionary<string, object?>? Extensions { get; } = extensions;

    public static ApiException NotFound(string detail = "Không tìm thấy.") => new(404, "Not found", detail);
    public static ApiException Conflict(string detail, IDictionary<string, object?>? extensions = null) => new(409, "Conflict", detail, null, extensions);
    public static ApiException BadRequest(string detail) => new(400, "Bad request", detail);
    public static ApiException Forbidden(string detail) => new(403, "Forbidden", detail);
    public static ApiException Invalid(string field, params string[] messages) =>
        new(400, "Validation failed", messages.FirstOrDefault() ?? "Dữ liệu không hợp lệ.", new Dictionary<string, string[]> { [field] = messages });
}

/// <summary>Maps <see cref="ApiException"/> to ProblemDetails / ValidationProblemDetails.</summary>
public class ApiExceptionFilter : IExceptionFilter
{
    public void OnException(ExceptionContext context)
    {
        if (context.Exception is not ApiException ex) return;
        ProblemDetails body = ex.Errors is null
            ? new ProblemDetails { Status = ex.Status, Title = ex.Title, Detail = ex.Detail }
            : new ValidationProblemDetails(ex.Errors) { Status = ex.Status, Title = ex.Title, Detail = ex.Detail };
        foreach (var (k, v) in ex.Extensions ?? new Dictionary<string, object?>()) body.Extensions[k] = v;
        context.Result = new ObjectResult(body) { StatusCode = ex.Status, ContentTypes = { "application/problem+json" } };
        context.ExceptionHandled = true;
    }
}

public sealed class ApiExceptionAttribute : TypeFilterAttribute
{
    public ApiExceptionAttribute() : base(typeof(ApiExceptionFilter)) { }
}

/// <summary>Opaque keyset cursors: url-safe base64 of pipe-separated parts.</summary>
public static class Cursor
{
    public static string Encode(params string[] parts) =>
        Convert.ToBase64String(Encoding.UTF8.GetBytes(string.Join('|', parts))).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    public static string[]? Decode(string? cursor, int expectedParts)
    {
        if (string.IsNullOrWhiteSpace(cursor)) return null;
        try
        {
            var s = cursor.Replace('-', '+').Replace('_', '/');
            s = s.PadRight(s.Length + (4 - s.Length % 4) % 4, '=');
            var parts = Encoding.UTF8.GetString(Convert.FromBase64String(s)).Split('|');
            return parts.Length == expectedParts ? parts : throw ApiException.BadRequest("Cursor không hợp lệ.");
        }
        catch (FormatException) { throw ApiException.BadRequest("Cursor không hợp lệ."); }
    }
}

public record Page<T>(IReadOnlyList<T> Items, string? NextCursor);

public static class NotificationJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);

    public static JsonNode? Parse(string? json) => string.IsNullOrWhiteSpace(json) ? null : JsonNode.Parse(json);
    public static string Serialize(object value) => JsonSerializer.Serialize(value, Options);
}

public static class NpgsqlExtensions
{
    public static NpgsqlParameter Add(this NpgsqlCommand cmd, string name, NpgsqlDbType type, object? value)
    {
        var p = cmd.Parameters.Add(new NpgsqlParameter(name, type) { Value = value ?? DBNull.Value });
        return p;
    }

    public static object? ToDb(this DateTimeOffset? value) => value?.ToUniversalTime();
}
