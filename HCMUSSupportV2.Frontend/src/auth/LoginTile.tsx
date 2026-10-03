import ArrowOutward from '@mui/icons-material/ArrowOutward'
import ButtonBase from '@mui/material/ButtonBase'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import type { ReactNode } from 'react'
import { flyInSx } from '../ui/flyInSx'

export interface LoginTileProps {
  title: string
  icon: ReactNode
  onClick?: () => void
  disabled?: boolean
  index?: number
}

/** Provider tile: 64 px tall pill, solid primary tint (deeper on hover); greyed out when disabled. */
export default function LoginTile({ title, icon, onClick, disabled, index = 0 }: LoginTileProps) {
  return (
    <ButtonBase
      disabled={disabled}
      onClick={onClick}
      aria-label={title}
      sx={[
        flyInSx(index),
        (t) => ({
          width: '100%',
          height: 64,
          px: { xs: 2, sm: 3 },
          gap: { xs: 1.5, sm: 2 },
          justifyContent: 'flex-start',
          textAlign: 'left',
          borderRadius: 999,
          bgcolor: disabled ? 'grey.200' : alpha(t.palette.primary.main, 0.08),
          boxShadow: t.custom.shadow.blocky,
          transition: `background-color ${t.custom.motion.flyInMs}ms, transform ${t.custom.motion.flyInMs}ms ${t.custom.motion.ease}`,
          '&:hover': { bgcolor: alpha(t.palette.primary.main, 0.16) },
          '&:active': { transform: 'scale(0.98)' },
          '&.Mui-disabled': { opacity: 0.6, filter: 'grayscale(1)' },
          '& .tile-arrow': { transform: 'translate(-4px, 4px)', transition: `transform ${t.custom.motion.flyInMs}ms ${t.custom.motion.ease}` },
          '&:hover .tile-arrow': { transform: 'translate(0, 0)' },
        }),
      ]}
    >
      {icon}
      <Typography component="span" sx={{ flex: 1, fontWeight: 700, fontSize: '0.9375rem', color: disabled ? 'text.secondary' : 'text.primary' }}>
        {title}
      </Typography>
      <ArrowOutward className="tile-arrow" sx={{ color: disabled ? 'text.secondary' : 'text.primary', opacity: disabled ? 0.4 : 1 }} />
    </ButtonBase>
  )
}
