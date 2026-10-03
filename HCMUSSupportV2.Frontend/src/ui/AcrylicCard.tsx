import Paper from '@mui/material/Paper'
import type { PaperProps } from '@mui/material/Paper'
import { alpha } from '@mui/material/styles'
import type { KeyboardEvent } from 'react'
import { flyInSx } from './flyInSx'

export interface AcrylicCardProps extends Omit<PaperProps, 'variant'> {
  /** Hover lift + pointer cursor. Implied when `onClick` is given. */
  interactive?: boolean
  /** Solid primary tint instead of the translucent surface (profile hero, current items). */
  accent?: boolean
  /** Fly-in position in reading order. Omit for no entrance animation. */
  index?: number
}

/**
 * The translucent blurred surface (`Paper variant="acrylic"`) with optional fly-in, accent border and click handling.
 * Category-agnostic: it knows nothing about what it contains.
 */
export default function AcrylicCard({
  interactive,
  accent,
  index,
  onClick,
  onKeyDown,
  sx,
  ...rest
}: AcrylicCardProps) {
  const clickable = Boolean(onClick)
  const lifts = interactive ?? clickable

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e)
    if (clickable && !e.defaultPrevented && e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      e.currentTarget.click()
    }
  }

  return (
    <Paper
      variant="acrylic"
      data-interactive={lifts ? 'true' : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={clickable ? handleKeyDown : onKeyDown}
      {...rest}
      sx={[
        index !== undefined && flyInSx(index),
        accent && { bgcolor: (t) => alpha(t.palette.primary.main, 0.1) },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  )
}
