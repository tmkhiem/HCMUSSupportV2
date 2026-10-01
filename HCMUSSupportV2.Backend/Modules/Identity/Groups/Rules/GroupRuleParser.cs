using System.Text.Json;
using HCMUSSupportV2.Backend.Data;

namespace HCMUSSupportV2.Backend.Modules.Identity.Groups.Rules;

/// <summary>
/// Strict parser and validator for the group rule JSON (see <c>docs/GROUP-RULES.md</c>). Every error carries a JSON
/// path. Nothing is executed here: <see cref="GroupRuleCompiler"/> turns a valid rule into parameterized SQL.
/// </summary>
public class GroupRuleParser(IEnumerable<IGroupRuleField> fields)
{
    public const int MaxDepth = 5;
    public const int MaxConditions = 50;

    private readonly Dictionary<string, IGroupRuleField> _fields = fields.ToDictionary(f => f.Name, StringComparer.Ordinal);

    public IReadOnlyCollection<string> FieldNames => _fields.Keys;

    public IGroupRuleField? FieldOf(string name) => _fields.GetValueOrDefault(name);

    /// <summary>Parses and validates the structure. Does not touch the database (see <see cref="ValidateAsync"/>).</summary>
    public RuleParseResult Parse(JsonElement root)
    {
        var errors = new List<RuleError>();
        var leafCount = 0;
        var node = ParseNode(root, "$", 1, errors, ref leafCount);
        if (leafCount > MaxConditions)
            errors.Add(new RuleError("$", $"Quy tắc có tối đa {MaxConditions} điều kiện."));
        if (node is RuleCondition) errors.Add(new RuleError("$", "Quy tắc phải bắt đầu bằng 'all' hoặc 'any'."));
        if (errors.Count > 0 || node is null) return new RuleParseResult { Errors = errors };
        return new RuleParseResult { Rule = new GroupRule(node, root.GetRawText()), Errors = [] };
    }

    public RuleParseResult Parse(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            return Parse(doc.RootElement);
        }
        catch (JsonException)
        {
            return new RuleParseResult { Errors = [new RuleError("$", "Quy tắc không phải là JSON hợp lệ.")] };
        }
    }

    /// <summary>Parses, then checks references (for example that the org unit exists) against the database.</summary>
    public async Task<RuleParseResult> ValidateAsync(JsonElement root, AppDbContext db, CancellationToken ct)
    {
        var result = Parse(root);
        if (!result.IsValid) return result;

        var errors = new List<RuleError>();
        foreach (var (condition, path) in result.Rule!.Leaves())
            await _fields[condition.Field].ValidateReferencesAsync(condition, path, db, errors, ct);
        return errors.Count == 0 ? result : new RuleParseResult { Errors = errors };
    }

    private RuleNode? ParseNode(JsonElement el, string path, int depth, List<RuleError> errors, ref int leafCount)
    {
        if (el.ValueKind != JsonValueKind.Object)
        {
            errors.Add(new RuleError(path, "Mỗi điều kiện phải là một đối tượng JSON."));
            return null;
        }

        var ctx = new RuleParseContext(path, errors);
        if (el.TryGetProperty("field", out var fieldEl))
        {
            leafCount++;
            if (fieldEl.ValueKind != JsonValueKind.String)
            {
                ctx.Error("field", "'field' phải là chuỗi.");
                return null;
            }
            var name = fieldEl.GetString()!;
            if (!_fields.TryGetValue(name, out var field))
            {
                ctx.Error("field", $"Trường '{name}' không được hỗ trợ. Các trường hợp lệ: {string.Join(", ", _fields.Keys.Order())}.");
                return null;
            }
            return field.Parse(el, ctx);
        }

        var hasAll = el.TryGetProperty("all", out var allEl);
        var hasAny = el.TryGetProperty("any", out var anyEl);
        if (hasAll == hasAny)
        {
            errors.Add(new RuleError(path, "Cần đúng một trong 'all', 'any' (hoặc 'field' cho một điều kiện)."));
            return null;
        }
        if (!ctx.RejectUnknownProperties(el, hasAll ? "all" : "any")) return null;

        var combinator = hasAll ? RuleCombinator.All : RuleCombinator.Any;
        var key = hasAll ? "all" : "any";
        var array = hasAll ? allEl : anyEl;
        if (array.ValueKind != JsonValueKind.Array)
        {
            ctx.Error(key, $"'{key}' phải là một mảng điều kiện.");
            return null;
        }
        if (depth > MaxDepth)
        {
            errors.Add(new RuleError(path, $"Quy tắc lồng nhau tối đa {MaxDepth} cấp."));
            return null;
        }
        var count = array.GetArrayLength();
        if (count == 0)
        {
            ctx.Error(key, $"'{key}' phải có ít nhất một điều kiện.");
            return null;
        }

        var children = new List<RuleNode>(count);
        var ok = true;
        var i = 0;
        foreach (var child in array.EnumerateArray())
        {
            var node = ParseNode(child, $"{path}.{key}[{i++}]", depth + 1, errors, ref leafCount);
            if (node is null) ok = false;
            else children.Add(node);
            if (leafCount > MaxConditions) return null; // reported once by the caller; stop early on huge input
        }
        return ok ? new RuleGroupNode(combinator, children) : null;
    }
}
