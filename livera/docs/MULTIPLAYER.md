# Multiplayer Model

## Principles

- **Authoritative dedicated server.** The server owns time, money, inventory, property,
  relationships, memories, careers, construction, permissions and every interaction.
- **The client is untrusted.** It sends intent. It never sends a position, a balance, a
  relationship value or an outcome. Malformed or out-of-rules requests get a stable
  error code and change nothing.
- **Multiplayer from day one.** Every system is built and tested with two players on one
  server (`tests/test_server.cpp`, `scripts/demo_slice.sh`).

## Identity, authentication, authorization

| Concept | Today | Later |
|---|---|---|
| Account | username + password, PBKDF2-HMAC-SHA256 (210k iterations, 16-byte salt), stored in SQLite | External identity provider / platform accounts (Steam, console) |
| Login | `login` op; a second login for the same account kicks the first connection. The reply carries a **resume token** (below). | Token refresh; revoking every token from a settings screen |
| Resume tokens | `login` returns `token`: 32 random bytes (OpenSSL `RAND_bytes`) as 64 hex characters. `resume {token}` logs a new connection in exactly like `login` (the old connection is kicked). An automatic reconnect sends `take_over: false`: then, if another device is playing the account with a different token, the reply is `in_use_elsewhere` and nobody is kicked (a phone that slept through `kicked` doesn't take the account back); the same token's old half-open connection is still replaced. Tokens live in server memory only: they expire 7 days after issue, at most 5 per account (a sixth login drops the oldest), `logout` revokes the one that session used, and a server restart forgets them all (clients fall back to the password). | Persisted, refreshable tokens |
| Login throttling | Per username, in memory: after 5 wrong passwords within 10 minutes, every `login` for that name is refused with `login_throttled` for 10 minutes, the right password included. A successful login clears the count. Someone can lock a known name out for 10 minutes this way; a player who still has a token can `resume` meanwhile. | Per-IP login limits, CAPTCHA, alerts |
| Registration | Open on dev servers (`--closed-registration` turns it off; the VPS runs closed and the operator adds players with `--add-account`). Names starting `bot_` are refused (`invalid_username`): only the operator makes script accounts. | Invite / platform-gated |
| Character ownership | One account plays one character; one character belongs to one account. Enforced by a UNIQUE constraint, so two players can't claim the same character even in a race. Script accounts never claim (see "Scripted characters"). The operator can release a claim with `--release-character`. | Multiple character slots; generational handoff (children) |
| Authorization | Session must be logged in, then playing, before in-world ops. Dev ops (`dev_advance`) require `--dev` and a login, but no character. Residents-only and staff-only places are checked by `World::canAccess`. Script accounts can't `create_character` (`forbidden`). | Roles (admin, moderator), business permissions (employees), property permissions (guests, co-owners) |

## Protocol (`livera/1`)

Newline-delimited JSON over TCP. Lines over 16 KB disconnect the client. Browsers reach the
same protocol through the WebSocket gateway (`web/gateway/`), one TCP connection per
WebSocket: a WebSocket text message is one request line and each server line is one message.

Request: `{"id": 7, "op": "buy", "offer": "latte", "method": "card"}`. **`id` is reserved**
for matching replies to requests; no op may use it as an argument (songs are named by
`song` / `song_id`).
In-world ops (everything after `play`, `buy_coins` aside) are dispatched by
`src/protocol/WorldOps.cpp` for both the server and the single-player build
(`src/wasm/solo.cpp`), so a solo town answers every request, refusal codes included, exactly
like a live server; `buy_coins` stays in the server because only it can verify a store receipt.
Reply: `{"re": 7, "ok": true, "data": {...}}` or `{"re": 7, "ok": false, "error": {"code": "insufficient_funds", "message": "not enough money"}}`.
**Every reply carries `re`**: the request's `id` (any JSON value, echoed as sent), or `null`
when the line had none or wasn't JSON. That includes `bad_request`, `rate_limited` and
`chat_rate_limited`: the server parses the line (without throwing) before rate limiting it.
Event (server push): `{"event": "message", "data": {"from": "dax", "body": "..."}}`

| Op | Needs | Arguments |
|---|---|---|
| `hello`, `ping` | – | – (`hello` replies `{protocol: "livera/1", world_time, rules}`) |
| `register` | – | `username` (3–24 of a-z, 0-9, _; not starting `bot_`), `password` (8–128) |
| `login` | – | `username`, `password` → `{username, character, token}` (`character` may be null) |
| `resume` | – | `token`, `take_over` (optional, default true) → `{username, character, token}` (the same token); `bad_token` if unknown, expired or logged out; `in_use_elsewhere` when `take_over` is false and another connection holding a different token is logged in to the account |
| `characters` | login | – (founding characters, plus your own created one; `can_create`). Each entry has `available` and `scripted_now` (a script is playing them right now; then also `played_by`: `"script"` or `"autopilot"`) |
| `creator_options` | login | – (every choice the character creator offers) |
| `create_character` | login, no character yet | `character`: the character sheet (see DATA_MODEL.md) |
| `play` | login | `character` (optional: defaults to your own; scripts must name one) |
| `logout` | login | – (leaves the world, revokes this session's resume token, keeps the connection) |
| `look`, `map` | playing | – (see "What a player can see" for `look.people`, `look.you` and `map`) |
| `move` | playing | `x`,`y` or `location` |
| `enter` / `exit` | playing | `location` / – |
| `interact` | playing | `interaction`, `target` |
| `buy` | playing | `offer`, `method` (`card`/`cash`) |
| `activity` | playing | `activity` |
| `work` | playing | `action` (`start`/`end`) |
| `phone` | playing | `app` |
| `message` | playing | `to`, `text` |
| `say` | playing | `text`, `volume` (`say`/`shout`/`whisper`), `to` (whisper) |
| `tip` | playing | `to`, `cents` (100–100000) |
| `song_save` | playing | `song` {title, bpm, tracks}, `song_id` (to update a draft) |
| `song_release` / `song` | playing | `song` (id) |
| `perform` | playing, on a stage | `song` (id) |
| `use` / `wear` | playing | `item` |
| `take_off` | playing | `slot` (`outfit`/`accessory`) |
| `give` | playing | `to`, `item` |
| `ride` | playing, at a stop | `to` (stop id), `pay` (default true) |
| `enroll` | playing, at a campus | `program` (empty = drop out) |
| `study` | playing | `action` (`start`/`end`) |
| `apply` | playing, at the workplace | `career` |
| `steal` | playing, in a shop | `offer` |
| `pickpocket` | playing | `target` |
| `arrest` | playing, police on duty | `target` |
| `request` | playing | `kind` (date, kiss, propose, marry, intimacy), `target`, `protection` |
| `respond` | playing | `request` (id), `accept` |
| `end_relationship` | playing | `target` |
| `name_baby` | playing, a parent | `child`, `name` |
| `care` | playing, home with the child (a parent, or their nanny on shift) | `child`, `action` (a care routine id from data: feed, bathe, play, story, homework, bedtime, talk) |
| `enroll_child` | playing, a parent; to enrol, at the school or daycare while it's open | `child`, `where` (`school`/`daycare`; empty = withdraw, from anywhere) |
| `hire_nanny` | playing, a parent, with them | `target` (sends a `nanny` ask the nanny answers with `respond`) |
| `dismiss_nanny` | playing, a parent who employs one | – |
| `dev_advance` | logged in + `--dev` | `minutes` (1–86400) |
| `dev_condition` | logged in + `--dev` | `character`, `condition` |

Phone apps: bank, messages, contacts, calendar, map, career, property, notifications,
city, studio, health, items, transit, school, jobs, record, romance, fame, family.

Players acting on other players: interactions, tips, gifts and pickpocketing need you to be
with them; pickpocketing has a per-victim cooldown and a cash cap; arrests need an officer
on duty and a warrant. Anything between two people beyond that is an ask (`request`) the
other player answers (`respond`); asks expire, and adults-only and family rules are checked
when asked and again when answered.

Events: `welcome` (`{protocol, rules}` on connect), `arrived`, `presence` (someone
arrived/entered/left near you), `people` (what changed among the people you can see; see
below), `request` (an ask for you: `{id, kind, from, text, expires_in_minutes}`, the game minutes it stays open), `answer` (your ask was answered), `incident` (an arrest,
an overdose or an accident near you), `gift`, `interaction` (someone did something to you),
`message`, `notification`, `speech` (someone you can hear said something; carries the
speaker's `position` (a building's door when they're inside) and, when you're both outdoors,
`distance_m`), `whispering` (someone near
you whispered to someone: `{from, from_name, to, to_name}`, never the words), `performance`
(someone performed where you are; carries the full song so the client can play it),
`released` (a person took the character your script was playing), `kicked`.

M0.8 ops, each with its arguments and refusals in its feature page: homes (`buy_home`,
`move_out`, `move_home`, `sell_home`, and `request` kinds `buy_home`, `move_in`, `sell_home`;
`docs/m08/homes.md`), work (`work_tasks`, `work_answer`; `docs/m08/work.md`), wallet
(`buy_coins`, `buy_with_coins`, `switch_phone`, `livpay_send`, `buy` with `method: "phone"`,
`ride` with `pay_with`; `docs/m08/wallet.md`), leisure (`join_team`, `leave_team`;
`docs/m08/leisure.md`), pets (`adopt`, `pet`, `vet`; `docs/m08/pets.md`) and details
(`laundry`; `docs/m08/details.md`). New phone apps: `homes`, `work`, `wallet`, `store`,
`sports`, `pets`, `weather`.

Any later engine client maps its calls to the same `World` commands (ARCHITECTURE.md), so
this table stays the list of what a client can ask for.

## What a player can see

Rule 5 (clients see only what their character may know) applies to bodies as well as
feelings. **In sight** means: outdoors, other people outdoors within `sight_range_m` (120 m,
`data/config/simulation.json`); inside, other people in the same building. Nobody else, ever.
Content is refused if `sight_range_m` is below `shout_range_m`, so you can always see whoever
you can hear.

`look.people` lists everyone in sight: `id`, `name`, `known`, `distance_m` (outdoors only),
`position` [x, y] (0.1 m), `inside` (location id or ""), `moving`, `target` [x, y] or null,
`speed_mps` (0 when still), `mode` (`walk`, or `bus` while riding), `scripted` (and, when true,
`played_by`: `"script"` for a `bot_` account's session, `"autopilot"` for the core's Autopilot). `look.you`
carries the same motion fields for yourself.

For someone else, `target` is where they stop when you can see that spot; otherwise it is a
point just past where their path leaves your sight (`sight_range_m` + 25 m from you), and the
real spot is shown as they come closer. A character sees which way someone is heading, not
which far door or bus stop they're making for. Your own entry, `look.you` and the `move` and
`ride` replies keep your real target.

`map` (and the `map` phone app) adds what a client needs to draw ranges and predict motion
without copying numbers out of data:
- `rules`: `{whisper_range_m, say_range_m, shout_range_m, sight_range_m, walk_speed_mps,
  minutes_per_real_second, entry_radius_m, boarding_radius_m}` (also in `welcome` and `hello`);
- `transit`: `{lines: [{id, name, fare_cents, speed_mps, first_hour, last_hour, stops: [{id, name, at: [x, y]}]}]}`;
- `interactions`: `[{id, label, range_m}]`.

### The `people` stream

Clients predict straight-line motion, so the server only speaks when a prediction would go
wrong. At the end of every tick (`World::advanceRealTime`), for each online character, World
compares who is in sight now with what it last told that viewer (an in-memory snapshot per
viewer, never saved, dropped when they leave) and sends at most one event, only if something
changed:

```json
{"event": "people", "data": {"changes": [
  {"character": "dax", "name": "Dax Hendrix", "known": true, "scripted": true, "self": false,
   "state": "here", "position": [318.6, 513.1], "inside": "", "moving": true,
   "target": [431.0, 471.0], "speed_mps": 6.0, "mode": "walk"},
  {"character": "naomi", "state": "gone", "reason": "went_inside", "location": "heritage_coffee"}
]}}
```

A `here` entry (full current state) is sent when someone comes into sight, or their `inside`,
`target` (set, cleared or different), speed, mode or `scripted` changes, or, while standing
still, they've shifted more than 0.5 m (forced moves: jail, the emergency room, being shown out
of a home, moving house; each of those also changes `inside` today, so the 0.5 m rule is a
backstop for future ones). Walking on toward the same target sends nothing. Your own entry
(`"self": true`) comes the same way: move started, ride started, arrived, entered, left,
jailed, rushed to the ER. It is never `gone`. Right after `play` you get yourself and everyone
in sight as `here` on the next tick.

A `gone` entry has a `reason`:
- `out_of_sight`: they're where they were; one of you walked out of range or stepped in or out
  of a building;
- `went_inside`: they went into a building whose door you can see. It carries `location` only
  when that door leads to one place; for a door several homes share (the flats of a block) it
  is left out, because you saw them go into the building, not which flat;
- `went_outside`: you're inside and they left the building;
- `left_world`: they logged off or disconnected;
- `moved_away`: anything else, such as being taken to jail from where you could see them (where
  to isn't something you saw).

The older events stay as they were (`arrived` to the mover, `presence`, `speech`...).

## Scripted characters

Accounts named `bot_*` are scripts (the town director, `scripts/town_director.py`). Only the
operator makes them (`--add-account`); `register` refuses the prefix, so a person is never
labelled a script and a script never passes as a person.
- A script's `play` writes **no claim**. It is refused with `character_claimed` if any account
  has claimed the character and `character_in_use` if anyone is playing it right now.
- While a script plays a character, everyone who sees them gets `scripted: true` and
  `played_by: "script"` (in `look.people` and the `people` stream), and `characters` shows
  `scripted_now: true` with the same `played_by`. The flag lives in `World` memory
  (`World::setScripted`), set on `play`, cleared when the session leaves the world.
- With `--autopilot`, founders no account has claimed are played by the core's `Autopilot`
  (D-053, SIMULATION.md "Autopilot"): the same `scripted: true`, with `played_by: "autopilot"`.
  They are not sessions (neither cap counts them). A script's `play` for one is refused with
  `character_in_use`; a person's `play` releases them from the autopilot first (they stay where
  they stand) and then plays and claims as usual. When a player leaves a founder nobody has
  claimed (a script's session, or a claim the operator released), the autopilot takes them back.
- **People always win.** When a person `play`s a character a script is playing, the script's
  session gets `{"event": "released", "data": {"character": "dax", "reason": "a player took
  this character"}}` and leaves the world (its connection and login stay open), then the
  person plays and claims the character. A script and a person asking in the same instant are
  handled one after the other on the single server loop, and either order ends with the person
  playing.
- Scripts can't `create_character` (it would claim).

## Caps

`--max-players N` (default 16) counts people in the world; scripts don't take their places.
`--max-scripted N` (default 16) caps script sessions in the world. Either refusal is
`server_full`. Taking over a script's character counts as a person joining.

## Admin commands

Run on the server machine; each does one thing and exits without serving. Neither needs
`--data`, and both are safe while the server runs on the same file (SQLite WAL, with a 5 s
busy timeout on every connection).

```bash
echo 'their-password' | livera_server --db /var/lib/livera/world.db --add-account maya
livera_server --db /var/lib/livera/world.db --release-character dax
```

- `--add-account USER` reads the password from the first line of stdin, applies the same
  rules as `register` (except that `bot_` names are allowed: that's how script accounts are
  made), creates the account and prints `account created: USER`. Exit 0, or 1 with the error
  code on stderr (`username_taken`, `invalid_username`, `invalid_password`). If the database
  file doesn't exist yet it is created (with a note on stderr), so a fresh install can make
  accounts before the server's first start; the server then founds the world around them.
- `--release-character ID` removes the account claim on a character
  (`SqliteStore::releaseCharacter`) and prints whose it was, or that nobody held it. It
  refuses a database path that doesn't exist (`no_database`). A player
  who is in the world as that character keeps it until they leave; meanwhile nobody else can
  take it (`character_in_use`).

## Anti-cheat and abuse foundations

- Intent-only commands; every rule checked server-side (see the refusal tests).
- Movement: the server moves characters at walking speed; targets are clamped to the town.
- Chat (`say`, `message`) has its own bucket: one line a second, bursts of five.
- Speech has control characters flattened, so nobody can forge lines in another player's log.
- Character creation accepts only options from data; names, custom pronouns and gender
  are restricted to letters and a few punctuation marks.
- Per-connection token bucket (20 requests/s, burst 40). After 50 rate-limited requests the
  connection is dropped.
- Login throttling per username and resume tokens instead of stored passwords (see the
  identity table). The web client keeps the token, never the password.
- Line length limit (16 KB) and outbox limit (1 MB) so a client can't exhaust memory.
- Interaction cooldowns per pair (no relationship farming by spam).
- Ledger invariant (balances sum to zero) checked before every save; a broken ledger is
  never persisted.
- Private state stays private: views expose only what the character may know.

**Not yet:** chat moderation (reporting, muting, blocking, filters, a retained log for
safety review). Required before any public server.

**Transport encryption:** on the VPS, Caddy terminates TLS (automatic HTTPS) in front of the
WebSocket gateway, so browsers only ever speak `wss://`. Between Caddy, the gateway and the
server everything is plaintext on loopback: the server binds to 127.0.0.1 and is never exposed
directly. Session tokens and per-username login throttling are built (above).

**Not yet:** per-IP login throttling in the server (the gateway caps connections: 256 in all,
8 per IPv4 address or IPv6 /64);
encryption between machines if the gateway and the server are ever split across hosts.

## Disconnects and persistence

- Logout or disconnect: any open shift is settled and paid, the character goes Dormant
  (Tier 3), and the world is saved immediately.
- Autosave every 30 s (configurable) and on shutdown (SIGINT/SIGTERM).
- Every save is one SQL transaction: a crash loses at most the last few seconds and never
  leaves a half-written world. (DECISIONS.md D-005.)
- On reconnect the character catches up on the time they were away (SIMULATION.md, tiers).

## Concurrency

Single-threaded server loop. Two players buying the last item, or claiming the same
character, or a script and a person reaching for the same character, are processed one after
the other; there are no races to reason about. Commands take effect when they're handled; the
`people` stream reports them at the end of the next tick (at most 0.1 s later at 10 Hz).
Password hashing (~0.1 s) runs on the loop. Acceptable at today's default caps (16 people, 16
scripts); it moves to a worker before player counts grow.

## Talking: text now, voice next

Proximity text chat is built (`say`/`shout`/`whisper`). Who hears a line is decided by the
server from positions it owns: same building, or outdoors within 20 m (say), 60 m (shout)
or 2 m (whisper, one listener). Each hearer's `speech` event says where the speaker stands
and, outdoors, how far away they are; people within say range of a whisper see a
`whispering` event without the words. Speech is delivered live and not stored. The ranges
come from data and reach clients in `rules`.

Voice needs audio capture and streaming, which now belongs to the **web client** (the engine
client is no longer the M1 plan): the design is in `docs/proposals/voice.md`. The principle
is unchanged: the **same hearing rules**, decided by the server. The server will publish, per
player, whom they may hear, so a client can't eavesdrop on a conversation across town by
joining its channel.
