#!/usr/bin/env bash
# Builds the single-player WebAssembly module (src/wasm/solo.cpp, CMake option LIVERA_WASM) with Emscripten
# and copies it to web/client/solo/livera_solo.js. Usage: scripts/build_wasm.sh [build-dir]  (default build-wasm)
#
# Needs Emscripten: `emcc` on PATH, or EMSDK pointing at an emsdk checkout (its emsdk_env.sh is sourced here;
# an installed-but-never-activated SDK is activated once). nlohmann_json comes from, in order:
#   LIVERA_JSON_SRC      a source checkout of nlohmann/json (FetchContent uses it instead of downloading)
#   nlohmann_json_DIR    an installed package's cmake directory
#   build/_deps or build-asan/_deps   the copy the normal build already fetched (GitHub may be unreachable)
#   otherwise            CMake downloads it from GitHub as the normal build does.
# Check the result with: node web/tests/solo_smoke.mjs
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="${1:-$ROOT/build-wasm}"

if ! command -v emcc >/dev/null 2>&1 && [ -n "${EMSDK:-}" ] && [ -f "$EMSDK/emsdk_env.sh" ]; then
  # shellcheck disable=SC1091
  source "$EMSDK/emsdk_env.sh" >/dev/null 2>&1 || true
fi
if ! command -v emcc >/dev/null 2>&1; then
  echo "emcc not found: install Emscripten (https://emscripten.org) or set EMSDK to an emsdk checkout" >&2
  exit 1
fi
if ! emcc --version >/dev/null 2>&1 && [ -n "${EMSDK:-}" ]; then
  echo "activating the installed Emscripten SDK"
  "$EMSDK/emsdk" activate latest >/dev/null
  # shellcheck disable=SC1091
  source "$EMSDK/emsdk_env.sh" >/dev/null 2>&1 || true
fi
emcc --version | head -1

JSON_ARGS=()
if [ -n "${LIVERA_JSON_SRC:-}" ]; then
  JSON_ARGS+=("-DFETCHCONTENT_SOURCE_DIR_NLOHMANN_JSON=$LIVERA_JSON_SRC")
elif [ -n "${nlohmann_json_DIR:-}" ]; then
  JSON_ARGS+=("-Dnlohmann_json_DIR=$nlohmann_json_DIR")
else
  for d in "$ROOT/build/_deps/nlohmann_json-src" "$ROOT/build-asan/_deps/nlohmann_json-src"; do
    if [ -f "$d/CMakeLists.txt" ]; then
      echo "nlohmann_json from $d"
      JSON_ARGS+=("-DFETCHCONTENT_SOURCE_DIR_NLOHMANN_JSON=$d")
      break
    fi
  done
fi

emcmake cmake -S "$ROOT" -B "$BUILD" -G Ninja -DLIVERA_WASM=ON -DCMAKE_BUILD_TYPE=Release \
  ${JSON_ARGS[@]+"${JSON_ARGS[@]}"} >/dev/null
cmake --build "$BUILD"
mkdir -p "$ROOT/web/client/solo"
cp "$BUILD/livera_solo.js" "$ROOT/web/client/solo/livera_solo.js"
ls -l "$ROOT/web/client/solo/livera_solo.js"
