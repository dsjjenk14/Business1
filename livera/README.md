# LIVÉRA

*Everyone has a life. You decide what yours becomes.*

A persistent multiplayer life simulation set in a newly founded town that grows into a city.
This folder holds the **authoritative simulation core, dedicated server, persistence, a 2.5D web
client (`web/`), a headless test client, a labelled town director and the VPS deploy scripts**.

**What this is not (yet):** there is no 3D view and no Unreal project (D-045). You play in a phone
or desktop browser through the 2.5D web client (street layout and building shapes are sketches;
`web/README.md` says how to run it), or through the text client. See
[What works today](#what-works-today).

## Quick start

```bash
cd livera
cmake -S . -B build -G Ninja && cmake --build build
./build/livera_tests            # every test; prints "N tests, 0 failed"
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
> phone health                  # your body, your conditions, your home
> do brush_teeth
> ask date dax                  # Dax's player answers: answer ask-123 yes
```

Type `help` in the client for every command. `--dev` enables `skip MINUTES` (time skip)
for testing; never run a public server with it.

Requirements: CMake 3.20+, a C++20 compiler (GCC 12+/Clang 15+), SQLite3 and OpenSSL
development headers. The JSON library is fetched by CMake on first configure.

## What works today

The founding vertical slice (docs/ROADMAP.md, M0), all server-authoritative and tested:

| Step | Status |
|---|---|
| Launch, enter the founding town | ✅ server + 2.5D web client or the text client; no 3D |
| Create or select a character | ✅ full character creator (appearance, personality, origin, career...) or play one of the 11 founding characters |
| Walk around | ✅ server-moved at walking speed, no teleporting; drawn in the 2.5D web client |
| Enter an apartment | ✅ residents only |
| Use the phone | ✅ 26 apps as server views; a phone UI in the web client (some apps have their own screens, the rest show as cards; `web/README.md`) |
| Meet and talk to another player | ✅ proximity chat (say, shout, whisper), 5 social interactions, phone texts |
| Make music | ✅ compose on your phone, release to the town chart, perform live on stages, get tipped, export MIDI |
| Build a relationship | ✅ directional, 11 dimensions, memories, grudges |
| Go to work, earn money | ✅ shifts, hourly pay, performance, promotions |
| Spend money | ✅ shops with opening hours, card or cash, can't overspend |
| See the world change | ✅ construction crews build on schedules; places open; city stats grow |
| Save, disconnect, reconnect, state preserved | ✅ SQLite, survives a full server restart |
| Look after yourself | ✅ bathroom, teeth, grooming, weight, aging, illness; doctors, dentist, therapy |
| Keep a home | ✅ cleaning, trash; a filthy home makes you sick |
| Stay away too long | ✅ three real weeks of self-care, then your character gets depressed |
| Own things | ✅ clothes, accessories, a laptop, headphones, medicine; new shops and a salon |
| Get around | ✅ the bus, with fares (and fare inspectors) |
| Go to school | ✅ university, law school, medical school, nursing school, police academy |
| Change careers | ✅ apply in person; doctor, nurse, lawyer, police officer, professor and more |
| Break the law | ✅ shoplifting, pickpocketing, fare evasion, drugs; fines, jail, a record, police |
| Date, marry, start a family | ✅ every step needs a yes; adults only; pregnancy, birth, children |
| Become famous | ✅ fame and celebrity tiers |

The founding cast: 11 playable characters with reference art (`art/reference/characters/`),
homes, careers, secrets and history with each other. See docs/GAME_DESIGN.md.

Not built yet: a 3D view, voice chat (designed in docs/proposals/voice.md),
autonomous NPCs (construction crews, shop staff and dealers are abstract), gossip/secrets
propagation (so cheating is never found out), social media, business ownership, buying
property, the event engine, children's care and childhood gameplay, and player reporting
and blocking (needed before any public server; see docs/DECISIONS.md D-025).

**Security note:** the game server speaks plaintext newline-JSON over TCP and binds to 127.0.0.1
by default; never expose it directly. On the VPS (`deploy/`) browsers reach it only through Caddy
(HTTPS, `wss://`) and the WebSocket gateway, registration is closed, logins are throttled per
username, and the browser keeps a resume token instead of the password. A local or `--dev` setup
has no TLS (the gateway serves plain HTTP), registration is open unless you pass
`--closed-registration`, and `--dev` allows time skips and test payments: keep it on your own
machine. See docs/MULTIPLAYER.md.

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
| `web/` | The 2.5D browser client (`web/client`), the WebSocket gateway (`web/gateway`) and their Playwright tests (`web/tests`). |
| `deploy/` | One-command install on an Ubuntu VPS: Caddy, systemd, backups, firewall. |
| `scripts/` | `demo_slice.sh` and its client scripts; `town_director.py` (labelled scripted founders) and its test `test_director.sh`. |
| `docs/` | Architecture, design, data model, multiplayer, simulation, roadmap, decisions. |
