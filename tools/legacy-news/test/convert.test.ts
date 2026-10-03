import { describe, expect, it } from 'vitest'
import { htmlToMarkdown, isSafeLinkUrl } from '../src/convert.js'

const convert = (html: string, columns: Record<string, string> = {}) =>
  htmlToMarkdown(html, { placeholders: new Map(Object.entries(columns)) })

describe('htmlToMarkdown', () => {
  it('turns lists, paragraphs and hard breaks into GFM', () => {
    const r = convert('<p>Kính gửi quý Thầy Cô:</p><ul><li>Một</li><li>Hai<br>dòng</li></ul>')
    expect(r.markdown).toBe('Kính gửi quý Thầy Cô:\n\n- Một\n- Hai\\\n    dòng')
    expect(r.warnings).toEqual([])
  })

  it('repairs hand-typed lists with unclosed items and drops the trailing break', () => {
    const r = convert('<ul>\n<li>Một<br>\n<li>Hai<br>\n<li>Ba\n<ul>')
    expect(r.markdown).toBe('- Một\n- Hai\n- Ba')
  })

  it('replaces {col} and (n) placeholders with :var[key] and reports which keys were used', () => {
    const r = convert('<ul><li>Mã số: {0}</li><li>Bậc: (7), hệ số: (10)</li></ul>', { '{0}': 'c0', '(7)': 'c7', '(10)': 'c10', '{9}': 'c9' })
    expect(r.markdown).toBe('- Mã số: :var[c0]\n- Bậc: :var[c7], hệ số: :var[c10]')
    expect(r.used).toEqual(['c0', 'c7', 'c10'])
  })

  it('leaves braces and parentheses that are not columns alone, and says so', () => {
    const r = convert('<p>Ghi chú {thêm} (2) và {0}</p>', { '{0}': 'c0' })
    expect(r.markdown).toBe('Ghi chú {thêm} (2) và :var[c0]')
    expect(r.warnings.join()).toContain('thêm')
  })

  it('does not let a placeholder be mangled by Markdown escaping', () => {
    const r = convert('<p>_a_ *b* {ten_de_tai}</p>', { '{ten_de_tai}': 'ten_de_tai' })
    expect(r.markdown).toBe('\\_a\\_ \\*b\\* :var[ten_de_tai]')
  })

  it('removes Word/Outlook span noise but keeps real formatting from styles', () => {
    const html = `<span style='color: rgb(4, 9, 62); font-family: "Segoe UI"; font-weight: 400; white-space: normal;'>Kính gửi </span>`
      + `<span style="font-weight: 700">quan trọng</span>, <span style="font-style: italic; font-weight: bold">cả hai</span>`
    expect(convert(html).markdown).toBe('Kính gửi **quan trọng**, ***cả hai***')
  })

  it('decodes entities and non-breaking spaces', () => {
    expect(convert('<p>5&nbsp;&nbsp;triệu &amp; 3 &lt; 4 &#273;&#7891;ng</p>').markdown).toBe('5 triệu & 3 \\< 4 đồng')
  })

  it('never emits raw HTML: a literal <b> in text is escaped', () => {
    expect(convert('<p>&lt;b&gt;x&lt;/b&gt;</p>').markdown).toBe('\\<b>x\\</b>')
  })

  it('escapes text that would read as a directive', () => {
    expect(convert('<p>Mốc:abc[1] và 10:30</p>').markdown).toBe('Mốc\\:abc\\[1\\] và 10:30')
  })

  it('keeps safe links, repairs "mailto: x" and drops unsafe targets', () => {
    const r = convert('<a href="https://forms.gle/abc">tại đây</a> <a href="mailto: a@b.vn">mail</a> <a href="javascript:alert(1)">bad</a> <a href="//evil.test">x</a>')
    expect(r.markdown).toBe('[tại đây](https://forms.gle/abc) [mail](mailto:a@b.vn) bad x')
    expect(r.warnings).toHaveLength(2)
    expect(r.warnings.every(w => w.includes('unsupported target'))).toBe(true)
  })

  it('drops images and scripts with a warning', () => {
    const r = convert('<p>A</p><img src="data:image/png;base64,AAAA"><script>alert(1)</script><iframe src="x"></iframe>')
    expect(r.markdown).toBe('A')
    expect(r.warnings.some(w => w.includes('image removed'))).toBe(true)
    expect(r.warnings.some(w => w.includes('<iframe>'))).toBe(true)
  })

  it('drops underline, sub and sup but keeps the text', () => {
    expect(convert('<u>a</u><sup>2</sup> <sub>i</sub> <mark>m</mark>').markdown).toBe('a2 i m')
  })

  it('converts a header-less table and reports it', () => {
    const r = convert('<table><tr><td>A</td><td>B</td></tr><tr><td>1</td><td>2|3</td></tr></table>')
    expect(r.markdown).toBe('| A | B |\n| --- | --- |\n| 1 | 2\\|3 |')
    expect(r.warnings.join()).toContain('no header row')
  })

  it('flattens merged cells and reports the layout', () => {
    const r = convert('<table><thead><tr><th colspan="2">Tiêu đề</th></tr></thead><tr><td>1</td><td>2</td></tr></table>')
    expect(r.markdown).toBe('| Tiêu đề | |\n| --- | --- |\n| 1 | 2 |')
    expect(r.warnings.join()).toContain('merged cells')
  })

  it('flags an empty result', () => {
    const r = convert('<p> </p>')
    expect(r.markdown).toBe('')
    expect(r.warnings).toContain('the converted body is empty')
  })
})

describe('isSafeLinkUrl (docs/notification-markdown.md section 2)', () => {
  it.each(['https://a.b/c', 'http://a.b', 'mailto:a@b.c', 'tel:+84', '/api/files/x', '#top'])('accepts %s', url => {
    expect(isSafeLinkUrl(url)).toBe(true)
  })
  it.each(['javascript:x', 'data:text/html,x', 'file:///c', '//host/x', 'a/b', 'https://a b', ''])('rejects %s', url => {
    expect(isSafeLinkUrl(url)).toBe(false)
  })
})
