using System.Text.RegularExpressions;
using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Hrm.Integration;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Modules.Identity.Groups;
using HCMUSSupportV2.Backend.Modules.Notifications;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;

namespace HCMUSSupportV2.Backend.Modules.Legacy.Emails;

/// <summary>
/// D15: imports the v1 users.json email mapping (docs/LEGACY-MIGRATION.md). Existing mappings are never overwritten or
/// deleted; the job costs five statements however large the payload is.
/// </summary>
public partial class LegacyEmailImportService(
    AppDbContext db,
    IAuditLogger audit,
    IHttpContextAccessor http,
    IEnumerable<IEmployeeActivationObserver> activationObservers,
    ILogger<LegacyEmailImportService> logger)
{
    public const string Note = "v1 users.json";

    [GeneratedRegex(@"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
    private static partial Regex EmailPattern();

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();

    private sealed class User(string code)
    {
        public string Code { get; } = code;
        public string? Name { get; set; }
        public List<string> Emails { get; } = [];
    }

    private sealed record EmployeeInfo(string Status, bool? NameMatches);

    public async Task<LegacyEmailReport> ImportAsync(IReadOnlyList<LegacyEmailUser> input, bool dryRun, CancellationToken ct)
    {
        var details = new List<LegacyEmailDetail>();
        var emailCount = 0;

        // 1. Normalise: trim, lower-case, drop invalid emails, merge repeated MSCBs.
        var users = new Dictionary<string, User>(StringComparer.Ordinal);
        foreach (var raw in input)
        {
            var code = (raw?.Code ?? "").Trim();
            var entries = raw?.Emails ?? [];
            emailCount += entries.Count;
            if (code.Length == 0)
            {
                details.Add(new LegacyEmailDetail(LegacyEmailIssueKinds.UnknownEmployee, ""));
                continue;
            }
            if (!users.TryGetValue(code, out var user)) users[code] = user = new User(code);
            if (user.Name is null && !string.IsNullOrWhiteSpace(raw?.Name)) user.Name = Whitespace().Replace(raw.Name.Trim(), " ");
            foreach (var entry in entries)
            {
                var email = (entry ?? "").Trim().ToLowerInvariant();
                if (email.Length == 0 || email.Length > 320 || !EmailPattern().IsMatch(email))
                {
                    details.Add(new LegacyEmailDetail(LegacyEmailIssueKinds.InvalidEmail, code, entry?.Trim() ?? ""));
                    continue;
                }
                if (!user.Emails.Contains(email)) user.Emails.Add(email);
            }
        }

        // 2. The same email under two MSCBs: skipped for both.
        var owners = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        foreach (var user in users.Values)
            foreach (var email in user.Emails)
            {
                if (!owners.TryGetValue(email, out var list)) owners[email] = list = [];
                list.Add(user.Code);
            }
        var duplicated = owners.Where(o => o.Value.Count > 1).Select(o => o.Key).ToHashSet(StringComparer.Ordinal);
        foreach (var email in duplicated)
            foreach (var code in owners[email])
                details.Add(new LegacyEmailDetail(LegacyEmailIssueKinds.DuplicateInSource, code, email, owners[email].First(c => c != code)));

        // 3. Lookups: employees (with the unaccented name comparison), then existing mappings by email or MSCB.
        var codes = users.Keys.ToArray();
        var allEmails = owners.Keys.ToArray();
        var employees = new Dictionary<string, EmployeeInfo>(StringComparer.Ordinal);
        var existing = new Dictionary<string, string>(StringComparer.Ordinal);       // email -> MSCB
        var hasPrimary = new HashSet<string>(StringComparer.Ordinal);
        var hasAnyEmail = new HashSet<string>(StringComparer.Ordinal);

        var conn = (NpgsqlConnection)db.Database.GetDbConnection();
        await db.Database.OpenConnectionAsync(ct);
        try
        {
            await using (var cmd = new NpgsqlCommand("""
                SELECT s.code, e.status,
                       lower(e.full_name_unaccent) = lower(f_unaccent(s.name)) AS name_matches
                FROM unnest(@codes, @names) AS s(code, name)
                JOIN employees e ON e.code = s.code
                """, conn))
            {
                cmd.Add("codes", NpgsqlDbType.Array | NpgsqlDbType.Text, codes);
                cmd.Add("names", NpgsqlDbType.Array | NpgsqlDbType.Text, codes.Select(c => users[c].Name).ToArray());
                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct))
                    employees[r.GetString(0)] = new EmployeeInfo(r.GetString(1), r.IsDBNull(2) ? null : r.GetBoolean(2));
            }

            await using (var cmd = new NpgsqlCommand("""
                SELECT email::text, employee_code, is_primary FROM employee_emails
                WHERE email = ANY(@emails::citext[]) OR employee_code = ANY(@codes)
                """, conn))
            {
                cmd.Add("emails", NpgsqlDbType.Array | NpgsqlDbType.Text, allEmails);
                cmd.Add("codes", NpgsqlDbType.Array | NpgsqlDbType.Text, codes);
                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct))
                {
                    var (email, code, primary) = (r.GetString(0).ToLowerInvariant(), r.GetString(1), r.GetBoolean(2));
                    existing[email] = code;
                    hasAnyEmail.Add(code);
                    if (primary) hasPrimary.Add(code);
                }
            }

            // 4. Decide per user.
            var unchanged = 0;
            var insertEmails = new List<string>();
            var insertCodes = new List<string>();
            var insertPrimary = new List<bool>();
            foreach (var user in users.Values)
            {
                if (!employees.TryGetValue(user.Code, out var employee))
                {
                    details.Add(new LegacyEmailDetail(LegacyEmailIssueKinds.UnknownEmployee, user.Code));
                    continue;
                }

                var needsPrimary = !hasPrimary.Contains(user.Code);
                foreach (var email in user.Emails.Where(e => !duplicated.Contains(e)))
                {
                    if (existing.TryGetValue(email, out var owner))
                    {
                        if (owner == user.Code) unchanged++;
                        else details.Add(new LegacyEmailDetail(LegacyEmailIssueKinds.Conflict, user.Code, email, owner));
                        continue;
                    }
                    insertEmails.Add(email);
                    insertCodes.Add(user.Code);
                    insertPrimary.Add(needsPrimary);
                    needsPrimary = false;
                }

                if (employee.Status != EmployeeStatuses.Active)
                    details.Add(new LegacyEmailDetail(LegacyEmailIssueKinds.InactiveEmployee, user.Code));
                if (employee.NameMatches == false)
                    details.Add(new LegacyEmailDetail(LegacyEmailIssueKinds.NameMismatch, user.Code));
            }

            // 5. Write (unless dry run); a concurrent writer winning an email just means it is not inserted here.
            var inserted = insertEmails.Count;
            var firstEmailCodes = new List<string>();
            if (!dryRun && insertEmails.Count > 0)
            {
                var insertedCodes = new List<string>();
                await using var cmd = new NpgsqlCommand("""
                    INSERT INTO employee_emails (email, employee_code, is_primary, note, added_by)
                    SELECT s.email, s.code, s.is_primary, @note, NULL
                    FROM unnest(@emails, @codes, @primary) AS s(email, code, is_primary)
                    ON CONFLICT (email) DO NOTHING
                    RETURNING employee_code
                    """, conn);
                cmd.Add("note", NpgsqlDbType.Text, Note);
                cmd.Add("emails", NpgsqlDbType.Array | NpgsqlDbType.Citext, insertEmails.ToArray());
                cmd.Add("codes", NpgsqlDbType.Array | NpgsqlDbType.Text, insertCodes.ToArray());
                cmd.Add("primary", NpgsqlDbType.Array | NpgsqlDbType.Boolean, insertPrimary.ToArray());
                await using (var r = await cmd.ExecuteReaderAsync(ct))
                    while (await r.ReadAsync(ct)) insertedCodes.Add(r.GetString(0));
                inserted = insertedCodes.Count;
                firstEmailCodes = insertedCodes.Distinct(StringComparer.Ordinal)
                    .Where(c => !hasAnyEmail.Contains(c) && employees[c].Status == EmployeeStatuses.Active).ToList();
            }

            var issues = details.GroupBy(d => d.Kind).ToDictionary(g => g.Key, g => g.Count());
            var report = new LegacyEmailReport(dryRun, input.Count, emailCount, inserted, unchanged, issues, details);

            if (!dryRun)
            {
                await NotifyAsync(firstEmailCodes, ct);
                await audit.LogAsync("legacy.emails", "legacy", null,
                    new { client = http.HttpContext?.User.FindFirst(ApiKeyDefaults.ClientNameClaim)?.Value, report.Users, report.Emails, report.Inserted, report.Unchanged, issues }, ct);
            }
            return report;
        }
        finally
        {
            await db.Database.CloseConnectionAsync();
        }
    }

    /// <summary>Late-joiner backfill for audienceAll posts, same as for editor-added emails. A failing observer never undoes the import.</summary>
    private async Task NotifyAsync(IReadOnlyCollection<string> codes, CancellationToken ct)
    {
        if (codes.Count == 0) return;
        foreach (var observer in activationObservers)
        {
            try { await observer.OnEmployeesActivatedAsync(codes, ct); }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "IEmployeeActivationObserver {Observer} failed", observer.GetType().Name);
            }
        }
    }
}
