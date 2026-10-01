namespace HCMUSSupportV2.Sync.Sources;

/// <summary>A source of full dataset snapshots as typed ingest rows (the element type is the dataset's DTO record).</summary>
public interface IDatasetSource
{
    string Name { get; }

    /// <summary>Datasets this source can deliver (subset of <see cref="Contracts.Datasets.All"/>).</summary>
    IReadOnlyCollection<string> Supported { get; }

    /// <summary>Read one dataset in full. Rows are typed records; the poster serialises them by runtime type.</summary>
    Task<IReadOnlyList<object>> ReadAsync(string dataset, CancellationToken ct);

    /// <summary>Rows the mapping skipped or flagged, by kind. Counts only.</summary>
    MappingReport Report { get; }
}
