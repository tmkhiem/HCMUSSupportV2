import { describe, expect, it } from 'vitest'
import { safeReturnUrl } from './returnUrl'

describe('safeReturnUrl', () => {
  it('keeps same-origin app paths, including query and hash', () => {
    expect(safeReturnUrl('/news/abc?x=1#top')).toBe('/news/abc?x=1#top')
  })

  it('falls back for missing, relative or foreign targets', () => {
    expect(safeReturnUrl(null)).toBe('/')
    expect(safeReturnUrl('')).toBe('/')
    expect(safeReturnUrl('news')).toBe('/')
    expect(safeReturnUrl('https://evil.example')).toBe('/')
    expect(safeReturnUrl('//evil.example')).toBe('/')
    expect(safeReturnUrl('/\\evil.example')).toBe('/')
  })

  it('never returns to the login page itself', () => {
    expect(safeReturnUrl('/login?error=inactive')).toBe('/')
    expect(safeReturnUrl('/login')).toBe('/')
    expect(safeReturnUrl('/login?returnUrl=%2F')).toBe('/')
  })
})
