using System.Text.Json;

namespace HCMUSSupportV2.Sync.Sources;

/// <summary>One v1 row: the column values with braces stripped from the keys (<c>{MA}</c> becomes <c>MA</c>) and values trimmed.</summary>
public sealed class V1Row(string mscb, IReadOnlyDictionary<string, string> columns)
{
    public string Mscb { get; } = mscb;
    public IReadOnlyDictionary<string, string> Columns { get; } = columns;

    public string Get(string column) => Columns.TryGetValue(column, out var v) ? v : "";

    /// <summary>Stable text of the whole row (sorted keys), the identity input for synthetic ids.</summary>
    public string Content() => string.Join("\u001e", Columns.OrderBy(c => c.Key, StringComparer.Ordinal).Select(c => c.Key + "=" + c.Value));
}

/// <summary>A category of the legacy data repo: all chunks merged, rows in file / chunk order.</summary>
public sealed class V1Category(string name, IReadOnlyList<V1Row> rows)
{
    public string Name { get; } = name;
    public IReadOnlyList<V1Row> Rows { get; } = rows;
    public static V1Category Empty(string name) => new(name, []);

    /// <summary>Rows of one MSCB in encounter order (employees with duplicate MSCB have several).</summary>
    public ILookup<string, V1Row> ByMscb() => Rows.ToLookup(r => r.Mscb, StringComparer.Ordinal);
}

/// <summary>
/// Reads the v1 envelope <c>{header, template, datestr, category, values: {MSCB: [ {"{Col}": "str"} ]}}</c> from
/// <c>notifications/&lt;category&gt;/&lt;category&gt;-N.json</c> (chunks in numeric order; the same MSCB in several chunks is merged).
/// </summary>
public static class V1Reader
{
    public static string ResolveNotificationsDir(string path)
    {
        var n = Path.Combine(path, "notifications");
        return Directory.Exists(n) ? n : path;
    }

    public static V1Category ReadCategory(string notificationsDir, string category)
    {
        var dir = Path.Combine(notificationsDir, category);
        if (!Directory.Exists(dir)) return V1Category.Empty(category);

        var files = Directory.GetFiles(dir, "*.json")
            .OrderBy(f => ChunkNumber(f))
            .ThenBy(f => f, StringComparer.Ordinal)
            .ToList();

        var rows = new List<V1Row>();
        foreach (var file in files) ParseChunk(File.ReadAllBytes(file), rows);
        return new V1Category(category, rows);
    }

    /// <summary>Parse one chunk. Rows of an MSCB already seen are appended in encounter order.</summary>
    public static void ParseChunk(ReadOnlySpan<byte> json, List<V1Row> into)
    {
        using var doc = JsonDocument.Parse(json.ToArray());
        if (!doc.RootElement.TryGetProperty("values", out var values) || values.ValueKind != JsonValueKind.Object) return;
        foreach (var emp in values.EnumerateObject())
        {
            if (emp.Value.ValueKind != JsonValueKind.Array) continue;
            foreach (var item in emp.Value.EnumerateArray())
            {
                if (item.ValueKind != JsonValueKind.Object) continue;
                var cols = new Dictionary<string, string>(StringComparer.Ordinal);
                foreach (var p in item.EnumerateObject())
                    cols[p.Name.Trim('{', '}')] = p.Value.ValueKind == JsonValueKind.String ? (p.Value.GetString() ?? "").Trim()
                        : p.Value.ValueKind == JsonValueKind.Null ? "" : p.Value.ToString().Trim();
                into.Add(new V1Row(emp.Name.Trim(), cols));
            }
        }
    }

    private static int ChunkNumber(string file)
    {
        var name = Path.GetFileNameWithoutExtension(file);
        var i = name.LastIndexOf('-');
        return i >= 0 && int.TryParse(name[(i + 1)..], out var n) ? n : int.MaxValue;
    }
}
