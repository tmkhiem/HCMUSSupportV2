import type { Severity } from './flags.ts'

/** The date prefix of a v1 file name (`yyyy-MM-dd...`), or null. */
export function fileNameDate(fileName: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})(?![\d])/.exec(fileName)
  return m && parseIsoDate(m[1]) ? m[1] : null
}

/** Parses `yyyy-MM-dd` as a UTC date, rejecting impossible dates such as 2026-02-30. */
export function parseIsoDate(value: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? '').trim())
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? d : null
}

export function daysBetween(a: string, b: string): number {
  const da = parseIsoDate(a)
  const db = parseIsoDate(b)
  if (!da || !db) return Number.POSITIVE_INFINITY
  return Math.round(Math.abs(da.getTime() - db.getTime()) / 86_400_000)
}

export interface PublishDate {
  /** `yyyy-MM-dd` */
  date: string
  flag?: { kind: string; severity: Severity; detail: string }
}

/** How far `datestr` may drift from the file-name date before the file name wins. */
export const DATE_TOLERANCE_DAYS = 3

/**
 * Picks the publish date. `datestr` wins when it is within a few days of the file-name date (v1 sometimes set it by
 * hand); otherwise the file-name date is used and the mismatch is flagged. With no file-name date, `datestr` is used.
 */
export function resolvePublishDate(fileName: string, datestr: string | null | undefined): PublishDate {
  const fromName = fileNameDate(fileName)
  const fromField = parseIsoDate(datestr) ? (datestr as string).trim() : null
  if (fromName && fromField) {
    const gap = daysBetween(fromName, fromField)
    if (gap === 0) return { date: fromField }
    if (gap <= DATE_TOLERANCE_DAYS) {
      return { date: fromField, flag: { kind: 'date_differs', severity: 'info', detail: `datestr is ${gap} day(s) from the file name; datestr used` } }
    }
    return { date: fromName, flag: { kind: 'date_mismatch', severity: 'warn', detail: `datestr is ${gap} days from the file name; file name used` } }
  }
  if (fromName) return { date: fromName, flag: { kind: 'date_mismatch', severity: 'warn', detail: 'datestr missing or invalid; file name used' } }
  if (fromField) return { date: fromField }
  throw new Error(`No usable date for ${fileName}: neither the file name nor datestr holds one.`)
}

/** The date at 08:00 +07:00. */
export function toPublishedAt(date: string): string {
  return `${date}T08:00:00+07:00`
}
