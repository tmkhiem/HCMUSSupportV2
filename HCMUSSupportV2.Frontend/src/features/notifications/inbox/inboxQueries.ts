import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchInboxDetail, fetchInboxPage, fetchTags, postAck } from './inboxApi'
import { inboxKeys, patchInboxItem } from './inboxCache'
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

/** POST ack, with an optimistic update (the row and the detail show it acknowledged straight away). */
export function useAcknowledge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => postAck(id),
    onMutate: (id) => {
      const now = new Date()
      patchInboxItem(qc, id, (i) => ({ ...i, ackAt: i.ackAt ?? now }))
    },
    onError: () => void qc.invalidateQueries({ queryKey: inboxKeys.all }),
  })
}
