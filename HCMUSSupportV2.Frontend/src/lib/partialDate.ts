import { DASH, formatDate } from './format'
import type { DatePrecision } from './format'

/** A date whose day or month may be unknown, as the backend sends it (`PartialDateDto`). */
export interface PartialDate {
  date?: string | null
  precision?: string | null
}

/** `dd/MM/yyyy`, `MM/yyyy` or `yyyy` by `precision` (unknown precision is read as `day`); `—` when there is no date. */
export function formatPartialDate(value: PartialDate | null | undefined): string {
  if (!value?.date) return DASH
  const p = value.precision?.toLowerCase()
  const precision: DatePrecision = p === 'year' || p === 'month' ? p : 'day'
  return formatDate(value.date, precision)
}
