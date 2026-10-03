import Box from '@mui/material/Box'
import type { BoxProps } from '@mui/material/Box'

/** Names of the PNGs under `public/icons/<size>/`. */
export type PngIconName =
  | 'airplane-departure'
  | 'bell'
  | 'book-open'
  | 'briefcase'
  | 'clock'
  | 'cup'
  | 'document'
  | 'document-alt'
  | 'graduation-hat'
  | 'light-bulb'
  | 'money'
  | 'money-bag'
  | 'money-salary'
  | 'person'
  | 'person-alt'
  | 'profile-card'
  | 'profile-card-alt'
  | 'search'
  | 'test-tube'

const SIZES = [24, 32, 48, 64, 96] as const

/** Smallest shipped size that is at least `px` (the largest when `px` is bigger than all of them). */
function sizeFor(px: number): number {
  return SIZES.find((s) => s >= px) ?? SIZES[SIZES.length - 1]
}

const url = (name: PngIconName, px: number) => `${import.meta.env.BASE_URL}icons/${sizeFor(px)}/${name}.png`

export interface PngIconProps extends Omit<BoxProps<'img'>, 'component' | 'src' | 'srcSet' | 'children'> {
  name: PngIconName
  /** CSS pixel size (width and height). The 1x and 2x sources are picked from the shipped sizes. */
  size?: number
}

/**
 * A bitmap icon from `public/icons`. Decorative by default (`alt=""`); pass `alt` when it carries meaning.
 * `1x`/`2x` sources keep it sharp on high-density screens without shipping more than needed.
 */
export default function PngIcon({ name, size = 24, alt = '', sx, ...rest }: PngIconProps) {
  return (
    <Box
      component="img"
      src={url(name, size)}
      srcSet={`${url(name, size)} 1x, ${url(name, size * 2)} 2x`}
      alt={alt}
      width={size}
      height={size}
      draggable={false}
      {...rest}
      sx={[{ display: 'block', flexShrink: 0, width: size, height: size, objectFit: 'contain' }, ...(Array.isArray(sx) ? sx : [sx])]}
    />
  )
}
