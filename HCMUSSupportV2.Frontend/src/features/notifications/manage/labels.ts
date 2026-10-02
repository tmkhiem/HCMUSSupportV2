import { formatDateTime, joinParts } from '../../../lib/format'
import type { EmployeeRef, ManageItem } from './manageTypes'

/** "Nguyễn Văn A · T0001" */
export const employeeLabel = (e: Pick<EmployeeRef, 'code' | 'fullName'>) => joinParts([e.fullName, e.code])

/** The date that matters for the state: when it went out, when it will, or when it was last edited. */
export function rowDateLabel(item: ManageItem): string {
  if (item.status === 'scheduled' && item.publishAt) return `Đăng lúc ${formatDateTime(item.publishAt)}`
  if ((item.status === 'published' || item.status === 'archived') && item.publishedAt) return `Đăng ${formatDateTime(item.publishedAt)}`
  return `Sửa ${formatDateTime(item.updatedAt)}`
}
