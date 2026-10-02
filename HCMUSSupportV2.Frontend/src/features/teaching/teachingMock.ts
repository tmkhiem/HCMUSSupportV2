import type { Teaching, TeachingEntry, TeachingModule, TeachingProgram, TeachingStats, TeachingTerm } from './teachingApi'

/**
 * Synthetic Giảng dạy for `VITE_MOCK_AUTH` (MSCB T0001). Dynamically imported behind the dev-only mock switch, so it never
 * ships in a production build. `?scenario=empty|error` on the URL exercises the other page states. 2024-2025 has all three
 * programs, 2023-2024 Đại học and Cao học, 2022-2023 only Đại học.
 */

const scenario = () => new URLSearchParams(window.location.search).get('scenario')
const delay = () => new Promise((r) => setTimeout(r, 120))

const YEARS = ['2024-2025', '2023-2024', '2022-2023']

type Line = Partial<TeachingEntry> & Pick<TeachingEntry, 'id' | 'courseName' | 'periods' | 'standardHours'>

const entry = (l: Line): TeachingEntry => ({
  courseCode: null, classCode: null, track: null, activity: null, module: null, ...l,
})

function statsOf(items: TeachingEntry[]): TeachingStats {
  return {
    totalStandardHours: items.reduce((s, i) => s + i.standardHours, 0),
    classes: new Set(items.map((i) => i.classCode ?? i.courseCode ?? i.courseName)).size,
    courses: new Set(items.map((i) => i.courseCode ?? i.courseName)).size,
  }
}

function daiHoc(terms: Record<number, Line[]>): TeachingProgram {
  const t: TeachingTerm[] = Object.entries(terms).map(([term, lines]) => ({ term: Number(term), items: lines.map(entry) }))
  return { program: 'dai_hoc', stats: statsOf(t.flatMap((x) => x.items)), terms: t, modules: [] }
}

function postgrad(program: 'cao_hoc' | 'tien_si', groups: [string | null, Line[]][]): TeachingProgram {
  const modules: TeachingModule[] = groups.map(([module, lines]) => ({ module, items: lines.map((l) => entry({ ...l, module })) }))
  return { program, stats: statsOf(modules.flatMap((m) => m.items)), terms: [], modules }
}

function teaching(year: string, programs: TeachingProgram[], caption: string | null, updated: string | null): Teaching {
  return {
    academicYear: year,
    stats: statsOf(programs.flatMap((p) => [...p.terms.flatMap((t) => t.items), ...p.modules.flatMap((m) => m.items)])),
    programs,
    sourceCaption: caption,
    sourceUpdatedAt: updated,
  }
}

const CSDL_NC = { courseCode: 'CSC12101', courseName: 'Cơ sở dữ liệu nâng cao' }

const BY_YEAR: Record<string, Teaching> = {
  '2024-2025': teaching(
    '2024-2025',
    [
      daiHoc({
        1: [
          { id: 11, courseCode: 'CSC10004', courseName: 'Cấu trúc dữ liệu và giải thuật', classCode: '23CLC1', track: 'CLC', activity: 'LYTHUYET', periods: 60, standardHours: 72 },
          { id: 12, courseCode: 'CSC10004', courseName: 'Cấu trúc dữ liệu và giải thuật', classCode: '23CLC2', track: 'CLC', activity: 'THUCHANH', periods: 60, standardHours: 72 },
          { id: 13, courseCode: 'CSC13002', courseName: 'Nhập môn công nghệ phần mềm', classCode: '22KTPM1', track: 'CQ', activity: 'LYTHUYET', periods: 45, standardHours: 54 },
        ],
        2: [
          { id: 15, courseCode: 'CSC10006', courseName: 'Cơ sở dữ liệu', classCode: '23HTTT1', track: 'CQ', activity: 'LYTHUYET', periods: 60, standardHours: 66 },
          { id: 16, courseCode: 'CSC10006', courseName: 'Cơ sở dữ liệu', classCode: '23HTTT1', track: 'CQ', activity: 'TROGIANG', periods: 30, standardHours: 15 },
        ],
      }),
      postgrad('cao_hoc', [
        ['Học phần 3', [
          { id: 14, ...CSDL_NC, classCode: '24CH1', track: 'CH', activity: 'LYTHUYET', periods: 45, standardHours: 67.5 },
          { id: 17, ...CSDL_NC, classCode: '24CH1', track: 'CH', activity: 'BAITAP', periods: 15, standardHours: 22.5 },
        ]],
        ['Hệ thống thông tin', [
          { id: 18, courseCode: 'CSC12105', courseName: 'Khai phá dữ liệu', classCode: '24CH2', track: 'CH', activity: 'LYTHUYET', periods: 45, standardHours: 67.5 },
        ]],
        [null, [
          { id: 19, courseName: 'Hướng dẫn luận văn thạc sĩ', periods: 0, standardHours: 30, activity: 'KHOALUANTN' },
        ]],
      ]),
      postgrad('tien_si', [
        ['CĐTS', [{ id: 20, courseName: 'Chuyên đề tiến sĩ: học máy nâng cao', classCode: 'NCS24', activity: 'SEMINARTN', periods: 30, standardHours: 45 }]],
        ['HPTS', [{ id: 21, courseCode: 'CSC90001', courseName: 'Phương pháp nghiên cứu khoa học', classCode: 'NCS24', activity: 'LYTHUYET', periods: 30, standardHours: 45 }]],
      ]),
    ],
    'Phòng Đào tạo (dữ liệu thử nghiệm)',
    '2026-09-28T03:00:00Z',
  ),
  '2023-2024': teaching(
    '2023-2024',
    [
      daiHoc({
        1: [
          { id: 21, courseCode: 'CSC10004', courseName: 'Cấu trúc dữ liệu và giải thuật', classCode: '22CLC1', track: 'CLC', activity: 'LYTHUYET', periods: 60, standardHours: 72 },
          { id: 22, courseCode: 'CSC13002', courseName: 'Nhập môn công nghệ phần mềm', classCode: '21KTPM1', track: 'CQ', activity: 'LYTHUYET', periods: 45, standardHours: 54 },
        ],
        2: [
          { id: 23, courseCode: 'CSC10006', courseName: 'Cơ sở dữ liệu', classCode: '22HTTT1', track: 'CQ', activity: 'LYTHUYET', periods: 60, standardHours: 66 },
          { id: 24, courseCode: 'CSC10006', courseName: 'Cơ sở dữ liệu', classCode: '22HTTT2', track: 'CQ', activity: 'LYTHUYET', periods: 60, standardHours: 72 },
        ],
      }),
      postgrad('cao_hoc', [['Học phần 2', [{ id: 25, courseCode: 'CSC12101', courseName: 'Cơ sở dữ liệu nâng cao', classCode: '23CH1', track: 'CH', activity: 'LYTHUYET', periods: 45, standardHours: 67.5 }]]]),
    ],
    'Phòng Đào tạo (dữ liệu thử nghiệm)',
    '2025-09-30T03:00:00Z',
  ),
  '2022-2023': teaching(
    '2022-2023',
    [
      daiHoc({
        2: [
          { id: 31, courseCode: 'CSC10004', courseName: 'Cấu trúc dữ liệu và giải thuật', classCode: '21CLC1', track: 'CLC', activity: 'LYTHUYET', periods: 60, standardHours: 72 },
          { id: 32, courseName: 'Hướng dẫn thực tập tốt nghiệp', periods: 30, standardHours: 54 },
        ],
      }),
    ],
    null,
    null,
  ),
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
  return BY_YEAR[year] ?? teaching(year, [], null, null)
}
