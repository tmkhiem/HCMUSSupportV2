import ArrowOutwardOutlined from '@mui/icons-material/ArrowOutwardOutlined'
import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import AcrylicCard from '../../../ui/AcrylicCard'
import SectionLabel from '../../../ui/SectionLabel'

/**
 * The shared shell of an overview card: icon + section label, a body the card fills in by hand, and a "Chi tiết"
 * link to its page. It is a frame, not a renderer: each card decides its own content.
 */
export default function SummaryCardFrame({
  title,
  icon,
  to,
  index,
  children,
}: {
  title: string
  icon: ReactNode
  to: string
  index: number
  children: ReactNode
}) {
  return (
    <AcrylicCard
      index={index}
      role="region"
      aria-label={title}
      sx={{ p: 3, display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}
    >
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', pb: 1, mb: 1.5 }}>
        {icon}
        <SectionLabel component="h2" sx={{ color: 'text.primary' }}>
          {title}
        </SectionLabel>
      </Stack>
      <Box sx={{ flex: 1, minWidth: 0, mb: 2 }}>{children}</Box>
      <Link
        component={RouterLink}
        to={to}
        underline="hover"
        aria-label={`Chi tiết ${title}`}
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontWeight: 700, fontSize: 14, alignSelf: 'flex-start' }}
      >
        Chi tiết
        <ArrowOutwardOutlined sx={{ fontSize: 15 }} />
      </Link>
    </AcrylicCard>
  )
}

/** A small label / value pair for card bodies. */
export function CardFact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.75, borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 700, textAlign: 'right', overflowWrap: 'anywhere' }}>
        {value}
      </Typography>
    </Box>
  )
}

/** A big figure with a caption underneath (counts, grade). */
export function CardFigure({ value, caption }: { value: ReactNode; caption?: ReactNode }) {
  return (
    <Box>
      <Typography variant="h4" component="div" sx={{ lineHeight: 1.15 }}>
        {value}
      </Typography>
      {caption && (
        <Typography variant="body2" color="text.secondary" component="div">
          {caption}
        </Typography>
      )}
    </Box>
  )
}

export function CardEmpty({ children = 'Chưa có dữ liệu.' }: { children?: ReactNode }) {
  return (
    <Typography variant="body2" color="text.secondary">
      {children}
    </Typography>
  )
}
