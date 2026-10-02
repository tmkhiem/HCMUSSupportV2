import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runConvert, summaryLines, listNewsFiles } from '../src/convertRun.ts'
import { loadPayloads } from '../src/post.ts'

let tmp: string
let data: string
let out: string

const SECRET_NAME = 'Nguyen Van Synthetic'
const SECRET_ID = '987654'

function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value))
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-news-run-'))
  data = path.join(tmp, 'data')
  out = path.join(tmp, 'out')
  const news = path.join(data, 'notifications', 'news')
  writeJson(path.join(news, '2025-05-15-NLTX-2025.json'), {
    header: 'Nâng lương thường xuyên năm 2025',
    template: '<p>Kính gửi {Họ tên}</p><table><tr><th>A</th><th colspan="2">B</th></tr><tr><td>1</td><td>2</td><td>3</td></tr></table>',
    datestr: '2025-05-15',
    category: 'news',
    values: { [SECRET_ID]: [{ '{Họ tên}': SECRET_NAME }] },
  })
  writeJson(path.join(news, '2025-06-16-khao-sat.json'), {
    header: 'Khảo sát',
    template: '<p>Mời tham gia</p>',
    datestr: '2025-06-16',
    category: 'news',
    values: { '0001': [{}] },
  })
  // Ignored: test post, .old file, backup folder.
  writeJson(path.join(news, '2022-12-12-test.json'), { header: 't', template: 't', datestr: '2022-12-12', values: {} })
  fs.writeFileSync(path.join(news, '2022-06-19-old.json.old'), '{}')
  writeJson(path.join(news, 'backup', '2020-01-01-backup.json'), { header: 'b', template: 'b', datestr: '2020-01-01', values: {} })
  writeJson(path.join(data, 'notifications', 'request-update-info', 'request-update-info-0.json'), {
    header: '',
    template: '<p>Cập nhật <a href="https://forms.example.test/x">tại đây</a></p>',
    datestr: '2023-11-18',
    category: 'request-update-info',
    values: { [SECRET_ID]: [{ '{MA}': SECRET_ID }] },
  })
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('listNewsFiles', () => {
  it('skips .old files, backup/ and the test post', () => {
    expect(listNewsFiles(data)).toEqual(['2025-05-15-NLTX-2025.json', '2025-06-16-khao-sat.json'])
  })

  it('explains a wrong --path', () => {
    expect(() => listNewsFiles(path.join(tmp, 'nope'))).toThrow(/data repo/)
  })
})

describe('runConvert', () => {
  it('writes payloads, previews and reports, and converts the banner', () => {
    const r = runConvert({ dataPath: data, outDir: out, now: new Date('2026-01-01T00:00:00Z') })
    expect(r.converted.map((c) => c.payload.legacyKey)).toEqual(['news/2025-05-15-NLTX-2025.json', 'news/2025-06-16-khao-sat.json', 'request-update-info'])
    expect(fs.readdirSync(path.join(out, 'posts')).sort()).toEqual(['2025-05-15-NLTX-2025.payload.json', '2025-06-16-khao-sat.payload.json', 'request-update-info.payload.json'])
    expect(fs.readdirSync(path.join(out, 'preview')).sort()).toEqual(['2025-05-15-NLTX-2025.md', '2025-06-16-khao-sat.md', 'request-update-info.md'])
    expect(fs.existsSync(path.join(out, 'report.md'))).toBe(true)
    const report = JSON.parse(fs.readFileSync(path.join(out, 'report.json'), 'utf8'))
    expect(report.totals.posts).toBe(3)
    expect(report.flagSummary).toContainEqual({ kind: 'merged_cells', severity: 'error', posts: 1, occurrences: 1 })
    expect(loadPayloads(out).map((p) => p.legacyKey)).toEqual(r.converted.map((c) => c.payload.legacyKey).sort())
  })

  it('keeps names, values and ids out of the report and the console summary', () => {
    const r = runConvert({ dataPath: data, outDir: out })
    const text = [fs.readFileSync(path.join(out, 'report.json'), 'utf8'), fs.readFileSync(path.join(out, 'report.md'), 'utf8'), ...summaryLines(r.report)].join('\n')
    expect(text).not.toContain(SECRET_NAME)
    expect(text).not.toContain(SECRET_ID)
    // The preview is for human review and does carry a sample recipient.
    expect(fs.readFileSync(path.join(out, 'preview', '2025-05-15-NLTX-2025.md'), 'utf8')).toContain(SECRET_NAME)
  })

  it('removes payloads of a previous run so stale posts are never sent', () => {
    runConvert({ dataPath: data, outDir: out })
    fs.rmSync(path.join(data, 'notifications', 'news', '2025-06-16-khao-sat.json'))
    runConvert({ dataPath: data, outDir: out })
    expect(fs.readdirSync(path.join(out, 'posts')).sort()).toEqual(['2025-05-15-NLTX-2025.payload.json', 'request-update-info.payload.json'])
  })

  it('refuses an out dir inside a git work tree and writes nothing', () => {
    fs.mkdirSync(path.join(tmp, 'repo', '.git'), { recursive: true })
    const inside = path.join(tmp, 'repo', 'out')
    expect(() => runConvert({ dataPath: data, outDir: inside })).toThrow(/git work tree/)
    expect(fs.existsSync(inside)).toBe(false)
  })

  it('takes the banner pin date from the option', () => {
    const r = runConvert({ dataPath: data, outDir: out, bannerPinnedUntil: '2030-05-05T00:00:00+07:00' })
    expect(r.converted.at(-1)?.payload.pinnedUntil).toBe('2030-05-05T00:00:00+07:00')
  })
})
