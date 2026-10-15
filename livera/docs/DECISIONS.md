# Architecture Decision Log

Newest last. Each entry: the decision, why, and what would make us revisit it.

## D-001 — LIVÉRA lives in `livera/` inside the Business1 repository, for now
**Context:** The session had two repositories, both unrelated products (Business1 is the
I'm In Expo app; Ruth is a legacy-vault prototype), with a designated LIVÉRA branch in each.
**Decision:** Build LIVÉRA as a self-contained folder in Business1 on the designated branch.
Nothing outside `livera/` changes, except a path-filtered CI workflow.
**Revisit:** Now. LIVÉRA should have its own repository before M1 (an Unreal project is
large and has its own tooling, LFS and CI needs). Moving it is a copy of this folder.

## D-002 — Engine-agnostic C++ simulation core; Unreal Engine 5 for the game
**Decision:** All rules live in `livera_core` (C++20, no engine dependency). Unreal will
host it as a module in the client and dedicated server (ARCHITECTURE.md).
**Why:** The spec prefers Unreal and C++ with an authoritative server. Keeping rules out of
the engine makes them testable headless in seconds, keeps Blueprints from duplicating
logic, and allows non-UE servers or tools (bots, load tests, offline simulation).
**Revisit:** If UE's Mass/StateTree systems become the natural home for Tier-2 NPCs, the
core still owns state and rules; UE drives presentation.

## D-003 — No Unreal project in M0
**Decision:** Don't commit Unreal code that has never been compiled.
**Why:** Unreal isn't available in the environment this was built in. Unbuildable engine
code would be a pretend feature (spec rule 1). M1 starts the UE project on a machine with UE.

## D-004 — Development transport: newline-delimited JSON over TCP
**Decision:** A simple, readable protocol for the headless client and tests.
**Why:** Lets multiplayer, authority and persistence be proven now. Commands map 1:1 to
`World` methods, which is what UE RPCs will call.
**Revisit:** Replaced by UE replication for the game client; kept for bots and tools.
Needs TLS before any non-local use.

## D-005 — SQLite, snapshot-consistent saves
**Decision:** One SQLite file per world. Each save is one transaction: mutable tables are
rewritten, append-only history (ledger transactions, memories) is appended. Autosave every
30 s, on logout and on shutdown. WAL mode, `synchronous=FULL`.
**Why:** Atomic, zero-ops, embedded, and fine for one shard with 2–8 players. A crash
loses at most seconds and never leaves half a world.
**Trade-off:** A purchase made seconds before a crash can be lost along with its effects.
It is never half-applied. Write-through for economic transactions is a later option.
**Revisit:** Multiple shards or external services → Postgres behind the same store interface.

## D-006 — Single-threaded server loop
**Why:** No locks, no races, deterministic ordering of conflicting requests (two players,
one character). Plenty for the target scale. Password hashing moves off-loop when needed.

## D-007 — Simplified calendar (28-day months)
**Why:** Weeks divide months evenly, so schedules, rent and paydays line up and birthdays
fall on the same weekday. Common in life sims. Purely a `Clock.h` constant if we change it.

## D-008 — Money as integer cents, zero-sum ledger
**Decision:** Every balance change is a `Ledger::transfer` between two accounts. The
system account `sys:economy` stands for the world outside Livéra (opening balances,
outside revenue) and is the only one allowed below zero. The store refuses to save a
ledger that doesn't sum to zero.
**Why:** Money can't be created by a bug without the books showing it, and every dollar
is traceable. This is the base for taxes, debt and businesses.

## D-009 — Content is data, validated at load
**Decision:** Characters, places, offers, activities, careers, interactions, construction,
stages, organisations and every stat name come from `data/**/*.json`. The loader rejects
unknown stats, unknown sections, duplicates and dangling references.
**Why:** Spec rule 3. Designers add content without code, and typos fail loudly at startup,
not silently in play.

## D-010 — One account, one founding character
**Decision:** A founding character can be played by exactly one account (first to claim
it), and an account plays one character.
**Open question for the product owner:** Are the 16 founding characters meant to be
claimed by players, or run by the simulation (with players mostly creating their own)?
The spec calls them playable; this decision keeps both options open.

## D-011 — Simulation tiers: Active per-minute, Dormant convergent catch-up
**Why:** Offline simulation must be cheap. A dormant character's needs converge toward a
steady state (`1 − e^(−hours/8)`) instead of being simulated minute by minute, so a
player returns to a plausible character in constant time.

## D-012 — Clients see only what their character knows
**Decision:** Views return your needs, your money, *your* side of each relationship, and
coarse reactions, never another character's feelings, needs or secrets.
**Why:** Directional relationships and secrets only work if the client can't read them.
It also removes a class of information cheats.

## D-013 — Server-moved, straight-line movement in M0
**Decision:** Clients send a destination; the server moves the character at walking speed.
**Revisit:** M1 replaces this with UE client-side prediction plus server validation
(speed limits, door proximity) against `World`'s logical position.

## D-014 — In-house test harness
**Why:** The test framework download was blocked in the build environment, and a 60-line
harness avoids a dependency. Swap for Catch2 or GoogleTest anytime; tests are plain functions.

## D-015 — 1 real second = 1 game minute (data-tunable)
**Why:** A game day of 24 real minutes keeps daily routines playable in a session.
`simulation.minutes_per_real_second` changes it without code.

## D-016 — Character creation ahead of the spec's phase order
**Context:** The spec put character creation in Phase 7; the product owner asked for it now,
along with in-game talking and music.
**Decision:** Build all three server-side now (M0.5), the same way as everything else:
data-driven options, server validation, tests. The visual creator comes with the client.

## D-017 — Created characters are saved in the content format
**Decision:** A player-made character becomes a `CharacterDef` stored in `WorldState`
(and the `created_characters` table) in exactly the JSON format of `data/characters/`.
`World::definition()` looks in content first, then created characters.
**Why:** One code path for every character, whoever made them. A created character can
later be promoted into content (e.g. a beloved player character becoming canon) by copying
one file. Creation is checked with the same `validateCharacter` as content.

## D-018 — Songs are notes, not audio
**Decision:** A song is note data (instrument, step, pitch, length, velocity), validated
and capped (4 tracks, 16 bars, 512 notes per track).
**Why:** Small enough to send to everyone in the room and to save forever; impossible to
use for uploading arbitrary audio (abuse, copyright, moderation); any client can render it
with its own instruments; exports cleanly to MIDI. Recorded vocals or audio would need
a moderation pipeline first.

## D-019 — Proximity text chat now, voice with the engine
**Decision:** The server decides who can hear each line from authoritative positions.
Voice arrives with the Unreal client (EOS Voice or Vivox) using the same hearing rules.
Free chat changes needs (social) but not relationship numbers.
**Why:** Hearing must be server-authoritative or anyone could listen in across town.
Relationship changes stay tied to explicit interactions so they can't be farmed by typing.

## D-020 — `id` is reserved in the protocol
**Decision:** `id` only ever means the request id. Arguments that name things use their
own key (`song`, `song_id`, `character`...).
**Why:** A test caught the request id overwriting a song id. Reserving the key removes
that class of bug for every future op.
