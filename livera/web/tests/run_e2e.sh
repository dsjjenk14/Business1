#!/usr/bin/env bash
# End-to-end tests for the web client: a fresh game server, the gateway serving the client,
# and Playwright (Chromium) playing it at phone and desktop sizes. The gateway's connection caps
# are checked first (web/gateway/test_gateway.mjs).
#
#   livera/web/tests/run_e2e.sh
#
# Env:
#   LIVERA_SERVER   server binary (default: livera/build/livera_server)
#   LIVERA_E2E_DIR  where the temporary world DB and logs go (default: a new mktemp -d)
#   LIVERA_SHOTS    where screenshots go (default: $LIVERA_E2E_DIR/shots)
#   LIVERA_E2E_PORT / GATEWAY_E2E_PORT   ports (default 17901 / 18901)
#   GATEWAY_DOWN_E2E_PORT / LIVERA_CLOSED_E2E_PORT   a second gateway whose game server port is
#                   closed, for the "server is down" test (default GATEWAY_E2E_PORT+1 / LIVERA_E2E_PORT+1)
# Needs Node 18+ and Playwright installed globally (NODE_PATH is set to `npm root -g`).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB="$(cd "$HERE/.." && pwd)"
LIVERA="$(cd "$WEB/.." && pwd)"
SERVER="${LIVERA_SERVER:-$LIVERA/build/livera_server}"
E2E_DIR="${LIVERA_E2E_DIR:-$(mktemp -d)}"
SHOTS="${LIVERA_SHOTS:-$E2E_DIR/shots}"
SPORT="${LIVERA_E2E_PORT:-17901}"
GPORT="${GATEWAY_E2E_PORT:-18901}"
DOWN_GPORT="${GATEWAY_DOWN_E2E_PORT:-$((GPORT + 1))}"
CLOSED_PORT="${LIVERA_CLOSED_E2E_PORT:-$((SPORT + 1))}"

[ -x "$SERVER" ] || { echo "no server binary at $SERVER (build livera, or set LIVERA_SERVER)" >&2; exit 2; }
[ -d "$WEB/gateway/node_modules/ws" ] || (cd "$WEB/gateway" && npm ci --no-audit --no-fund)
mkdir -p "$E2E_DIR" "$SHOTS"
DB="$E2E_DIR/e2e_world.db"
rm -f "$DB" "$DB-wal" "$DB-shm"

PIDS=()
# shellcheck disable=SC2329  # called by the trap below
cleanup() { for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null || true; done; wait 2>/dev/null || true; }
trap cleanup EXIT

"$SERVER" --data "$LIVERA/data" --db "$DB" --dev --port "$SPORT" > "$E2E_DIR/server.log" 2>&1 &
PIDS+=($!)
LIVERA_PORT="$SPORT" GATEWAY_PORT="$GPORT" STATIC_DIR="$WEB/client" node "$WEB/gateway/gateway.mjs" > "$E2E_DIR/gateway.log" 2>&1 &
PIDS+=($!)
# The same client through a gateway with no game server behind it (only if that port really is closed).
DOWN_URL=""
if ! (exec 3<>"/dev/tcp/127.0.0.1/$CLOSED_PORT") 2>/dev/null; then
  LIVERA_PORT="$CLOSED_PORT" GATEWAY_PORT="$DOWN_GPORT" STATIC_DIR="$WEB/client" node "$WEB/gateway/gateway.mjs" > "$E2E_DIR/gateway_down.log" 2>&1 &
  PIDS+=($!)
  DOWN_URL="http://127.0.0.1:$DOWN_GPORT/"
fi

for _ in $(seq 1 50); do
  if grep -q "listening" "$E2E_DIR/server.log" 2>/dev/null && grep -q "listening" "$E2E_DIR/gateway.log" 2>/dev/null; then break; fi
  sleep 0.2
done
grep -q "listening" "$E2E_DIR/server.log" || { echo "server didn't start:"; cat "$E2E_DIR/server.log"; exit 1; }
grep -q "listening" "$E2E_DIR/gateway.log" || { echo "gateway didn't start:"; cat "$E2E_DIR/gateway.log"; exit 1; }
if [ -n "$DOWN_URL" ]; then
  for _ in $(seq 1 25); do grep -q "listening" "$E2E_DIR/gateway_down.log" 2>/dev/null && break; sleep 0.2; done
  grep -q "listening" "$E2E_DIR/gateway_down.log" || DOWN_URL=""
fi

# A script account for the "played by a script" label (servers with --add-account; older ones skip).
BOT_USER=""
if printf 'e2e-bot-password\n' | "$SERVER" --db "$DB" --add-account bot_graham > "$E2E_DIR/add_account.log" 2>&1; then BOT_USER=bot_graham; fi

status=0
# The gateway's connection caps, against its own stand-in game server.
node "$WEB/gateway/test_gateway.mjs" || status=$?
NODE_PATH="$(npm root -g)" LIVERA_URL="http://127.0.0.1:$GPORT/" LIVERA_SHOTS="$SHOTS" LIVERA_TCP_PORT="$SPORT" \
  LIVERA_BOT_USER="$BOT_USER" LIVERA_BOT_PASSWORD="e2e-bot-password" LIVERA_DOWN_URL="$DOWN_URL" node "$HERE/e2e.js" || status=$?
echo "logs: $E2E_DIR (server.log, gateway.log) · screenshots: $SHOTS"
exit $status
