import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import type { InboxFilters } from './inboxFilters'
import type { InboxDetail, InboxItem, InboxPage } from './inboxTypes'

export const inboxKeys = {
  all: ['inbox'] as const,
  lists: ['inbox', 'list'] as const,
  list: (filters: InboxFilters) => ['inbox', 'list', filters] as const,
  details: ['inbox', 'detail'] as const,
  detail: (id: string) => ['inbox', 'detail', id] as const,
  tags: ['inbox', 'tags'] as const,
  unread: ['inbox', 'unread-count'] as const,
}

type ListData = InfiniteData<InboxPage, string | undefined>

/** Applies `patch` to the item `id` in every cached inbox list (all filters) and in its cached detail. */
export function patchInboxItem(qc: QueryClient, id: string, patch: (item: InboxItem) => InboxItem) {
  qc.setQueriesData<ListData>({ queryKey: inboxKeys.lists }, (old) =>
    old && { ...old, pages: old.pages.map((p) => ({ ...p, items: p.items.map((i) => (i.id === id ? patch(i) : i)) })) },
  )
  qc.setQueryData<InboxDetail>(inboxKeys.detail(id), (old) => old && { ...old, ...patch(old) })
}

/** Marks every cached item read (read-all). Items that were already read keep their original time. */
export function patchAllRead(qc: QueryClient, at: Date) {
  qc.setQueriesData<ListData>({ queryKey: inboxKeys.lists }, (old) =>
    old && {
      ...old,
      pages: old.pages.map((p) => ({ ...p, items: p.items.map((i) => (i.readAt ? i : { ...i, readAt: at })) })),
    },
  )
  qc.setQueriesData<InboxDetail>({ queryKey: inboxKeys.details }, (old) => old && (old.readAt ? old : { ...old, readAt: at }))
}

/** Whether the cached copy of `id` (detail first, then any list) is still unread. `undefined` when it is not cached. */
export function cachedUnread(qc: QueryClient, id: string): boolean | undefined {
  const detail = qc.getQueryData<InboxDetail>(inboxKeys.detail(id))
  if (detail) return !detail.readAt
  for (const [, data] of qc.getQueriesData<ListData>({ queryKey: inboxKeys.lists })) {
    for (const page of data?.pages ?? []) {
      const found = page.items.find((i) => i.id === id)
      if (found) return !found.readAt
    }
  }
  return undefined
}

export function setUnreadCount(qc: QueryClient, count: number) {
  qc.setQueryData<number>(inboxKeys.unread, Math.max(0, count))
}

export function decrementUnread(qc: QueryClient) {
  qc.setQueryData<number>(inboxKeys.unread, (old) => (old === undefined ? old : Math.max(0, old - 1)))
}
