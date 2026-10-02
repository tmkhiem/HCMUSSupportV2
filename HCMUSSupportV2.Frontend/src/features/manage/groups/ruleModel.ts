/**
 * Editable model of a group rule (docs/GROUP-RULES.md). The builder edits one flat level of conditions joined by
 * `all` (AND) or `any` (OR); a stored rule with nested combinators is not representable here (`fromRule` -> null)
 * and the editor shows it read-only instead of silently flattening it.
 */

export type ConditionField = 'org_unit' | 'position_title' | 'academic_rank' | 'degree' | 'status' | 'has_email'
export type Combinator = 'all' | 'any'

export interface Condition {
  /** Client-only React key. */
  key: string
  field: ConditionField
  /** org_unit: unit id (null while the field is empty). */
  id?: number | null
  /** org_unit: display name remembered from the picker (client-only, never sent). */
  unitName?: string
  includeDescendants?: boolean
  /** position_title. */
  op?: 'eq' | 'contains'
  text?: string
  /** academic_rank, degree, status. */
  values?: string[]
  /** has_email. */
  flag?: boolean
}

export interface RuleModel {
  combinator: Combinator
  conditions: Condition[]
}

export const FIELD_LABELS: Record<ConditionField, string> = {
  org_unit: 'Đơn vị',
  position_title: 'Chức danh',
  academic_rank: 'Học hàm',
  degree: 'Học vị',
  status: 'Trạng thái',
  has_email: 'Có email',
}

export const STATUS_OPTIONS = [
  { value: 'active', label: 'Đang làm việc' },
  { value: 'inactive', label: 'Ngưng hoạt động' },
  { value: 'retired', label: 'Đã nghỉ hưu' },
]

let seq = 0
const nextKey = () => `c${++seq}`

export function newCondition(field: ConditionField = 'org_unit'): Condition {
  switch (field) {
    case 'org_unit':
      return { key: nextKey(), field, id: null, includeDescendants: false }
    case 'position_title':
      return { key: nextKey(), field, op: 'contains', text: '' }
    case 'status':
      return { key: nextKey(), field, values: ['active'] }
    case 'has_email':
      return { key: nextKey(), field, flag: true }
    default:
      return { key: nextKey(), field, values: [] }
  }
}

export function emptyModel(): RuleModel {
  return { combinator: 'all', conditions: [newCondition('org_unit')] }
}

export function conditionComplete(c: Condition): boolean {
  switch (c.field) {
    case 'org_unit':
      return Number.isInteger(c.id) && (c.id as number) > 0
    case 'position_title':
      return (c.text ?? '').trim().length > 0
    case 'has_email':
      return typeof c.flag === 'boolean'
    default:
      return (c.values ?? []).length > 0
  }
}

export function modelComplete(m: RuleModel): boolean {
  return m.conditions.length > 0 && m.conditions.length <= 50 && m.conditions.every(conditionComplete)
}

/** The JSON stored in `groups.rule`. Incomplete conditions are included as-is (callers gate on `modelComplete`). */
export function toRule(m: RuleModel): Record<string, unknown> {
  const leaves = m.conditions.map((c) => {
    switch (c.field) {
      case 'org_unit':
        return { field: 'org_unit', id: c.id, includeDescendants: Boolean(c.includeDescendants) }
      case 'position_title':
        return { field: 'position_title', op: c.op ?? 'contains', value: (c.text ?? '').trim() }
      case 'has_email':
        return { field: 'has_email', value: Boolean(c.flag) }
      default:
        return { field: c.field, op: 'in', value: c.values ?? [] }
    }
  })
  return { [m.combinator]: leaves }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')

/** Parse a stored rule into the builder model, or `null` when it uses features the builder cannot show. */
export function fromRule(rule: unknown): RuleModel | null {
  if (!isObj(rule)) return null
  const keys = Object.keys(rule)
  if (keys.length !== 1 || (keys[0] !== 'all' && keys[0] !== 'any')) return null
  const combinator = keys[0] as Combinator
  const list = rule[combinator]
  if (!Array.isArray(list)) return null
  const conditions: Condition[] = []
  for (const e of list) {
    if (!isObj(e)) return null
    switch (e.field) {
      case 'org_unit':
        conditions.push({ key: nextKey(), field: 'org_unit', id: typeof e.id === 'number' ? e.id : null, includeDescendants: e.includeDescendants === true })
        break
      case 'position_title':
        if (typeof e.value !== 'string') return null
        conditions.push({ key: nextKey(), field: 'position_title', op: e.op === 'eq' ? 'eq' : 'contains', text: e.value })
        break
      case 'academic_rank':
      case 'degree':
      case 'status':
        if (!isStrings(e.value)) return null
        conditions.push({ key: nextKey(), field: e.field, values: e.value })
        break
      case 'has_email':
        conditions.push({ key: nextKey(), field: 'has_email', flag: e.value !== false })
        break
      default:
        return null
    }
  }
  return { combinator, conditions }
}

/**
 * Group the server's `ValidationProblemDetails.errors` (keys like `$.all[1].value`) by condition index. Messages with
 * no index go to `general`.
 */
export function ruleErrors(errors: Record<string, string[]> | undefined): { byIndex: Record<number, string[]>; general: string[] } {
  const byIndex: Record<number, string[]> = {}
  const general: string[] = []
  for (const [path, messages] of Object.entries(errors ?? {})) {
    const m = /^\$\.(?:all|any)\[(\d+)\]/.exec(path)
    if (m) (byIndex[Number(m[1])] ??= []).push(...messages)
    else general.push(...messages)
  }
  return { byIndex, general }
}
