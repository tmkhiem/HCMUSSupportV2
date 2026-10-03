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
  { id: 'news', label: 'Tin tức', icon: 'bell', to: '/tin-tuc' },
  { id: 'profile', label: 'Hồ sơ cá nhân', icon: 'profile-card', to: '/ho-so' },
  { id: 'innovation', label: 'Sáng kiến', icon: 'light-bulb', to: '/sang-kien' },
  { id: 'teaching', label: 'Giảng dạy', icon: 'graduation-hat', to: '/giang-day' },
  { id: 'research', label: 'Nghiên cứu khoa học', icon: 'test-tube', to: '/nckh/de-tai', match: '/nckh' },
  { id: 'staff', label: 'Nhân sự & email', icon: 'person-alt', to: '/quan-ly/nhan-su', role: 'editor' },
  { id: 'manage', label: 'Quản lý thông báo', icon: 'document', to: '/quan-ly/thong-bao', match: '/quan-ly', role: 'editor' },
  { id: 'admin', label: 'Quản trị', icon: 'briefcase', to: '/quan-tri', role: 'admin' },
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
