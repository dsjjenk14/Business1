# LIVÉRA

*Everyone has a life. You decide what yours becomes.*

A persistent multiplayer life simulation set in a newly founded town that grows into a city.
This folder holds the **authoritative simulation core, dedicated server, persistence, and a
headless test client**: the foundation the 3D game client will be built on.

**What this is not (yet):** there is no 3D client, no graphics, and no Unreal project. You
play the current build through a text client. See [What works today](#what-works-today).

## Quick start

```bash
cd livera
cmake -S . -B build -G Ninja && cmake --build build
./build/livera_tests            # 72 tests
scripts/demo_slice.sh           # three players live a morning (one makes their own character), then a restart
```

Play it yourself (two terminals, or more for more players):

```bash
./build/livera_server --data data --db my_world.db --dev
./build/livera_cli
> register me my-password
> login me my-password
> create                      # guided character creator (or: play dominique)
> play
> exit
> walk heritage_coffee
> enter heritage_coffee
> say Hi everyone!
> buy latte
> song new 96 My First Song
> song track piano C4:0:4 E4:4:4 G4:8:8
> song save
> perform last
> song export last my_song.mid  # open it in any music app
```

Type `help` in the client for every command. `--dev` enables `skip MINUTES` (time skip)
for testing; never run a public server with it.

Requirements: CMake 3.20+, a C++20 compiler (GCC 12+/Clang 15+), SQLite3 and OpenSSL
development headers. The JSON library is fetched by CMake on first configure.

## What works today

The founding vertical slice (docs/ROADMAP.md, M0), all server-authoritative and tested:

| Step | Status |
|---|---|
| Launch, enter the founding town | ✅ server + text client (no 3D) |
| Create or select a character | ✅ full character creator (appearance, personality, origin, career...) or play one of the 11 founding characters |
| Walk around | ✅ server-moved at walking speed, no teleporting; no rendering |
| Enter an apartment | ✅ residents only |
| Use the phone | ✅ bank, messages, contacts, calendar, map, career, property, notifications, city (data, no UI) |
| Meet and talk to another player | ✅ proximity chat (say, shout, whisper), 5 social interactions, phone texts |
| Make music | ✅ compose on your phone, release to the town chart, perform live on stages, get tipped, export MIDI |
| Build a relationship | ✅ directional, 11 dimensions, memories, grudges |
| Go to work, earn money | ✅ shifts, hourly pay, performance, promotions |
| Spend money | ✅ shops with opening hours, card or cash, can't overspend |
| See the world change | ✅ construction crews build on schedules; places open; city stats grow |
| Save, disconnect, reconnect, state preserved | ✅ SQLite, survives a full server restart |

The founding cast: 11 playable characters with reference art (`art/reference/characters/`),
homes, careers, secrets and history with each other. See docs/GAME_DESIGN.md.

Not built yet: the 3D client, voice chat,
autonomous NPCs (construction crews are abstract), gossip/secrets propagation, social
media, business ownership, buying property, the event engine, generations.

**Security note:** the development protocol is plaintext TCP and binds to 127.0.0.1 by
default. Passwords are hashed at rest (PBKDF2) but are not encrypted in transit. Do not
expose a dev server to the internet. See docs/MULTIPLAYER.md.

## Layout

| Path | What it is |
|---|---|
| `src/core/` | The simulation: clock, content loading, world state, ledger, all game rules. No IO, no engine. |
| `src/persistence/` | SQLite save/load with migrations; password hashing. |
| `src/net/`, `src/server/` | Dedicated server: sockets, protocol, sessions, auth, rate limiting. |
| `src/client/` | `livera_cli`, the headless development client. |
| `data/` | All game content as JSON: town, characters, careers, interactions, economy, city growth. |
| `art/` | Character reference sheets (the approved look of each founding character). |
| `tests/` | Unit tests and an end-to-end network test. |
| `scripts/` | `demo_slice.sh` and its client scripts. |
| `docs/` | Architecture, design, data model, multiplayer, simulation, roadmap, decisions. |
