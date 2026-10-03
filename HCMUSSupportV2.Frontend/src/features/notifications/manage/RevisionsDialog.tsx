import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import { useTheme } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { formatDateTime } from '../../../lib/format'
import { PageState } from '../../../ui'
import NotificationBody from '../body/NotificationBody'
import { useRevisions } from './manageQueries'
import type { ManageRevision } from './manageTypes'

export interface RevisionsDialogProps {
  open: boolean
  notificationId: string
  currentVersion: number
  onClose: () => void
  /** Puts an older version's title, body and variables into the form (not saved until "Lưu"). */
  onRestore: (revision: ManageRevision) => void
}

/** Revision history: the content as published and every edit after it, newest first. */
export default function RevisionsDialog({ open, notificationId, currentVersion, onClose, onRestore }: RevisionsDialogProps) {
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('md'))
  const revisions = useRevisions(notificationId, open)
  const list = revisions.data ?? []

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" fullScreen={fullScreen} aria-labelledby="revisions-title">
      <DialogTitle id="revisions-title">Lịch sử chỉnh sửa</DialogTitle>
      <DialogContent dividers>
        <PageState
          error={revisions.error}
          loading={revisions.isPending}
          empty={list.length === 0}
          emptyMessage="Chưa có phiên bản nào. Lịch sử được ghi từ lúc thông báo được đăng."
          errorFallback="Không tải được lịch sử."
          onRetry={() => void revisions.refetch()}
        >
          <Box data-testid="revision-list">
            {list.map((r) => (
              <Accordion key={r.version} disableGutters variant="outlined" slotProps={{ transition: { unmountOnExit: true } }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />} aria-controls={`rev-${r.version}`}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700 }}>
                      Phiên bản {r.version}
                      {r.version === currentVersion ? ' (hiện tại)' : ''}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {formatDateTime(r.editedAt)} · {r.editedBy ? (r.editedBy.fullName ?? r.editedBy.code) : '—'}
                    </Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails id={`rev-${r.version}`}>
                  <Typography variant="h6" component="h3" sx={{ mb: 1, fontSize: '1.125rem' }}>
                    {r.title}
                  </Typography>
                  <NotificationBody markdown={r.bodyMd} />
                  {r.version !== currentVersion && (
                    <Button sx={{ mt: 2 }} variant="outlined" onClick={() => onRestore(r)}>
                      Dùng lại nội dung này
                    </Button>
                  )}
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
        </PageState>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Đóng</Button>
      </DialogActions>
    </Dialog>
  )
}
