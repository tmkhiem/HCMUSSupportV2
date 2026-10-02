import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { DASH } from '../../../lib/format'
import AcrylicCard from '../../../ui/AcrylicCard'
import SectionLabel from '../../../ui/SectionLabel'
import StickyGroup from '../../../ui/StickyGroup'
import type { TrainingEntry } from '../educationApi'
import type { YearGroup } from '../educationFormat'
import { trainingPeriod, yearLabel } from '../educationFormat'

const COLUMNS = { md: 'minmax(0, 2.6fr) minmax(0, 1.6fr) minmax(0, 1fr) minmax(0, 1.3fr)' }

/** Training rows grouped by year under sticky dividers: aligned columns from `md` up, stacked rows below. */
export default function TrainingTable({ groups }: { groups: YearGroup<TrainingEntry>[] }) {
  return (
    <AcrylicCard index={1} sx={{ p: { xs: 1, sm: 2 } }}>
      <Box
        aria-hidden
        sx={{ display: { xs: 'none', md: 'grid' }, gridTemplateColumns: COLUMNS, gap: 2, px: 2, pb: 1 }}
      >
        <SectionLabel>Nội dung</SectionLabel>
        <SectionLabel>Nơi bồi dưỡng</SectionLabel>
        <SectionLabel>Hình thức</SectionLabel>
        <SectionLabel>Thời gian</SectionLabel>
      </Box>
      <Stack spacing={2} data-testid="training-groups">
        {groups.map((g) => (
          <StickyGroup key={g.year ?? 'none'} title={yearLabel(g.year)} summary={`${g.items.length} khóa`}>
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {g.items.map((t) => (
                <Box
                  component="li"
                  key={t.id}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', ...COLUMNS },
                    gap: { xs: 0.5, md: 2 },
                    px: 2,
                    py: 1.5,
                    borderBottom: 1,
                    borderColor: 'divider',
                    '&:last-child': { borderBottom: 0 },
                    minWidth: 0,
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
                    {t.content}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                    {t.place ?? DASH}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t.trainingForm ?? DASH}
                  </Typography>
                  <Typography variant="body2">{trainingPeriod(t)}</Typography>
                </Box>
              ))}
            </Box>
          </StickyGroup>
        ))}
      </Stack>
    </AcrylicCard>
  )
}
