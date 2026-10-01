using System.Text.Json;
using HCMUSSupportV2.Backend.Data;
using Npgsql;
using NpgsqlTypes;

namespace HCMUSSupportV2.Backend.Modules.Identity.Groups.Rules;

/// <summary>
/// One field a group rule can filter on. This is the extension point for new fields: implement it, register it with
/// <c>services.AddSingleton&lt;IGroupRuleField, MyField&gt;()</c>, and the parser (validation), the compiler (SQL) and
/// <c>docs/GROUP-RULES.md</c> are all that need to know. A later module (for example the HRM salary grade) can add
/// its own field without touching the groups engine: <see cref="Compile"/> may reference any table through an
/// <c>EXISTS</c> subquery on the employee alias <see cref="RuleSqlBuilder.EmployeeAlias"/>.
/// </summary>
public interface IGroupRuleField
{
    /// <summary>The <c>field</c> value in the rule JSON (snake_case, unique).</summary>
    string Name { get; }

    /// <summary>
    /// Validates the leaf object strictly (call <see cref="RuleParseContext.RejectUnknownProperties"/>) and returns the
    /// typed condition, or null after reporting errors through <paramref name="context"/>.
    /// </summary>
    RuleCondition? Parse(JsonElement leaf, RuleParseContext context);

    /// <summary>
    /// Returns a SQL boolean expression over the employee alias. Values must go through
    /// <see cref="RuleSqlBuilder.Param"/>; never concatenate user input.
    /// </summary>
    string Compile(RuleCondition condition, RuleSqlBuilder sql);

    /// <summary>Second validation phase: checks references against the database (for example that a unit exists).</summary>
    Task ValidateReferencesAsync(RuleCondition condition, string path, AppDbContext db, List<RuleError> errors, CancellationToken ct) =>
        Task.CompletedTask;
}

/// <summary>Accumulates a parameterized SQL fragment. All values become named Npgsql parameters (<c>@r0</c>, <c>@r1</c>, ...).</summary>
public sealed class RuleSqlBuilder
{
    /// <summary>The alias of <c>employees</c> in the compiled query.</summary>
    public const string EmployeeAlias = "e";

    private readonly List<(string Name, object Value, NpgsqlDbType Type)> _parameters = [];

    /// <summary>Registers a parameter and returns its placeholder (for example <c>@r3</c>).</summary>
    public string Param(object value, NpgsqlDbType type)
    {
        var name = $"r{_parameters.Count}";
        _parameters.Add((name, value, type));
        return "@" + name;
    }

    public IReadOnlyList<(string Name, object Value, NpgsqlDbType Type)> Parameters => _parameters;

    /// <summary>Fresh parameter objects (an <see cref="NpgsqlParameter"/> cannot be shared between commands).</summary>
    public NpgsqlParameter[] CreateParameters() =>
        _parameters.Select(p => new NpgsqlParameter(p.Name, p.Type) { Value = p.Value }).ToArray();
}
