import type {
  AddressDto,
  CommendationEntryDto,
  CommendationGroupDto,
  CommendationsDto,
  DetailedProfileDto,
  GeneralProfileDto,
  MaskedFieldDto,
  MembershipDto,
  PartialDateDto,
  PositionEntryDto,
  PositionsDto,
  ProfileOverviewDto,
  SalaryCurrentDto,
  SalaryDto,
  SalaryEntryDto,
} from '../../api/generated-client'
import type { PartialDate } from '../../lib/partialDate'
import type { Address, DetailedProfile, GeneralProfile, MaskedField, Membership, ProfileOverview, SensitiveField } from './api'
import type { CommendationEntry, CommendationGroup, Commendations, PositionEntry, Positions, Salary, SalaryCurrent, SalaryEntry } from './careerApi'

/*
 * The generated `MeClient` DTOs are all-optional classes whose dates are `Date`s. The Hồ sơ pages work with the view-model
 * types in `api.ts` / `careerApi.ts` (required fields, `null` for missing, dates as `yyyy-MM-dd` strings), so every
 * response goes through these mappers. They are the only place that knows about the generated shapes.
 */

/**
 * `DateOnly` arrives as `yyyy-MM-dd` and NSwag turns it into `new Date('yyyy-MM-dd')`, which is **UTC midnight**. Read it
 * back with the UTC getters, so the day is right in every time zone (local getters are wrong west of UTC).
 */
export function dayString(d: Date | null | undefined): string | null {
  if (!d || Number.isNaN(d.getTime())) return null
  const pad = (v: number, w = 2) => String(v).padStart(w, '0')
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

const s = (v: string | null | undefined): string | null => v ?? null
const n = (v: number | null | undefined): number | null => v ?? null

export function toPartialDate(d: PartialDateDto | null | undefined): PartialDate {
  return { date: dayString(d?.date), precision: s(d?.precision) }
}

function toAddress(a: AddressDto | undefined): Address {
  return { address: s(a?.address), ward: s(a?.ward), district: s(a?.district), province: s(a?.province) }
}

// ---- D10

export function toOverview(d: ProfileOverviewDto): ProfileOverview {
  return {
    hero: {
      code: d.hero?.code ?? '',
      fullName: d.hero?.fullName ?? '',
      photoUrl: s(d.hero?.photoUrl),
      positionTitle: s(d.hero?.positionTitle),
      unit: s(d.hero?.unit),
      email: s(d.hero?.email),
      phone: s(d.hero?.phone),
    },
    salary: {
      gradeName: s(d.salary?.gradeName),
      step: n(d.salary?.step),
      coefficient: n(d.salary?.coefficient),
      nextRaiseOn: dayString(d.salary?.nextRaiseOn),
    },
    positions: { currentTitle: s(d.positions?.currentTitle), count: d.positions?.count ?? 0 },
    commendations: { awards: d.commendations?.awards ?? 0, titles: d.commendations?.titles ?? 0 },
    degrees: {
      count: d.degrees?.count ?? 0,
      latestDegreeType: s(d.degrees?.latestDegreeType),
      latestMajor: s(d.degrees?.latestMajor),
    },
    trainingCount: d.trainingCount ?? 0,
    businessTripCount: d.businessTripCount ?? 0,
    innovationCount: d.innovationCount ?? 0,
    hasProfile: d.hasProfile ?? false,
  }
}

export function toGeneral(d: GeneralProfileDto): GeneralProfile {
  return {
    code: d.code ?? '',
    fullName: d.fullName ?? '',
    lastName: s(d.lastName),
    firstName: s(d.firstName),
    dateOfBirth: toPartialDate(d.dateOfBirth),
    gender: s(d.gender),
    ethnicity: s(d.ethnicity),
    religion: s(d.religion),
    nationality: s(d.nationality),
    birthPlace: s(d.birthPlace),
    hometown: s(d.hometown),
    phoneMobile: s(d.phoneMobile),
    phoneHome: s(d.phoneHome),
    personalEmail: s(d.personalEmail),
    emails: d.emails ?? [],
    permanentAddress: toAddress(d.permanentAddress),
    contactAddress: toAddress(d.contactAddress),
  }
}

const toMembership = (m: MembershipDto | undefined): Membership => ({
  isMember: m?.isMember ?? false,
  joinedOn: dayString(m?.joinedOn),
  fileNo: s(m?.fileNo),
  cardNo: s(m?.cardNo),
})

const toMasked = (field: SensitiveField, m: MaskedFieldDto | undefined): MaskedField => ({
  field: (m?.field as SensitiveField | undefined) ?? field,
  masked: s(m?.masked),
  hasValue: m?.hasValue ?? false,
})

export function toDetailed(d: DetailedProfileDto): DetailedProfile {
  return {
    unit: s(d.unit),
    department: s(d.department),
    positionTitle: s(d.positionTitle),
    salaryGradeCode: s(d.salaryGradeCode),
    salaryGradeName: s(d.salaryGradeName),
    salaryStep: n(d.salaryStep),
    salaryCoefficient: n(d.salaryCoefficient),
    overGradePct: n(d.overGradePct),
    academicRank: s(d.academicRank),
    degree: s(d.degree),
    educationLevel: s(d.educationLevel),
    major: s(d.major),
    politicalTheory: s(d.politicalTheory),
    party: toMembership(d.party),
    youthUnion: toMembership(d.youthUnion),
    tradeUnion: toMembership(d.tradeUnion),
    nationalId: toMasked('national_id', d.nationalId),
    nationalIdIssuedOn: dayString(d.nationalIdIssuedOn),
    nationalIdIssuedBy: s(d.nationalIdIssuedBy),
    taxCode: toMasked('tax_code', d.taxCode),
    bankName: s(d.bankName),
    bankBranch: s(d.bankBranch),
    bankAccount: toMasked('bank_account', d.bankAccount),
    socialInsuranceNo: toMasked('social_insurance_no', d.socialInsuranceNo),
    healthInsuranceNo: toMasked('health_insurance_no', d.healthInsuranceNo),
  }
}

// ---- D11

function toSalaryEntry(e: SalaryEntryDto): SalaryEntry {
  return {
    id: e.id ?? 0,
    gradeCode: s(e.gradeCode),
    gradeName: s(e.gradeName),
    step: n(e.step),
    coefficient: n(e.coefficient),
    overGradePct: n(e.overGradePct),
    decisionNo: s(e.decisionNo),
    signedOn: dayString(e.signedOn),
    effectiveFrom: dayString(e.effectiveFrom),
    nextRaiseOn: dayString(e.nextRaiseOn),
    note: s(e.note),
  }
}

function toSalaryCurrent(c: SalaryCurrentDto | undefined): SalaryCurrent | null {
  if (!c) return null
  return {
    gradeCode: s(c.gradeCode),
    gradeName: s(c.gradeName),
    step: n(c.step),
    coefficient: n(c.coefficient),
    overGradePct: n(c.overGradePct),
    effectiveFrom: dayString(c.effectiveFrom),
    nextRaiseOn: dayString(c.nextRaiseOn),
    monthsToNextRaise: n(c.monthsToNextRaise),
  }
}

export function toSalary(d: SalaryDto): Salary {
  return { current: toSalaryCurrent(d.current), history: (d.history ?? []).map(toSalaryEntry) }
}

function toPositionEntry(e: PositionEntryDto): PositionEntry {
  return {
    id: e.id ?? 0,
    title: e.title ?? '',
    unitDescription: s(e.unitDescription),
    coefficient: n(e.coefficient),
    appointedOn: dayString(e.appointedOn),
    decisionNo: s(e.decisionNo),
    signedOn: dayString(e.signedOn),
    endedOn: dayString(e.endedOn),
    isCurrent: e.isCurrent ?? false,
    tenureYears: n(e.tenureYears),
    tenureMonths: n(e.tenureMonths),
  }
}

export function toPositions(d: PositionsDto): Positions {
  return { current: d.current ? toPositionEntry(d.current) : null, items: (d.items ?? []).map(toPositionEntry) }
}

const toCommendationEntry = (e: CommendationEntryDto): CommendationEntry => ({
  id: e.id ?? 0,
  name: e.name ?? '',
  decisionNo: s(e.decisionNo),
  decidedOn: toPartialDate(e.decidedOn),
})

const toGroup = (g: CommendationGroupDto): CommendationGroup => ({
  academicYear: s(g.academicYear),
  items: (g.items ?? []).map(toCommendationEntry),
})

export function toCommendations(d: CommendationsDto): Commendations {
  return {
    awardCount: d.awardCount ?? 0,
    titleCount: d.titleCount ?? 0,
    awards: (d.awards ?? []).map(toGroup),
    titles: (d.titles ?? []).map(toGroup),
  }
}
