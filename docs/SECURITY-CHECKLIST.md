# Security Cleanup Checklist (D17)

For the owner: complete each rotation/remediation step before or at cutover. This checklist documents exposures found in the legacy system (v1) and prior work. **Do not perform any of these rotations now.** Only rotate after v2 is complete and ready to go live.

---

## 1. Google OAuth Client Secrets (Hard-coded)

**Location:**
- `D:\git\SupportHCMUS\HRBackend\Helper\Oauth.cs` — key name: see client ID references
- `D:\git\SupportHCMUS\HRBackend\Helper\GoogleServices.cs` — key name: see `ClientSecret` field

**Why it matters:**
- Hard-coded secrets in source code expose the OAuth app if the repo is ever made public or if the code is reviewed outside the organization.
- Anyone with the secret can impersonate the app and forge authentication tokens.

**Remediation steps:**
1. Go to [Google Cloud Console](https://console.cloud.google.com).
2. Navigate to **Credentials** for the current project.
3. Locate the OAuth 2.0 client (likely "HCMUSSupport" or similar).
4. Delete the old client secret and create a new one.
5. Copy the new secret.
6. In the v2 codebase, store the secret in a `.env` file or deployment secret manager (not in code).
7. Update the HRBackend code to read the secret from the environment variable instead of hard-coding it.
8. Add `.env` to `.gitignore`.
9. Rotate again before the v2 launch, adding the new URI `https://support.hcmus.edu.vn/api/auth/callback` and (if needed) staging/dev URIs.

**Verification:**
- Confirm the old secret is removed from Google Cloud Console.
- Verify no hard-coded secret appears in `git log --all -p` for the HRBackend files.
- Test sign-in with the new secret in the v2 app.

---

## 2. GitHub Personal Access Token (Exposed)

**Location:**
- `D:\git\SupportHCMUS\GitIntegrationTest\ProgramGitIntegrationTest.cs` — key name: see `token` or `auth` variable

**Why it matters:**
- A PAT in test code grants full repo access to anyone who finds it.
- Leftover test code is a common source of accidental exposure.

**Remediation steps:**
1. Go to [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens).
2. Find the token used in the test file (look for "git integration test" or similar description).
3. Click **Delete** to revoke it immediately.
4. Remove the test file `D:\git\SupportHCMUS\GitIntegrationTest\ProgramGitIntegrationTest.cs` or purge the token from it before v2 launch.
5. Never check in test credentials; use a CI secret instead.

**Verification:**
- Confirm the token is removed from GitHub settings.
- Run `git log --all -S "<token_pattern>"` to find and remove any lingering references.

---

## 3. HRM SQL Server `sa` Password (Exposed in 3 Places)

**Locations:**
- `D:\git\SupportHCMUS\BscHrmBackend\appsettings.json` — key name: `ConnectionString` (contains embedded `sa` password)
- `D:\git\HCMUSSupportV2\docs\hrm-query.cmd` (gitignored locally; on disk) — key name: see `uid=sa` in connection string
- `D:\git\SupportHcmusV2\docs\notifications-to-db.py` — key name: see `sa` password in DB URI

**Why it matters:**
- The `sa` (system admin) account is the most privileged in SQL Server.
- Exposing it in files, especially where someone else might read them, grants full database control.
- Hard-coded `sa` password violates the principle of least privilege.

**Remediation steps:**
1. **Create a least-privilege SQL login for the Sync tool** (see **§4 below** and `deploy/sql/hrm-readonly-login.sql`).
2. **In BscHrmBackend:**
   - Move the `sa` password to a separate, `.gitignore`'d secrets file (e.g., `secrets.json`).
   - Or, stop using `sa` entirely and switch to the new `hcmus_support_sync` read-only login (once it's created).
3. **In v2 (docs/hrm-query.cmd):**
   - Never commit this file. If you need to run manual HRM queries for debugging:
     - Use the least-privilege login `hcmus_support_sync` (read-only; created in D17 §4).
     - Store the password in `user-secrets` or a local-only secrets file, never in git.
4. **In SupportHcmusV2/docs/notifications-to-db.py:**
   - Remove the script or replace `sa` with the new least-privilege login.
   - Change the `sa` password on the HRM SQL Server (password rotation step below).

**Password rotation:**
1. In SQL Server Management Studio, connect to the HRM database as the current `sa` account.
2. Right-click **Logins** → **New Login** (this creates `hcmus_support_sync`; see §4).
3. After v2 is deployed and confirmed working with the read-only login:
   - Right-click **sa** → **Properties**.
   - Click **General** → **Password**.
   - Enter a new, strong password.
   - Click **OK** and **Yes** to confirm.
4. Do not share the new `sa` password; it should never be used by applications (only by DBAs).

**Verification:**
- Confirm `git log --all -p` shows no `sa` password in any of the three files.
- Verify BscHrmBackend reads the connection string from environment or a secrets file.
- Test the new `hcmus_support_sync` login with a `SELECT` query on one of the tables (should succeed).
- Test that `hcmus_support_sync` cannot `INSERT`, `UPDATE` or `DELETE` (should fail).
- Confirm the new `sa` password works in manual SSMS connections.

---

## 4. Least-Privilege HRM SQL Login for the Sync Tool

This is **new** in v2 and must be created before the Sync tool runs in production.

**Template:** `deploy/sql/hrm-readonly-login.sql`

**What it does:**
- Creates a SQL Server login `hcmus_support_sync` with a placeholder password.
- Creates a database user in the `HRM` database.
- Grants `SELECT` only on the 17 HRM data tables that the Sync tool reads.
- Denies all other permissions.

**Setup steps:**
1. Open the SQL Server where the `HRM` database lives.
2. Open `deploy/sql/hrm-readonly-login.sql` in SQL Server Management Studio.
3. Replace `<CHANGE_ME>` with a strong, random password. Store it securely (e.g., in the deployment secret manager).
4. Run the script as the `sa` account (or a DBA with `CREATE LOGIN` privilege).
5. Verify the login exists: **Object Explorer** → **Security** → **Logins** → `hcmus_support_sync`.
6. Update the `HCMUSSupportV2.Sync` tool to use this login instead of `sa` in its connection string.

**Tables included (17 total):**

| Org & Roster | Education | Positions & Tenure | Finance | Innovation |
|---|---|---|---|---|
| DM_DONVI | NS_QuaTrinhDaoTao | NS_QuaTrinhChucVu | NS_QuaTrinhLuong | NS_QuaTrinhSangKien |
| DM_PHONGBAN | DM_LoaiBangCap | DM_ChucVu | NS_NHANSU (for salary) | DM_LoaiSangKien |
| | DM_HinhThucDaoTao | DM_TrinhDoHocVan | | |

Plus reference tables: `DM_QuanHuyen`, `DM_TinhThanhPho`, `DM_PhuongXa`, `DM_ChinhTri`, `DM_DanToc`, `DM_QUOCTICH`, `DM_TONGIAO`, `DM_HOCHAM`, `DM_HOCVI`, `DM_CHUYENNGANH`, `DM_NganHang` (for joins).

---

## 5. v1 App-to-App (S2S) Tokens (Plain Text)

**Location:**
- `D:\git\SupportHCMUSData\config\apps.json` — key name: see `token` fields in each app object

**Why it matters:**
- v1 had a server-to-server endpoint `/api/<guid>` that returned all users without proper auth (only a token in a header).
- Plain-text tokens in source control can be stolen and used to exfiltrate data.
- Both endpoints (KHCN and Documents) are being retired as modules of v2 portal.

**Remediation steps:**
1. At cutover, when v1 is retired and v2 modules replace it:
   - Remove the S2S endpoint `/api/<guid>` from the v1 API.
   - Notify any consumers (KHCN, Documents teams) that they must use v2 portal modules instead.
2. Remove or revoke `apps.json` from the repo (or mark it read-only, archived):
   - `git rm D:\git\SupportHCMUSData\config\apps.json` or move it to a non-repo location.
   - Commit the removal.

**Verification:**
- Confirm `apps.json` is no longer in the git history (or is archived in a separate read-only branch).
- Confirm v1 S2S endpoint is removed.
- Confirm KHCN and Documents teams have been notified and have migrated to v2.

---

## 6. Service Account Key Leaked to CI Logs

**Location:**
- `D:\git\SupportHCMUSData\scripts\sheets.py` — key name: `SERVICE_ACCOUNT_INFO` (printed to stdout)

**Why it matters:**
- GitHub Actions logs are searchable and indexable. A leaked service account key grants full access to the service (Google Sheets API in this case).
- This was a debugging mistake, but it created a long-term exposure in the logs.

**Remediation steps:**
1. **Fix the script:**
   - Open `D:\git\SupportHCMUSData\scripts\sheets.py`.
   - Remove or comment out any `print(SERVICE_ACCOUNT_INFO)` lines.
   - If you need to debug, log to a file that is `.gitignore`'d, not to stdout.
2. **Rotate the service account key:**
   - Go to [Google Cloud Console > Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts).
   - Find the service account used by `sheets.py`.
   - Click **Keys** → find the old key → click the delete icon (🗑).
   - Click **Create new key** → **JSON** → **Create**.
   - Replace the key in your deployment secrets (not in the repo).
3. **Clean up old workflow logs:**
   - Go to the repo **Actions** tab.
   - Find the workflows that ran `scripts/sheets.py`.
   - Click each run and check the logs for any printed service account info.
   - If you find it, request the log be deleted or set to private (GitHub allows repo owners to delete logs).
4. **Re-run the workflow with the new key** to confirm it works.

**Verification:**
- Confirm the `print(SERVICE_ACCOUNT_INFO)` line is removed from the script.
- Confirm the old service account key is deleted from Google Cloud.
- Manually search old workflow logs (Actions > past runs) to see if the key was printed; if so, note it for eventual cleanup.
- Test the script with the new key.

---

## 7. Production Google OAuth Token (Drive Telemetry)

**Location:**
- `/root/backend/gapi/` on the production server (`support.hcmus.edu.vn`)

**Why it matters:**
- This is a **user-level** OAuth token (not a service account), stored on disk in plain text on the production server.
- It grants access to Google Drive and Sheets on behalf of whichever user account it represents.
- v2 does not use Drive telemetry, so this token is no longer needed.

**Remediation steps (after v2 is live and v1 is shut down):**
1. SSH into the production server as root.
2. Delete the `/root/backend/gapi/` directory entirely:
   ```bash
   rm -rf /root/backend/gapi/
   ```
3. Revoke the Google account's authorization:
   - Visit [myaccount.google.com/permissions](https://myaccount.google.com/permissions).
   - Find the entry "Support HCMUS" (or similar app name).
   - Click **Remove access**.
4. Verify the directory no longer exists:
   ```bash
   ls -la /root/backend/gapi/ 2>&1  # should show "No such file"
   ```

**Verification:**
- Confirm `/root/backend/gapi/` is deleted.
- Confirm the grant is revoked at myaccount.google.com/permissions.

---

## 8. Personally Identifiable Information (PII) in Git History

**Locations & scope:**
- `D:\git\SupportHCMUSData` (data repo, 1,592 commits since 2022)
- **Data at risk:** National ID, bank account, tax code, insurance numbers, DOB, addresses (see INVENTORY.md §4 and §6).

**Why it matters:**
- PII in git history is permanent unless the history is rewritten (which breaks all clones).
- If the repo is ever made public or accessed by unauthorized personnel, the data is exposed.
- Compliance with data protection may require either archiving or purging.

**Decision needed from the owner (post-cutover):**
Choose **one** of:

1. **Archive as read-only (recommended for audit trail):**
   - Move the repo to a private archive location (e.g., a separate "vault" repo or cloud storage).
   - Restrict access to DBAs and compliance officers only.
   - Keep the original repo for reference but mark it as "archived — no longer active."
   - Pros: preserves history for audit; keeps current developers happy.
   - Cons: requires managing a separate archive.

2. **Purge the history (irreversible):**
   - Use [git filter-repo](https://github.com/newren/git-filter-repo) to remove large binary files and sensitive files.
   - Rewrite the history to remove PII from commit messages and file content.
   - Force-push to all clones (breaks existing clones; requires re-cloning).
   - Pros: completely removes the data.
   - Cons: disruptive; hard to coordinate; may lose audit trail.

**Recommend:**
Unless there is a specific compliance requirement to purge, **archive as read-only.** This gives you the best of both worlds: the data is restricted, but the history is available for compliance reviews and incident investigation.

**Implementation (owner decides):**
- If archiving: move to a separate location, update documentation with access requirements.
- If purging: schedule with the team, test locally first, coordinate the rewrite, and communicate the new clone URL.

**Verification:**
- Confirm the new status is documented and communicated to the team.
- Verify access controls are in place (for archived repos) or history is actually rewritten (for purged repos).

---

## 9. Production `/root/.gitconfig` with Plaintext Password

**Location:**
- `/root/.gitconfig` on the production server (`support.hcmus.edu.vn`)

**Why it matters:**
- A plaintext `password` entry in `.gitconfig` grants shell access via git commands to anyone who gains access to the server.
- Modern Git should use credential helpers (SSH keys, OAuth, or a credential store) instead.

**Remediation steps (after v2 is live and v1 is shut down):**
1. SSH into the production server as root.
2. Edit `.gitconfig`:
   ```bash
   nano /root/.gitconfig
   ```
   Or use SSMS if it's Windows.
3. Find and delete the `[user]` or `[credential]` section containing the plaintext `password` entry.
4. Replace with SSH key authentication (if pulling from GitHub):
   - Generate an SSH key (or reuse an existing one): `ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519`.
   - Add the public key to GitHub (Settings > SSH and GPG keys > New SSH key).
   - Update the `.git/config` in `/root/backend/data` to use `git@github.com:tmkhiem/SupportHCMUSData.git` instead of `https://...`.
5. Save and close the editor.
6. Test the connection: `cd /root/backend/data && git pull` (should work without prompting for a password).

**Verification:**
- Confirm the plaintext password is removed from `.gitconfig`.
- Confirm `git pull` works without prompting.
- Confirm no SSH passphrase is required (or that it's stored in an SSH agent, which is better).

---

## 10. SQL Injection Vulnerability (BscHrmBackend)

**Location:**
- `D:\git\SupportHCMUS\BscHrmBackend\**\ApiController.cs` (or similar) — endpoint `/api/data/{tableName}`

**Why it matters:**
- The endpoint constructs SQL queries by string concatenation with user input (`tableName`).
- This is a classic SQL injection vulnerability that can grant unauthorized access to any table in the database.
- The endpoint is on an internal network (so external exposure is low), but it still violates the principle of least privilege.
- v2 does not include this endpoint.

**Remediation steps:**
- This endpoint is **not part of v2** and will not be deployed.
- At cutover, when v1 is retired:
  - Confirm the endpoint is removed from the v1 API or disabled.
  - Notify any internal consumers (if they exist) that they must migrate to v2 APIs.
- **No action is needed during v2 development.** Flagged here for awareness.

**Verification (at cutover):**
- Confirm `/api/data/*` returns 404 or is disabled on the production server.
- Confirm any consumers have migrated to v2.

---

## 11. Legacy Deploy Scripts Using Unencrypted `ssh`

**Location:**
- `upload.cmd` — likely in `D:\git\SupportHCMUS\BscHrmBackend` or root
- `npm run deploy` — check `package.json` for the script definition

**Why it matters:**
- Scripts using `root@` scp/ssh without key-based authentication are prone to credential leaks in the script file.
- Plaintext passwords in deploy scripts violate the principle of least privilege.
- v2 uses modern deployment practices (GitHub Actions, or similar).

**Remediation steps:**
- These scripts are **legacy v1 tooling** and will not be used for v2.
- At cutover, when v2 is deployed:
  - Archive the old scripts (move to a separate "deprecated" folder or delete).
  - Use v2's deployment process instead (described in D16).
- **No action is needed during v2 development.** Flagged here for documentation.

**Verification (at cutover):**
- Confirm the old scripts are not used for v2 deployment.
- Confirm v2 uses the new `deploy.ps1` and modern auth (SSH keys or deployment secrets).

---

## Summary of Actions by Role

| Item | Owner (Rotation) | DBA (SQL Setup) | Dev (Code Changes) |
|---|---|---|---|
| 1. Google OAuth secret | ✓ Rotate | | ✓ Use env var |
| 2. GitHub PAT | ✓ Revoke | | |
| 3. `sa` password | ✓ Change | ✓ Run script §4 | ✓ Use new login |
| 4. SQL login | | ✓ Create `hcmus_support_sync` | ✓ Use in Sync tool |
| 5. v1 S2S tokens | ✓ Retire | | ✓ Remove endpoint |
| 6. Service account key (sheets.py) | | | ✓ Remove print; rotate key |
| 7. Google OAuth token (gapi/) | ✓ Delete dir; revoke | | |
| 8. PII in git history | ✓ Decide: archive or purge | | |
| 9. `/root/.gitconfig` password | ✓ Remove; use SSH | | |
| 10. SQL injection endpoint | | | ✓ Confirm retired |
| 11. Legacy deploy scripts | ✓ Archive | | |

---

## Timing

- **Before v2 cutover:** Prepare (rotations ready, SQL script tested, new logins verified).
- **At cutover:** Execute rotations in this order:
  1. DBA creates SQL login § (if not done already).
  2. Update configs to use new secrets/logins.
  3. Test v2 with new credentials.
  4. Retire v1 and revoke old credentials.
  5. Clean up production server (delete old gapi/ dir, update .gitconfig, etc.).
- **Post-cutover:** Decide on PII archival, clean up GitHub logs if needed.
