using System.IO.Compression;
using System.Net.Http.Headers;
using System.Text.Json;

namespace HCMUSSupportV2.Sync.Migration;

public interface ILegacyApi
{
    /// <summary>POSTs <paramref name="body"/> to <c>/api/integration/v1/legacy/{path}</c>. Throws <see cref="LegacyApiException"/> on a non-2xx answer.</summary>
    Task<JsonElement> PostAsync(string path, object body, bool dryRun, CancellationToken ct);
}

public sealed class LegacyApiException(int status, string message) : Exception(message)
{
    public int Status { get; } = status;
}

/// <summary>The migration endpoints (ApiKey scope <c>legacy.import</c>), gzip JSON; a dry run unless told otherwise.</summary>
public sealed class LegacyApi : ILegacyApi, IDisposable
{
    private readonly HttpClient _http;
    private readonly bool _owns;

    public LegacyApi(SyncOptions o)
    {
        if (string.IsNullOrWhiteSpace(o.ApiBaseUrl)) throw new InvalidOperationException("Sync:ApiBaseUrl is not configured.");
        if (string.IsNullOrWhiteSpace(o.ApiToken)) throw new InvalidOperationException("Sync:ApiToken is not configured (a client with scope legacy.import).");
        _http = new HttpClient { BaseAddress = new Uri(o.ApiBaseUrl.TrimEnd('/') + "/"), Timeout = TimeSpan.FromSeconds(o.TimeoutSeconds) };
        _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("ApiKey", o.ApiToken);
        _owns = true;
    }

    public LegacyApi(HttpClient http) => _http = http;

    public async Task<JsonElement> PostAsync(string path, object body, bool dryRun, CancellationToken ct)
    {
        using var ms = new MemoryStream();
        await using (var gz = new GZipStream(ms, CompressionLevel.Optimal, leaveOpen: true))
            await JsonSerializer.SerializeAsync(gz, body, IngestClient.Json, ct);
        using var req = new HttpRequestMessage(HttpMethod.Post, $"api/integration/v1/legacy/{path}?dryRun={(dryRun ? "true" : "false")}")
        {
            Content = new ByteArrayContent(ms.ToArray()),
        };
        req.Content.Headers.ContentType = new MediaTypeHeaderValue("application/json");
        req.Content.Headers.ContentEncoding.Add("gzip");

        try
        {
            using var resp = await _http.SendAsync(req, ct);
            var text = await resp.Content.ReadAsStringAsync(ct);
            if (!resp.IsSuccessStatusCode)
                throw new LegacyApiException((int)resp.StatusCode, $"HTTP {(int)resp.StatusCode}: {Truncate(Detail(text), 300)}");
            return JsonDocument.Parse(text).RootElement.Clone();
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException && !ct.IsCancellationRequested)
        {
            throw new LegacyApiException(0, e.Message);
        }
    }

    private static string Detail(string text)
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
        if (_owns) _http.Dispose();
    }
}
