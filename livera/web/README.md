# LIVÉRA web client (Phase 0)

A live, playable 2.5D web client for LIVÉRA, grown from the town preview. It runs in any phone
or desktop browser and talks to the real C++ game server through a small WebSocket gateway.
The server is still the only authority: the page sends intent ("walk here", "buy a latte", "say
this") and shows the server's answer or refusal word for word.

```
browser (web/client)  ──WebSocket /ws──▶  gateway (web/gateway, Node)  ──TCP, JSON lines──▶  livera_server
```

Background: `docs/proposals/web_client.md` (Phase 0), `docs/MULTIPLAYER.md` (protocol) and D-045.

## Run it locally

You need the server built (see `livera/CLAUDE.md`), Node 18+ and npm.

```bash
# 1. the game server (a dev world: open registration, time skips allowed)
cd livera
./build/livera_server --data data --db /path/to/dev_world.db --dev            # listens on 127.0.0.1:7777

# 2. the gateway, also serving the client folder over HTTP (dev only)
cd web/gateway
npm ci
STATIC_DIR=../client node gateway.mjs                                          # http://127.0.0.1:8080/

# 3. open http://127.0.0.1:8080/ , create an account, pick a character
```

To try it on a phone on the same network, start the gateway with `GATEWAY_HOST=0.0.0.0` and
open `http://<your computer's address>:8080/`. That is plain HTTP: fine on your own Wi-Fi, never
on the internet. Production serves `web/client` with Caddy over HTTPS and proxies `/ws` to the
gateway (`livera/deploy/`); set `ALLOWED_ORIGINS=https://your.domain` there.

Gateway settings (environment): `LIVERA_HOST` (127.0.0.1), `LIVERA_PORT` (7777), `GATEWAY_HOST`
(127.0.0.1), `GATEWAY_PORT` (8080), `ALLOWED_ORIGINS` (comma list; empty = any origin, dev only),
`STATIC_DIR` (optional), `GATEWAY_MAX_CONNECTIONS` (256: open WebSockets in all; more get HTTP 503).
At most 8 connections per IPv4 address or IPv6 /64 (more get 429). `GET /healthz` answers `ok`.

## Tests

```bash
livera/web/tests/run_e2e.sh
```

First `web/gateway/test_gateway.mjs` checks the gateway's connection caps against a stand-in game
server (the total cap answers 503; addresses in one IPv6 /64, or an IPv4 address and its
IPv4-mapped form, share one count of 8). Then it starts a server on a fresh temporary database,
the gateway, and Chromium (Playwright, installed globally) playing at 390x844 (phone, touch) and
1280x800. It registers players, picks characters,
taps to walk, walks into Heritage Coffee and buys a coffee (bank balance drops by the price), talks
with say / shout / whisper between two browsers, checks that whisper only offers people in range,
sends `<img src=x onerror=alert(1)>` as speech and as a phone message and checks nothing became
HTML, opens the bus sheet and rides (fare charged), opens the phone (26 apps, bank, messages, an
app as cards), checks tap targets (44 px), input font size (16 px), sideways scrolling and overlap,
makes a character in the creator, checks that a dropped connection keeps a half-filled login form
and creator, that a message arriving keeps what you were typing in Messages, that a pinch followed
by lifting one finger doesn't make the map jump, that a sheet open on the phone leaves speech
bubbles below the top bar and one feed line, that the chat bar says who a whisper reaches, that
closing a sheet inside a building leaves the Exit pill, enrolls and studies at Livéra University
(walking there takes about a minute), checks that a second login on another device is
handled (the first device stops instead of fighting back), that reconnects back off while the game
server is down (a second gateway with nothing behind it), and fails on any console error. On a
`livera/1` server it also checks the people stream, interactions (walking over first), asks
(Accept / Decline, the Romance app's list, an ask that passed), the `whispering` notice for
onlookers, the "played by a script" label (a `bot_` account made with `--add-account`), resuming
after a reload or a dropped connection, that a phone that slept through a login elsewhere
doesn't take the session back when it wakes (`resume` with `take_over: false` is refused with
`in_use_elsewhere`), and that open / closed follows the clock (it moves the game clock with
`dev_advance`, so it runs last). Against an older server the newer-protocol tests report SKIP.

Env: `LIVERA_SERVER` (default `livera/build/livera_server`), `LIVERA_E2E_DIR` (DB and logs;
default a new temp dir), `LIVERA_SHOTS` (screenshots), `LIVERA_E2E_PORT` / `GATEWAY_E2E_PORT`,
`GATEWAY_DOWN_E2E_PORT` / `LIVERA_CLOSED_E2E_PORT` (the gateway with no game server behind it).

## Single-player build

`web/client/solo/` is a second entry point for the same client: the game core compiled to
WebAssembly runs the whole town inside the browser tab, you play one resident, and the founders
nobody plays are driven by the core's autopilot. No server, no accounts, no gateway. The page
says so on screen: "Single-player: the town runs in your browser. Nobody else can join this
save." and "The town pauses while this tab is closed."

```
browser tab:  web/client (same modules)  ──request(op)──▶  solo/transport_local.js  ──JSON──▶  solo/livera_solo.js (World + WorldOps + Autopilot, wasm)
```

### Build, run, test

```bash
cd livera
scripts/build_wasm.sh                       # Emscripten build (src/wasm/solo.cpp); writes web/client/solo/livera_solo.js
cd web/gateway && STATIC_DIR=../client node gateway.mjs    # or any static server for web/client
# open http://127.0.0.1:8080/solo/
web/tests/run_solo_e2e.sh                   # Playwright: phone (390x844) and desktop, against the built module
```

`livera_solo.js` is a single file (the wasm is inlined, `-sSINGLE_FILE=1`) so any static host
serves it; the page's CSP adds `'wasm-unsafe-eval'` for it. Until the build exists,
`run_solo_e2e.sh` refuses to run; `LIVERA_SOLO_MODULE=/path/to/standin.js` serves a stand-in
module in its place (used while the page was developed), and the test's summary then says so.

### Files

| File | What it does |
|---|---|
| `client/solo/index.html` | The same shell as `client/index.html` (`<base href="../">` so css/ and faces/ resolve), booting `solo/solo.js`; `data-boot="solo"` tells `main.js` not to start the live game. |
| `client/solo/solo.js` | `SoloGame extends Game` (`main.js`): the town screen (New town / Continue / Import a save file / Export / Start over with a confirm), its own picker (no accounts: "on autopilot right now" badges), a menu with Save now, Export, Change who you play, Start over and the honest labels; autosave every 30 s, when the tab is hidden and on `pagehide`. |
| `client/solo/transport_local.js` | The `transport.js` interface (`request(op, args)` → `{ok, data}` or `{ok: false, error}`, `welcome` / `event` / `status` listeners) over the wasm module: `characters` → `solo_characters`, `create_character` → `solo_create_character`, `play` → `solo_play` (then `solo_autopilot_start()`), `logout` → `solo_leave`, `hello` / `ping` answered locally, `creator_options` → `solo_request` with a fallback to `solo_creator_options`, everything else → `solo_request` (the server's own dispatch, `src/protocol/WorldOps.cpp`). A 10 Hz timer calls `solo_tick` with the real seconds elapsed (at most 1 s a step) and feeds the returned events to the same handlers as the live client. Hidden tab: the clock stops; no catch-up. |
| `client/solo/save.js` | One save slot: IndexedDB (`livera-solo`), falling back to localStorage when IndexedDB is missing or refuses; export as a JSON download; import from a file. The record is `{format: "livera-solo-save/1", saved_at, character, character_name, state}` where `state` is exactly what `solo_save()` wrote (its own `format` field); the core validates it on load. |
| `tests/solo_e2e.js`, `tests/run_solo_e2e.sh` | The end-to-end tests below; the runner serves `web/client` with a plain static server on `LIVERA_SOLO_PORT` (18950). |

The seam in the shared code is small: `main.js` exports `Game`, its constructor takes an
optional `transport`, and it boots the live game only when `<body>` has no `data-boot="solo"`.
Everything else (state, renderer, UI, phone, creator) is reused unchanged.

### What is different from the live game

- No login, no accounts, no session tokens, no reconnects: the town screen replaces the login
  screen. One save per browser (plus export/import files); "Start over" deletes it after a confirm.
- You can change who you play from the menu; the character you leave goes on autopilot.
- Time only passes while the tab is visible and the game is being played. Hiding the tab saves
  and pauses; coming back shows "The town paused while this tab was in the background."
- Nobody else can ever be in your town. Speech works (say / shout / whisper, bubbles, "Heard by
  N"), but the autopilot never answers, so "Nobody heard you" is the honest feedback when nobody
  is near, and "Heard by N" means N autopilot residents were in range.
- Same rules, same refusals: the module runs `World` and the server's op dispatch, so every
  reply and error code is the one the server would give.

### What the autopilot does, and doesn't

The founders you don't play are run by `src/core/Autopilot` inside the core (contract B,
`docs/SIMULATION.md`): they wake at home, walk (or ride) to work in their career's hours, keep
their `profile.schedule`, look after their needs at home, buy a coffee or groceries, go home at
bedtime. They show as "played by a script" (the server's label; the picker and the menu say
"on autopilot") while the autopilot has them in the world, that is from their wake time to
bedtime; a founder still asleep at this hour is offline, at home and unlabelled until they
wake. They never chat, never send asks, decline every ask sent to them, and the autopilot's plan
isn't saved (it re-plans on load). `window.__liveraSolo.autopilotStatus()` on the page shows
what each one is up to.

### Tests (`web/tests/run_solo_e2e.sh`)

Chromium at 390x844 (touch) and 1280x800: the town screen has no login and shows both notices;
New town → pick Dominique (she starts at home, the autopilot is running); the map draws; after
exiting, scripted founders come into sight and one moves within 60 s of game time (the page's
`__liveraSolo.advance(seconds)` fast-forwards if needed) and a scripted person's card says
"played by a script"; tap the ground to walk (the core moves you); Heritage Coffee: Go inside,
buy by card (the balance drops by the price); say something with `<img onerror>` in it ("Heard
by N" or "Nobody heard you", nothing becomes HTML); Save now → reload → Continue names who you
were playing, and the balance, the place and the position survived (checked in the client and
with `look`); Export downloads a `livera-solo-save/1` record, Start over asks first and leaves no
save, importing the file brings the same balance back; hiding the tab stops the ticks and saves,
showing the tab resumes them; Change who you play: the picker marks exactly the founders the
autopilot has in the world "on autopilot right now" (compared with `solo_autopilot_status`),
and the one you left is marked after you switch; the phone (26 apps, bank,
the map app's Show); 44 px tap targets, 16 px inputs, no sideways scroll, no overlap, the two
HUD notes stay short; the creator makes a playable character; no console errors or dialogs.
Screenshots go to `LIVERA_SHOTS`.

## Module map

| File | What it does |
|---|---|
| `gateway/gateway.mjs` | WebSocket `/ws` ↔ one TCP connection per browser. One WS text message = one request line (over 16 KB, binary or containing a newline: closed). Ping every 25 s, at most 256 connections in all and 8 per IPv4 address or IPv6 /64 (`X-Forwarded-For` only from loopback), origin allow-list, optional static files. No game logic. |
| `gateway/test_gateway.mjs` | The connection-cap tests (run by `run_e2e.sh`, or `npm test` in `gateway/`). |
| `client/index.html` | The page shell. Strict CSP (`'self'` only), no external fonts or scripts. |
| `client/main.js` | Game controller: session flow (connect, resume or log in, pick or create, play), events, polling, and every intent (walk, go inside, buy, ride, say, interact, tip, LivPay, give, ask, answer, work, study, phone). Walk-then-act (go inside, take the bus, talk to someone) waits for the server to say you've arrived. |
| `client/transport.js` | WebSocket, request/reply by `id`, events, reconnect with backoff (reset only by the server's `welcome`), `resume` with the stored token. A reconnect resumes with `take_over: false`, so a device that dropped off never kicks the device the player moved to; opening the page or "Play here instead" sends `take_over: true`. |
| `client/state.js` | The live world model: rules, map, transit, interactions, you, the people in sight with straight-line prediction, clock from `look.time.minute` and `rules.minutes_per_real_second`, money, weather, bubbles. |
| `client/render2d.js` | The isometric canvas renderer forked from the preview (projection, buildings, cranes, weather, day/night, bubbles, voice ring, tap hit-testing, drag / pinch / wheel). Replaceable by a three.js renderer behind the same small interface. |
| `client/layout.js` | **The sketch**: building sizes by type, roads, river, park outlines, trees, colours. |
| `client/ui.js` | Top bar, chat bar, feed and toasts, bottom sheets (place, scene inside, person, bus stop, ask, needs, log, menu). |
| `client/phone.js` | The phone: all 26 apps as cards; bank, messages (updated in place as messages arrive), map, transit, career and romance (answer asks still waiting) screens; any other app shown as labelled fields. |
| `client/creator.js` | Character creator form generated from `creator_options`. |
| `client/dom.js` | `el()` (DOM building with text nodes only), money formatting, faces, safe localStorage. |
| `client/faces/` | 160 px face crops by character id; `manifest.json` lists them so the page never requests a missing image. |

## What is a sketch, and what is real

Real, from the server: every door position, place name, type, district and open/closed/under
construction status (the map is fetched again each game hour, so statuses follow the opening
hours), bus stops and fares, everyone's position and movement, the clock, the
weather, prices, balances, needs, speech, and every outcome.

Sketch, drawn by hand in `layout.js`: building sizes and heights, street lines, the river, park
outlines, trees and colours. The page says so on screen ("2.5D preview: street layout and
building shapes are sketches"). Other labels on screen: "played by a script" on characters a
`bot_` account plays, "single-rider shuttle" on the bus (shared buses come in Phase 1), and
"placeholder landmark" on civic places the data marks as not enterable (the fire station).

## What works

Checked by the end-to-end tests (`web/tests/run_e2e.sh`, Chromium at 390x844 and 1280x800,
against the `livera/1` server in this repo; 31 tests):

- Register, log in and pick a founding character; make one in the creator. Resume with the token
  after a reload and after a dropped connection. Logging in on another device moves the session
  there (the first device shows "Play here instead" and doesn't fight back), and a phone that slept
  through that doesn't take the session back when it wakes. A dropped connection keeps a
  half-filled login form and creator; while the game server is down, reconnects back off.
- The map draws (buildings, bus stops); tap the ground to walk (the server moves you); tap a
  building for its card, Go inside (walks to the door, then enters), Exit; closing the scene card
  inside leaves the pill with Exit. Open / closed on a place follows the game clock.
- Inside Heritage Coffee: the scene card's offers, buying by card (the bank balance drops by the
  price). At Livéra University: Enroll in a program, Start and End studying (not offered at home).
- Bus: tap a stop; the sheet lists the line's other stops; Ride charges the fare.
- Chat: Say and Shout reach a player nearby (shouts are marked), bubbles on both maps, "Heard by N"
  for the speaker; Whisper offers only people within whisper range (and stops offering them when
  you walk away); the chat bar says who a whisper or Say reaches, outdoors and inside; onlookers get
  "… whispers to …" and never the words.
- People: another player is drawn with a position and seen moving; a script's character is
  labelled "played by a script" on its card and in the picker.
- Person card: interactions come from `map.interactions`, and one out of range walks you over
  first (Chat). Asking on a date opens Accept / Decline for the other player, with when the ask
  passes; the asker hears the answer; the phone's Romance app answers an ask closed by mistake;
  an ask that passed closes.
- Phone: all 26 apps, the bank, sending a message (the other player gets it), a message arriving
  while you type keeps your drafts and focus, another app as cards, the map app's Show.
- Phone layout: 44 px tap targets, 16 px inputs, no sideways scroll, top bar, map controls and
  chat bar never overlap (also at 1280x800); with a sheet open, bubbles stay below the top bar and
  the feed shows one line; lifting one finger after a pinch doesn't make the map jump.
- Speech and messages containing `<img src=x onerror=…>` stay text; no console errors or dialogs.

Built but not covered by the tests yet:

- Log out. Faces and "taken" on the picker cards.
- Inside: buying with cash or by phone, activities, work start/end. Apartment buildings' unit
  lists are drawn but not checked.
- Bus: choosing the destination, cash / LivPay / dodging the fare, walking to the stop first,
  riders drawn on a labelled single-rider shuttle.
- The voice ring on the map; whisper from the person card; tip, LivPay and give an item; the
  asks other than date (kiss, propose, marry, intimacy, move in).
- Phone: the transit and career screens, and walking somewhere from the map app.
- The top bar (clock, day, weather, money, lowest needs) and the needs sheet; day / night and the
  weather on the map.
- Drag, pinch and wheel zoom, and the follow-me and whole-town buttons (only the pinch-then-lift
  case above is tested); safe-area insets; the CSP (`'self'` only, no inline scripts).

## What doesn't, yet

- **Against an older (`livera-dev/1`) server** the client degrades: other people are listed
  (scene card, whisper targets by distance) but not drawn, because that protocol has no
  positions; there's no resume (a dropped connection asks for the password again); the bus
  ride is predicted at walking speed between polls; interactions aren't offered because the map
  doesn't list them.
- Interiors aren't drawn: inside a building you stand at its door on the map and the scene card
  is the room.
- Bodies aren't drawn: people are face portraits on a stick; characters made in the creator show
  initials.
- Children, pets and vehicles aren't on the map (the server doesn't place them yet).
- Songs: `performance` events are announced in the feed but not played; the studio and stage
  ops have no screens here yet (the studio app shows its data as cards).
- No moderation tools (mute, block, report) and no voice yet; both are planned before strangers
  join.
- Applying for a job (`apply`) and dropping out of a program (`enroll` with no program) have no
  screens yet: the jobs and school apps show their data as cards, and the career screen says so.
- Studying at home on a laptop (online programs) isn't offered here; study at the campus.
- Not tested on real iOS Safari or Android Chrome devices, only Chromium with phone emulation.
