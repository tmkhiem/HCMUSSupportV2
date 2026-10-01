#!/usr/bin/env bash
# HCMUS Support V2 restore: load a backup made by backup.sh into a target database (+ file store).
#
#   restore.sh --list
#   restore.sh --dump <file.db.dump> --target-db <name> [--files <file.files.tar.gz> --files-dir <dir>]
#              [--replace] [--force]
#
# Safe by default:
#   - the target database must NOT exist (use --replace to drop and recreate a non-live one);
#   - the LIVE database (BACKUP_DB_NAME, default hcmus_support) is refused unless --force is given,
#     and even then only while the hcmus-support service is stopped; a safety dump of the current
#     contents is taken first;
#   - files are extracted into --files-dir (never into the live store unless --force and no --files-dir).
#
# Restore drill (see docs/OPERATIONS.md):
#   restore.sh --dump /var/backups/hcmus-support/daily/<stamp>.db.dump --target-db hcmus_restore_test \
#              --files /var/backups/hcmus-support/daily/<stamp>.files.tar.gz --files-dir /tmp/hcmus-restore-files
#
# Environment: BACKUP_DB_NAME, BACKUP_FILES_DIR, BACKUP_ROOT, BACKUP_PG_OS_USER, APP_DB_ROLE (owner of
# restored objects, default hcmus_support), APP_SERVICE (default hcmus-support).
set -euo pipefail

DB_NAME="${BACKUP_DB_NAME:-hcmus_support}"
FILES_DIR="${BACKUP_FILES_DIR:-/var/lib/hcmus-support/files}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/hcmus-support}"
PG_OS_USER="${BACKUP_PG_OS_USER:-postgres}"
APP_ROLE="${APP_DB_ROLE:-hcmus_support}"
APP_SERVICE="${APP_SERVICE:-hcmus-support}"
APP_OS_USER="${APP_OS_USER:-hcmus-support}"

DUMP="" TARGET="" FILES="" FILES_TARGET="" FORCE=0 REPLACE=0 LIST=0

log() { printf '%s restore: %s\n' "$(date '+%F %T')" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }
usage() { sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    --dump) DUMP="${2:?}"; shift 2 ;;
    --target-db) TARGET="${2:?}"; shift 2 ;;
    --files) FILES="${2:?}"; shift 2 ;;
    --files-dir) FILES_TARGET="${2:?}"; shift 2 ;;
    --replace) REPLACE=1; shift ;;
    --force) FORCE=1; shift ;;
    --list) LIST=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

pg_run() {
  if [ "$(id -u)" -eq 0 ]; then runuser -u "$PG_OS_USER" -- "$@"; else "$@"; fi
}
psql_q() { pg_run psql -X -v ON_ERROR_STOP=1 -qAt "$@"; }

if [ "$LIST" -eq 1 ]; then
  for kind in daily weekly predeploy; do
    echo "== $BACKUP_ROOT/$kind"
    find "$BACKUP_ROOT/$kind" -maxdepth 1 -name '*.db.dump' 2>/dev/null | sort -r | while read -r f; do
      s="${f%.db.dump}"; printf '  %s  (%s)%s\n' "$f" "$(du -h "$f" | cut -f1)" "$([ -f "$s.files.tar.gz" ] && echo ' + files')"
    done
  done
  exit 0
fi

[ -n "$DUMP" ] && [ -n "$TARGET" ] || { usage >&2; exit 2; }
[ -f "$DUMP" ] || die "dump not found: $DUMP"
[ -z "$FILES" ] || [ -f "$FILES" ] || die "files archive not found: $FILES"
[[ "$TARGET" =~ ^[a-z_][a-z0-9_]*$ ]] || die "target db name must match [a-z_][a-z0-9_]*"
[ "$(id -u)" -eq 0 ] || die "run as root"

# Verify checksums if the .sha256 of the set is next to the dump.
base="${DUMP%.db.dump}"
if [ -f "$base.sha256" ]; then
  ( cd "$(dirname "$DUMP")" && sha256sum --check --ignore-missing "$(basename "$base").sha256" ) \
    || die "checksum verification failed"
else
  log "WARNING: no $(basename "$base").sha256 next to the dump; skipping checksum verification"
fi

pg_run pg_restore -l < "$DUMP" > /dev/null || die "pg_restore cannot read $DUMP"

LIVE=0
[ "$TARGET" = "$DB_NAME" ] && LIVE=1
if [ "$LIVE" -eq 1 ]; then
  [ "$FORCE" -eq 1 ] || die "$TARGET is the LIVE database; refusing without --force"
  if systemctl is-active --quiet "$APP_SERVICE"; then
    die "stop the service first: systemctl stop $APP_SERVICE"
  fi
fi

EXISTS="$(psql_q -d postgres -c "SELECT 1 FROM pg_database WHERE datname = '$TARGET'")"
if [ "$EXISTS" = "1" ]; then
  [ "$REPLACE" -eq 1 ] || [ "$LIVE" -eq 1 ] || die "database $TARGET already exists; use --replace to drop and recreate it"
  if [ "$LIVE" -eq 1 ]; then
    stamp="$(date '+%Y%m%dT%H%M%S')"
    mkdir -p "$BACKUP_ROOT"
    safety="$BACKUP_ROOT/pre-restore-$stamp.db.dump"
    log "safety dump of the current $TARGET -> $safety"
    umask 077
    pg_run pg_dump -Fc "$TARGET" > "$safety"
  fi
  log "dropping database $TARGET"
  psql_q -d postgres -c "DROP DATABASE \"$TARGET\" WITH (FORCE)"
fi

log "creating database $TARGET (owner $APP_ROLE)"
psql_q -d postgres -c "CREATE DATABASE \"$TARGET\" OWNER \"$APP_ROLE\" ENCODING 'UTF8'"
# Extensions need a superuser; the dump has CREATE EXTENSION IF NOT EXISTS, which then no-ops.
for ext in citext unaccent pg_trgm pgcrypto; do
  psql_q -d "$TARGET" -c "CREATE EXTENSION IF NOT EXISTS $ext"
done

log "restoring $DUMP into $TARGET (this can take a while)"
# --no-owner + --role: every object ends up owned by the app role regardless of who owned it in the dump.
# EXTENSION entries (and their COMMENTs) are skipped: they were created above by the superuser, and
# the app role may not comment on objects it does not own.
LIST_FILE="$(mktemp)"
trap 'rm -f -- "$LIST_FILE"' EXIT
pg_run pg_restore -l < "$DUMP" | grep -v ' EXTENSION ' > "$LIST_FILE" || true
chmod 644 "$LIST_FILE"
pg_run pg_restore --no-owner --role="$APP_ROLE" --exit-on-error --use-list="$LIST_FILE" -d "$TARGET" < "$DUMP"
log "database restored"

if [ -n "$FILES" ]; then
  if [ -z "$FILES_TARGET" ]; then
    [ "$LIVE" -eq 1 ] && [ "$FORCE" -eq 1 ] || die "--files needs --files-dir (the live store is only used with --force on the live db)"
    FILES_TARGET="$FILES_DIR"
  fi
  if [ -d "$FILES_TARGET" ] && [ -n "$(ls -A "$FILES_TARGET" 2>/dev/null)" ]; then
    aside="${FILES_TARGET%/}.pre-restore-$(date '+%Y%m%dT%H%M%S')"
    log "target $FILES_TARGET is not empty; moving it to $aside"
    mv -- "$FILES_TARGET" "$aside"
  fi
  mkdir -p "$FILES_TARGET"
  # The archive has one top-level directory (the basename of the original store).
  tar -xzf "$FILES" -C "$FILES_TARGET" --strip-components=1
  if [ "$FILES_TARGET" = "$FILES_DIR" ]; then
    chown -R "$APP_OS_USER:$APP_OS_USER" "$FILES_TARGET"
    chmod 750 "$FILES_TARGET"
  fi
  log "files restored into $FILES_TARGET"
fi

if [ "$LIVE" -eq 1 ]; then
  log "live database restored. Start the service when ready: systemctl start $APP_SERVICE"
else
  log "done. Inspect with: runuser -u $PG_OS_USER -- psql -d $TARGET ; drop when finished: runuser -u $PG_OS_USER -- dropdb $TARGET"
fi
