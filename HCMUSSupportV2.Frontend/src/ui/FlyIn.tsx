import Box from '@mui/material/Box'
import type { BoxProps } from '@mui/material/Box'
import { flyInSx } from './flyInSx'
import type { FlyInDirection } from './flyInSx'

export interface FlyInProps extends BoxProps {
  /** Position in reading order across the whole page; drives the 50 ms stagger. */
  index?: number
  from?: FlyInDirection
}

/** Wrapper that applies the shared fly-in entrance to anything that is not already a card. */
export default function FlyIn({ index = 0, from = 'bottom', sx, ...rest }: FlyInProps) {
  return <Box {...rest} sx={[flyInSx(index, from), ...(Array.isArray(sx) ? sx : [sx])]} />
}
