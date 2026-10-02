import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Alert from '@mui/material/Alert'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { formatDateTime } from '../../../lib/format'
import DateTimeField from './DateTimeField'

export interface ScheduleDialogProps {
  open: boolean
  initial: Date | null
  busy: boolean
  error: string | null
  onSchedule: (at: Date) => void
  onClose: () => void
}

/** "Lên lịch đăng": the notification goes out by itself at the chosen time (checked every 30 seconds by the server). */
export default function ScheduleDialog({ open, initial, busy, error, onSchedule, onClose }: ScheduleDialogProps) {
  const [value, setValue] = useState<string | null>(() => (initial && initial.getTime() > Date.now() ? initial.toISOString() : null))
  const [opened] = useState(() => new Date())
  const at = value ? new Date(value) : null
  const past = at !== null && at.getTime() <= opened.getTime()

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs" aria-labelledby="schedule-title">
      <DialogTitle id="schedule-title">Lên lịch đăng</DialogTitle>
      <DialogContent>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          Thông báo sẽ tự động gửi đến người nhận vào thời điểm này.
        </Typography>
        <DateTimeField label="Đăng lúc" value={value} onChange={setValue} minDateTime={opened} error={past} helperText={past ? 'Chọn thời điểm ở tương lai.' : undefined} testId="schedule-at" />
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
          disabled={busy || at === null || past}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
          onClick={() => at && onSchedule(at)}
        >
          {at ? `Lên lịch ${formatDateTime(at)}` : 'Lên lịch'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
