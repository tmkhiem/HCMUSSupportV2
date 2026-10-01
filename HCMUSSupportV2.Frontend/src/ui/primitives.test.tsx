import SchoolOutlined from '@mui/icons-material/SchoolOutlined'
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/http'
import { renderWithTheme } from '../test/render'
import AcrylicCard from './AcrylicCard'
import EmptyDash from './EmptyDash'
import MaskedValue from './MaskedValue'
import PageHeader from './PageHeader'
import PageState from './PageState'
import SectionLabel from './SectionLabel'
import StatCard from './StatCard'

describe('StatCard', () => {
  it('shows label, value and hint', () => {
    renderWithTheme(<StatCard icon={<SchoolOutlined color="primary" />} label="Số lớp" value="12" hint="Năm học 2024-2025" />)
    expect(screen.getByText('Số lớp')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('Năm học 2024-2025')).toBeInTheDocument()
  })

  it('renders a dash for a missing value, not 0 or N/A', () => {
    renderWithTheme(<StatCard icon={<SchoolOutlined />} label="Hệ số" value={null} />)
    expect(screen.getByLabelText('Không có dữ liệu')).toHaveTextContent('—')
    expect(screen.queryByText('N/A')).not.toBeInTheDocument()
  })

  it('is a button only when clickable', () => {
    const onClick = vi.fn()
    renderWithTheme(<StatCard icon={<SchoolOutlined />} label="Mở" value="1" onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe('AcrylicCard', () => {
  it('uses the acrylic variant and only lifts when interactive', () => {
    renderWithTheme(
      <>
        <AcrylicCard data-testid="static">a</AcrylicCard>
        <AcrylicCard data-testid="live" interactive>
          b
        </AcrylicCard>
      </>,
    )
    expect(screen.getByTestId('static')).toHaveClass('MuiPaper-acrylic')
    expect(screen.getByTestId('static')).not.toHaveAttribute('data-interactive')
    expect(screen.getByTestId('live')).toHaveAttribute('data-interactive', 'true')
  })

  it('activates on Enter when clickable', () => {
    const onClick = vi.fn()
    renderWithTheme(<AcrylicCard onClick={onClick}>x</AcrylicCard>)
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' })
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe('PageState', () => {
  it('shows the server message for an ApiError', () => {
    renderWithTheme(<PageState error={new ApiError(500, 'Máy chủ đang bảo trì.')}>nội dung</PageState>)
    expect(screen.getByRole('alert')).toHaveTextContent('Máy chủ đang bảo trì.')
    expect(screen.queryByText('nội dung')).not.toBeInTheDocument()
  })

  it('uses the specific fallback for unknown errors', () => {
    renderWithTheme(<PageState error={new Error('boom')} errorFallback="Không tải được lương.">x</PageState>)
    expect(screen.getByRole('alert')).toHaveTextContent('Không tải được lương.')
  })

  it('offers a retry', () => {
    const onRetry = vi.fn()
    renderWithTheme(<PageState error={new Error('x')} onRetry={onRetry} />)
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('shows a spinner while loading', () => {
    renderWithTheme(<PageState loading>x</PageState>)
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('renders children when nothing applies', () => {
    renderWithTheme(<PageState>nội dung</PageState>)
    expect(screen.getByText('nội dung')).toBeInTheDocument()
  })

  it('prefers the error over loading and empty', () => {
    renderWithTheme(<PageState error={new Error('x')} loading empty />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('shows the empty message', () => {
    renderWithTheme(<PageState empty emptyMessage="Chưa có khen thưởng." />)
    expect(screen.getByText('Chưa có khen thưởng.')).toBeInTheDocument()
  })
})

describe('MaskedValue', () => {
  it('shows dots and the tail, and asks to reveal', () => {
    const onReveal = vi.fn()
    renderWithTheme(<MaskedValue label="Số CCCD" tail="1234" onReveal={onReveal} />)
    expect(screen.getByTestId('masked-value')).toHaveTextContent('•••• 1234')
    fireEvent.click(screen.getByRole('button', { name: 'Hiện Số CCCD' }))
    expect(onReveal).toHaveBeenCalledTimes(1)
  })

  it('shows the revealed value and can hide it again', () => {
    const onHide = vi.fn()
    renderWithTheme(<MaskedValue label="Số CCCD" tail="1234" revealed="079012345678" onHide={onHide} />)
    expect(screen.getByTestId('masked-value')).toHaveTextContent('079012345678')
    fireEvent.click(screen.getByRole('button', { name: 'Ẩn Số CCCD' }))
    expect(onHide).toHaveBeenCalled()
  })

  it('shows a dash when there is nothing to mask', () => {
    renderWithTheme(<MaskedValue label="Mã số thuế" tail={null} />)
    expect(screen.getByLabelText('Không có dữ liệu')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('disables the button while revealing', () => {
    renderWithTheme(<MaskedValue label="Số TK" tail="9999" onReveal={() => {}} loading />)
    expect(screen.getByRole('button', { name: 'Hiện Số TK' })).toBeDisabled()
  })
})

describe('PageHeader / SectionLabel / EmptyDash', () => {
  it('renders the title as the page h1 with subtitle and actions', () => {
    renderWithTheme(<PageHeader title="Quá trình lương" subtitle="Cập nhật 01/10/2026" actions={<button>Xuất</button>} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Quá trình lương' })).toBeInTheDocument()
    expect(screen.getByText('Cập nhật 01/10/2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Xuất' })).toBeInTheDocument()
  })

  it('SectionLabel uses the custom typography variant', () => {
    renderWithTheme(<SectionLabel>Cá nhân</SectionLabel>)
    expect(screen.getByText('Cá nhân')).toHaveClass('MuiTypography-sectionLabel')
  })

  it('EmptyDash is an em dash', () => {
    renderWithTheme(<EmptyDash />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
