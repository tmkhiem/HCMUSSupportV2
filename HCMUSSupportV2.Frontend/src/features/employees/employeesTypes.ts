/** Nhân sự & email (D14c): view types. The generated DTOs have every field optional; `employeesApi.ts` maps them to these. */

export type EmployeeStatus = 'active' | 'inactive' | 'retired'

export interface ManagedEmail {
  email: string
  isPrimary: boolean
  note: string | null
  /** MSCB of the editor who added the mapping; null for seeded rows. */
  addedBy: string | null
  addedAt: Date | null
  /** The address is the HRM personal email of a different employee. */
  hrmConflict: boolean
}

export interface ManagedEmployee {
  code: string
  fullName: string
  status: string
  source: string
  unitId: number | null
  unit: string | null
  positionTitle: string | null
  /** Primary first. */
  emails: ManagedEmail[]
  hasHrmConflict: boolean
}

export interface EmployeePage {
  items: ManagedEmployee[]
  nextCursor: string | null
  total: number
}

export interface EmployeeFilters {
  q: string
  /** '' = every status. */
  status: '' | EmployeeStatus
  /** Only people without any mapped email. */
  noEmail: boolean
  /** Only people with an email that conflicts with HRM. */
  flagged: boolean
}

export const EMPTY_FILTERS: EmployeeFilters = { q: '', status: '', noEmail: false, flagged: false }

export interface AddEmailInput {
  email: string
  isPrimary: boolean
  note: string
}

// ---- import report

export interface ImportedEmailItem {
  row: number
  code: string
  fullName: string | null
  email: string
  isPrimary: boolean
}

export interface ImportConflict {
  row: number
  code: string
  email: string
  reason: string
  message: string
  ownerCode: string | null
  ownerName: string | null
}

export interface ImportUnknownCode {
  row: number
  code: string
  emails: string[]
}

export interface ImportInvalid {
  row: number
  code: string
  email: string | null
  reason: string
  message: string
}

export interface ImportWarning {
  row: number
  code: string
  reason: string
  message: string
}

export interface ImportReport {
  dryRun: boolean
  removeMissing: boolean
  rows: number
  employees: number
  skippedEmptyRows: number
  addedCount: number
  unchangedCount: number
  removedCount: number
  conflictCount: number
  unknownCount: number
  invalidCount: number
  added: ImportedEmailItem[]
  removed: ImportedEmailItem[]
  conflicts: ImportConflict[]
  unknown: ImportUnknownCode[]
  invalid: ImportInvalid[]
  warnings: ImportWarning[]
  truncated: boolean
}
