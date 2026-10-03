# Developer setup (any machine)

How to clone and run HCMUS Support V2 on a new machine. For how to split work between machines, see
[PARALLEL-WORK.md](PARALLEL-WORK.md).

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| .NET SDK | 9.x (targets `net8.0`) | `dotnet --list-sdks`. The projects stay on .NET 8 (PLAN §10 Q1). |
| Node.js | 24.x (npm 11) | The frontend builds through an msbuild target, so `dotnet build` also runs `npm install` and `npm run build`. |
| PostgreSQL | **17** | Use the shared dev server (§3a) or a local container (§3b). Needs the `citext`, `unaccent` and `pg_trgm` extensions; the migrations create them. |
| Docker | optional | For a local Postgres. |
| Git | any | Line endings are handled by `.gitattributes`. |

## 2. Clone and restore

```bash
git clone https://github.com/tmkhiem/HCMUSSupportV2.git
cd HCMUSSupportV2
dotnet tool restore                       # nswag, dotnet-ef (pinned in .config/dotnet-tools.json)
cd HCMUSSupportV2.Frontend && npm ci && cd ..
```

## 3. Database

Every machine and every branch uses **its own database name**, so migrations from different branches never collide.
Use `hcmus_support_dev_<machine>_<delivery>`, for example `hcmus_support_dev_laptop_d12`. The tests create and drop
`hcmus_support_test_<guid>` on their own, which is safe on a shared server.

### 3a. Shared dev server (only if this machine can reach it)

`Host=10.0.0.11;Port=65432;Username=sa;Password=<ask the owner>`. This is PostgreSQL 17.11, and `sa` is a superuser.

### 3b. Local container

```bash
docker run -d --name hcmus-pg -p 5432:5432 -e POSTGRES_USER=sa -e POSTGRES_PASSWORD=<choose-one> postgres:17
```

## 4. Local configuration (never committed)

Copy `HCMUSSupportV2.Backend/appsettings.Development.local.json.example` to `appsettings.Development.local.json` in the same
folder. The `*.local.json` pattern is gitignored. Fill in:

- `ConnectionStrings:Default`: your database from §3.
- `Auth:DevLogin:Enabled: true`. Sign in with the dev roster `T0001` (admin), `T0002` (editor) and `T0003`… (employees),
  which is seeded in Development. When debugging from Visual Studio (Debug configuration, SPA served from `wwwroot`),
  open `/dev-login` and sign in with the MSCB and the password `assembler`. The page is compiled out of Release builds.
- `Hrm:DevApiClient:Token`: any random string of 24 or more characters. The sync tool uses it locally.
- `Auth:Google:*`: **leave these empty on secondary machines**. Dev-login is enough. Real Google sign-in only works on a
  machine and port whose redirect URI is registered (`http://localhost:5161/api/auth/callback`), and the client secret
  is never committed.

The tests read the same file, or the environment variable `HCMUS_TEST_PG` (a connection string to a server where they
may create databases).

## 5. Run, test, generate

```bash
dotnet run --project HCMUSSupportV2.Backend --launch-profile http     # http://localhost:5161 (migrates on start in Development)
cd HCMUSSupportV2.Frontend && npm run dev                              # http://localhost:5173, proxies /api to 5161
npm run dev:mock                                                       # frontend only, with a synthetic signed-in user
dotnet test                                                            # backend and sync tests
cd HCMUSSupportV2.Frontend && npx vitest run && npm run lint && npm run build
npm run test:e2e                                                       # Playwright, mock projects
npm run test:e2e:real                                                  # Playwright against a real backend (5261 / 5275)
powershell -File generate-api.ps1                                      # regenerate src/api/generated-client.ts after API changes
```

## 6. References outside this repo

| What | Where | Needed for |
|---|---|---|
| Desired UI look | **Vendored:** [docs/reference/prompting-fe-build](reference/prompting-fe-build/) (read-only snapshot) | every UI delivery |
| v1 data repo (contains **PII**) | private GitHub `tmkhiem/SupportHCMUSData`. Clone it **outside** this repo and never copy its data in. | D05 `sync legacy-git`, D15 legacy migration |
| v1 backend and frontend sources | owner's machine (`D:\git\SupportHCMUS`, `D:\git\hcmus-portal-fe`), summarised in [INVENTORY.md](INVENTORY.md) | rarely; the inventory is enough |
| HRM SQL Server | HCMUS internal network only | D05 `sync hrm` (not runnable elsewhere) |
| Live server `support.hcmus.edu.vn` | **do not touch** until v2 is complete | none |

Absolute `D:\…` paths in [PLAN.md](PLAN.md) and [INVENTORY.md](INVENTORY.md) refer to the owner's machine. Use the vendored
snapshot or the inventory instead.
