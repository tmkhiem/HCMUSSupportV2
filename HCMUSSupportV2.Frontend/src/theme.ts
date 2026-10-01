/**
 * MUI v9 theme: the look of the PromptingFEBuild (PLAN §7.1) expressed as palette, shape, typography,
 * component overrides and a few custom variants (Paper `acrylic`, Chip `tag`, Typography `sectionLabel`).
 *
 * Pages should reach for the variants (`<Paper variant="acrylic">`, the `src/ui` primitives) instead of
 * ad-hoc `sx`. Raw numbers live in `theme.custom` so shell code and pages share one source.
 */
import { alpha, createTheme, keyframes } from '@mui/material/styles'
import type { CSSProperties } from '@mui/material/styles'

export const PRIMARY = '#303F9F'
const SECONDARY = '#ECEFF1'
const TEXT_PRIMARY = '#263238'
const TEXT_SECONDARY = '#546E7A'
const BACKGROUND = '#F5F7F9'
const GREY_100 = '#F5F5F5'

const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)'

/** Blocky shadow and its hover state (PLAN §7.1). */
const BLOCKY_SHADOW = '0 4px 12px -2px rgba(0,0,0,.08), 0 2px 6px -1px rgba(0,0,0,.04)'
const BLOCKY_SHADOW_HOVER = '0 6px 16px -4px rgba(79,195,247,.15), 0 4px 6px -4px rgba(79,195,247,.1)'

const ACRYLIC_BLUR = 'blur(8px) saturate(125%)'
const ACRYLIC_BG = alpha('#fff', 0.4)
const ACRYLIC_DARK_BG = alpha(TEXT_PRIMARY, 0.5)

export interface CustomTokens {
  acrylic: { background: string; darkBackground: string; backdropFilter: string; border: string }
  shadow: { blocky: string; blockyHover: string }
  motion: { ease: string; flyInMs: number; staggerMs: number; dialogMs: number; flyInDistance: string }
  layout: { sidebarWidth: number; navRowHeight: number; topBarHeight: number; avatarSize: number }
  sidebar: { gradient: string; glow: string; sunkenBackground: string; sunkenShadow: string }
}

declare module '@mui/material/styles' {
  interface Theme {
    custom: CustomTokens
  }
  interface ThemeOptions {
    custom?: CustomTokens
  }
  interface TypographyVariants {
    sectionLabel: CSSProperties
  }
  interface TypographyVariantsOptions {
    sectionLabel?: CSSProperties
  }
}

declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    sectionLabel: true
  }
}

declare module '@mui/material/Paper' {
  interface PaperPropsVariantOverrides {
    /** Translucent blurred surface with the blocky shadow. Add `data-interactive="true"` for the hover lift. */
    acrylic: true
    /** Dark translucent surface (mobile scrims, overlays). */
    acrylicDark: true
  }
}

declare module '@mui/material/Chip' {
  interface ChipPropsVariantOverrides {
    /** Small uppercase primary-tinted pill used for tags. */
    tag: true
  }
}

const custom: CustomTokens = {
  acrylic: {
    background: ACRYLIC_BG,
    darkBackground: ACRYLIC_DARK_BG,
    backdropFilter: ACRYLIC_BLUR,
    border: `1px solid ${GREY_100}`,
  },
  shadow: { blocky: BLOCKY_SHADOW, blockyHover: BLOCKY_SHADOW_HOVER },
  motion: { ease: EASE_OUT, flyInMs: 300, staggerMs: 50, dialogMs: 250, flyInDistance: '10rem' },
  layout: { sidebarWidth: 288, navRowHeight: 64, topBarHeight: 64, avatarSize: 44 },
  sidebar: {
    gradient: 'radial-gradient(circle at top right, #fafcfc, #E3F2FD)',
    glow: '0 0 12px rgba(255,255,255,.9), 0 0 4px rgba(255,255,255,.4)',
    sunkenBackground: '#F0F2F5',
    sunkenShadow: 'inset 2px 2px 4px rgba(0,0,0,.05)',
  },
}

const dialogZoomIn = keyframes`
  from { opacity: 0; transform: scale(.98); }
  to   { opacity: 1; transform: scale(1); }
`

const sectionLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 900,
  lineHeight: 1.45,
  textTransform: 'uppercase',
  letterSpacing: '0.15em',
}

export const theme = createTheme({
  custom,
  palette: {
    mode: 'light',
    primary: { main: PRIMARY },
    secondary: { main: SECONDARY, contrastText: TEXT_PRIMARY },
    text: { primary: TEXT_PRIMARY, secondary: TEXT_SECONDARY },
    background: { default: BACKGROUND, paper: '#fff' },
  },
  shape: { borderRadius: 5 },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    fontWeightLight: 300,
    fontWeightRegular: 400,
    fontWeightMedium: 500,
    fontWeightBold: 700,
    h1: { fontWeight: 700 },
    h2: { fontWeight: 700 },
    h3: { fontWeight: 700 },
    h4: { fontWeight: 700 },
    h5: { fontWeight: 700, letterSpacing: '-0.01em' },
    h6: { fontWeight: 700 },
    subtitle1: { fontWeight: 600 },
    subtitle2: { fontWeight: 700 },
    body1: { fontSize: '0.925rem' },
    body2: { fontSize: '0.85rem' },
    caption: { fontSize: '0.75rem' },
    button: { fontWeight: 700, textTransform: 'none', letterSpacing: 0 },
    overline: sectionLabel,
    sectionLabel,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: (t) => ({
        'html, body, #root': { height: '100%' },
        body: {
          backgroundColor: t.palette.background.default,
          color: t.palette.text.primary,
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
        },
        '*:focus-visible': { outline: `2px solid ${alpha(PRIMARY, 0.6)}`, outlineOffset: 2 },
        // Calm scrollbars: thin, no track.
        '*': { scrollbarWidth: 'thin', scrollbarColor: `${alpha(TEXT_SECONDARY, 0.35)} transparent` },
        // PLAN §7.1: respect prefers-reduced-motion everywhere (including MUI transitions).
        '@media (prefers-reduced-motion: reduce)': {
          '*, *::before, *::after': {
            animationDuration: '0.01ms !important',
            animationDelay: '0ms !important',
            animationIterationCount: '1 !important',
            transitionDuration: '0.01ms !important',
            transitionDelay: '0ms !important',
            scrollBehavior: 'auto !important',
          },
        },
      }),
    },

    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { rounded: { borderRadius: 5 } },
      variants: [
        {
          props: { variant: 'acrylic' },
          style: ({ theme: t }) => ({
            position: 'relative',
            backgroundColor: t.custom.acrylic.background,
            backdropFilter: t.custom.acrylic.backdropFilter,
            WebkitBackdropFilter: t.custom.acrylic.backdropFilter,
            border: t.custom.acrylic.border,
            boxShadow: t.custom.shadow.blocky,
            transition: `box-shadow ${t.custom.motion.flyInMs}ms ${t.custom.motion.ease}, transform ${t.custom.motion.flyInMs}ms ${t.custom.motion.ease}, background-color ${t.custom.motion.flyInMs}ms`,
            '&[data-interactive="true"]': {
              cursor: 'pointer',
              '&:hover': { boxShadow: t.custom.shadow.blockyHover, transform: 'translate3d(0,-1px,0)' },
              '&:active': { transform: 'translate3d(0,0,0)' },
            },
          }),
        },
        {
          props: { variant: 'acrylicDark' },
          style: ({ theme: t }) => ({
            backgroundColor: t.custom.acrylic.darkBackground,
            backdropFilter: t.custom.acrylic.backdropFilter,
            WebkitBackdropFilter: t.custom.acrylic.backdropFilter,
            color: '#fff',
          }),
        },
      ],
    },

    MuiCard: {
      defaultProps: { variant: 'acrylic' },
      styleOverrides: { root: { overflow: 'hidden' } },
    },

    MuiCardContent: {
      styleOverrides: { root: { padding: 20, '&:last-child': { paddingBottom: 20 } } },
    },

    MuiDialog: {
      defaultProps: { transitionDuration: { enter: custom.motion.dialogMs, exit: custom.motion.dialogMs } },
      styleOverrides: {
        root: {
          '& > .MuiBackdrop-root': {
            backgroundColor: alpha(TEXT_PRIMARY, 0.18),
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
          },
        },
        paper: {
          borderRadius: 5,
          backgroundColor: alpha('#fff', 0.92),
          backdropFilter: 'blur(16px) saturate(125%)',
          WebkitBackdropFilter: 'blur(16px) saturate(125%)',
          boxShadow: '0 24px 48px -12px rgba(0,0,0,.25)',
          // Zoom + fade in; the Fade transition on the container covers the 250 ms exit.
          animation: `${dialogZoomIn} ${custom.motion.dialogMs}ms ${EASE_OUT} backwards`,
        },
      },
    },
    MuiDialogTitle: { styleOverrides: { root: { fontWeight: 700 } } },

    MuiBackdrop: {
      variants: [
        {
          props: { invisible: false },
          style: {
            backgroundColor: ACRYLIC_DARK_BG,
            backdropFilter: ACRYLIC_BLUR,
            WebkitBackdropFilter: ACRYLIC_BLUR,
          },
        },
      ],
    },

    MuiDrawer: {
      styleOverrides: {
        paper: { borderRadius: 0 },
      },
    },

    MuiPopover: {
      styleOverrides: {
        paper: {
          borderRadius: 5,
          backgroundColor: alpha('#fff', 0.72),
          backdropFilter: ACRYLIC_BLUR,
          WebkitBackdropFilter: ACRYLIC_BLUR,
          border: `1px solid ${GREY_100}`,
          boxShadow: BLOCKY_SHADOW,
        },
      },
    },
    MuiMenuItem: { styleOverrides: { root: { fontSize: '0.875rem' } } },

    MuiTooltip: {
      styleOverrides: {
        tooltip: { backgroundColor: TEXT_PRIMARY, borderRadius: 3, fontSize: 12, fontWeight: 500 },
        arrow: { color: TEXT_PRIMARY },
      },
    },

    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 3, fontWeight: 700 },
        sizeLarge: { minHeight: 44 },
      },
    },
    MuiIconButton: { styleOverrides: { root: { borderRadius: 3 } } },
    MuiToggleButton: { styleOverrides: { root: { borderRadius: 3, fontWeight: 700, textTransform: 'none' } } },

    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 999, fontWeight: 700 },
        sizeSmall: { fontSize: '0.7rem', height: 22 },
      },
      variants: [
        {
          props: { variant: 'tag' },
          style: {
            height: 22,
            fontSize: '0.7rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: PRIMARY,
            backgroundColor: alpha(PRIMARY, 0.1),
            border: `1px solid ${alpha(PRIMARY, 0.5)}`,
          },
        },
      ],
    },

    MuiAvatar: { styleOverrides: { root: { fontWeight: 700 } } },

    MuiAlert: { styleOverrides: { root: { borderRadius: 3 }, message: { fontSize: '0.875rem' } } },

    MuiTextField: { defaultProps: { size: 'small' } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: 3, backgroundColor: alpha('#fff', 0.6) },
        notchedOutline: { borderColor: alpha(TEXT_PRIMARY, 0.12) },
      },
    },
    MuiInputLabel: { styleOverrides: { root: { fontWeight: 600 } } },

    MuiTabs: { styleOverrides: { indicator: { height: 3, borderRadius: '3px 3px 0 0' } } },
    MuiTab: { styleOverrides: { root: { fontWeight: 700, textTransform: 'none' } } },

    MuiTableCell: {
      styleOverrides: {
        // The one place table headers are styled (style guide §4.5): primary background, white 700 text.
        head: { backgroundColor: PRIMARY, color: '#fff', fontWeight: 700, whiteSpace: 'nowrap' },
        stickyHeader: { backgroundColor: PRIMARY },
        root: { borderBottomColor: alpha(TEXT_PRIMARY, 0.08) },
      },
    },
    MuiLinearProgress: { styleOverrides: { root: { borderRadius: 3 } } },
    MuiDivider: { styleOverrides: { root: { borderColor: alpha(TEXT_PRIMARY, 0.08) } } },
  },
})

export default theme
