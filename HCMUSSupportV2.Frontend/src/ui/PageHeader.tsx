import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import { flyInSx } from './flyInSx'
import SectionLabel from './SectionLabel'

export interface PageHeaderProps {
  title: string
  /** Small uppercase line above the title (section / breadcrumb text). */
  eyebrow?: string
  subtitle?: ReactNode
  /** Right-aligned actions (buttons, filters). */
  actions?: ReactNode
  index?: number
}

/**
 * Page title block. On `lg` it keeps clear of the floating account avatar in the top-right corner.
 */
export default function PageHeader({ title, eyebrow, subtitle, actions, index = 0 }: PageHeaderProps) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={2}
      sx={[
        flyInSx(index, 'top'),
        { alignItems: { sm: 'center' }, justifyContent: 'space-between', pr: { lg: 8 }, minWidth: 0 },
      ]}
    >
      <Box sx={{ minWidth: 0 }}>
        {eyebrow && <SectionLabel sx={{ mb: 0.5 }}>{eyebrow}</SectionLabel>}
        <Typography variant="h5" component="h1" sx={{ overflowWrap: 'anywhere' }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {actions && <Box sx={{ flexShrink: 0 }}>{actions}</Box>}
    </Stack>
  )
}
