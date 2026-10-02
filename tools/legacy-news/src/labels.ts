const MAX_LABEL = 100

/** Text in front of a placeholder, reduced to a short label: "Hệ số lương", "bậc lương", ... or null. */
function labelFromSegment(segment: string): string | null {
  let s = segment
    .replace(/\\(.)/g, '$1')
    .replace(/[*~`]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s:;,.\-–—]+$/, '')
  // The last clause only: "... như sau: Chức danh hoặc ngạch" -> "Chức danh hoặc ngạch".
  const clauses = s.split(/[:;.]\s+/)
  s = clauses[clauses.length - 1]
  s = s.replace(/^[\s,;.:)(\-–—"'“”‘’]+/, '').replace(/[\s(]+$/, '').trim()
  if (s.length === 0 || s.length > MAX_LABEL) return null
  if (s.split(' ').length < 2 && s.length < 4) return null
  if (!/\p{L}/u.test(s)) return null
  return s[0].toUpperCase() + s.slice(1)
}

/**
 * Derives a readable label for each placeholder from the words in front of it ("Hệ số lương: :var[K]" gives
 * "Hệ số lương"). v1 columns are often bare letters or numbers, which would make poor labels in the editor. Keys with no
 * usable text are left out so the caller can fall back to the column name.
 */
export function contextLabels(markdown: string): Map<string, string> {
  const labels = new Map<string, string>()
  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.replace(/^\s*(?:[-*+]|\d+\.)\s+/, '')
    let previousEnd = 0
    for (const m of line.matchAll(/:var\[([A-Za-z][A-Za-z0-9_]*)\]/g)) {
      const index = m.index ?? 0
      const label = labelFromSegment(line.slice(previousEnd, index))
      if (label && !labels.has(m[1])) labels.set(m[1], label)
      previousEnd = index + m[0].length
    }
  }
  return labels
}
