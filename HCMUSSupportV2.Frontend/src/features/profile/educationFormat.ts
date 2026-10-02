import { DASH, formatDate, joinParts } from '../../lib/format'
import type { DatePrecision } from '../../lib/format'
import type { BusinessTripEntry, DegreeEntry, PartialDate, TrainingEntry } from './educationApi'

function precisionOf(value: PartialDate): DatePrecision {
  const p = value.precision?.toLowerCase()
  return p === 'year' || p === 'month' ? p : 'day'
}

/** Date with possibly unknown day or month, `—` when absent. */
export function formatPartial(value: PartialDate | null | undefined): string {
  return value?.date ? formatDate(value.date, precisionOf(value)) : DASH
}

/** Year of a partial date, or null. Reads the leading `yyyy` so it never depends on the time zone. */
export function partialYear(value: PartialDate | null | undefined): number | null {
  const m = /^(\d{4})/.exec(value?.date ?? '')
  return m ? Number(m[1]) : null
}

/** "2012 – 2016"; "Tốt nghiệp 2016" or "Nhập học 2012" when only one end is known; `—` when neither is. */
export function degreeYears(entry: Pick<DegreeEntry, 'enrolledOn' | 'graduatedOn'>): string {
  const from = partialYear(entry.enrolledOn)
  const to = partialYear(entry.graduatedOn)
  if (from && to) return from === to ? String(to) : `${from} – ${to}`
  if (to) return `Tốt nghiệp ${to}`
  if (from) return `Nhập học ${from}`
  return DASH
}

/** "Trường · Quốc gia" without a dangling separator when one part is missing. */
export function degreePlace(entry: Pick<DegreeEntry, 'institution' | 'country'>): string {
  return joinParts([entry.institution, entry.country])
}

/** Newest first by graduation year, then enrolment year; undated entries last. Ties keep the API order. */
export function sortDegrees(items: ReadonlyArray<DegreeEntry>): DegreeEntry[] {
  const key = (e: DegreeEntry) => partialYear(e.graduatedOn) ?? partialYear(e.enrolledOn) ?? -Infinity
  return [...items].sort((a, b) => key(b) - key(a))
}

function span(from: string, to: string): string {
  if (from === DASH) return to
  if (to === DASH || to === from) return from
  return `${from} – ${to}`
}

/** "03/2023 – 05/2023", one date when both ends match, `—` when unknown. */
export function trainingPeriod(entry: Pick<TrainingEntry, 'startOn' | 'endOn'>): string {
  return span(formatPartial(entry.startOn), formatPartial(entry.endOn))
}

export interface YearGroup<T> {
  /** Null for entries without a year (listed last). */
  year: number | null
  items: T[]
}

/** The explicit `year`, else the year of the start or end date. */
export function trainingYear(entry: TrainingEntry): number | null {
  return entry.year ?? partialYear(entry.startOn) ?? partialYear(entry.endOn)
}

/** Groups by year, newest year first, undated last; rows inside a group keep their order. */
export function groupTrainingsByYear(items: ReadonlyArray<TrainingEntry>): YearGroup<TrainingEntry>[] {
  const map = new Map<number | null, TrainingEntry[]>()
  for (const e of items) {
    const y = trainingYear(e)
    const list = map.get(y)
    if (list) list.push(e)
    else map.set(y, [e])
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : b - a))
    .map(([year, rows]) => ({ year, items: rows }))
}

export function yearLabel(year: number | null): string {
  return year === null ? 'Chưa rõ năm' : `Năm ${year}`
}

/** Year a trip started in (else ended in), read from the leading `yyyy` of the ISO date. */
export function tripYear(entry: Pick<BusinessTripEntry, 'fromOn' | 'toOn'>): number | null {
  const m = /^(\d{4})/.exec(entry.fromOn ?? entry.toOn ?? '')
  return m ? Number(m[1]) : null
}

/** "07/04/2025 – 12/04/2025" (one date when both match). */
export function tripPeriod(entry: Pick<BusinessTripEntry, 'fromOn' | 'toOn'>): string {
  return span(formatDate(entry.fromOn), formatDate(entry.toOn))
}

/** Rows and totals for the year filter; a null year means all trips. */
export function tripStats(items: ReadonlyArray<BusinessTripEntry>, year: number | null) {
  const rows = year === null ? [...items] : items.filter((t) => tripYear(t) === year)
  return { tripCount: rows.length, totalDays: rows.reduce((sum, t) => sum + (t.days ?? 0), 0), rows }
}
