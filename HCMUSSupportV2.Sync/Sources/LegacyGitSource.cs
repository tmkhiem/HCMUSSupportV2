using HCMUSSupportV2.Sync.Contracts;

namespace HCMUSSupportV2.Sync.Sources;

/// <summary>Reads the v1 JSON of the local SupportHCMUSData checkout (offline, read-only) and maps it with <see cref="LegacyMapper"/>.</summary>
public sealed class LegacyGitSource : IDatasetSource
{
    private readonly string _dir;
    private readonly Dictionary<string, V1Category> _cache = new(StringComparer.Ordinal);
    private readonly LegacyMapper _mapper;

    public LegacyGitSource(string repoPath)
    {
        if (!Directory.Exists(repoPath)) throw new DirectoryNotFoundException($"Data repo not found: {repoPath}");
        _dir = V1Reader.ResolveNotificationsDir(repoPath);
        Report = new MappingReport();
        _mapper = new LegacyMapper(Report);
    }

    public string Name => "legacy-git";
    public MappingReport Report { get; }
    public IReadOnlyCollection<string> Supported => Datasets.All;

    private V1Category Cat(string category)
    {
        if (!_cache.TryGetValue(category, out var c)) _cache[category] = c = V1Reader.ReadCategory(_dir, category);
        return c;
    }

    public Task<IReadOnlyList<object>> ReadAsync(string dataset, CancellationToken ct)
    {
        IEnumerable<object> rows = dataset switch
        {
            Datasets.OrgUnits => _mapper.OrgUnits(Cat("detailed-profile")),
            Datasets.Employees => _mapper.Employees(Cat("general-profile"), Cat("detailed-profile")),
            Datasets.Profiles => _mapper.Profiles(Cat("general-profile"), Cat("detailed-profile")),
            Datasets.Salary => _mapper.Salary(Cat("salary-progress")),
            Datasets.Positions => _mapper.Positions(Cat("position")),
            Datasets.Commendations => _mapper.Commendations(Cat("award"), Cat("title")),
            Datasets.Degrees => _mapper.Degrees(Cat("academic-progress")),
            Datasets.Trainings => _mapper.Trainings(Cat("training-progress")),
            Datasets.BusinessTrips => _mapper.BusinessTrips(Cat("business-mission")),
            Datasets.Innovations => _mapper.Innovations(Cat("innovation")),
            _ => throw new ArgumentException($"Unknown dataset '{dataset}'."),
        };
        return Task.FromResult<IReadOnlyList<object>>(rows.ToList());
    }
}
