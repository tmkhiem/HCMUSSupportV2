import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/http'
import { renderWithTheme } from '../../test/render'
import * as api from './employeesApi'
import {
  countActiveFilters,
  emailProblem,
  emailSummary,
  filtersToParams,
  importTemplateCsv,
  isValidEmail,
  normalizeEmail,
  paramsToFilters,
  primaryEmail,
  reasonLabel,
  statusLabel,
} from './employeesFormat'
import { EMPTY_FILTERS } from './employeesTypes'
import type { ImportReport, ManagedEmail, ManagedEmployee } from './employeesTypes'
import { Component as EmployeesPage } from './EmployeesPage'

vi.mock('./employeesApi', async (orig) => {
  const actual = await orig<typeof import('./employeesApi')>()
  return {
    ...actual,
    fetchEmployees: vi.fn(),
    fetchEmployee: vi.fn(),
    addEmail: vi.fn(),
    removeEmail: vi.fn(),
    setPrimaryEmail: vi.fn(),
    importEmails: vi.fn(),
  }
})

const mail = (email: string, over: Partial<ManagedEmail> = {}): ManagedEmail => ({
  email,
  isPrimary: false,
  note: null,
  addedBy: 'T0002',
  addedAt: new Date(2026, 2, 10),
  hrmConflict: false,
  ...over,
})

const person = (code: string, over: Partial<ManagedEmployee> = {}): ManagedEmployee => ({
  code,
  fullName: `Nguyễn Văn ${code}`,
  status: 'active',
  source: 'hrm',
  unitId: 1,
  unit: 'Khoa Công nghệ thông tin',
  positionTitle: 'Giảng viên',
  emails: [mail(`${code.toLowerCase()}@example.test`, { isPrimary: true })],
  hasHrmConflict: false,
  ...over,
})

const report = (over: Partial<ImportReport> = {}): ImportReport => ({
  dryRun: true,
  removeMissing: false,
  rows: 3,
  employees: 3,
  skippedEmptyRows: 0,
  addedCount: 0,
  unchangedCount: 0,
  removedCount: 0,
  conflictCount: 0,
  unknownCount: 0,
  invalidCount: 0,
  added: [],
  removed: [],
  conflicts: [],
  unknown: [],
  invalid: [],
  warnings: [],
  truncated: false,
  ...over,
})

describe('email helpers', () => {
  it('validates and normalises like the backend', () => {
    expect(normalizeEmail('  A.B@Example.TEST ')).toBe('a.b@example.test')
    for (const ok of ['a@b.vn', 'nguyen.van.a+tag@fit.hcmus.edu.vn']) expect(isValidEmail(ok)).toBe(true)
    for (const bad of ['', '  ', 'a', 'a@b', 'a@@b.vn', 'a b@c.vn', 'a@b.vn,c@d.vn', 'a@b.vn;c@d.vn', `${'a'.repeat(250)}@x.vn`])
      expect(isValidEmail(bad)).toBe(false)
  })

  it('explains why an email cannot be added', () => {
    const existing = [mail('one@example.test')]
    expect(emailProblem('', existing)).toMatch(/Nhập/)
    expect(emailProblem('nope', existing)).toMatch(/không hợp lệ/)
    expect(emailProblem('ONE@example.test', existing)).toMatch(/đã được gắn/)
    expect(emailProblem('two@example.test', existing)).toBeNull()
    const ten = Array.from({ length: 10 }, (_, i) => mail(`e${i}@example.test`))
    expect(emailProblem('new@example.test', ten)).toMatch(/tối đa 10/)
  })

  it('summarises the primary address and the rest', () => {
    const e = person('T0001', { emails: [mail('a@x.vn'), mail('b@x.vn', { isPrimary: true }), mail('c@x.vn')] })
    expect(primaryEmail(e)?.email).toBe('b@x.vn')
    expect(emailSummary(e)).toEqual({ first: 'b@x.vn', more: 2 })
    expect(emailSummary({ emails: [] })).toEqual({ first: null, more: 0 })
  })

  it('labels statuses and import reasons, with a fallback', () => {
    expect(statusLabel('inactive')).toBe('Ngừng hoạt động')
    expect(statusLabel('weird')).toBe('weird')
    expect(reasonLabel('owned_by_other')).toMatch(/MSCB khác/)
    expect(reasonLabel('x')).toBe('x')
  })

  it('round-trips the filters through the URL and counts them', () => {
    const filters = { q: ' dang ', status: 'inactive', noEmail: true, flagged: true } as const
    const params = filtersToParams(filters)
    expect(params.toString()).toBe('q=dang&trangthai=inactive&chuaemail=1&canxuly=1')
    expect(paramsToFilters(params)).toEqual({ ...filters, q: 'dang' })
    expect(paramsToFilters(new URLSearchParams('trangthai=bogus'))).toEqual(EMPTY_FILTERS)
    expect(countActiveFilters(filters)).toBe(4)
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0)
    // Unrelated params (the open employee) are kept.
    expect(filtersToParams(EMPTY_FILTERS, new URLSearchParams('ma=T0001&q=x')).toString()).toBe('ma=T0001')
  })

  it('builds a UTF-8 template with the documented header', () => {
    const csv = importTemplateCsv()
    expect(csv.startsWith('﻿MSCB,Họ tên,Email 1,Email 2')).toBe(true)
    expect(csv).toContain('T0001')
  })
})

function renderPage(search = '') {
  return renderWithTheme(
    <MemoryRouter initialEntries={[`/manage/employees${search}`]}>
      <EmployeesPage />
    </MemoryRouter>,
  )
}

describe('EmployeesPage', () => {
  beforeEach(() => {
    vi.mocked(api.fetchEmployees).mockReset()
    vi.mocked(api.fetchEmployee).mockReset()
    vi.mocked(api.addEmail).mockReset()
    vi.mocked(api.removeEmail).mockReset()
    vi.mocked(api.setPrimaryEmail).mockReset()
    vi.mocked(api.importEmails).mockReset()
  })

  const listOf = (items: ManagedEmployee[], total = items.length) => ({ items, nextCursor: null, total })

  it('lists people with their primary email, extra count and warnings', async () => {
    vi.mocked(api.fetchEmployees).mockResolvedValue(
      listOf([
        person('T0001', { emails: [mail('t0001@example.test', { isPrimary: true }), mail('alt@example.test')] }),
        person('T0007', { emails: [] }),
        person('T0012', { hasHrmConflict: true, status: 'inactive' }),
      ]),
    )
    renderPage()

    expect(await screen.findByText('3 cán bộ · gắn MSCB với email đăng nhập')).toBeInTheDocument()
    const first = screen.getByRole('button', { name: 'Nguyễn Văn T0001, T0001' })
    expect(within(first).getByText('t0001@example.test')).toBeInTheDocument()
    expect(within(first).getByLabelText('và 1 email khác')).toBeInTheDocument()
    expect(within(screen.getByRole('button', { name: 'Nguyễn Văn T0007, T0007' })).getByText('Chưa có email')).toBeInTheDocument()
    const flagged = screen.getByRole('button', { name: 'Nguyễn Văn T0012, T0012' })
    expect(within(flagged).getByText('Cần kiểm tra')).toBeInTheDocument()
    expect(within(flagged).getByText('Ngừng hoạt động')).toBeInTheDocument()
  })

  it('shows the empty, filtered-empty and error states', async () => {
    vi.mocked(api.fetchEmployees).mockResolvedValueOnce(listOf([]))
    const { unmount } = renderPage()
    expect(await screen.findByText('Danh bạ nhân sự đang trống.')).toBeInTheDocument()
    unmount()

    vi.mocked(api.fetchEmployees).mockResolvedValueOnce(listOf([]))
    const second = renderPage('?q=zzz')
    expect(await screen.findByText('Không tìm thấy cán bộ nào phù hợp.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Xóa bộ lọc' })).toBeInTheDocument()
    second.unmount()

    vi.mocked(api.fetchEmployees).mockRejectedValue(new ApiError(500, 'Máy chủ đang bận.'))
    renderPage()
    expect(await screen.findByText('Máy chủ đang bận.')).toBeInTheDocument()
  })

  it('passes the URL filters to the query', async () => {
    vi.mocked(api.fetchEmployees).mockResolvedValue(listOf([person('T0001')]))
    renderPage('?q=dang&trangthai=inactive&chuaemail=1')
    await screen.findByText(/cán bộ phù hợp bộ lọc/)
    expect(vi.mocked(api.fetchEmployees).mock.calls[0][0]).toEqual({ q: 'dang', status: 'inactive', noEmail: true, flagged: false })
  })

  it('opens the drawer from the URL, adds an email (validated first) and shows the server answer', async () => {
    const before = person('T0001')
    const after = person('T0001', { emails: [...before.emails, mail('new@example.test')] })
    vi.mocked(api.fetchEmployees).mockResolvedValue(listOf([before]))
    vi.mocked(api.fetchEmployee).mockResolvedValue(before)
    vi.mocked(api.addEmail).mockResolvedValue(after)
    renderPage('?ma=T0001')

    const drawer = await screen.findByRole('presentation')
    expect(await within(drawer).findByRole('heading', { name: 'Nguyễn Văn T0001' })).toBeInTheDocument()
    expect(within(drawer).getAllByTestId('email-row')).toHaveLength(1)

    fireEvent.change(within(drawer).getByLabelText('Địa chỉ email'), { target: { value: 'khong-hop-le' } })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Thêm email' }))
    expect(await within(drawer).findByText('Địa chỉ email không hợp lệ.')).toBeInTheDocument()
    expect(api.addEmail).not.toHaveBeenCalled()

    fireEvent.change(within(drawer).getByLabelText('Địa chỉ email'), { target: { value: 'New@Example.test' } })
    fireEvent.change(within(drawer).getByLabelText('Ghi chú (không bắt buộc)'), { target: { value: 'Email mới' } })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Thêm email' }))
    await waitFor(() => expect(api.addEmail).toHaveBeenCalledWith('T0001', { email: 'New@Example.test', isPrimary: false, note: 'Email mới' }))
    await waitFor(() => expect(within(drawer).getAllByTestId('email-row')).toHaveLength(2))
    expect(within(drawer).getByLabelText('Địa chỉ email')).toHaveValue('')
  })

  it('shows the server message when adding fails', async () => {
    const p = person('T0001')
    vi.mocked(api.fetchEmployees).mockResolvedValue(listOf([p]))
    vi.mocked(api.fetchEmployee).mockResolvedValue(p)
    vi.mocked(api.addEmail).mockRejectedValue(new ApiError(409, 'Email này đã được gắn với MSCB T0005.'))
    renderPage('?ma=T0001')

    const drawer = await screen.findByRole('presentation')
    await within(drawer).findByRole('heading', { name: 'Nguyễn Văn T0001' })
    fireEvent.change(within(drawer).getByLabelText('Địa chỉ email'), { target: { value: 'taken@example.test' } })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Thêm email' }))
    expect(await within(drawer).findByText('Email này đã được gắn với MSCB T0005.')).toBeInTheDocument()
  })

  it('sets the primary email and removes one after a confirmation', async () => {
    const start = person('T0001', { emails: [mail('a@example.test', { isPrimary: true }), mail('b@example.test')] })
    const swapped = person('T0001', { emails: [mail('b@example.test', { isPrimary: true }), mail('a@example.test')] })
    const last = person('T0001', { emails: [mail('b@example.test', { isPrimary: true })] })
    vi.mocked(api.fetchEmployees).mockResolvedValue(listOf([start]))
    vi.mocked(api.fetchEmployee).mockResolvedValue(start)
    vi.mocked(api.setPrimaryEmail).mockResolvedValue(swapped)
    vi.mocked(api.removeEmail).mockResolvedValue(last)
    renderPage('?ma=T0001')

    const drawer = await screen.findByRole('presentation')
    await within(drawer).findByRole('heading', { name: 'Nguyễn Văn T0001' })
    expect(within(drawer).getByRole('button', { name: 'Đặt a@example.test làm email chính' })).toBeDisabled()
    fireEvent.click(within(drawer).getByRole('button', { name: 'Đặt b@example.test làm email chính' }))
    await waitFor(() => expect(api.setPrimaryEmail).toHaveBeenCalledWith('T0001', 'b@example.test'))
    await waitFor(() => expect(within(drawer).getByRole('button', { name: 'Đặt b@example.test làm email chính' })).toBeDisabled())

    fireEvent.click(within(drawer).getByRole('button', { name: 'Gỡ a@example.test' }))
    const dialog = await screen.findByRole('dialog', { name: 'Gỡ email này?' })
    expect(api.removeEmail).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Gỡ email' }))
    await waitFor(() => expect(api.removeEmail).toHaveBeenCalledWith('T0001', 'a@example.test'))
    await waitFor(() => expect(within(drawer).getAllByTestId('email-row')).toHaveLength(1))
  })

  it('warns when the person has no email and when the account is inactive', async () => {
    const p = person('T0007', { emails: [], status: 'inactive' })
    vi.mocked(api.fetchEmployees).mockResolvedValue(listOf([p]))
    vi.mocked(api.fetchEmployee).mockResolvedValue(p)
    renderPage('?ma=T0007')
    const drawer = await screen.findByRole('presentation')
    expect(await within(drawer).findByText(/Chưa có email nào/)).toBeInTheDocument()
    expect(within(drawer).getByText(/không ở trạng thái hoạt động/)).toBeInTheDocument()
    // With no email the first one is primary, so there is no "primary" checkbox.
    expect(within(drawer).queryByLabelText('Đặt làm email chính')).not.toBeInTheDocument()
  })

  it('marks a conflicting email in the drawer', async () => {
    const p = person('T0012', { emails: [mail('x@example.test', { isPrimary: true, hrmConflict: true })], hasHrmConflict: true })
    vi.mocked(api.fetchEmployees).mockResolvedValue(listOf([p]))
    vi.mocked(api.fetchEmployee).mockResolvedValue(p)
    renderPage('?ma=T0012')
    expect(await within(await screen.findByRole('presentation')).findByText('Trùng email HRM')).toBeInTheDocument()
  })

  it('imports in two steps: dry run first, then apply the same file', async () => {
    vi.mocked(api.fetchEmployees).mockResolvedValue(listOf([person('T0001')]))
    vi.mocked(api.importEmails)
      .mockResolvedValueOnce(
        report({
          addedCount: 2,
          conflictCount: 1,
          unknownCount: 1,
          added: [{ row: 2, code: 'T0007', fullName: 'Lê Minh Khánh', email: 't0007@example.test', isPrimary: true }],
          conflicts: [{ row: 3, code: 'T0010', email: 't0001@example.test', reason: 'owned_by_other', message: 'x', ownerCode: 'T0001', ownerName: 'Trần Văn Bình' }],
          unknown: [{ row: 4, code: 'T9999', emails: ['t9999@example.test'] }],
        }),
      )
      .mockResolvedValueOnce(report({ dryRun: false, addedCount: 2 }))
    renderPage()
    await screen.findByText(/cán bộ/)

    fireEvent.click(screen.getByRole('button', { name: 'Nhập từ tệp' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nhập MSCB và email từ tệp' })
    expect(within(dialog).getByRole('button', { name: 'Kiểm tra tệp' })).toBeDisabled()

    const file = new File(['MSCB,Email 1\nT0007,t0007@example.test\n'], 'nhan-su.csv', { type: 'text/csv' })
    fireEvent.change(within(dialog).getByTestId('import-file'), { target: { files: [file] } })
    expect(within(dialog).getByText('nhan-su.csv')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kiểm tra tệp' }))

    expect(await within(dialog).findByTestId('import-report')).toBeInTheDocument()
    expect(api.importEmails).toHaveBeenLastCalledWith(file, true, false)
    expect(within(dialog).getByTestId('count-added')).toHaveTextContent('2')
    expect(within(dialog).getByTestId('count-conflicts')).toHaveTextContent('1')
    expect(within(dialog).getByText(/Email đã gắn với MSCB khác \(T0001 · Trần Văn Bình\)/)).toBeInTheDocument()
    expect(within(dialog).getByText('T9999')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Áp dụng (2)' }))
    expect(await within(dialog).findByTestId('import-applied')).toHaveTextContent('Đã áp dụng: thêm 2 email, gỡ 0 email.')
    expect(api.importEmails).toHaveBeenLastCalledWith(file, false, false)
    expect(within(dialog).getByRole('button', { name: 'Xong' })).toBeInTheDocument()
  })

  it('refuses other file types and shows import errors', async () => {
    vi.mocked(api.fetchEmployees).mockResolvedValue(listOf([person('T0001')]))
    vi.mocked(api.importEmails).mockRejectedValue(new ApiError(400, 'Không tìm thấy cột MSCB ở dòng đầu tiên của tệp.'))
    renderPage()
    await screen.findByText(/cán bộ/)
    fireEvent.click(screen.getByRole('button', { name: 'Nhập từ tệp' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nhập MSCB và email từ tệp' })

    fireEvent.change(within(dialog).getByTestId('import-file'), { target: { files: [new File(['x'], 'a.pdf')] } })
    expect(within(dialog).getByText('Chỉ hỗ trợ tệp .xlsx hoặc .csv.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Kiểm tra tệp' })).toBeDisabled()

    fireEvent.change(within(dialog).getByTestId('import-file'), { target: { files: [new File(['x'], 'a.csv')] } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kiểm tra tệp' }))
    expect(await within(dialog).findByText('Không tìm thấy cột MSCB ở dòng đầu tiên của tệp.')).toBeInTheDocument()
  })

  it('warns before importing with "chỉ giữ các email trong tệp"', async () => {
    vi.mocked(api.fetchEmployees).mockResolvedValue(listOf([person('T0001')]))
    renderPage()
    await screen.findByText(/cán bộ/)
    fireEvent.click(screen.getByRole('button', { name: 'Nhập từ tệp' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nhập MSCB và email từ tệp' })
    fireEvent.click(within(dialog).getByRole('checkbox'))
    expect(within(dialog).getByText(/sẽ bị gỡ/)).toBeInTheDocument()
  })
})
