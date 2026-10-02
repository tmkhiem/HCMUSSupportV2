import { describe, expect, it } from 'vitest'
import { parseCodes } from './memberCodes'

describe('parseCodes', () => {
  it('splits on commas, semicolons, spaces and new lines and drops duplicates', () => {
    expect(parseCodes('T0001, T0002;T0003\nT0001  T0004\r\n')).toEqual(['T0001', 'T0002', 'T0003', 'T0004'])
  })
  it('returns nothing for blank input', () => {
    expect(parseCodes('  \n ,; ')).toEqual([])
  })
})
