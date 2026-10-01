using System.Collections.Concurrent;
using System.Text;
using System.Text.Json;
using System.Threading.Channels;
using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Modules.Notifications.Inbox;
using HCMUSSupportV2.Backend.Modules.Notifications.Publishing;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Npgsql;
using NpgsqlTypes;

namespace HCMUSSupportV2.Backend.Modules.Notifications.Realtime;

/// <summary>One server-sent event: <c>event: {Event}</c> with a JSON <c>data</c> line.</summary>
public sealed record SseMessage(string Event, string Data);

/// <summary>In-memory registry of the SSE clients connected to this process, keyed by employee code.</summary>
public sealed class SseHub
{
    private readonly ConcurrentDictionary<string, ConcurrentDictionary<Guid, Channel<SseMessage>>> _clients = new(StringComparer.Ordinal);

    public sealed class Subscription(SseHub hub, string code, Guid id, Channel<SseMessage> channel) : IDisposable
    {
        public ChannelReader<SseMessage> Reader => channel.Reader;
        public void Dispose() => hub.Remove(code, id);
    }

    public Subscription Subscribe(string code)
    {
        // Bounded: a stalled client drops its oldest events; the client resyncs from the next unread-count event.
        var channel = Channel.CreateBounded<SseMessage>(new BoundedChannelOptions(64)
        {
            FullMode = BoundedChannelFullMode.DropOldest,
            SingleReader = true,
        });
        var id = Guid.NewGuid();
        _clients.GetOrAdd(code, _ => new()).TryAdd(id, channel);
        return new Subscription(this, code, id, channel);
    }

    private void Remove(string code, Guid id)
    {
        if (!_clients.TryGetValue(code, out var set)) return;
        set.TryRemove(id, out _);
        if (set.IsEmpty) _clients.TryRemove(new KeyValuePair<string, ConcurrentDictionary<Guid, Channel<SseMessage>>>(code, set));
    }

    public IReadOnlyCollection<string> ConnectedCodes => _clients.Keys.ToArray();

    public int ConnectionCount => _clients.Values.Sum(s => s.Count);

    public void Publish(string code, SseMessage message)
    {
        if (!_clients.TryGetValue(code, out var set)) return;
        foreach (var channel in set.Values) channel.Writer.TryWrite(message);
    }
}

/// <summary>
/// Holds one dedicated connection per process that runs <c>LISTEN notifications</c> and turns the messages into SSE
/// events for the employees connected to this instance. Reconnects with a short delay; after a reconnect it refreshes the
/// unread count of every connected client, because messages sent meanwhile are lost.
/// </summary>
public sealed class NotificationListener(
    SseHub hub,
    IConfiguration configuration,
    IServiceScopeFactory scopes,
    IOptionsMonitor<NotificationOptions> options,
    ILogger<NotificationListener> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Yield();
        if (!options.CurrentValue.Listener.Enabled) return;

        var first = true;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ListenAsync(refreshAll: !first, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Notification listener lost its connection; retrying");
            }
            first = false;
            try { await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken); } catch (OperationCanceledException) { break; }
        }
    }

    private async Task ListenAsync(bool refreshAll, CancellationToken ct)
    {
        var cs = new NpgsqlConnectionStringBuilder(configuration.GetConnectionString("Default"))
        {
            Pooling = false,           // a dedicated connection, never returned to the pool
            KeepAlive = 30,
            Enlist = false,
        }.ConnectionString;

        await using var conn = new NpgsqlConnection(cs);
        await conn.OpenAsync(ct);

        var inbox = Channel.CreateUnbounded<string>();
        conn.Notification += (_, e) => inbox.Writer.TryWrite(e.Payload);
        await using (var listen = new NpgsqlCommand($"LISTEN {NotifyChannel.Name}", conn)) await listen.ExecuteNonQueryAsync(ct);
        logger.LogInformation("Listening on PostgreSQL channel {Channel}", NotifyChannel.Name);

        using var pump = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var consumer = Task.Run(async () =>
        {
            if (refreshAll) await DispatchAsync(NotifyChannel.UnreadChanged, null, null, hub.ConnectedCodes, pump.Token);
            await foreach (var payload in inbox.Reader.ReadAllAsync(pump.Token))
            {
                try { await HandleAsync(payload, pump.Token); }
                catch (OperationCanceledException) when (pump.IsCancellationRequested) { throw; }
                catch (Exception ex) { logger.LogWarning(ex, "Could not dispatch a notification payload"); }
            }
        }, pump.Token);

        try
        {
            while (!ct.IsCancellationRequested)
            {
                await conn.WaitAsync(ct); // raises Notification for every message
                if (consumer.IsFaulted) await consumer;
            }
        }
        finally
        {
            await pump.CancelAsync();
            try { await consumer; } catch (OperationCanceledException) { }
        }
    }

    private async Task HandleAsync(string payload, CancellationToken ct)
    {
        using var doc = JsonDocument.Parse(payload);
        var root = doc.RootElement;
        var type = root.GetProperty("t").GetString() ?? "";
        Guid? id = root.TryGetProperty("id", out var idEl) && idEl.TryGetGuid(out var g) ? g : null;
        var title = root.TryGetProperty("title", out var tEl) ? tEl.GetString() : null;
        var connected = hub.ConnectedCodes.ToHashSet(StringComparer.Ordinal);
        var codes = root.GetProperty("codes").EnumerateArray().Select(c => c.GetString()!).Where(connected.Contains).ToList();
        if (codes.Count > 0) await DispatchAsync(type, id, title, codes, ct);
    }

    private async Task DispatchAsync(string type, Guid? id, string? title, IReadOnlyCollection<string> codes, CancellationToken ct)
    {
        if (codes.Count == 0) return;
        var counts = await UnreadCountsAsync(codes, ct);
        foreach (var (code, count) in counts)
        {
            if (type == NotifyChannel.Delivered && id is not null)
                hub.Publish(code, new SseMessage("notification", JsonSerializer.Serialize(new { id, title })));
            hub.Publish(code, new SseMessage("unread-count", JsonSerializer.Serialize(new { count })));
        }
    }

    private async Task<List<(string Code, int Count)>> UnreadCountsAsync(IReadOnlyCollection<string> codes, CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var result = new List<(string, int)>();
        await db.Database.OpenConnectionAsync(ct);
        try
        {
            await using var cmd = new NpgsqlCommand("""
                SELECT c.code, (SELECT count(*) FROM notification_deliveries d JOIN notifications n ON n.id = d.notification_id
                                WHERE d.employee_code = c.code AND d.read_at IS NULL AND n.status = 'published'
                                  AND (n.expires_at IS NULL OR n.expires_at > now()))::int
                FROM unnest(@codes) AS c(code)
                """, (NpgsqlConnection)db.Database.GetDbConnection());
            cmd.Parameters.Add(new NpgsqlParameter("codes", NpgsqlDbType.Array | NpgsqlDbType.Text) { Value = codes.ToArray() });
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct)) result.Add((r.GetString(0), r.GetInt32(1)));
        }
        finally { await db.Database.CloseConnectionAsync(); }
        return result;
    }
}

/// <summary>
/// Server-sent events for the signed-in employee (the effective employee while viewing as). Events:
/// <c>unread-count</c> <c>{"count":n}</c> (sent on connect and whenever it changes) and <c>notification</c>
/// <c>{"id","title"}</c> (a new delivery). A comment line <c>: heartbeat</c> is sent every 25 s.
/// </summary>
[ApiController]
[Authorize(Policy = Policies.Employee)]
[Route("api/notifications/stream")]
[ApiExplorerSettings(IgnoreApi = true)]
public class NotificationStreamController(
    SseHub hub, InboxService inbox, ICurrentUser user, IOptionsMonitor<NotificationOptions> options) : ControllerBase
{
    [HttpGet]
    public async Task Stream(CancellationToken ct)
    {
        var code = user.RequireEffectiveCode();
        Response.Headers.ContentType = "text/event-stream";
        Response.Headers.CacheControl = "no-cache, no-store";
        Response.Headers["X-Accel-Buffering"] = "no"; // nginx: do not buffer
        Response.Headers.ContentEncoding = "identity"; // keep response compression away from the stream
        HttpContext.Features.Get<IHttpResponseBodyFeature>()?.DisableBuffering();

        using var subscription = hub.Subscribe(code);
        var heartbeat = TimeSpan.FromSeconds(Math.Max(0.05, options.CurrentValue.Sse.HeartbeatSeconds));
        try
        {
            await WriteRawAsync("retry: 5000\n\n", ct);
            var initial = await inbox.UnreadCountAsync(code, ct);
            await WriteAsync(new SseMessage("unread-count", JsonSerializer.Serialize(new { count = initial.Count })), ct);

            while (!ct.IsCancellationRequested)
            {
                using var wait = CancellationTokenSource.CreateLinkedTokenSource(ct);
                wait.CancelAfter(heartbeat);
                try
                {
                    if (!await subscription.Reader.WaitToReadAsync(wait.Token)) break;
                    while (subscription.Reader.TryRead(out var message)) await WriteAsync(message, ct);
                }
                catch (OperationCanceledException) when (!ct.IsCancellationRequested)
                {
                    await WriteRawAsync(": heartbeat\n\n", ct);
                }
            }
        }
        catch (OperationCanceledException) { /* client went away */ }
        catch (IOException) { }
    }

    private Task WriteAsync(SseMessage message, CancellationToken ct) =>
        WriteRawAsync($"event: {message.Event}\ndata: {message.Data}\n\n", ct);

    private async Task WriteRawAsync(string text, CancellationToken ct)
    {
        await Response.Body.WriteAsync(Encoding.UTF8.GetBytes(text), ct);
        await Response.Body.FlushAsync(ct);
    }
}
