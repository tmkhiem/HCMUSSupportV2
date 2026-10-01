/**
 * remark plugin for the notification Markdown contract (docs/notification-markdown.md).
 *
 * Runs after `remark-directive`. Replaces every valid `:var[Key]` text directive with a **text node** holding the
 * recipient's value, so a value can never become markup (no re-parsing, no HTML). Everything else that remark-directive
 * recognised (`:b`, `:var[bad key]`, `:var[Key]{a=1}`, `::leaf`, `:::container`) is turned back into its literal source
 * text, because the contract has no other directives and `a:b` / `mailto:x` must read as typed.
 *
 * Structural types are local on purpose: only the node shapes this plugin touches, no dependency on `@types/mdast`.
 */
import { DASH } from '../../../lib/format'

/**
 * Key rule of the contract (the backend validator uses the same pattern): charset `[A-Za-z0-9_]`, 1-64 characters,
 * and the first character is a letter. The letter rule is not cosmetic: a leading `_` makes `:var[_a_]` / `:var[__a__]`
 * parse as emphasis inside the directive label, which would change the key.
 */
export const VAR_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/

interface Position {
  start: { offset?: number }
  end: { offset?: number }
}

interface MdNode {
  type: string
  name?: string
  value?: string
  attributes?: Record<string, string | null | undefined> | null
  children?: MdNode[]
  position?: Position
}

const DIRECTIVE_TYPES = new Set(['textDirective', 'leafDirective', 'containerDirective'])

export type VarsRow = Record<string, string | null | undefined>

export interface RemarkVarsOptions {
  /** The recipient's values for one row. */
  vars?: VarsRow | null
}

/** Any mdast directive node (also the `mdast-util-directive` types, whose children are richer than `MdNode`). */
export interface DirectiveLike {
  type: string
  name?: string | null
  attributes?: unknown
  children?: ReadonlyArray<unknown>
}

/** The `Key` of a well-formed `:var[Key]`, or `null` when the directive is not a valid placeholder. */
export function placeholderKey(node: DirectiveLike): string | null {
  if (node.type !== 'textDirective' || node.name !== 'var') return null
  if (node.attributes && typeof node.attributes === 'object' && Object.keys(node.attributes).length > 0) return null
  const kids = (node.children ?? []) as Array<{ type: string; value?: unknown }>
  if (kids.length !== 1 || kids[0].type !== 'text') return null
  const key = kids[0].value
  return typeof key === 'string' && VAR_KEY_PATTERN.test(key) ? key : null
}

/** A missing key, `null`, or empty/whitespace-only value renders as `—`. Own properties only (`constructor` is a legal key). */
export function resolveValue(vars: VarsRow | null | undefined, key: string): string {
  if (!vars || !Object.hasOwn(vars, key)) return DASH
  const value = vars[key]
  if (value === null || value === undefined) return DASH
  const text = String(value)
  return text.trim() === '' ? DASH : text
}

function literal(node: MdNode, source: string): MdNode[] {
  const start = node.position?.start.offset
  const end = node.position?.end.offset
  const raw = start !== undefined && end !== undefined ? source.slice(start, end) : `:${node.name ?? ''}`
  if (node.type === 'textDirective') return [{ type: 'text', value: raw }]
  // leaf / container directive: one paragraph with the source lines kept as line breaks
  const kids: MdNode[] = []
  raw.split(/\r?\n/).forEach((line, i) => {
    if (i > 0) kids.push({ type: 'break' })
    if (line) kids.push({ type: 'text', value: line })
  })
  return [{ type: 'paragraph', children: kids }]
}

function walk(node: MdNode, vars: VarsRow | null | undefined, source: string) {
  if (!node.children) return
  const next: MdNode[] = []
  for (const child of node.children) {
    if (DIRECTIVE_TYPES.has(child.type)) {
      const key = placeholderKey(child)
      next.push(...(key !== null ? [{ type: 'text', value: resolveValue(vars, key) }] : literal(child, source)))
    } else {
      walk(child, vars, source)
      next.push(child)
    }
  }
  node.children = next
}

export default function remarkVars(options: RemarkVarsOptions = {}) {
  return (tree: MdNode, file: { value?: unknown }) => {
    const source = typeof file?.value === 'string' ? file.value : ''
    walk(tree, options.vars, source)
  }
}
