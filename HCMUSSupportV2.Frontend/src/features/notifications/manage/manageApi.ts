import {
  AudienceEstimateRequest,
  AudienceLookupClient,
  GroupsClient,
  ManageNotificationsClient,
  ManageSeriesClient,
  ManageTagsClient,
  NotificationWriteRequest,
  SeriesRequest,
  TagRequest,
} from '../../../api/generated-client'
import type * as G from '../../../api/generated-client'
import { clientFetch, http } from '../../../api/http'
import type { VarsRow } from '../body/remarkVars'
import type {
  DeclaredVariable,
  EmployeeRef,
  GroupRef,
  ImportColumn,
  ImportReport,
  ManageAttachment,
  ManageDetail,
  ManageItem,
  ManagePage,
  ManageRevision,
  ManageSeries,
  ManageStats,
  ManageTag,
  NotificationStatus,
  PersonRef,
  PreviewVars,
  RecipientImport,
  VariableType,
  WriteRequest,
} from './manageTypes'

/*
 * Editor calls: the generated clients (`/api/manage/notifications|tags|series|groups`) mapped to plain view models.
 * Only `preview-vars` is hand-written: its `rows` is the abstract `JsonNode` in the generated client, whose `fromJS` throws.
 */

const notificationsApi = new ManageNotificationsClient(undefined, clientFetch)
const tagsApi = new ManageTagsClient(undefined, clientFetch)
const seriesApi = new ManageSeriesClient(undefined, clientFetch)
const groupsApi = new GroupsClient(undefined, clientFetch)
const lookupApi = new AudienceLookupClient(undefined, clientFetch)

export const PAGE_SIZE = 20

const STATUSES: readonly string[] = ['draft', 'published']
const toStatus = (s: string | undefined): NotificationStatus => (STATUSES.includes(s ?? '') ? (s as NotificationStatus) : 'draft')
const toDate = (v: Date | string | undefined | null): Date | null => {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

export function toTag(t: G.ITagDto): ManageTag {
  return { id: t.id ?? 0, name: t.name ?? '', color: t.color ?? null, sort: t.sort ?? 0 }
}

export function toSeries(s: G.ISeriesDto): ManageSeries {
  return { id: s.id ?? 0, name: s.name ?? '', description: s.description ?? null }
}

const VARIABLE_TYPES: readonly string[] = ['text', 'date', 'number', 'money']
const toVariable = (v: G.IVariableDto): DeclaredVariable => ({
  key: v.key ?? '',
  label: v.label ?? v.key ?? '',
  type: (VARIABLE_TYPES.includes(v.type ?? '') ? v.type : 'text') as VariableType,
})
const toPerson = (p: G.IPersonRef | undefined): PersonRef | null => (p ? { code: p.code ?? '', fullName: p.fullName ?? null } : null)

export function toManageItem(d: G.IManageNotificationListItem): ManageItem {
  return {
    id: d.id ?? '',
    title: d.title ?? '',
    status: toStatus(d.status),
    seriesId: d.seriesId ?? null,
    seriesName: d.seriesName ?? null,
    tags: (d.tags ?? []).map(toTag),
    publishedAt: toDate(d.publishedAt),
    audienceAll: d.audienceAll ?? false,
    recipientCount: d.recipientCount ?? 0,
    version: d.version ?? 1,
    updatedAt: toDate(d.updatedAt) ?? new Date(0),
  }
}

export function toManageDetail(d: G.IManageNotificationDto): ManageDetail {
  const audience = d.audience
  const imp = audience?.import
  return {
    id: d.id ?? '',
    title: d.title ?? '',
    summary: d.summary ?? '',
    summaryIsCustom: d.summaryIsCustom ?? false,
    bodyMd: d.bodyMd ?? '',
    variables: (d.variables ?? []).map(toVariable),
    status: toStatus(d.status),
    seriesId: d.seriesId ?? null,
    seriesName: d.seriesName ?? null,
    tags: (d.tags ?? []).map(toTag),
    publishedAt: toDate(d.publishedAt),
    audienceAll: audience?.all ?? false,
    groups: (audience?.groups ?? []).map((g) => ({ id: g.id ?? 0, name: g.name ?? '', memberCount: g.memberCount ?? 0 })),
    employees: (audience?.employees ?? []).map((e) => ({ code: e.code ?? '', fullName: e.fullName ?? null, status: e.status ?? null })),
    import: imp
      ? {
          importId: imp.importId ?? '',
          status: imp.status ?? '',
          rows: imp.rows ?? 0,
          distinctEmployees: imp.distinctEmployees ?? 0,
          appliedAt: toDate(imp.appliedAt),
        }
      : null,
    attachments: (d.attachments ?? []).map(toAttachment),
    recipientCount: d.recipientCount ?? 0,
    version: d.version ?? 1,
    createdBy: toPerson(d.createdBy),
    updatedBy: toPerson(d.updatedBy),
    createdAt: toDate(d.createdAt) ?? new Date(0),
    updatedAt: toDate(d.updatedAt) ?? new Date(0),
  }
}

const toAttachment = (a: G.IAttachmentDto): ManageAttachment => ({
  id: a.id ?? '',
  fileId: a.fileId ?? '',
  fileName: a.fileName ?? '',
  contentType: a.contentType ?? '',
  sizeBytes: a.sizeBytes ?? 0,
})

function toReport(r: G.IImportReport | undefined): ImportReport {
  return {
    fileName: r?.fileName ?? null,
    mscbColumn: r?.mscbColumn ?? null,
    rows: r?.rows ?? 0,
    distinctEmployees: r?.distinctEmployees ?? 0,
    employeesWithMultipleRows: r?.employeesWithMultipleRows ?? 0,
    columns: (r?.columns ?? []).map((c): ImportColumn => ({ key: c.key ?? '', label: c.label ?? '', header: c.header ?? '' })),
    unknownCodes: r?.unknownCodes ?? [],
    unknownCodeCount: r?.unknownCodeCount ?? 0,
    inactiveCodes: r?.inactiveCodes ?? [],
    inactiveCodeCount: r?.inactiveCodeCount ?? 0,
    duplicateRowCodes: r?.duplicateRowCodes ?? [],
    duplicateRows: r?.duplicateRows ?? 0,
    rowsWithoutCode: r?.rowsWithoutCode ?? 0,
    missingInFile: r?.missingInFile ?? [],
    unusedColumns: r?.unusedColumns ?? [],
    errors: r?.errors ?? [],
    canApply: r?.canApply ?? false,
  }
}

const toImport = (r: G.IRecipientImportDto): RecipientImport => ({ importId: r.importId ?? '', status: r.status ?? '', report: toReport(r.report) })

// ------------------------------------------------------------------ notifications

export interface ManageListQuery {
  status: string
  tag: number | null
  series: number | null
  q: string
}

export async function fetchManagePage(query: ManageListQuery, cursor: string | undefined): Promise<ManagePage> {
  const page = await notificationsApi.list(query.status || undefined, query.tag ?? undefined, query.series ?? undefined, query.q || undefined, cursor, PAGE_SIZE)
  return { items: (page.items ?? []).map(toManageItem), nextCursor: page.nextCursor ?? null }
}

export async function fetchManageDetail(id: string): Promise<ManageDetail> {
  return toManageDetail(await notificationsApi.get(id))
}

const toRequest = (r: WriteRequest) => NotificationWriteRequest.fromJS(r)

export async function createNotification(request: WriteRequest): Promise<ManageDetail> {
  return toManageDetail(await notificationsApi.create(toRequest(request)))
}

export async function updateNotification(id: string, request: WriteRequest): Promise<ManageDetail> {
  return toManageDetail(await notificationsApi.update(id, toRequest(request)))
}

export const deleteNotification = (id: string) => notificationsApi.delete(id)
export const publishNotification = async (id: string) => toManageDetail(await notificationsApi.publish(id))
export const cloneNotification = async (id: string) => toManageDetail(await notificationsApi.clone(id))

export async function fetchRevisions(id: string): Promise<ManageRevision[]> {
  return (await notificationsApi.revisions(id)).map((r) => ({
    version: r.version ?? 0,
    title: r.title ?? '',
    summary: r.summary ?? '',
    bodyMd: r.bodyMd ?? '',
    variables: (r.variables ?? []).map(toVariable),
    editedBy: toPerson(r.editedBy),
    editedAt: toDate(r.editedAt) ?? new Date(0),
  }))
}

export async function fetchStats(id: string): Promise<ManageStats> {
  const s = await notificationsApi.stats(id)
  return { recipientCount: s.recipientCount ?? 0, fetchedCount: s.fetchedCount ?? 0, openedCount: s.openedCount ?? 0 }
}

interface PreviewVarsJson {
  employeeCode?: string
  fullName?: string | null
  employeeExists?: boolean
  source?: string
  importId?: string | null
  rows?: unknown
  inAudience?: boolean
  audienceReasons?: string[]
  inPendingImport?: boolean
}

/** Rows arrive as an array of objects (one per sheet row of that MSCB); values are shown as text. */
export function toRows(raw: unknown): VarsRow[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : []
  return list
    .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null && !Array.isArray(r))
    .map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === null || v === undefined ? null : String(v)])))
}

export async function fetchPreviewVars(id: string, employee: string, importId?: string | null): Promise<PreviewVars> {
  const q = new URLSearchParams({ employee })
  if (importId) q.set('importId', importId)
  const d = await http.get<PreviewVarsJson>(`/api/manage/notifications/${encodeURIComponent(id)}/preview-vars?${q}`)
  const source = d.source === 'applied' || d.source === 'pending' ? d.source : 'none'
  return {
    employeeCode: d.employeeCode ?? employee,
    fullName: d.fullName ?? null,
    employeeExists: d.employeeExists ?? false,
    source,
    importId: d.importId ?? null,
    rows: toRows(d.rows),
    inAudience: d.inAudience ?? false,
    audienceReasons: d.audienceReasons ?? [],
    inPendingImport: d.inPendingImport ?? false,
  }
}

export async function uploadRecipients(id: string, file: File): Promise<RecipientImport> {
  return toImport(await notificationsApi.importRecipients(id, { data: file, fileName: file.name }))
}

export const applyRecipientImport = async (id: string, importId: string) => toManageDetail(await notificationsApi.applyImport(id, importId))

export const recipientTemplateUrl = (id: string) => `/api/manage/notifications/${encodeURIComponent(id)}/recipients/template`

export async function uploadAttachment(id: string, file: File): Promise<ManageAttachment> {
  return toAttachment(await notificationsApi.addAttachment(id, { data: file, fileName: file.name }))
}

export const deleteAttachment = (id: string, attachmentId: string) => notificationsApi.deleteAttachment(id, attachmentId)

/** The body image button: uploads and resolves to the `/api/files/{id}` URL the Markdown must reference. */
export async function uploadBodyImage(file: File): Promise<string> {
  const r = await notificationsApi.uploadImage({ data: file, fileName: file.name })
  if (!r.url) throw new Error('Không tải được ảnh lên.')
  return r.url
}

// ------------------------------------------------------------------ audience helpers

export async function estimateAudience(input: { audienceAll: boolean; groupIds: number[]; employeeCodes: string[]; importId: string | null }): Promise<number> {
  const r = await lookupApi.estimate(AudienceEstimateRequest.fromJS({ audienceAll: input.audienceAll, groupIds: input.groupIds, employeeCodes: input.employeeCodes, importId: input.importId ?? undefined }))
  return r.count ?? 0
}

export async function searchEmployees(q: string): Promise<EmployeeRef[]> {
  return (await lookupApi.employees(q || undefined, 20)).map((e) => ({
    code: e.code ?? '',
    fullName: e.fullName ?? null,
    status: e.status ?? null,
    unit: e.unit ?? null,
  }))
}

export async function searchGroups(q: string): Promise<GroupRef[]> {
  const page = await groupsApi.list(q || undefined, undefined, false, undefined, 30)
  return (page.items ?? []).map((g) => ({ id: g.id ?? 0, name: g.name ?? '', memberCount: g.memberCount ?? 0 }))
}

// ------------------------------------------------------------------ tags and series

export async function fetchManageTags(): Promise<ManageTag[]> {
  return (await tagsApi.list()).map(toTag)
}
export async function saveTag(id: number | null, input: { name: string; color: string | null }): Promise<ManageTag> {
  const body = TagRequest.fromJS({ name: input.name, color: input.color ?? undefined })
  return toTag(id === null ? await tagsApi.create(body) : await tagsApi.update(id, body))
}
export const deleteTag = (id: number) => tagsApi.delete(id)

export async function fetchManageSeries(): Promise<ManageSeries[]> {
  return (await seriesApi.list()).map(toSeries)
}
export async function saveSeries(id: number | null, input: { name: string; description: string }): Promise<ManageSeries> {
  const body = SeriesRequest.fromJS({ name: input.name, description: input.description || undefined })
  return toSeries(id === null ? await seriesApi.create(body) : await seriesApi.update(id, body))
}
export const deleteSeries = (id: number) => seriesApi.delete(id)
