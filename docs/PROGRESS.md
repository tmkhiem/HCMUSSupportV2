# Implementation progress

Updated 2026-10-02 ~10:00. Plan: [PLAN.md](PLAN.md). Nothing is pushed to `origin` and nothing is deployed. The live server is untouched.

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
| D11 | Hồ sơ: Quá trình lương, Chức vụ, Khen thưởng pages | ✓ (vitest 163, Playwright `career`) |
| D14a | Admin backend: roles, view-as (read-only + audited), audit query, dashboard | ✓ |
| D16 | Deployment kit (systemd, nginx, backup/restore, `deploy.ps1`, OPERATIONS.md). Validated in Docker only | ✓ |
| D17 | Security checklist + read-only HRM SQL login template | n/a |

Before D07 was merged, `main` passed 122 backend tests and 63 frontend vitest tests. The D07 branch, rebased onto `main` with D04 and D06 in it, passed 352 of 353 backend tests. The one failure was the outdated view-as test helper, which I then fixed, and the notifications tests passed 142/142. The full backend suite has not been re-run on `main` since the D07 merge.

## Interrupted (the usage limit cut the agents off at ~04:25)

| Branch / worktree | State |
|---|---|
| `feat/d10-profile-pages` (`.claude/worktrees/d10`) | Hồ sơ overview, Thông tin chung and Thông tin chi tiết are committed as "unverified WIP". The agent's last message says its 7 Playwright tests passed, but the final edits and screenshots are uncommitted. It needs a verify pass, then commit and merge. |
| `feat/d14b-admin-pages` (`.claude/worktrees/d14b`) | Admin and editor pages were in progress (it stopped in the middle of the rule builder). **Nothing is committed**; all the work is uncommitted files in the worktree. It needs finishing, verifying and committing. |

## Not started

- **D08**: Tin tức inbox UI (renderer from D07a, SSE badge).
- **D09**: notification editor UI (MDXEditor component from D07a, targeting, import, preview-as-MSCB).
- **D12**: Hồ sơ pages for Đào tạo, Bồi dưỡng and Công tác.
- **D13**: Sáng kiến, Giảng dạy and NCKH pages.
- **D15**: legacy migration. The users.json emails, the 56 news posts (HTML → Markdown) and the datasets aren't imported yet. The HRM data itself can already come in through `sync legacy-git`.
- **D18**: parity check and cutover.
- **Gap found:** nobody owns the backend for the **MSCB ↔ email mapping** (PLAN §5 `manage/employees`, email add/remove, bulk import with dry-run). It needs its own delivery (proposed: **D14c**) before the Nhân sự & email page can be built.

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
5. **Build flake:** `dotnet build`/`test` sometimes fails with "No file exists for the asset … wwwroot/assets/index-*.js". It happens when the frontend build rewrites `wwwroot` during a backend build, and a re-run passes. This needs a proper fix in the Frontend csproj, or an `obj` clean.
6. **EF migrations bundle** only builds in Debug, because of `EfToolsExcludeAssets` (see D16 notes). D16 also has `deploy/env.example` keys that should be reconciled with the real config keys.
7. **Hand-written API calls:** D10 and D11 call `http.get('/api/me/...')` with hand-written types. Swap them to the generated client now that it has the Hrm endpoints. D11 also duplicates a partial-date helper that should be shared.
8. **D07 extras still open:**
   - a draft recipient-count estimate (needed by D09)
   - an unschedule endpoint
   - an SSE connection cap per employee
9. **Not done:** data-protection key encryption, and the security checklist rotations (owner actions, D17).
10. **Roster sync overwrites manual changes:** sync can overwrite an admin's manual status change on HRM-sourced employees.

## Way of working from now on (owner, 2026-10-02)

One Sonnet 5.5 agent at a time, with no parallel agents. After each item, the owner confirms (yes/no) before the next one starts.
