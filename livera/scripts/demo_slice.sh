#!/usr/bin/env bash
# Runs the founding vertical slice end to end with the real server and two headless
# clients, restarts the server, and reconnects. Usage: scripts/demo_slice.sh [build-dir]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$(cd "${1:-$ROOT/build}" && pwd)"
WORK="$(mktemp -d)"
cp "$ROOT/scripts/demo/sol_rivera.json" "$WORK/"
cd "$WORK"  # clients read the character sheet and write the song's MIDI file here
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
echo "=== Day 1: three players, one server ==="
"$BUILD/livera_cli" --port "$PORT" --script "$ROOT/scripts/demo/dominique_day1.txt" > "$WORK/dom.out" &
DOM=$!
sleep 1
"$BUILD/livera_cli" --port "$PORT" --script "$ROOT/scripts/demo/dax_day1.txt" > "$WORK/jax.out" &
JAX=$!
"$BUILD/livera_cli" --port "$PORT" --script "$ROOT/scripts/demo/sol_day1.txt" > "$WORK/sol.out" &
SOL=$!
STATUS=0
wait $DOM || STATUS=1
wait $JAX || STATUS=1
wait $SOL || STATUS=1
echo "--- Dominique ---"; cat "$WORK/dom.out"
echo "--- Dax ---"; cat "$WORK/jax.out"
echo "--- Sol (made their own character) ---"; cat "$WORK/sol.out"
if [ -n "${LIVERA_DEMO_OUT:-}" ] && [ -f founders_groove.mid ]; then
  mkdir -p "$LIVERA_DEMO_OUT" && cp founders_groove.mid "$LIVERA_DEMO_OUT/"
  echo "(Sol's song saved to $LIVERA_DEMO_OUT/founders_groove.mid)"
fi

echo "=== Restarting the server ==="
kill -INT $SERVER; wait $SERVER || true
start_server
"$BUILD/livera_cli" --port "$PORT" --script "$ROOT/scripts/demo/dominique_returns.txt" || STATUS=1
kill -INT $SERVER; wait $SERVER || true
echo "--- Server log ---"; cat "$WORK/server.log"
exit $STATUS
