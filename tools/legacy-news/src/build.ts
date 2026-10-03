import { readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { htmlToMarkdown } from './convert.js'
import { guessSeriesAndTags, looksLikeTestPost } from './guess.js'
import type { BuiltPost, LegacyPost, Variable } from './types.js'
import { cleanValue, stripMarks, variableKeys } from './values.js'

/** The v1 envelope: `{header, template, datestr, category, values: {MSCB: [ {"{col}": "text"} ]}}`. */
export interface V1Envelope {
  header?: unknown
  template?: unknown
  datestr?: unknown
  category?: unknown
  values?: unknown
}

export interface BuildOptions {
  /** Forces the audience: `true` = everyone (banner); `null`/undefined = let the server decide from the roster coverage. */
  audienceAll?: boolean | null
  /** Overrides the title (the banner has an empty header). */
  title?: string
  /** Skips the series/tag guess. */
  noGuess?: boolean
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

function validDate(text: string): boolean {
  if (!DATE.test(text)) return false
  const d = new Date(`${text}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(text)
}

/** Converts one v1 news file into the payload of the admin import endpoint. `file` is the file name; its stem becomes the idempotency key. */
export function buildPost(file: string, envelope: V1Envelope, options: BuildOptions = {}): BuiltPost {
  const warnings: string[] = []
  const key = file.replace(/\.json$/i, '')
  const title = options.title ?? cleanValue(envelope.header).replace(/\n/g, ' ')
  if (!title) warnings.push('empty title')

  let publishedOn = typeof envelope.datestr === 'string' ? envelope.datestr.trim() : ''
  const fileDate = /^(\d{4}-\d{2}-\d{2})/.exec(file)?.[1]
  if (!validDate(publishedOn)) {
    warnings.push(`datestr "${publishedOn}" is not a date; the date in the file name was used`)
    publishedOn = fileDate ?? ''
  } else if (fileDate && fileDate !== publishedOn) {
    warnings.push(`datestr ${publishedOn} differs from the date in the file name (${fileDate}); datestr was used`)
  }

  const valuesRaw = envelope.values && typeof envelope.values === 'object' ? (envelope.values as Record<string, unknown>) : {}
  const columns: string[] = []
  const seen = new Set<string>()
  let rowCount = 0
  for (const list of Object.values(valuesRaw)) {
    if (!Array.isArray(list)) continue
    for (const row of list) {
      if (!row || typeof row !== 'object') continue
      rowCount++
      for (const name of Object.keys(row)) {
        const column = name.trim()
        if (!seen.has(column)) { seen.add(column); columns.push(column) }
      }
    }
  }

  const keyOf = variableKeys(columns)
  const columnOf = new Map([...keyOf].map(([column, k]) => [k, column]))
  const template = typeof envelope.template === 'string' ? envelope.template : ''
  const { markdown, used, warnings: convertWarnings } = htmlToMarkdown(template, { placeholders: keyOf })
  warnings.push(...convertWarnings)

  const variables: Variable[] = used.map(k => ({ key: k, label: stripMarks(columnOf.get(k) ?? k), type: 'text' as const }))
  const unusedColumns = columns.filter(c => !used.includes(keyOf.get(c)!)).length

  const rows: LegacyPost['rows'] = {}
  for (const [mscbRaw, list] of Object.entries(valuesRaw)) {
    const mscb = mscbRaw.trim()
    if (!mscb || !Array.isArray(list)) continue
    const target = (rows[mscb] ??= [])
    if (variables.length === 0) continue
    for (const row of list as Record<string, unknown>[]) {
      const out: Record<string, string> = {}
      for (const v of variables) {
        const column = columnOf.get(v.key)!
        out[v.key] = cleanValue(row[column])
      }
      target.push(out)
    }
  }
  if (Object.keys(rows).length === 0) warnings.push('the file lists no recipients')

  const guess = options.noGuess ? { seriesName: null, tagNames: [] as string[] } : guessSeriesAndTags(title)
  const post: LegacyPost = {
    key, title, publishedOn, bodyMd: markdown, variables, rows,
    seriesName: guess.seriesName, tagNames: guess.tagNames,
    audienceAll: options.audienceAll ?? null,
  }
  return { post, info: { file, rows: rowCount, employees: Object.keys(rows).length, unusedColumns, warnings } }
}

export interface LoadResult {
  posts: BuiltPost[]
  /** Files left out on purpose (test posts), by name. */
  skipped: string[]
}

/**
 * Reads `notifications/news/*.json`. Only files ending in `.json` directly inside the folder are posts: `.old` files, the
 * `backup/` folder and anything else are ignored. Test posts are skipped unless `includeTest`.
 */
export function loadNews(newsDir: string, options: { includeTest?: boolean } = {}): LoadResult {
  const files = readdirSync(newsDir, { withFileTypes: true })
    .filter(e => e.isFile() && /\.json$/i.test(e.name))
    .map(e => e.name)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  const posts: BuiltPost[] = []
  const skipped: string[] = []
  for (const file of files) {
    const envelope = JSON.parse(readFileSync(join(newsDir, file), 'utf8').replace(/^﻿/, '')) as V1Envelope
    const built = buildPost(file, envelope)
    if (!options.includeTest && looksLikeTestPost(built.post.title, file)) { skipped.push(file); continue }
    posts.push(built)
  }
  return { posts, skipped }
}

/** The `request-update-info` banner: one post for everyone; its per-person rows (5,761 identical entries) are not needed. */
export function loadBanner(file: string): BuiltPost {
  const envelope = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')) as V1Envelope
  const built = buildPost('request-update-info', { ...envelope, values: {} }, {
    title: 'Đề nghị cập nhật thông tin',
    audienceAll: true,
    noGuess: true,
  })
  built.post.tagNames = ['Chung']
  built.info.file = basename(file)
  built.info.warnings = built.info.warnings.filter(w => w !== 'the file lists no recipients')
  return built
}
