import { keyframes } from '@mui/material/styles'

const fromBottom = keyframes`
  from { opacity: 0; transform: translate3d(0, 10rem, 0); }
  to   { opacity: 1; transform: translate3d(0, 0, 0); }
`
const fromTop = keyframes`
  from { opacity: 0; transform: translate3d(0, -10rem, 0); }
  to   { opacity: 1; transform: translate3d(0, 0, 0); }
`

export type FlyInDirection = 'bottom' | 'top'

const DURATION_MS = 300
const STAGGER_MS = 50
const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'

/** `animation` shorthand, for chaining a second effect after the landing (see `flyInEndMs`). */
export const flyInAnimation = (index = 0, from: FlyInDirection = 'bottom') =>
  `${from === 'top' ? fromTop : fromBottom} ${DURATION_MS}ms ${EASE} ${index * STAGGER_MS}ms backwards`

/** When the stagger for `index` has landed. */
export const flyInEndMs = (index = 0) => index * STAGGER_MS + DURATION_MS

/**
 * Cards fly up and fade in, staggered by reading position: 300 ms, `cubic-bezier(.16,1,.3,1)`, 50 ms x index.
 * Fill mode is `backwards` (never `both`/`forwards`) and there is no `will-change`, so nothing keeps a transform
 * after landing. Disabled under `prefers-reduced-motion`.
 */
export const flyInSx = (index = 0, from: FlyInDirection = 'bottom') => ({
  animation: flyInAnimation(index, from),
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
})
