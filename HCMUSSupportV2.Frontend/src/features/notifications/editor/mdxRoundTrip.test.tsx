import { MDXEditor } from '@mdxeditor/editor'
import type { MDXEditorMethods } from '@mdxeditor/editor'
import { render, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it } from 'vitest'
import { createNotificationPlugins, notificationEditorOptions } from './notificationPlugins'
import { VariableCatalogContext } from './variables'

/**
 * Spike evidence (D07a): what MDXEditor does to Markdown that goes in through `markdown=` and comes out of
 * `getMarkdown()`, with the exact configuration the product editor uses (minus toolbar and CodeMirror, which need a
 * real browser: those are covered by e2e/markdown.spec.ts). The findings are written up in docs/notification-markdown.md.
 */

interface Result {
  out: string
  errors: string[]
}

async function roundTrip(markdown: string): Promise<Result> {
  const ref = createRef<MDXEditorMethods>()
  const errors: string[] = []
  const { unmount } = render(
    <VariableCatalogContext value={[{ key: 'HeSoLuong', label: 'Hệ số lương' }]}>
      <MDXEditor
        ref={ref}
        markdown={markdown}
        {...notificationEditorOptions}
        onError={(e) => errors.push(e.error)}
        plugins={createNotificationPlugins({ toolbar: false, diffSource: false })}
      />
    </VariableCatalogContext>,
  )
  await waitFor(() => expect(ref.current).not.toBeNull())
  await new Promise((r) => setTimeout(r, 20))
  const out = ref.current!.getMarkdown()
  unmount()
  return { out, errors }
}

/** Markdown that must come back byte for byte. */
const STABLE = [
  ['placeholder in a sentence', 'Hệ số lương mới: :var[HeSoLuong]'],
  ['placeholder alone', ':var[HeSoLuong]'],
  ['placeholder with trailing text, no space', ':var[HeSoLuong]đ'],
  ['two adjacent placeholders', ':var[HeSoLuong]:var[HeSoLuong]'],
  ['placeholder glued to a letter before it', 'a:var[HeSoLuong]b'],
  ['underscored key', ':var[Ten_Day_Du] :var[a1] :var[x]'],
  ['bold placeholder', '**:var[HeSoLuong]**'],
  ['bold run containing a placeholder', '**a :var[HeSoLuong] b** c'],
  ['italic, strike, bold-italic placeholders', '*:var[HeSoLuong]* ~~:var[HeSoLuong]~~ ***:var[HeSoLuong]***'],
  ['placeholder in a heading', '# Tiêu đề :var[HeSoLuong]'],
  ['placeholder in a list', '- :var[HeSoLuong]\n- b'],
  ['placeholder in a quote', '> :var[HeSoLuong]'],
  ['placeholder in link text', '[:var[HeSoLuong]](https://a.test)'],
  ['time with a colon', 'Họp lúc 10:30 sáng'],
  ['colon before a letter after a space', 'Ghi chú: a'],
  ['ratio', 'tỉ lệ 3:2'],
  ['braces', 'cho {biến} và x{y} và }{'],
  ['greater-than', 'a > b'],
  ['escaped angle', 'a \\< b'],
  ['headings 1 to 6', '# a\n\n## b\n\n### c\n\n#### d\n\n##### e\n\n###### f'],
  ['bulleted and numbered lists', '- a\n  - b\n\n1. x\n2. y'],
  ['quote and rule', '> q\n\n***\n\n**b** *i* ~~s~~ `c`'],
  ['link with title', '[x](https://a.test "tt")'],
  ['image with title', '![alt](/api/files/0197a3c2-5b1e-7c4a-8d2f-3e9b6a1c4d5e "tt")'],
  ['hard break', 'dòng 1\\\ndòng 2'],
  ['simple table', '| A | B |\n| - | - |\n| 1 | 2 |'],
  ['table with placeholder (already padded)', '| A     | B               |\n| ----- | --------------- |\n| Hệ số | :var[HeSoLuong] |'],
  ['table with alignment (already padded)', '| A  |  B |\n| :- | -: |\n| 1  |  2 |'],
  ['task list', '- [ ] t\n- [x] d'],
] as const

describe('MDXEditor round trip with the product configuration (a: placeholders)', () => {
  it.each(STABLE)('%s', async (_name, markdown) => {
    const { out, errors } = await roundTrip(markdown)
    expect(errors).toEqual([])
    expect(out).toBe(markdown)
  })
})

/** Markdown that is rewritten into an equivalent canonical form. */
const NORMALISED = [
  ['asterisk bullets become dashes', '* a\n* b', '- a\n- b'],
  ['plus bullets become dashes', '+ x', '- x'],
  ['ordered list start is lost and `1)` becomes `1.`', '1986. x\n1986. y', '1. x\n2. y'],
  ['soft break stays a soft break (renders as a space)', 'dòng 1\ndòng 2', 'dòng 1\ndòng 2'],
  ['two-space hard break becomes backslash', 'dòng 1  \ndòng 2', 'dòng 1\\\ndòng 2'],
  ['plain URL becomes an explicit link', 'https://example.test/x', '[https://example.test/x](https://example.test/x)'],
  ['autolink becomes an explicit link', '<https://example.test/y>', '[https://example.test/y](https://example.test/y)'],
  ['table columns are padded', '| A | B |\n| - | - |\n| 1 | long |', '| A | B    |\n| - | ---- |\n| 1 | long |'],
  ['unnecessary escapes are dropped', 'a \\] b \\} c', 'a ] b } c'],
  ['unknown attributes are re-quoted but kept', ':foo[abc]{y=1}', ':foo[abc]{y="1"}'],
  ['setext-like thematic break becomes ***', '---', '***'],
  ['underline is stripped', '<u>u</u>', 'u'],
  ['highlight markers are stripped', 'a ==hl== b', 'a hl b'],
  ['indented code becomes a paragraph', '    indented', 'indented'],
  ['a literal "<" is escaped', 'a < b and 5<6', 'a \\< b and 5\\<6'],
] as const

describe('MDXEditor normalisation (what changes, all semantics-preserving or contract-enforcing)', () => {
  it.each(NORMALISED)('%s', async (_name, markdown, expected) => {
    const { out, errors } = await roundTrip(markdown)
    expect(errors).toEqual([])
    expect(out).toBe(expected)
  })
})

describe('directives the contract does not know (c: colons are not turned into placeholders)', () => {
  it('keeps a:b, :b, ::b and :::b as typed (shown as warning chips, exported untouched)', async () => {
    for (const md of ['a:b', ':b', '::b']) {
      const { out, errors } = await roundTrip(md)
      expect(errors).toEqual([])
      expect(out).toBe(md)
    }
    const container = await roundTrip(':::b')
    expect(container.out).toBe(':::b\n:::')
  })

  it('keeps an invalid placeholder verbatim instead of dropping its label', async () => {
    for (const md of [':var[bad key]', ':var[_a_]x']) {
      const { out } = await roundTrip(md)
      expect(out.includes('var')).toBe(true)
    }
    expect((await roundTrip(':var[bad key]')).out).toBe(':var[bad key]')
    expect((await roundTrip(':var[HeSoLuong]{a=1}')).out).toBe(':var[HeSoLuong]{a="1"}')
  })
})

describe('things MDXEditor refuses (reported through onError; the editor shows the source fallback)', () => {
  it.each([
    ['raw inline HTML', '<z>'],
    ['raw bold tag', '<b>b</b>'],
    ['HTML comment', '<!-- c -->'],
    ['HTML block', '<div>x</div>'],
    ['script', '<script>alert(1)</script>'],
    ['fenced code block', '```\ncode\n```'],
  ])('%s', async (_name, markdown) => {
    const { errors } = await roundTrip(markdown)
    expect(errors.length).toBeGreaterThan(0)
  })
})
