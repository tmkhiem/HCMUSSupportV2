import { fireEvent, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/http'
import { renderWithTheme } from '../../test/render'
import * as api from './api'
import { mockDetailed, mockGeneral } from './mockData'
import { Component as DetailedPage } from './detailed/DetailedPage'
import { Component as GeneralPage } from './general/GeneralPage'
import { VIEW_AS_REVEAL_MESSAGE, maskTail, revealErrorMessage } from './detailed/useReveal'

vi.mock('./api', async (orig) => {
  const actual = await orig<typeof import('./api')>()
  return { ...actual, useDetailedProfile: vi.fn(), useGeneralProfile: vi.fn(), revealSensitive: vi.fn() }
})

const ok = <T,>(data: T) => ({ data, error: null, isPending: false, refetch: vi.fn() }) as never

describe('maskTail', () => {
  it('keeps only the visible tail of a masked value', () => {
    expect(maskTail({ field: 'national_id', masked: '•••• 4321', hasValue: true })).toBe('4321')
  })
  it('is null without a value', () => {
    expect(maskTail({ field: 'tax_code', masked: null, hasValue: false })).toBeNull()
    expect(maskTail({ field: 'tax_code', masked: '•••• 1', hasValue: false })).toBeNull()
  })
})

describe('revealErrorMessage', () => {
  it('explains a view-as refusal', () => {
    expect(revealErrorMessage(new ApiError(403, 'Không thể xem thông tin nhạy cảm khi đang xem với tư cách người khác.'))).toBe(
      VIEW_AS_REVEAL_MESSAGE,
    )
  })
  it('falls back for unknown errors', () => {
    expect(revealErrorMessage(new Error('boom'))).toMatch(/Không xem được/)
  })
})

describe('DetailedPage reveal', () => {
  beforeEach(() => {
    vi.mocked(api.useDetailedProfile).mockReturnValue(ok(mockDetailed))
    vi.mocked(api.revealSensitive).mockReset()
  })

  it('reveals one field at a time and can hide it again', async () => {
    vi.mocked(api.revealSensitive).mockResolvedValue('079085004321')
    renderWithTheme(
      <MemoryRouter>
        <DetailedPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('•••• 4321')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Hiện Số CCCD' }))
    await waitFor(() => expect(screen.getByText('079085004321')).toBeInTheDocument())
    expect(api.revealSensitive).toHaveBeenCalledWith('national_id')
    expect(screen.getByText('•••• 7788')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ẩn Số CCCD' }))
    expect(screen.queryByText('079085004321')).not.toBeInTheDocument()
  })

  it('shows the view-as message on 403', async () => {
    vi.mocked(api.revealSensitive).mockRejectedValue(new ApiError(403, 'x'))
    renderWithTheme(
      <MemoryRouter>
        <DetailedPage />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Hiện Mã số thuế' }))
    expect(await screen.findByText(VIEW_AS_REVEAL_MESSAGE)).toBeInTheDocument()
    expect(screen.getByText('•••• 7788')).toBeInTheDocument()
  })
})

describe('page states', () => {
  it('shows the server message on error', () => {
    vi.mocked(api.useGeneralProfile).mockReturnValue({
      data: undefined,
      error: new ApiError(500, 'Máy chủ bận.'),
      isPending: false,
      refetch: vi.fn(),
    } as never)
    renderWithTheme(
      <MemoryRouter>
        <GeneralPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('Máy chủ bận.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument()
  })

  it('shows the empty sentence for a missing profile (404)', () => {
    vi.mocked(api.useGeneralProfile).mockReturnValue({
      data: undefined,
      error: new ApiError(404, 'Không tìm thấy dữ liệu.'),
      isPending: false,
      refetch: vi.fn(),
    } as never)
    renderWithTheme(
      <MemoryRouter>
        <GeneralPage />
      </MemoryRouter>,
    )
    expect(screen.getByText(/Chưa có hồ sơ/)).toBeInTheDocument()
  })

  it('formats the partial date by precision and dashes missing values', () => {
    vi.mocked(api.useGeneralProfile).mockReturnValue(
      ok({ ...mockGeneral, dateOfBirth: { date: '1985-03-01', precision: 'month' }, phoneHome: null }),
    )
    renderWithTheme(
      <MemoryRouter>
        <GeneralPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('03/1985')).toBeInTheDocument()
    expect(screen.getAllByLabelText('Không có dữ liệu').length).toBeGreaterThan(0)
  })
})
