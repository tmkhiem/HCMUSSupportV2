import { useMutation, useQuery } from '@tanstack/react-query'
import { meClient } from '../../api/clients'
import { RevealRequest } from '../../api/generated-client'
import { MOCK_AUTH } from '../../auth/useMe'
import type { PartialDate } from '../../lib/partialDate'
import { toDetailed, toGeneral, toOverview } from './meMappers'

/*
 * Hồ sơ cá nhân: the three reads of D10 and the audited reveal. The view-model types below are what the pages use;
 * responses come from the generated `meClient` and are mapped by `meMappers.ts` (dates as `yyyy-MM-dd` strings, `null` for
 * missing). Under `VITE_MOCK_AUTH` in dev the hooks return synthetic data (`mockData.ts`), no network; production builds drop it.
 */

// ---- Overview

export interface ProfileHero {
  code: string
  fullName: string
  photoUrl: string | null
  positionTitle: string | null
  unit: string | null
  email: string | null
  phone: string | null
}

export interface ProfileOverview {
  hero: ProfileHero
  salary: { gradeName: string | null; step: number | null; coefficient: number | null; nextRaiseOn: string | null }
  positions: { currentTitle: string | null; count: number }
  commendations: { awards: number; titles: number }
  degrees: { count: number; latestDegreeType: string | null; latestMajor: string | null }
  trainingCount: number
  businessTripCount: number
  innovationCount: number
  hasProfile: boolean
}

// ---- Thông tin chung

export interface Address {
  address: string | null
  ward: string | null
  district: string | null
  province: string | null
}

export interface GeneralProfile {
  code: string
  fullName: string
  lastName: string | null
  firstName: string | null
  dateOfBirth: PartialDate
  gender: string | null
  ethnicity: string | null
  religion: string | null
  nationality: string | null
  birthPlace: string | null
  hometown: string | null
  phoneMobile: string | null
  phoneHome: string | null
  personalEmail: string | null
  emails: string[]
  permanentAddress: Address
  contactAddress: Address
}

// ---- Thông tin chi tiết

export type SensitiveField = 'national_id' | 'tax_code' | 'bank_account' | 'social_insurance_no' | 'health_insurance_no'

export interface MaskedField {
  field: SensitiveField
  masked: string | null
  hasValue: boolean
}

export interface Membership {
  isMember: boolean
  joinedOn: string | null
  fileNo: string | null
  cardNo: string | null
}

export interface DetailedProfile {
  unit: string | null
  department: string | null
  positionTitle: string | null
  salaryGradeCode: string | null
  salaryGradeName: string | null
  salaryStep: number | null
  salaryCoefficient: number | null
  overGradePct: number | null
  academicRank: string | null
  degree: string | null
  educationLevel: string | null
  major: string | null
  politicalTheory: string | null
  party: Membership
  youthUnion: Membership
  tradeUnion: Membership
  nationalId: MaskedField
  nationalIdIssuedOn: string | null
  nationalIdIssuedBy: string | null
  taxCode: MaskedField
  bankName: string | null
  bankBranch: string | null
  bankAccount: MaskedField
  socialInsuranceNo: MaskedField
  healthInsuranceNo: MaskedField
}

export const profileKeys = {
  overview: ['profile', 'overview'] as const,
  general: ['profile', 'general'] as const,
  detailed: ['profile', 'detailed'] as const,
}

const mock = () => import('./mockData')
// `import.meta.env.DEV && MOCK_AUTH` is written out at every use (like the inbox): the bundler folds it to `false`
// and drops the dynamic import, so the synthetic data never ships in a production build.

export function useProfileOverview() {
  return useQuery({
    queryKey: profileKeys.overview,
    queryFn: async () => (import.meta.env.DEV && MOCK_AUTH ? (await mock()).mockOverview : toOverview(await meClient.overview())),
    retry: false,
  })
}

export function useGeneralProfile() {
  return useQuery({
    queryKey: profileKeys.general,
    queryFn: async () => (import.meta.env.DEV && MOCK_AUTH ? (await mock()).mockGeneral : toGeneral(await meClient.general())),
    retry: false,
  })
}

export function useDetailedProfile() {
  return useQuery({
    queryKey: profileKeys.detailed,
    queryFn: async () => (import.meta.env.DEV && MOCK_AUTH ? (await mock()).mockDetailed : toDetailed(await meClient.detailed())),
    retry: false,
  })
}

/** `POST /api/me/profile/sensitive/reveal`: the backend audits first, and refuses with 403 during view-as. */
export async function revealSensitive(field: SensitiveField): Promise<string> {
  if (import.meta.env.DEV && MOCK_AUTH) return (await mock()).mockReveal(field)
  const res = await meClient.reveal(new RevealRequest({ field }))
  return res.value ?? ''
}

export function useRevealSensitive() {
  return useMutation({ mutationFn: revealSensitive })
}
