import CloseIcon from '@mui/icons-material/Close'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import { useTheme } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useId } from 'react'
import { formatDate, orDash } from '../../lib/format'
import SectionLabel from '../../ui/SectionLabel'
import type { InnovationEntry } from './innovationApi'
import { recognitionYear, typeLabel } from './innovationFormat'

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <SectionLabel sx={{ mb: 0.25 }}>{label}</SectionLabel>
      <Typography sx={{ overflowWrap: 'anywhere' }}>{value}</Typography>
    </Box>
  )
}

/** Detail of one sáng kiến: code, type, decision and recognition year. Full screen below `sm`. */
export default function InnovationDialog({ entry, onClose }: { entry: InnovationEntry | null; onClose: () => void }) {
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const titleId = useId()
  return (
    <Dialog
      open={entry !== null}
      onClose={onClose}
      fullScreen={fullScreen}
      fullWidth
      maxWidth="sm"
      aria-labelledby={titleId}
    >
      {entry && (
        <>
          <DialogTitle id={titleId} component="h2" sx={{ pr: 7, overflowWrap: 'anywhere' }}>
            {entry.title}
            <IconButton
              aria-label="Đóng"
              onClick={onClose}
              sx={{ position: 'absolute', right: 8, top: 8 }}
            >
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent>
            <Chip size="small" color="primary" variant="outlined" label={typeLabel(entry.type)} sx={{ mb: 2 }} />
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
              <Field label="Mã sáng kiến" value={orDash(entry.code)} />
              <Field label="Loại" value={typeLabel(entry.type)} />
              <Field label="Số quyết định" value={orDash(entry.decisionNo)} />
              <Field label="Ngày công nhận" value={formatDate(entry.recognizedOn)} />
              <Field label="Năm công nhận" value={recognitionYear(entry)} />
              <Field label="Năm học" value={orDash(entry.academicYear)} />
            </Box>
          </DialogContent>
        </>
      )}
    </Dialog>
  )
}
