import { dayKey, parseDate } from '../../../lib/format'

/**
 * The inbox filters, kept in the URL query so they survive a reload and the back button
 * (`/tin-tuc?q=luong&tags=1,3&from=2026-01-01&to=2026-06-30&unread=1`).
 */
export interface InboxFilters {
  /** Free text (accent-insensitive full text on the server). Trimmed; empty = off. */
  q: string
  /** Tag ids, any of. Sorted and unique so equal filters give equal query keys. */
  tags: number[]
  /** Local `yyyy-MM-dd`, inclusive. Empty = off. */
  from: string
  to: string
  unread: boolean
}

export const EMPTY_FILTERS: InboxFilters = { q: '', tags: [], from: '', to: '', unread: false }

/** Query parameters of the API call (`GET /api/notifications`). Dates are real instants: start of `from`, end of `to` (local). */
export interface InboxQuery {
  q?: string
  tags?: number[]
  from?: Date
  to?: Date
  unread?: boolean
}

/** A strict local calendar day in `yyyy-MM-dd`, else `''`. */
function cleanDay(value: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return ''
  const d = parseDate(value)
  return d ? (dayKey(d) ?? '') : ''
}

function cleanTags(values: Iterable<number>): number[] {
  return [...new Set([...values].filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b)
}

/** Reads the filters from a query string. Unknown or malformed values are dropped, never thrown. */
export function parseFilters(params: URLSearchParams): InboxFilters {
  const tags = (params.get('tags') ?? '')
    .split(',')
    .map((t) => (/^\d+$/.test(t.trim()) ? Number(t.trim()) : NaN))
  let from = cleanDay(params.get('from'))
  let to = cleanDay(params.get('to'))
  if (from && to && from > to) [from, to] = [to, from]
  const unread = params.get('unread')
  return {
    q: (params.get('q') ?? '').trim(),
    tags: cleanTags(tags),
    from,
    to,
    unread: unread === '1' || unread === 'true',
  }
}

/** Writes the filters back; only active filters appear. Other parameters of `base` are kept. */
export function serializeFilters(filters: InboxFilters, base?: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams(base)
  for (const key of ['q', 'tags', 'from', 'to', 'unread']) params.delete(key)
  const q = filters.q.trim()
  if (q) params.set('q', q)
  const tags = cleanTags(filters.tags)
  if (tags.length > 0) params.set('tags', tags.join(','))
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  if (filters.unread) params.set('unread', '1')
  return params
}

export function hasActiveFilters(filters: InboxFilters): boolean {
  return countActiveFilters(filters) > 0
}

/** Search + each tag group + date range + unread, as the number shown on the mobile "Bộ lọc" button. */
export function countActiveFilters(filters: InboxFilters): number {
  return (
    (filters.q.trim() ? 1 : 0) +
    (filters.tags.length > 0 ? 1 : 0) +
    (filters.from ? 1 : 0) +
    (filters.to ? 1 : 0) +
    (filters.unread ? 1 : 0)
  )
}

/** Filters -> API parameters. `to` is the last millisecond of that day because the server's `to` is an inclusive instant. */
export function toInboxQuery(filters: InboxFilters): InboxQuery {
  const query: InboxQuery = {}
  if (filters.q.trim()) query.q = filters.q.trim()
  if (filters.tags.length > 0) query.tags = cleanTags(filters.tags)
  const from = parseDate(filters.from)
  if (from) query.from = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 0, 0, 0, 0)
  const to = parseDate(filters.to)
  if (to) query.to = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999)
  if (filters.unread) query.unread = true
  return query
}

/** Toggles one tag id, keeping the list sorted and unique. */
export function toggleTag(tags: readonly number[], id: number): number[] {
  return cleanTags(tags.includes(id) ? tags.filter((t) => t !== id) : [...tags, id])
}

export function sameFilters(a: InboxFilters, b: InboxFilters): boolean {
  return (
    a.q.trim() === b.q.trim() &&
    a.from === b.from &&
    a.to === b.to &&
    a.unread === b.unread &&
    a.tags.length === b.tags.length &&
    a.tags.every((t, i) => t === b.tags[i])
  )
}
