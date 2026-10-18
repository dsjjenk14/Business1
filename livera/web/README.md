# LIVÉRA web client (Phase 0)

A live, playable 2.5D web client for LIVÉRA, grown from the town preview. It runs in any phone
or desktop browser and talks to the real C++ game server through a small WebSocket gateway.
The server is still the only authority: the page sends intent ("walk here", "buy a latte", "say
this") and shows the server's answer or refusal word for word.

```
browser (web/client)  ──WebSocket /ws──▶  gateway (web/gateway, Node)  ──TCP, JSON lines──▶  livera_server
```

Background: `docs/proposals/web_client.md` (Phase 0) and the Phase 0 contract.

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
`STATIC_DIR` (optional). `GET /healthz` answers `ok`.

## Tests

```bash
livera/web/tests/run_e2e.sh
```

Starts a server on a fresh temporary database, the gateway, and Chromium (Playwright, installed
globally) playing at 390x844 (phone, touch) and 1280x800. It registers players, picks characters,
taps to walk, walks into Heritage Coffee and buys a coffee (bank balance drops by the price), talks
with say / shout / whisper between two browsers, checks that whisper only offers people in range,
sends `<img src=x onerror=alert(1)>` as speech and as a phone message and checks nothing became
HTML, opens the bus sheet and rides (fare charged), opens the phone (26 apps, bank, messages, an
app as cards), checks tap targets (44 px), input font size (16 px), sideways scrolling and overlap,
makes a character in the creator, checks that a dropped connection and a second login on another
device are handled (the first device stops instead of fighting back), and fails on any console
error. On a `livera/1` server it also
checks the people stream, interactions (walking over first), asks (Accept / Decline), the
`whispering` notice for onlookers, the "played by a script" label (a `bot_` account made with
`--add-account`), and resuming after a reload or a dropped connection. Against an older server
those tests report SKIP.

Env: `LIVERA_SERVER` (default `livera/build/livera_server`), `LIVERA_E2E_DIR` (DB and logs;
default a new temp dir), `LIVERA_SHOTS` (screenshots), `LIVERA_E2E_PORT` / `GATEWAY_E2E_PORT`.

## Module map

| File | What it does |
|---|---|
| `gateway/gateway.mjs` | WebSocket `/ws` ↔ one TCP connection per browser. One WS text message = one request line (over 16 KB, binary or containing a newline: closed). Ping every 25 s, at most 8 connections per IP (`X-Forwarded-For` only from loopback), origin allow-list, optional static files. No game logic. |
| `client/index.html` | The page shell. Strict CSP (`'self'` only), no external fonts or scripts. |
| `client/main.js` | Game controller: session flow (connect, resume or log in, pick or create, play), events, polling, and every intent (walk, go inside, buy, ride, say, interact, tip, LivPay, give, ask, answer, work, study, phone). Walk-then-act (go inside, take the bus, talk to someone) waits for the server to say you've arrived. |
| `client/transport.js` | WebSocket, request/reply by `id`, events, reconnect with backoff, `resume` with the stored token. |
| `client/state.js` | The live world model: rules, map, transit, interactions, you, the people in sight with straight-line prediction, clock from `look.time.minute` and `rules.minutes_per_real_second`, money, weather, bubbles. |
| `client/render2d.js` | The isometric canvas renderer forked from the preview (projection, buildings, cranes, weather, day/night, bubbles, voice ring, tap hit-testing, drag / pinch / wheel). Replaceable by a three.js renderer behind the same small interface. |
| `client/layout.js` | **The sketch**: building sizes by type, roads, river, park outlines, trees, colours. |
| `client/ui.js` | Top bar, chat bar, feed and toasts, bottom sheets (place, scene inside, person, bus stop, ask, needs, log, menu). |
| `client/phone.js` | The phone: all 26 apps as cards; bank, messages, map, transit and career screens; any other app shown as labelled fields. |
| `client/creator.js` | Character creator form generated from `creator_options`. |
| `client/dom.js` | `el()` (DOM building with text nodes only), money formatting, faces, safe localStorage. |
| `client/faces/` | 160 px face crops by character id; `manifest.json` lists them so the page never requests a missing image. |

## What is a sketch, and what is real

Real, from the server: every door position, place name, type, district and open/closed/under
construction status, bus stops and fares, everyone's position and movement, the clock, the
weather, prices, balances, needs, speech, and every outcome.

Sketch, drawn by hand in `layout.js`: building sizes and heights, street lines, the river, park
outlines, trees and colours. The page says so on screen ("2.5D preview: street layout and
building shapes are sketches"). Other labels on screen: "played by a script" on characters a
`bot_` account plays, "single-rider shuttle" on the bus (shared buses come in Phase 1), and
"placeholder landmark" on civic places the data marks as not enterable (the fire station).

## What works

Checked by the end-to-end tests against the current server and against an in-progress
`livera/1` build (see the test list above):

- Log in, create an account (dev servers), resume with a token (newer servers), log out.
- Pick a founding character (faces, taken, "played by a script right now") or make one.
- Tap the ground to walk; tap a building for its card, Go inside (walks to the door, then
  enters); apartment buildings list their units; Exit.
- Inside: the scene card with who's here, offers with Card / Cash / Phone, activities, work
  start/end at your workplace, study start/end at a campus, and Exit. It can shrink to a pill.
- Bus: tap a stop, choose where to, pay by card, cash, LivPay or dodge the fare; walks you to
  the stop first if needed; riders are drawn on a labelled single-rider shuttle.
- Chat bar with Whisper / Say / Shout, a ring showing how far your voice carries, whisper
  targets limited to people in range, bubbles, "Heard by N" / "Nobody heard you",
  "Maya whispers to Leila" for onlookers.
- Person card: interactions from `map.interactions` (walks over first when too far), whisper,
  tip, LivPay, give an item, asks (date, kiss, propose, marry, intimacy, move in); incoming asks
  open an Accept / Decline sheet.
- Phone: every app; bank, messages (send and reply), map (walk there), transit, career.
- Top bar: live clock, day / weather, money (bank and cash), your three lowest needs; a needs
  and feelings sheet. Day and night and the weather are drawn on the map.
- Phone-first layout: full-screen map, safe areas, 44 px tap targets, 16 px inputs,
  drag / pinch / wheel zoom, follow-me and whole-town buttons; works at 390x844 and on desktop.
- Every server string reaches the page as text (no `innerHTML` anywhere); CSP blocks inline
  scripts and other origins.

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
- Not tested on real iOS Safari or Android Chrome devices, only Chromium with phone emulation.
