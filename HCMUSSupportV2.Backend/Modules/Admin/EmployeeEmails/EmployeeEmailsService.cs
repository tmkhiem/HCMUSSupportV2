using System.Text.RegularExpressions;
using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Admin.Common;
using HCMUSSupportV2.Backend.Modules.Hrm.Domain;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Modules.Identity.Groups;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace HCMUSSupportV2.Backend.Modules.Admin.EmployeeEmails;

/// <summary>
/// The MSCB to email mapping (<c>employee_emails</c>) maintained by editors: directory, add, remove, set primary.
/// Rules: an address belongs to exactly one MSCB (case-insensitive); at most <see cref="MaxEmails"/> per employee;
/// exactly one primary per employee that has any address (the first one added is primary, removing the primary
/// promotes the oldest remaining one). Writes run in a transaction under an advisory lock and are audited.
/// </summary>
public partial class EmployeeEmailsService(
    AppDbContext db,
    ICurrentUser user,
    LastAdminGuard guard,
    IAuditLogger audit,
    IEnumerable<IEmployeeActivationObserver> activationObservers,
    TimeProvider time)
{
    public const int MaxEmails = 10;
    public const int MaxPageSize = 200;
    internal const long WriteLockKey = 0x4D41494C_0001;

    [GeneratedRegex(@"^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$")]
    private static partial Regex EmailPattern();

    public static string? NormalizeEmail(string? email)
    {
        var value = email?.Trim().ToLowerInvariant();
        return value is { Length: > 0 and <= 254 } && EmailPattern().IsMatch(value) ? value : null;
    }

    // ---- reads ----

    public async Task<ManagedEmployeePageDto> ListAsync(string? q, string? status, bool? hasEmail, bool? flagged, long? unitId,
        string? cursor, int limit, CancellationToken ct)
    {
        limit = Math.Clamp(limit, 1, MaxPageSize);
        var query = db.Set<Employee>().AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim();
            var namePattern = TextSearch.ContainsPattern(term);
            var codePattern = TextSearch.EscapeLike(term) + "%";
            var emailPattern = "%" + TextSearch.EscapeLike(term) + "%";
            query = query.Where(e => EF.Functions.ILike(e.Code, codePattern)
                || EF.Functions.ILike(e.FullNameUnaccent, namePattern)
                || db.Set<EmployeeEmail>().Any(m => m.EmployeeCode == e.Code && EF.Functions.ILike(m.Email, emailPattern)));
        }
        if (!string.IsNullOrWhiteSpace(status)) query = query.Where(e => e.Status == status);
        if (unitId is { } unit) query = query.Where(e => e.OrgUnitId == unit);
        if (hasEmail is { } has)
            query = has
                ? query.Where(e => db.Set<EmployeeEmail>().Any(m => m.EmployeeCode == e.Code))
                : query.Where(e => !db.Set<EmployeeEmail>().Any(m => m.EmployeeCode == e.Code));
        if (flagged == true)
            query = query.Where(e => ConflictingEmails().Any(c => c.EmployeeCode == e.Code));

        var total = await query.CountAsync(ct);
        if (AdminQuery.DecodeCursor(cursor) is { } after) query = query.Where(e => string.Compare(e.Code, after) > 0);

        var rows = await (
            from e in query
            join u in db.Set<OrgUnit>().AsNoTracking() on e.OrgUnitId equals u.Id into units
            from u in units.DefaultIfEmpty()
            orderby e.Code
            select new { e.Code, e.FullName, e.Status, e.Source, e.OrgUnitId, Unit = u != null ? u.Name : null, e.PositionTitle })
            .Take(limit + 1).ToListAsync(ct);

        var page = rows.Take(limit).ToList();
        var next = rows.Count > limit ? AdminQuery.EncodeCursor(page[^1].Code) : null;
        var emails = await LoadEmailsAsync(page.Select(r => r.Code).ToList(), ct);
        var items = page.Select(r =>
        {
            var list = emails.GetValueOrDefault(r.Code) ?? [];
            return new ManagedEmployeeDto(r.Code, r.FullName, r.Status, r.Source, r.OrgUnitId, r.Unit, r.PositionTitle, list,
                list.Any(m => m.HrmConflict));
        }).ToList();
        return new ManagedEmployeePageDto(items, next, total);
    }

    public async Task<ManagedEmployeeDto?> GetAsync(string code, CancellationToken ct)
    {
        var row = await (
            from e in db.Set<Employee>().AsNoTracking()
            where e.Code == code
            join u in db.Set<OrgUnit>().AsNoTracking() on e.OrgUnitId equals u.Id into units
            from u in units.DefaultIfEmpty()
            select new { e.Code, e.FullName, e.Status, e.Source, e.OrgUnitId, Unit = u != null ? u.Name : null, e.PositionTitle })
            .FirstOrDefaultAsync(ct);
        if (row is null) return null;
        var list = (await LoadEmailsAsync([code], ct)).GetValueOrDefault(code) ?? [];
        return new ManagedEmployeeDto(row.Code, row.FullName, row.Status, row.Source, row.OrgUnitId, row.Unit, row.PositionTitle, list,
            list.Any(m => m.HrmConflict));
    }

    /// <summary>Mapped emails that equal the HRM personal email of a different employee.</summary>
    private IQueryable<EmployeeEmail> ConflictingEmails() =>
        db.Set<EmployeeEmail>().Where(m => db.Set<EmployeeProfile>().Any(p =>
            p.EmployeeCode != m.EmployeeCode && p.PersonalEmail != null && p.PersonalEmail.ToLower() == m.Email.ToLower()));

    private async Task<Dictionary<string, List<ManagedEmailDto>>> LoadEmailsAsync(IReadOnlyCollection<string> codes, CancellationToken ct)
    {
        var rows = await db.Set<EmployeeEmail>().AsNoTracking().Where(m => codes.Contains(m.EmployeeCode))
            .OrderByDescending(m => m.IsPrimary).ThenBy(m => m.AddedAt).ThenBy(m => m.Email).ToListAsync(ct);
        var conflicts = (await ConflictingEmails().Where(m => codes.Contains(m.EmployeeCode)).Select(m => m.Email).ToListAsync(ct))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        return rows.GroupBy(m => m.EmployeeCode).ToDictionary(g => g.Key,
            g => g.Select(m => new ManagedEmailDto(m.Email, m.IsPrimary, m.Note, m.AddedBy, m.AddedAt, conflicts.Contains(m.Email))).ToList());
    }

    // ---- writes ----

    private async Task<Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction> BeginWriteAsync(CancellationToken ct)
    {
        var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlAsync($"SELECT pg_advisory_xact_lock({WriteLockKey})", ct);
        return tx;
    }

    public async Task<ManagedEmployeeDto> AddAsync(string code, AddEmployeeEmailRequest request, CancellationToken ct)
    {
        var email = NormalizeEmail(request.Email)
            ?? throw GroupsException.BadRequest("Invalid email", "Địa chỉ email không hợp lệ.");
        var note = request.Note?.Trim();
        if (note is { Length: > 500 }) throw GroupsException.BadRequest("Note too long", "Ghi chú tối đa 500 ký tự.");
        if (string.IsNullOrEmpty(note)) note = null;

        bool firstEmail;
        string status;
        bool primary;
        await using (var tx = await BeginWriteAsync(ct))
        {
            var employee = await db.Set<Employee>().AsNoTracking().FirstOrDefaultAsync(e => e.Code == code, ct)
                ?? throw NotFound();
            status = employee.Status;

            var existing = await db.Set<EmployeeEmail>().Where(m => m.EmployeeCode == code).ToListAsync(ct);
            if (existing.Any(m => string.Equals(m.Email, email, StringComparison.OrdinalIgnoreCase)))
                throw GroupsException.Conflict("Email already mapped", "Email này đã được gắn với cán bộ này.");
            if (await db.Set<EmployeeEmail>().AsNoTracking().Where(m => m.Email == email).Select(m => m.EmployeeCode).FirstOrDefaultAsync(ct) is { } owner)
                throw GroupsException.Conflict("Email owned by another employee", $"Email này đã được gắn với MSCB {owner}.");
            if (existing.Count >= MaxEmails)
                throw GroupsException.BadRequest("Too many emails", $"Mỗi cán bộ có tối đa {MaxEmails} email.");

            firstEmail = existing.Count == 0;
            primary = firstEmail || request.IsPrimary == true;
            if (primary && existing.Any(m => m.IsPrimary))
                await db.Set<EmployeeEmail>().Where(m => m.EmployeeCode == code && m.IsPrimary).ExecuteUpdateAsync(s => s.SetProperty(m => m.IsPrimary, false), ct);

            db.Set<EmployeeEmail>().Add(new EmployeeEmail
            {
                Email = email, EmployeeCode = code, IsPrimary = primary, Note = note, AddedBy = user.Code, AddedAt = time.GetUtcNow(),
            });
            try
            {
                await db.SaveChangesAsync(ct);
            }
            catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
            {
                throw GroupsException.Conflict("Email owned by another employee", "Email này đã được gắn với một cán bộ khác.");
            }
            await tx.CommitAsync(ct);
        }

        await audit.LogAsync(EmployeeEmailAuditActions.Added, "employee", code, new { email, isPrimary = primary }, ct);
        if (firstEmail && status == EmployeeStatuses.Active)
            foreach (var observer in activationObservers)
                await observer.OnEmployeesActivatedAsync([code], ct);
        return (await GetAsync(code, ct))!;
    }

    public async Task<ManagedEmployeeDto> RemoveAsync(string code, string rawEmail, CancellationToken ct)
    {
        var email = rawEmail.Trim().ToLowerInvariant();
        bool wasPrimary;
        await using (var tx = await BeginWriteAsync(ct))
        {
            if (!await db.Set<Employee>().AnyAsync(e => e.Code == code, ct)) throw NotFound();
            var rows = await db.Set<EmployeeEmail>().Where(m => m.EmployeeCode == code).ToListAsync(ct);
            var row = rows.FirstOrDefault(m => string.Equals(m.Email, email, StringComparison.OrdinalIgnoreCase))
                ?? throw new GroupsException(404, "Email not found", "Không tìm thấy email này của cán bộ.");

            if (rows.Count == 1)
            {
                if (code == user.Code)
                    throw GroupsException.Conflict("Cannot remove your own last email",
                        "Không thể gỡ email cuối cùng của chính mình (bạn sẽ không đăng nhập lại được).");
                if (await guard.IsLastAdminAsync(code, ct))
                    throw GroupsException.Conflict("Cannot remove the last admin's last email",
                        "Không thể gỡ email cuối cùng của quản trị viên cuối cùng của hệ thống.");
            }

            wasPrimary = row.IsPrimary;
            db.Set<EmployeeEmail>().Remove(row);
            await db.SaveChangesAsync(ct);

            var rest = rows.Where(m => m != row).ToList();
            if (wasPrimary && rest.Count > 0)
            {
                rest.OrderBy(m => m.AddedAt).ThenBy(m => m.Email, StringComparer.Ordinal).First().IsPrimary = true;
                await db.SaveChangesAsync(ct);
            }
            await tx.CommitAsync(ct);
        }

        await audit.LogAsync(EmployeeEmailAuditActions.Removed, "employee", code, new { email, wasPrimary }, ct);
        return (await GetAsync(code, ct))!;
    }

    public async Task<ManagedEmployeeDto> SetPrimaryAsync(string code, string rawEmail, CancellationToken ct)
    {
        var email = rawEmail.Trim().ToLowerInvariant();
        var changed = false;
        await using (var tx = await BeginWriteAsync(ct))
        {
            if (!await db.Set<Employee>().AnyAsync(e => e.Code == code, ct)) throw NotFound();
            var rows = await db.Set<EmployeeEmail>().Where(m => m.EmployeeCode == code).ToListAsync(ct);
            var row = rows.FirstOrDefault(m => string.Equals(m.Email, email, StringComparison.OrdinalIgnoreCase))
                ?? throw new GroupsException(404, "Email not found", "Không tìm thấy email này của cán bộ.");
            if (!row.IsPrimary)
            {
                await db.Set<EmployeeEmail>().Where(m => m.EmployeeCode == code && m.IsPrimary).ExecuteUpdateAsync(s => s.SetProperty(m => m.IsPrimary, false), ct);
                row.IsPrimary = true;
                await db.SaveChangesAsync(ct);
                changed = true;
            }
            await tx.CommitAsync(ct);
        }

        if (changed) await audit.LogAsync(EmployeeEmailAuditActions.PrimarySet, "employee", code, new { email }, ct);
        return (await GetAsync(code, ct))!;
    }

    internal static GroupsException NotFound() => new(404, "Employee not found", "Không tìm thấy cán bộ.");
}
