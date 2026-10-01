# UI Style Guide (MyMentor style)

A portable description of the visual language used in `MyMentor/MyMentor.Frontend`, written so the
same look can be rebuilt in another React project. Everything here comes from the existing shared
code: [theme.ts](../MyMentor/MyMentor.Frontend/src/theme.ts),
[AppLayout.tsx](../MyMentor/MyMentor.Frontend/src/layout/AppLayout.tsx),
[components/](../MyMentor/MyMentor.Frontend/src/components/) and
[features/shared/](../MyMentor/MyMentor.Frontend/src/features/shared/).

**Character in one line:** a calm, light, data-dense dashboard. Flat tinted cards instead of
shadows, pill-shaped controls, bold-on-blue table headers, a faint warm gradient behind everything,
and one short staggered entrance animation.

---

## 1. Stack

| Concern | Choice |
|---|---|
| UI library | MUI v9 (`@mui/material`, `@mui/icons-material`) with Emotion |
| Styling | The `sx` prop and theme tokens. No CSS files beyond a tiny reset |
| Layout primitives | `Stack` for 1-D, `Grid` (v2 `size={{ xs, sm, md }}` API) for card rows, `Box` for everything else |
| Routing | `react-router-dom` (`NavLink` as the component of `ListItemButton`) |
| Font | Inter 400/500/600/700 from Google Fonts |

**Import rule:** import every MUI component and icon from its own path, never from the barrel.

```ts
import Button from '@mui/material/Button'        // yes
import SchoolIcon from '@mui/icons-material/School'
import { Button } from '@mui/material'            // no
```

---

## 2. Design tokens

### 2.1 Theme (copy this file as-is)

```ts
// theme.ts
import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary:   { main: '#1d4ed8' }, // blue-700
    secondary: { main: '#0f766e' }, // teal-700
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
  },
  components: {
    MuiTableCell: {
      styleOverrides: {
        head: { fontWeight: 700, backgroundColor: '#1565C0', color: '#fff' },
      },
    },
  },
})
```

```html
<!-- index.html -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
```

```css
/* index.css: the only global CSS */
:root { color-scheme: light; }
body  { margin: 0; }
```

```tsx
// main.tsx
<ThemeProvider theme={theme}>
  <CssBaseline />
  <App />
</ThemeProvider>
```

### 2.2 Colour

| Role | Value | Where it appears |
|---|---|---|
| Primary | `#1d4ed8` | Selected nav, today marker, links, progress bars, card tints |
| Secondary | `#0f766e` | Secondary stat icons |
| Table / grid header | `#1565C0` on `#fff` | Every `TableHead` cell and calendar weekday row |
| Page background | `linear-gradient(135deg, #FFFFFF 0%, #FFF3E0 100%)` | One layer painted on the app root |
| Group divider rows | `grey.100` | Semester/section separator rows inside tables |
| Out-of-range cells | `grey.50` | Calendar days outside the current month |
| Status | MUI `success` / `warning` / `error` / `info` | Alerts, chips, banners, clash markers |

**Tint scale.** Surfaces are coloured by `alpha(color, n)`, never by new hex values:

| Alpha | Use |
|---|---|
| `0.06` | Default card fill (`primary`) |
| `0.08` | Status banner fill (`success` / `warning`) |
| `0.12` | Hover on a clickable 0.06 card |
| `0.14` | Emphasised card (`warning`), timetable blocks, clash blocks (`error`) |
| `0.25` | Watermark icon (`grey[500]`) |
| `0.30` | Idle nav icon badge (item accent colour) |
| `0.50` / `0.60` | Selected nav pill / its hover (`primary`) |

**Navigation accent colours.** Each nav item gets its own icon colour, stepping through the
Material 500 rainbow in sidebar order:

`#F44336` red → `#FF9800` orange → `#FFC107` amber → `#4CAF50` green → `#009688` teal →
`#2196F3` blue → `#3F51B5` indigo → `#9C27B0` purple

Use these only for nav icons. Content stays primary/neutral plus status colours.

### 2.3 Typography

| Element | Variant | Weight |
|---|---|---|
| Page greeting / hero name | `h5` | 700 |
| Section heading | `h6` or `subtitle1` | 700 |
| Stat value (large card) | `h4` | 700 |
| Stat value (compact card) | `h5` / `h6` | 700 |
| Stat label | `body2` (large) / `caption` (compact), `color="text.secondary"` | 400 |
| Nav labels | default | 700 |
| Group divider titles | `body2` | 700 |
| Filter captions (above a control) | `caption`, `text.secondary` | 600 |
| Secondary line inside a cell (codes, IDs) | `caption`, `text.secondary`, `display: block` | 400 |
| Disclaimers, "last updated" | `caption`, `text.secondary` | 400 |

Weights in use: 400, 500, 600, 700. Bold (700) is for headings and values; 600 for
sub-labels. Never use weights under 400 or italics for emphasis.

### 2.4 Shape and spacing

- Base radius **10px** (`shape.borderRadius`). `borderRadius: 1` in `sx` means 10px.
- Pill radius **999** for nav items and filter selects. **50%** for icon badges and the "today" dot.
- Spacing unit is MUI's 8px:
  - Page sections: `Stack spacing={3}`
  - Card grids: `Grid container spacing={2}`
  - Tabs → content: `Stack spacing={2}`
  - Card padding: `p: 2` (compact), `p: 2.5` (standard), `p: 3` (banner), `p: 4` (auth card)
  - Icon → label inside a card: `Stack direction="row" spacing={1}` (compact) or `1.5`
- Content width: `Container maxWidth="lg"` with `py: 3`.

### 2.5 Elevation

Flat by default. Use `elevation={0}` on every card and separate by **tint** or `variant="outlined"`.
Shadows are allowed in exactly two places:

- `elevation={3}` on the floating sign-in card over a video/image background.
- `boxShadow: '0 1px 3px rgba(0,0,0,0.12)'` on table group-divider rows so they read as docked.

### 2.6 Glass

Two frosted surfaces, both over content that keeps scrolling behind them:

| Surface | Recipe |
|---|---|
| Fixed AppBar | `bgcolor: 'transparent'`, `backdropFilter: 'blur(8px)'`, bottom border `divider` |
| Mobile nav drawer | `bgcolor: alpha('#fff', 0.75)`, `backdropFilter: 'blur(16px)'` |

Always set `WebkitBackdropFilter` alongside `backdropFilter`.

---

## 3. App shell

```
┌────────────┬──────────────────────────────────────────────┐
│ ◉ Logo     │ AppBar (fixed, transparent, blur 8, border)  │
│────────────│                          [Name · ID] [Logout]│
│ (●) Item   ├──────────────────────────────────────────────┤
│ (●) Item   │ Container lg, py 3                           │
│ ────────   │   <Outlet />                                 │
│ (●) Item   │                                              │
│ ...        │                                              │
│────────────│                                              │
│ ⓘ source   │                                              │
│   note     │                                              │
└────────────┴──────────────────────────────────────────────┘
 260px, transparent over one shared page gradient
```

Rules:

1. **One background plane.** Paint the gradient once on the root `Box`. Keep the drawer paper
   (`bgcolor: 'transparent'`, `border: 'none'`) and the content area transparent so there is no seam.
2. **Sidebar = 260px permanent drawer** at `sm` and up. Below `sm`, the same `SidebarNav` content
   goes into a temporary drawer opened from a hamburger `IconButton`. Share one component between
   the two drawers.
3. **Nav groups.** Group related items (overview / progress / money / enrollment). Separate the
   groups with `Divider sx={{ mt: 1.5 }}` and `mb: 2` between them.
4. **Nav pill.** Height 64, `borderRadius: 999`, `pl: 0`, icon badge 44px, inset
   `(64 − 44) / 2 = 10px` so the badge sits centred in the pill's rounded cap.
   - Idle: badge `alpha(accent, 0.3)`, icon in `accent`.
   - Selected: pill `alpha(primary, 0.5)`, text white; badge solid `primary.main` with the icon
     in `background.paper` so it reads as a cutout.
5. **Footer note** pinned with `mt: 'auto'`: `InfoOutlinedIcon` (small) + `caption` text about
   data provenance.
6. **AppBar.** `position="fixed"`, `elevation={0}`, offset by the drawer width on wide screens,
   followed by a hidden spacer `<Toolbar sx={{ visibility: 'hidden' }} />`.
   - Wide screens (`md` and up): outlined `Chip` with "Name · ID" (`maxWidth: 320`) and a text
     `Button` with `LogoutIcon`.
   - Below `md`: collapse both into an `AccountCircleIcon` button and a `Menu`.
   - Below `sm`: show the active page title (`h6`, 700, `noWrap`) in the bar.
7. **Logout feedback.** Fade the whole root to `opacity: 0` over **180ms** before clearing auth,
   so the click gets an immediate response.

---

## 4. Components

### 4.1 Stat card (the signature component)

A flat, primary-tinted card with an icon + label, a big bold value, an optional hint line, and a
faded oversized copy of the icon clipped into the bottom-right corner.

```tsx
function StatCard({ icon, label, value, hint, onClick, emphasis, index = 0 }: {
  icon: ReactNode; label: string; value: string; hint?: string
  onClick?: () => void; emphasis?: boolean; index?: number
}) {
  const tint = (t: Theme) => (emphasis ? t.palette.warning.main : t.palette.primary.main)
  return (
    <Paper
      elevation={0}
      onClick={onClick}
      sx={{
        ...cardFlyInSx(index),
        position: 'relative',
        overflow: 'hidden',            // required for the watermark clip
        p: 2.5,
        height: '100%',
        bgcolor: (t) => alpha(tint(t), emphasis ? 0.14 : 0.06),
        cursor: onClick ? 'pointer' : undefined,
        '&:hover': onClick ? { bgcolor: (t) => alpha(tint(t), 0.12) } : undefined,
      }}
    >
      <CardWatermarkIcon icon={icon} />
      <Box sx={{ position: 'relative', zIndex: 1 }}>   {/* content sits above the watermark */}
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1 }}>
          {icon}
          <Typography variant="body2" color="text.secondary">{label}</Typography>
        </Stack>
        <Typography variant="h4" sx={{ fontWeight: 700, color: emphasis ? 'warning.dark' : undefined }}>
          {value}
        </Typography>
        {hint && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{hint}</Typography>}
      </Box>
    </Paper>
  )
}
```

- Put a semantic colour on the icon (`color="primary" | "success" | "secondary" | "info" | "warning"`).
  The watermark strips it and repaints it grey.
- Show a missing value as `—` (em dash). Don't show `0` or `N/A`.
- Layout: `Grid size={{ xs: 12, sm: 6 }}` for 2-up hero stats, `{{ xs: 6, sm: 4 }}` for 3-up
  compact stats, `{{ xs: 12, sm: 6, md: 4 }}` for one standalone card.
- Compact variant: `p: 2`, `spacing={1}`, `mb: 0.5`, `caption` label, `h5` / `h6` value,
  `fontSize="small"` icon.

### 4.2 Watermark icon

```tsx
export default function CardWatermarkIcon({ icon }: { icon: ReactNode }) {
  if (!isValidElement(icon)) return null
  return (
    <Box aria-hidden sx={{ position: 'absolute', right: -16, bottom: -16, lineHeight: 0, pointerEvents: 'none', zIndex: 0 }}>
      {cloneElement(icon, {
        color: undefined,
        fontSize: undefined,
        sx: { fontSize: 96, color: (t: Theme) => alpha(t.palette.grey[500], 0.25) },
      } as Record<string, unknown>)}
    </Box>
  )
}
```

It's decorative only: `aria-hidden`, no pointer events, and the host needs `position: relative` and
`overflow: hidden`.

### 4.3 Section card (a card that wraps a table or list)

```tsx
<Paper elevation={0} sx={{ ...cardFlyInSx(3), bgcolor: (t) => alpha(t.palette.primary.main, 0.06) }}>
  <Typography variant="subtitle1" sx={{ fontWeight: 700, p: 2, pb: 1.5 }}>Upcoming exams</Typography>
  {rows.length === 0
    ? <Typography color="text.secondary" sx={{ p: 2, pt: 0 }}>No upcoming exams.</Typography>
    : <TableContainer component={Paper} variant="outlined">…</TableContainer>}
</Paper>
```

### 4.4 Status banner

Use this for the one verdict a page exists to answer (e.g. "eligible / not eligible").

```tsx
<Paper variant="outlined" sx={{
  p: 3, display: 'flex', alignItems: 'center', gap: 2,
  borderColor: ok ? 'success.main' : 'warning.main',
  bgcolor: (t) => alpha(t.palette[ok ? 'success' : 'warning'].main, 0.08),
}}>
  {ok ? <CheckCircleIcon color="success" sx={{ fontSize: 40 }} /> : <CancelIcon color="warning" sx={{ fontSize: 40 }} />}
  <Box>
    <Typography variant="h6" sx={{ fontWeight: 700 }}>{title}</Typography>
    {reason && <Typography variant="body2" color="text.secondary">{reason}</Typography>}
  </Box>
</Paper>
```

For smaller or secondary messages, use a standard `Alert`:

- `severity="info" variant="outlined"` for explanatory notes about how the data was derived.
- `severity="success" | "warning"` (filled standard) for inline status.
- `AlertTitle sx={{ fontWeight: 700 }}` plus `body2` lines for multi-part notices. Don't repeat a
  number that a card next to it already shows.

### 4.5 Data tables

Base recipe:

```tsx
<TableContainer component={Paper} variant="outlined" sx={{ maxHeight: '75vh' /* or useFillHeight */ }}>
  <Table size="small" stickyHeader>
    <TableHead>
      <TableRow ref={headerRowRef}>
        <TableCell sx={{ zIndex: 3 }}>Course</TableCell>
        <TableCell align="right" sx={{ zIndex: 3 }}>Credits</TableCell>
      </TableRow>
    </TableHead>
    <TableBody>…</TableBody>
  </Table>
</TableContainer>
```

- Always use `size="small"`, an outlined container, and body rows with `hover`.
- The header style comes from the theme override. Don't restyle headers per table.
- Right-align numbers and money. Show empty cells as `—`.
- **Two-line cell:** primary name on top, code/ID underneath as
  `<Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>`.
- **Clickable rows:** `hover` + `onClick` + `sx={{ cursor: 'pointer' }}`, used to navigate to
  the detail page.
- **Inline flag:** `<Chip size="small" color="warning" label="…" sx={{ ml: 1 }} />` after the cell text.
- **Wide free-text tables:** give the `Table` a `minWidth: 720` so it scrolls horizontally instead
  of crushing columns. Cap long cells with
  `{ maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }` and
  a `title` tooltip.

**Grouped tables (section divider rows).** Group long histories by period and insert a full-width
divider row for each group:

```tsx
<TableRow ref={(el) => { if (el) dividerRefs.current.set(key, el) }} sx={{ position: 'relative', willChange: 'transform' }}>
  <TableCell colSpan={COLUMN_COUNT} sx={{ bgcolor: 'grey.100', fontWeight: 700, py: 2.25, boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }}>
    <Stack direction="row" spacing={2} sx={{ alignItems: 'baseline' }}>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>Semester 1 · 2024-25</Typography>
      <Typography variant="caption" color="text.secondary">6 courses · Fee 12.000.000 đ</Typography>
    </Stack>
  </TableCell>
</TableRow>
```

The divider shows the group title in bold and a one-line summary in caption, separated by ` · `.
`useStickyGroupPush` (§6) makes each divider dock under the sticky header and get pushed off by
the next one.

### 4.6 Pill filter select (label-above style)

A filled pill with no outline, with its label as a caption above it instead of notched into the
border.

```tsx
const pillSx = {
  borderRadius: 999,
  bgcolor: 'grey.100',
  '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
  '& .MuiSelect-select': { borderRadius: 999 },
}

<Stack direction="row" spacing={3}>
  <Stack spacing={0.5}>
    <Typography variant="caption" color="text.secondary" sx={{ pl: 1, fontWeight: 600 }}>Year</Typography>
    <Select size="small" displayEmpty value={year} onChange={…} sx={{ ...pillSx, minWidth: 140 }}>
      {allowAll && <MenuItem value="">All</MenuItem>}
      …
    </Select>
  </Stack>
</Stack>
```

- Offer dependent selects (year → term) rather than free text. Disable the child until the parent
  has a value.
- Add an optional "All" choice with value `''` where the backend treats "no filter" as everything.

### 4.7 Tabbed panel

For a nav item that groups several related read-only views:

```tsx
<Stack spacing={2}>
  <Tabs value={tab} onChange={(_, v) => setTab(v)}
        variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile
        sx={{ borderBottom: 1, borderColor: 'divider' }}>
    {tabs.map((t) => <Tab key={t.label} label={t.label} />)}
  </Tabs>
  {tabs[tab].component}
</Stack>
```

Always make tabs scrollable so they never wrap or clip on narrow screens.

### 4.8 Chips

- Metadata tags under a name: `size="small"` default chips in a wrapping row
  (`direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}`).
- Status tag: `size="small" color="primary" variant="outlined"`.
- Warning flag in a table row: `size="small" color="warning"`.
- Count badge on a calendar day (mobile): `size="small"`, `height: 20`, `minWidth: 24`,
  label padding `px: 0.75`. Use `error` if any item is high-stakes, otherwise `primary`.

### 4.9 Progress rows

```tsx
<Paper variant="outlined" sx={{ ...cardFlyInSx(4 + i), p: 2 }}>
  <Stack direction="row" sx={{ mb: 0.5, justifyContent: 'space-between' }}>
    <Typography variant="body2" sx={{ fontWeight: 600 }}>Semester 1 · 2024-25</Typography>
    <Typography variant="body2" color="text.secondary">18 cr · GPA 3.20 · total 72 cr</Typography>
  </Stack>
  <LinearProgress variant="determinate" value={pct} sx={{ height: 8, borderRadius: 1 }} />
</Paper>
```

### 4.10 Month calendar grid

- CSS grid with `repeat(7, 1fr)` columns and `auto repeat(6, 1fr)` rows, a `divider` border,
  `borderRadius: 1`, `overflow: hidden`.
- Weekday header cells use the table-header blue `#1565C0` / white, 700 weight, `fontSize: 13`.
- Day cells get `borderTop` + `borderLeft` in `divider`. In-month cells use `background.paper`,
  out-of-month cells `grey.50` with `text.disabled` numbers.
- Today: a 22px circle in `primary.main` with a white 700-weight number.
- Toolbar: small chevron `IconButton`s with `aria-label`s, plus a text "Today" `Button`.
- Desktop shows event chips with tooltips. Mobile shows a count chip, and tapping it opens that
  day's list.

### 4.11 Timetable blocks

- Rows are drawn with `repeating-linear-gradient(to bottom, transparent … divider …)` instead of
  individual line elements.
- Blocks are absolutely positioned, split into lanes when they overlap, with `m: '1px'`, `p: 0.5`,
  `borderRadius: 1`, a `alpha(main, 0.14)` fill, and a 1px `main` border.
- `primary` for normal blocks, `error` for clashes. The tooltip names what the block clashes with.
- Text: caption 600 title plus a caption `text.secondary` detail line, both `noWrap`.

### 4.12 Auth screen

- Full-viewport `grey.900` base, a muted looping background video (`objectFit: cover`), and a
  `rgba(0,0,0,0.35)` scrim.
- Centred `Paper elevation={3}`, `p: 4`, `maxWidth: 400`: a 40px primary logo icon, the product
  name (`h5`, 700), and a one-line `body2` secondary instruction.
- Follow the identity provider's own brand rules for the sign-in button (for Microsoft: white fill,
  `#5E5E5E` text, `#8C8C8C` border, four-colour logo, `textTransform: 'none'`, weight 500).

---

## 5. Motion

One entrance animation, used everywhere: cards **fly up and fade in**, staggered by position.

| Parameter | Value |
|---|---|
| Travel | `translate3d(0, 10rem, 0)` → `0` |
| Opacity | 0 → 1 |
| Duration | 300ms |
| Easing | `cubic-bezier(0.16, 1, 0.3, 1)` (fast out, long settle) |
| Stagger | 50ms × index |
| Fill mode | `backwards` (**not** `both` / `forwards`) |

```ts
const flyInUp = keyframes`
  from { opacity: 0; transform: translate3d(0, 10rem, 0); }
  to   { opacity: 1; transform: translate3d(0, 0, 0); }
`
export const cardFlyInSx = (index = 0): SxProps<Theme> => ({
  animation: `${flyInUp} 300ms cubic-bezier(0.16, 1, 0.3, 1) backwards`,
  animationDelay: `${index * 50}ms`,
})
export const cardFlyInAnimation = (index = 0) =>
  `${flyInUp} 300ms cubic-bezier(0.16, 1, 0.3, 1) ${index * 50}ms backwards`
export const cardFlyInEndMs = (index = 0) => index * 50 + 300
```

Usage rules:

- Number `index` in reading order across the whole page: stat cards `0..n`, then the next
  section heading/card continues the count (e.g. `3`, then list items `4 + i`).
- Apply it to cards, section cards, and section headings. Don't animate table rows, alerts, or
  the shell.
- Use `backwards`, and never add `will-change: transform` to animated cards. Any lingering
  transform demotes `background-attachment: fixed` on that element.
- To chain a second effect after landing (e.g. revealing a fixed shared background), pass a
  comma-separated `animation` list built with `cardFlyInAnimation(i)` and start the second one at
  `cardFlyInEndMs(i)`.

Other motion:

- Logout fade: 180ms `ease-out` on the root's opacity.
- Card hover: a background tint step only (0.06 → 0.12). No lift, no shadow, no scale.

### Optional flourish: shared fixed backdrop across cards

The profile page's cards look like cutouts into one continuous canvas: four soft radial gradients
(primary, secondary, amber `rgba(234,179,8,.2)`, pink `rgba(219,39,119,.2)`, each 20% alpha,
420–520px circles in the four corners) with `backgroundAttachment: 'fixed'`. Each card starts
`#fff` and fades its `background-color` to transparent over 500ms after its fly-in lands. Use this
for at most one page.

---

## 6. Layout helpers (behaviour, not just looks)

| Helper | Purpose | Key detail |
|---|---|---|
| `useFillHeight(bottomPadding = 24)` | Gives a scroll container the exact remaining viewport height instead of an arbitrary `75vh` | Callback ref + `useLayoutEffect`, min 320px, re-measures on resize |
| `useHeaderHeight()` | Measures the real sticky header row height | Callback ref so it measures when the table mounts after loading |
| `useStickyGroupPush(containerRef, headerHeight, groupKeys)` | Dock group divider rows under the sticky header, with the next divider pushing the current one off | Continuous `requestAnimationFrame` loop applying `translateY`. Not `position: sticky` on `<td>`, not a scroll listener (both flicker or fail to release). Memoise `groupKeys` |
| `groupBySemester(rows, getTerm)` | Buckets rows by period, oldest first | Stable string key `year/term` |

All helpers use callback refs, not `useRef` plus an empty-deps effect, because the measured element
usually mounts after a loading spinner.

---

## 7. Page states

Every data view handles these states in this order and with these visuals:

```tsx
if (error) return <Alert severity="error">{error}</Alert>
if (!data) return (
  <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
)
if (data.length === 0) return <Typography color="text.secondary">Nothing here yet.</Typography>
```

- **Error:** show the server's message when it has one (`err instanceof ApiError ? err.message : fallback`),
  otherwise a specific fallback ("Couldn't load tuition."), never a generic "Error".
- **Loading:** a centred spinner with `py: 6`. No skeletons.
- **Empty:** one plain `text.secondary` sentence. No illustration and no icon.
- **Partial / unavailable figure:** show `—` plus a hint explaining why. Never fall back to a figure
  you know may be wrong.
- Keep page-level context (such as a status banner) visible in the empty state too.
- Independent data loads separately. A slow secondary source must not block the main table.

---

## 8. Content and formatting

- **Separator:** ` · ` (middle dot with spaces) joins related facts: `Name · ID`,
  `6 courses · Fee … · Paid …`.
- **Missing value:** `—`.
- **Money:** `Intl.NumberFormat(locale)` with whole units and a currency suffix
  (`12.000.000 đ`). Right-aligned.
- **Decimals:** GPA-style scores use `toFixed(2)`.
- **Dates:** parse tolerantly (ISO, then `dd/MM/yyyy`, then `new Date`). Skip a bad row instead of
  crashing the view. Build day keys from local time, never `toISOString()`.
- **Provenance and disclaimers:** a `caption` / `text.secondary` line near the data ("Source …,
  for reference only", "Last updated: …").
- **Tone:** short, factual labels. Headings name the thing ("Upcoming exams"), not the action.
- **Calendar export:** offer `.ics` downloads for schedules (RFC 5545 escaping and 75-octet line
  folding, floating local time, all-day fallback when the time won't parse).

---

## 9. Responsiveness

| Breakpoint | Behaviour |
|---|---|
| `< sm` | Temporary glass drawer via hamburger. Page title shown in the AppBar. Stat cards stack (`xs: 12`) or pair (`xs: 6`). Calendar shows count chips |
| `< md` | User chip + logout collapse into an account icon menu |
| `≥ sm` | Permanent 260px transparent drawer |
| All | Tabs scroll. Wide tables scroll horizontally. Rows of text/links switch `direction={{ xs: 'column', sm: 'row' }}`. Use `minWidth: 0` and `noWrap` on flex children that hold text |

---

## 10. Accessibility

- Icon-only buttons always get an `aria-label`.
- Decorative graphics (watermarks, brand logo SVG) get `aria-hidden`.
- Menus use the full MUI pattern: `aria-controls`, `aria-haspopup`, `aria-expanded`.
- Don't rely on colour alone: every status colour comes with an icon and/or text (✓ / ✗ icon plus a
  heading, or a chip label).
- Truncated text keeps its full value in `title` or a `Tooltip`.

---

## 11. Do / Don't

| Do | Don't |
|---|---|
| Tint surfaces with `alpha(palette.x.main, n)` | Invent new hex colours for surfaces |
| `elevation={0}` + tint or `variant="outlined"` | Stack drop shadows on cards |
| Put table header styling in the theme | Restyle `TableHead` per table |
| Pills (999) for nav and filters, 10px elsewhere | Mix sharp and rounded corners |
| One gradient on the root, transparent layers above | Paint separate backgrounds per region |
| One entrance animation with index stagger | Add hover lifts, bounces, or per-component animations |
| `—` for missing values, ` · ` as a separator | `N/A`, `null`, `0` for unknown, pipes or slashes |
| Centre spinner / plain-text empty / `Alert` error | Skeletons, empty-state illustrations |
| Per-path MUI imports | Barrel imports |

---

## 12. Porting checklist

1. Install `@mui/material @mui/icons-material @emotion/react @emotion/styled`.
2. Add the Inter `<link>` tags, `index.css`, and `theme.ts` from §2.
3. Copy these files verbatim (they have no app-specific dependencies):
   - `src/components/cardFlyIn.ts`
   - `src/components/CardWatermarkIcon.tsx`
   - `src/components/TabbedPanel.tsx`
   - `src/features/shared/useFillHeight.ts`
   - `src/features/shared/useStickyGroupPush.ts`
   - `src/features/shared/groupBySemester.ts` (rename to `groupByPeriod` if it helps)
   - `src/features/profile/shared/tableStyles.ts`
4. Build the shell from `src/layout/AppLayout.tsx`: replace `NAV_GROUPS`, the logo, and the footer
   note, and keep the dimensions (260 / 64 / 44) and the accent-colour sequence.
5. Extract `StatCard` (§4.1) into `components/`. In MyMentor it's still duplicated across
   Dashboard, Tuition, Grades, and Study Roadmap, so don't copy that duplication.
6. Adapt `TermSelect` into a generic `PillSelect` + caption (§4.6).
7. Build each page as `Stack spacing={3}`: stat-card grid → status banner / alert → filters →
   section card or grouped table → caption footer.
