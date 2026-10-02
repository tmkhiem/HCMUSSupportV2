import { describe, expect, it } from 'vitest'
import { analyzeBody, scanDirectives } from '../src/validate.ts'

/** Vectors from docs/notification-markdown.md section 8. `codes` empty means valid. */
const fence = '```'
const vectors: { n: number; md: string; codes: string[]; placeholders?: string[] }[] = [
  { n: 1, md: 'Hệ số lương mới: :var[HeSoLuong]', codes: [], placeholders: ['HeSoLuong'] },
  { n: 2, md: ':var[A]', codes: [], placeholders: ['A'] },
  { n: 3, md: ':var[A]:var[B] và :var[A]', codes: [], placeholders: ['A', 'B'] },
  { n: 4, md: '**:var[HeSoLuong]**', codes: [], placeholders: ['HeSoLuong'] },
  { n: 5, md: 'a:var[A]b', codes: [], placeholders: ['A'] },
  { n: 6, md: ':var[Ten_Day_Du] :var[a1] :var[x]', codes: [], placeholders: ['Ten_Day_Du', 'a1', 'x'] },
  { n: 7, md: `:var[${'a'.repeat(64)}]`, codes: [], placeholders: ['a'.repeat(64)] },
  { n: 8, md: `:var[${'a'.repeat(65)}]`, codes: ['UNKNOWN_DIRECTIVE'] },
  { n: 9, md: ':var[]', codes: ['UNKNOWN_DIRECTIVE'] },
  { n: 10, md: ':var[bad key]', codes: ['UNKNOWN_DIRECTIVE'] },
  { n: 11, md: ':var[1Key]', codes: ['UNKNOWN_DIRECTIVE'] },
  { n: 12, md: ':var[_a_]', codes: ['UNKNOWN_DIRECTIVE'] },
  { n: 13, md: ':var[**Key**]', codes: ['UNKNOWN_DIRECTIVE'] },
  { n: 14, md: ':var[Key]{a=1}', codes: ['UNKNOWN_DIRECTIVE'] },
  { n: 15, md: '::var[Key]', codes: ['UNKNOWN_DIRECTIVE'] },
  { n: 16, md: ':::note\nx\n:::', codes: ['UNKNOWN_DIRECTIVE'] },
  { n: 17, md: ':note[abc]{x=1}', codes: ['UNKNOWN_DIRECTIVE'] },
  { n: 18, md: '\\:var[A]', codes: [], placeholders: [] },
  { n: 19, md: '`:var[A]`', codes: [], placeholders: [] },
  { n: 20, md: 'Họp lúc 10:30 sáng', codes: [] },
  { n: 21, md: 'a:b và Ghi chú:abc', codes: [] },
  { n: 22, md: 'Liên hệ mailto:a@b.vn', codes: [] },
  { n: 23, md: 'Dòng 1\\\nDòng 2', codes: [] },
  { n: 24, md: 'a < b và 5<6 và a > b', codes: [] },
  { n: 25, md: 'cho {biến} và }{', codes: [] },
  { n: 26, md: 'Có thẻ <b>đậm</b>', codes: ['RAW_HTML'] },
  { n: 27, md: '<script>alert(1)</script>', codes: ['RAW_HTML'] },
  { n: 28, md: '<!-- ghi chú -->', codes: ['RAW_HTML'] },
  { n: 29, md: 'x<br>y', codes: ['RAW_HTML'] },
  { n: 30, md: '<u>gạch chân</u>', codes: ['RAW_HTML'] },
  { n: 31, md: '<https://example.test/x>', codes: [] },
  { n: 32, md: '[Trang](https://example.test/x "t")', codes: [] },
  { n: 33, md: '[a](mailto:a@b.vn) [b](tel:+84123) [c](/tin-tuc/1) [d](#top)', codes: [] },
  { n: 34, md: '[a](javascript:alert(1))', codes: ['FORBIDDEN_URL'] },
  { n: 35, md: '[a](JaVaScRiPt:alert(1))', codes: ['FORBIDDEN_URL'] },
  { n: 36, md: '[a](data:text/html;base64,AAAA)', codes: ['FORBIDDEN_URL'] },
  { n: 37, md: '[a](//evil.test)', codes: ['FORBIDDEN_URL'] },
  { n: 38, md: '[a](relative/path)', codes: ['FORBIDDEN_URL'] },
  { n: 39, md: '![ảnh](/api/files/0197a3c2-5b1e-7c4a-8d2f-3e9b6a1c4d5e)', codes: [] },
  { n: 40, md: '![x](https://tracker.test/p.gif)', codes: ['FORBIDDEN_URL'] },
  { n: 41, md: '![x](/api/files/0197a3c2-5b1e-7c4a-8d2f-3e9b6a1c4d5e?w=1)', codes: ['FORBIDDEN_URL'] },
  { n: 42, md: '![x](/api/files/0197A3C2-5B1E-7C4A-8D2F-3E9B6A1C4D5E)', codes: ['FORBIDDEN_URL'] },
  { n: 43, md: '![x](/api/admin/secret.png)', codes: ['FORBIDDEN_URL'] },
  { n: 44, md: `${fence}\ncode\n${fence}`, codes: ['CODE_BLOCK'] },
  { n: 45, md: 'đoạn\n\n    code', codes: ['CODE_BLOCK'] },
  { n: 46, md: '`inline`', codes: [] },
  { n: 47, md: '[^1] text\n[^1]: note', codes: ['UNSUPPORTED_SYNTAX'] },
  { n: 48, md: 'a ==hl== b', codes: ['UNSUPPORTED_SYNTAX'] },
  { n: 49, md: '[a][ref]\n[ref]: https://a.test', codes: ['FORBIDDEN_URL'] },
  { n: 50, md: '# Tiêu đề :var[A]\n\n- mục :var[B]\n\n> trích', codes: [], placeholders: ['A', 'B'] },
  { n: 51, md: '| H | K |\n| - | - |\n| :var[A] | x |', codes: [], placeholders: ['A'] },
  { n: 52, md: '- [ ] việc\n- [x] xong', codes: [] },
  { n: 53, md: '~~gạch~~ **đậm** *nghiêng*', codes: [] },
]

describe('analyzeBody against the contract vectors', () => {
  for (const v of vectors) {
    it(`#${v.n}: ${JSON.stringify(v.md).slice(0, 50)}`, () => {
      const declared = v.placeholders ?? null
      const result = analyzeBody(v.md, declared)
      expect([...new Set(result.issues.map((i) => i.code))]).toEqual(v.codes)
      if (v.placeholders) expect(result.placeholders).toEqual(v.placeholders)
    })
  }

  it('#54: a body of 100001 characters is too long', () => {
    expect(analyzeBody('a'.repeat(100_001)).issues.map((i) => i.code)).toEqual(['TOO_LONG'])
    expect(analyzeBody('a'.repeat(100_000)).issues).toEqual([])
  })

  it('rejects undeclared placeholders, accepts declared but unused ones', () => {
    expect(analyzeBody(':var[A] :var[B]', ['A']).issues.map((i) => i.code)).toEqual(['UNDECLARED_PLACEHOLDER'])
    expect(analyzeBody(':var[A]', ['A', 'B']).issues).toEqual([])
  })

  it('rejects control characters', () => {
    expect(analyzeBody('a\u0001b').issues.map((i) => i.code)).toEqual(['INVALID_CHARACTER'])
  })
})

describe('scanDirectives', () => {
  it('does not see a directive after a colon, in code or after a backslash', () => {
    expect(scanDirectives('Ghi chú::var[A]').keys).toEqual([])
    expect(scanDirectives('x `:var[A]` y').keys).toEqual([])
    expect(scanDirectives('x \\:var[A] y').keys).toEqual([])
    expect(scanDirectives('x :var[A] y').keys).toEqual(['A'])
  })
})
