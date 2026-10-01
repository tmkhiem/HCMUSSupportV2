import ErrorOutline from '@mui/icons-material/ErrorOutlineOutlined'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { isRouteErrorResponse, useRouteError } from 'react-router-dom'
import AcrylicCard from '../../ui/AcrylicCard'
import { errorMessage } from '../../ui/errorMessage'

/** Route-level error boundary (a lazy chunk failed to load, a page threw while rendering). */
export function RouteErrorPage() {
  const error = useRouteError()
  const detail = isRouteErrorResponse(error)
    ? error.status === 404
      ? 'Không tìm thấy trang.'
      : `Lỗi ${error.status}.`
    : errorMessage(error, 'Đã xảy ra lỗi không mong muốn.')

  return (
    <AcrylicCard sx={{ p: 5, textAlign: 'center', maxWidth: 520, mx: 'auto', mt: 6, bgcolor: '#fff' }}>
      <ErrorOutline color="error" sx={{ fontSize: 56, mb: 2 }} />
      <Typography variant="h6" component="h1" sx={{ mb: 1 }}>
        Không hiển thị được trang
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {detail}
      </Typography>
      <Button variant="contained" onClick={() => window.location.reload()}>
        Tải lại trang
      </Button>
    </AcrylicCard>
  )
}
