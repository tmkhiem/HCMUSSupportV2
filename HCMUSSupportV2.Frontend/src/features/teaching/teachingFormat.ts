import { DASH, formatDate, isBlank, joinParts } from '../../lib/format'
import type { Teaching, TeachingTerm } from './teachingApi'

const hoursFormat = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

/** Giờ chuẩn quy đổi with a decimal comma and no trailing zeros: `145,5`, `120`. `—` when missing. */
export function formatHours(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? DASH : hoursFormat.format(value)
}

export function termLabel(term: number): string {
  return `Học kỳ ${term}`
}

/** One-line summary of a học kỳ for its divider: "3 lớp · 145,5 giờ quy đổi". */
export function termSummary(term: TeachingTerm): string {
  const hours = term.items.reduce((sum, i) => sum + i.standardHours, 0)
  return joinParts([`${term.items.length} lớp`, `${formatHours(hours)} giờ quy đổi`])
}

/** Terms in ascending order, empty ones dropped. */
export function orderedTerms(terms: TeachingTerm[]): TeachingTerm[] {
  return terms.filter((t) => t.items.length > 0).sort((a, b) => a.term - b.term)
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
