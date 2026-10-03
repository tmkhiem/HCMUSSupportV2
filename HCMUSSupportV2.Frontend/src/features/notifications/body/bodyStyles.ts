import type { SxProps, Theme } from '@mui/material/styles'

export type StyleObject = Exclude<SxProps<Theme>, ReadonlyArray<unknown> | ((...args: never[]) => unknown)>

/** Typography of a rendered notification body (`NotificationBody`). The editor content area reuses it so the two look alike. */
export function bodyStyles(theme: Theme): StyleObject {
  return {
    color: 'text.primary',
    fontSize: theme.typography.body1.fontSize,
    lineHeight: 1.7,
    overflowWrap: 'anywhere',
    // Block spacing comes from siblings only (no :first-child, which Emotion flags as SSR-unsafe): reset, then space.
    '& :where(p, ul, ol, blockquote, pre, hr, h1, h2, h3, h4, h5, h6, table, .MuiTableContainer-root)': { m: 0 },
    '& > * + *': { mt: 1.25 },
    '& > * + :is(h1, h2, h3, h4, h5, h6)': { mt: 2.5 },
    '& > :is(h1, h2, h3, h4, h5, h6) + *': { mt: 1 },
    '& > hr, & > * + hr': { my: 2.5 },
    '& li > ul, & li > ol': { mt: 0.5 },
    '& :is(h1, h2, h3, h4, h5, h6)': {
      lineHeight: 1.3,
      fontWeight: 700,
      letterSpacing: '-0.01em',
      color: 'text.primary',
    },
    '& h2': { fontSize: '1.5rem' },
    '& h3': { fontSize: '1.3rem' },
    '& h4': { fontSize: '1.15rem' },
    '& h5, & h6': { fontSize: '1.0625rem' },
    '& ul, & ol': { pl: 3.5 },
    '& li + li': { mt: 0.5 },
    '& li > p': { m: 0 },
    '& blockquote': {
      mx: 0,
      py: 0.75,
      color: 'text.secondary',
      backgroundColor: 'rgba(48, 63, 159, 0.07)',
      borderRadius: 2,
      px: 2,
    },
    '& hr': { border: 0, height: 3, borderRadius: 999, backgroundColor: theme.palette.divider },
    '& code': {
      px: 0.5,
      py: 0.125,
      fontSize: '0.875em',
      fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
      backgroundColor: 'rgba(38, 50, 56, 0.06)',
      borderRadius: '8px',
    },
    '& pre': { overflowX: 'auto', p: 1.5, backgroundColor: 'rgba(38, 50, 56, 0.06)', borderRadius: 1 },
    '& pre code': { p: 0, backgroundColor: 'transparent' },
    '& img': { display: 'block', maxWidth: '100%', height: 'auto', borderRadius: 1 },
    '& del': { color: 'text.secondary' },
    '& .MuiTableCell-root': { fontSize: '0.9375rem' },
    '& .MuiTableCell-body': { verticalAlign: 'top' },
  }
}

export const bodySx: SxProps<Theme> = (theme) => bodyStyles(theme)
