using System.Globalization;
using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Hrm.Datasets;
using HCMUSSupportV2.Backend.Modules.Hrm.Domain;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using Microsoft.EntityFrameworkCore;

namespace HCMUSSupportV2.Backend.Modules.Legacy;

/// <summary>
/// The dataset steps of the legacy migration (teaching, research, publications), fed with rows the Sync tool parsed from the v1
/// JSON. They reuse the admin xlsx rules and writers, with one extra safety: <b>legacy rows have no <c>source_import_id</c>, and a
/// scope that an admin import already owns is never overwritten</b> (teaching: per academic year and program; research and
/// publications: the whole table). Idempotent: identical data reports 0 new, 0 updated, 0 removed and writes nothing.
/// </summary>
public class LegacyDatasetsService(AppDbContext db, DatasetImportService datasets, IAuditLogger audit)
{
    private const int ListCap = 200;

    // ------------------------------------------------------------------ teaching

    public async Task<LegacyDatasetReportDto> TeachingAsync(LegacyTeachingRequest request, bool dryRun, CancellationToken ct)
    {
        var bad = new List<ImportIssueDto>();
        var rows = new List<TeachingLoadRow>();
        var index = 0;
        foreach (var r in request.Rows ?? [])
        {
            index++;
            var raw = new TeachingLoadRow(r.EmployeeCode ?? "", r.AcademicYear ?? "", r.Program ?? "", r.Term, r.Module, r.CourseCode,
                r.CourseName ?? "", r.ClassCode, r.Track, r.Activity, r.Periods, r.StandardHours);
            // The column is numeric(7,2): round here so the comparison with the stored rows is exact.
            if (TeachingLoadRules.TryNormalize(raw, index, bad, out var normalized))
                rows.Add(normalized with { StandardHours = Math.Round(normalized.StandardHours, 2) });
        }

        // Scopes an admin import owns are left alone.
        var skipped = new List<string>();
        var scopes = rows.Select(t => (t.AcademicYear, t.Program)).Distinct().ToList();
        var years = scopes.Select(s => s.AcademicYear).Distinct().ToList();
        var owned = (await db.Set<TeachingLoad>().AsNoTracking()
                .Where(t => years.Contains(t.AcademicYear) && t.SourceImportId != null)
                .Select(t => new { t.AcademicYear, t.Program }).Distinct().ToListAsync(ct))
            .Select(t => (t.AcademicYear, t.Program)).ToHashSet();
        foreach (var scope in scopes.Where(owned.Contains)) skipped.Add($"{scope.AcademicYear}/{scope.Program}");
        rows = rows.Where(t => !owned.Contains((t.AcademicYear, t.Program))).ToList();

        // v1 has no row key: the same course, class and activity can legitimately repeat (several sessions or groups), so unlike the
        // xlsx import the rows are compared as a multiset and every v1 row is kept.
        var known = await KnownAsync(rows.Select(t => t.EmployeeCode), ct);
        var unknown = new SortedSet<string>(rows.Where(t => !known.Contains(t.EmployeeCode)).Select(t => t.EmployeeCode), StringComparer.Ordinal);
        rows = rows.Where(t => known.Contains(t.EmployeeCode)).ToList();
        var reportYears = rows.Select(t => t.AcademicYear).Distinct().OrderByDescending(y => y).ToList();
        var scopeSet = rows.Select(t => (t.AcademicYear, t.Program)).Distinct().ToHashSet();
        var stored = (await db.Set<TeachingLoad>().AsNoTracking().Where(t => reportYears.Contains(t.AcademicYear)).ToListAsync(ct))
            .Where(t => scopeSet.Contains((t.AcademicYear, t.Program))).ToList();
        var pending = stored.GroupBy(Signature).ToDictionary(g => g.Key, g => g.Count());
        int added = 0, updated = 0;
        foreach (var row in rows)
        {
            var sig = Signature(row);
            if (pending.TryGetValue(sig, out var left) && left > 0) pending[sig] = left - 1;
            else added++;
        }
        var removed = pending.Values.Sum();
        var total = rows.Count;

        var changed = added + updated + removed > 0;
        var applied = false;
        if (!dryRun && changed && bad.Count == 0)
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            await datasets.ApplyTeachingRowsAsync(rows, null, ct);
            await tx.CommitAsync(ct);
            applied = true;
            await audit.LogAsync("legacy.dataset_imported", "dataset", DatasetNames.Teaching,
                new { total, added, updated, removed, scopes = scopes.Count - skipped.Count }, ct);
        }
        return Report(DatasetNames.Teaching, dryRun, applied, total, added, updated, removed, unknown, 0, bad, skipped, reportYears);
    }

    private static string Signature(TeachingLoadRow t) =>
        string.Join('|', t.Key, t.CourseName, t.Periods.ToString(CultureInfo.InvariantCulture), t.StandardHours.ToString("0.##", CultureInfo.InvariantCulture));

    private static string Signature(TeachingLoad t) =>
        string.Join('|', TeachingLoadRow.KeyOf(t), t.CourseName, t.Periods.ToString(CultureInfo.InvariantCulture), t.StandardHours.ToString("0.##", CultureInfo.InvariantCulture));

    // ------------------------------------------------------------------ research

    private sealed record ProjectKey(string Code, string Title, string? Level, string? Type, decimal? Funding, string? Period, DateOnly? Accepted, string? Result);

    public async Task<LegacyDatasetReportDto> ResearchAsync(LegacyResearchRequest request, bool dryRun, CancellationToken ct)
    {
        var bad = new List<ImportIssueDto>();
        var projects = new Dictionary<string, ProjectKey>(StringComparer.Ordinal);
        var members = new Dictionary<(string Code, string Mscb), string>();
        var index = 0;
        var memberLines = new List<(string Code, string Mscb, string Role)>();
        foreach (var r in request.Rows ?? [])
        {
            index++;
            var code = r.Code?.Trim() ?? "";
            var title = r.Title?.Trim() ?? "";
            if (code.Length == 0) { bad.Add(new(index, "Mã đề tài", "Thiếu mã đề tài.")); continue; }
            if (title.Length == 0) { bad.Add(new(index, "Tên đề tài", "Thiếu tên đề tài.")); continue; }
            DateOnly? accepted = null;
            if (!string.IsNullOrWhiteSpace(r.AcceptedOn))
            {
                if (DateOnly.TryParseExact(r.AcceptedOn.Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)) accepted = d;
                else { bad.Add(new(index, "Ngày nghiệm thu", "Ngày nghiệm thu phải có dạng yyyy-MM-dd.")); continue; }
            }
            var role = (r.Role ?? "thanh_vien").Trim().ToLowerInvariant();
            if (role is not ("chu_nhiem" or "thanh_vien")) { bad.Add(new(index, "Vai trò", "Vai trò phải là chu_nhiem hoặc thanh_vien.")); continue; }

            var key = new ProjectKey(code, title, Clean(r.Level), Clean(r.Type), r.Funding is { } f ? Math.Round(f) : null, Clean(r.Period), accepted, Clean(r.Result));
            if (projects.TryGetValue(code, out var first))
            {
                if (first != key) bad.Add(new(index, "Mã đề tài", $"Cùng mã đề tài nhưng thông tin khác dòng đầu tiên của đề tài."));
            }
            else projects[code] = key;
            if (Clean(r.Mscb) is { } mscb) memberLines.Add((code, mscb, role));
        }
        foreach (var m in memberLines)
            if (!members.TryAdd((m.Code, m.Mscb), m.Role) && m.Role == "chu_nhiem") members[(m.Code, m.Mscb)] = "chu_nhiem"; // a repeated line keeps the stronger role

        var known = await KnownAsync(members.Keys.Select(k => k.Mscb), ct);
        var unknown = new SortedSet<string>(members.Keys.Where(k => !known.Contains(k.Mscb)).Select(k => k.Mscb), StringComparer.Ordinal);
        var dropped = members.Keys.Count(k => !known.Contains(k.Mscb));
        var kept = members.Where(m => known.Contains(m.Key.Mscb)).ToDictionary(m => m.Key, m => m.Value);

        // Compare with what is stored.
        var skipped = new List<string>();
        var existing = await db.Set<ResearchProject>().AsNoTracking().ToListAsync(ct);
        if (existing.Any(p => p.SourceImportId != null)) skipped.Add("research: dữ liệu đã có từ lần nhập Excel của quản trị viên");
        var existingMembers = (await db.Set<ResearchProjectMember>().AsNoTracking().ToListAsync(ct)).ToList();
        var codeById = existing.ToDictionary(p => p.Id, p => p.Code);
        var storedMembers = existingMembers.Where(m => codeById.ContainsKey(m.ProjectId))
            .ToDictionary(m => (codeById[m.ProjectId], m.EmployeeCode), m => m.Role);

        int added = 0, updated = 0, removed = 0;
        var byCode = existing.ToDictionary(p => p.Code, p => p);
        foreach (var (code, p) in projects)
        {
            if (!byCode.TryGetValue(code, out var e)) { added++; continue; }
            var same = e.Title == p.Title && e.Level == p.Level && e.ResearchType == p.Type && e.Funding == p.Funding
                       && e.PeriodText == p.Period && e.AcceptedOn == p.Accepted && e.Result == p.Result;
            var membersSame = kept.Where(m => m.Key.Code == code).Select(m => (m.Key.Mscb, m.Value)).OrderBy(x => x.Mscb).SequenceEqual(
                storedMembers.Where(m => m.Key.Item1 == code).Select(m => (m.Key.Item2, m.Value)).OrderBy(x => x.Item1));
            if (!same || !membersSame) updated++;
        }
        removed = existing.Count(p => !projects.ContainsKey(p.Code));

        var changed = added + updated + removed > 0;
        var applied = false;
        if (!dryRun && changed && bad.Count == 0 && skipped.Count == 0)
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            await db.Set<ResearchProject>().ExecuteDeleteAsync(ct); // members cascade
            foreach (var p in projects.Values)
            {
                var project = new ResearchProject
                {
                    Code = p.Code, Title = p.Title, Level = p.Level, ResearchType = p.Type, Funding = p.Funding,
                    PeriodText = p.Period, AcceptedOn = p.Accepted, Result = p.Result,
                };
                db.Set<ResearchProject>().Add(project);
                await db.SaveChangesAsync(ct);
                foreach (var m in kept.Where(m => m.Key.Code == p.Code))
                    db.Set<ResearchProjectMember>().Add(new ResearchProjectMember { ProjectId = project.Id, EmployeeCode = m.Key.Mscb, Role = m.Value });
            }
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            applied = true;
            await audit.LogAsync("legacy.dataset_imported", "dataset", DatasetNames.Research, new { projects = projects.Count, added, updated, removed, dropped }, ct);
        }
        return Report(DatasetNames.Research, dryRun, applied, projects.Count, added, updated, removed, unknown, dropped, bad, skipped, []);
    }

    // ------------------------------------------------------------------ publications

    private static string PublicationKey(string? doi, string? eid, string title, int? year) =>
        !string.IsNullOrEmpty(doi) ? "doi:" + doi.ToLowerInvariant() : !string.IsNullOrEmpty(eid) ? "eid:" + eid.ToLowerInvariant() : $"title:{title.ToLowerInvariant()}|{year}";

    public async Task<LegacyDatasetReportDto> PublicationsAsync(LegacyPublicationsRequest request, bool dryRun, CancellationToken ct)
    {
        var bad = new List<ImportIssueDto>();
        var pubs = new Dictionary<string, (LegacyPublicationDto P, string Title, List<string> Authors)>(StringComparer.Ordinal);
        var index = 0;
        foreach (var p in request.Rows ?? [])
        {
            index++;
            var title = p.Title?.Trim() ?? "";
            if (title.Length == 0) { bad.Add(new(index, "Tên bài báo", "Thiếu tên bài báo.")); continue; }
            var authors = (p.Authors ?? []).Select(a => a?.Trim() ?? "").Where(a => a.Length > 0).Distinct(StringComparer.Ordinal).ToList();
            if (authors.Count == 0) { bad.Add(new(index, "MSCB tác giả", "Cần ít nhất một MSCB tác giả.")); continue; }
            var key = PublicationKey(Clean(p.Doi), Clean(p.Eid), title, p.Year);
            if (!pubs.TryAdd(key, (p, title, authors))) bad.Add(new(index, "DOI", "Bài báo trùng với một dòng trước (cùng DOI/EID hoặc tên và năm)."));
        }

        var known = await KnownAsync(pubs.Values.SelectMany(v => v.Authors), ct);
        var unknown = new SortedSet<string>(pubs.Values.SelectMany(v => v.Authors).Where(a => !known.Contains(a)), StringComparer.Ordinal);
        var dropped = pubs.Values.Sum(v => v.Authors.Count(a => !known.Contains(a)));

        var skipped = new List<string>();
        var existing = await db.Set<Publication>().AsNoTracking().ToListAsync(ct);
        if (existing.Any(p => p.SourceImportId != null)) skipped.Add("publications: dữ liệu đã có từ lần nhập Excel của quản trị viên");
        var authorRows = await db.Set<PublicationAuthor>().AsNoTracking().ToListAsync(ct);
        var storedAuthors = authorRows.GroupBy(a => a.PublicationId).ToDictionary(g => g.Key, g => g.OrderBy(a => a.Ordinal).Select(a => a.EmployeeCode).ToList());
        var byKey = existing.GroupBy(p => PublicationKey(p.Doi, p.Eid, p.Title, p.Year)).ToDictionary(g => g.Key, g => g.First());

        int added = 0, updated = 0;
        foreach (var (key, v) in pubs)
        {
            if (!byKey.TryGetValue(key, out var e)) { added++; continue; }
            var keptAuthors = v.Authors.Where(known.Contains).ToList();
            var same = e.Title == v.Title && e.Venue == Clean(v.P.Venue) && e.Year == v.P.Year && e.Details == Clean(v.P.Details) && e.Url == Clean(v.P.Url)
                       && (storedAuthors.GetValueOrDefault(e.Id) ?? []).SequenceEqual(keptAuthors);
            if (!same) updated++;
        }
        var removed = byKey.Count(kv => !pubs.ContainsKey(kv.Key)) + (existing.Count - byKey.Count);

        var changed = added + updated + removed > 0;
        var applied = false;
        if (!dryRun && changed && bad.Count == 0 && skipped.Count == 0)
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            await db.Set<Publication>().ExecuteDeleteAsync(ct); // authors cascade
            foreach (var v in pubs.Values)
            {
                var pub = new Publication
                {
                    Doi = Clean(v.P.Doi), Eid = Clean(v.P.Eid), Title = v.Title, Venue = Clean(v.P.Venue), Year = v.P.Year,
                    Details = Clean(v.P.Details), Url = Clean(v.P.Url),
                };
                db.Set<Publication>().Add(pub);
                await db.SaveChangesAsync(ct);
                var ordinal = 0;
                foreach (var code in v.Authors)
                {
                    ordinal++;
                    if (known.Contains(code)) db.Set<PublicationAuthor>().Add(new PublicationAuthor { PublicationId = pub.Id, EmployeeCode = code, Ordinal = ordinal });
                }
            }
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            applied = true;
            await audit.LogAsync("legacy.dataset_imported", "dataset", DatasetNames.Publications, new { publications = pubs.Count, added, updated, removed, dropped }, ct);
        }
        return Report(DatasetNames.Publications, dryRun, applied, pubs.Count, added, updated, removed, unknown, dropped, bad, skipped, []);
    }

    // ------------------------------------------------------------------ helpers

    private async Task<HashSet<string>> KnownAsync(IEnumerable<string> codes, CancellationToken ct)
    {
        var distinct = codes.Distinct().ToArray();
        return (await db.Set<Employee>().AsNoTracking().Where(e => distinct.Contains(e.Code)).Select(e => e.Code).ToListAsync(ct)).ToHashSet(StringComparer.Ordinal);
    }

    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    private static LegacyDatasetReportDto Report(string dataset, bool dryRun, bool applied, int total, int added, int updated, int removed,
        IReadOnlyCollection<string> unknown, int dropped, IReadOnlyCollection<ImportIssueDto> bad, IReadOnlyList<string> skipped, IReadOnlyList<string> years) =>
        new(dataset, dryRun, applied, total, added, updated, removed, unknown.Take(ListCap).ToList(), unknown.Count, dropped,
            bad.OrderBy(b => b.Row).Take(50).Select(b => new LegacyIssueDto(b.Row, b.Column, b.Message)).ToList(), bad.Count, skipped, years);
}
