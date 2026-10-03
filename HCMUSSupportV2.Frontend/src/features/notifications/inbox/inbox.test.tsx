import { screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { renderWithTheme } from '../../../test/render'
import * as api from './inboxApi'
import InboxRow from './InboxRow'
import type { InboxItem } from './inboxTypes'

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
  isNew: false,
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
    expect(detail.isNew).toBe(false)
    expect(detail.vars).toHaveLength(2)
    expect(detail.series?.previous[0]).toMatchObject({ id: 'p1', title: 'Kỳ trước' })
    expect(detail.attachments[0].sizeBytes).toBe(10)
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
    expect(row).toHaveAttribute('href', '/news/n1?q=a')
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

  it('shows the attachment icon', () => {
    renderRow({ hasAttachments: true })
    expect(screen.getByTitle('Có tệp đính kèm')).toBeInTheDocument()
  })
})
