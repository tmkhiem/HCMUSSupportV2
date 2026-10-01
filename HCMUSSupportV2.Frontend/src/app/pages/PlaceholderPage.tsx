import ConstructionOutlined from '@mui/icons-material/ConstructionOutlined'
import Typography from '@mui/material/Typography'
import { useMatches, useLocation } from 'react-router-dom'
import AcrylicCard from '../../ui/AcrylicCard'
import PageHeader from '../../ui/PageHeader'

/**
 * Stand-in for every page that a later delivery builds. It reads its title from the route `handle`, so a
 * feature agent replaces the route's `lazy` import and deletes nothing else.
 */
export function Component() {
  const matches = useMatches()
  const { pathname } = useLocation()
  const title = (matches.at(-1)?.handle as { title?: string } | undefined)?.title ?? 'Trang'

  return (
    <>
      <PageHeader title={title} />
      <AcrylicCard
        index={1}
        sx={{ mt: 3, p: 6, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
      >
        <ConstructionOutlined sx={{ fontSize: 64, mb: 2, opacity: 0.3, color: 'text.secondary' }} />
        <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
          {title}
        </Typography>
        <Typography color="text.secondary">Nội dung đang được cập nhật. Vui lòng quay lại sau.</Typography>
        <Typography variant="caption" color="text.disabled" sx={{ mt: 2 }}>
          {pathname}
        </Typography>
      </AcrylicCard>
    </>
  )
}
