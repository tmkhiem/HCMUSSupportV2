/**
 * Display formatting shared by every page (UI-STYLE-GUIDE §8).
 *
 * - Missing value: `—`. Never `N/A`, `null`, or `0` for "unknown".
 * - Related facts are joined with ` · `.
 * - Money: whole units, vi-VN grouping, `đ` suffix.
 * - Dates: parsed tolerantly (ISO, then dd/MM/yyyy, then `new Date`) and shown as dd/MM/yyyy.
 *   Day keys are built from local time, never from `toISOString()`.
 */

export const DASH = '—'
export const SEPARATOR = ' · '

export type DatePrecision = 'day' | 'month' | 'year'

type Maybe<T> = T | null | undefined

export function isBlank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
}

/** The trimmed string, or `—` when the value is missing. */
export function orDash(value: Maybe<string | number>): string {
  return isBlank(value) ? DASH : String(value).trim()
}

/** Join the present parts with ` · `. Returns `—` when nothing is left. */
export function joinParts(parts: ReadonlyArray<Maybe<string | number | false>>, separator = SEPARATOR): string {
  const present = parts
    .filter((p): p is string | number => p !== false && !isBlank(p))
    .map((p) => String(p).trim())
  return present.length > 0 ? present.join(separator) : DASH
}

const wholeFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 })

function toNumber(value: Maybe<number | string>): number | null {
  if (isBlank(value)) return null
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  return Number.isFinite(n) ? n : null
}

/** `12.000.000 đ`. Accepts numbers or numeric strings; anything else is `—`. */
export function formatMoney(value: Maybe<number | string>): string {
  const n = toNumber(value)
  return n === null ? DASH : `${wholeFormat.format(n)} đ`
}

/** Fixed decimals with a decimal comma (`3,50`), e.g. salary coefficients. */
export function formatDecimal(value: Maybe<number | string>, digits = 2): string {
  const n = toNumber(value)
  if (n === null) return DASH
  return new Intl.NumberFormat('vi-VN', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n)
}

/** Whole-number grouping (`1.234`). */
export function formatNumber(value: Maybe<number | string>): string {
  const n = toNumber(value)
  return n === null ? DASH : wholeFormat.format(n)
}

function validDate(year: number, month: number, day: number): Date | null {
  const d = new Date(year, month - 1, day)
  // Reject roll-overs such as 31/02/2024.
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day ? d : null
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const VN_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/

/**
 * Tolerant parser: `Date` passthrough, ISO (`yyyy-MM-dd` is read as a local calendar day, not UTC),
 * `dd/MM/yyyy`, then whatever `new Date` understands. Returns `null` for anything unusable.
 */
export function parseDate(value: Maybe<string | Date | number>): Date | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'number') {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const text = value.trim()
  if (text === '') return null

  const iso = ISO_DATE.exec(text)
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const vn = VN_DATE.exec(text)
  if (vn) return validDate(Number(vn[3]), Number(vn[2]), Number(vn[1]))

  const fallback = new Date(text)
  return Number.isNaN(fallback.getTime()) ? null : fallback
}

const pad = (n: number) => String(n).padStart(2, '0')

/** `dd/MM/yyyy`, or `MM/yyyy` / `yyyy` when the source only knows the month or year. `—` if unparseable. */
export function formatDate(value: Maybe<string | Date | number>, precision: DatePrecision = 'day'): string {
  const d = parseDate(value)
  if (!d) return DASH
  if (precision === 'year') return String(d.getFullYear())
  if (precision === 'month') return `${pad(d.getMonth() + 1)}/${d.getFullYear()}`
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

/** Local `yyyy-MM-dd` key for grouping and `<input type="date">` values. */
export function dayKey(value: Maybe<string | Date | number>): string | null {
  const d = parseDate(value)
  return d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : null
}

/** `dd/MM/yyyy HH:mm` (local time). `—` if unparseable. */
export function formatDateTime(value: Maybe<string | Date | number>): string {
  const d = parseDate(value)
  if (!d) return DASH
  return `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** `512 B`, `1,5 KB`, `2,0 MB` (decimal comma, 1024 steps). `—` when missing. */
export function formatBytes(value: Maybe<number>): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return DASH
  if (value < 1024) return `${Math.round(value)} B`
  const units = ['KB', 'MB', 'GB']
  let n = value / 1024
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n)} ${units[i]}`
}
