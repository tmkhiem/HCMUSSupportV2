import type { VarsRow } from '../body/remarkVars'

/** Plain shapes the inbox UI works with (the generated DTOs have every field optional and `Date | undefined`). */

export interface InboxTag {
  id: number
  name: string
  color: string | null
}

export interface InboxItem {
  id: string
  title: string
  summary: string
  tags: InboxTag[]
  publishedAt: Date | null
  deliveredAt: Date
  readAt: Date | null
  ackAt: Date | null
  requiresAck: boolean
  pinned: boolean
  updatedAfterDelivery: boolean
  seriesId: number | null
  hasAttachments: boolean
}

export interface InboxAttachment {
  fileId: string
  fileName: string
  contentType: string
  sizeBytes: number
}

export interface SeriesPrevious {
  id: string
  title: string
  publishedAt: Date | null
}

export interface InboxSeries {
  id: number
  name: string
  previous: SeriesPrevious[]
}

export interface InboxVariable {
  key: string
  label: string | null
  type: string | null
}

export interface InboxDetail extends InboxItem {
  bodyMd: string
  variables: InboxVariable[]
  /** One object per row; empty when the post has no per-recipient values. */
  vars: VarsRow[]
  attachments: InboxAttachment[]
  series: InboxSeries | null
}

export interface InboxPage {
  items: InboxItem[]
  nextCursor: string | null
}

/** Whether the recipient still has to acknowledge. */
export const needsAck = (item: Pick<InboxItem, 'requiresAck' | 'ackAt'>) => item.requiresAck && !item.ackAt
export const isUnread = (item: Pick<InboxItem, 'readAt'>) => !item.readAt

/** Tooltip on the write actions while an admin is viewing as someone else (the server answers 403 to them). */
export const VIEW_AS_HINT = 'Đang xem thử: chỉ đọc, không thể thay đổi trạng thái thông báo.'
