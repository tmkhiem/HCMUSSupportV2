import { Navigate, useLocation } from 'react-router-dom'

/** The backend redirects refused sign-ins to `/login?error=...`: same page as `/dang-nhap`, query kept. */
export default function LoginAlias() {
  const { search } = useLocation()
  return <Navigate to={{ pathname: '/dang-nhap', search }} replace />
}
