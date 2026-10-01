using System.IO.Compression;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using HCMUSSupportV2.Backend.Modules.Hrm.Domain;
using HCMUSSupportV2.Backend.Modules.Hrm.Integration;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Modules.Identity.Groups;
using HCMUSSupportV2.Backend.Tests.Infrastructure;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace HCMUSSupportV2.Backend.Tests.Hrm;

/// <summary>Records what the ingest tells the audience observers (zero real implementations exist yet).</summary>
public sealed class RecordingObserver : IEmployeeActivationObserver, IRosterSyncObserver
{
    public List<string> Activated { get; } = [];
    public int RosterSyncs { get; private set; }

    public Task OnEmployeesActivatedAsync(IReadOnlyCollection<string> employeeCodes, CancellationToken ct)
    {
        lock (Activated) Activated.AddRange(employeeCodes);
        return Task.CompletedTask;
    }

    public Task OnRosterSyncedAsync(CancellationToken ct)
    {
        RosterSyncs++;
        return Task.CompletedTask;
    }
}

public static class HrmTestSupport
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    /// <summary>Clears every HRM table and run history so a test starts from an empty snapshot state (truncation guard!).</summary>
    public static async Task ResetAsync(TestApiFactory factory) =>
        await factory.WithDbAsync(async db =>
        {
            await db.Database.ExecuteSqlRawAsync("""
                TRUNCATE salary_history, position_history, commendations, academic_degrees, trainings, business_trips, innovations,
                         teaching_loads, research_project_members, research_projects, publication_authors, publications,
                         employee_profiles, employee_sensitive, sync_issues, sync_runs, dataset_imports RESTART IDENTITY CASCADE;
                DELETE FROM employees WHERE code LIKE 'T%' AND source = 'hrm';
                DELETE FROM org_units WHERE hrm_id BETWEEN 9000000 AND 9000999;
                """);
            return 0;
        });

    /// <summary>Creates an API client and returns a client that sends its token.</summary>
    public static async Task<HttpClient> CreateIngestClientAsync(TestApiFactory factory, string[]? scopes = null, bool revoke = false)
    {
        var (client, token) = await factory.WithScopeAsync(async sp =>
            await sp.GetRequiredService<ApiClientService>().CreateAsync("test-" + Guid.NewGuid().ToString("N")[..8], scopes ?? [ApiScopes.HrmIngest]));
        if (revoke) await factory.WithScopeAsync(async sp => await sp.GetRequiredService<ApiClientService>().RevokeAsync(client.Id));
        return ApiClientFor(factory, token);
    }

    public static HttpClient ApiClientFor(TestApiFactory factory, string? token)
    {
        var http = factory.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false });
        if (token is not null) http.DefaultRequestHeaders.TryAddWithoutValidation("Authorization", "ApiKey " + token);
        return http;
    }

    public static async Task<T> WithScopeAsync<T>(this TestApiFactory factory, Func<IServiceProvider, Task<T>> action)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        return await action(scope.ServiceProvider);
    }

    public static HttpContent JsonBody(object rows) => JsonContent.Create(new { rows }, options: Json);

    public static HttpContent GzipBody(object rows)
    {
        var bytes = JsonSerializer.SerializeToUtf8Bytes(new { rows }, Json);
        var ms = new MemoryStream();
        using (var gz = new GZipStream(ms, CompressionLevel.Fastest, leaveOpen: true)) gz.Write(bytes);
        ms.Position = 0;
        var content = new StreamContent(ms);
        content.Headers.ContentType = new("application/json");
        content.Headers.ContentEncoding.Add("gzip");
        return content;
    }

    public static async Task<IngestResultDto> PostOkAsync(this HttpClient http, string dataset, object rows, bool force = false)
    {
        var response = await http.PostAsync($"/api/integration/v1/{dataset}{(force ? "?force=true" : "")}", JsonBody(rows));
        var text = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, $"{dataset}: {(int)response.StatusCode} {text}");
        return JsonSerializer.Deserialize<IngestResultDto>(text, Json)!;
    }

    public static object[] Units(params int[] hrmIds) =>
        hrmIds.Select(id => (object)new { hrmId = 9000000 + id, parentHrmId = (int?)null, kind = "unit", name = $"Đơn vị thử {id}", code = $"U{id}", isActive = true }).ToArray();

    public static object Emp(string code, int hrmId, string name = "Nhân viên thử", int? unit = null, string status = "active") =>
        new { hrmId, code, fullName = $"{name} {code}", orgUnitHrmId = unit is null ? (int?)null : 9000000 + unit, departmentHrmId = (int?)null, positionTitle = "Giảng viên", academicRank = (string?)null, degree = "Tiến sĩ", status };

    /// <summary>Seeds employees through the ingest API; returns the codes.</summary>
    public static async Task SeedEmployeesAsync(HttpClient ingest, params string[] codes)
    {
        await ingest.PostOkAsync("employees", codes.Select(c => Emp(c, NextHrmId())).ToArray());
    }

    private static int _hrmId = 5_000_000;
    public static int NextHrmId() => Interlocked.Increment(ref _hrmId);

    public static Task<List<T>> RowsAsync<T>(TestApiFactory factory) where T : class =>
        factory.WithDbAsync(db => db.Set<T>().AsNoTracking().ToListAsync());
}
