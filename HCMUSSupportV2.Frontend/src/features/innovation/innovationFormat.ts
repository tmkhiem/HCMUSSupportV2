import { DASH, formatDate, joinParts } from '../../lib/format'
import type { InnovationEntry, InnovationStats } from './innovationApi'

export const UNKNOWN_TYPE = 'Chưa phân loại'

/** The sáng kiến type as shown to people: a missing one is "Chưa phân loại". */
export function typeLabel(type: string | null | undefined): string {
  return type && type.trim() ? type.trim() : UNKNOWN_TYPE
}

/** "Năm 2024" from the recognition date, else the năm học ("Năm học 2023-2024"), else `—`. */
export function recognitionYear(entry: Pick<InnovationEntry, 'recognizedOn' | 'academicYear'>): string {
  const year = formatDate(entry.recognizedOn, 'year')
  if (year !== DASH) return `Năm ${year}`
  return entry.academicYear ? `Năm học ${entry.academicYear}` : DASH
}

/** "Số 123/QĐ · 12/03/2024", skipping what is missing. */
export function decisionLine(entry: Pick<InnovationEntry, 'decisionNo' | 'recognizedOn'>): string {
  return joinParts([entry.decisionNo && `Số ${entry.decisionNo}`, entry.recognizedOn && formatDate(entry.recognizedOn)])
}

/** One entry per type, largest first; the unclassified bucket goes last. */
export function typeBreakdown(stats: InnovationStats): Array<{ label: string; count: number }> {
  return stats.byType
    .map((t) => ({ label: typeLabel(t.type), count: t.count }))
    .sort(
      (a, b) =>
        Number(a.label === UNKNOWN_TYPE) - Number(b.label === UNKNOWN_TYPE) ||
        b.count - a.count ||
        a.label.localeCompare(b.label, 'vi'),
    )
}
