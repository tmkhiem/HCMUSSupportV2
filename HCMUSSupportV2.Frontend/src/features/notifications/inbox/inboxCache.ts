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
}

type ListData = InfiniteData<InboxPage, string | undefined>

/** Applies `patch` to the item `id` in every cached inbox list (all filters) and in its cached detail. */
export function patchInboxItem(qc: QueryClient, id: string, patch: (item: InboxItem) => InboxItem) {
  qc.setQueriesData<ListData>({ queryKey: inboxKeys.lists }, (old) =>
    old && { ...old, pages: old.pages.map((p) => ({ ...p, items: p.items.map((i) => (i.id === id ? patch(i) : i)) })) },
  )
  qc.setQueryData<InboxDetail>(inboxKeys.detail(id), (old) => old && { ...old, ...patch(old) })
}
