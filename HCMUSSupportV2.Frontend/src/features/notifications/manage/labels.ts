import { formatDateTime, joinParts } from '../../../lib/format'
import type { EmployeeRef, ManageItem } from './manageTypes'

/** "Nguyễn Văn A · T0001" */
export const employeeLabel = (e: Pick<EmployeeRef, 'code' | 'fullName'>) => joinParts([e.fullName, e.code])

/** The date that matters for the state: when it went out, or when the draft was last edited. */
export function rowDateLabel(item: ManageItem): string {
  if (item.status === 'published' && item.publishedAt) return `Đăng ${formatDateTime(item.publishedAt)}`
  return `Sửa ${formatDateTime(item.updatedAt)}`
}
