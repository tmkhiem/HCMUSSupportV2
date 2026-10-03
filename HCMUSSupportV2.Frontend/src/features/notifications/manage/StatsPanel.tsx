import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { formatNumber } from '../../../lib/format'
import { AcrylicCard, PageState, SectionLabel } from '../../../ui'
import { useStats } from './manageQueries'

/** Recipient, fetched and opened counts of a notification that went out. */
export default function StatsPanel({ notificationId }: { notificationId: string }) {
  const stats = useStats(notificationId, true)
  const s = stats.data

  return (
    <AcrylicCard sx={{ p: 2.5 }} data-testid="stats-panel">
      <SectionLabel>Thống kê</SectionLabel>
      <Box sx={{ mt: 1.5 }}>
        <PageState error={stats.error} loading={stats.isPending} errorFallback="Không tải được thống kê." onRetry={() => void stats.refetch()}>
          {s && (
            <Box sx={{ display: 'grid', gap: 1.5 }}>
              <Typography variant="body2">{formatNumber(s.recipientCount)} người nhận</Typography>
              <Typography variant="body2">{formatNumber(s.fetchedCount)} đã tải thông báo</Typography>
              <Typography variant="body2">{formatNumber(s.openedCount)} đã mở xem</Typography>
            </Box>
          )}
        </PageState>
      </Box>
    </AcrylicCard>
  )
}
