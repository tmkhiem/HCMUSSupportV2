using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using HCMUSSupportV2.Backend.Modules.Identity.Authentication;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using HCMUSSupportV2.Backend.Tests.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using static HCMUSSupportV2.Backend.Tests.Infrastructure.IdentityTestSupport;

namespace HCMUSSupportV2.Backend.Tests.Admin;

/// <summary>Test-only endpoints standing in for the future self-service areas that view-as must guard and audit.</summary>
[ApiController]
public class TestSelfServiceController(ICurrentUser user) : ControllerBase
{
    [HttpGet("/api/me/test/whoami"), Authorize(Policy = Policies.Employee)]
    public IActionResult WhoAmI() => Ok(new { user.Code, user.EffectiveCode, user.IsActingAs });

    [HttpPost("/api/me/test/write"), Authorize(Policy = Policies.Employee)]
    public IActionResult Write() => Ok();

    [HttpGet("/api/notifications/test/ping"), Authorize(Policy = Policies.Employee)]
    public IActionResult Ping() => Ok();

    [HttpDelete("/api/test/delete"), Authorize(Policy = Policies.Employee)]
    public IActionResult Delete() => Ok();
}

public static class AdminTestSupport
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public record Session(HttpClient Client, string Token, string Code);

    /// <summary>Creates an employee with the roles, signs in through the test endpoint and, like the SPA, fetches the XSRF token.</summary>
    public static async Task<Session> SignInNewAsync(this TestApiFactory factory, params string[] roles)
    {
        var code = await CreateEmployeeAsync(factory, roles: roles);
        return await factory.SignInAsync(code);
    }

    public static async Task<Session> SignInAsync(this TestApiFactory factory, string code)
    {
        var client = factory.CreateSessionClient();
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsync($"/api/test/sign-in/{code}", null)).StatusCode);
        var token = (await client.GetAsync("/api/auth/me")).XsrfToken();
        Assert.False(string.IsNullOrEmpty(token));
        return new Session(client, token!, code);
    }

    public static Task<HttpResponseMessage> SendAsync(this Session s, HttpMethod method, string url, object? body = null)
    {
        var request = new HttpRequestMessage(method, url).WithXsrf(s.Token);
        if (body is not null) request.Content = JsonContent.Create(body);
        return s.Client.SendAsync(request);
    }

    public static Task<HttpResponseMessage> GetAsync(this Session s, string url) => s.Client.GetAsync(url);

    public static async Task<JsonElement> ReadAsync(this HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.Clone();

    public static async Task<List<AuditLogEntry>> AuditAsync(this TestApiFactory factory, string action, string? targetId = null) =>
        await factory.WithDbAsync(db => db.Set<AuditLogEntry>().AsNoTracking()
            .Where(x => x.Action == action && (targetId == null || x.TargetId == targetId))
            .OrderBy(x => x.Id).ToListAsync());

    /// <summary>The system must always have an admin to be tested against: removes every other admin so a test can reason about "the last admin".</summary>
    public static Task RemoveOtherAdminsAsync(this TestApiFactory factory, string keep) =>
        factory.WithDbAsync(async db =>
            await db.Set<RoleAssignment>().Where(r => r.Role == Roles.Admin && r.EmployeeCode != keep).ExecuteDeleteAsync());
}

/// <summary>A clock tests can move forward.</summary>
public sealed class ManualTimeProvider(DateTimeOffset start) : TimeProvider
{
    private DateTimeOffset _now = start;
    public override DateTimeOffset GetUtcNow() => _now;
    public void Advance(TimeSpan by) => _now += by;
}
