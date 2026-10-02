import type { Teaching } from './teachingApi'

/**
 * Synthetic Giảng dạy for `VITE_MOCK_AUTH` (MSCB T0001). Dynamically imported behind the dev-only mock switch, so it never
 * ships in a production build. `?scenario=empty|error` on the URL exercises the other page states.
 */

const scenario = () => new URLSearchParams(window.location.search).get('scenario')
const delay = () => new Promise((r) => setTimeout(r, 120))

const YEARS = ['2024-2025', '2023-2024', '2022-2023']

const BY_YEAR: Record<string, Teaching> = {
  '2024-2025': {
    academicYear: '2024-2025',
    stats: { totalStandardHours: 331.5, classes: 5, courses: 4 },
    terms: [
      {
        term: 1,
        items: [
          { id: 11, courseCode: 'CSC10004', courseName: 'Cấu trúc dữ liệu và giải thuật', classCode: '23CLC1', level: 'Đại học', periods: 60, standardHours: 72 },
          { id: 12, courseCode: 'CSC10004', courseName: 'Cấu trúc dữ liệu và giải thuật', classCode: '23CLC2', level: 'Đại học', periods: 60, standardHours: 72 },
          { id: 13, courseCode: 'CSC13002', courseName: 'Nhập môn công nghệ phần mềm', classCode: '22KTPM1', level: 'Đại học', periods: 45, standardHours: 54 },
        ],
      },
      {
        term: 2,
        items: [
          { id: 14, courseCode: 'CSC12101', courseName: 'Cơ sở dữ liệu nâng cao', classCode: '24CH1', level: 'Cao học', periods: 45, standardHours: 67.5 },
          { id: 15, courseCode: 'CSC10006', courseName: 'Cơ sở dữ liệu', classCode: '23HTTT1', level: 'Đại học', periods: 60, standardHours: 66 },
        ],
      },
    ],
    sourceCaption: 'Phòng Đào tạo (dữ liệu thử nghiệm)',
    sourceUpdatedAt: '2026-09-28T03:00:00Z',
  },
  '2023-2024': {
    academicYear: '2023-2024',
    stats: { totalStandardHours: 264, classes: 4, courses: 3 },
    terms: [
      {
        term: 1,
        items: [
          { id: 21, courseCode: 'CSC10004', courseName: 'Cấu trúc dữ liệu và giải thuật', classCode: '22CLC1', level: 'Đại học', periods: 60, standardHours: 72 },
          { id: 22, courseCode: 'CSC13002', courseName: 'Nhập môn công nghệ phần mềm', classCode: '21KTPM1', level: 'Đại học', periods: 45, standardHours: 54 },
        ],
      },
      {
        term: 2,
        items: [
          { id: 23, courseCode: 'CSC10006', courseName: 'Cơ sở dữ liệu', classCode: '22HTTT1', level: 'Đại học', periods: 60, standardHours: 66 },
          { id: 24, courseCode: 'CSC10006', courseName: 'Cơ sở dữ liệu', classCode: '22HTTT2', level: 'Đại học', periods: 60, standardHours: 72 },
        ],
      },
    ],
    sourceCaption: 'Phòng Đào tạo (dữ liệu thử nghiệm)',
    sourceUpdatedAt: '2025-09-30T03:00:00Z',
  },
  '2022-2023': {
    academicYear: '2022-2023',
    stats: { totalStandardHours: 126, classes: 2, courses: 2 },
    terms: [
      {
        term: 2,
        items: [
          { id: 31, courseCode: 'CSC10004', courseName: 'Cấu trúc dữ liệu và giải thuật', classCode: '21CLC1', level: 'Đại học', periods: 60, standardHours: 72 },
          { id: 32, courseCode: null, courseName: 'Hướng dẫn thực tập tốt nghiệp', classCode: null, level: null, periods: 30, standardHours: 54 },
        ],
      },
    ],
    sourceCaption: null,
    sourceUpdatedAt: null,
  },
}

export async function loadMockYears(): Promise<string[]> {
  await delay()
  const s = scenario()
  if (s === 'error') throw new Error('mock error')
  return s === 'empty' ? [] : YEARS
}

export async function loadMockTeaching(year: string): Promise<Teaching> {
  await delay()
  if (scenario() === 'error-year') throw new Error('mock error')
  return BY_YEAR[year] ?? { academicYear: year, stats: { totalStandardHours: 0, classes: 0, courses: 0 }, terms: [], sourceCaption: null, sourceUpdatedAt: null }
}
