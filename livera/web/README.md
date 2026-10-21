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
livera/web/tests/run_e2e.sh                    # the gateway's caps, then e2e.js
livera/web/tests/run_e2e.sh five_players.js    # only the named test files, on the same fresh server
```

First `web/gateway/test_gateway.mjs` checks the gateway's connection caps against a stand-in game
server (the total cap answers 503; addresses in one IPv6 /64, or an IPv4 address and its
IPv4-mapped form, share one count of 8). Then it starts a server on a fresh temporary database,
the gateway, and Chromium (Playwright, installed globally) playing at 390x844 (phone, touch) and
1280x800. It registers players, picks characters,
taps to walk, walks into Heritage Coffee and buys a coffee (bank balance drops by the price), talks
with say / shout / whisper between two browsers, checks that whisper only offers people in range,
sends `<img src=x onerror=alert(1)>` as speech and as a phone message and checks nothing became
HTML, opens the bus sheet and rides (fare charged), opens the phone (the everyday seven, More apps, bank, a message thread, an
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
web/tests/run_solo_e2e.sh phone_e2e.js      # only the named test files (the phone, the verbs, the creator), same static server
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
| `tests/solo_e2e.js`, `tests/run_solo_e2e.sh` | The end-to-end tests below; the runner serves `web/client` with a plain static server on `LIVERA_SOLO_PORT` (18950) and runs `solo_e2e.js`, or the test files named as arguments. |
| `tests/interiors_e2e.js` | Rooms (D-066) against the single-player page (`run_solo_e2e.sh interiors_e2e.js`), phone (390x844, touch) and desktop (1440x900): inside Heritage Coffee the room covers the town with you at the entrance (`look.here.room`); tapping a chair at the long table seats you (the server says so); tapping the counter opens the card's Buy and buying serves you at the counter; tapping open floor walks you there (`move_inside`); the Map button shows the town without leaving and Room brings it back; the stage asks for a song; tapping the door takes you outside and the town returns. Then two people through Play together's stand-in platform (`together/`, both tabs in one browser): one sits, the other sees her in that chair, gets her card on tapping it and `spot_taken` from the server, and takes it once she has left by the door. No console errors; screenshots to `LIVERA_SHOTS`. |
| `tests/phone_e2e.js` | The phone, the verbs and the creator against the single-player page (`run_solo_e2e.sh phone_e2e.js`): the grouped home screen with no coin store, every app readable at 390 px (no raw ids or internal keys, nothing a letter per line, no sideways scroll, 44 px targets), going to work, starting a shift and answering a decision (the server's verdict shown), Apply in Jobs (walks to the door, the server hires you), Join at Riverside Clubhouse (`verbs.js`) and from Sports (the league fee is charged), Contacts with only your side and Message, the Calendar's agenda, Homes with what you can afford, and the creator (every error at once, the exact age hidden for a one-year group, Surprise me, the quick start alone); screenshots at 390x844 and 1440x900. |
| `tests/people_e2e.js` | The town's people (D-073, `run_solo_e2e.sh people_e2e.js`), phone and desktop: the pick list has all 27, grouped founders, residents, townspeople (two columns on a desktop, no sideways scroll on a phone); Tess Osei at Livéra General is a stand-in and her card says so, played by a script; the Copper Tap at 19:45 has Bernie behind the bar and patrons. Screenshots to `LIVERA_SHOTS`. |
| `tests/moments_e2e.js` | Life events and the street (`run_solo_e2e.sh moments_e2e.js`; its Play-together part uses the same server's `/together/` page): a life event's card on a phone and a desktop, a choice applied (money moved only as the ledger moved it), the Story app; shoplifting at Thread & Co. with the odds and the ladder first, caught, the cell's card and the Held chip, released; on the person card, a pickpocket's odds and Back sending nothing; a fight between two people (the ladder, the friend's Fight back / Run / Take it, both result cards) until it's reported and the Wanted chip shows; the You card's "Always walk away from fights". Screenshots at 390x844 and 1440x900. |
| `client/solo/artifact.html` | The same page as published to a Claude artifact: no document skeleton (the artifact adds one), sets `data-boot="solo"` and `LIVERA_IN_ARTIFACT` before the modules run, and sits at the root of the published files. That viewer blocks downloads, so the page offers no Export there; saves stay in that browser, and Import still works. |

**Publishing it as an artifact.** Lay the files out as the page expects, the page at the root
and everything else at its `web/client` path: `css/app.css`, the client modules (`main.js`,
`transport.js`, `state.js`, `render2d.js`, `ui.js`, `phone.js`, `creator.js`, `verbs.js`, `dom.js`,
`layout.js`, `icons.js`, `messages.js`, `today.js`, `places.js`, `onboarding.js`, `figures.js`, `interior.js`, `moments.js`, `brawl.js`), `css/phone.css` (`phone.js` loads it), `css/room.css` (`interior.js` loads it), `css/moments.css` (`moments.js` loads it), `css/brawl.css` (`brawl.js` loads it), `faces/` with its `manifest.json`, `sprites/` with its `manifest.json`, `rooms/` with its `manifest.json`, `tiles/`
with its `manifest.json`, `figures/` (a folder per character) with its `manifest.json`, `fonts/` (three WOFF2 files and their licences), and `solo/solo.js`,
`solo/transport_local.js`, `solo/save.js`, `solo/livera_solo.js`. Besides the faces, the fonts,
sprites, tiles and figures are binary files; a host that takes text files only can leave `fonts/` out (the
page falls back to Georgia / Times New Roman) and publish empty sprite and tile manifests (`[]`:
every building is drawn as a box, the ground, crane, bridge and stops by hand), an empty figures
manifest (`{}`: everyone is drawn as the stand-in body) and an empty rooms manifest (`{}`: every place keeps the
scene card). The module is built with the wasm inlined as base64
(`-sSINGLE_FILE_BINARY_ENCODE=0` in `CMakeLists.txt`), so every published file is plain text
without control characters, which the artifact publisher requires.

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
and the one you left is marked after you switch; the phone (the everyday seven on
the home screen, the rest under More apps, bank, the map app's Show); 44 px tap targets, 16 px inputs, no sideways scroll, nothing overlapping the
bar or the dock, the attribution keeps both notices' full sentences; the redesign (D-065): an
activity shows its need change, the Next card points at the workplace before a shift and names
its source, the doing-now pill's Stop stops you, Places search finds Heritage Coffee, Esc closes
the top layer, the stop card picks no destination for you, "How it works" on the town screen; the
creator makes a playable character; no console errors or dialogs. `run_solo_e2e.sh phone_e2e.js`
runs the phone, verbs and creator tests instead.
Screenshots go to `LIVERA_SHOTS`.

## Play together

`web/client/together/` lets a few friends share one town with no server: one person's browser tab
hosts it (the game core in WebAssembly, the same module as single-player, through
`protocol::LocalTown`'s `town_*` functions) and everyone plays through the same client, published as
one Claude artifact. The page says on the lobby, the menu and the HUD that the town runs in the
host's browser, pauses while the host's tab is hidden or closed, and that the host's browser holds
everyone's state. How it works, the database layout, the security model and how to share it:
`docs/MULTIPLAYER.md`, "Play together in the browser" (D-057).

```
host's tab:    web/client (same modules) ──pipe──▶ together/host.js (lease, claims, saves; town_* in solo/livera_solo.js)
friend's tab:  web/client (same modules) ──request(op)──▶ together/transport_room.js ──link.js──▶ the artifact's room ──▶ host's tab
```

### Run, test

```bash
cd livera/web/gateway && STATIC_DIR=../client node gateway.mjs        # or any static server for web/client
# open http://127.0.0.1:8080/together/?as=dee&level=owner&name=Dee      and press "Host the town here"
# then, in more tabs of the same browser: ?as=ali&level=interact&name=Ali, ?as=gray&level=interact&name=Gray, ...
livera/web/tests/run_together_e2e.sh       # the link's unit tests, then five pages in one Chromium
livera/web/tests/run_e2e.sh five_players.js   # the same five-people checks against the live server
```

Locally, `together/index.html` loads `together/fake_platform.js`, a stand-in for the artifact
platform's `room`, `db` and `user`: every tab of the browser is one person (`as`, `level`, `name` in
the address; `space` isolates a run; `drop` loses that share of room messages). It enforces what the
page relies on: undeclared topics are admin-only, 4 KiB messages, about 40 sends a second (more are
dropped and reported as an error), the sender stamped by the platform, the database rules by level,
256 KiB documents, and leases (IndexedDB transactions across tabs).

`run_together_e2e.sh` (port `LIVERA_TOGETHER_PORT`, 18960; `LIVERA_TOGETHER_DROP`, default 0.05)
runs `together_link.mjs` (Node: chunking under 4 KiB, delivery once and in order through a room that
drops a quarter of its messages, giving up and skipping, keys only the right page can use, a forged
frame doing nothing, a page with no identity turned away) and then `together_e2e.js`, 15 tests with
five pages (a host, four friends; one at 390x844): every lobby states the three facts above and only
the owner is offered hosting; the host founds a town on an empty database; four friends join as four
other characters; a taken character is marked on the picker and refused (`character_taken`,
`already_playing`, `already_has_character`); a Contributor can't send on the host's topic, read or
write the save, the claims or `town/host`, and a made-up frame in their own channel does nothing;
the server's request and chat limits hold; everyone sees the other four on the map; a say reaches
only those in range (`<img onerror>` stays text); a buy changes only the buyer's money; the host's
tab hiding pauses everyone (banner, `town_paused`, no ticks, a save) and showing it resumes; the host
reloading stops the town and says so (no Contributor takes over) and hosting again brings everyone
back from the save, money, places and positions intact; the host closing hands over to an Editor who
has played; a second tab of the same person takes over and the first can take it back; Stop hosting
(the menu) saves and ends the town for everyone, and the host that stopped doesn't take it back; a
save whose checksum doesn't match is refused and a new town needs a confirm (the old claims go with
the old town); the link resent what the room dropped and gave up on nothing; no console errors.

`run_together_e2e.sh social_e2e.js` runs the social media test instead (D-074), with four pages: the host
(Dominique, on a 390x844 phone), Dax at 1440x900, Julian and Leila, and the founders nobody plays on the autopilot.
The home screen leads with the everyday apps; a post from Heritage Coffee tagging Dax shows the place's own picture
and the tag (Dax is told); Dax likes, comments and follows through his app and Dominique gets a toast for each and an
Activity list; a post the game wrote for someone a script plays arrives (fast-forwarded), labelled, and is liked and
its author followed; Dax argues with Julian in front of Dominique and @livera.unfiltered posts it with "Heard by",
Dominique told whether it's true (she was there), Leila (who wasn't) seeing it only in the Town tab without the truth,
the account's profile giving nothing away, and her Following feed having it once she follows; Messages: a thread with
Delivered, then Seen once Dax opens his, and Aaliyah (played by a script, labelled) answering by the data; the Map:
Dax "Here with you at Heritage Coffee", Leila not, places open now, Walk there walks in; the next morning the feed
opens with Last night in Livéra holding the night's post; no console errors.

### Files

| File | What it does |
|---|---|
| `together/together.js` | The page shell: `TogetherGame extends Game`. Finds the platform (`claude.use("room" / "db" / "user")`, `null` handled), watches `town/host` and the room to know who hosts and whether their page is still there, shows the lobby (who hosts, who's here, Join, Host for admins), its own picker and menu (Save now, Stop hosting, Leave the town, who plays whom for the host), the paused and host-left banners, puts people back in their character after a handover or the host's return, and hands over: an admin's page that has played here and is in front takes the lease when the host goes. `window.__liveraTogether` is the tests' view. |
| `together/host.js` | `TownHost`: the lease on `town/host`, loading or founding the town, the autopilot for unclaimed founders, one session per page, the server's session ops (`characters`, `create_character`, `play`, `logout`, with the server's refusals and claims in `town/claims`), every other op through `town_request`, the server's rate limits, the 10 Hz tick routed per character, pausing while hidden, saves (gzipped, split, two slots, SHA-256), stopping and losing the lease, and the host player's own pipe. |
| `together/link.js` | The wire: key agreement and per-direction AES-GCM keys, gzip, 4 KiB chunks, numbered frames with acknowledgements, resends and in-order delivery, one pacer for the page's sends; `FriendEnd` (a friend's pipe to the host) and `HostEnd` (the host's channels, bound to the platform-stamped sender). |
| `together/transport_room.js` | `RoomTransport`: the `transport.js` interface over a pipe (a friend's `FriendEnd`, or the host's own straight into `TownHost`); replies by id, events, the town's public status. |
| `together/fake_platform.js` | The stand-in for the platform, for tests and local runs only. Exports `CAPABILITIES`, the declaration below. |
| `together/index.html` | The local page: the same shell as `client/index.html` with `data-boot="together"`, loading `fake_platform.js` then `together.js`. |
| `together/artifact.html` | The page as published (no document skeleton, sets `data-boot="together"` and `LIVERA_IN_ARTIFACT` before the modules run). |
| `tests/together_link.mjs`, `tests/together_e2e.js`, `tests/run_together_e2e.sh` | The tests above. |
| `tests/five_players.js` | Five browsers on the live server through the gateway: accounts, five characters, everyone sees the other four, a say reaches only those in range, a buy moves only the buyer's money, a taken character is refused (the picker and the raw protocol). Run with `run_e2e.sh five_players.js`. |

The seam in the shared code: `main.js` boots the live game only when `<body>` has no `data-boot`
(single-player sets `solo`, Play together `together`). Nothing else in the client changed; the
host-paused and host-left banners use the existing `#conn` line (`ui.setConnection`).

### Publishing it as an artifact

The page is `together/artifact.html`, published at the root; everything else keeps its
`web/client` path: `css/app.css`; `main.js`, `transport.js`, `state.js`, `render2d.js`, `ui.js`,
`phone.js`, `creator.js`, `verbs.js`, `dom.js`, `layout.js`, `icons.js`, `messages.js`, `today.js`, `places.js`,
`onboarding.js`, `figures.js`, `interior.js`, `moments.js`, `brawl.js`; `css/phone.css`, `css/room.css`, `css/moments.css`, `css/brawl.css`; `faces/` and `sprites/` and `tiles/` and `figures/` and `rooms/`, each with its
`manifest.json`; `fonts/` (three WOFF2 files and their licences); `solo/livera_solo.js`; and
`together/together.js`, `together/host.js`, `together/link.js`, `together/transport_room.js`. Not
`together/fake_platform.js`, `together/index.html` or `together/package.json` (it only lets Node's
tests import `link.js` as a module). As for single-player, a host that takes text
files only can leave `fonts/` out and publish empty manifests for `sprites/` and `tiles/` (and `{}` for `figures/`). Declare:

```json
{
  "room": { "topics": { "up": "interact" } },
  "db": { "rules": [
    { "path": "town", "read": "admin", "write": "admin" },
    { "path": "town/host", "read": "view", "write": "admin" }
  ] },
  "user": { "scopes": ["profile"] }
}
```

`up` is the only topic open to Contributors (their moves to the host); `down`, the host's, stays
admin-only. The save and the claims are admin-only; `town/host` (a public key, a page label, the host's
id, paused or not) is readable by everyone who can open the page, so friends find the host and
Viewers see whether anyone hosts. `user` gives everyone's id (who plays whom) and names for "Who's here". Then share
the artifact and give friends Contributor access (`docs/MULTIPLAYER.md`, "How to share it").

## Module map

| File | What it does |
|---|---|
| `gateway/gateway.mjs` | WebSocket `/ws` ↔ one TCP connection per browser. One WS text message = one request line (over 16 KB, binary or containing a newline: closed). Ping every 25 s, at most 256 connections in all and 8 per IPv4 address or IPv6 /64 (`X-Forwarded-For` only from loopback), origin allow-list, optional static files. No game logic. |
| `gateway/test_gateway.mjs` | The connection-cap tests (run by `run_e2e.sh`, or `npm test` in `gateway/`). |
| `client/index.html` | The page shell. Strict CSP (`'self'` only), no external fonts or scripts. |
| `client/main.js` | Game controller: session flow (connect, resume or log in, pick or create, play), events, polling, and every intent (walk, go inside, buy, ride, say, interact, tip, LivPay, give, ask, answer, work, study, phone). Walk-then-act (go inside, take the bus, talk to someone) waits for the server to say you've arrived. |
| `client/transport.js` | WebSocket, request/reply by `id`, events, reconnect with backoff (reset only by the server's `welcome`), `resume` with the stored token. A reconnect resumes with `take_over: false`, so a device that dropped off never kicks the device the player moved to; opening the page or "Play here instead" sends `take_over: true`. |
| `client/state.js` | The live world model: rules, map, transit, interactions, you, the people in sight with straight-line prediction, clock from `look.time.minute` and `rules.minutes_per_real_second`, money, weather, bubbles. |
| `client/render2d.js` | The isometric canvas renderer forked from the preview (projection, buildings, cranes, weather, day/night, bubbles, voice ring, tap hit-testing, drag / pinch / wheel), and the owner's ground textures and set pieces laid on it (see "The look"). People are drawn whole with `figures.js`, at real scale against the building pictures (1.75 m is 1.75 x 2.2 sketch units: the pictures paint about 2.2 times the sketch's metres), facing and walking their way, name plates and speech above their heads, a tap target of at least 44 px around the whole figure (people win over buildings; in a crowd the nearest figure); zoom goes in to 14 so a person can be seen close up. Replaceable by a three.js renderer behind the same small interface. |
| `client/layout.js` | **The sketch**: building sizes by type, roads, river and bridge, park outlines, trees and street trees, the palette and the light by the hour (`LIGHT`), and where the ground tiles and set pieces go (`TILE_METERS`, `BRIDGE_ART`, `PARK_ART`, `ROAD_WORKS`, …). |
| `client/ui.js` | The map-first layout (D-065): the status strip (clock, money, menu), need chips only when low, the faces of people in sight, the dock (the Next card, the Talk composer, the attribution line) and the bar (Places, Talk, the context button: Stop, Exit, Go or Today; Phone; You). Cards with three heights (place, scene inside, person, bus stop, ask, You, Today, log with Speech and Activity), the doing-now pill, toasts that are also logged, the pay stub and promotion banner, need warnings with the nearest fix, keyboard shortcuts. |
| `client/icons.js` | One inline SVG icon set (bar, map controls, sheet chrome, every phone app) built with the DOM API, and the same paths for canvas labels. |
| `client/messages.js` | Server refusals as plain sentences with a next step, and opening hours in words. |
| `client/today.js` | The Next card's rules and the Today sheet, built only from your own data (needs, your workplace and shift, decisions waiting, your routine, bills due); every line names its source. |
| `client/places.js` | The Places sheet: search, categories, your home and workplace pinned, open or closed and the distance, Go and Show. |
| `client/onboarding.js` | The first-morning checklist (ticked from real game state), three one-time coach marks, and "How it works". |
| `client/phone.js` | The phone (D-074): the home screen leads with what you use every day (Social, Messages, Map, Bank, Work, Calendar, People), each with its count of new things; every other app (27 in all) is one tap deeper under More apps, grouped under Everyday, Life, Ambition and Town, one icon each (`icons.js`); no coin store in a browser town (single-player, Play together). Back from an app returns where you opened it. Screens for Social (`social.js`), Messages (your conversations newest first, then a thread per person: bubbles, Delivered / Seen under your last message from the server's read flag, "Played by a script" or "Away" with a line on what that means; a new message from the list's contact picker; a message or a `message_seen` arriving updates the list or the thread in place, keeping what you typed and the focus), the Map (the `map` app's `{open_now, people}` over the town the client already has: a plan with the places open now in gold, you, and your people where your character could know they are, in sight or where they last posted from; then Your people with Walk over / Walk to their place / Message, Open now nearest first with Walk there (out of where you are, in through the door) and Show, and All places folded), Work (decisions as cards → `work_answer`, the server's verdict, shift and promotion), Calendar (Today and This week from your routine, with Go), People (your side only, as bars; Message, Profile), Jobs (Apply), Homes (your home and rent; listings with what you can afford; Buy), Sports (fixtures, table, rosters; Join / Leave), Items (Wear, Take off, Use, laundry), Pets (adopt, care, the vet), Studio (perform, release), Wallet, Store, Alerts, Romance (answer asks still waiting), Bank, Map, Transit (ride to a stop from your nearest one), Career, School, City, Fame, Weather, Record and Goals (when the server has it). `generic()` shows any other answer readably: fields stacked on phones, ids and internal keys hidden, times as "Mon, Day 3 · 18:00", 0–100 stats as bars, yes/no in words, "none yet". Loads `css/phone.css` itself. |
| `client/verbs.js` | Every verb where it happens: `placeActions(game, place)` lists what the server lets you do at a place (join or leave a league team at the clubhouse or the court, apply at an employer's door, adopt at the shelter, the vet, pet care at home, laundry at home or the laundromat, buy a home for sale with the price and an affordability estimate, perform on a stage when the map says it is one), each walking you there first (out of the building you're in, unless you're on shift or studying). `run()` resolves to the server's reply with a one-line `summary`; refusals are the server's. Also the phone's verbs and the text helpers (times, the server's terminal hints made readable). |
| `client/social.js` | The Social app (D-074), all the server's answer: tabs Feed (in the morning it opens with Last night in Livéra, the night's most liked posts and @livera.unfiltered's; then the composer: text with a counter, the place you're in as a chip, tags among people you know (the server refuses anyone else), and for whoever runs the gossip account "Post as"; then "Share it?" cards for things that happened to you, in your voice, never posted for you; then your feed), Town (every public post), Activity (likes, comments, follows, tags, posts about you; new ones marked) and You (your profile, the gossip account, people you know with Follow, your posts). A post card: the face (a gold mask for the anonymous account), name, handle and how long ago, "Played by a script" or "Anonymous", the topic, the text (text nodes only), who's in it (tap for their profile), the place's own picture (its room from `rooms/`, else its building from `sprites/`, captioned with its name: never a photo of anyone), for gossip "Heard by N" and the truth only if you were there ("Is it true? Only the people who were there know."), a note when the game wrote it, Like (aria-pressed), Comment (a field under the card) and the latest comments. Profiles have Follow / Following and Message. A `social` event while you're elsewhere is a toast with View (the server keeps them to a few an hour, one a day from the game); while the app is open it refreshes in place. Loads `css/social.css` itself. |
| `client/css/social.css` | The Social app, Messages threads and the Map's plan and lists, in the palette of `app.css`. |
| `client/css/phone.css` | The phone's screens, the verbs and the creator, in the same palette and type as `app.css`. |
| `client/creator.js` | Character creator generated from `creator_options`: a quick start (name, pronouns and gender, why you moved, education and job; the job list follows the entry requirements when the server marks them), the rest under "Customize more" with legal values in place (your look and age group at random; traits, interests and goals picked at random on submit unless you choose them, and said so), "Surprise me", and every problem shown at once beside its field. |
| `client/interior.js` | Rooms you walk around in (D-066). Inside a place whose `look.here.room` describes a room and whose picture is in `rooms/manifest.json`, the town gives way to the room: the picture fitted to the screen (on a phone it fills the height and follows you sideways; drag and pinch to look around, the wheel on a desktop), lit by the game clock with `LIGHT` (daylight softens it, golden hour warms it, night dims it around its own lamps), everyone inside drawn with `figures.js` at their point or seat, back to front, with furniture in front of them drawn again over them (its `blocked` footprint raised by its height; for a seated frame also furniture in front of the knees, and the far part of the furniture its seat belongs to, a booth's table: D-072), first names over heads. Tap the floor → `move_inside` (the walk is animated from where you're drawn); a seat → `sit` (someone else's seat opens their card); the counter → the scene card's Buy; a spot with an activity → that activity; the stage → the card's Perform (or a word about needing a song); a work station → the card's shift button; the door → Exit; a person → their card. A spot's name shows on hover and on tap; Stand up shows while you sit; the low-key Map button shows the town without leaving (Room brings it back). The `room` event moves people between looks. Loads `css/room.css` itself; `window.__liveraRoom` is the tests' read-only view (`drawn(id)`: the pose, frame and anchor someone was drawn with). |
| `client/moments.js` | Life events and the street (D-068, D-069, D-070). A `life_event` slides up as a card (the prompt, the choices as big buttons with what a choice costs, then what happened and what changed); "Later", or walking off, keeps it in a pill and the phone's Story app until it lapses. `confirmCrime` is the card before any crime (the server's `crime_risk` odds, never a made-up number, and the consequence ladder; Back sends nothing). Also the fight card (Fight back / Run / Take it with the window's timer), the result card, the Wanted and Held chips under the strip, the cell's card and the release, the You card's street lines and "Always walk away from fights", an officer's badge and the scuffle drawn over the map or the room, and the Story app's screen (`storyScreen`). Loads `css/moments.css` itself; `window.__liveraMoments` is the tests' read-only view. |
| `client/brawl.js` | Beat Brawl (D-077): the letterboxed fight screen moments.js opens when a fight is fought beat by beat. Both composure bars, the round, your edge; the two of you drawn with `drawFigure` (fight and flinch poses) on a pool of light; their tell (HOOK, JAB, SHOVE, OPEN) over the one throwing with a ring that closes as the beat runs out and turns gold for perfect timing; Duck / Block / Jab as 76 px buttons (A S D or the arrows) and Walk away; round one shows the answer that beats the tell. Each beat's outcome as a callout, with a shake, a flash, a thump and a vibration when you're hit (none of it with reduce motion). Sends only `fight_beat`; every outcome is the server's `brawl_hit`. Loads `css/brawl.css` itself. |
| `client/rooms/` | The owner's interior pictures (`art/interiors/`) as the client draws them, made by `scripts/client_rooms.py` (Python 3 + Pillow; run it again when a picture or `data/interiors/` changes, `--check` says whether it's up to date): the generator's halo outside the room trimmed to a clean edge, cropped to the room, at most 1536 px wide, WebP q85. `manifest.json` gives each one's size and its offset and scale against the picture, which is the room data's coordinate system; only ids listed there are requested. |
| `client/dom.js` | `el()` (DOM building with text nodes only), money formatting, the face, sprite and tile manifests, safe localStorage, `castGroups()` (the pick list grouped by `cast`: founders, residents, townspeople, made here; D-073). |
| `client/faces/` | 160 px face crops by character id; `manifest.json` lists them so the page never requests a missing image. |
| `client/figures.js` | The one way a whole person is drawn, on the map and inside: `drawFigure(ctx, person, x, y, {height, facing, mirror, pose, phase, night, selected, scripted, seat, seatKind})` with the feet at (x, y), `height` being a 1.75 m person there (everyone at their own height); `facingFor(dx, dy)` picks the view from a movement on screen; `figureReady(id)`, `loadFigureManifest()`, `artStatus(id)` (art, standin, plain: the person card says when someone is a stand-in), `seatHeight(kind)` / `seatTune(kind)` (the manifest's `"$seats"`). A character with a sprite sheet is drawn from its frames (D-072): the four-frame walk toward or away from the camera by `phase` (four frames a step), the standing frames, and for `pose: "sit"` the real seated frame with its seat point on the seat, facing the seat's way (`seatKind` sofa or bed: `sit_sofa`; any other kind: `sit_chair`); a seat facing away from the camera lowers the standing back frame onto it (there is no seated frame from behind). Otherwise the owner's model-sheet cut-outs (the nearest view they have), or a stand-in body: in a townsperson's own colours, hair (short, buzz, curls, long, bun, bald, cap, hijab), apron or headwear and height from `figures/standins.json` (D-073), else in neutral colours, labelled as such in the code and D-067; walking bobs, sitting lowers the standing figure into the seat and clips it there. `fight` and `flinch` lean, crouch and bounce or shake any picture (the stand-in raises its fists or covers its face); scaled, lit pictures cached per height bucket and light step. |
| `client/figures/` | Made by `scripts/client_figures.py` (360 px for a 1.75 m person): a sprite sheet's frames, `<id>/<frame>.webp` (`walk_front34_1..4`, `walk_back34_1..4`, `idle_front34`, `idle_back34`, `sit_chair`, `sit_sofa`; the generator's chair and sofa taken out of the seated ones), or a model sheet's cut-outs, `<id>/<view>.webp` (front, front34, side, back34, back). `manifest.json` gives each picture's size, its anchor (`foot`, or a seated frame's `seat`) and which way it faces, so only listed files are requested, and `"$seats"`: per kind of seat its height, a nudge of the seated frames and how far ahead of the seat its own furniture covers the legs (`interior.js`). `standins.json` (made by `scripts/client_standins.py` from `data/characters` `profile.appearance.stand_in`) gives the stand-in colours and heights of the town characters with no art yet. |
| `client/sprites/` | The owner's pictures of 51 buildings and parks (Heritage Coffee, Greenleaf Market, Founders School, the police station, Station 1, …) and of the construction sites' stages, drawn on the map in place of their boxes. They come from `art/places/` (made with the prompt pack in `scripts/town_prompts.py`) as map-size copies: 640 px wide, transparent WebP, cropped to their content. `manifest.json` lists them, so the page never requests one that isn't there; the box is drawn until a picture has loaded. |
| `client/tiles/` | The owner's ground tiles and set pieces (`art/tiles/`, `art/transit/stops/`) as the client uses them, made by `scripts/client_tiles.py` (Python 3 + Pillow; run it again when that art changes, `--preview DIR` writes 3x3 repeats to check for seams): ground textures (`grass`, `paving`, `asphalt`, `gravel`) re-projected from the art's 2:1 diamonds to top-down squares that repeat without seams, and set pieces (`crane`, `bridge`, four bus shelters) trimmed and scaled down. `manifest.json` gives each one's kind, size and anchor points (measured on the art); only ids listed there are requested, and without it the map keeps its hand-drawn ground. |
| `client/fonts/` | Cinzel and Cormorant Garamond (roman and italic), latin subset, self-hosted for the CSP's `font-src 'self'`; SIL Open Font License texts beside them. |

## The look

The client follows the owner's reference art (the Line 1 route poster, the transit card, the
golden-hour river): a cream parchment town of ivory and sand stone, warm brick (bar, church,
school, townhouses) and charcoal glass edged in gold (the Lexington, Whitaker Capital, Meridian
and the other offices), champagne-gold trim along the roofs, sage lawns and rounded trees, a
blue-teal river below a cream stone quay, and an arched stone bridge on Lexington Avenue's line.
Line 1 is drawn as on the poster: a gold loop through the stops in their order on the line, with a
numbered gold badge on each stop sign. The shuttle under a rider is emerald with a gold stripe and
an ivory roof.

The light follows the game clock (`LIGHT` in `layout.js`): warm champagne by day, golden hour at
dawn and dusk (a peach horizon rising to rose and lavender, gold glints on the water, long
shadows, sunlit faces), deep emerald-navy at night with lit windows, lamplight on the roads and
the bridge, and a few warm lights in the trees. Glints, fairy lights and neon hold still under
`prefers-reduced-motion`.

The chrome is deep emerald with champagne-gold borders and ivory text; primary buttons are gold
with emerald text. Type: Cinzel (letterspaced capitals) for the wordmark, eyebrows, badges and
map labels; Cormorant Garamond for headings and name plates; the system sans for body text and
numbers. The lotus mark is an inline SVG built with the DOM API (`lotus()` in `dom.js`), shown
over the wordmark on the full-screen screens and in the menu sheet. The fonts are self-hosted in
`client/fonts/` (OFL), so the live page's CSP is unchanged.

Most places are drawn with the owner's own pictures (`client/sprites/`, map-size copies of
`art/places/`, made with the prompt pack) instead of a box: each sits on its lot about 1.15 times
the width of its footprint, keeps its tap target, gets a gold outline of the lot when selected,
and is darkened at night with its own lit windows and lamps laid back on top. Places without a
picture keep the boxes above.

A building under construction shows its site's picture instead (the construction-site place that
shares its door in the map's data): the framed stage (`<site>_framed`) once the city app says its
project is active and at least 35% built, if there is a picture of it, else the bare site. The
crane picture (`client/tiles/crane.webp`) stands at the back of every active project's lot, except
where the site's own picture already paints cranes (Maple Court Phase II, ÉCLAT and Body & Balance
framed); planned projects get none. While Founders Way's project is active, the picture of its works
is laid along the road next to the site's door, west of Main Street: the bare site (machines parked
on the dirt road) until it is 35% along, then the framed stage (paver, half paved, half gravel); the
rest of the road stays gravel until the project is complete. The bare picture is drawn from a
flatter angle than the map's, so it keeps its proportions (times `stretch`) and is sheared to lie
along the road, where the framed one is stretched to fit. Willow Lake Park's
picture stands on the square between Lakeshore Drive and Willow Lane, on its lawn, in place of the
drawn lake and trees.

The ground is textured with the owner's tiles (`client/tiles/`, made by `scripts/client_tiles.py`):
grass on the lawns and parks, the pale stone slabs on the kerbs, plazas, the quay's promenade and
the bridge's approach, asphalt on the roads and gravel (its ruts along the road) on Founders Way
while it's unpaved. Each texture is a top-down square laid flat through the map's projection with
a `CanvasPattern` transform, so it scrolls and zooms with the map; it is baked at about the size it
is drawn (no shimmer when small) and lit exactly as the flat colours are (`lit()`), in steps. The
centre lines stop short of every junction. The flat ground is drawn into an offscreen canvas a
margin larger than the view and copied in each frame, re-drawn only when the zoom, the light step,
the places or the projects change or the view pans past the margin (mid-zoom the last copy is
stretched, unfiltered); the shadows, the river and everything standing on the ground stay live,
so the textures cost about nothing per frame. The bridge picture spans the river on Lexington Avenue's
line (mirrored: its art runs along the other axis), its reflection flipped about its waterline in
the water and its lamps glowing at night; every stop's bus shelter picture stands under its gold numbered badge,
which keeps its 44 px tap target (the shelter can be tapped too); a stop whose picture hasn't loaded
keeps its post. Not used: `road_corner` (the sketch's streets meet only in T junctions and
crossings, never a bend), `road_crossroad` (its roads run corner to corner of the diamond, at 45°
to the map's streets once re-projected; turned, only a corner of it fits a crossing and its stubs
don't meet the roads' lines; the centre lines' breaks give the same clean crossing at every
junction, T ones too, and `road_t` isn't made yet) and `river_edge` (its railing and water are
painted with height and golden light, its water lies beyond the railing where the map's river lies
in front of the quay, and its setts are painted in perspective; the quay uses the sidewalk slabs).
The ÉCLAT site pictures paint a river beside the lot, where the sketch has River Road.

None of this is game data: the bridge, the river, the street trees, the lawns and the light are
part of the sketch, like the building shapes, and so are where the tiles and set pieces go. No
building, tower or skyline is drawn that isn't in the server's map.

## What is a sketch, and what is real

Real, from the server: every door position, place name, type, district and open/closed/under
construction status (the map is fetched again each game hour, so statuses follow the opening
hours), bus stops and fares, everyone's position and movement, the clock, the
weather, prices, balances, needs, speech, and every outcome.

Sketch, drawn by hand in `layout.js`: building sizes and heights, street lines, the river and its
bridge, park outlines, trees, the lawns and colours, and where the owner's tiles and set pieces are
laid (the bridge picture, Willow Lake's picture, the Founders Way works, the crane marker: a
marker over each active project, not a count of real cranes). The page says so on screen ("2.5D preview:
street layout and building shapes are sketches"). Other labels on screen: "played by a script"
on characters a `bot_` account plays, "single-rider shuttle" on the bus (shared buses come in
Phase 1), and "placeholder landmark" on civic places the data marks as not enterable (the fire
station).

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
- Rooms are drawn only for the places whose pictures have been traced (`data/interiors/`, D-066); inside any
  other building you stand at its door on the map and the scene card is the room. Inside a room, walking is drawn
  as a straight line to where the server put you (no pathfinding around furniture), and the windows keep the
  picture's golden-hour sky at night (the room is dimmed and its lamps glow, but the sky isn't repainted).
- Ten characters are drawn from the owner's sprite sheets (D-072): a walk cycle, standing, and seated
  frames on the seat. The sheets have no seated frame from behind, so a seat that faces away from the
  camera (a bar stool at the bar, a desk) still shows a standing back frame lowered onto it; the
  generator's walk frames differ little, so the walk is gentle; where a room's traced seat sits a
  little off the chair in its picture, so does the person. Maya, Naomi, Kai Morgan, Rosa Delgado and
  Sol Rivera have no sheet yet and are drawn from their model sheets' photographs: one picture per
  direction, a bob for walking, a standing figure lowered into the seat. Characters made in the
  creator are a stand-in body in neutral colours: the protocol doesn't tell anyone else what they
  chose in the creator. The twelve townspeople (D-073) have no sheet yet: they're the same stand-in
  body in their own colours, hair and height (`figures/standins.json`), and their card says so.
  Model sheets and sprite sheets that replace the cut-outs and the stand-ins are prompted in
  `art/PROMPT_PACK_CHARACTERS.md`.
- Children, pets and vehicles aren't on the map (the server doesn't place them yet).
- Songs: `performance` events are announced in the feed but not played; writing and recording songs
  (`song_save`) has no screen yet (the Studio app says so; it performs and releases songs you have).
- No moderation tools (mute, block, report) and no voice yet; both are planned before strangers
  join.
- Dropping out of a program (`enroll` with no program), selling a home and moving between homes
  you own, naming a baby, child care, daycare and nannies have no screens yet; the School, Homes and
  Family apps say so.
- Studying at home on a laptop (online programs) isn't offered here; study at the campus.
- Not tested on real iOS Safari or Android Chrome devices, only Chromium with phone emulation.
