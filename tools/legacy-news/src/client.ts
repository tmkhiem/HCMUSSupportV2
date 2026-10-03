import { gzipSync } from 'node:zlib'
import type { LegacyPost } from './types.js'

export interface NewsItemResult {
  key: string
  action: string
  audience: string
  recipients: number
  unknownMscbs: number
  inactiveMscbs: number
  coverage: number
  series: string | null
  tags: string[]
  issues: string[]
}

export interface NewsReport {
  dryRun: boolean
  created: number
  unchanged: number
  changed: number
  rejected: number
  items: NewsItemResult[]
}

export interface PostOptions {
  baseUrl: string
  token: string
  dryRun: boolean
  kind: 'news' | 'banner'
  allCoverage: number
  fetchImpl?: typeof fetch
}

/** `POST /api/integration/v1/legacy/news` (ApiKey scope `legacy.import`), gzip body. */
export async function postNews(posts: LegacyPost[], o: PostOptions): Promise<NewsReport> {
  const url = `${o.baseUrl.replace(/\/+$/, '')}/api/integration/v1/legacy/news?dryRun=${o.dryRun}`
  const body = gzipSync(Buffer.from(JSON.stringify({ posts, kind: o.kind, allCoverage: o.allCoverage })))
  const response = await (o.fetchImpl ?? fetch)(url, {
    method: 'POST',
    headers: { Authorization: `ApiKey ${o.token}`, 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
    body,
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`)
  return JSON.parse(text) as NewsReport
}
