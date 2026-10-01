# Group rules (D06)

A `rule` group (`groups.kind = 'rule'`) stores a small JSON filter in `groups.rule`. The groups engine validates it
strictly, compiles it to one parameterized SQL query over `employees`, and keeps `group_members` (`source=computed`) in
sync with the result. Code: `Modules/Identity/Groups/Rules/`.

## Shape

```json
{ "all": [ <condition>, <condition>, ... ] }
{ "any": [ <condition>, ... ] }
```

The root must be `all` (AND) or `any` (OR). Each array holds 1 to 50 entries; an entry is a leaf condition or another
`all`/`any` object. Limits: nesting depth 5, 50 leaf conditions in total. A combinator object has exactly one property;
any other property is an error. Strings are trimmed; unknown properties are rejected everywhere.

## Conditions

| `field` | Other properties | Matches |
|---|---|---|
| `org_unit` | `id` (org unit id, positive integer, must exist), `includeDescendants` (bool, default `false`) | employees whose `org_unit_id` **or** `department_id` is the unit; with `includeDescendants` also every unit below it (recursive over `org_units.parent_id`) |
| `position_title` | `op`: `eq` or `contains`; `value` (non-empty string, max 300) | `position_title`, ignoring case and accents. `contains` treats `%` and `_` literally |
| `academic_rank` | `op`: `in`; `value`: 1..50 strings | `academic_rank` equal (case-insensitive) to one of the values |
| `degree` | `op`: `in`; `value`: 1..50 strings | `degree`, same as above |
| `status` | `op`: `in`; `value`: subset of `active`, `inactive`, `retired` | `status` |
| `has_email` | `value`: `true` or `false` | the employee has (or has no) row in `employee_emails` |

Example: active professors or associate professors of a faculty and everything below it, who have an email:

```json
{ "all": [
  { "field": "org_unit", "id": 12, "includeDescendants": true },
  { "field": "academic_rank", "op": "in", "value": ["GS", "PGS"] },
  { "field": "has_email", "value": true }
] }
```

### Implicit `active` filter

Unless the rule contains a `status` condition (at any depth), the compiled predicate is `AND status = 'active'`, so a
retired or inactive employee never joins a group by accident. Add a `status` condition to opt out (for example
`{"field":"status","op":"in","value":["retired"]}` for an alumni list). `org_unit` groups always use active employees.

## Validation errors

`POST /api/manage/groups`, `PUT /api/manage/groups/{id}` and `POST /api/manage/groups/preview-rule` answer
`400 application/problem+json` (`ValidationProblemDetails`): `errors` maps a JSON path to Vietnamese messages, e.g.
`"$.all[1].value": ["'value' phải là một mảng chuỗi."]`. Paths use `$` for the root, `.all[i]` / `.any[i]` for entries and
`.<property>` for properties. A second phase checks references against the database (an unknown `org_unit.id` is reported at
`$.all[i].id`).

## Compilation

`GroupRuleCompiler` produces `SELECT e.* FROM employees e WHERE <predicate>` plus named Npgsql parameters (`@r0`, `@r1`, ...).
Field implementations only write constants and placeholders; every value from a rule goes through `RuleSqlBuilder.Param`.
`org_unit` with descendants uses a nested `WITH RECURSIVE ... UNION` (the plain `UNION` also stops a malformed parent
cycle). The query is run through EF `FromSqlRaw`, so counts, samples and diffs compose on top of it.

## Members and recompute

- Creating a rule group, changing its rule, changing `includeDescendants` of an org-unit group and restoring an archived
  group recompute that group **synchronously** in the same request. Observers are called with the added codes.
- Job `groups.recompute` (payload `{"groupId": 5}` or none): without an id it first ensures one `org_unit` group per active
  org unit (name = unit name, or `Name (code)` / `Name (#id)` when the name is taken; renamed with the unit; archived when the
  unit is inactive and restored when active again), then recomputes every non-archived `org_unit` and `rule` group.
  It is queued by `IRosterSyncObserver` (HRM ingest, D04; at most one waiting job) and by
  `POST /api/manage/groups/recompute[?groupId=]`.
- The diff is done in SQL inside one transaction per group (advisory lock per group): rows that no longer match and have
  `source=computed` are deleted, new matches are inserted, `member_count` is refreshed. Every registered
  `IGroupMembershipObserver.OnMembersAddedAsync` is called after commit with the **added** codes only (never for removals,
  never when nothing was added). A failing observer is logged and does not fail the recompute.
- Computed groups reject manual member edits (`409`). Static groups only have `source=manual` members.
- Archived groups are skipped by recompute and are hidden from lists unless `includeArchived=true`. Members of an archived group are kept so a restore is cheap; consumers (D07) must ignore archived groups.

## Adding a field

1. Implement `IGroupRuleField` (`Name`, `Parse`, `Compile`, optional `ValidateReferencesAsync`). `Parse` must call
   `RejectUnknownProperties` and report errors through the `RuleParseContext`; `Compile` returns a boolean SQL expression over
   alias `e` (`RuleSqlBuilder.EmployeeAlias`) and may use `EXISTS (SELECT 1 FROM other_table ... WHERE ... = e.code)`.
2. Register it: `services.AddSingleton<IGroupRuleField, MyField>();` (the HRM module can do this for `salary_grade`
   without touching the groups engine).
3. Document the field in the table above and add parser and preview tests.
