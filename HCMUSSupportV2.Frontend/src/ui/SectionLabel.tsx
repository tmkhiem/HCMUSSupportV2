import Typography from '@mui/material/Typography'
import type { TypographyProps } from '@mui/material/Typography'

/** The 11 px, weight-900, uppercase, wide-tracked label used above fields, inside stat cards and in the nav. */
export default function SectionLabel({ sx, ...rest }: Omit<TypographyProps, 'variant'>) {
  return (
    <Typography
      component="div"
      {...rest}
      variant="sectionLabel"
      sx={[{ color: 'text.secondary' }, ...(Array.isArray(sx) ? sx : [sx])]}
    />
  )
}
