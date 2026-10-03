using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using Microsoft.EntityFrameworkCore;

namespace HCMUSSupportV2.Backend.Modules.Identity.Authentication;

/// <summary>Remembers when an employee signed in, keeping the previous sign-in too (the cut-off for "new" notifications).</summary>
public class LoginRecorder(AppDbContext db)
{
    public Task RecordAsync(string employeeCode, CancellationToken ct = default) =>
        db.Set<Employee>().Where(e => e.Code == employeeCode)
            .ExecuteUpdateAsync(s => s
                .SetProperty(e => e.PreviousLoginAt, e => e.LastLoginAt)
                .SetProperty(e => e.LastLoginAt, DateTimeOffset.UtcNow), ct);
}
