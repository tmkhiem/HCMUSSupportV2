using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Nodes;
using ClosedXML.Excel;
using HCMUSSupportV2.Backend.Modules.Identity.Authentication;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Modules.Identity.Groups;
using HCMUSSupportV2.Backend.Tests.Identity;
using HCMUSSupportV2.Backend.Tests.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using static HCMUSSupportV2.Backend.Tests.Infrastructure.IdentityTestSupport;

namespace HCMUSSupportV2.Backend.Tests.Notifications;

/// <summary>Test-only endpoint that signs in as an editor/employee who is viewing as someone else (view-as claim).</summary>
[ApiController]
[Route("api/test")]
public class TestActingAsController : ControllerBase
{
    [HttpPost("sign-in-as/{code}/{actingAs}"), AllowAnonymous]
    public async Task<IActionResult> SignInAs(string code, string actingAs, [FromServices] PrincipalFactory principals)
    {
        var principal = await principals.CreateAsync(code);
        if (principal is null) return NotFound();
        // D14a: view-as needs an unexpired acting_as_until or the cookie revalidator drops it.
        principal = PrincipalFactory.WithActingAs(principal, actingAs, DateTimeOffset.UtcNow.AddHours(1));
        await HttpContext.SignInAsync(AuthSchemes.Cookie, principal);
        return NoContent();
    }
}

/// <summary>A signed-in HTTP client that adds the antiforgery header to unsafe requests.</summary>
public sealed class Api(HttpClient client, string token, string code)
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public HttpClient Client => client;
    public string Code => code;

    public async Task<HttpResponseMessage> SendAsync(HttpMethod method, string url, object? body = null, HttpContent? content = null)
    {
        var request = new HttpRequestMessage(method, url).WithXsrf(token);
        if (content is not null) request.Content = content;
        else if (body is not null) request.Content = JsonContent.Create(body, options: Json);
        return await client.SendAsync(request);
    }

    public Task<HttpResponseMessage> GetAsync(string url) => SendAsync(HttpMethod.Get, url);
    public Task<HttpResponseMessage> PostAsync(string url, object? body = null) => SendAsync(HttpMethod.Post, url, body);
    public Task<HttpResponseMessage> PutAsync(string url, object? body) => SendAsync(HttpMethod.Put, url, body);
    public Task<HttpResponseMessage> DeleteAsync(string url) => SendAsync(HttpMethod.Delete, url);

    /// <summary>Sends the request, asserts the status and returns the parsed JSON body.</summary>
    public async Task<JsonNode> ExpectAsync(HttpStatusCode status, HttpMethod method, string url, object? body = null)
    {
        var response = await SendAsync(method, url, body);
        var text = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == status, $"{method} {url}: expected {(int)status}, got {(int)response.StatusCode}: {text}");
        return string.IsNullOrEmpty(text) ? new JsonObject() : JsonNode.Parse(text)!;
    }

    public async Task<HttpResponseMessage> UploadAsync(string url, string fileName, byte[] bytes, string contentType = "application/octet-stream")
    {
        var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        form.Add(file, "file", fileName);
        return await SendAsync(HttpMethod.Post, url, content: form);
    }
}

public sealed class NotificationsHost : IAsyncDisposable
{
    public TestApiFactory Factory { get; }

    public NotificationsHost(PostgresFixture database, Dictionary<string, string?>? settings = null)
    {
        var all = new Dictionary<string, string?>
        {
            ["Jobs:Enabled"] = "true",
            ["Notifications:Scheduler:PollSeconds"] = "0.2",
        };
        foreach (var (k, v) in settings ?? []) all[k] = v;
        Factory = new TestApiFactory(database, all, TestControllers.Add);
        _ = Factory.Server; // start the host (job worker, sweeper)
    }

    public Task<string> EmployeeAsync(string status = EmployeeStatuses.Active, string[]? emails = null, string[]? roles = null, string? fullName = null) =>
        CreateEmployeeAsync(Factory, status, emails, roles, fullName);

    public Task<string> EditorAsync() => EmployeeAsync(roles: ["editor"]);

    public async Task<Api> SignInAsync(string code, bool actingAs = false, string? viewing = null)
    {
        var client = Factory.CreateSessionClient();
        var url = viewing is null ? $"/api/test/sign-in/{code}" : $"/api/test/sign-in-as/{code}/{viewing}";
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsync(url, null)).StatusCode);
        var token = (await client.GetAsync("/api/auth/me")).XsrfToken();
        Assert.False(string.IsNullOrEmpty(token));
        return new Api(client, token!, code);
    }

    public async Task<Api> EditorApiAsync() => await SignInAsync(await EditorAsync());

    public async Task<long> CreateGroupAsync(params string[] members)
    {
        return await Factory.WithDbAsync(async db =>
        {
            var group = new Group { Name = "Nhóm " + Guid.NewGuid().ToString("N")[..8], Kind = GroupKinds.Static };
            db.Set<Group>().Add(group);
            await db.SaveChangesAsync();
            foreach (var m in members) db.Set<GroupMember>().Add(new GroupMember { GroupId = group.Id, EmployeeCode = m });
            await db.SaveChangesAsync();
            return group.Id;
        });
    }

    public Task<int> ScalarAsync(string sql, params object[] args) =>
        Factory.WithDbAsync(db => db.Database.SqlQueryRaw<int>(sql, args).SingleAsync());

    public async Task<HashSet<string>> RecipientsAsync(string notificationId) =>
        (await Factory.WithDbAsync(db => db.Database
            .SqlQueryRaw<string>("SELECT employee_code AS \"Value\" FROM notification_deliveries WHERE notification_id = {0}::uuid", notificationId)
            .ToListAsync())).ToHashSet();

    /// <summary>Waits until no publish job is pending for the notification (fan-out finished).</summary>
    public async Task WaitForFanOutAsync(string notificationId)
    {
        Assert.True(await Wait.UntilAsync(async () =>
            await ScalarAsync("SELECT count(*)::int AS \"Value\" FROM jobs WHERE type = 'notifications.publish' AND done_at IS NULL AND payload ->> 'notificationId' = {0}", notificationId) == 0
            && await ScalarAsync("SELECT count(*)::int AS \"Value\" FROM notifications WHERE id = {0}::uuid AND status = 'published'", notificationId) == 1),
            "fan-out did not finish in time");
    }

    public async Task WaitForBackfillAsync()
    {
        Assert.True(await Wait.UntilAsync(async () =>
            await ScalarAsync("SELECT count(*)::int AS \"Value\" FROM jobs WHERE type = 'notifications.backfill' AND done_at IS NULL") == 0),
            "backfill did not finish in time");
    }

    public static object Draft(string title = "Thông báo thử", string body = "Nội dung", object? variables = null, bool all = false,
        long[]? groups = null, string[]? employees = null, long[]? tags = null, int? version = null,
        long? seriesId = null, DateTimeOffset? expiresAt = null, DateTimeOffset? pinnedUntil = null, string? summary = null) => new
    {
        version, title, bodyMd = body, summary, variables = variables ?? Array.Empty<object>(), audienceAll = all,
        groupIds = groups ?? [], employeeCodes = employees ?? [], tagIds = tags ?? [], seriesId, expiresAt, pinnedUntil,
    };

    public static async Task<string> CreateAsync(Api editor, object draft) =>
        (await editor.ExpectAsync(HttpStatusCode.Created, HttpMethod.Post, "/api/manage/notifications", draft))["id"]!.GetValue<string>();

    /// <summary>Creates, publishes and waits for the fan-out. Returns the notification id.</summary>
    public async Task<string> PublishAsync(Api editor, object draft)
    {
        var id = await CreateAsync(editor, draft);
        await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Post, $"/api/manage/notifications/{id}/publish");
        await WaitForFanOutAsync(id);
        return id;
    }

    public static byte[] Xlsx(string[] headers, params string?[][] rows)
    {
        using var wb = new XLWorkbook();
        var ws = wb.AddWorksheet("Sheet1");
        for (var c = 0; c < headers.Length; c++) ws.Cell(1, c + 1).Value = headers[c];
        for (var r = 0; r < rows.Length; r++)
            for (var c = 0; c < rows[r].Length; c++)
                if (rows[r][c] is { } v) ws.Cell(r + 2, c + 1).Value = v;
        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    public ValueTask DisposeAsync() => Factory.DisposeAsync().AsTask() is var t ? new ValueTask(t) : default;
}
