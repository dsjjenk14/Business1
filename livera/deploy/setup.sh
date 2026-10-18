#!/usr/bin/env bash
# LIVERA: one-command install on a fresh Ubuntu 24.04 LTS server. Run as root:
#
#   curl -fsSL https://raw.githubusercontent.com/dsjjenk14/Business1/claude/livera-foundation-g8w2cv/livera/deploy/setup.sh \
#     | bash -s -- --domain play.example.com --email you@example.com
#
# Leave out --domain to use <your-ip-with-dashes>.sslip.io (free, works at once, no DNS needed).
# Safe to run again: every step checks what is already there. update.sh runs it after pulling.
#
# What it does: swap if RAM is small; build tools, SQLite, OpenSSL, Node.js LTS and Caddy; a
# `livera` system user; clones the repo to /opt/livera/src; builds the server (Release) and refuses
# to go on if livera_tests fails; installs a release under /opt/livera/releases (current -> newest);
# the database at /var/lib/livera/world.db; script accounts for the town director with generated
# passwords in /etc/livera/director.env; systemd services (server, gateway, director, nightly
# backup); Caddy with automatic HTTPS for the site; UFW allowing only SSH, 80 and 443.
#
# Options:
#   --domain NAME        your domain (its A record must point at this server). Default: <ip>.sslip.io
#   --email ADDRESS      for Let's Encrypt expiry notices (recommended)
#   --branch NAME        git branch (default: claude/livera-foundation-g8w2cv)
#   --repo URL           git repository (default: https://github.com/dsjjenk14/Business1.git)
#   --ip ADDRESS         this server's public IPv4, if detection gets it wrong (only for sslip.io)
#   --max-players N      people in the world at once (default 16)
#   --no-director        don't run the town director (scripted founders)
#   --node-major N       Node.js major version from NodeSource (default 24, an LTS line)
#   --skip-fetch         use /opt/livera/src as it is (update.sh has already pulled)
#   --rebuild            build and test again even if this commit is already installed
#   --help
set -Eeuo pipefail
umask 022

REPO_DEFAULT="https://github.com/dsjjenk14/Business1.git"
BRANCH_DEFAULT="claude/livera-foundation-g8w2cv"
PREFIX=/opt/livera
SRC=$PREFIX/src
LIVERA=$SRC/livera
STATE=/var/lib/livera
CONF=/etc/livera
APT=(apt-get -y -q -o DPkg::Lock::Timeout=600 -o Dpkg::Options::=--force-confold)
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a

DOMAIN="" EMAIL="" BRANCH="" REPO="" IP="" MAX_PLAYERS="" DIRECTOR="" NODE_MAJOR=24 SKIP_FETCH=0 REBUILD=0

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
note() { printf '    %s\n' "$*"; }
warn() { printf '\033[33mWARNING: %s\033[0m\n' "$*" >&2; }
die() {
  printf '\033[31mERROR: %s\033[0m\n' "$*" >&2
  exit 1
}
on_error() {
  printf '\033[31msetup.sh stopped at line %s. Nothing after that step was changed; fix the problem and run it again (it is safe to re-run).\033[0m\n' "$1" >&2
}

usage() { sed -n '2,31p' "${BASH_SOURCE[0]:-$0}" 2>/dev/null | sed 's/^# \{0,1\}//' || true; }

# Everything runs inside main, called on the last line: with `curl | bash` the whole script is
# read before anything runs, so a cut-off download runs nothing and no command eats the script.
main() {
trap 'on_error $LINENO' ERR
ORIG_ARGS=("$@")
while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN=${2:?--domain needs a value}; shift 2 ;;
    --email) EMAIL=${2:?--email needs a value}; shift 2 ;;
    --branch) BRANCH=${2:?--branch needs a value}; shift 2 ;;
    --repo) REPO=${2:?--repo needs a value}; shift 2 ;;
    --ip) IP=${2:?--ip needs a value}; shift 2 ;;
    --max-players) MAX_PLAYERS=${2:?--max-players needs a value}; shift 2 ;;
    --no-director) DIRECTOR=no; shift ;;
    --node-major) NODE_MAJOR=${2:?--node-major needs a value}; shift 2 ;;
    --skip-fetch) SKIP_FETCH=1; shift ;;
    --rebuild) REBUILD=1; shift ;;
    -h | --help) usage; exit 0 ;;
    *) die "unknown option: $1 (try --help)" ;;
  esac
done

# Settings from an earlier run fill in whatever this run leaves out, so a re-run (or update.sh)
# keeps the same site, branch and choices.
if [[ -f $CONF/deploy.conf ]]; then
  # shellcheck disable=SC1090  # our own file, written with printf %q
  source <(grep -E '^(DOMAIN|EMAIL|BRANCH|REPO|IP|MAX_PLAYERS|DIRECTOR)=' $CONF/deploy.conf | sed 's/^/SAVED_/')
fi
DOMAIN=${DOMAIN:-${SAVED_DOMAIN:-}}
EMAIL=${EMAIL:-${SAVED_EMAIL:-}}
BRANCH=${BRANCH:-${SAVED_BRANCH:-$BRANCH_DEFAULT}}
REPO=${REPO:-${SAVED_REPO:-$REPO_DEFAULT}}
IP=${IP:-${SAVED_IP:-}}
MAX_PLAYERS=${MAX_PLAYERS:-${SAVED_MAX_PLAYERS:-16}}
DIRECTOR=${DIRECTOR:-${SAVED_DIRECTOR:-yes}}

# ------------------------------------------------------------------------------------- checks
[[ $EUID -eq 0 ]] || die "run as root (for example: sudo bash setup.sh ...)"
[[ -r /etc/os-release ]] || die "can't tell which Linux this is"
# shellcheck disable=SC1091
. /etc/os-release
[[ "${ID:-}" == ubuntu ]] || die "this script is for Ubuntu 24.04 LTS (found ${PRETTY_NAME:-unknown})"
[[ "${VERSION_ID:-}" == 24.04 ]] || warn "written and checked for Ubuntu 24.04; this is ${PRETTY_NAME:-unknown}. Carrying on."
[[ "$(dpkg --print-architecture)" == amd64 || "$(dpkg --print-architecture)" == arm64 ]] ||
  die "needs an amd64 or arm64 server"
if [[ -n "$DOMAIN" ]]; then
  DOMAIN=${DOMAIN#http://}
  DOMAIN=${DOMAIN#https://}
  DOMAIN=${DOMAIN%%/*}
  DOMAIN=${DOMAIN,,}
  [[ "$DOMAIN" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] ||
    die "--domain should look like play.example.com (got '$DOMAIN')"
fi
[[ -z "$EMAIL" || "$EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || die "--email doesn't look like an address"
[[ "$MAX_PLAYERS" =~ ^[0-9]+$ && "$MAX_PLAYERS" -ge 1 && "$MAX_PLAYERS" -le 256 ]] || die "--max-players must be 1-256"
[[ "$NODE_MAJOR" =~ ^[0-9]+$ ]] || die "--node-major must be a number"
[[ "$BRANCH" =~ ^[A-Za-z0-9._/-]+$ ]] || die "--branch has unexpected characters"

# ------------------------------------------------------------------------------------- swap
mem_mb=$(awk '/^MemTotal:/ {print int($2/1024)}' /proc/meminfo)
swap_mb=$(awk '/^SwapTotal:/ {print int($2/1024)}' /proc/meminfo)
if [[ $mem_mb -lt 3000 && $swap_mb -lt 1000 ]]; then
  say "Adding a 2 GB swap file (this server has ${mem_mb} MB of RAM; the C++ build needs about 2 GB)"
  if [[ ! -f /swapfile ]]; then
    fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
  fi
  swapon /swapfile 2>/dev/null || true
  grep -qE '^/swapfile\s' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
  swap_mb=$(awk '/^SwapTotal:/ {print int($2/1024)}' /proc/meminfo)
fi

# ------------------------------------------------------------------------------------- packages
say "Installing build tools, SQLite, OpenSSL, git and the firewall"
"${APT[@]}" update
"${APT[@]}" install build-essential cmake ninja-build pkg-config libsqlite3-dev libssl-dev nlohmann-json3-dev \
  sqlite3 git ufw curl ca-certificates gnupg python3 iproute2 openssl debian-keyring debian-archive-keyring apt-transport-https

# ------------------------------------------------------------------------------------- source
if [[ $SKIP_FETCH -eq 0 ]]; then
  say "Fetching $BRANCH from $REPO into $SRC"
  mkdir -p $PREFIX
  if [[ -d $SRC/.git ]]; then
    if [[ -n "$(git -C $SRC status --porcelain --untracked-files=no)" ]]; then
      die "$SRC has local changes; this is a deploy copy, so move them elsewhere (git -C $SRC stash) and run again"
    fi
    git -C $SRC remote set-url origin "$REPO"
    git -C $SRC fetch --depth 1 origin "$BRANCH"
    git -C $SRC checkout -q -B "$BRANCH" FETCH_HEAD
  else
    # Only livera/ is checked out (the tests read its art references too); the rest of the
    # repository is another project.
    git clone --depth 1 --branch "$BRANCH" --filter=blob:none --sparse "$REPO" $SRC
  fi
  git -C $SRC sparse-checkout set --no-cone '/livera/'
fi
[[ -f $LIVERA/CMakeLists.txt ]] || die "no livera/ project in $SRC (wrong --repo or --branch?)"

# Run the deploy files from the checkout, so the script, units and templates are one version.
if [[ "${LIVERA_SETUP_FROM_SRC:-}" != 1 && -f $LIVERA/deploy/setup.sh ]]; then
  if ! cmp -s "${BASH_SOURCE[0]:-/dev/null}" $LIVERA/deploy/setup.sh; then
    note "continuing with the setup.sh from the checkout"
    LIVERA_SETUP_FROM_SRC=1 exec bash $LIVERA/deploy/setup.sh --skip-fetch "${ORIG_ARGS[@]}" </dev/null
  fi
fi
DEPLOY=$LIVERA/deploy
COMMIT=$(git -C $SRC rev-parse --short=12 HEAD)

# ------------------------------------------------------------------------------------- Node.js
node_ok() {
  command -v node >/dev/null && command -v npm >/dev/null &&
    [[ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -ge 18 ]]
}
if ! node_ok; then
  say "Installing Node.js $NODE_MAJOR (NodeSource)"
  install -d -m 0755 /etc/apt/keyrings
  if curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key |
    gpg --batch --yes --dearmor -o /etc/apt/keyrings/nodesource.gpg; then
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
      >/etc/apt/sources.list.d/nodesource.list
    if "${APT[@]}" update && "${APT[@]}" install nodejs; then
      :
    else
      warn "NodeSource didn't work; falling back to Ubuntu's nodejs"
      rm -f /etc/apt/sources.list.d/nodesource.list
      "${APT[@]}" update
    fi
  fi
  node_ok || "${APT[@]}" install nodejs npm
  node_ok || die "couldn't install Node.js 18 or newer"
fi
note "node $(node --version), npm $(npm --version)"

# ------------------------------------------------------------------------------------- Caddy
if ! command -v caddy >/dev/null; then
  say "Installing Caddy (official apt repository)"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' |
    gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' >/etc/apt/sources.list.d/caddy-stable.list
  chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
  "${APT[@]}" update
  "${APT[@]}" install caddy
fi
note "$(caddy version | head -1)"

# ------------------------------------------------------------------------------------- user and folders
say "Creating the livera user and folders"
if ! id livera >/dev/null 2>&1; then
  useradd --system --home-dir $STATE --no-create-home --shell /usr/sbin/nologin livera
fi
install -d -m 0750 -o livera -g livera $STATE $STATE/backups
install -d -m 0755 $PREFIX $PREFIX/releases
install -d -m 0750 -o root -g livera $CONF

# ------------------------------------------------------------------------------------- build and test
RELEASE=$PREFIX/releases/$COMMIT
if [[ -f $RELEASE/.complete && $REBUILD -eq 0 ]]; then
  say "Commit $COMMIT is already built, tested and installed"
else
  # Each compiler process can take ~1 GB here; more jobs than memory allows would swap for ages.
  jobs=$(((mem_mb + swap_mb) / 1500))
  [[ $jobs -lt 1 ]] && jobs=1
  [[ $jobs -gt $(nproc) ]] && jobs=$(nproc)
  say "Building the server (Release, $jobs parallel jobs; 5-20 minutes on a small server)"
  cmake -S $LIVERA -B $LIVERA/build-release -G Ninja -DCMAKE_BUILD_TYPE=Release >/dev/null
  cmake --build $LIVERA/build-release -j "$jobs"

  say "Running the tests (livera_tests)"
  if ! (cd $LIVERA/build-release && timeout 1800 ./livera_tests); then
    die "the tests failed on commit $COMMIT, so nothing was installed. The server keeps running the previous version (if any)."
  fi

  say "Installing release $COMMIT"
  rm -rf "$RELEASE.tmp"
  install -d -m 0755 "$RELEASE.tmp"/{bin,web,scripts}
  install -m 0755 $LIVERA/build-release/livera_server $LIVERA/build-release/livera_cli "$RELEASE.tmp/bin/"
  cp -a $LIVERA/data "$RELEASE.tmp/data"
  cp -a $LIVERA/web/client "$RELEASE.tmp/web/client"
  install -d -m 0755 "$RELEASE.tmp/web/gateway"
  install -m 0644 $LIVERA/web/gateway/gateway.mjs $LIVERA/web/gateway/package.json \
    $LIVERA/web/gateway/package-lock.json "$RELEASE.tmp/web/gateway/"
  install -m 0755 $LIVERA/scripts/town_director.py "$RELEASE.tmp/scripts/"
  cp -a $DEPLOY "$RELEASE.tmp/deploy"
  chmod 0755 "$RELEASE.tmp"/deploy/*.sh
  (cd "$RELEASE.tmp/web/gateway" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error)
  chmod -R u=rwX,go=rX "$RELEASE.tmp"
  echo "$COMMIT $(date -u +%FT%TZ)" >"$RELEASE.tmp/.complete"
  rm -rf "$RELEASE"
  mv "$RELEASE.tmp" "$RELEASE"
fi

# ------------------------------------------------------------------------------------- the site
detect_ip() {
  local ip
  ip=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") {print $(i + 1); exit}}')
  if [[ -z "$ip" || "$ip" =~ ^(10\.|127\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.) ]]; then
    ip=$(curl -4 -fsS --max-time 10 https://api.ipify.org || curl -4 -fsS --max-time 10 https://ifconfig.me || true)
  fi
  [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] && echo "$ip"
}
if [[ -n "$DOMAIN" ]]; then
  SITE=$DOMAIN
  public=$(detect_ip || true)
  resolved=$(getent ahostsv4 "$DOMAIN" | awk 'NR == 1 {print $1}' || true)
  if [[ -z "$resolved" ]]; then
    warn "$DOMAIN doesn't resolve yet. Add an A record pointing at ${public:-the IP of this server}; Caddy keeps trying and gets the certificate once it does."
  elif [[ -n "$public" && "$resolved" != "$public" ]]; then
    warn "$DOMAIN points at $resolved but this server looks like $public. Fix the A record, or HTTPS won't work."
  fi
else
  IP=${IP:-$(detect_ip || true)}
  [[ -n "$IP" ]] || die "couldn't find this server's public IPv4; pass --ip 1.2.3.4 or use --domain"
  SITE="${IP//./-}.sslip.io"
fi
ORIGIN="https://$SITE"

# ------------------------------------------------------------------------------------- settings
say "Writing settings in $CONF"
{
  echo "# Written by setup.sh. LIVERA_MAX_SCRIPTED caps the town director's characters."
  echo "LIVERA_MAX_PLAYERS=$MAX_PLAYERS"
  echo "LIVERA_MAX_SCRIPTED=16"
} >$CONF/server.env
echo "ALLOWED_ORIGINS=$ORIGIN" >$CONF/gateway.env
chmod 0640 $CONF/server.env $CONF/gateway.env
chgrp livera $CONF/server.env $CONF/gateway.env

# ------------------------------------------------------------------------------------- services
say "Installing the systemd services"
units_changed=0
for unit in livera-server.service livera-gateway.service livera-director.service livera-backup.service livera-backup.timer; do
  if ! cmp -s "$RELEASE/deploy/systemd/$unit" "/etc/systemd/system/$unit"; then
    install -m 0644 "$RELEASE/deploy/systemd/$unit" "/etc/systemd/system/$unit"
    units_changed=1
  fi
done
systemctl daemon-reload
touch $CONF/director.env
chown livera:livera $CONF/director.env
chmod 0600 $CONF/director.env

previous=""
[[ -L $PREFIX/current ]] && previous=$(readlink -f $PREFIX/current)
ln -sfn "$RELEASE" $PREFIX/current.new
mv -Tf $PREFIX/current.new $PREFIX/current
ln -sfn "$PREFIX/current/deploy/update.sh" /usr/local/sbin/livera-update
ln -sfn "$PREFIX/current/deploy/add_player.sh" /usr/local/sbin/livera-add-player
restart=0
[[ "$previous" != "$(readlink -f $PREFIX/current)" || $units_changed -eq 1 || $REBUILD -eq 1 ]] && restart=1
systemctl enable livera-server livera-gateway livera-backup.timer >/dev/null 2>&1
if [[ $restart -eq 1 ]]; then
  note "starting release $COMMIT${previous:+ (was $(basename "$previous"))}"
  systemctl restart livera-server livera-gateway
else
  systemctl start livera-server livera-gateway
fi
systemctl start livera-backup.timer

# ------------------------------------------------------------------------------------- script accounts
# After the new server has started: a new binary may migrate the database when it opens it, and
# that must never happen underneath the old server.
NEW_SERVER=$RELEASE/bin/livera_server
DB=$STATE/world.db
accounts_made=0
if [[ "$DIRECTOR" == yes ]]; then
  say "Script accounts for the town director (bot_<character>)"
  founders=$(python3 - "$RELEASE/data" <<'PY'
import glob, json, os, sys
for f in sorted(glob.glob(os.path.join(sys.argv[1], "characters", "*.json"))):
    for c in json.load(open(f, encoding="utf-8")).get("characters", []):
        if c.get("playable") and len("bot_" + c["id"]) <= 24:
            print(c["id"])
PY
  )
  for cid in $founders; do
    var="LIVERA_BOT_PASSWORD_$(echo "$cid" | tr '[:lower:]-' '[:upper:]_')"
    user="bot_${cid//-/_}"
    if grep -q "^$var=" $CONF/director.env; then
      continue # made on an earlier run
    fi
    pw=$(openssl rand -hex 24)
    if out=$(printf '%s\n' "$pw" | runuser -u livera -- "$NEW_SERVER" --db $DB --add-account "$user" 2>&1); then
      echo "$var=$pw" >>$CONF/director.env
      accounts_made=1
      note "made $user"
    elif grep -q username_taken <<<"$out"; then
      warn "$user already exists but its password isn't in $CONF/director.env, so the director can't play $cid."
    else
      die "couldn't make $user: $out"
    fi
  done
fi

if [[ "$DIRECTOR" == yes ]]; then
  systemctl enable livera-director >/dev/null 2>&1
  if [[ $restart -eq 1 || $accounts_made -eq 1 ]]; then systemctl restart livera-director; else systemctl start livera-director; fi
else
  systemctl disable --now livera-director >/dev/null 2>&1 || true
fi
# Keep the three newest releases (rollback: point /opt/livera/current at an older one and restart).
current_release=$(readlink -f $PREFIX/current)
find $PREFIX/releases -mindepth 1 -maxdepth 1 -type d ! -name '*.tmp' -printf '%T@ %p\n' | sort -rn | tail -n +4 |
  while read -r _ old; do if [[ "$old" != "$current_release" ]]; then rm -rf -- "$old"; fi; done

# ------------------------------------------------------------------------------------- Caddy
say "Configuring Caddy for $ORIGIN"
email_line="# no email given (setup.sh --email adds one)"
[[ -n "$EMAIL" ]] && email_line="email $EMAIL"
install -d -m 0755 /etc/caddy
[[ -f /etc/caddy/Caddyfile && ! -f /etc/caddy/Caddyfile.before-livera ]] &&
  cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.before-livera
sed -e "s|@EMAIL_LINE@|$email_line|" -e "s|@SITE@|$SITE|g" "$RELEASE/deploy/Caddyfile.in" >/etc/caddy/Caddyfile.new
caddy validate --adapter caddyfile --config /etc/caddy/Caddyfile.new >/dev/null 2>&1 ||
  die "the generated Caddyfile is invalid: caddy validate --config /etc/caddy/Caddyfile.new"
mv /etc/caddy/Caddyfile.new /etc/caddy/Caddyfile
systemctl enable caddy >/dev/null 2>&1
systemctl reload caddy 2>/dev/null || systemctl restart caddy

# ------------------------------------------------------------------------------------- firewall
say "Firewall: SSH, 80 and 443 only"
ssh_ports=$(sshd -T 2>/dev/null | awk '$1 == "port" {print $2}' | sort -u || true)
for p in ${ssh_ports:-22}; do ufw allow "$p/tcp" comment 'SSH' >/dev/null; done
ufw allow OpenSSH >/dev/null 2>&1 || true
ufw allow 80/tcp comment 'HTTP (certificates, redirect)' >/dev/null
ufw allow 443/tcp comment 'HTTPS' >/dev/null
ufw allow 443/udp comment 'HTTP/3' >/dev/null
ufw --force enable >/dev/null
ufw status | sed 's/^/    /'

# ------------------------------------------------------------------------------------- remember
{
  echo "# Written by setup.sh; update.sh and later runs reuse these."
  printf '%s=%q\n' DOMAIN "$DOMAIN" EMAIL "$EMAIL" BRANCH "$BRANCH" REPO "$REPO" IP "${IP:-}" \
    MAX_PLAYERS "$MAX_PLAYERS" DIRECTOR "$DIRECTOR" SITE "$SITE" COMMIT "$COMMIT"
} >$CONF/deploy.conf
chmod 0644 $CONF/deploy.conf

# ------------------------------------------------------------------------------------- check
say "Checking"
ok=1
for i in $(seq 1 30); do
  if (exec 3<>/dev/tcp/127.0.0.1/7777) 2>/dev/null && (exec 3<>/dev/tcp/127.0.0.1/8080) 2>/dev/null; then break; fi
  [[ $i -eq 30 ]] && ok=0
  sleep 1
done
services=(livera-server livera-gateway)
[[ "$DIRECTOR" == yes ]] && services+=(livera-director)
for s in "${services[@]}" caddy; do
  if systemctl is-active --quiet "$s"; then note "$s: running"; else
    note "$s: NOT running (journalctl -u $s -n 50)"
    ok=0
  fi
done
[[ $ok -eq 1 ]] || die "something didn't start; see the lines above"

cat <<EOF

LIVERA is installed (commit $COMMIT).

  Open:           $ORIGIN   (the first visit can take a minute while Caddy gets the certificate)
  Add a player:   livera-add-player USERNAME     (do this for yourself first)
  Update later:   livera-update
  Backups:        $STATE/backups (nightly, newest 14 kept)
  Logs:           journalctl -u livera-server -u livera-gateway -u livera-director -f
EOF
}

main "$@"
