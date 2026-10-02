using System.Text.Json;
using HCMUSSupportV2.Sync.Contracts;
using HCMUSSupportV2.Sync.Sources;

namespace HCMUSSupportV2.Sync.Legacy;

/// <summary>A v1 user: <c>id</c> is the MSCB.</summary>
public sealed record V1User(string Id, string Name, IReadOnlyList<string> Emails);

/// <summary>A holder of a v1 privilege (<c>ViewAs</c>, <c>Lookup</c>, <c>Statistics</c>), resolved through <c>users.json</c>.</summary>
public sealed record PrivilegedHolder(string Code, string Name, IReadOnlyList<string> Emails, IReadOnlyList<string> Permissions);

/// <summary>An entry of <c>privileged.users.json</c> that matches no user (neither by id nor by email).</summary>
public sealed record UnresolvedPrivilege(string Value, IReadOnlyList<string> Permissions);

public sealed record PrivilegedReport(IReadOnlyDictionary<string, int> Permissions, IReadOnlyList<PrivilegedHolder> Holders, IReadOnlyList<UnresolvedPrivilege> Unresolved);

/// <summary>Reads <c>config/users.json</c> and <c>config/privileged.users.json</c> of the v1 data repo.</summary>
public static class UsersReader
{
    public static string ResolveConfigDir(string path)
    {
        var c = Path.Combine(path, "config");
        return Directory.Exists(c) ? c : path;
    }

    /// <summary>
    /// <c>[{ "id": "0123", "name": "...", "emails": ["a@x", ...] }]</c>. Ids are trimmed; emails are trimmed and de-duplicated (case-insensitive,
    /// first spelling kept; the server lower-cases). A user without id or without any email is skipped, a repeated id is skipped. All counted.
    /// </summary>
    public static IReadOnlyList<V1User> ReadUsers(string configDir, MappingReport report)
    {
        var file = Path.Combine(configDir, "users.json");
        if (!File.Exists(file)) throw new FileNotFoundException("users.json not found.", file);
        using var doc = JsonDocument.Parse(File.ReadAllBytes(file));
        if (doc.RootElement.ValueKind != JsonValueKind.Array) throw new InvalidOperationException("users.json: an array was expected.");

        var users = new List<V1User>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var u in doc.RootElement.EnumerateArray())
        {
            var id = Text(u, "id");
            if (id.Length == 0) { report.Add("user_no_id"); continue; }
            if (!seen.Add(id)) { report.Add("user_duplicate_id"); continue; }

            var emails = new List<string>();
            if (u.TryGetProperty("emails", out var list) && list.ValueKind == JsonValueKind.Array)
            {
                foreach (var e in list.EnumerateArray())
                {
                    var email = e.ValueKind == JsonValueKind.String ? (e.GetString() ?? "").Trim() : "";
                    if (email.Length == 0) { report.Add("email_blank"); continue; }
                    if (emails.Contains(email, StringComparer.OrdinalIgnoreCase)) { report.Add("email_duplicate_in_user"); continue; }
                    emails.Add(email);
                }
            }
            if (emails.Count == 0) { report.Add("user_no_email"); continue; }
            users.Add(new V1User(id, Text(u, "name"), emails));
        }
        return users;
    }

    public static IReadOnlyList<LegacyEmailUser> ToRequest(IEnumerable<V1User> users) => users.Select(u => new LegacyEmailUser(u.Id, u.Name, u.Emails)).ToList();

    /// <summary>
    /// <c>{ "ViewAs": [ids or emails], "Lookup": [...], "Statistics": [...] }</c> resolved to code and name. Null when the file does not exist.
    /// For the owner to decide: nothing is granted from this list.
    /// </summary>
    public static PrivilegedReport? ReadPrivileged(string configDir, IReadOnlyList<V1User> users)
    {
        var file = Path.Combine(configDir, "privileged.users.json");
        if (!File.Exists(file)) return null;
        using var doc = JsonDocument.Parse(File.ReadAllBytes(file));
        if (doc.RootElement.ValueKind != JsonValueKind.Object) throw new InvalidOperationException("privileged.users.json: an object was expected.");

        var byId = users.ToDictionary(u => u.Id, StringComparer.Ordinal);
        var byEmail = new Dictionary<string, V1User>(StringComparer.OrdinalIgnoreCase);
        foreach (var u in users) foreach (var e in u.Emails) byEmail.TryAdd(e, u);

        var counts = new Dictionary<string, int>(StringComparer.Ordinal);
        var holders = new Dictionary<string, (V1User User, List<string> Permissions)>(StringComparer.Ordinal);
        var unresolved = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        foreach (var permission in doc.RootElement.EnumerateObject())
        {
            if (permission.Value.ValueKind != JsonValueKind.Array) continue;
            counts[permission.Name] = 0;
            foreach (var entry in permission.Value.EnumerateArray())
            {
                var value = (entry.ValueKind == JsonValueKind.String ? entry.GetString() : entry.ToString())?.Trim() ?? "";
                if (value.Length == 0) continue;
                counts[permission.Name]++;
                if (byId.TryGetValue(value, out var user) || byEmail.TryGetValue(value, out user))
                {
                    if (!holders.TryGetValue(user.Id, out var h)) holders[user.Id] = h = (user, []);
                    if (!h.Permissions.Contains(permission.Name)) h.Permissions.Add(permission.Name);
                }
                else
                {
                    if (!unresolved.TryGetValue(value, out var p)) unresolved[value] = p = [];
                    if (!p.Contains(permission.Name)) p.Add(permission.Name);
                }
            }
        }

        return new PrivilegedReport(counts,
            holders.Values.OrderBy(h => h.User.Id, StringComparer.Ordinal).Select(h => new PrivilegedHolder(h.User.Id, h.User.Name, h.User.Emails, h.Permissions)).ToList(),
            unresolved.Select(kv => new UnresolvedPrivilege(kv.Key, kv.Value)).ToList());
    }

    private static string Text(JsonElement o, string name) =>
        o.TryGetProperty(name, out var v) ? (v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : v.ValueKind == JsonValueKind.Null ? "" : v.ToString()).Trim() : "";
}
