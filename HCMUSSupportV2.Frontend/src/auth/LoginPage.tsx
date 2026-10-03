import GoogleIcon from '@mui/icons-material/Google'
import VerifiedUserOutlined from '@mui/icons-material/VerifiedUserOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { lazy, Suspense } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import Watermark from '../app/Watermark'
import AcrylicCard from '../ui/AcrylicCard'
import FlyIn from '../ui/FlyIn'
import SectionLabel from '../ui/SectionLabel'
import { useAuth } from './authContext'
import { FullScreenLoading } from './RequireAuth'
import LoginTile from './LoginTile'
import { safeReturnUrl } from './returnUrl'

const UNIVERSITY = 'Ho Chi Minh City University of Science'

/**
 * Messages for `/login?error=<code>` (the backend redirects here when the Google sign-in is refused; `/login` is
 * redirected to `/dang-nhap` with the query kept). `unknown_email` is the D02 name for `not_registered`.
 */
const NOT_REGISTERED =
  'Email này chưa được liên kết với mã số cán bộ. Vui lòng liên hệ đơn vị quản lý để được cấp quyền.'
const ERROR_MESSAGES: Record<string, string> = {
  not_registered: NOT_REGISTERED,
  unknown_email: NOT_REGISTERED,
  inactive: 'Tài khoản của quý Thầy Cô hiện không còn hoạt động trong hệ thống.',
  unverified_email: 'Email Google chưa được xác minh. Vui lòng dùng email chính thức của Trường.',
  oauth_failed: 'Đăng nhập với Google không hoàn tất. Vui lòng thử lại.',
  access_denied: 'Quý Thầy Cô đã từ chối cấp quyền đăng nhập với Google. Vui lòng thử lại nếu đó là nhầm lẫn.',
}
const DEFAULT_ERROR = 'Đăng nhập không thành công. Vui lòng thử lại.'

/** Only exists in `vite` dev: `import.meta.env.DEV` is false in a build, so the module is never bundled. */
const DevLoginPanel = import.meta.env.DEV ? lazy(() => import('./DevLoginPanel')) : null

export function Component() {
  const { status } = useAuth()
  const [params] = useSearchParams()
  const returnUrl = safeReturnUrl(params.get('returnUrl'))
  const errorCode = params.get('error')

  if (status === 'loading') return <FullScreenLoading />
  if (status === 'authenticated') return <Navigate to={returnUrl} replace />

  const message = errorCode
    ? (ERROR_MESSAGES[errorCode] ?? DEFAULT_ERROR)
    : status === 'error'
      ? 'Lỗi hệ thống. Vui lòng thử lại sau.'
      : null

  const loginUrl = `/api/auth/login?returnUrl=${encodeURIComponent(returnUrl)}`

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        overflowY: 'auto',
        bgcolor: 'background.default',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Watermark />

      <Box sx={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 1152, px: { xs: 2, md: 4 }, py: 3, my: 'auto' }}>
        <AcrylicCard
          sx={{
            bgcolor: 'rgba(255,255,255,.7)',
            p: { xs: 4, md: 6, lg: 8 },
            display: 'flex',
            flexDirection: { xs: 'column', lg: 'row' },
            alignItems: 'center',
            justifyContent: { lg: 'space-between' },
            gap: { xs: 6, lg: 8 },
          }}
        >
          <FlyIn from="top" sx={{ flex: { lg: 1 }, minWidth: 0, textAlign: { xs: 'center', lg: 'left' } }}>
            <Typography
              component="h1"
              sx={{ fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.02em', mb: 2, fontSize: 'clamp(2rem, 4vw, 3.25rem)' }}
            >
              Support HCMUS
            </Typography>
            <Stack spacing={1} sx={{ maxWidth: 512, mx: { xs: 'auto', lg: 0 }, fontSize: '1.1875rem', lineHeight: 1.6 }}>
              <p style={{ margin: 0 }}>Chào mừng quý Thầy Cô đã truy cập Support HCMUS!</p>
              <p style={{ margin: 0 }}>Quý Thầy Cô vui lòng đăng nhập với email chính thức của Trường (Google).</p>
            </Stack>
            <SectionLabel sx={{ display: { xs: 'none', lg: 'block' }, mt: 4, fontSize: 13, opacity: 0.6 }}>
              {UNIVERSITY}
            </SectionLabel>
          </FlyIn>

          <Box sx={{ width: '100%', maxWidth: 448, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: { xs: 'center', lg: 'flex-end' } }}>
            {message && (
              <Alert severity="error" sx={{ width: '100%', mb: 2 }}>
                {message}
              </Alert>
            )}
            <Stack spacing={2} sx={{ width: '100%' }}>
              <LoginTile
                index={0}
                title="Đăng nhập với Google"
                icon={<GoogleIcon sx={{ color: 'primary.main' }} />}
                onClick={() => window.location.assign(loginUrl)}
              />
              <LoginTile index={1} title="Đăng nhập với VNeID" icon={<VerifiedUserOutlined />} disabled />
            </Stack>
            {DevLoginPanel && (
              <Suspense fallback={null}>
                <DevLoginPanel />
              </Suspense>
            )}
            <SectionLabel sx={{ display: { lg: 'none' }, mt: 6, fontSize: 13, opacity: 0.6, textAlign: 'center' }}>
              {UNIVERSITY}
            </SectionLabel>
          </Box>
        </AcrylicCard>
      </Box>
    </Box>
  )
}
