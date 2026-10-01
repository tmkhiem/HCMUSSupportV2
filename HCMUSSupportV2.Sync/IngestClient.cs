using System.IO.Compression;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using HCMUSSupportV2.Sync.Contracts;

namespace HCMUSSupportV2.Sync;

/// <summary>Outcome of posting one dataset.</summary>
public sealed record PostOutcome(string Dataset, int Sent, bool Success, int StatusCode, IngestResultDto? Result, string? Error);

public interface IIngestPoster
{
    Task<PostOutcome> PostAsync(string dataset, IReadOnlyList<object> rows, bool force, CancellationToken ct);
}

/// <summary>Posts a full snapshot as gzipped JSON <c>{"rows":[...]}</c> to <c>POST /api/integration/v1/{dataset}</c> with the ApiKey header.</summary>
public sealed class IngestClient : IIngestPoster, IDisposable
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.Never,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private readonly HttpClient _http;
    private readonly bool _ownsClient;

    public IngestClient(SyncOptions options) : this(Create(options), true) { }

    public IngestClient(HttpClient http, bool ownsClient = false)
    {
        _http = http;
        _ownsClient = ownsClient;
    }

    private static HttpClient Create(SyncOptions o)
    {
        if (string.IsNullOrWhiteSpace(o.ApiBaseUrl)) throw new InvalidOperationException("Sync:ApiBaseUrl is not configured.");
        if (string.IsNullOrWhiteSpace(o.ApiToken)) throw new InvalidOperationException("Sync:ApiToken is not configured.");
        var http = new HttpClient { BaseAddress = new Uri(o.ApiBaseUrl.TrimEnd('/') + "/"), Timeout = TimeSpan.FromSeconds(o.TimeoutSeconds) };
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("ApiKey", o.ApiToken);
        return http;
    }

    /// <summary>The gzipped request body for a snapshot.</summary>
    public static byte[] BuildBody(IReadOnlyList<object> rows)
    {
        using var ms = new MemoryStream();
        using (var gz = new GZipStream(ms, CompressionLevel.Optimal, leaveOpen: true))
            JsonSerializer.Serialize(gz, new { rows }, Json);
        return ms.ToArray();
    }

    public async Task<PostOutcome> PostAsync(string dataset, IReadOnlyList<object> rows, bool force, CancellationToken ct)
    {
        var body = BuildBody(rows);
        using var req = new HttpRequestMessage(HttpMethod.Post, $"api/integration/v1/{dataset}" + (force ? "?force=true" : ""))
        {
            Content = new ByteArrayContent(body),
        };
        req.Content.Headers.ContentType = new MediaTypeHeaderValue("application/json");
        req.Content.Headers.ContentEncoding.Add("gzip");

        try
        {
            using var resp = await _http.SendAsync(req, ct);
            var text = await resp.Content.ReadAsStringAsync(ct);
            if (resp.IsSuccessStatusCode)
            {
                var result = JsonSerializer.Deserialize<IngestResultDto>(text, Json);
                return new PostOutcome(dataset, rows.Count, true, (int)resp.StatusCode, result, null);
            }
            var hint = resp.StatusCode == HttpStatusCode.Conflict ? " (truncation guard: re-run with --force if the smaller snapshot is intended)" : "";
            return new PostOutcome(dataset, rows.Count, false, (int)resp.StatusCode, null, $"HTTP {(int)resp.StatusCode}{hint}: {Truncate(ProblemDetail(text), 300)}");
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException)
        {
            return new PostOutcome(dataset, rows.Count, false, 0, null, e.Message);
        }
    }

    private static string ProblemDetail(string text)
    {
        try
        {
            using var d = JsonDocument.Parse(text);
            if (d.RootElement.TryGetProperty("detail", out var detail) && detail.ValueKind == JsonValueKind.String) return detail.GetString()!;
            if (d.RootElement.TryGetProperty("title", out var title) && title.ValueKind == JsonValueKind.String) return title.GetString()!;
        }
        catch (JsonException) { }
        return text;
    }

    private static string Truncate(string s, int n) => s.Length <= n ? s : s[..n] + "...";

    public void Dispose()
    {
        if (_ownsClient) _http.Dispose();
    }
}
