import type { InboxFilters } from './inboxFilters'

export const inboxKeys = {
  all: ['inbox'] as const,
  lists: ['inbox', 'list'] as const,
  list: (filters: InboxFilters) => ['inbox', 'list', filters] as const,
  details: ['inbox', 'detail'] as const,
  detail: (id: string) => ['inbox', 'detail', id] as const,
  tags: ['inbox', 'tags'] as const,
}
