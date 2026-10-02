// @ts-ignore: the package's typings declare the module as 'domino', so TypeScript cannot resolve this import
import domino from '@mixmark-io/domino'
import TurndownService from 'turndown'
import { strikethrough } from 'turndown-plugin-gfm'
import { FlagBag } from './flags.ts'

/** A v1 column and the variable key it becomes. `token` is the exact text v1 replaced, e.g. `{Col}` or `(7)`. */
export interface ColumnToken {
  token: string
  key: string
}

export interface HtmlConversion {
  markdown: string
  /** Variable keys that appear in the body, in order of first use. */
  usedKeys: string[]
  /** `{name}` leftovers that are not a known column. */
  unknownPlaceholders: string[]
}

// Private-use markers that survive HTML parsing, whitespace collapsing and Markdown escaping.
const SENT_OPEN = '\uE000'
const SENT_CLOSE = '\uE001'
const PARA = '\uE002'
const SENTINEL = /\uE000(\d+)\uE001/g

const DROP_SILENT = new Set(['script', 'style', 'head', 'title', 'meta', 'link', 'xml', 'noscript', 'template', 'base'])
const DROP_FLAG = new Set([
  'iframe', 'object', 'embed', 'applet', 'svg', 'canvas', 'audio', 'video', 'source', 'track', 'map', 'area',
  'input', 'button', 'select', 'textarea', 'math', 'picture',
])
const UNWRAP = new Set([
  'font', 'u', 'ins', 'sup', 'sub', 'small', 'big', 'center', 'mark', 'span', 'label', 'abbr', 'cite', 'time', 'nobr',
  'var', 'bdi', 'bdo', 'data', 'dfn', 'q', 'ruby', 'rt', 'rp', 'wbr', 'acronym', 'tt', 'kbd', 'samp',
])
const RENAME_DIV = new Set([
  'section', 'article', 'header', 'footer', 'main', 'nav', 'aside', 'figure', 'figcaption', 'address', 'details',
  'summary', 'dl', 'dt', 'dd', 'hgroup', 'fieldset', 'form', 'legend',
])
const BLOCKS = new Set([
  'p', 'div', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'pre', 'hr', 'body', 'caption',
])
const INLINE_FORMAT = new Set(['strong', 'b', 'em', 'i', 'del', 's', 'strike'])

type El = Element
const tag = (n: Node): string => n.nodeName.toLowerCase()
const isEl = (n: Node | null): n is El => n != null && n.nodeType === 1
const isText = (n: Node | null): n is Text => n != null && n.nodeType === 3
const kids = (n: Node): Node[] => Array.from(n.childNodes)

function unwrap(el: El): void {
  const parent = el.parentNode
  if (!parent) return
  while (el.firstChild) parent.insertBefore(el.firstChild, el)
  parent.removeChild(el)
}

function rename(el: El, name: string): El {
  const doc = el.ownerDocument
  const copy = doc.createElement(name)
  while (el.firstChild) copy.appendChild(el.firstChild)
  el.parentNode?.replaceChild(copy, el)
  return copy
}

function wrapChildren(el: El, name: string): void {
  const w = el.ownerDocument.createElement(name)
  while (el.firstChild) w.appendChild(el.firstChild)
  el.appendChild(w)
}

function hasAncestor(el: Node, names: readonly string[]): boolean {
  for (let p = el.parentNode; p; p = p.parentNode) if (isEl(p) && names.includes(tag(p))) return true
  return false
}

function allElements(root: Node): El[] {
  const out: El[] = []
  const walk = (n: Node) => {
    for (const c of kids(n)) {
      if (isEl(c)) {
        out.push(c)
        walk(c)
      }
    }
  }
  walk(root)
  return out
}

function textNodesOf(root: Node): Text[] {
  const out: Text[] = []
  const walk = (n: Node) => {
    for (const c of kids(n)) {
      if (isText(c)) out.push(c)
      else if (isEl(c)) walk(c)
    }
  }
  walk(root)
  return out
}

function parseHtml(html: string): Document {
  return (domino as unknown as { createDocument(html: string): Document }).createDocument('<!DOCTYPE html><html><head></head><body>' + html + '</body></html>')
}

/** Replaces non-breaking and zero-width characters, drops control characters and collapses whitespace runs. */
export function normalizeText(s: string): string {
  return s
    .replace(/[    - ]/g, ' ')
    .replace(/[​-‍﻿⁠­]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[ \t\r\n\f]+/g, ' ')
}

/** Plain text of an HTML snippet (tags dropped, entities decoded, whitespace collapsed). */
export function htmlToPlainText(html: string): string {
  const doc = parseHtml(html)
  for (const el of allElements(doc.body)) if (DROP_SILENT.has(tag(el))) el.parentNode?.removeChild(el)
  for (const br of allElements(doc.body).filter((e) => tag(e) === 'br')) br.parentNode?.replaceChild(doc.createTextNode(' '), br)
  return normalizeText(doc.body.textContent ?? '').trim()
}

// ---------------------------------------------------------------------------------------------------------------------
// Placeholders

interface TokenRef extends ColumnToken {
  index: number
}

function substitutePlaceholders(root: Node, columns: ColumnToken[], used: Set<number>): void {
  const tokens: TokenRef[] = columns
    .map((c, index) => ({ ...c, index }))
    .filter((c) => c.token.length > 0)
    .sort((a, b) => b.token.length - a.token.length)
  if (tokens.length === 0) return

  const nodes = textNodesOf(root)
  const starts: number[] = []
  const lengths: number[] = []
  let s = ''
  for (const n of nodes) {
    starts.push(s.length)
    lengths.push(n.data.length)
    s += n.data
  }

  const matches: { start: number; end: number; ref: TokenRef }[] = []
  for (let i = 0; i < s.length; ) {
    const hit = tokens.find((t) => s.startsWith(t.token, i))
    if (hit) {
      matches.push({ start: i, end: i + hit.token.length, ref: hit })
      i += hit.token.length
    } else i++
  }

  const nodeAt = (pos: number): number => {
    for (let k = 0; k < nodes.length; k++) if (pos >= starts[k] && pos < starts[k] + lengths[k]) return k
    return nodes.length - 1
  }

  // Back to front: edits only touch text at or after a match's start, so earlier offsets stay valid.
  for (const m of matches.reverse()) {
    used.add(m.ref.index)
    const sentinel = SENT_OPEN + m.ref.index + SENT_CLOSE
    const a = nodeAt(m.start)
    const b = nodeAt(m.end - 1)
    const aOff = m.start - starts[a]
    const bOff = m.end - starts[b]
    if (a === b) {
      nodes[a].data = nodes[a].data.slice(0, aOff) + sentinel + nodes[a].data.slice(bOff)
    } else {
      nodes[a].data = nodes[a].data.slice(0, aOff) + sentinel
      for (let k = a + 1; k < b; k++) nodes[k].data = ''
      nodes[b].data = nodes[b].data.slice(bOff)
    }
  }
}

/** Replaces column tokens in a plain-text string (used for the title). Returns the text and whether anything matched. */
export function stripTokens(text: string, columns: ColumnToken[]): { text: string; found: number } {
  let found = 0
  let out = text
  for (const c of [...columns].sort((a, b) => b.token.length - a.token.length)) {
    if (c.token.length === 0) continue
    const parts = out.split(c.token)
    if (parts.length > 1) {
      found += parts.length - 1
      out = parts.join('')
    }
  }
  return { text: out, found }
}

// ---------------------------------------------------------------------------------------------------------------------
// DOM cleaning

interface Look {
  bold?: boolean
  italic?: boolean
  strike?: boolean
}

function lookOfStyle(style: string | null): Look {
  if (!style) return {}
  const s = style.toLowerCase()
  const prop = (name: string) => new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`).exec(s)?.[1]?.trim()
  const look: Look = {}
  const fw = prop('font-weight')
  if (fw) look.bold = /^(bold|bolder)$/.test(fw) || (/^\d+$/.test(fw) && Number(fw) >= 600)
  const fs = prop('font-style')
  if (fs) look.italic = /^(italic|oblique)/.test(fs)
  const td = prop('text-decoration(?:-line)?')
  if (td && /line-through/.test(td)) look.strike = true
  return look
}

const hasText = (el: El): boolean => (el.textContent ?? '').replace(/[\s ​]/g, '').length > 0
const hasContentElement = (el: El): boolean => allElements(el).some((e) => ['img', 'br', 'table', 'hr'].includes(tag(e)))

function stripDirectives(root: Node): void {
  // Comments (including Word conditional comments) and processing instructions.
  const walk = (n: Node) => {
    for (const c of kids(n)) {
      if (c.nodeType === 8 || c.nodeType === 7) n.removeChild(c)
      else if (isEl(c)) walk(c)
    }
  }
  walk(root)
}

function cleanElements(root: El, flags: FlagBag): void {
  for (const el of allElements(root)) {
    if (!el.parentNode) continue
    const name = tag(el)
    if (DROP_SILENT.has(name)) el.parentNode.removeChild(el)
    else if (name === 'img') {
      flags.add('image', 'error')
      el.parentNode.removeChild(el)
    } else if (DROP_FLAG.has(name)) {
      flags.add('html_removed', 'error', name)
      el.parentNode.removeChild(el)
    } else if (name.includes(':')) {
      // Word namespaces: <o:p>, smart tags <st1:...> keep their text. VML, Word and math namespaces are dropped.
      if (name.startsWith('v:') || name.startsWith('w:') || name.startsWith('m:')) {
        if (name === 'v:imagedata' || name === 'v:shape') flags.add('image', 'error')
        el.parentNode.removeChild(el)
      } else unwrap(el)
    }
  }
}

function applyLooks(root: El): void {
  for (const el of allElements(root)) {
    const name = tag(el)
    const look = lookOfStyle(el.getAttribute('style'))
    if (name === 'span' || name === 'font') {
      // Word expresses bold and italic as inline styles on spans.
      if (look.strike) wrapChildren(el, 'del')
      if (look.italic) wrapChildren(el, 'em')
      if (look.bold) wrapChildren(el, 'strong')
    } else if ((name === 'b' || name === 'strong') && look.bold === false) {
      el.setAttribute('data-unwrap', '1')
    } else if ((name === 'i' || name === 'em') && look.italic === false) {
      el.setAttribute('data-unwrap', '1')
    }
  }
  for (const el of allElements(root)) if (el.getAttribute('data-unwrap') === '1') unwrap(el)
}

function unwrapFormatting(root: El): void {
  for (const el of allElements(root)) {
    const name = tag(el)
    if (UNWRAP.has(name)) unwrap(el)
    else if (RENAME_DIV.has(name)) rename(el, 'div')
  }
}

function tidyInlineFormats(root: El): void {
  // Formatting elements holding only whitespace become one space, so words do not glue together.
  for (const el of allElements(root)) {
    if (!el.parentNode || !INLINE_FORMAT.has(tag(el))) continue
    if (!hasText(el) && !hasContentElement(el)) {
      const space = el.ownerDocument.createTextNode((el.textContent ?? '').length > 0 ? ' ' : '')
      el.parentNode.replaceChild(space, el)
    }
  }
  // Bold inside bold, italic inside italic.
  for (const el of allElements(root)) {
    if (!el.parentNode) continue
    const name = tag(el)
    if ((name === 'strong' || name === 'b') && hasAncestor(el, ['strong', 'b'])) unwrap(el)
    else if ((name === 'em' || name === 'i') && hasAncestor(el, ['em', 'i'])) unwrap(el)
    else if ((name === 'del' || name === 's' || name === 'strike') && hasAncestor(el, ['del', 's', 'strike'])) unwrap(el)
  }
  // Adjacent runs of the same format merge: <b>a</b><b>b</b> must not become ****.
  const same = (a: string, b: string) => {
    const group = (x: string) => (x === 'b' || x === 'strong' ? 'strong' : x === 'i' || x === 'em' ? 'em' : 'del')
    return group(a) === group(b)
  }
  for (const el of allElements(root)) {
    if (!el.parentNode || !INLINE_FORMAT.has(tag(el))) continue
    let next = el.nextSibling
    while (isEl(next) && INLINE_FORMAT.has(tag(next)) && same(tag(el), tag(next))) {
      while (next.firstChild) el.appendChild(next.firstChild)
      const after: ChildNode | null = next.nextSibling
      next.parentNode?.removeChild(next)
      next = after
    }
  }
}

function normalizeHref(raw: string): string {
  let href = raw.trim()
  if (/^mailto:/i.test(href)) href = href.replace(/\s+/g, '')
  else href = href.replace(/\s/g, '%20')
  return href.replace(/</g, '%3C').replace(/>/g, '%3E').replace(/\\/g, '%5C')
}

function cleanLinks(root: El, columns: ColumnToken[], flags: FlagBag): void {
  for (const a of allElements(root).filter((e) => tag(e) === 'a')) {
    if (!a.parentNode) continue
    const raw = a.getAttribute('href')
    if (raw === null) {
      unwrap(a)
      continue
    }
    const decoded = (() => {
      try {
        return decodeURIComponent(raw)
      } catch {
        return raw
      }
    })()
    if (columns.some((c) => c.token.length > 0 && (raw.includes(c.token) || decoded.includes(c.token))) || /\{[^{}]+\}/.test(decoded)) {
      flags.add('placeholder_in_url', 'error')
      unwrap(a)
      continue
    }
    const href = normalizeHref(raw)
    if (!/^(https?:\/\/|mailto:)/i.test(href) || /^(https?:|mailto:)\/*$/i.test(href)) {
      flags.add('link_dropped', 'warn', (/^([a-z][a-z0-9+.-]*):/i.exec(href)?.[1] ?? 'relative').toLowerCase())
      unwrap(a)
      continue
    }
    if (!hasText(a)) {
      a.parentNode.removeChild(a)
      continue
    }
    const blocky = allElements(a).some((e) => BLOCKS.has(tag(e)))
    if (blocky) {
      flags.add('link_dropped', 'warn', 'block content')
      unwrap(a)
      continue
    }
    for (const br of allElements(a).filter((e) => tag(e) === 'br')) br.parentNode?.replaceChild(a.ownerDocument.createTextNode(' '), br)
    a.setAttribute('href', href)
  }
}

function isBlockNode(n: Node | null): boolean {
  return isEl(n) && (BLOCKS.has(tag(n)) || tag(n) === 'ul' || tag(n) === 'ol')
}

function fixLists(root: El): void {
  const lists = allElements(root).filter((e) => tag(e) === 'ul' || tag(e) === 'ol').reverse()
  const doc = root.ownerDocument
  for (const list of lists) {
    // Anything directly inside a list that is not an <li> goes into an item.
    let current: El | null = null
    for (const c of kids(list)) {
      if (isEl(c) && tag(c) === 'li') {
        current = null
        continue
      }
      if (isText(c) && c.data.trim() === '' && !c.data.includes(SENT_OPEN)) continue
      if (isEl(c) && tag(c) === 'br') {
        list.removeChild(c)
        continue
      }
      if (isEl(c) && (tag(c) === 'ul' || tag(c) === 'ol')) {
        // A list directly inside a list belongs to the previous item.
        const prev: Node | null = c.previousSibling
        const host = isEl(prev) && tag(prev) === 'li' ? prev : null
        if (host) host.appendChild(c)
        else {
          const li = doc.createElement('li')
          list.insertBefore(li, c)
          li.appendChild(c)
        }
        current = null
        continue
      }
      if (!current) {
        current = doc.createElement('li')
        list.insertBefore(current, c)
      }
      current.appendChild(c)
    }
  }
  for (const li of allElements(root).filter((e) => tag(e) === 'li')) {
    // Block wrappers inside an item (Word's <li><div>text</div></li>) become inline content separated by line breaks.
    for (const c of kids(li)) {
      if (!isEl(c) || (tag(c) !== 'p' && tag(c) !== 'div')) continue
      const prev = c.previousSibling
      if (prev && !isBlockNode(prev) && tag(prev) !== 'br' && (prev.textContent ?? '').trim() !== '') {
        li.insertBefore(doc.createElement('br'), c)
      }
      unwrap(c)
    }
  }
}

function cellText(el: El): string {
  return normalizeText(el.textContent ?? '').trim()
}

function prepareTables(root: El, flags: FlagBag): void {
  const doc = root.ownerDocument
  const tables = () => allElements(root).filter((e) => tag(e) === 'table')

  // Nested tables are flattened to text, innermost first.
  for (const t of tables().reverse()) {
    if (!t.parentNode || !hasAncestor(t, ['table'])) continue
    flags.add('nested_table', 'error')
    const rows = allElements(t).filter((e) => tag(e) === 'tr')
    const text = rows
      .map((tr) => kids(tr).filter(isEl).map(cellText).filter(Boolean).join(' ; '))
      .filter(Boolean)
      .join(' ; ')
    t.parentNode.replaceChild(doc.createTextNode(text), t)
  }

  for (const t of tables()) {
    if (!t.parentNode) continue
    const rows = allElements(t).filter((e) => tag(e) === 'tr')
    const cells = allElements(t).filter((e) => tag(e) === 'td' || tag(e) === 'th')
    if (cells.some((c) => Number(c.getAttribute('colspan') ?? 1) > 1 || Number(c.getAttribute('rowspan') ?? 1) > 1)) {
      flags.add('merged_cells', 'error')
    }
    // A single cell is a layout box, not a table.
    if (rows.length === 1 && cells.length === 1) {
      flags.add('layout_table', 'info')
      const div = doc.createElement('div')
      while (cells[0].firstChild) div.appendChild(cells[0].firstChild)
      t.parentNode.replaceChild(div, t)
      continue
    }
    // Block content in cells cannot be kept in a GFM table.
    for (const cell of cells) {
      for (const blk of allElements(cell).filter((e) => ['ul', 'ol', 'blockquote', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr'].includes(tag(e)))) {
        if (!blk.parentNode) continue
        flags.add('table_cell_blocks', 'warn')
        const items = tag(blk) === 'ul' || tag(blk) === 'ol' ? allElements(blk).filter((e) => tag(e) === 'li') : [blk]
        const text = items.map(cellText).filter(Boolean).join(' ; ')
        blk.parentNode.replaceChild(doc.createTextNode(text + ' '), blk)
      }
    }
  }
}

function replacePre(root: El, flags: FlagBag): void {
  for (const pre of allElements(root).filter((e) => tag(e) === 'pre')) {
    if (!pre.parentNode) continue
    flags.add('code_block', 'warn')
    const doc = pre.ownerDocument
    const p = doc.createElement('p')
    const lines = (pre.textContent ?? '').replace(/\r/g, '').split('\n')
    lines.forEach((line, i) => {
      if (i > 0) p.appendChild(doc.createElement('br'))
      p.appendChild(doc.createTextNode(line.replace(/[ \t]+/g, ' ').trim()))
    })
    pre.parentNode.replaceChild(p, pre)
  }
}

/** Removes leading and trailing line breaks of blocks and turns runs of line breaks into paragraph markers. */
function tidyBreaks(root: El): void {
  const doc = root.ownerDocument
  const isBr = (n: Node | null) => isEl(n) && tag(n) === 'br'
  const isBlank = (n: Node | null) => (isText(n) && n.data.trim() === '') || isBr(n)

  const containers = [root, ...allElements(root).filter((e) => BLOCKS.has(tag(e)) || tag(e) === 'li')]
  for (const c of containers) {
    while (c.firstChild && isBlank(c.firstChild)) c.removeChild(c.firstChild)
    while (c.lastChild && isBlank(c.lastChild)) c.removeChild(c.lastChild)
  }

  for (const br of allElements(root).filter((e) => tag(e) === 'br')) {
    if (!br.parentNode) continue
    const parent = br.parentNode as El
    const next = br.nextSibling
    // Collapse a run of <br> (with only whitespace between) into the first one.
    let runLength = 1
    let cursor: Node | null = next
    const toRemove: Node[] = []
    while (cursor && (isBr(cursor) || (isText(cursor) && cursor.data.trim() === ''))) {
      if (isBr(cursor)) runLength++
      toRemove.push(cursor)
      cursor = cursor.nextSibling
    }
    if (runLength > 1) {
      for (const n of toRemove) n.parentNode?.removeChild(n)
      const inline = INLINE_FORMAT.has(tag(parent)) || ['a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'td', 'th'].includes(tag(parent))
      br.parentNode.replaceChild(doc.createTextNode(inline ? ' ' : PARA), br)
    }
  }
  // Line breaks inside headings, links and table cells become spaces.
  for (const br of allElements(root).filter((e) => tag(e) === 'br')) {
    const p = br.parentNode
    if (p && isEl(p) && ['a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'td', 'th'].includes(tag(p))) {
      p.replaceChild(doc.createTextNode(' '), br)
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Turndown

function createService(flags: FlagBag): TurndownService {
  const service = new TurndownService({
    headingStyle: 'atx',
    hr: '***',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined',
    br: '\\',
    codeBlockStyle: 'indented',
  })
  service.use(strikethrough)

  const baseEscape = service.escape.bind(service)
  service.escape = (text: string): string => {
    let out = baseEscape(text)
    out = out.replace(/</g, '\\<')
    out = out.replace(/(?<!\\)={2,}/g, (m) => '\\='.repeat(m.length))
    out = out.replace(/~{2,}/g, (m) => '\\~'.repeat(m.length))
    out = out.replace(/&(?=[A-Za-z0-9#]{1,32};)/g, '\\&')
    out = out.replace(/:(?=[A-Za-z][A-Za-z0-9_-]*\{)/g, '\\:')
    out = out.replace(/:{2,}(?=[A-Za-z])/g, (m) => '\\:'.repeat(m.length))
    return out
  }

  service.addRule('listItem', {
    filter: 'li',
    replacement(content, node) {
      const parent = node.parentNode as El
      let prefix = '- '
      if (parent && tag(parent) === 'ol') {
        const index = Array.prototype.indexOf.call(parent.children, node)
        prefix = `${index + 1}. `
      }
      const indent = ' '.repeat(prefix.length)
      const body = content
        .replace(/^\n+/, '')
        .replace(/\n+$/, '\n')
        .replace(new RegExp(PARA, 'g'), '\n\n')
        .replace(/\n/gm, '\n' + indent)
      return prefix + body + (node.nextSibling && !/\n$/.test(body) ? '\n' : '')
    },
  })

  service.addRule('table', {
    filter: 'table',
    replacement(_content, node) {
      return renderTable(service, node as unknown as El, flags)
    },
  })

  return service
}

function cellMarkdown(service: TurndownService, cell: El): string {
  return service
    .turndown(cell as unknown as HTMLElement)
    .replace(new RegExp(PARA, 'g'), ' ')
    .replace(/\\\n/g, ' ')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\|/g, '\\|')
    .trim()
}

function renderTable(service: TurndownService, table: El, _flags: FlagBag): string {
  const rows = allElements(table).filter((e) => tag(e) === 'tr')
  if (rows.length === 0) return ''
  const grid: string[][] = rows.map(() => [])
  rows.forEach((tr, r) => {
    let c = 0
    for (const cell of kids(tr).filter(isEl).filter((e) => tag(e) === 'td' || tag(e) === 'th')) {
      while (grid[r][c] !== undefined) c++
      const text = cellMarkdown(service, cell)
      const colspan = Math.min(Math.max(Number(cell.getAttribute('colspan')) || 1, 1), 50)
      const rowspan = Math.min(Math.max(Number(cell.getAttribute('rowspan')) || 1, 1), 50)
      for (let dy = 0; dy < rowspan && r + dy < rows.length; dy++) {
        for (let dx = 0; dx < colspan; dx++) grid[r + dy][c + dx] = dx === 0 && dy === 0 ? text : ''
      }
      c += colspan
    }
  })
  const width = Math.max(...grid.map((row) => row.length))
  const line = (row: string[]) => '| ' + Array.from({ length: width }, (_, i) => (row[i] ?? '') || ' ').join(' | ') + ' |'
  const out = [line(grid[0]), '| ' + Array.from({ length: width }, () => '---').join(' | ') + ' |', ...grid.slice(1).map(line)]
  const caption = allElements(table).find((e) => tag(e) === 'caption')
  const captionText = caption ? cellMarkdown(service, caption) : ''
  return '\n\n' + (captionText ? captionText + '\n\n' : '') + out.join('\n') + '\n\n'
}

// ---------------------------------------------------------------------------------------------------------------------
// Entry point

/**
 * Converts the baked v1 HTML (Word/Outlook exports included) to GFM Markdown, turning every column token into
 * `:var[Key]`. Raw HTML is never emitted. Layout that cannot be kept is recorded in `flags`.
 */
export function htmlToMarkdown(html: string, columns: ColumnToken[], flags: FlagBag): HtmlConversion {
  const doc = parseHtml(html)
  const body = doc.body
  stripDirectives(body)
  cleanElements(body, flags)

  for (const t of textNodesOf(body)) {
    if (!hasAncestor(t, ['pre'])) t.data = normalizeText(t.data)
  }
  const usedColumns = new Set<number>()
  substitutePlaceholders(body, columns, usedColumns)

  // Leftover {name} text that no column explains.
  const unknown: string[] = []
  const flat = textNodesOf(body).map((t) => t.data).join('')
  for (const m of flat.matchAll(/\{[^{}\uE000-\uE002]{1,60}\}/g)) if (!unknown.includes(m[0])) unknown.push(m[0])

  applyLooks(body)
  unwrapFormatting(body)
  cleanLinks(body, columns, flags)
  replacePre(body, flags)
  fixLists(body)
  prepareTables(body, flags)
  tidyInlineFormats(body)
  tidyBreaks(body)

  const service = createService(flags)
  let md = service.turndown(body as unknown as HTMLElement)

  const used: string[] = []
  md = md.replace(/\r/g, '')
  md = md.replace(SENTINEL, (match, idx: string, offset: number, whole: string) => {
    const col = columns[Number(idx)]
    if (!used.includes(col.key)) used.push(col.key)
    const before = offset > 0 ? whole[offset - 1] : ''
    const after = whole[offset + match.length] ?? ''
    // A colon right before `:var` stops the directive from being recognised; `{` right after would read as attributes.
    return (before === ':' ? ' ' : '') + `:var[${col.key}]` + (after === '{' ? '\\' : '')
  })
  md = md.replace(new RegExp(PARA, 'g'), '\n\n')
  md = md.replace(/[ \t]+$/gm, '')
  md = md.replace(/(?<!\\)\\\n(?=\n|$)/g, '\n').replace(/(?<!\\)\\$/g, '')
  md = md.replace(/\n{3,}/g, '\n\n').trim()
  md = md.normalize('NFC')

  // Keep the order of first use in the final text.
  const order = [...md.matchAll(/:var\[([A-Za-z][A-Za-z0-9_]*)\]/g)].map((m) => m[1])
  const usedKeys = [...new Set(order)]
  return { markdown: md, usedKeys, unknownPlaceholders: unknown }
}
