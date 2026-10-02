import { transliterate } from './keys.ts'

/** Seeded tags (docs/PLAN.md section 9, D07): Lương, Thâm niên, Khen thưởng, Khảo sát, Đào tạo, Chung. */
export const SEEDED_TAGS = ['Lương', 'Thâm niên', 'Khen thưởng', 'Khảo sát', 'Đào tạo', 'Chung'] as const

export interface Guess {
  tag: string
  series: string | null
  /** Id of the rule that matched, or `default`. */
  rule: string
  /** Which inputs matched the rule: file name, title or body. */
  basis: ('file' | 'title' | 'body')[]
}

interface Rule {
  id: string
  re: RegExp
  tag: string
  series: string | null
}

// Order matters: the more specific rule comes first.
const RULES: Rule[] = [
  { id: 'vuot-khung', re: /vuot ?khung|pctnvk/, tag: 'Lương', series: 'Phụ cấp thâm niên vượt khung' },
  { id: 'phu-cap-uu-dai', re: /phu cap uu dai|\bpcud\b/, tag: 'Lương', series: 'Phụ cấp ưu đãi nhà giáo' },
  { id: 'tham-nien', re: /tham nien|\btnng\b/, tag: 'Thâm niên', series: 'Thâm niên nhà giáo' },
  { id: 'nang-luong-truoc-han', re: /truoc han|truoc thoi han|\bnls\b|nang luong som|de nghi dhqg/, tag: 'Lương', series: 'Nâng lương trước hạn' },
  { id: 'nang-luong-thuong-xuyen', re: /\bnltx\b|nang luong thuong xuyen|nl thuong xuyen|nang bac luong/, tag: 'Lương', series: 'Nâng lương thường xuyên' },
  { id: 'danh-gia-xep-loai', re: /danh gia\s+xep loai/, tag: 'Chung', series: 'Đánh giá xếp loại viên chức' },
  { id: 'khao-sat', re: /khao sat/, tag: 'Khảo sát', series: null },
  { id: 'sang-kien', re: /sang kien/, tag: 'Chung', series: null },
  { id: 'nckh', re: /nghien cuu khoa hoc|\bnckh\b|\bkhcn\b/, tag: 'Chung', series: null },
  { id: 'cccd-bhxh', re: /\bcccd\b|\bbhxh\b/, tag: 'Chung', series: null },
]

/** Lowercase, unaccented text with camelCase and digit boundaries split and punctuation turned into spaces. */
export function normalizeForMatch(text: string): string {
  return transliterate(text)
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Guesses the tag and series of a news post from its file name, title and the start of its body. */
export function guessTagAndSeries(input: { fileName: string; title: string; bodyText: string }): Guess {
  const file = normalizeForMatch(input.fileName.replace(/\.json$/i, ''))
  const title = normalizeForMatch(input.title)
  const body = normalizeForMatch(input.bodyText.slice(0, 600))
  for (const rule of RULES) {
    const basis: Guess['basis'] = []
    if (rule.re.test(file)) basis.push('file')
    if (rule.re.test(title)) basis.push('title')
    if (rule.re.test(body)) basis.push('body')
    if (basis.length > 0) return { tag: rule.tag, series: rule.series, rule: rule.id, basis }
  }
  return { tag: 'Chung', series: null, rule: 'default', basis: [] }
}
