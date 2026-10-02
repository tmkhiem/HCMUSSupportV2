using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using HCMUSSupportV2.Backend.Modules.Hrm.Domain;
using HCMUSSupportV2.Backend.Modules.Hrm.Integration;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Modules.Legacy;
using HCMUSSupportV2.Backend.Modules.Notifications.Domain;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using HCMUSSupportV2.Backend.Tests.Hrm;
using HCMUSSupportV2.Backend.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using static HCMUSSupportV2.Backend.Tests.Hrm.HrmTestSupport;

namespace HCMUSSupportV2.Backend.Tests.Legacy;

/// <summary>
/// D15: the legacy migration endpoints. Synthetic data only (T05xx codes). Every step is a dry run unless <c>dryRun=false</c>
/// and a second run changes nothing.
/// </summary>
[Collection(PostgresCollection.Name)]
public class LegacyMigrationTests(PostgresFixture database) : IAsyncLifetime
{
    private readonly TestApiFactory _factory = new(database);
    private HttpClient _legacy = null!;
    private HttpClient _ingest = null!;
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly string[] Codes = ["T0501", "T0502", "T0503", "T0504", "T0505", "T0506"];

    public async Task InitializeAsync()
    {
        _ = _factory.Server;
        await ResetAsync(_factory);
        await _factory.WithDbAsync(async db =>
        {
            await db.Database.ExecuteSqlRawAsync("""
                DELETE FROM notifications WHERE id IN (SELECT target_id::uuid FROM legacy_import_marks WHERE target_id IS NOT NULL);
                DELETE FROM notification_series WHERE name LIKE 'LEGACY-TEST%';
                DELETE FROM legacy_import_marks;
                DELETE FROM role_assignments WHERE employee_code LIKE 'T05%';
                DELETE FROM employee_emails WHERE employee_code LIKE 'T05%';
                """);
            return 0;
        });
        _ingest = await CreateIngestClientAsync(_factory);
        await SeedEmployeesAsync(_ingest, Codes);
        _legacy = await CreateIngestClientAsync(_factory, [ApiScopes.LegacyImport]);
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    private async Task<JsonNode> PostAsync(string path, object body, bool? dryRun = false, HttpClient? client = null, HttpStatusCode expect = HttpStatusCode.OK)
    {
        var url = $"/api/integration/v1/legacy/{path}" + (dryRun is null ? "" : $"?dryRun={dryRun.Value.ToString().ToLowerInvariant()}");
        var response = await (client ?? _legacy).PostAsJsonAsync(url, body, Json);
        var text = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == expect, $"{path}: expected {(int)expect}, got {(int)response.StatusCode}: {text}");
        return string.IsNullOrEmpty(text) ? new JsonObject() : JsonNode.Parse(text)!;
    }

    // ------------------------------------------------------------------ auth and defaults

    [Fact]
    public async Task Needs_the_legacy_scope()
    {
        var anonymous = ApiClientFor(_factory, null);
        var wrongScope = await CreateIngestClientAsync(_factory); // hrm.ingest only
        var body = new { users = Array.Empty<object>() };
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsJsonAsync("/api/integration/v1/legacy/roster-emails", body, Json)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await wrongScope.PostAsJsonAsync("/api/integration/v1/legacy/roster-emails", body, Json)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await _legacy.PostAsJsonAsync("/api/integration/v1/legacy/roster-emails", body, Json)).StatusCode);
    }

    // ------------------------------------------------------------------ roster and emails

    private static object[] Users() =>
    [
        new { id = "T0501", name = "Nhân viên thử T0501", emails = new[] { "t0501@legacy.test", "T0501.Alt@legacy.test" } },
        new { id = "T0502", name = "Tên khác hẳn", emails = new[] { "t0502@legacy.test" } },
        new { id = "T0503", name = "Nhân viên thử T0503", emails = new[] { "t0503@legacy.test", "not-an-email" } },
        new { id = "T0599", name = "Không có trong HRM", emails = new[] { "t0599@legacy.test" } },
        new { id = "T0504", name = "Nhân viên thử T0504", emails = new[] { "shared@legacy.test" } },
        new { id = "T0505", name = "Nhân viên thử T0505", emails = new[] { "shared@legacy.test" } },
        new { id = "T0506", name = "Không email", emails = Array.Empty<string>() },
    ];

    [Fact]
    public async Task Roster_dry_run_is_the_default_and_writes_nothing()
    {
        var report = await PostAsync("roster-emails", new { users = Users() }, dryRun: null);
        Assert.True((bool)report["import"]!["dryRun"]!);
        Assert.True((int)report["import"]!["addedCount"]! > 0);
        Assert.Equal(0, await _factory.WithDbAsync(db => db.Set<EmployeeEmail>().CountAsync(m => m.EmployeeCode.StartsWith("T05"))));
    }

    [Fact]
    public async Task Roster_maps_emails_and_reports_conflicts_unknown_and_invalid()
    {
        var report = await PostAsync("roster-emails", new { users = Users() });
        var import = report["import"]!;
        Assert.False((bool)import["dryRun"]!);
        // T0501 two emails, T0502 one, T0503 one valid, T0504 gets the shared one (first in file), T0505 conflicts.
        Assert.Equal(5, (int)import["addedCount"]!);
        Assert.Equal(1, (int)import["unknownCount"]!);
        Assert.Equal("T0599", (string)import["unknown"]![0]!["code"]!);
        Assert.Equal(1, (int)import["invalidCount"]!);
        Assert.Equal(1, (int)import["conflictCount"]!);
        Assert.Equal("duplicate_in_file", (string)import["conflicts"]![0]!["reason"]!);
        Assert.Contains(import["warnings"]!.AsArray(), w => (string)w!["reason"]! == "name_mismatch" && (string)w["code"]! == "T0502");
        Assert.Equal(1, (int)report["noEmailCount"]!);

        var mapped = await _factory.WithDbAsync(db => db.Set<EmployeeEmail>().AsNoTracking().Where(m => m.EmployeeCode.StartsWith("T05")).ToListAsync());
        Assert.Equal(5, mapped.Count);
        Assert.Equal(1, mapped.Count(m => m.EmployeeCode == "T0501" && m.IsPrimary));
        Assert.Contains(mapped, m => m.Email == "t0501.alt@legacy.test"); // normalised to lower case
        Assert.DoesNotContain(mapped, m => m.EmployeeCode == "T0505");
    }

    [Fact]
    public async Task Roster_rerun_is_a_no_op_and_keeps_editor_changes()
    {
        await PostAsync("roster-emails", new { users = Users() });
        // An editor adds a mapping afterwards; the legacy file does not know it.
        await _factory.WithDbAsync(async db =>
        {
            db.Set<EmployeeEmail>().Add(new EmployeeEmail { Email = "editor-added@legacy.test", EmployeeCode = "T0502", Note = "editor", AddedAt = DateTimeOffset.UtcNow });
            await db.SaveChangesAsync();
            return 0;
        });

        var second = await PostAsync("roster-emails", new { users = Users() });
        Assert.Equal(0, (int)second["import"]!["addedCount"]!);
        Assert.Equal(0, (int)second["import"]!["removedCount"]!);
        Assert.Equal(5, (int)second["import"]!["unchangedCount"]!);
        var count = await _factory.WithDbAsync(db => db.Set<EmployeeEmail>().CountAsync(m => m.EmployeeCode.StartsWith("T05")));
        Assert.Equal(6, count);
    }

    // ------------------------------------------------------------------ roles

    [Fact]
    public async Task Roles_grant_admin_to_the_named_identities_idempotently()
    {
        await PostAsync("roster-emails", new { users = Users() });
        var grants = new
        {
            grants = new object[]
            {
                new { role = "admin", code = "T0501", email = "t0501@legacy.test" },
                new { role = "admin", code = (string?)null, email = "t0502@legacy.test" }, // resolved through the mapping
                new { role = "admin", code = "T0503", email = "new-address@legacy.test" }, // mapped on the fly
            },
        };

        var dry = await PostAsync("roles", grants, dryRun: null);
        Assert.True((bool)dry["dryRun"]!);
        Assert.All(dry["results"]!.AsArray(), r => Assert.Equal("granted", (string)r!["outcome"]!));
        Assert.Equal(0, await _factory.WithDbAsync(db => db.Set<RoleAssignment>().CountAsync(r => r.EmployeeCode.StartsWith("T05"))));

        var first = await PostAsync("roles", grants);
        Assert.All(first["results"]!.AsArray(), r => Assert.Equal("granted", (string)r!["outcome"]!));
        Assert.True((bool)first["results"]![2]!["emailMapped"]!);
        var roles = await _factory.WithDbAsync(db => db.Set<RoleAssignment>().AsNoTracking().Where(r => r.EmployeeCode.StartsWith("T05")).ToListAsync());
        Assert.Equal(["T0501", "T0502", "T0503"], roles.Select(r => r.EmployeeCode).Order().ToArray());
        Assert.All(roles, r => Assert.Equal(Roles.Admin, r.Role));
        Assert.True(await _factory.WithDbAsync(db => db.Set<EmployeeEmail>().AnyAsync(m => m.Email == "new-address@legacy.test" && m.EmployeeCode == "T0503")));
        Assert.Equal(3, await _factory.WithDbAsync(db => db.Set<AuditLogEntry>().CountAsync(a => a.Action == "roles.granted" && a.TargetId!.StartsWith("T05"))));

        var second = await PostAsync("roles", grants);
        Assert.All(second["results"]!.AsArray(), r => Assert.Equal("already", (string)r!["outcome"]!));
        Assert.Equal(3, await _factory.WithDbAsync(db => db.Set<RoleAssignment>().CountAsync(r => r.EmployeeCode.StartsWith("T05"))));
        Assert.Equal(3, await _factory.WithDbAsync(db => db.Set<AuditLogEntry>().CountAsync(a => a.Action == "roles.granted" && a.TargetId!.StartsWith("T05"))));
    }

    [Fact]
    public async Task Roles_refuse_mismatches_unknown_people_and_other_roles()
    {
        await PostAsync("roster-emails", new { users = Users() });
        var result = await PostAsync("roles", new
        {
            grants = new object[]
            {
                new { role = "admin", code = "T0501", email = "t0502@legacy.test" },        // email belongs to T0502
                new { role = "admin", code = "T0777", email = (string?)null },              // not in HRM
                new { role = "superuser", code = "T0501", email = (string?)null },          // not an assignable role
                new { role = "editor", code = (string?)null, email = "ghost@legacy.test" }, // unmapped and no code
                new { role = "admin", code = (string?)null, email = (string?)null },        // nothing to identify
            },
        });
        Assert.Equal(["email_mismatch", "employee_not_found", "invalid_role", "email_not_mapped", "invalid_request"],
            result["results"]!.AsArray().Select(r => (string)r!["outcome"]!).ToArray());
        Assert.Equal(0, await _factory.WithDbAsync(db => db.Set<RoleAssignment>().CountAsync(r => r.EmployeeCode.StartsWith("T05"))));
    }

    // ------------------------------------------------------------------ news

    private static object Post(string key, string title, string date, string body, object? variables = null, object? rows = null, bool? all = null,
        string? series = null, string[]? tags = null, string? pinnedUntil = null) =>
        new { key, title, publishedOn = date, bodyMd = body, variables, rows, audienceAll = all, seriesName = series, tagNames = tags, pinnedUntil };

    [Fact]
    public async Task News_import_creates_published_posts_with_rows_audience_and_history()
    {
        await PostAsync("roster-emails", new { users = Users() });
        var rows = new Dictionary<string, object[]>
        {
            ["T0501"] = [new Dictionary<string, string> { ["HeSoLuong"] = "3,00", ["Bac"] = "5" }],
            ["T0502"] = [new Dictionary<string, string> { ["HeSoLuong"] = "2,67", ["Bac"] = "4" }],
            ["T0900"] = [new Dictionary<string, string> { ["HeSoLuong"] = "9", ["Bac"] = "9" }], // not in HRM
        };
        var variables = new[] { new { key = "HeSoLuong", label = "Hệ số", type = "text" }, new { key = "Bac", label = "Bậc", type = "text" } };
        var post = Post("2024-02-27-LEGACY-TEST-luong", "LEGACY-TEST Nâng lương", "2024-02-27",
            "Hệ số lương: :var[HeSoLuong], bậc :var[Bac]", variables, rows, series: "LEGACY-TEST Nâng lương", tags: ["Lương", "Không có nhãn này"]);

        var dry = await PostAsync("news", new { posts = new[] { post } }, dryRun: null);
        Assert.Equal("would_create", (string)dry["items"]![0]!["action"]!);
        Assert.Equal(0, await _factory.WithDbAsync(db => db.Set<LegacyImportMark>().CountAsync()));

        var report = await PostAsync("news", new { posts = new[] { post } });
        var item = report["items"]![0]!;
        Assert.Equal("created", (string)item["action"]!);
        Assert.Equal("import", (string)item["audience"]!);
        Assert.Equal(2, (int)item["recipients"]!);
        Assert.Equal(1, (int)item["unknownMscbs"]!);
        Assert.Contains(item["issues"]!.AsArray(), i => ((string)i!).Contains("Không có nhãn"));

        var (n, deliveries, import, tags, revision) = await _factory.WithDbAsync(async db =>
        {
            var note = await db.Set<Notification>().AsNoTracking().SingleAsync(x => x.Title == "LEGACY-TEST Nâng lương");
            return (note,
                await db.Set<NotificationDelivery>().AsNoTracking().Where(d => d.NotificationId == note.Id).OrderBy(d => d.EmployeeCode).ToListAsync(),
                await db.Set<NotificationRecipientImport>().AsNoTracking().SingleAsync(i => i.NotificationId == note.Id),
                await db.Set<NotificationTag>().CountAsync(t => t.NotificationId == note.Id),
                await db.Set<NotificationRevision>().CountAsync(r => r.NotificationId == note.Id));
        });
        Assert.Equal(NotificationStatuses.Published, n.Status);
        Assert.Equal(new DateTimeOffset(2024, 2, 27, 0, 0, 0, TimeSpan.FromHours(7)), n.PublishedAt);
        Assert.False(n.AudienceAll);
        Assert.NotNull(n.SeriesId);
        Assert.Equal(1, tags);
        Assert.Equal(1, revision);
        Assert.Equal(2, n.RecipientCount);
        Assert.Equal(["T0501", "T0502"], deliveries.Select(d => d.EmployeeCode).ToArray());
        // v1 date, and read (v1 had no read state: imported posts are history, not new unread badges)
        Assert.All(deliveries, d => { Assert.Equal(n.PublishedAt, d.DeliveredAt); Assert.Equal(n.PublishedAt, d.ReadAt); });
        Assert.Equal(2, n.ReadCount);
        // the variable keys keep their case, values per MSCB
        var stored = JsonNode.Parse(import.Rows)!.AsObject();
        Assert.Equal("3,00", (string)stored["T0501"]![0]!["HeSoLuong"]!);
        Assert.Equal("[{\"Bac\":\"4\",\"HeSoLuong\":\"2,67\"}]", deliveries[1].Vars!.Replace(" ", ""));
    }

    [Fact]
    public async Task News_rerun_is_a_no_op_and_a_changed_file_is_reported_not_applied()
    {
        await PostAsync("roster-emails", new { users = Users() });
        var rows = new Dictionary<string, object[]> { ["T0501"] = [new Dictionary<string, string> { ["A"] = "x" }] };
        var variables = new[] { new { key = "A", label = "A", type = "text" } };
        var post = Post("2023-01-01-LEGACY-TEST-a", "LEGACY-TEST A", "2023-01-01", "Giá trị :var[A]", variables, rows);

        await PostAsync("news", new { posts = new[] { post } });
        var before = await _factory.WithDbAsync(async db => (await db.Set<Notification>().CountAsync(), await db.Set<NotificationDelivery>().CountAsync(), await db.Set<NotificationRevision>().CountAsync()));

        var second = await PostAsync("news", new { posts = new[] { post } });
        Assert.Equal("unchanged", (string)second["items"]![0]!["action"]!);
        Assert.Equal(0, (int)second["created"]!);
        var after = await _factory.WithDbAsync(async db => (await db.Set<Notification>().CountAsync(), await db.Set<NotificationDelivery>().CountAsync(), await db.Set<NotificationRevision>().CountAsync()));
        Assert.Equal(before, after);

        var changed = Post("2023-01-01-LEGACY-TEST-a", "LEGACY-TEST A", "2023-01-01", "Giá trị mới :var[A]", variables, rows);
        var third = await PostAsync("news", new { posts = new[] { changed } });
        Assert.Equal("changed_skipped", (string)third["items"]![0]!["action"]!);
        Assert.Equal("Giá trị :var[A]", await _factory.WithDbAsync(db => db.Set<Notification>().Where(x => x.Title == "LEGACY-TEST A").Select(x => x.BodyMd).SingleAsync()));
    }

    [Fact]
    public async Task News_decides_audience_all_from_the_roster_coverage_and_variables()
    {
        await PostAsync("roster-emails", new { users = Users() }); // T0501..T0504 have emails (T0505 lost the shared email: no mapping)
        var everyone = Codes.ToDictionary(c => c, _ => Array.Empty<object>());
        var subset = new Dictionary<string, object[]> { ["T0501"] = [] };
        var withVar = new Dictionary<string, object[]> { ["T0501"] = [new Dictionary<string, string> { ["A"] = "1" }] };
        var report = await PostAsync("news", new
        {
            allCoverage = 0.0001,
            posts = new object[]
            {
                Post("k-all", "LEGACY-TEST khảo sát", "2025-06-16", "Mời tham gia khảo sát [tại đây](https://forms.gle/abc)", null, everyone),
                Post("k-var", "LEGACY-TEST có biến", "2025-06-17", "Giá trị :var[A]", new[] { new { key = "A", label = "A", type = "text" } }, withVar),
                Post("k-forced", "LEGACY-TEST ép all", "2025-06-18", "Thông báo chung", null, subset, all: true),
                Post("k-none", "LEGACY-TEST không ai", "2025-06-19", "Không có người nhận", null, new Dictionary<string, object[]> { ["T0999"] = [] }),
            },
        });
        var items = report["items"]!.AsArray();
        Assert.Equal(["all", "import", "all", "import"], items.Select(i => (string)i!["audience"]!).ToArray());
        Assert.Equal("rejected", (string)items[3]!["action"]!);

        var all = await _factory.WithDbAsync(db => db.Set<Notification>().AsNoTracking().SingleAsync(x => x.Title == "LEGACY-TEST khảo sát"));
        Assert.True(all.AudienceAll);
        var withEmail = await _factory.WithDbAsync(db => db.Set<Employee>().CountAsync(e => e.Status == EmployeeStatuses.Active && db.Set<EmployeeEmail>().Any(m => m.EmployeeCode == e.Code)));
        Assert.Equal(withEmail, all.RecipientCount); // every active employee with a mapped email, nobody else
    }

    [Fact]
    public async Task News_rejects_invalid_markdown_and_pins_the_banner()
    {
        await PostAsync("roster-emails", new { users = Users() });
        var bad = Post("bad", "LEGACY-TEST html", "2022-01-01", "Có <b>html</b> thô");
        var undeclared = Post("undeclared", "LEGACY-TEST biến lạ", "2022-01-01", "Giá trị :var[Z]");
        var report = await PostAsync("news", new { posts = new[] { bad, undeclared } });
        Assert.Equal(2, (int)report["rejected"]!);
        Assert.Equal(0, await _factory.WithDbAsync(db => db.Set<Notification>().CountAsync(x => x.Title.StartsWith("LEGACY-TEST"))));

        var banner = Post("request-update-info", "LEGACY-TEST Cập nhật thông tin", "2023-05-01",
            "Điền [phiếu đề nghị](https://forms.gle/xyz) nếu cần cập nhật.", all: true, pinnedUntil: "2099-12-31");
        var ok = await PostAsync("news", new { kind = "banner", markRead = false, posts = new[] { banner } });
        Assert.Equal("created", (string)ok["items"]![0]!["action"]!);
        var n = await _factory.WithDbAsync(db => db.Set<Notification>().AsNoTracking().SingleAsync(x => x.Title == "LEGACY-TEST Cập nhật thông tin"));
        Assert.True(n.AudienceAll);
        Assert.Equal(new DateTimeOffset(2099, 12, 31, 0, 0, 0, TimeSpan.FromHours(7)), n.PinnedUntil);
        Assert.Equal(0, n.ReadCount); // markRead=false keeps the banner unread
        Assert.True(await _factory.WithDbAsync(db => db.Set<LegacyImportMark>().AnyAsync(m => m.Kind == "banner" && m.Key == "request-update-info")));
    }

    // ------------------------------------------------------------------ datasets

    private static object Teach(string code, string year, string program, int? term, string course, string? module = null, string? activity = null, decimal hours = 10) =>
        new { employeeCode = code, academicYear = year, program, term, module, courseCode = (string?)null, courseName = course, classCode = (string?)null, track = (string?)null, activity, periods = 0, standardHours = hours };

    [Fact]
    public async Task Teaching_is_applied_once_and_a_rerun_writes_nothing()
    {
        var rows = new[]
        {
            Teach("T0501", "2023-2024", "dai_hoc", 1, "Giải tích", activity: "LYTHUYET", hours: 45),
            Teach("T0501", "2023-2024", "cao_hoc", null, "Chuyên đề", module: "Học phần 2", hours: 30),
            Teach("T0502", "2023-2024", "tien_si", null, "Seminar", module: "CĐTS", hours: 15),
            Teach("T0888", "2023-2024", "dai_hoc", 2, "Không rõ người", hours: 5),
        };
        var dry = await PostAsync("datasets/teaching", new { rows }, dryRun: null);
        Assert.True((bool)dry["dryRun"]!);
        Assert.False((bool)dry["applied"]!);
        Assert.Equal(3, (int)dry["newCount"]!);
        Assert.Equal(1, (int)dry["unknownMscbCount"]!);
        Assert.Equal(0, await _factory.WithDbAsync(db => db.Set<TeachingLoad>().CountAsync(t => t.EmployeeCode.StartsWith("T05"))));

        var first = await PostAsync("datasets/teaching", new { rows });
        Assert.True((bool)first["applied"]!);
        var stored = await _factory.WithDbAsync(db => db.Set<TeachingLoad>().AsNoTracking().Where(t => t.EmployeeCode.StartsWith("T05")).ToListAsync());
        Assert.Equal(3, stored.Count);
        Assert.All(stored, t => Assert.Null(t.SourceImportId));
        var ids = stored.Select(t => t.Id).Order().ToArray();

        var second = await PostAsync("datasets/teaching", new { rows });
        Assert.False((bool)second["applied"]!);
        Assert.Equal(0, (int)second["newCount"]!);
        Assert.Equal(0, (int)second["updatedCount"]!);
        Assert.Equal(0, (int)second["removedCount"]!);
        var again = await _factory.WithDbAsync(db => db.Set<TeachingLoad>().AsNoTracking().Where(t => t.EmployeeCode.StartsWith("T05")).Select(t => t.Id).ToListAsync());
        Assert.Equal(ids, again.Order().ToArray());
    }

    [Fact]
    public async Task Teaching_keeps_repeated_v1_rows_and_a_changed_hour_replaces_only_that_scope()
    {
        // v1 has no row key: the same course/class/activity can repeat, and every row must survive (and stay stable on re-run).
        var rows = new[]
        {
            Teach("T0501", "2023-2024", "dai_hoc", 1, "Thực hành", activity: "THUCHANH", hours: 7.123456m),
            Teach("T0501", "2023-2024", "dai_hoc", 1, "Thực hành", activity: "THUCHANH", hours: 7.123456m),
            Teach("T0501", "2023-2024", "dai_hoc", 1, "Thực hành", activity: "THUCHANH", hours: 3m),
            Teach("T0501", "2022-2023", "dai_hoc", 2, "Năm khác", hours: 1m),
        };
        var first = await PostAsync("datasets/teaching", new { rows });
        Assert.True((bool)first["applied"]!);
        Assert.Equal(4, (int)first["newCount"]!);
        Assert.Equal(4, await _factory.WithDbAsync(db => db.Set<TeachingLoad>().CountAsync(t => t.EmployeeCode == "T0501")));
        Assert.Equal(2, await _factory.WithDbAsync(db => db.Set<TeachingLoad>().CountAsync(t => t.StandardHours == 7.12m)));

        var second = await PostAsync("datasets/teaching", new { rows });
        Assert.False((bool)second["applied"]!);
        Assert.Equal(0, (int)second["newCount"]! + (int)second["removedCount"]!);

        var edited = rows.Take(3).Append(Teach("T0501", "2022-2023", "dai_hoc", 2, "Năm khác", hours: 2m)).ToArray();
        var third = await PostAsync("datasets/teaching", new { rows = edited });
        Assert.True((bool)third["applied"]!);
        Assert.Equal(1, (int)third["newCount"]!);
        Assert.Equal(1, (int)third["removedCount"]!);
        Assert.Equal([2m], await _factory.WithDbAsync(db => db.Set<TeachingLoad>().Where(t => t.AcademicYear == "2022-2023" && t.EmployeeCode == "T0501").Select(t => t.StandardHours).ToListAsync()));
    }

    [Fact]
    public async Task Teaching_never_overwrites_a_scope_an_admin_import_owns()
    {
        var importId = await _factory.WithDbAsync(async db =>
        {
            var file = new HCMUSSupportV2.Backend.Modules.Platform.Files.StoredFile
            {
                Id = Guid.NewGuid(), StorageKey = "x", FileName = "x.xlsx", ContentType = "application/octet-stream", Sha256 = new string('0', 64), SizeBytes = 1,
            };
            db.Set<HCMUSSupportV2.Backend.Modules.Platform.Files.StoredFile>().Add(file);
            var import = new DatasetImport { Id = Guid.NewGuid(), Dataset = "teaching", FileId = file.Id, Status = "applied" };
            db.Set<DatasetImport>().Add(import);
            await db.SaveChangesAsync();
            db.Set<TeachingLoad>().Add(new TeachingLoad
            {
                EmployeeCode = "T0501", AcademicYear = "2022-2023", Program = "dai_hoc", Term = 1, CourseName = "Do quản trị viên nhập", StandardHours = 7, SourceImportId = import.Id,
            });
            await db.SaveChangesAsync();
            return import.Id;
        });

        var report = await PostAsync("datasets/teaching", new
        {
            rows = new[] { Teach("T0501", "2022-2023", "dai_hoc", 1, "Từ v1", hours: 99), Teach("T0501", "2021-2022", "dai_hoc", 1, "Từ v1 năm khác", hours: 3) },
        });
        Assert.Equal(["2022-2023/dai_hoc"], report["skipped"]!.AsArray().Select(s => (string)s!).ToArray());
        var names = await _factory.WithDbAsync(db => db.Set<TeachingLoad>().AsNoTracking().Where(t => t.EmployeeCode == "T0501").Select(t => t.CourseName).ToListAsync());
        Assert.Contains("Do quản trị viên nhập", names);
        Assert.Contains("Từ v1 năm khác", names);
        Assert.DoesNotContain("Từ v1", names);
        Assert.NotEqual(Guid.Empty, importId);
    }

    [Fact]
    public async Task Teaching_reports_bad_rows_and_applies_nothing()
    {
        var report = await PostAsync("datasets/teaching", new
        {
            rows = new[]
            {
                Teach("T0501", "2023-2024", "dai_hoc", 1, "Hợp lệ"),
                Teach("T0501", "2023-2024", "dai_hoc", null, "Thiếu học kỳ"),
                Teach("T0501", "2023-2024", "tiểu học", 1, "Sai bậc"),
            },
        });
        Assert.Equal(2, (int)report["badCount"]!);
        Assert.False((bool)report["applied"]!);
        Assert.Equal(0, await _factory.WithDbAsync(db => db.Set<TeachingLoad>().CountAsync(t => t.EmployeeCode.StartsWith("T05"))));
    }

    [Fact]
    public async Task Research_and_publications_apply_and_rerun_as_no_ops()
    {
        object R(string code, string mscb, string role, string? accepted = "2023-05-04") =>
            new { code, title = "Đề tài " + code, level = "Cấp Trường", type = "Nghiên cứu cơ bản", funding = 50_000_000m, period = "2022-2023", acceptedOn = accepted, result = "Tốt", mscb, role };
        var research = new[] { R("T2022-01", "T0501", "chu_nhiem"), R("T2022-01", "T0502", "thanh_vien"), R("T2022-01", "T0777", "thanh_vien"), R("T2023-02", "T0503", "chu_nhiem", null) };
        var first = await PostAsync("datasets/research", new { rows = research });
        Assert.True((bool)first["applied"]!);
        Assert.Equal(2, (int)first["newCount"]!);
        Assert.Equal(1, (int)first["unknownMscbCount"]!);
        Assert.Equal(1, (int)first["droppedMemberRows"]!);
        Assert.Equal(3, await _factory.WithDbAsync(db => db.Set<ResearchProjectMember>().CountAsync()));
        Assert.Equal(new DateOnly(2023, 5, 4), await _factory.WithDbAsync(db => db.Set<ResearchProject>().Where(p => p.Code == "T2022-01").Select(p => p.AcceptedOn).SingleAsync()));
        var projectIds = await _factory.WithDbAsync(db => db.Set<ResearchProject>().Select(p => p.Id).ToListAsync());

        var second = await PostAsync("datasets/research", new { rows = research });
        Assert.False((bool)second["applied"]!);
        Assert.Equal(0, (int)second["updatedCount"]! + (int)second["newCount"]! + (int)second["removedCount"]!);
        Assert.Equal(projectIds.Order().ToArray(), (await _factory.WithDbAsync(db => db.Set<ResearchProject>().Select(p => p.Id).ToListAsync())).Order().ToArray());

        var pubs = new[]
        {
            new { doi = (string?)null, eid = "2-s2.0-TEST", title = "A paper", venue = "Journal X", year = (int?)2025, details = "Authors: A paper. Journal X (2025)", url = (string?)null, authors = new[] { "T0501", "T0502", "T0666" } },
        };
        var p1 = await PostAsync("datasets/publications", new { rows = pubs });
        Assert.True((bool)p1["applied"]!);
        Assert.Equal(1, (int)p1["unknownMscbCount"]!);
        Assert.Equal(["T0501", "T0502"], (await _factory.WithDbAsync(db => db.Set<PublicationAuthor>().OrderBy(a => a.Ordinal).Select(a => a.EmployeeCode).ToListAsync())).ToArray());
        var p2 = await PostAsync("datasets/publications", new { rows = pubs });
        Assert.False((bool)p2["applied"]!);
        Assert.Equal(0, (int)p2["newCount"]! + (int)p2["updatedCount"]! + (int)p2["removedCount"]!);
    }
}
