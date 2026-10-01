import Breadcrumbs from '@mui/material/Breadcrumbs'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'
import FlyIn from '../../ui/FlyIn'

/** "Hồ sơ cá nhân / <page>" with the first crumb linking back to `/ho-so`. Shared by the three career pages (D11). */
export default function CareerBreadcrumb({ current }: { current: string }) {
  return (
    <FlyIn index={0} from="top" sx={{ mb: 1.5, pr: { lg: 8 } }}>
      <Breadcrumbs aria-label="Đường dẫn" sx={{ fontSize: '0.8125rem' }}>
        <Link component={RouterLink} to="/ho-so" underline="hover" color="text.secondary">
          Hồ sơ cá nhân
        </Link>
        <Typography color="text.primary" sx={{ fontSize: 'inherit', fontWeight: 600 }}>
          {current}
        </Typography>
      </Breadcrumbs>
    </FlyIn>
  )
}
