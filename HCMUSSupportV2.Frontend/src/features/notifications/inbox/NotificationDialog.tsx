import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined'
import CloseIcon from '@mui/icons-material/Close'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import { useTheme } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useId, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../../../api/http'
import { formatDate } from '../../../lib/format'
import { errorMessage } from '../../../ui'
import NotificationBody from '../body/NotificationBody'
import { AttachmentList, SeriesPrevious } from './DetailSections'
import { useInboxDetail } from './inboxQueries'
import PngIcon from '../../../ui/PngIcon'

/**
 * `/news/:id`: the detail as a Dialog over the list (the parent route keeps the list mounted). Deep-linkable.
 * Closing returns to `/news` with the list's filters (`history -1` when we came from the list, otherwise a replace).
 */
export function Component() {
  const { id } = useParams()
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('md'))
  const navigate = useNavigate()
  const location = useLocation()
  const titleId = useId()

  const [open, setOpen] = useState(true)
  const detail = useInboxDetail(id)

  const close = () => setOpen(false)
  const leave = () => {
    const fromList = (location.state as { fromList?: boolean } | null)?.fromList
    if (fromList) void navigate(-1)
    else void navigate({ pathname: '/news', search: location.search }, { replace: true })
  }

  const data = detail.data
  const notFound = detail.error instanceof ApiError && detail.error.status === 404

  return (
    <Dialog
      open={open}
      onClose={close}
      slotProps={{ transition: { onExited: leave } }}
      fullScreen={fullScreen}
      fullWidth
      maxWidth="md"
      scroll="paper"
      aria-labelledby={titleId}
    >
      <Box sx={{ position: 'relative', px: { xs: 2.5, md: 5 }, pt: { xs: 2.5, md: 4 }, pb: 2 }}>
        <IconButton aria-label="Đóng" onClick={close} sx={{ position: 'absolute', top: { xs: 8, md: 16 }, right: { xs: 8, md: 16 } }}>
          <CloseIcon />
        </IconButton>
        {data ? (
          <>
            <Typography
              id={titleId}
              component="h2"
              sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, pr: 5, fontSize: { xs: '1.5rem', md: '1.875rem' }, fontWeight: 900, lineHeight: 1.25, letterSpacing: '-0.01em' }}
            >
              <PngIcon name="bell" size={32} sx={{ mt: '0.1em' }} />
              <span>{data.title}</span>
            </Typography>
            <Stack direction="row" sx={{ mt: 2, alignItems: 'center', flexWrap: 'wrap', gap: 1.25 }} data-testid="detail-meta">
              <Typography
                component="span"
                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', color: 'primary.main' }}
              >
                <CalendarMonthOutlined sx={{ fontSize: 16 }} />
                {formatDate(data.deliveredAt)}
              </Typography>
              {data.series && <Chip size="small" variant="outlined" icon={<PngIcon name="layers" size={18} />} label={data.series.name} />}
              {data.tags.map((t) => (
                <Chip key={t.id} size="small" variant="tag" label={t.name} />
              ))}
              {data.updatedAfterDelivery && <Chip size="small" color="info" variant="outlined" label="Đã cập nhật" />}
            </Stack>
          </>
        ) : (
          <Typography id={titleId} component="h2" sx={{ fontWeight: 900, fontSize: '1.5rem', pr: 5 }}>
            {notFound ? 'Không tìm thấy thông báo' : 'Thông báo'}
          </Typography>
        )}
      </Box>

      <DialogContent dividers sx={{ px: { xs: 2.5, md: 5 }, py: 3 }}>
        {detail.isPending && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress aria-label="Đang tải" />
          </Box>
        )}
        {detail.isError && (
          <Alert severity={notFound ? 'warning' : 'error'} action={notFound ? undefined : <Button color="inherit" size="small" onClick={() => void detail.refetch()}>Thử lại</Button>}>
            {notFound
              ? 'Thông báo này không tồn tại hoặc bạn không có quyền xem.'
              : errorMessage(detail.error, 'Không tải được thông báo. Vui lòng thử lại.')}
          </Alert>
        )}
        {data && (
          <>
            <NotificationBody markdown={data.bodyMd} vars={data.vars} />
            <AttachmentList notificationId={data.id} attachments={data.attachments} />
            <SeriesPrevious series={data.series} />
          </>
        )}
      </DialogContent>

    </Dialog>
  )
}
