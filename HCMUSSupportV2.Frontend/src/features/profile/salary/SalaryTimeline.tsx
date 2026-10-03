import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import { DASH, formatDate, joinParts } from '../../../lib/format'
import AcrylicCard from '../../../ui/AcrylicCard'
import SectionLabel from '../../../ui/SectionLabel'
import type { SalaryEntry } from '../careerApi'
import { salaryStepLabel } from '../careerFormat'

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

/** Vertical timeline of salary decisions, newest first (the API order). */
export default function SalaryTimeline({ history, index }: { history: SalaryEntry[]; index: number }) {
  return (
    <Box component="section" aria-label="Các quyết định lương">
      <SectionLabel sx={{ mb: 1.5 }}>Quyết định lương</SectionLabel>
      <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }} data-testid="salary-timeline">
        {history.map((entry, i) => {
          const first = i === 0
          const last = i === history.length - 1
          return (
            <Box
              component="li"
              key={entry.id}
              sx={{ display: 'flex', gap: { xs: 1.5, sm: 2.5 }, position: 'relative', pb: last ? 0 : 2 }}
            >
              <Box sx={{ position: 'relative', width: 16, flexShrink: 0 }} aria-hidden>
                {!last && (
                  <Box
                    sx={{
                      position: 'absolute',
                      left: 7,
                      top: 22,
                      bottom: -16,
                      width: 2,
                      bgcolor: (t) => alpha(t.palette.primary.main, 0.25),
                    }}
                  />
                )}
                <Box
                  sx={{
                    position: 'absolute',
                    top: 20,
                    left: 0,
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    bgcolor: first ? 'primary.main' : (t) => alpha(t.palette.primary.main, 0.45),
                  }}
                />
              </Box>
              <AcrylicCard index={index + Math.min(i, 8)} accent={first} sx={{ flex: 1, minWidth: 0, p: 2 }}>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={0.5}
                  sx={{ justifyContent: 'space-between', mb: 1.5 }}
                >
                  <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 700 }}>
                    {salaryStepLabel(entry)}
                    {entry.overGradePct != null && entry.overGradePct > 0 && ` · vượt khung ${entry.overGradePct}%`}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Hưởng từ {formatDate(entry.effectiveFrom)}
                  </Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  {entry.gradeName ?? DASH}
                </Typography>
                <Box
                  sx={{
                    display: 'grid',
                    gap: 2,
                    gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
                  }}
                >
                  <Fact label="Số quyết định" value={entry.decisionNo ?? DASH} />
                  <Fact label="Ngày ký" value={formatDate(entry.signedOn)} />
                  <Fact label="Ngày hưởng" value={formatDate(entry.effectiveFrom)} />
                  <Fact label="Nâng lương kế tiếp" value={formatDate(entry.nextRaiseOn)} />
                </Box>
                {entry.note && (
                  <Typography variant="body2" sx={{ mt: 1.5, fontStyle: 'italic' }} color="text.secondary">
                    {joinParts(['Ghi chú', entry.note], ': ')}
                  </Typography>
                )}
              </AcrylicCard>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
