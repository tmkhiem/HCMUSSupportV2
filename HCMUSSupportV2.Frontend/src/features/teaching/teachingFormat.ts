import { DASH, formatDate, isBlank, joinParts } from '../../lib/format'
import type { Teaching, TeachingEntry, TeachingModule, TeachingProgram, TeachingProgramId, TeachingTerm } from './teachingApi'

const hoursFormat = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

/** Giờ chuẩn quy đổi with a decimal comma and no trailing zeros: `145,5`, `120`. `—` when missing. */
export function formatHours(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? DASH : hoursFormat.format(value)
}

export function termLabel(term: number): string {
  return `Học kỳ ${term}`
}

export const NO_MODULE_LABEL = 'Chưa rõ học phần'

/** Heading of a học phần / chuyên đề group; a missing module is "Chưa rõ học phần". */
export function moduleLabel(module: string | null | undefined): string {
  return isBlank(module) ? NO_MODULE_LABEL : module!.trim()
}

const PROGRAM_LABELS: Record<TeachingProgramId, string> = { dai_hoc: 'Đại học', cao_hoc: 'Cao học', tien_si: 'Tiến sĩ' }
const PROGRAM_ORDER: TeachingProgramId[] = ['dai_hoc', 'cao_hoc', 'tien_si']

export function programLabel(program: string): string {
  return PROGRAM_LABELS[program as TeachingProgramId] ?? program
}

/** Programs in the fixed order Đại học, Cao học, Tiến sĩ; empty ones dropped, unknown ones last. */
export function orderedPrograms(programs: TeachingProgram[]): TeachingProgram[] {
  const rank = (p: string) => {
    const i = PROGRAM_ORDER.indexOf(p as TeachingProgramId)
    return i < 0 ? PROGRAM_ORDER.length : i
  }
  const hasRows = (p: TeachingProgram) => p.terms.some((t) => t.items.length > 0) || p.modules.some((m) => m.items.length > 0)
  return programs.filter(hasRows).sort((a, b) => rank(a.program) - rank(b.program))
}

const ACTIVITY_LABELS: Record<string, string> = {
  LYTHUYET: 'Lý thuyết',
  THUCHANH: 'Thực hành',
  BAITAP: 'Bài tập',
  TROGIANG: 'Trợ giảng',
  CHUANBI: 'Chuẩn bị',
  KHOALUANTN: 'Khóa luận TN',
  SEMINARTN: 'Seminar TN',
}

/** A readable name for a v1 activity code; unknown codes (the list has a long tail) are shown as they are. */
export function activityLabel(activity: string | null | undefined): string {
  if (isBlank(activity)) return DASH
  const code = activity!.trim()
  return ACTIVITY_LABELS[code.toUpperCase()] ?? code
}

/** One-line summary of a group for its divider: "3 lớp · 145,5 giờ quy đổi". */
export function groupSummary(items: readonly TeachingEntry[]): string {
  const hours = items.reduce((sum, i) => sum + i.standardHours, 0)
  return joinParts([`${items.length} lớp`, `${formatHours(hours)} giờ quy đổi`])
}

export function termSummary(term: TeachingTerm): string {
  return groupSummary(term.items)
}

/** Terms in ascending order, empty ones dropped. */
export function orderedTerms(terms: TeachingTerm[]): TeachingTerm[] {
  return terms.filter((t) => t.items.length > 0).sort((a, b) => a.term - b.term)
}

/** Modules with a name first (alphabetical), the "no module" group last, empty ones dropped. */
export function orderedModules(modules: TeachingModule[]): TeachingModule[] {
  return modules
    .filter((m) => m.items.length > 0)
    .sort((a, b) => {
      const an = isBlank(a.module)
      const bn = isBlank(b.module)
      if (an !== bn) return an ? 1 : -1
      return moduleLabel(a.module).localeCompare(moduleLabel(b.module), 'vi')
    })
}

/** "Nguồn: Phòng Đào tạo, cập nhật 02/10/2026". Each half is dropped when unknown; `null` when both are. */
export function sourceCaption(teaching: Pick<Teaching, 'sourceCaption' | 'sourceUpdatedAt'>): string | null {
  const source = isBlank(teaching.sourceCaption) ? null : teaching.sourceCaption!.trim()
  const updated = formatDate(teaching.sourceUpdatedAt)
  const parts = [source && `Nguồn: ${source}`, updated !== DASH && `cập nhật ${updated}`].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}

/** The year to show first: the one asked for if the employee has it, else the newest. */
export function pickYear(years: readonly string[], wanted: string | null): string | null {
  if (wanted && years.includes(wanted)) return wanted
  return years[0] ?? null
}
