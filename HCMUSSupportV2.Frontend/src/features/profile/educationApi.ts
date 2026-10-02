import { useQuery } from '@tanstack/react-query'
import { http } from '../../api/http'
import { MOCK_AUTH } from '../../auth/useMe'
import type { PartialDate as LibPartialDate } from '../../lib/partialDate'

/*
 * Hồ sơ: Quá trình đào tạo, Bồi dưỡng, Đi công tác (D12). Hand-written like `careerApi.ts` against
 * `HCMUSSupportV2.Backend/Modules/Hrm/Me/MeDtos.cs` (camelCase, `DateOnly` as `yyyy-MM-dd`). Under `VITE_MOCK_AUTH` the hooks
 * return synthetic data from `educationMock.ts`, no network.
 */

/** A date whose day or month may be unknown (`PartialDateDto`); same shape as the commendation dates. */
export type PartialDate = LibPartialDate

export interface DegreeEntry {
  id: number
  degreeType: string | null
  major: string | null
  institution: string | null
  country: string | null
  trainingForm: string | null
  enrolledOn: PartialDate
  graduatedOn: PartialDate
  thesisTitle: string | null
}

export interface TrainingEntry {
  id: number
  content: string
  place: string | null
  trainingForm: string | null
  startOn: PartialDate
  endOn: PartialDate
  year: number | null
}

export interface BusinessTripEntry {
  id: number
  fromOn: string | null
  toOn: string | null
  days: number | null
  place: string | null
  purpose: string | null
  transport: string | null
  decisionNo: string | null
  decidedOn: string | null
  note: string | null
}

export interface BusinessTrips {
  stats: { tripCount: number; totalDays: number }
  /** Years that have trips. */
  years: number[]
  items: BusinessTripEntry[]
}

const mock = () => import('./educationMock')

export function useDegrees() {
  return useQuery({
    queryKey: ['me', 'degrees'],
    queryFn: async () => (MOCK_AUTH ? (await mock()).loadMockDegrees() : http.get<DegreeEntry[]>('/api/me/degrees')),
  })
}

export function useTrainings() {
  return useQuery({
    queryKey: ['me', 'trainings'],
    queryFn: async () => (MOCK_AUTH ? (await mock()).loadMockTrainings() : http.get<TrainingEntry[]>('/api/me/trainings')),
  })
}

export function useBusinessTrips() {
  return useQuery({
    queryKey: ['me', 'business-trips'],
    queryFn: async () =>
      MOCK_AUTH ? (await mock()).loadMockBusinessTrips() : http.get<BusinessTrips>('/api/me/business-trips'),
  })
}
