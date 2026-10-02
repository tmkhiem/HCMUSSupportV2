# HCMUS Support V2: implementation plan

Inputs: [INVENTORY.md](INVENTORY.md) (the legacy system and the desired UI build) and [UI-STYLE-GUIDE.md](UI-STYLE-GUIDE.md).

**Product.** An internal portal for HCMUS employees. It starts with targeted notifications and each employee's own HRM
records, and grows into the wider employee portal. Documents and KHCN will later be rebuilt as modules of it (§11). The
student portal is out of scope.

**Ground rules**
- **No v1 compatibility.** v1 data is migrated once; v1's routes, payload shapes, tokens and storage format are all dropped.
- **Modern-first.** Postgres is designed for this app, around notifications. Every HRM category is typed and gets its own page.
- **Doc precedence for UI:** this plan's §7 (the look of `D:\git\SupportHcmusV2PromptingFEBuild`, rebuilt on MUI v9) beats
  UI-STYLE-GUIDE.md. The style guide still governs the MUI mechanics: per-path imports, page states, tables, formatting, a11y and helpers.
- **Agents:** run implementation agents on **Sonnet 5.5** (`model: "sonnet"`). Use **Haiku** only for items tagged `[haiku]`.
  Each delivery is one agent, one branch, one PR.

---

## 1. Goals / non-goals

**Goals (v2.0)**
1. Employees sign in with Google using any of their HCMUS emails. Each email maps to one MSCB, and an employee can have
   several emails across HCMUS subdomains.
2. **Tin tức**, a personal, searchable notification inbox:
   - unread state and optional "xác nhận đã đọc" (acknowledge)
   - attachments
   - live unread badge
3. **Editors**:
   - Write notifications in **Markdown** (MDXEditor) with per-recipient placeholders, and see a live **preview as any MSCB**.
   - Target them at everyone, groups (static, org-unit or rule-based), individual employees, or an uploaded recipient sheet.
   - Schedule, publish and archive them, and clone last year's post in a series. This covers the yearly "Thâm niên nhà giáo",
     "Nâng lương thường xuyên" and "Vượt khung" posts.
   - **Maintain the MSCB ↔ email mapping**, which replaces the Google Sheet and `users.json`.
4. Bespoke **Hồ sơ** pages per category: general, detailed, salary, positions, commendations, degrees, training and
   business trips. Also **Sáng kiến**, **Giảng dạy** and **Nghiên cứu khoa học**.
5. Three roles: **employee** (implicit), **editor** and **admin**. Admins have full rights, including granting any role to any
   employee. View-as is admin-only and audited.
6. Typed HRM data arrives through an authenticated ingest pipeline. Every run is logged, with a guard against truncated data.
   Git-as-database is retired.

**Non-goals (v2.0):** student portal; email or Web Push delivery (the schema leaves room for an outbox); Documents and KHCN modules;
acting as an OIDC provider for other apps; VNeID sign-in (the login screen shows it disabled, as the build does).

---

## 2. Platform

| Layer | Choice |
|---|---|
| Runtime | **.NET 8** (`net8.0`, as scaffolded; built with the installed SDK 9). The owner decided to stay on 8 (§10 Q1). Support ends 2026-11-10, so retargeting later should be a one-line TFM change: avoid APIs that only exist in .NET 9+, such as `Guid.CreateVersion7`. |
| Backend | ASP.NET Core 8 controllers organised as feature modules. EF Core 9 + `Npgsql.EntityFrameworkCore.PostgreSQL` 9 (both run on net8.0), snake_case via `EFCore.NamingConventions`. NSwag generates the TS client, with `generate-api.ps1` unchanged. **Markdig** validates notification Markdown and extracts plain text. |
| Database | **PostgreSQL 17**. Dev is 17.11 at `10.0.0.11:65432`, and prod uses the same major version. Extensions available on dev: `citext`, `unaccent`, `pg_trgm`, `pgcrypto`, `pg_stat_statements`. Use `MERGE … WHEN NOT MATCHED BY SOURCE` (PG 17) and stored generated columns. Client tools are in `D:\tools\pgsql\bin` (`psql`, `pg_dump`). |
| IDs | `uuid` v7 for notifications, files and imports, generated in the app with the `UUIDNext` package (PG 17 has no `uuidv7()`). They are time-ordered and safe to expose. `bigint identity` elsewhere. The MSCB is a natural key. |
| Auth | Server-side Google OIDC (`/api/auth/login` redirect, as in the build). An HttpOnly `__Host-` session cookie, sliding 12 h. Data-protection keys stored in PG. |
| Background work | One PG-backed job queue (`jobs` table, `FOR UPDATE SKIP LOCKED`) drained by a hosted service. No Hangfire or Redis. |
| Realtime | Server-Sent Events (`GET /api/notifications/stream`), fed by PG `LISTEN/NOTIFY`, so it keeps working with more than one instance. |
| Files | `IFileStore` with local-disk storage (`/var/lib/hcmus-support/files`) and an S3-compatible option. Size and MIME allowlist. |
| Observability | Serilog to journald and a rolling file. OpenTelemetry traces and metrics, with OTLP export when configured. `/healthz`. An `audit_log` table. |
| Frontend | React 19, **MUI v9 re-themed** (§7), `@mui/icons-material`, react-router 7 (data router, lazy routes, real URLs), TanStack Query 5, react-hook-form + zod, MUI X Date Pickers and Charts, **MDXEditor** (`@mdxeditor/editor`) for writing notifications, `react-markdown` + `remark-gfm` + `remark-directive` for rendering them (raw HTML off), Vite 8 with React Compiler (already scaffolded). |
| Sync | A separate `HCMUSSupportV2.Sync` console tool runs inside the HCMUS network. It reads HRM SQL Server and POSTs typed batches to the ingest API, so the database is never exposed. |

---

## 3. Data model

PostgreSQL, snake_case. `→` marks an FK. Unless noted, every table has `created_at` and `updated_at`.

### 3.1 People & access

```
org_units           id bigint PK · hrm_id int UNIQUE · parent_id → org_units NULL · kind (unit|department) · name · code NULL · is_active
employees           code text PK (MSCB) · hrm_id int UNIQUE NULL · full_name · full_name_unaccent (generated, trigram GIN)
                    · org_unit_id → org_units NULL · department_id → org_units NULL · position_title NULL · academic_rank NULL
                    · degree NULL · status (active|inactive|retired) · photo_url NULL · source (hrm|manual) · synced_at
employee_emails     email citext PK · employee_code → employees · is_primary · note NULL · added_by → employees · added_at
                    (no domain CHECK: some staff use external addresses)
role_assignments    employee_code → employees · role text CHECK (role IN ('editor','admin')) · granted_by · granted_at
                    · PK(employee_code, role)        -- "employee" is implicit
groups              id bigint PK · name UNIQUE · description · kind (static|org_unit|rule) · org_unit_id NULL · include_descendants bool
                    · rule jsonb NULL · member_count int (maintained) · created_by · archived_at NULL
group_members       group_id → groups · employee_code → employees · source (manual|computed) · added_by NULL · added_at
                    · PK(group_id, employee_code) · INDEX(employee_code)
```

- **Sign-in:** a verified Google email is looked up in `employee_emails`. It must belong to an `active` employee. An email maps to
  exactly one MSCB (the PK enforces it), and an employee may have many emails.
- **MSCB:** HRM has 9 duplicate MSCBs. Sync puts the duplicates in `sync_issues` and does not guess, and an admin resolves them.
- **Rule groups:** a `rule` is a small JSON filter over `org_unit` (with descendants), `position_title`, `academic_rank`, `degree`,
  `status`, the current salary grade, or "has an active email". Members are recomputed (`source=computed`) after each roster
  sync and whenever the rule changes, and the editor sees a live preview count. `org_unit` groups are auto-created per unit.

### 3.2 HRM domain (typed; one table per category, each with its own page)

`hrm_id` is the HRM source row id, unique per table. It drives the upserts. Dates use `date` plus a `*_precision`
(`day|month|year`) column wherever HRM stores partial dates.

```
employee_profiles     employee_code PK → employees · last_name · first_name · date_of_birth · gender · ethnicity · religion · nationality
                      · birth_place · hometown · phone_mobile · phone_home · personal_email
                      · permanent_address · contact_address (text, plus ward/district/province columns)
                      · salary_grade_code · salary_grade_name · salary_step · salary_coefficient numeric(5,2)
                      · education_level · political_theory · party_joined_on · youth_union_joined_on · trade_union_joined_on
employee_sensitive    employee_code PK → employees · national_id · national_id_issued_on · national_id_issued_by
                      · tax_code · bank_name · bank_branch · bank_account · social_insurance_no · health_insurance_no
                      (separate table: never returned in a list, masked by default, every reveal is audited)
salary_history        id · hrm_id · employee_code · grade_code · grade_name · step · coefficient numeric(5,2) · over_grade_pct numeric(5,2) NULL
                      · decision_no · signed_on · effective_from · next_raise_on NULL · note
position_history      id · hrm_id · employee_code · title · unit_description · coefficient numeric(4,2) NULL · appointed_on
                      · decision_no · signed_on · ended_on NULL
commendations         id · hrm_id · employee_code · kind (award|title) · name · academic_year NULL · decision_no · decided_on
academic_degrees      id · hrm_id · employee_code · degree_type · major · institution · country · training_form
                      · enrolled_on · graduated_on · thesis_title NULL
trainings             id · hrm_id · employee_code · content · place · training_form · start_on · end_on
business_trips        id · hrm_id · employee_code · from_on · to_on · place · purpose · transport · decision_no · decided_on · note
innovations           id · hrm_id · employee_code · code · title · type · decision_no · recognized_on · academic_year NULL
teaching_loads        id · employee_code · academic_year ('2024-2025') · term (1|2|3) · course_code · course_name · class_code
                      · level (dh|sdh|…) · periods int · standard_hours numeric(7,2) · source_import_id → imports
research_projects     id · code UNIQUE · title · level · research_type · funding numeric(14,0) NULL · period_text · accepted_on NULL · result
research_project_members  project_id → research_projects · employee_code · role (chu_nhiem|thanh_vien|…) · PK(project_id, employee_code)
publications          id · doi UNIQUE NULL · eid UNIQUE NULL · title · venue · year · details · url NULL
publication_authors   publication_id → publications · employee_code · ordinal · PK(publication_id, employee_code)
```

**Sources**
- HRM jobs feed `employee_profiles`, `employee_sensitive`, salary, position, commendations, degrees, trainings, business trips and innovations.
- Admin Excel imports feed `teaching_loads`, `research_*` and `publications` until a KHCN or academic-affairs integration exists.
  The importer replaces data per academic year or per dataset.

### 3.3 Notifications

Fan-out happens on write: every recipient gets a delivery row, so inbox reads are a single index range scan.

```
tags                     id · name UNIQUE · color · sort
notification_series      id · name UNIQUE · description          -- "Nâng lương thường xuyên", "Thâm niên nhà giáo", …
notifications            id uuid v7 PK · series_id → notification_series NULL · title · summary (auto from first paragraph, editable)
                         · body_md text (GFM Markdown with :var[...] placeholders) · content_text text (plain text for search and preview)
                         · variables jsonb  [{key, label, type: text|date|number|money}]
                         · status (draft|scheduled|published|archived) · publish_at NULL · published_at NULL · expires_at NULL
                         · pinned_until NULL · requires_ack bool · audience_all bool · recipient_count int · read_count int · ack_count int
                         · version int · created_by · updated_by
                         · search tsvector GENERATED (vn_unaccent: title A, summary B, content_text C) · GIN(search)
notification_tags        notification_id · tag_id · PK(notification_id, tag_id)
notification_revisions   notification_id · version · title · content · variables · edited_by · edited_at · PK(notification_id, version)
notification_audiences   id · notification_id · kind (all|group|employee|import) · group_id NULL · employee_code NULL · import_id NULL
                         -- what the editor chose; kept so late joiners can be backfilled
notification_deliveries  employee_code · notification_id · vars jsonb NULL (array of row objects; one item per row)
                         · delivered_at · read_at NULL · acknowledged_at NULL · dismissed_at NULL
                         · PK(employee_code, notification_id)
                         · INDEX(employee_code, delivered_at DESC) INCLUDE (read_at)
                         · partial INDEX(employee_code) WHERE read_at IS NULL     -- unread badge
                         · INDEX(notification_id)                                  -- stats, recall
notification_attachments id uuid v7 · notification_id · file_id → files · sort
imports                  id uuid v7 · kind (notification_recipients|employee_emails|group_members|teaching|research|publications)
                         · file_id → files · status (validated|applied|rejected) · summary jsonb · report jsonb · created_by
files                    id uuid v7 · storage_key · file_name · content_type · size_bytes · sha256 · uploaded_by
```

**Lifecycle and mechanics**
- **Publish:** at `publish_at`, or straight away, a job resolves the audiences into recipients. That is the union of all active
  employees (when `audience_all`), group members, named employees and imported rows. It inserts deliveries with
  `INSERT … SELECT … ON CONFLICT DO NOTHING`, sets the counters, and sends `NOTIFY notifications, <employee batch>`.
  About 6k employees means roughly 6k rows per broadcast, so no partitioning is needed. Revisit at 10M deliveries (yearly range partitions on `delivered_at`).
- **Late joiners:** when someone is added to a group, or a new employee or email appears, a job backfills deliveries for
  published, unexpired notifications that target that group or everyone. Removing someone from a group keeps what they already received.
- **Edits after publish:** a new `notification_revisions` row is written and `version` goes up. Deliveries are unchanged, and the
  inbox shows "Đã cập nhật". Variables are never re-imported silently; a re-import goes through a validated `imports` row.
- **Body format:** v1 baked HTML; **v2 stores Markdown.** The body is GFM (headings, emphasis, lists, tables, links, and images
  served from `files`) with **placeholders written as text directives**: `:var[HeSoLuong]`. MDXEditor shows each one as a chip through a
  custom directive descriptor. Raw HTML and unknown directives are rejected on save; the server checks with Markdig and
  extracts `content_text` and `summary`. The set of placeholders used must be a subset of `variables`.
- **Rendering:** the client renders `body_md` with `react-markdown` + `remark-gfm` + `remark-directive` and a small remark plugin.
  The plugin replaces each `:var[key]` with a **text node** holding the recipient's value, so values can never inject markup.
  A missing value renders as `—`, and HTML is skipped. Recipients with several `vars` rows get one rendered block per row.
  The same `NotificationBody` component renders the inbox, the editor preview and the admin preview.
- **Preview as an MSCB:** in the editor, the preview pane renders the **unsaved** draft with the variables of an MSCB picked from the
  imported recipients or the targeted employees. Variables come from `GET manage/notifications/{id}/preview-vars?employee=`, or straight
  from the uncommitted import report before it is applied. It also shows whether that MSCB is actually in the audience.
- **Feed query** (keyset pagination on `(delivered_at, notification_id)`):
  - deliveries ⋈ notifications, where status is published and the post is not expired
  - optional filters: tags, date range, `search @@ websearch_to_tsquery('vn_unaccent', q)`, unread only
  - ordered by currently pinned first, then `delivered_at DESC`
- **Recall:** archiving hides the post from inboxes but keeps the deliveries, for audit.

### 3.4 Platform

```
jobs             id bigint · type · payload jsonb · run_at · attempts · max_attempts · locked_until NULL · last_error NULL · done_at NULL
                 · partial INDEX(run_at) WHERE done_at IS NULL
api_clients      id · name UNIQUE · token_hash · scopes text[] · last_used_at · revoked_at NULL
sync_runs        id · source · dataset · started_at · finished_at · status · inserted · updated · deleted · error NULL
sync_issues      id · sync_run_id · dataset · kind (duplicate_mscb|unknown_unit|bad_date|…) · source_key · details jsonb · resolved_at NULL
audit_log        id bigint · at · actor_code · acting_as_code NULL · action · target_type · target_id · details jsonb · ip inet · user_agent
                 · BRIN(at)
data_protection_keys
```

Text search config: `CREATE TEXT SEARCH CONFIGURATION vn_unaccent (COPY = simple)` mapped through `unaccent`, plus an
`IMMUTABLE` `f_unaccent()` wrapper for the generated columns and trigram indexes.

---

## 4. Roles

| Capability | employee | editor | admin |
|---|:-:|:-:|:-:|
| Own Hồ sơ, Sáng kiến, Giảng dạy, NCKH; own Tin tức (read, acknowledge) | ✓ | ✓ | ✓ |
| Reveal own masked sensitive fields (audited) | ✓ | ✓ | ✓ |
| Employee directory and search (MSCB, name, unit, emails); no profile data | | ✓ | ✓ |
| **MSCB ↔ email mapping** (add, remove, set primary, bulk import with dry run) | | ✓ | ✓ |
| Notifications: create, edit, schedule, publish, archive, clone; tags and series; recipient imports; stats | | ✓ | ✓ |
| Groups: create, edit, rules, members, import | | ✓ | ✓ |
| Grant or revoke **any role for any employee** | | | ✓ |
| View-as (read-only impersonation, audited) | | | ✓ |
| Employee status, manual employees, duplicate-MSCB resolution | | | ✓ |
| Dataset imports (teaching, research, publications); sync runs and issues; API clients; audit log | | | ✓ |

Guard rails:
- The last admin cannot be removed.
- Every role change, mapping change, view-as session and sensitive-field reveal is written to the audit log.
- While view-as is active, the session is read-only, and the audit log records which pages the admin viewed.
- Internally, each row maps to a named authorization policy (`Policies.ManageNotifications`, …). Future modules add their own
  policies, and new roles can be added later without touching the controllers.

---

## 5. API (REST under `/api`, cookie session; integration routes use `Authorization: ApiKey …`)

```
auth          GET auth/login?returnUrl · GET auth/callback · POST auth/logout · GET auth/me · POST auth/dev-login (Development only)
me            GET me/profile/overview · GET me/profile/general · GET me/profile/detailed · POST me/profile/sensitive/reveal {field}
              GET me/salary · GET me/positions · GET me/commendations · GET me/degrees · GET me/trainings · GET me/business-trips
              GET me/innovations?q&cursor · GET me/teaching?year · GET me/teaching/years · GET me/research/projects?q&cursor · GET me/research/publications?q&cursor
notifications GET notifications?q&tags&from&to&unread&cursor · GET notifications/{id} · POST notifications/{id}/read
              POST notifications/{id}/ack · POST notifications/read-all · GET notifications/unread-count · GET notifications/stream (SSE)
              GET notifications/{id}/attachments/{fileId} · GET tags
manage        notifications: GET/POST/PUT/DELETE manage/notifications[/{id}] · POST …/{id}/schedule|publish|archive|clone
                · POST …/{id}/recipients/import (multipart) → import report · POST …/imports/{importId}/apply
                · GET …/{id}/preview-vars?employee= (the vars rows plus whether that MSCB is in the audience) · GET …/{id}/stats · GET …/{id}/revisions · POST …/{id}/attachments
              tags & series: CRUD manage/tags · CRUD manage/series
              employees: GET manage/employees?q&unit&cursor · GET manage/employees/{code}
                · POST/DELETE manage/employees/{code}/emails · POST manage/employee-emails/import (dry run → apply)
              groups: CRUD manage/groups · POST manage/groups/preview-rule · PUT/DELETE manage/groups/{id}/members · POST …/members/import
admin         GET/PUT admin/roles/{code} · POST/DELETE admin/view-as · GET admin/audit · GET admin/sync-runs · GET/PUT admin/sync-issues
              POST admin/datasets/{teaching|research|publications}/import · CRUD admin/api-clients · PUT admin/employees/{code}/status
              GET admin/dashboard (counts, read rates, recent activity)
integration   POST integration/v1/org-units · employees · profiles · salary · positions · commendations · degrees · trainings
              · business-trips · innovations      (scope hrm.ingest; full-snapshot batches; see D04)
GET /healthz
```

All lists use keyset pagination: `{items, nextCursor}`. Errors are ProblemDetails, with Vietnamese `detail` text for messages shown to users.

---

## 6. Frontend information architecture

The sidebar is a flat list (as in the build) and every page has a real URL.

| # | Nav item (icon from `@mui/icons-material`) | Route | Page (bespoke design, §7.3) |
|---|---|---|---|
| 1 | Tin tức (`NotificationsOutlined`, unread badge) | `/tin-tuc`, `/tin-tuc/:id` | Inbox and detail. **This is the landing page.** |
| 2 | Hồ sơ cá nhân (`BadgeOutlined`) | `/ho-so` and `/ho-so/{thong-tin-chung,thong-tin-chi-tiet,luong,chuc-vu,khen-thuong,dao-tao,boi-duong,cong-tac}` | Overview plus 8 detail pages |
| 3 | Sáng kiến (`LightbulbOutlined`) | `/sang-kien` | Innovations |
| 4 | Giảng dạy (`SchoolOutlined`) | `/giang-day` | Teaching load |
| 5 | Nghiên cứu khoa học (`ScienceOutlined`) | `/nckh/de-tai`, `/nckh/bai-bao` | Projects and publications |
| 6 | Quản lý thông báo (`EditNotificationsOutlined`), editor | `/quan-ly/thong-bao[/:id]`, `/quan-ly/nhan-su`, `/quan-ly/nhom[/:id]` | Notifications, the employee email mapping, groups |
| 7 | Quản trị (`AdminPanelSettingsOutlined`), admin | `/quan-tri`, `/quan-tri/{phan-quyen,xem-thu,nhat-ky,dong-bo,du-lieu}` | Dashboard, roles, view-as, audit, sync, datasets |

---

## 7. UI: the PromptingFEBuild look on MUI v9

The build lives at `D:\git\SupportHcmusV2PromptingFEBuild`, written with Tailwind; INVENTORY §7 has the details. **Rebuild its look, not
its code.** The build ran every category through one generic list/markdown viewer. **V2 does not do that:** each category gets its
own page and components. Shared *primitives* such as `AcrylicCard`, `StatCard` and `PageHeader` are fine. A shared *category renderer*
is not.

### 7.1 Theme tokens (`theme.ts`)

| Token | Value |
|---|---|
| `palette.primary.main` | `#303F9F` (indigo 700) |
| `palette.secondary.main` | `#ECEFF1` |
| `palette.text.primary` / `secondary` | `#263238` / `#546E7A` |
| `palette.background.default` | `#F5F7F9` (flat), with a `bg-logo` watermark bottom-right at 0.2 opacity (the asset is self-hosted in `public/`) |
| `shape.borderRadius` | **5** (cards, dialogs). Chips and avatars are full-round; inputs and buttons use 2–3 px. |
| Typography | Inter 300–900. Section labels: overline-style, 11 px, `fontWeight 900`, uppercase, `letterSpacing: 0.15em`. Body text 0.925 rem. |
| Acrylic surface | `bgcolor: alpha('#fff', 0.4)`, `backdropFilter: 'blur(8px) saturate(125%)'` (+ `WebkitBackdropFilter`), 1 px border `grey.100` |
| Blocky shadow | `0 4px 12px -2px rgba(0,0,0,.08), 0 2px 6px -1px rgba(0,0,0,.04)`. On hover: `translateY(-1px)` and `0 6px 16px -4px rgba(79,195,247,.15)` |
| Motion | Fly-in 300 ms `cubic-bezier(.16,1,.3,1)`, 50 ms stagger. Dialogs zoom and fade in, and exit over 250 ms. Respect `prefers-reduced-motion`. |
| Table head | `primary.main` background with white 700-weight text, through a theme override, as the style guide says (using this palette). |

Implement these as theme `components` overrides and variants (`MuiPaper` variant `acrylic`, `MuiCard`, `MuiDialog`, `MuiChip`,
`MuiTableCell`), so pages use `<Paper variant="acrylic">` rather than ad-hoc `sx`.

### 7.2 Shell
- **Sidebar:** `Drawer`, 288 px, on `lg` and up. Background `radial-gradient(circle at top right, #fafcfc, #E3F2FD)`. The "Support HCMUS" brand is in primary bold with a white glow.
  Rows are 64 px with uppercase 11 px `fontWeight 900` labels. A single **sliding active indicator** moves with a 300 ms ease and is drawn as a sunken tab (`#F0F2F5`
  with an inset shadow and a 4 px primary left border). Idle icons are muted, the active icon is primary and scaled to 1.1.
- **Below `lg`:** a 64 px top bar (menu button, page title, avatar). The drawer is 90 vw (max 450) and opens over a dark acrylic scrim.
- **Desktop:** no AppBar. A floating 44 px avatar sits top-right and opens an acrylic menu with the name, MSCB, roles, version (from `GET /api/system/info`) and a red "Đăng xuất".
- While view-as is active, a fixed warning bar shows "Đang xem với tư cách {name} · {MSCB}" with a "Thoát" button.
- **Login:** a wide two-column acrylic card. On the left, "Support HCMUS" and the greeting copy from the build. On the right, a
  "Đăng nhập với Google" tile and a **disabled** "Đăng nhập với VNeID" tile. Error and sync states follow the build.

### 7.3 Pages (each is its own feature folder and its own components)

| Page | Design |
|---|---|
| **Tin tức** | **Filter bar:** sticky acrylic bar with debounced search, tag chips (multi-select), "Từ ngày"/"Đến ngày" date pickers and an "Chưa đọc" toggle.<br>**Rows:** title, summary and the first tag plus `+N`. Unread rows are bold with a primary dot. Rows carry pin and "Cần xác nhận" chips. Infinite scroll.<br>**Detail:** the build's viewer modal at `/tin-tuc/:id`, deep-linkable. It shows the rendered doc, an attachments list, "Xác nhận đã đọc", and "Các kỳ trước" (same series). |
| **Hồ sơ cá nhân** | **Hero:** acrylic card with an 8 px primary left border, Google photo, name, MSCB pill, "position — unit", and email and phone lines.<br>**Cards:** 8 summary cards in a 3/2/1-column grid, each with **real** data: the build hard-coded the training card. Each card links to its page. |
| Thông tin chung | Sectioned key-value cards: Cá nhân, Liên hệ (with copy buttons), Địa chỉ (thường trú / liên hệ). |
| Thông tin chi tiết | Sections: Công tác (unit, position, ngạch/bậc/hệ số), Học hàm & học vị, Đoàn thể (Đảng/Đoàn/Công đoàn dates), Tài chính & bảo hiểm. In the last section, sensitive values are masked `•••• 1234` and revealed per field by click, which is audited. |
| Quá trình lương | **Stat cards:** current ngạch, bậc, hệ số, vượt khung %, and the next raise date as a "còn N tháng" countdown.<br>**Chart:** MUI X step-line of hệ số over time.<br>**Timeline:** vertical list of decisions (số QĐ, ngày ký, ngày hưởng, ghi chú). |
| Chức vụ | Vertical timeline. The current position is emphasised, and each entry shows its tenure ("3 năm 2 tháng"). |
| Khen thưởng | Tabs "Khen thưởng" and "Danh hiệu". Cards are grouped by năm học with an award icon, name and decision. A count stat sits on top. |
| Quá trình đào tạo | Diploma-style cards, newest first: degree, major, institution · country, years, thesis title. |
| Quá trình bồi dưỡng | Table grouped by year, with sticky group dividers (style-guide helper `useStickyGroupPush`). |
| Đi công tác | Stats (trips, days abroad) and a year filter, then a table with destination, dates, purpose and decision. |
| **Sáng kiến** | Stats (count, by type). A searchable list. Detail dialog with code, type, decision and recognition year. |
| **Giảng dạy** | Academic-year pill select. Stats: total quy đổi hours, classes, courses. A table grouped by học kỳ with sticky dividers. Source caption: "Nguồn: …, cập nhật …". |
| **NCKH** | The build's skewed pill switcher between Đề tài and Bài báo.<br>**Đề tài:** rows show title, a role chip (Chủ nhiệm/Thành viên), level and funding; the detail lists members (linked when they are employees).<br>**Bài báo:** title, venue · year, a DOI link and co-authors. |
| **Quản lý thông báo** | **List:** status chips, filters, series, read % bar.<br>**Editor:** MDXEditor (toolbar: headings, bold/italic, lists, table, link, image upload, source-mode toggle) with a "Chèn biến" menu that inserts `:var[key]` chips from the variables, plus a split **live preview** with an MSCB picker, title, summary, tags, series, publish/expiry pickers, pin and "Cần xác nhận". The **targeting panel** offers Tất cả, nhóm picker, nhân sự picker, and "Tải danh sách" (xlsx/csv: an MSCB column plus variable columns, with a downloadable template and a validation report). It shows a live recipient count. "Xem trước với tư cách…" picks a recipient to preview as. Attachments. Clone from the previous post in the series. Revision history. |
| **Nhân sự & email** (editor) | Searchable directory. The detail shows MSCB, name, unit and an email list with add, remove and set-primary. Bulk import (columns MSCB, Họ tên, Email 1..6) uses dry run → report (new, removed, conflicts: an email owned by another MSCB, unknown MSCB) → apply. |
| **Nhóm** (editor) | Master-detail, as in the build. Group kinds: tĩnh / theo đơn vị / theo điều kiện. The rule builder has a live preview count. Members can be edited or imported. Shows the notifications that targeted the group. |
| **Quản trị** | **Dashboard** (all figures are real, unlike the build's hard-coded ones): notifications sent, read rate, active users in the last 7 days, last sync status, recent audit events.<br>**Other pages:** Phân quyền (search an employee, toggle editor/admin), Xem thử (pick an employee, start view-as, browse the real pages read-only), Nhật ký (audit filters), Đồng bộ (runs, issues to resolve), Dữ liệu (dataset imports). |

Page states, formatting (`—`, ` · `, `Intl` money `đ`, tolerant dates) and a11y follow UI-STYLE-GUIDE §7, §8 and §10.

---

## 8. Conventions for parallel agents

- **Branching:** branch `feat/d<NN>-<slug>` off `main` in a worktree at `.claude/worktrees/d<NN>`. One branch per delivery, rebased before merge. Nothing gets deployed to the live server.
- **Per-branch dev DB:** while a branch is in progress, use `hcmus_support_dev_d<NN>`, so parallel migrations don't collide. The shared `hcmus_support_dev` tracks `main` only. End PR descriptions with the repo's attribution lines.
- **Backend layout:** `Modules/<Module>/<Feature>/` contains the controller, the service, the DTO records and `<Module>Module.cs` (`AddXxxModule()` plus its policies).
  EF configuration lives next to its entity, `<Entity>Configuration.cs`, and is applied through `ApplyConfigurationsFromAssembly`.
  `Program.cs` gets exactly **one line per module**.
- **Migrations:** one per delivery, named `D<NN>_<Name>`, generated **last, after rebasing**. If the model snapshot conflicts, delete your
  migration, rebase and regenerate it. Never edit a merged migration.
- **API client:** `src/api/generated-client.ts` is produced only by `generate-api.cmd` and is committed. Regenerate it when it conflicts.
- **Frontend layout:** `src/features/<feature>/` holds that feature's pages, components and query hooks. The routes and nav registries, `src/app/routes.tsx`
  and `src/app/nav.ts`, take one line per entry. Primitives go in `src/ui/`. A primitive must be category-agnostic, and a category component must not be
  reused for another category.
- **Secrets:** commit none. Put dev config in `appsettings.Development.local.json` (gitignored; template `*.example`) or user-secrets.
  The dev DB is `10.0.0.11:65432`, user `sa`, database `hcmus_support_dev`. Tests create and drop `hcmus_support_test_<guid>`.
- **Tests:**
  - Backend: xUnit with `WebApplicationFactory` against real PG. Every endpoint needs a happy-path test and a forbidden-role test. Notifications also need fan-out and visibility tests.
  - Frontend: vitest for helpers and Playwright smoke tests per page, run against dev-login with synthetic data.
- **Fixtures:** synthetic data only (MSCB `T0001…`). Never copy real HRM rows into the repo or into logs.
- **Language:** Vietnamese for UI text. English for code, comments and commits.

---

## 9. Deliveries

```
Wave 0   D01 Backend foundation ‖ D02 Frontend foundation & shell ‖ D17 Security cleanup      (D16 deployment kit: any time after D01)
Wave 1   D03 Auth, employees, emails, roles, groups schema            (needs D01; login UI needs D02)
Wave 2   D04 HRM domain + ingest ‖ D06 Groups engine ‖ D07 Notifications engine ‖ D14a Admin core   (need D03)
Wave 3   D05 Sync tool (D04) ‖ D08 Tin tức UI (D07) ‖ D09 Notification editor UI (D07, D06)
         ‖ D10 Hồ sơ overview/general/detailed (D04) ‖ D11 Lương/Chức vụ/Khen thưởng (D04)
         ‖ D12 Đào tạo/Bồi dưỡng/Công tác (D04) ‖ D13 Sáng kiến/Giảng dạy/NCKH (D04) ‖ D14b Admin pages (D06, D07)
Wave 4   D15 Legacy migration (D04, D05, D07) → D18 Parity & cutover
```

### D01 · Backend foundation
- [x] Stay on **net8.0** (§10 Q1). Swap `Microsoft.EntityFrameworkCore.SqlServer` for `Npgsql.EntityFrameworkCore.PostgreSQL` 9 and `EFCore.NamingConventions` 9.
- [x] snake_case naming, and `UUIDNext` for v7 ids. The baseline migration creates the extensions (`citext`, `unaccent`, `pg_trgm`), `vn_unaccent` and `f_unaccent()`. Dev PG is 17.11, and `sa` is a superuser.
- [x] Configuration: `appsettings.{Env}.local.json` loading, `ConnectionStrings:Default`, `Storage:*`, `Auth:*`, plus the `.example` files.
- [x] Platform pieces:
  - [x] Serilog
  - [x] OpenTelemetry (OTLP optional)
  - [x] ProblemDetails
  - [x] `/healthz`
  - [x] `GET /api/system/info`
  - [x] rate limiter (`auth/*`, `integration/*`)
  - [x] forwarded headers
- [x] The `Modules/` pattern and the `jobs` queue: entity, `IJobQueue.Enqueue`, a hosted worker with SKIP LOCKED, retry and backoff, and a test job.
- [x] `IFileStore` (local disk), the `files` table, `audit_log` with `IAuditLogger`, and `data_protection_keys`. Migration `D01_Platform`.
- [x] `HCMUSSupportV2.Backend.Tests` with a PG fixture.
- **Done when:** `dotnet test` is green, `/healthz` is Healthy, a queued test job runs, and `generate-api.cmd` emits `SystemClient`.

### D02 · Frontend foundation & shell (§7.1–7.2)
- [x] Install MUI v9, Emotion, icons, react-router 7, TanStack Query, react-hook-form + zod, and MUI X pickers and charts. Add Inter and `theme.ts` with every §7.1 token as theme variants and overrides.
- [x] `src/ui/` primitives: `AcrylicCard`, `StatCard`, `PageHeader`, `FlyIn` (stagger helper), `PageState` (error, loading and empty), `MaskedValue`, `EmptyDash`, and the formatting helpers, with vitest tests.
- [x] Shell: sliding-indicator sidebar, mobile drawer, floating avatar menu, view-as bar, bg-logo watermark. Driven by `nav.ts` with role gating.
- [x] Login page (build design) and the auth/loading/error screens. `AuthProvider` around `GET /api/auth/me`, `RequireRole`, and a 401 handler that redirects to the login page.
- [x] Vite dev proxy `/api` → backend. `index.html`: `lang="vi"`, title "Support HCMUS". Placeholder routes for every §6 page.
- **Done when:** build, lint and vitest are green, and the PR has screenshots at 1440 px and 375 px that match the build's look.

### D03 · Auth, employees, emails, roles (backend + wiring)
- [x] Entities and migration `D03_Identity`: `org_units`, `employees`, `employee_emails`, `role_assignments`, and the `groups`/`group_members` schema (logic comes in D06).
- [x] Google OIDC: `/api/auth/login` → `callback`. Validate the issuer, audience and `email_verified`, then map the email to an employee, which must be active. Issue the `__Host-` cookie session (sliding 12 h). Add antiforgery for unsafe methods.
- [x] `GET auth/me` returns `{code, fullName, unit, photoUrl, emails, roles, actingAs}`, `POST auth/logout`, and `POST auth/dev-login`, which is enabled only in the Development environment with a config flag.
- [x] Authorization policies from §4, and a "last admin" guard. Audit `auth.login`, `auth.denied` and `auth.logout`.
- [x] Bootstrap: `Admin:BootstrapEmails` config seeds the first admin when the database has no admin yet.
- [x] Frontend wiring (D03b): `me`, login error mapping, `X-XSRF-TOKEN`, logout, dev-login panel, `e2e-real` (see FRONTEND.md "Auth").
- [ ] Still open: the owner registering `http://localhost:5161/api/auth/callback` on the Google client, and a real sign-in check on localhost.
- **Done when:** tests cover a valid sign-in, wrong audience, unverified email, unknown email, inactive employee, and dev-login rejected in Production. A real Google sign-in works on localhost.

### D04 · HRM domain schema & ingest API
- [x] The §3.2 tables, with the EF mappings and migration `D04_Hrm`.
- [x] `POST integration/v1/{dataset}` takes full-snapshot batches (gzip JSON, ≤ 20 MB). The service:
  1. Binary-COPYs the batch into a temp table.
  2. `MERGE … WHEN NOT MATCHED BY SOURCE THEN DELETE` (PG 17+) on `hrm_id`.
  3. Writes `sync_runs`.
  4. Writes `sync_issues` for duplicate MSCBs, unknown units and unparseable dates.
  - It refuses a run whose row count falls more than 20 % below the last good run unless `?force=true`.
  - After an `employees` or `org-units` run it calls the `IRosterSyncObserver`s (the groups engine enqueues `groups.recompute`), and `IEmployeeActivationObserver` with newly active codes.
- [x] A minimal `api_clients` table (hashed tokens, scopes) and an ApiKey auth handler. Admin UI is in D14b.
- [x] `me/*` read endpoints (§5) for all HRM datasets. They honour `actingAs`, mask `employee_sensitive`, and expose reveal-with-audit.
- [x] Admin dataset import endpoints for teaching, research and publications (xlsx), using the dry-run report → apply flow through `imports`. Publish the template formats as downloadable `.xlsx`.
- **Done when:** ingesting synthetic fixtures for every dataset round-trips, the truncation guard and duplicate-MSCB issue are tested, and nobody can read another employee's rows unless view-as is active.

### D05 · Sync tool (`HCMUSSupportV2.Sync`)
- [x] .NET 8 console with `sync hrm --datasets all|<list> [--dry-run]`. Its SQL lives in `Sync/Queries/*.sql`, rewritten from `docs/jjobs` to select the **typed columns** of §3.2 plus `hrm_id`.
  Fix the known bugs: drop the business-mission debug filter on one MSCB, and fix the academic-progress country join.
  Write the org-unit and roster queries (`DM_DONVI`, `DM_PHONGBAN`, `NS_NHANSU` status).
- [x] `sync legacy-git --path <SupportHCMUSData>`: a one-off or transition source that maps v1 JSON into the same typed payloads, parsing `dd/MM/yyyy` with precision.
- [x] Posts gzip batches with the API key. Per-dataset summary, non-zero exit on failure, and `--dry-run` prints counts without posting.
- [x] `docs/SYNC.md`: install on the HRM box, run nightly at 22:30 from Task Scheduler, use a least-privilege SQL login (D17), and how to rotate the token.
- **Done when:** the dry run against HRM (or the local data repo) gives per-dataset counts that match INVENTORY §4, and a full run into dev passes D04's validations.
> D05 note: the `hrm` queries (`Sync/Queries/*.sql`) were written without database access and are unit-tested through the row mapper only; the first `sync hrm --dry-run` on the HRM box must confirm the column assumptions listed in `docs/SYNC.md` (org-unit parent, employee status, department id offset).

### D06 · Groups engine
- [x] Group CRUD and member management: manual edits, csv/xlsx import, auto-generated org-unit groups.
- [x] The rule language (§3.1) as a validated JSON schema, compiled to SQL with no string concatenation. `preview-rule` returns the count and a sample.
- [x] `groups.recompute` job (after sync and on rule change) that diffs `group_members` with `source=computed`. Emits `group.members_added` → the late-joiner backfill job (D07).
- **Done when:** rule, org-unit-with-descendants and static groups are tested, and so is the recompute diff.

### D07 · Notifications engine (backend)
> D07a landed the Markdown contract (`docs/notification-markdown.md`, with the validator test vectors) and the MDXEditor spike (passed; `:var[Key]` kept). D07 implements the Markdig validator against that file.

- [x] §3.3 tables, migration `D07_Notifications`, `vn_unaccent` search column, and indexes. Seed tags (Lương, Thâm niên, Khen thưởng, Khảo sát, Đào tạo, Chung).
- [x] Markdown contract: `docs/notification-markdown.md` defines the allowed GFM subset, the `:var[key]` directive, image URLs (`/api/files/{id}` only), and the rule that raw HTML is not allowed. A Markdig-based `NotificationMarkdown` service validates the body, lists the placeholders it uses, and extracts `content_text` and `summary`. **Spike first:** confirm that MDXEditor round-trips `:var[...]` unchanged through `directivesPlugin` and source mode, and that pasted text containing `{`, `}` or `<` isn't mangled. Record the result in the doc.
- [x] Recipient import (xlsx/csv). It detects the MSCB column, maps other columns to variables, and reports unknown or inactive MSCBs, duplicate rows (several rows per MSCB are allowed when intended), and variables used in the body but missing from the file. Template download.
- [x] Lifecycle (draft → scheduled/published → archived): publish job fan-out, late-joiner backfill job, revisions, clone (copies content, variables, tags, series and audiences, but not imported rows), and stats counters.
- [x] Inbox endpoints (§5): keyset paging, filters, FTS, read, ack, read-all, unread count. SSE stream via `LISTEN/NOTIFY` with heartbeats.
- [x] Attachments through `IFileStore`, with a MIME and size allowlist and an authorization check that the caller has a delivery.
- **Done when:** tests prove `all`, `group`, `employee` and `import` audiences reach exactly the right people; scheduled posts are invisible before `publish_at`; a late joiner gets backfilled; FTS without diacritics finds an accented title ("tham nien" → "Thâm niên"); and an employee without a delivery gets 404.

### D08 · Tin tức UI
> D07a landed `NotificationBody` + `remarkVars` (`src/features/notifications/body/`) with its unit tests. D08 only has to use it.

- [ ] Inbox, filters, unread styling, infinite scroll, detail route and modal, attachments, acknowledge, read-on-open, series history, unread badge over SSE in the nav and avatar.
- [ ] A shared `NotificationBody` renderer (`react-markdown` + `remark-gfm` + `remark-directive`, with a remark plugin that substitutes `:var[key]` from `vars` as text nodes; HTML skipped). One block per vars row, for posts with several rows. Unit tests: substitution, missing value → `—`, and a value containing markup is shown as literal text.
- **Done when:** Playwright checks that a published synthetic post appears live, opening it marks it read, the badge decrements, and an ack is persisted.

### D09 · Notification editor UI (manage)
> D07a landed `LazyNotificationMarkdownEditor` (MDXEditor, `:var[Key]` chip, "Chèn biến", upload-only image dialog, source/diff mode) and `MarkdownPreviewPane`, plus the `/dev/markdown` playground. D09 adds the MSCB picker, data fetching and the rest of the page.

- [ ] List and editor as in §7.3: MDXEditor with the custom `:var[...]` directive chip and the "Chèn biến" menu, a split live preview of the unsaved draft as a chosen MSCB, image upload to `files`, targeting panel with live count, import flow with report, preview-as, schedule, publish, archive, clone, revisions, attachments.
- [ ] Tags and series management dialogs.
- **Done when:** Playwright checks that an editor can make "Nâng lương thường xuyên 2026" by cloning the 2025 post and uploading a synthetic xlsx, preview it as a recipient and publish it, and that the recipient sees it with the substituted values.

### D10 · Hồ sơ: overview, Thông tin chung, Thông tin chi tiết
- [ ] The hero, the 8 summary cards (real data, linked) and the two pages in §7.3. The sensitive-field reveal is audited.
- **Done when:** the pages render synthetic data, handle empty data and errors, show masked values revealed one at a time, and the PR includes screenshots.

### D11 · Hồ sơ: Quá trình lương, Chức vụ, Khen thưởng
- [ ] The three bespoke pages in §7.3: salary stats, step chart and timeline; position timeline with tenure; award and title tabs grouped by năm học.

### D12 · Hồ sơ: Quá trình đào tạo, Bồi dưỡng, Đi công tác
- [ ] The three bespoke pages in §7.3: diploma cards; a training table grouped by year with sticky dividers; business trips with stats and a year filter.

### D13 · Sáng kiến, Giảng dạy, Nghiên cứu khoa học
- [ ] The three bespoke sections in §7.3, including the NCKH skewed switcher. Use proper responsive labels; the build relied on a Tailwind `xs` breakpoint that doesn't exist.

### D14a · Admin core (backend)
- [x] Role grant and revoke API with the last-admin guard. View-as start and stop (session claim, read-only enforcement middleware, audited page views). Audit query API. Dashboard aggregates. Employee status and manual-employee endpoints. (Sync runs and issues endpoints are owned by D04.)

### D14b · Admin & editor management pages
- [ ] Nhân sự & email (editor): directory, email mapping, bulk import with dry run. This replaces the Google Sheet.
- [ ] Nhóm (editor): master-detail, rule builder with preview.
- [ ] Quản trị: dashboard, Phân quyền, Xem thử, Nhật ký, Đồng bộ (runs and issue resolution), Dữ liệu (dataset imports), API clients.
- **Done when:** an editor can map a new email to an MSCB and that person can sign in; an editor gets 403 on `/quan-tri/*`; and an admin can grant editor to anyone and use view-as, which appears in the audit log.

### D15 · Legacy migration (one-off, idempotent)
- [ ] Roster and emails: `config/users.json` → `employee_emails`. Report emails that conflict with HRM or point to an unknown MSCB.
- [ ] Roles: the repo owner becomes `admin`. `privileged.users.json` (ViewAs/Lookup) is **listed for the user to decide** rather than auto-granted, because v2 has only editor and admin.
- [ ] News: `tools/legacy-news` (Node and TypeScript, using `turndown` + `turndown-plugin-gfm`) converts the 56 `notifications/news/*.json` files. It ignores `.old` and `backup/`, and turns the baked HTML (Word/Outlook inline styles, entities) into GFM Markdown, `{col}` placeholders into `:var[col]`, and `values` rows into `vars`. It reports any post whose layout didn't survive the conversion, such as merged-cell tables. It posts them through an admin import endpoint as published posts with `published_at = datestr`. Files that cover the whole active roster become `audience_all`. Series and tags are guessed from the titles and listed for review.
- [ ] The HRM categories come from `sync legacy-git` (D05) or a live `sync hrm`.
- [ ] Datasets: teaching-stats (parse the `{rows}` HTML tables into `teaching_loads`), research-stats → `research_projects` and members, paper-details → `publications`.
- [ ] The request-update-info banner and the v1 Google Form links become a pinned `audience_all` notification. `apps.json` is not migrated.
- **Done when:** a re-run is a no-op, and for 5 sampled real employees the v2 inbox and pages carry the same facts as v1 (checked in D18).

### D16 · Deployment kit (independent; **do not touch the live server**)
The owner will upgrade the running server (`support.hcmus.edu.vn`) to current versions **after v2 is complete**. Until then,
nothing is installed, changed or deployed there; read-only inspection is the most that's allowed. This delivery only produces the kit.
- [x] `deploy/` holds:
  - [x] a systemd unit (`hcmus-support.service`, user `hcmus-support`, `Restart=always`, an env-file for secrets)
  - [x] the nginx site config:
    - [x] TLS for the apex domain **and www**
    - [x] HSTS
    - [x] `/api` proxy, with `proxy_buffering off` for `/api/notifications/stream`
    - [x] SPA fallback
    - [x] gzip
    - [x] `client_max_body_size 25m`
    - [x] rate limit
    - [x] no wildcard CORS
  - [x] journald size cap
  - [x] a `pg_dump` and file-store backup script with 14 daily and 8 weekly copies, plus a restore script
- [x] `deploy.ps1`: publish linux-x64 → rsync → migrate (EF bundle) → restart → health check. Target host is a parameter, and there is **no default**.
- [x] `docs/OPERATIONS.md`: the server upgrade runbook (Debian upgrade, .NET 8 runtime, PostgreSQL 17, removing the v1 tmux process), first deploy, backup and restore, rollback.
- **Done when:** the kit is reviewed and dry-run validated (`nginx -t` and `systemd-analyze verify` run in a local container or VM, not on the live server).

### D17 · Security cleanup (independent, `[haiku]` for the checklist work)
- [x] User-run rotation checklist (checklist in docs/SECURITY-CHECKLIST.md):
  - the v1 Google OAuth client secrets (hard-coded in HRBackend)
  - the GitHub PAT in `GitIntegrationTest`
  - the HRM `sa` password (exposed in 3 files)
  - the v1 `apps.json` tokens
  - the plaintext password in prod `/root/.gitconfig`
  - fix or retire `scripts/sheets.py`, which prints the service account to CI logs
- [x] A least-privilege, read-only HRM SQL login for the Sync tool (template in deploy/sql/hrm-readonly-login.sql), limited to the `NS_*` and `DM_*` tables it reads. 26 tables total: NS_NHANSU, NS_QuaTrinhLuong, NS_QuaTrinhChucVu, NS_QuaTrinhKhenThuong, NS_QuaTrinhDaoTao, NS_QuaTrinhSangKien, NS_QuaTrinhBoiDuong, NS_QuaTrinhCongTac, DM_DONVI, DM_PHONGBAN, DM_CHUYENNGANH, DM_PhuongXa, DM_QuanHuyen, DM_TinhThanhPho, DM_DanToc, DM_QUOCTICH, DM_TONGIAO, DM_HOCHAM, DM_HOCVI, DM_ChucVu, DM_TrinhDoHocVan, DM_ChinhTri, DM_NganHang, DM_LoaiBangCap, DM_HinhThucDaoTao, DM_LoaiSangKien.
- [ ] After cutover, a decision on the PII-laden SupportHCMUSData history: archive it read-only, or purge it.

### D18 · Parity & cutover
- [ ] A parity script, run per category for N sampled MSCBs: v1 `/api/viewas` versus v2 `me/*` (through admin view-as). Counts and key fields must match, apart from documented fixes.
- [ ] A one-week soak on a non-production host (or locally) with nightly `sync hrm`. Then the owner upgrades the live server (D16 runbook), deploys v2 and stops the v1 git push.
- [ ] Google OAuth client: add the production, staging and `http://localhost:5173` redirect URIs. Rotate the secret.
- [ ] Cutover:
  - [ ] keep a full backup of v1 (`/root/backend`, the nginx config, the static html) before the in-place upgrade
  - [ ] remove the `/tchc` remnants and the v1 tmux process after the switch
  - [ ] tell the KHCN and Documents owners that the v1 user-dump endpoint has gone
- **Done when:** the parity report is clean and real staff can sign in and see their data in production.

---

## 10. Decisions needed (agents use the default unless told otherwise)

| # | Question | Default |
|---|---|---|
| Q1 | .NET version | **Decided:** stay on .NET 8. Keep the code free of APIs that need .NET 9 or later, so a later retarget is cheap. |
| Q2 | Hosting | **Decided:** the existing server is upgraded in place by the owner after v2 is complete (local PG 17, off-box dumps). **No deployment to the live server before then.** |
| Q3 | Which machine runs the nightly HRM sync? (The box that makes today's 22:30 "HRM-Database" commit isn't documented in any repo.) | The same internal Windows box, on Task Scheduler. |
| Q4 | Who can sign in | **Decided:** only mapped emails in `employee_emails`, seeded once from `D:\git\SupportHCMUSData\config\users.json` (1,925 people) and maintained by editors from then on. HRM emails are not auto-mapped. |
| Q5 | What happens to the 8 v1 ViewAs/Lookup holders? | Not auto-granted. D15 lists them and the user picks editors and admins. |
| Q6 | Email or Web Push on publish? | Not in v2.0. Deliveries and jobs make it an additive outbox later. |
| Q7 | Google OAuth client | **Decided:** reuse the existing v1 web client. Client id and secret go only in `appsettings.*.local.json` or env (never committed); the v1 values are in `D:\git\hcmus-portal-fe\.env` (id) and `D:\git\SupportHCMUS\HRBackend\Helper\Oauth.cs` (secret). The owner adds the v2 redirect URIs (`http://localhost:5161/api/auth/callback`, later the production one) in Google Cloud Console, and rotates the secret at cutover (D17). |

---

## 11. Future modules (Documents, KHCN, …)

- Modules use the shared core (employees, emails, groups, roles, audit, files, jobs, notifications) through DI. They never copy it.
  For example, Documents can notify a group via `INotificationPublisher`, and KHCN can own `research_*` and `publications` and replace the admin Excel imports.
- **Module shape:**
  - `Modules/<Name>/` with `AddXxxModule()` and its own policies, which may add roles such as `documents.manager`
  - migrations `D<NN>_<Name>_…`
  - a `src/features/<name>/` folder with its own nav entries and routes
- Data from other systems (BSC/HRM, EMIS, the KHCN database, …) arrives through `integration/v1/*` with scoped API clients, using Sync-tool adapters.
