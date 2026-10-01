import type { NavEntry } from './nav'

export type NavBadges = Partial<Record<NonNullable<NavEntry['badge']>, number>>

/**
 * Counts shown on nav entries. D08 (Tin tức UI) replaces the body with the live unread count
 * (`GET /api/notifications/unread-count` + SSE); until then there are no badges.
 */
export function useNavBadges(): NavBadges {
  return {}
}
