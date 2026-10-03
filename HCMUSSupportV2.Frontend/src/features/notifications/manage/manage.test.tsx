import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../api/http'
import { renderWithTheme } from '../../../test/render'
import { ReportView } from './ImportDialog'
import ManageRow from './ManageRow'
import { applyRevision, conflictVersion, EMPTY_DRAFT, fieldErrorsOf, formFromDetail, isDirty, splitBodyIssue, toWriteRequest, variableKeyError } from './draft'
import { EMPTY_MANAGE_FILTERS, hasManageFilters, parseManageFilters, serializeManageFilters, toListQuery } from './manageFilters'
import { toManageDetail, toManageItem, toRows } from './manageApi'
import type { ImportReport, ManageDetail, ManageItem } from './manageTypes'

const detail = (patch: Partial<ManageDetail> = {}): ManageDetail => ({
  id: '0198b000-0000-7000-8000-000000000001',
  title: 'Nâng lương 2025',
  summary: 'Tóm tắt tự động.',
  summaryIsCustom: false,
  bodyMd: 'Hệ số :var[HeSoLuong]',
  variables: [{ key: 'HeSoLuong', label: 'Hệ số lương', type: 'number' }],
  status: 'draft',
  seriesId: 1,
  seriesName: 'Nâng lương',
  tags: [{ id: 3, name: 'Lương', color: null, sort: 0 }],
  publishedAt: null,
  audienceAll: false,
  groups: [{ id: 7, name: 'Nhóm A', memberCount: 4 }],
  employees: [{ code: 'T0003', fullName: 'Lê Nhân Viên', status: 'active' }],
  import: null,
  attachments: [],
  recipientCount: 0,
  version: 4,
  createdBy: null,
  updatedBy: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
  ...patch,
})

describe('draft form', () => {
  it('turns a loaded notification into a form and back into the write request', () => {
    const form = formFromDetail(detail())
    expect(form.summary).toBe('') // an automatic summary stays empty so the server derives it again
    expect(form.tagIds).toEqual([3])
    const request = toWriteRequest(form, 4)
    expect(request).toMatchObject({
      version: 4,
      title: 'Nâng lương 2025',
      seriesId: 1,
      tagIds: [3],
      groupIds: [7],
      employeeCodes: ['T0003'],
          audienceAll: false,
    })
    expect(request.variables).toEqual([{ key: 'HeSoLuong', label: 'Hệ số lương', type: 'number' }])
  })

  it('keeps a custom summary and falls back to the key when a variable has no label', () => {
    const form = formFromDetail(detail({ summary: 'Tóm tắt riêng', summaryIsCustom: true }))
    expect(form.summary).toBe('Tóm tắt riêng')
    const request = toWriteRequest({ ...form, variables: [{ key: ' Ten ', label: ' ', type: 'text' }] })
    expect(request.variables).toEqual([{ key: 'Ten', label: 'Ten', type: 'text' }])
  })

  it('is dirty only when what would be sent changes', () => {
    const saved = formFromDetail(detail())
    expect(isDirty(saved, saved)).toBe(false)
    expect(isDirty({ ...saved, title: '  Nâng lương 2025  ' }, saved)).toBe(false) // trimmed on send
    expect(isDirty({ ...saved, variables: [{ key: 'HeSoLuong', label: '', type: 'number' }] }, saved)).toBe(true) // label changed
    expect(isDirty({ ...saved, bodyMd: saved.bodyMd + '!' }, saved)).toBe(true)
    expect(isDirty({ ...saved, groups: [] }, saved)).toBe(true)
  })

  it('a new draft is dirty once it has a title, a body or a variable', () => {
    expect(isDirty(EMPTY_DRAFT, null)).toBe(false)
    expect(isDirty({ ...EMPTY_DRAFT, title: 'x' }, null)).toBe(true)
    expect(isDirty({ ...EMPTY_DRAFT, bodyMd: ' ' }, null)).toBe(false)
  })

  it('loads an older revision into the form without touching audience, tags or dates', () => {
    const form = formFromDetail(detail())
    const next = applyRevision(form, {
      version: 1,
      title: 'Bản cũ',
      summary: 'x',
      bodyMd: 'Nội dung cũ',
      variables: [],
      editedBy: null,
      editedAt: new Date(),
    })
    expect(next).toMatchObject({ title: 'Bản cũ', bodyMd: 'Nội dung cũ', variables: [], summary: '', tagIds: [3] })
    expect(next.groups).toEqual(form.groups)
  })
})

describe('variables', () => {
  it('follows the contract key rule and refuses duplicates', () => {
    expect(variableKeyError('HeSoLuong', [])).toBeNull()
    expect(variableKeyError('Ten_Day_Du', ['Khac'])).toBeNull()
    expect(variableKeyError('', [])).toMatch(/Nhập tên biến/)
    expect(variableKeyError('1abc', [])).toMatch(/Chữ cái đầu/)
    expect(variableKeyError('_abc', [])).toMatch(/Chữ cái đầu/)
    expect(variableKeyError('a b', [])).toMatch(/Chữ cái đầu/)
    expect(variableKeyError('Hệ_số', [])).toMatch(/Chữ cái đầu/)
    expect(variableKeyError('a'.repeat(65), [])).toMatch(/64/)
    expect(variableKeyError('A', ['A'])).toBe('Tên biến bị trùng.')
  })
})

describe('server errors', () => {
  it('reads the errors map of a 400, with camelCase field names', () => {
    const err = new ApiError(400, 'Dữ liệu không hợp lệ.', { errors: { Title: ['Thiếu tiêu đề.'], bodyMd: ['[VAR_UNKNOWN] Dòng 1, cột 5: Biến chưa khai báo.'] } })
    expect(fieldErrorsOf(err)).toEqual({ title: ['Thiếu tiêu đề.'], bodyMd: ['[VAR_UNKNOWN] Dòng 1, cột 5: Biến chưa khai báo.'] })
    expect(fieldErrorsOf(new Error('x'))).toEqual({})
    expect(fieldErrorsOf(new ApiError(500, 'x'))).toEqual({})
  })

  it('splits the validator code from the message and reads the version of a conflict', () => {
    expect(splitBodyIssue('[VAR_UNKNOWN] Dòng 1, cột 5: Biến chưa khai báo.')).toEqual({ code: 'VAR_UNKNOWN', text: 'Dòng 1, cột 5: Biến chưa khai báo.' })
    expect(splitBodyIssue('Không có mã')).toEqual({ code: null, text: 'Không có mã' })
    expect(conflictVersion(new ApiError(409, 'x', { currentVersion: 9 }))).toBe(9)
    expect(conflictVersion(new ApiError(409, 'x'))).toBeNull()
    expect(conflictVersion(new ApiError(400, 'x'))).toBeUndefined()
  })
})

describe('list filters in the URL', () => {
  it('parses, drops malformed values and round-trips', () => {
    const f = parseManageFilters(new URLSearchParams('status=published&tag=3&series=2&q=  lương '))
    expect(f).toEqual({ status: 'published', tag: 3, series: 2, q: 'lương' })
    expect(parseManageFilters(new URLSearchParams('status=hack&tag=-1&series=abc'))).toEqual(EMPTY_MANAGE_FILTERS)
    const params = serializeManageFilters(f, new URLSearchParams('other=1'))
    expect(params.get('other')).toBe('1')
    expect(parseManageFilters(params)).toEqual(f)
    expect(serializeManageFilters(EMPTY_MANAGE_FILTERS, params).toString()).toBe('other=1')
    expect(toListQuery(f)).toEqual({ status: 'published', tag: 3, series: 2, q: 'lương' })
    expect(hasManageFilters(EMPTY_MANAGE_FILTERS)).toBe(false)
    expect(hasManageFilters(f)).toBe(true)
  })
})

describe('API mapping', () => {
  it('maps the editor DTO, tolerating missing optional fields', () => {
    const mapped = toManageDetail({
      id: 'x',
      title: 'T',
      status: 'archived',
      variables: [{ key: 'A', type: 'bogus' }],
      audience: { all: true, groups: [{ id: 1, name: 'G', memberCount: 2 }], employees: [{ code: 'T1' }], import: { importId: 'i', status: 'applied', rows: 5, distinctEmployees: 4 } },
    } as never)
    expect(mapped.status).toBe('draft') // an unknown status falls back to draft
    expect(mapped.variables).toEqual([{ key: 'A', label: 'A', type: 'text' }])
    expect(mapped.audienceAll).toBe(true)
    expect(mapped.groups).toEqual([{ id: 1, name: 'G', memberCount: 2 }])
    expect(mapped.employees[0]).toMatchObject({ code: 'T1', fullName: null })
    expect(mapped.import).toMatchObject({ importId: 'i', rows: 5, distinctEmployees: 4 })
    expect(toManageDetail({ status: 'weird' }).status).toBe('draft')
    expect(toManageItem({ id: 'a', title: 'b' })).toMatchObject({ status: 'draft', recipientCount: 0, tags: [] })
  })

  it('reads preview rows as text', () => {
    expect(toRows([{ A: 1, B: null, C: 'x' }])).toEqual([{ A: '1', B: null, C: 'x' }])
    expect(toRows({ A: 2 })).toEqual([{ A: '2' }])
    expect(toRows(null)).toEqual([])
    expect(toRows([1, 'x', [2]])).toEqual([])
  })
})

const item = (patch: Partial<ManageItem> = {}): ManageItem => ({
  id: 'abc',
  title: 'Mở lớp bồi dưỡng',
  status: 'published',
  seriesId: null,
  seriesName: 'Chuỗi A',
  tags: [{ id: 1, name: 'Chung', color: null, sort: 0 }, { id: 2, name: 'Lương', color: null, sort: 1 }],
  publishedAt: new Date('2026-06-14T00:00:00Z'),
  audienceAll: true,
  recipientCount: 200,
  version: 2,
  updatedAt: new Date('2026-06-14T00:00:00Z'),
  ...patch,
})

describe('ManageRow', () => {
  const renderRow = (i: ManageItem, onAction = vi.fn()) =>
    renderWithTheme(
      <MemoryRouter>
        <ManageRow item={i} onAction={onAction} />
      </MemoryRouter>,
    )

  it('shows the status, series, first tag plus count, and the recipient count', () => {
    renderRow(item())
    expect(screen.getByTestId('status-chip')).toHaveTextContent('Đã đăng')
    expect(screen.getByRole('link', { name: 'Mở lớp bồi dưỡng' })).toHaveAttribute('href', '/manage/notifications/abc')
    expect(screen.getByText('Chuỗi A')).toBeInTheDocument()
    expect(screen.getByText('+1')).toBeInTheDocument()
    expect(screen.getByText('200 người nhận')).toBeInTheDocument()
  })

  it('a draft has no recipients; both a draft and a published notification offer delete', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    const { unmount } = renderRow(item({ status: 'draft', recipientCount: 0, publishedAt: null }), onAction)
    expect(screen.getByText('Chưa gửi cho ai')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Thao tác với/ }))
    await user.click(screen.getByRole('menuitem', { name: 'Xóa bản nháp' }))
    expect(onAction).toHaveBeenCalledWith('delete', expect.objectContaining({ id: 'abc' }))
    unmount()

    renderRow(item(), onAction)
    await user.click(screen.getByRole('button', { name: /Thao tác với/ }))
    expect(screen.queryByRole('menuitem', { name: 'Lưu trữ' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: 'Xóa thông báo' }))
    expect(onAction).toHaveBeenLastCalledWith('delete', expect.anything())
  })
})

describe('ReportView', () => {
  const report = (patch: Partial<ImportReport> = {}): ImportReport => ({
    fileName: 'ds.xlsx',
    mscbColumn: 'MSCB',
    rows: 10,
    distinctEmployees: 8,
    employeesWithMultipleRows: 1,
    columns: [{ key: 'HeSoLuong', label: 'Hệ số lương', header: 'Hệ số lương' }],
    unknownCodes: [],
    unknownCodeCount: 0,
    inactiveCodes: [],
    inactiveCodeCount: 0,
    duplicateRowCodes: [],
    duplicateRows: 0,
    rowsWithoutCode: 0,
    missingInFile: [],
    unusedColumns: [],
    errors: [],
    canApply: true,
    ...patch,
  })

  it('a clean report says it is valid and maps the columns', () => {
    renderWithTheme(<ReportView report={report()} />)
    expect(screen.getByText('10 dòng')).toBeInTheDocument()
    expect(screen.getByText('8 người nhận')).toBeInTheDocument()
    expect(screen.getByText(/Tệp hợp lệ/)).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'HeSoLuong' })).toBeInTheDocument()
  })

  it('warnings list the codes (with a cap) and the missing and unused columns', () => {
    const codes = Array.from({ length: 30 }, (_, i) => `X${i + 1}`)
    renderWithTheme(<ReportView report={report({ unknownCodes: codes.slice(0, 12), unknownCodeCount: 30, missingInFile: ['MucLuong'], unusedColumns: ['GhiChu'], rowsWithoutCode: 2 })} />)
    expect(screen.getByText(/30 mã không có trong danh sách nhân sự/)).toBeInTheDocument()
    expect(screen.getByText(/và 18 mã khác/)).toBeInTheDocument()
    expect(screen.getByText('MucLuong')).toBeInTheDocument()
    expect(screen.getByText(/GhiChu/)).toBeInTheDocument()
    expect(screen.getByText(/2 dòng không có mã số/)).toBeInTheDocument()
    expect(screen.queryByText(/Tệp hợp lệ/)).not.toBeInTheDocument()
  })

  it('errors are shown as an alert', () => {
    renderWithTheme(<ReportView report={report({ errors: ['Không tìm thấy cột MSCB.'], canApply: false })} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Không tìm thấy cột MSCB.')
  })
})
