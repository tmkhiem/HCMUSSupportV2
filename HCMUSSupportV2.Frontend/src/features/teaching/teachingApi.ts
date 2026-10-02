import { useQuery } from '@tanstack/react-query'
import { http } from '../../api/http'
import { MOCK_AUTH } from '../../auth/useMe'

/*
 * Giảng dạy (D13). Hand-written against `HCMUSSupportV2.Backend/Modules/Hrm/Me/MeDtos.cs` (`TeachingDto`; camelCase on the
 * wire). Teaching is grouped by program (Đại học, Cao học, Tiến sĩ); only Đại học has học kỳ, the postgraduate programs
 * group by học phần / chuyên đề. `GET /api/me/teaching/years` gives the năm học list (newest first),
 * `GET /api/me/teaching?year=` one year (the latest when `year` is omitted). Under `VITE_MOCK_AUTH` the hooks return
 * `teachingMock.ts`, no network call.
 */

export type TeachingProgramId = 'dai_hoc' | 'cao_hoc' | 'tien_si'

export interface TeachingEntry {
  id: number
  courseCode: string | null
  courseName: string
  classCode: string | null
  /** Hệ / loại chương trình (CQ, CLC, ...). */
  track: string | null
  /** Loại hoạt động, a v1-style code (LYTHUYET, THUCHANH, ...). */
  activity: string | null
  periods: number
  standardHours: number
  /** Học phần / chuyên đề (postgraduate only). */
  module: string | null
}

export interface TeachingTerm {
  term: number
  items: TeachingEntry[]
}

/** A học phần / chuyên đề group; `module` null = no module recorded. */
export interface TeachingModule {
  module: string | null
  items: TeachingEntry[]
}

export interface TeachingStats {
  totalStandardHours: number
  classes: number
  courses: number
}

/** `terms` is filled for `dai_hoc` only, `modules` for `cao_hoc` and `tien_si` only. */
export interface TeachingProgram {
  program: TeachingProgramId
  stats: TeachingStats
  terms: TeachingTerm[]
  modules: TeachingModule[]
}

export interface Teaching {
  academicYear: string | null
  /** Overall totals across programs. */
  stats: TeachingStats
  programs: TeachingProgram[]
  sourceCaption: string | null
  /** ISO instant. */
  sourceUpdatedAt: string | null
}

const mock = () => import('./teachingMock')

export function useTeachingYears() {
  return useQuery({
    queryKey: ['me', 'teaching', 'years'],
    queryFn: async () =>
      MOCK_AUTH ? (await mock()).loadMockYears() : http.get<string[]>('/api/me/teaching/years'),
  })
}

/** Waits for a year (the page picks the newest one from the years list). */
export function useTeaching(year: string | null) {
  return useQuery({
    queryKey: ['me', 'teaching', year],
    enabled: year !== null,
    queryFn: async () =>
      MOCK_AUTH
        ? (await mock()).loadMockTeaching(year!)
        : http.get<Teaching>(`/api/me/teaching?year=${encodeURIComponent(year!)}`),
  })
}
