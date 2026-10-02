import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { fetchInboxDetail, fetchInboxPage, fetchTags, fetchUnreadCount, postAck, postRead, postReadAll } from './inboxApi'
import { cachedUnread, decrementUnread, inboxKeys, patchAllRead, patchInboxItem, setUnreadCount } from './inboxCache'
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

/**
 * The unread badge. There is no live stream: the count is loaded with the app (`GET unread-count`), refetched when the
 * route changes (`useRefreshUnreadOnNavigation`) and when the window regains focus, and written straight into the cache
 * by read, ack and read-all (their answers carry the new count). No polling interval.
 */
export function useUnreadCount() {
  return useQuery({ queryKey: inboxKeys.unread, queryFn: fetchUnreadCount, staleTime: 30_000, refetchOnWindowFocus: true })
}

/** Mounted once in the shell: every route change refreshes the badge (the first render is covered by the query itself). */
export function useRefreshUnreadOnNavigation(pathname: string) {
  const qc = useQueryClient()
  const last = useRef(pathname)
  useEffect(() => {
    if (last.current === pathname) return
    last.current = pathname
    void qc.invalidateQueries({ queryKey: inboxKeys.unread })
  }, [pathname, qc])
}

/** POST read with an optimistic update (row loses its dot, badge drops by one), settled by the server's count. */
export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => postRead(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: inboxKeys.unread })
      const wasUnread = cachedUnread(qc, id) !== false
      if (wasUnread) {
        patchInboxItem(qc, id, (i) => (i.readAt ? i : { ...i, readAt: new Date() }))
        decrementUnread(qc)
      }
    },
    onSuccess: (count) => setUnreadCount(qc, count),
    onError: () => void qc.invalidateQueries({ queryKey: inboxKeys.all }),
  })
}

/** POST ack (also marks read). */
export function useAcknowledge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => postAck(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: inboxKeys.unread })
      const wasUnread = cachedUnread(qc, id) !== false
      const now = new Date()
      patchInboxItem(qc, id, (i) => ({ ...i, ackAt: i.ackAt ?? now, readAt: i.readAt ?? now }))
      if (wasUnread) decrementUnread(qc)
    },
    onSuccess: (count) => setUnreadCount(qc, count),
    onError: () => void qc.invalidateQueries({ queryKey: inboxKeys.all }),
  })
}

/** POST read-all: every cached row goes read, the badge goes to 0. */
export function useReadAll() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: postReadAll,
    onSuccess: (count) => {
      patchAllRead(qc, new Date())
      setUnreadCount(qc, count)
      // Lists filtered to unread must drop the rows.
      void qc.invalidateQueries({ queryKey: inboxKeys.lists })
    },
  })
}
