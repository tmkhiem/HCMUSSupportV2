using System.Globalization;
using System.Text.Json;
using HCMUSSupportV2.Backend.Modules.Hrm.Domain;
using Npgsql;
using NpgsqlTypes;

namespace HCMUSSupportV2.Backend.Modules.Hrm.Integration;

/// <summary>Parses the date formats HRM exports, including partial ones (<c>yyyy-MM</c>, <c>yyyy</c>, <c>MM/yyyy</c>).</summary>
public static class PartialDate
{
    private static readonly string[] DayFormats = ["yyyy-MM-dd", "dd/MM/yyyy", "d/M/yyyy", "yyyy/MM/dd"];
    private static readonly string[] MonthFormats = ["yyyy-MM", "MM/yyyy", "M/yyyy"];

    /// <summary>
    /// Returns false when <paramref name="text"/> is non-empty and not a date. Empty text is valid and gives a null date.
    /// The date of a month or year value is its first day; <paramref name="precision"/> says which part is real.
    /// </summary>
    public static bool TryParse(string? text, out DateOnly? date, out string precision)
    {
        date = null;
        precision = DatePrecision.Day;
        if (string.IsNullOrWhiteSpace(text)) return true;

        var s = text.Trim();
        if (s.Length > 10 && (s[10] == 'T' || s[10] == ' ')) s = s[..10]; // ISO date-time: keep the date part
        var ci = CultureInfo.InvariantCulture;

        if (DateOnly.TryParseExact(s, DayFormats, ci, DateTimeStyles.None, out var d) && d.Year >= 1800) { date = d; return true; }
        if (DateTime.TryParseExact(s, MonthFormats, ci, DateTimeStyles.None, out var m) && m.Year >= 1800)
        {
            date = new DateOnly(m.Year, m.Month, 1);
            precision = DatePrecision.Month;
            return true;
        }
        if (s.Length == 4 && int.TryParse(s, NumberStyles.None, ci, out var y) && y is >= 1800 and <= 2200)
        {
            date = new DateOnly(y, 1, 1);
            precision = DatePrecision.Year;
            return true;
        }
        return false;
    }
}

/// <summary>An issue found while preparing a batch; becomes a <c>sync_issues</c> row.</summary>
public sealed record PendingIssue(string Kind, string SourceKey, object? Details);

/// <summary>Collects issues for one run and parses dates, turning unparseable ones into <c>bad_date</c> issues (value becomes null).</summary>
public sealed class IssueSink
{
    public List<PendingIssue> Issues { get; } = [];

    public void Add(string kind, string sourceKey, object? details = null) => Issues.Add(new PendingIssue(kind, sourceKey, details));

    public DateOnly? Date(string sourceKey, string field, string? text, out string precision)
    {
        if (PartialDate.TryParse(text, out var date, out precision)) return date;
        Add(SyncIssueKinds.BadDate, sourceKey, new { field, value = text });
        precision = DatePrecision.Day;
        return null;
    }

    public DateOnly? Date(string sourceKey, string field, string? text) => Date(sourceKey, field, text, out _);
}

/// <summary>A column of a target table and of its temporary staging table.</summary>
/// <param name="TempOnly">Staged for the post-merge step only; not a column of the target.</param>
/// <param name="Compare">Take part in the "has this row changed" test (false for e.g. <c>synced_at</c>).</param>
public sealed record Col(string Name, string Pg, NpgsqlDbType Db, bool TempOnly = false, bool Compare = true)
{
    public static Col Text(string n) => new(n, "text", NpgsqlDbType.Text);
    public static Col Int(string n) => new(n, "integer", NpgsqlDbType.Integer);
    public static Col Long(string n) => new(n, "bigint", NpgsqlDbType.Bigint);
    public static Col Num(string n) => new(n, "numeric", NpgsqlDbType.Numeric);
    public static Col Date(string n) => new(n, "date", NpgsqlDbType.Date);
    public static Col Bool(string n) => new(n, "boolean", NpgsqlDbType.Boolean);
}

public readonly record struct MergeCounts(int Inserted, int Updated, int Deleted)
{
    public static MergeCounts operator +(MergeCounts a, MergeCounts b) => new(a.Inserted + b.Inserted, a.Updated + b.Updated, a.Deleted + b.Deleted);
}

/// <param name="Table">Target table.</param>
/// <param name="Key">Column the source and target are matched on (<c>hrm_id</c>, <c>code</c>, ...).</param>
/// <param name="NotMatchedBySource">Full text of the <c>WHEN NOT MATCHED BY SOURCE ...</c> clause(s).</param>
/// <param name="Bind">Adds parameters used by <paramref name="NotMatchedBySource"/>.</param>
/// <param name="AfterMerge">Runs inside the transaction while the staging table (given by name) still exists.</param>
public sealed record MergeSpec(
    string Table, string Key, Col[] Cols, string NotMatchedBySource,
    Action<NpgsqlCommand>? Bind = null, Func<NpgsqlConnection, string, CancellationToken, Task>? AfterMerge = null);

/// <summary>
/// The snapshot mechanics: binary COPY into a temp table, then one <c>MERGE</c> (PostgreSQL 17) that updates changed
/// rows, inserts new ones and handles rows missing from the snapshot. Must run inside a transaction.
/// </summary>
public static class MergeEngine
{
    public static async Task<MergeCounts> RunAsync(NpgsqlConnection conn, MergeSpec spec, IEnumerable<object?[]> rows, CancellationToken ct)
    {
        var tmp = "tmp_" + spec.Table;
        var all = spec.Cols;
        var target = all.Where(c => !c.TempOnly).ToArray();
        var data = target.Where(c => c.Name != spec.Key).ToArray();

        await Exec(conn, $"CREATE TEMP TABLE {tmp} ({string.Join(", ", all.Select(c => $"{c.Name} {c.Pg}"))}) ON COMMIT DROP", ct);

        await using (var writer = await conn.BeginBinaryImportAsync($"COPY {tmp} ({string.Join(", ", all.Select(c => c.Name))}) FROM STDIN (FORMAT BINARY)", ct))
        {
            foreach (var row in rows)
            {
                await writer.StartRowAsync(ct);
                for (var i = 0; i < all.Length; i++)
                {
                    if (row[i] is null) await writer.WriteNullAsync(ct);
                    else await writer.WriteAsync(row[i], all[i].Db, ct);
                }
            }
            await writer.CompleteAsync(ct);
        }

        var changed = string.Join(" OR ", data.Where(c => c.Compare).Select(c => $"t.{c.Name} IS DISTINCT FROM s.{c.Name}"));
        var set = string.Join(", ", data.Select(c => $"{c.Name} = s.{c.Name}").Append("updated_at = now()"));
        var sql = $"""
            MERGE INTO {spec.Table} AS t USING {tmp} AS s ON t.{spec.Key} = s.{spec.Key}
            WHEN MATCHED{(changed.Length > 0 ? $" AND ({changed})" : "")} THEN UPDATE SET {set}
            WHEN NOT MATCHED THEN INSERT ({string.Join(", ", target.Select(c => c.Name))}) VALUES ({string.Join(", ", target.Select(c => "s." + c.Name))})
            {spec.NotMatchedBySource}
            RETURNING merge_action()
            """;

        int inserted = 0, updated = 0, deleted = 0;
        await using (var cmd = new NpgsqlCommand(sql, conn) { CommandTimeout = 600 })
        {
            spec.Bind?.Invoke(cmd);
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                switch (reader.GetString(0))
                {
                    case "INSERT": inserted++; break;
                    case "UPDATE": updated++; break;
                    case "DELETE": deleted++; break;
                }
            }
        }

        if (spec.AfterMerge is not null) await spec.AfterMerge(conn, tmp, ct);
        return new MergeCounts(inserted, updated, deleted);
    }

    public static async Task Exec(NpgsqlConnection conn, string sql, CancellationToken ct, Action<NpgsqlCommand>? bind = null)
    {
        await using var cmd = new NpgsqlCommand(sql, conn) { CommandTimeout = 600 };
        bind?.Invoke(cmd);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    public static async Task<List<T>> Query<T>(NpgsqlConnection conn, string sql, Func<NpgsqlDataReader, T> read, CancellationToken ct)
    {
        var list = new List<T>();
        await using var cmd = new NpgsqlCommand(sql, conn);
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct)) list.Add(read(reader));
        return list;
    }

    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
}
