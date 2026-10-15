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
| Account | username + password, PBKDF2-HMAC-SHA256 (210k iterations, 16-byte salt), stored in SQLite | External identity provider / platform accounts (Steam, console), session tokens |
| Login | `login` op; a second login for the same account kicks the first connection | Same, plus token refresh |
| Registration | Open on dev servers (`--closed-registration` turns it off) | Invite / platform-gated |
| Character ownership | One account plays one character; one character belongs to one account. Enforced by a UNIQUE constraint, so two players can't claim the same character even in a race. | Multiple character slots; generational handoff (children) |
| Authorization | Session must be logged in, then playing, before in-world ops. Dev ops (`dev_advance`) require `--dev`. Residents-only and staff-only places are checked by `World::canAccess`. | Roles (admin, moderator), business permissions (employees), property permissions (guests, co-owners) |

## Development protocol (`livera-dev/1`)

Newline-delimited JSON over TCP. Lines over 16 KB disconnect the client.

Request: `{"id": 7, "op": "buy", "offer": "latte", "method": "card"}`. **`id` is reserved**
for matching replies to requests; no op may use it as an argument (songs are named by
`song` / `song_id`).
Reply: `{"re": 7, "ok": true, "data": {...}}` or `{"re": 7, "ok": false, "error": {"code": "insufficient_funds", "message": "not enough money"}}`
Event (server push): `{"event": "message", "data": {"from": "jaxon", "body": "..."}}`

| Op | Needs | Arguments |
|---|---|---|
| `hello`, `ping` | – | – |
| `register` | – | `username` (3–24 of a-z, 0-9, _), `password` (8–128) |
| `login` | – | `username`, `password` |
| `characters` | login | – (founding characters, plus your own created one; `can_create`) |
| `creator_options` | login | – (every choice the character creator offers) |
| `create_character` | login, no character yet | `character`: the character sheet (see DATA_MODEL.md) |
| `play` | login | `character` (optional: defaults to your own) |
| `logout` | login | – (leaves the world, keeps the connection) |
| `look`, `map` | playing | – |
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
| `dev_advance` | playing + `--dev` | `minutes` (1–86400) |

Events: `welcome`, `arrived`, `presence` (someone arrived/entered/left near you),
`interaction` (someone did something to you), `message`, `notification`, `speech`
(someone you can hear said something), `performance` (someone performed where you are;
carries the full song so the client can play it), `kicked`.

The Unreal client will use UE replication and RPCs instead (ARCHITECTURE.md, "Engine
integration"); each RPC maps to the same `World` command, so this table stays the list of
what a client can ask for.

## Anti-cheat and abuse foundations

- Intent-only commands; every rule checked server-side (see the refusal tests).
- Movement: the server moves characters at walking speed; targets are clamped to the town.
- Chat (`say`, `message`) has its own bucket: one line a second, bursts of five.
- Speech has control characters flattened, so nobody can forge lines in another player's log.
- Character creation accepts only options from data; names, custom pronouns and gender
  are restricted to letters and a few punctuation marks.
- Per-connection token bucket (20 requests/s, burst 40). After 50 rate-limited requests the
  connection is dropped.
- Line length limit (16 KB) and outbox limit (1 MB) so a client can't exhaust memory.
- Interaction cooldowns per pair (no relationship farming by spam).
- Ledger invariant (balances sum to zero) checked before every save; a broken ledger is
  never persisted.
- Private state stays private: views expose only what the character may know.

**Not yet:** chat moderation (reporting, muting, blocking, filters, a retained log for
safety review). Required before any public server.

**Not yet:** transport encryption. The dev protocol is plaintext and binds to 127.0.0.1
by default. Before any server leaves a developer machine: TLS (or UE's encrypted
connection), token sessions, and login throttling per account/IP.

## Disconnects and persistence

- Logout or disconnect: any open shift is settled and paid, the character goes Dormant
  (Tier 3), and the world is saved immediately.
- Autosave every 30 s (configurable) and on shutdown (SIGINT/SIGTERM).
- Every save is one SQL transaction: a crash loses at most the last few seconds and never
  leaves a half-written world. (DECISIONS.md D-005.)
- On reconnect the character catches up on the time they were away (SIMULATION.md, tiers).

## Concurrency

Single-threaded server loop. Two players buying the last item, or claiming the same
character, are processed one after the other; there are no races to reason about.
Password hashing (~0.1 s) runs on the loop. Acceptable at 2–8 players; it moves to a
worker before player counts grow.

## Talking: text now, voice in M1

Proximity text chat is built (`say`/`shout`/`whisper`). Who hears a line is decided by the
server from positions it owns: same building, or outdoors within 20 m (say), 60 m (shout)
or 2 m (whisper, one listener). Speech is delivered live and not stored.

Voice needs audio capture and streaming, which belongs to the engine client (M1): Unreal's
voice chat through Epic Online Services (or Vivox), with the **same hearing rules**. The
server will publish, per player, which voice channels they may hear, so a client can't
eavesdrop on a conversation across town by joining its channel.
