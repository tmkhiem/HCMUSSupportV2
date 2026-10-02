import { manageEmployeesClient } from '../../api/clients'
import { MOCK_AUTH } from '../../auth/useMe'
import { AddEmployeeEmailRequest } from '../../api/generated-client'
import type {
  EmailImportReportDto,
  ManagedEmailDto,
  ManagedEmployeeDto,
  ManagedEmployeePageDto,
} from '../../api/generated-client'
import type { AddEmailInput, EmployeeFilters, EmployeePage, ImportReport, ManagedEmail, ManagedEmployee } from './employeesTypes'

/*
 * Nhân sự & email (D14c): `/api/manage/employees` through the generated `ManageEmployeesClient`. Under `VITE_MOCK_AUTH`
 * everything is served by `employeesMock.ts` (dynamic import behind the dev-only constant, so no mock in production).
 */

export const PAGE_SIZE = 50

const mock = () => import('./employeesMock')
const isMock = () => import.meta.env.DEV && MOCK_AUTH

const toEmail = (d: ManagedEmailDto): ManagedEmail => ({
  email: d.email ?? '',
  isPrimary: d.isPrimary ?? false,
  note: d.note ?? null,
  addedBy: d.addedBy ?? null,
  addedAt: d.addedAt ?? null,
  hrmConflict: d.hrmConflict ?? false,
})

export const toEmployee = (d: ManagedEmployeeDto): ManagedEmployee => ({
  code: d.code ?? '',
  fullName: d.fullName ?? '',
  status: d.status ?? 'active',
  source: d.source ?? 'manual',
  unitId: d.unitId ?? null,
  unit: d.unit ?? null,
  positionTitle: d.positionTitle ?? null,
  emails: (d.emails ?? []).map(toEmail),
  hasHrmConflict: d.hasHrmConflict ?? false,
})

const toPage = (d: ManagedEmployeePageDto): EmployeePage => ({
  items: (d.items ?? []).map(toEmployee),
  nextCursor: d.nextCursor ?? null,
  total: d.total ?? 0,
})

export const toReport = (d: EmailImportReportDto): ImportReport => ({
  dryRun: d.dryRun ?? true,
  removeMissing: d.removeMissing ?? false,
  rows: d.rows ?? 0,
  employees: d.employees ?? 0,
  skippedEmptyRows: d.skippedEmptyRows ?? 0,
  addedCount: d.addedCount ?? 0,
  unchangedCount: d.unchangedCount ?? 0,
  removedCount: d.removedCount ?? 0,
  conflictCount: d.conflictCount ?? 0,
  unknownCount: d.unknownCount ?? 0,
  invalidCount: d.invalidCount ?? 0,
  added: (d.added ?? []).map((i) => ({ row: i.row ?? 0, code: i.code ?? '', fullName: i.fullName ?? null, email: i.email ?? '', isPrimary: i.isPrimary ?? false })),
  removed: (d.removed ?? []).map((i) => ({ row: i.row ?? 0, code: i.code ?? '', fullName: i.fullName ?? null, email: i.email ?? '', isPrimary: i.isPrimary ?? false })),
  conflicts: (d.conflicts ?? []).map((c) => ({
    row: c.row ?? 0,
    code: c.code ?? '',
    email: c.email ?? '',
    reason: c.reason ?? '',
    message: c.message ?? '',
    ownerCode: c.ownerCode ?? null,
    ownerName: c.ownerName ?? null,
  })),
  unknown: (d.unknown ?? []).map((u) => ({ row: u.row ?? 0, code: u.code ?? '', emails: u.emails ?? [] })),
  invalid: (d.invalid ?? []).map((i) => ({ row: i.row ?? 0, code: i.code ?? '', email: i.email ?? null, reason: i.reason ?? '', message: i.message ?? '' })),
  warnings: (d.warnings ?? []).map((w) => ({ row: w.row ?? 0, code: w.code ?? '', reason: w.reason ?? '', message: w.message ?? '' })),
  truncated: d.truncated ?? false,
})

export async function fetchEmployees(filters: EmployeeFilters, cursor: string | undefined, limit = PAGE_SIZE): Promise<EmployeePage> {
  if (isMock()) return (await mock()).listMock(filters, cursor, limit)
  return toPage(
    await manageEmployeesClient.list(
      filters.q.trim() || undefined,
      filters.status || undefined,
      filters.noEmail ? false : undefined,
      filters.flagged ? true : undefined,
      undefined,
      cursor,
      limit,
    ),
  )
}

export async function fetchEmployee(code: string): Promise<ManagedEmployee> {
  if (isMock()) return (await mock()).getMock(code)
  return toEmployee(await manageEmployeesClient.get(code))
}

export async function addEmail(code: string, input: AddEmailInput): Promise<ManagedEmployee> {
  if (isMock()) return (await mock()).addMock(code, input)
  return toEmployee(
    await manageEmployeesClient.addEmail(
      code,
      new AddEmployeeEmailRequest({ email: input.email.trim(), isPrimary: input.isPrimary, note: input.note.trim() || undefined }),
    ),
  )
}

export async function removeEmail(code: string, email: string): Promise<ManagedEmployee> {
  if (isMock()) return (await mock()).removeMock(code, email)
  return toEmployee(await manageEmployeesClient.removeEmail(code, email))
}

export async function setPrimaryEmail(code: string, email: string): Promise<ManagedEmployee> {
  if (isMock()) return (await mock()).setPrimaryMock(code, email)
  return toEmployee(await manageEmployeesClient.setPrimary(code, email))
}

/** `dryRun` only reports; the same file with `dryRun=false` applies it. */
export async function importEmails(file: File, dryRun: boolean, removeMissing: boolean): Promise<ImportReport> {
  if (isMock()) return (await mock()).importMock(file, dryRun, removeMissing)
  return toReport(await manageEmployeesClient.importEmails(dryRun, removeMissing, { data: file, fileName: file.name }))
}
