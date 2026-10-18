# LIVÉRA Architecture

This is the single authoritative architecture. Changes to it are recorded in
`DECISIONS.md` first.

## The shape of the system

```
 browser (web/client)                    VPS, behind Caddy (HTTPS, wss://)
 2.5D canvas · phone UI ──wss──▶ gateway (web/gateway, Node) ──TCP, loopback──┐
 (intent only)                   a pipe: one WebSocket = one TCP session      │
                ┌─────────────────────────────────────────────────────────────▼─┐
                │                 Dedicated server process                      │
 tools, bots ─TCP▶│  Server (src/server)                                        │
 (director, CLI)│   sessions · auth · tokens · rate limit · protocol dispatch   │
                │        │ commands                 ▲ WorldEvents                │
                │        ▼                          │                            │
                │  World (src/core)  ── the only owner of game state ──         │
                │   validate → mutate WorldState → emit events                  │
                │        │ reads                                                 │
                │  ContentDatabase (src/core) ◀── data/**/*.json                 │
                │        │                                                       │
                │  SqliteStore (src/persistence) ◀─▶ world.db                    │
                └───────────────────────────────────────────────────────────────┘
```

### Layers

| Layer | Owns | Must not |
|---|---|---|
| **Content** (`core/Content.*`) | Immutable definitions loaded from `data/`: places, characters, careers, interactions, construction, economy. Validates every cross-reference at load. | Hold runtime state. |
| **World** (`core/World.*`, `WorldViews.cpp`) | `WorldState`: time, characters, relationships, memories, ledger, messages, notifications, properties, construction, city. All game rules. | Touch sockets, files, threads, or an engine. |
| **Ledger** (`core/Ledger.*`) | Accounts and the transaction log. Atomic transfers; zero-sum invariant. | Allow any other way to change a balance. |
| **Persistence** (`persistence/`) | Saving and loading `WorldState`; accounts and character claims; schema migrations. | Contain game rules. |
| **Server** (`server/`, `net/`) | Connections, authentication, authorization (who is playing what), rate limiting, the protocol, autosave cadence, routing events to clients. | Decide game outcomes. It only calls `World`. |
| **Client** (`web/client` for players; `client/` CLI and `scripts/town_director.py` for tools) | Presentation and input. Sends intent. Predicts straight-line motion only to draw it. | Be trusted with anything. |
| **Gateway** (`web/gateway`) | Turning each browser WebSocket into one TCP session with the server. | Hold game logic or state. It is a pipe. |

### The authority boundary

Every player-caused change goes through a `World` command method:

```
moveTo · enter · exitBuilding · interact · buy · useActivity · startShift · endShift ·
sendMessage · say · tip · createCharacter · saveSong · releaseSong · openSong · perform ·
openPhoneApp · connect · disconnect
```

Each validates against current state (is the character in the world? at the door? allowed
in? open? together with the target? can they afford it?) and returns `Result<T>` or
`Status` with a stable `code` (`too_far`, `no_access`, `insufficient_funds`...). The
protocol forwards that code to the client unchanged. Nothing else mutates `WorldState`.

Time is the other input: `advanceRealTime(seconds)` (movement, clock) and
`advanceMinutes(n)` (per-minute simulation). Only the server loop and dev tools call them.

### Events

`World` never knows who is connected. When something should reach a player (someone
spoke to you, a paycheck landed, a building opened) it emits a `WorldEvent` with explicit
recipients. The server drains events after each step and routes them to sessions.

### Threading

One thread owns the World, the store and every socket (`Server::run`). There are no
locks because nothing is shared. At today's default caps (16 people, 16 scripts) this is
simpler and faster than anything concurrent. Scaling path: see "Scaling" below.

## The game client (D-045)

The first game client is a 2.5D web client in `web/`, grown from the town preview. It runs in
any phone or desktop browser and speaks the same newline-JSON protocol (`livera/1`) as every
other client, one JSON object per WebSocket message:

```
web/client/   plain ES modules, no build step
  transport.js   WebSocket, request/reply by id, reconnect with a session token
  state.js       live model: people from look + the `people` stream, straight-line prediction
  render2d.js    isometric canvas (layout.js holds the sketched street layout)
  ui.js · phone.js · creator.js · main.js
web/gateway/  Node + ws: WebSocket ⇄ TCP, nothing else
```

- **Commands map 1:1 to World commands.** The client sends intent (`move`, `enter`, `buy`,
  `say`...); the server checks every rule. Nothing the client says about positions or outcomes
  is trusted.
- **Movement** stays server-moved along straight lines (D-013). The server tells each player
  what changes in their sight with the `people` event (a start, a stop, a turn, a door, a forced
  move); between events the client extrapolates the line. Sight range is data and is never less
  than shout range, so you can always see who you hear.
- **What a player sees is still decided by `World`** (D-012): other people only within sight
  outdoors or in the same building, never their needs, money or feelings.
- **A 3D view later** (three.js) replaces `render2d.js` behind the same transport and state.
  Because `src/core` has no engine dependency, an engine client (Unreal, Godot) or a WebAssembly
  offline build stays possible without changing the rules.
- **Hosting:** one small VPS runs the server, the gateway and the labelled town director behind
  Caddy, which terminates HTTPS and serves the client (`deploy/`). Server and gateway talk over
  loopback only.
- **Solo build.** `scripts/build_wasm.sh` (CMake option `LIVERA_WASM`, Emscripten) compiles
  `livera_core`, `livera_protocol` and `src/wasm/solo.cpp` to one ES module,
  `web/client/solo/livera_solo.js`, with `data/` embedded. The same `World` runs in the browser
  tab, the same client draws it, and the founders the person doesn't play are driven by the
  core's `Autopilot` (D-053). The page talks to it through `solo_*` functions that take and
  return the protocol's JSON (requests through `src/protocol/WorldOps.cpp`, events from
  `solo_tick`), so nothing is simulated twice. The save is the whole `WorldState` as one JSON
  document (`worldStateToJson`, `"format": 1`), kept by the page; no SQLite, OpenSSL or sockets
  are built. Nobody else can join a solo save; the page says so.

## Scaling (later, not now)

The target today is one world shard with up to 16 people plus up to 16 scripted sessions
(`--max-players`, `--max-scripted`). Known paths when that's outgrown:
1. Dirty tracking in the store (save only changed rows) instead of rewriting mutable tables.
2. Spatial partitioning for `look`/presence (today they scan all characters).
3. Tier-2 NPC simulation on a coarser tick, Tier-3 statistical population (already abstract).
4. Separate services: accounts/auth, world shards, chat/social, persistence (Postgres).
5. Shard by district or instance interiors if a single world process becomes the limit.

## Source map

| File | Purpose |
|---|---|
| `src/core/Types.h` | Ids, money, stats, `Result`/`Status`/`Error`. |
| `src/core/Clock.*` | Calendar (28-day months), day phase, daylight. |
| `src/core/Content.*` | Definitions + JSON loader + validation. |
| `src/core/Ledger.*` | Accounts, transfers, history. |
| `src/core/World.h/.cpp` | State structs and every rule. |
| `src/core/WorldViews.cpp` | What each character is allowed to see (`look`, phone apps). |
| `src/core/CharacterCreator.cpp` | Character creator: validates a sheet against data, founds the resident. |
| `src/core/Music.cpp` | Songs, releases, the town chart, live performance. |
| `src/core/Serialization.*` | JSON encoding of state records for the save format, and the whole world as one JSON document (the single-player save). |
| `src/protocol/WorldOps.*` | The in-world op routing (`look`, `move`, `buy`...) shared by the server and the single-player build. |
| `src/wasm/solo.cpp` | The single-player harness: the core, the dispatch and the autopilot as a WebAssembly module (`LIVERA_WASM`). |
| `src/persistence/SqliteStore.*` | Schema, migrations, save/load, accounts, claims. |
| `src/persistence/PasswordHash.*` | PBKDF2-HMAC-SHA256. |
| `src/net/Socket.*` | POSIX TCP + line framing with a size limit. |
| `src/server/Server.*` | Loop, sessions, dispatch, autosave, event routing. |
| `src/server/Auth.*` | Username and password rules, script-account (`bot_*`) naming, in-memory resume tokens, per-username login throttling. |
| `src/server/RateLimiter.*` | Per-connection token bucket. |
| `src/client/cli_main.cpp` | Headless dev client and script runner. |
| `src/client/CreatorWizard.*` | Guided character creation on the terminal. |
| `src/client/MusicText.*` | Note text notation and MIDI export (client-side only). |
