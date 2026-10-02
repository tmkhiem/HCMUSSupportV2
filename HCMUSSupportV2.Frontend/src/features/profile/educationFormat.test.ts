import { describe, expect, it } from 'vitest'
import type { BusinessTripEntry, DegreeEntry, TrainingEntry } from './educationApi'
import {
  degreePlace,
  degreeYears,
  formatPartial,
  groupTrainingsByYear,
  partialYear,
  sortDegrees,
  trainingPeriod,
  tripPeriod,
  tripStats,
  tripYear,
  yearLabel,
} from './educationFormat'

const none = { date: null, precision: 'year' }
const d = (date: string, precision = 'day') => ({ date, precision })

const degree = (over: Partial<DegreeEntry>): DegreeEntry => ({
  id: 1, degreeType: null, major: null, institution: null, country: null, trainingForm: null,
  enrolledOn: none, graduatedOn: none, thesisTitle: null, ...over,
})
const training = (over: Partial<TrainingEntry>): TrainingEntry => ({
  id: 1, content: 'x', place: null, trainingForm: null, startOn: none, endOn: none, year: null, ...over,
})
const trip = (over: Partial<BusinessTripEntry>): BusinessTripEntry => ({
  id: 1, fromOn: null, toOn: null, days: null, place: null, purpose: null, transport: null,
  decisionNo: null, decidedOn: null, note: null, ...over,
})

describe('formatPartial / partialYear', () => {
  it('honours precision', () => {
    expect(formatPartial(d('2023-03-05'))).toBe('05/03/2023')
    expect(formatPartial(d('2023-03-01', 'month'))).toBe('03/2023')
    expect(formatPartial(d('2023-01-01', 'year'))).toBe('2023')
  })
  it('shows a dash for missing dates', () => {
    expect(formatPartial(none)).toBe('—')
    expect(formatPartial(null)).toBe('—')
    expect(formatPartial(undefined)).toBe('—')
  })
  it('reads the year', () => {
    expect(partialYear(d('2012-12-31'))).toBe(2012)
    expect(partialYear(none)).toBeNull()
    expect(partialYear(null)).toBeNull()
  })
})

describe('degreeYears', () => {
  it('shows a range', () => expect(degreeYears(degree({ enrolledOn: d('2012-09-01', 'year'), graduatedOn: d('2016-06-01', 'year') }))).toBe('2012 – 2016'))
  it('collapses an equal range', () => expect(degreeYears(degree({ enrolledOn: d('2016-01-01'), graduatedOn: d('2016-06-01') }))).toBe('2016'))
  it('handles one end', () => {
    expect(degreeYears(degree({ graduatedOn: d('2016-06-01') }))).toBe('Tốt nghiệp 2016')
    expect(degreeYears(degree({ enrolledOn: d('2012-09-01') }))).toBe('Nhập học 2012')
  })
  it('dashes when unknown', () => expect(degreeYears(degree({}))).toBe('—'))
})

describe('degreePlace', () => {
  it('joins parts', () => expect(degreePlace({ institution: 'ĐH A', country: 'Nhật Bản' })).toBe('ĐH A · Nhật Bản'))
  it('drops a missing part', () => {
    expect(degreePlace({ institution: 'ĐH A', country: null })).toBe('ĐH A')
    expect(degreePlace({ institution: null, country: 'Nhật Bản' })).toBe('Nhật Bản')
  })
})

describe('sortDegrees', () => {
  it('sorts newest first, undated last, without mutating', () => {
    const input = [
      degree({ id: 1, graduatedOn: d('2009-01-01') }),
      degree({ id: 2 }),
      degree({ id: 3, graduatedOn: d('2018-01-01') }),
      degree({ id: 4, enrolledOn: d('2011-01-01') }),
    ]
    expect(sortDegrees(input).map((e) => e.id)).toEqual([3, 4, 1, 2])
    expect(input.map((e) => e.id)).toEqual([1, 2, 3, 4])
  })
  it('keeps API order on ties', () => {
    const input = [degree({ id: 1, graduatedOn: d('2010-01-01') }), degree({ id: 2, graduatedOn: d('2010-05-01') })]
    expect(sortDegrees(input).map((e) => e.id)).toEqual([1, 2])
  })
})

describe('trainingPeriod', () => {
  it('shows a range', () => expect(trainingPeriod(training({ startOn: d('2023-03-01', 'month'), endOn: d('2023-08-01', 'month') }))).toBe('03/2023 – 08/2023'))
  it('shows one date when both match', () => expect(trainingPeriod(training({ startOn: d('2023-11-14'), endOn: d('2023-11-14') }))).toBe('14/11/2023'))
  it('shows the known end', () => {
    expect(trainingPeriod(training({ startOn: d('2023-11-14') }))).toBe('14/11/2023')
    expect(trainingPeriod(training({ endOn: d('2023-11-14') }))).toBe('14/11/2023')
  })
  it('dashes when unknown', () => expect(trainingPeriod(training({}))).toBe('—'))
})

describe('groupTrainingsByYear / yearLabel', () => {
  it('groups newest year first, undated last, keeping row order', () => {
    const groups = groupTrainingsByYear([
      training({ id: 1, year: 2023 }),
      training({ id: 2 }),
      training({ id: 3, year: 2025 }),
      training({ id: 4, startOn: d('2023-02-01') }),
      training({ id: 5, endOn: d('2025-02-01') }),
    ])
    expect(groups.map((g) => g.year)).toEqual([2025, 2023, null])
    expect(groups[0].items.map((e) => e.id)).toEqual([3, 5])
    expect(groups[1].items.map((e) => e.id)).toEqual([1, 4])
  })
  it('is empty for no input', () => expect(groupTrainingsByYear([])).toEqual([]))
  it('labels', () => {
    expect(yearLabel(2025)).toBe('Năm 2025')
    expect(yearLabel(null)).toBe('Chưa rõ năm')
  })
})

describe('trips', () => {
  const items = [
    trip({ id: 1, fromOn: '2025-04-07', toOn: '2025-04-12', days: 6 }),
    trip({ id: 2, fromOn: '2025-12-30', toOn: '2026-01-02', days: 4 }),
    trip({ id: 3, fromOn: '2024-05-06', toOn: '2024-05-06', days: null }),
    trip({ id: 4, toOn: '2022-01-05', days: 2 }),
    trip({ id: 5 }),
  ]
  it('tripYear uses the start, else the end', () => {
    expect(tripYear(items[1])).toBe(2025)
    expect(tripYear(items[3])).toBe(2022)
    expect(tripYear(items[4])).toBeNull()
  })
  it('tripPeriod', () => {
    expect(tripPeriod(items[0])).toBe('07/04/2025 – 12/04/2025')
    expect(tripPeriod(items[2])).toBe('06/05/2024')
    expect(tripPeriod(items[3])).toBe('05/01/2022')
    expect(tripPeriod(items[4])).toBe('—')
  })
  it('tripStats for all years', () => {
    const s = tripStats(items, null)
    expect(s.tripCount).toBe(5)
    expect(s.totalDays).toBe(12)
    expect(s.rows).toHaveLength(5)
  })
  it('tripStats for one year', () => {
    const s = tripStats(items, 2025)
    expect(s.tripCount).toBe(2)
    expect(s.totalDays).toBe(10)
    expect(s.rows.map((t) => t.id)).toEqual([1, 2])
    expect(tripStats(items, 2000)).toMatchObject({ tripCount: 0, totalDays: 0 })
  })
})
