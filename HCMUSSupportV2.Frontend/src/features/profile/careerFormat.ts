import { DASH, formatDate, formatDecimal } from '../../lib/format'
import type { DatePrecision } from '../../lib/format'
import type { CommendationDate, SalaryEntry } from './careerApi'

/** "3 năm 2 tháng", "5 tháng", "2 năm"; `—` when the backend sent no tenure. Negative parts count as zero. */
export function formatTenure(years: number | null | undefined, months: number | null | undefined): string {
  if (years == null && months == null) return DASH
  const y = Math.max(0, years ?? 0)
  const m = Math.max(0, months ?? 0)
  const parts: string[] = []
  if (y > 0) parts.push(`${y} năm`)
  if (m > 0) parts.push(`${m} tháng`)
  return parts.length > 0 ? parts.join(' ') : 'Dưới 1 tháng'
}

/** Countdown for the next salary raise: "còn 5 tháng", "trong tháng này", "quá hạn 2 tháng"; `—` when unknown. */
export function formatMonthsToRaise(months: number | null | undefined): string {
  if (months == null) return DASH
  if (months === 0) return 'trong tháng này'
  if (months < 0) return `quá hạn ${-months} tháng`
  return `còn ${months} tháng`
}

/** Date with possibly unknown day/month, as `PartialDateDto`; unknown precision is read as `day`. */
export function formatCommendationDate(value: CommendationDate | null | undefined): string {
  if (!value?.date) return DASH
  const p = value.precision?.toLowerCase()
  const precision: DatePrecision = p === 'year' || p === 'month' ? p : 'day'
  return formatDate(value.date, precision)
}

/** "Năm học 2023-2024" (the value is shown as stored); "Chưa rõ năm học" for the null group. */
export function academicYearLabel(academicYear: string | null | undefined): string {
  const y = academicYear?.trim()
  return y ? `Năm học ${y}` : 'Chưa rõ năm học'
}

/** "Bậc 4 · hệ số 4,65" for a salary decision, skipping what is unknown. */
export function salaryStepLabel(entry: Pick<SalaryEntry, 'step' | 'coefficient'>): string {
  const parts: string[] = []
  if (entry.step != null) parts.push(`Bậc ${entry.step}`)
  if (entry.coefficient != null) parts.push(`hệ số ${formatDecimal(entry.coefficient)}`)
  return parts.length > 0 ? parts.join(' · ') : DASH
}

export interface CoefficientPoint {
  date: Date
  coefficient: number
}

/**
 * Points of the hệ số step-line: one per decision that has both an effective date and a coefficient, oldest first
 * (the API sends newest first). Two decisions on the same day keep the last one listed in the API order, i.e. the
 * earlier row, so the newest decision wins after the reversal.
 */
export function coefficientPoints(history: ReadonlyArray<SalaryEntry>): CoefficientPoint[] {
  const byDay = new Map<number, CoefficientPoint>()
  // Iterate oldest -> newest so a later decision on the same day overwrites an earlier one.
  for (const entry of [...history].reverse()) {
    if (entry.coefficient == null || !entry.effectiveFrom) continue
    const [y, m, d] = entry.effectiveFrom.split('-').map(Number)
    if (!y || !m || !d) continue
    const date = new Date(y, m - 1, d)
    byDay.set(date.getTime(), { date, coefficient: entry.coefficient })
  }
  return [...byDay.values()].sort((a, b) => a.date.getTime() - b.date.getTime())
}
