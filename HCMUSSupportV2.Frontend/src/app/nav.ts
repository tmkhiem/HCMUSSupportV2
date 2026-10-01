import AdminPanelSettingsOutlined from '@mui/icons-material/AdminPanelSettingsOutlined'
import BadgeOutlined from '@mui/icons-material/BadgeOutlined'
import EditNotificationsOutlined from '@mui/icons-material/EditNotificationsOutlined'
import LightbulbOutlined from '@mui/icons-material/LightbulbOutlined'
import NotificationsOutlined from '@mui/icons-material/NotificationsOutlined'
import SchoolOutlined from '@mui/icons-material/SchoolOutlined'
import ScienceOutlined from '@mui/icons-material/ScienceOutlined'
import type { SvgIconProps } from '@mui/material/SvgIcon'
import type { ComponentType } from 'react'
import { hasRole } from '../auth/types'
import type { Me, Role } from '../auth/types'

export interface NavEntry {
  id: string
  label: string
  icon: ComponentType<SvgIconProps>
  /** Link target. */
  to: string
  /** Route prefix that keeps this entry highlighted (defaults to `to`). */
  match?: string
  /** Hidden from people without this role (admins always see it). Pages still need `RequireRole`. */
  role?: Role
  /** Key into `useNavBadges()` for a count badge. */
  badge?: 'unread'
}

/**
 * The sidebar, in order. One line per entry: add a page by adding a line here and a route in `routes.tsx`.
 * Labels render in the uppercase section-label style, so write them in normal case.
 */
export const NAV: readonly NavEntry[] = [
  { id: 'news', label: 'Tin tức', icon: NotificationsOutlined, to: '/tin-tuc', badge: 'unread' },
  { id: 'profile', label: 'Hồ sơ cá nhân', icon: BadgeOutlined, to: '/ho-so' },
  { id: 'innovation', label: 'Sáng kiến', icon: LightbulbOutlined, to: '/sang-kien' },
  { id: 'teaching', label: 'Giảng dạy', icon: SchoolOutlined, to: '/giang-day' },
  { id: 'research', label: 'Nghiên cứu khoa học', icon: ScienceOutlined, to: '/nckh/de-tai', match: '/nckh' },
  { id: 'manage', label: 'Quản lý thông báo', icon: EditNotificationsOutlined, to: '/quan-ly/thong-bao', match: '/quan-ly', role: 'editor' },
  { id: 'admin', label: 'Quản trị', icon: AdminPanelSettingsOutlined, to: '/quan-tri', role: 'admin' },
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
