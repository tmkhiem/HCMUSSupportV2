using System.Net;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Modules.Identity.Groups;
using HCMUSSupportV2.Backend.Tests.Identity;
using HCMUSSupportV2.Backend.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static HCMUSSupportV2.Backend.Tests.Admin.AdminTestSupport;
using static HCMUSSupportV2.Backend.Tests.Infrastructure.IdentityTestSupport;

namespace HCMUSSupportV2.Backend.Tests.Admin;

public class RecordingActivationObserver : IEmployeeActivationObserver
{
    public static readonly List<string> Activated = [];

    public Task OnEmployeesActivatedAsync(IReadOnlyCollection<string> employeeCodes, CancellationToken ct)
    {
        lock (Activated) Activated.AddRange(employeeCodes);
        return Task.CompletedTask;
    }
}

[Collection(PostgresCollection.Name)]
public class EmployeesAdminTests(PostgresFixture database) : IAsyncLifetime
{
    private readonly TestApiFactory _factory = new(database, configureServices: s =>
    {
        TestControllers.Add(s);
        s.AddScoped<IEmployeeActivationObserver, RecordingActivationObserver>();
    });

    public Task InitializeAsync()
    {
        _ = _factory.Server;
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    private static object Status(string status) => new { status };

    [Fact]
    public async Task Deactivating_signs_the_employee_out_audits_and_reactivating_calls_the_observers()
    {
        var admin = await _factory.SignInNewAsync(Roles.Admin);
        var victim = await _factory.SignInNewAsync();
        Assert.Equal(HttpStatusCode.OK, (await victim.GetAsync("/api/test/employee")).StatusCode);

        var off = await admin.SendAsync(HttpMethod.Put, $"/api/admin/employees/{victim.Code}/status", Status("inactive"));
        Assert.Equal(HttpStatusCode.OK, off.StatusCode);
        Assert.Equal("inactive", (await off.ReadAsync()).GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.Unauthorized, (await victim.GetAsync("/api/test/employee")).StatusCode);
        var audit = Assert.Single(await _factory.AuditAsync("employee.status_changed", victim.Code));
        Assert.Equal(admin.Code, audit.ActorCode);
        Assert.DoesNotContain(victim.Code, RecordingActivationObserver.Activated);

        var on = await admin.SendAsync(HttpMethod.Put, $"/api/admin/employees/{victim.Code}/status", Status("active"));
        Assert.Equal(HttpStatusCode.OK, on.StatusCode);
        Assert.Contains(victim.Code, RecordingActivationObserver.Activated);
        Assert.Equal(2, (await _factory.AuditAsync("employee.status_changed", victim.Code)).Count);

        // Setting the same status again changes nothing and does not notify twice.
        var count = RecordingActivationObserver.Activated.Count(c => c == victim.Code);
        await admin.SendAsync(HttpMethod.Put, $"/api/admin/employees/{victim.Code}/status", Status("active"));
        Assert.Equal(count, RecordingActivationObserver.Activated.Count(c => c == victim.Code));
    }

    [Fact]
    public async Task Retired_is_accepted_and_invalid_or_unknown_inputs_are_rejected()
    {
        var admin = await _factory.SignInNewAsync(Roles.Admin);
        var target = await CreateEmployeeAsync(_factory);

        Assert.Equal(HttpStatusCode.OK, (await admin.SendAsync(HttpMethod.Put, $"/api/admin/employees/{target}/status", Status("retired"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.SendAsync(HttpMethod.Put, $"/api/admin/employees/{target}/status", Status("gone"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.SendAsync(HttpMethod.Put, "/api/admin/employees/NOPE/status", Status("inactive"))).StatusCode);
    }

    [Fact]
    public async Task An_admin_cannot_deactivate_themselves_but_can_deactivate_another_admin()
    {
        var admin = await _factory.SignInNewAsync(Roles.Admin);
        var other = await CreateEmployeeAsync(_factory, roles: [Roles.Admin]);

        var self = await admin.SendAsync(HttpMethod.Put, $"/api/admin/employees/{admin.Code}/status", Status("inactive"));
        Assert.Equal(HttpStatusCode.Conflict, self.StatusCode);
        Assert.Empty(await _factory.AuditAsync("employee.status_changed", admin.Code));

        Assert.Equal(HttpStatusCode.OK, (await admin.SendAsync(HttpMethod.Put, $"/api/admin/employees/{other}/status", Status("inactive"))).StatusCode);
    }

    [Fact]
    public async Task Create_adds_a_manual_active_employee_audits_and_rejects_duplicates()
    {
        var admin = await _factory.SignInNewAsync(Roles.Admin);
        var code = "M" + Guid.NewGuid().ToString("N")[..8].ToUpperInvariant();

        var created = await admin.SendAsync(HttpMethod.Post, "/api/admin/employees", new { code, fullName = "Võ Văn Thủ Công" });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var dto = await created.ReadAsync();
        Assert.Equal("manual", dto.GetProperty("source").GetString());
        Assert.Equal("active", dto.GetProperty("status").GetString());

        var stored = await _factory.WithDbAsync(db => db.Set<Employee>().AsNoTracking().SingleAsync(e => e.Code == code));
        Assert.Equal("Võ Văn Thủ Công", stored.FullName);
        Assert.Equal(EmployeeSources.Manual, stored.Source);
        Assert.Single(await _factory.AuditAsync("employee.created", code));

        Assert.Equal(HttpStatusCode.Conflict, (await admin.SendAsync(HttpMethod.Post, "/api/admin/employees", new { code, fullName = "Trùng" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await admin.SendAsync(HttpMethod.Post, "/api/admin/employees", new { code = code.ToLowerInvariant(), fullName = "Trùng" })).StatusCode);
    }

    [Fact]
    public async Task Create_validates_input_and_the_org_unit()
    {
        var admin = await _factory.SignInNewAsync(Roles.Admin);

        Assert.Equal(HttpStatusCode.BadRequest, (await admin.SendAsync(HttpMethod.Post, "/api/admin/employees", new { code = "bad code", fullName = "X" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.SendAsync(HttpMethod.Post, "/api/admin/employees", new { code = "OKCODE1", fullName = "  " })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.SendAsync(HttpMethod.Post, "/api/admin/employees",
            new { code = "OKCODE2", fullName = "X", orgUnitId = 987654321 })).StatusCode);
    }

    [Fact]
    public async Task Employee_admin_endpoints_are_admin_only()
    {
        var editor = await _factory.SignInNewAsync(Roles.Editor);
        var target = await CreateEmployeeAsync(_factory);

        Assert.Equal(HttpStatusCode.Forbidden, (await editor.SendAsync(HttpMethod.Put, $"/api/admin/employees/{target}/status", Status("inactive"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await editor.SendAsync(HttpMethod.Post, "/api/admin/employees", new { code = "ZZ1", fullName = "X" })).StatusCode);
        Assert.Empty(await _factory.AuditAsync("employee.status_changed", target));
    }
}
