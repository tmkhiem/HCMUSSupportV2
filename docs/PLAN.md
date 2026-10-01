# HCMUS Support V2: implementation plan

Based on [INVENTORY.md](INVENTORY.md). The UI follows [UI-STYLE-GUIDE.md](UI-STYLE-GUIDE.md).

**Product:** an internal portal for HCMUS employees, keyed by MSCB. It starts by delivering personal HR records and targeted
notifications, and lets HR and editors manage users, groups, roles and notifications themselves. It is built to
grow into the wider employee portal: more data sources and more sections. **Documents** and **KHCN** will later be rebuilt as
modules of this portal rather than kept as external consumers. The student portal is out of scope. **No v1 API compatibility**:
v1 data is migrated, but none of v1's routes, response shapes or tokens are kept.

**Agents:** launch implementation agents on **Sonnet 5.5** (`model: "sonnet"`). Use **Haiku** (`model: "haiku"`) only for
items tagged `[haiku]`. Each delivery below is sized for one agent, one branch and one PR.

---

## 1. Goals / non-goals

**Goals (v2.0)**
- Employees sign in with Google and see their own HRM records (profile, salary, awards, ...) and their notifications, with read/unread state.
- Editors create, edit, schedule, publish and archive notifications. A notification can target everyone, groups,
  individual employees, or recipients from an Excel upload with per-recipient variables (this covers the yearly
  "Thâm niên nhà giáo", "Nâng lương thường xuyên" and "Vượt khung" posts). A post can be cloned to make next year's.
- HR manages employees' login emails in the app instead of the Google Sheet and `users.json`, with bulk import and duplicate detection.
- RBAC: roles grant permissions. **Lookup** and **view-as** become permissions, and every use is audited.
- Postgres replaces git-as-database. HRM data arrives through an authenticated ingest pipeline with a run log.
- A module structure (backend feature folders, frontend nav groups, permissions per module) that Documents, KHCN and later
  sections can plug into, all sharing one employee identity, RBAC, groups and audit log.
- Modern UI per the style guide. Vietnamese UI text, English code.

**Non-goals (v2.0)**: student portal; email or push delivery of notifications (§9 Q6); typed per-table HRM schema (records stay
JSON rows for now, §2 ADR-4); Documents and KHCN modules (later; see §10); OIDC provider for other apps (later portal work).

---

## 2. Architecture decisions

| # | Decision | Why |
|---|---|---|
| ADR-1 | **One ASP.NET Core 8 app** serves the API and the Vite SPA (the existing scaffold). Controllers sit in **feature folders**, and each feature registers itself with `services.AddXxxFeature()`. | Simple deploy. Feature folders let new portal modules plug in without touching shared files. |
| ADR-2 | **EF Core 9 + Npgsql** with snake_case naming (`EFCore.NamingConventions`) and code-first migrations. Extensions: `citext`, `unaccent`, `pg_trgm`. | Proper relational store, case-insensitive emails, Vietnamese-insensitive search. |
| ADR-3 | **Auth:** Google auth-code popup → `POST /api/auth/google` → backend validates the id_token (audience = our client id, `email_verified`) → maps email to employee → issues **our own HttpOnly cookie session** (sliding 12 h). Data-protection keys are stored in Postgres. Antiforgery header on mutations. A **dev-only** `POST /api/auth/dev-login` signs in by MSCB; it is enabled only when `Environment=Development` and `Auth:DevLogin=true`. | Fixes v1's missing audience check, the stale-localStorage relogin and the 1 h expiry. The dev login lets agents test without Google. |
| ADR-4 | **Records** (HRM-derived personal data) are stored as `employee_records(category, employee_id, ordinal, data jsonb)`. A `record_categories` row defines the Vietnamese title, nav group, display mode (`profile` key-value, or `table`/`list`) and field definitions (`key, label, kind`). Each sync replaces a whole category in one transaction. | Feature parity with the 11 jjobs plus 3 manual datasets without hand-modelling about 200 columns now. Typed tables can come later per category. |
| ADR-5 | **Ingest over HTTPS, not DB access:** a separate `HCMUSSupportV2.Sync` console tool reads a source and POSTs to `/api/integration/v1/records/{category}` with an API-client token. Sources: `git` (reads the existing SupportHCMUSData JSON, used during the transition) and `hrm` (runs the `.jjob` SQL directly against HRM, which replaces DatabaseJobService and the git push). | The HRM box lives inside the HCMUS network and prod is on DigitalOcean, so Postgres is never exposed. One ingest path serves both sources, and the git repo can be retired later. |
| ADR-6 | **Notifications** are authored HTML (rich-text editor) with legacy `{Placeholder}` syntax. Values are **HTML-escaped** on substitution, and the result is sanitized server-side (`HtmlSanitizer`) on save and on render, plus DOMPurify on the client. Targets are all / groups / employees / recipient rows (Excel). Visibility is resolved **at read time** for group targets, so new members see posts that are still live. | Keeps the 56 legacy news files importable and closes v1's XSS hole. |
| ADR-7 | **RBAC:** permissions are code constants. Roles are DB rows (seeded system roles; admins can add custom roles). Role assignments are per employee and carry an optional group `scope` column (unused in v2.0). | Lookup and view-as stop being hardcoded lists. Leaves room to scope editors to a unit later. |
| ADR-8 | **Observability:** Serilog to console/journald and a rolling file. An `audit_log` table records sign-ins, view-as, lookup and every admin mutation. `/healthz`. **Google Drive/Sheets telemetry is dropped.** | No user OAuth token on the server. Audit data stays queryable. |
| ADR-9 | **Frontend:** React 19, MUI 9, react-router 7, `@tanstack/react-query` over the NSwag client, Tiptap (`mui-tiptap`) for the editor, DOMPurify. **One SPA**; admin routes are lazy-loaded and permission-gated. | Matches MyMentor (`D:\git\HCMUS.MyMentor\MyMentor\MyMentor.Frontend`) and the style guide. |

---

## 3. Data model (Postgres, snake_case)

```
employees            id text PK (MSCB) · hrm_nhansu_id int NULL · full_name · unit_name NULL · department_name NULL
                     · status (active|inactive) · source (hrm|manual) · synced_at · created_at · updated_at
employee_emails      email citext PK · employee_id FK · is_primary bool · source (hr|hrm|import) · created_at · created_by
roles                id · code UNIQUE · name · description · is_system bool
role_permissions     role_id FK · permission text · PK(role_id, permission)
role_assignments     employee_id FK · role_id FK · scope_group_id FK NULL · granted_by · granted_at · expires_at NULL
groups               id · code UNIQUE · name · description · kind (static|unit|rule) · rule jsonb NULL · created_by · timestamps
group_members        group_id FK · employee_id FK · added_by · added_at · PK(group_id, employee_id)

record_categories    code PK (e.g. salary-progress) · title · nav_group · sort · display (profile|table|list)
                     · fields jsonb [{key,label,kind:text|date|money|number|html}] · header_template · legacy_template
                     · source (hrm|manual) · last_synced_at · is_visible
employee_records     id bigserial · category_code FK · employee_id FK · ordinal · data jsonb · INDEX(employee_id, category_code)

notifications        id uuid · title · body_html · topic text NULL · status (draft|scheduled|published|archived)
                     · publish_at · expires_at NULL · pinned bool · audience_all bool · cloned_from uuid NULL
                     · created_by · updated_by · timestamps · xmin concurrency token
notification_targets      notification_id FK · group_id NULL · employee_id NULL · CHECK exactly one
notification_recipient_rows notification_id FK · employee_id FK · ordinal · vars jsonb · PK(notification_id, employee_id, ordinal)
notification_reads   notification_id FK · employee_id FK · read_at · PK(notification_id, employee_id)

api_clients          id · name UNIQUE · token_hash · scopes text[] · created_at · last_used_at · revoked_at NULL
sync_runs            id · source · category · started_at · finished_at · status · employees · rows · error NULL
audit_log            id bigserial · at · actor_employee_id · acting_as_employee_id NULL · action · target_type · target_id
                     · details jsonb · ip · user_agent
quick_links          id · title · url · description · nav_group · sort · is_visible   (v1's Google Form links)
data_protection_keys (EF DataProtection store)
```

Rules:
- **Who can sign in:** an employee whose status is `active` and who has an email in `employee_emails`. Emails are unique (citext PK), so a
  duplicate is rejected at write time. v1's "drop both rows" is gone.
- **A notification is visible to E** when it is published, `publish_at ≤ now`, not expired, and at least one of these holds: `audience_all`, E is in a target group,
  E is a target employee, or E has recipient rows.
- **Rendering:** each recipient row renders as one feed item, which matches v1. Read state is tracked per (notification, employee).
- **Records** are only ever returned to their owner, or to a holder of `employees.view_as` (audited).

## 4. RBAC

| Permission | employee (implicit) | editor | hr | support | admin |
|---|:-:|:-:|:-:|:-:|:-:|
| `self.read` (own records & notifications) | ✓ | ✓ | ✓ | ✓ | ✓ |
| `notifications.manage` (CRUD, publish, archive, clone, import recipients) | | ✓ | | | ✓ |
| `notifications.read_all` (admin list incl. drafts, read stats) | | ✓ | ✓ | | ✓ |
| `employees.read` (pick targets, list employees) | | ✓ | ✓ | ✓ | ✓ |
| `employees.manage` (emails, status, bulk import) | | | ✓ | | ✓ |
| `groups.manage` | | ✓ | ✓ | | ✓ |
| `employees.lookup` | | | ✓ | ✓ | ✓ |
| `employees.view_as` (read-only impersonation) | | | | ✓ | ✓ |
| `roles.manage` (assign roles; only admins can grant `admin`) | | | ✓* | | ✓ |
| `audit.read` | | | | | ✓ |
| `integrations.manage` (API clients), `sync.manage` (runs, categories, quick links) | | | | | ✓ |

\* hr can assign `editor` and `hr` only.

**Legacy mapping:** anyone in the `ViewAs` or `Lookup` lists becomes `support`. The repo owner becomes `admin`. The import report lists the
exact people so the user can review it. `Statistics` is dropped.

## 5. API surface (all under `/api`, cookie session unless noted)

```
POST   auth/google                {code}            → sets cookie, returns Me
POST   auth/logout
POST   auth/dev-login             {employeeId}      (Development only)
GET    me                         → {employee, emails, permissions[], actingAs?}

GET    records/categories         → visible categories with counts for me
GET    records/{category}         → my rows (or acting-as target's)
GET    notifications              ?unread&topic&page → my feed (rendered, sanitized)
GET    notifications/unread-count
POST   notifications/{id}/read

# management (permission-gated)
GET/POST/PUT/DELETE  admin/notifications[/{id}]
POST   admin/notifications/{id}/publish | archive | clone
POST   admin/notifications/{id}/recipients/import   (xlsx/csv: MSCB column + placeholder columns) → validation report
GET    admin/notifications/{id}/preview?employeeId=
GET    admin/notifications/{id}/stats               → targeted / read counts
GET/POST/PUT/DELETE  admin/employees[/{id}], admin/employees/{id}/emails, POST admin/employees/emails/import
GET/POST/PUT/DELETE  admin/groups[/{id}], admin/groups/{id}/members (+ import)
GET/POST/PUT/DELETE  admin/roles, admin/role-assignments
GET    admin/lookup?q=                              (unaccent + trigram, paged)
POST   admin/view-as {employeeId} · DELETE admin/view-as
GET    admin/audit?…  · GET admin/sync-runs · CRUD admin/record-categories · CRUD admin/quick-links · CRUD admin/api-clients

# integrations (Authorization: ApiKey <token>, scoped)
POST   integration/v1/records/{category}            (scope records.ingest)  gzip JSON, replaces category
POST   integration/v1/employees                     (scope employees.ingest) upsert HRM roster
GET    /healthz (no /api)
```

## 6. Frontend information architecture

The shell, nav pill, stat cards and tables all follow the style guide. Nav groups:

- **Tổng quan:**
  - Trang chủ: stat cards (unread notifications, last salary change, next raise date if present) and the latest notifications.
  - Thông báo: inbox with filters (unread, topic), each item an expandable card.
- **Hồ sơ:**
  - Hồ sơ cá nhân: tabs for general and detailed profile.
  - Quá trình công tác: tabs for salary, position, academic, training and business-mission.
  - Khen thưởng: tabs for award and title.
  - Sáng kiến.
- **Giảng dạy & NCKH:** teaching-stats, research-stats, research-papers.
- **Tiện ích:** quick links (update-info form, research profile form, innovation registration).
- **Quản trị** (shown when any admin permission is held): Thông báo · Nhân sự & email · Nhóm · Phân quyền · Tra cứu · Xem như · Nhật ký ·
  Đồng bộ & danh mục.
- While view-as is active, a persistent warning banner shows "Đang xem với tư cách …" with an exit button, and all mutations are disabled.

The record pages render from `record_categories.fields` through one generic component (`profile` uses a key-value card grid, `table` uses a
sticky-header grouped table), so a new category from a new data source needs **no frontend code**.

---

## 7. Conventions for parallel agents (read before starting any delivery)

- **Branching:** branch `feat/d<NN>-<slug>` from `main`, one PR per delivery, rebased on `main` before merge. End PR descriptions with the attribution lines.
- **Backend layout:** `Features/<Feature>/{<Feature>Controller.cs, <Feature>Service.cs, Dtos.cs, <Feature>Feature.cs}`.
  Entity configuration goes in `Data/Configurations/<Entity>Configuration.cs`. In `Program.cs`, a delivery only adds one `builder.Services.AddXxxFeature()` line.
- **Migrations:** each delivery adds **one** migration named `D<NN>_<Name>`, generated **last, after rebasing**. If
  `AppDbContextModelSnapshot.cs` conflicts, delete your own migration, rebase and regenerate it. Never edit another delivery's migration.
- **API client:** `HCMUSSupportV2.Frontend/src/api/generated-client.ts` is generated by `generate-api.cmd` and committed. Never edit it by hand.
  On a conflict, regenerate it.
- **Frontend layout:** `src/features/<feature>/…`. Nav entries go in `src/app/navigation.ts` and routes in `src/app/routes.tsx`, one entry per line to keep merges trivial.
  Shared UI goes in `src/components/` (StatCard, SectionCard, PillSelect, PageState, …), built in D01.
- **Config and secrets:** commit nothing secret. The dev connection string goes in `appsettings.Development.local.json` (gitignored, loaded by
  `Program.cs`) or user-secrets. Dev DB: `10.0.0.11:65432`, user `sa`, database `hcmus_support_dev`. Tests use a throwaway database,
  `hcmus_support_test_<guid>`, created and dropped per test run.
- **Tests:** `HCMUSSupportV2.Backend.Tests` (xUnit, `WebApplicationFactory`, real Postgres) covers every endpoint's happy path and its authorization
  denial. Frontend uses vitest for pure helpers (formatting, date parsing, placeholder rendering).
- **Language:** UI text is Vietnamese. Identifiers, comments and commit messages are English. Show missing values as `—` and use ` · ` as the separator.
- **PII:** never log record `data`, emails or tokens. Never put real employee data in fixtures. Use synthetic MSCBs such as `T0001`.

---

## 8. Deliveries

Dependency graph (→ means "must be merged first"):

```
D01 Backend foundation ─┬─► D03 Auth & session ─┬─► D04 People & access ──┬─► D08 Lookup / view-as / audit
D02 Frontend shell ─────┘                       ├─► D05 Records ──────────┼─► D09 Sync tool (git, hrm)
                                                ├─► D06 Notifications API ┴─► D10 Legacy migration
                                                │        └─► D07 Notifications UI
                                                └─► D11 API clients & module seams
D12 Infra & deploy (independent, start anytime) · D13 Security cleanup (independent) · D14 Parity & cutover (last)
```

Parallel lanes:
- **Wave 0:** D01 ‖ D02 ‖ D12 ‖ D13.
- **Wave 1:** D03.
- **Wave 2:** D04 ‖ D05 ‖ D06 ‖ D11.
- **Wave 3:** D07 ‖ D08 ‖ D09 ‖ D10.
- **Wave 4:** D14.

### D01: Backend foundation
- [ ] Swap the SqlServer package for `Npgsql.EntityFrameworkCore.PostgreSQL` 9 plus `EFCore.NamingConventions`. Wire up `AppDbContext`, `UseSnakeCaseNamingConvention()` and the extensions `citext`, `unaccent` and `pg_trgm`.
- [ ] Load `appsettings.{Env}.local.json`, add `ConnectionStrings:Default`, and add a `.local.json.example` template.
- [ ] Serilog (console plus rolling file), ProblemDetails for errors, `/healthz` (DB check), forwarded headers (already present).
- [ ] Feature-folder skeleton with an `AddXxxFeature()` pattern and a sample `Features/System/SystemController` (`GET /api/system/info` → version).
- [ ] Baseline migration `D01_Initial` containing `audit_log` and `data_protection_keys`, plus an `IAuditLogger` service.
- [ ] Test project `HCMUSSupportV2.Backend.Tests` with a Postgres fixture (DB per run) added to the sln.
- [ ] Vite dev proxy `/api` → `http://localhost:5161`. `generate-api.cmd` still works.
- **Done when:** `dotnet test` is green against the dev PG, `dotnet run` serves `/healthz` = Healthy, and `generate-api.cmd` emits a client containing `SystemClient`.

### D02: Frontend shell (style guide port)
- [ ] Install MUI 9, Emotion, react-router 7, react-query and DOMPurify. Add Inter, `theme.ts` and `index.css` (style guide §2). Copy `cardFlyIn.ts`,
      `CardWatermarkIcon.tsx`, `TabbedPanel.tsx`, `useFillHeight.ts`, `useStickyGroupPush.ts` and `groupBySemester.ts` (as `groupByPeriod`) from
      `D:\git\HCMUS.MyMentor\MyMentor\MyMentor.Frontend\src`.
- [ ] `AppLayout`: 260 px drawer, nav pill, glass AppBar, mobile drawer, logout fade (§3). It is driven by a **permission-aware** `navigation.ts`.
- [ ] Shared components: `StatCard` (single, de-duplicated), `SectionCard`, `PillSelect`, `PageState` (error, loading and empty, §7), `StatusBanner`,
      `SafeHtml` (DOMPurify, legacy table CSS from v1's `styles/table.css`), and the formatting helpers (`—`, ` · `, money, tolerant date parse) with vitest tests.
- [ ] An `AuthProvider` stub (`useMe()`, `hasPermission()`), `RequireAuth` and `RequirePermission` guards, and a login page shell (style guide §4.12; the Google button comes in D03).
- [ ] `index.html` with lang `vi`, title "Support HCMUS", and favicon. Placeholder pages for every nav entry in §6.
- **Done when:** `npm run build` and `npm run lint` are clean, and the shell matches the style guide on desktop and at 375 px (screenshot both in the PR).

### D03: Auth & session (needs D01, D02)
- [ ] Minimal `employees`, `employee_emails`, `roles`, `role_permissions` and `role_assignments` entities, with migration `D03_Identity`.
      D04 builds the management on top of these.
- [ ] `Permissions` constants (§4), seeded system roles, and a policy-per-permission authorization handler that reads assignments, cached per request.
- [ ] `POST /api/auth/google`: exchange the code with the configured Google client, validate the id_token (audience, issuer, `email_verified`), map the email to an
      employee, and issue the cookie session (HttpOnly, Secure, SameSite=Lax, sliding 12 h). Store data-protection keys in PG. Add the antiforgery header.
- [ ] `POST /api/auth/logout`, `GET /api/me`, and dev-login gated by environment and config. Audit `auth.login`, `auth.login_denied` and `auth.logout`.
- [ ] Frontend: `@react-oauth/google` auth-code popup, wire up `AuthProvider` with real data, handle 401 by redirecting to login, and make logout actually log out.
- [ ] Config keys `Auth:Google:ClientId` and `Auth:Google:ClientSecret` go in local or secret config only.
- **Done when:** tests cover a valid token, a wrong audience, an unverified email, an unknown email, an inactive employee and dev-login being off in Production; a manual Google sign-in works on localhost.

### D04: People & access management (needs D03)
- [ ] Employees admin: list with search and paging, detail, status, and email CRUD (unique emails, with a clear error on duplicates).
- [ ] **Bulk email import** (xlsx/csv, the same columns as the "Dữ liệu chính" sheet: MSCB, name, email1..6). Dry run → report (new, changed,
      duplicate id, duplicate email, unknown MSCB) → apply. This replaces the Google Sheet and `scripts/main.py`.
- [ ] Groups: CRUD, members (add, remove, csv import), and `kind=unit` groups auto-maintained from `employees.unit_name` (refreshed after roster ingest).
- [ ] Roles: list and custom-role CRUD (permission checklist), assignment UI, and the rule that only admins grant `admin`.
- [ ] Audit every mutation.
- **Done when:** an HR user can onboard a new staff email end to end in the UI, and an editor cannot open HR pages (403 from the API and hidden in the nav).

### D05: Records (needs D03)
- [ ] `record_categories` and `employee_records`, migration `D05_Records`, and a seed of the 14 categories (§6 groups) **with field definitions**.
      `[haiku]` sub-task: extract the Vietnamese labels for each field from each `.jjob` `Template` in `docs/jjobs` and from the manual datasets' templates.
- [ ] `RecordIngestService`: validate the payload against the category, replace the category atomically, write `sync_runs`, and reject a payload whose row
      count drops more than X% unless `force=true` (guards against v1's silent truncation).
- [ ] Ingest endpoints `integration/v1/records/{category}` and `integration/v1/employees` (roster upsert, which feeds `employees`). Use a minimal
      `api_clients` table with hashed tokens; D11 adds the management UI.
- [ ] Employee API: `GET records/categories` and `GET records/{category}` (owner only, honouring acting-as once D08 lands).
- [ ] Frontend: a generic `RecordView` (profile cards or a table per `display` and `fields`), the Hồ sơ, Quá trình, Khen thưởng, Sáng kiến and Giảng dạy & NCKH pages, and Trang chủ stat cards.
- **Done when:** ingesting a synthetic fixture of every category renders correctly, a user never sees another user's rows (test), and the truncation guard is tested.

### D06: Notifications API (needs D03; group targeting needs D04's tables, so coordinate or stub)
- [ ] Entities and migration `D06_Notifications` as in §3. Status machine: draft → scheduled/published → archived. Optimistic concurrency.
- [ ] Rendering: escape each `{Placeholder}` value, sanitize with `HtmlSanitizer` (allowlist that keeps tables and inline styles needed by legacy news), one item per recipient row,
      and an optional `[dd/MM/yyyy]` header prefix flag.
- [ ] Visibility query (§3) as one indexed SQL query, paged. Unread count and mark-read.
- [ ] Admin CRUD, publish (immediate or scheduled via `publish_at`), archive, **clone** (copies body and targets, not recipient rows), preview as an employee,
      and stats (targeted vs read).
- [ ] Recipient import: xlsx/csv with an MSCB column plus placeholder columns → validation report (unknown MSCB, placeholders that are missing or unused) → apply.
- [ ] Audit every management action.
- **Done when:** tests show an all/group/employee/recipient-row target each reaching exactly the right people, a scheduled post is invisible before `publish_at`, and XSS in a variable is escaped.

### D07: Notifications UI (needs D06)
- [ ] Employee: Thông báo inbox (filters, unread dot, expandable cards via `SafeHtml`, mark read on expand), an unread badge on the nav and AppBar, and the latest-notifications section on Trang chủ.
- [ ] Editor: list (status chips, filters), editor page (title, topic, `mui-tiptap` body with a **placeholder-insert menu** fed from the imported column names,
      publish/expire dates, pinned), a targeting panel (all / group picker / employee picker / recipient upload with the validation report), a preview-as
      picker, and buttons for clone, publish and archive.
- [ ] A stats drawer showing targeted, read and the read %.
- **Done when:** an editor can make "Nâng lương thường xuyên 2026" by cloning the 2025 post and uploading this year's Excel, preview it as one recipient and publish it, and that recipient sees it with the unread badge.

### D08: Lookup, view-as, audit (needs D04, D05, D06)
- [ ] `admin/lookup`: search by id, name (`unaccent` + trigram) or email, paged, 300 ms debounced UI showing results as `Name · MSCB` with the email underneath.
- [ ] View-as: a session claim `acting_as` set and cleared via the API, read-only (mutations rejected while it is active), used by records and notifications for reads, with the UI banner and
      an audit entry per start/stop **and per record or notification read**.
- [ ] Audit log viewer (filters: actor, action, date range).
- [ ] Decide on PII masking under view-as (§9 Q4) and implement the chosen default.
- **Done when:** a support user can look up a person, view as them and exit; every step appears in the audit log; and an employee without the permission gets 403.

### D09: Sync tool (needs D05)
- [ ] New project `HCMUSSupportV2.Sync` (.NET 8 console): `sync --source git --path <SupportHCMUSData> [--category X]`. It reads v1 JSON (all chunks), strips the
      braces from keys, and POSTs gzipped JSON to the ingest API. It also derives the employee roster from general-profile.
- [ ] `sync --source hrm --jobs <dir of .jjob>`: runs each `SqlQuery` against HRM (`Microsoft.Data.SqlClient`) and maps columns to fields the same way,
      with **no** template rendering. Fix the known SQL issues and document each change: remove the business-mission debug filter on a single hardcoded MSCB, and fix
      the academic-progress country join.
- [ ] Config via an appsettings file and env vars (API base URL, API token, HRM connection string). Exit codes and a summary line per category. Docs for running it from
      Windows Task Scheduler at 22:30 on the HRM box.
- **Done when:** a dry run against a local SupportHCMUSData checkout reproduces the per-category employee and row counts listed in INVENTORY §4, and a real run against dev ingests everything.

### D10: Legacy migration (needs D04, D05, D06)
- [ ] An idempotent `migrate-legacy` command (in the Sync tool or a backend CLI verb) covering:
  - [ ] `users.json` → employees and emails (source `hr`), with a report of conflicts against the HRM roster.
  - [ ] `privileged.users.json` → `support` role assignments, plus an `admin` assignment for the owner. Print the list for the user to review.
  - [ ] `notifications/news/*.json` (56 files, ignoring `.old` and `backup/`) → notifications (status `published`, `publish_at = datestr`,
        recipient rows from `values`, entity-decoded titles, sanitized bodies). Files that list about 1,800 ids become `audience_all` where that matches the active roster.
  - [ ] teaching-stats (4 years), research-stats and paper-details → manual record categories.
  - [ ] request-update-info → a pinned `audience_all` notification. Google Form URLs → `quick_links`.
  - `apps.json` is **not** migrated. The v1 S2S endpoint and its tokens are retired.
- **Done when:** a re-run is a no-op, and a spot check of 5 real users shows the same news items and records as v1 (§D14 script).

### D11: API clients & module seams (needs D03)
- [ ] API-client management UI and API: create (the token is shown once), revoke, scopes, last used. The first client is the Sync tool (D09).
- [ ] Rate limiting (`AddRateLimiter`) on `auth/*` and `integration/*`.
- [ ] Write down the module contract in `docs/MODULES.md` (§10), and prove it with the existing features: each feature declares its permissions,
      nav entries and DI registration in one place. A new module must not need edits to shared core files beyond one registration line each.
- **Done when:** a revoked token gets 401 (tested), and `docs/MODULES.md` walks through adding a dummy module end to end.

### D12: Infra & deploy (independent)
- [ ] Provision a new droplet (recommended: Debian 13, 2 vCPU / 4 GB) with PostgreSQL 17 (local, listening on localhost only), .NET 8 runtime and nginx.
- [ ] A system user `hcmus-support`, a systemd unit with `Restart=always` and env-file secrets, and `/healthz` checked by DO uptime monitoring.
- [ ] nginx: TLS (certbot, apex and www), `/api` → the app, SPA fallback, the COOP `same-origin-allow-popups` header on HTML, `client_max_body_size` for the ingest
      payload (about 10 MB gzipped), and a basic rate limit. CORS isn't needed (same origin).
- [ ] Nightly `pg_dump` to off-box storage (DO Spaces), 14 daily and 8 weekly copies, plus a **tested restore**. Journald size cap.
- [ ] `deploy.ps1`: `dotnet publish -c Release -r linux-x64 --self-contained false` (frontend built by the msbuild target) → rsync → restart → health check.
- [ ] Runbook `docs/OPERATIONS.md`.
- **Done when:** the staging hostname serves the D01 build over TLS, a reboot brings it back, and a restore drill is documented.

### D13: Security cleanup (independent, `[haiku]` for the inventory parts)
- [ ] Rotate: the Google OAuth client secret (v1 hard-coded), the GitHub PAT in `GitIntegrationTest`, the HRM `sa` password (exposed in 3 files), and the v1 S2S app tokens (revoke them at cutover).
      Remove the plaintext password from `/root/.gitconfig` on prod. Fix `scripts/sheets.py`, which prints the service account. Each item is a checklist entry for the user, because rotations need a human.
- [ ] Create a least-privilege, **read-only** HRM SQL login for the Sync tool, limited to the `NS_*` and `DM_*` tables in §INVENTORY.
- [ ] Decide what to do with PII in the SupportHCMUSData git history after cutover: archive it as a private repo, or purge it.
- **Done when:** every listed credential is rotated or confirmed dead, and the user has ticked it off.

### D14: Parity check & cutover (last)
- [ ] A parity script: for N sample MSCBs × every category, compare v1 `/api/viewas` (as a privileged user) with the v2 records and notifications counts and key fields.
- [ ] Run v2 on staging, with a daily `sync --source git` after 22:30, for one week. Then switch to `--source hrm` on the HRM box and stop the git push.
- [ ] Update the Google OAuth client: authorized origins and redirect URIs for the new host (dev `http://localhost:5173` as well).
- [ ] Cutover: lower the DNS TTL, then switch DNS (or nginx). Keep v1 running read-only on the old droplet for 30 days, then decommission it (the droplet and the `/tchc` remnants).
- [ ] Tell the KHCN and Documents owners that the v1 user-dump endpoint goes away at cutover. They are not migrated; they are rebuilt as modules later.
- **Done when:** the parity report is clean and real staff can sign in on the production host.

---

## 9. Decisions needed (defaults the agents use unless told otherwise)

| # | Question | Default |
|---|---|---|
| Q1 | Hosting: a new droplet, or resize the old one? Postgres on the box or managed? | New Debian 13 droplet, 2 vCPU / 4 GB, local PG 17 + off-box dumps. |
| Q2 | Which machine runs the HRM sync (where does today's 22:30 "HRM-Database" commit come from)? | The same internal Windows box, on Task Scheduler. |
| Q3 | Who can sign in: only HR-curated emails (as in v1), or every active HRM employee with an HRM email? | HR-curated plus HRM emails imported as `source=hrm` but **not** login-enabled until HR confirms them. |
| Q4 | Does view-as show PII (national ID, bank account, tax code, insurance)? | Masked, except the last 4 digits; the full value only to `admin`. |
| Q5 | Can editors target everyone, or only their own unit? | Everyone (global). The schema supports scoping later. |
| Q6 | Email notifications on publish? | Not in v2.0. Design the `notifications` table so an outbox can be added. |
| Q7 | Google OAuth client: reuse v1's client (add origins) or create a new one in a new GCP project? | Reuse it, add the localhost and staging origins, rotate the secret. |

---

## 10. Future modules (Documents, KHCN, …)

These are not part of v2.0, but v2.0 must not block them:

- **Shared core:** employees, emails, groups, RBAC, audit log, notifications and records. A module gets these by dependency, never by copying them.
  For example, Documents can notify a group through the notifications service, and KHCN can publish research data as record categories (research-stats and
  research-papers already sit there).
- **Module shape:** backend `Features/<Module>/…` with its own `AddXxxFeature()`, permission constants prefixed with the module
  (`documents.*`, `khcn.*`), and its own migrations (`D<NN>_<Module>_…`). Frontend `src/features/<module>/` with its own nav group
  and routes, gated by those permissions.
- **Data from other systems** arrives through `integration/v1/*` with a scoped API client, the same way the HRM sync does.
- **Integration targets** (BSC/HRM, EMIS, KHCN DB, …) are separate adapters in the Sync tool. They are not in the web app.

