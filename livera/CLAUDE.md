# LIVÉRA — instructions for Claude Code

LIVÉRA is a persistent multiplayer life simulation. This folder is self-contained and
unrelated to the I'm In Expo app in the rest of this repository: the Expo/React Native
guidance in the repo-root `AGENTS.md` does **not** apply here. (See `docs/DECISIONS.md`
D-001 for why LIVÉRA lives here for now.)

Read before any major task:
- `docs/ARCHITECTURE.md` — the one authoritative architecture. Do not invent a second one.
- `docs/ROADMAP.md` — what's done, what's next, and the slice definition.
- `docs/DECISIONS.md` — decisions already made and why. Add an entry for every new one.

## Build, test, run

```bash
cmake -S . -B build -G Ninja          # needs a C++20 compiler, SQLite3 and OpenSSL dev headers
cmake --build build
./build/livera_tests                  # all tests; `./build/livera_tests ledger` filters by name
scripts/demo_slice.sh                 # two players, a full day, server restart, reconnect
./build/livera_server --data data --db /tmp/w.db --dev    # then: ./build/livera_cli
```

Sanitizer build: `cmake -S . -B build-asan -DLIVERA_SANITIZE=ON -DCMAKE_BUILD_TYPE=Debug`.
Run the tests (and the sanitizer tests for anything touching memory or the server) before
calling work done. Warnings are errors.

## Rules that are not negotiable

1. **The server is the authority.** Clients send intent ("move toward X", "buy latte").
   Every rule is checked in `World` (src/core). Never accept a client-supplied position,
   balance, relationship value or outcome.
2. **All state changes go through a `World` command method** that validates first and
   returns `Result`/`Status` with a stable error `code`. No other code mutates `WorldState`.
3. **Money is integer cents and moves only via `Ledger::transfer`.** Balances must always
   sum to zero (`sys:economy` is the outside world). The store refuses to save otherwise.
4. **Content is data.** New characters, places, careers, interactions, construction
   projects and stat names go in `data/**/*.json` and are validated by `ContentDatabase`.
   If you find yourself writing a character name or price in C++, stop.
5. **Clients only see what their character may know.** Your own needs, money and side of
   a relationship; never someone else's feelings or secrets.
6. **Never pretend.** No fake buttons, no placeholder systems presented as real. Mark
   placeholders in data and docs (e.g. civic landmarks).
7. **Every system has tests.** New command → unit tests in `tests/test_world.cpp` for the
   happy path and each refusal; protocol-visible changes → `tests/test_server.cpp`.
8. **Save format changes need a migration** appended to `kMigrations` in
   `src/persistence/SqliteStore.cpp`. Never edit a shipped migration.

## Code style

- C++20, 2-space indent, 120 columns. `PascalCase` types, `camelCase` functions/variables,
  `kConstant` constants, trailing `_` for members.
- Comments explain *why*, not what. Match the surrounding density.
- `src/core` must not depend on sockets, SQLite, OpenSSL or any engine. It is the part an
  Unreal module will link.
- Prefer small free functions and plain structs over class hierarchies.

## Workflow for a milestone

Inspect → plan → smallest complete version → tests → build → run `scripts/demo_slice.sh` →
check multiplayer implications (who can see/trigger this? what if two players do it at
once?) → update docs (ROADMAP status, DECISIONS, DATA_MODEL if the format changed) →
report exactly what works and what doesn't.
