import { useUnreadCount } from '../features/notifications/inbox/inboxQueries'
import type { NavEntry } from './nav'

export type NavBadges = Partial<Record<NonNullable<NavEntry['badge']>, number>>

/**
 * Counts shown on nav entries: the unread notification count (`GET /api/notifications/unread-count`, refreshed on route
 * changes, window focus and after read/ack/read-all). Absent until the first answer, so no badge flashes in.
 */
export function useNavBadges(): NavBadges {
  const { data } = useUnreadCount()
  return data === undefined ? {} : { unread: data }
}
