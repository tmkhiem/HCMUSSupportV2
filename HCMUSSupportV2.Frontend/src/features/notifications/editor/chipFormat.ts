/** Lexical text format bits (same values as `FormatConstants` in MDXEditor). */
export const BOLD = 1
export const ITALIC = 2
export const STRIKETHROUGH = 4

/** Formats a `:var[Key]` chip can carry through a round trip (stored as `**:var[Key]**`, `*:var[Key]*`, `~~:var[Key]~~`). */
export const CHIP_FORMATS = BOLD | ITALIC | STRIKETHROUGH

/** The chip's emphasis, taken from the mdast node (`data.format`, set on import). */
export function chipFormat(node: { data?: unknown }): number {
  const format = (node.data as { format?: number } | undefined)?.format
  return typeof format === 'number' ? format & CHIP_FORMATS : 0
}
