# Legacy inventory (Support HCMUS v1)

Snapshot taken 2026-10-01 from the local repos and a read-only look at production. No secrets or personal
data are reproduced here. The plan built on this inventory is in [PLAN.md](PLAN.md).

## 1. Moving parts

```
 HRM SQL Server (internal, DB "HRM")
        │  11 .jjob SQL queries, Windows Task Scheduler ~22:00–22:20
        ▼
 DatabaseJobService (.NET Fx 4.8 CLI, on an internal Windows box)
        │  writes notifications/<category>/<category>-N.json (5 MB chunks)
        │  external script commits "Daily update" as HRM-Database ~22:30 (+07)
        ▼
 GitHub: tmkhiem/SupportHCMUSData  ◄── HR edits a Google Sheet → GitHub Action (repository_dispatch)
        │                                → scripts/main.py → config/users.json
        │  git fetch + reset --hard every ~10 s, rehash, full reload into RAM
        ▼
 HRBackend (.NET 6 HttpListener console app, localhost:65012, tmux, root)
        │  /api via nginx
        ▼
 hcmus-portal-fe (CRA + MUI 5 + Redux), static in /var/www/support.hcmus.edu.vn/html
```

| Component | Location | Notes |
|---|---|---|
| HRBackend | `D:\git\SupportHCMUS\HRBackend` | About 1.8k LOC. No ASP.NET, no DI, no tests. The prod binary seems to come from an older commit than HEAD (prod still has LibGit2Sharp and Microsoft.Identity). |
| DatabaseJobService | `D:\git\SupportHCMUS\DatabaseJobService` | Runs `--execute-job --input x.jjob --output dir`. Deletes and recreates the output dir. A mid-query failure is swallowed, so truncated data gets committed. |
| Job definitions | [`docs/jjobs/*.jjob`](jjobs) | `{ConnectionString, SqlQuery, IdColumnName, Header, Template, Category, Schedule, LastExecutedDate}` |
| Data repo | `D:\git\SupportHCMUSData` | 1,592 commits. A daily commit only changes the `datestr` lines. Working tree is about 38 MB. |
| Frontend | `D:\git\hcmus-portal-fe` | Teacher and student variants are selected by `REACT_APP_DOMAIN`. **The student variant is out of scope.** |
| Earlier V2 attempt | `D:\git\SupportHcmusV2` | A SQL Server `SupportDB` schema (Users/UserEmails/Groups/Events/Tags/NotificationInstances) plus `notifications-to-db.py`. Use it as prior art for the notification model. |
| Style reference | `D:\git\HCMUS.MyMentor\MyMentor\MyMentor.Frontend` | Source of [UI-STYLE-GUIDE.md](UI-STYLE-GUIDE.md). Uses MUI 9.3, React 19, react-router-dom 7, Vite 8. |

## 2. Production (`support.hcmus.edu.vn`)

- **Host:** DigitalOcean droplet. 1 vCPU, about 1 GB RAM, 35 GB disk (45% used). **Debian 11 (EOL Aug 2026).**
  .NET 6 only (EOL). No node, docker or postgres installed.
- **nginx:**
  - `/` serves the SPA (`try_files … /index.html`).
  - `/api` proxies to `localhost:65012`. nginx answers OPTIONS itself with `ACAO: *`.
  - `/tchc` is a dead route.
  - HTML responses carry `Cross-Origin-Opener-Policy: same-origin-allow-popups`. The Google sign-in popup depends on this header.
  - The Let's Encrypt cert covers only the apex domain (expires 2026-12-16), even though `www` is listed in `server_name`.
- **Backend:** started by hand in `tmux`, running as root, with no auto-restart. Config is in files under `/root/backend`. The
  `gapi/` folder holds a Google user OAuth token used for Drive/Sheets telemetry.
- **Data repo:** checked out at `/root/backend/data` and pulled with a deploy key. There are no backups apart from ad-hoc copies. Logs go only
  to the tmux console. The journal is 2.9 GB.
- **Traffic:** about 3k requests/day, plus scanners. Real calls are `POST /api/auth`, `GET /api/features` and `GET /api/news`.

## 3. API (v1)

| Method | Route | Auth | Behaviour |
|---|---|---|---|
| POST | `/api/auth` | none | Body is `text/plain` `"<authuser>\|<code>"`. The backend exchanges the Google auth code and returns the Google **id_token**. The redirect_uri is built from the `Referer` header. |
| GET | `/api/features` | id_token | Returns `["ViewAs","Lookup","Statistics"]` filtered by `privileged.users.json`. It matches on id only. |
| GET | `/api/news?category=` | id_token | Returns the caller's rendered items `[{Header, Content}]` (PascalCase). `research-papers` is a special case that reads `paper-details.json`. |
| any | `/api/viewas?id=&category=` | `ViewAs` | Same output as `/api/news`, but for another MSCB. No audit trail. |
| any | `/api/lookup?query=` | `Lookup` | Matches on id, on the name with diacritics stripped, or on email. Returns at most about 26 `User` rows. |
| GET | `/api/7fbcb6…af3` | `User-Agent` + `token` header vs `apps.json` | Server-to-server dump of all users. **Consumers: KHCN and Documents.** Retired in v2; both become portal modules. |

Auth gaps:
- The id_token is validated with **no audience check**, and there is no `email_verified` or `hd` check.
- The token is the raw Google id_token. It lives about 1 h and has no refresh. It is kept in `localStorage`, so logging out doesn't really log the user out.
- Authorization is just "is the email in users.json".

## 4. Data

**Key:** MSCB (`NS_NHANSU.MA`, text). MSCB is **not unique** in HRM: 9 duplicates across 6,264 staff. The real FK is
`NS_NHANSU.NHANSU` (int).

**Envelope** (every collection):
```json
{ "header": "…{Col}…", "template": "<html>…{Col}…", "datestr": "yyyy-MM-dd", "category": "…",
  "values": { "<MSCB>": [ { "{Col}": "string", … }, … ] } }
```
Rendering is plain `{Col}` string replacement, and the result is unescaped HTML. A `[dd/MM/yyyy]` prefix goes on the header
unless `collection.options.json` sets `DisableHeaderDate`. All 13 HRM categories set it.

| Category | Source | Employees / rows | Notes |
|---|---|---|---|
| general-profile | HRM job | 6264 / 6273 | **PII**: national ID, DOB, phones, addresses |
| detailed-profile | HRM job | 6264 / 6273 | **PII**: bank account, tax code, insurance numbers |
| salary-progress | HRM job | 2986 / 11203 | grade, step, coefficient, next raise date, over-grade coefficient |
| award / title | HRM job (`IsDanhHieu` 0/1) | 1585 / 13234 · 225 / 233 | `title` has data but no menu card in v1 |
| position | HRM job | 349 / 1135 | |
| academic-progress | HRM job | 2050 / 3824 | The country join looks wrong (it compares a code to a name) |
| training-progress | HRM job | 1131 / 2413 | |
| business-mission | HRM job | 1 / 63 | **A debug filter on one hardcoded MSCB was left in the SQL** |
| innovation | HRM job | 806 / 5784 | The SQL splits `LyDo` into code and description |
| request-update-info | HRM job | 5761 rows | A static Google Form banner (one row per person, used as a broadcast). Frozen since 2023. |
| teaching-stats | manual, 4 files (2019–2024) | about 1.5k | `{rows}` is a pre-built HTML table. No generator was found. |
| research-stats | manual (KHCN) | 1283 / 6411 | |
| research-papers | manual `paper-details.json` | 1 entry | `{Eid, Details(html), Mscb[]}` |
| **news** | manual, 56 files (2020–2026) | 1899 ids / 15532 rows | Targeted announcements built from Excel: salary raises, seniority (TNNG, PCTNVK), preferential allowance, annual evaluation, surveys. A "broadcast" is done by listing about 1,800 ids. |

**Users and roles:**
- `config/users.json` has 1,925 entries of `{id, name, emails[]}`. It comes from the Google Sheet tab "Dữ liệu chính" through a
  GitHub Action, which **drops both users of any pair that shares an id or email**.
- `privileged.users.json` maps `ViewAs`, `Lookup` and `Statistics` (the last is unused) to lists of ids or emails.
- `apps.json` holds the S2S tokens in plain text.

## 5. Frontend (v1, teacher variant only)

- The menu comes from `UILayout/portal-pages.csv` and the cards from `<page>.csv` (`title,category`). Each card calls
  `/api/news?category=` and renders accordion cards with `dangerouslySetInnerHTML`, unsanitized.
- **Menu items:**
  - Hồ sơ cá nhân: general, detailed, salary, award, position, academic, training, business-mission, innovation
  - Sáng kiến: hardcoded Google Form card, now stale
  - Tin tức: news, announcement
  - Giảng dạy: teaching-stats
  - Nghiên cứu khoa học: research-stats, research-papers, plus a Google Form link
  - Cập nhật thông tin: request-update-info
  - Tìm thông tin: Xem thử (view-as) and Tra cứu (lookup), shown when the matching feature is granted
- **No** read/unread state, no notification bell, no dates outside the header strings, no pagination, no i18n.
- Bugs: the logout/relogin loop, no 401 handling, an artificial 1 s delay on every fetch, a race on the CSV load, and a stale view-as category.

## 6. Security findings (rotate before or at cutover)

Values are deliberately not shown.

- Google OAuth client secrets are hard-coded in `HRBackend/Helper/Oauth.cs` and `GoogleServices.cs`.
- A GitHub PAT is in `SupportHCMUS/GitIntegrationTest/ProgramGitIntegrationTest.cs`.
- The HRM `sa` password is in `BscHrmBackend/appsettings.json`, `HCMUSSupportV2/docs/hrm-query.cmd` (gitignored here) and
  `SupportHcmusV2/docs/notifications-to-db.py`.
- `SupportHCMUSData/config/apps.json` has plain S2S tokens. `scripts/sheets.py` **prints `SERVICE_ACCOUNT_INFO` to the CI log**.
- The PII-heavy profile JSON is kept in git history going back to 2022.
- `/root/.gitconfig` on prod has a plaintext `password`.
- `BscHrmBackend` `/api/data/{tableName}` is SQL-injectable. This isn't part of v2, but it lives on the same network.
