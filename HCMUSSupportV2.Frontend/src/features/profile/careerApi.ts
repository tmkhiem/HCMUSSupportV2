import { useQuery } from '@tanstack/react-query'
import { meClient } from '../../api/clients'
import { MOCK_AUTH } from '../../auth/useMe'
import type { PartialDate } from '../../lib/partialDate'
import { toCommendations, toPositions, toSalary } from './meMappers'

/*
 * Hồ sơ: Quá trình lương, Chức vụ, Khen thưởng (D11). The view-model types below are what the pages use; responses come
 * from the generated `meClient` and are mapped by `meMappers.ts` (dates as `yyyy-MM-dd` strings, `null` for missing).
 * Under `VITE_MOCK_AUTH` in dev the hooks return synthetic data (`careerMock.ts`), no network; production builds drop it.
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

export interface CommendationEntry {
  id: number
  name: string
  decisionNo: string | null
  decidedOn: PartialDate
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
// `import.meta.env.DEV && MOCK_AUTH` is written out at every use (like the inbox): the bundler folds it to `false`
// and drops the dynamic import, so the synthetic data never ships in a production build.

export function useSalary() {
  return useQuery({
    queryKey: ['me', 'salary'],
    queryFn: async () => (import.meta.env.DEV && MOCK_AUTH ? (await mock()).loadMockSalary() : toSalary(await meClient.salary())),
  })
}

export function usePositions() {
  return useQuery({
    queryKey: ['me', 'positions'],
    queryFn: async () => (import.meta.env.DEV && MOCK_AUTH ? (await mock()).loadMockPositions() : toPositions(await meClient.positions())),
  })
}

export function useCommendations() {
  return useQuery({
    queryKey: ['me', 'commendations'],
    queryFn: async () => (import.meta.env.DEV && MOCK_AUTH ? (await mock()).loadMockCommendations() : toCommendations(await meClient.commendations())),
  })
}
