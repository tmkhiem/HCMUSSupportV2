import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { BoxProps } from '@mui/material/Box'
import type { ReactNode } from 'react'

export interface StickyGroupProps extends Omit<BoxProps, 'title'> {
  title: string
  /** One-line caption next to the title, e.g. "3 khóa". */
  summary?: string
  children: ReactNode
}

/**
 * A group of rows under a divider that docks at the top of the scroll container and is pushed off by the next group's divider.
 * Plain `position: sticky` on a block heading inside its own `<section>`: the browser does the push-off, so it does not flicker.
 * (The style guide's `useStickyGroupPush` exists because sticky does not work on table cells; these groups are not table rows.)
 */
export default function StickyGroup({ title, summary, children, ...rest }: StickyGroupProps) {
  return (
    <Box component="section" aria-label={title} {...rest}>
      <Stack
        direction="row"
        spacing={2}
        data-sticky-divider
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          alignItems: 'baseline',
          px: 2,
          py: 1.25,
          bgcolor: 'grey.100',
          borderRadius: 1,
          boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
        }}
      >
        <Typography variant="body2" component="h2" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        {summary && (
          <Typography variant="caption" color="text.secondary">
            {summary}
          </Typography>
        )}
      </Stack>
      {children}
    </Box>
  )
}
