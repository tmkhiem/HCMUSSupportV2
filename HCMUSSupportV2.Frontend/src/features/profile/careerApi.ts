import { useQuery } from '@tanstack/react-query'
import { http } from '../../api/http'
import { MOCK_AUTH } from '../../auth/useMe'

/*
 * Hồ sơ: Quá trình lương, Chức vụ, Khen thưởng (D11). The NSwag client has no Hrm endpoints yet, so these are
 * hand-written against `HCMUSSupportV2.Backend/Modules/Hrm/Me/MeDtos.cs` (camelCase on the wire, `DateOnly` as
 * `yyyy-MM-dd`) through the shared `http` layer. Under `VITE_MOCK_AUTH` they return synthetic data, no network.
 */

// ---- Lương

export interface SalaryEntry {
  id: number
  gradeCode: string | null
  gradeName: string | null
  step: number | null
  coefficient: number | null
  overGradePct: number | null
  decisionNo: string | null
  signedOn: string | null
  effectiveFrom: string | null
  nextRaiseOn: string | null
  note: string | null
}

export interface SalaryCurrent {
  gradeCode: string | null
  gradeName: string | null
  step: number | null
  coefficient: number | null
  overGradePct: number | null
  effectiveFrom: string | null
  nextRaiseOn: string | null
  monthsToNextRaise: number | null
}

/** `history` is newest effective date first. */
export interface Salary {
  current: SalaryCurrent | null
  history: SalaryEntry[]
}

// ---- Chức vụ

export interface PositionEntry {
  id: number
  title: string
  unitDescription: string | null
  coefficient: number | null
  appointedOn: string | null
  decisionNo: string | null
  signedOn: string | null
  endedOn: string | null
  isCurrent: boolean
  tenureYears: number | null
  tenureMonths: number | null
}

export interface Positions {
  current: PositionEntry | null
  items: PositionEntry[]
}

// ---- Khen thưởng

/** A decision date whose day or month may be unknown (`PartialDateDto`). */
export interface CommendationDate {
  date?: string | null
  precision?: string | null
}

export interface CommendationEntry {
  id: number
  name: string
  decisionNo: string | null
  decidedOn: CommendationDate
}

/** `academicYear` is null for entries without one (listed last). */
export interface CommendationGroup {
  academicYear: string | null
  items: CommendationEntry[]
}

export interface Commendations {
  awardCount: number
  titleCount: number
  awards: CommendationGroup[]
  titles: CommendationGroup[]
}

const mock = () => import('./careerMock')

export function useSalary() {
  return useQuery({
    queryKey: ['me', 'salary'],
    queryFn: async () => (MOCK_AUTH ? (await mock()).loadMockSalary() : http.get<Salary>('/api/me/salary')),
  })
}

export function usePositions() {
  return useQuery({
    queryKey: ['me', 'positions'],
    queryFn: async () => (MOCK_AUTH ? (await mock()).loadMockPositions() : http.get<Positions>('/api/me/positions')),
  })
}

export function useCommendations() {
  return useQuery({
    queryKey: ['me', 'commendations'],
    queryFn: async () =>
      MOCK_AUTH ? (await mock()).loadMockCommendations() : http.get<Commendations>('/api/me/commendations'),
  })
}
