import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import AcrylicCard from '../../ui/AcrylicCard'
import EmptyDash from '../../ui/EmptyDash'
import SectionLabel from '../../ui/SectionLabel'
import { isBlank } from '../../lib/format'

/**
 * Layout pieces shared by the Thông tin chung and Thông tin chi tiết pages (and the overview cards). They hold no
 * knowledge of any field: each page lists its rows by hand.
 */

/** A titled acrylic card; children are `FieldRow`s (or sub-blocks). */
export function SectionCard({ title, index, children }: { title: string; index: number; children: ReactNode }) {
  return (
    <AcrylicCard index={index} role="region" aria-label={title} sx={{ p: { xs: 2, sm: 3 }, minWidth: 0 }}>
      <SectionLabel sx={{ pb: 1, mb: 0.5, color: 'text.primary' }}>{title}</SectionLabel>
      {children}
    </AcrylicCard>
  )
}

/** One label / value row. A blank string value renders `—`; pass a node to render custom content (copy button, mask). */
export function FieldRow({ label, value, action }: { label: string; value?: ReactNode; action?: ReactNode }) {
  const missing = value === null || value === undefined || isBlank(value)
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'minmax(120px, 200px) 1fr' },
        columnGap: 2,
        rowGap: 0.25,
        py: 1.25,
        alignItems: 'center',
        borderBottom: 1,
        borderColor: 'divider',
        '&:last-of-type': { borderBottom: 0 },
      }}
    >
      <Typography variant="body2" color="text.secondary" component="dt">
        {label}
      </Typography>
      <Box component="dd" sx={{ m: 0, display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
        <Typography variant="body2" component="div" sx={{ fontWeight: 600, overflowWrap: 'anywhere', minWidth: 0 }}>
          {missing ? <EmptyDash /> : value}
        </Typography>
        {action}
      </Box>
    </Box>
  )
}

/** `<dl>` wrapper so the rows are real term/definition pairs. */
export function FieldList({ children }: { children: ReactNode }) {
  return (
    <Box component="dl" sx={{ m: 0 }}>
      {children}
    </Box>
  )
}

/** "← Hồ sơ cá nhân" back link used as the page header action. */
export function BackToProfile() {
  return (
    <Button component={RouterLink} to="/profile" startIcon={<ArrowBackOutlined />} size="small">
      Hồ sơ cá nhân
    </Button>
  )
}
