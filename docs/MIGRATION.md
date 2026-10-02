# Legacy migration (D15)

One-off, idempotent move of the v1 data (the private repo `SupportHCMUSData`) into v2. Nothing here runs on a schedule, and
nothing writes to the live server: run it against the database you are building v2 on. Plan: [PLAN.md](PLAN.md) section 9
("D15"); the HRM tables themselves come from [SYNC.md](SYNC.md).

**Data safety.** The v1 repo holds personal data. The tools read it **in place** (clone it outside this repository, never copy
anything in), print **counts and MSCBs only**, and write full reports only to a file you name (`--report`, which contains emails and
names: `*.legacy-report.json` is git-ignored, keep it out of the repository anyway).

## Order

```
1. sync legacy-git --path <SupportHCMUSData>          (or the nightly `sync hrm`): org units, employees, profiles, salary, ...
2. sync legacy-migrate --path ... --admin <email:mscb> --admin <email:mscb> [--apply]
        roster (users.json -> employee_emails) -> roles -> teaching -> research -> papers
3. tools/legacy-news: legacy-news --path ... --api <url> --token <token> [--apply]
        56 news files + the update-info banner
```

Every step is **a dry run unless you say so** (`--apply` for both tools; `?dryRun=false` at the API) and **every step can be run
again**: a re-run reports nothing to do. Run each tool without `--apply` first, read the output, then apply.

## One-time setup

- The backend must have the migration `D15_LegacyMigration` (table `legacy_import_marks`); in Development it migrates on start.
- The tools post to `/api/integration/v1/legacy/*` with an API client that has the scope **`legacy.import`** (admin-grade: it writes
  emails, roles and posts). In Development the client `dev` made from `Hrm:DevApiClient:Token` gets both `hrm.ingest` and
  `legacy.import` (an older dev database gets the new scope on the next start). For another database there is no admin screen yet
  (D14b leftover), so insert a client once, with your own random token (keep it out of the repo), and revoke it afterwards:

```sql
INSERT INTO api_clients (name, token_hash, scopes, created_at)
VALUES ('legacy-migration', encode(sha256(convert_to('<the token>', 'UTF8')), 'hex'), ARRAY['legacy.import'], now());
-- afterwards:  UPDATE api_clients SET revoked_at = now() WHERE name = 'legacy-migration';
```

- `appsettings.local.json` next to the Sync exe (or env `Sync__ApiBaseUrl`, `Sync__ApiToken`); for the news tool env
  `LEGACY_API_BASE`, `LEGACY_API_TOKEN` or `--api`/`--token`.

## Step 2a: roster and emails (`roster`)

`config/users.json` (`{id, name, emails[]}`, 1,925 people) goes through the same engine as the D14c email import
(`EmployeeEmailImportService`), **additive only**: emails that editors added later are never removed. The first email of a person is
primary. A re-run reports every mapping as `unchanged`.

What it reports (counts and MSCB on the console, details in the report file):

| Finding | Meaning |
|---|---|
| `unknown` | the MSCB is not an employee yet (HRM did not export it, or the id is a typo): its emails are not mapped |
| `conflicts` | the email is already mapped to another MSCB (`owned_by_other`) or two people in the file share it (`duplicate_in_file`; the first one in the file wins) |
| `invalid` | not an email address |
| `hrm_conflict` (warning) | the email is the **HRM personal email of a different employee**: mapped anyway, check it |
| `name_mismatch` (warning) | the name in users.json differs from HRM |

Fix the findings in the v1 sheet or, after the cutover, in the Nhân sự & email page, then run the step again.

## Step 2b: roles (`roles`)

PLAN Q5 is resolved: the two repo owners become **admin** (which already covers view-as and the user lookup in v2). The tool takes the
identities as **arguments**, never from code:

```
--admin <email>:<mscb>        repeatable;  or  Sync:Legacy:Admins = ["email:mscb", ...]  in appsettings.local.json
```

For each one it grants `admin` if missing (audited as `roles.granted`, via `legacy-migration`), reports `already` on a re-run, and
refuses on `email_mismatch` (the email belongs to another MSCB), `employee_not_found`, `email_not_mapped`. An email that is not mapped
yet is mapped to that person when the address is free. **Nobody else is granted anything**: the tool prints the other v1
ViewAs/Lookup/Statistics holders (MSCB and feature only) for the owner to decide.

## Step 2c: teaching, research, papers

Parsed from the v1 JSON by the Sync tool (`Migration/LegacyReaders.cs`), written by the endpoints `datasets/teaching|research|publications`.

- **teaching** (`teaching-stats-*.json`, one file per year; the year comes from the header). `{rows}` is an HTML table
  (Môn học `CODE-Name`, Lớp, program cell, Giờ chuẩn). The program cell changed over time and is parsed by year: `Đại học (ACTIVITY), HKn`
  until 2022-2023; in 2023-2024 the parentheses are the **Hệ** (`CQ`, `CLC`, `TT`, ...), and postgraduate rows hide in the undergraduate label
  (`Đại học (CH), HKHPn` is Cao học, `Học phần n`; `(HPTS)` / `(CDTS), HKNone` is Tiến sĩ); plus `Cao học, Học phần n`, `Tiến sĩ, CĐTS`,
  `Học phần Cao học (chuyên ngành)`, `Chuyên đề TS`, ... A cell that matches nothing is counted per pattern and skipped (0 in the data).
  Rows listed under an empty MSCB (6 in 2020-2021) are skipped and counted. v1 has no row key and **repeats rows legitimately**
  (groups, sessions): every row is kept, and the re-run diff compares rows as a multiset. `periods` is 0 (v1 has no such column).
- **research** (`research-stats.json`, one row per member): `ma_so` is the code; `Chủ Nhiệm` and `Đồng Chủ Nhiệm` become `chu_nhiem`,
  `Thành Viên` `thanh_vien`; funding `1.250.000.000` becomes a number; the acceptance date `dd/MM/yyyy`, or `MM/yyyy` / `yyyy` approximated
  to the first day (84 rows, counted as `partialAcceptedDates`).
- **papers** (`paper-details.json`, 1 entry): `Eid`, the citation in `details`, and title, venue and year split from the citation text; authors are `Mscb[]`.

Shared rules: unknown MSCBs are dropped and counted (`unknownMscb`). **Hand-typed ids are normalised when that makes them known**
(`normalizedMscb`): a leading `_` or quote removed (`_0246` is `0246`), a short number padded to four digits (`408` is `0408`); ids that are
already known or stay unknown are left alone. **An admin Excel import always wins:** legacy rows have no `source_import_id`, and a teaching
(year, program) scope, or the whole research / publications table, that an admin import owns is skipped (`skipped`), never overwritten. A re-run
with identical data writes nothing (`applied=False`).

## Step 3: news (`tools/legacy-news`)

Node + TypeScript, `turndown` + `turndown-plugin-gfm`:

```
cd tools/legacy-news && npm ci
npx tsx src/cli.ts --path <SupportHCMUSData> [--api <url> --token <t>] [--apply] [--report <file>]
npm test        # 52 vitest cases      npm run typecheck
```

Without `--api` it only converts and prints a local summary (use it to review). With `--api` it posts to `POST /api/integration/v1/legacy/news`,
which validates each body with the same Markdig contract as the editor (an invalid body is `rejected`, nothing is created).

- **Files.** Only `news/*.json`; `.old` files and `backup/` are ignored. The one test post (`2022-12-12-test.json`, "Thông báo test từ Github") is skipped
  unless `--include-test`. The key of a post is its file name, which is what makes the import idempotent (`legacy_import_marks`): the same key and content
  is `unchanged`, the same key with changed content is `changed_skipped` (reported, never re-applied, because editors may have edited the post since).
- **Body.** The baked HTML becomes GFM Markdown (lists, links, emphasis, tables, hard breaks); Word/Outlook inline styles are dropped, but bold, italic and
  strikethrough set through `font-weight` / `font-style` / `text-decoration` are kept; entities and non-breaking spaces are decoded; images, scripts, underline,
  sub/superscript are removed (images and unsafe links are reported); a literal `<` is escaped. **Placeholders** in v1 are literal strings spelled as the
  values file spells them, `{7}` or `(7)`: each becomes `:var[key]` (`c7`; a column that is already a valid identifier, like `{TenCapDeTai}`, keeps its name),
  and each `values` row becomes a `vars` row keyed by MSCB. Values are plain text: `<br>` becomes a line break, other tags are removed.
- **Review warnings** (printed per file and in the report): a table with merged cells or without a header row, removed images or links, braces left as text,
  an empty body, and dates (below). The 56 files produce no layout warnings: the templates are lists and paragraphs.
- **Date.** `published_at` and each delivery's `delivered_at` are the v1 `datestr` at 00:00 Vietnam time. Two files disagree with their file name:
  `2023-01-04-...-2022-3.json` (datestr 2022-12-14) and `2026-02-03-TNNG-2026.json` (datestr **2026-03-02**, probably day and month swapped); datestr is used as the plan says.
- **Audience.** `audience_all` when the post has no variables and covers at least 90% (`--all-coverage`) of the active roster (active employees with a mapped
  email): the two 2025 surveys. Otherwise an applied recipient import built from the rows (only active employees get a delivery).
- **Read state.** v1 had none, so imported deliveries are **marked read** (`--no-mark-read` to leave them unread): 56 old announcements must not become 56 unread badges.
- **Series and tags** are guessed from the title (`src/guess.ts`: Nâng lương thường xuyên, Nâng lương trước hạn, Phụ cấp thâm niên nhà giáo, Thâm niên vượt khung,
  Phụ cấp ưu đãi nhà giáo, Đánh giá xếp loại viên chức, Khảo sát, Sáng kiến, Nghiên cứu khoa học; tags from the seeded set) and listed for review in the output and the report.
  Series are created by name; a guessed tag that does not exist is ignored with a message.
- **Banner.** `request-update-info` (the Google Form link and the list of who handles which request) becomes one **pinned** post for everyone
  (`pinned_until` 2036-01-01, `--banner-pinned-until`), imported with `kind=banner`. `apps.json` is not migrated. The other v1 form links (the stale Sáng kiến card and the
  NCKH card) lived in the v1 frontend repo, not in the data repo, and are not migrated; the form links inside the news posts are kept as links.

## API (`/api/integration/v1/legacy`, scope `legacy.import`, gzip bodies accepted)

| Endpoint | Body | Report |
|---|---|---|
| `POST roster-emails?dryRun=` | `{users: [{id, name, emails[]}]}` | `LegacyRosterReportDto` (the D14c email report + counts) |
| `POST roles?dryRun=` | `{grants: [{role, code?, email?}], mapEmail}` | outcome per grant |
| `POST news?dryRun=` | `{posts: [...], kind: news\|banner, markRead, allCoverage}` | action per post: `created`, `would_create`, `unchanged`, `changed_skipped`, `rejected` |
| `POST datasets/teaching\|research\|publications?dryRun=` | `{rows: [...]}` | new / updated / removed, unknown and normalised MSCBs, bad rows, skipped scopes |

`dryRun` defaults to **true**.

## Verified run (2026-10-02, temporary database on the shared dev server, since dropped)

Against the real data repo: `sync legacy-git` (every dataset `status=success`), then `legacy-migrate --apply`: **1,925** users read, **2,134** emails mapped to
**1,921** employees (0 conflicts, 2 unknown MSCBs, 4 invalid emails, 10 `hrm_conflict` warnings); **2** admin grants; teaching **52,457** rows over 4 years
(Đại học 50,387, Cao học 1,830, Tiến sĩ 240; 12 + 58 ids normalised); research **2,215** projects with **6,381** members; **1** publication. `legacy-news --apply`:
**56** posts created (0 rejected; 3 with `audience_all`: two surveys and the banner), 17,525 deliveries. A **second run of everything reported nothing to do**
(roster `unchanged`, roles `already`, datasets `applied=False` with 0 new/updated/removed, news `unchanged=56`).
The comparison of employees against v1 (counts and key fields) is D18: [PARITY.md](PARITY.md).

## Not done / for the owner

- The other six v1 ViewAs/Lookup holders (printed by the roles step) need a decision: editor, admin or nothing.
- The v1 sheet findings above (4 invalid emails, 10 HRM-conflict emails, 2 unknown MSCBs) and the unknown MSCBs left in teaching and research (ids that are not employees, such as external or student codes) are for HR to fix.
- Datestr of `2026-02-03-TNNG-2026.json` and the date of the `-2022-3` file (see above).
- Late joiners: a later employee with a first email is backfilled with the two `audience_all` surveys and the banner (as for any published post).
- `legacy-news` has no `expires_at`: the two surveys stay visible.
