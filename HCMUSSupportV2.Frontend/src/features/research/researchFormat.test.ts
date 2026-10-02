import { describe, expect, it } from 'vitest'
import { coAuthors, doiUrl, fundingLabel, isChair, projectMeta, publicationLink, roleLabel, safeUrl, sortMembers, venueLine } from './researchFormat'

describe('research format', () => {
  it('labels roles', () => {
    expect(roleLabel('chu_nhiem')).toBe('Chủ nhiệm')
    expect(roleLabel('thanh_vien')).toBe('Thành viên')
    expect(roleLabel('something else')).toBe('Thành viên')
    expect(isChair(' Chu_Nhiem ')).toBe(true)
    expect(isChair(null)).toBe(false)
  })

  it('formats funding and the row meta line', () => {
    expect(fundingLabel(25_000_000)).toBe('25.000.000 đ')
    expect(fundingLabel(null)).toBe('—')
    expect(projectMeta({ code: 'T1', periodText: '2024 - 2025', funding: 1000 })).toBe('T1 · 2024 - 2025 · 1.000 đ')
    expect(projectMeta({ code: 'T1', periodText: null, funding: null })).toBe('T1')
  })

  it('puts the chair first, then names alphabetically', () => {
    const members = [
      { employeeCode: 'T3', fullName: 'Lê An', role: 'thanh_vien' },
      { employeeCode: 'T1', fullName: 'Trần Bình', role: 'chu_nhiem' },
      { employeeCode: 'T2', fullName: 'Hồ Cường', role: 'thanh_vien' },
    ]
    expect(sortMembers(members).map((m) => m.employeeCode)).toEqual(['T1', 'T2', 'T3'])
    expect(members[0].employeeCode).toBe('T3')
  })

  it('builds venue lines', () => {
    expect(venueLine({ venue: 'Tạp chí A', year: 2023 })).toBe('Tạp chí A · 2023')
    expect(venueLine({ venue: null, year: 2023 })).toBe('2023')
    expect(venueLine({ venue: null, year: null })).toBe('—')
  })

  it('resolves DOI links and tolerates a stored URL prefix', () => {
    expect(doiUrl('10.1000/x')).toBe('https://doi.org/10.1000/x')
    expect(doiUrl('https://doi.org/10.1000/x')).toBe('https://doi.org/10.1000/x')
    expect(doiUrl('  ')).toBeNull()
    expect(doiUrl(null)).toBeNull()
  })

  it('only links http(s) URLs', () => {
    expect(safeUrl('https://example.test/a')).toBe('https://example.test/a')
    expect(safeUrl('javascript:alert(1)')).toBeNull()
    expect(safeUrl('not a url')).toBeNull()
    expect(publicationLink({ doi: '10.1/x', url: 'https://example.test' })).toBe('https://doi.org/10.1/x')
    expect(publicationLink({ doi: null, url: 'https://example.test' })).toBe('https://example.test/')
    expect(publicationLink({ doi: null, url: 'javascript:x' })).toBeNull()
  })

  it('lists co-authors in order without the signed-in employee', () => {
    const authors = [
      { employeeCode: 'T3', fullName: null, ordinal: 3 },
      { employeeCode: 'T1', fullName: 'Tôi', ordinal: 1 },
      { employeeCode: 'T2', fullName: 'Bạn Hai', ordinal: 2 },
    ]
    expect(coAuthors({ authors }, 'T1')).toEqual(['Bạn Hai', 'T3'])
  })
})
