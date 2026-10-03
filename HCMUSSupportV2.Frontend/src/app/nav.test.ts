import { describe, expect, it } from 'vitest'
import { NAV, activeNavIndex, visibleNav } from './nav'

describe('visibleNav', () => {
  it('hides editor and admin entries from plain employees', () => {
    expect(visibleNav({ roles: [] }).map((e) => e.id)).toEqual(['news', 'profile', 'innovation', 'teaching', 'research'])
  })

  it('shows the manage entry to editors but not the admin one', () => {
    const ids = visibleNav({ roles: ['editor'] }).map((e) => e.id)
    expect(ids).toContain('manage')
    expect(ids).not.toContain('admin')
  })

  it('shows everything to admins, even without an explicit editor role', () => {
    expect(visibleNav({ roles: ['admin'] })).toHaveLength(NAV.length)
  })

  it('shows only unrestricted entries when signed out', () => {
    expect(visibleNav(null).every((e) => !e.role)).toBe(true)
  })
})

describe('activeNavIndex', () => {
  const entries = visibleNav({ roles: ['admin'] })
  const idOf = (path: string) => entries[activeNavIndex(entries, path)]?.id

  it('matches exact routes and nested ones', () => {
    expect(idOf('/news')).toBe('news')
    expect(idOf('/news/0190f3a2')).toBe('news')
    expect(idOf('/profile/salary')).toBe('profile')
  })

  it('uses the match prefix for multi-route entries', () => {
    expect(idOf('/research/publications')).toBe('research')
    expect(idOf('/manage/groups/3')).toBe('manage')
    expect(idOf('/manage/employees')).toBe('staff')
    expect(idOf('/admin/audit')).toBe('admin')
  })

  it('does not match on a shared string prefix', () => {
    expect(idOf('/news-other')).toBeUndefined()
  })

  it('is -1 for unknown paths', () => {
    expect(activeNavIndex(entries, '/khong-co')).toBe(-1)
  })
})
