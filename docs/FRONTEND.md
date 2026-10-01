# Frontend guide

How `HCMUSSupportV2.Frontend` is put together after D02. The design rationale is in [PLAN.md](PLAN.md) §7; the MUI
mechanics (per-path imports, page states, formatting, a11y) are in [UI-STYLE-GUIDE.md](UI-STYLE-GUIDE.md). Where they
disagree, PLAN §7 wins.

Stack: Vite 8, React 19 with the React Compiler, TypeScript 6, MUI v9 (+ Emotion), react-router 7 (data router, lazy
routes), TanStack Query 5, react-hook-form + zod, MUI X Date Pickers and Charts, dayjs, vitest, Playwright, oxlint.

```
npm run dev        # vite on :5173, /api proxied to http://localhost:5161
npm run dev:mock   # same, with the synthetic signed-in user (see "Mock auth")
npm run build      # tsc -b && vite build -> ../HCMUSSupportV2.Backend/wwwroot
npm run lint       # oxlint
npm test           # vitest run
npm run test:e2e   # Playwright (starts its own vite servers; also rewrites docs/screenshots/d02/)
```

## Structure

```
src/
  theme.ts            every PLAN §7.1 token as palette / shape / typography / component overrides + custom variants
  main.tsx, App.tsx   providers (Query, Theme, Auth) + the router
  api/http.ts         fetch wrapper: cookies, ProblemDetails -> ApiError, global 401 handler
  auth/               AuthProvider, useMe, RequireAuth, RequireRole, LoginPage, types (Me, Role)
  app/                shell: AppLayout, SidebarNav, AccountMenu, ViewAsBar, Watermark, nav.ts, routes.tsx, pages/
  ui/                 category-agnostic primitives (index.ts barrel)
  lib/format.ts       dash / join / money / date helpers (+ tests)
  features/<name>/    (from D08 on) a feature's pages, components and query hooks
  test/               vitest setup and a `renderWithTheme` helper
e2e/                  Playwright specs; screenshots go to docs/screenshots/d02/
public/               favicon.svg, bg-logo.svg (self-hosted watermark placeholder)
```

Rules that keep parallel work from colliding (PLAN §8): features live in `src/features/<feature>/`; the only shared
files a feature touches are one line in `app/nav.ts` and one line in `app/routes.tsx`. `src/ui/` holds primitives that
know nothing about a category. Do not build a generic category list or markdown viewer, and do not reuse one category's
component for another.

## Theme (`src/theme.ts`)

| Token | Where |
|---|---|
| Primary `#303F9F`, secondary `#ECEFF1`, text `#263238` / `#546E7A`, background `#F5F7F9` | `palette` |
| Radius 5 (chips and avatars full-round; inputs and buttons 3 px) | `shape.borderRadius`, `MuiOutlinedInput`, `MuiButton`, `MuiChip` |
| Inter 300-900, body 0.925 rem | `typography` (the font is loaded in `index.html`) |
| Section label: 11 px, weight 900, uppercase, `0.15em` | `typography.sectionLabel` (also `overline`) |
| Acrylic, blocky shadow, hover lift, sidebar gradient, motion, layout sizes | `theme.custom` (typed through module augmentation) |
| Table head: primary background, white 700 | `MuiTableCell.head` and `.stickyHeader` |
| Reduced motion | `MuiCssBaseline` zeroes animation and transition durations; `flyInSx` also drops its animation |

Custom variants (all typed):

- `<Paper variant="acrylic">`: translucent 0.4 white, `blur(8px) saturate(125%)`, 1 px border, blocky shadow. Add
  `data-interactive="true"` for the pointer cursor and the `translateY(-1px)` hover lift (`AcrylicCard` does this for you).
  `MuiCard` defaults to this variant. `variant="acrylicDark"` is the dark translucent version.
- `<Chip variant="tag">`: small uppercase primary-tinted pill.
- `<Typography variant="sectionLabel">`: the 11 px label (use `<SectionLabel>`).
- Dialogs: 250 ms fade with a 0.98 -> 1 zoom-in on the paper and a light blurred scrim. Popovers and menus are acrylic.
  Temporary-drawer and other non-invisible backdrops are the dark acrylic scrim.

Always import MUI components and icons per path (`@mui/material/Button`, `@mui/icons-material/BadgeOutlined`). Note that
v9 dropped some old icon names (`ErrorOutline` is `ErrorOutlineOutlined`); TypeScript tells you at once.

## Primitives (`src/ui`)

| Export | Use |
|---|---|
| `AcrylicCard` | The acrylic surface. Props: `index` (fly-in), `interactive`, `accent` (8 px primary left border), `onClick` (adds button semantics and Enter/Space) |
| `StatCard` | Icon + `SectionLabel` + big value + hint + faded watermark icon. Missing `value` -> `—`. `emphasis` for the one warm figure |
| `PageHeader` | Page `h1`, eyebrow, subtitle, actions. Keeps clear of the floating avatar on `lg` |
| `FlyIn`, `flyInSx(index, from?)` | Staggered entrance (300 ms, `cubic-bezier(.16,1,.3,1)`, 50 ms x index, fill `backwards`). Number `index` in reading order across the page |
| `PageState` | error `Alert` -> centred spinner -> empty sentence -> children. `errorMessage(err, fallback)` shows an `ApiError` message or your specific fallback |
| `MaskedValue` | `•••• 1234` with a per-field reveal/hide button; you fetch the real value and pass it back as `revealed` |
| `EmptyDash`, `SectionLabel` | The `—` placeholder (with an accessible label) and the label style |

`src/lib/format.ts`: `DASH`, `orDash`, `joinParts` (` · `), `formatMoney` (`12.000.000 đ`), `formatDecimal`
(`3,50`), `formatNumber`, `parseDate` (ISO local day -> `dd/MM/yyyy` -> `Date`; rejects 31/02), `formatDate(value,
precision?)` (`dd/MM/yyyy`, `MM/yyyy`, `yyyy`), `dayKey` (local `yyyy-MM-dd`).

## Shell

`AppLayout` (inside `RequireAuth`):

- `lg` and up: permanent 288 px sidebar (radial gradient, glowing "Support HCMUS", 64 px rows, one sliding sunken
  indicator driven by `activeNavIndex`) and a floating 44 px avatar top-right.
- Below `lg`: 64 px top bar (menu button, route title, avatar) and a 90 vw (max 450) drawer over the dark acrylic scrim.
- The account popover shows name, `MSCB · unit`, role chips (employee is implicit), `Phiên bản` from
  `GET /api/system/info`, and a red "Đăng xuất".
- `ViewAsBar` appears at the top while `me.actingAs` is set ("Đang xem với tư cách {name} · {MSCB}" + "Thoát", which calls
  `DELETE /api/admin/view-as` and reloads `me`).
- Pages scroll inside `<main>`, not the body; the bg-logo watermark sits behind them (`public/bg-logo.svg` is a
  placeholder emblem; replace the file with the official mark, nothing is hotlinked).
- The page title comes from the route `handle: { title }` and feeds `document.title` and the mobile bar.

### Add a page and a nav entry

1. Build the page in `src/features/<feature>/XxxPage.tsx` and export it as `Component`:
   ```tsx
   export function Component() { return <><PageHeader title="Sáng kiến" />…</> }
   ```
2. In `src/app/routes.tsx` replace that route's placeholder import (one line):
   ```ts
   page('sang-kien', 'Sáng kiến', () => import('../features/innovation/InnovationPage')),
   ```
   Role-gated routes sit under the `RequireRole` groups (`quan-ly` for editors, `quan-tri` for admins). Admins pass every
   role check.
3. Only for a new sidebar item: add one line to `NAV` in `src/app/nav.ts` (`id`, `label`, MUI icon, `to`, optional
   `match` prefix, optional `role: 'editor' | 'admin'`). Sub-pages that live under an existing item need no entry.
4. Live counts on a nav item: set `badge: 'unread'` and implement `useNavBadges()` (D08 fills it with the unread count).

Nav hiding is cosmetic. `RequireRole` and the server's 403 are the real guards.

## Auth

`AuthProvider` runs `useMe()` (`GET /api/auth/me`, TanStack Query key `['auth','me']`): 200 -> signed in, 401 -> `null`
(signed out), anything else -> the "Lỗi xác thực" screen with a retry. `useAuth()` gives `status`, `me`, `hasRole`,
`logout`, `exitViewAs`; `useCurrentUser()` is the non-null `me` for use below `RequireAuth`.

`api/http.ts`: every request sends cookies (`credentials: 'include'`), non-2xx throws `ApiError` (`status`, `problem`,
and a Vietnamese `message` taken from ProblemDetails `detail`). A 401 anywhere calls the registered handler, which drops
the cached user so `RequireAuth` redirects to `/dang-nhap?returnUrl=…`. `skipUnauthorizedHandler` is for callers that
treat 401 as an answer (`/api/auth/me`). The NSwag client in `src/api/generated-client.ts` (generated by
`generate-api.cmd`, not hand-written) can use `apiFetch` as its fetch.

The login page (`/dang-nhap`): two-column acrylic card, "Đăng nhập với Google" navigates to
`/api/auth/login?returnUrl=…` (only same-origin paths are accepted), "Đăng nhập với VNeID" is disabled. The OIDC
callback may redirect back with `?error=unknown_email|inactive|unverified_email` to show a message.

Assumption for D03/D14a: `me.code/fullName/roles` describe the signed-in person, and `actingAs` (`{code, fullName}`) names
the employee an admin is viewing as. Change `Me` in `auth/types.ts` if the backend decides otherwise.

### Mock auth (dev only)

`npm run dev:mock` (or `VITE_MOCK_AUTH=1 npm run dev`) makes `useMe` return a synthetic user: MSCB `T0001`, roles
`['editor','admin']`, no network call. Add `?mock-view-as=1` to see the view-as bar. Logging out in mock mode shows the
login page until you reload. The switch is `import.meta.env.DEV && VITE_MOCK_AUTH === '1'`, a build-time constant, and the
mock user lives in a dynamically imported module, so production builds contain neither (checked: a build with
`VITE_MOCK_AUTH=1` still has no mock data).

## Tests

- `npm test`: vitest + Testing Library (jsdom). `format.test.ts`, `http.test.ts`, `nav.test.ts`, `returnUrl.test.ts` and
  `ui/primitives.test.tsx`. Use `renderWithTheme` from `src/test/render.tsx` for anything that needs the theme.
- `npm run test:e2e`: Playwright (`playwright.config.ts`). It starts two vite servers, so no backend is needed:
  `mock` (port 5273, `VITE_MOCK_AUTH=1`) runs `e2e/shell.spec.ts`; `plain` (port 5274) runs `e2e/auth.spec.ts` with
  `/api/auth/me` stubbed per test (401 -> login, employee and editor roles, a failing check). Chromium is installed with
  `npx playwright install chromium`.
- The specs write screenshots to `docs/screenshots/d02/` (1440x900 and 375x812: shell, drawer, account menu, view-as bar,
  login). Commit them when the look changes.
- Feature deliveries add a Playwright smoke test per page against synthetic data (PLAN §8).
