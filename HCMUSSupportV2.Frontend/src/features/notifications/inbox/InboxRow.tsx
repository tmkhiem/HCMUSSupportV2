import AttachFileOutlined from '@mui/icons-material/AttachFileOutlined'
import PushPinOutlined from '@mui/icons-material/PushPinOutlined'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'
import { formatDate } from '../../../lib/format'
import { flyInSx } from '../../../ui'
import type { InboxItem } from './inboxTypes'
import { needsAck } from './inboxTypes'

export interface InboxRowProps {
  item: InboxItem
  /** Position in reading order, for the staggered entrance (capped by the caller). */
  index?: number
  /** Query string of the list (`?q=...`), kept when the detail opens so closing it restores the same view. */
  search?: string
}

/**
 * One inbox row: a compact acrylic link to `/tin-tuc/:id`. Unread = bold title and a primary dot; chips for pinned,
 * acknowledgement pending and edited-after-delivery; first tag plus `+N`; delivery date.
 */
export default function InboxRow({ item, index, search = '' }: InboxRowProps) {
  const unread = !item.readAt
  const [firstTag, ...otherTags] = item.tags
  return (
    <Paper
      component={RouterLink}
      to={{ pathname: `/tin-tuc/${item.id}`, search }}
      state={{ fromList: true }}
      variant="acrylic"
      data-interactive="true"
      data-testid="inbox-row"
      data-unread={unread ? 'true' : 'false'}
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
        <Box
          aria-hidden
          data-testid={unread ? 'unread-dot' : undefined}
          title={unread ? 'Chưa đọc' : undefined}
          sx={{ width: 8, height: 8, flexShrink: 0, borderRadius: '50%', bgcolor: unread ? 'primary.main' : 'transparent' }}
        />
        {unread && <Box component="span" sx={visuallyHidden}>Chưa đọc: </Box>}
        <Typography component="h3" noWrap title={item.title} sx={{ fontSize: '1rem', fontWeight: unread ? 800 : 500, lineHeight: 1.35 }}>
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
        {item.pinned && <Chip size="small" color="primary" variant="outlined" icon={<PushPinOutlined />} label="Ghim" />}
        {needsAck(item) && <Chip size="small" color="warning" variant="outlined" label="Cần xác nhận" />}
        {item.updatedAfterDelivery && <Chip size="small" color="info" variant="outlined" label="Đã cập nhật" />}
        {item.hasAttachments && <AttachFileOutlined fontSize="small" titleAccess="Có tệp đính kèm" sx={{ color: 'text.secondary', opacity: 0.7 }} />}
        {firstTag && <Chip size="small" variant="tag" label={firstTag.name} />}
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
          dateTime={item.deliveredAt.toISOString()}
          sx={{ fontSize: '0.8125rem', fontWeight: 700, color: 'text.secondary', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', ml: 0.5 }}
        >
          {formatDate(item.deliveredAt)}
        </Typography>
      </Stack>
    </Paper>
  )
}

const visuallyHidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const
