import { describe, expect, it } from 'vitest'
import {
  DASH,
  dayKey,
  formatBytes,
  formatDate,
  formatDateTime,
  formatDecimal,
  formatMoney,
  formatNumber,
  isBlank,
  joinParts,
  orDash,
  parseDate,
} from './format'

describe('orDash / isBlank', () => {
  it('shows an em dash for missing values', () => {
    expect(orDash(null)).toBe(DASH)
    expect(orDash(undefined)).toBe(DASH)
    expect(orDash('')).toBe(DASH)
    expect(orDash('   ')).toBe(DASH)
  })

  it('keeps real values, including 0', () => {
    expect(orDash('Khoa Toán')).toBe('Khoa Toán')
    expect(orDash(0)).toBe('0')
    expect(isBlank(0)).toBe(false)
  })
})

describe('joinParts', () => {
  it('joins present parts with a middle dot', () => {
    expect(joinParts(['Giảng viên', 'Khoa Vật lý'])).toBe('Giảng viên · Khoa Vật lý')
  })

  it('skips missing parts and falls back to a dash when nothing is left', () => {
    expect(joinParts(['T0001', null, undefined, '', false, 'Khoa Hóa'])).toBe('T0001 · Khoa Hóa')
    expect(joinParts([null, ''])).toBe(DASH)
  })

  it('supports a custom separator', () => {
    expect(joinParts(['a', 'b'], ' / ')).toBe('a / b')
  })
})

describe('formatMoney', () => {
  it('uses vi-VN grouping and the đ suffix', () => {
    expect(formatMoney(12000000)).toBe('12.000.000 đ')
    expect(formatMoney('1500000')).toBe('1.500.000 đ')
    expect(formatMoney(0)).toBe('0 đ')
  })

  it('rounds to whole units', () => {
    expect(formatMoney(1234.6)).toBe('1.235 đ')
  })

  it('returns a dash for missing or non-numeric input', () => {
    expect(formatMoney(null)).toBe(DASH)
    expect(formatMoney('')).toBe(DASH)
    expect(formatMoney('abc')).toBe(DASH)
    expect(formatMoney(Number.NaN)).toBe(DASH)
  })
})

describe('formatDecimal / formatNumber', () => {
  it('formats a coefficient with a decimal comma', () => {
    expect(formatDecimal(3.5)).toBe('3,50')
    expect(formatDecimal('2.34')).toBe('2,34')
    expect(formatDecimal(null)).toBe(DASH)
  })

  it('groups whole numbers', () => {
    expect(formatNumber(1234567)).toBe('1.234.567')
  })
})

describe('parseDate', () => {
  it('reads ISO dates as a local calendar day', () => {
    const d = parseDate('2024-03-05')
    expect(d?.getFullYear()).toBe(2024)
    expect(d?.getMonth()).toBe(2)
    expect(d?.getDate()).toBe(5)
  })

  it('reads ISO timestamps', () => {
    expect(parseDate('2024-03-05T10:15:00')?.getHours()).toBe(10)
  })

  it('reads dd/MM/yyyy, with or without zero padding', () => {
    expect(formatDate(parseDate('05/03/2024'))).toBe('05/03/2024')
    expect(formatDate(parseDate('5/3/2024'))).toBe('05/03/2024')
  })

  it('falls back to the Date constructor', () => {
    expect(parseDate('March 5, 2024')?.getFullYear()).toBe(2024)
  })

  it('rejects impossible and unparseable input', () => {
    expect(parseDate('31/02/2024')).toBeNull()
    expect(parseDate('2024-13-01')).toBeNull()
    expect(parseDate('hôm qua')).toBeNull()
    expect(parseDate('')).toBeNull()
    expect(parseDate(null)).toBeNull()
    expect(parseDate(new Date('nope'))).toBeNull()
  })

  it('passes Date objects through', () => {
    const d = new Date(2020, 0, 31)
    expect(parseDate(d)).toBe(d)
  })
})

describe('formatDate', () => {
  it('formats dd/MM/yyyy', () => {
    expect(formatDate('2024-03-05')).toBe('05/03/2024')
    expect(formatDate(new Date(1999, 11, 31))).toBe('31/12/1999')
  })

  it('honours month and year precision', () => {
    expect(formatDate('2024-03-01', 'month')).toBe('03/2024')
    expect(formatDate('2024-01-01', 'year')).toBe('2024')
  })

  it('shows a dash when the date is unusable', () => {
    expect(formatDate(undefined)).toBe(DASH)
    expect(formatDate('not a date')).toBe(DASH)
  })
})

describe('dayKey', () => {
  it('builds the key from local time', () => {
    expect(dayKey(new Date(2024, 0, 2, 23, 30))).toBe('2024-01-02')
    expect(dayKey('02/01/2024')).toBe('2024-01-02')
    expect(dayKey('xx')).toBeNull()
  })
})

describe('formatDateTime', () => {
  it('formats dd/MM/yyyy HH:mm in local time', () => {
    expect(formatDateTime(new Date(2026, 8, 5, 7, 3))).toBe('05/09/2026 07:03')
    expect(formatDateTime('nope')).toBe(DASH)
  })
})

describe('formatBytes', () => {
  it('scales to KB, MB and GB with a decimal comma', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1,5 KB')
    expect(formatBytes(2 * 1024 * 1024)).toBe('2,0 MB')
    expect(formatBytes(3 * 1024 ** 3)).toBe('3,0 GB')
  })
  it('shows a dash for missing values', () => {
    expect(formatBytes(null)).toBe(DASH)
    expect(formatBytes(-1)).toBe(DASH)
  })
})
