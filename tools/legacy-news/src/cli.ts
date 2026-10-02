import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadBanner, loadNews } from './build.js'
import { postNews, type NewsItemResult } from './client.js'
import type { BuiltPost } from './types.js'

export const USAGE = `legacy-news - converts the v1 news posts to v2 Markdown notifications and imports them (D15).

Usage:
  legacy-news --path <SupportHCMUSData> [--api <url> --token <token>] [options]

Without --api the tool only converts and prints a local summary. With --api it posts to
POST <url>/api/integration/v1/legacy/news (ApiKey scope legacy.import). Posting is a DRY RUN unless --apply is given.

Options:
  --path <dir>              the data repo (read only; nothing is copied)
  --api <url>               portal origin, or env LEGACY_API_BASE
  --token <token>           API token, or env LEGACY_API_TOKEN
  --apply                   write (default is a server-side dry run)
  --all-coverage <0..1>     a post without variables covering this share of the active roster becomes audience_all (default 0.9)
  --no-mark-read            leave imported deliveries unread (default: read, v1 had no read state)
  --banner-pinned-until <d> pin the update-info banner until yyyy-MM-dd (default 2036-01-01)
  --no-banner               do not import the request-update-info banner
  --include-test            also import posts that look like tests
  --report <file>           write the review report (titles, series and tags guessed, warnings, counts; no recipient data)
Exit code: 0 ok, 1 a post was rejected or the API failed, 2 bad usage.
`

export interface CliOptions {
  path?: string
  api?: string
  token?: string
  apply: boolean
  allCoverage: number
  markRead: boolean
  bannerPinnedUntil: string
  banner: boolean
  includeTest: boolean
  report?: string
}

export function parseArgs(argv: string[], env: Record<string, string | undefined> = process.env): CliOptions | string {
  const o: CliOptions = {
    api: env.LEGACY_API_BASE, token: env.LEGACY_API_TOKEN, apply: false, allCoverage: 0.9, markRead: true,
    bannerPinnedUntil: '2036-01-01', banner: true, includeTest: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    const value = () => {
      const v = argv[++i]
      if (v === undefined) throw new Error(`${a} needs a value`)
      return v
    }
    try {
      switch (a) {
        case '--path': o.path = value(); break
        case '--api': o.api = value(); break
        case '--token': o.token = value(); break
        case '--apply': o.apply = true; break
        case '--all-coverage': o.allCoverage = Number(value()); break
        case '--no-mark-read': o.markRead = false; break
        case '--banner-pinned-until': o.bannerPinnedUntil = value(); break
        case '--no-banner': o.banner = false; break
        case '--include-test': o.includeTest = true; break
        case '--report': o.report = value(); break
        case '-h': case '--help': return USAGE
        default: return `Unknown argument: ${a}`
      }
    } catch (e) {
      return (e as Error).message
    }
  }
  if (!o.path) return '--path is required'
  if (!(o.allCoverage > 0 && o.allCoverage <= 1)) return '--all-coverage must be in (0, 1]'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.bannerPinnedUntil)) return '--banner-pinned-until must be yyyy-MM-dd'
  if (o.apply && !o.api) return '--apply needs --api'
  if (o.api && !o.token) return '--api needs --token (or LEGACY_API_TOKEN)'
  return o
}

const BATCH = 6

export async function run(argv: string[], out: (line: string) => void = console.log): Promise<number> {
  const parsed = parseArgs(argv)
  if (typeof parsed === 'string') {
    out(parsed === USAGE ? USAGE : `${parsed}\n\n${USAGE}`)
    return parsed === USAGE ? 0 : 2
  }
  const o = parsed
  const notifications = existsSync(join(o.path!, 'notifications')) ? join(o.path!, 'notifications') : o.path!
  const newsDir = join(notifications, 'news')
  if (!existsSync(newsDir)) { out(`No news folder at ${newsDir}`); return 2 }

  const { posts, skipped } = loadNews(newsDir, { includeTest: o.includeTest })
  const built: BuiltPost[] = [...posts]
  const bannerFile = join(notifications, 'request-update-info', 'request-update-info-0.json')
  const bannerPost = o.banner && existsSync(bannerFile) ? loadBanner(bannerFile, o.bannerPinnedUntil) : null

  const flagged = built.filter(b => b.info.warnings.length > 0)
  out(`converted ${built.length} news file(s)${bannerPost ? ' + the update-info banner' : ''}; ${skipped.length} skipped as test post(s); ${flagged.length} with warnings`)
  for (const b of [...built, ...(bannerPost ? [bannerPost] : [])]) {
    const series = b.post.seriesName ? `series="${b.post.seriesName}" ` : ''
    out(`  ${b.info.file}: ${b.post.variables.length} var(s), ${b.info.employees} recipient(s), ${series}tags=[${b.post.tagNames.join(', ')}]`)
    for (const w of b.info.warnings) out(`    ! ${w}`)
  }
  for (const f of skipped) out(`  skipped: ${f}`)

  const report: Record<string, unknown> = {
    generatedAt: new Date().toISOString(), apply: o.apply,
    files: [...built, ...(bannerPost ? [bannerPost] : [])].map(b => ({
      file: b.info.file, title: b.post.title, publishedOn: b.post.publishedOn, series: b.post.seriesName, tags: b.post.tagNames,
      variables: b.post.variables.length, recipients: b.info.employees, unusedColumns: b.info.unusedColumns, warnings: b.info.warnings,
      bodyChars: b.post.bodyMd.length,
    })),
    skipped,
  }

  let exit = 0
  if (o.api) {
    const base = { baseUrl: o.api, token: o.token!, dryRun: !o.apply, markRead: o.markRead, allCoverage: o.allCoverage }
    const results: NewsItemResult[] = []
    try {
      for (let i = 0; i < built.length; i += BATCH) {
        const r = await postNews(built.slice(i, i + BATCH).map(b => b.post), { ...base, kind: 'news' })
        results.push(...r.items)
      }
      if (bannerPost) results.push(...(await postNews([bannerPost.post], { ...base, kind: 'banner' })).items)
    } catch (e) {
      out(`API call failed: ${(e as Error).message}`)
      report.error = (e as Error).message
      if (o.report) writeFileSync(o.report, JSON.stringify(report, null, 2))
      return 1
    }
    const counts = new Map<string, number>()
    for (const r of results) counts.set(r.action, (counts.get(r.action) ?? 0) + 1)
    out(`server ${o.apply ? 'apply' : 'dry run'}: ${[...counts].map(([k, v]) => `${k}=${v}`).join(' ')}`)
    for (const r of results) {
      out(`  ${r.key}: ${r.action} audience=${r.audience} recipients=${r.recipients} unknownMscb=${r.unknownMscbs} inactive=${r.inactiveMscbs} coverage=${r.coverage}`)
      for (const issue of r.issues) out(`    ! ${issue}`)
    }
    report.server = results
    if (results.some(r => r.action === 'rejected')) exit = 1
  }
  if (o.report) {
    writeFileSync(o.report, JSON.stringify(report, null, 2))
    out(`report written to ${o.report}`)
  }
  return exit
}

if (process.argv[1] && /cli\.(ts|js)$/.test(process.argv[1])) {
  run(process.argv.slice(2)).then(code => process.exit(code), e => { console.error(e); process.exit(1) })
}
