import VisibilityOffOutlined from '@mui/icons-material/VisibilityOffOutlined'
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import EmptyDash from './EmptyDash'
import { isBlank } from '../lib/format'

export interface MaskedValueProps {
  /** Field name, used for accessible labels ("Hiện Số CCCD"). */
  label: string
  /** Last characters of the value, shown after the dots (`•••• 1234`). Missing and no revealed value -> `—`. */
  tail?: string | null
  /** The real value once the user has revealed it (audited server-side). */
  revealed?: string | null
  /** Called when the user clicks the eye. The caller fetches the value and passes it back as `revealed`. */
  onReveal?: () => void
  /** Called when the user hides a revealed value again. */
  onHide?: () => void
  loading?: boolean
}

/** Sensitive value shown masked (`•••• 1234`) with a per-field reveal button. */
export default function MaskedValue({ label, tail, revealed, onReveal, onHide, loading }: MaskedValueProps) {
  const isRevealed = !isBlank(revealed)
  if (!isRevealed && isBlank(tail)) return <EmptyDash />

  const canToggle = isRevealed ? Boolean(onHide) : Boolean(onReveal)

  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      <Box
        component="span"
        data-testid="masked-value"
        sx={{ fontVariantNumeric: 'tabular-nums', letterSpacing: isRevealed ? undefined : '0.05em' }}
      >
        {isRevealed ? revealed : `•••• ${tail}`}
      </Box>
      {canToggle && (
        <Tooltip title={isRevealed ? `Ẩn ${label}` : `Hiện ${label}`}>
          <span>
            <IconButton
              size="small"
              aria-label={isRevealed ? `Ẩn ${label}` : `Hiện ${label}`}
              disabled={loading}
              onClick={isRevealed ? onHide : onReveal}
            >
              {loading ? (
                <CircularProgress size={16} />
              ) : isRevealed ? (
                <VisibilityOffOutlined fontSize="small" />
              ) : (
                <VisibilityOutlined fontSize="small" />
              )}
            </IconButton>
          </span>
        </Tooltip>
      )}
    </Box>
  )
}
