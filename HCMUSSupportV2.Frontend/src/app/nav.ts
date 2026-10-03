import { hasRole } from '../auth/types'
import type { Me, Role } from '../auth/types'
import type { PngIconName } from '../ui/PngIcon'

export interface NavEntry {
  id: string
  label: string
  /** A PNG from `public/icons`. */
  icon: PngIconName
  /** Link target. */
  to: string
  /** Route prefix that keeps this entry highlighted (defaults to `to`). */
  match?: string
  /** Hidden from people without this role (admins always see it). Pages still need `RequireRole`. */
  role?: Role
}

/**
 * The sidebar, in order. One line per entry: add a page by adding a line here and a route in `routes.tsx`.
 * Labels render in the section-label style (normal case, bold).
 */
export const NAV: readonly NavEntry[] = [
  { id: 'news', label: 'Tin tức', icon: 'bell', to: '/news' },
  { id: 'profile', label: 'Hồ sơ cá nhân', icon: 'profile-card', to: '/profile' },
  { id: 'innovation', label: 'Sáng kiến', icon: 'light-bulb', to: '/innovations' },
  { id: 'teaching', label: 'Giảng dạy', icon: 'graduation-hat', to: '/teaching' },
  { id: 'research', label: 'Nghiên cứu khoa học', icon: 'test-tube', to: '/research/projects', match: '/research' },
  { id: 'staff', label: 'Nhân sự & email', icon: 'person-alt', to: '/manage/employees', role: 'editor' },
  { id: 'manage', label: 'Quản lý thông báo', icon: 'document', to: '/manage/notifications', match: '/manage', role: 'editor' },
  { id: 'admin', label: 'Quản trị', icon: 'briefcase', to: '/admin', role: 'admin' },
]

export function visibleNav(me: Pick<Me, 'roles'> | null | undefined, entries: readonly NavEntry[] = NAV): NavEntry[] {
  return entries.filter((e) => hasRole(me, e.role))
}

function isUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

/** Index of the entry that owns `pathname`, or -1 (e.g. an unknown URL). */
export function activeNavIndex(entries: readonly NavEntry[], pathname: string): number {
  return entries.findIndex((e) => isUnder(pathname, e.match ?? e.to))
}
