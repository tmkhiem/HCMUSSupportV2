using System.Text.Json;
using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Hrm.Domain;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Modules.Identity.Groups;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace HCMUSSupportV2.Backend.Modules.Hrm.Integration;

/// <summary>Per-run state handed to a dataset flow.</summary>
public sealed class IngestContext(NpgsqlConnection conn)
{
    public NpgsqlConnection Conn { get; } = conn;
    public IssueSink Issues { get; } = new();
    public MergeCounts Counts { get; set; }
    public List<string> Notes { get; } = [];
    public List<string> NewlyActive { get; } = [];
    public bool RosterChanged { get; set; }
}

public sealed record IngestOutcome(IngestResultDto? Result, string? RefusedReason, long RunId, int Received, int? Previous);

/// <summary>
/// Full-snapshot ingest of the HRM datasets. Each run: truncation guard, one transaction (binary COPY into a temp table,
/// MERGE), a <c>sync_runs</c> row and <c>sync_issues</c> rows, then the audience observers.
/// </summary>
public class IngestService(
    AppDbContext db,
    IDbContextFactory<AppDbContext> dbFactory,
    IHttpContextAccessor http,
    TimeProvider time,
    IEnumerable<IEmployeeActivationObserver> activationObservers,
    IEnumerable<IRosterSyncObserver> rosterObservers,
    ILogger<IngestService> logger)
{
    public const double TruncationThreshold = 0.8;

    // ---------------------------------------------------------------- run harness

    private async Task<IngestOutcome> RunAsync(string dataset, int received, bool force, Func<IngestContext, CancellationToken, Task> work, CancellationToken ct)
    {
        var source = http.HttpContext?.User.FindFirst(ApiKeyDefaults.ClientNameClaim)?.Value ?? "unknown";

        var last = await db.Set<SyncRun>().AsNoTracking()
            .Where(r => r.Dataset == dataset && r.Status == SyncStatuses.Success)
            .OrderByDescending(r => r.StartedAt).ThenByDescending(r => r.Id)
            .FirstOrDefaultAsync(ct);
        if (!force && last is { Received: > 0 } && received < last.Received * TruncationThreshold)
        {
            var reason = $"Snapshot has {received} rows, fewer than {TruncationThreshold:P0} of the last successful run ({last.Received}). Resend with ?force=true to apply it.";
            var refused = new SyncRun
            {
                Source = source, Dataset = dataset, StartedAt = time.GetUtcNow(), FinishedAt = time.GetUtcNow(),
                Status = SyncStatuses.Refused, Received = received, Error = reason,
            };
            db.Set<SyncRun>().Add(refused);
            await db.SaveChangesAsync(ct);
            return new IngestOutcome(null, reason, refused.Id, received, last.Received);
        }

        var run = new SyncRun { Source = source, Dataset = dataset, StartedAt = time.GetUtcNow(), Status = SyncStatuses.Running, Received = received };
        IngestContext ctx;
        try
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            db.Set<SyncRun>().Add(run);
            await db.SaveChangesAsync(ct);

            ctx = new IngestContext((NpgsqlConnection)db.Database.GetDbConnection());
            await work(ctx, ct);

            run.Inserted = ctx.Counts.Inserted;
            run.Updated = ctx.Counts.Updated;
            run.Deleted = ctx.Counts.Deleted;
            run.Status = SyncStatuses.Success;
            run.FinishedAt = time.GetUtcNow();
            foreach (var issue in ctx.Issues.Issues)
            {
                db.Set<SyncIssue>().Add(new SyncIssue
                {
                    SyncRunId = run.Id, Dataset = dataset, Kind = issue.Kind,
                    SourceKey = Truncate(issue.SourceKey, 200),
                    Details = issue.Details is null ? null : JsonSerializer.Serialize(issue.Details, MergeEngine.Json),
                });
            }
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "HRM ingest of {Dataset} failed", dataset);
            db.ChangeTracker.Clear();
            await using var other = await dbFactory.CreateDbContextAsync(CancellationToken.None);
            other.Set<SyncRun>().Add(new SyncRun
            {
                Source = source, Dataset = dataset, StartedAt = run.StartedAt, FinishedAt = time.GetUtcNow(),
                Status = SyncStatuses.Failed, Received = received, Error = Truncate(ex.Message, 2000),
            });
            await other.SaveChangesAsync(CancellationToken.None);
            throw;
        }

        await NotifyAsync(ctx, ct);

        var byKind = ctx.Issues.Issues.GroupBy(i => i.Kind).ToDictionary(g => g.Key, g => g.Count());
        var result = new IngestResultDto(run.Id, dataset, run.Status, received, run.Inserted, run.Updated, run.Deleted,
            ctx.Issues.Issues.Count, byKind, ctx.Notes);
        return new IngestOutcome(result, null, run.Id, received, last?.Received);
    }

    /// <summary>Observers run after the commit; a failing observer is logged and never undoes the sync.</summary>
    private async Task NotifyAsync(IngestContext ctx, CancellationToken ct)
    {
        if (ctx.NewlyActive.Count > 0)
        {
            foreach (var observer in activationObservers)
            {
                try { await observer.OnEmployeesActivatedAsync(ctx.NewlyActive, ct); }
                catch (Exception ex) { logger.LogError(ex, "IEmployeeActivationObserver {Observer} failed", observer.GetType().Name); }
            }
        }
        if (ctx.RosterChanged)
        {
            foreach (var observer in rosterObservers)
            {
                try { await observer.OnRosterSyncedAsync(ct); }
                catch (Exception ex) { logger.LogError(ex, "IRosterSyncObserver {Observer} failed", observer.GetType().Name); }
            }
        }
    }

    private static string Truncate(string s, int max) => s.Length <= max ? s : s[..max];

    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    // ---------------------------------------------------------------- org units

    public Task<IngestOutcome> IngestOrgUnitsAsync(IReadOnlyList<OrgUnitRow> input, bool force, CancellationToken ct) =>
        RunAsync("org-units", input.Count, force, async (ctx, token) =>
        {
            var rows = DedupeByHrmId(ctx, input, r => r.HrmId);
            var valid = new List<OrgUnitRow>();
            foreach (var r in rows)
            {
                if (r.HrmId <= 0 || string.IsNullOrWhiteSpace(r.Name))
                {
                    ctx.Issues.Add(SyncIssueKinds.BadRow, r.HrmId.ToString(), new { reason = "hrmId must be positive and name is required" });
                    continue;
                }
                valid.Add(r);
            }

            var known = valid.Select(r => r.HrmId).ToHashSet();
            var existing = await MergeEngine.Query(ctx.Conn, "SELECT hrm_id FROM org_units", r => r.GetInt32(0), token);
            foreach (var id in existing) known.Add(id);

            var cols = new[]
            {
                Col.Int("hrm_id"), new Col("parent_hrm_id", "integer", NpgsqlTypes.NpgsqlDbType.Integer, TempOnly: true),
                Col.Text("kind"), Col.Text("name"), Col.Text("code"), Col.Bool("is_active"),
            };
            var data = valid.Select(r =>
            {
                int? parent = r.ParentHrmId;
                if (parent is not null && !known.Contains(parent.Value))
                {
                    ctx.Issues.Add(SyncIssueKinds.UnknownUnit, r.HrmId.ToString(), new { field = "parentHrmId", value = parent });
                    parent = null;
                }
                var kind = r.Kind == OrgUnitKinds.Department ? OrgUnitKinds.Department : OrgUnitKinds.Unit;
                return new object?[] { r.HrmId, parent, kind, r.Name.Trim(), Clean(r.Code), r.IsActive };
            }).ToList();

            // Units are never deleted (employees reference them): units missing from the snapshot are deactivated.
            ctx.Counts = await MergeEngine.RunAsync(ctx.Conn, new MergeSpec("org_units", "hrm_id", cols,
                "WHEN NOT MATCHED BY SOURCE AND t.hrm_id > 0 AND t.is_active THEN UPDATE SET is_active = false, updated_at = now()",
                AfterMerge: (conn, tmp, t) => MergeEngine.Exec(conn,
                    $"""
                    UPDATE org_units u SET parent_id = p.id, updated_at = now()
                    FROM {tmp} s LEFT JOIN org_units p ON p.hrm_id = s.parent_hrm_id
                    WHERE u.hrm_id = s.hrm_id AND u.parent_id IS DISTINCT FROM p.id
                    """, t)), data, token);
            ctx.RosterChanged = true;
        }, ct);

    // ---------------------------------------------------------------- employees

    public Task<IngestOutcome> IngestEmployeesAsync(IReadOnlyList<EmployeeRow> input, bool force, CancellationToken ct) =>
        RunAsync("employees", input.Count, force, async (ctx, token) =>
        {
            var quarantined = new HashSet<string>(StringComparer.Ordinal);
            var rows = new List<EmployeeRow>();

            // Duplicate MSCB: do not guess which person it is; quarantine every row of that code.
            foreach (var group in input.Where(r => !string.IsNullOrWhiteSpace(r.Code)).GroupBy(r => r.Code.Trim()))
            {
                if (group.Count() > 1)
                {
                    quarantined.Add(group.Key);
                    ctx.Issues.Add(SyncIssueKinds.DuplicateMscb, group.Key, new { hrmIds = group.Select(r => r.HrmId).ToArray(), names = group.Select(r => r.FullName).ToArray() });
                }
                else rows.Add(group.First() with { Code = group.Key });
            }
            foreach (var r in input.Where(r => string.IsNullOrWhiteSpace(r.Code)))
                ctx.Issues.Add(SyncIssueKinds.BadRow, "", new { reason = "code is required", hrmId = r.HrmId });

            var units = (await MergeEngine.Query(ctx.Conn, "SELECT hrm_id, id FROM org_units", r => (r.GetInt32(0), r.GetInt64(1)), token))
                .ToDictionary(x => x.Item1, x => x.Item2);
            var existingHrm = (await MergeEngine.Query(ctx.Conn, "SELECT hrm_id, code FROM employees WHERE hrm_id IS NOT NULL", r => (r.GetInt32(0), r.GetString(1)), token))
                .ToDictionary(x => x.Item1, x => x.Item2);
            var before = (await MergeEngine.Query(ctx.Conn, "SELECT code FROM employees WHERE status = 'active'", r => r.GetString(0), token)).ToHashSet();

            // hrm_id is unique: a row whose hrm_id already belongs to another code (or repeats in the batch) is skipped.
            var seenHrm = new Dictionary<int, string>();
            var data = new List<object?[]>();
            var now = DateTime.UtcNow;
            foreach (var r in rows)
            {
                var status = string.IsNullOrWhiteSpace(r.Status) ? EmployeeStatuses.Active : r.Status.Trim().ToLowerInvariant();
                if (status is not (EmployeeStatuses.Active or EmployeeStatuses.Inactive or EmployeeStatuses.Retired) || string.IsNullOrWhiteSpace(r.FullName))
                {
                    ctx.Issues.Add(SyncIssueKinds.BadRow, r.Code, new { reason = "status must be active|inactive|retired and fullName is required" });
                    continue;
                }
                if (r.HrmId is { } h && ((existingHrm.TryGetValue(h, out var owner) && owner != r.Code) || (seenHrm.TryGetValue(h, out var other) && other != r.Code)))
                {
                    ctx.Issues.Add(SyncIssueKinds.DuplicateRow, r.Code, new { reason = "hrmId already used by another code", hrmId = h });
                    continue;
                }
                if (r.HrmId is { } h2) seenHrm[h2] = r.Code;

                long? unit = Unit(ctx, r.Code, "orgUnitHrmId", r.OrgUnitHrmId, units);
                long? dept = Unit(ctx, r.Code, "departmentHrmId", r.DepartmentHrmId, units);
                data.Add([r.Code, r.HrmId, r.FullName.Trim(), unit, dept, Clean(r.PositionTitle), Clean(r.AcademicRank), Clean(r.Degree), status, EmployeeSources.Hrm, now]);
            }

            var cols = new[]
            {
                Col.Text("code"), Col.Int("hrm_id"), Col.Text("full_name"), Col.Long("org_unit_id"), Col.Long("department_id"),
                Col.Text("position_title"), Col.Text("academic_rank"), Col.Text("degree"), Col.Text("status"), Col.Text("source"),
                new Col("synced_at", "timestamptz", NpgsqlTypes.NpgsqlDbType.TimestampTz, Compare: false),
            };
            var q = quarantined.ToArray();
            // Employees are never deleted: HRM-sourced employees missing from the snapshot become inactive.
            ctx.Counts = await MergeEngine.RunAsync(ctx.Conn, new MergeSpec("employees", "code", cols,
                "WHEN NOT MATCHED BY SOURCE AND t.source = 'hrm' AND t.status = 'active' AND t.code <> ALL(@q) THEN UPDATE SET status = 'inactive', updated_at = now()",
                Bind: cmd => cmd.Parameters.Add(new NpgsqlParameter("q", NpgsqlTypes.NpgsqlDbType.Array | NpgsqlTypes.NpgsqlDbType.Text) { Value = q })), data, token);

            var after = await MergeEngine.Query(ctx.Conn, "SELECT code FROM employees WHERE status = 'active'", r => r.GetString(0), token);
            ctx.NewlyActive.AddRange(after.Where(c => !before.Contains(c)));
            ctx.RosterChanged = true;
            if (quarantined.Count > 0) ctx.Notes.Add($"{quarantined.Count} duplicate MSCB quarantined (see sync issues).");
        }, ct);

    private static long? Unit(IngestContext ctx, string code, string field, int? hrmId, Dictionary<int, long> units)
    {
        if (hrmId is null) return null;
        if (units.TryGetValue(hrmId.Value, out var id)) return id;
        ctx.Issues.Add(SyncIssueKinds.UnknownUnit, code, new { field, value = hrmId });
        return null;
    }

    // ---------------------------------------------------------------- profiles (+ sensitive)

    public Task<IngestOutcome> IngestProfilesAsync(IReadOnlyList<ProfileRow> input, bool force, CancellationToken ct) =>
        RunAsync("profiles", input.Count, force, async (ctx, token) =>
        {
            var quarantined = new HashSet<string>(StringComparer.Ordinal);
            var rows = new List<ProfileRow>();
            foreach (var group in input.Where(r => !string.IsNullOrWhiteSpace(r.EmployeeCode)).GroupBy(r => r.EmployeeCode.Trim()))
            {
                if (group.Count() > 1)
                {
                    quarantined.Add(group.Key);
                    ctx.Issues.Add(SyncIssueKinds.DuplicateMscb, group.Key, new { hrmIds = group.Select(r => r.HrmId).ToArray() });
                }
                else rows.Add(group.First() with { EmployeeCode = group.Key });
            }

            var codes = await ExistingCodesAsync(ctx, rows.Select(r => r.EmployeeCode), token);
            var profileData = new List<object?[]>();
            var sensitiveData = new List<object?[]>();
            var seenHrm = new HashSet<int>();
            foreach (var r in rows)
            {
                if (!codes.Contains(r.EmployeeCode))
                {
                    ctx.Issues.Add(SyncIssueKinds.UnknownEmployee, r.EmployeeCode);
                    continue;
                }
                int? hrmId = r.HrmId is { } h && seenHrm.Add(h) ? h : null;
                var k = r.EmployeeCode;
                var dob = ctx.Issues.Date(k, "dateOfBirth", r.DateOfBirth, out var dobPrec);
                profileData.Add([
                    k, hrmId, Clean(r.LastName), Clean(r.FirstName), dob, dobPrec,
                    Clean(r.Gender), Clean(r.Ethnicity), Clean(r.Religion), Clean(r.Nationality), Clean(r.BirthPlace), Clean(r.Hometown),
                    Clean(r.PhoneMobile), Clean(r.PhoneHome), Clean(r.PersonalEmail),
                    Clean(r.PermanentAddress), Clean(r.PermanentWard), Clean(r.PermanentDistrict), Clean(r.PermanentProvince),
                    Clean(r.ContactAddress), Clean(r.ContactWard), Clean(r.ContactDistrict), Clean(r.ContactProvince),
                    Clean(r.SalaryGradeCode), Clean(r.SalaryGradeName), r.SalaryStep, r.SalaryCoefficient, r.OverGradePct,
                    Clean(r.EducationLevel), Clean(r.Major), Clean(r.PoliticalTheory),
                    r.IsPartyMember, ctx.Issues.Date(k, "partyJoinedOn", r.PartyJoinedOn), Clean(r.PartyFileNo), Clean(r.PartyCardNo),
                    r.IsYouthUnionMember, ctx.Issues.Date(k, "youthUnionJoinedOn", r.YouthUnionJoinedOn), Clean(r.YouthFileNo), Clean(r.YouthCardNo),
                    r.IsTradeUnionMember, ctx.Issues.Date(k, "tradeUnionJoinedOn", r.TradeUnionJoinedOn), Clean(r.TradeUnionCardNo),
                ]);
                if (r.Sensitive is { } s)
                {
                    sensitiveData.Add([
                        k, Clean(s.NationalId), ctx.Issues.Date(k, "sensitive.nationalIdIssuedOn", s.NationalIdIssuedOn), Clean(s.NationalIdIssuedBy),
                        Clean(s.TaxCode), Clean(s.BankName), Clean(s.BankBranch), Clean(s.BankAccount), Clean(s.SocialInsuranceNo), Clean(s.HealthInsuranceNo),
                    ]);
                }
            }

            var q = quarantined.ToArray();
            void Bind(NpgsqlCommand c) => c.Parameters.Add(new NpgsqlParameter("q", NpgsqlTypes.NpgsqlDbType.Array | NpgsqlTypes.NpgsqlDbType.Text) { Value = q });
            const string Del = "WHEN NOT MATCHED BY SOURCE AND t.employee_code <> ALL(@q) THEN DELETE";

            var profileCols = new[]
            {
                Col.Text("employee_code"), Col.Int("hrm_id"), Col.Text("last_name"), Col.Text("first_name"), Col.Date("date_of_birth"), Col.Text("date_of_birth_precision"),
                Col.Text("gender"), Col.Text("ethnicity"), Col.Text("religion"), Col.Text("nationality"), Col.Text("birth_place"), Col.Text("hometown"),
                Col.Text("phone_mobile"), Col.Text("phone_home"), Col.Text("personal_email"),
                Col.Text("permanent_address"), Col.Text("permanent_ward"), Col.Text("permanent_district"), Col.Text("permanent_province"),
                Col.Text("contact_address"), Col.Text("contact_ward"), Col.Text("contact_district"), Col.Text("contact_province"),
                Col.Text("salary_grade_code"), Col.Text("salary_grade_name"), Col.Int("salary_step"), Col.Num("salary_coefficient"), Col.Num("over_grade_pct"),
                Col.Text("education_level"), Col.Text("major"), Col.Text("political_theory"),
                Col.Bool("is_party_member"), Col.Date("party_joined_on"), Col.Text("party_file_no"), Col.Text("party_card_no"),
                Col.Bool("is_youth_union_member"), Col.Date("youth_union_joined_on"), Col.Text("youth_file_no"), Col.Text("youth_card_no"),
                Col.Bool("is_trade_union_member"), Col.Date("trade_union_joined_on"), Col.Text("trade_union_card_no"),
            };
            ctx.Counts = await MergeEngine.RunAsync(ctx.Conn, new MergeSpec("employee_profiles", "employee_code", profileCols, Del, Bind), profileData, token);

            var sensitiveCols = new[]
            {
                Col.Text("employee_code"), Col.Text("national_id"), Col.Date("national_id_issued_on"), Col.Text("national_id_issued_by"),
                Col.Text("tax_code"), Col.Text("bank_name"), Col.Text("bank_branch"), Col.Text("bank_account"), Col.Text("social_insurance_no"), Col.Text("health_insurance_no"),
            };
            var sensitiveCounts = await MergeEngine.RunAsync(ctx.Conn, new MergeSpec("employee_sensitive", "employee_code", sensitiveCols, Del, Bind), sensitiveData, token);
            ctx.Notes.Add($"employee_sensitive: {sensitiveCounts.Inserted} inserted, {sensitiveCounts.Updated} updated, {sensitiveCounts.Deleted} deleted.");
            if (quarantined.Count > 0) ctx.Notes.Add($"{quarantined.Count} duplicate MSCB quarantined (see sync issues).");
        }, ct);

    // ---------------------------------------------------------------- child datasets

    private sealed record ChildSpec<TRow>(
        string Dataset, string Table, Col[] Cols, Func<TRow, int> HrmId, Func<TRow, string> Employee,
        Func<TRow, string, IssueSink, object?[]?> Project);

    private Task<IngestOutcome> IngestChildAsync<TRow>(ChildSpec<TRow> spec, IReadOnlyList<TRow> input, bool force, CancellationToken ct) =>
        RunAsync(spec.Dataset, input.Count, force, async (ctx, token) =>
        {
            var rows = DedupeByHrmId(ctx, input, spec.HrmId);
            var codes = await ExistingCodesAsync(ctx, rows.Select(r => spec.Employee(r)?.Trim() ?? ""), token);
            var data = new List<object?[]>();
            foreach (var r in rows)
            {
                var hrmId = spec.HrmId(r);
                var code = spec.Employee(r)?.Trim() ?? "";
                if (hrmId <= 0) { ctx.Issues.Add(SyncIssueKinds.BadRow, hrmId.ToString(), new { reason = "hrmId must be positive" }); continue; }
                if (!codes.Contains(code)) { ctx.Issues.Add(SyncIssueKinds.UnknownEmployee, code, new { hrmId }); continue; }
                var projected = spec.Project(r, code, ctx.Issues);
                if (projected is null) { ctx.Issues.Add(SyncIssueKinds.BadRow, hrmId.ToString(), new { reason = "required field missing or invalid", employee = code }); continue; }
                data.Add(projected);
            }
            ctx.Counts = await MergeEngine.RunAsync(ctx.Conn, new MergeSpec(spec.Table, "hrm_id", spec.Cols, "WHEN NOT MATCHED BY SOURCE THEN DELETE"), data, token);
        }, ct);

    private static readonly Col[] SalaryCols =
    [
        Col.Int("hrm_id"), Col.Text("employee_code"), Col.Text("grade_code"), Col.Text("grade_name"), Col.Int("step"), Col.Num("coefficient"), Col.Num("over_grade_pct"),
        Col.Text("decision_no"), Col.Date("signed_on"), Col.Date("effective_from"), Col.Date("next_raise_on"), Col.Text("note"),
    ];

    public Task<IngestOutcome> IngestSalaryAsync(IReadOnlyList<SalaryRow> rows, bool force, CancellationToken ct) =>
        IngestChildAsync(new ChildSpec<SalaryRow>("salary", "salary_history", SalaryCols, r => r.HrmId, r => r.EmployeeCode,
            (r, code, s) =>
            {
                var key = r.HrmId.ToString();
                return [r.HrmId, code, Clean(r.GradeCode), Clean(r.GradeName), r.Step, r.Coefficient, r.OverGradePct, Clean(r.DecisionNo),
                    s.Date(key, "signedOn", r.SignedOn), s.Date(key, "effectiveFrom", r.EffectiveFrom), s.Date(key, "nextRaiseOn", r.NextRaiseOn), Clean(r.Note)];
            }), rows, force, ct);

    private static readonly Col[] PositionCols =
    [
        Col.Int("hrm_id"), Col.Text("employee_code"), Col.Text("title"), Col.Text("unit_description"), Col.Num("coefficient"),
        Col.Date("appointed_on"), Col.Text("decision_no"), Col.Date("signed_on"), Col.Date("ended_on"),
    ];

    public Task<IngestOutcome> IngestPositionsAsync(IReadOnlyList<PositionRow> rows, bool force, CancellationToken ct) =>
        IngestChildAsync(new ChildSpec<PositionRow>("positions", "position_history", PositionCols, r => r.HrmId, r => r.EmployeeCode,
            (r, code, s) =>
            {
                if (string.IsNullOrWhiteSpace(r.Title)) return null;
                var key = r.HrmId.ToString();
                return [r.HrmId, code, r.Title.Trim(), Clean(r.UnitDescription), r.Coefficient, s.Date(key, "appointedOn", r.AppointedOn),
                    Clean(r.DecisionNo), s.Date(key, "signedOn", r.SignedOn), s.Date(key, "endedOn", r.EndedOn)];
            }), rows, force, ct);

    private static readonly Col[] CommendationCols =
    [
        Col.Int("hrm_id"), Col.Text("employee_code"), Col.Text("kind"), Col.Text("name"), Col.Text("academic_year"), Col.Text("decision_no"),
        Col.Date("decided_on"), Col.Text("decided_on_precision"),
    ];

    public Task<IngestOutcome> IngestCommendationsAsync(IReadOnlyList<CommendationRow> rows, bool force, CancellationToken ct) =>
        IngestChildAsync(new ChildSpec<CommendationRow>("commendations", "commendations", CommendationCols, r => r.HrmId, r => r.EmployeeCode,
            (r, code, s) =>
            {
                var kind = r.Kind?.Trim().ToLowerInvariant();
                if (kind is not (CommendationKinds.Award or CommendationKinds.Title) || string.IsNullOrWhiteSpace(r.Name)) return null;
                var date = s.Date(r.HrmId.ToString(), "decidedOn", r.DecidedOn, out var prec);
                return [r.HrmId, code, kind, r.Name.Trim(), Clean(r.AcademicYear), Clean(r.DecisionNo), date, prec];
            }), rows, force, ct);

    private static readonly Col[] DegreeCols =
    [
        Col.Int("hrm_id"), Col.Text("employee_code"), Col.Text("degree_type"), Col.Text("major"), Col.Text("institution"), Col.Text("country"), Col.Text("training_form"),
        Col.Date("enrolled_on"), Col.Text("enrolled_on_precision"), Col.Date("graduated_on"), Col.Text("graduated_on_precision"), Col.Text("thesis_title"),
    ];

    public Task<IngestOutcome> IngestDegreesAsync(IReadOnlyList<DegreeRow> rows, bool force, CancellationToken ct) =>
        IngestChildAsync(new ChildSpec<DegreeRow>("degrees", "academic_degrees", DegreeCols, r => r.HrmId, r => r.EmployeeCode,
            (r, code, s) =>
            {
                var key = r.HrmId.ToString();
                var enrolled = s.Date(key, "enrolledOn", r.EnrolledOn, out var ep);
                var graduated = s.Date(key, "graduatedOn", r.GraduatedOn, out var gp);
                return [r.HrmId, code, Clean(r.DegreeType), Clean(r.Major), Clean(r.Institution), Clean(r.Country), Clean(r.TrainingForm),
                    enrolled, ep, graduated, gp, Clean(r.ThesisTitle)];
            }), rows, force, ct);

    private static readonly Col[] TrainingCols =
    [
        Col.Int("hrm_id"), Col.Text("employee_code"), Col.Text("content"), Col.Text("place"), Col.Text("training_form"),
        Col.Date("start_on"), Col.Text("start_on_precision"), Col.Date("end_on"), Col.Text("end_on_precision"),
    ];

    public Task<IngestOutcome> IngestTrainingsAsync(IReadOnlyList<TrainingRow> rows, bool force, CancellationToken ct) =>
        IngestChildAsync(new ChildSpec<TrainingRow>("trainings", "trainings", TrainingCols, r => r.HrmId, r => r.EmployeeCode,
            (r, code, s) =>
            {
                if (string.IsNullOrWhiteSpace(r.Content)) return null;
                var key = r.HrmId.ToString();
                var start = s.Date(key, "startOn", r.StartOn, out var sp);
                var end = s.Date(key, "endOn", r.EndOn, out var ep);
                return [r.HrmId, code, r.Content.Trim(), Clean(r.Place), Clean(r.TrainingForm), start, sp, end, ep];
            }), rows, force, ct);

    private static readonly Col[] TripCols =
    [
        Col.Int("hrm_id"), Col.Text("employee_code"), Col.Date("from_on"), Col.Date("to_on"), Col.Text("place"), Col.Text("purpose"), Col.Text("transport"),
        Col.Text("decision_no"), Col.Date("decided_on"), Col.Text("note"),
    ];

    public Task<IngestOutcome> IngestBusinessTripsAsync(IReadOnlyList<BusinessTripRow> rows, bool force, CancellationToken ct) =>
        IngestChildAsync(new ChildSpec<BusinessTripRow>("business-trips", "business_trips", TripCols, r => r.HrmId, r => r.EmployeeCode,
            (r, code, s) =>
            {
                var key = r.HrmId.ToString();
                return [r.HrmId, code, s.Date(key, "fromOn", r.FromOn), s.Date(key, "toOn", r.ToOn), Clean(r.Place), Clean(r.Purpose), Clean(r.Transport),
                    Clean(r.DecisionNo), s.Date(key, "decidedOn", r.DecidedOn), Clean(r.Note)];
            }), rows, force, ct);

    private static readonly Col[] InnovationCols =
    [
        Col.Int("hrm_id"), Col.Text("employee_code"), Col.Text("code"), Col.Text("title"), Col.Text("type"), Col.Text("decision_no"),
        Col.Date("recognized_on"), Col.Text("academic_year"),
    ];

    public Task<IngestOutcome> IngestInnovationsAsync(IReadOnlyList<InnovationRow> rows, bool force, CancellationToken ct) =>
        IngestChildAsync(new ChildSpec<InnovationRow>("innovations", "innovations", InnovationCols, r => r.HrmId, r => r.EmployeeCode,
            (r, code, s) =>
            {
                if (string.IsNullOrWhiteSpace(r.Title)) return null;
                return [r.HrmId, code, Clean(r.Code), r.Title.Trim(), Clean(r.Type), Clean(r.DecisionNo),
                    s.Date(r.HrmId.ToString(), "recognizedOn", r.RecognizedOn), Clean(r.AcademicYear)];
            }), rows, force, ct);

    // ---------------------------------------------------------------- helpers

    private static List<TRow> DedupeByHrmId<TRow>(IngestContext ctx, IReadOnlyList<TRow> input, Func<TRow, int> hrmId)
    {
        var map = new Dictionary<int, TRow>();
        foreach (var r in input)
        {
            var id = hrmId(r);
            if (map.ContainsKey(id)) ctx.Issues.Add(SyncIssueKinds.DuplicateRow, id.ToString(), new { reason = "hrmId repeated in the batch; the last row wins" });
            map[id] = r;
        }
        return map.Values.ToList();
    }

    private static async Task<HashSet<string>> ExistingCodesAsync(IngestContext ctx, IEnumerable<string> codes, CancellationToken ct)
    {
        var distinct = codes.Where(c => c.Length > 0).Distinct().ToArray();
        var found = new HashSet<string>(StringComparer.Ordinal);
        await using var cmd = new NpgsqlCommand("SELECT code FROM employees WHERE code = ANY(@codes)", ctx.Conn);
        cmd.Parameters.Add(new NpgsqlParameter("codes", NpgsqlTypes.NpgsqlDbType.Array | NpgsqlTypes.NpgsqlDbType.Text) { Value = distinct });
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct)) found.Add(reader.GetString(0));
        return found;
    }
}
