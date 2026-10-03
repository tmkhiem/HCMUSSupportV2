import Box from '@mui/material/Box'
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'
import { formatNumber } from '../../../lib/format'
import { AcrylicCard, PageState, SectionLabel } from '../../../ui'
import { useStats } from './manageQueries'

const pct = (n: number) => `${n.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`

function Bar({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="body2">{label}</Typography>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {detail} · {pct(value)}
        </Typography>
      </Box>
      <LinearProgress variant="determinate" value={Math.min(100, value)} aria-label={`${label} ${pct(value)}`} sx={{ height: 8, borderRadius: 999 }} />
    </Box>
  )
}

/** Recipient count and, when the notification asks for it, the acknowledgement rate. */
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
              {s.requiresAck && <Bar label="Đã xác nhận" value={s.ackPercent} detail={`${formatNumber(s.ackCount)}/${formatNumber(s.recipientCount)}`} />}
            </Box>
          )}
        </PageState>
      </Box>
    </AcrylicCard>
  )
}
