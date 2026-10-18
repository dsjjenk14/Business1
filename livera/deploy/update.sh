#!/usr/bin/env bash
# Updates LIVERA to the newest commit of its branch. The database and settings stay as they are.
#
#   sudo livera-update             (installed by setup.sh; or run this file directly)
#   sudo livera-update --rebuild   (build and test again even if nothing changed)
#
# Steps: pull the branch into /opt/livera/src; back up the database; then run that commit's
# setup.sh with the settings saved at install time, which builds, runs the tests (and stops,
# keeping the running version, if they fail), installs npm packages, installs the new release
# and restarts the services. Players are disconnected for a few seconds and reconnect.
set -Eeuo pipefail

CONF=/etc/livera/deploy.conf
SRC=/opt/livera/src
die() {
  printf 'update: %s\n' "$*" >&2
  exit 1
}

REBUILD=()
for a in "$@"; do
  case "$a" in
    --rebuild) REBUILD=(--rebuild) ;;
    -h | --help)
      sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) die "unknown option: $a" ;;
  esac
done

[[ $EUID -eq 0 ]] || die "run it as root (sudo livera-update)"
[[ -f $CONF ]] || die "no $CONF: install with setup.sh first"
[[ -d $SRC/.git ]] || die "no git checkout at $SRC: install with setup.sh first"
# shellcheck disable=SC1090  # written by setup.sh with printf %q
BRANCH=$(source $CONF && printf '%s' "${BRANCH:-}")
[[ -n "$BRANCH" ]] || die "no BRANCH in $CONF"

if [[ -n "$(git -C $SRC status --porcelain --untracked-files=no)" ]]; then
  die "$SRC has local changes. It is a deploy copy: save them elsewhere, then 'git -C $SRC stash' and update again"
fi

echo "==> Fetching $BRANCH"
git -C $SRC fetch --depth 1 origin "$BRANCH"
old=$(git -C $SRC rev-parse --short=12 HEAD)
new=$(git -C $SRC rev-parse --short=12 FETCH_HEAD)
running=$(basename "$(readlink -f /opt/livera/current 2>/dev/null || echo none)")
if [[ "$old" == "$new" && "$running" == "$new" && ${#REBUILD[@]} -eq 0 ]]; then
  echo "Already up to date (commit $new)."
  exit 0
fi
echo "    running $running, newest $new"

if [[ -x /opt/livera/current/deploy/backup.sh ]]; then
  echo "==> Backing up the database first"
  runuser -u livera -- /opt/livera/current/deploy/backup.sh pre-update
fi

git -C $SRC checkout -q -B "$BRANCH" FETCH_HEAD
echo "==> Building, testing and installing $new (setup.sh from that commit)"
LIVERA_SETUP_FROM_SRC=1 exec bash $SRC/livera/deploy/setup.sh --skip-fetch "${REBUILD[@]}"
