import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import AcrylicCard from '../../../ui/AcrylicCard'
import type { DegreeEntry } from '../educationApi'
import { degreePlace, degreeYears } from '../educationFormat'
import PngIcon from '../../../ui/PngIcon'

/** Diploma-style cards, one per degree; the caller passes them already sorted newest first. */
export default function DegreeCards({ items }: { items: DegreeEntry[] }) {
  return (
    <Box
      component="ul"
      data-testid="degree-cards"
      sx={{
        listStyle: 'none',
        m: 0,
        p: 0,
        display: 'grid',
        gap: 2,
        gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
      }}
    >
      {items.map((d, i) => (
        <Box component="li" key={d.id} sx={{ minWidth: 0, display: 'flex' }}>
          <AcrylicCard
            component="article"
            index={1 + Math.min(i, 10)}
            sx={{
              p: 2.5,
              width: '100%',
              minWidth: 0,
              overflow: 'hidden',
            }}
          >
            <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
              <Box
                sx={{
                  flexShrink: 0,
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  bgcolor: (t) => alpha(t.palette.primary.main, 0.12),
                  color: 'primary.main',
                }}
              >
                <PngIcon name="school" size={28} />
              </Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="h6" component="h2" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
                  {d.degreeType ?? 'Văn bằng'}
                </Typography>
                {d.major && (
                  <Typography variant="subtitle1" sx={{ overflowWrap: 'anywhere' }}>
                    {d.major}
                  </Typography>
                )}
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>
                  {degreePlace(d)}
                </Typography>
                <Stack direction="row" sx={{ mt: 1.5, flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {degreeYears(d)}
                  </Typography>
                  {d.trainingForm && <Chip size="small" variant="outlined" label={d.trainingForm} />}
                </Stack>
                {d.thesisTitle && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 1.5, fontStyle: 'italic', overflowWrap: 'anywhere' }}
                  >
                    Luận văn/luận án: {d.thesisTitle}
                  </Typography>
                )}
              </Box>
            </Stack>
          </AcrylicCard>
        </Box>
      ))}
    </Box>
  )
}
