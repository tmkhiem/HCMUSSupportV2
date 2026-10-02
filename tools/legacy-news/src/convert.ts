import { guessTagAndSeries, type Guess } from './classify.ts'
import { resolvePublishDate, toPublishedAt } from './dates.ts'
import { FlagBag, type Flag } from './flags.ts'
import { htmlToMarkdown, htmlToPlainText, stripTokens, type ColumnToken } from './htmlToMarkdown.ts'
import { deriveKey, deriveLabel } from './keys.ts'
import { contextLabels } from './labels.ts'
import { mapRecipients, type V1Values } from './recipients.ts'
import { analyzeBody } from './validate.ts'
import { guessVarType, type VarType } from './varTypes.ts'

/** One v1 file: `{header, template, datestr, category, values}`. */
export interface V1Post {
  header?: string | null
  template?: string | null
  datestr?: string | null
  category?: string | null
  values?: V1Values | null
}

export interface PayloadVariable {
  key: string
  label: string
  type: VarType
}

/** One item of `posts` in `POST legacy/notifications` (docs/LEGACY-MIGRATION.md). */
export interface LegacyPostPayload {
  legacyKey: string
  title: string
  summary: string | null
  bodyMd: string
  variables: PayloadVariable[]
  publishedAt: string
  audienceAll: boolean
  recipients: Record<string, Record<string, string>[]> | null
  tags: string[]
  series: string | null
  pinnedUntil: string | null
  requiresAck: boolean
  markRead: boolean
}

export interface ConvertedStats {
  recipients: number
  rows: number
  variables: number
  unusedColumns: number
  bodyChars: number
}

export interface ConvertedPost {
  /** Source file name, for the report. */
  fileName: string
  payload: LegacyPostPayload
  flags: Flag[]
  stats: ConvertedStats
  guess: Guess
}

export const TITLE_MAX = 500
export const BANNER_KEY = 'request-update-info'
export const BANNER_TITLE = 'Cập nhật thông tin cá nhân'
export const DEFAULT_BANNER_PINNED_UNTIL = '2027-12-31T23:59:59+07:00'

interface Column {
  name: string
  key: string
  label: string
}

function collectColumns(values: V1Values | null | undefined): Column[] {
  const names: string[] = []
  const seen = new Set<string>()
  for (const rows of Object.values(values ?? {})) {
    for (const row of rows ?? []) {
      for (const name of Object.keys(row ?? {})) {
        if (!seen.has(name)) {
          seen.add(name)
          names.push(name)
        }
      }
    }
  }
  const taken = new Set<string>()
  return names.map((name) => ({ name, key: deriveKey(name, taken), label: deriveLabel(name) }))
}

/** A title from a file name: no date prefix or extension, separators as spaces. */
export function titleFromFileName(fileName: string): string {
  const base = fileName
    .replace(/\.json$/i, '')
    .replace(/^\d{4}-\d{2}-\d{2}[\s_-]*/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
  return base.length === 0 ? fileName : base[0].toUpperCase() + base.slice(1)
}

function tidyTitle(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?)])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/^[\s,.;:\-–—]+|[\s,.;:\-–—]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface ConvertOptions {
  /** Banner only: the `pinnedUntil` value. */
  bannerPinnedUntil?: string
}

type Mode = 'news' | 'banner'

function convertPost(fileName: string, post: V1Post, mode: Mode, options: ConvertOptions): ConvertedPost {
  const flags = new FlagBag()
  const isBanner = mode === 'banner'

  // Columns: the banner's `{MA}` only lists ids, so it carries no variables.
  const columns = isBanner ? [] : collectColumns(post.values)
  const tokens: ColumnToken[] = columns.map((c) => ({ token: c.name, key: c.key }))

  // Body
  const converted = htmlToMarkdown(post.template ?? '', tokens, flags)
  if (converted.markdown.trim().length === 0) flags.add('empty_body', 'error')
  if (converted.unknownPlaceholders.length > 0) {
    flags.add('unknown_placeholder', 'warn', converted.unknownPlaceholders.slice(0, 5).join(' '))
  }
  const usedKeys = new Set(converted.usedKeys)
  const unusedColumns = columns.filter((c) => !usedKeys.has(c.key))
  if (unusedColumns.length > 0) flags.add('unused_columns', 'info', String(unusedColumns.length))
  // A placeholder that stands alone on its own line shows a dash whenever the value is empty.
  if (/^(?:- )?:var\[[A-Za-z0-9_]+\]$/m.test(converted.markdown)) flags.add('bare_placeholder', 'info')

  // Title
  let title: string
  if (isBanner) title = BANNER_TITLE
  else {
    const header = post.header ?? ''
    const plain = /<[^>]+>|&[#A-Za-z0-9]+;/.test(header) ? htmlToPlainText(header) : header
    if (plain !== header) flags.add('title_html', 'info')
    const stripped = stripTokens(plain, tokens)
    if (stripped.found > 0) flags.add('title_placeholder', 'warn', `${stripped.found} placeholder(s) dropped from the header`)
    title = tidyTitle(stripped.text)
    if (title.length === 0) {
      title = titleFromFileName(fileName)
      flags.add('title_from_filename', 'warn')
    }
  }
  if (title.length > TITLE_MAX) {
    title = title.slice(0, TITLE_MAX)
    flags.add('title_truncated', 'warn')
  }

  // Date
  const publish = resolvePublishDate(fileName, post.datestr)
  if (publish.flag) flags.add(publish.flag.kind, publish.flag.severity, publish.flag.detail)

  // Recipients
  const keyOf = new Map(columns.map((c) => [c.name, c.key]))
  const mapped = isBanner ? null : mapRecipients(post.values ?? {}, keyOf)
  if (mapped && mapped.htmlValues > 0) flags.add('recipient_html', 'warn', `${mapped.htmlValues} value(s) reduced to text`)
  if (mapped && mapped.recipientCount === 0) flags.add('no_recipients', 'error')

  // Variables: used ones in body order first, then the unused ones.
  const byKey = new Map(columns.map((c) => [c.key, c]))
  const contexts = contextLabels(converted.markdown)
  const variables: PayloadVariable[] = []
  const makeVariable = (c: Column): PayloadVariable => {
    const label = contexts.get(c.key) ?? c.label
    return { key: c.key, label, type: guessVarType(mapped?.samples.get(c.name) ?? [], label) }
  }
  for (const key of converted.usedKeys) {
    const c = byKey.get(key)
    if (c) variables.push(makeVariable(c))
  }
  for (const c of unusedColumns) variables.push(makeVariable(c))
  // Two columns with the same label (the same words in two sections) get their column name appended.
  const labelCount = new Map<string, number>()
  for (const v of variables) labelCount.set(v.label.toLowerCase(), (labelCount.get(v.label.toLowerCase()) ?? 0) + 1)
  for (const v of variables) {
    if ((labelCount.get(v.label.toLowerCase()) ?? 0) > 1) v.label = `${v.label} (${byKey.get(v.key)?.label ?? v.key})`.slice(0, 200)
  }

  // Tag and series
  const guess: Guess = isBanner
    ? { tag: 'Chung', series: null, rule: 'banner', basis: [] }
    : guessTagAndSeries({ fileName, title, bodyText: converted.markdown.replace(/:var\[[^\]]*\]/g, ' ') })
  if (!isBanner) {
    // v1 headers were sometimes copied from another post; say so when the title alone points elsewhere.
    const fromTitle = guessTagAndSeries({ fileName: '', title, bodyText: '' })
    if (fromTitle.rule !== 'default' && fromTitle.rule !== guess.rule) {
      flags.add('title_disagrees', 'warn', `title suggests "${fromTitle.series ?? fromTitle.tag}", content and file name suggest "${guess.series ?? guess.tag}"`)
    }
  }

  // Server rules, checked here first
  const analysis = analyzeBody(converted.markdown, variables.map((v) => v.key))
  for (const issue of analysis.issues) flags.add('invalid_body', 'error', issue.code)

  const payload: LegacyPostPayload = {
    legacyKey: isBanner ? BANNER_KEY : `news/${fileName}`,
    title,
    summary: null,
    bodyMd: converted.markdown,
    variables,
    publishedAt: toPublishedAt(publish.date),
    audienceAll: isBanner,
    recipients: isBanner ? null : mapped!.recipients,
    tags: [guess.tag],
    series: guess.series,
    pinnedUntil: isBanner ? (options.bannerPinnedUntil ?? DEFAULT_BANNER_PINNED_UNTIL) : null,
    requiresAck: false,
    markRead: !isBanner,
  }

  return {
    fileName,
    payload,
    flags: flags.list(),
    stats: {
      recipients: mapped?.recipientCount ?? 0,
      rows: mapped?.rowCount ?? 0,
      variables: variables.length,
      unusedColumns: unusedColumns.length,
      bodyChars: converted.markdown.length,
    },
    guess,
  }
}

/** Converts one `notifications/news/*.json` file. */
export function convertNewsPost(fileName: string, post: V1Post): ConvertedPost {
  return convertPost(fileName, post, 'news', {})
}

/** Converts `notifications/request-update-info/request-update-info-0.json` into the pinned, all-employee banner. */
export function convertBanner(fileName: string, post: V1Post, options: ConvertOptions = {}): ConvertedPost {
  return convertPost(fileName, post, 'banner', options)
}
