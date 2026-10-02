import { ApiError } from '../../api/http'
import { MAX_EMAILS, isValidEmail, normalizeEmail } from './employeesFormat'
import type { AddEmailInput, EmployeeFilters, EmployeePage, ImportReport, ManagedEmployee } from './employeesTypes'

/**
 * Synthetic Nhân sự & email data for `VITE_MOCK_AUTH=1` (dev only: only `employeesApi.ts` imports this, behind the
 * build-time `MOCK_AUTH` constant). MSCB `T0001`..`T0040`, fake names and `example.test` addresses. State lives in this
 * module, so edits stick until the page is reloaded. `?employees=empty|error` on the URL exercises the other page states.
 * The import understands `.csv` only (the Playwright test uploads one); any other file gets a canned report.
 */

const delay = (ms = 60) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const scenario = () => new URLSearchParams(window.location.search).get('employees')

const UNITS = ['Khoa Công nghệ thông tin', 'Khoa Vật lý', 'Khoa Hóa học', 'Phòng Tổ chức - Hành chính', 'Phòng Đào tạo']
const LAST = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Võ', 'Đặng', 'Bùi']
const MIDDLE = ['Văn', 'Thị', 'Minh', 'Thu', 'Quốc', 'Ngọc']
const FIRST = ['An', 'Bình', 'Châu', 'Dũng', 'Giang', 'Hà', 'Khánh', 'Lan', 'Mai', 'Nam', 'Oanh', 'Phúc']
const POSITIONS = ['Giảng viên', 'Giảng viên chính', 'Chuyên viên', 'Kỹ thuật viên', 'Phó Trưởng phòng']

const at = (iso: string) => new Date(`${iso}T09:00:00+07:00`)

function seed(): ManagedEmployee[] {
  const list: ManagedEmployee[] = []
  for (let n = 1; n <= 40; n++) {
    const code = `T${String(n).padStart(4, '0')}`
    const unit = (n - 1) % UNITS.length
    const noEmail = n % 7 === 0
    const emails = noEmail
      ? []
      : [
          { email: `${code.toLowerCase()}@example.test`, isPrimary: true, note: n === 1 ? 'Tài khoản thử nghiệm' : null, addedBy: n === 1 ? null : 'T0002', addedAt: at('2026-03-10'), hrmConflict: false },
          ...(n % 3 === 0
            ? [{ email: `${code.toLowerCase()}.alt@example.test`, isPrimary: false, note: 'Email cũ', addedBy: 'T0002', addedAt: at('2026-05-02'), hrmConflict: n === 12 }]
            : []),
        ]
    list.push({
      code,
      fullName: `${LAST[n % LAST.length]} ${MIDDLE[n % MIDDLE.length]} ${FIRST[n % FIRST.length]}`,
      status: n === 9 ? 'inactive' : n === 33 ? 'retired' : 'active',
      source: n > 35 ? 'manual' : 'hrm',
      unitId: unit + 1,
      unit: UNITS[unit],
      positionTitle: POSITIONS[n % POSITIONS.length],
      emails,
      hasHrmConflict: emails.some((e) => e.hrmConflict),
    })
  }
  return list
}

let db: ManagedEmployee[] = seed()

const refresh = (e: ManagedEmployee): ManagedEmployee => ({
  ...e,
  emails: [...e.emails].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)),
  hasHrmConflict: e.emails.some((m) => m.hrmConflict),
})

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase()

function find(code: string): ManagedEmployee {
  const e = db.find((x) => x.code === code)
  if (!e) throw new ApiError(404, 'Không tìm thấy cán bộ.')
  return e
}

function save(e: ManagedEmployee): ManagedEmployee {
  const next = refresh(e)
  db = db.map((x) => (x.code === e.code ? next : x))
  return next
}

const ownerOf = (email: string) => db.find((e) => e.emails.some((m) => m.email.toLowerCase() === email.toLowerCase()))

export async function listMock(filters: EmployeeFilters, cursor: string | undefined, limit: number): Promise<EmployeePage> {
  await delay()
  const s = scenario()
  if (s === 'error') throw new ApiError(500, 'Không tải được danh sách cán bộ.')
  if (s === 'empty') return { items: [], nextCursor: null, total: 0 }
  const q = fold(filters.q.trim())
  let rows = db.filter((e) => {
    if (q && !(e.code.toLowerCase().startsWith(q) || fold(e.fullName).includes(q) || e.emails.some((m) => m.email.toLowerCase().includes(q)))) return false
    if (filters.status && e.status !== filters.status) return false
    if (filters.noEmail && e.emails.length > 0) return false
    if (filters.flagged && !e.hasHrmConflict) return false
    return true
  })
  rows = [...rows].sort((a, b) => a.code.localeCompare(b.code))
  const total = rows.length
  const start = cursor ? rows.findIndex((e) => e.code > cursor) : 0
  const page = start < 0 ? [] : rows.slice(start, start + limit)
  const hasMore = start >= 0 && start + limit < rows.length
  return { items: page, nextCursor: hasMore ? page[page.length - 1].code : null, total }
}

export async function getMock(code: string): Promise<ManagedEmployee> {
  await delay()
  return find(code)
}

export async function addMock(code: string, input: AddEmailInput): Promise<ManagedEmployee> {
  await delay()
  const e = find(code)
  const email = normalizeEmail(input.email)
  if (!isValidEmail(email)) throw new ApiError(400, 'Địa chỉ email không hợp lệ.')
  const owner = ownerOf(email)
  if (owner?.code === code) throw new ApiError(409, 'Email này đã được gắn với cán bộ này.')
  if (owner) throw new ApiError(409, `Email này đã được gắn với MSCB ${owner.code}.`)
  if (e.emails.length >= MAX_EMAILS) throw new ApiError(400, `Mỗi cán bộ có tối đa ${MAX_EMAILS} email.`)
  const primary = e.emails.length === 0 || input.isPrimary
  const emails = [
    ...e.emails.map((m) => (primary ? { ...m, isPrimary: false } : m)),
    { email, isPrimary: primary, note: input.note.trim() || null, addedBy: 'T0001', addedAt: new Date(), hrmConflict: false },
  ]
  return save({ ...e, emails })
}

export async function removeMock(code: string, email: string): Promise<ManagedEmployee> {
  await delay()
  const e = find(code)
  const target = e.emails.find((m) => m.email.toLowerCase() === email.toLowerCase())
  if (!target) throw new ApiError(404, 'Không tìm thấy email này của cán bộ.')
  if (e.emails.length === 1 && code === 'T0001') {
    throw new ApiError(409, 'Không thể gỡ email cuối cùng của chính mình (bạn sẽ không đăng nhập lại được).')
  }
  const rest = e.emails.filter((m) => m !== target)
  if (target.isPrimary && rest.length > 0) rest[0] = { ...rest[0], isPrimary: true }
  return save({ ...e, emails: rest })
}

export async function setPrimaryMock(code: string, email: string): Promise<ManagedEmployee> {
  await delay()
  const e = find(code)
  if (!e.emails.some((m) => m.email.toLowerCase() === email.toLowerCase())) throw new ApiError(404, 'Không tìm thấy email này của cán bộ.')
  return save({ ...e, emails: e.emails.map((m) => ({ ...m, isPrimary: m.email.toLowerCase() === email.toLowerCase() })) })
}

const emptyReport = (dryRun: boolean, removeMissing: boolean): ImportReport => ({
  dryRun, removeMissing, rows: 0, employees: 0, skippedEmptyRows: 0, addedCount: 0, unchangedCount: 0, removedCount: 0,
  conflictCount: 0, unknownCount: 0, invalidCount: 0, added: [], removed: [], conflicts: [], unknown: [], invalid: [], warnings: [],
  truncated: false,
})

function parseCsv(text: string): string[][] {
  const delimiter = text.split('\n', 1)[0].includes(';') ? ';' : ','
  return text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .map((l) => l.split(delimiter).map((c) => c.trim()))
}

export async function importMock(file: File, dryRun: boolean, removeMissing: boolean): Promise<ImportReport> {
  await delay(200)
  if (!/\.(csv|xlsx)$/i.test(file.name)) throw new ApiError(400, 'Chỉ hỗ trợ tệp .xlsx hoặc .csv.')
  const report = emptyReport(dryRun, removeMissing)

  if (!/\.csv$/i.test(file.name)) {
    // The mock cannot read a workbook: show every kind of finding once.
    report.rows = 5
    report.employees = 4
    report.addedCount = 1
    report.unchangedCount = 1
    report.conflictCount = 1
    report.unknownCount = 1
    report.invalidCount = 1
    report.added = [{ row: 2, code: 'T0007', fullName: 'Lê Minh Khánh', email: 't0007@example.test', isPrimary: true }]
    report.conflicts = [{ row: 3, code: 'T0010', email: 't0001@example.test', reason: 'owned_by_other', message: 'Email đã gắn với MSCB T0001.', ownerCode: 'T0001', ownerName: 'Trần Văn Bình' }]
    report.unknown = [{ row: 4, code: 'T9999', emails: ['t9999@example.test'] }]
    report.invalid = [{ row: 5, code: 'T0011', email: 'khong-hop-le', reason: 'invalid_format', message: 'Email "khong-hop-le" không hợp lệ.' }]
    return report
  }

  const rows = parseCsv(await file.text())
  if (rows.length === 0) throw new ApiError(400, 'Tệp không có dữ liệu.')
  const header = rows[0].map(fold)
  const codeCol = header.findIndex((h) => ['mscb', 'ma so can bo', 'code'].includes(h))
  if (codeCol < 0) throw new ApiError(400, 'Không tìm thấy cột MSCB ở dòng đầu tiên của tệp.')
  const emailCols = header.map((h, i) => (h.startsWith('email') ? i : -1)).filter((i) => i >= 0)
  if (emailCols.length === 0) throw new ApiError(400, 'Không tìm thấy cột Email (Email 1, Email 2, ...) ở dòng đầu tiên của tệp.')

  const claimed = new Map<string, string>()
  const touched = new Set<string>()
  let changes: Array<() => void> = []
  for (let r = 1; r < rows.length; r++) {
    const code = rows[r][codeCol] ?? ''
    const emails = emailCols.map((c) => rows[r][c] ?? '').filter(Boolean)
    if (!code && emails.length === 0) continue
    report.rows++
    const employee = db.find((e) => e.code.toLowerCase() === code.toLowerCase())
    if (!employee) {
      report.unknownCount++
      report.unknown.push({ row: r + 1, code, emails })
      continue
    }
    touched.add(employee.code)
    for (const raw of emails) {
      const email = normalizeEmail(raw)
      if (!isValidEmail(email)) {
        report.invalidCount++
        report.invalid.push({ row: r + 1, code: employee.code, email: raw, reason: 'invalid_format', message: `Email "${raw}" không hợp lệ.` })
        continue
      }
      const owner = ownerOf(email)
      if (owner?.code === employee.code) {
        report.unchangedCount++
        continue
      }
      const other = owner?.code ?? claimed.get(email)
      if (other) {
        report.conflictCount++
        report.conflicts.push({
          row: r + 1, code: employee.code, email,
          reason: owner ? 'owned_by_other' : 'duplicate_in_file',
          message: owner ? `Email đã gắn với MSCB ${other}.` : `Email xuất hiện ở dòng của MSCB ${other} trong cùng tệp.`,
          ownerCode: other, ownerName: owner?.fullName ?? null,
        })
        continue
      }
      claimed.set(email, employee.code)
      const first = employee.emails.length === 0 && !report.added.some((a) => a.code === employee.code)
      report.addedCount++
      report.added.push({ row: r + 1, code: employee.code, fullName: employee.fullName, email, isPrimary: first })
      changes.push(() => void save({ ...find(employee.code), emails: [...find(employee.code).emails, { email, isPrimary: first, note: 'Nhập từ tệp', addedBy: 'T0001', addedAt: new Date(), hrmConflict: false }] }))
    }
  }
  report.employees = touched.size
  if (!dryRun) {
    changes.forEach((apply) => apply())
    changes = []
  }
  return report
}

/** For tests and Playwright: restore the seed. */
export function resetMock() {
  db = seed()
}
