# LIVÉRA Architecture

This is the single authoritative architecture. Changes to it are recorded in
`DECISIONS.md` first.

## The shape of the system

```
                ┌───────────────────────────────────────────────────────┐
                │                 Dedicated server process              │
 client ──TCP──▶│  Server (src/server)                                  │
 (intent only)  │   sessions · auth · rate limit · protocol dispatch    │
                │        │ commands                 ▲ WorldEvents        │
                │        ▼                          │                    │
                │  World (src/core)  ── the only owner of game state ── │
                │   validate → mutate WorldState → emit events          │
                │        │ reads                                          │
                │  ContentDatabase (src/core) ◀── data/**/*.json         │
                │        │                                                │
                │  SqliteStore (src/persistence) ◀─▶ world.db            │
                └───────────────────────────────────────────────────────┘
```

### Layers

| Layer | Owns | Must not |
|---|---|---|
| **Content** (`core/Content.*`) | Immutable definitions loaded from `data/`: places, characters, careers, interactions, construction, economy. Validates every cross-reference at load. | Hold runtime state. |
| **World** (`core/World.*`, `WorldViews.cpp`) | `WorldState`: time, characters, relationships, memories, ledger, messages, notifications, properties, construction, city. All game rules. | Touch sockets, files, threads, or an engine. |
| **Ledger** (`core/Ledger.*`) | Accounts and the transaction log. Atomic transfers; zero-sum invariant. | Allow any other way to change a balance. |
| **Persistence** (`persistence/`) | Saving and loading `WorldState`; accounts and character claims; schema migrations. | Contain game rules. |
| **Server** (`server/`, `net/`) | Connections, authentication, authorization (who is playing what), rate limiting, the protocol, autosave cadence, routing events to clients. | Decide game outcomes. It only calls `World`. |
| **Client** (`client/` today; Unreal later) | Presentation and input. Sends intent. | Be trusted with anything. |

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
locks because nothing is shared. At 2–8 players this is simpler and faster than
anything concurrent. Scaling path: see "Scaling" below.

## Engine integration (the plan for the 3D game)

The game client and in-world presentation will be **Unreal Engine 5** (C++ + Blueprints).
The simulation core stays engine-agnostic and is linked into Unreal as a module:

```
Unreal project
  Source/LiveraSim/        ← wraps livera_core (this repo's src/core) as a UE module
  Source/LiveraGame/       ← GameMode, PlayerController, Character, UI (phone) etc.
  Dedicated server build   ← GameMode owns a World; RPCs call World commands;
                             replicated properties mirror the views World produces
```

- **Server RPCs map 1:1 to World commands.** `ServerEnter(LocationId)` calls
  `World::enter`, nothing more. The rule logic is never duplicated in Blueprints.
- **Movement:** today the server moves characters along straight lines at walking speed.
  In Unreal, the CharacterMovementComponent does client prediction with server
  reconciliation; `World` keeps the authoritative logical position (which building you're
  in, whether you're at a door) and validates positions reported by the UE server against
  max speed. NavMesh pathing replaces straight lines.
- **The development protocol** (newline JSON over TCP) remains useful for headless bots,
  load tests and tools, and as the reference for which commands exist.
- **Persistence and backend** stay outside Unreal: the UE dedicated server uses
  `livera_persistence` (SQLite now, a database service later).

This is why the core has no engine dependency and why the slice was built headless first:
every rule is testable in CI in seconds, without an Unreal install.

## Scaling (later, not now)

The target today is one world shard with 2–8 players. Known paths when that's outgrown:
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
| `src/core/Serialization.*` | JSON encoding of state records for the save format. |
| `src/persistence/SqliteStore.*` | Schema, migrations, save/load, accounts, claims. |
| `src/persistence/PasswordHash.*` | PBKDF2-HMAC-SHA256. |
| `src/net/Socket.*` | POSIX TCP + line framing with a size limit. |
| `src/server/Server.*` | Loop, sessions, dispatch, autosave, event routing. |
| `src/server/RateLimiter.*` | Per-connection token bucket. |
| `src/client/cli_main.cpp` | Headless dev client and script runner. |
| `src/client/CreatorWizard.*` | Guided character creation on the terminal. |
| `src/client/MusicText.*` | Note text notation and MIDI export (client-side only). |
