import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import { useCurrentUser } from '../../../auth/authContext'
import { joinParts } from '../../../lib/format'
import AcrylicCard from '../../../ui/AcrylicCard'
import type { ProfileHero } from '../api'
import PngIcon from '../../../ui/PngIcon'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? '?').slice(0, 2)).toUpperCase()
}

function ContactLine({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 0, color: 'text.primary', opacity: 0.8 }}>
      {icon}
      <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
        {children}
      </Typography>
    </Stack>
  )
}

/** Hero of `/ho-so`: photo, name (the page's h1), MSCB pill, "position — unit", email and phone. */
export default function HeroCard({ hero }: { hero: ProfileHero }) {
  const me = useCurrentUser()
  // While an admin views as someone else, `me.photoUrl` is the admin's: never show it for the viewed person.
  const photo = hero.photoUrl ?? (!me.actingAs && me.code === hero.code ? me.photoUrl : null)
  const subtitle = hero.positionTitle || hero.unit ? joinParts([hero.positionTitle, hero.unit], ' — ') : null

  return (
    <AcrylicCard
      accent
      index={0}
      sx={{
        p: { xs: 3, md: 5 },
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        alignItems: 'center',
        gap: { xs: 3, md: 5 },
        textAlign: { xs: 'center', md: 'left' },
      }}
    >
      <Avatar
        src={photo ?? undefined}
        alt={`Ảnh ${hero.fullName}`}
        slotProps={{ img: { referrerPolicy: 'no-referrer' } }}
        sx={{
          width: { xs: 112, md: 144 },
          height: { xs: 112, md: 144 },
          borderRadius: 4,
          bgcolor: 'primary.main',
          fontSize: { xs: 36, md: 48 },
          fontWeight: 800,
          flexShrink: 0,
        }}
      >
        {initials(hero.fullName)}
      </Avatar>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={1.5}
          sx={{ alignItems: { xs: 'center', md: 'baseline' }, justifyContent: { xs: 'center', md: 'flex-start' }, mb: 0.5 }}
        >
          <Typography variant="h4" component="h1" sx={{ fontWeight: 900, letterSpacing: '-0.03em', overflowWrap: 'anywhere', fontSize: { xs: '1.875rem', md: '2.125rem' } }}>
            {hero.fullName}
          </Typography>
          <Chip variant="tag" label={hero.code} size="small" />
        </Stack>
        <Typography variant="h6" component="p" color="text.secondary" sx={{ fontWeight: 700, mb: 3, fontSize: { xs: '1rem', md: '1.25rem' } }}>
          {subtitle ?? '—'}
        </Typography>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={{ xs: 1.5, md: 5 }}
          useFlexGap
          sx={{ flexWrap: 'wrap', alignItems: { xs: 'center', md: 'center' }, justifyContent: { xs: 'center', md: 'flex-start' } }}
        >
          <ContactLine icon={<PngIcon name="mail" size={20} />}>{hero.email ?? '—'}</ContactLine>
          <ContactLine icon={<PngIcon name="phone" size={20} />}>{hero.phone ?? '—'}</ContactLine>
        </Stack>
      </Box>
    </AcrylicCard>
  )
}
