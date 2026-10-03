import Chip from '@mui/material/Chip'
import type { ChipProps } from '@mui/material/Chip'
import { alpha } from '@mui/material/styles'

/** Hues for the standard tags (matched on the lower-cased name); "Chung" (general) is the neutral grey. */
const NAMED: Record<string, string> = {
  'lương': '#2E7D32',
  'thâm niên': '#1565C0',
  'khen thưởng': '#EF6C00',
  'khảo sát': '#6A1B9A',
  'đào tạo': '#00838F',
  chung: '#546E7A',
}
/** Fallback hues for tags without a colour of their own, picked by a hash of the name. Grey is reserved for "Chung". */
const FALLBACK = ['#C2185B', '#558B2F', '#E64A19', '#3949AB', '#0288D1', '#8D6E63']

/** The colour a tag renders in: its own colour, a known hue for the standard tags, or a stable one derived from its name. */
export function tagColor(tag: { name: string; color?: string | null }): string {
  if (tag.color) return tag.color
  const key = tag.name.trim().toLowerCase()
  if (NAMED[key]) return NAMED[key]
  let h = 0
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return FALLBACK[h % FALLBACK.length]
}

/** Tags as tinted uppercase chips in the tag's own hue. */
export default function TagChip({ tag, sx, ...rest }: { tag: { name: string; color?: string | null } } & Omit<ChipProps, 'label' | 'color'>) {
  const c = tagColor(tag)
  return (
    <Chip
      size="small"
      variant="tag"
      label={tag.name}
      {...rest}
      sx={[{ bgcolor: alpha(c, 0.14), color: c }, ...(Array.isArray(sx) ? sx : [sx])]}
    />
  )
}
