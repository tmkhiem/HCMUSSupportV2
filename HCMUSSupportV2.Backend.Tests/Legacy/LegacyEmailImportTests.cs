using System.Net;
using System.Text.Json.Nodes;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using static HCMUSSupportV2.Backend.Tests.Legacy.LegacyImportHost;

namespace HCMUSSupportV2.Backend.Tests.Legacy;

/// <summary>POST /api/integration/v1/legacy/emails (D15). Synthetic MSCBs and emails only.</summary>
[Collection(PostgresCollection.Name)]
public class LegacyEmailImportTests(PostgresFixture database) : IAsyncLifetime
{
    private LegacyImportHost _host = null!;

    public async Task InitializeAsync()
    {
        _host = new LegacyImportHost(database);
        await _host.StartAsync();
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    private static object User(string? code, string? name, params string?[] emails) => new { code, name, emails };

    private Task<List<EmployeeEmail>> MappingsAsync(params string[] codes) =>
        _host.DbAsync(db => db.Set<EmployeeEmail>().AsNoTracking().Where(e => codes.Contains(e.EmployeeCode)).OrderBy(e => e.Email).ToListAsync());

    private static int Issue(JsonNode report, string kind) => (int?)report["issues"]![kind] ?? 0;

    // ------------------------------------------------------------ auth

    [Fact]
    public async Task Requires_the_legacy_import_scope()
    {
        var body = new { users = Array.Empty<object>() };
        Assert.Equal(HttpStatusCode.Unauthorized, (await _host.PostAsync(_host.Anonymous(), "emails", body)).Status);
        Assert.Equal(HttpStatusCode.Forbidden, (await _host.PostAsync(await _host.IngestOnlyAsync(), "emails", body)).Status);
        Assert.Equal(HttpStatusCode.OK, (await _host.PostAsync(_host.Legacy, "emails", body)).Status);
    }

    [Fact]
    public async Task Malformed_body_is_400()
    {
        Assert.Equal(HttpStatusCode.BadRequest, (await _host.PostAsync(_host.Legacy, "emails", new { })).Status);
    }

    // ------------------------------------------------------------ rules

    [Fact]
    public async Task Reports_every_issue_kind_and_maps_the_rest()
    {
        var ok = await _host.EmployeeAsync(fullName: "Nguyễn Văn An");
        var okShouting = await _host.EmployeeAsync(fullName: "Trần Thị Bé");
        var mismatch = await _host.EmployeeAsync(fullName: "Lê Văn Cường");
        var inactive = await _host.EmployeeAsync(status: EmployeeStatuses.Inactive, fullName: "Phạm Văn Dũng");
        var dupA = await _host.EmployeeAsync();
        var dupB = await _host.EmployeeAsync();
        var owner = await _host.EmployeeAsync();
        var intruder = await _host.EmployeeAsync();
        var ghost = NewCode();

        var (okMain, okAlt, shoutMail, mismatchMail, inactiveMail) = (NewEmail("ok"), NewEmail("ok2"), NewEmail("shout"), NewEmail("mm"), NewEmail("off"));
        var (sharedMail, ownedMail, ghostMail, intruderOwn) = (NewEmail("shared"), NewEmail("owned"), NewEmail("ghost"), NewEmail("own"));
        await _host.DbAsync(async db =>
        {
            db.Set<EmployeeEmail>().Add(new EmployeeEmail { Email = ownedMail, EmployeeCode = owner, IsPrimary = true, Note = "kept" });
            await db.SaveChangesAsync();
            return 0;
        });

        var users = new[]
        {
            User(ok, "Nguyen Van An", okMain.ToUpperInvariant() + " ", okAlt),                // trimmed + lower-cased; unaccented name matches
            User(okShouting, "TRAN THI BE", shoutMail),                                       // case-insensitive name match
            User(mismatch, "Hoàng Văn Khác", mismatchMail),                                   // name_mismatch (still mapped)
            User(inactive, "Phạm Văn Dũng", inactiveMail),                                    // inactive_employee (still mapped)
            User(dupA, null, sharedMail),                                                     // duplicate_in_source x2, skipped for both
            User(dupB, null, sharedMail),
            User(intruder, null, ownedMail, intruderOwn),                                     // conflict for the first, the second is mapped
            User(ghost, "Không Có", ghostMail),                                               // unknown_employee
            User(ok, null, "not-an-email", "", null),                                         // invalid_email x3 (same MSCB again: merged)
        };
        var report = await _host.PostOkAsync("emails", new { users });

        Assert.False((bool)report["dryRun"]!);
        Assert.Equal(users.Length, (int)report["users"]!);
        Assert.Equal(13, (int)report["emails"]!);
        Assert.Equal(6, (int)report["inserted"]!);   // okMain, okAlt, shout, mismatch, inactive, intruderOwn
        Assert.Equal(0, (int)report["unchanged"]!);
        Assert.Equal(1, Issue(report, "unknown_employee"));
        Assert.Equal(2, Issue(report, "duplicate_in_source"));
        Assert.Equal(1, Issue(report, "conflict"));
        Assert.Equal(1, Issue(report, "inactive_employee"));
        Assert.Equal(1, Issue(report, "name_mismatch"));
        Assert.Equal(3, Issue(report, "invalid_email"));

        var details = report["details"]!.AsArray();
        var conflict = details.Single(d => (string?)d!["kind"] == "conflict")!;
        Assert.Equal(intruder, (string?)conflict["code"]);
        Assert.Equal(ownedMail, (string?)conflict["email"]);
        Assert.Equal(owner, (string?)conflict["otherCode"]);
        Assert.Equal(ghost, (string?)details.Single(d => (string?)d!["kind"] == "unknown_employee")!["code"]);
        Assert.Equal(inactive, (string?)details.Single(d => (string?)d!["kind"] == "inactive_employee")!["code"]);
        Assert.Equal(mismatch, (string?)details.Single(d => (string?)d!["kind"] == "name_mismatch")!["code"]);
        Assert.Equal(new[] { dupA, dupB }.Order(), details.Where(d => (string?)d!["kind"] == "duplicate_in_source").Select(d => (string)d!["code"]!).Order());

        // Mapped (or not) in the database.
        var rows = await MappingsAsync(ok, okShouting, mismatch, inactive, dupA, dupB, owner, intruder, ghost);
        Assert.Equal(new[] { okAlt, okMain }.Order(), rows.Where(r => r.EmployeeCode == ok).Select(r => r.Email).Order());
        Assert.All(rows.Where(r => r.Note == "v1 users.json"), r => Assert.Null(r.AddedBy));
        Assert.Contains(rows, r => r.Email == shoutMail && r.EmployeeCode == okShouting);
        Assert.Contains(rows, r => r.Email == mismatchMail && r.EmployeeCode == mismatch);
        Assert.Contains(rows, r => r.Email == inactiveMail && r.EmployeeCode == inactive);
        Assert.DoesNotContain(rows, r => r.Email == sharedMail);
        Assert.DoesNotContain(rows, r => r.EmployeeCode == ghost);
        Assert.DoesNotContain(rows, r => r.Email == "not-an-email");

        // An existing mapping is never overwritten or deleted.
        var kept = Assert.Single(rows, r => r.Email == ownedMail);
        Assert.Equal(owner, kept.EmployeeCode);
        Assert.Equal("kept", kept.Note);
        Assert.True(kept.IsPrimary);
        Assert.Contains(rows, r => r.Email == intruderOwn && r.EmployeeCode == intruder);

        // The employees that gained their first email were handed to the activation observers (never the inactive one).
        var notified = _host.Observer.Activated.ToHashSet();
        Assert.Contains(ok, notified);
        Assert.Contains(okShouting, notified);
        Assert.Contains(mismatch, notified);
        Assert.Contains(intruder, notified);
        Assert.DoesNotContain(inactive, notified);
    }

    [Fact]
    public async Task First_email_is_primary_only_when_the_employee_has_no_primary_yet()
    {
        var fresh = await _host.EmployeeAsync();
        var hasPrimary = await _host.EmployeeAsync();
        var firstBlocked = await _host.EmployeeAsync();
        var existingPrimary = NewEmail("have");
        var (freshA, freshB, newOne, blocked, second) = (NewEmail("a"), NewEmail("b"), NewEmail("new"), NewEmail("blocked"), NewEmail("second"));
        var stranger = await _host.EmployeeAsync(emails: [blocked]);
        await _host.DbAsync(async db =>
        {
            db.Set<EmployeeEmail>().Add(new EmployeeEmail { Email = existingPrimary, EmployeeCode = hasPrimary, IsPrimary = true });
            await db.SaveChangesAsync();
            return 0;
        });

        await _host.PostOkAsync("emails", new
        {
            users = new[]
            {
                User(fresh, null, freshA, freshB),
                User(hasPrimary, null, existingPrimary, newOne),
                User(firstBlocked, null, blocked, second),   // the first email belongs to someone else: the next one becomes primary
            },
        });

        var rows = await MappingsAsync(fresh, hasPrimary, firstBlocked);
        Assert.True(rows.Single(r => r.Email == freshA).IsPrimary);
        Assert.False(rows.Single(r => r.Email == freshB).IsPrimary);
        Assert.True(rows.Single(r => r.Email == existingPrimary).IsPrimary);
        Assert.False(rows.Single(r => r.Email == newOne).IsPrimary);
        Assert.True(rows.Single(r => r.Email == second).IsPrimary);
        Assert.Equal(1, rows.Count(r => r.EmployeeCode == fresh && r.IsPrimary));
        Assert.Equal(stranger, (await MappingsAsync(stranger)).Single().EmployeeCode);
    }

    [Fact]
    public async Task A_second_run_is_all_unchanged()
    {
        var a = await _host.EmployeeAsync(fullName: "Nhân Viên Mẫu Ba");
        var b = await _host.EmployeeAsync();
        var payload = new { users = new[] { User(a, "Nhan Vien Mau Ba", NewEmail(), NewEmail()), User(b, null, NewEmail()), User(NewCode(), null, NewEmail()) } };

        var first = await _host.PostOkAsync("emails", payload);
        Assert.Equal(3, (int)first["inserted"]!);
        var count = await _host.ScalarAsync("SELECT count(*)::int AS \"Value\" FROM employee_emails");

        var second = await _host.PostOkAsync("emails", payload);
        Assert.Equal(0, (int)second["inserted"]!);
        Assert.Equal(3, (int)second["unchanged"]!);
        Assert.Equal(1, Issue(second, "unknown_employee"));   // still reported, nothing else
        Assert.Equal(0, Issue(second, "conflict"));
        Assert.Equal(count, await _host.ScalarAsync("SELECT count(*)::int AS \"Value\" FROM employee_emails"));
    }

    [Fact]
    public async Task Dry_run_reports_the_same_but_writes_nothing()
    {
        var a = await _host.EmployeeAsync();
        var email = NewEmail();
        var payload = new { users = new[] { User(a, null, email), User(NewCode(), null, NewEmail()) } };
        var jobsBefore = await _host.ScalarAsync("SELECT count(*)::int AS \"Value\" FROM jobs");
        var auditBefore = await _host.ScalarAsync("SELECT count(*)::int AS \"Value\" FROM audit_log WHERE action = 'legacy.emails'");

        var dry = await _host.PostOkAsync("emails", payload, dryRun: true);
        Assert.True((bool)dry["dryRun"]!);
        Assert.Equal(1, (int)dry["inserted"]!);
        Assert.Equal(1, Issue(dry, "unknown_employee"));
        Assert.Empty(await MappingsAsync(a));
        Assert.Equal(jobsBefore, await _host.ScalarAsync("SELECT count(*)::int AS \"Value\" FROM jobs"));
        Assert.Equal(auditBefore, await _host.ScalarAsync("SELECT count(*)::int AS \"Value\" FROM audit_log WHERE action = 'legacy.emails'"));
        Assert.DoesNotContain(a, _host.Observer.Activated);

        var real = await _host.PostOkAsync("emails", payload);
        Assert.Equal((int)dry["inserted"]!, (int)real["inserted"]!);
        Assert.Single(await MappingsAsync(a));
    }

    [Fact]
    public async Task Writes_a_counts_only_audit_entry()
    {
        var a = await _host.EmployeeAsync();
        var email = NewEmail("audit");
        await _host.PostOkAsync("emails", new { users = new[] { User(a, null, email) } });

        var details = await _host.DbAsync(db => db.Database
            .SqlQueryRaw<string>("SELECT details::text AS \"Value\" FROM audit_log WHERE action = 'legacy.emails' ORDER BY id DESC LIMIT 1").SingleAsync());
        Assert.Contains("\"inserted\":1", details.Replace(" ", ""));
        Assert.DoesNotContain(email, details);
        Assert.DoesNotContain(a, details);
    }
}
