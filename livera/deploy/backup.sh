#!/usr/bin/env bash
# LIVERA database backup. Run nightly by livera-backup.timer (as the livera user), and by
# update.sh before every update. Uses SQLite's online backup, which is safe while the server runs.
#
#   backup.sh [nightly|pre-update|manual]
#
# Writes /var/lib/livera/backups/world-YYYYMMDD-HHMMSS[-KIND].db.gz after checking the copy with
# PRAGMA integrity_check. Keeps the newest 14 nightly backups and the newest 5 of each other kind.
set -euo pipefail

DB=${LIVERA_DB:-/var/lib/livera/world.db}
DIR=${LIVERA_BACKUP_DIR:-/var/lib/livera/backups}
KIND=${1:-manual}
case "$KIND" in
  nightly | pre-update | manual) ;;
  *)
    echo "usage: $0 [nightly|pre-update|manual]" >&2
    exit 2
    ;;
esac

if [[ ! -f "$DB" ]]; then
  echo "no database at $DB yet; nothing to back up"
  exit 0
fi
mkdir -p "$DIR"
stamp=$(date -u +%Y%m%d-%H%M%S)
suffix=""
[[ "$KIND" != nightly ]] && suffix="-$KIND"
out="$DIR/world-$stamp$suffix.db"
tmp="$out.partial"
trap 'rm -f "$tmp"' EXIT

# .timeout waits for the server's write lock instead of failing at once.
sqlite3 "$DB" ".timeout 20000" ".backup '$tmp'"
check=$(sqlite3 "$tmp" "PRAGMA integrity_check;")
if [[ "$check" != "ok" ]]; then
  echo "backup failed its integrity check: $check" >&2
  exit 1
fi
mv "$tmp" "$out"
gzip -9 "$out"
echo "backed up $DB to $out.gz ($(du -h "$out.gz" | cut -f1))"

prune() { # prune GLOB KEEP: delete all but the newest KEEP files matching GLOB
  local glob=$1 keep=$2
  # The names sort by time (UTC stamps), so a reverse name sort is newest first.
  find "$DIR" -maxdepth 1 -type f -name "$glob" -printf '%f\n' | sort -r | tail -n +"$((keep + 1))" |
    while read -r old; do rm -f -- "${DIR:?}/$old"; done
}
prune 'world-????????-??????.db.gz' 14
prune 'world-????????-??????-pre-update.db.gz' 5
prune 'world-????????-??????-manual.db.gz' 5
