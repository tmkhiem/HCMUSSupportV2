# Parity check (D18)

Does v2 show each person the same facts as v1? `tools/parity-check/parity.mjs` answers that, per MSCB and per category, by
comparing the v1 data (read in place from the private `SupportHCMUSData` repo, which is exactly what v1's `/api/news` and
`/api/viewas` serve) with what v2 returns through an **admin view-as session** (`/api/me/*` and the inbox). The cutover steps are
in [CUTOVER.md](CUTOVER.md); the data steps it checks are in [MIGRATION.md](MIGRATION.md) and [SYNC.md](SYNC.md).

**Data safety.** The tool prints only MSCBs, counts and field names. Values (names, salary, ids) are written only to the file named
by `--detail` (git-ignored `*.parity-detail.json`; keep it outside the repository and delete it afterwards). Nothing is copied
into this repository.

## Result of the rehearsal (2026-10-02)

Run against a temporary database on the shared dev server (`hcmus_support_dev_m2_d18_a`, dropped afterwards), built from the real data repo with
`sync legacy-git`, `sync legacy-migrate --apply` (admins 0300 and 2786) and `legacy-news --apply`; a second run of all three reported nothing to do.
**The live server was not touched.**

| Group | MSCBs | Result |
|---|---|---|
| **Sample** (5 real employees, seed 18, picked to cover salary, award, title, position, degree, training, innovation, teaching, research and news) | 1198, 1212, 1421, 1564, 0702 | **all categories match**, 0 mismatches |
| **Edge** (the only MSCB with business trips, the paper authors, three duplicate MSCBs) | 2786, 0300 (+ 2721, 8442, 8454 duplicates) | 0 mismatches; duplicates see "Known differences" |
| **Everyone else** (all roster people with an email and one v1 profile row) | 1,917 | 0 mismatches after the two comparison fixes below; 2 people have no mapped email |

Per category, over the 1,917-person bulk run (v1 rows = v2 rows in every line; "rows" are the compared records):

| Category | v1 = v2 rows | Fields compared |
|---|---|---|
| Lương | 9,099 | grade, bậc, hệ số, vượt khung, quyết định, ngày ký, ngày hưởng, mốc nâng lương, ghi chú |
| Chức vụ | 1,076 | title, mô tả, hệ số, ngày bổ nhiệm, quyết định, ngày ký |
| Khen thưởng (award + title) | 12,879 | kind, name, quyết định, ngày (with its precision) |
| Đào tạo | 3,219 | loại bằng, ngành, cơ sở, nước, hình thức, nhập học, tốt nghiệp, luận án |
| Bồi dưỡng | 2,277 | nội dung, nơi, hình thức, bắt đầu, kết thúc |
| Đi công tác | 63 (one MSCB) | từ, đến, nơi, phương tiện, quyết định, ghi chú |
| Sáng kiến | 5,681 | mã, tên, loại, quyết định, ngày |
| Thông tin chung | 36,423 facts | 19 fields: name, birth date (day, month or year precision), gender, ethnicity, religion, nationality, places, phones, personal email, both addresses |
| Thông tin chi tiết | 64,472 facts | unit, department, title, grade, rank, degree, politics, party, youth and trade-union membership, ID issue, bank; the sensitive values (national id, tax code, bank account, insurance numbers) by **presence and last four characters only** (the value is never fetched: view-as cannot reveal) |
| Email đăng nhập | 3,834 | the set of valid emails of `users.json` equals `employee_emails` |
| Giảng dạy | 10,122 facts | per academic year: the years, the number of rows and the sum of Giờ chuẩn (the split by program is covered by the D15 tests) |
| NCKH | 5,862 | per project: code, title, funding, role, cấp, kết quả, ngày nghiệm thu |
| Bài báo | 2 | author membership by `Eid` |
| Tin tức | 91,166 facts | see below |

**Tin tức** (every person): the set of posts equals what v1 targeted at that MSCB (news files that list the person, plus the two surveys and the banner sent
to everyone), none unexpected; the delivery date equals the v1 `datestr` (Vietnam time); every word of the v1 template appears in the v2 body; the posts with
variables carry the same per-person rows (the values of the columns the template uses), the same number of rows and the same number of placeholders. v1 reuses
titles across files (parts 1 and 2, GVCC, ...): those are matched by content, not by title alone.

### Behaviour checks beyond the comparison

- Signing in as a real employee (dev-login on a sampled MSCB, standing in for Google): `me/*` and the inbox answer, the person is `employee` only, the admin
  endpoints answer 403, marking a post read works, and revealing a sensitive field of their own record works (404 when the field has no value).
- The same session as an admin's view-as: marking read and revealing a sensitive field are refused (403), and the view-as sessions of the run are recorded in
  the audit log (`viewas.started`, `viewas.stopped`, page reads).

## Known differences (intended, or data findings; none is a bug in v2)

| # | What | Count | Why |
|---|---|---|---|
| 1 | A month or a year in a full-date column becomes its first day (`11/2019` is `2019-11-01`) | seen in Lương (`NgayHuong`, `MocNangLuongTT`: 324 + 424 rows in v1) | documented ingest rule ([INGEST.md](INGEST.md)); partial precision is kept where the page can show it (birth date, commendations, degrees, trainings) |
| 2 | A year before 1900 (a v1 typo such as `1017`) is stored as null with a `bad_date` issue | 1 row seen | the sync tool and the ingest refuse it |
| 3 | The 7 MSCBs that are **duplicated** in v1 (two people, one MSCB) are quarantined (`duplicate_mscb`): they are not employees, have no data and cannot sign in | 7 | by design (D04); HR has to give them distinct MSCBs ([INVENTORY.md](INVENTORY.md)) |
| 4 | People without a mapped email get no deliveries (their v1 email is invalid or missing) | 2 in the bulk run (4 invalid emails in the roster; the other two have another valid email) | deliveries go to people who can sign in; the roster report lists them (MIGRATION.md "Step 2a") |
| 5 | The two 2025 surveys and the banner reach **everyone** active (`audience_all`); v1 listed about 93 to 96% of the roster | 189 extra deliveries across the 1,922 people (people v1 had not listed) | MIGRATION.md "Audience" |
| 6 | Imported deliveries are marked **read** (v1 had no read state); the banner is titled by the importer (the v1 header was empty) and pinned | all | MIGRATION.md "Read state", "Banner" |
| 7 | Cosmetic cleaning of titles and text: repeated, non-breaking and zero-width spaces collapse; `&amp;iacute;` (which v1 showed as literal text) shows the character; columns of the values file that the template does not use are not carried | a few | the D15 converters |
| 8 | Training rows without `NoiDung`, rows under an empty MSCB, and ids that are not employees (external or student codes) are skipped | counts in MIGRATION.md | D05 and D15 reports |

## What the parity check does not cover

- The **rendering** of the pages (that is the Playwright suites of D08 to D14); the check compares the API that feeds them.
- Live **HRM** data: the first `sync hrm` replaces the synthetic `legacy-git` rows (SYNC.md). After that, parity against v1 JSON no longer applies; compare against HRM
  or accept the differences HR expects. The one-week soak with the nightly `sync hrm` is an owner step ([CUTOVER.md](CUTOVER.md) Phase A).
- Real Google sign-in (cannot run in e2e; PROGRESS follow-up 19) and the production host.
- The split of teaching rows by program and the research co-members (D15 unit and end-to-end tests).

## Running it

```
node tools/parity-check/parity.mjs --path <SupportHCMUSData> --api http://localhost:5361 --dev-login T0001 \
     --sample 5 --seed 18 --edge --bulk 5000 --out parity-summary.json --detail run.parity-detail.json
```

No install step (Node 20+, no dependencies). Exit code 0 means no mismatch. Options:

| Option | Meaning |
|---|---|
| `--path` | the v1 data repo, read in place |
| `--api` | the v2 origin (default `http://localhost:5361`) |
| `--dev-login <MSCB>` | Development only: sign in as that admin (needs `Auth:DevLogin:Enabled`; the dev seed has `T0001`) |
| `--cookie "<name>=<value>; ..."` | another host: the session cookie header of a signed-in **admin** (copy it from the browser dev tools; it is a credential, do not paste it into logs or files) |
| `--sample N --seed S` | N people chosen greedily to cover the most categories (default 5, seed 18) |
| `--mscb a,b,c` | check exactly these MSCBs |
| `--edge` | add the edge cases: business-trip holder, paper authors, duplicate MSCBs |
| `--bulk N` | add N more people at random (`5000` means everyone eligible; about 2 s per person) |
| `--out`, `--detail` | the summary (MSCBs and counts) and the detail file (**personal data**) |

It runs only `GET`s plus the view-as start and stop (audited, 60 minute sessions that it ends itself).

### Running it against another host

Run it against a staging or production database only with an admin's session cookie, never with credentials in the repository. It reads
only through view-as, so it leaves audit entries (`viewas.*`) for each person checked: a bulk run on production writes about 4,000 audit rows, which is expected.

### Rehearsal recipe (what D18 did)

1. A database named `hcmus_support_dev_<machine>_d18_<x>` on the shared server; start the backend with `ConnectionStrings__Default`, `Hrm__DevApiClient__Token`
   and `ASPNETCORE_URLS` set through the environment (no file edited), `ASPNETCORE_ENVIRONMENT=Development`.
2. `sync legacy-git`, `sync legacy-migrate --apply --admin <email:mscb> ...`, `tools/legacy-news ... --apply` ([MIGRATION.md](MIGRATION.md)), then each again: nothing to do.
3. The parity run above. Fix mismatches in v2 or document them in the table above.
4. Stop the backend and **drop the database**.

The dev database also holds the Development roster `T0001`... (synthetic people), which is why the news import counts 1,931 recipients for the `audience_all` posts
where production will count the real active roster.
