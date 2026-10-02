# HCMUS Support V2

The internal portal for HCMUS employees (support.hcmus.edu.vn, next version). It delivers targeted notifications and
each employee's own HR records. Editors manage notifications, groups and the MSCB↔email mapping; admins manage roles
and can view as another employee.

**Stack:** ASP.NET Core 8 (`HCMUSSupportV2.Backend`), PostgreSQL 17, Vite + React 19 + MUI v9 (`HCMUSSupportV2.Frontend`),
NSwag-generated TypeScript client, and an HRM sync console (`HCMUSSupportV2.Sync`).

**Start here**

| Topic | Doc |
|---|---|
| Set up a machine | [docs/DEV-SETUP.md](docs/DEV-SETUP.md) |
| Work in parallel from another machine | [docs/PARALLEL-WORK.md](docs/PARALLEL-WORK.md) |
| Plan and deliveries | [docs/PLAN.md](docs/PLAN.md) |
| Current state | [docs/PROGRESS.md](docs/PROGRESS.md) |
| Backend and frontend guides | [docs/BACKEND.md](docs/BACKEND.md) · [docs/FRONTEND.md](docs/FRONTEND.md) |
| Notifications, ingest, sync, groups | [docs/NOTIFICATIONS.md](docs/NOTIFICATIONS.md) · [docs/INGEST.md](docs/INGEST.md) · [docs/SYNC.md](docs/SYNC.md) · [docs/GROUP-RULES.md](docs/GROUP-RULES.md) |
| Operations (not deployed yet) | [docs/OPERATIONS.md](docs/OPERATIONS.md) · [docs/SECURITY-CHECKLIST.md](docs/SECURITY-CHECKLIST.md) |
| The legacy system | [docs/INVENTORY.md](docs/INVENTORY.md) |

Don't deploy to or change the live server until v2 is complete.
