import { notificationsClient, tagsClient } from '../../../api/clients'
import { http } from '../../../api/http'
import { MOCK_AUTH } from '../../../auth/useMe'
import type { VarsRow } from '../body/remarkVars'
import type { InboxQuery } from './inboxFilters'
import type { InboxDetail, InboxItem, InboxPage, InboxTag } from './inboxTypes'

/*
 * Inbox calls (`/api/notifications`, `/api/tags`). The list goes through the generated
 * `NotificationsClient`; the detail is hand-written because the generated `InboxDetailDto.vars` is the abstract
 * `JsonNode` (its `fromJS` throws). Under `VITE_MOCK_AUTH` everything is served by `inboxMock.ts`, no network.
 */

export const PAGE_SIZE = 20

const mock = () => import('./inboxMock')

const toDate = (value: unknown): Date | null => {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(d.getTime()) ? null : d
}

function toTag(t: { id?: number; name?: string; color?: string | undefined }): InboxTag {
  return { id: t.id ?? 0, name: t.name ?? '', color: t.color ?? null }
}

interface ItemSource {
  id?: string
  title?: string
  summary?: string
  tags?: Array<{ id?: number; name?: string; color?: string | undefined }>
  publishedAt?: Date | string | undefined
  deliveredAt?: Date | string
  isNew?: boolean
  updatedAfterDelivery?: boolean
  seriesId?: number | undefined
  hasAttachments?: boolean
}

/** Works for both the generated DTO (`Date`s) and the raw JSON (ISO strings). */
export function toInboxItem(d: ItemSource): InboxItem {
  return {
    id: d.id ?? '',
    title: d.title ?? '',
    summary: d.summary ?? '',
    tags: (d.tags ?? []).map(toTag),
    publishedAt: toDate(d.publishedAt),
    deliveredAt: toDate(d.deliveredAt) ?? new Date(0),
    isNew: d.isNew ?? false,
    updatedAfterDelivery: d.updatedAfterDelivery ?? false,
    seriesId: d.seriesId ?? null,
    hasAttachments: d.hasAttachments ?? false,
  }
}

/** `vars` arrives as an array of row objects (`[]` when none). Values are shown as text, so anything else is stringified. */
export function toVarsRows(raw: unknown): VarsRow[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null && !Array.isArray(row))
    .map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v === null || v === undefined ? null : String(v)])))
}

interface DetailJson extends ItemSource {
  bodyMd?: string
  variables?: Array<{ key?: string; label?: string | null; type?: string | null }>
  vars?: unknown
  attachments?: Array<{ fileId?: string; fileName?: string; contentType?: string; sizeBytes?: number }>
  series?: { id?: number; name?: string; previous?: Array<{ id?: string; title?: string; publishedAt?: string | null }> } | null
}

export function toInboxDetail(d: DetailJson): InboxDetail {
  return {
    ...toInboxItem(d),
    bodyMd: d.bodyMd ?? '',
    variables: (d.variables ?? []).map((v) => ({ key: v.key ?? '', label: v.label ?? null, type: v.type ?? null })),
    vars: toVarsRows(d.vars),
    attachments: (d.attachments ?? []).map((a) => ({
      fileId: a.fileId ?? '',
      fileName: a.fileName ?? '',
      contentType: a.contentType ?? '',
      sizeBytes: a.sizeBytes ?? 0,
    })),
    series: d.series
      ? {
          id: d.series.id ?? 0,
          name: d.series.name ?? '',
          previous: (d.series.previous ?? []).map((p) => ({ id: p.id ?? '', title: p.title ?? '', publishedAt: toDate(p.publishedAt) })),
        }
      : null,
  }
}

export async function fetchInboxPage(query: InboxQuery, cursor: string | undefined, limit = PAGE_SIZE): Promise<InboxPage> {
  if (import.meta.env.DEV && MOCK_AUTH) return (await mock()).listMock(query, cursor, limit)
  const page = await notificationsClient.list(query.q, query.tags, query.from, query.to, cursor, limit)
  return { items: (page.items ?? []).map(toInboxItem), nextCursor: page.nextCursor ?? null }
}

export async function fetchInboxDetail(id: string): Promise<InboxDetail> {
  if (import.meta.env.DEV && MOCK_AUTH) return (await mock()).detailMock(id)
  return toInboxDetail(await http.get<DetailJson>(`/api/notifications/${encodeURIComponent(id)}`))
}

export async function fetchTags(): Promise<InboxTag[]> {
  if (import.meta.env.DEV && MOCK_AUTH) return (await mock()).tagsMock()
  return (await tagsClient.list()).map(toTag)
}

export const attachmentUrl = (notificationId: string, fileId: string) =>
  `/api/notifications/${encodeURIComponent(notificationId)}/attachments/${encodeURIComponent(fileId)}`
