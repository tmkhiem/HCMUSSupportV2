import type { ConvertedPost } from './convert.ts'
import type { Flag, Severity } from './flags.ts'

/**
 * Report entries and the human-review preview. The report holds counts, titles, tags and flags only: no names, MSCBs
 * or values. The preview is written next to the payloads (outside the repo) and does contain a sample recipient.
 */
export interface PostReport {
  legacyKey: string
  file: string
  title: string
  tags: string[]
  series: string | null
  guessRule: string
  guessBasis: string[]
  publishedAt: string
  audienceAll: boolean
  recipients: number
  rows: number
  variables: number
  unusedColumns: number
  bodyChars: number
  flags: Flag[]
}

export interface FlagSummary {
  kind: string
  severity: Severity
  posts: number
  occurrences: number
}

export interface ConvertReport {
  generatedAt: string
  totals: { posts: number; flaggedPosts: number; recipients: number; rows: number; variables: number; bodyChars: number }
  /** Posts that carry at least one flag of each severity. */
  postsBySeverity: Record<Severity, number>
  flagSummary: FlagSummary[]
  posts: PostReport[]
}

export function postReport(c: ConvertedPost): PostReport {
  return {
    legacyKey: c.payload.legacyKey,
    file: c.fileName,
    title: c.payload.title,
    tags: c.payload.tags,
    series: c.payload.series,
    guessRule: c.guess.rule,
    guessBasis: c.guess.basis,
    publishedAt: c.payload.publishedAt,
    audienceAll: c.payload.audienceAll,
    recipients: c.stats.recipients,
    rows: c.stats.rows,
    variables: c.stats.variables,
    unusedColumns: c.stats.unusedColumns,
    bodyChars: c.stats.bodyChars,
    flags: c.flags,
  }
}

const SEVERITY_RANK: Record<Severity, number> = { error: 0, warn: 1, info: 2 }

export function buildReport(posts: ConvertedPost[], now: Date = new Date()): ConvertReport {
  const entries = posts.map(postReport)
  const summary = new Map<string, FlagSummary>()
  for (const p of entries) {
    const seen = new Set<string>()
    for (const f of p.flags) {
      const id = `${f.kind}|${f.severity}`
      let s = summary.get(id)
      if (!s) summary.set(id, (s = { kind: f.kind, severity: f.severity, posts: 0, occurrences: 0 }))
      s.occurrences += f.count ?? 1
      if (!seen.has(id)) {
        seen.add(id)
        s.posts++
      }
    }
  }
  const postsBySeverity: Record<Severity, number> = { error: 0, warn: 0, info: 0 }
  for (const p of entries) for (const sev of ['error', 'warn', 'info'] as const) if (p.flags.some((f) => f.severity === sev)) postsBySeverity[sev]++
  return {
    generatedAt: now.toISOString(),
    totals: {
      posts: entries.length,
      flaggedPosts: entries.filter((p) => p.flags.some((f) => f.severity !== 'info')).length,
      recipients: entries.reduce((n, p) => n + p.recipients, 0),
      rows: entries.reduce((n, p) => n + p.rows, 0),
      variables: entries.reduce((n, p) => n + p.variables, 0),
      bodyChars: entries.reduce((n, p) => n + p.bodyChars, 0),
    },
    postsBySeverity,
    flagSummary: [...summary.values()].sort(
      (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.posts - a.posts || a.kind.localeCompare(b.kind),
    ),
    posts: entries,
  }
}

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')
const flagText = (f: Flag) => `${f.severity}:${f.kind}${f.count && f.count > 1 ? `×${f.count}` : ''}${f.detail ? ` (${f.detail})` : ''}`

export function reportMarkdown(r: ConvertReport): string {
  const lines: string[] = []
  lines.push('# Legacy news conversion report', '')
  lines.push(`Generated ${r.generatedAt}. Counts and flags only: no names, MSCBs or values.`, '')
  lines.push('## Totals', '')
  lines.push(`- Posts: ${r.totals.posts} (${r.totals.flaggedPosts} with warnings or errors)`)
  lines.push(`- Recipients: ${r.totals.recipients}, rows: ${r.totals.rows}`)
  lines.push(`- Posts with an error flag: ${r.postsBySeverity.error}, with a warning: ${r.postsBySeverity.warn}, with an info flag: ${r.postsBySeverity.info}`, '')
  lines.push('## Flags by kind', '')
  lines.push('| Severity | Kind | Posts | Occurrences |', '|---|---|---:|---:|')
  for (const f of r.flagSummary) lines.push(`| ${f.severity} | ${f.kind} | ${f.posts} | ${f.occurrences} |`)
  lines.push('', '## Tag and series guesses (review these)', '')
  lines.push('| Post | Title | Tag | Series | Rule | Matched on |', '|---|---|---|---|---|---|')
  for (const p of r.posts) {
    lines.push(`| ${cell(p.legacyKey)} | ${cell(p.title)} | ${p.tags.join(', ')} | ${cell(p.series ?? '')} | ${p.guessRule} | ${p.guessBasis.join(', ')} |`)
  }
  lines.push('', '## Posts', '')
  lines.push('| Post | Published | Recipients | Rows | Vars | Unused | Flags |', '|---|---|---:|---:|---:|---:|---|')
  for (const p of r.posts) {
    lines.push(`| ${cell(p.legacyKey)} | ${p.publishedAt.slice(0, 10)} | ${p.recipients} | ${p.rows} | ${p.variables} | ${p.unusedColumns} | ${cell(p.flags.map(flagText).join('; '))} |`)
  }
  lines.push('')
  return lines.join('\n')
}

/** The review preview: header facts, flags, the variables, the Markdown body and a sample rendering. */
export function previewMarkdown(c: ConvertedPost): string {
  const p = c.payload
  const out: string[] = []
  out.push(`# ${p.title}`, '')
  out.push(`- legacyKey: \`${p.legacyKey}\``)
  out.push(`- publishedAt: ${p.publishedAt}`)
  out.push(`- tags: ${p.tags.join(', ')}; series: ${p.series ?? '(none)'} (rule ${c.guess.rule})`)
  out.push(`- audienceAll: ${p.audienceAll}; markRead: ${p.markRead}; pinnedUntil: ${p.pinnedUntil ?? '(none)'}`)
  out.push(`- recipients: ${c.stats.recipients} ids, ${c.stats.rows} rows`, '')
  out.push('## Flags', '')
  if (c.flags.length === 0) out.push('(none)')
  for (const f of c.flags) out.push(`- ${flagText(f)}`)
  out.push('', '## Variables', '')
  if (p.variables.length === 0) out.push('(none)')
  else {
    out.push('| Key | Label | Type | In body |', '|---|---|---|---|')
    for (const v of p.variables) out.push(`| ${v.key} | ${cell(v.label)} | ${v.type} | ${p.bodyMd.includes(`:var[${v.key}]`) ? 'yes' : 'no'} |`)
  }
  out.push('', '## Body (Markdown source)', '', '````markdown', p.bodyMd, '````', '')
  const firstId = p.recipients ? Object.keys(p.recipients)[0] : undefined
  const firstRow = firstId ? (p.recipients![firstId][0] ?? {}) : null
  if (firstRow) {
    out.push('## Sample rendering (first recipient, first row)', '')
    out.push(p.bodyMd.replace(/:var\[([A-Za-z0-9_]+)\]/g, (_m, key: string) => firstRow[key] ?? '—'), '')
  }
  return out.join('\n')
}
