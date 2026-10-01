using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Modules.Identity.Groups;
using HCMUSSupportV2.Backend.Tests.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using static HCMUSSupportV2.Backend.Tests.Infrastructure.IdentityTestSupport;

namespace HCMUSSupportV2.Backend.Tests.Identity;

/// <summary>Singleton that records what <see cref="RecordingObserver"/> was told.</summary>
public sealed class ObserverLog
{
    public ConcurrentQueue<(long GroupId, string[] Codes)> Calls { get; } = new();

    public string[] AddedFor(long groupId) =>
        Calls.Where(c => c.GroupId == groupId).SelectMany(c => c.Codes).Order(StringComparer.Ordinal).ToArray();

    public int CallsFor(long groupId) => Calls.Count(c => c.GroupId == groupId);
}

public sealed class RecordingObserver(ObserverLog log) : IGroupMembershipObserver
{
    public Task OnMembersAddedAsync(long groupId, IReadOnlyCollection<string> employeeCodes, CancellationToken ct)
    {
        log.Calls.Enqueue((groupId, employeeCodes.ToArray()));
        return Task.CompletedTask;
    }
}

/// <summary>A signed-in session with the XSRF header handled, plus JSON helpers.</summary>
public sealed class ApiSession(HttpClient client, string token, string code)
{
    public HttpClient Client { get; } = client;
    public string Code { get; } = code;

    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public Task<HttpResponseMessage> SendAsync(HttpMethod method, string url, object? body = null)
    {
        var request = new HttpRequestMessage(method, url).WithXsrf(token);
        if (body is not null) request.Content = JsonContent.Create(body, options: Json);
        return Client.SendAsync(request);
    }

    public Task<HttpResponseMessage> GetAsync(string url) => SendAsync(HttpMethod.Get, url);
    public Task<HttpResponseMessage> PostAsync(string url, object? body = null) => SendAsync(HttpMethod.Post, url, body);
    public Task<HttpResponseMessage> PutAsync(string url, object? body = null) => SendAsync(HttpMethod.Put, url, body);
    public Task<HttpResponseMessage> DeleteAsync(string url, object? body = null) => SendAsync(HttpMethod.Delete, url, body);

    public async Task<HttpResponseMessage> PostFileAsync(string url, string fileName, byte[] content)
    {
        var form = new MultipartFormDataContent { { new ByteArrayContent(content), "file", fileName } };
        var request = new HttpRequestMessage(HttpMethod.Post, url) { Content = form }.WithXsrf(token);
        return await Client.SendAsync(request);
    }

    public static async Task<T> ReadAsync<T>(HttpResponseMessage response, HttpStatusCode expected = HttpStatusCode.OK)
    {
        var text = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == expected, $"Expected {expected} but got {(int)response.StatusCode}: {text}");
        return JsonSerializer.Deserialize<T>(text, Json)!;
    }
}

/// <summary>Builds a factory with a recording observer and seeds synthetic org units and employees.</summary>
public sealed class GroupsTestHost : IAsyncDisposable
{
    private static int _hrmId = 100_000;

    public ObserverLog Log { get; } = new();
    public TestApiFactory Factory { get; }

    public GroupsTestHost(PostgresFixture database)
    {
        Factory = new TestApiFactory(database, configureServices: services =>
        {
            TestControllers.Add(services);
            services.AddSingleton(Log);
            services.AddScoped<IGroupMembershipObserver, RecordingObserver>();
        });
        _ = Factory.Server;
    }

    public ValueTask DisposeAsync() => Factory.DisposeAsync();

    public static string Unique(string prefix) => prefix + Guid.NewGuid().ToString("N")[..8];

    public async Task<ApiSession> SignInAsync(params string[] roles)
    {
        var code = await CreateEmployeeAsync(Factory, roles: roles);
        var client = Factory.CreateSessionClient();
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsync($"/api/test/sign-in/{code}", null)).StatusCode);
        var token = (await client.GetAsync("/api/auth/me")).XsrfToken();
        Assert.False(string.IsNullOrEmpty(token));
        return new ApiSession(client, token!, code);
    }

    public Task<ApiSession> EditorAsync() => SignInAsync(Roles.Editor);

    public async Task<long> UnitAsync(string? name = null, long? parentId = null, bool active = true, string kind = OrgUnitKinds.Unit)
    {
        return await Factory.WithDbAsync(async db =>
        {
            var unit = new OrgUnit
            {
                HrmId = Interlocked.Increment(ref _hrmId), ParentId = parentId, Kind = kind,
                Name = name ?? Unique("Đơn vị "), IsActive = active,
            };
            db.Set<OrgUnit>().Add(unit);
            await db.SaveChangesAsync();
            return unit.Id;
        });
    }

    public async Task<string> EmployeeAsync(long? unit = null, long? department = null, string? title = null, string? rank = null,
        string? degree = null, string status = EmployeeStatuses.Active, bool email = true, string? name = null)
    {
        var code = "G" + Guid.NewGuid().ToString("N")[..9].ToUpperInvariant();
        await Factory.WithDbAsync(async db =>
        {
            db.Set<Employee>().Add(new Employee
            {
                Code = code, FullName = name ?? $"Nhân viên {code}", OrgUnitId = unit, DepartmentId = department,
                PositionTitle = title, AcademicRank = rank, Degree = degree, Status = status,
            });
            await db.SaveChangesAsync();
            if (email) db.Set<EmployeeEmail>().Add(new EmployeeEmail { Email = DefaultEmail(code), EmployeeCode = code, IsPrimary = true });
            await db.SaveChangesAsync();
            return 0;
        });
        return code;
    }

    public Task<T> InScopeAsync<T>(Func<IServiceProvider, Task<T>> action) => Factory.WithScopeAsync(action);
}

public static class FactoryScopeExtensions
{
    public static async Task<T> WithScopeAsync<T>(this TestApiFactory factory, Func<IServiceProvider, Task<T>> action)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        return await action(scope.ServiceProvider);
    }
}
