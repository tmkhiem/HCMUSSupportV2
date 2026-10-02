using System.Net;
using System.Text.Json.Nodes;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Modules.Legacy.Notifications;
using HCMUSSupportV2.Backend.Modules.Notifications.Domain;
using HCMUSSupportV2.Backend.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using static HCMUSSupportV2.Backend.Tests.Legacy.LegacyImportHost;

namespace HCMUSSupportV2.Backend.Tests.Legacy;

/// <summary>POST /api/integration/v1/legacy/notifications (D15). Synthetic MSCBs and text only.</summary>
[Collection(PostgresCollection.Name)]
public class LegacyNotificationImportTests(PostgresFixture database) : IAsyncLifetime
{
    private static readonly DateTimeOffset May15 = new(2025, 5, 15, 8, 0, 0, TimeSpan.FromHours(7));
    private static readonly object[] Declared =
    [
        new { key = "HoTen", label = "Họ tên", type = "text" },
        new { key = "HeSo", label = "Hệ số", type = "number" },
    ];
    private const string Body = "Kính gửi Thầy/Cô :var[HoTen], hệ số lương :var[HeSo].";

    private LegacyImportHost _host = null!;

    public async Task InitializeAsync()
    {
        _host = new LegacyImportHost(database);
        await _host.StartAsync();
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    // ------------------------------------------------------------ helpers

    private static string NewKey() => $"news/{Guid.NewGuid():N}.json";

    private static Dictionary<string, string?> Row(params (string Key, string? Value)[] cells) => cells.ToDictionary(c => c.Key, c => c.Value);

    private static object Post(string? key = null, string title = "Dự kiến nâng bậc lương", string body = Body, object[]? variables = null,
        DateTimeOffset? at = null, bool all = false, Dictionary<string, object[]>? recipients = null, string[]? tags = null,
        string? series = null, bool markRead = true, bool requiresAck = false, DateTimeOffset? pinnedUntil = null, string? summary = null) => new
    {
        legacyKey = key ?? NewKey(), title, summary, bodyMd = body, variables = variables ?? Declared, publishedAt = at ?? May15,
        audienceAll = all, recipients, tags = tags ?? [], series, pinnedUntil, requiresAck, markRead,
    };

    private Task<JsonNode> ImportAsync(params object[] posts) => _host.PostOkAsync("notifications", new { posts });

    private Task<JsonNode> DryRunAsync(params object[] posts) => _host.PostOkAsync("notifications", new { posts }, dryRun: true);

    private static JsonNode PostReport(JsonNode report, int index = 0) => report["posts"]![index]!;

    private static Guid IdOf(JsonNode report, int index = 0) => Guid.Parse((string)PostReport(report, index)["id"]!);

    private static int Total(JsonNode report, string name) => (int)report["totals"]![name]!;

    private Task<List<NotificationDelivery>> DeliveriesAsync(Guid id) =>
        _host.DbAsync(db => db.Set<NotificationDelivery>().AsNoTracking().Where(d => d.NotificationId == id).ToListAsync());

    private Task<Notification> NotificationAsync(Guid id) =>
        _host.DbAsync(db => db.Set<Notification>().AsNoTracking().FirstAsync(n => n.Id == id));

    private Task<int> CountAsync(string table) => _host.ScalarAsync($"SELECT count(*)::int AS \"Value\" FROM {table}");

    private Task ExecAsync(string sql, params object[] args) => _host.DbAsync(async db => await db.Database.ExecuteSqlRawAsync(sql, args));

    private Task<int> JobsAsync() => _host.ScalarAsync("SELECT count(*)::int AS \"Value\" FROM jobs WHERE type LIKE 'notifications.%'");

    // ------------------------------------------------------------ auth + shape

    [Fact]
    public async Task Requires_the_legacy_import_scope()
    {
        var body = new { posts = Array.Empty<object>() };
        Assert.Equal(HttpStatusCode.Unauthorized, (await _host.PostAsync(_host.Anonymous(), "notifications", body)).Status);
        Assert.Equal(HttpStatusCode.Forbidden, (await _host.PostAsync(await _host.IngestOnlyAsync(), "notifications", body)).Status);
        Assert.Equal(HttpStatusCode.OK, (await _host.PostAsync(_host.Legacy, "notifications", body)).Status);
    }

    [Fact]
    public async Task Malformed_body_is_400()
    {
        Assert.Equal(HttpStatusCode.BadRequest, (await _host.PostAsync(_host.Legacy, "notifications", new { })).Status);
    }

    // ------------------------------------------------------------ import posts

    [Fact]
    public async Task Import_post_delivers_with_vars_and_the_published_time()
    {
        var (e1, e2, e3) = (await _host.EmployeeAsync(), await _host.EmployeeAsync(), await _host.EmployeeAsync());
        var inactive = await _host.EmployeeAsync(status: EmployeeStatuses.Inactive);
        var unknown = NewCode();
        var key = NewKey();
        var jobsBefore = await JobsAsync();

        var report = await ImportAsync(Post(key, recipients: new()
        {
            [e1] = [Row(("HoTen", "Nguyễn Văn A"), ("HeSo", "4.98"))],
            [e2] = [Row(("HoTen", "Trần Thị B"), ("HeSo", "3.00")), Row(("HoTen", "Trần Thị B"), ("HeSo", "3.33"))],   // multi-row vars
            [e3] = [],                                                                                                // no vars
            [inactive] = [Row(("HoTen", "Đã nghỉ"))],
            [unknown] = [Row(("HoTen", "Không có"))],
        }));

        var post = PostReport(report);
        Assert.Equal(key, (string?)post["legacyKey"]);
        Assert.Equal("created", (string?)post["outcome"]);
        Assert.Empty(post["issues"]!.AsArray());
        Assert.Equal(5, (int)post["recipients"]!);
        Assert.Equal(3, (int)post["deliveries"]!);
        Assert.Equal(3, (int)post["newDeliveries"]!);
        Assert.Equal(1, (int)post["unknownEmployees"]!);
        Assert.Equal(1, (int)post["inactiveEmployees"]!);
        Assert.Equal((1, 0, 0, 0, 3, 3), (Total(report, "created"), Total(report, "updated"), Total(report, "unchanged"), Total(report, "rejected"), Total(report, "deliveries"), Total(report, "newDeliveries")));
        var details = report["details"]!.AsArray().Select(d => ((string)d!["kind"]!, (string)d["code"]!)).ToHashSet();
        Assert.Equal(2, details.Count);
        Assert.Contains(("unknown_employee", unknown), details);
        Assert.Contains(("inactive_employee", inactive), details);

        var id = IdOf(report);
        var deliveries = (await DeliveriesAsync(id)).ToDictionary(d => d.EmployeeCode);
        Assert.Equal(new[] { e1, e2, e3 }.Order(), deliveries.Keys.Order());
        Assert.All(deliveries.Values, d =>
        {
            Assert.Equal(May15.UtcTicks, d.DeliveredAt.UtcTicks);
            Assert.Equal(May15.UtcTicks, d.ReadAt!.Value.UtcTicks);
            Assert.Null(d.AcknowledgedAt);
        });
        var vars1 = JsonNode.Parse(deliveries[e1].Vars!)!.AsArray();
        Assert.Equal("Nguyễn Văn A", (string?)vars1.Single()!["HoTen"]);
        Assert.Equal("4.98", (string?)vars1.Single()!["HeSo"]);
        Assert.Equal(["3.00", "3.33"], JsonNode.Parse(deliveries[e2].Vars!)!.AsArray().Select(r => (string)r!["HeSo"]!).ToArray());
        Assert.Null(deliveries[e3].Vars);

        var n = await NotificationAsync(id);
        Assert.Equal("published", n.Status);
        Assert.Equal(1, n.Version);
        Assert.Null(n.CreatedBy);
        Assert.Null(n.UpdatedBy);
        Assert.Equal(May15.UtcTicks, n.PublishedAt!.Value.UtcTicks);
        Assert.Equal(May15.UtcTicks, n.PublishAt!.Value.UtcTicks);
        Assert.Equal((3, 3, 0), (n.RecipientCount, n.ReadCount, n.AckCount));
        Assert.StartsWith("Kính gửi Thầy/Cô", n.Summary);
        Assert.False(n.SummaryIsCustom);

        // One applied recipient import and one import audience (the editor's data model).
        var import = await _host.DbAsync(db => db.Set<NotificationRecipientImport>().AsNoTracking().SingleAsync(i => i.NotificationId == id));
        Assert.Equal("applied", import.Status);
        Assert.Equal(5, JsonNode.Parse(import.Rows)!.AsObject().Count);
        var audience = await _host.DbAsync(db => db.Set<NotificationAudience>().AsNoTracking().SingleAsync(a => a.NotificationId == id));
        Assert.Equal((AudienceKinds.Import, import.Id), (audience.Kind, audience.ImportId));

        // No jobs; the audit entry holds counts only.
        Assert.Equal(jobsBefore, await JobsAsync());
        var audit = await _host.DbAsync(db => db.Database
            .SqlQueryRaw<string>("SELECT details::text AS \"Value\" FROM audit_log WHERE action = 'legacy.notifications' ORDER BY id DESC LIMIT 1").SingleAsync());
        Assert.DoesNotContain(e1, audit);
        Assert.DoesNotContain(key, audit);
    }

    [Fact]
    public async Task Without_markRead_deliveries_stay_unread()
    {
        var e1 = await _host.EmployeeAsync();
        var report = await ImportAsync(Post(markRead: false, recipients: new() { [e1] = [Row(("HoTen", "A"))] }));

        var d = Assert.Single(await DeliveriesAsync(IdOf(report)));
        Assert.Equal(May15.UtcTicks, d.DeliveredAt.UtcTicks);
        Assert.Null(d.ReadAt);
        Assert.Equal(0, (await NotificationAsync(IdOf(report))).ReadCount);
    }

    [Fact]
    public async Task Empty_row_objects_mean_no_vars()
    {
        var (a, b) = (await _host.EmployeeAsync(), await _host.EmployeeAsync());
        var report = await ImportAsync(Post(body: "Không có biến nào.", variables: [], recipients: new() { [a] = [Row()], [b] = [] }));

        var deliveries = await DeliveriesAsync(IdOf(report));
        Assert.Equal(2, deliveries.Count);
        Assert.All(deliveries, d => Assert.Null(d.Vars));
    }

    // ------------------------------------------------------------ audienceAll

    [Fact]
    public async Task AudienceAll_reaches_only_active_employees_with_an_email()
    {
        var withEmail = await _host.EmployeeAsync(emails: [NewEmail()]);
        var withoutEmail = await _host.EmployeeAsync();
        var inactive = await _host.EmployeeAsync(status: EmployeeStatuses.Inactive, emails: [NewEmail()]);

        var report = await ImportAsync(Post(body: "Thông báo chung.", variables: [], all: true));

        var id = IdOf(report);
        var delivered = (await DeliveriesAsync(id)).Select(d => d.EmployeeCode).ToHashSet();
        var expected = (await _host.DbAsync(db => db.Database.SqlQueryRaw<string>(
            "SELECT e.code AS \"Value\" FROM employees e WHERE e.status = 'active' AND EXISTS (SELECT 1 FROM employee_emails m WHERE m.employee_code = e.code)")
            .ToListAsync())).ToHashSet();
        Assert.Equal(expected, delivered);
        Assert.Contains(withEmail, delivered);
        Assert.DoesNotContain(withoutEmail, delivered);
        Assert.DoesNotContain(inactive, delivered);

        var post = PostReport(report);
        Assert.Equal(delivered.Count, (int)post["deliveries"]!);
        Assert.Equal(delivered.Count, (int)post["newDeliveries"]!);
        var n = await NotificationAsync(id);
        Assert.True(n.AudienceAll);
        Assert.Equal(delivered.Count, n.RecipientCount);
        Assert.Equal(0, await _host.ScalarAsync("SELECT count(*)::int AS \"Value\" FROM notification_audiences WHERE notification_id = {0}", id));
        Assert.All(await DeliveriesAsync(id), d => { Assert.Null(d.Vars); Assert.Equal(May15.UtcTicks, d.ReadAt!.Value.UtcTicks); });

        // An employee who gets an email later is picked up by the next run (nothing else changes).
        await ExecAsync("INSERT INTO employee_emails (email, employee_code, is_primary) VALUES ({0}, {1}, true)", NewEmail(), withoutEmail);
        var again = await ImportAsync(Post(PostKey(report), body: "Thông báo chung.", variables: [], all: true));
        Assert.Equal("unchanged", (string?)PostReport(again)["outcome"]);
        Assert.Equal(1, (int)PostReport(again)["newDeliveries"]!);
        Assert.Contains(withoutEmail, (await DeliveriesAsync(id)).Select(d => d.EmployeeCode));
    }

    private static string PostKey(JsonNode report, int index = 0) => (string)PostReport(report, index)["legacyKey"]!;

    // ------------------------------------------------------------ validation

    [Fact]
    public async Task Invalid_posts_are_rejected_while_the_others_succeed()
    {
        var e1 = await _host.EmployeeAsync();
        var recipients = new Dictionary<string, object[]> { [e1] = [Row(("HoTen", "A"))] };
        var (good1, bad, bad2, noRecipients, good2) = (NewKey(), NewKey(), NewKey(), NewKey(), NewKey());

        var report = await ImportAsync(
            Post(good1, recipients: recipients),
            Post(bad, body: "<script>alert(1)</script>", recipients: recipients),
            Post(bad2, body: "Biến :var[KhongKhaiBao] chưa khai báo", recipients: recipients),
            Post(noRecipients),
            Post(good2, recipients: recipients));

        Assert.Equal(["created", "rejected", "rejected", "rejected", "created"], report["posts"]!.AsArray().Select(p => (string)p!["outcome"]!).ToArray());
        Assert.Equal((2, 0, 0, 3), (Total(report, "created"), Total(report, "updated"), Total(report, "unchanged"), Total(report, "rejected")));
        Assert.Contains("RAW_HTML", PostReport(report, 1)["issues"]!.AsArray().Select(i => (string)i!));
        Assert.Contains("UNDECLARED_PLACEHOLDER", PostReport(report, 2)["issues"]!.AsArray().Select(i => (string)i!));
        Assert.Contains("RECIPIENTS_REQUIRED", PostReport(report, 3)["issues"]!.AsArray().Select(i => (string)i!));

        foreach (var rejected in new[] { bad, bad2, noRecipients })
            Assert.Equal(0, await _host.ScalarAsync("SELECT count(*)::int AS \"Value\" FROM notifications WHERE id = {0}", LegacyIds.NotificationId(rejected, May15)));
        Assert.Single(await DeliveriesAsync(IdOf(report, 0)));
        Assert.Single(await DeliveriesAsync(IdOf(report, 4)));
    }

    [Fact]
    public async Task A_repeated_key_in_one_batch_is_rejected_the_second_time()
    {
        var e1 = await _host.EmployeeAsync();
        var key = NewKey();
        var report = await ImportAsync(Post(key, recipients: new() { [e1] = [Row()] }), Post(key, recipients: new() { [e1] = [Row()] }));

        Assert.Equal(["created", "rejected"], report["posts"]!.AsArray().Select(p => (string)p!["outcome"]!).ToArray());
        Assert.Contains("DUPLICATE_KEY", PostReport(report, 1)["issues"]!.AsArray().Select(i => (string)i!));
    }

    // ------------------------------------------------------------ ids

    [Fact]
    public async Task Id_is_deterministic_and_time_ordered()
    {
        var e1 = await _host.EmployeeAsync();
        var recipients = new Dictionary<string, object[]> { [e1] = [Row()] };
        var (olderKey, newerKey) = (NewKey(), NewKey());
        var older = new DateTimeOffset(2020, 1, 2, 3, 4, 5, 678, TimeSpan.FromHours(7));
        var newer = new DateTimeOffset(2025, 6, 1, 0, 0, 0, TimeSpan.Zero);

        var first = await ImportAsync(Post(newerKey, at: newer, recipients: recipients), Post(olderKey, at: older, recipients: recipients));
        var (newerId, olderId) = (IdOf(first, 0), IdOf(first, 1));

        Assert.Equal(LegacyIds.NotificationId(newerKey, newer), newerId);
        Assert.Equal(LegacyIds.NotificationId(olderKey, older), olderId);
        Assert.NotEqual(LegacyIds.NotificationId(olderKey, older), LegacyIds.NotificationId(newerKey, older));

        // UUID v7 layout: millisecond timestamp, version 7, RFC variant.
        var text = olderId.ToString("N");
        Assert.Equal(older.ToUnixTimeMilliseconds(), Convert.ToInt64(text[..12], 16));
        Assert.Equal('7', text[12]);
        Assert.Contains(text[16], "89ab");

        // Time-ordered, also in PostgreSQL's byte order.
        Assert.True(string.CompareOrdinal(olderId.ToString(), newerId.ToString()) < 0);
        var sorted = await _host.DbAsync(db => db.Database.SqlQueryRaw<Guid>(
            "SELECT id AS \"Value\" FROM notifications WHERE id = ANY({0}) ORDER BY id", new[] { newerId, olderId }).ToListAsync());
        Assert.Equal(new[] { olderId, newerId }, sorted);

        // The same post maps to the same row on a re-run.
        var second = await ImportAsync(Post(newerKey, at: newer, recipients: recipients));
        Assert.Equal(newerId, IdOf(second));
        Assert.Equal(1, await _host.ScalarAsync("SELECT count(*)::int AS \"Value\" FROM notifications WHERE id = {0}", newerId));
    }

    // ------------------------------------------------------------ idempotence

    [Fact]
    public async Task A_second_run_is_unchanged_adds_nothing_and_keeps_read_and_ack_state()
    {
        var (e1, e2) = (await _host.EmployeeAsync(), await _host.EmployeeAsync());
        var wasInactive = await _host.EmployeeAsync(status: EmployeeStatuses.Inactive);
        var series = "Chuỗi " + Guid.NewGuid().ToString("N")[..8];
        var post = Post(NewKey(), recipients: new()
        {
            [e1] = [Row(("HoTen", "A"), ("HeSo", "1"))], [e2] = [Row(("HoTen", "B"), ("HeSo", "2"))], [wasInactive] = [Row(("HoTen", "C"), ("HeSo", "3"))],
        }, tags: ["Lương", "Thẻ " + Guid.NewGuid().ToString("N")[..8]], series: series, requiresAck: true, pinnedUntil: new DateTimeOffset(2030, 1, 1, 0, 0, 0, TimeSpan.Zero));

        var first = await ImportAsync(post);
        var id = IdOf(first);
        Assert.Equal(2, (int)PostReport(first)["newDeliveries"]!);

        // Employees interact with the post, then the importer runs again.
        await ExecAsync("UPDATE notification_deliveries SET read_at = NULL, acknowledged_at = now() WHERE notification_id = {0} AND employee_code = {1}", id, e1);
        await ExecAsync("UPDATE notification_deliveries SET read_at = NULL WHERE notification_id = {0} AND employee_code = {1}", id, e2);
        var before = (await DeliveriesAsync(id)).ToDictionary(d => d.EmployeeCode);
        var versionRows = await CountAsync("notification_revisions");
        var jobs = await JobsAsync();

        var second = await ImportAsync(post);
        Assert.Equal(id, IdOf(second));
        Assert.Equal("unchanged", (string?)PostReport(second)["outcome"]);
        Assert.Equal((0, 0, 1, 0, 0), (Total(second, "created"), Total(second, "updated"), Total(second, "unchanged"), Total(second, "rejected"), Total(second, "newDeliveries")));
        var after = (await DeliveriesAsync(id)).ToDictionary(d => d.EmployeeCode);
        Assert.Equal(before.Keys.Order(), after.Keys.Order());
        Assert.Null(after[e1].ReadAt);
        Assert.Equal(before[e1].AcknowledgedAt, after[e1].AcknowledgedAt);
        Assert.NotNull(after[e1].AcknowledgedAt);
        Assert.Null(after[e2].ReadAt);
        var n = await NotificationAsync(id);
        Assert.Equal(1, n.Version);
        Assert.Equal((2, 0, 1), (n.RecipientCount, n.ReadCount, n.AckCount));   // counters are recomputed, not reset
        Assert.Equal(versionRows, await CountAsync("notification_revisions"));
        Assert.Equal(1, await _host.ScalarAsync("SELECT count(*)::int AS \"Value\" FROM notification_series WHERE name = {0}", series));
        Assert.Equal(jobs, await JobsAsync());

        // A recipient who was inactive and became active gets the missing delivery on the next run.
        await ExecAsync("UPDATE employees SET status = 'active' WHERE code = {0}", wasInactive);
        var third = await ImportAsync(post);
        Assert.Equal("unchanged", (string?)PostReport(third)["outcome"]);
        Assert.Equal(1, (int)PostReport(third)["newDeliveries"]!);
        Assert.Equal(3, (await NotificationAsync(id)).RecipientCount);
        Assert.Equal(May15.UtcTicks, (await DeliveriesAsync(id)).Single(d => d.EmployeeCode == wasInactive).ReadAt!.Value.UtcTicks);
    }

    [Fact]
    public async Task Changed_content_updates_in_place_with_a_revision_and_keeps_delivery_state()
    {
        var (e1, e2, e5) = (await _host.EmployeeAsync(), await _host.EmployeeAsync(), await _host.EmployeeAsync());
        var key = NewKey();
        var newTag = "Thẻ " + Guid.NewGuid().ToString("N")[..8];
        var series = "Chuỗi " + Guid.NewGuid().ToString("N")[..8];
        var pin = new DateTimeOffset(2030, 1, 1, 0, 0, 0, TimeSpan.Zero);

        var created = await ImportAsync(Post(key, recipients: new() { [e1] = [Row(("HoTen", "A"), ("HeSo", "1"))], [e2] = [Row(("HoTen", "B"), ("HeSo", "2"))] },
            tags: ["Lương", newTag], series: series));
        var id = IdOf(created);
        Assert.Equal(1, await _host.ScalarAsync("SELECT count(*)::int AS \"Value\" FROM tags WHERE name = {0}", newTag));   // unknown tags are created
        Assert.Equal(2, await _host.ScalarAsync("SELECT count(*)::int AS \"Value\" FROM notification_tags WHERE notification_id = {0}", id));
        Assert.NotNull((await NotificationAsync(id)).SeriesId);
        await ExecAsync("UPDATE notification_deliveries SET acknowledged_at = now() WHERE notification_id = {0} AND employee_code = {1}", id, e1);
        var ackedAt = (await DeliveriesAsync(id)).Single(d => d.EmployeeCode == e1).AcknowledgedAt;

        var changed = Post(key, title: "Tiêu đề mới", body: "Nội dung đã sửa, :var[HoTen] nhận hệ số :var[HeSo].", requiresAck: true, pinnedUntil: pin,
            tags: [newTag], series: series, recipients: new()
            {
                [e1] = [Row(("HoTen", "A (sửa)"), ("HeSo", "9"))], [e2] = [Row(("HoTen", "B"), ("HeSo", "2"))], [e5] = [Row(("HoTen", "E"), ("HeSo", "5"))],
            });
        var updated = await ImportAsync(changed);

        Assert.Equal(id, IdOf(updated));
        Assert.Equal("updated", (string?)PostReport(updated)["outcome"]);
        Assert.Equal(1, (int)PostReport(updated)["newDeliveries"]!);
        Assert.Equal((0, 1, 0), (Total(updated, "created"), Total(updated, "updated"), Total(updated, "unchanged")));
        var n = await NotificationAsync(id);
        Assert.Equal(("Tiêu đề mới", 2, true), (n.Title, n.Version, n.RequiresAck));
        Assert.NotNull(n.ContentUpdatedAt);
        Assert.Equal(pin.UtcTicks, n.PinnedUntil!.Value.UtcTicks);
        Assert.Equal((3, 3, 1), (n.RecipientCount, n.ReadCount, n.AckCount));   // e5 is new and read-at-publish; e1 keeps its ack

        var revision = await _host.DbAsync(db => db.Set<NotificationRevision>().AsNoTracking().SingleAsync(r => r.NotificationId == id));
        Assert.Equal((2, "Tiêu đề mới", n.BodyMd), (revision.Version, revision.Title, revision.Content));
        Assert.Equal(new[] { newTag }, await _host.DbAsync(db => db.Set<NotificationTag>().Where(t => t.NotificationId == id)
            .Join(db.Set<Tag>(), t => t.TagId, t => t.Id, (_, t) => t.Name).ToListAsync()));

        var deliveries = (await DeliveriesAsync(id)).ToDictionary(d => d.EmployeeCode);
        Assert.Equal(3, deliveries.Count);
        Assert.Equal("A (sửa)", (string?)JsonNode.Parse(deliveries[e1].Vars!)!.AsArray().Single()!["HoTen"]);   // vars refreshed
        Assert.Equal(ackedAt, deliveries[e1].AcknowledgedAt);                                                    // state kept
        Assert.Equal(May15.UtcTicks, deliveries[e5].ReadAt!.Value.UtcTicks);

        // The same payload again is unchanged: every comparison survives the database round trip.
        var again = await ImportAsync(changed);
        Assert.Equal("unchanged", (string?)PostReport(again)["outcome"]);
        Assert.Equal(2, (await NotificationAsync(id)).Version);
        Assert.Equal(1, await CountRevisionsAsync(id));
    }

    private Task<int> CountRevisionsAsync(Guid id) =>
        _host.ScalarAsync("SELECT count(*)::int AS \"Value\" FROM notification_revisions WHERE notification_id = {0}", id);

    [Fact]
    public async Task A_large_post_is_written_set_based()
    {
        const int count = 3000;
        var prefix = "B" + Guid.NewGuid().ToString("N")[..6].ToUpperInvariant();
        await ExecAsync("INSERT INTO employees (code, full_name) SELECT {0} || g, 'Người thử ' || g FROM generate_series(1, {1}) g", prefix, count);
        var recipients = Enumerable.Range(1, count).ToDictionary(i => prefix + i, i => new object[] { Row(("HoTen", $"Người thử {i}"), ("HeSo", "2.34")) });

        var report = await ImportAsync(Post(recipients: recipients));
        Assert.Equal(count, (int)PostReport(report)["newDeliveries"]!);
        Assert.Equal(count, (await NotificationAsync(IdOf(report))).RecipientCount);

        var again = await ImportAsync(Post(PostKey(report), recipients: recipients));
        Assert.Equal("unchanged", (string?)PostReport(again)["outcome"]);
        Assert.Equal(0, (int)PostReport(again)["newDeliveries"]!);
    }

    // ------------------------------------------------------------ inbox + dry run

    [Fact]
    public async Task Imported_posts_show_up_in_the_employee_inbox()
    {
        var (e1, other) = (await _host.EmployeeAsync(), await _host.EmployeeAsync());
        var read = Post(title: "Bài đã đọc", at: May15, markRead: true, recipients: new() { [e1] = [Row(("HoTen", "Nguyễn A"), ("HeSo", "4.98"))] });
        var unread = Post(title: "Bài chưa đọc", at: May15.AddDays(20), markRead: false, recipients: new() { [e1] = [Row(("HoTen", "Nguyễn A"), ("HeSo", "5.00"))] });
        var report = await ImportAsync(read, unread);

        var inbox = await _host.SignInAsync(e1);
        var list = await inbox.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, "/api/notifications");
        var items = list["items"]!.AsArray();
        Assert.Equal(["Bài chưa đọc", "Bài đã đọc"], items.Select(i => (string)i!["title"]!).ToArray());   // newest delivery first
        Assert.Null(items[0]!["readAt"]);
        Assert.NotNull(items[1]!["readAt"]);
        Assert.Equal(May15.UtcTicks, DateTimeOffset.Parse((string)items[1]!["deliveredAt"]!).UtcTicks);
        Assert.Equal(May15.UtcTicks, DateTimeOffset.Parse((string)items[1]!["publishedAt"]!).UtcTicks);
        Assert.Equal(1, (int)(await inbox.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, "/api/notifications/unread-count"))["count"]!);

        var detail = await inbox.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, $"/api/notifications/{IdOf(report, 0)}");
        Assert.Equal("Nguyễn A", (string?)detail["vars"]![0]!["HoTen"]);
        Assert.Equal(Body, (string?)detail["bodyMd"]);

        var stranger = await _host.SignInAsync(other);
        Assert.Empty((await stranger.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, "/api/notifications"))["items"]!.AsArray());
    }

    [Fact]
    public async Task Dry_run_reports_the_same_but_writes_nothing()
    {
        var (e1, e2) = (await _host.EmployeeAsync(), await _host.EmployeeAsync());
        var tag = "Thẻ " + Guid.NewGuid().ToString("N")[..8];
        var series = "Chuỗi " + Guid.NewGuid().ToString("N")[..8];
        var post = Post(tags: [tag], series: series, recipients: new() { [e1] = [Row(("HoTen", "A"))], [e2] = [Row(("HoTen", "B"))], [NewCode()] = [Row()] });
        string[] tables = ["notifications", "notification_deliveries", "notification_recipient_imports", "notification_audiences", "notification_tags", "tags", "notification_series"];
        var before = new List<int>();
        foreach (var t in tables) before.Add(await CountAsync(t));
        var auditBefore = await _host.ScalarAsync("SELECT count(*)::int AS \"Value\" FROM audit_log WHERE action = 'legacy.notifications'");

        var dry = await DryRunAsync(post);

        Assert.True((bool)dry["dryRun"]!);
        Assert.Equal(1, Total(dry, "created"));
        Assert.Equal(2, Total(dry, "newDeliveries"));
        Assert.Equal(1, (int)PostReport(dry)["unknownEmployees"]!);
        var after = new List<int>();
        foreach (var t in tables) after.Add(await CountAsync(t));
        Assert.Equal(before, after);
        Assert.Equal(auditBefore, await _host.ScalarAsync("SELECT count(*)::int AS \"Value\" FROM audit_log WHERE action = 'legacy.notifications'"));
        Assert.Equal(0, await _host.ScalarAsync("SELECT count(*)::int AS \"Value\" FROM tags WHERE name = {0}", tag));

        var real = await ImportAsync(post);
        Assert.Equal(dry["totals"]!.ToJsonString(), real["totals"]!.ToJsonString());
        Assert.Equal((string?)PostReport(dry)["id"], (string?)PostReport(real)["id"]);
        Assert.Equal(2, (await DeliveriesAsync(IdOf(real))).Count);
    }
}
