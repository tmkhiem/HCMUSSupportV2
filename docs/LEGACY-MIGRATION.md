# Legacy migration (D15)

A one-off, idempotent import of the v1 data repo (`tmkhiem/SupportHCMUSData`, cloned **outside** this repo) into a v2
database. It runs once to seed the dev database. For release it runs again into the production database, or the seeded
database is copied (v1 publishes no new posts after the freeze, so a copy is enough).

**PII.** The v1 repo holds personal data. Never copy its files, the converted output or the detailed reports into this repo,
fixtures, screenshots or logs. The tools print **counts only** to the console. Detailed reports, which contain MSCBs and
emails, go to a report directory outside the repo (default `%LOCALAPPDATA%\HCMUSSupportV2\legacy`).

## Steps (in this order)

| # | What | Tool | Target |
|---|---|---|---|
| 1 | HRM categories (org units, employees, profiles, salary, …) | `HCMUSSupportV2.Sync sync legacy-git --path <data>` (D05) | `POST /api/integration/v1/{dataset}` |
| 2 | `config/users.json` → email mapping | `HCMUSSupportV2.Sync sync legacy-emails --path <data>` | `POST …/legacy/emails` |
| 3 | teaching-stats, research-stats, paper-details | `HCMUSSupportV2.Sync sync legacy-datasets --path <data>` | `POST …/legacy/datasets/{dataset}` |
| 4 | `notifications/news/*.json` and the request-update-info banner | `tools/legacy-news` (Node + TS, turndown) | `POST …/legacy/notifications` |
| 5 | `config/privileged.users.json` (ViewAs/Lookup) | listed in the step 2 report **for the owner to decide** | none (roles are granted by hand) |

Step 1 must run first, because every other step looks up employees. Step 2 must run before step 4 because `audienceAll`
posts reach only employees who have an email. `tools/legacy-migrate.ps1` runs all of the steps in order.

## API contract

All endpoints:
- are `POST` under `/api/integration/v1/legacy`, and need `Authorization: ApiKey <token>` with scope **`legacy.import`**
  (policy `LegacyModule.LegacyImportPolicy`). In Development, the `dev` client seeded from `Hrm:DevApiClient:Token` has the scope.
- accept a JSON body, optionally `Content-Encoding: gzip`, up to 20 MB after decompression (`[IngestBody]`).
- take `?dryRun=true`, which validates and returns the same report but writes nothing.
- are **idempotent**: sending the same payload twice yields only `unchanged` the second time.
- write one audit entry per non-dry run (`legacy.emails`, `legacy.notifications`, `legacy.datasets.<name>`) holding counts only.
- answer 400 ProblemDetails for a malformed payload, and 200 with a report otherwise. A post rejected by validation is
  reported inside the 200 report and doesn't fail the batch.

Report objects carry `details` arrays with MSCBs and emails. The CLI tools write them to the report directory, never to the console.

### `POST legacy/emails`

```jsonc
// request
{ "users": [ { "code": "0123", "name": "Nguyễn Văn A", "emails": ["a@hcmus.edu.vn", "a@fit.hcmus.edu.vn"] } ] }
// response
{ "dryRun": false, "users": 1925, "emails": 2400, "inserted": 2300, "unchanged": 0,
  "issues": { "unknown_employee": 12, "conflict": 3, "duplicate_in_source": 0, "inactive_employee": 4, "name_mismatch": 20 },
  "details": [ { "kind": "conflict", "code": "0123", "email": "x@hcmus.edu.vn", "otherCode": "0456" } ] }
```

Rules:
- Emails are trimmed and lower-cased. Empty or syntactically invalid ones become `invalid_email` and are skipped.
- **unknown_employee:** the MSCB has no `employees` row. Skipped.
- **duplicate_in_source:** the same email appears under two MSCBs in the payload. Skipped for both.
- **conflict:** the email is already mapped to a different MSCB. Skipped. Existing mappings are **never** overwritten or deleted.
- **unchanged:** the email is already mapped to the same MSCB.
- **inactive_employee:** the MSCB's employee isn't active. The email is still mapped, and the issue is reported.
- **name_mismatch:** the unaccented, case-insensitive name differs from `employees.full_name`. The email is still mapped, and the issue is reported.
- New rows get `note = 'v1 users.json'` and `added_by = null`. The first email in a user's list becomes `is_primary` when that
  employee has no primary yet.
- After inserting, the import calls the `IEmployeeActivationObserver`s with the codes that gained their first email, so
  late-joiner backfill runs the same way it does for editor-added emails.
- Counting: `users` and `emails` count the entries received. Each `issues` count equals its `details` rows: `unknown_employee`,
  `inactive_employee` and `name_mismatch` count users, the other kinds count emails (`duplicate_in_source` once per affected MSCB).
  A user without a code is reported as `unknown_employee`. A repeated MSCB in the payload is merged into one user.
- `is_primary` goes to the first email that is actually inserted for an employee who has no primary yet (existing or earlier in the run).
- On a dry run `inserted` is the number of mappings a real run would add. The audit entry holds counts and the API client name, never emails or MSCBs.

### `POST legacy/notifications`

```jsonc
// request
{ "posts": [ {
    "legacyKey": "news/2025-05-15-NLTX-2025.json",   // stable and unique; it drives the id
    "title": "Dự kiến nâng bậc lương thường xuyên năm 2025",
    "summary": null,                                   // null: derived from the body
    "bodyMd": "Kính gửi Thầy/Cô :var[HoTen] …",
    "variables": [ { "key": "HoTen", "label": "Họ tên", "type": "text" } ],
    "publishedAt": "2025-05-15T08:00:00+07:00",
    "audienceAll": false,
    "recipients": { "0123": [ { "HoTen": "…", "HeSo": "4.98" } ] },   // required when audienceAll is false; [] or [{}] means no vars
    "tags": ["Lương"],                                 // tag names; unknown names are created
    "series": "Nâng lương thường xuyên",               // or null; created when missing
    "pinnedUntil": null,
    "requiresAck": false,
    "markRead": true                                   // deliveries get read_at = publishedAt (v1 had no read state)
} ] }
// response
{ "dryRun": false,
  "totals": { "created": 56, "updated": 0, "unchanged": 0, "rejected": 0, "deliveries": 15000, "newDeliveries": 15000 },
  "posts": [ { "legacyKey": "…", "id": "0196…", "outcome": "created", "issues": [], "recipients": 172,
               "deliveries": 170, "newDeliveries": 170, "unknownEmployees": 1, "inactiveEmployees": 1 } ],
  "details": [ { "legacyKey": "…", "kind": "unknown_employee", "code": "0999" } ] }
```

Rules:
- **Id:** a deterministic UUID v7. Its 48-bit timestamp is `publishedAt` in Unix ms, with the version and variant bits set,
  and the remaining 74 bits come from `SHA-256("legacy:" + legacyKey)`. Re-runs find the same row, and ids stay time-ordered.
- **Validation:** the body goes through `NotificationMarkdown.Analyze(bodyMd, variable keys)`. Any issue rejects that post, with
  outcome `rejected` and the issue codes listed. Variable keys must match `NotificationMarkdown.VarKeyPattern`.
- **Stored as:** status `published`, `publish_at = published_at = publishedAt`, and `created_by` and `updated_by` null.
  Summary and `content_text` come from the analysis, the same way the editor derives them.
- **Recipients:** stored as one `notification_recipient_imports` row (status `applied`, `rows` = the recipients, `columns` from
  `variables`) with a deterministic id, plus one `import` audience. The data model is the same one the editor's import produces.
- **Deliveries:** inserted directly, not through the publish job, with `delivered_at = publishedAt` and, when `markRead`,
  `read_at = publishedAt`.
  - Import posts go to every recipient who is an active employee. `vars` is null when the recipient's rows are `[]` or `[{}]`.
  - `audienceAll` posts go to every active employee who has at least one email, the same rule fan-out uses.
  - Unknown and inactive MSCBs are counted and listed in `details`.
  - A re-run adds missing deliveries, updates `vars` that differ, and **never** resets `read_at` or `acknowledged_at` or
    deletes deliveries.
- **No side effects:** no `NOTIFY` and no jobs are enqueued. Counters (`recipient_count`, `read_count`, `ack_count`) are recomputed.
- **Changed content on a re-run:** when title, summary, body, variables, tags, series, flags or recipients differ, the
  post is updated in place, `version` goes up by one and a `notification_revisions` row is written (outcome `updated`).
  Otherwise the outcome is `unchanged`.
- **Rejection codes** (`issues` of a rejected post): the `NotificationMarkdown` codes (`RAW_HTML`, `UNDECLARED_PLACEHOLDER`, …) plus
  `INVALID_KEY`, `DUPLICATE_KEY` (a legacyKey repeated in one batch: the later one is rejected), `INVALID_TITLE`, `INVALID_PUBLISHED_AT`,
  `INVALID_VARIABLE`, `INVALID_TAG`, `INVALID_SERIES`, `INVALID_SUMMARY`, `RECIPIENTS_REQUIRED` (not `audienceAll` and no recipients) and
  `INVALID_RECIPIENT`. A rejected post reports its id when `legacyKey` and `publishedAt` are valid.
- **Transaction and dry run:** one transaction per request. A dry run runs the same code and rolls back, so its report equals the real one.
  `publishedAt` is part of the id: changing it for the same `legacyKey` creates a new post, so keep it stable.
  `status`, `created_at` and attachments of an existing post are never touched. `audienceAll` posts get no audience row (the flag is enough).
  `deliveries` of an import post counts its active recipients, of an `audienceAll` post all deliveries the post now has.

### `POST legacy/datasets/{teaching|research|publications}`

The rows have the same shape as the D04 `.xlsx` templates. The service turns them into the same parsed rows the xlsx
importer uses. It stores the JSON payload as the import's file (`legacy-<dataset>.json`), builds the usual `ImportReportDto`,
and applies it unless `dryRun` is set. The replace semantics are D04's: teaching is replaced per academic year present in
the payload, and research and publications are replaced whole.

```jsonc
// teaching
{ "rows": [ { "employeeCode": "0123", "academicYear": "2023-2024", "term": 1, "courseCode": null, "courseName": "…",
              "classCode": "22CS_CLC1", "level": "Đại học (CLC)", "periods": 0, "standardHours": 9.12 } ] }
// research (one row per project member, as in the template)
{ "rows": [ { "code": "B2009-18-01TĐ", "title": "…", "level": "…", "researchType": "…", "funding": 550000000,
              "periodText": "04/2009-03/2011", "acceptedOn": "2012-12-24", "result": "Khá", "employeeCode": "0004", "role": "chu_nhiem" } ] }
// publications
{ "rows": [ { "doi": null, "eid": "2-s2.0-85206882353", "title": "…", "venue": "…", "year": 2025, "details": "…", "url": null,
              "authors": ["0300", "2786"] } ] }
// response: ImportReportDto (D04), with status "applied" (or "validated"/"rejected" on a dry run / invalid payload)
```

## Decisions recorded

- **Read state:** v1 had none, so migrated deliveries count as already read (`markRead: true`). Otherwise every employee would
  start with dozens of unread historical posts. The update-info banner is the exception: it's unread and pinned.
- **audienceAll:** PLAN §9 D15 says "files that cover the whole active roster become `audience_all`". No v1 news file covers
  the whole roster (the two surveys reach about 1,850 of the 1,925 mapped users), so every news post keeps its exact v1
  recipient list. Only the request-update-info banner is `audienceAll`.
- **Roles:** nobody is auto-granted. The step 2 report lists the v1 ViewAs/Lookup holders. The first admin comes from
  `Admin:BootstrapEmails`.
- `apps.json` is not migrated, and `2022-12-12-test.json`, `*.old` and `backup/` are ignored.
