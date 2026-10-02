import Box from '@mui/material/Box'
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'
import { useTheme } from '@mui/material/styles'
import { LineChart } from '@mui/x-charts/LineChart'
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
      <LinearProgress variant="determinate" value={Math.min(100, value)} aria-label={`${label} ${pct(value)}`} sx={{ height: 8, borderRadius: 4 }} />
    </Box>
  )
}

/** Read and acknowledgement rates of a notification that went out, and how the reads built up day by day. */
export default function StatsPanel({ notificationId }: { notificationId: string }) {
  const theme = useTheme()
  const stats = useStats(notificationId, true)
  const s = stats.data
  const days = s?.readsByDay ?? []

  return (
    <AcrylicCard sx={{ p: 2.5 }} data-testid="stats-panel">
      <SectionLabel>Tình hình đọc</SectionLabel>
      <Box sx={{ mt: 1.5 }}>
        <PageState error={stats.error} loading={stats.isPending} errorFallback="Không tải được thống kê." onRetry={() => void stats.refetch()}>
          {s && (
            <Box sx={{ display: 'grid', gap: 1.5 }}>
              <Bar label="Đã đọc" value={s.readPercent} detail={`${formatNumber(s.readCount)}/${formatNumber(s.recipientCount)}`} />
              {s.requiresAck && <Bar label="Đã xác nhận" value={s.ackPercent} detail={`${formatNumber(s.ackCount)}/${formatNumber(s.recipientCount)}`} />}
              {days.length >= 2 ? (
                <Box role="img" aria-label={`Tỷ lệ đã đọc tăng dần qua ${days.length} ngày, đạt ${pct(days[days.length - 1].cumulativePercent)}`}>
                  <LineChart
                    height={160}
                    margin={{ left: 4, right: 12, top: 12, bottom: 4 }}
                    xAxis={[{ scaleType: 'point', data: days.map((d) => d.date.slice(5).split('-').reverse().join('/')), tickLabelStyle: { fontSize: 10 } }]}
                    yAxis={[{ min: 0, max: 100, width: 36, valueFormatter: (v: number) => `${v}%` }]}
                    series={[{ data: days.map((d) => d.cumulativePercent), color: theme.palette.primary.main, label: 'Đã đọc (cộng dồn)', showMark: true, valueFormatter: (v: number | null) => (v == null ? '—' : pct(v)) }]}
                    hideLegend
                  />
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  {days.length === 1 ? `Ngày ${days[0].date.split('-').reverse().join('/')}: ${days[0].reads} lượt đọc.` : 'Chưa có ai đọc.'}
                </Typography>
              )}
            </Box>
          )}
        </PageState>
      </Box>
    </AcrylicCard>
  )
}
