import { describe, expect, it } from 'vitest'
import { FlagBag } from '../src/flags.ts'
import { htmlToMarkdown, type ColumnToken } from '../src/htmlToMarkdown.ts'
import { analyzeBody } from '../src/validate.ts'

function convert(html: string, columns: ColumnToken[] = []) {
  const flags = new FlagBag()
  const result = htmlToMarkdown(html, columns, flags)
  const issues = analyzeBody(result.markdown, columns.map((c) => c.key)).issues.map((i) => i.code)
  return { ...result, flags: flags.list(), kinds: flags.list().map((f) => f.kind), issues }
}

const col = (token: string, key: string): ColumnToken => ({ token, key })

describe('Word and Outlook junk', () => {
  it('drops conditional comments, mso styles, o:p, empty spans and Mso classes', () => {
    const html = `<!--[if gte mso 9]><xml><w:WordDocument><w:View>Normal</w:View></w:WordDocument></xml><![endif]-->
<!--[if !supportLists]--><!--[endif]--><![if !vml]><![endif]>
<p class=MsoNormal style="margin:0cm 0cm 8pt;mso-line-height-rule:exactly;text-indent:36pt"><span style='font-size:11.0pt;font-family:"Calibri",sans-serif;mso-ansi-language:EN-US'>Kính gửi quý Thầy/Cô<o:p></o:p></span></p>
<p class=MsoNormal><span style="mso-spacerun:yes">&nbsp;</span><span></span><o:p>&nbsp;</o:p></p>
<p class=MsoNormal><span style="font-size:11pt">Trân trọng.<o:p></o:p></span></p>`
    const r = convert(html)
    expect(r.markdown).toBe('Kính gửi quý Thầy/Cô\n\nTrân trọng.')
    expect(r.markdown).not.toMatch(/mso|Mso|o:p|<|\[if/)
    expect(r.issues).toEqual([])
  })

  it('turns bold and italic expressed as inline styles into Markdown', () => {
    const r = convert(`<p><span style="font-weight:700">Quan trọng</span> và <span style="font-style: italic">nghiêng</span> và <span style="font-weight:400;font-style:normal">thường</span></p>`)
    expect(r.markdown).toBe('**Quan trọng** và *nghiêng* và thường')
  })

  it('does not bold text whose wrapper says font-weight normal (Google Docs)', () => {
    const r = convert(`<b style="font-weight:normal" id="docs-internal-guid-1"><p>Văn bản</p></b>`)
    expect(r.markdown).toBe('Văn bản')
  })

  it('keeps a space left by a whitespace-only formatting element', () => {
    const r = convert('<p>một<b> </b>hai<b>ba</b><b>bốn</b></p>')
    expect(r.markdown).toBe('một hai**babốn**')
  })

  it('collapses whitespace and non-breaking spaces', () => {
    const r = convert('<p>Hệ&nbsp; số\r\n   lương&nbsp;</p>')
    expect(r.markdown).toBe('Hệ số lương')
  })

  it('does not emit raw HTML for script, style and iframes', () => {
    const r = convert('<style>p{color:red}</style><script>alert(1)</script><p>an toàn</p><iframe src="https://x.test"></iframe>')
    expect(r.markdown).toBe('an toàn')
    expect(r.kinds).toEqual(['html_removed'])
    expect(r.flags[0].severity).toBe('error')
  })
})

describe('entities and special characters', () => {
  it('decodes named, numeric and accented entities', () => {
    const r = convert('<p>K&iacute;nh gửi &ndash; qu&yacute; v&#7883; &amp; &#x4E2D; &quot;x&quot;</p>')
    expect(r.markdown).toBe('Kính gửi – quý vị & 中 "x"')
  })

  it('escapes text that would otherwise be HTML or Markdown syntax', () => {
    const r = convert('<p>&lt;b&gt;đậm&lt;/b&gt; và a &lt; b, 5*3, snake_case, [x], ==y==, :var[Z], a::b</p>')
    expect(r.markdown).toContain('\\<b>đậm\\</b>')
    expect(r.issues).toEqual([])
  })

  it('does not let a literal :var[...] in the source become a placeholder', () => {
    const r = convert('<p>gõ :var[HoTen] ở đây</p>')
    expect(r.usedKeys).toEqual([])
    expect(r.markdown).not.toMatch(/(^|[^\\]):var\[/)
  })

  it('writes entities in text so that Markdown does not decode them twice', () => {
    const r = convert('<p>R&amp;D &amp;amp; &amp;copy;</p>')
    expect(r.markdown).toBe('R&D \\&amp; \\&copy;')
  })
})

describe('placeholders', () => {
  const cols = [col('{HoTen}', 'HoTen'), col('{Hệ số}', 'HeSo'), col('(7)', 'Cot7'), col('{0}', 'Cot0')]

  it('turns {Col} into :var[key]', () => {
    const r = convert('<p>Kính gửi {HoTen}, hệ số {Hệ số}.</p>', cols)
    expect(r.markdown).toBe('Kính gửi :var[HoTen], hệ số :var[HeSo].')
    expect(r.usedKeys).toEqual(['HoTen', 'HeSo'])
    expect(r.issues).toEqual([])
  })

  it('handles placeholders split across tags by Word', () => {
    const html = `<p>A {<span style="mso-bidi-font-size:10pt">Ho</span><span>Ten</span>} B</p>
<p><b>{</b><i>H</i>ệ&nbsp;<u>số</u><o:p></o:p>} C</p>
<p>(<span>7</span>)</p>`
    const r = convert(html, cols)
    // The placeholder takes the format of its first character (the bold brace).
    expect(r.markdown).toBe('A :var[HoTen] B\n\n**:var[HeSo]** C\n\n:var[Cot7]')
    expect(r.usedKeys).toEqual(['HoTen', 'HeSo', 'Cot7'])
  })

  it('handles several placeholders in one text node and parenthesised or numeric names', () => {
    const r = convert('<ul><li>MSCB: {0}</li><li>Mục (7) và {0}</li></ul>', cols)
    expect(r.markdown).toBe('- MSCB: :var[Cot0]\n- Mục :var[Cot7] và :var[Cot0]')
  })

  it('formats around placeholders', () => {
    const r = convert('<p><b>{HoTen}</b> và <i>{Hệ số}</i></p>', cols)
    expect(r.markdown).toBe('**:var[HoTen]** và *:var[HeSo]*')
    expect(r.issues).toEqual([])
  })

  it('keeps a directive recognisable after a colon or before a brace', () => {
    const r = convert('<p>Tên:{HoTen}{x}</p>', cols)
    expect(r.markdown).toBe('Tên: :var[HoTen]\\{x}')
    expect(r.issues).toEqual([])
  })

  it('reports {name} text that no column explains', () => {
    const r = convert('<p>Xin chào {HoTen} và {Lạ} {lạ khác}</p>', cols)
    expect(r.unknownPlaceholders).toEqual(['{Lạ}', '{lạ khác}'])
    expect(r.markdown).toContain(':var[HoTen]')
    expect(r.issues).toEqual([])
  })

  it('puts a bare placeholder inside a list into its own item', () => {
    const r = convert('<ul><li>Một: {0}</li>\n{HoTen}</ul>', cols)
    expect(r.markdown).toBe('- Một: :var[Cot0]\n- :var[HoTen]')
  })

  it('does not link a placeholder URL and flags it', () => {
    const r = convert('<p><a href="https://example.test/x?id={HoTen}">xem</a> <a href="https://example.test/%7B0%7D">hai</a></p>', cols)
    expect(r.markdown).toBe('xem hai')
    expect(r.kinds).toEqual(['placeholder_in_url'])
    expect(r.flags[0].count).toBe(2)
  })
})

describe('lists and breaks', () => {
  it('converts nested lists, unclosed items and Word wrappers', () => {
    const html = `<ul><li>A<ul><li>A1<li>A2</ul><li><div style="margin:0"><font size=4>B</font></div></li></ul>
<ol><li>x<li>y</ol>`
    const r = convert(html)
    expect(r.markdown).toBe('- A\n  - A1\n  - A2\n- B\n\n1. x\n2. y')
    expect(r.issues).toEqual([])
  })

  it('writes line breaks as backslash-newline, drops trailing ones and turns runs into paragraphs', () => {
    const r = convert('Một<br>hai<br><br>ba<br><br><br>bốn<br>')
    expect(r.markdown).toBe('Một\\\nhai\n\nba\n\nbốn')
  })

  it('keeps text before a list on its own paragraph', () => {
    const r = convert('Thông tin:<br><ul><li>một</li></ul>Hết')
    expect(r.markdown).toBe('Thông tin:\n\n- một\n\nHết')
  })

  it('converts headings, quotes and rules', () => {
    const r = convert('<h2>Tiêu đề</h2><blockquote>trích</blockquote><hr><p>hết</p>')
    expect(r.markdown).toBe('## Tiêu đề\n\n> trích\n\n***\n\nhết')
  })

  it('turns pre blocks into paragraphs and flags them', () => {
    const r = convert('<pre>a\n  b</pre>')
    expect(r.markdown).toBe('a\\\nb')
    expect(r.kinds).toEqual(['code_block'])
    expect(r.issues).toEqual([])
  })
})

describe('links', () => {
  it('keeps http, https and mailto links and repairs whitespace', () => {
    const r = convert('<p><a href=" https://example.test/a b ">trang</a> <a href="mailto: x@example.test">thư</a> <a href="HTTP://EXAMPLE.TEST/(1)">ngoặc</a></p>')
    expect(r.markdown).toBe('[trang](https://example.test/a%20b) [thư](mailto:x@example.test) [ngoặc](HTTP://EXAMPLE.TEST/\\(1\\))')
    expect(r.issues).toEqual([])
  })

  it('unwraps other schemes and relative links and flags them', () => {
    const r = convert('<p><a href="javascript:alert(1)">js</a> <a href="tel:+84123">gọi</a> <a href="/tin/1">tin</a> <a href="file:///c:/x">tệp</a></p>')
    expect(r.markdown).toBe('js gọi tin tệp')
    expect([...new Set(r.kinds)]).toEqual(['link_dropped'])
    expect(r.flags.map((f) => f.detail).sort()).toEqual(['file', 'javascript', 'relative', 'tel'])
  })

  it('drops anchors without text or href', () => {
    const r = convert('<p><a href="https://example.test"></a><a name="x">giữ chữ</a></p>')
    expect(r.markdown).toBe('giữ chữ')
  })
})

describe('images and unsupported layout', () => {
  it('removes images and flags them as errors', () => {
    const r = convert('<p>Trước <img src="https://example.test/a.png" alt="ảnh"> sau</p><img src="data:image/png;base64,AAAA">')
    expect(r.markdown).toBe('Trước sau')
    expect(r.flags.find((f) => f.kind === 'image')?.severity).toBe('error')
    expect(r.issues).toEqual([])
  })
})

describe('tables', () => {
  it('converts a simple table into a GFM table', () => {
    const html = `<table border=1><thead><tr><th>Tên</th><th>Số</th></tr></thead>
<tbody><tr><td><b>A</b> | b</td><td>{0}</td></tr><tr><td>Hai<br>dòng</td><td> </td></tr></tbody></table>`
    const r = convert(html, [col('{0}', 'Cot0')])
    expect(r.markdown).toBe('| Tên | Số |\n| --- | --- |\n| **A** \\| b | :var[Cot0] |\n| Hai dòng |   |')
    expect(r.flags).toEqual([])
    expect(r.issues).toEqual([])
  })

  it('uses the first row as the header when there are no th cells', () => {
    const r = convert('<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>')
    expect(r.markdown).toBe('| a | b |\n| --- | --- |\n| c | d |')
  })

  it('flags merged cells but still emits a rectangular table', () => {
    const html = `<table><tr><th colspan="2">Gộp</th></tr><tr><td rowspan="2">x</td><td>y</td></tr><tr><td>z</td></tr></table>`
    const r = convert(html)
    expect(r.kinds).toEqual(['merged_cells'])
    expect(r.flags[0].severity).toBe('error')
    expect(r.markdown).toBe('| Gộp |   |\n| --- | --- |\n| x | y |\n|   | z |')
    expect(r.issues).toEqual([])
  })

  it('flags nested tables and flattens the inner one to text', () => {
    const html = `<table><tr><td>ngoài</td><td><table><tr><td>t1</td><td>t2</td></tr></table></td></tr><tr><td>c</td><td>d</td></tr></table>`
    const r = convert(html)
    expect(r.kinds).toEqual(['nested_table'])
    expect(r.markdown).toContain('t1 ; t2')
    expect(r.markdown).not.toMatch(/\|\s*t1\s*\|/)
    expect(r.issues).toEqual([])
  })

  it('unwraps a one-cell layout table', () => {
    const r = convert('<table><tr><td><p>Chỉ một ô</p></td></tr></table>')
    expect(r.markdown).toBe('Chỉ một ô')
    expect(r.kinds).toEqual(['layout_table'])
    expect(r.flags[0].severity).toBe('info')
  })

  it('flattens lists inside cells and flags them', () => {
    const r = convert('<table><tr><th>A</th><th>B</th></tr><tr><td><ul><li>x</li><li>y</li></ul></td><td>z</td></tr></table>')
    expect(r.markdown).toBe('| A | B |\n| --- | --- |\n| x ; y | z |')
    expect(r.kinds).toEqual(['table_cell_blocks'])
  })
})

describe('whatever comes in, the result passes the validator', () => {
  const hostile = [
    '<p onclick="x()">a</p><script>x</script>',
    '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
    '<a href="javascript:void(0)">x</a>',
    '<p>a<br/>b</p><div>c<div>d</div></div>',
    '<p>[a]: https://x.test</p><p>[^1]: n</p><p>==x==</p><p>~~y~~</p>',
    '<p>:::note</p><p>::x[y]</p><p>:y{a=1}</p>',
    '<p>```js\ncode```</p><p>    indented</p>',
    '<xmp><b>x</b></xmp><svg><circle/></svg>',
    '<p>\u0001control\u0007 chars \u200B zero width</p>',
    '<p># không phải tiêu đề</p><p>1. không phải danh sách</p><p>- gạch</p><p>> trích</p>',
  ]
  for (const html of hostile) {
    it(JSON.stringify(html).slice(0, 60), () => {
      const r = convert(html)
      expect(r.issues).toEqual([])
      expect(r.markdown).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/)
    })
  }
})
