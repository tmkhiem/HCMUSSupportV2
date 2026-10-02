using System.Net;
using System.Text;
using System.Text.Json.Nodes;
using ClosedXML.Excel;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Tests.Infrastructure;
using static HCMUSSupportV2.Backend.Tests.Notifications.NotificationsHost;

namespace HCMUSSupportV2.Backend.Tests.Notifications;

/// <summary>Recipient import reports, apply and preview, attachments and images, and the SSE stream.</summary>
[Collection(PostgresCollection.Name)]
public class NotificationImportAndStreamTests(PostgresFixture database) : IAsyncLifetime
{
    private NotificationsHost _host = null!;
    private const string Manage = "/api/manage/notifications";

    public Task InitializeAsync()
    {
        _host = new NotificationsHost(database);
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    private static readonly object[] Declared =
    [
        new { key = "HeSoLuong", label = "Hệ số lương", type = "number" },
        new { key = "Thieu", label = "Cột thiếu", type = "text" },
    ];

    private async Task<(Api Editor, string Id)> DraftWithBodyAsync(string body = "Hệ số :var[HeSoLuong], còn :var[Thieu]")
    {
        var editor = await _host.EditorApiAsync();
        return (editor, await CreateAsync(editor, Draft("Danh sách", body, variables: Declared)));
    }

    private static async Task<JsonNode> UploadReportAsync(Api editor, string id, string fileName, byte[] bytes, HttpStatusCode expected = HttpStatusCode.OK)
    {
        var response = await editor.UploadAsync($"{Manage}/{id}/recipients/import", fileName, bytes);
        var text = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == expected, $"expected {expected}, got {response.StatusCode}: {text}");
        return JsonNode.Parse(text)!;
    }

    [Fact]
    public async Task Report_lists_unknown_inactive_duplicate_missing_and_unused()
    {
        var known = await _host.EmployeeAsync();
        var inactive = await _host.EmployeeAsync(status: EmployeeStatuses.Inactive);
        var (editor, id) = await DraftWithBodyAsync();

        var result = await UploadReportAsync(editor, id, "ds.xlsx", Xlsx(["Mã số", "Hệ số lương", "Ghi chú"],
            [known, "3.33", "a"],
            [known, "3.33", "a"],        // identical duplicate row
            [known, "3.66", "b"],        // a second, different row is allowed
            ["ZZ_UNKNOWN", "2.00", null],
            [inactive, "2.34", null],
            [null, "9.99", "không có mã"], // row without an MSCB
            [null, null, null]));          // blank line is ignored
        var report = result["report"]!;

        Assert.Equal("validated", (string?)result["status"]);
        Assert.Equal("Mã số", (string?)report["mscbColumn"]);
        Assert.Equal(5, (int?)report["rows"]);
        Assert.Equal(3, (int?)report["distinctEmployees"]);
        Assert.Equal(1, (int?)report["employeesWithMultipleRows"]);
        Assert.Equal(["ZZ_UNKNOWN"], report["unknownCodes"]!.AsArray().Select(x => (string)x!).ToArray());
        Assert.Equal(1, (int?)report["unknownCodeCount"]);
        Assert.Equal([inactive], report["inactiveCodes"]!.AsArray().Select(x => (string)x!).ToArray());
        Assert.Equal(1, (int?)report["duplicateRows"]);
        Assert.Equal([known], report["duplicateRowCodes"]!.AsArray().Select(x => (string)x!).ToArray());
        Assert.Equal(1, (int?)report["rowsWithoutCode"]);
        Assert.Equal(["Thieu"], report["missingInFile"]!.AsArray().Select(x => (string)x!).ToArray());
        Assert.Equal(["Ghi chú"], report["unusedColumns"]!.AsArray().Select(x => (string)x!).ToArray());
        Assert.Equal(["HeSoLuong", "GhiChu"], report["columns"]!.AsArray().Select(x => (string)x!["key"]!).ToArray());
        Assert.Equal("Ghi chú", (string?)report["columns"]![1]!["label"]);
        Assert.True((bool?)report["canApply"]);
    }

    [Fact]
    public async Task Apply_merges_new_columns_into_the_declared_variables_and_sets_the_import_audience()
    {
        var known = await _host.EmployeeAsync();
        var (editor, id) = await DraftWithBodyAsync();
        var result = await UploadReportAsync(editor, id, "ds.xlsx", Xlsx(["MSCB", "Hệ số lương", "Ghi chú"], [known, "3.33", "x"]));

        var applied = await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Post, $"{Manage}/{id}/imports/{result["importId"]!.GetValue<string>()}/apply");

        var keys = applied["variables"]!.AsArray().Select(v => (string)v!["key"]!).ToArray();
        Assert.Equal(["HeSoLuong", "Thieu", "GhiChu"], keys);
        Assert.Equal("Ghi chú", (string?)applied["variables"]![2]!["label"]);
        Assert.Equal("number", (string?)applied["variables"]![0]!["type"]); // existing declarations are kept
        Assert.Equal("applied", (string?)applied["audience"]!["import"]!["status"]);
        Assert.Equal(1, (int?)applied["audience"]!["import"]!["distinctEmployees"]);
        Assert.Equal(2, (int?)applied["version"]);

        // Applying twice is refused; a newer sheet replaces the previous import.
        await editor.ExpectAsync(HttpStatusCode.Conflict, HttpMethod.Post, $"{Manage}/{id}/imports/{result["importId"]!.GetValue<string>()}/apply");
        var second = await UploadReportAsync(editor, id, "ds2.xlsx", Xlsx(["MSCB", "Hệ số lương"], [known, "5.00"]));
        await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Post, $"{Manage}/{id}/imports/{second["importId"]!.GetValue<string>()}/apply");
        var old = await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, $"{Manage}/{id}/imports/{result["importId"]!.GetValue<string>()}");
        Assert.Equal("rejected", (string?)old["status"]);
        Assert.Equal(1, await _host.ScalarAsync("SELECT count(*)::int AS \"Value\" FROM notification_audiences WHERE notification_id = {0}::uuid AND kind = 'import'", id));
    }

    [Fact]
    public async Task A_sheet_without_an_mscb_column_is_rejected_and_cannot_be_applied()
    {
        var (editor, id) = await DraftWithBodyAsync();
        var result = await UploadReportAsync(editor, id, "ds.xlsx", Xlsx(["Họ tên", "Hệ số lương"], ["A", "3"]));

        Assert.Equal("rejected", (string?)result["status"]);
        Assert.False((bool?)result["report"]!["canApply"]);
        Assert.Contains("MSCB", result["report"]!["errors"]![0]!.GetValue<string>());
        await editor.ExpectAsync(HttpStatusCode.Conflict, HttpMethod.Post, $"{Manage}/{id}/imports/{result["importId"]!.GetValue<string>()}/apply");
    }

    [Theory]
    [InlineData("MSCB")]
    [InlineData("mscb")]
    [InlineData("MaNhanSu")]
    [InlineData("MÃ SỐ")]
    [InlineData("ma so")]
    public async Task The_mscb_column_is_found_case_and_diacritic_insensitively(string header)
    {
        var known = await _host.EmployeeAsync();
        var (editor, id) = await DraftWithBodyAsync();
        var result = await UploadReportAsync(editor, id, "ds.xlsx", Xlsx([header, "Hệ số lương"], [known, "1"]));
        Assert.Equal("validated", (string?)result["status"]);
        Assert.Equal(1, (int?)result["report"]!["distinctEmployees"]);
    }

    [Fact]
    public async Task Variable_keys_come_from_headers_and_are_made_unique()
    {
        var known = await _host.EmployeeAsync();
        var (editor, id) = await DraftWithBodyAsync();
        var result = await UploadReportAsync(editor, id, "ds.xlsx", Xlsx(
            ["MSCB", "Số tiền (VNĐ)", "Số tiền (VND)", "2025 Lương", "HeSoLuong", "ma_so_2", "   ", "Đơn vị công tác"],
            [known, "1", "2", "3", "4", "5", "6", "7"]));
        var keys = result["report"]!["columns"]!.AsArray().Select(c => (string)c!["key"]!).ToArray();
        Assert.Equal(["SoTienVND", "SoTienVND_2", "C2025Luong", "HeSoLuong", "ma_so_2", "DonViCongTac"], keys);
        Assert.Equal(keys.Length, keys.Distinct().Count());
        Assert.All(keys, k => Assert.Matches("^[A-Za-z][A-Za-z0-9_]{0,63}$", k));
    }

    [Fact]
    public async Task Csv_files_with_bom_and_semicolons_are_read()
    {
        var known = await _host.EmployeeAsync();
        var (editor, id) = await DraftWithBodyAsync();
        var csv = $"﻿MSCB;Hệ số lương;Ghi chú\n{known};3,33;\"có; dấu chấm phẩy\"\n";
        var result = await UploadReportAsync(editor, id, "ds.csv", Encoding.UTF8.GetBytes(csv));
        Assert.Equal("validated", (string?)result["status"]);
        Assert.Equal(1, (int?)result["report"]!["rows"]);
        await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Post, $"{Manage}/{id}/imports/{result["importId"]!.GetValue<string>()}/apply");
        var preview = await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, $"{Manage}/{id}/preview-vars?employee={known}");
        Assert.Equal("3,33", (string?)preview["rows"]![0]!["HeSoLuong"]);
        Assert.Equal("có; dấu chấm phẩy", (string?)preview["rows"]![0]!["GhiChu"]);
    }

    [Fact]
    public async Task Dates_and_numbers_are_kept_as_displayed_text()
    {
        var known = await _host.EmployeeAsync();
        var (editor, id) = await DraftWithBodyAsync();
        using var wb = new XLWorkbook();
        var ws = wb.AddWorksheet("S");
        ws.Cell(1, 1).Value = "MSCB"; ws.Cell(1, 2).Value = "Ngày hưởng"; ws.Cell(1, 3).Value = "Hệ số";
        ws.Cell(2, 1).Value = known;
        ws.Cell(2, 2).Value = new DateTime(2026, 7, 1);
        ws.Cell(2, 3).Value = 3.33; ws.Cell(2, 3).Style.NumberFormat.Format = "0.00";
        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        var result = await UploadReportAsync(editor, id, "ds.xlsx", ms.ToArray());
        await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Post, $"{Manage}/{id}/imports/{result["importId"]!.GetValue<string>()}/apply");
        var row = (await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, $"{Manage}/{id}/preview-vars?employee={known}"))["rows"]![0]!;
        Assert.Equal("01/07/2026", (string?)row["NgayHuong"]);
        Assert.Equal("3.33", (string?)row["HeSo"]);
    }

    [Theory]
    [InlineData("ds.txt", "MSCB\n")]
    [InlineData("ds.xlsx", "this is not a zip file")]
    [InlineData("ds.csv", "")]
    public async Task Unreadable_or_unsupported_files_answer_400(string fileName, string content)
    {
        var (editor, id) = await DraftWithBodyAsync();
        await UploadReportAsync(editor, id, fileName, Encoding.UTF8.GetBytes(content), HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Import_endpoints_need_the_editor_role_and_a_known_notification()
    {
        var (editor, id) = await DraftWithBodyAsync();
        var employee = await _host.SignInAsync(await _host.EmployeeAsync());
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.UploadAsync($"{Manage}/{id}/recipients/import", "a.xlsx", Xlsx(["MSCB"]))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.GetAsync($"{Manage}/{id}/recipients/template")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.PostAsync($"{Manage}/{id}/imports/{Guid.NewGuid()}/apply")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await editor.UploadAsync($"{Manage}/{Guid.NewGuid()}/recipients/import", "a.xlsx", Xlsx(["MSCB"]))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await editor.PostAsync($"{Manage}/{id}/imports/{Guid.NewGuid()}/apply")).StatusCode);
    }

    [Fact]
    public async Task Template_has_the_mscb_column_and_one_column_per_declared_variable()
    {
        var (editor, id) = await DraftWithBodyAsync();
        var response = await editor.GetAsync($"{Manage}/{id}/recipients/template");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", response.Content.Headers.ContentType!.MediaType);
        using var wb = new XLWorkbook(await response.Content.ReadAsStreamAsync());
        var ws = wb.Worksheet(1);
        Assert.Equal(["MSCB", "HeSoLuong", "Thieu"], new[] { 1, 2, 3 }.Select(c => ws.Cell(1, c).GetString()).ToArray());
        Assert.True(ws.Cell(1, 4).IsEmpty());

        // The template round-trips through the importer without renaming a column.
        var known = await _host.EmployeeAsync();
        var result = await UploadReportAsync(editor, id, "mau.xlsx", Xlsx(["MSCB", "HeSoLuong", "Thieu"], [known, "1", "2"]));
        Assert.Empty(result["report"]!["missingInFile"]!.AsArray());
        Assert.Empty(result["report"]!["unusedColumns"]!.AsArray());
    }

    [Fact]
    public async Task Preview_vars_returns_the_rows_of_an_mscb_and_whether_it_is_in_the_audience()
    {
        var inSheet = await _host.EmployeeAsync();
        var viaGroup = await _host.EmployeeAsync();
        var stranger = await _host.EmployeeAsync();
        var group = await _host.CreateGroupAsync(viaGroup);
        var editor = await _host.EditorApiAsync();
        var id = await CreateAsync(editor, Draft("Xem trước", "Hệ số :var[HeSoLuong]", variables: Declared, groups: [group]));
        var upload = await UploadReportAsync(editor, id, "ds.xlsx", Xlsx(["MSCB", "Hệ số lương"], [inSheet, "3.33"], [inSheet, "4.44"]));
        var importId = upload["importId"]!.GetValue<string>();

        // Before apply: pending rows, not yet in the audience.
        var pending = await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, $"{Manage}/{id}/preview-vars?employee={inSheet}");
        Assert.Equal("pending", (string?)pending["source"]);
        Assert.Equal(importId, (string?)pending["importId"]);
        Assert.Equal(2, pending["rows"]!.AsArray().Count);
        Assert.False((bool?)pending["inAudience"]);
        Assert.True((bool?)pending["inPendingImport"]);

        await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Post, $"{Manage}/{id}/imports/{importId}/apply");
        var applied = await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, $"{Manage}/{id}/preview-vars?employee={inSheet}");
        Assert.Equal("applied", (string?)applied["source"]);
        Assert.True((bool?)applied["inAudience"]);
        Assert.Equal(["import"], applied["audienceReasons"]!.AsArray().Select(x => (string)x!).ToArray());
        Assert.Equal("4.44", (string?)applied["rows"]![1]!["HeSoLuong"]);

        var byGroup = await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, $"{Manage}/{id}/preview-vars?employee={viaGroup}");
        Assert.True((bool?)byGroup["inAudience"]);
        Assert.StartsWith("group:", byGroup["audienceReasons"]![0]!.GetValue<string>());
        Assert.Null(byGroup["rows"]);

        var none = await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, $"{Manage}/{id}/preview-vars?employee={stranger}");
        Assert.False((bool?)none["inAudience"]);
        var unknown = await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, $"{Manage}/{id}/preview-vars?employee=KHONG_CO");
        Assert.False((bool?)unknown["employeeExists"]);
        await editor.ExpectAsync(HttpStatusCode.BadRequest, HttpMethod.Get, $"{Manage}/{id}/preview-vars?employee=");
    }

    [Fact]
    public async Task Applying_an_import_to_a_published_notification_delivers_to_the_new_rows()
    {
        var first = await _host.EmployeeAsync();
        var second = await _host.EmployeeAsync();
        var editor = await _host.EditorApiAsync();
        var id = await CreateAsync(editor, Draft("Bổ sung", "Hệ số :var[HeSoLuong]", variables: Declared, employees: [first]));
        await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Post, $"{Manage}/{id}/publish");
        await _host.WaitForFanOutAsync(id);
        Assert.Equal([first], (await _host.RecipientsAsync(id)).ToArray());

        var upload = await UploadReportAsync(editor, id, "ds.xlsx", Xlsx(["MSCB", "Hệ số lương"], [first, "1.11"], [second, "2.22"]));
        await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Post, $"{Manage}/{id}/imports/{upload["importId"]!.GetValue<string>()}/apply");

        Assert.True(await Wait.UntilAsync(async () => (await _host.RecipientsAsync(id)).Contains(second), TimeSpan.FromSeconds(20)));
        // The first recipient was delivered before the import: the explicit apply attaches the variables to the existing delivery.
        Assert.True(await Wait.UntilAsync(async () =>
        {
            var detail = await (await _host.SignInAsync(first)).GetAsync($"/api/notifications/{id}");
            var json = JsonNode.Parse(await detail.Content.ReadAsStringAsync())!;
            return json["vars"]!.AsArray().Count == 1 && (string?)json["vars"]![0]!["HeSoLuong"] == "1.11";
        }, TimeSpan.FromSeconds(20)));
    }

    // ------------------------------------------------------------ attachments and images

    [Fact]
    public async Task Attachments_are_limited_by_type_content_and_size_and_can_be_deleted()
    {
        var editor = await _host.EditorApiAsync();
        var id = await CreateAsync(editor, Draft());
        var url = $"{Manage}/{id}/attachments";

        Assert.Equal(HttpStatusCode.BadRequest, (await editor.UploadAsync(url, "x.exe", Encoding.ASCII.GetBytes("MZ"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await editor.UploadAsync(url, "x.html", Encoding.ASCII.GetBytes("<html>"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await editor.UploadAsync(url, "fake.pdf", Encoding.ASCII.GetBytes("not a pdf"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await editor.UploadAsync(url, "fake.png", Encoding.ASCII.GetBytes("%PDF-1.4"))).StatusCode);
        var tooBig = new byte[21 * 1024 * 1024];
        Encoding.ASCII.GetBytes("%PDF-1.4").CopyTo(tooBig, 0);
        Assert.Equal(HttpStatusCode.BadRequest, (await editor.UploadAsync(url, "big.pdf", tooBig)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await editor.UploadAsync($"{Manage}/{Guid.NewGuid()}/attachments", "a.pdf", Encoding.ASCII.GetBytes("%PDF-1.4"))).StatusCode);

        var ok = await editor.UploadAsync(url, "../../etc/bao-cao.PDF", Encoding.ASCII.GetBytes("%PDF-1.7 synthetic"));
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        var att = JsonNode.Parse(await ok.Content.ReadAsStringAsync())!;
        Assert.Equal("bao-cao.PDF", (string?)att["fileName"]);
        Assert.Equal("application/pdf", (string?)att["contentType"]);
        foreach (var (name, header) in new[] { ("a.docx", "PK\u0003\u0004"), ("a.xlsx", "PK\u0003\u0004"), ("a.jpg", "ÿØÿxx"), ("a.png", "\u0089PNG\r\n") })
            Assert.Equal(HttpStatusCode.OK, (await editor.UploadAsync(url, name, Encoding.Latin1.GetBytes(header + "rest"))).StatusCode);

        var detail = await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Get, $"{Manage}/{id}");
        Assert.Equal(5, detail["attachments"]!.AsArray().Count);
        var fileId = (string)att["fileId"]!;
        await editor.ExpectAsync(HttpStatusCode.NoContent, HttpMethod.Delete, $"{url}/{att["id"]!.GetValue<string>()}");
        Assert.Equal(0, await _host.ScalarAsync("SELECT count(*)::int AS \"Value\" FROM files WHERE id = {0}::uuid", fileId));
        await editor.ExpectAsync(HttpStatusCode.NotFound, HttpMethod.Delete, $"{url}/{att["id"]!.GetValue<string>()}");

        var employee = await _host.SignInAsync(await _host.EmployeeAsync());
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.UploadAsync(url, "a.pdf", Encoding.ASCII.GetBytes("%PDF-1.4"))).StatusCode);
    }

    [Fact]
    public async Task Body_images_upload_and_are_served_to_signed_in_employees_only()
    {
        var editor = await _host.EditorApiAsync();
        var png = new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0 };

        Assert.Equal(HttpStatusCode.BadRequest, (await editor.UploadAsync($"{Manage}/images", "a.svg", Encoding.ASCII.GetBytes("<svg/>"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await editor.UploadAsync($"{Manage}/images", "a.png", Encoding.ASCII.GetBytes("not an image"))).StatusCode);
        var response = await editor.UploadAsync($"{Manage}/images", "so-do.png", png);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var url = (string)JsonNode.Parse(await response.Content.ReadAsStringAsync())!["url"]!;
        Assert.Matches("^/api/files/[0-9a-f-]{36}$", url);

        // The returned URL is exactly what the Markdown contract accepts, and it is served with safe headers.
        var id = await CreateAsync(editor, Draft("Có ảnh", $"![sơ đồ]({url})"));
        Assert.NotNull(id);
        var reader = await _host.SignInAsync(await _host.EmployeeAsync());
        var image = await reader.GetAsync(url);
        Assert.Equal(HttpStatusCode.OK, image.StatusCode);
        Assert.Equal("image/png", image.Content.Headers.ContentType!.MediaType);
        Assert.Equal("nosniff", image.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal(png, await image.Content.ReadAsByteArrayAsync());
        Assert.Equal(HttpStatusCode.Unauthorized, (await _host.Factory.CreateSessionClient().GetAsync(url)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await reader.GetAsync($"/api/files/{Guid.NewGuid()}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await reader.UploadAsync($"{Manage}/images", "a.png", png)).StatusCode);
    }

    // ------------------------------------------------------------ SSE

    [Fact]
    public async Task The_stream_delivers_a_notification_and_unread_count_events_after_publish_and_heartbeats()
    {
        var reader = await _host.EmployeeAsync();
        var outsider = await _host.EmployeeAsync();
        var editor = await _host.EditorApiAsync();
        var readerApi = await _host.SignInAsync(reader);
        var outsiderApi = await _host.SignInAsync(outsider);

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        await using var stream = await SseStream.OpenAsync(readerApi.Client, cts.Token);
        await using var outsiderStream = await SseStream.OpenAsync(outsiderApi.Client, cts.Token);
        Assert.Equal("text/event-stream", stream.ContentType);

        var first = await stream.NextEventAsync("unread-count");
        Assert.Equal(0, (int)first["count"]!);

        var id = await CreateAsync(editor, Draft("Tin nóng", employees: [reader]));
        await editor.ExpectAsync(HttpStatusCode.OK, HttpMethod.Post, $"{Manage}/{id}/publish");

        var arrived = await stream.NextEventAsync("notification");
        Assert.Equal(id, (string?)arrived["id"]);
        Assert.Equal("Tin nóng", (string?)arrived["title"]);
        var count = await stream.NextEventAsync("unread-count");
        Assert.Equal(1, (int)count["count"]!);
        Assert.True(await stream.SawHeartbeatAsync(), "no heartbeat comment arrived");

        // Reading in another tab updates this stream's badge.
        await (await _host.SignInAsync(reader)).ExpectAsync(HttpStatusCode.OK, HttpMethod.Post, $"/api/notifications/{id}/read");
        Assert.Equal(0, (int)(await stream.NextEventAsync("unread-count"))["count"]!);

        // Someone who is not a recipient only sees their own (unchanged) state.
        Assert.Equal(0, (int)(await outsiderStream.NextEventAsync("unread-count"))["count"]!);
        Assert.False(outsiderStream.Seen("notification"));
    }

    [Fact]
    public async Task The_stream_starts_with_the_current_unread_count_and_ends_when_the_client_disconnects()
    {
        var reader = await _host.EmployeeAsync();
        var editor = await _host.EditorApiAsync();
        await _host.PublishAsync(editor, Draft(employees: [reader]));
        var api = await _host.SignInAsync(reader);

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        await using (var stream = await SseStream.OpenAsync(api.Client, cts.Token))
            Assert.Equal(1, (int)(await stream.NextEventAsync("unread-count"))["count"]!);

        var hub = _host.Factory.Services.GetService(typeof(HCMUSSupportV2.Backend.Modules.Notifications.Realtime.SseHub)) as HCMUSSupportV2.Backend.Modules.Notifications.Realtime.SseHub;
        Assert.True(await Wait.UntilAsync(() => Task.FromResult(!hub!.ConnectedCodes.Contains(reader)), TimeSpan.FromSeconds(10)), "subscription was not released");
    }
    [Fact]
    public async Task The_stream_is_off_by_default_and_answers_404()
    {
        await using var host = new NotificationsHost(database, new() { ["Notifications:Realtime:Enabled"] = "false" });
        var reader = await host.EmployeeAsync();
        var api = await host.SignInAsync(reader);

        var response = await api.Client.GetAsync("/api/notifications/stream");
        Assert.Equal(System.Net.HttpStatusCode.NotFound, response.StatusCode);
    }
}

/// <summary>A live SSE response read line by line in the background.</summary>
public sealed class SseStream : IAsyncDisposable
{
    private readonly CancellationTokenSource _cts;
    private readonly HttpResponseMessage _response;
    private readonly Task _reader;
    private readonly List<(string Event, string Data)> _events = [];
    private int _heartbeats;
    private int _cursor;
    private readonly object _gate = new();

    public string? ContentType => _response.Content.Headers.ContentType?.MediaType;

    private SseStream(HttpResponseMessage response, CancellationToken ct)
    {
        _response = response;
        _cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        _reader = Task.Run(async () =>
        {
            try
            {
                await using var body = await response.Content.ReadAsStreamAsync(_cts.Token);
                using var reader = new StreamReader(body, Encoding.UTF8);
                string? name = null;
                while (await reader.ReadLineAsync(_cts.Token) is { } line)
                {
                    if (line.StartsWith(": heartbeat")) { lock (_gate) _heartbeats++; }
                    else if (line.StartsWith("event: ")) name = line[7..];
                    else if (line.StartsWith("data: ") && name is not null) { lock (_gate) _events.Add((name, line[6..])); name = null; }
                }
            }
            catch (OperationCanceledException) { }
            catch (IOException) { }
        });
    }

    public static async Task<SseStream> OpenAsync(HttpClient client, CancellationToken ct)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/api/notifications/stream");
        var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return new SseStream(response, ct);
    }

    /// <summary>The next not yet consumed event with this name (waits up to 20 s).</summary>
    public async Task<JsonNode> NextEventAsync(string name)
    {
        JsonNode? found = null;
        var ok = await Wait.UntilAsync(() =>
        {
            lock (_gate)
            {
                for (var i = _cursor; i < _events.Count; i++)
                {
                    if (_events[i].Event != name) continue;
                    found = JsonNode.Parse(_events[i].Data);
                    _cursor = i + 1;
                    return Task.FromResult(true);
                }
            }
            return Task.FromResult(false);
        }, TimeSpan.FromSeconds(20));
        Assert.True(ok, $"no '{name}' event within 20 s; got: {string.Join(", ", Snapshot().Select(e => e.Event))}");
        return found!;
    }

    public Task<bool> SawHeartbeatAsync() => Wait.UntilAsync(() => Task.FromResult(_heartbeats > 0), TimeSpan.FromSeconds(10));

    public bool Seen(string name) => Snapshot().Any(e => e.Event == name);

    private List<(string Event, string Data)> Snapshot() { lock (_gate) return [.. _events]; }

    public async ValueTask DisposeAsync()
    {
        await _cts.CancelAsync();
        _response.Dispose();
        try { await _reader; } catch { /* the test host is shutting the connection down */ }
        _cts.Dispose();
    }
}
