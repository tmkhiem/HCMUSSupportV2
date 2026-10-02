import { describe, expect, it } from 'vitest'
import { formatPartialDate } from './partialDate'

describe('formatPartialDate', () => {
  it('formats by precision', () => {
    expect(formatPartialDate({ date: '1985-03-07', precision: 'day' })).toBe('07/03/1985')
    expect(formatPartialDate({ date: '1985-03-01', precision: 'month' })).toBe('03/1985')
    expect(formatPartialDate({ date: '1985-01-01', precision: 'year' })).toBe('1985')
  })
  it('is case-insensitive and treats unknown precision as day', () => {
    expect(formatPartialDate({ date: '1985-03-01', precision: 'Month' })).toBe('03/1985')
    expect(formatPartialDate({ date: '1985-03-07', precision: 'whatever' })).toBe('07/03/1985')
    expect(formatPartialDate({ date: '1985-03-07' })).toBe('07/03/1985')
  })
  it('gives a dash when missing or unparseable', () => {
    expect(formatPartialDate(null)).toBe('—')
    expect(formatPartialDate(undefined)).toBe('—')
    expect(formatPartialDate({ date: null, precision: 'day' })).toBe('—')
    expect(formatPartialDate({ date: 'not a date', precision: 'year' })).toBe('—')
  })
})
