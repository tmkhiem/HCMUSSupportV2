namespace HCMUSSupportV2.Sync.Sources;

/// <summary>Counters of rows the mapping skipped or flagged (kind to count). Never contains personal data.</summary>
public sealed class MappingReport
{
    private readonly Dictionary<string, int> _counts = [];

    public IReadOnlyDictionary<string, int> Counts => _counts;

    public void Add(string kind) => Add(kind, 1);

    public void Add(string kind, int count) => _counts[kind] = _counts.GetValueOrDefault(kind) + count;

    public override string ToString() =>
        _counts.Count == 0 ? "none" : string.Join(", ", _counts.OrderBy(c => c.Key, StringComparer.Ordinal).Select(c => $"{c.Key}={c.Value}"));
}
