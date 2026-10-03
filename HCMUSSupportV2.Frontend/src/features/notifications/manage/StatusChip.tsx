import Chip from '@mui/material/Chip'
import type { ChipProps } from '@mui/material/Chip'
import { STATUS_LABEL } from './manageTypes'
import type { NotificationStatus } from './manageTypes'

const COLOR: Record<NotificationStatus, ChipProps['color']> = {
  draft: 'default',
  published: 'success',
}

/** The lifecycle state of a notification as a chip. */
export default function StatusChip({ status, size = 'small' }: { status: NotificationStatus; size?: ChipProps['size'] }) {
  return (
    <Chip
      size={size}
      label={STATUS_LABEL[status]}
      color={COLOR[status]}
      variant={status === 'draft' ? 'outlined' : 'filled'}
      data-testid="status-chip"
      data-status={status}
      sx={{ fontWeight: 700 }}
    />
  )
}
