import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import type { ReactNode } from 'react'
import AcrylicCard from './AcrylicCard'
import CardWatermarkIcon from './CardWatermarkIcon'
import EmptyDash from './EmptyDash'
import SectionLabel from './SectionLabel'
import { isBlank } from '../lib/format'

export interface StatCardProps {
  /** A MUI icon element with a semantic `color` (`<SchoolOutlined color="primary" />`). */
  icon: ReactNode
  label: string
  /** Missing (null, undefined, empty) renders `—`. */
  value?: ReactNode | null
  hint?: string
  onClick?: () => void
  /** Warm tint for the one figure that needs attention. */
  emphasis?: boolean
  /** Fly-in position in reading order. */
  index?: number
}

/** Signature stat card: icon + label, big bold value, optional hint, and a faded watermark of the icon. */
export default function StatCard({ icon, label, value, hint, onClick, emphasis, index = 0 }: StatCardProps) {
  const missing = value === null || value === undefined || isBlank(value)
  return (
    <AcrylicCard
      index={index}
      onClick={onClick}
      sx={{
        overflow: 'hidden',
        p: 2.5,
        height: '100%',
        ...(emphasis && {
          bgcolor: (t) => alpha(t.palette.warning.main, 0.14),
          borderColor: (t) => alpha(t.palette.warning.main, 0.4),
        }),
      }}
    >
      <CardWatermarkIcon icon={icon} />
      <Box sx={{ position: 'relative', zIndex: 1 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1, minWidth: 0 }}>
          {icon}
          <SectionLabel noWrap>{label}</SectionLabel>
        </Stack>
        <Typography variant="h4" component="div" sx={{ color: emphasis ? 'warning.dark' : undefined }}>
          {missing ? <EmptyDash /> : value}
        </Typography>
        {hint && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {hint}
          </Typography>
        )}
      </Box>
    </AcrylicCard>
  )
}
