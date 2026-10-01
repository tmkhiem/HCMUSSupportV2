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
npm run test:e2e   # Playwright, mocked API (starts its own vite servers; also rewrites docs/screenshots/d02/)
npm run test:e2e:real  # Playwright e2e-real: real backend on :5261 + vite on :5275 (see "Tests")
```

## Structure

```
src/
  theme.ts            every PLAN §7.1 token as palette / shape / typography / component overrides + custom variants
  main.tsx, App.tsx   providers (Query, Theme, Auth) + the router
  api/http.ts         fetch layer: cookies, X-XSRF-TOKEN on unsafe methods, ProblemDetails -> ApiError, global 401 handler
  api/clients.ts      typed NSwag instances (`authClient`, `systemClient`) built on `clientFetch`
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

Backend contract: [BACKEND.md](BACKEND.md) "Authentication and authorization".

**Session state.** `AuthProvider` runs `useMe()` (`authClient.me()` = `GET /api/auth/me`, TanStack Query key `['auth','me']`):
200 -> signed in, 401 -> `null` (signed out), anything else -> the "Lỗi xác thực" screen with a retry. The DTO is
normalised by `toMe` (`auth/types.ts`) to `Me = {code, fullName, unit: string|null, photoUrl: string|null, emails[],
roles: RoleName[], actingAs: {code, fullName}|null}`. `roles` always contains `employee` (the backend sends it), plus
`editor` and/or `admin`; `hasRole('editor')` is also true for admins. `actingAs` stays null until D14a (view-as).
`useAuth()` gives `status`, `me`, `hasRole`, `logout`, `exitViewAs`; `useCurrentUser()` is the non-null `me` below
`RequireAuth`. `auth/session.ts` has `refreshSession(qc)`: drop every user-specific query, then refetch `me`. Call it
after any sign-in or user switch (`me` also re-issues the `XSRF-TOKEN` cookie, which is bound to the user).

**Logout.** `logout()` = `POST /api/auth/logout` (with the XSRF header; failures are ignored because the cookie may
already be gone), then it clears user data, sets `me` to `null` and refetches `me` (401) to confirm. `RequireAuth` then
redirects to `/dang-nhap?returnUrl=<page we were on>`.

**HTTP layer (`api/http.ts`).** One `send()` for everything: `credentials: 'include'`; on `POST/PUT/PATCH/DELETE` it copies
the `XSRF-TOKEN` cookie into `X-XSRF-TOKEN` (the backend answers 400 without it); non-2xx throws `ApiError` (`status`,
`problem`, Vietnamese `message` from ProblemDetails `detail`); a 401 calls the registered handler, which drops the cached
user so `RequireAuth` redirects to login. Exceptions: `/api/auth/me`, `/api/auth/logout` and `/api/auth/dev-login` treat 401
as an answer (`skipUnauthorizedHandler` for hand-written calls). `http.get/post/put/delete` is the hand-written entry point.

**NSwag clients (`api/clients.ts`).** `new AuthClient(undefined, clientFetch)` and `SystemClient`: `clientFetch` is the
`{ fetch }` object the generated code accepts, backed by the same `send()`, so generated calls get cookies, XSRF and the
401 handler for free and **reject with `ApiError`**, not `ApiException` (generated code only ever sees 2xx). New features
add their client to `clients.ts` the same way (`export const xClient = new XClient(undefined, clientFetch)`) after
regenerating with `generate-api.cmd`.

**Login page.** The login page (`/dang-nhap`): two-column acrylic card, "Đăng nhập với Google" navigates to
`/api/auth/login?returnUrl=…` (only same-origin paths are accepted), "Đăng nhập với VNeID" is disabled.
The backend redirects refused sign-ins to **`/login?error=<code>`**; `/login` is a redirect route to
`/dang-nhap` that keeps the query (D02 had only `/dang-nhap`; both work, the canonical SPA path stays `/dang-nhap`).
Messages (Vietnamese, `LoginPage.tsx`): `not_registered` (alias `unknown_email`), `inactive`, `unverified_email`,
`oauth_failed`, `access_denied`; any other code gets a generic message. `safeReturnUrl` refuses `/login` and `/dang-nhap`.

**Dev login (`vite` dev only).** In `import.meta.env.DEV` the login page also shows "Đăng nhập thử (dev)": an MSCB field
(default `T0001`) that `POST`s `/api/auth/dev-login`, runs `refreshSession`, and the page then goes to `returnUrl`. It
needs the backend in Development with `Auth:DevLogin:Enabled=true` (BACKEND.md). `DevLoginPanel` is imported lazily behind
the build-time constant, so a production build does not contain it (checked: no "Đăng nhập thử" or `DevLoginPanel` in
`wwwroot`; the string `api/auth/dev-login` still appears in the generated client and the 401 exception list, which is harmless).

**Account menu.** Name, `MSCB · unit`, role chips, and "Phiên bản" from `systemClient.info()` (`GET /api/system/info`).

### Mock auth (dev only)

`npm run dev:mock` (or `VITE_MOCK_AUTH=1 npm run dev`) makes `useMe` return a synthetic user: MSCB `T0001`, roles
`['employee','editor','admin']`, no network call. Add `?mock-view-as=1` to see the view-as bar. Logging out in mock mode shows the
login page until you reload. The switch is `import.meta.env.DEV && VITE_MOCK_AUTH === '1'`, a build-time constant, and the
mock user lives in a dynamically imported module, so production builds contain neither (checked: a build with
`VITE_MOCK_AUTH=1` still has no mock data).

## Tests

- `npm test`: vitest + Testing Library (jsdom). `format.test.ts`, `http.test.ts`, `nav.test.ts`, `returnUrl.test.ts` and
  `ui/primitives.test.tsx` (`http.test.ts` covers the XSRF header, `clientFetch` and the 401 handler). Use `renderWithTheme` from `src/test/render.tsx` for anything that needs the theme.
- `npm run test:e2e`: Playwright (`playwright.config.ts`). It starts two vite servers, so no backend is needed:
  `mock` (port 5273, `VITE_MOCK_AUTH=1`) runs `e2e/shell.spec.ts`; `plain` (port 5274) runs `e2e/auth.spec.ts` with
  `/api/auth/me` stubbed per test (401 -> login, employee and editor roles, a failing check). Chromium is installed with
  `npx playwright install chromium`.
- `npm run test:e2e:real` (`playwright.real.config.ts`, project `e2e-real`, `e2e/real.spec.ts`): the real backend, no stubs.
  Playwright starts `dotnet run --project ../HCMUSSupportV2.Backend --no-launch-profile` as Development on **5261**
  (so it can run beside your own backend on 5161; `--no-launch-profile` keeps `dotnet run` from opening a browser) and
  vite on **5275** with `API_PROXY_TARGET=http://localhost:5261` (the default dev proxy stays 5161). It needs
  `appsettings.Development.local.json` (DB; created and migrated on first start; `Auth:DevLogin:Enabled=true`) and the
  dev roster. Covers: T0001 sees the shell, name and admin nav; T0003 has no editor/admin nav and gets the 403 card on
  `/quan-tri`; unknown MSCB; unsafe call without `X-XSRF-TOKEN` -> 400 (with it -> 204); logout clears the cookie;
  switching user; `/login?error=` redirect. Existing servers on those ports are reused locally (not in CI).
- The specs write screenshots to `docs/screenshots/d02/` (1440x900 and 375x812: shell, drawer, account menu, view-as bar,
  login). Commit them when the look changes. The login shots are taken in dev, where the "Đăng nhập thử (dev)" panel shows: `git checkout docs/screenshots` after a run unless the login page itself changed.
- Feature deliveries add a Playwright smoke test per page against synthetic data (PLAN §8).
