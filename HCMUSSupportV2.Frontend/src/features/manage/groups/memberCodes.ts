/** Split a pasted list of MSCBs (commas, semicolons, spaces, new lines) into unique codes. */
export function parseCodes(text: string): string[] {
  return [...new Set(text.split(/[\s,;]+/).map((c) => c.trim()).filter(Boolean))]
}
