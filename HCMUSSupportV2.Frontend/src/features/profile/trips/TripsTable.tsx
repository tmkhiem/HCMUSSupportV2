import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { DASH, formatDate, joinParts } from '../../../lib/format'
import AcrylicCard from '../../../ui/AcrylicCard'
import SectionLabel from '../../../ui/SectionLabel'
import type { BusinessTripEntry } from '../educationApi'
import { tripPeriod } from '../educationFormat'

const COLUMNS = { md: 'minmax(0, 1.2fr) minmax(0, 1.3fr) minmax(0, 2fr) minmax(0, 1.5fr) minmax(0, 1.2fr)' }

function decision(t: BusinessTripEntry): string {
  return joinParts([t.decisionNo ? `QĐ ${t.decisionNo}` : null, t.decidedOn ? formatDate(t.decidedOn) : null]) || DASH
}

/** Business trips: aligned columns from `md` up, stacked rows below. */
export default function TripsTable({ rows }: { rows: BusinessTripEntry[] }) {
  return (
    <AcrylicCard index={4} sx={{ p: { xs: 1, sm: 2 } }}>
      <Box aria-hidden sx={{ display: { xs: 'none', md: 'grid' }, gridTemplateColumns: COLUMNS, gap: 2, px: 2, pb: 1 }}>
        <SectionLabel>Nơi đến</SectionLabel>
        <SectionLabel>Thời gian</SectionLabel>
        <SectionLabel>Mục đích</SectionLabel>
        <SectionLabel>Quyết định</SectionLabel>
        <SectionLabel>Ghi chú</SectionLabel>
      </Box>
      <Box component="ul" data-testid="trip-table" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {rows.map((t) => (
          <Box
            component="li"
            key={t.id}
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', ...COLUMNS },
              gap: { xs: 0.5, md: 2 },
              px: 2,
              py: 1.5,
              borderTop: 1,
              borderColor: 'divider',
              minWidth: 0,
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
              {t.place ?? DASH}
            </Typography>
            <Box>
              <Typography variant="body2">{tripPeriod(t)}</Typography>
              {t.days != null && (
                <Typography variant="caption" color="text.secondary">
                  {t.days} ngày
                </Typography>
              )}
            </Box>
            <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
              {t.purpose ?? DASH}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
              {decision(t)}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
              {t.note ?? DASH}
            </Typography>
          </Box>
        ))}
      </Box>
    </AcrylicCard>
  )
}
