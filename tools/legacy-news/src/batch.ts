/** Default size of one request body before compression: well under the server's 20 MB limit after decompression. */
export const DEFAULT_MAX_BATCH_BYTES = 8 * 1024 * 1024

export interface Sized<T> {
  item: T
  bytes: number
}

/** The UTF-8 size of `JSON.stringify(value)`. */
export function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8')
}

/**
 * Greedily packs items into batches whose total size stays within `maxBytes` (a small allowance covers the request
 * envelope). An item bigger than the limit goes alone in its own batch.
 */
export function splitBatches<T>(items: readonly Sized<T>[], maxBytes: number = DEFAULT_MAX_BATCH_BYTES): T[][] {
  const batches: T[][] = []
  let current: T[] = []
  let size = 0
  for (const { item, bytes } of items) {
    const withComma = bytes + 1
    if (current.length > 0 && size + withComma > maxBytes) {
      batches.push(current)
      current = []
      size = 0
    }
    current.push(item)
    size += withComma
  }
  if (current.length > 0) batches.push(current)
  return batches
}
