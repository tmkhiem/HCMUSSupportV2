using System.Text.Json;
using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using Microsoft.EntityFrameworkCore;
using NpgsqlTypes;

namespace HCMUSSupportV2.Backend.Modules.Identity.Groups.Rules;

public sealed record OrgUnitCondition(long Id, bool IncludeDescendants) : RuleCondition(OrgUnitField.FieldName);

public sealed record PositionTitleCondition(string Op, string Value) : RuleCondition(PositionTitleField.FieldName);

/// <summary>A condition that matches when the column equals one of <see cref="Values"/> (stored lower-cased).</summary>
public sealed record InListCondition(string FieldName, IReadOnlyList<string> Values) : RuleCondition(FieldName);

public sealed record HasEmailCondition(bool Value) : RuleCondition(HasEmailField.FieldName);

/// <summary><c>{"field":"org_unit","id":12,"includeDescendants":true}</c>: the employee's unit or department is that unit (or below it).</summary>
public sealed class OrgUnitField : IGroupRuleField
{
    public const string FieldName = "org_unit";
    public string Name => FieldName;

    public RuleCondition? Parse(JsonElement leaf, RuleParseContext ctx)
    {
        var ok = ctx.RejectUnknownProperties(leaf, "field", "id", "includeDescendants");

        long id = 0;
        if (!leaf.TryGetProperty("id", out var idEl))
        {
            ctx.Error("id", "Thiếu thuộc tính 'id' (mã đơn vị).");
            ok = false;
        }
        else if (idEl.ValueKind != JsonValueKind.Number || !idEl.TryGetInt64(out id) || id <= 0)
        {
            ctx.Error("id", "'id' phải là số nguyên dương.");
            ok = false;
        }

        var include = false;
        if (leaf.TryGetProperty("includeDescendants", out var incEl))
        {
            if (incEl.ValueKind is JsonValueKind.True or JsonValueKind.False) include = incEl.GetBoolean();
            else
            {
                ctx.Error("includeDescendants", "'includeDescendants' phải là true hoặc false.");
                ok = false;
            }
        }
        return ok ? new OrgUnitCondition(id, include) : null;
    }

    public string Compile(RuleCondition condition, RuleSqlBuilder sql)
    {
        var c = (OrgUnitCondition)condition;
        var a = RuleSqlBuilder.EmployeeAlias;
        var id = sql.Param(c.Id, NpgsqlDbType.Bigint);
        if (!c.IncludeDescendants) return $"({a}.org_unit_id = {id} OR {a}.department_id = {id})";

        // UNION (not UNION ALL) also stops a malformed parent cycle.
        var tree = $"(WITH RECURSIVE ou(id) AS (SELECT o.id FROM org_units o WHERE o.id = {id} " +
                   "UNION SELECT c.id FROM org_units c JOIN ou ON c.parent_id = ou.id) SELECT id FROM ou)";
        return $"({a}.org_unit_id IN {tree} OR {a}.department_id IN {tree})";
    }

    public async Task ValidateReferencesAsync(RuleCondition condition, string path, AppDbContext db, List<RuleError> errors, CancellationToken ct)
    {
        var c = (OrgUnitCondition)condition;
        if (!await db.Set<OrgUnit>().AnyAsync(u => u.Id == c.Id, ct))
            errors.Add(new RuleError($"{path}.id", $"Không tìm thấy đơn vị có id {c.Id}."));
    }
}

/// <summary><c>{"field":"position_title","op":"eq"|"contains","value":"Trưởng khoa"}</c>; case- and accent-insensitive.</summary>
public sealed class PositionTitleField : IGroupRuleField
{
    public const string FieldName = "position_title";
    public string Name => FieldName;

    public RuleCondition? Parse(JsonElement leaf, RuleParseContext ctx)
    {
        var ok = ctx.RejectUnknownProperties(leaf, "field", "op", "value");
        var op = ctx.RequireString(leaf, "op", 20);
        if (op is not null && op is not ("eq" or "contains"))
        {
            ctx.Error("op", "'op' của position_title phải là 'eq' hoặc 'contains'.");
            op = null;
        }
        var value = ctx.RequireString(leaf, "value");
        return ok && op is not null && value is not null ? new PositionTitleCondition(op, value) : null;
    }

    public string Compile(RuleCondition condition, RuleSqlBuilder sql)
    {
        var c = (PositionTitleCondition)condition;
        var col = $"f_unaccent(lower({RuleSqlBuilder.EmployeeAlias}.position_title))";
        if (c.Op == "eq")
            return $"{col} = f_unaccent(lower({sql.Param(c.Value, NpgsqlDbType.Text)}))";
        var pattern = "%" + EscapeLike(c.Value) + "%";
        return $"{col} LIKE f_unaccent(lower({sql.Param(pattern, NpgsqlDbType.Text)}))";
    }

    /// <summary>Escapes backslash, percent and underscore so user text matches literally in a LIKE pattern (default escape char is backslash).</summary>
    internal static string EscapeLike(string s) => s.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_");
}

/// <summary>Base for <c>{"field":"...","op":"in","value":["a","b"]}</c> fields on a text column.</summary>
public abstract class InListField(string name, string column) : IGroupRuleField
{
    public string Name => name;

    /// <summary>Allowed values (lower-case); null accepts any text.</summary>
    protected virtual IReadOnlySet<string>? AllowedValues => null;

    public RuleCondition? Parse(JsonElement leaf, RuleParseContext ctx)
    {
        var ok = ctx.RejectUnknownProperties(leaf, "field", "op", "value");
        var op = ctx.RequireString(leaf, "op", 20);
        if (op is not null && op != "in")
        {
            ctx.Error("op", $"'op' của {name} phải là 'in'.");
            ok = false;
        }
        var values = ctx.RequireStringList(leaf, "value");
        if (values is null) return null;

        var lowered = values.Select(v => v.ToLowerInvariant()).Distinct().ToList();
        if (AllowedValues is { } allowed)
        {
            var bad = lowered.Where(v => !allowed.Contains(v)).ToList();
            if (bad.Count > 0)
            {
                ctx.Error("value", $"Giá trị không hợp lệ cho {name}: {string.Join(", ", bad)}. Cho phép: {string.Join(", ", allowed.Order())}.");
                ok = false;
            }
        }
        return ok && op is not null ? new InListCondition(name, lowered) : null;
    }

    public string Compile(RuleCondition condition, RuleSqlBuilder sql)
    {
        var c = (InListCondition)condition;
        var param = sql.Param(c.Values.ToArray(), NpgsqlDbType.Array | NpgsqlDbType.Text);
        return $"lower({RuleSqlBuilder.EmployeeAlias}.{column}) = ANY({param})";
    }
}

/// <summary><c>academic_rank</c> in a list (for example <c>["GS","PGS"]</c>); case-insensitive.</summary>
public sealed class AcademicRankField() : InListField("academic_rank", "academic_rank");

/// <summary><c>degree</c> in a list (for example <c>["TS","ThS"]</c>); case-insensitive.</summary>
public sealed class DegreeField() : InListField("degree", "degree");

/// <summary><c>status</c> in <c>active|inactive|retired</c>.</summary>
public sealed class StatusField() : InListField(FieldName, "status")
{
    public const string FieldName = "status";

    private static readonly HashSet<string> Allowed = new(
        [EmployeeStatuses.Active, EmployeeStatuses.Inactive, EmployeeStatuses.Retired]);

    protected override IReadOnlySet<string>? AllowedValues => Allowed;
}

/// <summary><c>{"field":"has_email","value":true}</c>: the employee has (or has no) mapped email address.</summary>
public sealed class HasEmailField : IGroupRuleField
{
    public const string FieldName = "has_email";
    public string Name => FieldName;

    public RuleCondition? Parse(JsonElement leaf, RuleParseContext ctx)
    {
        var ok = ctx.RejectUnknownProperties(leaf, "field", "value");
        if (!leaf.TryGetProperty("value", out var v))
        {
            ctx.Error("value", "Thiếu thuộc tính 'value'.");
            return null;
        }
        if (v.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
        {
            ctx.Error("value", "'value' phải là true hoặc false.");
            return null;
        }
        return ok ? new HasEmailCondition(v.GetBoolean()) : null;
    }

    public string Compile(RuleCondition condition, RuleSqlBuilder sql)
    {
        var c = (HasEmailCondition)condition;
        var exists = $"EXISTS (SELECT 1 FROM employee_emails m WHERE m.employee_code = {RuleSqlBuilder.EmployeeAlias}.code)";
        return c.Value ? exists : "NOT " + exists;
    }
}
