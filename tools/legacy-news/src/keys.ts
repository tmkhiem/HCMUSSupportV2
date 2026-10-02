/** The server's variable key pattern (NotificationMarkdown.VarKeyPattern). */
export const VAR_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/

export function isValidVarKey(key: string | null | undefined): boolean {
  return key != null && VAR_KEY_PATTERN.test(key)
}

/** Removes Vietnamese diacritics and maps đ/Đ to d/D. */
export function transliterate(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFC')
}

/** Strips one pair of wrapping braces, parentheses or brackets: `{Col}`, `(7)`, `[x]`. */
export function stripWrapper(name: string): string {
  const t = name.trim()
  const m = /^[{(\[](.*)[})\]]$/s.exec(t)
  return (m ? m[1] : t).trim()
}

/**
 * Derives a variable key from a v1 column name. Diacritics are transliterated, words are joined in PascalCase when the
 * name has several, bad characters are dropped, a non-letter start gets the `Cot` prefix, and the result is cut to 64
 * characters. Duplicates (case-insensitive) get a numeric suffix. `taken` is updated with the returned key.
 */
export function deriveKey(columnName: string, taken: Set<string>): string {
  const plain = transliterate(stripWrapper(columnName))
  const words = plain.split(/[^A-Za-z0-9]+/).filter((w) => w.length > 0)
  let key = words.length <= 1 ? (words[0] ?? '') : words.map((w) => w[0].toUpperCase() + w.slice(1)).join('')
  if (key.length === 0 || !/^[A-Za-z]/.test(key)) key = 'Cot' + key
  key = key.slice(0, 64)

  const lower = new Set([...taken].map((k) => k.toLowerCase()))
  let candidate = key
  for (let n = 2; lower.has(candidate.toLowerCase()); n++) {
    const suffix = '_' + n
    candidate = key.slice(0, 64 - suffix.length) + suffix
  }
  taken.add(candidate)
  return candidate
}

/**
 * A readable label for the editor: the column name without braces. Index-like names (`{7}`, `(12)`, `{C}`) become
 * `Cột 7`, `Cột 12`, `Cột C`, which is clearer than a bare digit.
 */
export function deriveLabel(columnName: string): string {
  const inner = stripWrapper(columnName).replace(/\s+/g, ' ').trim()
  const label = /^[A-Za-z]$/.test(inner) || /^\d+[A-Za-z]?$/.test(inner) ? `Cột ${inner}` : inner
  return (label.length === 0 ? columnName.trim() : label).slice(0, 200)
}
