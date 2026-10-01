# HRM ingest API (`/api/integration/v1`)

For the Sync tool (D05) and any other system that feeds the portal (PLAN section 11). Every dataset is posted as a **full
snapshot**; the server makes its table equal to the snapshot. All data in the examples is synthetic.

## Authentication

```
Authorization: ApiKey <token>
```

- Tokens are random 256-bit strings. Only their SHA-256 hash is stored (`api_clients.token_hash`); the plain token is
  shown once when the client is created.
- The client needs the scope **`hrm.ingest`** (policy `IngestHrm`). Missing, unknown or revoked key: **401**
  (`WWW-Authenticate: ApiKey`). Valid key without the scope: **403**.
- Ingest routes are exempt from the cookie antiforgery check and use the `integration` rate-limit policy
  (`RateLimiting:Integration`, default 600 requests per minute per IP).
- **Creating a client.** `ApiClientService.CreateAsync(name, scopes)` returns the token (the admin page, D14b, will call
  it). In **Development** only, set `Hrm:DevApiClient:Token` (24+ characters) in the git-ignored
  `appsettings.Development.local.json` and the app creates a client named `dev` with scope `hrm.ingest` for that token
  at startup.

## Request

`POST /api/integration/v1/{dataset}[?force=true]`, `Content-Type: application/json`, body `{ "rows": [ ... ] }`.

- **gzip:** add `Content-Encoding: gzip` and send the gzipped JSON. Other encodings answer 415, invalid gzip 400.
- **Size:** at most **20 MB**, checked on the compressed and on the decompressed body (413 ProblemDetails otherwise).
  A snapshot is a single request; at about 6,300 employees the largest dataset is a few MB gzipped.
- **Property names** are camelCase. Unknown properties are ignored; missing nullable ones are null.
- **Dates** are strings: `yyyy-MM-dd`, `dd/MM/yyyy`, `yyyy-MM`, `MM/yyyy` or `yyyy`. A month or year value is stored as
  the first day of that month or year with `*_precision = month|year` (day otherwise); an empty string is null; anything
  else is stored as **null** and reported as a `bad_date` issue (the row is still ingested).
- Rows referencing an employee that does not exist are skipped (`unknown_employee` issue), so post `employees` first.

## Response

`200` with the run summary (also stored in `sync_runs` / `sync_issues`):

```json
{
  "runId": 42, "dataset": "salary", "status": "success",
  "received": 5, "inserted": 1, "updated": 1, "deleted": 1,
  "issueCount": 2, "issuesByKind": { "unknown_employee": 1, "bad_date": 1 }, "notes": []
}
```

`received` is the number of rows posted, before quarantine and skipping. `409` is the truncation guard (below).
A server error rolls the whole run back and records a `failed` run.

## Semantics

Every run is one transaction: binary `COPY` into a temp table, then one PostgreSQL 17 `MERGE` on the key
(`WHEN MATCHED AND <changed> THEN UPDATE`, `WHEN NOT MATCHED THEN INSERT`, `WHEN NOT MATCHED BY SOURCE ...`). Unchanged rows
are not touched, so a repeated snapshot reports `0/0/0`.

| Dataset | Key | Rows missing from the snapshot |
|---|---|---|
| `org-units` | `hrm_id` | **deactivated** (`is_active=false`), never deleted; the synthetic dev unit (`hrm_id <= 0`) is ignored |
| `employees` | `code` (MSCB) | HRM-sourced employees become **`inactive`**, never deleted. Manual employees are untouched |
| `profiles` | `employee_code` | profile row deleted; the nested `sensitive` object is its own snapshot over `employee_sensitive` |
| `salary`, `positions`, `commendations`, `degrees`, `trainings`, `business-trips`, `innovations` | `hrm_id` | **deleted** |

**Truncation guard.** If `received` is below **80 %** of the `received` of the last *successful* run of the same dataset,
nothing is applied and the answer is `409` ProblemDetails (`runId`, `received`, `previous` extensions; a `refused` run is
recorded). Repeat with `?force=true` to apply it anyway.

**Issues** (`sync_issues`, listed at `GET /api/admin/sync-issues`, resolved by an admin):

| Kind | Meaning |
|---|---|
| `duplicate_mscb` | the same MSCB appears on several rows of `employees` or `profiles`. The server does not guess: **every row of that MSCB is quarantined** (not inserted or updated, and an existing employee with that code is not deactivated for being absent) |
| `unknown_unit` | `orgUnitHrmId`, `departmentHrmId` or `parentHrmId` matches no org unit; the reference is stored as null |
| `bad_date` | unparseable date (field name in `details`) |
| `unknown_employee` | a child row (or profile) whose employee code is not in `employees`; the row is skipped |
| `duplicate_row` | `hrmId` repeated in the batch (the last row wins), or an employee `hrmId` already owned by another MSCB (row skipped) |
| `bad_row` | a required field is empty or invalid (for example `commendation.kind` not `award|title`); the row is skipped |

**Observers.** After an `employees` run the server calls every registered `IEmployeeActivationObserver` with the codes
that became active (new employees and reactivations); after an `employees` or `org-units` run it calls every
`IRosterSyncObserver` (the groups engine recomputes). They run after the commit; a failing observer is logged and never
undoes the sync.

## Datasets and examples

All examples post `{"rows":[...]}`. Optional properties may be omitted.

```
curl -X POST https://host/api/integration/v1/org-units -H "Authorization: ApiKey $TOKEN" \
     -H "Content-Type: application/json" -H "Content-Encoding: gzip" --data-binary @org-units.json.gz
```

### org-units

`OrgUnitRow { hrmId, parentHrmId?, kind: "unit"|"department", name, code?, isActive = true }`

```json
{ "rows": [
  { "hrmId": 101, "parentHrmId": null, "kind": "unit", "name": "Khoa Thử nghiệm", "code": "KTN" },
  { "hrmId": 102, "parentHrmId": 101, "kind": "department", "name": "Bộ môn Thử", "code": "BMT" } ] }
```

### employees

`EmployeeRow { hrmId?, code, fullName, orgUnitHrmId?, departmentHrmId?, positionTitle?, academicRank?, degree?, status = "active" }`
with `status` one of `active|inactive|retired`.

```json
{ "rows": [ { "hrmId": 7001, "code": "T0101", "fullName": "Nguyễn Văn Thử", "orgUnitHrmId": 101, "departmentHrmId": 102,
              "positionTitle": "Giảng viên", "academicRank": "PGS", "degree": "Tiến sĩ", "status": "active" } ] }
```

### profiles (with sensitive data)

`ProfileRow { employeeCode, hrmId?, lastName, firstName, dateOfBirth, gender, ethnicity, religion, nationality, birthPlace,
hometown, phoneMobile, phoneHome, personalEmail, permanent{Address,Ward,District,Province}, contact{Address,Ward,District,Province},
salaryGradeCode, salaryGradeName, salaryStep, salaryCoefficient, overGradePct, educationLevel, major, politicalTheory,
isPartyMember, partyJoinedOn, partyFileNo, partyCardNo, isYouthUnionMember, youthUnionJoinedOn, youthFileNo, youthCardNo,
isTradeUnionMember, tradeUnionJoinedOn, tradeUnionCardNo, sensitive? }` and
`SensitiveRow { nationalId, nationalIdIssuedOn, nationalIdIssuedBy, taxCode, bankName, bankBranch, bankAccount, socialInsuranceNo, healthInsuranceNo }`.
`sensitive` goes to `employee_sensitive`, which is never returned by a list and is masked by `me/profile/detailed`.

```json
{ "rows": [ { "employeeCode": "T0101", "hrmId": 8001, "lastName": "Nguyễn", "firstName": "Thử", "dateOfBirth": "1985-03",
  "gender": "Nữ", "phoneMobile": "0900000000", "permanentAddress": "1 Đường Thử", "permanentProvince": "TP.HCM",
  "salaryGradeCode": "V.07.01.03", "salaryGradeName": "Giảng viên chính", "salaryStep": 3, "salaryCoefficient": 4.65,
  "isPartyMember": true, "partyJoinedOn": "2010-05-19", "isYouthUnionMember": false, "isTradeUnionMember": true,
  "sensitive": { "nationalId": "079000000001", "taxCode": "8000000001", "bankName": "Vietcombank", "bankAccount": "0011000000123" } } ] }
```

### salary

`SalaryRow { hrmId, employeeCode, gradeCode, gradeName, step, coefficient, overGradePct?, decisionNo, signedOn, effectiveFrom, nextRaiseOn, note }`

```json
{ "rows": [ { "hrmId": 1, "employeeCode": "T0101", "gradeCode": "V.07.01.03", "gradeName": "Giảng viên chính", "step": 3,
              "coefficient": 4.65, "overGradePct": null, "decisionNo": "QĐ-001", "signedOn": "2024-12-01",
              "effectiveFrom": "2025-01-01", "nextRaiseOn": "2028-01-01", "note": null } ] }
```

### positions

`PositionRow { hrmId, employeeCode, title, unitDescription, coefficient?, appointedOn, decisionNo, signedOn, endedOn? }` (`endedOn` null = current)

### commendations

`CommendationRow { hrmId, employeeCode, kind: "award"|"title", name, academicYear?, decisionNo, decidedOn }` (`award` = khen thưởng, `title` = danh hiệu)

### degrees

`DegreeRow { hrmId, employeeCode, degreeType, major, institution, country, trainingForm, enrolledOn, graduatedOn, thesisTitle? }`

### trainings

`TrainingRow { hrmId, employeeCode, content, place, trainingForm, startOn, endOn }`

### business-trips

`BusinessTripRow { hrmId, employeeCode, fromOn, toOn, place, purpose, transport, decisionNo, decidedOn, note }`

### innovations

`InnovationRow { hrmId, employeeCode, code, title, type, decisionNo, recognizedOn, academicYear? }`

The exact C# records are in `Modules/Hrm/Integration/IngestDtos.cs` (the generated TypeScript client has them too).

## Excel datasets (not part of the ingest API)

Teaching, research and publications are admin uploads (`/api/admin/datasets/{teaching|research|publications}/import`, then
`/api/admin/datasets/imports/{id}/apply`; templates at `/api/admin/datasets/{dataset}/template`):

- Upload an `.xlsx` with the template headers (Vietnamese; diacritics and case are ignored when matching headers).
  The response is the report: `status` (`validated` or `rejected`), `totalRows`, `newRows`, `updatedRows`, `removedRows`,
  `unknownMscbs` (rows of unknown employees are skipped on apply), `badValues` (`row`, `column`, `message`). A file with
  any bad value, or with no rows, is `rejected` and cannot be applied. Nothing is written to the dataset until apply.
- **Teaching** replaces the rows of every academic year present in the file (other years stay). Row key:
  MSCB + year + term + course code + class code. **Research** (one row per project member, project columns repeated) and
  **publications** (authors as a `;`-separated MSCB list in author order) replace the whole dataset.
- Apply is one transaction, allowed once per import; the stored file and report stay in `dataset_imports`.
