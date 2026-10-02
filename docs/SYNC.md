# Sync tool (`HCMUSSupportV2.Sync`)

A .NET 8 console that reads HRM data and posts **full snapshots** to the portal's ingest API (`POST /api/integration/v1/{dataset}`,
see [INGEST.md](INGEST.md)). It replaces the v1 "jjob" executor. Two sources produce the same typed payloads:

| Source | Command | Reads | Ids | Use |
|---|---|---|---|---|
| `hrm` | `sync hrm` | the HRM SQL Server (read-only login) | real source primary keys | the nightly job |
| `legacy-git` | `sync legacy-git --path <SupportHCMUSData>` | the v1 JSON in the local data repo (offline) | **synthetic**, content-hash based | one-off seeding / transition (D15) |

Two more verbs, `legacy-emails` and `legacy-datasets`, belong to the one-off v1 migration and post to `/api/integration/v1/legacy/*`
(scope `legacy.import`). They are described [below](#legacy-emails-and-legacy-datasets-d15).

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
3. **API client.** An admin creates an API client with scope `hrm.ingest` (admin page, D14b) and copies the token (shown once).
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

Transition use: run `legacy-git` once into a fresh database (D15) so the portal can be exercised with real facts, then switch
the nightly task to `hrm` as soon as the read-only login exists. Do not run both on a schedule. Teaching, research and
publications are not part of `hrm` and `legacy-git`: the v1 data goes in through `legacy-datasets` (below), and later updates come
from the admin Excel import (D04).

## `legacy-emails` and `legacy-datasets` (D15)

One-off verbs for the v1 migration (order and contract: [LEGACY-MIGRATION.md](LEGACY-MIGRATION.md)). They need an API client with scope
`legacy.import` (in Development the `dev` client has it) and run after `legacy-git`, because the server looks employees up.

```
HCMUSSupportV2.Sync sync legacy-emails   --path D:\git\SupportHCMUSData [--dry-run [--server-dry-run]] [--report <dir>]
HCMUSSupportV2.Sync sync legacy-datasets --path D:\git\SupportHCMUSData [--datasets all|teaching,research,publications]
                                         [--dry-run [--server-dry-run]] [--report <dir>] [--unknown-term skip|1|2|3]
```

- **Dry run.** Plain `--dry-run` only reads and parses, like `legacy-git`: nothing is posted and no API settings are needed. It prints
  the parsed row counts and the mapping notes. `--dry-run --server-dry-run` additionally posts with `?dryRun=true`, so the server
  validates against the real roster and returns its report (new, updated, removed, unknown MSCBs, bad values) without writing
  anything. `--server-dry-run` without `--dry-run` is a usage error.
- **PII.** The console shows **counts only**. The detailed server reports (MSCBs, emails) are written as JSON to `--report <dir>`
  (default `%LOCALAPPDATA%\HCMUSSupportV2\legacy`) as `legacy-emails-<time>.json` and `legacy-datasets-<dataset>[-<year>]-<time>.json`. A report
  directory inside a git work tree (a `.git` directory or file in it or in any parent) is refused with exit code 2 before anything is
  read, so a stray `git add` cannot pick the reports up.
- **Exit codes** as above: `0` success, `1` an HTTP failure, an unreachable API (401/403 or no connection aborts the rest) or a dataset the server
  **rejected** as invalid (nothing is applied then), `2` bad arguments, an unknown dataset or a report directory in a work tree.
- Both verbs are idempotent: a second run reports no new, updated or removed rows.

### `legacy-emails`

Reads `config/users.json` (`[{id, name, emails[]}]`) and posts `{users:[{code, name, emails}]}` to `legacy/emails`. Emails are trimmed and
de-duplicated per user (the server lower-cases them); a user without an id or without any email is skipped. The mapping notes count
what was dropped (`user_no_email`, `email_duplicate_in_user`, ...).

It also reads `config/privileged.users.json` (`{"ViewAs": [...], "Lookup": [...], "Statistics": [...]}`, ids or emails) and writes
`legacy-privileged-holders-<time>.json` to the report directory: every holder resolved to code, name and emails with the v1
permissions they had, plus the entries that match nobody. It is a list **for the owner to decide**; the tool grants nothing and v2 roles
are assigned by hand. The console prints only the counts per permission. The file is written on a dry run too.

### `legacy-datasets`

Parses three sources and posts `{rows:[...]}` to `legacy/datasets/{teaching|research|publications}` (the same rows, validation and
replace semantics as the D04 `.xlsx` import: teaching replaced per academic year, the others whole). Teaching is posted **one academic year
per request** (the server replaces per year anyway, and each request stays far below the 20 MB limit).

| Dataset | Source | Mapping |
|---|---|---|
| `teaching` | `notifications/teaching-stats/teaching-stats-*.json` | per MSCB one `{rows}` string of HTML `<tr><td>course</td><td>class</td><td>level, HKn</td><td>hours</td></tr>`, read with HtmlAgilityPack (entities decoded, whitespace collapsed) |
| `research` | `notifications/research-stats.json` | one row per project member |
| `publications` | `notifications/paper-details.json` | `[{Eid, Details, Mscb[]}]`, one row per entry |

**Teaching.**

- *Academic year:* from the file's `header` (`... năm học 2020-2021 ...`), else from the file name; only a consecutive pair counts. When both
  exist and differ the header wins (`teaching_header_year_differs_from_file_name`). A file whose year cannot be told is skipped (`teaching_file_year_unknown`),
  and a second file for an already seen year is skipped (`teaching_year_in_several_files`).
- *Term:* `HK1`, `HK2` or `HK3` after the comma. *Level:* the text before it, `Đại học (CLC), HK3` giving `Đại học (CLC)`; v1's `(None)` is dropped.
  `courseCode` is always null (v1 has none) and `periods` is 0.
- *Hours:* decimal; both `9.12` and `9,12` (and `1.234,5`) are read, then rounded to two decimals (the column is `numeric(7,2)`).
- *Lines without a term* (postgraduate lines such as `Cao học, Học phần 4`, `Chuyên đề TS`, `HKHP3`, `HKNone`; about 4 % of the lines) cannot be stored,
  because the table only allows terms 1 to 3. They are skipped and counted (`teaching_no_term`). `--unknown-term 1|2|3` files them under that
  term instead (counted as `teaching_no_term_assigned`).
- *Repeated lines.* The same teacher, term, course, class and level repeated in v1 (sessions, groups) is **summed** into one row
  (`teaching_merged_lines`). A line is identified by teacher, year, term, course name, class and level, so theory and practice lines of one class stay
  apart. The legacy endpoint uses that identity; the `.xlsx` import keeps its own (teacher, year, term, course code, class).
  Other counters: `teaching_bad_row`, `teaching_no_course`, `teaching_bad_hours`, `teaching_hours_too_large`, `teaching_no_mscb`.
- ***The `teaching-stats-2019-2021.json` file.*** Despite its name it holds **one** academic year. Its header says `năm học 2020-2021`, it has a single set of
  `HK1`, `HK2`, `HK3` terms and a row count in line with the other single-year files (it is not twice as large), and its class codes carry the
  intake years 17 to 20: exactly the cohorts studying in 2020-2021 (cohort 17 in the last year, cohort 20 in the first), with no cohort 16 that 2019-2020 would add.
  So the file is filed under `2020-2021` (from the header) and v1 has no `2019-2020` data. The file name probably records the range that was requested.

**Research.**

- *Role:* `Chủ Nhiệm` becomes `chu_nhiem`, `Đồng Chủ Nhiệm` becomes `dong_chu_nhiem`, `Thành Viên` becomes `thanh_vien`. The server accepts exactly these three
  codes (D04 knew the first and the last; `dong_chu_nhiem` was added for v1's co-principal rows). Anything else becomes `thanh_vien`
  (`research_role_unknown`, `research_role_blank`).
- *Project code:* `ma_so`. An empty one is replaced by `V1-` and ten hex digits of a hash of the title and period, stable across runs (`research_code_synthesized`,
  counted per project). One code with **different titles** is treated as different projects: the first title keeps the code, the others get `~2`, `~3`
  (`research_code_reused_for_other_title`). Project fields that differ between member rows keep the first row's (`research_project_fields_differ`).
- *Members:* a person listed twice in a project keeps the stronger role (`research_duplicate_member`); a project with no member keeps one row without MSCB (`research_no_member`).
- *Funding:* `550.000.000` becomes 550000000 (`research_bad_funding` for anything else). *Accepted date:* `dd/MM/yyyy` becomes `yyyy-MM-dd`; a bare year or `MM/yyyy`
  cannot be a date and becomes null, because inventing a day would be wrong (`research_partial_accepted_date`, `research_bad_accepted_date`).

**Publications.** `Details` is dblp-like, `Authors: Title. Venue vol: pages (year)`. The authors end at the first `: `, the year is the trailing `(yyyy)` (or a four-digit
volume as in `CVPR 2019: 1-10`), the title ends at the first sentence end after a word of three or more letters (so initials such as `J.` do not split it), and the venue is the rest
without `vol: pages`. It is best effort: text that does not fit becomes the title (`paper_no_venue`, `paper_no_year`). `details` always keeps the full text. Entries with the same
`Eid` merge their authors (`paper_duplicate_eid`); entries without details or authors are dropped. The v1 repo currently holds a single paper.

**Verified end to end (D15b):** the real v1 repo posted through the real client into a fresh database holding the `legacy-git` roster. All three datasets came back `status=applied`
with no bad values, and a second run reported no new, updated or removed rows.

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
