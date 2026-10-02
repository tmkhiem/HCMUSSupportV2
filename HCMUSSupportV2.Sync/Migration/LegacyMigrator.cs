using System.Text.Json;

namespace HCMUSSupportV2.Sync.Migration;

public sealed record MigrateOptions(string Path, IReadOnlyList<string> Steps, IReadOnlyList<AdminIdentity> Admins, bool Apply, string? ReportFile);

/// <summary>
/// The one-off legacy migration (D15), steps in dependency order: <c>roster</c> (users.json to employee_emails), <c>roles</c>
/// (admin for the named identities; the other v1 ViewAs/Lookup holders are only listed), <c>teaching</c>, <c>research</c>,
/// <c>papers</c>. News and the update-info banner are <c>tools/legacy-news</c>. Every step is a dry run unless <c>Apply</c>, and
/// every step is idempotent. Output is counts and MSCBs only; the optional report file holds the full server answers (it contains
/// emails and names: keep it outside the repository).
/// </summary>
public sealed class LegacyMigrator(ILegacyApi api, TextWriter output)
{
    public static readonly string[] AllSteps = ["roster", "roles", "teaching", "research", "papers"];
    private const int ListCap = 25;

    public static IReadOnlyList<string> ParseSteps(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Trim().Equals("all", StringComparison.OrdinalIgnoreCase)) return AllSteps;
        var wanted = value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Select(v => v.ToLowerInvariant()).ToHashSet();
        var unknown = wanted.Where(w => !AllSteps.Contains(w)).ToList();
        if (unknown.Count > 0) throw new ArgumentException($"Unknown step(s): {string.Join(", ", unknown)}. Valid: {string.Join(", ", AllSteps)}.");
        return AllSteps.Where(wanted.Contains).ToList();
    }

    public async Task<int> RunAsync(MigrateOptions o, CancellationToken ct)
    {
        var failures = 0;
        var report = new Dictionary<string, object?>();
        var mode = o.Apply ? "APPLY" : "dry run";
        output.WriteLine($"legacy-migrate ({mode}): steps {string.Join(", ", o.Steps)}");
        var repo = o.Path;

        foreach (var step in o.Steps)
        {
            try
            {
                switch (step)
                {
                    case "roster": report[step] = await RosterAsync(repo, o.Apply, ct); break;
                    case "roles": report[step] = await RolesAsync(repo, o.Admins, o.Apply, ct); break;
                    case "teaching": report[step] = await TeachingAsync(repo, o.Apply, ct, f => failures += f); break;
                    case "research": report[step] = await ResearchAsync(repo, o.Apply, ct, f => failures += f); break;
                    case "papers": report[step] = await PapersAsync(repo, o.Apply, ct, f => failures += f); break;
                }
            }
            catch (LegacyApiException e)
            {
                failures++;
                output.WriteLine($"[{step}] FAILED: {e.Message}");
                report[step] = new { error = e.Message };
                if (e.Status is 0 or 401 or 403)
                {
                    output.WriteLine("Aborting: the API is unreachable or rejects the token (needs scope legacy.import); remaining steps not attempted.");
                    break;
                }
            }
            catch (Exception e) when (e is IOException or JsonException or InvalidDataException)
            {
                failures++;
                output.WriteLine($"[{step}] FAILED reading the data repo: {e.GetType().Name}: {e.Message}");
            }
        }

        if (o.ReportFile is not null)
        {
            File.WriteAllText(o.ReportFile, JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true }));
            output.WriteLine($"full report written to {o.ReportFile} (contains emails and names: keep it out of the repository)");
        }
        return failures == 0 ? 0 : 1;
    }

    // ------------------------------------------------------------------ roster

    private async Task<JsonElement> RosterAsync(string repo, bool apply, CancellationToken ct)
    {
        var users = LegacyReaders.ReadUsers(repo);
        var r = await api.PostAsync("roster-emails", new { users = users.Select(u => new { u.Id, u.Name, u.Emails }) }, !apply, ct);
        var import = r.GetProperty("import");
        output.WriteLine($"[roster] users={Int(r, "inputUsers")} (no id {Int(r, "emptyIdCount")}, no email {Int(r, "noEmailCount")}, duplicate id {Int(r, "duplicateIdCount")}) " +
                         $"mapped employees={Int(import, "employees")} added={Int(import, "addedCount")} unchanged={Int(import, "unchangedCount")} " +
                         $"conflicts={Int(import, "conflictCount")} unknownMscb={Int(import, "unknownCount")} invalid={Int(import, "invalidCount")} inactive={Int(r, "inactiveCount")}");

        var warnings = import.GetProperty("warnings").EnumerateArray().GroupBy(w => Str(w, "reason")).OrderBy(g => g.Key).ToList();
        if (warnings.Count > 0) output.WriteLine("[roster] warnings: " + string.Join(", ", warnings.Select(g => $"{g.Key}={g.Count()}")));
        List(import, "conflicts", "conflict (email owned by another MSCB or repeated in the file)", c => $"MSCB={Str(c, "code")} reason={Str(c, "reason")} owner={Str(c, "ownerCode")}");
        List(import, "unknown", "unknown MSCB (not in HRM)", c => $"MSCB={Str(c, "code")}");
        List(import, "invalid", "invalid email", c => $"MSCB={Str(c, "code")} reason={Str(c, "reason")}");
        var hrm = import.GetProperty("warnings").EnumerateArray().Where(w => Str(w, "reason") == "hrm_conflict").ToList();
        if (hrm.Count > 0) output.WriteLine($"[roster] email is another employee's HRM personal email ({hrm.Count}): MSCB " + string.Join(", ", hrm.Take(ListCap).Select(w => Str(w, "code"))));
        if (import.TryGetProperty("truncated", out var t) && t.ValueKind == JsonValueKind.True) output.WriteLine("[roster] note: the server capped the detail lists; counts are exact");
        return r;

        void List(JsonElement parent, string name, string title, Func<JsonElement, string> line)
        {
            var items = parent.GetProperty(name).EnumerateArray().ToList();
            if (items.Count == 0) return;
            output.WriteLine($"[roster] {title}: {items.Count}");
            foreach (var item in items.Take(ListCap)) output.WriteLine("    " + line(item));
            if (items.Count > ListCap) output.WriteLine($"    ... {items.Count - ListCap} more (see the report file)");
        }
    }

    // ------------------------------------------------------------------ roles

    private async Task<object?> RolesAsync(string repo, IReadOnlyList<AdminIdentity> admins, bool apply, CancellationToken ct)
    {
        JsonElement? server = null;
        if (admins.Count == 0)
            output.WriteLine("[roles] no --admin <email:mscb> given (or Sync:Legacy:Admins): nothing is granted");
        else
        {
            var r = await api.PostAsync("roles", new { grants = admins.Select(a => new { role = "admin", code = a.Mscb, email = a.Email }), mapEmail = true }, !apply, ct);
            server = r;
            foreach (var g in r.GetProperty("results").EnumerateArray())
                output.WriteLine($"[roles] admin MSCB={Str(g, "code")}: {Str(g, "outcome")}{(Bool(g, "emailMapped") ? " (email mapped now)" : "")}{(Bool(g, "employeeActive") ? "" : " (employee not active)")}");
        }

        // v1 ViewAs/Lookup/Statistics holders: listed for the owner to decide, never granted here.
        var users = LegacyReaders.ReadUsers(repo);
        var privileged = LegacyReaders.ReadPrivileged(repo);
        var granted = admins.Select(a => a.Mscb).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var holders = new SortedDictionary<string, SortedSet<string>>(StringComparer.Ordinal);
        var unresolved = 0;
        foreach (var (feature, entries) in privileged)
            foreach (var entry in entries)
            {
                var user = users.FirstOrDefault(u => u.Id.Equals(entry, StringComparison.OrdinalIgnoreCase)
                    || u.Emails.Any(e => e.Equals(entry, StringComparison.OrdinalIgnoreCase)));
                if (user is null) { unresolved++; continue; }
                if (!holders.TryGetValue(user.Id, out var set)) holders[user.Id] = set = new SortedSet<string>(StringComparer.Ordinal);
                set.Add(feature);
            }
        output.WriteLine($"[roles] v1 privileged holders (ViewAs/Lookup/Statistics): {holders.Count} people, {unresolved} entries not found in users.json; none is granted by this tool");
        foreach (var (mscb, features) in holders)
            output.WriteLine($"    MSCB={mscb} v1={string.Join("+", features)}{(granted.Contains(mscb) ? " -> admin (granted above)" : " -> decide: editor/admin/none")}");
        return new { admins = server, privilegedHolders = holders.ToDictionary(h => h.Key, h => h.Value.ToArray()), unresolved };
    }

    // ------------------------------------------------------------------ datasets

    private async Task<object?> TeachingAsync(string repo, bool apply, CancellationToken ct, Action<int> fail)
    {
        var dir = Path.Combine(V1Reader_NotificationsDir(repo), "teaching-stats");
        var results = new List<object>();
        foreach (var file in Directory.GetFiles(dir, "*.json").OrderBy(f => f, StringComparer.Ordinal))
        {
            using var doc = JsonDocument.Parse(File.ReadAllText(file).TrimStart('﻿'));
            var parsed = TeachingParser.Parse(doc.RootElement);
            output.WriteLine($"[teaching] {Path.GetFileName(file)}: {parsed.AcademicYear} tableRows={parsed.TableRows} parsed={parsed.Rows.Count} badHours={parsed.BadHours} unparsed={parsed.UnparsedPatterns.Values.Sum()}");
            foreach (var (pattern, n) in parsed.UnparsedPatterns.OrderByDescending(p => p.Value).Take(10)) output.WriteLine($"    unparsed x{n}: {pattern}");
            var r = await api.PostAsync("datasets/teaching", new { rows = parsed.Rows }, !apply, ct);
            PrintDataset("teaching", r, fail);
            results.Add(r);
        }
        return results;
    }

    private async Task<object?> ResearchAsync(string repo, bool apply, CancellationToken ct, Action<int> fail)
    {
        using var doc = JsonDocument.Parse(File.ReadAllText(Path.Combine(V1Reader_NotificationsDir(repo), "research-stats.json")).TrimStart('﻿'));
        var parsed = ResearchParser.Parse(doc.RootElement);
        output.WriteLine($"[research] rows={parsed.Rows.Count} projects={parsed.Rows.Select(r => r.Code).Distinct().Count()} partialAcceptedDates={parsed.PartialAcceptedDates} unknownRoles={parsed.UnknownRoles} badFunding={parsed.BadFunding}");
        var r = await api.PostAsync("datasets/research", new { rows = parsed.Rows }, !apply, ct);
        PrintDataset("research", r, fail);
        return r;
    }

    private async Task<object?> PapersAsync(string repo, bool apply, CancellationToken ct, Action<int> fail)
    {
        using var doc = JsonDocument.Parse(File.ReadAllText(Path.Combine(V1Reader_NotificationsDir(repo), "paper-details.json")).TrimStart('﻿'));
        var parsed = PapersParser.Parse(doc.RootElement);
        output.WriteLine($"[papers] publications={parsed.Count}");
        var r = await api.PostAsync("datasets/publications", new { rows = parsed }, !apply, ct);
        PrintDataset("papers", r, fail);
        return r;
    }

    private void PrintDataset(string name, JsonElement r, Action<int> fail)
    {
        var bad = Int(r, "badCount");
        output.WriteLine($"[{name}] total={Int(r, "total")} new={Int(r, "newCount")} updated={Int(r, "updatedCount")} removed={Int(r, "removedCount")} applied={Bool(r, "applied")} " +
                         $"unknownMscb={Int(r, "unknownMscbCount")} droppedMemberRows={Int(r, "droppedMemberRows")} bad={bad}");
        foreach (var s in r.GetProperty("skipped").EnumerateArray()) output.WriteLine($"[{name}]   skipped (an admin import owns it): {s.GetString()}");
        var unknown = r.GetProperty("unknownMscbs").EnumerateArray().Select(x => x.GetString()).Take(ListCap).ToList();
        if (unknown.Count > 0) output.WriteLine($"[{name}]   unknown MSCB: {string.Join(", ", unknown)}{(Int(r, "unknownMscbCount") > unknown.Count ? ", ..." : "")}");
        foreach (var b in r.GetProperty("bad").EnumerateArray().Take(10)) output.WriteLine($"[{name}]   bad row {Int(b, "row")} ({Str(b, "column")}): {Str(b, "message")}");
        if (bad > 0) fail(1);
    }

    private static string V1Reader_NotificationsDir(string repo)
    {
        var n = Path.Combine(repo, "notifications");
        return Directory.Exists(n) ? n : repo;
    }

    private static int Int(JsonElement e, string name) => e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetInt32() : 0;
    private static bool Bool(JsonElement e, string name) => e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.True;
    private static string Str(JsonElement e, string name) => e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
}
