using System.Text.Json;

namespace HCMUSSupportV2.Sync.Legacy;

/// <summary>
/// Where the detailed legacy reports go. They contain MSCBs, names and emails, so the directory must be outside any git work tree
/// (a stray <c>git add</c> must never be able to pick them up): a directory with a <c>.git</c> entry in it or in any ancestor is refused.
/// </summary>
public sealed class ReportDirectory
{
    private static readonly JsonSerializerOptions Pretty = new(IngestClient.Json) { WriteIndented = true };

    private ReportDirectory(string path) => Path = path;

    public string Path { get; }

    /// <summary><c>%LOCALAPPDATA%\HCMUSSupportV2\legacy</c>.</summary>
    public static string DefaultPath
    {
        get
        {
            var root = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            if (string.IsNullOrEmpty(root)) root = System.IO.Path.GetTempPath();
            return System.IO.Path.Combine(root, "HCMUSSupportV2", "legacy");
        }
    }

    /// <summary>Resolves the directory (default when <paramref name="requested"/> is blank) and refuses a git work tree. Nothing is created yet.</summary>
    /// <exception cref="InvalidOperationException">The directory is inside a git work tree.</exception>
    public static ReportDirectory Resolve(string? requested)
    {
        var full = System.IO.Path.GetFullPath(string.IsNullOrWhiteSpace(requested) ? DefaultPath : requested);
        if (FindGitRoot(full) is { } root)
            throw new InvalidOperationException(
                $"Report directory '{full}' is inside a git work tree ('{root}'). The reports contain personal data: use --report <dir> with a folder outside any repository.");
        return new ReportDirectory(full);
    }

    /// <summary>The nearest ancestor (or the directory itself) that holds a <c>.git</c> directory or file, or null.</summary>
    public static string? FindGitRoot(string path)
    {
        for (var dir = new DirectoryInfo(System.IO.Path.GetFullPath(path)); dir is not null; dir = dir.Parent)
        {
            var git = System.IO.Path.Combine(dir.FullName, ".git");
            if (Directory.Exists(git) || File.Exists(git)) return dir.FullName;
        }
        return null;
    }

    /// <summary>Writes <c>&lt;name&gt;-yyyyMMdd-HHmmss.json</c> (indented) and returns its full path. A string is taken as JSON text already.</summary>
    public string Write(string name, object content)
    {
        Directory.CreateDirectory(Path);
        var file = System.IO.Path.Combine(Path, $"{name}-{DateTime.Now:yyyyMMdd-HHmmss}.json");
        var json = content is string text
            ? JsonSerializer.Serialize(JsonSerializer.Deserialize<JsonElement>(text), Pretty)
            : JsonSerializer.Serialize(content, Pretty);
        File.WriteAllText(file, json);
        return file;
    }
}
