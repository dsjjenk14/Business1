#!/usr/bin/env bash
# End-to-end tests for the single-player page (web/client/solo/): a static server for web/client
# and Playwright (Chromium) playing it at phone and desktop sizes. No game server: the world is
# the game core compiled to WebAssembly, web/client/solo/livera_solo.js (scripts/build_wasm.sh).
#
#   livera/web/tests/run_solo_e2e.sh                  # solo_e2e.js
#   livera/web/tests/run_solo_e2e.sh phone_e2e.js     # only these test files (in web/tests), same static server
#
# Env:
#   LIVERA_E2E_DIR      where logs and downloads go (default: a new mktemp -d)
#   LIVERA_SHOTS        where screenshots go (default: $LIVERA_E2E_DIR/shots)
#   LIVERA_SOLO_PORT    the static server's port (default 18950)
#   LIVERA_SOLO_MODULE  a file served as /solo/livera_solo.js instead of the built one (its folder
#                       is served under /solo/ too, for anything it imports): a stand-in for
#                       developing the page before the wasm build exists
# Needs Node 18+ and Playwright installed globally (NODE_PATH is set to `npm root -g`).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB="$(cd "$HERE/.." && pwd)"
E2E_DIR="${LIVERA_E2E_DIR:-$(mktemp -d)}"
SHOTS="${LIVERA_SHOTS:-$E2E_DIR/shots}"
PORT="${LIVERA_SOLO_PORT:-18950}"
MODULE="${LIVERA_SOLO_MODULE:-}"

if [ -z "$MODULE" ] && [ ! -f "$WEB/client/solo/livera_solo.js" ]; then
  echo "no single-player build at $WEB/client/solo/livera_solo.js (run scripts/build_wasm.sh, or set LIVERA_SOLO_MODULE to a stand-in)" >&2
  exit 2
fi
if [ -n "$MODULE" ] && [ ! -f "$MODULE" ]; then echo "LIVERA_SOLO_MODULE=$MODULE is not a file" >&2; exit 2; fi
mkdir -p "$E2E_DIR" "$SHOTS"

# A plain static server: no gateway, no game server, nothing but files.
cat > "$E2E_DIR/static.mjs" <<'EOF'
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const ROOT = path.resolve(process.env.ROOT), PORT = Number(process.env.PORT);
const MODULE = process.env.MODULE ? path.resolve(process.env.MODULE) : null, OVERLAY = MODULE ? path.dirname(MODULE) : null;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".wasm": "application/wasm" };
const inside = (f, base) => f === base || f.startsWith(base + path.sep);
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const candidates = [];
  if (MODULE && p === "/solo/livera_solo.js") candidates.push([MODULE, OVERLAY]);
  if (OVERLAY && p.startsWith("/solo/")) candidates.push([path.join(OVERLAY, p.slice(6)), OVERLAY]);
  candidates.push([path.join(ROOT, p), ROOT]);
  for (const [f, base] of candidates) {
    if (!inside(f, base) || !fs.existsSync(f) || !fs.statSync(f).isFile()) continue;
    res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream", "cache-control": "no-store" });
    fs.createReadStream(f).pipe(res); return;
  }
  res.writeHead(404, { "content-type": "text/plain" }); res.end("not found");
}).listen(PORT, "127.0.0.1", () => console.log(`listening on http://127.0.0.1:${PORT}/`));
EOF

PIDS=()
# shellcheck disable=SC2329  # called by the trap below
cleanup() { for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null || true; done; wait 2>/dev/null || true; }
trap cleanup EXIT
ROOT="$WEB/client" PORT="$PORT" MODULE="$MODULE" node "$E2E_DIR/static.mjs" > "$E2E_DIR/static.log" 2>&1 &
PIDS+=($!)
for _ in $(seq 1 50); do grep -q "listening" "$E2E_DIR/static.log" 2>/dev/null && break; sleep 0.2; done
grep -q "listening" "$E2E_DIR/static.log" || { echo "static server didn't start:"; cat "$E2E_DIR/static.log"; exit 1; }

status=0
TESTS=("$@")
[ ${#TESTS[@]} -eq 0 ] && TESTS=(solo_e2e.js)
for t in "${TESTS[@]}"; do
  [ -f "$HERE/$t" ] || { echo "no test file web/tests/$t" >&2; status=2; continue; }
  NODE_PATH="$(npm root -g)" LIVERA_SOLO_URL="http://127.0.0.1:$PORT/solo/" LIVERA_SHOTS="$SHOTS" LIVERA_E2E_DIR="$E2E_DIR" \
    LIVERA_SOLO_STANDIN="${MODULE:+1}" node "$HERE/$t" || status=$?
done
echo "logs: $E2E_DIR (static.log) · screenshots: $SHOTS"
exit $status
