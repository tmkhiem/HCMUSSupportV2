import MarkdownIt from 'markdown-it'
import { VAR_KEY_PATTERN } from './keys.ts'

/**
 * Client-side mirror of the server's NotificationMarkdown.Analyze (docs/notification-markdown.md), so conversion
 * problems show up before anything is posted. It parses with markdown-it (HTML enabled, so raw HTML is visible as a
 * token) and replicates the directive scanner and the URL rules of the C# validator.
 */
export interface BodyIssue {
  code: string
  message: string
}

export interface BodyAnalysis {
  issues: BodyIssue[]
  placeholders: string[]
}

export const MAX_BODY_LENGTH = 100_000

const md = new MarkdownIt({ html: true, linkify: false, typographer: false }).enable(['table', 'strikethrough'])
// markdown-it refuses javascript:, data: and similar targets by itself; the contract wants them reported, so let them parse.
md.validateLink = () => true

const LINK_SCHEMES = new Set(['http', 'https', 'mailto', 'tel'])
const IMAGE_URL = /^\/api\/files\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const HIGHLIGHT = /(?<![=\\])==(?=\S)[^=\n]+?(?<=\S)==(?!=)/
const DEFINITION_LINE = /^ {0,3}\[(\^?)[^\]\n]+\]:[ \t]*\S/

export function isSafeLinkUrl(url: string | null | undefined): boolean {
  if (!url || /[\s\u0000-\u001f\u007f-\u009f]/.test(url)) return false
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(url)
  if (scheme) return LINK_SCHEMES.has(scheme[1].toLowerCase())
  if (url.startsWith('//')) return false
  return url[0] === '/' || url[0] === '#'
}

export function isAllowedImageUrl(url: string | null | undefined): boolean {
  return !!url && IMAGE_URL.test(url)
}

const isAsciiLetter = (c: string | undefined): boolean => !!c && /[A-Za-z]/.test(c)

interface DirectiveScan {
  keys: string[]
  unsupported: string[]
}

/**
 * Finds directives the way the server (and remark-directive) does in inline text: a colon that is not preceded by a
 * colon and is followed by a name with a label or attributes. Backslash escapes and code spans are skipped.
 */
export function scanDirectives(text: string): DirectiveScan {
  const keys: string[] = []
  const unsupported: string[] = []
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '\\') {
      i += 2
      continue
    }
    if (ch === '`') {
      let run = 1
      while (text[i + run] === '`') run++
      const fence = '`'.repeat(run)
      const close = text.indexOf(fence, i + run)
      i = close < 0 ? i + run : close + run
      continue
    }
    if (ch !== ':' || text[i - 1] === ':') {
      i++
      continue
    }
    let pos = i
    let colons = 0
    while (text[pos] === ':') {
      colons++
      pos++
    }
    if (!isAsciiLetter(text[pos])) {
      i = pos
      continue
    }
    let nameEnd = pos
    while (nameEnd < text.length && /[A-Za-z0-9_-]/.test(text[nameEnd])) nameEnd++
    if (colons >= 2) {
      const prev = text[i - 1]
      if (prev === undefined || prev === '\n' || prev === '\r') {
        unsupported.push(text.slice(i, nameEnd))
        i = nameEnd
      } else i = pos
      continue
    }
    if (/[-_]/.test(text[nameEnd - 1])) {
      i = nameEnd
      continue
    }
    let end = nameEnd
    let label: string | null = null
    if (text[end] === '[') {
      let depth = 0
      let close = -1
      for (let j = end; j < text.length; j++) {
        const c = text[j]
        if (c === '\\') {
          j++
          continue
        }
        if (c === '\n' || c === '\r') break
        if (c === '[') depth++
        else if (c === ']' && --depth === 0) {
          close = j
          break
        }
      }
      if (close > 0) {
        label = text.slice(end + 1, close)
        end = close + 1
      }
    }
    let hasAttributes = false
    if (text[end] === '{') {
      const close = text.indexOf('}', end)
      if (close > 0) {
        hasAttributes = true
        end = close + 1
      }
    }
    if (label === null && !hasAttributes) {
      i = nameEnd
      continue
    }
    const name = text.slice(pos, nameEnd)
    if (name === 'var' && label !== null && !hasAttributes && VAR_KEY_PATTERN.test(label)) keys.push(label)
    else unsupported.push(text.slice(i, end))
    i = end
  }
  return { keys, unsupported }
}

type Token = ReturnType<MarkdownIt['parse']>[number]

function walkInline(tokens: Token[], visit: (t: Token) => void): void {
  for (const t of tokens) {
    visit(t)
    if (t.children) walkInline(t.children, visit)
  }
}

/** Validates a body against the notification Markdown contract. `declaredKeys` null skips the declared check. */
export function analyzeBody(markdown: string, declaredKeys: readonly string[] | null = null): BodyAnalysis {
  const issues: BodyIssue[] = []
  const placeholders: string[] = []
  const add = (code: string, message: string) => {
    if (!issues.some((i) => i.code === code && i.message === message)) issues.push({ code, message })
  }

  if (markdown.length > MAX_BODY_LENGTH) {
    add('TOO_LONG', `Body is longer than ${MAX_BODY_LENGTH} characters.`)
    return { issues, placeholders }
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(markdown)) add('INVALID_CHARACTER', 'Control character in body.')

  const tokens = md.parse(markdown, {})
  const declared = declaredKeys ? new Set(declaredKeys) : null

  for (const block of tokens) {
    if (block.type === 'html_block') add('RAW_HTML', 'Raw HTML block.')
    else if (block.type === 'code_block' || block.type === 'fence') add('CODE_BLOCK', 'Code block.')
    if (block.type !== 'inline' || !block.children) continue

    // Directives live in the raw inline text, before escapes are resolved.
    const scan = scanDirectives(block.content)
    for (const k of scan.keys) {
      if (!placeholders.includes(k)) placeholders.push(k)
      if (declared && !declared.has(k)) add('UNDECLARED_PLACEHOLDER', `Variable "${k}" is not declared.`)
    }
    // ==highlight== is looked for in the raw text (so \=\= stays legal) with code spans taken out.
    if (HIGHLIGHT.test(block.content.replace(/(`+)[\s\S]*?\1/g, ''))) add('UNSUPPORTED_SYNTAX', '==highlight== is not supported.')
    for (const u of scan.unsupported) add('UNKNOWN_DIRECTIVE', `Unsupported directive "${u}".`)

    walkInline(block.children, (t) => {
      switch (t.type) {
        case 'html_inline':
          add('RAW_HTML', 'Raw inline HTML.')
          break
        case 'image': {
          const src = t.attrGet('src')
          if (!isAllowedImageUrl(src)) add('FORBIDDEN_URL', 'Image outside /api/files/{id}.')
          break
        }
        case 'link_open': {
          const href = t.attrGet('href')
          if (!isSafeLinkUrl(href)) add('FORBIDDEN_URL', 'Link with a forbidden URL.')
          break
        }
        default:
          break
      }
    })
  }

  for (const line of markdown.split('\n')) {
    const m = DEFINITION_LINE.exec(line)
    if (!m) continue
    if (m[1] === '^') add('UNSUPPORTED_SYNTAX', 'Footnote.')
    else add('FORBIDDEN_URL', 'Reference-style link definition.')
  }

  return { issues, placeholders }
}
