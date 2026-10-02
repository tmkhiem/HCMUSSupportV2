import { describe, expect, it } from 'vitest'
import { jsonBytes, splitBatches } from '../src/batch.ts'

const sized = (sizes: number[]) => sizes.map((bytes, i) => ({ item: `p${i}`, bytes }))

describe('splitBatches', () => {
  it('keeps everything in one batch when it fits', () => {
    expect(splitBatches(sized([10, 20, 30]), 1000)).toEqual([['p0', 'p1', 'p2']])
  })

  it('starts a new batch when the next post would pass the limit, keeping order', () => {
    expect(splitBatches(sized([40, 40, 40, 40, 40]), 100)).toEqual([['p0', 'p1'], ['p2', 'p3'], ['p4']])
  })

  it('puts a post bigger than the limit in a batch of its own', () => {
    expect(splitBatches(sized([10, 500, 10, 10]), 100)).toEqual([['p0'], ['p1'], ['p2', 'p3']])
  })

  it('returns nothing for nothing', () => {
    expect(splitBatches([], 100)).toEqual([])
  })

  it('never splits a post and keeps each batch within the limit when it can', () => {
    const items = sized(Array.from({ length: 200 }, (_, i) => 1 + ((i * 37) % 90)))
    const batches = splitBatches(items, 300)
    expect(batches.flat()).toEqual(items.map((i) => i.item))
    const byName = new Map(items.map((i) => [i.item, i.bytes]))
    for (const b of batches) expect(b.reduce((n, k) => n + byName.get(k)! + 1, 0)).toBeLessThanOrEqual(300)
  })
})

describe('jsonBytes', () => {
  it('counts UTF-8 bytes of the JSON text', () => {
    expect(jsonBytes('é')).toBe(4)
    expect(jsonBytes({ a: 'Việt' })).toBe(Buffer.byteLength('{"a":"Việt"}'))
  })
})
