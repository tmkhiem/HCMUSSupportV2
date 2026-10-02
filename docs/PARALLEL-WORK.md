# Parallel work across machines

Since 2026-10-02 the owner's main machine keeps working through the core path, one agent at a time. Small, independent
parts are handed to an agent on **another machine**. This file is the contract that keeps the two from colliding.

Setup is in [DEV-SETUP.md](DEV-SETUP.md), the plan in [PLAN.md](PLAN.md) §9, and the current state in [PROGRESS.md](PROGRESS.md).

## 1. Who does what

| Owner of the work | Deliveries |
|---|---|
| **Main machine** (core path) | D14b admin pages (in progress) → D09 notification editor UI → D14c MSCB↔email mapping (backend + page) → D15 legacy migration → D18 parity/cutover |
| **Secondary machine** (small, independent parts) | **D12** Hồ sơ: Quá trình đào tạo, Quá trình bồi dưỡng, Đi công tác (frontend only) · **D13** Sáng kiến, Giảng dạy, Nghiên cứu khoa học (frontend only) · small follow-ups from PROGRESS.md that are marked as free (see §3) |

The backend endpoints D12 and D13 need already exist on `main` (D04: `GET /api/me/degrees`, `trainings`, `business-trips`,
`innovations`, `teaching`, `teaching/years`, `research/projects`, `research/publications`), so neither needs backend changes. If
one turns out to need a backend change, stop and ask the owner. Don't change backend modules from the secondary machine.

## 2. Claiming and integrating

1. **Claim before you start:** create and push the branch straight away, so the other machine can see it:
   `git switch -c feat/d12-education-pages origin/main && git commit --allow-empty -m "claim: D12" && git push -u origin HEAD`.
   Check existing claims with `git ls-remote --heads origin 'feat/*'`. Never start an item someone else has already claimed.
2. **One delivery per branch.** Rebase on `origin/main` often (`git fetch && git rebase origin/main`).
3. **Never push `main`** from the secondary machine, and never force-push someone else's branch. Push only your `feat/*` branch, then
   open a pull request into `main` (or tell the owner the branch is ready). The main machine merges.
4. A branch is "ready" when `npm run build`, `npm run lint`, `npx vitest run` and its Playwright project are green, and the
   delivery's checkboxes in `docs/PLAN.md` are ticked.

## 3. Files that conflict, and the rules for them

| File | Rule |
|---|---|
| `HCMUSSupportV2.Frontend/src/app/routes.tsx`, `src/app/nav.ts` | Add or change **one line per route**. Keep existing lines. |
| `HCMUSSupportV2.Frontend/playwright.config.ts` | Add **one project and one webServer** with a free port. Ports in use: 5273, 5274, 5373, 5383, 5393, 5473, 5483. The secondary machine takes 5583 for D12 and 5593 for D13. |
| `HCMUSSupportV2.Frontend/src/api/generated-client.ts` | Only `generate-api.ps1` writes it. If it conflicts, take `main`'s version and regenerate. The secondary machine shouldn't need to change it at all. |
| `HCMUSSupportV2.Backend/Migrations/*` | Main machine only. |
| `docs/PLAN.md`, `docs/FRONTEND.md` | Tick only your own delivery's boxes, and add your own section. Keep both sides when merging. |
| `docs/PROGRESS.md` | Main machine only. |
| `docs/screenshots/<delivery>/` | Write only your own delivery's folder. Running the full Playwright suite rewrites other folders: `git checkout -- docs/screenshots` before committing. |
| `src/ui/*`, `src/lib/*` (shared primitives/helpers) | Add new files freely. To change an existing one, keep it backward compatible and mention it in the PR. |

**Free follow-ups for the secondary machine** (take them only after D12/D13, and claim each with its own branch):
- `fix/build-wwwroot-flake`: the intermittent "No file exists for the asset … wwwroot/assets" build failure.
- `fix/ef-bundle-release`: the EF migrations bundle only builds in Debug (`EfToolsExcludeAssets`).
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

## 5. Prompt for the secondary machine

Clone the repo, follow DEV-SETUP.md (a local Postgres container is fine), open Claude Code in the repo root and paste:

```text
You are working on HCMUS Support V2 (ASP.NET Core 8 + PostgreSQL 17 + Vite/React 19/MUI v9), cloned on a SECONDARY
machine. Another machine (the owner's) works on the core path at the same time. Read these first and follow them exactly:
docs/PARALLEL-WORK.md (ownership, claiming, conflict rules, non-negotiables), docs/DEV-SETUP.md (setup), docs/PLAN.md
(§6 routes, §7 UI incl. §7.3 page designs, §8 conventions, §9 D12 and D13), docs/FRONTEND.md (structure, theme variants,
primitives, clients, mock auth, Playwright), docs/BACKEND.md (Hrm section: the me/* endpoints and DTOs in
HCMUSSupportV2.Backend/Modules/Hrm/Me/MeDtos.cs), and the look reference docs/reference/prompting-fe-build/.

Your work, in order, one delivery at a time:
1. D12 · Hồ sơ: Quá trình đào tạo (/ho-so/dao-tao: diploma-style cards), Quá trình bồi dưỡng (/ho-so/boi-duong: table
   grouped by year with sticky group dividers), Đi công tác (/ho-so/cong-tac: stats + year filter + table).
2. D13 · Sáng kiến (/sang-kien), Giảng dạy (/giang-day: academic-year pill select, stats, table grouped by học kỳ),
   Nghiên cứu khoa học (/nckh/de-tai and /nckh/bai-bao with the skewed pill switcher from the reference).
Both are frontend-only: the backend endpoints exist. Follow the patterns of the existing D10/D11 pages in
src/features/profile/ (data hooks via the generated client in src/api/clients.ts, synthetic mock data under VITE_MOCK_AUTH
guarded by import.meta.env.DEV so it never ships in production, PageState for error/loading/empty, fly-in, 375px responsive).

Rules:
- Before starting each delivery: git fetch; check `git ls-remote --heads origin 'feat/*'`; claim it by pushing an empty
  commit on feat/d12-education-pages (or feat/d13-research-teaching-pages) branched from origin/main.
- Never push main, never touch backend modules or migrations, never edit docs/PROGRESS.md, never touch the live server,
  synthetic data only, no secrets in commits.
- Use your own Playwright project and port (D12: 5583, D13: 5593) and only your own docs/screenshots/<delivery>/ folder.
- Done means: npm run build, npm run lint, npx vitest run and your Playwright project are green; screenshots at 1440 and
  375 committed; your PLAN.md boxes ticked; a short section in docs/FRONTEND.md. Rebase on origin/main, push the branch,
  open a pull request into main (or report the branch name), then STOP and ask me before starting the next delivery.
- If an endpoint or DTO is missing or wrong, do not change the backend — stop and report it.
```
