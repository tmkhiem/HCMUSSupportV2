# Sync tool (`HCMUSSupportV2.Sync`)

A .NET 8 console that reads HRM data and posts **full snapshots** to the portal's ingest API (`POST /api/integration/v1/{dataset}`,
see [INGEST.md](INGEST.md)). It replaces the v1 "jjob" executor. Two sources produce the same typed payloads:

| Source | Command | Reads | Ids | Use |
|---|---|---|---|---|
| `hrm` | `sync hrm` | the HRM SQL Server (read-only login) | real source primary keys | the nightly job |
| `legacy-git` | `sync legacy-git --path <SupportHCMUSData>` | the v1 JSON in the local data repo (offline) | **synthetic**, content-hash based | one-off seeding / transition (D15) |

```
HCMUSSupportV2.Sync sync hrm        [--datasets all|a,b,c] [--dry-run] [--force]
HCMUSSupportV2.Sync sync legacy-git --path D:\git\SupportHCMUSData [--datasets all|a,b,c] [--dry-run] [--force]
```

Datasets (posted in this order, so org units and employees exist before the rows that reference them):
`org-units, employees, profiles, salary, positions, commendations, degrees, trainings, business-trips, innovations`.
`--datasets` takes any subset; the order typed does not matter.

- `--dry-run` reads and maps only and prints `rows=N` per dataset; nothing is posted and **no API settings are needed**
  (`hrm` still needs the SQL connection string).
- `--force` sends `?force=true`, which accepts a snapshot below 80 % of the previous successful run (the server's truncation
  guard answers 409 otherwise). Use it deliberately, for example after a real mass leaving.
- Output is one line per dataset, for example
  `[salary] sent=11204 received=11204 inserted=0 updated=3 deleted=1 issues=2 [bad_date=2] status=success run=42`.
  A final `mapping notes:` line lists rows the tool itself skipped or flagged (counts only, never personal data).
- **Exit code:** `0` all datasets succeeded, `1` at least one dataset failed (HTTP error, 409 guard, read error; a 401/403 or an
  unreachable API aborts the remaining datasets), `2` bad arguments or missing configuration. Task Scheduler shows the code
  as "Last Run Result".

## Configuration

`appsettings.json` next to the exe (section `Sync`), then optional `appsettings.local.json`, then environment variables
(`Sync__ApiBaseUrl`, ...). Later wins.

| Key | Meaning |
|---|---|
| `Sync:ApiBaseUrl` | portal origin, for example `https://support.hcmus.edu.vn` (no path) |
| `Sync:ApiToken` | the plain API token (`Authorization: ApiKey <token>`), scope `hrm.ingest` |
| `Sync:HrmConnectionString` | `Server=<HRM_SERVER>;Database=HRM;User Id=hcmus_support_sync;Password=...;Encrypt=True;TrustServerCertificate=True` |
| `Sync:TimeoutSeconds` | per-request HTTP timeout, default 300 |

Keep the secrets in `appsettings.local.json` (or machine environment variables), never in the committed `appsettings.json`,
and restrict its NTFS ACL to the service account and administrators.

## Install on the HRM box (nightly 22:30)

1. **Publish** on a dev machine (self-contained, so the box needs no .NET install):
   `dotnet publish HCMUSSupportV2.Sync -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o publish`
   and copy `publish\` to `C:\HCMUSSupportV2.Sync\` on the HRM Windows machine. The SQL files are embedded in the exe.
2. **SQL login.** A DBA runs `deploy/sql/hrm-readonly-login.sql` (replace `<CHANGE_ME>` with a random password first). It grants
   `SELECT` on the 26 tables the queries use, and denies writes, DDL and `EXECUTE`. Put the connection string in
   `appsettings.local.json`. Never use `sa` or the Windows account that runs HRM.
3. **API client.** An admin creates an API client with scope `hrm.ingest` (Quản trị -> API clients) and copies the token (shown once).
   Put it in `Sync:ApiToken`.
4. **Smoke test**, as the service account:
   `C:\HCMUSSupportV2.Sync\HCMUSSupportV2.Sync.exe sync hrm --dry-run` and compare the row counts with HRM. Then run without
   `--dry-run` once by hand and check `GET /api/admin/sync-issues`.
5. **Schedule** (run elevated; `/RP *` prompts for the service account's password):

```
schtasks /Create /TN "HCMUS Support V2 Sync" /SC DAILY /ST 22:30 /RU HRMBOX\svc_hcmus_sync /RP * /RL LIMITED ^
  /TR "\"C:\HCMUSSupportV2.Sync\HCMUSSupportV2.Sync.exe\" sync hrm --datasets all"
```

   Equivalent Task Scheduler XML (import with `schtasks /Create /TN "HCMUS Support V2 Sync" /XML task.xml /RU ... /RP *`):

```xml
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers><CalendarTrigger><StartBoundary>2026-01-01T22:30:00</StartBoundary><ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay></CalendarTrigger></Triggers>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <ExecutionTimeLimit>PT2H</ExecutionTimeLimit>
  </Settings>
  <Actions><Exec><Command>C:\HCMUSSupportV2.Sync\HCMUSSupportV2.Sync.exe</Command><Arguments>sync hrm --datasets all</Arguments>
    <WorkingDirectory>C:\HCMUSSupportV2.Sync</WorkingDirectory></Exec></Actions>
</Task>
```

   To keep a log, wrap it: `cmd /c ""C:\...\HCMUSSupportV2.Sync.exe" sync hrm >> C:\HCMUSSupportV2.Sync\logs\sync.log 2>&1"`.
   The log holds counts only. The run, its counters and every issue are also stored server side (`sync_runs`, `sync_issues`).

## Rotating the API token

1. In the admin page create a **new** API client (or rotate the existing one) with scope `hrm.ingest`; copy the new token.
2. Put it in `Sync:ApiToken` on the HRM box (`appsettings.local.json`), run `sync hrm --dry-run` (no API call) and then
   one real run outside the nightly window to see `status=success`.
3. Revoke the old client in the admin page. A revoked or unknown key answers 401 and the tool aborts with exit code 1.

Rotate at least every 90 days, and immediately if the box or the config file is exposed. Rotate the SQL password on the
same schedule (`ALTER LOGIN hcmus_support_sync WITH PASSWORD = '...'`, then update the connection string).

## How the sources map

### `hrm` (SQL, `Sync/Queries/<dataset>.sql`, embedded)

Each query aliases its columns to the snake_case names the row mapper reads (`hrm_id`, `employee_code`, ...) and returns the
**source primary key as `hrm_id`**: `NS_NHANSU.NHANSU` for employees and profiles, `QuaTrinhLuong`, `QuaTrinhChucVu`,
`QuaTrinhKhenThuong`, `QuaTrinhDaoTao`, `QuaTrinhBoiDuong`, `QuaTrinhCongTac`, `QuaTrinhSangKien` for the child tables. Date
columns may be real dates or the free text HRM stores (`2012`, `05/2013`, `dd/MM/yyyy`); partial dates keep their precision.

Fixes against the v1 jjobs (also noted at the top of each file):

- **business-trips**: the v1 job still had a debug filter on one hard-coded MSCB (and `TOP (1000)`), so only one employee's 63
  rows were published. Removed: it is the full table.
- **degrees**: the country join compared the code column to the name column (`MaQuocTich = TenQuocTich`); it joins code to code.
- **innovations**: the date is returned as a date (v1 sorted a `dd/MM/yyyy` string), and the type join is `LEFT`.
- Child queries inner-join `NS_NHANSU` (v1 used left joins and produced rows without an MSCB).

**Assumptions to confirm with the HRM owner before the first real run** (the queries were written without access to the
database; `--dry-run` against HRM will expose a wrong column name immediately):

- `org-units`: `DM_DONVI(MADONVI, TENDONVI)` and `DM_PHONGBAN(MAPHONGBAN, TENPHONGBAN)` are the only columns used. A department's
  parent unit is taken from where its staff sit (`NS_NHANSU.DONVI`, most frequent), because the department's own unit column is
  not documented. `hrm_id` is one number space on the server and the two code spaces may overlap, so **department ids are offset by
  1,000,000** (`org-units.sql` and `employees.sql` apply the same offset; keep them in step). No `code` is available.
- `employees.status`: `Del = 1` or `NgayDeleted` set gives `inactive`; `NGAYNGHIVIEC` in the past gives `retired`;
  `IsNgungCongTac = 1` gives `inactive`; otherwise `active`. Adjust the `CASE` if HRM models leavers differently.
- `positions.ended_on` is always null (no end-date column is documented), `salary.grade_name` and `commendations.academic_year`
  are null (HRM has no such columns in the v1 jobs).
- `salary.over_grade_pct` takes `HeSoVuotKhung` (the v1 salary column) and `profiles.over_grade_pct` takes
  `NS_NHANSU.PhanTramVuotKhung`.

### `legacy-git` (v1 JSON)

Reads `notifications/<category>/<category>-N.json` (chunks in numeric order; an MSCB spread over chunks is merged), strips the
braces from the keys (`{MA}` becomes `MA`), trims the fixed-width padding, and maps columns using the jjob SQL and templates:

| v1 category | Dataset | Notes |
|---|---|---|
| `general-profile` + `detailed-profile` | `employees`, `profiles` (+ sensitive), `org-units` | the two files are paired row by row inside each MSCB |
| `salary-progress` | `salary` | |
| `award` + `title` | `commendations` | `kind = award` / `title` (the two v1 categories are `IsDanhHieu` 0 / 1) |
| `position` | `positions` | `endedOn` is null |
| `academic-progress` | `degrees` | |
| `training-progress` | `trainings` | rows without `NoiDung` are skipped (counted in the notes) |
| `business-mission` | `business-trips` | v1 only holds the debug MSCB (63 rows); see the fix above |
| `innovation` | `innovations` | `ma_sk` becomes the code and `mo_ta` the title (code is used when the title is empty) |

Dates: `dd/MM/yyyy` (also `d/M/yyyy`) becomes `yyyy-MM-dd`, `MM/yyyy` becomes `yyyy-MM`, `yyyy` stays a year. The date of birth
is composed from `NGAYSINH` / `THANGSINH` / `NAMSINH` and may be a month or a year only. Anything unparseable (for example a
lone `9`) is sent as the original text so the API stores null and records a `bad_date` issue.

**Limitations of `legacy-git` (read before using it in production):**

- **Synthetic ids.** v1 JSON has no source keys, so `hrm_id = hash(dataset, MSCB, row content, occurrence)` mapped into
  `[1,000,000,000, 2,147,483,646]`. They are stable while a row is unchanged, but an edited row looks to the server like a delete
  plus an insert, and the first `sync hrm` run replaces **all** of them (snapshot semantics delete every id that the real run does
  not contain). That is intended: `legacy-git` is a bridge, not a steady state.
- **Org units are derived.** The detailed profile carries unit and department names only, so units get synthetic ids from the
  name hash (`kind = unit`, no code) and departments are parented to the unit they appear with. A later `sync hrm` run
  deactivates them (the `hrm` ids replace them) and re-creates the real hierarchy.
- **Employees** have no `hrmId` and always `status = active` (v1 JSON has no leaver flag). The 9 duplicated MSCBs are sent as
  they are and the server quarantines them (`duplicate_mscb`).
- Fields v1 never exported stay null: `salary.gradeName`, `overGradePct` on profiles, `youthUnionJoinedOn`, `commendation.academicYear`,
  `position.endedOn`.

The same executable also runs the one-off **`sync legacy-migrate`** (roster emails, roles, teaching, research, papers; D15): see [MIGRATION.md](MIGRATION.md). It is a dry run unless `--apply`.

Transition use: run `legacy-git` once into a fresh database (D15) so the portal can be exercised with real facts, then switch
the nightly task to `hrm` as soon as the read-only login exists. Do not run both on a schedule. Teaching, research and
publications are Excel imports, not part of `sync legacy-git` (D15 brings the v1 ones in through `sync legacy-migrate`).

## Development

```
dotnet test HCMUSSupportV2.Sync.Tests                       # synthetic fixtures only, no network, no database
dotnet run --project HCMUSSupportV2.Sync -- sync legacy-git --path D:\git\SupportHCMUSData --dry-run
```

The DTOs in `HCMUSSupportV2.Sync/Contracts/IngestDtos.cs` are a **copy** of `Modules/Hrm/Integration/IngestDtos.cs` (the tool does not
reference the web project). When the backend records change, update the copy; a drift shows as ignored or missing properties.
To test against a local backend: set `Hrm:DevApiClient:Token` (24+ characters) in the backend's git-ignored
`appsettings.Development.local.json`, start it, and point `Sync__ApiBaseUrl` / `Sync__ApiToken` at it.

**Verified end to end (D05):** a full `sync legacy-git` of the real data repo into a fresh local dev database finished with every
dataset `status=success`; a second run reported `inserted=0 updated=0 deleted=0` everywhere. The only issues were the expected ones:
`duplicate_mscb` (7 on employees and on profiles), `bad_date` (lone digits or impossible dates in the source) and `unknown_employee`
(commendation or degree rows of an MSCB that is not in the roster).
