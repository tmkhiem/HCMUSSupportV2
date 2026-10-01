using System.Net;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Modules.Identity.Groups;
using HCMUSSupportV2.Backend.Modules.Identity.Seed;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using HCMUSSupportV2.Backend.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using static HCMUSSupportV2.Backend.Tests.Infrastructure.IdentityTestSupport;

namespace HCMUSSupportV2.Backend.Tests.Identity;

/// <summary>Schema constraints, admin bootstrap, the last-admin guard and the Development roster.</summary>
[Collection(PostgresCollection.Name)]
public class IdentityDataTests(PostgresFixture database) : IAsyncLifetime
{
    private readonly TestApiFactory _factory = new(database);

    public Task InitializeAsync()
    {
        _ = _factory.Server;
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    private async Task<T> InScopeAsync<T>(TestApiFactory factory, Func<IServiceProvider, Task<T>> action)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        return await action(scope.ServiceProvider);
    }

    // ---- schema ----

    [Fact]
    public async Task Full_name_unaccent_is_a_generated_column()
    {
        var code = await CreateEmployeeAsync(_factory, fullName: "Nguyễn Thị Đào Tạo");

        var stored = await _factory.WithDbAsync(db => db.Set<Employee>().AsNoTracking().SingleAsync(e => e.Code == code));

        Assert.Equal("Nguyen Thi Dao Tao", stored.FullNameUnaccent);
    }

    [Fact]
    public async Task Full_name_unaccent_has_a_trigram_gin_index_that_serves_fuzzy_search()
    {
        var code = await CreateEmployeeAsync(_factory, fullName: "Lê Quỳnh Giang");

        var (indexDef, hits) = await _factory.WithDbAsync(async db =>
        {
            var def = await db.Database.SqlQueryRaw<string>(
                "SELECT indexdef AS \"Value\" FROM pg_indexes WHERE indexname = 'ix_employees_full_name_unaccent_trgm'").SingleAsync();
            var found = await db.Database.SqlQuery<string>(
                $"SELECT code AS \"Value\" FROM employees WHERE full_name_unaccent ILIKE '%quynh gia%' AND code = {code}").ToListAsync();
            return (def, found);
        });

        Assert.Contains("USING gin", indexDef);
        Assert.Contains("gin_trgm_ops", indexDef);
        Assert.Equal([code], hits);
    }

    [Fact]
    public async Task Email_is_unique_case_insensitively()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        await CreateEmployeeAsync(_factory, emails: [$"dup.{suffix}@hcmus.edu.vn"]);
        var other = await CreateEmployeeAsync(_factory);

        var ex = await Assert.ThrowsAsync<DbUpdateException>(() => _factory.WithDbAsync(async db =>
        {
            db.Set<EmployeeEmail>().Add(new EmployeeEmail { Email = $"DUP.{suffix}@HCMUS.edu.vn", EmployeeCode = other });
            await db.SaveChangesAsync();
            return 0;
        }));
        Assert.Equal("23505", ((PostgresException)ex.InnerException!).SqlState);
    }

    [Fact]
    public async Task Role_assignment_rejects_roles_other_than_editor_and_admin()
    {
        var code = await CreateEmployeeAsync(_factory);

        var ex = await Assert.ThrowsAsync<DbUpdateException>(() => _factory.WithDbAsync(async db =>
        {
            db.Set<RoleAssignment>().Add(new RoleAssignment { EmployeeCode = code, Role = "employee" });
            await db.SaveChangesAsync();
            return 0;
        }));
        Assert.Equal("23514", ((PostgresException)ex.InnerException!).SqlState);
    }

    [Fact]
    public async Task Employee_status_and_org_unit_kind_are_constrained()
    {
        var ex = await Assert.ThrowsAsync<DbUpdateException>(() => CreateEmployeeAsync(_factory, status: "banned"));
        Assert.Equal("23514", ((PostgresException)ex.InnerException!).SqlState);

        var ex2 = await Assert.ThrowsAsync<DbUpdateException>(() => _factory.WithDbAsync(async db =>
        {
            db.Set<OrgUnit>().Add(new OrgUnit { HrmId = Random.Shared.Next(1000, int.MaxValue), Kind = "team", Name = "x" });
            await db.SaveChangesAsync();
            return 0;
        }));
        Assert.Equal("23514", ((PostgresException)ex2.InnerException!).SqlState);
    }

    [Fact]
    public async Task Groups_and_members_round_trip_and_cascade_with_the_employee()
    {
        var code = await CreateEmployeeAsync(_factory);
        long groupId = 0;
        await _factory.WithDbAsync(async db =>
        {
            var group = new Group { Name = $"Nhóm {Guid.NewGuid():N}", Kind = GroupKinds.Static, Rule = "{\"status\":\"active\"}" };
            db.Set<Group>().Add(group);
            await db.SaveChangesAsync();
            groupId = group.Id;
            db.Set<GroupMember>().Add(new GroupMember { GroupId = group.Id, EmployeeCode = code });
            await db.SaveChangesAsync();
            return 0;
        });

        var members = await _factory.WithDbAsync(async db =>
        {
            await db.Set<Employee>().Where(e => e.Code == code).ExecuteDeleteAsync();
            return await db.Set<GroupMember>().CountAsync(m => m.GroupId == groupId);
        });

        Assert.Equal(0, members);
    }

    // ---- bootstrap ----

    [Fact]
    public async Task Bootstrap_grants_admin_to_configured_emails_when_there_is_no_admin()
    {
        var email = $"boot-{Guid.NewGuid():N}@Test.HCMUS.local";
        await using var factory = new TestApiFactory(database, new() { ["Admin:BootstrapEmails:0"] = email, ["Admin:BootstrapEmails:1"] = "nobody@test.hcmus.local" });
        _ = factory.Server;
        await GoogleSignInTests.ClearAdminsAsync(factory);
        var code = await CreateEmployeeAsync(factory, emails: [email.ToLowerInvariant()]);

        var granted = await InScopeAsync(factory, sp => sp.GetRequiredService<AdminBootstrapper>().RunAsync());

        Assert.Equal([code], granted);
        var roles = await factory.WithDbAsync(db => db.Set<RoleAssignment>().Where(r => r.EmployeeCode == code).Select(r => r.Role).ToListAsync());
        Assert.Equal(["admin"], roles);
        var audit = await factory.WithDbAsync(db => db.Set<AuditLogEntry>().AsNoTracking().SingleAsync(a => a.Action == "roles.bootstrap_admin" && a.TargetId == code));
        Assert.Null(audit.ActorCode);
    }

    [Fact]
    public async Task Bootstrap_does_nothing_when_an_admin_already_exists()
    {
        var email = $"boot-{Guid.NewGuid():N}@test.hcmus.local";
        await using var factory = new TestApiFactory(database, new() { ["Admin:BootstrapEmails:0"] = email });
        _ = factory.Server;
        await GoogleSignInTests.ClearAdminsAsync(factory);
        await CreateEmployeeAsync(factory, roles: [Roles.Admin]);
        var candidate = await CreateEmployeeAsync(factory, emails: [email]);

        var granted = await InScopeAsync(factory, sp => sp.GetRequiredService<AdminBootstrapper>().RunAsync());

        Assert.Empty(granted);
        Assert.False(await factory.WithDbAsync(db => db.Set<RoleAssignment>().AnyAsync(r => r.EmployeeCode == candidate)));
    }

    [Fact]
    public async Task Bootstrap_ignores_emails_that_do_not_map_to_an_active_employee()
    {
        var unknown = $"ghost-{Guid.NewGuid():N}@test.hcmus.local";
        var inactiveEmail = $"gone-{Guid.NewGuid():N}@test.hcmus.local";
        await using var factory = new TestApiFactory(database, new() { ["Admin:BootstrapEmails:0"] = unknown, ["Admin:BootstrapEmails:1"] = inactiveEmail });
        _ = factory.Server;
        await GoogleSignInTests.ClearAdminsAsync(factory);
        var inactive = await CreateEmployeeAsync(factory, status: EmployeeStatuses.Inactive, emails: [inactiveEmail]);

        var granted = await InScopeAsync(factory, sp => sp.GetRequiredService<AdminBootstrapper>().RunAsync());

        Assert.Empty(granted);
        Assert.False(await factory.WithDbAsync(db => db.Set<RoleAssignment>().AnyAsync(r => r.EmployeeCode == inactive)));
    }

    [Fact]
    public async Task Bootstrap_runs_when_the_host_starts()
    {
        var email = $"boot-{Guid.NewGuid():N}@test.hcmus.local";
        string code;
        await using (var setup = new TestApiFactory(database))
        {
            _ = setup.Server;
            await GoogleSignInTests.ClearAdminsAsync(setup);
            code = await CreateEmployeeAsync(setup, emails: [email]);
        }

        await using var factory = new TestApiFactory(database, new() { ["Admin:BootstrapEmails:0"] = email });
        _ = factory.Server; // starting the host runs IdentityStartupService

        var granted = await Wait.UntilAsync(() => factory.WithDbAsync(db => db.Set<RoleAssignment>().AnyAsync(r => r.EmployeeCode == code && r.Role == Roles.Admin)));
        Assert.True(granted);
    }

    // ---- last admin ----

    [Fact]
    public async Task Last_admin_guard_blocks_removing_the_only_active_admin()
    {
        await GoogleSignInTests.ClearAdminsAsync(_factory);
        var only = await CreateEmployeeAsync(_factory, roles: [Roles.Admin]);
        // An inactive admin does not count as an admin who can take over.
        await CreateEmployeeAsync(_factory, status: EmployeeStatuses.Inactive, roles: [Roles.Admin]);

        await InScopeAsync(_factory, async sp =>
        {
            var guard = sp.GetRequiredService<LastAdminGuard>();
            Assert.True(await guard.IsLastAdminAsync(only));
            await Assert.ThrowsAsync<LastAdminException>(() => guard.EnsureNotLastAdminAsync(only));
            return 0;
        });
    }

    [Fact]
    public async Task Last_admin_guard_allows_removal_when_another_active_admin_exists_or_for_non_admins()
    {
        await GoogleSignInTests.ClearAdminsAsync(_factory);
        var first = await CreateEmployeeAsync(_factory, roles: [Roles.Admin]);
        var second = await CreateEmployeeAsync(_factory, roles: [Roles.Admin]);
        var editor = await CreateEmployeeAsync(_factory, roles: [Roles.Editor]);

        await InScopeAsync(_factory, async sp =>
        {
            var guard = sp.GetRequiredService<LastAdminGuard>();
            Assert.False(await guard.IsLastAdminAsync(first));
            await guard.EnsureNotLastAdminAsync(second);
            await guard.EnsureNotLastAdminAsync(editor);
            Assert.True(await guard.HasActiveAdminAsync());
            return 0;
        });
    }

    // ---- Development roster ----

    [Fact]
    public async Task Dev_seeder_creates_the_synthetic_roster_idempotently()
    {
        await CleanDevRosterAsync();
        try
        {
            for (var i = 0; i < 2; i++)
                await InScopeAsync(_factory, async sp => { await sp.GetRequiredService<DevDataSeeder>().SeedAsync(); return 0; });

            await _factory.WithDbAsync(async db =>
            {
                var employees = await db.Set<Employee>().Where(e => e.Code.StartsWith("T00")).OrderBy(e => e.Code).ToListAsync();
                Assert.Equal(10, employees.Count);
                Assert.Equal("T0001", employees[0].Code);
                Assert.Equal("T0010", employees[9].Code);
                Assert.All(employees, e => Assert.True(e.IsActive));
                Assert.Equal(10, await db.Set<EmployeeEmail>().CountAsync(m => m.Email.EndsWith("@dev.hcmus.local")));
                Assert.Equal("t0001@dev.hcmus.local", (await db.Set<EmployeeEmail>().SingleAsync(m => m.EmployeeCode == "T0001")).Email);
                Assert.Equal(["admin"], await db.Set<RoleAssignment>().Where(r => r.EmployeeCode == "T0001").Select(r => r.Role).ToListAsync());
                Assert.Equal(["editor"], await db.Set<RoleAssignment>().Where(r => r.EmployeeCode == "T0002").Select(r => r.Role).ToListAsync());
                Assert.False(await db.Set<RoleAssignment>().AnyAsync(r => r.EmployeeCode == "T0003"));
                return 0;
            });
        }
        finally
        {
            await CleanDevRosterAsync();
        }
    }

    [Fact]
    public async Task Development_host_seeds_the_roster_at_startup_and_dev_login_works_for_it()
    {
        await CleanDevRosterAsync();
        try
        {
            await using var factory = new TestApiFactory(database,
                new() { ["Auth:DevLogin:Enabled"] = "true", ["Dev:SeedEmployees"] = "true" }, environment: "Development");
            var client = factory.CreateSessionClient();

            Assert.True(await Wait.UntilAsync(() => factory.WithDbAsync(db => db.Set<Employee>().AnyAsync(e => e.Code == "T0010"))));
            var login = await client.DevLoginAsync("T0002");

            Assert.Equal(HttpStatusCode.OK, login.StatusCode);
            Assert.Contains("\"editor\"", await login.Content.ReadAsStringAsync());
        }
        finally
        {
            await CleanDevRosterAsync();
        }
    }

    [Fact]
    public async Task Non_development_hosts_never_seed_the_roster()
    {
        await CleanDevRosterAsync();
        await using var factory = new TestApiFactory(database, new() { ["Dev:SeedEmployees"] = "true" }); // environment Testing
        _ = factory.Server;
        await Task.Delay(300);

        Assert.False(await factory.WithDbAsync(db => db.Set<Employee>().AnyAsync(e => e.Code == "T0001")));
    }

    private Task CleanDevRosterAsync() => _factory.WithDbAsync(async db =>
    {
        await db.Set<Employee>().Where(e => e.Code.StartsWith("T00") && e.Code.Length == 5).ExecuteDeleteAsync();
        await db.Set<OrgUnit>().Where(u => u.HrmId == -1).ExecuteDeleteAsync();
        return 0;
    });
}
