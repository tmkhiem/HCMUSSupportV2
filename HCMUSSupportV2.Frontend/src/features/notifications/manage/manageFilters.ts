import { STATUS_ORDER } from './manageTypes'
import type { ManageListQuery } from './manageApi'

/** The list filters live in the URL (`?status=published&tag=3&series=2&q=...`) so a refresh or a shared link keeps the view. */
export interface ManageFilters {
  status: string
  tag: number | null
  series: number | null
  q: string
}

export const EMPTY_MANAGE_FILTERS: ManageFilters = { status: '', tag: null, series: null, q: '' }

const toId = (v: string | null): number | null => {
  if (!v || !/^\d{1,15}$/.test(v)) return null
  const n = Number(v)
  return n > 0 ? n : null
}

export function parseManageFilters(params: URLSearchParams): ManageFilters {
  const status = params.get('status') ?? ''
  return {
    status: (STATUS_ORDER as readonly string[]).includes(status) ? status : '',
    tag: toId(params.get('tag')),
    series: toId(params.get('series')),
    q: (params.get('q') ?? '').trim().slice(0, 200),
  }
}

/** Writes the filters into a copy of `base`, leaving unrelated parameters alone and dropping empty ones. */
export function serializeManageFilters(filters: ManageFilters, base: URLSearchParams = new URLSearchParams()): URLSearchParams {
  const next = new URLSearchParams(base)
  for (const k of ['status', 'tag', 'series', 'q']) next.delete(k)
  if (filters.status) next.set('status', filters.status)
  if (filters.tag !== null) next.set('tag', String(filters.tag))
  if (filters.series !== null) next.set('series', String(filters.series))
  if (filters.q) next.set('q', filters.q)
  return next
}

export const toListQuery = (f: ManageFilters): ManageListQuery => ({ status: f.status, tag: f.tag, series: f.series, q: f.q })

export const hasManageFilters = (f: ManageFilters) => f.status !== '' || f.tag !== null || f.series !== null || f.q !== ''
