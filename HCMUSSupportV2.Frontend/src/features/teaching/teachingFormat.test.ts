import { describe, expect, it } from 'vitest'
import { formatHours, orderedTerms, pickYear, sourceCaption, termLabel, termSummary } from './teachingFormat'

const item = (id: number, standardHours: number) => ({
  id, courseCode: null, courseName: 'M', classCode: null, level: null, periods: 45, standardHours,
})

describe('teaching format', () => {
  it('formats hours with a decimal comma and no trailing zeros', () => {
    expect(formatHours(145.5)).toBe('145,5')
    expect(formatHours(120)).toBe('120')
    expect(formatHours(1234.25)).toBe('1.234,25')
    expect(formatHours(null)).toBe('—')
    expect(formatHours(Number.NaN)).toBe('—')
  })

  it('labels and summarises terms', () => {
    expect(termLabel(2)).toBe('Học kỳ 2')
    expect(termSummary({ term: 1, items: [item(1, 72), item(2, 73.5)] })).toBe('2 lớp · 145,5 giờ quy đổi')
  })

  it('orders terms ascending and drops empty ones', () => {
    const terms = [{ term: 2, items: [item(1, 1)] }, { term: 3, items: [] }, { term: 1, items: [item(2, 1)] }]
    expect(orderedTerms(terms).map((t) => t.term)).toEqual([1, 2])
  })

  it('builds the source caption from what is known', () => {
    expect(sourceCaption({ sourceCaption: 'Phòng Đào tạo', sourceUpdatedAt: '2026-09-28T03:00:00Z' })).toBe(
      'Nguồn: Phòng Đào tạo, cập nhật 28/09/2026',
    )
    expect(sourceCaption({ sourceCaption: 'Phòng Đào tạo', sourceUpdatedAt: null })).toBe('Nguồn: Phòng Đào tạo')
    expect(sourceCaption({ sourceCaption: ' ', sourceUpdatedAt: '2026-09-28T03:00:00Z' })).toBe('cập nhật 28/09/2026')
    expect(sourceCaption({ sourceCaption: null, sourceUpdatedAt: null })).toBeNull()
  })

  it('defaults to the newest year', () => {
    expect(pickYear(['2024-2025', '2023-2024'], null)).toBe('2024-2025')
    expect(pickYear(['2024-2025', '2023-2024'], '2023-2024')).toBe('2023-2024')
    expect(pickYear(['2024-2025'], '1999-2000')).toBe('2024-2025')
    expect(pickYear([], null)).toBeNull()
  })
})
