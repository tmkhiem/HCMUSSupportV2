using System.Text.Json.Serialization;

namespace HCMUSSupportV2.Backend.Modules.Legacy.Emails;

/// <summary>Body of <c>POST legacy/emails</c>: the v1 <c>config/users.json</c> reduced to MSCB, name and emails.</summary>
public record LegacyEmailsRequest(List<LegacyEmailUser>? Users);

public record LegacyEmailUser(string? Code, string? Name, List<string?>? Emails);

public static class LegacyEmailIssueKinds
{
    public const string UnknownEmployee = "unknown_employee";
    public const string DuplicateInSource = "duplicate_in_source";
    public const string Conflict = "conflict";
    public const string InactiveEmployee = "inactive_employee";
    public const string NameMismatch = "name_mismatch";
    public const string InvalidEmail = "invalid_email";
}

/// <summary>One finding. It carries MSCBs and emails, so callers keep it out of consoles and logs.</summary>
public record LegacyEmailDetail(
    string Kind,
    string Code,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Email = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? OtherCode = null);

/// <summary>
/// Report of <c>POST legacy/emails</c>. On a dry run <c>Inserted</c> is the number of mappings a real run would add.
/// Issue counts equal the number of matching <c>Details</c> rows: <c>unknown_employee</c>, <c>inactive_employee</c> and
/// <c>name_mismatch</c> count users, the others count emails.
/// </summary>
public record LegacyEmailReport(
    bool DryRun,
    int Users,
    int Emails,
    int Inserted,
    int Unchanged,
    IReadOnlyDictionary<string, int> Issues,
    IReadOnlyList<LegacyEmailDetail> Details);
