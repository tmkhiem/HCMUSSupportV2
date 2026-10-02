import { useQuery } from '@tanstack/react-query'
import { http } from '../../api/http'
import { MOCK_AUTH } from '../../auth/useMe'

/*
 * Giảng dạy (D13). Hand-written against `HCMUSSupportV2.Backend/Modules/Hrm/Me/MeDtos.cs` (`TeachingDto`; camelCase on the
 * wire). `GET /api/me/teaching/years` gives the năm học list (newest first), `GET /api/me/teaching?year=` one year (the
 * latest when `year` is omitted). Under `VITE_MOCK_AUTH` the hooks return `teachingMock.ts`, no network call.
 */

export interface TeachingEntry {
  id: number
  courseCode: string | null
  courseName: string
  classCode: string | null
  level: string | null
  periods: number
  standardHours: number
}

export interface TeachingTerm {
  term: number
  items: TeachingEntry[]
}

export interface TeachingStats {
  totalStandardHours: number
  classes: number
  courses: number
}

export interface Teaching {
  academicYear: string | null
  stats: TeachingStats
  terms: TeachingTerm[]
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
