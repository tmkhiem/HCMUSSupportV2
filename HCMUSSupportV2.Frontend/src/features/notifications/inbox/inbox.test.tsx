import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { InfiniteData } from '@tanstack/react-query'
import { act, renderHook, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithTheme } from '../../../test/render'
import * as api from './inboxApi'
import { cachedUnread, inboxKeys, patchAllRead, patchInboxItem } from './inboxCache'
import { EMPTY_FILTERS } from './inboxFilters'
import { useAcknowledge, useMarkRead } from './inboxQueries'
import InboxRow from './InboxRow'
import type { InboxItem, InboxPage } from './inboxTypes'

vi.mock('./inboxApi', async (orig) => {
  const actual = await orig<typeof import('./inboxApi')>()
  return { ...actual, postRead: vi.fn(), postAck: vi.fn(), postReadAll: vi.fn() }
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
  readAt: null,
  ackAt: null,
  requiresAck: false,
  pinned: false,
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
      readAt: undefined,
      bodyMd: 'Xin chào :var[A]',
      vars: [{ A: 'một' }, { A: 'hai' }],
      attachments: [{ fileId: 'f1', fileName: 'a.pdf', contentType: 'application/pdf', sizeBytes: 10 }],
      series: { id: 3, name: 'S', previous: [{ id: 'p1', title: 'Kỳ trước', publishedAt: '2025-09-28T02:00:00Z' }] },
    })
    expect(detail.deliveredAt).toEqual(new Date('2026-09-28T02:00:00Z'))
    expect(detail.readAt).toBeNull()
    expect(detail.vars).toHaveLength(2)
    expect(detail.series?.previous[0]).toMatchObject({ id: 'p1', title: 'Kỳ trước' })
    expect(detail.attachments[0].sizeBytes).toBe(10)
  })
})

describe('cache helpers', () => {
  const seeded = () => {
    const qc = new QueryClient()
    const data: InfiniteData<InboxPage, string | undefined> = {
      pages: [{ items: [item(), item({ id: 'n2', readAt: new Date() })], nextCursor: null }],
      pageParams: [undefined],
    }
    qc.setQueryData(inboxKeys.list(EMPTY_FILTERS), data)
    qc.setQueryData(inboxKeys.list({ ...EMPTY_FILTERS, unread: true }), data)
    return qc
  }

  it('reads the unread state of a cached item', () => {
    const qc = seeded()
    expect(cachedUnread(qc, 'n1')).toBe(true)
    expect(cachedUnread(qc, 'n2')).toBe(false)
    expect(cachedUnread(qc, 'missing')).toBeUndefined()
  })

  it('patches one item in every cached list', () => {
    const qc = seeded()
    patchInboxItem(qc, 'n1', (i) => ({ ...i, readAt: new Date(2026, 9, 1) }))
    for (const key of [inboxKeys.list(EMPTY_FILTERS), inboxKeys.list({ ...EMPTY_FILTERS, unread: true })]) {
      const page = qc.getQueryData<InfiniteData<InboxPage>>(key)!.pages[0]
      expect(page.items[0].readAt).toEqual(new Date(2026, 9, 1))
    }
  })

  it('marks everything read but keeps earlier read times', () => {
    const qc = seeded()
    const earlier = qc.getQueryData<InfiniteData<InboxPage>>(inboxKeys.list(EMPTY_FILTERS))!.pages[0].items[1].readAt
    patchAllRead(qc, new Date(2030, 0, 1))
    const items = qc.getQueryData<InfiniteData<InboxPage>>(inboxKeys.list(EMPTY_FILTERS))!.pages[0].items
    expect(items[0].readAt).toEqual(new Date(2030, 0, 1))
    expect(items[1].readAt).toEqual(earlier)
  })
})

describe('read and ack mutations', () => {
  const wrapperFor = (qc: QueryClient) =>
    function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    }

  const seed = (qc: QueryClient, over: Partial<InboxItem> = {}) => {
    qc.setQueryData(inboxKeys.unread, 5)
    qc.setQueryData(inboxKeys.list(EMPTY_FILTERS), {
      pages: [{ items: [item(over)], nextCursor: null }],
      pageParams: [undefined],
    })
  }
  const firstItem = (qc: QueryClient) => qc.getQueryData<InfiniteData<InboxPage>>(inboxKeys.list(EMPTY_FILTERS))!.pages[0].items[0]

  beforeEach(() => vi.clearAllMocks())

  it('read: drops the dot and the badge at once, then takes the server count', async () => {
    const qc = new QueryClient()
    seed(qc)
    let resolve!: (n: number) => void
    vi.mocked(api.postRead).mockReturnValue(new Promise<number>((r) => (resolve = r)))
    const { result } = renderHook(() => useMarkRead(), { wrapper: wrapperFor(qc) })

    act(() => result.current.mutate('n1'))
    await waitFor(() => expect(firstItem(qc).readAt).not.toBeNull())
    expect(qc.getQueryData(inboxKeys.unread)).toBe(4)

    await act(async () => resolve(2))
    await waitFor(() => expect(qc.getQueryData(inboxKeys.unread)).toBe(2))
  })

  it('read: an item that was already read does not move the badge', async () => {
    const qc = new QueryClient()
    seed(qc, { readAt: new Date() })
    vi.mocked(api.postRead).mockResolvedValue(5)
    const { result } = renderHook(() => useMarkRead(), { wrapper: wrapperFor(qc) })
    act(() => result.current.mutate('n1'))
    await waitFor(() => expect(api.postRead).toHaveBeenCalledWith('n1'))
    expect(qc.getQueryData(inboxKeys.unread)).toBe(5)
  })

  it('ack: sets ackAt and readAt in the cache and decrements once', async () => {
    const qc = new QueryClient()
    seed(qc, { requiresAck: true })
    vi.mocked(api.postAck).mockResolvedValue(4)
    const { result } = renderHook(() => useAcknowledge(), { wrapper: wrapperFor(qc) })
    act(() => result.current.mutate('n1'))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(firstItem(qc).ackAt).not.toBeNull()
    expect(firstItem(qc).readAt).not.toBeNull()
    expect(qc.getQueryData(inboxKeys.unread)).toBe(4)
  })
})

describe('InboxRow', () => {
  const renderRow = (over: Partial<InboxItem>) =>
    renderWithTheme(
      <MemoryRouter>
        <InboxRow item={item(over)} search="?q=a" />
      </MemoryRouter>,
    )

  it('an unread row is bold, has the dot and links to the detail keeping the list query', () => {
    renderRow({})
    const row = screen.getByTestId('inbox-row')
    expect(row).toHaveAttribute('data-unread', 'true')
    expect(screen.getByTestId('unread-dot')).toBeInTheDocument()
    expect(row).toHaveAttribute('href', '/tin-tuc/n1?q=a')
    expect(screen.getByText('Nâng lương 2026')).toHaveStyle({ fontWeight: '800' })
  })

  it('a read row has no dot and a normal-weight title', () => {
    renderRow({ readAt: new Date() })
    expect(screen.getByTestId('inbox-row')).toHaveAttribute('data-unread', 'false')
    expect(screen.queryByTestId('unread-dot')).not.toBeInTheDocument()
    expect(screen.getByText('Nâng lương 2026')).toHaveStyle({ fontWeight: '500' })
  })

  it('shows the first tag and +N for the rest, plus the date', () => {
    renderRow({})
    expect(screen.getByText('Lương')).toBeInTheDocument()
    expect(screen.getByText('+2')).toBeInTheDocument()
    expect(screen.getByText('28/09/2026')).toBeInTheDocument()
  })

  it('shows Ghim, Cần xác nhận and Đã cập nhật when they apply', () => {
    renderRow({ pinned: true, requiresAck: true, updatedAfterDelivery: true, hasAttachments: true })
    expect(screen.getByText('Ghim')).toBeInTheDocument()
    expect(screen.getByText('Cần xác nhận')).toBeInTheDocument()
    expect(screen.getByText('Đã cập nhật')).toBeInTheDocument()
    expect(screen.getByTitle('Có tệp đính kèm')).toBeInTheDocument()
  })

  it('hides Cần xác nhận once acknowledged', () => {
    renderRow({ requiresAck: true, ackAt: new Date() })
    expect(screen.queryByText('Cần xác nhận')).not.toBeInTheDocument()
  })
})
