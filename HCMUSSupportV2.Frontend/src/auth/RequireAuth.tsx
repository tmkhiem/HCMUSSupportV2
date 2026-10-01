import ErrorOutline from '@mui/icons-material/ErrorOutlineOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { errorMessage } from '../ui/errorMessage'
import AcrylicCard from '../ui/AcrylicCard'
import SectionLabel from '../ui/SectionLabel'
import { useAuth } from './authContext'

export function FullScreenLoading({ label = 'Đang đồng bộ...' }: { label?: string }) {
  return (
    <Box
      role="status"
      sx={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default' }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <CircularProgress size={48} thickness={4} />
        <SectionLabel sx={{ opacity: 0.6 }}>{label}</SectionLabel>
      </Box>
    </Box>
  )
}

function AuthFailure({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 3, bgcolor: 'background.default' }}>
      <AcrylicCard sx={{ p: 5, maxWidth: 440, textAlign: 'center', bgcolor: '#fff' }}>
        <ErrorOutline color="error" sx={{ fontSize: 48, mb: 2 }} />
        <Typography variant="h6" component="h1" sx={{ mb: 1 }}>
          Lỗi xác thực
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          {errorMessage(error, 'Lỗi hệ thống. Vui lòng thử lại sau.')}
        </Typography>
        <Button variant="contained" onClick={onRetry}>
          Tải lại
        </Button>
      </AcrylicCard>
    </Box>
  )
}

/** Gate for the signed-in part of the app: loading and error screens, or a redirect to the login page. */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { status, error, refetch } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <FullScreenLoading />
  if (status === 'error') return <AuthFailure error={error} onRetry={refetch} />
  if (status === 'unauthenticated') {
    const returnUrl = location.pathname + location.search + location.hash
    const search = returnUrl === '/' ? '' : `?returnUrl=${encodeURIComponent(returnUrl)}`
    return <Navigate to={`/dang-nhap${search}`} replace />
  }
  return <>{children}</>
}
