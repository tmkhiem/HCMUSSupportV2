#!/usr/bin/env bash
# HCMUS Support V2 - one-time (and re-runnable) server bootstrap.
#
# THE OWNER RUNS THIS BY HAND, AS ROOT, ON THE UPGRADED SERVER. Nothing in the repo calls it.
# It prepares the machine; it does NOT deploy the application (deploy.ps1 does that).
#
#   sudo ./server-bootstrap.sh [options]
#
# What it does (each step is idempotent - safe to run again):
#   1. checks the OS (Debian 12+), installs base packages (nginx, certbot, rsync, rclone, ...)
#   2. creates the hcmus-support system user and directories
#   3. installs aspnetcore-runtime-8.0 from the Microsoft package feed
#   4. installs PostgreSQL 17 (Debian's own package if it has one, else the PGDG apt repo)
#   5. creates the database role + database; writes /etc/hcmus-support/env ONCE (never overwrites)
#   6. installs the systemd units, the journald cap, the backup/restore scripts, enables the timer
#   7. installs the nginx site and (with --agree-le-tos) issues/expands the certificate for apex + www
#
# Options:
#   --domain NAME            site name (default support.hcmus.edu.vn)
#   --db-name NAME           database name (default hcmus_support)
#   --db-user NAME           database role (default hcmus_support)
#   --dotnet-version X.Y     runtime to install (default 8.0)
#   --pg-version N           PostgreSQL major (default 17)
#   --skip-postgres | --skip-nginx
#   --disable-old-site       move other enabled nginx sites that claim the domain (the v1 site) to
#                            /etc/nginx/disabled-sites/ instead of aborting
#   --agree-le-tos           accept the Let's Encrypt terms and let certbot issue the certificate
#   --certbot-email ADDR     contact address for Let's Encrypt (or env CERTBOT_EMAIL)
#   --allow-dotnet-install-script
#                            if the Microsoft feed has no package for this Debian release, fall back to
#                            Microsoft's dotnet-install.sh (downloads and runs a script from dot.net)
# Environment: HCMUS_DB_PASSWORD (otherwise prompted; blank or non-interactive = generate a random one).
set -euo pipefail

DOMAIN="support.hcmus.edu.vn"
DB_NAME="hcmus_support"
DB_USER="hcmus_support"
DOTNET_VERSION="8.0"
PG_VERSION="17"
SKIP_PG=0 SKIP_NGINX=0 DISABLE_OLD=0 AGREE_TOS=0 ALLOW_DOTNET_SCRIPT=0
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:?}"; shift 2 ;;
    --db-name) DB_NAME="${2:?}"; shift 2 ;;
    --db-user) DB_USER="${2:?}"; shift 2 ;;
    --dotnet-version) DOTNET_VERSION="${2:?}"; shift 2 ;;
    --pg-version) PG_VERSION="${2:?}"; shift 2 ;;
    --skip-postgres) SKIP_PG=1; shift ;;
    --skip-nginx) SKIP_NGINX=1; shift ;;
    --disable-old-site) DISABLE_OLD=1; shift ;;
    --agree-le-tos) AGREE_TOS=1; shift ;;
    --certbot-email) CERTBOT_EMAIL="${2:?}"; shift 2 ;;
    --allow-dotnet-install-script) ALLOW_DOTNET_SCRIPT=1; shift ;;
    -h|--help) sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

log()  { printf '\n==> %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf '    WARNING: %s\n' "$*" >&2; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "run as root (sudo)"
[[ "$DB_NAME" =~ ^[a-z_][a-z0-9_]*$ ]] || die "--db-name must match [a-z_][a-z0-9_]*"
[[ "$DB_USER" =~ ^[a-z_][a-z0-9_]*$ ]] || die "--db-user must match [a-z_][a-z0-9_]*"
[[ "$DOMAIN" =~ ^[a-z0-9.-]+$ ]] || die "--domain looks wrong"

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
for f in systemd/hcmus-support.service systemd/hcmus-support-backup.service systemd/hcmus-support-backup.timer \
         nginx/support.hcmus.edu.vn.conf journald/hcmus-support.conf scripts/backup.sh scripts/restore.sh env.example; do
  [ -f "$DEPLOY_DIR/$f" ] || die "missing $DEPLOY_DIR/$f (run this script from a full copy of the deploy/ folder)"
done

APP_USER="hcmus-support"
APP_ROOT="/opt/hcmus-support"
STATE_DIR="/var/lib/hcmus-support"
LOG_DIR="/var/log/hcmus-support"
CONF_DIR="/etc/hcmus-support"
BACKUP_DIR="/var/backups/hcmus-support"
ENV_FILE="$CONF_DIR/env"
SITE_NAME="$DOMAIN.conf"

export DEBIAN_FRONTEND=noninteractive

# install SRC DEST MODE [OWNER:GROUP] - copy only if different; returns 0 if changed.
CHANGED=0
install_file() {
  local src="$1" dest="$2" mode="$3" owner="${4:-root:root}"
  if [ -f "$dest" ] && cmp -s "$src" "$dest"; then
    chmod "$mode" "$dest"; chown "$owner" "$dest"; return 0
  fi
  install -D -m "$mode" -o "${owner%%:*}" -g "${owner##*:}" "$src" "$dest"
  info "installed $dest"
  CHANGED=1
}

# ---------------------------------------------------------------------------------------------
log "1. OS check and base packages"
# shellcheck disable=SC1091
. /etc/os-release
[ "${ID:-}" = "debian" ] || die "this script supports Debian only (found ${ID:-unknown})"
DEB_MAJOR="${VERSION_ID%%.*}"
if [ "$DEB_MAJOR" -lt 12 ]; then
  die "Debian $VERSION_ID is too old/EOL. Upgrade the OS first (docs/OPERATIONS.md section 1)."
fi
info "Debian $VERSION_ID ($VERSION_CODENAME)"
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg openssl rsync rclone util-linux tar gzip

# ---------------------------------------------------------------------------------------------
log "2. User and directories"
if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --user-group --home-dir "$STATE_DIR" --no-create-home --shell /usr/sbin/nologin "$APP_USER"
  info "created user $APP_USER"
fi
install -d -m 0755 -o root -g root "$APP_ROOT" "$APP_ROOT/releases" "$APP_ROOT/bin"
install -d -m 0750 -o "$APP_USER" -g "$APP_USER" "$STATE_DIR" "$STATE_DIR/files" "$LOG_DIR"
install -d -m 0750 -o root -g "$APP_USER" "$CONF_DIR"
install -d -m 0700 -o root -g root "$BACKUP_DIR" "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly" "$BACKUP_DIR/predeploy"
install -d -m 0755 -o root -g root /var/www/certbot

# ---------------------------------------------------------------------------------------------
log "3. aspnetcore-runtime-$DOTNET_VERSION"
if ! dpkg -s "aspnetcore-runtime-$DOTNET_VERSION" >/dev/null 2>&1; then
  if ! dpkg -s packages-microsoft-prod >/dev/null 2>&1; then
    tmpdeb="$(mktemp --suffix=.deb)"
    if curl -fsSL -o "$tmpdeb" "https://packages.microsoft.com/config/debian/$DEB_MAJOR/packages-microsoft-prod.deb"; then
      dpkg -i "$tmpdeb"
    else
      warn "no Microsoft package feed for Debian $DEB_MAJOR"
    fi
    rm -f "$tmpdeb"
    apt-get update -qq
  fi
  if apt-get install -y -qq "aspnetcore-runtime-$DOTNET_VERSION"; then
    :
  elif [ "$ALLOW_DOTNET_SCRIPT" -eq 1 ]; then
    warn "falling back to dotnet-install.sh"
    tmpsh="$(mktemp --suffix=.sh)"
    curl -fsSL -o "$tmpsh" https://dot.net/v1/dotnet-install.sh
    bash "$tmpsh" --channel "$DOTNET_VERSION" --runtime aspnetcore --install-dir /usr/share/dotnet
    rm -f "$tmpsh"
    ln -sf /usr/share/dotnet/dotnet /usr/bin/dotnet
  else
    die "could not install aspnetcore-runtime-$DOTNET_VERSION from the Microsoft feed; re-run with --allow-dotnet-install-script"
  fi
fi
[ -x /usr/bin/dotnet ] || die "/usr/bin/dotnet is missing (the unit file runs /usr/bin/dotnet)"
dotnet --list-runtimes | sed 's/^/    /'

# ---------------------------------------------------------------------------------------------
if [ "$SKIP_PG" -eq 0 ]; then
  log "4. PostgreSQL $PG_VERSION"
  if ! dpkg -s "postgresql-$PG_VERSION" >/dev/null 2>&1; then
    candidate="$(apt-cache policy "postgresql-$PG_VERSION" 2>/dev/null | awk '/Candidate:/ {print $2}')"
    if [ -z "$candidate" ] || [ "$candidate" = "(none)" ]; then
      info "no postgresql-$PG_VERSION in the Debian repositories; adding the PGDG apt repository"
      apt-get install -y -qq postgresql-common
      /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
    fi
    apt-get install -y -qq "postgresql-$PG_VERSION" "postgresql-client-$PG_VERSION"
  fi
  systemctl enable --now postgresql >/dev/null 2>&1 || true
  # Sized for the 1 vCPU / ~1 GB droplet. Raise on a bigger machine. Listens on localhost only (Debian default).
  PGCONF_DIR="/etc/postgresql/$PG_VERSION/main/conf.d"
  if [ -d "$PGCONF_DIR" ]; then
    cat > /tmp/hcmus-pg.conf <<'PGEOF'
# Managed by HCMUS server-bootstrap.sh
shared_buffers = 128MB
effective_cache_size = 384MB
work_mem = 4MB
maintenance_work_mem = 64MB
max_connections = 50
log_min_duration_statement = 1000
PGEOF
    CHANGED=0
    install_file /tmp/hcmus-pg.conf "$PGCONF_DIR/hcmus-support.conf" 0644
    rm -f /tmp/hcmus-pg.conf
    if [ "$CHANGED" -eq 1 ]; then systemctl restart postgresql; fi
  fi

  log "5. Database role, database, env file"
  pgsql() { runuser -u postgres -- psql -X -q -v ON_ERROR_STOP=1 "$@"; }
  ROLE_EXISTS="$(pgsql -d postgres -Atc "SELECT 1 FROM pg_roles WHERE rolname = '$DB_USER'")"
  ENV_EXISTS=0; [ -f "$ENV_FILE" ] && ENV_EXISTS=1
  DB_PASSWORD=""
  if [ -z "$ROLE_EXISTS" ] || [ "$ENV_EXISTS" -eq 0 ]; then
    DB_PASSWORD="${HCMUS_DB_PASSWORD:-}"
    if [ -z "$DB_PASSWORD" ] && [ -t 0 ]; then
      read -r -s -p "    Password for database role $DB_USER (blank = generate a random one): " DB_PASSWORD; echo
    fi
    if [ -z "$DB_PASSWORD" ]; then
      DB_PASSWORD="$(openssl rand -hex 24)"
      info "generated a random password (stored only in $ENV_FILE)"
    fi
    # Restricted so it can be embedded in a systemd env file and a Npgsql connection string unescaped.
    [[ "$DB_PASSWORD" =~ ^[A-Za-z0-9._~+=-]{16,}$ ]] \
      || die "password must be 16+ characters from A-Z a-z 0-9 . _ ~ + = - (or leave blank to generate one)"
  fi

  # The password goes to psql on stdin (never on a command line).
  {
    echo "\\set u '$DB_USER'"
    echo "\\set d '$DB_NAME'"
    echo "\\set pw '$DB_PASSWORD'"
    cat <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'u', :'pw')
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'u') \gexec
SQL
    # Role already there but we are (re)writing the env file: make the password match it.
    if [ -n "$ROLE_EXISTS" ] && [ "$ENV_EXISTS" -eq 0 ]; then
      echo "SELECT format('ALTER ROLE %I PASSWORD %L', :'u', :'pw') \\gexec"
    fi
    cat <<'SQL'
SELECT format('CREATE DATABASE %I OWNER %I ENCODING %L', :'d', :'u', 'UTF8')
  WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'d') \gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'d') \gexec
SQL
  } | pgsql -d postgres
  # Trusted-in-spirit extensions the schema uses; created here by the superuser so migrations never need one.
  for ext in citext unaccent pg_trgm pgcrypto; do
    pgsql -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS $ext"
  done
  info "database $DB_NAME (owner $DB_USER) ready"

  if [ "$ENV_EXISTS" -eq 0 ]; then
    conn="Host=127.0.0.1;Port=5432;Database=$DB_NAME;Username=$DB_USER;Password=$DB_PASSWORD"
    tpl="$(cat "$DEPLOY_DIR/env.example")"
    umask 027
    printf '%s\n' "${tpl//__CONNECTION_STRING__/$conn}" > "$ENV_FILE"
    chown "root:$APP_USER" "$ENV_FILE"; chmod 0640 "$ENV_FILE"
    info "wrote $ENV_FILE (edit it to add Auth__Google__ClientId/ClientSecret and Admin__BootstrapEmails__0)"
  else
    info "$ENV_FILE already exists - left untouched"
  fi
  DB_PASSWORD=""
else
  log "4./5. PostgreSQL skipped (--skip-postgres)"
fi

# ---------------------------------------------------------------------------------------------
log "6. systemd units, journald cap, scripts"
install_file "$DEPLOY_DIR/scripts/backup.sh"  "$APP_ROOT/bin/backup.sh"  0750
install_file "$DEPLOY_DIR/scripts/restore.sh" "$APP_ROOT/bin/restore.sh" 0750
CHANGED=0
install_file "$DEPLOY_DIR/systemd/hcmus-support.service"        /etc/systemd/system/hcmus-support.service        0644
install_file "$DEPLOY_DIR/systemd/hcmus-support-backup.service" /etc/systemd/system/hcmus-support-backup.service 0644
install_file "$DEPLOY_DIR/systemd/hcmus-support-backup.timer"   /etc/systemd/system/hcmus-support-backup.timer   0644
if [ "$CHANGED" -eq 1 ]; then systemctl daemon-reload; fi
CHANGED=0
install_file "$DEPLOY_DIR/journald/hcmus-support.conf" /etc/systemd/journald.conf.d/hcmus-support.conf 0644
if [ "$CHANGED" -eq 1 ]; then
  systemctl restart systemd-journald
  journalctl --vacuum-size=500M >/dev/null 2>&1 || true
fi
systemctl enable hcmus-support.service >/dev/null 2>&1   # starts after the first deploy (deploy.ps1 restarts it)
systemctl enable --now hcmus-support-backup.timer >/dev/null 2>&1
info "hcmus-support.service enabled (not started: nothing is deployed yet); backup timer enabled"
systemctl list-timers hcmus-support-backup.timer --no-pager | sed 's/^/    /'

# ---------------------------------------------------------------------------------------------
if [ "$SKIP_NGINX" -eq 0 ]; then
  log "7. nginx and TLS"
  apt-get install -y -qq nginx certbot
  NGINX_VER="$(nginx -v 2>&1 | sed -n 's|.*nginx/\([0-9.]*\).*|\1|p')"

  # Other enabled sites that claim this domain (the v1 site) would conflict with ours.
  conflicts=()
  for f in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do
    [ -e "$f" ] || continue
    [ "$(basename "$f")" = "$SITE_NAME" ] && continue
    case "$(basename "$f")" in hcmus-acme-bootstrap.conf) continue ;; esac
    if grep -qE "server_name[^;]*[[:space:]]$DOMAIN" "$f" 2>/dev/null; then conflicts+=("$f"); fi
  done
  if [ "${#conflicts[@]}" -gt 0 ]; then
    if [ "$DISABLE_OLD" -eq 1 ]; then
      install -d -m 0755 /etc/nginx/disabled-sites
      for f in "${conflicts[@]}"; do
        mv -- "$(readlink -f "$f")" "/etc/nginx/disabled-sites/$(basename "$f").$(date +%Y%m%d%H%M%S)" 2>/dev/null || true
        rm -f -- "$f"
        info "moved old site $f to /etc/nginx/disabled-sites/"
      done
    else
      printf '    %s\n' "${conflicts[@]}"
      die "other nginx sites claim $DOMAIN (listed above). Back them up (OPERATIONS.md section 1), then re-run with --disable-old-site."
    fi
  fi
  rm -f /etc/nginx/sites-enabled/default

  cert_dir="/etc/letsencrypt/live/$DOMAIN"
  cert_ok=0
  if [ -f "$cert_dir/fullchain.pem" ] && [ -f "$cert_dir/privkey.pem" ]; then
    san="$(openssl x509 -in "$cert_dir/fullchain.pem" -noout -ext subjectAltName 2>/dev/null || true)"
    if grep -q "DNS:$DOMAIN" <<<"$san" && grep -q "DNS:www.$DOMAIN" <<<"$san"; then cert_ok=1; fi
  fi

  if [ "$cert_ok" -eq 0 ]; then
    if [ "$AGREE_TOS" -eq 1 ]; then
      info "certificate for $DOMAIN + www.$DOMAIN missing or incomplete: issuing via HTTP-01"
      cat > /etc/nginx/conf.d/hcmus-acme-bootstrap.conf <<ACME
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name $DOMAIN www.$DOMAIN;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 404; }
}
ACME
      nginx -t && systemctl reload nginx
      email_args=(--register-unsafely-without-email)
      [ -n "$CERTBOT_EMAIL" ] && email_args=(--email "$CERTBOT_EMAIL")
      certbot certonly --webroot -w /var/www/certbot --expand --non-interactive --agree-tos "${email_args[@]}" \
        --cert-name "$DOMAIN" -d "$DOMAIN" -d "www.$DOMAIN" \
        --deploy-hook "systemctl reload nginx"
      rm -f /etc/nginx/conf.d/hcmus-acme-bootstrap.conf
      cert_ok=1
    else
      warn "no usable certificate for $DOMAIN + www.$DOMAIN in $cert_dir."
      warn "re-run with --agree-le-tos [--certbot-email you@hcmus.edu.vn] to have certbot issue it."
    fi
  fi
  install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
  printf '#!/bin/sh\nsystemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/hcmus-nginx-reload.sh
  chmod 0755 /etc/letsencrypt/renewal-hooks/deploy/hcmus-nginx-reload.sh

  if [ "$cert_ok" -eq 1 ]; then
    tmp_site="$(mktemp)"
    cp "$DEPLOY_DIR/nginx/support.hcmus.edu.vn.conf" "$tmp_site"
    # `http2 on;` needs nginx >= 1.25.1; older versions use the listen parameter.
    if [ "$(printf '%s\n1.25.1\n' "$NGINX_VER" | sort -V | head -n1)" != "1.25.1" ]; then
      info "nginx $NGINX_VER < 1.25.1: using 'listen ... ssl http2'"
      sed -i -e '/^[[:space:]]*http2 on;[[:space:]]*$/d' -e 's/^\([[:space:]]*listen\( \[::\]:\)\?443\) ssl;/\1 ssl http2;/' "$tmp_site"
    fi
    CHANGED=0
    install_file "$tmp_site" "/etc/nginx/sites-available/$SITE_NAME" 0644
    rm -f "$tmp_site"
    ln -sfn "/etc/nginx/sites-available/$SITE_NAME" "/etc/nginx/sites-enabled/$SITE_NAME"
    nginx -t
    systemctl enable nginx >/dev/null 2>&1
    systemctl reload nginx || systemctl restart nginx
    info "nginx site active for $DOMAIN (proxying to 127.0.0.1:5080; the app is not deployed yet, so expect 502 until deploy.ps1 has run)"
  else
    warn "nginx site NOT installed (no certificate yet)."
  fi
else
  log "7. nginx skipped (--skip-nginx)"
fi

log "Bootstrap finished."
cat <<DONE
Next steps:
  - edit $ENV_FILE (Google client id/secret and anything else the app needs)
  - from the dev machine: .\\deploy\\deploy.ps1 -TargetHost $DOMAIN -SshUser <user>
  - then load initial data (docs/OPERATIONS.md section 3)
DONE
