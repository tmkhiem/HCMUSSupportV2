import EmojiEventsOutlined from '@mui/icons-material/EmojiEventsOutlined'
import MilitaryTechOutlined from '@mui/icons-material/MilitaryTechOutlined'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import AcrylicCard from '../../../ui/AcrylicCard'
import SectionLabel from '../../../ui/SectionLabel'
import type { CommendationGroup } from '../careerApi'
import { academicYearLabel, formatCommendationDate } from '../careerFormat'

export type CommendationKind = 'award' | 'title'

/** Cards grouped by năm học for one tab. `award` uses the trophy icon, `title` the medal. */
export default function CommendationGroups({
  groups,
  kind,
  index,
}: {
  groups: CommendationGroup[]
  kind: CommendationKind
  index: number
}) {
  const Icon = kind === 'award' ? EmojiEventsOutlined : MilitaryTechOutlined
  let n = 0
  return (
    <Stack spacing={3} data-testid={`commendation-groups-${kind}`}>
      {groups.map((group) => (
        <Box component="section" key={group.academicYear ?? 'none'} aria-label={academicYearLabel(group.academicYear)}>
          <SectionLabel sx={{ mb: 1.5 }}>{academicYearLabel(group.academicYear)}</SectionLabel>
          <Box
            sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', xl: 'repeat(3, 1fr)' } }}
          >
            {group.items.map((item) => (
              <AcrylicCard
                key={item.id}
                index={index + Math.min(n++, 10)}
                sx={{ p: 2, display: 'flex', gap: 2, alignItems: 'flex-start', minWidth: 0 }}
              >
                <Box
                  sx={{
                    flexShrink: 0,
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    display: 'grid',
                    placeItems: 'center',
                    bgcolor: (t) => alpha(t.palette.warning.main, 0.16),
                    color: 'warning.dark',
                  }}
                >
                  <Icon />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
                    {item.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {item.decisionNo ? `QĐ ${item.decisionNo}` : 'Chưa có số quyết định'}
                    {' · '}
                    {formatCommendationDate(item.decidedOn)}
                  </Typography>
                </Box>
              </AcrylicCard>
            ))}
          </Box>
        </Box>
      ))}
    </Stack>
  )
}
