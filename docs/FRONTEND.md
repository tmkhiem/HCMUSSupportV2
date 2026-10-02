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
4. Live counts on a nav item: set `badge: 'unread'`; `useNavBadges()` (D08) returns `{ unread }` from the cached unread count.

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

## Notification Markdown (D07a)

The contract, the spike findings and the validator test vectors are in [notification-markdown.md](notification-markdown.md).
Code lives in `src/features/notifications/`: `body/` (`NotificationBody`, `remarkVars`, `urls`), `editor/`
(`LazyNotificationMarkdownEditor` - always import this one, the editor is a separate ~1.4 MB lazy chunk -,
`NotificationMarkdownEditor`, `MarkdownPreviewPane`, `contractPlugin`) and `dev/DevMarkdownPage` (route `/dev/markdown`, registered
only when `import.meta.env.DEV`, so production builds have neither the page nor the editor chunk).

## Tin tức: inbox (D08)

Code in `src/features/notifications/inbox/` (the shared `NotificationBody` from D07a renders the post; nothing is re-implemented here).

| File | Role |
|---|---|
| `InboxPage.tsx` | `/tin-tuc` (route component, renders `<Outlet />` for the detail). Header with unread count and "Đánh dấu tất cả đã đọc"; sticky filter bar; rows; skeleton / error / empty / "Xóa bộ lọc" states |
| `InboxFilterBar.tsx`, `inboxFilters.ts` | Sticky acrylic bar: search (400 ms debounce), tag chips (multi-select, `GET /api/tags`), MUI X `DatePicker`s Từ ngày / Đến ngày, "Chưa đọc" toggle. Below `md` tags and dates fold behind a "Bộ lọc" button. **Filters live in the URL**: `?q=&tags=1,3&from=2026-01-01&to=2026-06-30&unread=1` (`parseFilters` / `serializeFilters`, malformed values are dropped; search edits use `replace`, the rest push history). `toInboxQuery` turns days into instants (`to` = 23:59:59.999 local, because the server's `to` is inclusive) |
| `InboxRow.tsx`, `LoadMore.tsx` | Row = acrylic `<a>` to `/tin-tuc/:id` (title, summary, "Ghim" / "Cần xác nhận" (`requiresAck && !ackAt`) / "Đã cập nhật" chips, attachment icon, first tag + `+N`, delivery date; unread = 800 weight + primary dot). Infinite scroll = `IntersectionObserver` on a sentinel inside `#main-content`, plus a "Tải thêm" button as the fallback |
| `NotificationDialog.tsx`, `DetailSections.tsx` | `/tin-tuc/:id` is a **nested route**: the Dialog opens over the still-mounted list (full-screen below `md`), so a deep link works and the list keeps its scroll and pages. Title, meta (date, series, tags, chips), `NotificationBody` with `vars`, attachment download links (`/api/notifications/:id/attachments/:fileId`), "Các kỳ trước" links (same series; `replace` navigation), "Xác nhận đã đọc" (then a green "Đã xác nhận lúc …" chip) |
| `inboxApi.ts`, `inboxQueries.ts`, `inboxCache.ts` | Calls and TanStack hooks. Lists, unread count, read, ack, read-all and tags use the generated `notificationsClient` / `tagsClient` (`api/clients.ts`). The detail is hand-written over `http.get`: the generated `InboxDetailDto.vars` is the abstract `JsonNode` and its `fromJS` throws |
| `inboxMock.ts` | Synthetic inbox for mock mode (26 posts, 5 unread, pinned + ack + series + vars rows + attachments) |

- **Query keys** (all start with `['inbox']`, so `clearUserData` drops them on logout / user switch): `['inbox','list',filters]` (infinite, keyset `nextCursor`, `staleTime: 0`, `keepPreviousData`), `['inbox','detail',id]`, `['inbox','tags']`, `['inbox','unread-count']`.
- **Read on open.** Once the detail is loaded and unread, the dialog posts `read` (once per post per mount; a failure does not loop). `useMarkRead` / `useAcknowledge` patch every cached list and the detail first (dot gone, badge -1) and settle on the `{count}` the server returns; an error invalidates `['inbox']`.
- **Unread badge, no live stream.** There is **no SSE / EventSource**: the owner dropped live updates, employees reload (F5) to see new posts, and the app never opens `/api/notifications/stream` (that backend endpoint stays unused). `useUnreadCount()` loads `GET unread-count` with the app; `useRefreshUnreadOnNavigation(pathname)` (mounted in `AppLayout`) refetches it on every route change; it also refetches on window focus; read / ack / read-all write the returned count into the cache. No polling interval. `useNavBadges()` maps it to the sidebar badge; `AccountMenu` shows a red dot on the avatar while it is above 0.
- **View-as.** While `me.actingAs` is set the dialog does not post `read`, "Xác nhận đã đọc" and "Đánh dấu tất cả đã đọc" are disabled with a tooltip (the server answers 403 to all three).
- **Shell change.** `AppLayout` scrolls `#main-content` to the top on navigation, except between routes that declare the same `handle.scrollGroup` (`tin-tuc` and `tin-tuc/:id`), so opening a detail keeps the list where it was.
- **Mock mode** (`VITE_MOCK_AUTH=1`): `inboxApi.ts` serves `inboxMock.ts` behind `import.meta.env.DEV && MOCK_AUTH` (no mock chunk in a production build). State lives in the module (read / ack stick until a reload); `?mock-view-as=1` makes writes answer 403; `window.__inboxMock.publish(title)` delivers a new post (visible after the next route change / list fetch).
- **Tests.** vitest: `inboxFilters.test.ts` (filters <-> URL), `inbox.test.tsx` (DTO mapping, cache patching, read/ack optimistic updates, row rendering), `lib/format.test.ts` (`formatDateTime`, `formatBytes`). Playwright project `inbox` (`e2e/inbox.spec.ts`, port 5483, mock auth) writes `docs/screenshots/d08/`. The real-backend e2e (`e2e/real.spec.ts`, last test) has T0001 create, target at T0003 and publish a post through `/api/manage/notifications`, then T0003 sees it and the badge, opens it (badge -1), acknowledges it and reloads.

## Sáng kiến, Giảng dạy, Nghiên cứu khoa học (D13)

Three feature folders, each with its own hand-written types and TanStack hooks over `http.get('/api/me/...')` (the NSwag
client has no Hrm endpoints), a `*Format.ts` (tested), a `*Mock.ts` and its pages. Mocks are dynamically imported behind
`MOCK_AUTH` (no mock chunk in production); `?scenario=empty|error` on a page URL shows the other page states.

| Folder | Route | What it does |
|---|---|---|
| `innovation/` | `/sang-kien` | `InnovationStats` (total + one `StatCard` per type, 1/2/3 columns at xs/sm/md; always the employee's totals), a debounced search that uses the server's `q`, keyset "Tải thêm" (`useInfiniteQuery`, `keepPreviousData`), `InnovationDialog` (code, type, decision, ngày/năm công nhận, năm học; full screen below `sm`) |
| `teaching/` | `/giang-day` | `YearSelect` = the §4.6 pill select fed by `teaching/years` (newest preselected), three stat cards (giờ quy đổi, lớp, môn), one `TermGroup` per học kỳ (divider + table), and the caption "Nguồn: …, cập nhật …" (each half dropped when unknown). Below `sm` the Lớp column folds under the course name, below `md` Bậc is hidden |
| `research/` | `/nckh/de-tai`, `/nckh/bai-bao` | `ResearchSwitcher`: the skewed pill (`skewX(-15deg)` parallelogram under the active link; two route links, labels shorten below `sm`). `ProjectsPage` rows with a role chip (`chu_nhiem` -> Chủ nhiệm, else Thành viên), level and funding, `ProjectDialog` with the members (chủ nhiệm first; the signed-in employee is tagged "Bạn"). `PublicationsPage` rows with `venue · year`, the DOI as `https://doi.org/…` (external link; only http(s) URLs are ever linked) and the co-authors |

- **Sticky học kỳ dividers.** `TermGroup` is a `<section>` whose divider is a block with `position: sticky; top: 0`, so the browser
  pushes it off when the next section arrives. This avoids `useStickyGroupPush` because sticky does not work on table cells
  and the groups are not rows of one table (each học kỳ has its own small table).
- **Members are not links.** The app has no page for another employee's profile, so members appear as name, MSCB and role.
- **Tests.** vitest: `innovationFormat.test.ts`, `teachingFormat.test.ts`, `researchFormat.test.ts`. Playwright project `research`
  (`e2e/research.spec.ts`, port 5593, mock auth): every page at 1440 and 375 px (no horizontal scroll at 375), search, the detail
  dialogs, the year select, load more, the switcher link, the sticky divider, and the empty/error states. Screenshots go to
  `docs/screenshots/d13/`.

## Hồ sơ: Lương, Chức vụ, Khen thưởng (D11)

Code in `src/features/profile/`: `salary/` (`SalaryPage`, `SalaryChart`, `SalaryTimeline`), `positions/` (`PositionsPage`,
`PositionTimeline`), `commendations/` (`CommendationsPage`, `CommendationGroups`), plus `careerApi.ts` (types and the
TanStack Query hooks `useSalary`, `usePositions`, `useCommendations`; they call the generated `meClient` (`api/clients.ts`) and
map the response with `meMappers.ts`), `careerFormat.ts` (`formatTenure` "3 năm 2 tháng", `formatMonthsToRaise` "còn N tháng",
`coefficientPoints` for the chart, năm học labels; tested in `careerFormat.test.ts`; partial dates use `lib/partialDate.ts`), `careerMock.ts`
(synthetic data) and `CareerBreadcrumb` ("Hồ sơ cá nhân / page", links to `/ho-so`).

- `/ho-so/luong`: five `StatCard`s (ngạch, bậc, hệ số, vượt khung %, next raise as a countdown; the card turns warm at 3 months
  or less), a MUI X `LineChart` with `curve: 'stepAfter'` of hệ số by effective date (a text summary doubles as its `aria-label`),
  and a vertical timeline of decisions (số QĐ, ngày ký, ngày hưởng, ghi chú; the newest one has the accent border).
- `/ho-so/chuc-vu`: vertical timeline; the `isCurrent` entry has a filled larger node, tinted card, "Hiện tại" chip and "Đã đảm nhiệm".
- `/ho-so/khen-thuong`: two count `StatCard`s, scrollable tabs "Khen thưởng" / "Danh hiệu", cards grouped by năm học (the null
  group is "Chưa rõ năm học", last) with a trophy / medal icon, name, `QĐ <số> · <date>` (dates honour partial precision).
- States follow UI-STYLE-GUIDE §7 through `PageState` with page-specific messages.
- Mock mode (`VITE_MOCK_AUTH=1`): the hooks return `careerMock.ts` data without a network call; append `?career=empty` or
  `?career=error` to a page URL to see the empty and error states.
- Playwright: `e2e/career.spec.ts` (project `career`, port 5383, mock auth) covers each page at 1440 and 375 px, the tab switch,
  and the empty / error states; screenshots go to `docs/screenshots/d11/`.

## Hồ sơ: Đào tạo, Bồi dưỡng, Đi công tác (D12)

Code in `src/features/profile/`: `degrees/` (`DegreesPage`, `DegreeCards`), `training/` (`TrainingPage`, `TrainingTable`), `trips/`
(`TripsPage`, `TripsTable`), plus `educationApi.ts` (types and hooks `useDegrees`, `useTrainings`, `useBusinessTrips`, hand-written
like `careerApi.ts`), `educationFormat.ts` (partial dates, `degreeYears`, `sortDegrees`, `groupTrainingsByYear`, `tripStats`; tested in
`educationFormat.test.ts`) and `educationMock.ts` (synthetic data). All three reuse `CareerBreadcrumb`.

- `/ho-so/dao-tao`: diploma-style cards, newest first. Degree type is the headline, then major, "trường · quốc gia", years, a training-form chip and the thesis title when present.
- `/ho-so/boi-duong`: trainings grouped by year, each group in the new `ui/StickyGroup` (a divider that docks at the top of the
  scroll container and is pushed off by the next one, plain `position: sticky`; category-agnostic, exported from `ui/index.ts`).
  Rows are aligned columns with a header row from `md` up and stacked on mobile.
- `/ho-so/cong-tac`: two `StatCard`s (Số chuyến, Số ngày) that follow a pill year select (caption above, UI-STYLE-GUIDE §4.6) over a trips table (nơi đến, thời gian + số ngày, mục đích, quyết định, ghi chú).
- Mock mode: `?education=empty` or `?education=error` on a page URL shows the other states.
- Playwright: `e2e/education.spec.ts` (project `education`, port 5583, mock auth) at 1440 and 375 px plus the empty / error states; screenshots go to `docs/screenshots/d12/`.

## Hồ sơ cá nhân: overview, Thông tin chung, Thông tin chi tiết (D10)

Code in `src/features/profile/`: `overview/` (`OverviewPage`, `HeroCard`, `SummaryCards` = one component per card on a shared
`SummaryCardFrame`), `general/` (`GeneralPage`, `CopyButton`), `detailed/` (`DetailedPage`, `useReveal`), plus
`api.ts` (hooks + types), `mockData.ts` and `ProfileFields.tsx` (layout only: `SectionCard`, `FieldList`, `FieldRow`,
`BackToProfile`). Routes: `/ho-so`, `/ho-so/thong-tin-chung`, `/ho-so/thong-tin-chi-tiet`.

- **API.** `api.ts` (and `careerApi.ts` for D11) call the generated `MeClient` (`meClient` in `api/clients.ts`): `overview()`,
  `general()`, `detailed()` and `reveal(new RevealRequest({ field }))`. The generated DTOs are all-optional classes with `Date`s
  (`DateOnly` arrives as UTC midnight), so `meMappers.ts` is the only place that knows them: it maps each response to the view-model
  types in `api.ts` / `careerApi.ts` (required fields, `null` for missing, dates as `yyyy-MM-dd`; `dayString` reads the UTC day so it is
  right in every time zone; tested in `meMappers.test.ts`). Query keys: `['profile', 'overview' | 'general' | 'detailed']` (dropped on user switch by `clearUserData`).
- **Overview.** Hero (photo from the profile, else `me.photoUrl` only when not viewing as someone else, else initials) and
  eight cards in a 3 / 2 / 1 column grid. `GeneralCard` and `DetailedCard` load their own queries (independent loads), the
  other six read `ProfileOverview`. A 404 or `hasProfile: false` is the empty state, not an error.
- **Partial dates.** `lib/partialDate.ts` `formatPartialDate({date, precision})` -> `dd/MM/yyyy`, `MM/yyyy` or `yyyy`; `—` when missing.
  It is the only partial-date formatter (D11's `formatCommendationDate` was removed; `CommendationEntry.decidedOn` is a `PartialDate`).
- **Reveal.** Only the masked tail is ever in the query cache. `useReveal` fetches one field at a time (each call is audited
  server-side), keeps the value in component state only, and "Ẩn" drops it. A 403 (view-as) shows "Không thể xem khi đang xem thử".
- **Mock mode.** With `VITE_MOCK_AUTH` the hooks return `mockData.ts` (synthetic T0001) without a network call. Every use is written
  `import.meta.env.DEV && MOCK_AUTH ? (await mock()).… : …` so the bundler folds it away and the dynamic `import('./mockData')`
  (and `careerMock`, `inboxMock`) never ends up in a production build (checked: `npm run build` emits no mock chunk).
- **Tests.** `src/features/profile/profile.test.tsx`, `src/lib/partialDate.test.ts`; Playwright project `profile`
  (`e2e/profile.spec.ts`, mock server) writes screenshots to `docs/screenshots/d10/`.

## Admin and group pages (D14b)

Code: `src/features/admin/` (Quản trị `AdminHomePage`, `RolesPage`, `ViewAsPage`, `AuditPage`, `SyncPage`, `DatasetsPage`) and
`src/features/manage/groups/` (`GroupsPage` master-detail, `GroupEditor`, `GroupMembers`, `RuleBuilder`, `ruleModel`).

- **Routes.** `/quan-tri` (admin) with `phan-quyen`, `xem-thu`, `nhat-ky`, `dong-bo`, `du-lieu`; `/quan-ly/nhom[/:id]` (editor and admin).
  `nhom` is one lazy route with two empty child routes, so the same `GroupsPage` stays mounted while a group is picked (the list keeps its
  search and filters; the page reads the id with `useMatch`). Below `md` it shows either the list or the detail.
- **Clients.** `features/admin/clients.ts` instantiates the generated `RolesClient`, `ViewAsClient`, `AdminEmployeesClient`,
  `DashboardClient`, `AuditClient`, `GroupsClient`, `SyncAdminClient` (sync runs and issues) and `DatasetsClient`.
- **Lists** use keyset paging (`useInfiniteQuery`, `nextCursor`, "Tải thêm"). Search inputs are debounced 300 ms.
- **Phân quyền.** Search (q, role filter), row opens a drawer with editor and admin switches; Lưu = `PUT admin/roles/{code}`; the server's 409
  (last admin) message is shown in the drawer. Role changes apply at once on the server.
- **Xem thử.** Typeahead over `admin/roles?q=` -> `POST admin/view-as` -> `refreshSession()` -> `/tin-tuc`. The yellow `ViewAsBar` "Thoát"
  already called `DELETE admin/view-as` through `exitViewAs` in `AuthProvider` (then `refreshSession`); no change was needed.
- **Nhóm.** List with kind chips, search, "show archived"; "Tạo nhóm" dialog (static or rule). Detail: name, description, kind-specific part and
  an unsaved-changes bar (Hoàn tác / Lưu, `role="region"` "Thay đổi chưa lưu"). Rule groups use `RuleBuilder` over `ruleModel` (one flat level
  of conditions joined by all/any: org_unit id + descendants, position_title eq/contains, academic_rank, degree, status, has_email) with a live
  `preview-rule` count and 10 samples; server validation errors (`$.all[i].…`) are shown under the matching condition. A stored rule with
  nested combinators is shown read-only (never silently flattened). org_unit groups: descendants switch only. Static groups: add by MSCB list,
  remove selected, csv/xlsx import with dry-run report then apply. There is no org-unit list endpoint, so org_unit conditions take the numeric unit id.
- **Nhật ký.** Filters: actor MSCB, action (from `audit/actions`, with Vietnamese labels in `auditLabels.ts`), date range; keyset paging.
- **Đồng bộ.** Open issues (resolve button) and recent runs. **Dữ liệu.** Per dataset: template download, upload -> validation report ->
  "Áp dụng" (only when `validated`).
- **Not built.** Nhân sự & email (needs `GET manage/employees`, email add/remove and bulk import endpoints) and the API-clients screen.

Tests: `src/features/manage/groups/ruleModel.test.ts` (vitest). `e2e/admin.spec.ts` (project `admin`, port 5393, mock auth, `/api/**`
stubbed by `e2e/adminFixtures.ts`) covers every page; screenshots in `docs/screenshots/d14b/`.

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
  switching user; `/login?error=` redirect; and the D08 inbox flow (T0001 publishes to T0003, badge and row, open, ack; the post is archived afterwards). Existing servers on those ports are reused locally (not in CI).
- The specs write screenshots to `docs/screenshots/d02/` (1440x900 and 375x812: shell, drawer, account menu, view-as bar,
  login). Commit them when the look changes. The login shots are taken in dev, where the "Đăng nhập thử (dev)" panel shows: `git checkout docs/screenshots` after a run unless the login page itself changed.
- `e2e/admin.spec.ts` (project `admin`, port 5393, mock auth, `/api/**` stubbed): see "Admin and group pages (D14b)". The ports are fixed in `playwright.config.ts`; two agents running Playwright at once share them and reuse each other's vite servers, so run one suite at a time per machine.
- `e2e/markdown.spec.ts` (project `markdown`, port 5373, mock auth) drives `/dev/markdown`: placeholder chips, source/diff mode, typed and pasted text, tables, the raw-HTML fallback, image upload. Screenshots go to `docs/screenshots/d07a/`. `src/features/notifications/` has the renderer tests and `mdxRoundTrip.test.tsx`.
- `e2e/inbox.spec.ts` (project `inbox`, port 5483, mock auth): list markers, infinite scroll, URL-backed filters, detail over the list and as a deep link, read-on-open, ack, read-all, view-as, mobile 375. Screenshots go to `docs/screenshots/d08/`.
- Feature deliveries add a Playwright smoke test per page against synthetic data (PLAN §8).
