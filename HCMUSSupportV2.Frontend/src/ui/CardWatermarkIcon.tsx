import Box from '@mui/material/Box'
import { alpha } from '@mui/material/styles'
import type { Theme } from '@mui/material/styles'
import { cloneElement, isValidElement } from 'react'
import type { ReactNode } from 'react'
import PngIcon from './PngIcon'
import type { PngIconProps } from './PngIcon'

/**
 * Oversized, faded copy of an icon clipped into a card's bottom-right corner. Decorative only: the host needs
 * `position: relative` and `overflow: hidden`.
 */
export default function CardWatermarkIcon({ icon }: { icon: ReactNode }) {
  if (!isValidElement(icon)) return null
  return (
    <Box
      aria-hidden
      sx={{ position: 'absolute', right: -16, bottom: -16, lineHeight: 0, pointerEvents: 'none', zIndex: 0 }}
    >
      {icon.type === PngIcon ? (
        <PngIcon {...(icon.props as PngIconProps)} size={96} sx={{ opacity: 0.12, filter: 'grayscale(1)' }} />
      ) : (
        cloneElement(icon, {
          color: undefined,
          fontSize: undefined,
          sx: { fontSize: 96, color: (t: Theme) => alpha(t.palette.grey[500], 0.25) },
        } as Record<string, unknown>)
      )}
    </Box>
  )
}
