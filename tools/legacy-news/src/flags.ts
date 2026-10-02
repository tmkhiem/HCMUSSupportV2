/**
 * A problem or note about one converted post.
 *
 * - `error`: the layout or content did not survive (or the post would be rejected). Needs a human look.
 * - `warn`: converted, but something was guessed, dropped or left as text.
 * - `info`: worth knowing, no action needed.
 *
 * `detail` never holds recipient values. It may name a placeholder, a tag name or a scheme.
 */
export type Severity = 'error' | 'warn' | 'info'

export interface Flag {
  kind: string
  severity: Severity
  detail?: string
  count?: number
}

/** Collects flags and merges repeats of the same kind and detail into one entry with a count. */
export class FlagBag {
  private readonly map = new Map<string, Flag>()

  add(kind: string, severity: Severity, detail?: string): void {
    const id = `${kind}\u0000${severity}\u0000${detail ?? ''}`
    const existing = this.map.get(id)
    if (existing) existing.count = (existing.count ?? 1) + 1
    else this.map.set(id, { kind, severity, ...(detail === undefined ? {} : { detail }) })
  }

  has(kind: string): boolean {
    return this.list().some((f) => f.kind === kind)
  }

  list(): Flag[] {
    return [...this.map.values()]
  }
}
