using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Hrm.Domain;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Modules.Identity.Groups;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using Microsoft.EntityFrameworkCore;

namespace HCMUSSupportV2.Backend.Modules.Admin.EmployeeEmails;

/// <summary>
/// Bulk import of the MSCB to email mapping from an <c>.xlsx</c> (or <c>.csv</c>) with the header columns
/// <c>MSCB</c>, <c>Họ tên</c> (optional, only compared) and <c>Email 1</c>.. (any column whose header starts with
/// "email"). Stateless two-step flow: upload with <c>dryRun=true</c> to get the report, then the same file with
/// <c>dryRun=false</c> to apply it. Valid rows are applied; conflicts, unknown MSCB and invalid emails are skipped and
/// reported. With <c>removeMissing</c> the file is authoritative for the listed MSCB: their other emails are removed
/// (only when at least one email of the row is valid, so a typo never empties a person).
/// </summary>
public class EmployeeEmailImportService(
    AppDbContext db,
    ICurrentUser user,
    IAuditLogger audit,
    IEnumerable<IEmployeeActivationObserver> activationObservers,
    TimeProvider time)
{
    public const int MaxRows = 20_000;
    public const long MaxBytes = 5 * 1024 * 1024;
    private const int ListCap = 1000;

    private static readonly HashSet<string> CodeHeaders = new(StringComparer.Ordinal)
    {
        "mscb", "code", "ma", "ma so", "ma so can bo", "ma can bo", "ma cb", "employee code",
    };

    private static readonly HashSet<string> NameHeaders = new(StringComparer.Ordinal)
    {
        "ho ten", "ho va ten", "ten", "full name", "name",
    };

    /// <summary>One person of an import: the MSCB, an optional name (only compared) and the raw email texts.</summary>
    public sealed class Entry(int row, string code, string? name)
    {
        public int Row { get; } = row;
        public string Code { get; } = code;
        public string? Name { get; } = name;
        public List<string> RawEmails { get; } = [];
    }

    /// <summary>Where the rows came from: the note stored on new mappings and the name written to the audit log.</summary>
    public sealed record Source(string Note, string AuditName, object? AuditExtra = null);

    public async Task<EmailImportReportDto> ImportAsync(Stream file, string fileName, bool dryRun, bool removeMissing, CancellationToken ct)
    {
        var entries = ReadEntries(file, fileName, out var rowCount, out var skippedEmpty);
        return await ImportEntriesAsync(entries, rowCount, skippedEmpty, dryRun, removeMissing, new Source("Nhập từ tệp", Path.GetFileName(fileName)), ct);
    }

    /// <summary>
    /// The shared core of the import: resolves, checks and (unless <paramref name="dryRun"/>) applies already-parsed entries.
    /// Used by the xlsx/csv upload and by the legacy migration (D15), which reads <c>users.json</c>.
    /// </summary>
    public async Task<EmailImportReportDto> ImportEntriesAsync(IReadOnlyList<Entry> entries, int rowCount, int skippedEmpty,
        bool dryRun, bool removeMissing, Source source, CancellationToken ct)
    {

        // Resolve MSCB (case-insensitive).
        var loweredCodes = entries.Select(e => e.Code.ToLowerInvariant()).Distinct().ToList();
        var employees = (await db.Set<Employee>().AsNoTracking().Where(e => loweredCodes.Contains(e.Code.ToLower()))
            .Select(e => new { e.Code, e.FullName, e.Status }).ToListAsync(ct))
            .ToDictionary(e => e.Code.ToLowerInvariant(), e => e);

        var added = new List<ImportedEmailItemDto>();
        var removed = new List<ImportedEmailItemDto>();
        var conflicts = new List<ImportConflictDto>();
        var unknown = new List<ImportUnknownCodeDto>();
        var invalid = new List<ImportInvalidDto>();
        var warnings = new List<ImportWarningDto>();
        var counts = new Counts();

        // Existing mappings: every email in the file, plus everything the involved employees already have.
        var fileEmails = entries.SelectMany(e => e.RawEmails).Select(EmployeeEmailsService.NormalizeEmail).OfType<string>().Distinct().ToList();
        var knownCodes = employees.Values.Select(e => e.Code).ToList();
        var existing = await db.Set<EmployeeEmail>()
            .Where(m => fileEmails.Contains(m.Email.ToLower()) || knownCodes.Contains(m.EmployeeCode)).ToListAsync(ct);
        var byEmail = existing.ToDictionary(m => m.Email.ToLowerInvariant(), m => m);
        var byCode = existing.GroupBy(m => m.EmployeeCode).ToDictionary(g => g.Key, g => g.ToList());
        var ownerNames = await db.Set<Employee>().AsNoTracking()
            .Where(e => existing.Select(m => m.EmployeeCode).Distinct().Contains(e.Code))
            .Select(e => new { e.Code, e.FullName }).ToDictionaryAsync(e => e.Code, e => e.FullName, ct);

        var hrmOwners = fileEmails.Count == 0 ? new Dictionary<string, string>() :
            (await db.Set<EmployeeProfile>().AsNoTracking()
                .Where(p => p.PersonalEmail != null && fileEmails.Contains(p.PersonalEmail.ToLower()))
                .Select(p => new { Email = p.PersonalEmail!.ToLower(), p.EmployeeCode }).ToListAsync(ct))
            .GroupBy(p => p.Email).ToDictionary(g => g.Key, g => g.First().EmployeeCode);

        var claimedInFile = new Dictionary<string, string>(StringComparer.Ordinal); // email -> code of the first row that wanted it
        var plan = new List<(Entry Entry, string Code, List<string> Keep, List<string> New)>();

        foreach (var entry in entries)
        {
            if (!employees.TryGetValue(entry.Code.ToLowerInvariant(), out var employee))
            {
                counts.Unknown++;
                unknown.Add(new ImportUnknownCodeDto(entry.Row, entry.Code, entry.RawEmails));
                continue;
            }

            if (entry.Name is { Length: > 0 } name
                && !string.Equals(TextSearch.Unaccent(name).Trim(), TextSearch.Unaccent(employee.FullName).Trim(), StringComparison.OrdinalIgnoreCase))
                warnings.Add(new ImportWarningDto(entry.Row, employee.Code, "name_mismatch",
                    $"Họ tên trong tệp (\"{name}\") khác họ tên trong danh bạ (\"{employee.FullName}\")."));

            var current = byCode.GetValueOrDefault(employee.Code) ?? [];
            var keep = new List<string>();
            var fresh = new List<string>();
            var seenInRow = new HashSet<string>(StringComparer.Ordinal);
            foreach (var raw in entry.RawEmails)
            {
                var email = EmployeeEmailsService.NormalizeEmail(raw);
                if (email is null)
                {
                    counts.Invalid++;
                    invalid.Add(new ImportInvalidDto(entry.Row, employee.Code, raw, "invalid_format", $"Email \"{raw}\" không hợp lệ."));
                    continue;
                }
                if (!seenInRow.Add(email))
                {
                    warnings.Add(new ImportWarningDto(entry.Row, employee.Code, "duplicate_in_row", $"Email {email} xuất hiện nhiều lần trong dòng, chỉ tính một lần."));
                    continue;
                }
                if (byEmail.TryGetValue(email, out var owner))
                {
                    if (owner.EmployeeCode == employee.Code) { keep.Add(email); counts.Unchanged++; continue; }
                    counts.Conflicts++;
                    conflicts.Add(new ImportConflictDto(entry.Row, employee.Code, email, "owned_by_other",
                        $"Email đã gắn với MSCB {owner.EmployeeCode}.", owner.EmployeeCode, ownerNames.GetValueOrDefault(owner.EmployeeCode)));
                    continue;
                }
                if (claimedInFile.TryGetValue(email, out var first) && first != employee.Code)
                {
                    counts.Conflicts++;
                    conflicts.Add(new ImportConflictDto(entry.Row, employee.Code, email, "duplicate_in_file",
                        $"Email xuất hiện ở dòng của MSCB {first} trong cùng tệp.", first, null));
                    continue;
                }
                if (current.Count + fresh.Count >= EmployeeEmailsService.MaxEmails)
                {
                    counts.Invalid++;
                    invalid.Add(new ImportInvalidDto(entry.Row, employee.Code, email, "too_many",
                        $"Mỗi cán bộ có tối đa {EmployeeEmailsService.MaxEmails} email."));
                    continue;
                }
                claimedInFile[email] = employee.Code;
                fresh.Add(email);
                if (hrmOwners.TryGetValue(email, out var hrmOwner) && hrmOwner != employee.Code)
                    warnings.Add(new ImportWarningDto(entry.Row, employee.Code, "hrm_conflict",
                        $"Email {email} là email cá nhân trong HRM của MSCB {hrmOwner}."));
            }
            plan.Add((entry, employee.Code, keep, fresh));
        }

        // Removal and primary decisions per employee.
        var toRemove = new List<EmployeeEmail>();
        var toAdd = new List<(string Code, string Email, int Row)>();
        var finalPrimary = new Dictionary<string, string>(StringComparer.Ordinal); // touched code -> email that ends up primary
        var codesWithNewFirst = new HashSet<string>(StringComparer.Ordinal);
        var distinctEmployees = new HashSet<string>(StringComparer.Ordinal);
        foreach (var (entry, code, keep, fresh) in plan)
        {
            distinctEmployees.Add(code);
            var current = byCode.GetValueOrDefault(code) ?? [];
            var valid = keep.Concat(fresh).ToList();
            var removedHere = new List<EmployeeEmail>();
            if (removeMissing && valid.Count > 0)
            {
                foreach (var m in current.Where(m => !valid.Contains(m.Email.ToLowerInvariant())))
                {
                    removedHere.Add(m);
                    removed.Add(new ImportedEmailItemDto(entry.Row, code, employees[code.ToLowerInvariant()].FullName, m.Email.ToLowerInvariant(), m.IsPrimary));
                    counts.Removed++;
                }
                toRemove.AddRange(removedHere);
            }
            foreach (var email in fresh) toAdd.Add((code, email, entry.Row));
            if (fresh.Count == 0 && removedHere.Count == 0) continue;
            if (current.Count == 0) codesWithNewFirst.Add(code);

            var remaining = current.Where(m => !removedHere.Contains(m)).ToList();
            string? primary;
            if (removeMissing && valid.Count > 0) primary = valid[0];
            else if (remaining.FirstOrDefault(m => m.IsPrimary) is { } p) primary = p.Email.ToLowerInvariant();
            else primary = fresh.Count > 0 ? fresh[0]
                : remaining.OrderBy(m => m.AddedAt).ThenBy(m => m.Email, StringComparer.Ordinal).First().Email.ToLowerInvariant();
            finalPrimary[code] = primary;
        }
        foreach (var (code, email, row) in toAdd)
        {
            counts.Added++;
            added.Add(new ImportedEmailItemDto(row, code, employees[code.ToLowerInvariant()].FullName, email,
                finalPrimary.TryGetValue(code, out var fp) && fp == email));
        }

        var firstEmailActive = codesWithNewFirst.Where(c => employees[c.ToLowerInvariant()].Status == EmployeeStatuses.Active).ToList();

        if (!dryRun && (toAdd.Count > 0 || toRemove.Count > 0))
            await ApplyAsync(toAdd, toRemove, finalPrimary, source.Note, ct);

        if (!dryRun)
        {
            await audit.LogAsync(EmployeeEmailAuditActions.Imported, "employee_emails", null, new
            {
                fileName = source.AuditName, rows = rowCount, employees = distinctEmployees.Count, added = counts.Added,
                unchanged = counts.Unchanged, removed = counts.Removed, conflicts = counts.Conflicts, unknown = counts.Unknown,
                invalid = counts.Invalid, removeMissing, via = source.AuditExtra,
            }, ct);
            if (firstEmailActive.Count > 0)
                foreach (var observer in activationObservers)
                    await observer.OnEmployeesActivatedAsync(firstEmailActive, ct);
        }

        var truncated = false;
        List<T> Cap<T>(List<T> list)
        {
            if (list.Count <= ListCap) return list;
            truncated = true;
            return list.Take(ListCap).ToList();
        }

        return new EmailImportReportDto(dryRun, removeMissing, rowCount, distinctEmployees.Count, skippedEmpty,
            counts.Added, counts.Unchanged, counts.Removed, counts.Conflicts, counts.Unknown, counts.Invalid,
            Cap(added), Cap(removed), Cap(conflicts), Cap(unknown), Cap(invalid), Cap(warnings), truncated);
    }

    private sealed class Counts
    {
        public int Added, Unchanged, Removed, Conflicts, Unknown, Invalid;
    }

    private async Task ApplyAsync(List<(string Code, string Email, int Row)> toAdd, List<EmployeeEmail> toRemove,
        Dictionary<string, string> finalPrimary, string note, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlAsync($"SELECT pg_advisory_xact_lock({EmployeeEmailsService.WriteLockKey})", ct);

        var now = time.GetUtcNow();
        // Step 1: deletes and inserts (new rows start non-primary so the one-primary index is never hit mid-way).
        foreach (var m in toRemove) db.Set<EmployeeEmail>().Remove(m);
        foreach (var (code, email, _) in toAdd)
            db.Set<EmployeeEmail>().Add(new EmployeeEmail { Email = email, EmployeeCode = code, IsPrimary = false, Note = note, AddedBy = user.Code, AddedAt = now });
        await db.SaveChangesAsync(ct);

        // Step 2: exactly one primary for every touched employee.
        foreach (var (code, primary) in finalPrimary)
        {
            var rows = await db.Set<EmployeeEmail>().Where(m => m.EmployeeCode == code).ToListAsync(ct);
            var target = rows.FirstOrDefault(m => string.Equals(m.Email, primary, StringComparison.OrdinalIgnoreCase));
            if (target is null || target.IsPrimary && rows.Count(m => m.IsPrimary) == 1) continue;
            foreach (var m in rows.Where(m => m.IsPrimary && m != target)) m.IsPrimary = false;
            await db.SaveChangesAsync(ct);
            target.IsPrimary = true;
            await db.SaveChangesAsync(ct);
        }

        await tx.CommitAsync(ct);
        db.ChangeTracker.Clear();
    }

    // ---- file ----

    private static List<Entry> ReadEntries(Stream file, string fileName, out int rowCount, out int skippedEmpty)
    {
        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        var rows = ext switch
        {
            ".csv" or ".txt" => MemberFileReader.ReadCsv(file),
            ".xlsx" => MemberFileReader.ReadXlsx(file),
            _ => throw GroupsException.BadRequest("Unsupported file", "Chỉ hỗ trợ tệp .xlsx hoặc .csv."),
        };
        if (rows.Count > MaxRows + 1) throw GroupsException.BadRequest("Too many rows", $"Tệp có tối đa {MaxRows} dòng.");
        if (rows.Count == 0) throw GroupsException.BadRequest("Empty file", "Tệp không có dữ liệu.");

        var header = rows[0].Select(MemberFileReader.Normalize).ToArray();
        var codeCol = Array.FindIndex(header, h => CodeHeaders.Contains(h));
        if (codeCol < 0) throw GroupsException.BadRequest("Missing MSCB column", "Không tìm thấy cột MSCB ở dòng đầu tiên của tệp.");
        var nameCol = Array.FindIndex(header, h => NameHeaders.Contains(h));
        var emailCols = header.Select((h, i) => (h, i)).Where(x => x.h.StartsWith("email", StringComparison.Ordinal) || x.h.StartsWith("e-mail", StringComparison.Ordinal))
            .Select(x => x.i).ToList();
        if (emailCols.Count == 0) throw GroupsException.BadRequest("Missing email columns", "Không tìm thấy cột Email (Email 1, Email 2, ...) ở dòng đầu tiên của tệp.");

        var entries = new Dictionary<string, Entry>(StringComparer.OrdinalIgnoreCase);
        var ordered = new List<Entry>();
        rowCount = 0;
        skippedEmpty = 0;
        for (var r = 1; r < rows.Count; r++)
        {
            var cells = rows[r];
            string Cell(int i) => i >= 0 && i < cells.Length ? cells[i].Trim() : "";
            var code = Cell(codeCol);
            var emails = emailCols.Select(Cell).Where(v => v.Length > 0).ToList();
            if (code.Length == 0 && emails.Count == 0) continue;
            rowCount++;
            if (code.Length == 0)
            {
                skippedEmpty++;
                continue;
            }
            if (emails.Count == 0)
            {
                skippedEmpty++;
                continue;
            }
            if (!entries.TryGetValue(code, out var entry))
            {
                entry = new Entry(r + 1, code, nameCol >= 0 ? Cell(nameCol) : null);
                entries[code] = entry;
                ordered.Add(entry);
            }
            entry.RawEmails.AddRange(emails);
        }
        return ordered;
    }
}
