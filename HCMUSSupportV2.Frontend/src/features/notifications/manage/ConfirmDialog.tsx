import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Typography from '@mui/material/Typography'
import { useId } from 'react'
import type { ReactNode } from 'react'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  /** What happens, in one or two sentences. */
  children: ReactNode
  confirmLabel: string
  /** `error` for destructive actions (delete, archive). */
  tone?: 'primary' | 'error'
  busy?: boolean
  /** An error of the last attempt, shown inside the dialog. */
  error?: string | null
  disabled?: boolean
  onConfirm: () => void
  onClose: () => void
}

/** A small confirmation for the irreversible editor actions (publish, archive, delete). */
export default function ConfirmDialog({ open, title, children, confirmLabel, tone = 'primary', busy, error, disabled, onConfirm, onClose }: ConfirmDialogProps) {
  const titleId = useId()
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} aria-labelledby={titleId} fullWidth maxWidth="xs">
      <DialogTitle id={titleId}>{title}</DialogTitle>
      <DialogContent>
        <Typography component="div" color="text.secondary">
          {children}
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Hủy
        </Button>
        <Button
          variant="contained"
          color={tone}
          onClick={onConfirm}
          disabled={busy || disabled}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
