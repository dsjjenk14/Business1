#!/usr/bin/env bash
# End-to-end tests for "Play together" (web/client/together/): a static server for web/client and Playwright
# (Chromium) with five pages in one browser, a host and four friends, on fake_platform.js (the stand-in for the
# artifact's room, database and user: every tab is one person). No game server: the host's tab runs the game core
# compiled to WebAssembly, web/client/solo/livera_solo.js (scripts/build_wasm.sh). The link's own unit tests
# (web/tests/together_link.mjs) run first.
#
#   livera/web/tests/run_together_e2e.sh                    # together_e2e.js
#   livera/web/tests/run_together_e2e.sh social_e2e.js      # only these test files (in web/tests), same static server
#
# Env:
#   LIVERA_E2E_DIR          where logs go (default: a new mktemp -d)
#   LIVERA_SHOTS            where screenshots go (default: $LIVERA_E2E_DIR/shots)
#   LIVERA_TOGETHER_PORT    the static server's port (default 18960)
#   LIVERA_TOGETHER_DROP    the share of room messages the fake room loses (default 0.05), to exercise resends
# Needs Node 18+ and Playwright installed globally (NODE_PATH is set to `npm root -g`).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB="$(cd "$HERE/.." && pwd)"
E2E_DIR="${LIVERA_E2E_DIR:-$(mktemp -d)}"
SHOTS="${LIVERA_SHOTS:-$E2E_DIR/shots}"
PORT="${LIVERA_TOGETHER_PORT:-18960}"

if [ ! -f "$WEB/client/solo/livera_solo.js" ]; then
  echo "no game core build at $WEB/client/solo/livera_solo.js (run scripts/build_wasm.sh)" >&2
  exit 2
fi
mkdir -p "$E2E_DIR" "$SHOTS"

cat > "$E2E_DIR/static.mjs" <<'EOF'
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const ROOT = path.resolve(process.env.ROOT), PORT = Number(process.env.PORT);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(ROOT, p);
  if ((f === ROOT || f.startsWith(ROOT + path.sep)) && fs.existsSync(f) && fs.statSync(f).isFile()) {
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
ROOT="$WEB/client" PORT="$PORT" node "$E2E_DIR/static.mjs" > "$E2E_DIR/static.log" 2>&1 &
PIDS+=($!)
for _ in $(seq 1 50); do grep -q "listening" "$E2E_DIR/static.log" 2>/dev/null && break; sleep 0.2; done
grep -q "listening" "$E2E_DIR/static.log" || { echo "static server didn't start:"; cat "$E2E_DIR/static.log"; exit 1; }

status=0
node "$HERE/together_link.mjs" || status=$?
TESTS=("$@")
[ ${#TESTS[@]} -eq 0 ] && TESTS=(together_e2e.js)
for t in "${TESTS[@]}"; do
  [ -f "$HERE/$t" ] || { echo "no test file web/tests/$t" >&2; status=2; continue; }
  NODE_PATH="$(npm root -g)" LIVERA_TOGETHER_URL="http://127.0.0.1:$PORT/together/" LIVERA_SHOTS="$SHOTS" \
    LIVERA_TOGETHER_DROP="${LIVERA_TOGETHER_DROP:-0.05}" node "$HERE/$t" || status=$?
done
echo "logs: $E2E_DIR (static.log) · screenshots: $SHOTS"
exit $status
