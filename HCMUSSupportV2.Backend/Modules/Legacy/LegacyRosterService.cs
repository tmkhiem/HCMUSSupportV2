using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Admin.EmployeeEmails;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using Microsoft.EntityFrameworkCore;

namespace HCMUSSupportV2.Backend.Modules.Legacy;

/// <summary>
/// Seeds <c>employee_emails</c> from the v1 <c>config/users.json</c> (PLAN Q4). It is the email import of D14c fed from JSON:
/// it only adds (editors' later changes are never removed), reports emails owned by someone else, MSCBs HRM does not know
/// (<c>unknown</c>), emails that are another employee's HRM personal email (<c>hrm_conflict</c>) and invalid addresses, and a
/// re-run reports every mapping as unchanged.
/// </summary>
public class LegacyRosterService(AppDbContext db, EmployeeEmailImportService emails)
{
    public async Task<LegacyRosterReportDto> ImportAsync(LegacyRosterRequest request, bool dryRun, CancellationToken ct)
    {
        var users = request.Users ?? [];
        var byCode = new Dictionary<string, EmployeeEmailImportService.Entry>(StringComparer.OrdinalIgnoreCase);
        var ordered = new List<EmployeeEmailImportService.Entry>();
        int row = 0, emptyId = 0, noEmail = 0, duplicates = 0;
        foreach (var user in users)
        {
            row++;
            var code = user.Id?.Trim() ?? "";
            var addresses = (user.Emails ?? []).Select(e => e?.Trim() ?? "").Where(e => e.Length > 0).ToList();
            if (code.Length == 0) { emptyId++; continue; }
            if (addresses.Count == 0) { noEmail++; continue; }
            if (byCode.TryGetValue(code, out var entry))
            {
                duplicates++;
                entry.RawEmails.AddRange(addresses);
                continue;
            }
            entry = new EmployeeEmailImportService.Entry(row, code, user.Name?.Trim());
            entry.RawEmails.AddRange(addresses);
            byCode[code] = entry;
            ordered.Add(entry);
        }

        var report = await emails.ImportEntriesAsync(ordered, users.Count, emptyId + noEmail, dryRun, removeMissing: false,
            new EmployeeEmailImportService.Source("Nhập từ v1 users.json", "legacy users.json", new { tool = "legacy-migration" }), ct);

        var codes = ordered.Select(e => e.Code).ToList();
        var inactive = await db.Set<Employee>().AsNoTracking()
            .Where(e => codes.Contains(e.Code) && e.Status != EmployeeStatuses.Active)
            .Select(e => e.Code).OrderBy(c => c).ToListAsync(ct);

        return new LegacyRosterReportDto(report, users.Count, emptyId, noEmail, duplicates, inactive.Count, inactive.Take(500).ToList());
    }
}
