import { http } from '../../api/http'

/**
 * Hand-written calls for the D04 admin endpoints (`sync-runs`, `sync-issues`, `datasets`), which are not in the
 * generated client yet. Replace with a generated `SyncAdminClient` / `DatasetsClient` after the next regeneration.
 */

export interface Page<T> {
  items: T[]
  nextCursor?: string | number | null
}

export interface SyncRun {
  id: number
  source: string
  dataset: string
  startedAt: string
  finishedAt?: string | null
  status: string
  received: number
  inserted: number
  updated: number
  deleted: number
  error?: string | null
  issueCount: number
  openIssueCount: number
}

export interface SyncIssue {
  id: number
  syncRunId: number
  dataset: string
  kind: string
  sourceKey: string
  detailsJson?: string | null
  createdAt: string
  resolvedAt?: string | null
  resolvedBy?: string | null
}

export type DatasetName = 'teaching' | 'research' | 'publications'

export interface DatasetImportIssue {
  row: number
  column: string
  message: string
}

export interface DatasetImportReport {
  id: string
  dataset: string
  status: string
  fileName: string
  totalRows: number
  newRows: number
  updatedRows: number
  removedRows: number
  unknownMscbs: string[]
  badValues: DatasetImportIssue[]
  academicYears: string[]
}

function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const hrmAdmin = {
  syncRuns: (cursor?: string | number | null) =>
    http.get<Page<SyncRun>>(`/api/admin/sync-runs${qs({ cursor, limit: 20 })}`),
  syncIssues: (resolved: boolean | undefined, cursor?: string | number | null) =>
    http.get<Page<SyncIssue>>(`/api/admin/sync-issues${qs({ resolved, cursor, limit: 30 })}`),
  resolveIssue: (id: number) => http.put<SyncIssue>(`/api/admin/sync-issues/${id}/resolve`),
  templateUrl: (dataset: DatasetName) => `/api/admin/datasets/${dataset}/template`,
  importDataset: (dataset: DatasetName, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return http.post<DatasetImportReport>(`/api/admin/datasets/${dataset}/import`, form)
  },
  applyImport: (id: string) => http.post<DatasetImportReport>(`/api/admin/datasets/imports/${id}/apply`),
}
