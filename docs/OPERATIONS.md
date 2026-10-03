# HCMUS Support V2: operations runbook

Everything here is performed **by the owner, by hand**, after v2 is complete (PLAN §10 Q2). Until then nothing is installed on,
changed on or deployed to `support.hcmus.edu.vn`. The kit lives in [`deploy/`](../deploy) and was validated locally
(`nginx -t`, `systemd-analyze verify`, `shellcheck`, a real PostgreSQL 17 backup and restore round trip, a stubbed
`activate.sh` run). It has never touched the live server.

## 0. Map of the kit

| What | File | Lands on the server at |
|---|---|---|
| App service | `deploy/systemd/hcmus-support.service` | `/etc/systemd/system/hcmus-support.service` |
| Backup service and timer (02:30) | `deploy/systemd/hcmus-support-backup.{service,timer}` | `/etc/systemd/system/` |
| nginx site | `deploy/nginx/support.hcmus.edu.vn.conf` | `/etc/nginx/sites-available/` + symlink in `sites-enabled/` |
| journald cap (500 MB) | `deploy/journald/hcmus-support.conf` | `/etc/systemd/journald.conf.d/hcmus-support.conf` |
| Env file template | `deploy/env.example` | `/etc/hcmus-support/env` (created once, 0640 root:hcmus-support) |
| Backup, restore | `deploy/scripts/backup.sh`, `restore.sh` | `/opt/hcmus-support/bin/` |
| Bootstrap (run once, by hand) | `deploy/scripts/server-bootstrap.sh` | not installed, run from a copy of `deploy/` |
| Deploy (run from the dev PC) | `deploy/deploy.ps1` + `deploy/scripts/activate.sh` | `activate.sh` is uploaded with each release |
| HRM read-only login (D17) | `deploy/sql/hrm-readonly-login.sql` | runs on the HRM SQL Server, not here |

Layout on the server:

```
/opt/hcmus-support/app            -> symlink to releases/<yyyyMMddHHmmss>   (what the service runs)
/opt/hcmus-support/releases/...   one directory per deploy (last 5 kept), each with the efbundle used
/opt/hcmus-support/bin/           backup.sh, restore.sh, activate.sh (copied on each deploy)
/etc/hcmus-support/env            secrets and configuration (not in git)
/etc/hcmus-support/backup.env     optional: BACKUP_REMOTE=..., retention overrides
/var/lib/hcmus-support/files      uploaded files (the IFileStore root)
/var/log/hcmus-support/           Serilog rolling file
/var/backups/hcmus-support/       daily/ weekly/ predeploy/   (root only, 0700)
```

Ports: nginx 80/443 (public) -> app `127.0.0.1:5080` -> PostgreSQL `127.0.0.1:5432`. Only 22, 80 and 443 should be reachable
from outside (a DigitalOcean cloud firewall in front is a good idea).

---

## 1. In-place upgrade of the current server

Current state (INVENTORY §2): Debian 11 (support has ended; Aug 2026), .NET 6 only, 1 vCPU / about 1 GB RAM / 35 GB disk, v1
backend running as root in `tmux` on :65012, nginx serving the SPA from `/var/www/support.hcmus.edu.vn/html`, certbot cert
for the apex only, no backups, a 2.9 GB journal.

**Do this only once v2 has passed the soak and the parity report (PLAN D18) is clean.**

### 1.1 Preparation (nothing on the server changes yet)

1. **Take a DigitalOcean snapshot** of the droplet (power-off snapshot if you can afford a minute of downtime). This is the real
   undo button for an OS upgrade.
2. **Back up v1 off the box**, onto the owner's machine, encrypted (the archive contains secrets: the Google token in
   `gapi/`, the deploy key, `/root/.gitconfig` with a plaintext password; see `docs/SECURITY-CHECKLIST.md`):
   ```bash
   # on the server
   tar czf /root/v1-backup-$(date +%F).tgz \
       /root/backend /root/.gitconfig /root/.ssh \
       /etc/nginx /etc/letsencrypt \
       /var/www/support.hcmus.edu.vn/html \
       /var/spool/cron /etc/crontab
   crontab -l > /root/v1-crontab.txt 2>/dev/null; tmux ls > /root/v1-tmux.txt 2>&1
   # on the dev PC
   scp root@support.hcmus.edu.vn:/root/v1-backup-*.tgz .   # then store it encrypted; delete it from the server afterwards
   ```
3. Confirm `df -h /` shows at least 8 GB free and add a swap file if the machine has none (a Debian dist-upgrade on 1 GB RAM
   without swap can be OOM-killed):
   `fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`.
4. Stop the v1 data pipeline's push (the 22:30 `HRM-Database` commit) for the maintenance window, and tell users there will be
   an outage of about an hour. Keep DigitalOcean's web console handy in case SSH comes back late.

### 1.2 Debian 11 -> 12 -> 13

Run inside `tmux` (or `screen`) so a dropped SSH session does not kill the upgrade. Each hop: finish the current release's
updates, switch the suites, upgrade in two steps, reboot, verify.

```bash
apt update && apt full-upgrade -y && apt autoremove -y && reboot          # bring bullseye fully up to date first
# --- hop 1: bullseye -> bookworm
sed -i 's/bullseye/bookworm/g' /etc/apt/sources.list /etc/apt/sources.list.d/*.list
sed -i 's|bookworm/updates|bookworm-security|' /etc/apt/sources.list      # the security suite was renamed
# if you use non-free firmware, the component is now "non-free-firmware"
apt update && apt upgrade --without-new-pkgs -y && apt full-upgrade -y
reboot
cat /etc/debian_version                                                   # 12.x
# --- hop 2: bookworm -> trixie
sed -i 's/bookworm/trixie/g' /etc/apt/sources.list /etc/apt/sources.list.d/*.list
apt update && apt upgrade --without-new-pkgs -y && apt full-upgrade -y
reboot
cat /etc/debian_version                                                   # 13.x
```

Notes:
- Read the official release notes for each hop ("Upgrades from Debian 11/12") before starting; answer config-file prompts by
  keeping the local version of `/etc/ssh/sshd_config` and nginx files unless you know better.
- Third-party repos (the old Microsoft .NET 6 feed, if present) should be disabled first; the bootstrap re-adds the right one.
- After each reboot check `systemctl --failed`, and that SSH and nginx came back. v1 may or may not survive the hop (.NET 6 on
  OpenSSL 3); it does not need to: v2 replaces it.
- Debian 13 ships PostgreSQL 17 and nginx 1.26 in its own repositories, which is why this path is the simplest. On Debian 12 the
  bootstrap adds the PGDG repository for PostgreSQL 17 and falls back to the `listen ... http2` syntax for nginx 1.22.
- You may go straight to a **fresh droplet** instead (new Debian 13 droplet, run the bootstrap, deploy, load data, move the
  Reserved IP or DNS record). It costs a few dollars and leaves v1 untouched as the rollback. The upgrade-in-place path is the
  owner's decision (Q2), but this is the lower-risk variant if the snapshot restore time worries you.

### 1.3 Replace v1 with the v2 kit

The order matters: back up first (1.1), then upgrade (1.2), then:

```bash
tmux kill-session -t <v1 session>   # stop the v1 backend (it runs as root on :65012); also remove any @reboot cron entry for it
```
then continue with section 2 (bootstrap). The bootstrap refuses to continue while another enabled nginx site claims
`support.hcmus.edu.vn`; `--disable-old-site` moves the v1 site into `/etc/nginx/disabled-sites/` (the `/tchc` remnant goes with it).
The old static root `/var/www/support.hcmus.edu.vn/html` and `/root/backend` stay on disk until the v2 cutover checklist
(PLAN D18) says to delete them. **Do not delete them in the same window.**

---

## 2. Bootstrap a server

For a freshly upgraded Debian 12/13 server (or a new droplet). Run it **by hand, as root**; nothing calls it automatically. It is
idempotent, so re-running after an interruption is safe.

1. Create the deploy account (SSH key only; passwordless sudo is required by `deploy.ps1`, which makes it equivalent to root, so
   guard the key):
   ```bash
   adduser --disabled-password --gecos '' deploy
   install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
   # put your public key in /home/deploy/.ssh/authorized_keys
   echo 'deploy ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/deploy && chmod 440 /etc/sudoers.d/deploy
   ```
2. Copy the kit to the server (from the dev PC): `scp -r deploy deploy@HOST:/tmp/hcmus-deploy` (or `git clone` the repo).
3. Run it:
   ```bash
   sudo bash /tmp/hcmus-deploy/scripts/server-bootstrap.sh \
        --agree-le-tos --certbot-email you@hcmus.edu.vn --disable-old-site
   ```
   It will, in order: check the OS; install nginx, certbot, rsync, rclone; create user `hcmus-support` and the directories;
   install `aspnetcore-runtime-8.0` from the Microsoft feed (use `--dotnet-version` to change, `--allow-dotnet-install-script`
   if Microsoft has no package for your Debian release); install PostgreSQL 17 (Debian package, else PGDG) with a small-RAM
   tuning drop-in; create the role and database `hcmus_support` (password: `HCMUS_DB_PASSWORD`, or prompted, or
   randomly generated if left blank; stored only in `/etc/hcmus-support/env`); install the units, the journald cap and the
   backup scripts; enable the backup timer; install the nginx site and issue/expand the certificate for apex **and www**.
4. Edit `/etc/hcmus-support/env`: add the Google client id and secret (Q7: the existing v1 web client; add
   `https://support.hcmus.edu.vn/api/auth/callback` to its redirect URIs in Google Cloud Console) and anything else the app
   needs. `deploy/env.example` lists every key the backend reads (required ones uncommented); also set `Admin__BootstrapEmails__0`
   to the first administrator's email. The key names match `docs/BACKEND.md` (Configure a dev machine, key table).
5. Recommended hardening (not done by the script): `apt install unattended-upgrades fail2ban`, `PasswordAuthentication no` and
   `PermitRootLogin prohibit-password` in sshd, a cloud firewall allowing only 22/80/443.
6. Check:
   ```bash
   systemctl status postgresql nginx hcmus-support-backup.timer --no-pager
   nginx -t && curl -sI https://support.hcmus.edu.vn/ | head -3        # 502 until the first deploy: expected
   openssl s_client -connect support.hcmus.edu.vn:443 -servername www.support.hcmus.edu.vn </dev/null 2>/dev/null | openssl x509 -noout -ext subjectAltName
   ```

---

## 3. First deploy and initial data load

### 3.1 Deploy the application

From the dev PC (PowerShell 5.1 or 7, OpenSSH client, .NET SDK, Node/npm):

```powershell
.\deploy\deploy.ps1 -TargetHost support.hcmus.edu.vn -SshUser deploy -WhatIf   # prints the plan, runs nothing
.\deploy\deploy.ps1 -TargetHost support.hcmus.edu.vn -SshUser deploy
```

The script has **no default host**. It restores the pinned `dotnet-ef` (9.0.x), builds the frontend and publishes
`HCMUSSupportV2.Backend` (framework-dependent, `linux-x64`), builds the EF migrations bundle, uploads one tarball plus the
bundle, then `activate.sh` on the server: pre-deploy backup, migrations, symlink switch, restart, local health check; the
script then polls `https://<host>/healthz` and rolls the symlink back if it never returns 200.

Before the very first deploy, double-check the items that depend on the final backend (they were assumed, see §9):
assembly name, `/healthz`, the connection-string key, the file-store path key and that `dotnet ef migrations bundle` finds at
least one migration.

### 3.2 Initial data, in this order

Run these once, in order (PLAN D05 and D15 define the actual commands; check each tool's `--help` for the final flags):

1. **Schema**: done by the migrations bundle during the first deploy.
2. **Roster and emails**: the D15 migration reads `config/users.json` into `employee_emails`, makes the repo owner `admin`,
   and prints the conflict and privileged-user reports. The owner then decides who else is editor or admin (Q5) in the admin UI.
3. **HRM categories**: a one-off `sync legacy-git --path <SupportHCMUSData checkout>` (D05) to seed the typed tables from the v1
   JSON, or a live `sync hrm --datasets all` from the internal Windows box (needs an API client created in
   *Quản trị -> API clients*; its key goes into the Sync tool's config, never into git). The Sync tool talks to
   `https://support.hcmus.edu.vn/api/integration/...`, which nginx rate-limits to 120 requests/minute per address with a burst of 60.
4. **Datasets** (teaching, research, publications): D15's dataset importers, or the admin Excel imports.
5. **News**: `tools/legacy-news` posts the 56 converted notifications through the admin import endpoint; review the listed
   series/tags and the posts it flagged.
6. **Smoke test**: sign in as the owner, open Tin tức, open a Hồ sơ page, and look at `/admin` -> Đồng bộ for the sync run history.

Take a manual backup right after the load: `sudo systemctl start hcmus-support-backup.service`.

---

## 4. Routine deploy and rollback

**Deploy**: `.\deploy\deploy.ps1 -TargetHost <host> -SshUser deploy` (add `-SkipBackup` only for emergencies). Each deploy:
creates `/opt/hcmus-support/releases/<stamp>`, takes a `predeploy` backup (kept: 5), runs migrations, switches the
symlink, restarts, checks health locally and publicly, keeps the last 5 releases.

**Automatic rollback**: if the public health check fails, `deploy.ps1` calls `activate.sh --rollback <previous release>` and
exits with an error. `activate.sh` also rolls back by itself if the service never becomes healthy locally.

**Manual rollback** (any time; `activate.sh` leaves a copy of itself in `/opt/hcmus-support/bin/` on every deploy):
```bash
ls -1 /opt/hcmus-support/releases                      # newest last
readlink -f /opt/hcmus-support/app                     # what runs now
sudo /opt/hcmus-support/bin/activate.sh --rollback /opt/hcmus-support/releases/<older stamp>
curl -fsS http://127.0.0.1:5080/healthz
```

**Database caveat**: rolling back the code does **not** roll back migrations. Write every migration so that the previous
release still works against it (add columns/tables first; drop or rename only in a later release). If a migration itself went
wrong, restore the `predeploy` backup (section 5).

**Config-only change**: edit `/etc/hcmus-support/env`, then `sudo systemctl restart hcmus-support`.

**Retargeting .NET** (8 reaches end of support on 2026-11-10): change the TFM, run the bootstrap with `--dotnet-version 10.0`
on the server (installs the new runtime alongside), deploy as usual. Nothing in the unit file or nginx config changes.

---

## 5. Backup and restore drill

**What is backed up**: nightly at 02:30 (`hcmus-support-backup.timer`, with up to 5 minutes of random delay, and a catch-up run if
the machine was off): `pg_dump -Fc` of the database and a tar.gz of `/var/lib/hcmus-support/files`, with a SHA-256 file, in
`/var/backups/hcmus-support/daily` (newest **14** kept). On Sundays the same set is also kept in `weekly` (newest **8**). Dumps are
verified with `pg_restore -l` before they count. The unit runs as root and reaches PostgreSQL through the `postgres` OS user (peer
auth), so no database password is involved.

**Off-box copy** (strongly recommended: the same disk is not a backup):
```bash
sudo rclone config --config /etc/hcmus-support/rclone.conf         # create a remote, e.g. "offbox" (sftp/S3/Drive)
sudo chmod 600 /etc/hcmus-support/rclone.conf
echo 'BACKUP_REMOTE=offbox:hcmus-support-backups' | sudo tee /etc/hcmus-support/backup.env
sudo systemctl start hcmus-support-backup.service && journalctl -u hcmus-support-backup -n 20 --no-pager
```
Only the daily set is copied; apply retention with the remote's own lifecycle rules. The dump contains personal data (HRM, national
IDs): encrypt the remote (rclone `crypt`) or use a bucket you control. A failed copy fails the unit (`systemctl --failed`) but the
local backup is kept.

**Commands**
```bash
sudo systemctl list-timers hcmus-support-backup.timer
sudo systemctl start hcmus-support-backup.service        # run now
sudo /opt/hcmus-support/bin/restore.sh --list
```

**Restore drill** (do it after the first load, then quarterly; it never touches the live database):
```bash
S=$(ls -1 /var/backups/hcmus-support/daily/*.db.dump | tail -1); S=${S%.db.dump}
sudo /opt/hcmus-support/bin/restore.sh --dump $S.db.dump --target-db hcmus_restore_test \
     --files $S.files.tar.gz --files-dir /tmp/hcmus-restore-files
sudo -u postgres psql -d hcmus_restore_test -c 'SELECT count(*) FROM employees'      # compare with the live count
sudo -u postgres psql -d hcmus_restore_test -c 'SELECT count(*) FROM notifications'
ls /tmp/hcmus-restore-files | head
sudo -u postgres dropdb hcmus_restore_test && sudo rm -rf /tmp/hcmus-restore-files
```
`restore.sh` verifies the checksum, refuses a database that already exists (add `--replace` for a scratch one), and refuses the
live database name without `--force`.

**Real restore** (corruption, bad migration, lost host):
```bash
sudo systemctl stop hcmus-support
sudo /opt/hcmus-support/bin/restore.sh --dump <set>.db.dump --target-db hcmus_support --files <set>.files.tar.gz --force
sudo systemctl start hcmus-support
```
With `--force` it takes a safety dump of the current database first (`/var/backups/hcmus-support/pre-restore-*.db.dump`), refuses
to run while the service is active, and moves the existing file store aside to `files.pre-restore-<stamp>` (delete it once
you are satisfied). **New host after a disaster**: run the bootstrap, copy a backup set (or pull it from the off-box remote),
restore as above, then deploy the app. The database role password comes from the new `/etc/hcmus-support/env`; dumps carry
no passwords.

---

## 6. Logs, health and monitoring

| What | Where |
|---|---|
| App (Serilog console) | `journalctl -u hcmus-support -f` (add `-p warning` for problems, `--since "1 hour ago"`) |
| App rolling file | `/var/log/hcmus-support/` |
| Backups | `journalctl -u hcmus-support-backup` |
| nginx | `/var/log/nginx/access.log`, `error.log` |
| PostgreSQL | `/var/log/postgresql/` (statements slower than 1 s are logged) |
| Journal size | capped at 500 MB by `/etc/systemd/journald.conf.d/hcmus-support.conf`; `journalctl --disk-usage` |
| Audit trail (who viewed/changed what) | `audit_log` table, *Quản trị -> Nhật ký* |

**Health checks**
```bash
curl -fsS http://127.0.0.1:5080/healthz       # the app itself
curl -fsS https://support.hcmus.edu.vn/healthz # through nginx and TLS
systemctl is-active hcmus-support nginx postgresql
systemctl --failed
```

**Monitoring** (set up before cutover): an external uptime probe on `https://support.hcmus.edu.vn/healthz` every 1-5 minutes
(UptimeRobot, Better Stack or the university's own monitor) alerting by email; a DigitalOcean alert for disk above 80% and
sustained CPU/memory; an alert on certificate expiry below 14 days (`certbot.timer` renews; verify once with
`sudo certbot renew --dry-run`); and a weekly look at `systemctl --failed` and
`ls -lt /var/backups/hcmus-support/daily | head -3` to confirm backups are fresh. `/healthz` is public and should expose no detail.

**Common problems**
- `502 Bad Gateway`: the app is down or restarting. `systemctl status hcmus-support`, `journalctl -u hcmus-support -n 100`.
- `429` on sign-in or sync: the nginx rate limits (`hcmus_auth`, `hcmus_integration`) in `support.hcmus.edu.vn.conf`.
- Upload rejected with `413`: above nginx's 25 MB cap (or the app's own limit).
- Sign-in loops after a proxy change: the app must see `X-Forwarded-Proto: https`; nginx sets it, and loopback proxies are trusted
  by default (otherwise set `ReverseProxy__KnownProxies__0`).

---

## 7. Cutover checklist

The full cutover (parity report, one-week soak, Google redirect URIs and secret rotation, removing the `/tchc` remnants and the
v1 tmux process, telling the KHCN and Documents owners that the v1 user-dump endpoint has gone) is **PLAN D18**: the checklist is [CUTOVER.md](CUTOVER.md) and the parity report is [PARITY.md](PARITY.md). The credential
rotations and the HRM read-only login are in [`SECURITY-CHECKLIST.md`](SECURITY-CHECKLIST.md) (D17). In short, around the
upgrade window: snapshot and v1 backup (1.1) -> OS upgrade (1.2) -> bootstrap (2) -> deploy and data load (3) -> smoke test -> rotate
the Google secret and the other items in the security checklist -> uptime monitoring on -> first restore drill (5) -> stop the v1
git push -> keep the v1 backup archive until the PII history decision (D17) is made.

---

## 8. Validation record (local, no live server contact)

- `nginx -t` on `nginx:stable` (1.30) with dummy certificates at the certbot paths: syntax ok. A functional run confirmed the
  http->https redirect, www->apex redirect, security headers on proxied responses, dotfile blocking and `ssl_reject_handshake`
  for unknown hosts.
- `systemd-analyze verify` on `debian:trixie` (systemd 257) for the three unit files: no findings.
- `shellcheck` (stable, `-S style`) on `backup.sh`, `restore.sh`, `server-bootstrap.sh`, `activate.sh`: clean.
- `backup.sh` and `restore.sh` run against a real PostgreSQL 17 container: daily/weekly/predeploy sets, retention pruning, checksums,
  restore into a scratch database and into the "live" database with `--force`, files restored, refusals work.
- `activate.sh` with stubbed `systemctl`/`curl`: first deploy, second deploy, failed health check with automatic rollback, manual
  rollback (and refusal of a path outside `releases/`), pruning.
- `deploy.ps1 -WhatIf` prints the plan; `dotnet tool restore`, the frontend build and `dotnet publish -r linux-x64` were run locally
  (the publish output contains `wwwroot/index.html`); `dotnet ef migrations bundle --self-contained -r linux-x64` was proven
  on a scratch project and later on the backend itself in both Debug and Release (the Design package stays in the build output but is
  stripped from `dotnet publish`; the bundle build needs a dummy `ConnectionStrings__Default`, no database).

Not validated (needs a real Debian host): `server-bootstrap.sh` end to end, the Microsoft and PGDG feeds, certbot issuance, and the
hardening options of the units at runtime (`systemd-analyze security` needs a booted systemd). Rehearse the bootstrap on a throwaway
Debian 13 VM or droplet before the real window.

## 9. Assumptions to re-check once D01 and the other backend deliveries are merged

- Assembly name `HCMUSSupportV2.Backend.dll` (from the csproj) and `dotnet` at `/usr/bin/dotnet` (`ExecStart` in the unit).
- Listens on `ASPNETCORE_URLS=http://127.0.0.1:5080` and serves the SPA from `wwwroot` with the index.html fallback; sends no CORS
  headers and no CSP of its own.
- `GET /healthz` returns 200 without authentication (used by `activate.sh`, `deploy.ps1`, nginx and external monitors).
- Configuration keys in `deploy/env.example` match the backend (`Auth__Google__*`, `Admin__BootstrapEmails__0`, `Storage__LocalRoot`,
  `Logging__File__Path`, ...); `ConnectionStrings__Default` is also used by `activate.sh` for the bundle.
- The EF migrations assembly is the Backend project (the bundle is built from `HCMUSSupportV2.Backend`) and at least one migration
  exists; the schema needs the extensions `citext`, `unaccent`, `pg_trgm`, `pgcrypto` (created by bootstrap and `restore.sh`;
  add others in both places if a later migration needs them, e.g. `pg_stat_statements` also needs `shared_preload_libraries`).
- The file store is `/var/lib/hcmus-support/files` (`Storage__LocalRoot`), writable by `hcmus-support`; Serilog writes its file under
  `/var/log/hcmus-support` (`Logging__File__Path`). Both are set in the env file because the app directory is read-only.
- `/api/auth/*` and `/api/integration/*` are the route prefixes the rate limits attach to.
- The Sync tool's API-client auth is compatible with the 25 MB body cap and the 300 s read timeout on `/api/integration/`.
