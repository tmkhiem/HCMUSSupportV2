import LockOutlined from '@mui/icons-material/LockOutlined'
import Typography from '@mui/material/Typography'
import { Outlet } from 'react-router-dom'
import type { ReactNode } from 'react'
import AcrylicCard from '../ui/AcrylicCard'
import { useAuth } from './authContext'
import type { Role } from './types'

export function Forbidden() {
  return (
    <AcrylicCard sx={{ p: 5, textAlign: 'center', maxWidth: 520, mx: 'auto', mt: 6 }} index={0}>
      <LockOutlined color="disabled" sx={{ fontSize: 56, mb: 2 }} />
      <Typography variant="h6" component="h1" sx={{ mb: 1 }}>
        Bạn không có quyền truy cập trang này
      </Typography>
      <Typography color="text.secondary">Vui lòng liên hệ quản trị viên nếu bạn cần quyền này.</Typography>
    </AcrylicCard>
  )
}

/**
 * Renders its children (or the matched child routes) only when the user holds `role`; admins pass every check.
 * Nav hiding is cosmetic: this and the server's 403 are the real guards.
 */
export default function RequireRole({ role, children }: { role: Role; children?: ReactNode }) {
  const { hasRole } = useAuth()
  if (!hasRole(role)) return <Forbidden />
  return <>{children ?? <Outlet />}</>
}
