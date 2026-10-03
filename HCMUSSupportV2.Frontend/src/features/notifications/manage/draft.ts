import { ApiError } from '../../../api/http'
import { VAR_KEY_PATTERN } from '../body/remarkVars'
import type { DraftForm, ManageDetail, ManageRevision, WriteRequest } from './manageTypes'

/** The empty form of a new notification. */
export const EMPTY_DRAFT: DraftForm = {
  title: '',
  summary: '',
  bodyMd: '',
  variables: [],
  seriesId: null,
  tagIds: [],
  audienceAll: false,
  groups: [],
  employees: [],
}

/** The editable part of a loaded notification. */
export function formFromDetail(d: ManageDetail): DraftForm {
  return {
    title: d.title,
    // An automatic summary stays empty in the form: the server derives it again from the body.
    summary: d.summaryIsCustom ? d.summary : '',
    bodyMd: d.bodyMd,
    variables: d.variables.map((v) => ({ ...v })),
    seriesId: d.seriesId,
    tagIds: d.tags.map((t) => t.id),
    audienceAll: d.audienceAll,
    groups: d.groups.map((g) => ({ ...g })),
    employees: d.employees.map((e) => ({ ...e })),
  }
}

/** Loads an older version's content into the form (the audience and tags stay as they are). */
export function applyRevision(form: DraftForm, r: ManageRevision): DraftForm {
  return {
    ...form,
    title: r.title,
    summary: '',
    bodyMd: r.bodyMd,
    variables: r.variables.map((v) => ({ ...v })),
  }
}

export function toWriteRequest(form: DraftForm, version?: number): WriteRequest {
  return {
    version,
    title: form.title.trim(),
    seriesId: form.seriesId,
    summary: form.summary.trim(),
    bodyMd: form.bodyMd,
    variables: form.variables.map((v) => ({ key: v.key.trim(), label: v.label.trim() || v.key.trim(), type: v.type })),
    tagIds: [...form.tagIds],
    audienceAll: form.audienceAll,
    groupIds: form.groups.map((g) => g.id),
    employeeCodes: form.employees.map((e) => e.code),
  }
}

/** Compares what is sent to the server, so a re-ordering of nothing or an untouched summary is not "dirty". */
export function isDirty(form: DraftForm, saved: DraftForm | null): boolean {
  if (saved === null) return form.title.trim() !== '' || form.bodyMd.trim() !== '' || form.variables.length > 0
  return JSON.stringify(toWriteRequest(form)) !== JSON.stringify(toWriteRequest(saved))
}

/** Mirror of the server rule (`NotificationMarkdown.IsValidVarKey`): a letter first, then letters, digits or `_`, up to 64. */
export function variableKeyError(key: string, others: readonly string[]): string | null {
  const k = key.trim()
  if (k === '') return 'Nhập tên biến.'
  if (!VAR_KEY_PATTERN.test(k)) return 'Chữ cái đầu, sau đó chữ, số hoặc _ (tối đa 64 ký tự).'
  if (others.includes(k)) return 'Tên biến bị trùng.'
  return null
}

/** Field errors of a 400 (`errors` map of the ProblemDetails), keyed by the camelCase field name. */
export type FieldErrors = Record<string, string[]>

export function fieldErrorsOf(error: unknown): FieldErrors {
  if (!(error instanceof ApiError)) return {}
  const raw = error.problem?.errors
  if (!raw || typeof raw !== 'object') return {}
  const out: FieldErrors = {}
  for (const [key, value] of Object.entries(raw)) {
    const name = key.charAt(0).toLowerCase() + key.slice(1)
    out[name] = Array.isArray(value) ? value.map(String) : [String(value)]
  }
  return out
}

/** A 409 from `PUT` (someone else saved first): the version the server holds now, when it says so. */
export function conflictVersion(error: unknown): number | null | undefined {
  if (!(error instanceof ApiError) || error.status !== 409) return undefined
  const v = error.problem?.currentVersion
  return typeof v === 'number' ? v : null
}

/** "Dòng 3, cột 5: ..." lines the server puts in `errors.bodyMd` are shown as a list under the editor. */
export function splitBodyIssue(message: string): { code: string | null; text: string } {
  const m = /^\[([A-Z0-9_]+)\]\s*(.*)$/s.exec(message)
  return m ? { code: m[1], text: m[2] } : { code: null, text: message }
}
