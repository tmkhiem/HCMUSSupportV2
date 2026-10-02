import { describe, expect, it } from 'vitest'
import type { TeachingEntry, TeachingProgram } from './teachingApi'
import {
  activityLabel,
  formatHours,
  groupSummary,
  moduleLabel,
  orderedModules,
  orderedPrograms,
  orderedTerms,
  pickYear,
  programLabel,
  sourceCaption,
  termLabel,
  termSummary,
} from './teachingFormat'

const item = (id: number, standardHours: number): TeachingEntry => ({
  id, courseCode: null, courseName: 'M', classCode: null, track: null, activity: null, periods: 45, standardHours, module: null,
})

const stats = { totalStandardHours: 0, classes: 0, courses: 0 }
const program = (p: TeachingProgram['program'], terms: TeachingProgram['terms'], modules: TeachingProgram['modules']): TeachingProgram => ({
  program: p, stats, terms, modules,
})

describe('teaching format', () => {
  it('formats hours with a decimal comma and no trailing zeros', () => {
    expect(formatHours(145.5)).toBe('145,5')
    expect(formatHours(120)).toBe('120')
    expect(formatHours(1234.25)).toBe('1.234,25')
    expect(formatHours(null)).toBe('—')
    expect(formatHours(Number.NaN)).toBe('—')
  })

  it('labels and summarises terms and groups', () => {
    expect(termLabel(2)).toBe('Học kỳ 2')
    expect(termSummary({ term: 1, items: [item(1, 72), item(2, 73.5)] })).toBe('2 lớp · 145,5 giờ quy đổi')
    expect(groupSummary([item(1, 10)])).toBe('1 lớp · 10 giờ quy đổi')
  })

  it('orders terms ascending and drops empty ones', () => {
    const terms = [{ term: 2, items: [item(1, 1)] }, { term: 3, items: [] }, { term: 1, items: [item(2, 1)] }]
    expect(orderedTerms(terms).map((t) => t.term)).toEqual([1, 2])
  })

  it('names programs and orders them Đại học, Cao học, Tiến sĩ, dropping empty ones', () => {
    expect(programLabel('dai_hoc')).toBe('Đại học')
    expect(programLabel('cao_hoc')).toBe('Cao học')
    expect(programLabel('tien_si')).toBe('Tiến sĩ')
    const ordered = orderedPrograms([
      program('tien_si', [], [{ module: 'CĐTS', items: [item(1, 1)] }]),
      program('cao_hoc', [], []),
      program('dai_hoc', [{ term: 1, items: [item(2, 1)] }], []),
    ])
    expect(ordered.map((p) => p.program)).toEqual(['dai_hoc', 'tien_si'])
  })

  it('groups postgraduate lines by module with "Chưa rõ học phần" for a missing one, last', () => {
    expect(moduleLabel(null)).toBe('Chưa rõ học phần')
    expect(moduleLabel('  ')).toBe('Chưa rõ học phần')
    expect(moduleLabel(' Học phần 3 ')).toBe('Học phần 3')
    const modules = [
      { module: null, items: [item(1, 1)] },
      { module: 'HPTS', items: [item(2, 1)] },
      { module: 'CĐTS', items: [] },
      { module: 'Học phần 3', items: [item(3, 1)] },
    ]
    expect(orderedModules(modules).map((m) => m.module)).toEqual(['Học phần 3', 'HPTS', null])
  })

  it('shows readable activity names and falls back to the raw code', () => {
    expect(activityLabel('LYTHUYET')).toBe('Lý thuyết')
    expect(activityLabel('seminartn')).toBe('Seminar TN')
    expect(activityLabel('XYZ')).toBe('XYZ')
    expect(activityLabel(null)).toBe('—')
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
