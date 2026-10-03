import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { InfiniteData } from '@tanstack/react-query'
import { act, renderHook, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithTheme } from '../../../test/render'
import * as api from './inboxApi'
import { inboxKeys, patchInboxItem } from './inboxCache'
import { EMPTY_FILTERS } from './inboxFilters'
import { useAcknowledge } from './inboxQueries'
import InboxRow from './InboxRow'
import type { InboxItem, InboxPage } from './inboxTypes'

vi.mock('./inboxApi', async (orig) => {
  const actual = await orig<typeof import('./inboxApi')>()
  return { ...actual, postAck: vi.fn() }
})

const item = (over: Partial<InboxItem> = {}): InboxItem => ({
  id: 'n1',
  title: 'Nâng lương 2026',
  summary: 'Kết quả xét nâng lương',
  tags: [
    { id: 1, name: 'Lương', color: null },
    { id: 2, name: 'Chung', color: null },
    { id: 3, name: 'Khảo sát', color: null },
  ],
  publishedAt: new Date(2026, 8, 28),
  deliveredAt: new Date(2026, 8, 28, 9),
  ackAt: null,
  requiresAck: false,
  isNew: false,
  updatedAfterDelivery: false,
  seriesId: null,
  hasAttachments: false,
  ...over,
})

describe('toVarsRows / toInboxDetail', () => {
  it('keeps row objects as text and drops anything that is not a row', () => {
    expect(api.toVarsRows([{ A: 'x', B: 5, C: null }, 'junk', null, [1]])).toEqual([{ A: 'x', B: '5', C: null }])
    expect(api.toVarsRows(undefined)).toEqual([])
    expect(api.toVarsRows({ A: 1 })).toEqual([])
  })

  it('maps the raw detail JSON (ISO dates, vars rows, series history)', () => {
    const detail = api.toInboxDetail({
      id: 'd1',
      title: 'T',
      deliveredAt: '2026-09-28T02:00:00Z',
      bodyMd: 'Xin chào :var[A]',
      vars: [{ A: 'một' }, { A: 'hai' }],
      attachments: [{ fileId: 'f1', fileName: 'a.pdf', contentType: 'application/pdf', sizeBytes: 10 }],
      series: { id: 3, name: 'S', previous: [{ id: 'p1', title: 'Kỳ trước', publishedAt: '2025-09-28T02:00:00Z' }] },
    })
    expect(detail.deliveredAt).toEqual(new Date('2026-09-28T02:00:00Z'))
    expect(detail.ackAt).toBeNull()
    expect(detail.vars).toHaveLength(2)
    expect(detail.series?.previous[0]).toMatchObject({ id: 'p1', title: 'Kỳ trước' })
    expect(detail.attachments[0].sizeBytes).toBe(10)
  })
})

describe('cache helpers', () => {
  const seeded = () => {
    const qc = new QueryClient()
    const data: InfiniteData<InboxPage, string | undefined> = {
      pages: [{ items: [item(), item({ id: 'n2' })], nextCursor: null }],
      pageParams: [undefined],
    }
    qc.setQueryData(inboxKeys.list(EMPTY_FILTERS), data)
    qc.setQueryData(inboxKeys.list({ ...EMPTY_FILTERS, q: 'x' }), data)
    return qc
  }

  it('patches one item in every cached list', () => {
    const qc = seeded()
    patchInboxItem(qc, 'n1', (i) => ({ ...i, ackAt: new Date(2026, 9, 1) }))
    for (const key of [inboxKeys.list(EMPTY_FILTERS), inboxKeys.list({ ...EMPTY_FILTERS, q: 'x' })]) {
      const page = qc.getQueryData<InfiniteData<InboxPage>>(key)!.pages[0]
      expect(page.items[0].ackAt).toEqual(new Date(2026, 9, 1))
      expect(page.items[1].ackAt).toBeNull()
    }
  })
})

describe('ack mutation', () => {
  const wrapperFor = (qc: QueryClient) =>
    function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    }

  const firstItem = (qc: QueryClient) => qc.getQueryData<InfiniteData<InboxPage>>(inboxKeys.list(EMPTY_FILTERS))!.pages[0].items[0]

  beforeEach(() => vi.clearAllMocks())

  it('sets ackAt in the cache straight away', async () => {
    const qc = new QueryClient()
    qc.setQueryData(inboxKeys.list(EMPTY_FILTERS), {
      pages: [{ items: [item({ requiresAck: true })], nextCursor: null }],
      pageParams: [undefined],
    })
    vi.mocked(api.postAck).mockResolvedValue(undefined)
    const { result } = renderHook(() => useAcknowledge(), { wrapper: wrapperFor(qc) })
    act(() => result.current.mutate('n1'))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.postAck).toHaveBeenCalledWith('n1')
    expect(firstItem(qc).ackAt).not.toBeNull()
  })
})

describe('InboxRow', () => {
  const renderRow = (over: Partial<InboxItem>) =>
    renderWithTheme(
      <MemoryRouter>
        <InboxRow item={item(over)} search="?q=a" />
      </MemoryRouter>,
    )

  it('links to the detail keeping the list query and has no read state', () => {
    renderRow({})
    const row = screen.getByTestId('inbox-row')
    expect(row).toHaveAttribute('href', '/tin-tuc/n1?q=a')
    expect(row).not.toHaveAttribute('data-unread')
    expect(screen.queryByTestId('unread-dot')).not.toBeInTheDocument()
    expect(screen.getByText('Nâng lương 2026')).toHaveStyle({ fontWeight: '600' })
  })

  it('shows the first tag and +N for the rest, plus the date', () => {
    renderRow({})
    expect(screen.getByText('Lương')).toBeInTheDocument()
    expect(screen.getByText('+2')).toBeInTheDocument()
    expect(screen.getByText('28/09/2026')).toBeInTheDocument()
  })

  it('shows Cần xác nhận and Đã cập nhật when they apply', () => {
    renderRow({ requiresAck: true, updatedAfterDelivery: true, hasAttachments: true })
    expect(screen.getByText('Cần xác nhận')).toBeInTheDocument()
    expect(screen.getByText('Đã cập nhật')).toBeInTheDocument()
    expect(screen.getByTitle('Có tệp đính kèm')).toBeInTheDocument()
  })

  it('hides Cần xác nhận once acknowledged', () => {
    renderRow({ requiresAck: true, ackAt: new Date() })
    expect(screen.queryByText('Cần xác nhận')).not.toBeInTheDocument()
  })
})
