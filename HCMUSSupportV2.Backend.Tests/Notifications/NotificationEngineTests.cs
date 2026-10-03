using System.Net;
using System.Text;
using System.Text.Json.Nodes;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Modules.Identity.Groups;
using HCMUSSupportV2.Backend.Modules.Notifications.Domain;
using HCMUSSupportV2.Backend.Modules.Notifications.Publishing;
using HCMUSSupportV2.Backend.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static HCMUSSupportV2.Backend.Tests.Notifications.NotificationsHost;

namespace HCMUSSupportV2.Backend.Tests.Notifications;

/// <summary>Editor API, audiences, scheduling, late joiners, inbox and SSE against a real database and job worker.</summary>
[Collection(PostgresCollection.Name)]
public class NotificationEngineTests(PostgresFixture database) : IAsyncLifetime
{
    private NotificationsHost _host = null!;

    public Task InitializeAsync()
    {
        _host = new NotificationsHost(database);
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    private const string Manage = "/api/manage/notifications";

    // ------------------------------------------------------------ security

    [Fact]
    public async Task Manage_endpoints_need_the_editor_role()
    {
        var anon = _host.Factory.CreateSessionClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.GetAsync(Manage)).StatusCode);

        var employee = await _host.SignInAsync(await _host.EmployeeAsync());
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.GetAsync(Manage)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.PostAsync(Manage, Draft())).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.GetAsync("/api/manage/tags")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.PostAsync("/api/manage/series", new { name = "x" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.GetAsync($"{Manage}/{Guid.NewGuid()}/stats")).StatusCode);

        // The inbox is open to every signed-in employee, anonymous gets 401.
        Assert.Equal(HttpStatusCode.OK, (await employee.GetAsync("/api/notifications")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.GetAsync("/api/notifications")).StatusCode);
    }

    // ------------------------------------------------------------ drafts and validation

    [Fact]
    public async Task Create_get_update_and_delete_a_draft()
    {
        var editor = await _host.EditorApiAsync();
        var created = await editor.ExpectAsync(HttpStatusCode.Created, HttpMethod.Post, Manage,
            Draft("Tiêu đề", "Đoạn đầu **đậm**.\n\nĐoạn hai :var[HoTen]", variables: new[] { new { key = "HoTen", label = "Họ tên", type = "text" } }));
        var id = created["id"]!.GetValue<string>();
        Assert.Equal("draft", (string?)created["status"]);
        Assert.Equal(1, (int?)created["version"]);
        Assert.Equal("Đoạn đầu đậm.", (string?)created["summary"]);
        Assert.False((bool?)created["summaryIsCustom"]);
        Assert.Equal("Đoạn đầu đậm.\nĐoạn hai", (string?)created["contentText"]); // the placeholder adds no text
        Assert.Equal(editor.Code, (string?)created["createdBy"]!["code"]);

        var updated = await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Put, $"{Manage}/{id}",
            Draft("Tiêu đề mới", "Nội dung mới", version: 1, summary: "Tóm tắt riêng"));
        Assert.Equal(2, (int?)updated["version"]);
        Assert.Equal("Tóm tắt riêng", (string?)updated["summary"]);
        Assert.True((bool?)updated["summaryIsCustom"]);
        // A draft does not accumulate revisions.
        Assert.Empty((await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, $"{Manage}/{id}/revisions")).AsArray());

        await editor.ExpectAsync(HttpStatusCode.NoContent, HttpMethod.Delete, $"{Manage}/{id}");
        Assert.Equal(HttpStatusCode.NotFound, (await editor.GetAsync($"{Manage}/{id}")).StatusCode);
    }

    [Fact]
    public async Task Invalid_bodies_and_fields_are_rejected_with_a_per_field_error_map()
    {
        var editor = await _host.EditorApiAsync();
        var body = await editor.ExpectAsync(HttpStatusCode.BadRequest, HttpMethod.Post, Manage,
            Draft("", "<b>html</b>\n\n[x](javascript:a) :var[Khac]", tags: [99999], groups: [99999], employees: ["KHONG_CO"]));
        var errors = body["errors"]!.AsObject();
        Assert.True(errors.ContainsKey("title"));
        Assert.True(errors.ContainsKey("bodyMd"));
        Assert.True(errors["bodyMd"]!.AsArray().Count >= 3);
        Assert.Contains("Dòng 1", errors["bodyMd"]![0]!.GetValue<string>());
        Assert.True(errors.ContainsKey("tagIds"));
        Assert.True(errors.ContainsKey("groupIds"));
        Assert.Contains("KHONG_CO", errors["employeeCodes"]![0]!.GetValue<string>());

        var vars = await editor.ExpectAsync(HttpStatusCode.BadRequest, HttpMethod.Post, Manage,
            Draft(variables: new object[] { new { key = "1bad", label = "x", type = "text" }, new { key = "A", label = "x", type = "weird" } }));
        Assert.Equal(2, vars["errors"]!["variables"]!.AsArray().Count);
    }

    [Fact]
    public async Task Update_with_a_stale_version_answers_409_and_never_overwrites()
    {
        var editor = await _host.EditorApiAsync();
        var id = await CreateAsync(editor, Draft("Gốc"));
        await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Put, $"{Manage}/{id}", Draft("Lần 2", version: 1));

        var conflict = await editor.ExpectAsync(HttpStatusCode.Conflict, HttpMethod.Put, $"{Manage}/{id}", Draft("Ghi đè", version: 1));
        Assert.Equal(2, (int?)conflict["currentVersion"]);
        Assert.Equal("Lần 2", (string?)(await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, $"{Manage}/{id}"))["title"]);
        await editor.ExpectAsync(HttpStatusCode.BadRequest, HttpMethod.Put, $"{Manage}/{id}", Draft("Thiếu version"));
    }

    [Fact]
    public async Task Editing_after_publish_bumps_the_version_and_writes_revisions()
    {
        var editor = await _host.EditorApiAsync();
        var reader = await _host.EmployeeAsync();
        var id = await _host.PublishAsync(editor, Draft("V1", "Nội dung 1", employees: [reader]));

        var detail = await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, $"{Manage}/{id}");
        Assert.Equal(1, (int?)detail["version"]);
        await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Put, $"{Manage}/{id}", Draft("V2", "Nội dung 2", employees: [reader], version: 1));
        await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Put, $"{Manage}/{id}", Draft("V3", "Nội dung 3", employees: [reader], version: 2));

        var revisions = (await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, $"{Manage}/{id}/revisions")).AsArray();
        Assert.Equal([3, 2, 1], revisions.Select(r => (int)r!["version"]!).ToArray());
        Assert.Equal("V1", (string?)revisions[2]!["title"]); // the first revision is the content as published
        Assert.Equal("Nội dung 3", (string?)revisions[0]!["bodyMd"]);

        // The recipient sees the new content (and no "updated" marker).
        var inbox = await _host.SignInAsync(reader);
        var item = (await inbox.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, "/api/notifications"))["items"]!.AsArray().Single();
        Assert.Null(item["updatedAfterDelivery"]);
        Assert.Equal("V3", (string?)item["title"]);
    }

    [Fact]
    public async Task Adding_a_recipient_to_a_published_notification_delivers_to_them_and_never_recalls()
    {
        var first = await _host.EmployeeAsync();
        var second = await _host.EmployeeAsync();
        var editor = await _host.EditorApiAsync();
        var id = await _host.PublishAsync(editor, Draft("Bổ sung người nhận", employees: [first]));

        // Replace the audience: the new person is delivered, the removed one keeps what they already received.
        await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Put, $"{Manage}/{id}", Draft("Bổ sung người nhận", employees: [second], version: 1));

        Assert.True(await Wait.UntilAsync(async () => (await _host.RecipientsAsync(id)).Contains(second), TimeSpan.FromSeconds(20)));
        Assert.Contains(first, await _host.RecipientsAsync(id));
    }

    [Fact]
    public async Task Only_drafts_can_be_deleted()
    {
        var editor = await _host.EditorApiAsync();
        var id = await _host.PublishAsync(editor, Draft(employees: [await _host.EmployeeAsync()]));
        await editor.ExpectAsync(HttpStatusCode.Conflict, HttpMethod.Delete, $"{Manage}/{id}");
    }

    [Fact]
    public async Task Publishing_needs_content_and_an_audience()
    {
        var editor = await _host.EditorApiAsync();
        var empty = await CreateAsync(editor, Draft("Chưa đủ", body: ""));
        var error = await editor.ExpectAsync(HttpStatusCode.BadRequest, HttpMethod.Post, $"{Manage}/{empty}/publish");
        Assert.True(error["errors"]!.AsObject().ContainsKey("bodyMd"));
        Assert.True(error["errors"]!.AsObject().ContainsKey("audience"));
        await editor.ExpectAsync(HttpStatusCode.BadRequest, HttpMethod.Post, $"{Manage}/{empty}/schedule", new { publishAt = DateTimeOffset.UtcNow.AddHours(-1) });
    }

    // ------------------------------------------------------------ audiences

    [Fact]
    public async Task Audience_all_reaches_every_active_employee_with_an_email_and_nobody_else()
    {
        var withEmail = await _host.EmployeeAsync();
        var inactive = await _host.EmployeeAsync(status: EmployeeStatuses.Inactive);
        var retired = await _host.EmployeeAsync(status: EmployeeStatuses.Retired);
        var noEmail = await _host.EmployeeAsync(emails: []);
        var editor = await _host.EditorApiAsync();

        var id = await _host.PublishAsync(editor, Draft("Cho tất cả", all: true));
        var recipients = await _host.RecipientsAsync(id);

        Assert.Contains(withEmail, recipients);
        Assert.Contains(editor.Code, recipients);
        Assert.DoesNotContain(inactive, recipients);
        Assert.DoesNotContain(retired, recipients);
        Assert.DoesNotContain(noEmail, recipients);
        var expected = await _host.ScalarAsync("""
            SELECT count(*)::int AS "Value" FROM employees e WHERE e.status = 'active' AND EXISTS (SELECT 1 FROM employee_emails m WHERE m.employee_code = e.code)
            """);
        Assert.Equal(expected, recipients.Count);

        var detail = await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, $"{Manage}/{id}");
        Assert.Equal(expected, (int?)detail["recipientCount"]);
        Assert.NotNull(detail["publishedAt"]);
    }

    [Fact]
    public async Task Group_audience_reaches_exactly_the_active_members()
    {
        var a = await _host.EmployeeAsync();
        var b = await _host.EmployeeAsync();
        var inactive = await _host.EmployeeAsync(status: EmployeeStatuses.Inactive);
        var outsider = await _host.EmployeeAsync();
        var group = await _host.CreateGroupAsync(a, b, inactive);
        var otherGroup = await _host.CreateGroupAsync(outsider);
        var editor = await _host.EditorApiAsync();

        var id = await _host.PublishAsync(editor, Draft("Cho nhóm", groups: [group]));

        Assert.Equal(new[] { a, b }.Order().ToArray(), (await _host.RecipientsAsync(id)).Order().ToArray());
        Assert.NotEqual(group, otherGroup);
    }

    [Fact]
    public async Task Employee_audience_reaches_exactly_the_named_active_employees_and_overlaps_collapse()
    {
        var a = await _host.EmployeeAsync();
        var b = await _host.EmployeeAsync();
        var inactive = await _host.EmployeeAsync(status: EmployeeStatuses.Inactive);
        var bystander = await _host.EmployeeAsync();
        var group = await _host.CreateGroupAsync(a);
        var editor = await _host.EditorApiAsync();

        var id = await _host.PublishAsync(editor, Draft(groups: [group], employees: [a, b, inactive]));

        Assert.Equal(new[] { a, b }.Order().ToArray(), (await _host.RecipientsAsync(id)).Order().ToArray());
        Assert.DoesNotContain(bystander, await _host.RecipientsAsync(id));
        Assert.Equal(2, (int?)(await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, $"{Manage}/{id}"))["recipientCount"]);
    }

    [Fact]
    public async Task Import_audience_reaches_exactly_the_sheet_rows_with_their_variables()
    {
        var a = await _host.EmployeeAsync();
        var b = await _host.EmployeeAsync();
        var inactive = await _host.EmployeeAsync(status: EmployeeStatuses.Inactive);
        var bystander = await _host.EmployeeAsync();
        var editor = await _host.EditorApiAsync();
        var id = await CreateAsync(editor, Draft("Có biến", "Chào :var[HoTen], hệ số :var[HeSoLuong]",
            variables: new[] { new { key = "HoTen", label = "Họ tên", type = "text" }, new { key = "HeSoLuong", label = "Hệ số lương", type = "number" } }));

        var report = await ImportAsync(editor, id, Xlsx(["MSCB", "Họ tên", "Hệ số lương"],
            [a, "Nguyễn A", "3.33"], [b, "Trần B", "4.00"], [b, "Trần B", "4.65"], [inactive, "Lê C", "2.34"]));
        Assert.Equal("validated", (string?)report["status"]);
        await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Post, $"{Manage}/{id}/imports/{report["importId"]!.GetValue<string>()}/apply");
        await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Post, $"{Manage}/{id}/publish");
        await _host.WaitForFanOutAsync(id);

        Assert.Equal(new[] { a, b }.Order().ToArray(), (await _host.RecipientsAsync(id)).Order().ToArray());
        Assert.DoesNotContain(bystander, await _host.RecipientsAsync(id));

        var detailB = await (await _host.SignInAsync(b)).ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, $"/api/notifications/{id}");
        var rows = detailB["vars"]!.AsArray();
        Assert.Equal(2, rows.Count);
        Assert.Equal("Trần B", (string?)rows[0]!["HoTen"]);
        Assert.Equal("4.65", (string?)rows[1]!["HeSoLuong"]);
        var detailA = await (await _host.SignInAsync(a)).ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, $"/api/notifications/{id}");
        Assert.Equal("3.33", (string?)detailA["vars"]![0]!["HeSoLuong"]);
    }

    // ------------------------------------------------------------ scheduling

    [Fact]
    public async Task A_scheduled_notification_is_invisible_until_publish_at_and_then_published_by_the_job()
    {
        var reader = await _host.EmployeeAsync();
        var editor = await _host.EditorApiAsync();
        var id = await CreateAsync(editor, Draft("Hẹn giờ", employees: [reader]));
        await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Post, $"{Manage}/{id}/schedule", new { publishAt = DateTimeOffset.UtcNow.AddSeconds(3) });

        var inbox = await _host.SignInAsync(reader);
        Assert.Empty((await inbox.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, "/api/notifications"))["items"]!.AsArray());
        Assert.Equal(HttpStatusCode.NotFound, (await inbox.GetAsync($"/api/notifications/{id}")).StatusCode);
        Assert.Equal("scheduled", (string?)(await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, $"{Manage}/{id}"))["status"]);

        Assert.True(await Wait.UntilAsync(async () => (await _host.RecipientsAsync(id)).Contains(reader), TimeSpan.FromSeconds(30)),
            "scheduled notification was not published");
        var items = (await inbox.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, "/api/notifications"))["items"]!.AsArray();
        Assert.Equal("Hẹn giờ", (string?)items.Single()!["title"]);
        Assert.Equal("published", (string?)(await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, $"{Manage}/{id}"))["status"]);
    }

    [Fact]
    public async Task The_sweeper_publishes_a_due_scheduled_notification_that_has_no_job()
    {
        var reader = await _host.EmployeeAsync();
        var editor = await _host.EditorApiAsync();
        var id = await CreateAsync(editor, Draft("Quên job", employees: [reader]));
        // A scheduled row whose job was lost: set the state directly, with publish_at already due.
        await _host.Factory.WithDbAsync(db => db.Database.ExecuteSqlRawAsync(
            "UPDATE notifications SET status = 'scheduled', publish_at = now() - interval '1 minute' WHERE id = {0}::uuid", id));

        Assert.True(await Wait.UntilAsync(async () => (await _host.RecipientsAsync(id)).Contains(reader), TimeSpan.FromSeconds(30)));
    }

    [Fact]
    public async Task Archiving_hides_the_notification_from_the_inbox_but_keeps_the_deliveries()
    {
        var reader = await _host.EmployeeAsync();
        var editor = await _host.EditorApiAsync();
        var id = await _host.PublishAsync(editor, Draft(employees: [reader]));
        var inbox = await _host.SignInAsync(reader);

        await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Post, $"{Manage}/{id}/archive");

        Assert.Empty((await inbox.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, "/api/notifications"))["items"]!.AsArray());
        Assert.Equal(HttpStatusCode.NotFound, (await inbox.GetAsync($"/api/notifications/{id}")).StatusCode);
        Assert.Single(await _host.RecipientsAsync(id));
        await editor.ExpectAsync(HttpStatusCode.Conflict, HttpMethod.Post, $"{Manage}/{id}/archive");
    }

    [Fact]
    public async Task Expired_notifications_are_not_visible()
    {
        var reader = await _host.EmployeeAsync();
        var editor = await _host.EditorApiAsync();
        var id = await _host.PublishAsync(editor, Draft(employees: [reader], expiresAt: DateTimeOffset.UtcNow.AddHours(1)));
        var inbox = await _host.SignInAsync(reader);
        Assert.Single((await inbox.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, "/api/notifications"))["items"]!.AsArray());

        await _host.Factory.WithDbAsync(db => db.Database.ExecuteSqlRawAsync("UPDATE notifications SET expires_at = now() - interval '1 second' WHERE id = {0}::uuid", id));
        Assert.Empty((await inbox.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, "/api/notifications"))["items"]!.AsArray());
        Assert.Equal(HttpStatusCode.NotFound, (await inbox.GetAsync($"/api/notifications/{id}")).StatusCode);
    }

    // ------------------------------------------------------------ late joiners

    [Fact]
    public async Task A_late_group_member_is_backfilled_through_the_observer()
    {
        var early = await _host.EmployeeAsync();
        var late = await _host.EmployeeAsync();
        var unrelated = await _host.EmployeeAsync();
        var group = await _host.CreateGroupAsync(early);
        var otherGroup = await _host.CreateGroupAsync();
        var editor = await _host.EditorApiAsync();
        var id = await _host.PublishAsync(editor, Draft("Cho nhóm", groups: [group]));
        var archived = await _host.PublishAsync(editor, Draft("Đã lưu trữ", groups: [group]));
        await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Post, $"{Manage}/{archived}/archive");

        await _host.Factory.WithDbAsync(async db =>
        {
            db.Set<GroupMember>().Add(new GroupMember { GroupId = group, EmployeeCode = late });
            db.Set<GroupMember>().Add(new GroupMember { GroupId = otherGroup, EmployeeCode = unrelated });
            await db.SaveChangesAsync();
            return 0;
        });
        await using (var scope = _host.Factory.Services.CreateAsyncScope())
        {
            foreach (var observer in scope.ServiceProvider.GetServices<IGroupMembershipObserver>())
            {
                await observer.OnMembersAddedAsync(group, [late], default);
                await observer.OnMembersAddedAsync(otherGroup, [unrelated], default);
            }
        }
        await _host.WaitForBackfillAsync();

        var recipients = await _host.RecipientsAsync(id);
        Assert.Contains(late, recipients);
        Assert.DoesNotContain(unrelated, recipients);
        Assert.DoesNotContain(late, await _host.RecipientsAsync(archived)); // archived posts are not backfilled
        Assert.Equal(2, (int?)(await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, $"{Manage}/{id}"))["recipientCount"]);
    }

    [Fact]
    public async Task A_newly_eligible_employee_is_backfilled_for_audience_all_posts()
    {
        var noEmailYet = await _host.EmployeeAsync(emails: []);
        var editor = await _host.EditorApiAsync();
        var id = await _host.PublishAsync(editor, Draft("Cho tất cả", all: true));
        Assert.DoesNotContain(noEmailYet, await _host.RecipientsAsync(id));

        await _host.Factory.WithDbAsync(async db =>
        {
            db.Set<EmployeeEmail>().Add(new EmployeeEmail { Email = IdentityTestSupport_Email(noEmailYet), EmployeeCode = noEmailYet, IsPrimary = true });
            await db.SaveChangesAsync();
            return 0;
        });
        await using (var scope = _host.Factory.Services.CreateAsyncScope())
            foreach (var observer in scope.ServiceProvider.GetServices<IEmployeeActivationObserver>())
                await observer.OnEmployeesActivatedAsync([noEmailYet], default);
        await _host.WaitForBackfillAsync();

        Assert.Contains(noEmailYet, await _host.RecipientsAsync(id));
    }

    private static string IdentityTestSupport_Email(string code) => $"{code.ToLowerInvariant()}@late.hcmus.local";

    // ------------------------------------------------------------ inbox

    [Fact]
    public async Task Full_text_search_finds_accented_titles_without_accents()
    {
        var reader = await _host.EmployeeAsync();
        var editor = await _host.EditorApiAsync();
        var hit = await _host.PublishAsync(editor, Draft("Thâm niên nhà giáo 2026", "Danh sách xét thâm niên", employees: [reader]));
        await _host.PublishAsync(editor, Draft("Nâng lương thường xuyên", "Khác hẳn", employees: [reader]));
        var inbox = await _host.SignInAsync(reader);

        foreach (var q in new[] { "tham nien", "THÂM NIÊN", "nha giao", "xet tham" })
        {
            var items = (await inbox.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, $"/api/notifications?q={Uri.EscapeDataString(q)}"))["items"]!.AsArray();
            Assert.True(items.Count == 1 && (string?)items[0]!["id"] == hit, $"query '{q}' returned {items.Count} items");
        }
        Assert.Empty((await inbox.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, "/api/notifications?q=khong-co-gi"))["items"]!.AsArray());

        // The editor list searches the same column.
        var manage = (await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, $"{Manage}?q=tham%20nien"))["items"]!.AsArray();
        Assert.Contains(manage, i => (string?)i!["id"] == hit);
    }

    [Fact]
    public async Task Inbox_is_paged_by_keyset_newest_first_and_filters()
    {
        var reader = await _host.EmployeeAsync();
        var editor = await _host.EditorApiAsync();
        var tags = await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, "/api/manage/tags");
        var tagId = tags[0]!["id"]!.GetValue<long>();

        var ids = new List<string>();
        for (var i = 1; i <= 5; i++)
        {
            ids.Add(await _host.PublishAsync(editor, Draft($"Bài {i}", employees: [reader], tags: i == 2 ? [tagId] : [])));
            await Task.Delay(30);
        }
        var inbox = await _host.SignInAsync(reader);

        var page1 = await inbox.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, "/api/notifications?limit=2");
        var seen = page1["items"]!.AsArray().Select(i => (string)i!["id"]!).ToList();
        Assert.Equal(ids[4], seen[0]); // newest delivery first, pinning has no effect
        var cursor = (string?)page1["nextCursor"];
        Assert.NotNull(cursor);
        while (cursor is not null)
        {
            var page = await inbox.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, $"/api/notifications?limit=2&cursor={Uri.EscapeDataString(cursor)}");
            seen.AddRange(page["items"]!.AsArray().Select(i => (string)i!["id"]!));
            cursor = (string?)page["nextCursor"];
        }
        Assert.Equal(new[] { ids[4], ids[3], ids[2], ids[1], ids[0] }, seen);
        Assert.Equal(5, seen.Distinct().Count());

        var byTag = (await inbox.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, $"/api/notifications?tags={tagId}"))["items"]!.AsArray();
        Assert.Equal(ids[1], (string?)byTag.Single()!["id"]);
        Assert.Equal(tagId, (long?)byTag[0]!["tags"]![0]!["id"]);
        Assert.Empty((await inbox.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, $"/api/notifications?from={Uri.EscapeDataString(DateTimeOffset.UtcNow.AddHours(1).ToString("O"))}"))["items"]!.AsArray());
        Assert.Equal(5, (await inbox.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, $"/api/notifications?to={Uri.EscapeDataString(DateTimeOffset.UtcNow.AddHours(1).ToString("O"))}"))["items"]!.AsArray().Count);
        await inbox.ExpectAsync(HttpStatusCode.BadRequest, HttpMethod.Get, "/api/notifications?cursor=garbage");
    }

    [Fact]
    public async Task An_employee_without_a_delivery_gets_404_for_the_notification_and_its_attachment()
    {
        var reader = await _host.EmployeeAsync();
        var outsider = await _host.EmployeeAsync();
        var editor = await _host.EditorApiAsync();
        var id = await CreateAsync(editor, Draft("Có tệp", employees: [reader]));
        var upload = await editor.UploadAsync($"{Manage}/{id}/attachments", "huong-dan.pdf", Encoding.ASCII.GetBytes("%PDF-1.4 synthetic"), "application/pdf");
        Assert.Equal(HttpStatusCode.OK, upload.StatusCode);
        var fileId = JsonNode.Parse(await upload.Content.ReadAsStringAsync())!["fileId"]!.GetValue<string>();
        await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Post, $"{Manage}/{id}/publish");
        await _host.WaitForFanOutAsync(id);

        var other = await _host.SignInAsync(outsider);
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/api/notifications/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/api/notifications/{id}/attachments/{fileId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/api/files/{fileId}")).StatusCode); // attachments are not served as body images

        var mine = await _host.SignInAsync(reader);
        var detail = await mine.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, $"/api/notifications/{id}");
        Assert.True((bool?)detail["hasAttachments"]);
        Assert.Equal("huong-dan.pdf", (string?)detail["attachments"]![0]!["fileName"]);
        var download = await mine.GetAsync($"/api/notifications/{id}/attachments/{fileId}");
        Assert.Equal(HttpStatusCode.OK, download.StatusCode);
        Assert.Contains("%PDF", await download.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.NotFound, (await mine.GetAsync($"/api/notifications/{id}/attachments/{Guid.NewGuid()}")).StatusCode);
    }

    [Fact]
    public async Task While_acting_as_someone_reads_follow_the_viewed_employee()
    {
        var viewed = await _host.EmployeeAsync();
        var editor = await _host.EditorApiAsync();
        var id = await _host.PublishAsync(editor, Draft("Của người được xem", employees: [viewed]));

        var admin = await _host.EmployeeAsync(roles: ["admin"]);
        await using var host2 = new NotificationsHost(database, new() { ["Auth:RevalidateSeconds"] = "3600" });
        var acting = await host2.SignInAsync(admin, viewing: viewed);

        var list = await acting.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, "/api/notifications");
        Assert.Equal(id, (string?)list["items"]!.AsArray().Single()!["id"]);
        await acting.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, $"/api/notifications/{id}");
    }

    [Fact]
    public async Task Items_are_new_only_when_delivered_after_the_previous_sign_in()
    {
        var reader = await _host.EmployeeAsync();
        var editor = await _host.EditorApiAsync();
        var old = await _host.PublishAsync(editor, Draft("Cũ", employees: [reader]));
        await Task.Delay(50);
        await _host.Factory.WithDbAsync(async db =>
        {
            await db.Set<HCMUSSupportV2.Backend.Modules.Identity.Directory.Employee>().Where(e => e.Code == reader)
                .ExecuteUpdateAsync(s => s.SetProperty(e => e.PreviousLoginAt, DateTimeOffset.UtcNow));
            return 0;
        });
        await Task.Delay(50);
        var recent = await _host.PublishAsync(editor, Draft("Mới", employees: [reader]));

        var inbox = await _host.SignInAsync(reader);
        var items = (await inbox.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, "/api/notifications"))["items"]!.AsArray();
        Assert.Equal(recent, (string?)items[0]!["id"]);
        Assert.True((bool?)items[0]!["isNew"]);
        Assert.Equal(old, (string?)items[1]!["id"]);
        Assert.False((bool?)items[1]!["isNew"]);
    }

    [Fact]
    public async Task Series_detail_lists_previous_posts_that_were_also_delivered_to_the_reader()
    {
        var reader = await _host.EmployeeAsync();
        var otherReader = await _host.EmployeeAsync();
        var editor = await _host.EditorApiAsync();
        var series = await editor.ExpectAsync(HttpStatusCode.Created, HttpMethod.Post, "/api/manage/series", new { name = "Thâm niên " + Guid.NewGuid().ToString("N")[..6] });
        var seriesId = series["id"]!.GetValue<long>();

        var y1 = await _host.PublishAsync(editor, Draft("Thâm niên 2024", employees: [reader], seriesId: seriesId));
        await Task.Delay(30);
        var y2 = await _host.PublishAsync(editor, Draft("Thâm niên 2025", employees: [reader, otherReader], seriesId: seriesId));
        await Task.Delay(30);
        var y3 = await _host.PublishAsync(editor, Draft("Thâm niên 2026", employees: [otherReader, reader], seriesId: seriesId));

        var mine = await (await _host.SignInAsync(reader)).ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, $"/api/notifications/{y3}");
        Assert.Equal(seriesId, (long?)mine["series"]!["id"]);
        Assert.Equal(new[] { y2, y1 }, mine["series"]!["previous"]!.AsArray().Select(p => (string)p!["id"]!).ToArray());

        var theirs = await (await _host.SignInAsync(otherReader)).ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, $"/api/notifications/{y3}");
        Assert.Equal(new[] { y2 }, theirs["series"]!["previous"]!.AsArray().Select(p => (string)p!["id"]!).ToArray());
    }

    // ------------------------------------------------------------ clone

    [Fact]
    public async Task Clone_copies_content_tags_series_and_audiences_but_not_the_imported_rows()
    {
        var target = await _host.EmployeeAsync();
        var group = await _host.CreateGroupAsync(target);
        var editor = await _host.EditorApiAsync();
        var series = await editor.ExpectAsync(HttpStatusCode.Created, HttpMethod.Post, "/api/manage/series", new { name = "Chuỗi " + Guid.NewGuid().ToString("N")[..6] });
        var source = await CreateAsync(editor, Draft("Nâng lương 2025", "Chào :var[HoTen]", all: true, groups: [group], employees: [target],
            tags: [1, 2], seriesId: series["id"]!.GetValue<long>(),
            variables: new[] { new { key = "HoTen", label = "Họ tên", type = "text" } }));
        var report = await ImportAsync(editor, source, Xlsx(["MSCB", "HoTen"], [target, "A"]));
        await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Post, $"{Manage}/{source}/imports/{report["importId"]!.GetValue<string>()}/apply");
        await editor.UploadAsync($"{Manage}/{source}/attachments", "a.pdf", Encoding.ASCII.GetBytes("%PDF-1.4"), "application/pdf");

        var clone = await editor.ExpectAsync(HttpStatusCode.Created, HttpMethod.Post, $"{Manage}/{source}/clone");
        Assert.NotEqual(source, (string?)clone["id"]);
        Assert.Equal("draft", (string?)clone["status"]);
        Assert.Equal(1, (int?)clone["version"]);
        Assert.Equal("Nâng lương 2025", (string?)clone["title"]); // no suffix
        Assert.Equal("Chào :var[HoTen]", (string?)clone["bodyMd"]);
        Assert.Equal("HoTen", (string?)clone["variables"]![0]!["key"]);
        Assert.Equal(2, clone["tags"]!.AsArray().Count);
        Assert.Equal((long?)series["id"], (long?)clone["seriesId"]);
        Assert.True((bool?)clone["audience"]!["all"]);
        Assert.Equal(group, (long?)clone["audience"]!["groups"]![0]!["id"]);
        Assert.Equal(target, (string?)clone["audience"]!["employees"]![0]!["code"]);
        Assert.Null(clone["audience"]!["import"]);          // recipient rows are not copied
        Assert.Empty(clone["attachments"]!.AsArray());
        Assert.Null(clone["publishAt"]);

        Assert.Equal(1, await _host.ScalarAsync("SELECT count(*)::int AS \"Value\" FROM notification_audiences WHERE notification_id = {0}::uuid AND kind = 'import'", source));
        Assert.Equal(0, await _host.ScalarAsync("SELECT count(*)::int AS \"Value\" FROM notification_audiences WHERE notification_id = {0}::uuid AND kind = 'import'", (string)clone["id"]!));
    }

    // ------------------------------------------------------------ tags and series

    [Fact]
    public async Task Tags_are_seeded_and_tags_and_series_have_crud()
    {
        var editor = await _host.EditorApiAsync();
        var employee = await _host.SignInAsync(await _host.EmployeeAsync());
        var names = (await employee.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, "/api/tags")).AsArray().Select(t => (string)t!["name"]!).ToArray();
        foreach (var seeded in new[] { "Lương", "Thâm niên", "Khen thưởng", "Khảo sát", "Đào tạo", "Chung" }) Assert.Contains(seeded, names);

        var tag = await editor.ExpectAsync(HttpStatusCode.Created, HttpMethod.Post, "/api/manage/tags", new { name = "Nhãn " + Guid.NewGuid().ToString("N")[..6], color = "#123456", sort = 5 });
        await editor.ExpectAsync(HttpStatusCode.Conflict, HttpMethod.Post, "/api/manage/tags", new { name = (string)tag["name"]! });
        var renamed = await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Put, $"/api/manage/tags/{tag["id"]}", new { name = "Đổi tên " + Guid.NewGuid().ToString("N")[..6], color = "#654321" });
        Assert.Equal("#654321", (string?)renamed["color"]);
        await editor.ExpectAsync(HttpStatusCode.NoContent, HttpMethod.Delete, $"/api/manage/tags/{tag["id"]}");
        await editor.ExpectAsync(HttpStatusCode.NotFound, HttpMethod.Delete, $"/api/manage/tags/{tag["id"]}");

        var series = await editor.ExpectAsync(HttpStatusCode.Created, HttpMethod.Post, "/api/manage/series", new { name = "C " + Guid.NewGuid().ToString("N")[..6], description = "mô tả" });
        await editor.ExpectAsync(HttpStatusCode.Conflict, HttpMethod.Post, "/api/manage/series", new { name = (string)series["name"]! });
        await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Put, $"/api/manage/series/{series["id"]}", new { name = "D " + Guid.NewGuid().ToString("N")[..6] });
        await editor.ExpectAsync(HttpStatusCode.NoContent, HttpMethod.Delete, $"/api/manage/series/{series["id"]}");
    }

    // ------------------------------------------------------------ audit

    [Fact]
    public async Task Every_management_action_is_audited()
    {
        var target = await _host.EmployeeAsync();
        var editor = await _host.EditorApiAsync();
        var id = await CreateAsync(editor, Draft("Kiểm toán", "Chào :var[A]", employees: [target], variables: new[] { new { key = "A", label = "A", type = "text" } }));
        await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Put, $"{Manage}/{id}", Draft("Kiểm toán 2", "Chào :var[A]", employees: [target], version: 1, variables: new[] { new { key = "A", label = "A", type = "text" } }));
        var report = await ImportAsync(editor, id, Xlsx(["MSCB", "A"], [target, "x"]));
        await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Post, $"{Manage}/{id}/imports/{report["importId"]!.GetValue<string>()}/apply");
        await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Post, $"{Manage}/{id}/publish");
        await _host.WaitForFanOutAsync(id);
        await editor.ExpectAsync(HttpStatusCode.Created, HttpMethod.Post, $"{Manage}/{id}/clone");
        await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Post, $"{Manage}/{id}/archive");

        var actions = await _host.Factory.WithDbAsync(db => db.Database
            .SqlQueryRaw<string>("SELECT action AS \"Value\" FROM audit_log WHERE target_id = {0} OR details::text LIKE {1}", id, $"%{id}%").ToListAsync());
        foreach (var expected in new[] { "notification.created", "notification.updated", "notification.recipients_applied", "notification.published", "notification.archived" })
            Assert.Contains(expected, actions);
        Assert.Contains("notification.cloned", actions);
    }

    // ------------------------------------------------------------ helpers

    private async Task<JsonNode> ImportAsync(Api editor, string id, byte[] xlsx, string fileName = "danh-sach.xlsx")
    {
        var response = await editor.UploadAsync($"{Manage}/{id}/recipients/import", fileName, xlsx);
        var text = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.OK, text);
        return JsonNode.Parse(text)!;
    }
}
