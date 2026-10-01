namespace HCMUSSupportV2.Sync.Sources;

/// <summary>Counters of rows the mapping skipped or flagged (kind to count). Never contains personal data.</summary>
public sealed class MappingReport
{
    private readonly Dictionary<string, int> _counts = [];

    public IReadOnlyDictionary<string, int> Counts => _counts;

    public void Add(string kind) => _counts[kind] = _counts.GetValueOrDefault(kind) + 1;

    public override string ToString() =>
        _counts.Count == 0 ? "none" : string.Join(", ", _counts.OrderBy(c => c.Key, StringComparer.Ordinal).Select(c => $"{c.Key}={c.Value}"));
}
