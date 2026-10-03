import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { fetchInboxDetail, fetchInboxPage, fetchTags } from './inboxApi'
import { inboxKeys } from './inboxCache'
import { toInboxQuery } from './inboxFilters'
import type { InboxFilters } from './inboxFilters'

/** Infinite list on the server's keyset cursor (`nextCursor`). The previous result stays on screen while a new filter loads. */
export function useInboxList(filters: InboxFilters) {
  return useInfiniteQuery({
    queryKey: inboxKeys.list(filters),
    queryFn: ({ pageParam }) => fetchInboxPage(toInboxQuery(filters), pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
    // Entering the inbox always shows fresh data (there is no live stream); the cached copy renders meanwhile.
    staleTime: 0,
    refetchOnWindowFocus: true,
  })
}

export function useInboxTags() {
  return useQuery({ queryKey: inboxKeys.tags, queryFn: fetchTags, staleTime: 10 * 60_000 })
}

export function useInboxDetail(id: string | undefined) {
  return useQuery({
    queryKey: inboxKeys.detail(id ?? ''),
    queryFn: () => fetchInboxDetail(id!),
    enabled: Boolean(id),
    retry: false,
  })
}
