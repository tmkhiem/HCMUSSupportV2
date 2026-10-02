import { htmlToPlainText, normalizeText } from './htmlToMarkdown.ts'

export type V1Rows = Record<string, unknown>[]
export type V1Values = Record<string, V1Rows>

export interface CleanedValue {
  text: string
  /** The value held HTML tags (they were reduced to text). */
  hadTags: boolean
}

const TAG_LIKE = /<\/?[A-Za-z!][^>]*>/
const ENTITY_LIKE = /&(#\d+|#x[0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]{1,31});/

/**
 * Cleans one v1 value: trims the fixed-width padding, collapses inner whitespace and decodes entities. A value that
 * carries HTML is reduced to its text (v2 renders variables as text nodes, so tags would show up literally); `<br>` and
 * the boundary between list items become " ; ".
 */
export function cleanValue(raw: unknown): CleanedValue {
  let s = raw == null ? '' : String(raw)
  let hadTags = false
  if (TAG_LIKE.test(s)) {
    hadTags = true
    s = s.replace(/<\/li\s*>\s*<li[^>]*>/gi, ' ; ').replace(/<br\s*\/?>/gi, ' ; ')
    s = htmlToPlainText(s)
    s = s.replace(/(\s*;\s*){2,}/g, ' ; ').replace(/^\s*;\s*/, '').replace(/\s*;\s*$/, '')
  } else if (ENTITY_LIKE.test(s)) {
    s = htmlToPlainText(s)
  }
  return { text: normalizeText(s).trim(), hadTags }
}

export interface RecipientsResult {
  /** MSCB to rows keyed by variable key. Empty values are left out. */
  recipients: Record<string, Record<string, string>[]>
  recipientCount: number
  rowCount: number
  /** Values that held HTML tags. */
  htmlValues: number
  /** Cleaned non-empty values per column name, for type guessing. */
  samples: Map<string, string[]>
}

/** Maps v1 `values` to the payload shape: column names become variable keys, values are cleaned. */
export function mapRecipients(values: V1Values, keyOf: ReadonlyMap<string, string>): RecipientsResult {
  const recipients: Record<string, Record<string, string>[]> = {}
  const samples = new Map<string, string[]>()
  let rowCount = 0
  let htmlValues = 0
  for (const [rawId, rows] of Object.entries(values ?? {})) {
    const id = rawId.trim()
    if (id.length === 0) continue
    const mapped: Record<string, string>[] = []
    for (const row of rows ?? []) {
      const out: Record<string, string> = {}
      for (const [column, raw] of Object.entries(row ?? {})) {
        const key = keyOf.get(column)
        if (!key) continue
        const cleaned = cleanValue(raw)
        if (cleaned.hadTags) htmlValues++
        if (cleaned.text.length === 0) continue
        out[key] = cleaned.text
        let list = samples.get(column)
        if (!list) samples.set(column, (list = []))
        list.push(cleaned.text)
      }
      mapped.push(out)
    }
    recipients[id] = mapped
    rowCount += mapped.length
  }
  return { recipients, recipientCount: Object.keys(recipients).length, rowCount, htmlValues, samples }
}
