import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'

/** Private-use characters that carry a placeholder index through Turndown's escaping untouched. */
const OPEN = ''
const CLOSE = ''
const TOKEN = new RegExp(`${OPEN}(\\d+)${CLOSE}`, 'g')

export interface ConvertOptions {
  /**
   * The v1 column text exactly as the values file spells it (`{7}` or `(7)`) -> v2 variable key. The v1 renderer replaced these
   * literal strings, so only they are placeholders; any other braces or parentheses stay literal text.
   */
  placeholders: ReadonlyMap<string, string>
}

export interface ConvertResult {
  markdown: string
  /** Variable keys in order of first use. */
  used: string[]
  /** Findings the operator should look at; a post with any of them is listed for review. */
  warnings: string[]
}

/** The link rule of docs/notification-markdown.md section 2 (http, https, mailto, tel, root-relative path, #fragment). */
export function isSafeLinkUrl(url: string): boolean {
  if (!url || /[\s\u0000-\u001f\u007f]/.test(url)) return false
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(url)
  if (scheme) return ['http', 'https', 'mailto', 'tel'].includes(scheme[1]!.toLowerCase())
  if (url.startsWith('//')) return false
  return url.startsWith('/') || url.startsWith('#')
}

/** `mailto: a@b` (a space after the colon is common in the v1 templates) and stray spaces become a valid URL when that is unambiguous. */
function repairUrl(raw: string): string {
  let url = raw.trim().replace(/^(mailto|tel):\s+/i, '$1:')
  if (/^https?:\/\//i.test(url)) url = url.replace(/ /g, '%20')
  return url
}

function isBold(style: string): boolean {
  const m = /font-weight\s*:\s*([a-z0-9]+)/i.exec(style)
  if (!m) return false
  const v = m[1]!.toLowerCase()
  return v === 'bold' || v === 'bolder' || (/^\d+$/.test(v) && Number(v) >= 600)
}

const isItalic = (style: string) => /font-style\s*:\s*italic/i.test(style)
const isStruck = (style: string) => /text-decoration[^;]*line-through/i.test(style)

function wrapInline(content: string, mark: string): string {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(content)!
  return m[2] ? `${m[1]}${mark}${m[2]}${mark}${m[3]}` : content
}

/**
 * Converts the HTML a v1 news template carries (hand-typed lists, Word/Outlook spans with inline styles, `&nbsp;` and other
 * entities, `<br>` runs) into the GFM subset of docs/notification-markdown.md: no raw HTML, no images, safe links only, `{col}`
 * placeholders as `:var[key]`. Anything that cannot be represented is dropped and reported in `warnings`.
 */
export function htmlToMarkdown(html: string, options: ConvertOptions): ConvertResult {
  const warnings: string[] = []
  const warn = (message: string) => { if (!warnings.includes(message)) warnings.push(message) }

  // Placeholders first, as private-use tokens: they survive the HTML parser and Markdown escaping unchanged.
  const keys: string[] = []
  const used: string[] = []
  let source = html.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').replace(/[\u200b-\u200f\u2060\ufeff]/g, '')
  const literals = [...options.placeholders.keys()].filter(k => k.length > 0).sort((a, b) => b.length - a.length)
  if (literals.length > 0) {
    const pattern = new RegExp(literals.map(l => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g')
    source = source.replace(pattern, literal => {
      const key = options.placeholders.get(literal)!
      if (!used.includes(key)) used.push(key)
      keys.push(key)
      return `${OPEN}${keys.length - 1}${CLOSE}`
    })
  }

  const service = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
    hr: '***',
    br: '\\',
    codeBlockStyle: 'indented',
    linkStyle: 'inlined',
  })
  service.use(gfm)

  const baseEscape = service.escape.bind(service)
  service.escape = (text: string) =>
    baseEscape(text)
      .replace(/</g, '\\<') // a literal "<b>" in text must not become raw HTML
      .replace(/:(?=[A-Za-z][\w-]*\\?[[{])/g, '\\:') // ":name[" would be read as a directive

  service.addRule('drop-active-content', {
    filter: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'select', 'textarea'] as TurndownService.Filter,
    replacement: (_content, node) => {
      const name = node.nodeName.toLowerCase()
      if (!['script', 'style'].includes(name)) warn(`<${name}> removed`)
      return ''
    },
  })

  service.addRule('image', {
    filter: 'img',
    replacement: () => {
      warn('image removed (v2 posts only embed uploaded files)')
      return ''
    },
  })

  service.addRule('safe-link', {
    filter: 'a',
    replacement: (content, node) => {
      const text = content.trim()
      const href = repairUrl((node as unknown as Element).getAttribute('href') ?? '')
      if (!href) return text
      if (!isSafeLinkUrl(href)) {
        warn(`link with an unsupported target removed, text kept (${href.slice(0, 20)})`)
        return text
      }
      const label = text || href
      return `[${label}](${href.replace(/[()]/g, c => (c === '(' ? '%28' : '%29'))})`
    },
  })

  // Not representable: underline, sub/superscript, highlight (the contract forbids them); keep the text.
  service.addRule('plain-text-only', {
    filter: ['u', 'ins', 'sub', 'sup', 'mark', 'small', 'big', 'font', 'center', 'o:p', 'abbr', 'cite', 'span'] as TurndownService.Filter,
    replacement: content => content,
  })

  // Word/Outlook formatting lives in span styles, not in <b>/<i>.
  service.addRule('styled-inline', {
    filter: node => node.nodeName === 'SPAN' && /font-weight|font-style|text-decoration/i.test((node as unknown as Element).getAttribute('style') ?? ''),
    replacement: (content, node) => {
      const style = (node as unknown as Element).getAttribute('style') ?? ''
      let out = content
      if (isStruck(style)) out = wrapInline(out, '~~')
      if (isItalic(style)) out = wrapInline(out, '*')
      if (isBold(style)) out = wrapInline(out, '**')
      return out
    },
  })

  // <pre> and code blocks are forbidden: keep the lines as paragraph text.
  service.addRule('pre-as-text', {
    filter: 'pre',
    replacement: content => `\n\n${content.trim().replace(/\n/g, '\\\n')}\n\n`,
  })

  // Tables: always a GFM pipe table, whether or not the source had a header row; merged cells are flattened and reported.
  service.addRule('table', {
    filter: 'table',
    replacement: (_content, node) => tableToMarkdown(node as unknown as Element, service, warn),
  })

  let markdown = service.turndown(source)

  markdown = markdown
    .replace(TOKEN, (_m, index: string) => `:var[${keys[Number(index)]}]`)
    .replace(/[\uE000\uE001]/g, '')
    .replace(/\u00a0/g, ' ') // &nbsp; is decoded by the HTML parser, after the source was cleaned
    .replace(/[ \t]+\n/g, '\n')
    .replace(/(?:\\\n)+(?=\n|$)/g, '') // a hard break at the end of a block
    .replace(/^([ \t]*)-   (?=\S)/gm, '$1- ') // Turndown indents bullet text by three spaces
    .replace(/(\S) {2,}(?=\S)/g, '$1 ') // runs of spaces typed in Word
    .replace(/^[ \t]*-[ \t]*$/gm, '') // empty list items
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!markdown) warn('the converted body is empty')
  const leftover = [...markdown.matchAll(/\{([^{}\s]{1,12})\}/g)].map(m => m[1])
  if (leftover.length > 0) warn(`text in braces kept as is: ${[...new Set(leftover)].slice(0, 5).join(', ')}`)
  return { markdown, used, warnings }
}

function tableToMarkdown(table: Element, service: TurndownService, warn: (m: string) => void): string {
  const rows = Array.from(table.querySelectorAll("tr"))
  if (rows.length === 0) return ''
  let merged = false
  const grid: string[][] = rows.map(row => {
    const cells: string[] = []
    for (const cell of Array.from(row.children).filter(c => ['TD', 'TH'].includes(c.nodeName))) {
      const colspan = Math.max(1, Number(cell.getAttribute('colspan') ?? 1) || 1)
      if (colspan > 1 || Number(cell.getAttribute('rowspan') ?? 1) > 1) merged = true
      const text = service.turndown(cell.innerHTML).replace(/\s*\n+\s*/g, ' ').replace(/\|/g, '\\|').trim()
      cells.push(text)
      for (let i = 1; i < colspan; i++) cells.push('')
    }
    return cells
  })
  if (merged) warn('table with merged cells flattened: check the layout')
  if (!table.querySelector('th, thead')) warn('table had no header row: the first row became the header')
  const width = Math.max(...grid.map(r => r.length))
  if (width === 0) return ''
  const pad = (r: string[]) => [...r, ...Array<string>(width - r.length).fill('')]
  const line = (r: string[]) => `| ${pad(r).join(' | ')} |`
  const [head, ...body] = grid as [string[], ...string[][]]
  return `\n\n${[line(head), `| ${Array<string>(width).fill('---').join(' | ')} |`, ...body.map(line)].join('\n')}\n\n`
}
