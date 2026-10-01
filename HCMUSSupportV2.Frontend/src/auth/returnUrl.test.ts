import { describe, expect, it } from 'vitest'
import { safeReturnUrl } from './returnUrl'

describe('safeReturnUrl', () => {
  it('keeps same-origin app paths, including query and hash', () => {
    expect(safeReturnUrl('/tin-tuc/abc?x=1#top')).toBe('/tin-tuc/abc?x=1#top')
  })

  it('falls back for missing, relative or foreign targets', () => {
    expect(safeReturnUrl(null)).toBe('/')
    expect(safeReturnUrl('')).toBe('/')
    expect(safeReturnUrl('tin-tuc')).toBe('/')
    expect(safeReturnUrl('https://evil.example')).toBe('/')
    expect(safeReturnUrl('//evil.example')).toBe('/')
    expect(safeReturnUrl('/\\evil.example')).toBe('/')
  })

  it('never returns to the login page itself', () => {
    expect(safeReturnUrl('/dang-nhap?returnUrl=%2F')).toBe('/')
  })
})
