using System.Net;
using System.Text;
using ClosedXML.Excel;
using HCMUSSupportV2.Backend.Modules.Hrm.Domain;
using HCMUSSupportV2.Backend.Modules.Identity.Authentication;
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

public class EmailActivationLog : IEmployeeActivationObserver
{
    public static readonly List<string> Activated = [];

    public Task OnEmployeesActivatedAsync(IReadOnlyCollection<string> employeeCodes, CancellationToken ct)
    {
        lock (Activated) Activated.AddRange(employeeCodes);
        return Task.CompletedTask;
    }

    public static bool Saw(string code) { lock (Activated) return Activated.Contains(code); }
}

/// <summary>D14c: the MSCB to email mapping endpoints under <c>/api/manage/employees</c> (editor role).</summary>
[Collection(PostgresCollection.Name)]
public class EmployeeEmailsTests(PostgresFixture database) : IAsyncLifetime
{
    private readonly TestApiFactory _factory = new(database, configureServices: s =>
    {
        TestControllers.Add(s);
        s.AddScoped<IEmployeeActivationObserver, EmailActivationLog>();
    });

    public Task InitializeAsync()
    {
        _ = _factory.Server;
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    private static string Tag() => Guid.NewGuid().ToString("N")[..8];

    private static string Url(string code, string suffix = "") => $"/api/manage/employees/{code}{suffix}";

    private static string EmailUrl(string code, string email, string suffix = "") => $"/api/manage/employees/{code}/emails/{Uri.EscapeDataString(email)}{suffix}";

    private async Task<string> NewEmployeeAsync(string[]? emails = null, string? fullName = null, string status = EmployeeStatuses.Active) =>
        await CreateEmployeeAsync(_factory, status: status, emails: emails ?? [], fullName: fullName);

    private static string[] EmailsOf(System.Text.Json.JsonElement employee) =>
        employee.GetProperty("emails").EnumerateArray().Select(e => e.GetProperty("email").GetString()!).ToArray();

    private static string? PrimaryOf(System.Text.Json.JsonElement employee) =>
        employee.GetProperty("emails").EnumerateArray().SingleOrDefault(e => e.GetProperty("isPrimary").GetBoolean()) is { ValueKind: System.Text.Json.JsonValueKind.Object } p
            ? p.GetProperty("email").GetString() : null;

    private async Task<System.Text.Json.JsonElement> GetAsync(Session s, string code)
    {
        var response = await s.GetAsync(Url(code));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await response.ReadAsync();
    }

    // ---- policy ----

    [Fact]
    public async Task Only_editors_and_admins_can_read_or_write_and_anonymous_gets_401()
    {
        var employee = await _factory.SignInNewAsync();
        var editor = await _factory.SignInNewAsync(Roles.Editor);
        var admin = await _factory.SignInNewAsync(Roles.Admin);
        var target = await NewEmployeeAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.CreateClient().GetAsync("/api/manage/employees")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.GetAsync("/api/manage/employees")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.GetAsync(Url(target))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.SendAsync(HttpMethod.Post, Url(target, "/emails"), new { email = "a@b.vn" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.SendAsync(HttpMethod.Delete, EmailUrl(target, "a@b.vn"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.SendAsync(HttpMethod.Put, EmailUrl(target, "a@b.vn", "/primary"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.PostFileAsync("/api/manage/employees/emails/import", "x.xlsx", [1])).StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await editor.GetAsync("/api/manage/employees")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync("/api/manage/employees")).StatusCode);
        Assert.Empty(await _factory.AuditAsync("employee_email.added", target));
    }

    // ---- directory ----

    [Fact]
    public async Task Directory_searches_by_code_unaccented_name_and_email_and_filters_by_status_and_email_presence()
    {
        var editor = await _factory.SignInNewAsync(Roles.Editor);
        var tag = Tag();
        var a = await NewEmployeeAsync([$"alpha.{tag}@test.hcmus.local"], $"Đặng {tag} Ánh");
        var b = await NewEmployeeAsync([], $"Đặng {tag} Bình");
        var c = await NewEmployeeAsync([$"gamma.{tag}@test.hcmus.local"], $"Lê Gamma {tag}", EmployeeStatuses.Inactive);

        var byName = await (await editor.GetAsync($"/api/manage/employees?q=dang%20{tag}")).ReadAsync();
        Assert.Equal(new[] { a, b }.Order().ToArray(), byName.GetProperty("items").EnumerateArray().Select(x => x.GetProperty("code").GetString()!).Order().ToArray());
        Assert.Equal(2, byName.GetProperty("total").GetInt32());
        var first = byName.GetProperty("items").EnumerateArray().First(x => x.GetProperty("code").GetString() == a);
        Assert.Equal($"alpha.{tag}@test.hcmus.local", first.GetProperty("emails")[0].GetProperty("email").GetString());
        Assert.True(first.GetProperty("emails")[0].GetProperty("isPrimary").GetBoolean());

        var byEmail = await (await editor.GetAsync($"/api/manage/employees?q=gamma.{tag}")).ReadAsync();
        Assert.Equal(c, Assert.Single(byEmail.GetProperty("items").EnumerateArray()).GetProperty("code").GetString());

        var byCode = await (await editor.GetAsync($"/api/manage/employees?q={b.ToLowerInvariant()}")).ReadAsync();
        Assert.Equal(b, Assert.Single(byCode.GetProperty("items").EnumerateArray()).GetProperty("code").GetString());

        var inactive = await (await editor.GetAsync($"/api/manage/employees?q={tag}&status=inactive")).ReadAsync();
        Assert.Equal(c, Assert.Single(inactive.GetProperty("items").EnumerateArray()).GetProperty("code").GetString());

        var noEmail = await (await editor.GetAsync($"/api/manage/employees?q={tag}&hasEmail=false")).ReadAsync();
        Assert.Equal(b, Assert.Single(noEmail.GetProperty("items").EnumerateArray()).GetProperty("code").GetString());
        var withEmail = await (await editor.GetAsync($"/api/manage/employees?q={tag}&hasEmail=true")).ReadAsync();
        Assert.Equal(2, withEmail.GetProperty("items").GetArrayLength());
    }

    [Fact]
    public async Task Directory_pages_by_code_with_a_cursor()
    {
        var editor = await _factory.SignInNewAsync(Roles.Editor);
        var tag = Tag();
        var codes = new List<string>();
        for (var i = 0; i < 3; i++) codes.Add(await NewEmployeeAsync([], $"Phân Trang {tag}"));
        codes.Sort(StringComparer.Ordinal);

        var page1 = await (await editor.GetAsync($"/api/manage/employees?q=phan%20trang%20{tag}&limit=2")).ReadAsync();
        Assert.Equal(2, page1.GetProperty("items").GetArrayLength());
        Assert.Equal(3, page1.GetProperty("total").GetInt32());
        var cursor = page1.GetProperty("nextCursor").GetString();
        Assert.False(string.IsNullOrEmpty(cursor));

        var page2 = await (await editor.GetAsync($"/api/manage/employees?q=phan%20trang%20{tag}&limit=2&cursor={Uri.EscapeDataString(cursor!)}")).ReadAsync();
        Assert.Equal(1, page2.GetProperty("items").GetArrayLength());
        Assert.Equal(System.Text.Json.JsonValueKind.Null, page2.GetProperty("nextCursor").ValueKind);
        Assert.Equal(codes, page1.GetProperty("items").EnumerateArray().Concat(page2.GetProperty("items").EnumerateArray())
            .Select(x => x.GetProperty("code").GetString()!).ToList());
    }

    [Fact]
    public async Task Get_returns_the_employee_with_the_unit_or_404()
    {
        var editor = await _factory.SignInNewAsync(Roles.Editor);
        var code = await NewEmployeeAsync([$"x{Tag()}@test.hcmus.local"]);

        var dto = await GetAsync(editor, code);
        Assert.Equal(code, dto.GetProperty("code").GetString());
        Assert.Equal("active", dto.GetProperty("status").GetString());
        Assert.Equal(1, dto.GetProperty("emails").GetArrayLength());

        Assert.Equal(HttpStatusCode.NotFound, (await editor.GetAsync(Url("NOPE-" + Tag()))).StatusCode);
    }

    [Fact]
    public async Task Directory_flags_emails_that_equal_another_employees_hrm_personal_email()
    {
        var editor = await _factory.SignInNewAsync(Roles.Editor);
        var tag = Tag();
        var shared = $"shared.{tag}@test.hcmus.local";
        var mapped = await NewEmployeeAsync([shared], $"Được Gắn {tag}");
        var hrmOwner = await NewEmployeeAsync([], $"Chủ Hrm {tag}");
        var clean = await NewEmployeeAsync([$"clean.{tag}@test.hcmus.local"], $"Sạch {tag}");
        await _factory.WithDbAsync(async db =>
        {
            db.Set<EmployeeProfile>().Add(new EmployeeProfile { EmployeeCode = hrmOwner, PersonalEmail = shared.ToUpperInvariant() });
            // The same person's own HRM email is not a conflict.
            db.Set<EmployeeProfile>().Add(new EmployeeProfile { EmployeeCode = clean, PersonalEmail = $"clean.{tag}@test.hcmus.local" });
            await db.SaveChangesAsync();
            return 0;
        });

        var all = await (await editor.GetAsync($"/api/manage/employees?q={tag}")).ReadAsync();
        var flagged = all.GetProperty("items").EnumerateArray().Where(x => x.GetProperty("hasHrmConflict").GetBoolean()).ToList();
        Assert.Equal(mapped, Assert.Single(flagged).GetProperty("code").GetString());
        Assert.True(flagged[0].GetProperty("emails")[0].GetProperty("hrmConflict").GetBoolean());

        var filtered = await (await editor.GetAsync($"/api/manage/employees?q={tag}&flagged=true")).ReadAsync();
        Assert.Equal(mapped, Assert.Single(filtered.GetProperty("items").EnumerateArray()).GetProperty("code").GetString());
        Assert.Equal(1, filtered.GetProperty("total").GetInt32());
    }

    [Fact]
    public async Task A_conflicting_email_names_its_hrm_owner_and_stops_being_flagged_once_accepted()
    {
        var editor = await _factory.SignInNewAsync(Roles.Editor);
        var employee = await _factory.SignInNewAsync();
        var tag = Tag();
        var shared = $"keep.{tag}@test.hcmus.local";
        var mapped = await NewEmployeeAsync([shared], $"Được Gắn {tag}");
        var hrmOwner = await NewEmployeeAsync([], $"Chủ Hrm {tag}");
        await _factory.WithDbAsync(async db =>
        {
            db.Set<EmployeeProfile>().Add(new EmployeeProfile { EmployeeCode = hrmOwner, PersonalEmail = shared });
            await db.SaveChangesAsync();
            return 0;
        });

        var before = (await (await editor.GetAsync(Url(mapped))).ReadAsync()).GetProperty("emails")[0];
        Assert.True(before.GetProperty("hrmConflict").GetBoolean());
        var owner = Assert.Single(before.GetProperty("hrmConflictOwners").EnumerateArray());
        Assert.Equal(hrmOwner, owner.GetProperty("code").GetString());
        Assert.Equal($"Chủ Hrm {tag}", owner.GetProperty("fullName").GetString());

        Assert.Equal(HttpStatusCode.Forbidden, (await employee.SendAsync(HttpMethod.Put, EmailUrl(mapped, shared, "/hrm-conflict/accept"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await editor.SendAsync(HttpMethod.Put, EmailUrl(mapped, "nope@x.vn", "/hrm-conflict/accept"))).StatusCode);

        var accepted = await editor.SendAsync(HttpMethod.Put, EmailUrl(mapped, shared, "/hrm-conflict/accept"));
        Assert.Equal(HttpStatusCode.OK, accepted.StatusCode);
        var body = await accepted.ReadAsync();
        Assert.False(body.GetProperty("hasHrmConflict").GetBoolean());
        Assert.False(body.GetProperty("emails")[0].GetProperty("hrmConflict").GetBoolean());
        Assert.Equal(0, body.GetProperty("emails")[0].GetProperty("hrmConflictOwners").GetArrayLength());

        var flagged = await (await editor.GetAsync($"/api/manage/employees?q={tag}&flagged=true")).ReadAsync();
        Assert.Equal(0, flagged.GetProperty("total").GetInt32());
        // Idempotent.
        Assert.Equal(HttpStatusCode.OK, (await editor.SendAsync(HttpMethod.Put, EmailUrl(mapped, shared, "/hrm-conflict/accept"))).StatusCode);
    }

    // ---- add ----

    [Fact]
    public async Task First_email_is_primary_a_later_one_is_not_and_is_primary_moves_the_flag_and_every_add_is_audited()
    {
        var editor = await _factory.SignInNewAsync(Roles.Editor);
        var code = await NewEmployeeAsync();
        var tag = Tag();
        var first = $"first.{tag}@test.hcmus.local";
        var second = $"second.{tag}@test.hcmus.local";
        var third = $"third.{tag}@test.hcmus.local";

        var r1 = await editor.SendAsync(HttpMethod.Post, Url(code, "/emails"), new { email = $"  {first.ToUpperInvariant()} ", note = "Email trường" });
        Assert.Equal(HttpStatusCode.Created, r1.StatusCode);
        var d1 = await r1.ReadAsync();
        Assert.Equal(first, PrimaryOf(d1)); // stored lower-cased and trimmed
        Assert.Equal("Email trường", d1.GetProperty("emails")[0].GetProperty("note").GetString());
        Assert.Equal(editor.Code, d1.GetProperty("emails")[0].GetProperty("addedBy").GetString());

        var d2 = await (await editor.SendAsync(HttpMethod.Post, Url(code, "/emails"), new { email = second })).ReadAsync();
        Assert.Equal(first, PrimaryOf(d2));
        Assert.Equal(2, EmailsOf(d2).Length);

        var d3 = await (await editor.SendAsync(HttpMethod.Post, Url(code, "/emails"), new { email = third, isPrimary = true })).ReadAsync();
        Assert.Equal(third, PrimaryOf(d3));
        Assert.Single(d3.GetProperty("emails").EnumerateArray().Where(e => e.GetProperty("isPrimary").GetBoolean()));

        var audits = await _factory.AuditAsync("employee_email.added", code);
        Assert.Equal(3, audits.Count);
        Assert.All(audits, a => Assert.Equal(editor.Code, a.ActorCode));
    }

    [Fact]
    public async Task Add_rejects_bad_emails_duplicates_other_owners_unknown_employees_and_more_than_ten()
    {
        var editor = await _factory.SignInNewAsync(Roles.Editor);
        var tag = Tag();
        var code = await NewEmployeeAsync([$"own.{tag}@test.hcmus.local"]);
        var other = await NewEmployeeAsync([$"other.{tag}@test.hcmus.local"]);

        foreach (var bad in new[] { "", "   ", "no-at-sign", "a@b", "two@@x.vn", "has space@x.vn", "a@b.vn,c@d.vn", new string('a', 250) + "@x.vn" })
            Assert.Equal(HttpStatusCode.BadRequest, (await editor.SendAsync(HttpMethod.Post, Url(code, "/emails"), new { email = bad })).StatusCode);

        Assert.Equal(HttpStatusCode.Conflict, (await editor.SendAsync(HttpMethod.Post, Url(code, "/emails"), new { email = $"OWN.{tag}@test.hcmus.local" })).StatusCode);
        var owned = await editor.SendAsync(HttpMethod.Post, Url(code, "/emails"), new { email = $"other.{tag}@test.hcmus.local" });
        Assert.Equal(HttpStatusCode.Conflict, owned.StatusCode);
        Assert.Contains(other, await owned.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.NotFound, (await editor.SendAsync(HttpMethod.Post, Url("NOPE-" + tag, "/emails"), new { email = $"x.{tag}@test.hcmus.local" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await editor.SendAsync(HttpMethod.Post, Url(code, "/emails"),
            new { email = $"note.{tag}@test.hcmus.local", note = new string('n', 501) })).StatusCode);

        for (var i = 0; i < EmployeeEmailsServiceLimit - 1; i++)
            Assert.Equal(HttpStatusCode.Created, (await editor.SendAsync(HttpMethod.Post, Url(code, "/emails"), new { email = $"n{i}.{tag}@test.hcmus.local" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await editor.SendAsync(HttpMethod.Post, Url(code, "/emails"), new { email = $"over.{tag}@test.hcmus.local" })).StatusCode);

        Assert.Equal(EmployeeEmailsServiceLimit - 1, (await _factory.AuditAsync("employee_email.added", code)).Count); // failures are not audited
    }

    private const int EmployeeEmailsServiceLimit = 10;

    [Fact]
    public async Task The_first_email_of_an_active_employee_notifies_the_activation_observers_but_not_a_second_or_an_inactive_one()
    {
        var editor = await _factory.SignInNewAsync(Roles.Editor);
        var tag = Tag();
        var active = await NewEmployeeAsync();
        var inactive = await NewEmployeeAsync(status: EmployeeStatuses.Inactive);

        await editor.SendAsync(HttpMethod.Post, Url(inactive, "/emails"), new { email = $"in.{tag}@test.hcmus.local" });
        Assert.False(EmailActivationLog.Saw(inactive));

        await editor.SendAsync(HttpMethod.Post, Url(active, "/emails"), new { email = $"a1.{tag}@test.hcmus.local" });
        Assert.True(EmailActivationLog.Saw(active));
        var count = EmailActivationLog.Activated.Count(c => c == active);
        await editor.SendAsync(HttpMethod.Post, Url(active, "/emails"), new { email = $"a2.{tag}@test.hcmus.local" });
        Assert.Equal(count, EmailActivationLog.Activated.Count(c => c == active));
    }

    [Fact]
    public async Task A_new_mapping_lets_the_person_sign_in_with_that_email()
    {
        var editor = await _factory.SignInNewAsync(Roles.Editor);
        var tag = Tag();
        var code = await NewEmployeeAsync();
        var email = $"newly.mapped.{tag}@test.hcmus.local";

        async Task<SignInResult> Evaluate()
        {
            await using var scope = _factory.Services.CreateAsyncScope();
            return await scope.ServiceProvider.GetRequiredService<GoogleSignInService>().EvaluateAsync(GoogleIdToken(email));
        }

        Assert.Equal(SignInOutcome.NotRegistered, (await Evaluate()).Outcome);
        Assert.Equal(HttpStatusCode.Created, (await editor.SendAsync(HttpMethod.Post, Url(code, "/emails"), new { email })).StatusCode);
        var result = await Evaluate();
        Assert.True(result.Succeeded);
        Assert.Equal(code, result.EmployeeCode);
        Assert.Equal(HttpStatusCode.OK, (await editor.SendAsync(HttpMethod.Delete, EmailUrl(code, email))).StatusCode);
        Assert.Equal(SignInOutcome.NotRegistered, (await Evaluate()).Outcome);
    }

    // ---- remove ----

    [Fact]
    public async Task Removing_the_primary_promotes_the_oldest_remaining_and_is_audited()
    {
        var editor = await _factory.SignInNewAsync(Roles.Editor);
        var tag = Tag();
        var code = await NewEmployeeAsync();
        string[] emails = [$"p.{tag}@test.hcmus.local", $"q.{tag}@test.hcmus.local", $"r.{tag}@test.hcmus.local"];
        foreach (var e in emails) await editor.SendAsync(HttpMethod.Post, Url(code, "/emails"), new { email = e });

        var response = await editor.SendAsync(HttpMethod.Delete, EmailUrl(code, emails[0].ToUpperInvariant()));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var dto = await response.ReadAsync();
        Assert.Equal([emails[1], emails[2]], EmailsOf(dto).Order().ToArray());
        Assert.Equal(emails[1], PrimaryOf(dto));
        Assert.Equal(dto.ToString(), (await GetAsync(editor, code)).ToString());
        Assert.Single(await _factory.AuditAsync("employee_email.removed", code));

        // A non-primary removal keeps the primary.
        var dto2 = await (await editor.SendAsync(HttpMethod.Delete, EmailUrl(code, emails[2]))).ReadAsync();
        Assert.Equal(emails[1], PrimaryOf(dto2));
    }

    [Fact]
    public async Task Remove_answers_404_for_an_unknown_employee_or_an_email_of_someone_else()
    {
        var editor = await _factory.SignInNewAsync(Roles.Editor);
        var tag = Tag();
        var a = await NewEmployeeAsync([$"a.{tag}@test.hcmus.local"]);
        var b = await NewEmployeeAsync([$"b.{tag}@test.hcmus.local"]);

        Assert.Equal(HttpStatusCode.NotFound, (await editor.SendAsync(HttpMethod.Delete, EmailUrl("NOPE-" + tag, $"a.{tag}@test.hcmus.local"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await editor.SendAsync(HttpMethod.Delete, EmailUrl(a, $"b.{tag}@test.hcmus.local"))).StatusCode);
        Assert.Equal(1, (await GetAsync(editor, b)).GetProperty("emails").GetArrayLength());
    }

    [Fact]
    public async Task You_cannot_remove_your_own_last_email_but_can_remove_someone_elses()
    {
        var editor = await _factory.SignInNewAsync(Roles.Editor);
        var victim = await _factory.SignInNewAsync();
        Assert.Equal(HttpStatusCode.OK, (await victim.GetAsync("/api/auth/me")).StatusCode);

        var self = await editor.SendAsync(HttpMethod.Delete, EmailUrl(editor.Code, DefaultEmail(editor.Code)));
        Assert.Equal(HttpStatusCode.Conflict, self.StatusCode);
        Assert.Equal(1, (await GetAsync(editor, editor.Code)).GetProperty("emails").GetArrayLength());

        Assert.Equal(HttpStatusCode.OK, (await editor.SendAsync(HttpMethod.Delete, EmailUrl(victim.Code, DefaultEmail(victim.Code)))).StatusCode);
        Assert.Equal(0, (await GetAsync(editor, victim.Code)).GetProperty("emails").GetArrayLength());
    }

    [Fact]
    public async Task The_last_email_of_the_last_active_admin_cannot_be_removed()
    {
        var admin = await _factory.SignInNewAsync(Roles.Admin);
        await _factory.RemoveOtherAdminsAsync(admin.Code);
        var editor = await _factory.SignInNewAsync(Roles.Editor);

        var response = await editor.SendAsync(HttpMethod.Delete, EmailUrl(admin.Code, DefaultEmail(admin.Code)));
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(1, (await GetAsync(editor, admin.Code)).GetProperty("emails").GetArrayLength());

        // With a second email the first can go.
        await editor.SendAsync(HttpMethod.Post, Url(admin.Code, "/emails"), new { email = $"second.{Tag()}@test.hcmus.local" });
        Assert.Equal(HttpStatusCode.OK, (await editor.SendAsync(HttpMethod.Delete, EmailUrl(admin.Code, DefaultEmail(admin.Code)))).StatusCode);
    }

    // ---- primary ----

    [Fact]
    public async Task Set_primary_moves_the_flag_is_idempotent_and_only_audits_a_change()
    {
        var editor = await _factory.SignInNewAsync(Roles.Editor);
        var tag = Tag();
        var code = await NewEmployeeAsync([$"one.{tag}@test.hcmus.local", $"two.{tag}@test.hcmus.local"]);

        var dto = await (await editor.SendAsync(HttpMethod.Put, EmailUrl(code, $"TWO.{tag}@test.hcmus.local", "/primary"))).ReadAsync();
        Assert.Equal($"two.{tag}@test.hcmus.local", PrimaryOf(dto));
        Assert.Single(dto.GetProperty("emails").EnumerateArray().Where(e => e.GetProperty("isPrimary").GetBoolean()));
        Assert.Equal($"two.{tag}@test.hcmus.local", dto.GetProperty("emails")[0].GetProperty("email").GetString()); // primary listed first
        Assert.Single(await _factory.AuditAsync("employee_email.primary_set", code));

        await editor.SendAsync(HttpMethod.Put, EmailUrl(code, $"two.{tag}@test.hcmus.local", "/primary"));
        Assert.Single(await _factory.AuditAsync("employee_email.primary_set", code));

        Assert.Equal(HttpStatusCode.NotFound, (await editor.SendAsync(HttpMethod.Put, EmailUrl(code, $"zzz.{tag}@test.hcmus.local", "/primary"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await editor.SendAsync(HttpMethod.Put, EmailUrl("NOPE-" + tag, $"two.{tag}@test.hcmus.local", "/primary"))).StatusCode);
    }

    [Fact]
    public async Task The_database_allows_only_one_primary_email_per_employee()
    {
        var tag = Tag();
        var code = await NewEmployeeAsync([$"only.{tag}@test.hcmus.local"]);
        await Assert.ThrowsAsync<DbUpdateException>(() => _factory.WithDbAsync(async db =>
        {
            db.Set<EmployeeEmail>().Add(new EmployeeEmail { Email = $"second.{tag}@test.hcmus.local", EmployeeCode = code, IsPrimary = true });
            await db.SaveChangesAsync();
            return 0;
        }));
    }

    // ---- import ----

    private static byte[] Workbook(params string?[][] rows)
    {
        using var wb = new XLWorkbook();
        var ws = wb.AddWorksheet("Nhân sự");
        for (var r = 0; r < rows.Length; r++)
            for (var c = 0; c < rows[r].Length; c++)
                if (rows[r][c] is { } value) ws.Cell(r + 1, c + 1).Value = value;
        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    private static readonly string?[] Header = ["MSCB", "Họ tên", "Email 1", "Email 2", "Email 3"];

    private static Task<HttpResponseMessage> Upload(Session s, byte[] file, bool dryRun, bool removeMissing = false, string name = "nhan-su.xlsx")
    {
        var form = new MultipartFormDataContent { { new ByteArrayContent(file), "file", name } };
        var request = new HttpRequestMessage(HttpMethod.Post, $"/api/manage/employees/emails/import?dryRun={dryRun.ToString().ToLowerInvariant()}&removeMissing={removeMissing.ToString().ToLowerInvariant()}") { Content = form }
            .WithXsrf(s.Token);
        return s.Client.SendAsync(request);
    }

    private static string[] Codes(System.Text.Json.JsonElement list, string property = "code") =>
        list.EnumerateArray().Select(x => x.GetProperty(property).GetString()!).ToArray();

    [Fact]
    public async Task Import_dry_run_reports_without_writing_and_commit_applies_the_same_report()
    {
        var editor = await _factory.SignInNewAsync(Roles.Editor);
        var tag = Tag();
        var fresh = await NewEmployeeAsync([], $"Nguyễn Văn Mới {tag}");
        var existing = await NewEmployeeAsync([$"kept.{tag}@test.hcmus.local"], $"Trần Thị Cũ {tag}");
        var owner = await NewEmployeeAsync([$"taken.{tag}@test.hcmus.local"], $"Chủ Email {tag}");
        var claimant = await NewEmployeeAsync([], $"Người Xin {tag}");
        var unknown = "UNK" + tag.ToUpperInvariant();
        var file = Workbook(Header,
            [fresh, $"Nguyen Van Moi {tag}", $"New1.{tag}@test.hcmus.local", $"new2.{tag}@test.hcmus.local", "not-an-email"],
            [existing, $"Trần Thị Cũ {tag}", $"kept.{tag}@test.hcmus.local", $"added.{tag}@test.hcmus.local"],
            [claimant, "Ai đó", $"TAKEN.{tag}@test.hcmus.local"],
            [unknown, "Không có", $"unk.{tag}@test.hcmus.local"],
            [null, null, null],
            [fresh.ToLowerInvariant(), null, $"new2.{tag}@test.hcmus.local"]);

        var dryResponse = await Upload(editor, file, dryRun: true);
        Assert.Equal(HttpStatusCode.OK, dryResponse.StatusCode);
        var dry = await dryResponse.ReadAsync();
        Assert.True(dry.GetProperty("dryRun").GetBoolean());
        Assert.Equal(3, dry.GetProperty("addedCount").GetInt32()); // new1, new2 (once), added
        Assert.Equal(1, dry.GetProperty("unchangedCount").GetInt32());
        Assert.Equal(0, dry.GetProperty("removedCount").GetInt32());
        Assert.Equal(1, dry.GetProperty("conflictCount").GetInt32());
        Assert.Equal(1, dry.GetProperty("unknownCount").GetInt32());
        Assert.Equal(1, dry.GetProperty("invalidCount").GetInt32());
        var conflict = Assert.Single(dry.GetProperty("conflicts").EnumerateArray());
        Assert.Equal("owned_by_other", conflict.GetProperty("reason").GetString());
        Assert.Equal(owner, conflict.GetProperty("ownerCode").GetString());
        Assert.Equal(unknown, Assert.Single(dry.GetProperty("unknown").EnumerateArray()).GetProperty("code").GetString());
        Assert.Equal("invalid_format", Assert.Single(dry.GetProperty("invalid").EnumerateArray()).GetProperty("reason").GetString());
        var primary = Assert.Single(dry.GetProperty("added").EnumerateArray().Where(a => a.GetProperty("isPrimary").GetBoolean()));
        Assert.Equal(fresh, primary.GetProperty("code").GetString());
        Assert.Equal($"new1.{tag}@test.hcmus.local", primary.GetProperty("email").GetString());
        var warnings = dry.GetProperty("warnings").EnumerateArray().ToList();
        Assert.Equal(claimant, Assert.Single(warnings, w => w.GetProperty("reason").GetString() == "name_mismatch").GetProperty("code").GetString());
        Assert.Contains(warnings, w => w.GetProperty("reason").GetString() == "duplicate_in_row");

        // Nothing was written.
        Assert.Equal(0, (await GetAsync(editor, fresh)).GetProperty("emails").GetArrayLength());
        Assert.Equal(1, (await GetAsync(editor, existing)).GetProperty("emails").GetArrayLength());
        Assert.DoesNotContain(await _factory.AuditAsync("employee_email.imported"), a => a.ActorCode == editor.Code);

        var commit = await (await Upload(editor, file, dryRun: false)).ReadAsync();
        Assert.False(commit.GetProperty("dryRun").GetBoolean());
        Assert.Equal(3, commit.GetProperty("addedCount").GetInt32());

        var freshAfter = await GetAsync(editor, fresh);
        Assert.Equal([$"new1.{tag}@test.hcmus.local", $"new2.{tag}@test.hcmus.local"], EmailsOf(freshAfter));
        Assert.Equal($"new1.{tag}@test.hcmus.local", PrimaryOf(freshAfter));
        var existingAfter = await GetAsync(editor, existing);
        Assert.Equal($"kept.{tag}@test.hcmus.local", PrimaryOf(existingAfter));
        Assert.Equal(2, existingAfter.GetProperty("emails").GetArrayLength());
        Assert.Equal(owner, (await (await editor.GetAsync($"/api/manage/employees?q=taken.{tag}")).ReadAsync()).GetProperty("items")[0].GetProperty("code").GetString());
        Assert.True(EmailActivationLog.Saw(fresh));

        var audit = Assert.Single(await _factory.AuditAsync("employee_email.imported"), a => a.ActorCode == editor.Code && a.Details!.Contains("nhan-su.xlsx"));
        Assert.Equal(3, System.Text.Json.JsonDocument.Parse(audit.Details!).RootElement.GetProperty("added").GetInt32());

        // Running the same file again changes nothing.
        var again = await (await Upload(editor, file, dryRun: false)).ReadAsync();
        Assert.Equal(0, again.GetProperty("addedCount").GetInt32());
        Assert.Equal(4, again.GetProperty("unchangedCount").GetInt32());
    }

    [Fact]
    public async Task Import_with_remove_missing_makes_the_file_authoritative_and_keeps_one_primary()
    {
        var editor = await _factory.SignInNewAsync(Roles.Editor);
        var tag = Tag();
        var code = await NewEmployeeAsync([$"old1.{tag}@test.hcmus.local", $"old2.{tag}@test.hcmus.local", $"keep.{tag}@test.hcmus.local"]);
        var typo = await NewEmployeeAsync([$"safe.{tag}@test.hcmus.local"]);
        var file = Workbook(Header,
            [code, null, $"keep.{tag}@test.hcmus.local", $"fresh.{tag}@test.hcmus.local"],
            [typo, null, "broken"]);

        var dry = await (await Upload(editor, file, dryRun: true, removeMissing: true)).ReadAsync();
        Assert.Equal(2, dry.GetProperty("removedCount").GetInt32());
        Assert.Equal(1, dry.GetProperty("addedCount").GetInt32());
        Assert.Equal(2, dry.GetProperty("removed").GetArrayLength());
        Assert.Equal(3, (await GetAsync(editor, code)).GetProperty("emails").GetArrayLength());

        await Upload(editor, file, dryRun: false, removeMissing: true);
        var after = await GetAsync(editor, code);
        Assert.Equal([$"fresh.{tag}@test.hcmus.local", $"keep.{tag}@test.hcmus.local"], EmailsOf(after).Order().ToArray());
        Assert.Equal($"keep.{tag}@test.hcmus.local", PrimaryOf(after)); // the first email of the row
        Assert.Single(after.GetProperty("emails").EnumerateArray().Where(e => e.GetProperty("isPrimary").GetBoolean()));

        // A row whose emails are all invalid never empties a person.
        Assert.Equal([$"safe.{tag}@test.hcmus.local"], EmailsOf(await GetAsync(editor, typo)));
    }

    [Fact]
    public async Task Import_reports_an_email_claimed_by_two_mscb_in_one_file_and_caps_emails_per_person()
    {
        var editor = await _factory.SignInNewAsync(Roles.Editor);
        var tag = Tag();
        var a = await NewEmployeeAsync();
        var b = await NewEmployeeAsync();
        var c = await NewEmployeeAsync(Enumerable.Range(0, 9).Select(i => $"c{i}.{tag}@test.hcmus.local").ToArray());
        var file = Workbook(Header,
            [a, null, $"dup.{tag}@test.hcmus.local"],
            [b, null, $"DUP.{tag}@test.hcmus.local", $"b.{tag}@test.hcmus.local"],
            [c, null, $"c9.{tag}@test.hcmus.local", $"c10.{tag}@test.hcmus.local"]);

        var report = await (await Upload(editor, file, dryRun: false)).ReadAsync();
        var conflict = Assert.Single(report.GetProperty("conflicts").EnumerateArray());
        Assert.Equal("duplicate_in_file", conflict.GetProperty("reason").GetString());
        Assert.Equal(b, conflict.GetProperty("code").GetString());
        Assert.Equal(a, conflict.GetProperty("ownerCode").GetString());
        Assert.Equal("too_many", Assert.Single(report.GetProperty("invalid").EnumerateArray()).GetProperty("reason").GetString());

        Assert.Equal([$"dup.{tag}@test.hcmus.local"], EmailsOf(await GetAsync(editor, a)));
        Assert.Equal([$"b.{tag}@test.hcmus.local"], EmailsOf(await GetAsync(editor, b)));
        Assert.Equal(10, (await GetAsync(editor, c)).GetProperty("emails").GetArrayLength());
    }

    [Fact]
    public async Task Import_warns_when_an_email_is_the_hrm_personal_email_of_another_employee_and_on_a_name_mismatch()
    {
        var editor = await _factory.SignInNewAsync(Roles.Editor);
        var tag = Tag();
        var target = await NewEmployeeAsync([], $"Người Nhận {tag}");
        var hrmOwner = await NewEmployeeAsync();
        var email = $"hrm.{tag}@test.hcmus.local";
        await _factory.WithDbAsync(async db =>
        {
            db.Set<EmployeeProfile>().Add(new EmployeeProfile { EmployeeCode = hrmOwner, PersonalEmail = email });
            await db.SaveChangesAsync();
            return 0;
        });

        var report = await (await Upload(editor, Workbook(Header, [target, "Một Cái Tên Khác", email]), dryRun: true)).ReadAsync();
        var reasons = report.GetProperty("warnings").EnumerateArray().Select(w => w.GetProperty("reason").GetString()).Order().ToArray();
        Assert.Equal(["hrm_conflict", "name_mismatch"], reasons);
        Assert.Equal(1, report.GetProperty("addedCount").GetInt32()); // warnings do not block
    }

    [Fact]
    public async Task Import_accepts_header_variants_a_csv_file_and_merges_repeated_mscb_rows()
    {
        var editor = await _factory.SignInNewAsync(Roles.Editor);
        var tag = Tag();
        var code = await NewEmployeeAsync();
        var csv = Encoding.UTF8.GetBytes($"Mã số cán bộ;Họ và tên;E-mail 1;Email 2\n{code};;one.{tag}@test.hcmus.local;\n{code};;;two.{tag}@test.hcmus.local\n");

        var report = await (await Upload(editor, csv, dryRun: false, name: "nhan-su.csv")).ReadAsync();
        Assert.Equal(2, report.GetProperty("addedCount").GetInt32());
        Assert.Equal(1, report.GetProperty("employees").GetInt32());
        Assert.Equal([$"one.{tag}@test.hcmus.local", $"two.{tag}@test.hcmus.local"], EmailsOf(await GetAsync(editor, code)).Order().ToArray());
    }

    [Fact]
    public async Task Import_rejects_bad_files()
    {
        var editor = await _factory.SignInNewAsync(Roles.Editor);

        Assert.Equal(HttpStatusCode.BadRequest, (await Upload(editor, Encoding.UTF8.GetBytes("not a workbook"), dryRun: true)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Upload(editor, [1, 2, 3], dryRun: true, name: "x.pdf")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Upload(editor, Workbook(["Họ tên", "Email 1"], ["A", "a@b.vn"]), dryRun: true)).StatusCode); // no MSCB column
        Assert.Equal(HttpStatusCode.BadRequest, (await Upload(editor, Workbook(["MSCB", "Họ tên"], ["T1", "A"]), dryRun: true)).StatusCode); // no email columns
        Assert.Equal(HttpStatusCode.BadRequest, (await Upload(editor, Workbook(), dryRun: true)).StatusCode);

        var empty = new MultipartFormDataContent();
        var response = await editor.Client.SendAsync(new HttpRequestMessage(HttpMethod.Post, "/api/manage/employees/emails/import") { Content = empty }.WithXsrf(editor.Token));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}

internal static class SessionFileExtensions
{
    public static Task<HttpResponseMessage> PostFileAsync(this Session s, string url, string fileName, byte[] content)
    {
        var form = new MultipartFormDataContent { { new ByteArrayContent(content), "file", fileName } };
        return s.Client.SendAsync(new HttpRequestMessage(HttpMethod.Post, url) { Content = form }.WithXsrf(s.Token));
    }
}
