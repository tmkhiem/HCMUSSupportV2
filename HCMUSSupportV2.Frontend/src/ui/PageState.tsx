import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import { errorMessage } from './errorMessage'

export interface PageStateProps {
  /** Anything thrown by a query. `ApiError` messages are shown as-is; other errors use `errorFallback`. */
  error?: unknown
  loading?: boolean
  /** True when the data loaded but there is nothing to show. */
  empty?: boolean
  /** Specific fallback such as "Không tải được quá trình lương." (never a generic "Lỗi"). */
  errorFallback?: string
  emptyMessage?: string
  onRetry?: () => void
  /** Rendered only when none of the states apply. */
  children?: ReactNode
}

/**
 * Page states in the order of UI-STYLE-GUIDE §7: error (Alert), loading (centred spinner), empty (plain text),
 * otherwise the content.
 */
export default function PageState({
  error,
  loading,
  empty,
  errorFallback = 'Không tải được dữ liệu. Vui lòng thử lại.',
  emptyMessage = 'Chưa có dữ liệu.',
  onRetry,
  children,
}: PageStateProps) {
  if (error) {
    return (
      <Alert
        severity="error"
        action={
          onRetry ? (
            <Button color="inherit" size="small" onClick={onRetry}>
              Thử lại
            </Button>
          ) : undefined
        }
      >
        {errorMessage(error, errorFallback)}
      </Alert>
    )
  }
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress aria-label="Đang tải" />
      </Box>
    )
  }
  if (empty) return <Typography color="text.secondary">{emptyMessage}</Typography>
  return <>{children}</>
}
