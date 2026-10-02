# Parallel work across machines

Since 2026-10-02 the owner's main machine keeps working through the core path, one agent at a time. Small, independent
parts are handed to an agent on **another machine**. This file is the contract that keeps the two from colliding.

Setup is in [DEV-SETUP.md](DEV-SETUP.md), the plan in [PLAN.md](PLAN.md) §9, and the current state in [PROGRESS.md](PROGRESS.md).

## 1. Who does what (updated 2026-10-02: work fully offloaded)

The owner's main machine has **stopped**. All remaining work now happens on the **other machine**, still one
implementation agent at a time, and the owner confirms (yes/no) after each delivery. Order:

1. **D14b** · finish the branch `feat/d14b-admin-pages` (pushed). Two commits finish the admin pages (Part A). The
   top commit `wip(frontend): Part B …` is unverified work in progress:
   - switching D10/D11 to the generated client
   - deduplicating the partial-date helpers
   - guarding mock chunks out of the production bundle
   - fixing the stale `shell.spec.ts` and `markdown.spec.ts` specs

   Finish it, verify it, and merge it. Nhân sự & email stays out of D14b; that's D14c.
2. **D09** · notification editor UI (PLAN §7.3 "Quản lý thông báo", §9 D09). It uses the D07a editor component
   `src/features/notifications/editor/LazyNotificationMarkdownEditor.tsx` and `MarkdownPreviewPane.tsx`.
3. **D14c** · MSCB↔email mapping: the backend `manage/employees` endpoints (directory, email add/remove/set primary, bulk xlsx import
   with a dry-run report) and the "Nhân sự & email" page. This replaces the Google Sheet. **New backend work.**
4. **D12** and **D13** · frontend-only Hồ sơ / Sáng kiến / Giảng dạy / NCKH pages. The endpoints already exist.
5. **D15** · legacy migration (needs a clone of the private `tmkhiem/SupportHCMUSData` *outside* this repo).
6. Free follow-ups in §3, then **D18** parity and cutover, with the owner.

## 2. Branches and integrating

1. **One delivery per branch:** `feat/dNN-<slug>` from `origin/main` (D14b continues on its existing branch). Rebase on `origin/main` before merging.
2. **Integrating:** since this is now the only active machine, it **may merge into `main` and push `main`** (fast-forward or
   `--no-ff` merge, **never force-push**), but only when the branch is green:
   - `dotnet build`, `dotnet test`
   - `npm run build`, `npm run lint`, `npx vitest run`
   - its Playwright projects
   - for UI deliveries, `npm run test:e2e:real` too
3. **Migrations:** one migration per delivery, generated last, after rebasing. If `AppDbContextModelSnapshot.cs` conflicts,
   delete your migration, rebase, regenerate it, and check with `dotnet ef migrations has-pending-model-changes`.
4. **After each delivery:** add a row under "Merged" in `docs/PROGRESS.md`, update its follow-ups, then **stop and ask the owner** before the next one.

## 3. Files that conflict, and the rules for them

| File | Rule |
|---|---|
| `HCMUSSupportV2.Frontend/src/app/routes.tsx`, `src/app/nav.ts` | Add or change **one line per route**. Keep existing lines. |
| `HCMUSSupportV2.Frontend/playwright.config.ts` | Add **one project and one webServer** with a free port. Ports in use: 5273, 5274, 5373, 5383, 5393, 5473, 5483. The secondary machine takes 5583 for D12 and 5593 for D13. |
| `HCMUSSupportV2.Frontend/src/api/generated-client.ts` | Only `generate-api.ps1` writes it. If it conflicts, take `main`'s version and regenerate. The secondary machine shouldn't need to change it at all. |
| `HCMUSSupportV2.Backend/Migrations/*` | One migration per delivery, following the rule in §2.3. |
| `docs/PLAN.md`, `docs/FRONTEND.md` | Tick only your own delivery's boxes, and add your own section. Keep both sides when merging. |
| `docs/PROGRESS.md` | Update it after each merged delivery. |
| `docs/screenshots/<delivery>/` | Write only your own delivery's folder. Running the full Playwright suite rewrites other folders: `git checkout -- docs/screenshots` before committing. |
| `src/ui/*`, `src/lib/*` (shared primitives/helpers) | Add new files freely. To change an existing one, keep it backward compatible and mention it in the PR. |

**Free follow-ups** (each on its own branch):
- `fix/build-wwwroot-flake`: the intermittent "No file exists for the asset … wwwroot/assets" build failure (fixed and merged in `integration/d12-d13-followups`).
- `fix/ef-bundle-release`: the EF migrations bundle used to build only in Debug (`EfToolsExcludeAssets`); fixed, it now builds in Release too.
- `docs/env-example-keys`: reconcile `deploy/env.example` with the real config keys.

## 4. Non-negotiables (both machines)

- **The UI:**
  - It is the PromptingFEBuild look on MUI v9 (PLAN §7). The snapshot is in `docs/reference/prompting-fe-build/`.
  - Each category gets its **own bespoke page and components**. No generic category renderer is allowed; shared primitives are fine.
  - Vietnamese UI copy, `@mui/icons-material` with per-path imports.
- **No live push.** No SSE, EventSource or polling for notifications; employees reload.
- **Data and secrets:** synthetic data only (MSCB `T0001…`). Never put real HRM or v1 data in fixtures, screenshots or logs. Commit no secrets: config belongs in `*.local.json`.
- **Never touch the live server** `support.hcmus.edu.vn`.
- **Agents:** Sonnet 5.5, and one implementation agent at a time per machine.

## 5. Prompt for the other machine

Clone the repo, follow DEV-SETUP.md (a local Postgres container is fine), open Claude Code in the repo root and paste:

```text
You are continuing HCMUS Support V2 (ASP.NET Core 8 + PostgreSQL 17 + Vite/React 19/MUI v9). The owner's original
machine has stopped; this machine now does all remaining work. Read these first and follow them exactly:
docs/PARALLEL-WORK.md (work order, branch/merge rules, conflict rules, non-negotiables), docs/DEV-SETUP.md (setup),
docs/PROGRESS.md (current state + follow-ups), docs/PLAN.md (§2 platform, §3 data model, §4 roles, §5 API, §6 routes,
§7 UI incl. §7.3 page designs, §8 conventions, §9 deliveries), docs/FRONTEND.md, docs/BACKEND.md, docs/NOTIFICATIONS.md,
docs/notification-markdown.md, and the look reference docs/reference/prompting-fe-build/.

Work in the order of docs/PARALLEL-WORK.md §1, ONE delivery at a time, starting with D14b: check out the pushed branch
feat/d14b-admin-pages, review its top "wip(frontend): Part B" commit (unverified), finish and verify everything listed
there, rebase on origin/main, merge into main and push main.

Rules:
- Use at most one implementation subagent at a time (Sonnet 5.5); never run parallel agents.
- One branch per delivery (feat/dNN-<slug> from origin/main), green before merge (dotnet build/test, npm run build,
  npm run lint, npx vitest run, the delivery's Playwright projects, and npm run test:e2e:real for UI work). Never force-push.
- Bespoke page per category (no generic category renderer), the PromptingFEBuild look on MUI v9, Vietnamese UI copy,
  @mui/icons-material per-path imports, no live push (no SSE/EventSource/polling), synthetic data only, no secrets in
  commits, never touch the live server support.hcmus.edu.vn.
- After each delivery is merged: update docs/PROGRESS.md (Merged table + follow-ups), push main, then STOP and ask me
  "continue with <next delivery>? (yes/no)" before starting the next one.
```
