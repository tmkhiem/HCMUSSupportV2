#!/usr/bin/env bash
# HCMUS Support V2 backup: pg_dump (custom format) of the app database + tar.gz of the file store.
#
#   backup.sh [--kind daily|predeploy]
#
# daily      (default) -> $BACKUP_ROOT/daily, keep 14; on Sundays also a copy in weekly, keep 8;
#                         then an optional off-box copy with rclone if BACKUP_REMOTE is set.
# predeploy            -> $BACKUP_ROOT/predeploy, keep 5, no weekly, no off-box copy (used by deploys).
#
# Each backup is a set of three files sharing a UTC-less local timestamp:
#   <stamp>.db.dump   <stamp>.files.tar.gz   <stamp>.sha256
#
# Runs as root (systemd unit) so it can read the file store and `runuser` into the postgres OS user
# (peer authentication: no database password is needed or stored). Configuration via environment
# (the systemd unit loads /etc/hcmus-support/backup.env if present):
#   BACKUP_DB_NAME      database to dump                 (default hcmus_support)
#   BACKUP_FILES_DIR    file store directory             (default /var/lib/hcmus-support/files)
#   BACKUP_ROOT         where backups go                 (default /var/backups/hcmus-support)
#   BACKUP_KEEP_DAILY   daily sets to keep               (default 14)
#   BACKUP_KEEP_WEEKLY  weekly sets to keep              (default 8)
#   BACKUP_WEEKLY_DOW   ISO weekday that is also kept weekly, 1=Mon..7=Sun (default 7)
#   BACKUP_PG_OS_USER   OS user that owns the cluster    (default postgres)
#   BACKUP_REMOTE       rclone destination, e.g. offbox:hcmus-support-backups (empty = skip)
set -euo pipefail

KIND="daily"
while [ $# -gt 0 ]; do
  case "$1" in
    --kind) KIND="${2:?--kind needs a value}"; shift 2 ;;
    -h|--help) sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
case "$KIND" in daily|predeploy) ;; *) echo "--kind must be daily or predeploy" >&2; exit 2 ;; esac

DB_NAME="${BACKUP_DB_NAME:-hcmus_support}"
FILES_DIR="${BACKUP_FILES_DIR:-/var/lib/hcmus-support/files}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/hcmus-support}"
KEEP_DAILY="${BACKUP_KEEP_DAILY:-14}"
KEEP_WEEKLY="${BACKUP_KEEP_WEEKLY:-8}"
KEEP_PREDEPLOY=5
WEEKLY_DOW="${BACKUP_WEEKLY_DOW:-7}"
PG_OS_USER="${BACKUP_PG_OS_USER:-postgres}"
BACKUP_REMOTE="${BACKUP_REMOTE:-}"

log() { printf '%s backup[%s]: %s\n' "$(date '+%F %T')" "$KIND" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

umask 077

# Run a command as the postgres OS user when we are root, otherwise as ourselves.
pg_run() {
  if [ "$(id -u)" -eq 0 ]; then runuser -u "$PG_OS_USER" -- "$@"; else "$@"; fi
}

# Keep the newest $2 sets in directory $1, delete the rest (a set = all files with the same stamp).
prune() {
  local dir="$1" keep="$2" dump stamp
  [ -d "$dir" ] || return 0
  # Names sort chronologically because the stamp is YYYYmmddTHHMMSS.
  while IFS= read -r dump; do
    stamp="$(basename "$dump" .db.dump)"
    log "pruning $dir/$stamp.*"
    rm -f -- "$dir/$stamp.db.dump" "$dir/$stamp.files.tar.gz" "$dir/$stamp.sha256"
  done < <(find "$dir" -maxdepth 1 -name '*.db.dump' -printf '%f\n' | sort -r | tail -n "+$((keep + 1))" | sed "s|^|$dir/|")
}

command -v pg_dump >/dev/null || die "pg_dump not found (install postgresql-client-17)"
[ -d "$FILES_DIR" ] || die "file store $FILES_DIR does not exist"

mkdir -p "$BACKUP_ROOT/$KIND"
[ "$KIND" = daily ] && mkdir -p "$BACKUP_ROOT/weekly"
chmod 700 "$BACKUP_ROOT"

# One backup at a time (timer + a manual run, or a deploy).
exec 9>"$BACKUP_ROOT/.lock"
flock -n 9 || die "another backup is running"

STAMP="$(date '+%Y%m%dT%H%M%S')"
DEST="$BACKUP_ROOT/$KIND"
DUMP="$DEST/$STAMP.db.dump"
FILES="$DEST/$STAMP.files.tar.gz"
SUMS="$DEST/$STAMP.sha256"

# shellcheck disable=SC2329  # invoked via trap
cleanup_partial() { rm -f -- "$DUMP.partial" "$FILES.partial" "$SUMS.partial"; }
trap cleanup_partial EXIT

log "start: db=$DB_NAME files=$FILES_DIR -> $DEST/$STAMP.*"

# 1. Database. -Fc = custom format (compressed, selective restore with pg_restore).
pg_run pg_dump -Fc --no-password "$DB_NAME" > "$DUMP.partial"
# A dump that pg_restore cannot read is not a backup.
pg_run pg_restore -l < "$DUMP.partial" > /dev/null || die "dump failed verification"
mv -- "$DUMP.partial" "$DUMP"
log "database dumped: $(du -h "$DUMP" | cut -f1)"

# 2. File store. Exit status 1 from tar means "a file changed while being read": acceptable for
#    an append-mostly store (files are keyed by uuid and never rewritten).
tar_rc=0
tar -C "$(dirname "$FILES_DIR")" -czf "$FILES.partial" "$(basename "$FILES_DIR")" || tar_rc=$?
if [ "$tar_rc" -gt 1 ]; then die "tar failed with status $tar_rc"; fi
[ "$tar_rc" -eq 1 ] && log "WARNING: some files changed while being archived"
mv -- "$FILES.partial" "$FILES"
log "file store archived: $(du -h "$FILES" | cut -f1)"

# 3. Checksums (basenames, so `sha256sum -c` works from the directory).
( cd "$DEST" && sha256sum "$STAMP.db.dump" "$STAMP.files.tar.gz" > "$SUMS.partial" )
mv -- "$SUMS.partial" "$SUMS"

# 4. Weekly copy (hard links when possible: no extra space) + retention.
case "$KIND" in
  daily)
    if [ "$(date +%u)" = "$WEEKLY_DOW" ]; then
      for f in "$DUMP" "$FILES" "$SUMS"; do
        ln -f -- "$f" "$BACKUP_ROOT/weekly/" 2>/dev/null || cp -p -- "$f" "$BACKUP_ROOT/weekly/"
      done
      log "weekly copy kept"
    fi
    prune "$BACKUP_ROOT/daily" "$KEEP_DAILY"
    prune "$BACKUP_ROOT/weekly" "$KEEP_WEEKLY"
    ;;
  predeploy)
    prune "$BACKUP_ROOT/predeploy" "$KEEP_PREDEPLOY"
    ;;
esac

# 5. Optional off-box copy. A failure here does not undo the local backup but fails the run so the
#    unit shows as failed in `systemctl --failed`. Remote retention is the remote's own lifecycle.
rc=0
if [ "$KIND" = daily ] && [ -n "$BACKUP_REMOTE" ]; then
  if ! command -v rclone >/dev/null; then
    log "ERROR: BACKUP_REMOTE is set but rclone is not installed"; rc=1
  else
    for f in "$DUMP" "$FILES" "$SUMS"; do
      if ! rclone copyto "$f" "${BACKUP_REMOTE%/}/daily/$(basename "$f")" --retries 3 --low-level-retries 5; then
        log "ERROR: rclone copy of $(basename "$f") to $BACKUP_REMOTE failed"; rc=1
      fi
    done
    [ "$rc" -eq 0 ] && log "off-box copy done: $BACKUP_REMOTE"
  fi
fi

log "done (status $rc)"
exit "$rc"
