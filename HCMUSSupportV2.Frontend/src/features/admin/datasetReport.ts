import type { ImportReportDto2 } from '../../api/generated-client'

export type DatasetName = 'teaching' | 'research' | 'publications'

/** `ImportReportDto2` with its optional fields defaulted, so the page does not repeat `?? 0` everywhere. */
export interface DatasetReport {
  id: string
  dataset: string
  status: string
  fileName: string
  totalRows: number
  newRows: number
  updatedRows: number
  removedRows: number
  unknownMscbs: string[]
  badValues: { row: number; column: string; message: string }[]
  academicYears: string[]
}

export function toReport(d: ImportReportDto2): DatasetReport {
  return {
    id: d.id ?? '',
    dataset: d.dataset ?? '',
    status: d.status ?? '',
    fileName: d.fileName ?? '',
    totalRows: d.totalRows ?? 0,
    newRows: d.newRows ?? 0,
    updatedRows: d.updatedRows ?? 0,
    removedRows: d.removedRows ?? 0,
    unknownMscbs: d.unknownMscbs ?? [],
    badValues: (d.badValues ?? []).map((b) => ({ row: b.row ?? 0, column: b.column ?? '', message: b.message ?? '' })),
    academicYears: d.academicYears ?? [],
  }
}
