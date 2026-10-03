/**
 * MUI v9 theme: the look of the PromptingFEBuild (PLAN §7.1) expressed as palette, shape, typography,
 * component overrides and a few custom variants (Paper `acrylic`, Chip `tag`, Typography `sectionLabel`).
 *
 * Pages should reach for the variants (`<Paper variant="acrylic">`, the `src/ui` primitives) instead of
 * ad-hoc `sx`. Raw numbers live in `theme.custom` so shell code and pages share one source.
 */
import { alpha, createTheme, keyframes } from '@mui/material/styles'
import type { CSSProperties, Theme } from '@mui/material/styles'
import type {} from '@mui/x-date-pickers/themeAugmentation'

export const PRIMARY = '#303F9F'
const SECONDARY = '#ECEFF1'
const TEXT_PRIMARY = '#263238'
const TEXT_SECONDARY = '#546E7A'
const BACKGROUND = '#F5F7F9'

/** Corner radii: `shape.borderRadius` for small surfaces, `CARD` for cards/papers, `DIALOG` for dialogs, `PILL` for controls. */
const RADIUS = 16
const CARD = 20
const DIALOG = 28
const PILL = 999

const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)'

/** Blocky shadow and its hover state (PLAN §7.1). */
const BLOCKY_SHADOW = '0 4px 12px -2px rgba(0,0,0,.08), 0 2px 6px -1px rgba(0,0,0,.04)'
const BLOCKY_SHADOW_HOVER = '0 6px 16px -4px rgba(79,195,247,.15), 0 4px 6px -4px rgba(79,195,247,.1)'

const ACRYLIC_BLUR = 'blur(8px) saturate(125%)'
const ACRYLIC_BG = alpha('#fff', 0.4)
const ACRYLIC_DARK_BG = alpha(TEXT_PRIMARY, 0.5)

export interface CustomTokens {
  acrylic: { background: string; darkBackground: string; backdropFilter: string }
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
  },
  shadow: { blocky: BLOCKY_SHADOW, blockyHover: BLOCKY_SHADOW_HOVER },
  motion: { ease: EASE_OUT, flyInMs: 300, staggerMs: 50, dialogMs: 250, flyInDistance: '10rem' },
  layout: { sidebarWidth: 288, navRowHeight: 64, topBarHeight: 64, avatarSize: 44 },
  sidebar: {
    gradient: 'radial-gradient(circle at top right, #fafcfc, #E3F2FD)',
    glow: '0 0 12px rgba(255,255,255,.9), 0 0 4px rgba(255,255,255,.4)',
    sunkenBackground: alpha(PRIMARY, 0.12),
    sunkenShadow: 'none',
  },
}

const dialogZoomIn = keyframes`
  from { opacity: 0; transform: scale(.98); }
  to   { opacity: 1; transform: scale(1); }
`

/** Labels, nav items and small headings: normal case, bold. Only chips are set in capitals. */
const sectionLabel: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  lineHeight: 1.45,
  letterSpacing: '0.01em',
}

/** Text fields share the cards' blurred white surface (search boxes, selects, date fields). */
const FIELD_SURFACE = {
  backgroundColor: ACRYLIC_BG,
  backdropFilter: ACRYLIC_BLUR,
  WebkitBackdropFilter: ACRYLIC_BLUR,
  boxShadow: BLOCKY_SHADOW,
  transition: 'background-color 200ms, box-shadow 200ms',
  '&:hover': { backgroundColor: alpha('#fff', 0.7) },
  '&.Mui-focused': { backgroundColor: alpha('#fff', 0.9), boxShadow: `${BLOCKY_SHADOW}, 0 0 0 3px ${alpha(PRIMARY, 0.25)}` },
  '&.Mui-error': { backgroundColor: alpha('#d32f2f', 0.1) },
  '&.Mui-disabled': { backgroundColor: alpha(TEXT_PRIMARY, 0.04), boxShadow: 'none' },
} as const

const INLINE_LABEL = {
  flexDirection: 'row',
  flexWrap: 'nowrap',
  alignItems: 'center',
  columnGap: 12,
  '& > .MuiInputLabel-root': { marginBottom: 0, paddingLeft: 0, flex: 'none', whiteSpace: 'nowrap' },
  '& > .MuiInputBase-root, & > .MuiPickersInputBase-root': { flex: 1, minWidth: 140 },
  '&:has(> .MuiFormHelperText-root)': { flexWrap: 'wrap' },
  '& > .MuiFormHelperText-root': { flexBasis: '100%' },
  '&:has(textarea)': { flexDirection: 'column', alignItems: 'stretch', '& > .MuiInputLabel-root': { marginBottom: 6, paddingLeft: 16 } },
} as const

/** Palette colours that Chip and Button `outlined` get a tinted (borderless) look for. */
const TINT_COLORS = ['primary', 'secondary', 'error', 'info', 'success', 'warning'] as const

export const theme = createTheme({
  custom,
  palette: {
    mode: 'light',
    primary: { main: PRIMARY },
    secondary: { main: SECONDARY, contrastText: TEXT_PRIMARY },
    text: { primary: TEXT_PRIMARY, secondary: TEXT_SECONDARY },
    background: { default: BACKGROUND, paper: '#fff' },
  },
  shape: { borderRadius: RADIUS },
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
    h6: { fontWeight: 700, fontSize: '1.3rem' },
    subtitle1: { fontWeight: 600, fontSize: '1.0625rem' },
    subtitle2: { fontWeight: 700, fontSize: '0.9375rem' },
    body1: { fontSize: '1rem' },
    body2: { fontSize: '0.9375rem' },
    caption: { fontSize: '0.8125rem' },
    button: { fontWeight: 700, fontSize: '0.9375rem', textTransform: 'none', letterSpacing: 0 },
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
      styleOverrides: {
        rounded: { borderRadius: CARD },
        // No outlines anywhere: an "outlined" paper is the same blurred white surface as an acrylic card.
        outlined: {
          border: 'none',
          backgroundColor: ACRYLIC_BG,
          backdropFilter: ACRYLIC_BLUR,
          WebkitBackdropFilter: ACRYLIC_BLUR,
          boxShadow: BLOCKY_SHADOW,
        },
      },
      variants: [
        {
          props: { variant: 'acrylic' },
          style: ({ theme: t }) => ({
            position: 'relative',
            backgroundColor: t.custom.acrylic.background,
            backdropFilter: t.custom.acrylic.backdropFilter,
            WebkitBackdropFilter: t.custom.acrylic.backdropFilter,
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
      styleOverrides: { root: { overflow: 'hidden', borderRadius: CARD } },
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
          borderRadius: DIALOG,
          backgroundColor: alpha('#fff', 0.92),
          backdropFilter: 'blur(16px) saturate(125%)',
          WebkitBackdropFilter: 'blur(16px) saturate(125%)',
          boxShadow: '0 24px 48px -12px rgba(0,0,0,.25)',
          // Zoom + fade in; the Fade transition on the container covers the 250 ms exit.
          animation: `${dialogZoomIn} ${custom.motion.dialogMs}ms ${EASE_OUT} backwards`,
        },
      },
    },
    MuiDialogTitle: { styleOverrides: { root: { fontWeight: 700, fontSize: '1.25rem' } } },
    MuiDialogContent: { styleOverrides: { dividers: { borderTop: 'none', borderBottom: 'none' } } },

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
        paper: { borderRadius: 0, '&.MuiDrawer-paperAnchorLeft': { borderRadius: `0 ${DIALOG}px ${DIALOG}px 0` } },
      },
    },

    MuiPopover: {
      styleOverrides: {
        paper: {
          borderRadius: CARD,
          backgroundColor: alpha('#fff', 0.72),
          backdropFilter: ACRYLIC_BLUR,
          WebkitBackdropFilter: ACRYLIC_BLUR,
          boxShadow: BLOCKY_SHADOW,
        },
      },
    },
    MuiMenu: { styleOverrides: { list: { padding: 6 } } },
    MuiMenuItem: { styleOverrides: { root: { fontSize: '0.9375rem', borderRadius: 14 } } },
    MuiListItemButton: { styleOverrides: { root: { borderRadius: 14 } } },

    MuiTooltip: {
      styleOverrides: {
        tooltip: { backgroundColor: TEXT_PRIMARY, borderRadius: 10, fontSize: 13, fontWeight: 500 },
        arrow: { color: TEXT_PRIMARY },
      },
    },

    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: PILL, fontWeight: 700 },
        sizeSmall: { fontSize: '0.875rem' },
        sizeLarge: { minHeight: 48, fontSize: '1rem' },
      },
      variants: [
        // "Outlined" is a tinted solid pill: no border, same padding as the other variants.
        {
          props: { variant: 'outlined' },
          style: { border: 'none', padding: '6px 16px', '&.Mui-disabled': { border: 'none', backgroundColor: alpha(TEXT_PRIMARY, 0.06) } },
        },
        { props: { variant: 'outlined', size: 'small' }, style: { padding: '4px 12px' } },
        { props: { variant: 'outlined', size: 'large' }, style: { padding: '8px 24px' } },
        { props: { variant: 'outlined', color: 'inherit' }, style: { backgroundColor: alpha(TEXT_PRIMARY, 0.1), '&:hover': { border: 'none', backgroundColor: alpha(TEXT_PRIMARY, 0.16) } } },
        ...TINT_COLORS.map((color) => ({
          props: { variant: 'outlined' as const, color },
          style: ({ theme: t }: { theme: Theme }) => ({
            backgroundColor: alpha(t.palette[color].main, 0.1),
            '&:hover': { border: 'none', backgroundColor: alpha(t.palette[color].main, 0.18) },
          }),
        })),
      ],
    },
    MuiIconButton: { styleOverrides: { root: { borderRadius: '50%' } } },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          borderRadius: PILL,
          border: 'none',
          fontWeight: 700,
          textTransform: 'none',
          fontSize: '0.9375rem',
          backgroundColor: alpha(TEXT_PRIMARY, 0.06),
          '&.Mui-selected': { backgroundColor: alpha(PRIMARY, 0.16), color: PRIMARY, '&:hover': { backgroundColor: alpha(PRIMARY, 0.22) } },
        },
      },
    },
    MuiToggleButtonGroup: {
      styleOverrides: { grouped: { border: 'none', '&:not(:first-of-type)': { borderRadius: PILL, marginLeft: 4 }, '&:not(:last-of-type)': { borderRadius: PILL } } },
    },

    MuiChip: {
      styleOverrides: {
        root: { borderRadius: PILL, fontWeight: 700, fontSize: '0.9375rem' },
        sizeSmall: { fontSize: '0.8125rem', height: 26 },
      },
      variants: [
        // "Outlined" is a tinted solid: no border, the tint of its colour behind coloured text.
        {
          props: { variant: 'outlined' },
          style: { border: 'none', backgroundColor: alpha(TEXT_PRIMARY, 0.08), color: TEXT_PRIMARY, '& .MuiChip-icon': { color: 'inherit' } },
        },
        ...TINT_COLORS.map((color) => ({
          props: { variant: 'outlined' as const, color },
          style: ({ theme: t }: { theme: Theme }) => ({
            backgroundColor: alpha(t.palette[color].main, 0.14),
            color: color === 'warning' || color === 'success' || color === 'info' ? t.palette[color].dark : t.palette[color].main,
            '&.MuiChip-clickable:hover': { backgroundColor: alpha(t.palette[color].main, 0.22) },
          }),
        })),
        {
          props: { variant: 'tag' },
          style: {
            height: 26,
            fontSize: '0.75rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: PRIMARY,
            backgroundColor: alpha(PRIMARY, 0.12),
          },
        },
      ],
    },

    MuiAvatar: { styleOverrides: { root: { fontWeight: 700 } } },

    MuiAlert: { styleOverrides: { root: { borderRadius: RADIUS }, message: { fontSize: '0.9375rem' } } },

    // Labels sit to the left of the field, on one line; helper text wraps underneath. Multiline fields keep the label on top.
    MuiTextField: {
      defaultProps: { size: 'small' },
      styleOverrides: { root: INLINE_LABEL },
    },
    MuiPickersTextField: { styleOverrides: { root: INLINE_LABEL } },
    // Fields are solid tinted pills with no outline. The label sits above the field as a caption (UI-STYLE-GUIDE §4.6),
    // so there is no notch and the placeholder is always visible.
    MuiInputLabel: {
      defaultProps: { shrink: true },
      styleOverrides: {
        root: {
          position: 'static',
          transform: 'none',
          maxWidth: '100%',
          pointerEvents: 'auto',
          marginBottom: 6,
          paddingLeft: 16,
          fontSize: '0.875rem',
          fontWeight: 600,
          color: TEXT_SECONDARY,
          '&.Mui-focused': { color: PRIMARY },
          '&.Mui-error': { color: '#d32f2f' },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: PILL,
          ...FIELD_SURFACE,
        },
        input: {
          paddingLeft: 20,
          paddingRight: 20,
          '&.MuiInputBase-inputAdornedStart': { paddingLeft: 0 },
          '&.MuiInputBase-inputAdornedEnd': { paddingRight: 0 },
        },
        adornedStart: { paddingLeft: 18 },
        adornedEnd: { paddingRight: 12 },
        multiline: { borderRadius: CARD, padding: '12px 20px' },
        notchedOutline: { border: 'none', '& legend': { display: 'none' } },
      },
    },
    // Date fields (MUI X) draw their own outline: same borderless tinted pill as the text fields.
    MuiPickersOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: PILL,
          ...FIELD_SURFACE,
        },
        sectionsContainer: { paddingLeft: 20 },
        notchedOutline: { border: 'none', '& legend': { display: 'none' } },
      },
    },
    MuiSelect: { defaultProps: { displayEmpty: true } },
    MuiAutocomplete: { styleOverrides: { inputRoot: { borderRadius: 28, paddingLeft: 16 } } },

    MuiTabs: { styleOverrides: { indicator: { height: 4, borderRadius: PILL } } },
    MuiTab: { styleOverrides: { root: { fontWeight: 700, fontSize: '0.9375rem', textTransform: 'none' } } },

    MuiAccordion: { styleOverrides: { root: { borderRadius: CARD, '&::before': { display: 'none' }, '&:first-of-type, &:last-of-type': { borderRadius: CARD } } } },

    // Tables sit on the same blurred white surface as the cards.
    MuiTableContainer: {
      styleOverrides: {
        root: {
          borderRadius: CARD,
          backgroundColor: ACRYLIC_BG,
          backdropFilter: ACRYLIC_BLUR,
          WebkitBackdropFilter: ACRYLIC_BLUR,
          boxShadow: BLOCKY_SHADOW,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        // The one place table headers are styled (style guide §4.5): primary background, white 700 text.
        head: { backgroundColor: PRIMARY, color: '#fff', fontWeight: 700, whiteSpace: 'nowrap', fontSize: '0.9375rem' },
        stickyHeader: { backgroundColor: PRIMARY },
        root: { borderBottomColor: alpha(TEXT_PRIMARY, 0.06) },
      },
    },
    MuiLinearProgress: { styleOverrides: { root: { borderRadius: PILL } } },
    MuiDivider: { styleOverrides: { root: { borderColor: alpha(TEXT_PRIMARY, 0.08) } } },
  },
})

export default theme
