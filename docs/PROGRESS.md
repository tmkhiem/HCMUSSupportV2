# Implementation progress

Updated 2026-10-02 (night). Plan: [PLAN.md](PLAN.md). Everything below is on `origin/main`. Nothing is deployed and the live server is untouched.

## Merged into `main`

| Delivery | What | Tests at merge |
|---|---|---|
| D01 | Backend foundation: Npgsql/EF 9, modules, Serilog/OTel, `/healthz`, PG job queue, file store, audit log | ✓ |
| D02 | Frontend shell: MUI v9 re-themed to the PromptingFEBuild look, router, primitives, login page | ✓ |
| D03 | Google OIDC + cookie session, employees/emails/roles schema, policies, dev-login, antiforgery | ✓ |
| D03b | Frontend auth wiring: XSRF, NSwag clients, dev-login panel, `e2e-real` against the real backend | ✓ |
| D04 | HRM typed tables, ApiKey ingest (MERGE, truncation guard, sync runs/issues), `me/*` reads, dataset imports | ✓ (after fixing a view-as test helper) |
| D05 | `HCMUSSupportV2.Sync`: `legacy-git` and `hrm` sources, gzip ingest client, dry-run | ✓ 50 tests; legacy-git → dev DB end-to-end OK |
| D06 | Groups engine: static, org-unit and rule groups, preview, recompute, import | ✓ |
| D07 | Notifications engine: Markdig validator, editor API, recipient import, fan-out, inbox, FTS, SSE | ✓ (after fixing the same view-as test helper) |
| D07a | Markdown contract + MDXEditor spike (passed, `:var[Key]` kept), `NotificationBody` renderer, editor component | ✓ |
| D08 | Tin tức inbox: filters in URL, detail dialog with deep link, read/ack/read-all, attachments, series history, unread badge (no live stream) | ✓ (vitest 204, Playwright `inbox` 24, real-backend e2e 9) |
| D10 | Hồ sơ: overview (hero + 8 summary cards), Thông tin chung, Thông tin chi tiết (masked + reveal) | ✓ (Playwright 7) |
| D11 | Hồ sơ: Quá trình lương, Chức vụ, Khen thưởng pages | ✓ (vitest 163, Playwright `career`) |
| D09 | Notification editor UI (Quản lý thông báo): list, MDXEditor with `:var` chips, live preview as an MSCB, targeting with live count, import report, schedule/publish/archive/clone, revisions, tags and series. Adds `audience-estimate` and an employee lookup to the editor API | ✓ (Playwright `editor` 13, real-backend e2e of the clone → import → preview → publish scenario) |
| D12 | Hồ sơ: Quá trình đào tạo (diploma cards), Bồi dưỡng (year groups with sticky dividers), Đi công tác (stats + year filter) | ✓ (Playwright `education` 12) |
| D13 | Sáng kiến (search, detail dialog), Giảng dạy (năm học select, học kỳ groups), NCKH (skewed switcher, Đề tài and Bài báo) | ✓ (Playwright `research` 17) |
| D14a | Admin backend: roles, view-as (read-only + audited), audit query, dashboard | ✓ |
| D14b | Admin and editor pages: Nhóm (master-detail, rule builder), Quản trị (dashboard, Phân quyền, Xem thử, Nhật ký, Đồng bộ, Dữ liệu). Includes the Part B leftovers: D10/D11 on the generated client, one partial-date formatter, mock chunks kept out of production | ✓ (real-backend e2e for roles, view-as, groups and every Quản trị page) |
| D14c | MSCB ↔ email mapping: `api/manage/employees` (directory, add/remove/primary email, xlsx/csv import with dry run), one-primary index (migration `D14c_EmployeeEmails`), and the Nhân sự & email page. Replaces the Google Sheet | ✓ (21 backend tests, Playwright `employees` 9, real-backend e2e) |
| D16 | Deployment kit (systemd, nginx, backup/restore, `deploy.ps1`, OPERATIONS.md). Validated in Docker only | ✓ |
| D17 | Security checklist + read-only HRM SQL login template | n/a |

Also merged: `fix/build-wwwroot-flake`, `fix/ef-bundle-release` and `docs/env-example-keys` (see follow-ups 5 and 6).

`main` at the time of writing passes **378 backend**, **50 sync**, **297 frontend (vitest)**, **144 Playwright mock** (11 projects, run with `--workers=2 --retries=2`) and **17 real-backend e2e** tests. `dotnet ef migrations has-pending-model-changes` is clean.

## In progress

**D15 legacy migration**: done on `feat/d15-legacy-migration` (merged into `main`, not pushed). Runbook and results: [MIGRATION.md](MIGRATION.md).
Verified against the real data repo on a temporary database (since dropped): a full run and a second run that reported nothing to do. Tests: 16 backend (`Legacy/LegacyMigrationTests`),
18 sync (`LegacyMigrationTests`), 52 `tools/legacy-news` (vitest). The migration `D15_LegacyMigration` adds `legacy_import_marks`.

**D18 parity check and cutover**: done on the branch `feat/d18-parity-cutover` (merged into `main` together with D15, not pushed). The parity tool is `tools/parity-check` and the report [PARITY.md](PARITY.md): 5 sampled real employees, the edge cases and all 1,917 other roster people compared with v1, 0 mismatches (documented differences only). The owner's cutover steps (soak, Google redirect URIs and secret rotation, server upgrade, DNS, removing v1) are the checklist [CUTOVER.md](CUTOVER.md); none was run. The temporary database `hcmus_support_dev_m2_d18_a` is dropped.

Otherwise nothing. The branches `feat/d09-notification-editor`, `feat/d14b-admin-pages`, `feat/d14c-employee-emails`, `feat/d12-education-pages`, `feat/d13-research-teaching-pages`, `integration/d12-d13-followups` and the three follow-up branches are merged and can be deleted from `origin`.

**API clients admin UI** (the last D14b leftover): done on the branch `feat/api-clients-admin` (not merged, not pushed). Backend `api/admin/api-clients` (list, scopes, create, revoke; policy `ManageApiClients`; audited as `apiclient.created` / `apiclient.revoked`; the token is returned once and stored as the same SHA-256 hash the ApiKey scheme checks), frontend page `/quan-tri/api-clients` with a show-token-once dialog. No migration (the table already existed; `has-pending-model-changes` is clean). Tests: 4 backend (`Admin/ApiClientsAdminTests`), 3 vitest, 2 Playwright mock (admin project), 1 real-backend e2e plus the "every Quản trị page" loop. Real e2e ran on a temporary database `hcmus_support_dev_m2_apiclients`, now dropped. Docs: BACKEND, FRONTEND, PLAN, INGEST, SYNC, MIGRATION, CUTOVER. Known and unrelated: `NotificationEngineTests.Editing_after_publish_bumps_the_version_and_writes_revisions` fails on `main` too.

## Not started

Nothing. (The API clients admin UI, the last D14b leftover, is done, see below.)

## Decisions taken on my own overnight

- **Shared contracts committed to `main` before wave 2:** `ICurrentUser.EffectiveCode`/`ActingAsCode`/`IsActingAs`, and the observer interfaces `IGroupMembershipObserver`, `IEmployeeActivationObserver` and `IRosterSyncObserver`.
- **No shared `imports` table:** D04 uses `dataset_imports`, and D07 uses `notification_recipient_imports`.
- **Admin sync endpoints** live in D04, which owns those tables.
- **Merges:** branches are rebased onto `main` one at a time. Each time, the migration snapshot is checked with `has-pending-model-changes` (all clean), and the NSwag client is regenerated.

## Follow-ups and decisions for you

1. **Google redirect URI:** register `http://localhost:5161/api/auth/callback` on the v1 OAuth client. Until then, real Google sign-in fails locally and dev-login still works.
2. **Notification summary length:** the code uses 300 characters and the Markdown contract says 200. It is one constant, `NotificationMarkdown.SummaryMaxLength`.
3. **Official logo:** the HCMUS mark for the watermark. `public/bg-logo.svg` is a placeholder.
4. **HRM SQL in D05 has never run against HRM.** The column assumptions are listed in `docs/SYNC.md`. The first `sync hrm --dry-run` on the HRM box needs the read-only login (`deploy/sql/hrm-readonly-login.sql`).
5. **Build flake:** fixed by `fix/build-wwwroot-flake` (the frontend build no longer rewrites `wwwroot` under a running backend build).
6. **EF migrations bundle:** fixed by `fix/ef-bundle-release`; it now builds in Release as well as Debug. The `deploy/env.example` keys were reconciled by `docs/env-example-keys`.
7. **Hand-written API calls:** done in D14b. D10/D11 use the generated `meClient` through `features/profile/meMappers.ts` and one partial-date formatter in `lib/partialDate.ts`. D12 and D13 still use hand-written hooks (`educationApi.ts` and the innovation, teaching and research `*Api.ts` files) and could move to the generated client the same way.
8. **D07 extras still open:**
   - ~~a draft recipient-count estimate~~ (done in D09: `audience-estimate`)
   - an unschedule endpoint
   - an SSE connection cap per employee
9. **Not done:** data-protection key encryption, and the security checklist rotations (owner actions, D17).
10. **Roster sync overwrites manual changes:** sync can overwrite an admin's manual status change on HRM-sourced employees.

11. **Mock data in the production bundle:** fixed in D14b (all mock imports are guarded by `import.meta.env.DEV && MOCK_AUTH`; a production build has no mock chunks). D12 and D13 follow the same rule, but their mock chunks still appear in `wwwroot` as never-loaded files.
12. **Stale e2e specs:** fixed (`shell.spec.ts` checks the tab title for `/ho-so`, `markdown.spec.ts` waits for the selection, and the inbox specs wait for focus to return to the dialog before pressing Escape).
13. **Untyped `vars` in the generated client:** still open. `InboxDetailDto.vars` and `PreviewVarsDto.rows` come out as the abstract `JsonNode`, so the inbox detail and the editor's `preview-vars` use hand-written `http` calls until those DTOs get a concrete type.
14. **Live push is off** (`Notifications:Realtime:Enabled=false`). The frontend has no stream code.

15. **Dialog focus after acknowledging:** in `NotificationDialog` focus falls to `<body>` once the "Xác nhận đã đọc" button unmounts, so Escape does nothing until MUI's focus trap moves focus back. The specs now wait for that; the dialog could keep focus itself.
16. **Test infrastructure:**
    - Backend DB tests can fail with Npgsql timeouts (`DROP DATABASE … WITH (FORCE)` at collection cleanup) when the shared dev server is busy; a re-run passes.
    - The inbox and markdown Playwright specs flake when many mock webServers run in parallel (use `--workers=2 --retries=2`).
    - Parallel agents share the fixed mock ports (with `reuseExistingServer`), so they can attach to each other's dev servers. The real-backend e2e uses fixed ports 5261/5275: take a lock before running it from several agents.
    - A full Playwright run rewrites the screenshots of other deliveries: run `git checkout -- docs/screenshots` before committing.
17. **Two employee lookups:** D09 added `GET /api/manage/notifications/employees` and D14c added `GET /api/manage/employees`. The editor's targeting panel could switch to the latter.
18. **D09 and D14c gaps:** the editor has no download link for attachments (the only download endpoint is the recipient's). Removing someone's last email (D14c) does not end an open session; they just cannot sign in again.
19. **Sign-in is not exercised end to end:** Google sign-in cannot run in e2e. D14c proves "that person can sign in" through `/api/auth/me` and a backend test of the sign-in service.

20. **D15 decisions for you** (details in [MIGRATION.md](MIGRATION.md)):
    - the six other v1 ViewAs/Lookup holders are listed by the roles step, not granted (editor, admin or nothing);
    - v1 sheet findings for HR: 4 invalid emails, 10 emails that are another employee's HRM personal email, 2 MSCBs not in HRM;
    - `2026-02-03-TNNG-2026.json` has `datestr` 2026-03-02 (day and month look swapped) and the `-2022-3` file has an older date than its name; `datestr` is used;
    - imported news deliveries are marked **read** (v1 had no read state); `--no-mark-read` changes that;
    - guessed series and tags are listed for review, not final;
    - the update-info banner is pinned until 2036-01-01, and the stale v1 form cards (Sáng kiến, NCKH) lived in the v1 frontend repo, not the data repo, so they are not migrated.
21. **API clients admin screen** (resolved on `feat/api-clients-admin`): create the `legacy-migration` (scope `legacy.import`) and Sync (`hrm.ingest`) clients in Quản trị -> API clients and revoke the first one afterwards; the SQL in MIGRATION.md is only a fallback.
22. **Late joiners and `audience_all`**: a person who later gets a first email is backfilled with the two 2025 surveys and the banner (normal behaviour); the legacy posts have no `expires_at`.

23. **D18 decisions for you** (details in [PARITY.md](PARITY.md) and [CUTOVER.md](CUTOVER.md)):
    - the 7 MSCBs that v1 has twice are quarantined in v2 (no data, no sign-in): HR must make them unique before cutover;
    - 2 people (4 invalid emails in the roster) have no mapped email and receive nothing until HR fixes it;
    - the two 2025 surveys reach everyone in v2, while v1 had listed 93 to 96% of the roster (189 extra deliveries among the people compared);
    - the soak with `sync hrm` has not run (needs the HRM box and a week); after the first `sync hrm` the parity against v1 JSON stops applying (HRM replaces the synthetic rows).

## Way of working from now on (owner, 2026-10-02)

- **Work is fully offloaded to another machine.** The original machine stopped after pushing `main` and `feat/d14b-admin-pages`. This machine then finished and merged D09, D12, D13, D14b, D14c and the three follow-ups, using a temporary dev database on the shared server (`hcmus_support_dev_m2_<delivery>`).
- Work order, rules and the prompt to paste: [PARALLEL-WORK.md](PARALLEL-WORK.md). Setup: [DEV-SETUP.md](DEV-SETUP.md).
- The owner has lifted the one-agent limit on this machine and may start agents on other machines too: claim a branch first (`git ls-remote --heads origin 'feat/*'`), and use your own database and Playwright port. After each delivery the owner confirms (yes/no) before the next one starts.
