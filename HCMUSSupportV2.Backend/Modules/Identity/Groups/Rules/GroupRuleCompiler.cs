using HCMUSSupportV2.Backend.Modules.Identity.Directory;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace HCMUSSupportV2.Backend.Modules.Identity.Groups.Rules;

/// <summary>
/// A compiled group rule: a parameterized <c>SELECT e.* FROM employees e WHERE ...</c>. The text only contains
/// placeholders (<c>@r0</c>, ...) and constants written by this code; every user-supplied value is a parameter.
/// </summary>
public sealed class CompiledRule(string predicate, RuleSqlBuilder builder)
{
    /// <summary>The boolean expression over alias <c>e</c> (employees).</summary>
    public string Predicate { get; } = predicate;

    /// <summary><c>SELECT e.* FROM employees e WHERE &lt;predicate&gt;</c>.</summary>
    public string EmployeesSql => $"SELECT e.* FROM employees e WHERE {Predicate}";

    public NpgsqlParameter[] CreateParameters() => builder.CreateParameters();

    /// <summary>The matching employees as a composable query (further <c>Where</c>/<c>Select</c>/<c>Count</c> wrap it as a subquery).</summary>
    public IQueryable<Employee> Employees(DbContext db) =>
        db.Set<Employee>().FromSqlRaw(EmployeesSql, CreateParameters()).AsNoTracking();
}

/// <summary>Compiles a validated <see cref="GroupRule"/> into SQL. No value is ever concatenated into the SQL text.</summary>
public class GroupRuleCompiler(GroupRuleParser parser)
{
    /// <summary>
    /// Compiles <paramref name="rule"/>. Unless the rule has a <c>status</c> condition somewhere, only <c>active</c>
    /// employees match (so retired people do not receive notifications by accident).
    /// </summary>
    public CompiledRule Compile(GroupRule rule)
    {
        var sql = new RuleSqlBuilder();
        var predicate = CompileNode(rule.Root, sql);
        if (!rule.Uses(StatusField.FieldName))
            predicate = $"({predicate} AND {RuleSqlBuilder.EmployeeAlias}.status = 'active')";
        return new CompiledRule(predicate, sql);
    }

    /// <summary>The rule an <c>org_unit</c> group stands for: active employees of the unit (and optionally below it).</summary>
    public CompiledRule CompileOrgUnit(long orgUnitId, bool includeDescendants) =>
        Compile(new GroupRule(new OrgUnitCondition(orgUnitId, includeDescendants), ""));

    private string CompileNode(RuleNode node, RuleSqlBuilder sql)
    {
        switch (node)
        {
            case RuleCondition c:
                var field = parser.FieldOf(c.Field) ?? throw new InvalidOperationException($"Unknown rule field '{c.Field}'.");
                return field.Compile(c, sql);
            case RuleGroupNode g:
                var parts = g.Children.Select(child => CompileNode(child, sql));
                var glue = g.Combinator == RuleCombinator.All ? " AND " : " OR ";
                return "(" + string.Join(glue, parts) + ")";
            default:
                throw new InvalidOperationException("Unknown rule node.");
        }
    }
}
