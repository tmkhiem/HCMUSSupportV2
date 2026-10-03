import ApartmentOutlined from '@mui/icons-material/ApartmentOutlined'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import { DASH, formatDate, formatDecimal } from '../../../lib/format'
import AcrylicCard from '../../../ui/AcrylicCard'
import SectionLabel from '../../../ui/SectionLabel'
import type { PositionEntry } from '../careerApi'
import { formatTenure } from '../careerFormat'

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <SectionLabel sx={{ fontSize: 13 }}>{label}</SectionLabel>
      <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
        {value}
      </Typography>
    </Box>
  )
}

function period(entry: PositionEntry): string {
  const from = formatDate(entry.appointedOn)
  if (entry.isCurrent || !entry.endedOn) return `${from} – nay`
  return `${from} – ${formatDate(entry.endedOn)}`
}

/** Vertical timeline of positions, newest first (the API order). The current position is filled and emphasised. */
export default function PositionTimeline({ items, index }: { items: PositionEntry[]; index: number }) {
  return (
    <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }} data-testid="position-timeline">
      {items.map((entry, i) => {
        const last = i === items.length - 1
        const current = entry.isCurrent
        return (
          <Box
            component="li"
            key={entry.id}
            data-current={current ? 'true' : undefined}
            sx={{ display: 'flex', gap: { xs: 1.5, sm: 2.5 }, position: 'relative', pb: last ? 0 : 2 }}
          >
            <Box sx={{ position: 'relative', width: current ? 22 : 16, flexShrink: 0 }} aria-hidden>
              {!last && (
                <Box
                  sx={{
                    position: 'absolute',
                    left: current ? 10 : 7,
                    top: 26,
                    bottom: -16,
                    width: 2,
                    bgcolor: (t) => alpha(t.palette.primary.main, 0.25),
                  }}
                />
              )}
              <Box
                sx={{
                  position: 'absolute',
                  top: current ? 22 : 20,
                  left: 0,
                  width: current ? 22 : 16,
                  height: current ? 22 : 16,
                  borderRadius: '50%',
                  bgcolor: current ? 'primary.main' : (t) => alpha(t.palette.primary.main, 0.45),
                  boxShadow: current ? (t) => `0 0 0 5px ${alpha(t.palette.primary.main, 0.18)}` : undefined,
                }}
              />
            </Box>
            <AcrylicCard
              index={index + Math.min(i, 8)}
              accent={current}
              sx={[{ flex: 1, minWidth: 0, p: current ? 2.5 : 2 }, current && { bgcolor: (t) => alpha(t.palette.primary.main, 0.06) }]}
            >
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1}
                sx={{ justifyContent: 'space-between', alignItems: { sm: 'flex-start' }, mb: 1 }}
              >
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 0 }}>
                  {current && <ApartmentOutlined color="primary" />}
                  <Typography
                    variant={current ? 'h6' : 'subtitle1'}
                    component="h3"
                    sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}
                  >
                    {entry.title}
                  </Typography>
                  {current && <Chip label="Hiện tại" size="small" color="primary" />}
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
                  {period(entry)}
                </Typography>
              </Stack>
              {entry.unitDescription && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  {entry.unitDescription}
                </Typography>
              )}
              <Box
                sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}
              >
                <Fact label={current ? 'Đã đảm nhiệm' : 'Thời gian đảm nhiệm'} value={formatTenure(entry.tenureYears, entry.tenureMonths)} />
                <Fact label="Số quyết định" value={entry.decisionNo ?? DASH} />
                <Fact label="Ngày ký" value={formatDate(entry.signedOn)} />
                <Fact
                  label="Phụ cấp chức vụ"
                  value={entry.coefficient == null ? DASH : formatDecimal(entry.coefficient)}
                />
              </Box>
            </AcrylicCard>
          </Box>
        )
      })}
    </Box>
  )
}
