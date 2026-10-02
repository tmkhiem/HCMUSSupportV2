import { describe, expect, it } from 'vitest'
import { guessTagAndSeries, normalizeForMatch } from '../src/classify.ts'
import { convertBanner, convertNewsPost, type V1Post } from '../src/convert.ts'
import { daysBetween, fileNameDate, resolvePublishDate, toPublishedAt } from '../src/dates.ts'
import { contextLabels } from '../src/labels.ts'
import { cleanValue, mapRecipients } from '../src/recipients.ts'
import { analyzeBody } from '../src/validate.ts'

/** A small synthetic post imitating the v1 shape. */
function post(overrides: Partial<V1Post> = {}): V1Post {
  return {
    header: 'Nâng lương thường xuyên năm 2025 (dự kiến)',
    template: '<p>Kính gửi {Họ tên}</p><ul><li>Hệ số: {Hệ số}</li><li>Ngày: {Ngày}</li></ul>',
    datestr: '2025-05-15',
    category: 'news',
    values: {
      '0001': [{ '{Họ tên}': 'Người Một  ', '{Hệ số}': '4.98', '{Ngày}': '01/01/2026' }],
      '0002': [
        { '{Họ tên}': 'Người Hai', '{Hệ số}': '3,99', '{Ngày}': '02/02/2026' },
        { '{Họ tên}': 'Người Hai', '{Hệ số}': '4,32', '{Ngày}': '' },
      ],
    },
    ...overrides,
  }
}

describe('convertNewsPost', () => {
  it('builds the payload item', () => {
    const c = convertNewsPost('2025-05-15-NLTX-2025.json', post())
    const p = c.payload
    expect(p.legacyKey).toBe('news/2025-05-15-NLTX-2025.json')
    expect(p.title).toBe('Nâng lương thường xuyên năm 2025 (dự kiến)')
    expect(p.summary).toBeNull()
    expect(p.publishedAt).toBe('2025-05-15T08:00:00+07:00')
    expect(p.audienceAll).toBe(false)
    expect(p.markRead).toBe(true)
    expect(p.requiresAck).toBe(false)
    expect(p.pinnedUntil).toBeNull()
    expect(p.tags).toEqual(['Lương'])
    expect(p.series).toBe('Nâng lương thường xuyên')
    expect(p.bodyMd).toBe('Kính gửi :var[HoTen]\n\n- Hệ số: :var[HeSo]\n- Ngày: :var[Ngay]')
    expect(p.variables).toEqual([
      { key: 'HoTen', label: 'Kính gửi', type: 'text' },
      { key: 'HeSo', label: 'Hệ số', type: 'number' },
      { key: 'Ngay', label: 'Ngày', type: 'date' },
    ])
    expect(c.flags).toEqual([])
    expect(c.stats).toMatchObject({ recipients: 2, rows: 3, variables: 3, unusedColumns: 0 })
  })

  it('maps recipients to variable keys, trims values, keeps multi-row ids and drops empty values', () => {
    const p = convertNewsPost('x.json', post()).payload
    expect(p.recipients).toEqual({
      '0001': [{ HoTen: 'Người Một', HeSo: '4.98', Ngay: '01/01/2026' }],
      '0002': [
        { HoTen: 'Người Hai', HeSo: '3,99', Ngay: '02/02/2026' },
        { HoTen: 'Người Hai', HeSo: '4,32' },
      ],
    })
  })

  it('keeps empty rows for posts without columns', () => {
    const c = convertNewsPost('2025-06-16-khao-sat-wifi.json', post({ header: 'Khảo sát wifi', datestr: '2025-06-16', template: '<p>Mời khảo sát <a href="https://forms.example.test/x">tại đây</a></p>', values: { '0001': [{}], '0002': [{}] } }))
    expect(c.payload.recipients).toEqual({ '0001': [{}], '0002': [{}] })
    expect(c.payload.variables).toEqual([])
    expect(c.payload.tags).toEqual(['Khảo sát'])
    expect(c.payload.bodyMd).toBe('Mời khảo sát [tại đây](https://forms.example.test/x)')
    expect(c.flags).toEqual([])
  })

  it('keeps unused columns in variables and recipients and counts them', () => {
    const c = convertNewsPost('x.json', post({ values: { '0001': [{ '{Họ tên}': 'A', '{Hệ số}': '1', '{Ngày}': '01/01/2026', '{Thừa}': 'z' }] } }))
    expect(c.payload.variables.map((v) => v.key)).toEqual(['HoTen', 'HeSo', 'Ngay', 'Thua'])
    expect(c.payload.recipients?.['0001'][0].Thua).toBe('z')
    expect(c.stats.unusedColumns).toBe(1)
    expect(c.flags).toEqual([{ kind: 'unused_columns', severity: 'info', detail: '1' }])
  })

  it('flags a placeholder in the body that has no column', () => {
    const c = convertNewsPost('x.json', post({ template: '<p>{Họ tên} và {Lạ}</p>' }))
    expect(c.flags.find((f) => f.kind === 'unknown_placeholder')).toMatchObject({ severity: 'warn', detail: '{Lạ}' })
  })

  it('declares every body placeholder and passes the server rules', () => {
    const c = convertNewsPost('x.json', post())
    const a = analyzeBody(c.payload.bodyMd, c.payload.variables.map((v) => v.key))
    expect(a.issues).toEqual([])
    expect(a.placeholders).toEqual(['HoTen', 'HeSo', 'Ngay'])
  })

  it('reduces HTML in recipient values to text and flags it', () => {
    const c = convertNewsPost('x.json', post({ values: { '0001': [{ '{Họ tên}': 'A', '{Hệ số}': '1', '{Ngày}': '<li>Ghi chú: x</li><br>y<script>z</script>' }] } }))
    expect(c.payload.recipients?.['0001'][0].Ngay).toBe('Ghi chú: x ; y')
    expect(c.flags).toContainEqual({ kind: 'recipient_html', severity: 'warn', detail: '1 value(s) reduced to text' })
  })

  it('flags a post with no recipients and an empty body', () => {
    const c = convertNewsPost('x.json', post({ template: '<p> </p>', values: {} }))
    expect(c.flags.map((f) => f.kind)).toEqual(expect.arrayContaining(['empty_body', 'no_recipients']))
  })

  it('flags a header that disagrees with the content', () => {
    const c = convertNewsPost('2023-03-06-vuot-khung.json', post({ template: '<p>Phụ cấp thâm niên vượt khung (PCTNVK): {Hệ số}</p>' }))
    expect(c.payload.series).toBe('Phụ cấp thâm niên vượt khung')
    expect(c.flags.find((f) => f.kind === 'title_disagrees')?.severity).toBe('warn')
  })
})

describe('titles', () => {
  it('drops placeholders from the header, tidies the leftovers and flags it', () => {
    const c = convertNewsPost('x.json', post({ header: 'Kết quả của {Họ tên} - năm 2025 ({Ngày})' }))
    expect(c.payload.title).toBe('Kết quả của - năm 2025')
    expect(c.flags).toContainEqual({ kind: 'title_placeholder', severity: 'warn', detail: '2 placeholder(s) dropped from the header' })
  })

  it('takes the text of an HTML or entity header', () => {
    const c = convertNewsPost('x.json', post({ header: '<b>Tin&nbsp;&amp;  b&aacute;o</b>' }))
    expect(c.payload.title).toBe('Tin & báo')
  })

  it('derives a title from the file name for an empty header and flags it', () => {
    const c = convertNewsPost('2024-12-02-Danh-gia-xep-loai.json', post({ header: '' }))
    expect(c.payload.title).toBe('Danh gia xep loai')
    expect(c.flags).toContainEqual({ kind: 'title_from_filename', severity: 'warn' })
  })

  it('cuts titles longer than 500 characters', () => {
    const c = convertNewsPost('x.json', post({ header: 'a'.repeat(600) }))
    expect(c.payload.title).toHaveLength(500)
    expect(c.flags.map((f) => f.kind)).toContain('title_truncated')
  })
})

describe('publish dates', () => {
  it('reads the date prefix of a file name', () => {
    expect(fileNameDate('2025-05-15-NLTX.json')).toBe('2025-05-15')
    expect(fileNameDate('2022-04-19 Du-kien.json')).toBe('2022-04-19')
    expect(fileNameDate('request-update-info-0.json')).toBeNull()
    expect(fileNameDate('2025-13-45-x.json')).toBeNull()
  })

  it('uses datestr when it equals or is within a few days of the file-name date', () => {
    expect(resolvePublishDate('2025-05-15-a.json', '2025-05-15')).toEqual({ date: '2025-05-15' })
    const near = resolvePublishDate('2025-05-15-a.json', '2025-05-17')
    expect(near.date).toBe('2025-05-17')
    expect(near.flag?.kind).toBe('date_differs')
    expect(near.flag?.severity).toBe('info')
    expect(resolvePublishDate('2025-05-15-a.json', '2025-05-12').date).toBe('2025-05-12')
  })

  it('falls back to the file-name date and flags a bigger gap', () => {
    const r = resolvePublishDate('2026-02-03-a.json', '2026-03-02')
    expect(r.date).toBe('2026-02-03')
    expect(r.flag).toMatchObject({ kind: 'date_mismatch', severity: 'warn' })
  })

  it('falls back to the file name when datestr is invalid, and to datestr when the name has no date', () => {
    expect(resolvePublishDate('2025-05-15-a.json', 'nonsense').date).toBe('2025-05-15')
    expect(resolvePublishDate('banner.json', '2023-11-18')).toEqual({ date: '2023-11-18' })
    expect(() => resolvePublishDate('banner.json', '')).toThrow()
  })

  it('formats 08:00 +07:00 and measures day gaps', () => {
    expect(toPublishedAt('2025-05-15')).toBe('2025-05-15T08:00:00+07:00')
    expect(daysBetween('2025-12-31', '2026-01-02')).toBe(2)
  })

  it('is applied to the payload', () => {
    const c = convertNewsPost('2023-01-04-a.json', post({ datestr: '2022-12-14' }))
    expect(c.payload.publishedAt).toBe('2023-01-04T08:00:00+07:00')
    expect(c.flags.map((f) => f.kind)).toContain('date_mismatch')
  })
})

describe('tag and series guesses', () => {
  const guess = (fileName: string, title: string, bodyText = '') => {
    const g = guessTagAndSeries({ fileName, title, bodyText })
    return [g.tag, g.series]
  }

  it('follows the keyword table', () => {
    expect(guess('2025-05-15-NLTX-2025.json', 'Nâng lương thường xuyên năm 2025 (dự kiến)')).toEqual(['Lương', 'Nâng lương thường xuyên'])
    expect(guess('2024-02-27-NLThuongXuyen.json', 'x')).toEqual(['Lương', 'Nâng lương thường xuyên'])
    expect(guess('2022-04-19 Du-kien-nang-bac-luong.json', 'Dự kiến nâng bậc lương thường xuyên')).toEqual(['Lương', 'Nâng lương thường xuyên'])
    expect(guess('2025-04-15-TNNG-2024.json', 'Phụ cấp thâm niên nhà giáo năm 2024')).toEqual(['Thâm niên', 'Thâm niên nhà giáo'])
    expect(guess('2025-05-15-Vuot-khung-2025.json', 'Dự kiến thực hiện chế độ phụ cấp thâm niên vượt khung')).toEqual(['Lương', 'Phụ cấp thâm niên vượt khung'])
    expect(guess('2024-02-27-Vuotkhung.json', '')).toEqual(['Lương', 'Phụ cấp thâm niên vượt khung'])
    expect(guess('2022-12-14-phu-cap-uu-dai.json', 'Phụ cấp ưu đãi nhà giáo năm 2022')).toEqual(['Lương', 'Phụ cấp ưu đãi nhà giáo'])
    expect(guess('2025-12-04-Danh-gia-xep-loai-vien-chuc.json', 'Kết quả đánh giá, xếp loại viên chức năm 2025')).toEqual(['Chung', 'Đánh giá xếp loại viên chức'])
    expect(guess('2025-06-16-khao-sat.json', 'Khảo sát nhu cầu sử dụng Internet')).toEqual(['Khảo sát', null])
    expect(guess('2021-07-09-dang-ky-sang-kien.json', 'Đăng ký sáng kiến')).toEqual(['Chung', null])
    expect(guess('2025-12-09-NLS.json', 'Nâng lương trước hạn do lập thành tích')).toEqual(['Lương', 'Nâng lương trước hạn'])
    expect(guess('2023-04-04-cccd.json', 'Cập nhật CCCD')).toEqual(['Chung', null])
  })

  it('uses Chung when nothing matches', () => {
    expect(guessTagAndSeries({ fileName: 'a.json', title: 'Thông báo', bodyText: '' })).toEqual({ tag: 'Chung', series: null, rule: 'default', basis: [] })
  })

  it('prefers the content over a wrong header', () => {
    expect(guess('2021-05-24-phu-cap-tham-nien-v2.json', 'Nâng lương thường xuyên năm 2021', 'phụ cấp thâm niên vượt khung trong năm 2021')).toEqual(['Lương', 'Phụ cấp thâm niên vượt khung'])
  })

  it('normalises camelCase, digits and accents', () => {
    expect(normalizeForMatch('NangLuongThuongXuyen2021-v2')).toBe('nang luong thuong xuyen 2021 v 2')
    expect(normalizeForMatch('NLThuongXuyen')).toBe('nl thuong xuyen')
    expect(normalizeForMatch('Đánh giá, xếp loại')).toBe('danh gia xep loai')
  })
})

describe('banner', () => {
  const banner: V1Post = {
    header: '',
    template: '<p>Cập nhật thông tin <a href="https://forms.example.test/abc">tại đây</a></p>\r\n<p>Lưu ý:<p>\r\n<ul>\r\n<li>Một</li>\r\n<li>Hai</li>\r\n</ul>\r\n',
    datestr: '2023-11-18',
    category: 'request-update-info',
    values: { '0001': [{ '{MA}': '0001' }], '0002': [{ '{MA}': '0002' }] },
  }

  it('becomes one pinned post for everyone', () => {
    const c = convertBanner('request-update-info-0.json', banner)
    const p = c.payload
    expect(p.legacyKey).toBe('request-update-info')
    expect(p.title).toBe('Cập nhật thông tin cá nhân')
    expect(p.audienceAll).toBe(true)
    expect(p.recipients).toBeNull()
    expect(p.markRead).toBe(false)
    expect(p.requiresAck).toBe(false)
    expect(p.pinnedUntil).toBe('2027-12-31T23:59:59+07:00')
    expect(p.tags).toEqual(['Chung'])
    expect(p.series).toBeNull()
    expect(p.publishedAt).toBe('2023-11-18T08:00:00+07:00')
    expect(p.variables).toEqual([])
    expect(p.bodyMd).toBe('Cập nhật thông tin [tại đây](https://forms.example.test/abc)\n\nLưu ý:\n\n- Một\n- Hai')
    expect(c.flags).toEqual([])
    expect(analyzeBody(p.bodyMd, []).issues).toEqual([])
  })

  it('takes pinnedUntil from the option', () => {
    expect(convertBanner('request-update-info-0.json', banner, { bannerPinnedUntil: '2030-01-01T00:00:00+07:00' }).payload.pinnedUntil).toBe('2030-01-01T00:00:00+07:00')
  })
})

describe('recipients', () => {
  const keys = new Map([['{A}', 'A'], ['{B}', 'B']])

  it('cleans padding, entities and tags', () => {
    expect(cleanValue('  Nguyễn   Văn  A \r\n')).toEqual({ text: 'Nguyễn Văn A', hadTags: false })
    expect(cleanValue('R&amp;D&nbsp;x')).toEqual({ text: 'R&D x', hadTags: false })
    expect(cleanValue('a<br>b<br/>c')).toEqual({ text: 'a ; b ; c', hadTags: true })
    expect(cleanValue('<li>x</li>\r\n<li>y</li>')).toEqual({ text: 'x ; y', hadTags: true })
    expect(cleanValue('a < b')).toEqual({ text: 'a < b', hadTags: false })
    expect(cleanValue(null)).toEqual({ text: '', hadTags: false })
    expect(cleanValue(5)).toEqual({ text: '5', hadTags: false })
  })

  it('maps multi-row, empty and mixed rows and ignores unknown columns', () => {
    const r = mapRecipients(
      { ' 0001 ': [{ '{A}': ' x ', '{B}': '' }, { '{A}': 'y', '{Z}': 'ignored' }], '0002': [{}], '0003': [] },
      keys,
    )
    expect(r.recipients).toEqual({ '0001': [{ A: 'x' }, { A: 'y' }], '0002': [{}], '0003': [] })
    expect(r.recipientCount).toBe(3)
    expect(r.rowCount).toBe(3)
    expect(r.samples.get('{A}')).toEqual(['x', 'y'])
  })
})

describe('context labels', () => {
  it('names a placeholder after the words before it', () => {
    const md = 'Kính gửi quý Thầy/Cô như sau: Chức danh: :var[A], bậc :var[B] lên bậc :var[C]\n\n- Mã số: :var[D]\n- :var[E]\n- Thông tin :var[G] (MSCB: :var[F])'
    const labels = contextLabels(md)
    expect(labels.get('A')).toBe('Chức danh')
    expect(labels.has('B')).toBe(false)
    expect(labels.get('C')).toBe('Lên bậc')
    expect(labels.get('D')).toBe('Mã số')
    expect(labels.has('E')).toBe(false)
    expect(labels.get('F')).toBe('MSCB')
  })

  it('gives duplicate labels the column name', () => {
    const c = convertNewsPost('x.json', post({ template: '<p>Hệ số: {Hệ số}</p><p>Hệ số: {Ngày}</p>', values: { '1': [{ '{Hệ số}': '1', '{Ngày}': '2' }] } }))
    expect(c.payload.variables.map((v) => v.label)).toEqual(['Hệ số (Hệ số)', 'Hệ số (Ngày)'])
  })
})
