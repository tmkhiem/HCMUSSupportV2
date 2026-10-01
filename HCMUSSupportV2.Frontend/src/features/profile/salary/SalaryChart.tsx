import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { useTheme } from '@mui/material/styles'
import { LineChart } from '@mui/x-charts/LineChart'
import { useMemo } from 'react'
import { formatDate, formatDecimal } from '../../../lib/format'
import AcrylicCard from '../../../ui/AcrylicCard'
import SectionLabel from '../../../ui/SectionLabel'
import type { SalaryEntry } from '../careerApi'
import { coefficientPoints } from '../careerFormat'

/** Step-line of hệ số lương by effective date: the coefficient holds until the next decision takes effect. */
export default function SalaryChart({ history, index }: { history: SalaryEntry[]; index: number }) {
  const theme = useTheme()
  const points = useMemo(() => coefficientPoints(history), [history])
  if (points.length === 0) return null

  const latest = points[points.length - 1]
  const summary = `Hệ số lương qua ${points.length} mốc, từ ${formatDecimal(points[0].coefficient)} (${formatDate(points[0].date)}) đến ${formatDecimal(latest.coefficient)} (${formatDate(latest.date)}).`

  return (
    <AcrylicCard index={index} sx={{ p: { xs: 2, sm: 3 } }} data-testid="salary-chart">
      <SectionLabel sx={{ mb: 1 }}>Hệ số lương theo thời gian</SectionLabel>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {summary}
      </Typography>
      <Box role="img" aria-label={summary} sx={{ width: '100%' }}>
        <LineChart
          height={280}
          margin={{ left: 8, right: 16, top: 16, bottom: 8 }}
          grid={{ horizontal: true }}
          xAxis={[
            {
              scaleType: 'time',
              data: points.map((p) => p.date),
              valueFormatter: (v: Date) => formatDate(v),
              tickLabelStyle: { fontSize: 11 },
            },
          ]}
          yAxis={[{ min: 0, valueFormatter: (v: number) => formatDecimal(v, 1), width: 44 }]}
          series={[
            {
              data: points.map((p) => p.coefficient),
              curve: 'stepAfter',
              label: 'Hệ số',
              color: theme.palette.primary.main,
              showMark: true,
              valueFormatter: (v: number | null) => (v == null ? '—' : formatDecimal(v)),
            },
          ]}
          hideLegend
        />
      </Box>
    </AcrylicCard>
  )
}
