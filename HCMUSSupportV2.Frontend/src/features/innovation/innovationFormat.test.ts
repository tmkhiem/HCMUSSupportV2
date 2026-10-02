import { describe, expect, it } from 'vitest'
import { decisionLine, recognitionYear, typeBreakdown, typeLabel } from './innovationFormat'

describe('innovation format', () => {
  it('labels types', () => {
    expect(typeLabel(' Cấp cơ sở ')).toBe('Cấp cơ sở')
    expect(typeLabel(null)).toBe('Chưa phân loại')
    expect(typeLabel('  ')).toBe('Chưa phân loại')
  })

  it('shows the recognition year, falling back to the năm học', () => {
    expect(recognitionYear({ recognizedOn: '2024-03-12', academicYear: '2023-2024' })).toBe('Năm 2024')
    expect(recognitionYear({ recognizedOn: null, academicYear: '2018-2019' })).toBe('Năm học 2018-2019')
    expect(recognitionYear({ recognizedOn: null, academicYear: null })).toBe('—')
  })

  it('joins the decision number and date', () => {
    expect(decisionLine({ decisionNo: '12/QĐ', recognizedOn: '2024-03-12' })).toBe('Số 12/QĐ · 12/03/2024')
    expect(decisionLine({ decisionNo: null, recognizedOn: null })).toBe('—')
  })

  it('orders the type breakdown by count with the unclassified bucket last', () => {
    const rows = typeBreakdown({
      count: 6,
      byType: [
        { type: null, count: 3 },
        { type: 'Cấp trường', count: 1 },
        { type: 'Cấp cơ sở', count: 2 },
      ],
    })
    expect(rows).toEqual([
      { label: 'Cấp cơ sở', count: 2 },
      { label: 'Cấp trường', count: 1 },
      { label: 'Chưa phân loại', count: 3 },
    ])
  })
})
