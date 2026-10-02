import { describe, expect, it } from 'vitest'
import type { SalaryEntry } from './careerApi'
import {
  academicYearLabel,
  coefficientPoints,
  formatCommendationDate,
  formatMonthsToRaise,
  formatTenure,
  salaryStepLabel,
} from './careerFormat'

const entry = (over: Partial<SalaryEntry>): SalaryEntry => ({
  id: 1,
  gradeCode: null,
  gradeName: null,
  step: null,
  coefficient: null,
  overGradePct: null,
  decisionNo: null,
  signedOn: null,
  effectiveFrom: null,
  nextRaiseOn: null,
  note: null,
  ...over,
})

describe('formatTenure', () => {
  it('joins years and months', () => expect(formatTenure(3, 2)).toBe('3 năm 2 tháng'))
  it('drops a zero part', () => {
    expect(formatTenure(2, 0)).toBe('2 năm')
    expect(formatTenure(0, 5)).toBe('5 tháng')
  })
  it('says less than a month for 0 and 0', () => expect(formatTenure(0, 0)).toBe('Dưới 1 tháng'))
  it('shows a dash when the backend sent nothing', () => {
    expect(formatTenure(null, null)).toBe('—')
    expect(formatTenure(undefined, undefined)).toBe('—')
  })
  it('treats one missing part as zero and clamps negatives', () => {
    expect(formatTenure(4, null)).toBe('4 năm')
    expect(formatTenure(-1, 3)).toBe('3 tháng')
  })
})

describe('formatMonthsToRaise', () => {
  it('counts down', () => expect(formatMonthsToRaise(5)).toBe('còn 5 tháng'))
  it('handles this month, overdue and unknown', () => {
    expect(formatMonthsToRaise(0)).toBe('trong tháng này')
    expect(formatMonthsToRaise(-2)).toBe('quá hạn 2 tháng')
    expect(formatMonthsToRaise(null)).toBe('—')
  })
})

describe('formatCommendationDate', () => {
  it('honours precision', () => {
    expect(formatCommendationDate({ date: '2024-09-20', precision: 'day' })).toBe('20/09/2024')
    expect(formatCommendationDate({ date: '2022-07-01', precision: 'month' })).toBe('07/2022')
    expect(formatCommendationDate({ date: '2020-01-01', precision: 'year' })).toBe('2020')
  })
  it('shows a dash without a date', () => {
    expect(formatCommendationDate({ date: null, precision: 'year' })).toBe('—')
    expect(formatCommendationDate(undefined)).toBe('—')
  })
})

describe('academicYearLabel', () => {
  it('labels a year and the null group', () => {
    expect(academicYearLabel('2023-2024')).toBe('Năm học 2023-2024')
    expect(academicYearLabel(null)).toBe('Chưa rõ năm học')
    expect(academicYearLabel('  ')).toBe('Chưa rõ năm học')
  })
})

describe('salaryStepLabel', () => {
  it('shows bậc and hệ số with a decimal comma', () => {
    expect(salaryStepLabel({ step: 4, coefficient: 4.65 })).toBe('Bậc 4 · hệ số 4,65')
  })
  it('skips unknown parts', () => {
    expect(salaryStepLabel({ step: 3, coefficient: null })).toBe('Bậc 3')
    expect(salaryStepLabel({ step: null, coefficient: null })).toBe('—')
  })
})

describe('coefficientPoints', () => {
  it('reverses the newest-first history into oldest-first points', () => {
    const pts = coefficientPoints([
      entry({ id: 3, coefficient: 4.4, effectiveFrom: '2019-12-01' }),
      entry({ id: 2, coefficient: 3.99, effectiveFrom: '2016-09-01' }),
      entry({ id: 1, coefficient: 3, effectiveFrom: '2010-02-01' }),
    ])
    expect(pts.map((p) => p.coefficient)).toEqual([3, 3.99, 4.4])
    expect(pts[0].date.getFullYear()).toBe(2010)
  })
  it('skips rows without a date or coefficient', () => {
    const pts = coefficientPoints([
      entry({ id: 3, coefficient: null, effectiveFrom: '2020-01-01' }),
      entry({ id: 2, coefficient: 3.5, effectiveFrom: null }),
      entry({ id: 1, coefficient: 3, effectiveFrom: '2010-02-01' }),
    ])
    expect(pts).toHaveLength(1)
  })
  it('keeps the newest decision when two share an effective day', () => {
    const pts = coefficientPoints([
      entry({ id: 2, coefficient: 4, effectiveFrom: '2020-01-01' }),
      entry({ id: 1, coefficient: 3.5, effectiveFrom: '2020-01-01' }),
    ])
    expect(pts).toHaveLength(1)
    expect(pts[0].coefficient).toBe(4)
  })
  it('is empty for no history', () => expect(coefficientPoints([])).toEqual([]))
})
