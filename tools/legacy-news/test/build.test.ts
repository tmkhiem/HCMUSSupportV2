import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildPost, loadBanner, loadNews } from '../src/build.js'
import { postNews } from '../src/client.js'
import { parseArgs } from '../src/cli.js'
import { guessSeriesAndTags, looksLikeTestPost } from '../src/guess.js'
import { cleanValue, variableKeys } from '../src/values.js'

describe('cleanValue', () => {
  it('turns <br> and list ends into line breaks, strips tags and decodes entities', () => {
    expect(cleanValue('\r\nA1 (x):<br>B &amp; C<br>D')).toBe('A1 (x):\nB & C\nD')
    expect(cleanValue('99% <br>')).toBe('99%')
    expect(cleanValue('<ul><li>một</li><li>hai</li></ul>')).toBe('một\nhai')
  })
  it('trims, collapses blanks and keeps empty text for null', () => {
    expect(cleanValue('  a   b  ')).toBe('a b')
    expect(cleanValue(null)).toBe('')
    expect(cleanValue(12.5)).toBe('12.5')
  })
})

describe('variableKeys', () => {
  it('maps the v1 spellings to valid, unique keys', () => {
    const keys = variableKeys(['{0}', '(7)', '{TenCapDeTai}', '{A}', '(A)', '{ma so}'])
    expect(keys.get('{0}')).toBe('c0')
    expect(keys.get('(7)')).toBe('c7')
    expect(keys.get('{TenCapDeTai}')).toBe('TenCapDeTai')
    expect(keys.get('{A}')).toBe('A')
    expect(keys.get('(A)')).toBe('A_2')
    expect(keys.get('{ma so}')).toBe('ma_so')
    expect(new Set(keys.values()).size).toBe(6)
    for (const k of keys.values()) expect(k).toMatch(/^[A-Za-z][A-Za-z0-9_]{0,63}$/)
  })
})

describe('guessSeriesAndTags', () => {
  it.each([
    ['Nâng lương thường xuyên năm 2025 (dự kiến)', 'Nâng lương thường xuyên', ['Lương']],
    ['Nâng lương trước hạn do lập thành tích năm 2024 (dự kiến)', 'Nâng lương trước hạn', ['Lương', 'Khen thưởng']],
    ['Dự kiến nâng bậc lương trước thời hạn năm 2021', 'Nâng lương trước hạn', ['Lương', 'Khen thưởng']],
    ['Dự kiến thực hiện chế độ phụ cấp thâm niên vượt khung năm 2025', 'Thâm niên vượt khung', ['Lương', 'Thâm niên']],
    ['Phụ cấp thâm niên nhà giáo năm 2024 (dự kiến)', 'Phụ cấp thâm niên nhà giáo', ['Lương', 'Thâm niên']],
    ['Danh sách hưởng phụ cấp ưu đãi nhà giáo năm 2021', 'Phụ cấp ưu đãi nhà giáo', ['Lương']],
    ['Kết quả đánh giá, xếp loại viên chức năm 2022', 'Đánh giá, xếp loại viên chức', ['Khen thưởng']],
    ['Khảo sát nhu cầu sử dụng Internet', 'Khảo sát', ['Khảo sát']],
    ['Đăng ký sáng kiến năm học 2020-2021', 'Sáng kiến', ['Khen thưởng']],
  ])('%s', (title, series, tags) => {
    expect(guessSeriesAndTags(title)).toEqual({ seriesName: series, tagNames: tags })
  })
  it('falls back to Chung without a series', () => {
    expect(guessSeriesAndTags('Cập nhật bổ sung CCCD')).toEqual({ seriesName: null, tagNames: ['Chung'] })
  })
  it('spots test posts', () => {
    expect(looksLikeTestPost('Thông báo test từ Github', '2022-12-12-test.json')).toBe(true)
    expect(looksLikeTestPost('Nâng lương', '2022-12-12-latest.json')).toBe(false)
  })
})

const envelope = (over: Record<string, unknown> = {}) => ({
  header: 'Nâng lương thường xuyên năm 2025 (dự kiến)',
  datestr: '2025-05-15',
  template: '<ul><li>Ngạch: {A}</li><li>Bậc: (7)</li></ul>',
  category: 'news',
  values: {
    T0001: [{ '{A}': ' N01.1 ', '(7)': '5<br>6', '{B}': 'unused' }],
    T0002: [{ '{A}': 'N02', '(7)': '3', '{B}': 'x' }, { '{A}': 'N03', '(7)': '4', '{B}': 'y' }],
  },
  ...over,
})

describe('buildPost', () => {
  it('builds the endpoint payload: Markdown body, declared variables, rows keyed by MSCB, guessed series', () => {
    const { post, info } = buildPost('2025-05-15-NLTX-2025.json', envelope())
    expect(post.key).toBe('2025-05-15-NLTX-2025')
    expect(post.title).toBe('Nâng lương thường xuyên năm 2025 (dự kiến)')
    expect(post.publishedOn).toBe('2025-05-15')
    expect(post.bodyMd).toBe('- Ngạch: :var[A]\n- Bậc: :var[c7]')
    expect(post.variables).toEqual([
      { key: 'A', label: 'A', type: 'text' },
      { key: 'c7', label: '7', type: 'text' },
    ])
    expect(post.rows).toEqual({
      T0001: [{ A: 'N01.1', c7: '5\n6' }],
      T0002: [{ A: 'N02', c7: '3' }, { A: 'N03', c7: '4' }],
    })
    expect(post.seriesName).toBe('Nâng lương thường xuyên')
    expect(post.tagNames).toEqual(['Lương'])
    expect(post.audienceAll).toBeNull()
    expect(info).toMatchObject({ rows: 3, employees: 2, unusedColumns: 1, warnings: [] })
  })

  it('reports a datestr that disagrees with the file name and a bad datestr', () => {
    const a = buildPost('2026-02-03-TNNG-2026.json', envelope({ datestr: '2026-03-02' }))
    expect(a.post.publishedOn).toBe('2026-03-02')
    expect(a.info.warnings.join()).toContain('differs from the date in the file name (2026-02-03)')
    const b = buildPost('2026-02-03-TNNG-2026.json', envelope({ datestr: 'yyyy-MM-dd' }))
    expect(b.post.publishedOn).toBe('2026-02-03')
    expect(b.info.warnings.join()).toContain('not a date')
  })

  it('a post without variables carries no row data, only the recipients', () => {
    const { post } = buildPost('2025-06-16-khao-sat.json', envelope({ template: '<p>Mời tham gia khảo sát <a href="https://forms.gle/x">tại đây</a></p>' }))
    expect(post.variables).toEqual([])
    expect(post.rows).toEqual({ T0001: [], T0002: [] })
    expect(post.bodyMd).toBe('Mời tham gia khảo sát [tại đây](https://forms.gle/x)')
  })

  it('warns about an empty recipient list', () => {
    expect(buildPost('x.json', envelope({ values: {} })).info.warnings).toContain('the file lists no recipients')
  })
})

describe('loadNews and loadBanner', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'legacy-news-')) })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('reads only *.json files of the news folder (not .old files or backup/) and skips test posts', () => {
    const news = join(dir, 'news')
    mkdirSync(join(news, 'backup'), { recursive: true })
    writeFileSync(join(news, '2025-05-15-a.json'), JSON.stringify(envelope()))
    writeFileSync(join(news, '2025-05-16-b.json'), '﻿' + JSON.stringify(envelope({ header: 'Khảo sát X' })))
    writeFileSync(join(news, '2022-12-12-test.json'), JSON.stringify(envelope({ header: 'Thông báo test từ Github' })))
    writeFileSync(join(news, '2022-06-19 old.json.old'), JSON.stringify(envelope()))
    writeFileSync(join(news, 'backup', '2025-05-15-a.json.single'), JSON.stringify(envelope()))
    writeFileSync(join(news, 'backup', 'c.json'), JSON.stringify(envelope()))

    const { posts, skipped } = loadNews(news)
    expect(posts.map(p => p.info.file)).toEqual(['2025-05-15-a.json', '2025-05-16-b.json'])
    expect(skipped).toEqual(['2022-12-12-test.json'])
    expect(loadNews(news, { includeTest: true }).posts).toHaveLength(3)
  })

  it('turns the update-info template into a post for everyone', () => {
    const file = join(dir, 'request-update-info-0.json')
    writeFileSync(file, JSON.stringify({
      header: '', datestr: '2023-11-18', category: 'request-update-info',
      template: '<p>Điền <a href="https://forms.gle/zzz">phiếu</a></p>', values: { T0001: [{ '{MA}': 'T0001' }] },
    }))
    const { post, info } = loadBanner(file)
    expect(post).toMatchObject({
      key: 'request-update-info', title: 'Đề nghị cập nhật thông tin', publishedOn: '2023-11-18', bodyMd: 'Điền [phiếu](https://forms.gle/zzz)',
      audienceAll: true, rows: {}, variables: [], seriesName: null, tagNames: ['Chung'],
    })
    expect(info.warnings).toEqual([])
  })
})

describe('postNews', () => {
  it('posts a gzip JSON body with the ApiKey header and the dry-run flag', async () => {
    let seen: { url: string; headers: Record<string, string>; body: any } | undefined
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = {
        url, headers: init.headers as Record<string, string>,
        body: JSON.parse(gunzipSync(init.body as Buffer).toString('utf8')),
      }
      return new Response(JSON.stringify({ dryRun: true, created: 1, unchanged: 0, changed: 0, rejected: 0, items: [] }), { status: 200 })
    }) as unknown as typeof fetch
    const { post } = buildPost('2025-05-15-a.json', envelope())
    const report = await postNews([post], { baseUrl: 'http://x.test/', token: 'tok', dryRun: true, kind: 'news', allCoverage: 0.9, fetchImpl })
    expect(report.created).toBe(1)
    expect(seen!.url).toBe('http://x.test/api/integration/v1/legacy/news?dryRun=true')
    expect(seen!.headers.Authorization).toBe('ApiKey tok')
    expect(seen!.headers['Content-Encoding']).toBe('gzip')
    expect(seen!.body).toMatchObject({ kind: 'news', allCoverage: 0.9 })
    expect(seen!.body.posts[0].key).toBe('2025-05-15-a')
  })

  it('throws with the status on an error response', async () => {
    const fetchImpl = (async () => new Response('nope', { status: 403 })) as unknown as typeof fetch
    const { post } = buildPost('a.json', envelope())
    await expect(postNews([post], { baseUrl: 'http://x', token: 't', dryRun: true, kind: 'news', allCoverage: 1, fetchImpl })).rejects.toThrow('HTTP 403')
  })
})

describe('parseArgs', () => {
  it('needs --path, never applies without an API and defaults to a dry run', () => {
    expect(parseArgs([], {})).toBe('--path is required')
    expect(parseArgs(['--path', 'd', '--apply'], {})).toBe('--apply needs --api')
    expect(parseArgs(['--path', 'd', '--api', 'http://x'], {})).toBe('--api needs --token (or LEGACY_API_TOKEN)')
    const ok = parseArgs(['--path', 'd', '--api', 'http://x'], { LEGACY_API_TOKEN: 't' })
    expect(ok).toMatchObject({ path: 'd', api: 'http://x', token: 't', apply: false, allCoverage: 0.9, banner: true })
  })
  it('validates numbers', () => {
    expect(parseArgs(['--path', 'd', '--all-coverage', '2'], {})).toContain('--all-coverage')
    expect(parseArgs(['--path', 'd', '--nope'], {})).toBe('Unknown argument: --nope')
  })
})
