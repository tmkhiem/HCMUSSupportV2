# Cutover runbook (D18)

The owner's checklist for replacing v1 with v2 on `support.hcmus.edu.vn`. **Nothing on this page has been run against the live
server**: the parity check and the migration rehearsal ran on a temporary local database ([PARITY.md](PARITY.md)). Every step that
needs the owner (DNS, the server upgrade, secrets, anything on the live host) is a checkbox here and nowhere else.

The commands for each phase live in [OPERATIONS.md](OPERATIONS.md) (sections 1 to 7), the rotations in
[SECURITY-CHECKLIST.md](SECURITY-CHECKLIST.md) (D17), the data steps in [MIGRATION.md](MIGRATION.md) (D15) and [SYNC.md](SYNC.md).
This page orders them and adds the gates.

Rule for the whole cutover: **v1 stays recoverable until the end** (snapshot, off-box v1 archive, v1 data repo untouched). Nothing
is deleted in the same window as the switch.

## Gates (all must be true before the window)

- [ ] `main` contains D01 to D18 and its tests pass (`dotnet test`, `npx vitest run`, Playwright, `npm run test:e2e:real`).
- [ ] The parity report is clean: `tools/parity-check` against a database built from the **current** v1 data repo (section "Rehearsal" below), run again on the day of the cutover. The rehearsed result is in [PARITY.md](PARITY.md).
- [ ] The D15 findings for HR are handled or accepted (list in [PARITY.md](PARITY.md) "Known differences", [MIGRATION.md](MIGRATION.md) "Not done / for the owner"): invalid and conflicting emails, the MSCBs missing in HRM, the duplicate MSCBs.
- [ ] The nightly `sync hrm` has run on the internal Windows box for a week against a non-production host (the soak, below), and the sync run history shows no failed run and no truncation-guard stop.
- [ ] The read-only HRM SQL login exists (`deploy/sql/hrm-readonly-login.sql`, D17) and the first `sync hrm --dry-run` on the HRM box passed. (`sync hrm` has never run against the real HRM: SYNC.md "Assumptions".)
- [ ] The owner decided who else gets `editor` or `admin` (the six other v1 ViewAs/Lookup holders; Q5).
- [ ] A rehearsal of the bootstrap on a throwaway Debian 13 VM or droplet (OPERATIONS section 8, "Not validated").

## Phase A: soak (one week, non-production, before the window)

Not done by D18 (it needs a week and the HRM box).

- [ ] Stand up a staging host (a throwaway droplet or the dev server), deploy v2 with `deploy.ps1`, load the data in the order of OPERATIONS 3.2 (`sync legacy-git`, `legacy-migrate --apply`, `legacy-news --apply`), then switch to the live HRM feed.
- [ ] Task Scheduler on the HRM box runs `sync hrm --datasets all` nightly (PLAN Q3). Use the same `--admin`-free command as production; do **not** run `legacy-git` on a schedule as well.
- [ ] Daily: Quản trị -> Đồng bộ shows a successful run per dataset; issues (`bad_date`, `unknown_employee`, `duplicate_mscb`) are no worse than the first run; Tin tức behaves for two or three real colleagues (give them an editor-mapped test email).
- [ ] Re-run `tools/parity-check` against the soak database on the last day. HRM-sourced rows replace the synthetic `legacy-git` rows on the first `sync hrm` run (SYNC.md "Limitations of legacy-git"), so for HRM data the comparison is then against HRM, not against the v1 JSON: expect differences only where HRM differs from what v1 last exported, and list them.
- [ ] Backups: one scheduled backup and one restore drill (OPERATIONS 5) on the staging host.

## Phase B: before the window (owner, a few days ahead)

- [ ] **Google OAuth client** (Q7: reuse the v1 web client). In Google Cloud Console add these authorised redirect URIs (the v1 URIs stay until the switch is final):
  - [ ] `https://support.hcmus.edu.vn/api/auth/callback` (production)
  - [ ] the staging callback, `https://<staging host>/api/auth/callback`
  - [ ] `http://localhost:5173/api/auth/callback` (Vite dev server, which proxies `/api`)
  - [ ] `http://localhost:5161/api/auth/callback` (backend run directly; PROGRESS follow-up 1)
- [ ] Tell users the maintenance window (about an hour; OPERATIONS 1.1 step 4) and that they sign in with the same Google account as before.
- [ ] Prepare the production secrets in a password manager: the new Google client secret (rotated now or in the window, see Phase C), `HCMUS_DB_PASSWORD`, the Sync API client token, the `legacy-migration` API client token (below).
- [ ] Know the rollback: the DigitalOcean snapshot restore time (power-off snapshot) and the DNS or Reserved IP switch back.

## Phase C: the window

Follow OPERATIONS in order; this is the checklist form with the D18 additions.

1. [ ] **Back up v1 in full before touching the server** (OPERATIONS 1.1): a DigitalOcean snapshot, then the archive of `/root/backend` (including `data/`, `gapi/`), the nginx config (`/etc/nginx`, `/etc/letsencrypt`), the static html (`/var/www/support.hcmus.edu.vn/html`), the crontab and the tmux listing, copied **off the box**, encrypted. Verify that the archive opens before going on.
2. [ ] Stop the v1 data pipeline push (the 22:30 `HRM-Database` commit) for the window; the v1 data repo is **not** changed by v2 at all.
3. [ ] Upgrade Debian 11 to 12 to 13 in `tmux` (OPERATIONS 1.2), **or** use a fresh droplet and switch DNS or the Reserved IP at the end (lower risk, v1 stays up as the rollback).
4. [ ] Stop v1: kill the v1 `tmux` session (and any `@reboot` cron entry), OPERATIONS 1.3. The v1 backend and the data checkout stay on disk.
5. [ ] Bootstrap (OPERATIONS 2), with `--disable-old-site` (this moves the v1 nginx site, and the `/tchc` remnant with it, to `/etc/nginx/disabled-sites/`).
6. [ ] Edit `/etc/hcmus-support/env`: the Google client id and the **rotated** secret, `Admin__BootstrapEmails__0` (the first administrator).
7. [ ] Deploy (OPERATIONS 3.1: `.\deploy\deploy.ps1 -TargetHost support.hcmus.edu.vn -SshUser deploy`, `-WhatIf` first).
8. [ ] Load the data (OPERATIONS 3.2), **on the production database**, in this order and each step as a dry run first:
   - [ ] create the one-off `legacy-migration` API client (scope `legacy.import`) and the Sync client (scope `hrm.ingest`) in Quản trị -> API clients (copy each token when shown; SQL fallback in [MIGRATION.md](MIGRATION.md) "One-time setup");
   - [ ] `sync legacy-git --path <SupportHCMUSData checkout>` **or** `sync hrm --datasets all` from the HRM box (not both on a schedule), then the roster, roles, datasets (`sync legacy-migrate --path ... --admin <email:mscb> --admin <email:mscb> --apply`) and `tools/legacy-news ... --apply`;
   - [ ] run each tool a second time: it must report nothing to do (the idempotency proof of D15);
   - [ ] **revoke the `legacy-migration` client** (the "Thu hồi" button in Quản trị -> API clients) and keep only the Sync client;
   - [ ] review the reports (counts and MSCBs on screen; the `--report` files hold emails and names: keep them out of git and delete them afterwards).
9. [ ] **Parity against production**: run `tools/parity-check` with an admin browser session (`--cookie`, see [PARITY.md](PARITY.md) "Running it against another host") for the 5 sampled MSCBs and a bulk sample. It must exit 0. Sign in as the owner with Google and open Tin tức and two Hồ sơ pages.
10. [ ] Smoke test (OPERATIONS 3.2 step 6) and ask two or three real staff (different units, one with teaching and research, one with only a profile) to sign in and compare against what they remember seeing in v1.
11. [ ] Take a manual backup right after the load (`sudo systemctl start hcmus-support-backup.service`) and do the first restore drill (OPERATIONS 5).
12. [ ] Security checklist rotations (SECURITY-CHECKLIST, D17): the Google client secret (if not already done in step 6), the `apps.json` tokens, the plaintext password in `/root/.gitconfig`, the Google service-account key of `scripts/sheets.py`.
13. [ ] Uptime monitoring on `https://support.hcmus.edu.vn/healthz` (OPERATIONS 6).
14. [ ] Re-enable nothing from v1: the v1 git push of `SupportHCMUSData` stays **stopped** (the HRM feed now goes to v2 through `sync hrm`).

## Phase D: after the switch (the following days)

- [ ] **Remove the v1 remnants** only after a stable period (suggested: one week; the snapshot and the off-box archive remain):
  - [ ] the `/tchc` remnants of the old nginx site (already moved by `--disable-old-site`; delete `/etc/nginx/disabled-sites/`),
  - [ ] the v1 `tmux` process and any cron or boot entry for it (stopped in step 4),
  - [ ] `/root/backend` and `/var/www/support.hcmus.edu.vn/html` (OPERATIONS 1.3 says: not in the same window).
- [ ] **Tell the KHCN and Documents owners** that the v1 user-dump endpoint (`GET /api/7fbcb6...af3`, the server-to-server dump of all users, gated by `apps.json` tokens) is gone. They become portal modules (PLAN section 11); until then they have no feed. Send this before the window if they depend on it nightly.
- [ ] Decide what happens to the PII-laden `SupportHCMUSData` history: archive it read-only, or purge it (PLAN D17 last item). Keep the v1 backup archive until that decision is made.
- [ ] Ask HR to fix the roster findings in the Nhân sự & email page (invalid emails, HRM-conflict emails, the MSCBs missing in HRM, the duplicate MSCBs) and re-run the roster step or add the emails by hand.
- [ ] Remove the dev redirect URIs from the Google client when development moves off `localhost`, and the v1 redirect URI once v1 is gone.

## Rollback

Until step 14: stop the v2 service, switch back by restoring the DigitalOcean snapshot (in-place upgrade) or by pointing DNS or the Reserved IP back at the old droplet (fresh droplet path), restart the v1 `tmux` session from the archive if it was stopped, and resume the v1 push. After step 14 v1 is reachable only from the snapshot and the archive.

## Rehearsal

D18 rehearsed phases C8 and C9 on a temporary database (never the live server): see [PARITY.md](PARITY.md). The commands (DB name
`hcmus_support_dev_<machine>_d18_<x>`, dropped afterwards) are in [PARITY.md](PARITY.md) "Rehearsal recipe".
