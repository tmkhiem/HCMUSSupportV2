# Notifications engine (D07)

Backend module `HCMUSSupportV2.Backend/Modules/Notifications`. PLAN section 3.3 is the model; this file says how it is
built and how to call it. The Markdown syntax itself is specified in [notification-markdown.md](notification-markdown.md).

## Model in one picture

```
editor ──PUT/POST manage/notifications──► notifications (draft) ──schedule──► scheduled ─┐
                                                   │ publish (now)                       │ job notifications.publish at publish_at
                                                   ▼                                     ▼
                                             published ──► job notifications.publish ──► notification_deliveries (one row per recipient)
                                                   │                                     │ pg_notify('notifications', {codes…})
                                                   ▼                                     ▼
                                              archived (hidden from inboxes)      SSE listener ─► connected employees
```

Fan-out happens on write, so an inbox read is one index range scan on `notification_deliveries (employee_code, delivered_at desc)`.

### Tables (migration `D07_Notifications`)

| Table | Purpose |
|---|---|
| `tags` | `id, name UNIQUE, color, sort`. Seeded: Lương, Thâm niên, Khen thưởng, Khảo sát, Đào tạo, Chung |
| `notification_series` | `id, name UNIQUE, description` ("Nâng lương thường xuyên", ...) |
| `notifications` | uuid v7 PK, `series_id`, `title`, `summary` (+ `summary_is_custom`), `body_md`, `content_text`, `variables jsonb [{key,label,type}]`, `status draft/scheduled/published/archived`, `publish_at`, `published_at`, `expires_at`, `pinned_until`, `requires_ack`, `audience_all`, counters `recipient_count/read_count/ack_count`, `version`, `content_updated_at`, `created_by/updated_by`, `xmin` concurrency token, stored generated `search tsvector` (`vn_unaccent`: title A, summary B, content_text C) with a GIN index |
| `notification_tags` | `(notification_id, tag_id)` |
| `notification_revisions` | `(notification_id, version)` + title, summary, content, variables, editor, time. The first row is the content as published; one more row per edit after publishing |
| `notification_audiences` | what the editor chose: `kind group` (`group_id`), `employee` (`employee_code`), `import` (`import_id`). `audience_all` lives on the notification row; the `all` kind is reserved and not written |
| `notification_deliveries` | PK `(employee_code, notification_id)`, `vars jsonb` (array of row objects), `delivered_at`, `read_at`, `acknowledged_at`, `dismissed_at` (unused). Indexes: `(employee_code, delivered_at desc) include (read_at)`, partial `(employee_code) where read_at is null`, `(notification_id)` |
| `notification_attachments` | `id uuid v7, notification_id, file_id -> files, sort` |
| `notification_recipient_imports` | `id uuid v7, notification_id, file_id, status validated/applied/rejected, columns jsonb, rows jsonb (MSCB -> [row objects]), report jsonb, created_by, applied_at` |

`version` is the optimistic-concurrency number for clients (every content `PUT` bumps it). `xmin` is the database-level token;
an update that loses the race on `xmin` only (for example a read counter moved) is retried against the same `version`.

## Lifecycle

| Action | From | Result |
|---|---|---|
| `POST manage/notifications` | | draft, version 1 |
| `PUT manage/notifications/{id}` | any | version + 1. After publishing (published, archived): revision row, `content_updated_at` set when title/body/variables changed, and the inbox shows `updatedAfterDelivery` for older deliveries. Adding audiences after publishing runs the fan-out again; removing recipients never recalls |
| `POST .../schedule {publishAt}` | draft, scheduled | scheduled; enqueues `notifications.publish` with `run_at = publishAt` |
| `POST .../publish` | draft, scheduled | published at once (revision v written), then `notifications.publish` fans out |
| `POST .../archive` | published, scheduled | archived: hidden from inboxes, deliveries kept; unread badges are refreshed through NOTIFY |
| `POST .../clone` | any | new draft: title, body, summary, variables, tags, series, requires_ack, `audience_all`, group and employee audiences. Not copied: imported rows, attachments, dates |
| `DELETE .../{id}` | draft only | 409 otherwise |

`schedule` and `publish` need a title, a non-empty valid body, and at least one audience (`audienceAll`, group, employee or applied
import), and `expiresAt` after the publish time; otherwise 400 with an `errors` map.

### Fan-out (`FanOutService`, job `notifications.publish`)

Idempotent: it only inserts what is missing, so it also serves retries, audience extensions and the backfill.

- audience = union of
  - all **active** employees with at least one email when `audience_all`,
  - **active** members of the target groups,
  - the named **active** employees,
  - the rows of the applied import (these deliveries carry `vars`; re-applying a sheet updates `vars` of existing deliveries).
- `INSERT ... SELECT ... ON CONFLICT DO NOTHING RETURNING`, then counters are recomputed from the deliveries, then
  `pg_notify('notifications', {"t":"d","id","title","codes":[...]})` in chunks below 7000 bytes.
- The job is a no-op until a scheduled notification is due, so a job created at `schedule` time, the sweeper and a retry can all
  run without double publishing. `ScheduledNotificationSweeper` (every `Notifications:Scheduler:PollSeconds`, default 30) enqueues
  the job for due scheduled notifications that have none pending.

### Late joiners (`notifications.backfill`)

`NotificationAudienceObserver` implements `IGroupMembershipObserver` (group engine D06 calls it after members are added) and
`IEmployeeActivationObserver` (roster sync or an email mapping makes someone eligible). Each enqueues backfill jobs in chunks of
500 codes. The job runs the same fan-out, restricted to those codes, for published, unexpired notifications (for a group: those
targeting it). Archived and expired posts are not backfilled. Removing someone from a group keeps their deliveries.

## Editor API (`/api/manage/...`, policy `ManageNotifications`)

| Endpoint | Notes |
|---|---|
| `GET notifications?status&tag&series&q&cursor&limit` | newest first (keyset on id); `{items, nextCursor}`; `q` is full text |
| `GET notifications/{id}` | full detail incl. `audience {all, groups, employees, import}`, attachments, tags, variables |
| `POST notifications` / `PUT notifications/{id}` | body `{version?, title, seriesId, summary, bodyMd, variables[{key,label,type}], tagIds[], expiresAt, pinnedUntil, requiresAck, audienceAll, groupIds[], employeeCodes[]}`. `summary` empty = automatic. 400 `errors` map per field (`bodyMd` entries read `[CODE] Dòng n, cột m: ...`); unknown group ids and employee codes are listed; 409 `{currentVersion}` on a stale version |
| `POST notifications/{id}/schedule\|publish\|archive\|clone`, `DELETE notifications/{id}` | see Lifecycle |
| `GET notifications/{id}/revisions` | newest first |
| `GET notifications/{id}/stats` | `{recipientCount, readCount, ackCount, readPercent, ackPercent, requiresAck, readsByDay[{date, reads, cumulativeReads, cumulativePercent}]}` (days in Asia/Ho_Chi_Minh) |
| `GET notifications/{id}/preview-vars?employee=&importId=` | `{employeeCode, fullName, employeeExists, source applied/pending/none, importId, rows, inAudience, audienceReasons[all, group:Name, employee, import], inPendingImport}`. `pending` = the latest validated, not yet applied import |
| `POST notifications/{id}/recipients/import` (multipart `file`, xlsx or csv) | validation report, see below |
| `GET notifications/{id}/imports/{importId}` | the report again |
| `POST notifications/{id}/imports/{importId}/apply` | merges new columns into `variables`, makes the sheet the import audience (replacing an earlier one, which becomes `rejected`), returns the notification |
| `GET notifications/{id}/recipients/template` | xlsx: `MSCB` + one column per declared variable (the header is the variable key) |
| `POST notifications/{id}/attachments` (multipart `file`), `DELETE .../attachments/{attachmentId}` | pdf, docx, xlsx, png, jpg up to 20 MB and 20 files; extension and magic bytes must agree |
| `POST notifications/images` (multipart `file`) | body image (png, jpg, gif, webp up to 5 MB); returns `{url: "/api/files/{id}", fileId}` for `![alt](url)` |
| `GET/POST/PUT/DELETE manage/tags`, `manage/series` | names unique (409); deleting a tag unlinks it; deleting a series keeps its notifications |

### Recipient import

- Sheet: first worksheet (xlsx) or csv (UTF-8, BOM, delimiter detected). The first row is the header. Limits: 10 MB, 50 000 rows,
  60 columns.
- MSCB column: header `MSCB`, `Mã số` or `MaNhanSu`, case and diacritics ignored. Every other non-blank header is a variable.
  The key comes from the header: used as is when it already matches `[A-Za-z][A-Za-z0-9_]{0,63}`; else the label of a declared
  variable decides; else diacritics are removed and the words are joined in PascalCase (`Hệ số lương` -> `HeSoLuong`), prefixed
  with `C` when it would start with a digit, made unique with `_2`, `_3`. The label is the original header.
- Several rows per MSCB are kept in file order (the recipient's `vars` is an array). Cell values are text as displayed (dates as
  `dd/MM/yyyy`).
- Report (`ImportReport`): `rows`, `distinctEmployees`, `employeesWithMultipleRows`, `columns[{key,label,header}]`,
  `unknownCodes` (+ count), `inactiveCodes` (+ count), `duplicateRows` and `duplicateRowCodes` (identical rows of one MSCB; kept),
  `rowsWithoutCode`, `missingInFile` (placeholders used in the body but absent from the file), `unusedColumns` (file columns the
  body does not use), `errors`, `canApply`. A sheet without an MSCB column or without data rows is `rejected` and cannot be
  applied; everything else is `validated` and warnings are for the editor to judge. Unknown MSCBs get no delivery; inactive ones
  get one when they become active (backfill).

## Inbox API (`/api/notifications`, any signed-in employee)

All reads use the effective employee (`ICurrentUser.RequireEffectiveCode()`, so view-as shows the viewed employee's inbox).
`read`, `ack` and `read-all` use the real employee and answer **403 while acting as someone**.

| Endpoint | Notes |
|---|---|
| `GET notifications?q&tags&from&to&unread&cursor&limit` | `{items, nextCursor}`; pinned first (`pinned_until > now`), then newest delivery; keyset cursor on `(pinned, delivered_at, id)`; `q` = `websearch_to_tsquery('vn_unaccent', f_unaccent(q))`; `tags` = tag ids (any of); `from`/`to` inclusive on `delivered_at` |
| item | `{id, title, summary, tags, publishedAt, deliveredAt, readAt, ackAt, requiresAck, pinned, updatedAfterDelivery, seriesId, hasAttachments}` |
| `GET notifications/{id}` | item fields + `bodyMd`, `variables`, `vars` (array of rows, `[]` when none), `attachments[{fileId, fileName, contentType, sizeBytes}]`, `series {id, name, previous[{id, title, publishedAt}]}` (earlier published posts of the series that were also delivered to this employee). 404 without a visible delivery |
| `POST notifications/{id}/read` | idempotent; returns `{count}` (new unread count) |
| `POST notifications/{id}/ack` | needs `requires_ack` (400 otherwise); also marks read |
| `POST notifications/read-all`, `GET notifications/unread-count` | |
| `GET notifications/{id}/attachments/{fileId}` | download; 404 without a delivery |
| `GET tags` | tag list for filter chips |
| `GET files/{id}` | serves body images only (image content types that are not attachments); `nosniff`, private cache |

Visible = notification `published` and not expired. A delivery of an archived or expired post answers 404 and is not counted in
the unread badge.

## Live updates: `GET /api/notifications/stream` (SSE)

Authenticated (cookie), GET, not in the generated client. Response `text/event-stream`, `Cache-Control: no-cache`,
`X-Accel-Buffering: no`, buffering disabled, never compressed (`Content-Encoding: identity`). The deploy kit's nginx already has
`proxy_buffering off` for this path.

| Event | `data` | When |
|---|---|---|
| `unread-count` | `{"count": n}` | right after connecting, whenever the count changes (new delivery, read, ack, read-all in any tab, archive), and for every client after the server's LISTEN connection was re-established |
| `notification` | `{"id": "<uuid>", "title": "..."}` | a new delivery for this employee (sent before the matching `unread-count`) |
| comment `: heartbeat` | | every 25 s (`Notifications:Sse:HeartbeatSeconds`) |

The first line is `retry: 5000`. `NotificationListener` holds one dedicated, non-pooled Npgsql connection per process
(`LISTEN notifications`, TCP keep-alive 30 s, reconnects every 2 s on failure) and dispatches to the in-memory `SseHub`; each
client has a 64-event queue that drops its oldest events when stalled, which is safe because `unread-count` carries the full
state. With several instances each one listens, so any instance can serve any client.

## Configuration

| Key | Default | Meaning |
|---|---|---|
| `Notifications:Scheduler:PollSeconds` | 30 | sweeper interval |
| `Notifications:Sse:HeartbeatSeconds` | 25 | SSE heartbeat |
| `Notifications:Listener:Enabled` | true | run the LISTEN connection (turn off on instances that serve no SSE) |

## Audit actions

`notification.created`, `.updated`, `.published` (by `editor` or `scheduler`), `.scheduled`, `.archived`, `.cloned`, `.deleted`,
`.recipients_applied`, `.attachment_added`, `.attachment_removed`; `tag.created/updated/deleted`; `series.created/updated/deleted`.

## Tests

`HCMUSSupportV2.Backend.Tests/Notifications`: `NotificationMarkdownTests` (the 54 contract vectors and more),
`NotificationEngineTests` (permissions, validation, concurrency, revisions, the four audience kinds, scheduling and the
sweeper, archive, expiry, late joiners, full-text search, keyset paging, 404 without a delivery, read/ack counters, view-as,
series history, clone, tags and series, audit), `NotificationImportAndStreamTests` (import reports and edge cases, apply,
preview-vars, template, attachments, images, SSE with a real connection). Synthetic employees only.
