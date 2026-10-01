using System.Text.Json;

namespace HCMUSSupportV2.Backend.Modules.Identity.Groups.Rules;

/// <summary>A node of a parsed group rule: either a combinator (<see cref="RuleGroupNode"/>) or a condition.</summary>
public abstract record RuleNode;

public enum RuleCombinator
{
    /// <summary>Every child must match (<c>{"all": [...]}</c>).</summary>
    All,

    /// <summary>At least one child must match (<c>{"any": [...]}</c>).</summary>
    Any,
}

public sealed record RuleGroupNode(RuleCombinator Combinator, IReadOnlyList<RuleNode> Children) : RuleNode;

/// <summary>
/// One leaf condition on an employee field. Each <see cref="IGroupRuleField"/> parses its JSON into its own subclass
/// and compiles that subclass to SQL. <see cref="Field"/> is the JSON <c>field</c> name.
/// </summary>
public abstract record RuleCondition(string Field) : RuleNode;

/// <summary>A validated rule. <see cref="Json"/> is the compact JSON that is stored in <c>groups.rule</c>.</summary>
public sealed record GroupRule(RuleNode Root, string Json)
{
    /// <summary>Every leaf with its JSON path (for reference validation and error messages).</summary>
    public IEnumerable<(RuleCondition Condition, string Path)> Leaves() => Walk(Root, "$");

    /// <summary>True when any condition uses <paramref name="field"/>.</summary>
    public bool Uses(string field) => Leaves().Any(l => l.Condition.Field == field);

    private static IEnumerable<(RuleCondition, string)> Walk(RuleNode node, string path)
    {
        switch (node)
        {
            case RuleCondition c:
                yield return (c, path);
                break;
            case RuleGroupNode g:
                var key = g.Combinator == RuleCombinator.All ? "all" : "any";
                for (var i = 0; i < g.Children.Count; i++)
                    foreach (var leaf in Walk(g.Children[i], $"{path}.{key}[{i}]"))
                        yield return leaf;
                break;
        }
    }
}

/// <summary>One validation problem: a JSON path (<c>$.all[1].value</c>) and a Vietnamese message.</summary>
public sealed record RuleError(string Path, string Message);

public sealed class RuleParseResult
{
    public GroupRule? Rule { get; init; }
    public IReadOnlyList<RuleError> Errors { get; init; } = [];
    public bool IsValid => Rule is not null && Errors.Count == 0;
}

/// <summary>Collects errors while a rule is parsed; handed to each <see cref="IGroupRuleField"/>.</summary>
public sealed class RuleParseContext(string path, List<RuleError> errors)
{
    public string Path { get; } = path;

    public void Error(string message) => errors.Add(new RuleError(Path, message));

    public void Error(string property, string message) => errors.Add(new RuleError($"{Path}.{property}", message));

    /// <summary>Strict objects: reports every property that is not in <paramref name="allowed"/>.</summary>
    public bool RejectUnknownProperties(JsonElement obj, params string[] allowed)
    {
        var ok = true;
        foreach (var p in obj.EnumerateObject())
        {
            if (allowed.Contains(p.Name, StringComparer.Ordinal)) continue;
            Error(p.Name, $"Thuộc tính '{p.Name}' không được hỗ trợ ở đây.");
            ok = false;
        }
        return ok;
    }

    /// <summary>Reads a required string property (trimmed, non-empty, at most <paramref name="maxLength"/>).</summary>
    public string? RequireString(JsonElement obj, string property, int maxLength = 300)
    {
        if (!obj.TryGetProperty(property, out var v))
        {
            Error(property, $"Thiếu thuộc tính '{property}'.");
            return null;
        }
        return ReadString(v, $"{Path}.{property}", property, maxLength);
    }

    private string? ReadString(JsonElement v, string fullPath, string label, int maxLength)
    {
        if (v.ValueKind != JsonValueKind.String)
        {
            errors.Add(new RuleError(fullPath, $"'{label}' phải là chuỗi."));
            return null;
        }
        var s = v.GetString()!.Trim();
        if (s.Length == 0)
        {
            errors.Add(new RuleError(fullPath, $"'{label}' không được để trống."));
            return null;
        }
        if (s.Length > maxLength)
        {
            errors.Add(new RuleError(fullPath, $"'{label}' dài tối đa {maxLength} ký tự."));
            return null;
        }
        return s;
    }

    /// <summary>
    /// Reads a required non-empty array of strings (at most <paramref name="maxItems"/>, each at most
    /// <paramref name="maxLength"/> long). Case-insensitive duplicates collapse silently.
    /// </summary>
    public IReadOnlyList<string>? RequireStringList(JsonElement obj, string property, int maxItems = 50, int maxLength = 100)
    {
        if (!obj.TryGetProperty(property, out var v))
        {
            Error(property, $"Thiếu thuộc tính '{property}'.");
            return null;
        }
        if (v.ValueKind != JsonValueKind.Array)
        {
            Error(property, $"'{property}' phải là một mảng chuỗi.");
            return null;
        }
        var count = v.GetArrayLength();
        if (count == 0 || count > maxItems)
        {
            Error(property, $"'{property}' phải có từ 1 đến {maxItems} giá trị.");
            return null;
        }
        var list = new List<string>(count);
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var failed = false;
        var i = 0;
        foreach (var item in v.EnumerateArray())
        {
            var s = ReadString(item, $"{Path}.{property}[{i++}]", property, maxLength);
            if (s is null) failed = true;
            else if (seen.Add(s)) list.Add(s);
        }
        return failed ? null : list;
    }
}
