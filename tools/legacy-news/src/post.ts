import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import zlib from 'node:zlib'
import { DEFAULT_MAX_BATCH_BYTES, jsonBytes, splitBatches } from './batch.ts'
import { PAYLOAD_SUFFIX, POSTS_DIR } from './convertRun.ts'
import type { LegacyPostPayload } from './convert.ts'

const gzip = promisify(zlib.gzip)

export const ENDPOINT = 'api/integration/v1/legacy/notifications'

export interface PostRunOptions {
  /** The converter's out dir (it holds `posts/`). The server reports are written to `<dir>/post-report.json`. */
  dir: string
  /** Base URL of the backend, e.g. http://localhost:5161 */
  api: string
  token: string
  dryRun?: boolean
  /** Only these legacy keys (`news/<file>.json`, or just `<file>.json`). */
  only?: string[]
  maxBatchBytes?: number
  fetchImpl?: typeof fetch
  /** Delay between retries; tests set it to 0. */
  retryDelayMs?: number
}

export interface Totals {
  created: number
  updated: number
  unchanged: number
  rejected: number
  deliveries: number
  newDeliveries: number
}

export interface RejectedPost {
  legacyKey: string
  issues: string[]
}

export interface BatchOutcome {
  index: number
  legacyKeys: string[]
  status: number
  ok: boolean
  response?: unknown
  error?: string
}

export interface PostRunResult {
  dryRun: boolean
  posts: number
  batches: number
  httpErrors: number
  totals: Totals
  rejected: RejectedPost[]
  outcomes: BatchOutcome[]
  reportFile: string
}

const emptyTotals = (): Totals => ({ created: 0, updated: 0, unchanged: 0, rejected: 0, deliveries: 0, newDeliveries: 0 })

export function loadPayloads(dir: string): LegacyPostPayload[] {
  const postsDir = path.join(dir, POSTS_DIR)
  if (!fs.existsSync(postsDir)) throw new Error(`No ${POSTS_DIR}/ folder in ${dir}. Run "npm run convert" first.`)
  return fs
    .readdirSync(postsDir)
    .filter((f) => f.endsWith(PAYLOAD_SUFFIX))
    .sort((a, b) => a.localeCompare(b))
    .map((f) => JSON.parse(fs.readFileSync(path.join(postsDir, f), 'utf8')) as LegacyPostPayload)
}

export function selectPosts(all: LegacyPostPayload[], only: string[] | undefined): LegacyPostPayload[] {
  if (!only || only.length === 0) return all
  const wanted = only.map((s) => s.trim()).filter(Boolean)
  const matches = (p: LegacyPostPayload, w: string) => p.legacyKey === w || p.legacyKey === `news/${w}` || p.legacyKey === `news/${w}.json`
  const missing = wanted.filter((w) => !all.some((p) => matches(p, w)))
  if (missing.length > 0) throw new Error(`Unknown legacy key(s) in --only: ${missing.join(', ')}`)
  return all.filter((p) => wanted.some((w) => matches(p, w)))
}

export function endpointUrl(api: string, dryRun: boolean): string {
  const url = new URL(ENDPOINT, api.endsWith('/') ? api : api + '/')
  if (dryRun) url.searchParams.set('dryRun', 'true')
  return url.toString()
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface ServerReport {
  totals?: Partial<Totals>
  posts?: { legacyKey?: string; outcome?: string; issues?: unknown[] }[]
}

function problemTitle(text: string): string {
  try {
    const p = JSON.parse(text) as { title?: string; detail?: string }
    return (p.title ?? p.detail ?? '').slice(0, 160)
  } catch {
    return ''
  }
}

async function sendBatch(
  batch: LegacyPostPayload[],
  index: number,
  o: Required<Pick<PostRunOptions, 'api' | 'token'>> & { dryRun: boolean; fetchImpl: typeof fetch; retryDelayMs: number },
): Promise<BatchOutcome> {
  const body = await gzip(Buffer.from(JSON.stringify({ posts: batch }), 'utf8'))
  const url = endpointUrl(o.api, o.dryRun)
  const legacyKeys = batch.map((p) => p.legacyKey)
  let lastError = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(o.retryDelayMs * attempt)
    try {
      const res = await o.fetchImpl(url, {
        method: 'POST',
        headers: { Authorization: `ApiKey ${o.token}`, 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
        body,
      })
      const text = await res.text()
      if (res.ok) {
        let response: unknown = null
        try {
          response = JSON.parse(text)
        } catch {
          return { index, legacyKeys, status: res.status, ok: false, error: 'The response was not JSON.' }
        }
        return { index, legacyKeys, status: res.status, ok: true, response }
      }
      const title = problemTitle(text)
      lastError = `HTTP ${res.status}${title ? `: ${title}` : ''}`
      if (![502, 503, 504].includes(res.status)) return { index, legacyKeys, status: res.status, ok: false, error: lastError, response: text.slice(0, 4000) }
    } catch (e) {
      lastError = `Request failed: ${(e as Error).message}`
    }
  }
  return { index, legacyKeys, status: 0, ok: false, error: lastError }
}

/** Posts the converted posts in size-bounded gzip batches and writes the server reports to `post-report.json`. */
export async function runPost(opts: PostRunOptions): Promise<PostRunResult> {
  if (!opts.token) throw new Error('Set the LEGACY_API_TOKEN environment variable (an API client with scope legacy.import).')
  const posts = selectPosts(loadPayloads(opts.dir), opts.only)
  if (posts.length === 0) throw new Error('No posts to send.')

  const dryRun = opts.dryRun === true
  const sized = posts.map((item) => ({ item, bytes: jsonBytes(item) }))
  const batches = splitBatches(sized, opts.maxBatchBytes ?? DEFAULT_MAX_BATCH_BYTES)
  const sender = { api: opts.api, token: opts.token, dryRun, fetchImpl: opts.fetchImpl ?? fetch, retryDelayMs: opts.retryDelayMs ?? 500 }

  const totals = emptyTotals()
  const rejected: RejectedPost[] = []
  const outcomes: BatchOutcome[] = []
  let httpErrors = 0
  for (let i = 0; i < batches.length; i++) {
    const outcome = await sendBatch(batches[i], i + 1, sender)
    outcomes.push(outcome)
    if (!outcome.ok) {
      httpErrors++
      continue
    }
    const report = outcome.response as ServerReport
    for (const key of Object.keys(totals) as (keyof Totals)[]) totals[key] += Number(report.totals?.[key] ?? 0)
    for (const p of report.posts ?? []) {
      if (p.outcome === 'rejected') rejected.push({ legacyKey: p.legacyKey ?? '?', issues: (p.issues ?? []).map((x) => (typeof x === 'string' ? x : JSON.stringify(x))) })
    }
  }

  const reportFile = path.join(opts.dir, 'post-report.json')
  const result: PostRunResult = { dryRun, posts: posts.length, batches: batches.length, httpErrors, totals, rejected, outcomes, reportFile }
  fs.writeFileSync(reportFile, JSON.stringify({ generatedAt: new Date().toISOString(), api: opts.api, ...result }, null, 2) + '\n', 'utf8')
  return result
}

/** Totals only. The detailed per-employee lists stay in post-report.json. */
export function postSummaryLines(r: PostRunResult): string[] {
  const t = r.totals
  const lines = [
    `${r.dryRun ? 'Dry run: ' : ''}sent ${r.posts} post(s) in ${r.batches} request(s); HTTP errors: ${r.httpErrors}.`,
    `created ${t.created}, updated ${t.updated}, unchanged ${t.unchanged}, rejected ${t.rejected}; deliveries ${t.deliveries} (new ${t.newDeliveries}).`,
  ]
  for (const o of r.outcomes) if (!o.ok) lines.push(`  request ${o.index} failed: ${o.error}`)
  for (const p of r.rejected) lines.push(`  rejected ${p.legacyKey}: ${p.issues.join(', ')}`)
  lines.push(`Server reports written to ${r.reportFile}`)
  return lines
}

export const postExitCode = (r: PostRunResult): number => (r.httpErrors > 0 || r.rejected.length > 0 || r.totals.rejected > 0 ? 1 : 0)
