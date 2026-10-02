import { describe, expect, it } from 'vitest'
import {
  CommendationsDto,
  DetailedProfileDto,
  GeneralProfileDto,
  PartialDateDto,
  PositionsDto,
  ProfileOverviewDto,
  SalaryDto,
} from '../../api/generated-client'
import { formatPartialDate } from '../../lib/partialDate'
import { dayString, toCommendations, toDetailed, toGeneral, toOverview, toPositions, toPartialDate, toSalary } from './meMappers'

/** The wire format of `MeController` (camelCase, `DateOnly` as `yyyy-MM-dd`), run through the generated `fromJS` like a real response. */

describe('dayString', () => {
  it('reads the UTC day NSwag produced for a DateOnly, in any time zone', () => {
    expect(dayString(new Date('2026-01-05'))).toBe('2026-01-05')
    expect(dayString(new Date(Date.UTC(2026, 11, 31)))).toBe('2026-12-31')
  })
  it('is null for missing or invalid dates', () => {
    expect(dayString(undefined)).toBeNull()
    expect(dayString(null)).toBeNull()
    expect(dayString(new Date('nope'))).toBeNull()
  })
})

describe('toPartialDate', () => {
  it('keeps the precision and the day, and formats like the old hand-written type did', () => {
    const p = toPartialDate(PartialDateDto.fromJS({ date: '1985-03-01', precision: 'month' }))
    expect(p).toEqual({ date: '1985-03-01', precision: 'month' })
    expect(formatPartialDate(p)).toBe('03/1985')
    expect(toPartialDate(undefined)).toEqual({ date: null, precision: null })
  })
})

describe('overview', () => {
  it('maps a full response and defaults a sparse one', () => {
    const full = toOverview(
      ProfileOverviewDto.fromJS({
        hero: { code: 'T0001', fullName: 'Nguyễn Thử Nghiệm', positionTitle: 'Giảng viên', unit: 'Khoa CNTT', email: 'a@example.test' },
        salary: { gradeName: 'Giảng viên chính', step: 3, coefficient: 4.65, nextRaiseOn: '2027-03-01' },
        positions: { currentTitle: 'Trưởng bộ môn', count: 2 },
        commendations: { awards: 4, titles: 1 },
        degrees: { count: 2, latestDegreeType: 'Tiến sĩ', latestMajor: 'Khoa học máy tính' },
        trainingCount: 5,
        businessTripCount: 1,
        innovationCount: 0,
        hasProfile: true,
      }),
    )
    expect(full.hero).toMatchObject({ code: 'T0001', photoUrl: null, phone: null, email: 'a@example.test' })
    expect(full.salary).toEqual({ gradeName: 'Giảng viên chính', step: 3, coefficient: 4.65, nextRaiseOn: '2027-03-01' })
    expect(full.positions).toEqual({ currentTitle: 'Trưởng bộ môn', count: 2 })
    expect(full.hasProfile).toBe(true)

    const sparse = toOverview(ProfileOverviewDto.fromJS({ hasProfile: false }))
    expect(sparse.hero.fullName).toBe('')
    expect(sparse.salary.nextRaiseOn).toBeNull()
    expect(sparse.trainingCount).toBe(0)
    expect(sparse.hasProfile).toBe(false)
  })
})

describe('general', () => {
  it('maps dates, addresses and emails', () => {
    const g = toGeneral(
      GeneralProfileDto.fromJS({
        code: 'T0001',
        fullName: 'Nguyễn Thử Nghiệm',
        dateOfBirth: { date: '1985-03-07', precision: 'day' },
        emails: ['a@example.test'],
        permanentAddress: { address: '1 Đường A', province: 'TP.HCM' },
        contactAddress: {},
      }),
    )
    expect(g.dateOfBirth).toEqual({ date: '1985-03-07', precision: 'day' })
    expect(g.emails).toEqual(['a@example.test'])
    expect(g.permanentAddress).toEqual({ address: '1 Đường A', ward: null, district: null, province: 'TP.HCM' })
    expect(g.contactAddress).toEqual({ address: null, ward: null, district: null, province: null })
    expect(g.phoneMobile).toBeNull()
  })
})

describe('detailed', () => {
  it('keeps only the masked tail, memberships and dates', () => {
    const d = toDetailed(
      DetailedProfileDto.fromJS({
        unit: 'Khoa CNTT',
        party: { isMember: true, joinedOn: '2010-05-19', cardNo: '123' },
        nationalId: { field: 'national_id', masked: '•••• 1234', hasValue: true },
        nationalIdIssuedOn: '2021-02-03',
        bankAccount: { field: 'bank_account', hasValue: false },
      }),
    )
    expect(d.party).toEqual({ isMember: true, joinedOn: '2010-05-19', fileNo: null, cardNo: '123' })
    expect(d.youthUnion).toEqual({ isMember: false, joinedOn: null, fileNo: null, cardNo: null })
    expect(d.nationalId).toEqual({ field: 'national_id', masked: '•••• 1234', hasValue: true })
    expect(d.nationalIdIssuedOn).toBe('2021-02-03')
    expect(d.bankAccount).toEqual({ field: 'bank_account', masked: null, hasValue: false })
    // A missing masked field still carries its own name, which `useReveal` posts back.
    expect(d.taxCode.field).toBe('tax_code')
  })
})

describe('salary, positions, commendations', () => {
  it('maps salary history and current', () => {
    const s = toSalary(
      SalaryDto.fromJS({
        current: { gradeName: 'Giảng viên', step: 4, coefficient: 3.99, effectiveFrom: '2024-01-01', nextRaiseOn: '2027-01-01', monthsToNextRaise: 3 },
        history: [{ id: 9, step: 4, coefficient: 3.99, decisionNo: '12/QĐ', signedOn: '2023-12-20', effectiveFrom: '2024-01-01' }],
      }),
    )
    expect(s.current).toMatchObject({ step: 4, effectiveFrom: '2024-01-01', nextRaiseOn: '2027-01-01', monthsToNextRaise: 3, gradeCode: null })
    expect(s.history[0]).toMatchObject({ id: 9, decisionNo: '12/QĐ', signedOn: '2023-12-20', nextRaiseOn: null, note: null })
    expect(toSalary(SalaryDto.fromJS({ history: [] })).current).toBeNull()
  })

  it('maps positions with tenure', () => {
    const p = toPositions(
      PositionsDto.fromJS({
        current: { id: 1, title: 'Trưởng khoa', isCurrent: true, appointedOn: '2022-09-01', tenureYears: 4, tenureMonths: 1 },
        items: [{ id: 1, title: 'Trưởng khoa', isCurrent: true, appointedOn: '2022-09-01' }, { id: 2, title: 'Phó khoa', endedOn: '2022-08-31' }],
      }),
    )
    expect(p.current).toMatchObject({ title: 'Trưởng khoa', isCurrent: true, tenureYears: 4, tenureMonths: 1, endedOn: null })
    expect(p.items.map((i) => i.isCurrent)).toEqual([true, false])
    expect(p.items[1].endedOn).toBe('2022-08-31')
  })

  it('maps commendation groups with partial dates', () => {
    const c = toCommendations(
      CommendationsDto.fromJS({
        awardCount: 2,
        titleCount: 0,
        awards: [
          { academicYear: '2023-2024', items: [{ id: 1, name: 'Giấy khen', decidedOn: { date: '2024-06-01', precision: 'year' } }] },
          { items: [{ id: 2, name: 'Bằng khen' }] },
        ],
        titles: [],
      }),
    )
    expect(c.awards[0].academicYear).toBe('2023-2024')
    expect(formatPartialDate(c.awards[0].items[0].decidedOn)).toBe('2024')
    expect(c.awards[1].academicYear).toBeNull()
    expect(c.awards[1].items[0].decidedOn).toEqual({ date: null, precision: null })
    expect(c.titles).toEqual([])
  })
})
