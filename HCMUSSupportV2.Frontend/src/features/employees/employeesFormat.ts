import type { EmployeeFilters, EmployeeStatus, ManagedEmail, ManagedEmployee } from './employeesTypes'

export const STATUS_LABEL: Record<EmployeeStatus, string> = {
  active: 'Đang hoạt động',
  inactive: 'Ngừng hoạt động',
  retired: 'Đã nghỉ hưu',
}

export const statusLabel = (status: string): string => STATUS_LABEL[status as EmployeeStatus] ?? status

/** Same shape the backend accepts: one `@`, a dot in the domain, no spaces, commas or semicolons, at most 254 characters. */
const EMAIL_PATTERN = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/

export const normalizeEmail = (value: string): string => value.trim().toLowerCase()

export function isValidEmail(value: string): boolean {
  const v = normalizeEmail(value)
  return v.length > 0 && v.length <= 254 && EMAIL_PATTERN.test(v)
}

export const MAX_EMAILS = 10

/** Why `value` cannot be added (Vietnamese), or null when it can. `existing` are the employee's current addresses. */
export function emailProblem(value: string, existing: readonly Pick<ManagedEmail, 'email'>[]): string | null {
  if (value.trim() === '') return 'Nhập địa chỉ email.'
  if (!isValidEmail(value)) return 'Địa chỉ email không hợp lệ.'
  if (existing.some((e) => e.email.toLowerCase() === normalizeEmail(value))) return 'Email này đã được gắn với cán bộ này.'
  if (existing.length >= MAX_EMAILS) return `Mỗi cán bộ có tối đa ${MAX_EMAILS} email.`
  return null
}

export const primaryEmail = (e: Pick<ManagedEmployee, 'emails'>): ManagedEmail | null =>
  e.emails.find((m) => m.isPrimary) ?? e.emails[0] ?? null

/** The primary address and how many more there are, ready for a table cell. */
export function emailSummary(e: Pick<ManagedEmployee, 'emails'>): { first: string | null; more: number } {
  const first = primaryEmail(e)
  return { first: first?.email ?? null, more: Math.max(e.emails.length - 1, 0) }
}

/** Query-string fields for the filters, omitting defaults (the URL is the state of record). */
export function filtersToParams(filters: EmployeeFilters, prev?: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(prev)
  const set = (key: string, value: string | null) => (value ? next.set(key, value) : next.delete(key))
  set('q', filters.q.trim() || null)
  set('trangthai', filters.status || null)
  set('chuaemail', filters.noEmail ? '1' : null)
  set('canxuly', filters.flagged ? '1' : null)
  return next
}

export function paramsToFilters(params: URLSearchParams): EmployeeFilters {
  const status = params.get('trangthai')
  return {
    q: params.get('q') ?? '',
    status: status === 'active' || status === 'inactive' || status === 'retired' ? status : '',
    noEmail: params.get('chuaemail') === '1',
    flagged: params.get('canxuly') === '1',
  }
}

export const countActiveFilters = (f: EmployeeFilters): number =>
  (f.q.trim() ? 1 : 0) + (f.status ? 1 : 0) + (f.noEmail ? 1 : 0) + (f.flagged ? 1 : 0)

/** The downloadable template: UTF-8 with a BOM so Excel shows the Vietnamese headers correctly. Synthetic example rows only. */
export function importTemplateCsv(): string {
  const header = ['MSCB', 'Họ tên', 'Email 1', 'Email 2', 'Email 3', 'Email 4', 'Email 5', 'Email 6']
  const rows = [
    ['T0001', 'Nguyễn Văn A', 'nguyen.van.a@example.test', '', '', '', '', ''],
    ['T0002', 'Trần Thị B', 'tran.thi.b@example.test', 'b.tran@example.test', '', '', '', ''],
  ]
  return '﻿' + [header, ...rows].map((r) => r.join(',')).join('\r\n') + '\r\n'
}

export const REASON_LABEL: Record<string, string> = {
  owned_by_other: 'Email đã gắn với MSCB khác',
  duplicate_in_file: 'Email trùng giữa các dòng trong tệp',
  invalid_format: 'Email không hợp lệ',
  too_many: 'Vượt quá 10 email',
  name_mismatch: 'Họ tên khác danh bạ',
  hrm_conflict: 'Trùng email cá nhân trong HRM',
  duplicate_in_row: 'Email lặp trong dòng',
}

export const reasonLabel = (reason: string): string => REASON_LABEL[reason] ?? reason
