#!/usr/bin/env bash
# Server side of deploy.ps1. Runs as root (via sudo) on the target host. Do not run by hand unless
# you are following docs/OPERATIONS.md (rollback).
#
#   activate.sh --stamp <yyyyMMddHHmmss> --staging <dir> [--no-backup] [--keep N]
#       staging dir contains app.tgz (the dotnet publish output) and efbundle (EF migrations bundle).
#       1. unpack to /opt/hcmus-support/releases/<stamp>
#       2. pre-deploy backup (backup.sh --kind predeploy) unless --no-backup
#       3. run the migrations bundle with the connection string from /etc/hcmus-support/env
#       4. switch the /opt/hcmus-support/app symlink, restart the service
#       5. wait for http://127.0.0.1:5080/healthz; if it never turns healthy, roll the symlink back
#       6. prune old releases (keep N, default 5)
#       Prints PREVIOUS_RELEASE=<path> so the caller can roll back later.
#
#   activate.sh --rollback <release dir under /opt/hcmus-support/releases>
#       points the symlink at that release and restarts. Database migrations are NOT reverted:
#       every migration must stay compatible with the previous release (expand, then contract).
set -euo pipefail

ROOT="/opt/hcmus-support"
RELEASES="$ROOT/releases"
LINK="$ROOT/app"
SERVICE="hcmus-support"
APP_USER="hcmus-support"
ENV_FILE="/etc/hcmus-support/env"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:5080/healthz}"
HEALTH_WAIT="${HEALTH_WAIT:-60}"

STAMP="" STAGING="" ROLLBACK="" NO_BACKUP=0 KEEP=5
while [ $# -gt 0 ]; do
  case "$1" in
    --stamp) STAMP="${2:?}"; shift 2 ;;
    --staging) STAGING="${2:?}"; shift 2 ;;
    --rollback) ROLLBACK="${2:?}"; shift 2 ;;
    --no-backup) NO_BACKUP=1; shift ;;
    --keep) KEEP="${2:?}"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

log() { printf '%s activate: %s\n' "$(date '+%F %T')" "$*"; }
die() { log "ERROR: $*"; exit 1; }

[ "$(id -u)" -eq 0 ] || die "must run as root"

wait_healthy() {
  local i
  for ((i = 0; i < HEALTH_WAIT; i += 2)); do
    if curl -fsS -m 5 -o /dev/null "$HEALTH_URL" 2>/dev/null; then return 0; fi
    sleep 2
  done
  return 1
}

switch_to() {
  local target="$1"
  [ -d "$target" ] || die "release directory $target does not exist"
  ln -sfn "$target" "$LINK.new"
  mv -T "$LINK.new" "$LINK"
  systemctl restart "$SERVICE"
}

if [ -n "$ROLLBACK" ]; then
  target="$(readlink -f "$ROLLBACK")"
  case "$target" in "$RELEASES"/*) ;; *) die "rollback target must be under $RELEASES" ;; esac
  log "rolling back to $target"
  switch_to "$target"
  if wait_healthy; then log "rollback healthy"; exit 0; fi
  die "service is not healthy after rollback; check: journalctl -u $SERVICE -n 100"
fi

[[ "$STAMP" =~ ^[0-9]{14}$ ]] || die "--stamp must be yyyyMMddHHmmss"
[ -d "$STAGING" ] && [ -f "$STAGING/app.tgz" ] && [ -f "$STAGING/efbundle" ] || die "--staging must hold app.tgz and efbundle"
[ ! -e "$LINK" ] || [ -L "$LINK" ] || die "$LINK exists and is not a symlink; move it away first"

NEW="$RELEASES/$STAMP"
[ ! -e "$NEW" ] || die "release $NEW already exists"
PREVIOUS=""
[ -L "$LINK" ] && PREVIOUS="$(readlink -f "$LINK")"
echo "PREVIOUS_RELEASE=$PREVIOUS"

log "unpacking release $STAMP"
mkdir -p "$NEW"
tar -xzf "$STAGING/app.tgz" -C "$NEW"
[ -f "$NEW/HCMUSSupportV2.Backend.dll" ] || die "release has no HCMUSSupportV2.Backend.dll"
[ -f "$NEW/wwwroot/index.html" ] || die "release has no wwwroot/index.html (frontend was not built into the publish output)"
install -m 0755 "$STAGING/efbundle" "$NEW/efbundle"
# Keep a copy of this script for manual rollbacks (activate.sh --rollback ...).
install -m 0750 -o root -g root "$0" "$ROOT/bin/activate.sh.new" && mv -f "$ROOT/bin/activate.sh.new" "$ROOT/bin/activate.sh"
chown -R root:root "$NEW"
chmod -R u=rwX,go=rX "$NEW"

if [ "$NO_BACKUP" -eq 0 ] && [ -x "$ROOT/bin/backup.sh" ]; then
  log "pre-deploy backup"
  "$ROOT/bin/backup.sh" --kind predeploy
fi

log "running migrations"
TMPX="$(mktemp -d)"
chown "$APP_USER" "$TMPX"
trap 'rm -rf -- "$TMPX"' EXIT
# The env file is KEY="value" lines; the connection string stays in the environment of this one process.
# shellcheck disable=SC2016  # the $-expressions are meant for the inner bash, not this one
runuser -u "$APP_USER" -- env DOTNET_BUNDLE_EXTRACT_BASE_DIR="$TMPX" ENV_FILE="$ENV_FILE" NEW="$NEW" bash -c '
  set -euo pipefail
  set -a; . "$ENV_FILE"; set +a
  : "${ConnectionStrings__Default:?ConnectionStrings__Default missing from $ENV_FILE}"
  exec "$NEW/efbundle" --connection "$ConnectionStrings__Default"
'

log "switching to $NEW"
switch_to "$NEW"
if wait_healthy; then
  log "healthy"
else
  log "NOT healthy after ${HEALTH_WAIT}s"
  if [ -n "$PREVIOUS" ]; then
    log "rolling back to $PREVIOUS"
    switch_to "$PREVIOUS"
    if wait_healthy; then log "previous release is healthy again"; else log "previous release is NOT healthy either"; fi
  fi
  journalctl -u "$SERVICE" -n 40 --no-pager || true
  exit 1
fi

# Prune: keep the newest $KEEP releases, never the current or previous one.
CURRENT="$(readlink -f "$LINK")"
count=0
while IFS= read -r rel; do
  count=$((count + 1))
  [ "$count" -le "$KEEP" ] && continue
  [ "$rel" = "$CURRENT" ] || [ "$rel" = "$PREVIOUS" ] && continue
  log "removing old release $rel"
  rm -rf -- "$rel"
done < <(find "$RELEASES" -mindepth 1 -maxdepth 1 -type d -regextype posix-extended -regex '.*/[0-9]{14}' | sort -r)
log "done"
