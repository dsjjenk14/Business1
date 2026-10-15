#!/usr/bin/env bash
# Runs the founding vertical slice end to end with the real server and two headless
# clients, restarts the server, and reconnects. Usage: scripts/demo_slice.sh [build-dir]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="${1:-$ROOT/build}"
WORK="$(mktemp -d)"
PORT="${LIVERA_PORT:-7791}"
DB="$WORK/demo_world.db"
trap 'kill $SERVER 2>/dev/null || true; rm -rf "$WORK"' EXIT

start_server() {
  "$BUILD/livera_server" --data "$ROOT/data" --db "$DB" --port "$PORT" --dev 2>>"$WORK/server.log" &
  SERVER=$!
  for _ in $(seq 50); do (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null && return; sleep 0.1; done
  echo "server did not start"; cat "$WORK/server.log"; exit 1
}

start_server
echo "=== Day 1: two players, one server ==="
"$BUILD/livera_cli" --port "$PORT" --script "$ROOT/scripts/demo/dominique_day1.txt" > "$WORK/dom.out" &
DOM=$!
sleep 1
"$BUILD/livera_cli" --port "$PORT" --script "$ROOT/scripts/demo/jaxon_day1.txt" > "$WORK/jax.out" &
JAX=$!
STATUS=0
wait $DOM || STATUS=1
wait $JAX || STATUS=1
echo "--- Dominique ---"; cat "$WORK/dom.out"
echo "--- Jaxon ---"; cat "$WORK/jax.out"

echo "=== Restarting the server ==="
kill -INT $SERVER; wait $SERVER || true
start_server
"$BUILD/livera_cli" --port "$PORT" --script "$ROOT/scripts/demo/dominique_returns.txt" || STATUS=1
kill -INT $SERVER; wait $SERVER || true
echo "--- Server log ---"; cat "$WORK/server.log"
exit $STATUS
