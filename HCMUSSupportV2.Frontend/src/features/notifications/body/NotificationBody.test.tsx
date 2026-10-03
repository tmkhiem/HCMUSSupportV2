import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithTheme } from '../../../test/render'
import NotificationBody from './NotificationBody'
import { isAllowedImageUrl, isSafeLinkUrl } from './urls'

const FILE_ID = '0197a3c2-5b1e-7c4a-8d2f-3e9b6a1c4d5e'

function body(markdown: string, vars?: Array<Record<string, string>> | null) {
  const { container } = renderWithTheme(<NotificationBody markdown={markdown} vars={vars} />)
  return container.querySelector('[data-testid="notification-body"]') as HTMLElement
}

describe('NotificationBody substitution', () => {
  it('replaces :var[Key] with the recipient value', () => {
    const el = body('Hệ số lương mới: :var[HeSoLuong] (từ :var[NgayHieuLuc])', [{ HeSoLuong: '3,66', NgayHieuLuc: '01/07/2026' }])
    expect(el).toHaveTextContent('Hệ số lương mới: 3,66 (từ 01/07/2026)')
  })

  it('renders a missing value, a blank value and no vars at all as an em dash', () => {
    expect(body('A :var[Missing] B', [{ Other: 'x' }])).toHaveTextContent('A — B')
    expect(body('A :var[Blank] B', [{ Blank: '   ' }])).toHaveTextContent('A — B')
    expect(body('A :var[Any] B')).toHaveTextContent('A — B')
    expect(body('A :var[Any] B', [])).toHaveTextContent('A — B')
  })

  it('only reads own properties (constructor / toString are legal keys)', () => {
    expect(body(':var[constructor] :var[toString] :var[hasOwnProperty]', [{ x: '1' }])).toHaveTextContent('— — —')
  })

  it('substitutes inside headings, lists, quotes, emphasis and table cells', () => {
    const el = body(
      ['# Gửi :var[Ten]', '', '- Mục :var[Ten]', '', '> Trích :var[Ten]', '', '**:var[Ten]**', '', '| Cột |', '| --- |', '| :var[Ten] |'].join('\n'),
      [{ Ten: 'An' }],
    )
    expect(within(el).getByRole('heading', { name: 'Gửi An' })).toBeInTheDocument()
    expect(within(el).getByRole('listitem')).toHaveTextContent('Mục An')
    expect(el.querySelector('blockquote')).toHaveTextContent('Trích An')
    expect(el.querySelector('strong')).toHaveTextContent('An')
    expect(within(el).getByRole('cell')).toHaveTextContent('An')
  })

  it('does not substitute inside code', () => {
    const el = body('Dùng `:var[Ten]` nhé', [{ Ten: 'An' }])
    expect(el.querySelector('code')).toHaveTextContent(':var[Ten]')
  })
})

describe('NotificationBody value safety', () => {
  it('shows markup in a value literally', () => {
    const value = '<img src=x onerror=alert(1)> **bold** [x](javascript:alert(1)) <script>alert(1)</script>'
    const el = body('Giá trị: :var[X]', [{ X: value }])
    expect(el).toHaveTextContent(value)
    expect(el.querySelector('img')).toBeNull()
    expect(el.querySelector('script')).toBeNull()
    expect(el.querySelector('strong')).toBeNull()
    expect(el.querySelector('a')).toBeNull()
  })

  it('shows markdown structure in a value literally (no headings, lists, tables)', () => {
    const el = body(':var[X]', [{ X: '# Tiêu đề\n- a\n| a | b |' }])
    expect(el.querySelector('h2')).toBeNull()
    expect(el.querySelector('ul')).toBeNull()
    expect(el.querySelector('table')).toBeNull()
    expect(el).toHaveTextContent('# Tiêu đề')
  })

  it('does not treat a value that looks like a placeholder as one (no second pass)', () => {
    expect(body(':var[A]', [{ A: ':var[B]', B: 'secret' }])).toHaveTextContent(':var[B]')
  })
})

describe('NotificationBody unknown directives and look-alikes stay literal', () => {
  it.each([
    ['Họp lúc 10:30 sáng', 'Họp lúc 10:30 sáng'],
    ['a:b và x:y', 'a:b và x:y'],
    ['Liên hệ mailto:a@b.vn', 'Liên hệ mailto:a@b.vn'],
    [':note[abc]{x=1}', ':note[abc]{x=1}'],
    [':var[bad key]', ':var[bad key]'],
    [':var[Key]{a=1}', ':var[Key]{a=1}'],
    [':var[**Key**]', ':var[**Key**]'],
    [':var[]', ':var[]'],
    [':var[_Key_]', ':var[_Key_]'],
    [':var[1Key]', ':var[1Key]'],
    [':var', ':var'],
    ['::var[Key]', '::var[Key]'],
  ])('%j', (md, text) => {
    expect(body(md, [{ Key: 'ZZZ' }])).toHaveTextContent(text, { normalizeWhitespace: true })
    expect(body(md, [{ Key: 'ZZZ' }])).not.toHaveTextContent('ZZZ')
  })

  it('renders a container directive as literal paragraph text', () => {
    const el = body(':::note\nnội dung\n:::', [{}])
    expect(el).toHaveTextContent(':::note')
    expect(el).toHaveTextContent('nội dung')
  })
})

describe('NotificationBody links, images and HTML', () => {
  it('opens safe links in a new tab with rel noopener noreferrer', () => {
    const el = body('[Trang](https://example.test/x) và [mail](mailto:a@b.vn) và [nội bộ](/news/1)')
    const links = within(el).getAllByRole('link')
    expect(links).toHaveLength(3)
    for (const a of links) {
      expect(a).toHaveAttribute('target', '_blank')
      expect(a).toHaveAttribute('rel', 'noopener noreferrer')
    }
    expect(links[0]).toHaveAttribute('href', 'https://example.test/x')
  })

  it('drops javascript:, data: and other schemes from links but keeps the text', () => {
    const el = body('[a](javascript:alert(1)) [b](JaVaScRiPt:alert(1)) [c](data:text/html;base64,AAAA) [d](vbscript:x) [e](//evil.test)')
    expect(within(el).queryAllByRole('link')).toHaveLength(0)
    expect(el.querySelector('[href]')).toBeNull()
    expect(el).toHaveTextContent('a b c d e')
  })

  it('renders images only from /api/files/{uuid}', () => {
    const el = body(
      [
        `![ok](/api/files/${FILE_ID})`,
        '![remote](https://tracker.test/p.gif)',
        '![data](data:image/png;base64,AAAA)',
        '![other](/api/admin/secret.png)',
        `![query](/api/files/${FILE_ID}?x=1)`,
      ].join('\n\n'),
    )
    const imgs = el.querySelectorAll('img')
    expect(imgs).toHaveLength(1)
    expect(imgs[0]).toHaveAttribute('src', `/api/files/${FILE_ID}`)
    expect(imgs[0]).toHaveAttribute('alt', 'ok')
  })

  it('drops raw HTML from the body', () => {
    const el = body(
      'Trước <b>đậm</b> <script>alert(1)</script> <img src=x onerror=alert(1)> sau\n\n<div onclick="x()">khối</div>\n\n<!-- ghi chú -->',
    )
    expect(el.querySelector('b, script, img, div[onclick], iframe')).toBeNull()
    // Tags are dropped; text between inline tags stays as inert text. A whole HTML block is dropped with its content.
    expect(el).not.toHaveTextContent('<')
    expect(el).not.toHaveTextContent('khối')
    expect(el).not.toHaveTextContent('ghi chú')
    expect(el).toHaveTextContent('Trước')
    expect(el).toHaveTextContent('sau')
  })
})

describe('NotificationBody multiple rows', () => {
  it('renders one block per row with a divider between', () => {
    const el = body('Môn **:var[Mon]**: :var[Tien]', [
      { Mon: 'Toán', Tien: '1.000' },
      { Mon: 'Lý', Tien: '2.000' },
      { Mon: 'Hóa' },
    ])
    const blocks = el.querySelectorAll('[data-testid="notification-body-block"]')
    expect(blocks).toHaveLength(3)
    expect(blocks[0]).toHaveTextContent('Môn Toán: 1.000')
    expect(blocks[1]).toHaveTextContent('Môn Lý: 2.000')
    expect(blocks[2]).toHaveTextContent('Môn Hóa: —')
    expect(el.querySelectorAll('[data-testid="vars-row-divider"]')).toHaveLength(2)
  })

  it('renders a single block and no divider for one row', () => {
    const el = body('x', [{ a: '1' }])
    expect(el.querySelectorAll('[data-testid="notification-body-block"]')).toHaveLength(1)
    expect(el.querySelector('[data-testid="vars-row-divider"]')).toBeNull()
  })
})

describe('NotificationBody tables and typography', () => {
  it('renders a GFM table as themed MUI table cells with alignment', () => {
    const el = body('| Tên | Số tiền |\n| :-- | --: |\n| An | 1.000 |\n| Bình | 2.000 |')
    expect(el.querySelector('table')).toHaveClass('MuiTable-root')
    expect(el.querySelectorAll('thead th.MuiTableCell-head')).toHaveLength(2)
    expect(el.querySelectorAll('tbody td.MuiTableCell-body')).toHaveLength(4)
    const cells = el.querySelectorAll('tbody td')
    expect(cells[1]).toHaveClass('MuiTableCell-alignRight')
    expect(cells[0]).toHaveClass('MuiTableCell-alignLeft')
    // theme head style: primary background, white text
    expect(getComputedStyle(el.querySelector('th') as Element).backgroundColor).toBe('rgb(48, 63, 159)')
  })

  it('shifts markdown headings below the page h1', () => {
    const el = body('# A\n\n## B\n\n###### F')
    expect(el.querySelector('h1')).toBeNull()
    expect(screen.getByRole('heading', { name: 'A', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'B', level: 3 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'F', level: 6 })).toBeInTheDocument()
  })

  it('renders lists, quotes, rules, emphasis and strikethrough', () => {
    const el = body('- a\n- b\n\n1. c\n\n> q\n\n---\n\n*i* **b** ~~s~~')
    expect(el.querySelectorAll('ul li')).toHaveLength(2)
    expect(el.querySelectorAll('ol li')).toHaveLength(1)
    expect(el.querySelector('blockquote')).toBeInTheDocument()
    expect(el.querySelector('hr')).toBeInTheDocument()
    expect(el.querySelector('em')).toHaveTextContent('i')
    expect(el.querySelector('strong')).toHaveTextContent('b')
    expect(el.querySelector('del')).toHaveTextContent('s')
  })
})

describe('url allow-lists', () => {
  it('isSafeLinkUrl', () => {
    for (const ok of ['https://a.test', 'http://a.test/x?y=1#z', 'mailto:a@b.vn', 'tel:+84123', '/news/1', '#top', 'HTTPS://A.TEST'])
      expect(isSafeLinkUrl(ok), ok).toBe(true)
    for (const bad of ['javascript:alert(1)', ' javascript:alert(1)', 'java\tscript:alert(1)', 'data:text/html,x', 'file:///c:/x', '//evil.test', 'relative/path', '', undefined])
      expect(isSafeLinkUrl(bad), String(bad)).toBe(false)
  })

  it('isAllowedImageUrl', () => {
    expect(isAllowedImageUrl(`/api/files/${FILE_ID}`)).toBe(true)
    for (const bad of [`/api/files/${FILE_ID}/`, `/api/files/${FILE_ID}?a=1`, `https://x.test/api/files/${FILE_ID}`, '/api/files/not-a-uuid', `/api/files/${FILE_ID.toUpperCase()}`, '/api/files/'])
      expect(isAllowedImageUrl(bad), bad).toBe(false)
  })
})
