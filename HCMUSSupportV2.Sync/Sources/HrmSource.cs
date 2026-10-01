using System.Data;
using System.Reflection;
using HCMUSSupportV2.Sync.Contracts;
using Microsoft.Data.SqlClient;

namespace HCMUSSupportV2.Sync.Sources;

/// <summary>
/// Reads the HRM SQL Server database (read-only login, see deploy/sql/hrm-readonly-login.sql) with one query per dataset
/// (<c>Queries/&lt;dataset&gt;.sql</c>, embedded) and maps each row with <see cref="HrmRowMapper"/>. These are the real source
/// primary keys, so a run replaces any synthetic ids that <c>legacy-git</c> posted.
/// </summary>
public sealed class HrmSource : IDatasetSource
{
    private readonly string _connectionString;
    private readonly HrmRowMapper _mapper;

    public HrmSource(string connectionString)
    {
        _connectionString = connectionString;
        Report = new MappingReport();
        _mapper = new HrmRowMapper(Report);
    }

    public string Name => "hrm";
    public MappingReport Report { get; }
    public IReadOnlyCollection<string> Supported => Datasets.All;

    public async Task<IReadOnlyList<object>> ReadAsync(string dataset, CancellationToken ct)
    {
        var sql = LoadQuery(dataset);
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        await using var cmd = new SqlCommand(sql, conn) { CommandTimeout = 600 };
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        return Map(dataset, reader);
    }

    /// <summary>Map every row of an open reader for the dataset (separate from I/O so it can be tested with a DataTableReader).</summary>
    public IReadOnlyList<object> Map(string dataset, IDataReader reader) => dataset switch
    {
        Datasets.OrgUnits => Drain(reader, _mapper.OrgUnit),
        Datasets.Employees => Drain(reader, _mapper.Employee),
        Datasets.Profiles => Drain(reader, _mapper.Profile),
        Datasets.Salary => Drain(reader, _mapper.Salary),
        Datasets.Positions => Drain(reader, _mapper.Position),
        Datasets.Commendations => Drain(reader, _mapper.Commendation),
        Datasets.Degrees => Drain(reader, _mapper.Degree),
        Datasets.Trainings => Drain(reader, _mapper.Training),
        Datasets.BusinessTrips => Drain(reader, _mapper.BusinessTrip),
        Datasets.Innovations => Drain(reader, _mapper.Innovation),
        _ => throw new ArgumentException($"Unknown dataset '{dataset}'."),
    };

    private static List<object> Drain<T>(IDataReader reader, Func<IDataRecord, T?> map) where T : class
    {
        var rows = new List<object>();
        while (reader.Read())
            if (map(reader) is { } row) rows.Add(row);
        return rows;
    }

    public static string LoadQuery(string dataset)
    {
        var asm = typeof(HrmSource).Assembly;
        var name = asm.GetManifestResourceNames().FirstOrDefault(n => n.EndsWith("." + dataset + ".sql", StringComparison.OrdinalIgnoreCase))
                   ?? throw new InvalidOperationException($"No embedded query for dataset '{dataset}'.");
        using var s = asm.GetManifestResourceStream(name)!;
        using var sr = new StreamReader(s);
        return sr.ReadToEnd();
    }
}
