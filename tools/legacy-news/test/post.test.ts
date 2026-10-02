import fs from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { LegacyPostPayload } from '../src/convert.ts'
import { postExitCode, postSummaryLines, runPost, selectPosts } from '../src/post.ts'

interface Seen {
  method?: string
  url?: string
  auth?: string
  encoding?: string
  contentType?: string
  keys: string[]
}

let tmp: string
let server: http.Server
let base: string
let seen: Seen[]
/** What the stub does for each request; replaced per test. */
let behave: (req: Seen, body: { posts: LegacyPostPayload[] }) => { status: number; json?: unknown; text?: string }

function payload(key: string, padding = 0): LegacyPostPayload {
  return {
    legacyKey: key,
    title: key,
    summary: null,
    bodyMd: 'x'.repeat(padding),
    variables: [],
    publishedAt: '2025-01-01T08:00:00+07:00',
    audienceAll: false,
    recipients: { '0001': [{}] },
    tags: ['Chung'],
    series: null,
    pinnedUntil: null,
    requiresAck: false,
    markRead: true,
  }
}

function writePosts(posts: LegacyPostPayload[]) {
  const dir = path.join(tmp, 'posts')
  fs.mkdirSync(dir, { recursive: true })
  posts.forEach((p, i) => fs.writeFileSync(path.join(dir, `${String(i).padStart(3, '0')}.payload.json`), JSON.stringify(p)))
}

const okReport = (posts: LegacyPostPayload[], outcome = 'created') => ({
  status: 200,
  json: {
    dryRun: false,
    totals: { created: outcome === 'created' ? posts.length : 0, updated: 0, unchanged: 0, rejected: outcome === 'rejected' ? posts.length : 0, deliveries: posts.length * 10, newDeliveries: posts.length * 10 },
    posts: posts.map((p) => ({ legacyKey: p.legacyKey, outcome, issues: outcome === 'rejected' ? ['RAW_HTML'] : [] })),
    details: [],
  },
})

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-news-post-'))
  seen = []
  behave = (_r, body) => okReport(body.posts)
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const raw = Buffer.concat(chunks)
      const text = req.headers['content-encoding'] === 'gzip' ? zlib.gunzipSync(raw).toString('utf8') : raw.toString('utf8')
      const body = JSON.parse(text) as { posts: LegacyPostPayload[] }
      const info: Seen = {
        method: req.method,
        url: req.url,
        auth: req.headers.authorization,
        encoding: req.headers['content-encoding'],
        contentType: req.headers['content-type'],
        keys: body.posts.map((p) => p.legacyKey),
      }
      seen.push(info)
      const out = behave(info, body)
      res.statusCode = out.status
      res.setHeader('Content-Type', out.json ? 'application/json' : 'text/plain')
      res.end(out.json ? JSON.stringify(out.json) : (out.text ?? ''))
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  await new Promise((r) => server.close(r))
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('runPost against a stub server', () => {
  it('posts gzip JSON with the ApiKey header and aggregates the totals', async () => {
    writePosts([payload('news/a.json'), payload('news/b.json')])
    const r = await runPost({ dir: tmp, api: base, token: 'tok-123' })
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({
      method: 'POST',
      url: '/api/integration/v1/legacy/notifications',
      auth: 'ApiKey tok-123',
      encoding: 'gzip',
      contentType: 'application/json',
      keys: ['news/a.json', 'news/b.json'],
    })
    expect(r.totals).toEqual({ created: 2, updated: 0, unchanged: 0, rejected: 0, deliveries: 20, newDeliveries: 20 })
    expect(r.httpErrors).toBe(0)
    expect(postExitCode(r)).toBe(0)
    const report = JSON.parse(fs.readFileSync(path.join(tmp, 'post-report.json'), 'utf8'))
    expect(report.totals.created).toBe(2)
    expect(report.outcomes[0].response.posts).toHaveLength(2)
  })

  it('adds dryRun=true to the query', async () => {
    writePosts([payload('news/a.json')])
    const r = await runPost({ dir: tmp, api: base + '/', token: 't', dryRun: true })
    expect(seen[0].url).toBe('/api/integration/v1/legacy/notifications?dryRun=true')
    expect(r.dryRun).toBe(true)
  })

  it('splits by size into several requests, in order', async () => {
    writePosts([payload('news/a.json', 600), payload('news/b.json', 600), payload('news/c.json', 600)])
    const r = await runPost({ dir: tmp, api: base, token: 't', maxBatchBytes: 2000 })
    expect(seen.map((s) => s.keys)).toEqual([['news/a.json', 'news/b.json'], ['news/c.json']])
    expect(r.batches).toBe(2)
    expect(r.totals.created).toBe(3)
  })

  it('sends only the posts picked with --only', async () => {
    writePosts([payload('news/a.json'), payload('news/b.json'), payload('request-update-info')])
    await runPost({ dir: tmp, api: base, token: 't', only: ['news/a.json', 'b.json', 'request-update-info'] })
    expect(seen[0].keys).toEqual(['news/a.json', 'news/b.json', 'request-update-info'])
    seen = []
    await runPost({ dir: tmp, api: base, token: 't', only: ['news/b.json'] })
    expect(seen[0].keys).toEqual(['news/b.json'])
    await expect(runPost({ dir: tmp, api: base, token: 't', only: ['news/zzz.json'] })).rejects.toThrow(/Unknown legacy key/)
  })

  it('exits non-zero when a post is rejected and lists it without values', async () => {
    writePosts([payload('news/a.json'), payload('news/b.json')])
    behave = (_r, body) => ({
      status: 200,
      json: {
        totals: { created: 1, rejected: 1, deliveries: 5, newDeliveries: 5 },
        posts: [
          { legacyKey: body.posts[0].legacyKey, outcome: 'created', issues: [] },
          { legacyKey: body.posts[1].legacyKey, outcome: 'rejected', issues: ['RAW_HTML'] },
        ],
      },
    })
    const r = await runPost({ dir: tmp, api: base, token: 't' })
    expect(r.rejected).toEqual([{ legacyKey: 'news/b.json', issues: ['RAW_HTML'] }])
    expect(postExitCode(r)).toBe(1)
    expect(postSummaryLines(r).join('\n')).toContain('rejected news/b.json: RAW_HTML')
  })

  it('exits non-zero on an HTTP error and keeps the other batches going', async () => {
    writePosts([payload('news/a.json', 600), payload('news/b.json', 600)])
    behave = (req, body) => (req.keys[0] === 'news/a.json' ? { status: 401, json: { title: 'Unauthorized' } } : okReport(body.posts))
    const r = await runPost({ dir: tmp, api: base, token: 'wrong', maxBatchBytes: 900 })
    expect(r.httpErrors).toBe(1)
    expect(r.totals.created).toBe(1)
    expect(r.outcomes[0]).toMatchObject({ ok: false, status: 401, error: 'HTTP 401: Unauthorized' })
    expect(postExitCode(r)).toBe(1)
    expect(postSummaryLines(r).join('\n')).toContain('request 1 failed: HTTP 401: Unauthorized')
  })

  it('retries a 503 and succeeds', async () => {
    writePosts([payload('news/a.json')])
    let calls = 0
    behave = (_req, body) => (++calls < 3 ? { status: 503, text: 'busy' } : okReport(body.posts))
    const r = await runPost({ dir: tmp, api: base, token: 't', retryDelayMs: 0 })
    expect(calls).toBe(3)
    expect(r.httpErrors).toBe(0)
    expect(r.totals.created).toBe(1)
  })

  it('reports a refused connection as a failed request', async () => {
    writePosts([payload('news/a.json')])
    const r = await runPost({ dir: tmp, api: 'http://127.0.0.1:1', token: 't', retryDelayMs: 0 })
    expect(r.httpErrors).toBe(1)
    expect(r.outcomes[0].error).toMatch(/Request failed/)
    expect(postExitCode(r)).toBe(1)
  })

  it('needs a token and a converted folder', async () => {
    writePosts([payload('news/a.json')])
    await expect(runPost({ dir: tmp, api: base, token: '' })).rejects.toThrow(/LEGACY_API_TOKEN/)
    await expect(runPost({ dir: path.join(tmp, 'nothing'), api: base, token: 't' })).rejects.toThrow(/convert/)
  })

  it('prints totals only', async () => {
    writePosts([payload('news/a.json')])
    const r = await runPost({ dir: tmp, api: base, token: 't' })
    const text = postSummaryLines(r).join('\n')
    expect(text).toContain('created 1')
    expect(text).not.toContain('0001')
  })
})

describe('selectPosts', () => {
  it('returns everything without a filter', () => {
    const all = [payload('news/a.json')]
    expect(selectPosts(all, undefined)).toBe(all)
    expect(selectPosts(all, [])).toBe(all)
  })
})
