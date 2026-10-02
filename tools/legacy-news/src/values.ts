const NAMED: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ndash: '–', mdash: '—', hellip: '…' }

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1]!.toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
    }
    return NAMED[body.toLowerCase()] ?? whole
  })
}

/**
 * A v1 value is dropped into the HTML template unescaped, so it may carry `<br>` and list tags. In v2 a value is plain text
 * (it is always rendered as a text node): line breaks stay as "\n", every other tag is removed, entities are decoded.
 */
export function cleanValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
    .replace(/\r\n?/g, '\n')
    .replace(/<\s*br\s*\/?\s*>|<\/\s*(li|p|div|ul|ol|tr)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
  return decodeEntities(text)
    .replace(/[ ​-‏⁠﻿]/g, ' ')
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line, i, all) => line !== '' || (i > 0 && all[i - 1] !== '' && i < all.length - 1))
    .join('\n')
    .trim()
}

/** `{7}` and `(7)` to `7`. */
export const stripMarks = (column: string): string => column.trim().replace(/^[{(]\s*/, '').replace(/\s*[)}]$/, '')

const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/

/** Maps v1 columns as spelled in the values file (`{0}`, `(7)`, `{TenCapDeTai}`) to valid v2 variable keys (`c0`, `c7`, `TenCapDeTai`), unique within the post. */
export function variableKeys(columns: readonly string[]): Map<string, string> {
  const taken = new Set<string>()
  const result = new Map<string, string>()
  for (const column of columns) {
    let key = stripMarks(column)
    if (!KEY_PATTERN.test(key)) {
      key = key.replace(/[^A-Za-z0-9_]/g, '_')
      if (!/^[A-Za-z]/.test(key)) key = 'c' + key
      key = key.slice(0, 60)
    }
    let unique = key
    for (let n = 2; taken.has(unique); n++) unique = `${key}_${n}`
    taken.add(unique)
    result.set(column, unique)
  }
  return result
}
