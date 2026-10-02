/** The tags that exist after migration D07 (docs/NOTIFICATIONS.md): Lương, Thâm niên, Khen thưởng, Khảo sát, Đào tạo, Chung. */
export interface Guess {
  seriesName: string | null
  tagNames: string[]
}

const RULES: { test: RegExp; series: string; tags: string[] }[] = [
  { test: /nâng\s+(bậc\s+)?lương\s+(trước\s+(hạn|thời\s+hạn)|sớm)/i, series: 'Nâng lương trước hạn', tags: ['Lương', 'Khen thưởng'] },
  { test: /nâng\s+(bậc\s+)?lương\s+thường\s+xuyên/i, series: 'Nâng lương thường xuyên', tags: ['Lương'] },
  { test: /thâm\s+niên\s+vượt\s+khung|vượt\s+khung/i, series: 'Thâm niên vượt khung', tags: ['Lương', 'Thâm niên'] },
  { test: /thâm\s+niên/i, series: 'Phụ cấp thâm niên nhà giáo', tags: ['Lương', 'Thâm niên'] },
  { test: /phụ\s+cấp\s+ưu\s+đãi/i, series: 'Phụ cấp ưu đãi nhà giáo', tags: ['Lương'] },
  { test: /đánh\s+giá[^.]*xếp\s+loại/i, series: 'Đánh giá, xếp loại viên chức', tags: ['Khen thưởng'] },
  { test: /khảo\s+sát/i, series: 'Khảo sát', tags: ['Khảo sát'] },
  { test: /sáng\s+kiến/i, series: 'Sáng kiến', tags: ['Khen thưởng'] },
  { test: /nghiên\s+cứu\s+khoa\s+học/i, series: 'Nghiên cứu khoa học', tags: ['Chung'] },
]

/** Series and tags guessed from the title; the operator reviews them in the report. The same title always gives the same series. */
export function guessSeriesAndTags(title: string): Guess {
  const rule = RULES.find(r => r.test.test(title))
  return rule ? { seriesName: rule.series, tagNames: [...rule.tags] } : { seriesName: null, tagNames: ['Chung'] }
}

/** True for the posts the owner used to try the pipeline ("Thông báo test từ Github"). */
export function looksLikeTestPost(title: string, file: string): boolean {
  return /\btest\b/i.test(title) || /(^|[-_ ])test\.json$/i.test(file)
}
