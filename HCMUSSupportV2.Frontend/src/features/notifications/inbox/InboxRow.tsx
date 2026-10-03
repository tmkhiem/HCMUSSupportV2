import AttachFileOutlined from '@mui/icons-material/AttachFileOutlined'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'
import { formatDate } from '../../../lib/format'
import { flyInSx } from '../../../ui'
import TagChip from '../TagChip'
import type { InboxItem } from './inboxTypes'

export interface InboxRowProps {
  item: InboxItem
  /** Position in reading order, for the staggered entrance (capped by the caller). */
  index?: number
  /** Query string of the list (`?q=...`), kept when the detail opens so closing it restores the same view. */
  search?: string
}

/**
 * One inbox row: a compact acrylic link to `/news/:id`. Chip for edited-after-delivery; first tag plus `+N`; delivery date.
 */
export default function InboxRow({ item, index, search = '' }: InboxRowProps) {
  const [firstTag, ...otherTags] = item.tags
  return (
    <Paper
      component={RouterLink}
      to={{ pathname: `/news/${item.id}`, search }}
      state={{ fromList: true }}
      variant="acrylic"
      data-interactive="true"
      data-testid="inbox-row"
      sx={[
        index !== undefined && flyInSx(index),
        {
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: { md: 'center' },
          gap: { xs: 0.5, md: 1.5 },
          px: { xs: 2, md: 2.5 },
          py: 1.5,
          color: 'text.primary',
          textDecoration: 'none',
          overflow: 'hidden',
        },
      ]}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0, flex: { md: '0 1 auto' }, maxWidth: { md: '58%' } }}>
        <Typography component="h3" noWrap title={item.title} sx={{ fontSize: '1rem', fontWeight: 600, lineHeight: 1.35 }}>
          {item.title}
        </Typography>
      </Box>

      {item.summary && (
        <Typography
          noWrap
          sx={{ flex: { md: '1 1 0' }, minWidth: 0, color: 'text.secondary', opacity: 0.85, fontSize: '0.9375rem', pl: { xs: 2.5, md: 0 } }}
        >
          <Box component="span" aria-hidden sx={{ mr: 1, opacity: 0.5, display: { xs: 'none', md: 'inline' } }}>
            —
          </Box>
          {item.summary}
        </Typography>
      )}

      <Stack
        direction="row"
        sx={{ flexShrink: 0, alignItems: 'center', flexWrap: 'wrap', gap: 0.75, ml: { md: 'auto' }, pl: { xs: 2.5, md: 0 }, pt: { xs: 0.5, md: 0 } }}
      >
        {item.hasAttachments && <AttachFileOutlined fontSize="small" titleAccess="Có tệp đính kèm" sx={{ color: 'text.secondary', opacity: 0.7 }} />}
        {firstTag && <TagChip tag={firstTag} />}
        {otherTags.length > 0 && (
          <Chip
            size="small"
            variant="outlined"
            label={`+${otherTags.length}`}
            title={otherTags.map((t) => t.name).join(', ')}
          />
        )}
        <Typography
          component="time"
          dateTime={(item.publishedAt ?? item.deliveredAt).toISOString()}
          sx={{ fontSize: '0.8125rem', fontWeight: 700, color: 'text.secondary', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', ml: 0.5 }}
        >
          {formatDate(item.publishedAt ?? item.deliveredAt)}
        </Typography>
      </Stack>
    </Paper>
  )
}
