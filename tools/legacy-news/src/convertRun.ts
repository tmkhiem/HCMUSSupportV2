import fs from 'node:fs'
import path from 'node:path'
import { convertBanner, convertNewsPost, type ConvertedPost, type V1Post } from './convert.ts'
import { assertOutsideGitWorkTree } from './outdir.ts'
import { buildReport, previewMarkdown, reportMarkdown, type ConvertReport } from './report.ts'

export interface ConvertRunOptions {
  /** The v1 data repo (the folder that holds `notifications/`). */
  dataPath: string
  outDir: string
  bannerPinnedUntil?: string
  now?: Date
}

export interface ConvertRunResult {
  outDir: string
  converted: ConvertedPost[]
  report: ConvertReport
}

export const POSTS_DIR = 'posts'
export const PREVIEW_DIR = 'preview'
export const PAYLOAD_SUFFIX = '.payload.json'

const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')) as T

/** `notifications/news/*.json`, minus `.old` files, `backup/` and the `-test.json` post. Sorted by name. */
export function listNewsFiles(dataPath: string): string[] {
  const dir = path.join(dataPath, 'notifications', 'news')
  if (!fs.existsSync(dir)) throw new Error(`Not found: ${dir}. Is --path the v1 data repo?`)
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.json$/i.test(e.name) && !/-test\.json$/i.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b))
}

export function payloadFileName(legacyKey: string, taken: Set<string>): string {
  const base = legacyKey.replace(/^news\//, '').replace(/\.json$/i, '').replace(/[^A-Za-z0-9._-]+/g, '_')
  let name = base
  for (let n = 2; taken.has(name); n++) name = `${base}_${n}`
  taken.add(name)
  return name
}

function cleanDir(dir: string, suffix: string): void {
  fs.mkdirSync(dir, { recursive: true })
  for (const f of fs.readdirSync(dir)) if (f.endsWith(suffix)) fs.rmSync(path.join(dir, f))
}

/** Converts the v1 news files and the banner, then writes payloads, previews and the report into `outDir`. */
export function runConvert(opts: ConvertRunOptions): ConvertRunResult {
  const outDir = assertOutsideGitWorkTree(opts.outDir)
  const converted: ConvertedPost[] = []

  for (const file of listNewsFiles(opts.dataPath)) {
    const full = path.join(opts.dataPath, 'notifications', 'news', file)
    try {
      converted.push(convertNewsPost(file, readJson<V1Post>(full)))
    } catch (e) {
      throw new Error(`Cannot convert ${file}: ${(e as Error).message}`)
    }
  }

  const bannerFile = path.join(opts.dataPath, 'notifications', 'request-update-info', 'request-update-info-0.json')
  if (fs.existsSync(bannerFile)) {
    converted.push(convertBanner(path.basename(bannerFile), readJson<V1Post>(bannerFile), { bannerPinnedUntil: opts.bannerPinnedUntil }))
  }

  const keys = new Set<string>()
  for (const c of converted) {
    if (keys.has(c.payload.legacyKey)) throw new Error(`Duplicate legacyKey ${c.payload.legacyKey}`)
    keys.add(c.payload.legacyKey)
  }

  const postsDir = path.join(outDir, POSTS_DIR)
  const previewDir = path.join(outDir, PREVIEW_DIR)
  cleanDir(postsDir, PAYLOAD_SUFFIX)
  cleanDir(previewDir, '.md')
  const names = new Set<string>()
  for (const c of converted) {
    const name = payloadFileName(c.payload.legacyKey, names)
    fs.writeFileSync(path.join(postsDir, name + PAYLOAD_SUFFIX), JSON.stringify(c.payload, null, 2) + '\n', 'utf8')
    fs.writeFileSync(path.join(previewDir, name + '.md'), previewMarkdown(c), 'utf8')
  }

  const report = buildReport(converted, opts.now)
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8')
  fs.writeFileSync(path.join(outDir, 'report.md'), reportMarkdown(report), 'utf8')
  return { outDir, converted, report }
}

/** The counts and flags the CLI prints. Never names, values or MSCBs. */
export function summaryLines(r: ConvertReport): string[] {
  const lines = [
    `Converted ${r.totals.posts} posts (${r.totals.flaggedPosts} flagged with a warning or error).`,
    `Recipients: ${r.totals.recipients}, rows: ${r.totals.rows}, variables: ${r.totals.variables}.`,
    `Posts with error flags: ${r.postsBySeverity.error}, with warnings: ${r.postsBySeverity.warn}.`,
  ]
  for (const f of r.flagSummary) lines.push(`  ${f.severity.padEnd(5)} ${f.kind}: ${f.posts} post(s), ${f.occurrences} occurrence(s)`)
  return lines
}
