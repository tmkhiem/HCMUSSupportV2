import { describe, expect, it } from 'vitest'
import {
  EMPTY_FILTERS,
  countActiveFilters,
  hasActiveFilters,
  parseFilters,
  sameFilters,
  serializeFilters,
  toInboxQuery,
  toggleTag,
} from './inboxFilters'

const parse = (qs: string) => parseFilters(new URLSearchParams(qs))

describe('parseFilters', () => {
  it('reads every filter from the query string', () => {
    expect(parse('q=l%C6%B0%C6%A1ng&tags=3,1&from=2026-01-05&to=2026-06-30')).toEqual({
      q: 'lương',
      tags: [1, 3],
      from: '2026-01-05',
      to: '2026-06-30',
    })
  })

  it('gives the empty filters for an empty query', () => {
    expect(parse('')).toEqual(EMPTY_FILTERS)
    expect(hasActiveFilters(parse(''))).toBe(false)
  })

  it('drops malformed values instead of throwing', () => {
    const f = parse('tags=1,abc,-2,0,1.5,7,7&from=2026-02-31&to=31/12/2026')
    expect(f.tags).toEqual([1, 7])
    expect(f.from).toBe('') // 31 February does not exist
    expect(f.to).toBe('') // not yyyy-MM-dd
  })

  it('trims the search text and swaps a reversed date range', () => {
    const f = parse('q=%20%20abc%20&from=2026-09-01&to=2026-01-01')
    expect(f.q).toBe('abc')
    expect(f.from).toBe('2026-01-01')
    expect(f.to).toBe('2026-09-01')
  })

  it('ignores the retired unread parameter', () => {
    expect(parse('unread=1')).toEqual(EMPTY_FILTERS)
  })
})

describe('serializeFilters', () => {
  it('writes only active filters', () => {
    expect(serializeFilters(EMPTY_FILTERS).toString()).toBe('')
    expect(serializeFilters({ ...EMPTY_FILTERS, tags: [2, 1] }).toString()).toBe('tags=1%2C2')
  })

  it('round-trips through parseFilters', () => {
    const filters = { q: 'thâm niên', tags: [2, 5], from: '2026-03-01', to: '2026-03-31' }
    expect(parseFilters(serializeFilters(filters))).toEqual(filters)
  })

  it('keeps unrelated parameters and replaces the filter ones', () => {
    const base = new URLSearchParams('q=old&tags=9&keep=me')
    const next = serializeFilters({ ...EMPTY_FILTERS, q: 'new' }, base)
    expect(next.get('keep')).toBe('me')
    expect(next.get('q')).toBe('new')
    expect(next.has('tags')).toBe(false)
  })
})

describe('toInboxQuery', () => {
  it('sends nothing for the empty filters', () => {
    expect(toInboxQuery(EMPTY_FILTERS)).toEqual({})
  })

  it('turns the day range into start-of-day and end-of-day instants (the server treats `to` as inclusive)', () => {
    const q = toInboxQuery({ ...EMPTY_FILTERS, from: '2026-03-01', to: '2026-03-31', tags: [4], q: ' x ' })
    expect(q.from).toEqual(new Date(2026, 2, 1, 0, 0, 0, 0))
    expect(q.to).toEqual(new Date(2026, 2, 31, 23, 59, 59, 999))
    expect(q.tags).toEqual([4])
    expect(q.q).toBe('x')
  })
})

describe('toggleTag', () => {
  it('adds and removes, keeping the list sorted and unique', () => {
    expect(toggleTag([3], 1)).toEqual([1, 3])
    expect(toggleTag([1, 3], 3)).toEqual([1])
    expect(toggleTag([], 2)).toEqual([2])
  })
})

describe('countActiveFilters / sameFilters', () => {
  it('counts the search, the tag group, each date', () => {
    expect(countActiveFilters({ q: 'a', tags: [1, 2], from: '2026-01-01', to: '' })).toBe(3)
  })

  it('compares filters by value', () => {
    expect(sameFilters({ ...EMPTY_FILTERS, tags: [1, 2] }, { ...EMPTY_FILTERS, tags: [1, 2] })).toBe(true)
    expect(sameFilters({ ...EMPTY_FILTERS, q: 'a ' }, { ...EMPTY_FILTERS, q: 'a' })).toBe(true)
    expect(sameFilters({ ...EMPTY_FILTERS, tags: [1] }, { ...EMPTY_FILTERS, tags: [2] })).toBe(false)
    expect(sameFilters(EMPTY_FILTERS, { ...EMPTY_FILTERS, from: '2026-01-01' })).toBe(false)
  })
})
