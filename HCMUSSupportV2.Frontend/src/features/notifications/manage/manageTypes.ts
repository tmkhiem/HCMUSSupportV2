import type { VarsRow } from '../body/remarkVars'

/** View models of the editor side of notifications (`/api/manage/...`). The mappers are in `manageApi.ts`. */

export type NotificationStatus = 'draft' | 'scheduled' | 'published' | 'archived'

export const STATUS_LABEL: Record<NotificationStatus, string> = {
  draft: 'Bản nháp',
  scheduled: 'Đã lên lịch',
  published: 'Đã đăng',
  archived: 'Đã lưu trữ',
}

export const STATUS_ORDER: readonly NotificationStatus[] = ['draft', 'scheduled', 'published', 'archived']

export type VariableType = 'text' | 'date' | 'number' | 'money'

export const VARIABLE_TYPE_LABEL: Record<VariableType, string> = {
  text: 'Văn bản',
  date: 'Ngày',
  number: 'Số',
  money: 'Tiền',
}

export interface ManageTag {
  id: number
  name: string
  color: string | null
  sort: number
}

export interface ManageSeries {
  id: number
  name: string
  description: string | null
}

export interface ManageItem {
  id: string
  title: string
  status: NotificationStatus
  seriesId: number | null
  seriesName: string | null
  tags: ManageTag[]
  publishAt: Date | null
  publishedAt: Date | null
  expiresAt: Date | null
  audienceAll: boolean
  recipientCount: number
  version: number
  updatedAt: Date
}

export interface ManagePage {
  items: ManageItem[]
  nextCursor: string | null
}

export interface DeclaredVariable {
  key: string
  label: string
  type: VariableType
}

export interface GroupRef {
  id: number
  name: string
  memberCount: number
}

export interface EmployeeRef {
  code: string
  fullName: string | null
  status?: string | null
  unit?: string | null
}

export interface ImportSummary {
  importId: string
  status: string
  rows: number
  distinctEmployees: number
  appliedAt: Date | null
}

export interface ManageAttachment {
  id: string
  fileId: string
  fileName: string
  contentType: string
  sizeBytes: number
}

export interface PersonRef {
  code: string
  fullName: string | null
}

export interface ManageDetail {
  id: string
  title: string
  summary: string
  summaryIsCustom: boolean
  bodyMd: string
  variables: DeclaredVariable[]
  status: NotificationStatus
  seriesId: number | null
  seriesName: string | null
  tags: ManageTag[]
  publishAt: Date | null
  publishedAt: Date | null
  expiresAt: Date | null
  audienceAll: boolean
  groups: GroupRef[]
  employees: EmployeeRef[]
  import: ImportSummary | null
  attachments: ManageAttachment[]
  recipientCount: number
  version: number
  createdBy: PersonRef | null
  updatedBy: PersonRef | null
  createdAt: Date
  updatedAt: Date
}

export interface ManageRevision {
  version: number
  title: string
  summary: string
  bodyMd: string
  variables: DeclaredVariable[]
  editedBy: PersonRef | null
  editedAt: Date
}

export interface ManageStats {
  recipientCount: number
  /** Recipients whose client has fetched the notification in their inbox listing. */
  fetchedCount: number
  /** Recipients who opened the notification to read it. */
  openedCount: number
}

export interface ImportColumn {
  key: string
  label: string
  header: string
}

export interface ImportReport {
  fileName: string | null
  mscbColumn: string | null
  rows: number
  distinctEmployees: number
  employeesWithMultipleRows: number
  columns: ImportColumn[]
  unknownCodes: string[]
  unknownCodeCount: number
  inactiveCodes: string[]
  inactiveCodeCount: number
  duplicateRowCodes: string[]
  duplicateRows: number
  rowsWithoutCode: number
  missingInFile: string[]
  unusedColumns: string[]
  errors: string[]
  canApply: boolean
}

export interface RecipientImport {
  importId: string
  status: string
  report: ImportReport
}

export interface PreviewVars {
  employeeCode: string
  fullName: string | null
  employeeExists: boolean
  /** `applied` (the sheet is the audience), `pending` (validated, not applied yet) or `none`. */
  source: 'applied' | 'pending' | 'none'
  importId: string | null
  rows: VarsRow[]
  inAudience: boolean
  /** `all`, `group:<name>`, `employee`, `import`. */
  audienceReasons: string[]
  inPendingImport: boolean
}

/** What the form edits. Dates are ISO strings (or null). The applied import is kept by the server, not part of this. */
export interface DraftForm {
  title: string
  summary: string
  bodyMd: string
  variables: DeclaredVariable[]
  seriesId: number | null
  tagIds: number[]
  expiresAt: string | null
  audienceAll: boolean
  groups: GroupRef[]
  employees: EmployeeRef[]
}

export interface WriteRequest {
  version?: number
  title: string
  seriesId: number | null
  summary: string
  bodyMd: string
  variables: DeclaredVariable[]
  tagIds: number[]
  expiresAt: string | null
  audienceAll: boolean
  groupIds: number[]
  employeeCodes: string[]
}
