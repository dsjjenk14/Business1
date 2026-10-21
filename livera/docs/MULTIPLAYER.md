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

Newline-delimited JSON over TCP. A request line over 16 KB disconnects the client; the server's lines can be longer
(`map` lists every place, past 16 KB since D-073), and the C++ clients and the gateway read up to 4 MB. Browsers reach the
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
| `characters` | login | – (founding characters, plus your own created one; `can_create`). Each entry has `id`, `name`, `age`, `pronouns`, `career` (the title), `tagline`, `home` and `workplace` (place names as they are now; null when there is none), `available` and `scripted_now` (a script is playing them right now; then also `played_by`: `"script"` or `"autopilot"`) |
| `creator_options` | login | – (every choice the character creator offers; each of `careers` has `requires_degree` (a degree name or null) and `educations`, the education answers that qualify for it by the rule `apply` uses) |
| `create_character` | login, no character yet | `character`: the character sheet (see DATA_MODEL.md); a starting career your education doesn't qualify for is refused with `missing_degree`, as `apply` would |
| `play` | login | `character` (optional: defaults to your own; scripts must name one) |
| `logout` | login | – (leaves the world, revokes this session's resume token, keeps the connection) |
| `look`, `map` | playing | – (see "What a player can see" for `look.people`, `look.you` and `map`) |
| `move` | playing | `x`,`y` or `location` |
| `enter` / `exit` | playing | `location` / – |
| `interact` | playing | `interaction`, `target` |
| `buy` | playing | `offer`, `method` (`card`/`cash`) |
| `activity` | playing | `activity` |
| `work` | playing | `action` (`start`/`end`) |
| `sleep` | playing, at home in the evening | – (see below; D-062) |
| `move_inside` | playing, inside a place with a room | `x`, `y` (the room picture's pixels; see "Rooms", D-066) |
| `sit` / `stand` | playing, inside a place with a room | `spot` / – |
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
| `crime_risk` | playing | `crime` (`shoplifting`, `pickpocketing`, `drug_purchase`, `fare_evasion`, `assault`), `target` (pickpocketing, assault); read-only (D-069) |
| `fight` | playing, with them | `target` (D-070) |
| `fight_respond` | playing, attacked | `fight` (id), `choice` (`fight_back`, `run`, `take_it`) |
| `fight_beat` | playing, in a brawl | `fight` (id), `answer` (`duck`, `block`, `jab`, or `walk_away` at any beat) (D-077) |
| `fight_prefs` | playing | `walk_away` (true / false) |
| `event_answer` | playing | `event`, `option` (the choice's number in `life_event`) (D-068) |
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

Events: `welcome` (`{protocol, rules}` on connect), `room` (who is where in the room you're in; see "Rooms"), `arrived`, `presence` (someone
arrived/entered/left near you), `people` (what changed among the people you can see; see
below), `request` (an ask for you: `{id, kind, from, text, expires_in_minutes}`, the game minutes it stays open), `answer` (your ask was answered), `incident` (an arrest,
an overdose or an accident near you), `gift`, `interaction` (someone did something to you),
`message`, `notification`, `speech` (someone you can hear said something; carries the
speaker's `position` (a building's door when they're inside) and, when you're both outdoors,
`distance_m`), `whispering` (someone near
you whispered to someone: `{from, from_name, to, to_name}`, never the words), `performance`
(someone performed where you are; carries the full song so the client can play it),
`released` (a person took the character your script was playing), `kicked`.

Phone app `goals` (D-061; only ever about your own character, from your own records): today's
goals, a pure draw per character and game day, and your aspirations (a founder's from data, a made
character's from the creator; one the game can't follow says why instead of showing progress):

```json
{"day": 84, "done_today": 0, "from": "story",
 "today": [{"id": "paid_shift", "label": "Work a paid shift", "done": false, "progress": "0/1"},
           {"id": "come_out_ahead", "label": "Earn more than you spend today", "done": false, "progress": "+$0.00 today"}],
 "aspirations": [{"id": "get_promoted", "label": "Get promoted", "tracked": true, "done": false,
                  "next": "Earn your next title", "detail": "Recruiting Manager: 0 of 120 hours",
                  "steps": [{"label": "Earn your next title", "done": false, "progress": "0/1"},
                            {"label": "Two titles up", "done": false, "progress": "0/2"}]},
                 {"id": "give_back", "label": "Give back to the community", "tracked": false,
                  "reason": "Volunteering and giving aren't recorded yet, so the game can't follow this one."}],
 "note": "3 goals a day, new at midnight. ..."}
```

`sleep` (D-062; playing, at home): go to bed. Only in your own home, between `life.sleep.bed_hours`
(21:00 and 03:00), not on shift or studying; refusals `not_home`, `not_bedtime`, `on_shift`,
`studying`, `in_jail`. You stay in the world, asleep (`look.you.asleep`), until the wake hour (07:00)
or until any command but `look`, `map` and `phone` gets you up; asleep, your routine looks after you.
The server adds whether the night will be skipped:

```json
{"asleep": true, "since": 122670, "wake_at": 123240, "wake_time": "07:00",
 "note": "You're in bed. ...", "night_skip": {"on": true, "others_awake": 1}}
```

At the wake hour each sleeper gets `good_morning`: `{slept_from, woke_at, minutes, skipped,
needs, money_change_cents, notifications: [{kind, text, when}], weather: {kind, label, temp_c}}`,
all from their own records. A server started with `--night-skip` (off by default) applies the bed
rule: when at least one person is playing and everyone playing is asleep, the night is skipped to
the wake hour on the next tick (`World::skipNight`, minute by minute with the autopilot still
playing; scripts neither count nor block it). Without the flag, sleeping never moves the clock.

A server started with `--pause-when-empty` (D-063; off by default) only runs the clock (and the
autopilot) while at least one person is in the world; scripts and logged-in sessions that haven't
picked a character don't count. Pay for scheduled work done while away shows in the bank app with
kind `salary_away`, with a `bank` notification for characters someone has played.

Redesign events and codes (D-060): `work_decision` (one of today's work decisions has come up on your shift:
`{task, prompt, open, upcoming, next_at}`); `work_answer` refuses `not_yet` for one that hasn't come up, and
`work_tasks` and the `work` app carry `upcoming`, `next_at`, `next_in_minutes` and `spacing_minutes`
(`docs/m08/work.md`). The `work` app also carries `shift_started_at` (the game minute your shift began, null off
shift) and `max_shift_hours` (the career's cap), so a client's time-worked and pay-so-far estimate uses the
server's own numbers.

M0.8 ops, each with its arguments and refusals in its feature page: homes (`buy_home`,
`move_out`, `move_home`, `sell_home`, and `request` kinds `buy_home`, `move_in`, `sell_home`;
`docs/m08/homes.md`), work (`work_tasks`, `work_answer`; `docs/m08/work.md`), wallet
(`buy_coins`, `buy_with_coins`, `switch_phone`, `livpay_send`, `buy` with `method: "phone"`,
`ride` with `pay_with`; `docs/m08/wallet.md`), leisure (`join_team`, `leave_team`;
`docs/m08/leisure.md`), pets (`adopt`, `pet`, `vet`; `docs/m08/pets.md`) and details
(`laundry`; `docs/m08/details.md`). New phone apps: `homes`, `work`, `wallet`, `store`,
`sports`, `pets`, `weather`; and, with the redesign, `goals`.

Life events (D-068). `life_event` (one came up for you): `{event, title, category, prompt, choices: [{option, label,
cost_cents?, cost_sure?, pay_with?}], at, lapses_at, lapses_in_minutes, with?: {id, name}, place?}` (`cost_cents` is
what a choice costs, or at most costs when `cost_sure` is false; the rest of what a choice does stays unsaid until you
choose). `event_answer` refuses `unknown_event` (not yours, answered, lapsed), `bad_option`, `insufficient_funds`
(before anything happens) and `in_jail`, and replies:

```json
{"event": "landlord_heater", "title": "\"Tenant damage\"", "option": 0, "label": "Pay it and move on",
 "outcome": "You pay. The heater works. Your resentment does too, quietly, all winter.",
 "changes": {"emotions": {"anger": 8, "stress": 4}, "money_cents": -12000, "account": "bank",
             "memory": "Paid my landlord for a heater that was already broken."},
 "balance_cents": {"cash": 18000, "bank": 1438000}}
```

With someone in it, `changes.relationship` is `{with, name, your_feelings: {dimension: change}, reaction}`: your side
in numbers, theirs only as the data's reaction word. `life_event_lapsed {event}`: it passed unanswered. Phone app
`story` (only ever yours): `{age, answered, pending: [life_event views], story: [{at, when, age, kind, text, impact,
life_event}], note}`, your memories newest first.

Street life (D-069). `crime_risk` replies `{crime, label, chance (0-1, or null where you aren't where it would
happen), seen_by: {witnesses, staff, police}, if_caught: {fine_cents, jail_minutes, jail_if_unpaid_minutes, record,
notoriety, seized, held_at}}`, plus per crime: `offers` and `place_types` (shoplifting), `notice_chance`, `max_cents`,
`too_soon` (pickpocketing), `possession` charges (drug_purchase), `line` (fare_evasion), `report_chance`,
`witness_report_chance`, `injuries`, `self_defence` (assault). `steal` refuses `cant_steal_here` outside the shop types
in `crime.shoplift_place_types`. People in sight carry `uniform: "police"` while an officer is on duty (`look.people`
and `people`; a change is news, and an entry without the key has none). `look.you` adds `wanted_for` (the crime's label)
and `jailed_until` (a game minute) when they apply; the Record app adds `wanted_for`, `jailed_until_minute`, `held_at`
and `walk_away_from_fights`. `look.here.offers[]` marks contraband `illegal: true`.

Fist fights (D-070). `fight` refuses `invalid_target`, `target_unavailable`, `too_far`, `minor`, `asleep`,
`target_in_jail`, `in_jail`, `no_fighting_here`, `not_now` (a founder a script plays, at work), `busy`, `cooling_down`,
`protected`, `too_soon` (that pair, today) and `unavailable` (no fights in this world), and replies `{fight, with, name,
status: "waiting", expires_in_minutes}`, or the result at once when they always walk away or a script plays them.
The person attacked gets `fight_started {fight, from, name, expires_in_minutes, choices: [{choice, label}], note}`;
`fight_respond` refuses `unknown_fight` and `bad_choice` and replies with their result; the other side gets
`fight_result`: `{fight, role, with, name, outcome (attacker_won, defender_won, ran, caught, took_it, froze,
walked_away, got_away), won?, text, changes: {needs, emotions, injuries}, crime?}` (`crime`: the arrest, `{wanted,
crime}`, `{reported, text}` or `{self_defence: true}`). Everyone present gets `fight {fight, attacker, defender, stage:
"started" | "brawl" | "over", outcome?, winner?, position, inside}` to show it. `fight_prefs {walk_away}` replies
`{walk_away_from_fights}`.

**Beat Brawl (D-077).** Fighting back with a person in the fight (and `fights.brawl` in the data) is fought beat by
beat: `fight_respond fight_back` (or `fight`, when a founder a script plays fights back at once) replies `{fight,
status: "brawl", stage: "start", role, with, name, rounds: [{beats, seconds}], composure, edge, knows_them,
starts_in_seconds, note}` and the other fighter gets the same as the event `brawl`. Each beat, when its tell shows,
the one answering gets `brawl_beat {fight, round, rounds, beat, beats, striker, you: "answer", tell (hook, jab, shove,
open), window_seconds, perfect_after_seconds}` and the one throwing gets `{…, you: "throw", move, window_seconds}`.
`fight_beat` answers it (refusals: `unknown_fight`, `bad_answer`, `not_your_beat`, `no_tell_yet`,
`already_answered`); the World stamps when it came in. When the beat ends both get `brawl_hit {fight, round, beat,
striker, move, tell, answer, perfect, outcome (slip, counter, chip, trade, hit, blocked, parry, clash, grabbed, pushed,
stuffed, wasted, missed), hits: [{to, from, damage}], composure: {id: left}, open?}`. It ends in a knockout, on points
after the last round, when one walks away (`fight_beat walk_away` replies with their `fight_result`) or when a fighter
leaves; both get `fight_result` with `outcome` `knockout`, `on_points`, `walked_off`, `broke_off` (or `walked_away` /
`no_contact` when nothing landed) and `brawl {composure, their_composure, landed, took}`. While it lasts, anything else
a fighter tries is refused `in_fight`.

Any later engine client maps its calls to the same `World` commands (ARCHITECTURE.md), so
this table stays the list of what a client can ask for.

## What a player can see

Rule 5 (clients see only what their character may know) applies to bodies as well as
feelings. **In sight** means: outdoors, other people outdoors within `sight_range_m` (160 m,
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
- `interactions`: `[{id, label, range_m}]`;
- each of `places` carries `hours` (`[open, close)`, a close before the open running past midnight;
  null for a place that never closes) and `open_days` (weekdays it opens, 0 = Monday; empty = every
  day). A place's `status` follows both. `stage` says performers can play there (`perform`); `look.here`
  carries it too.

`look.here` (the place you're in or standing at) lists its `offers` and `activities` with what
each does: `needs` and `emotions` (the effects as in data, public like the price). Each activity
also has `cooldown_minutes` and your own cooldown there: `ready_at` (the game minute you can do it
again, or null when you can now) and `ready_in_minutes` (0 when ready); an activity kept to some
hours (stargazing) has `hours: [from, to]`. Example:

```json
{"id": "shower", "label": "Take a shower", "needs": {"comfort": 5, "hygiene": 45}, "emotions": {},
 "cooldown_minutes": 60, "ready_at": 121442, "ready_in_minutes": 22}
```

### Rooms (D-066)

A place whose interior is in data (`data/interiors/`, `docs/DATA_MODEL.md`) has a room you walk around in. Points
are the room picture's pixels. Where someone is in a room is session state: on `play`, after a save is loaded and
on `enter` you stand at the entrance, and leaving (or logging off, or being taken away) frees your spot.

`look.here.room` (only inside such a place) is the interior, public content like a price, and everyone in it,
yourself included:

```json
{"interior": {"id": "heritage_coffee", "size": [1536, 1024], "person_px": 125,
              "floor": [[[110, 572], [215, 615], ...]], "blocked": [{"label": "long table", "poly": [...], "height": 53}],
              "entrance": {"at": [455, 750], "facing": "e"},
              "spots": [{"id": "counter", "kind": "counter", "at": [1005, 525], "facing": "e", "label": "Counter", "offers": true},
                        {"id": "table_near_3", "kind": "seat", "at": [702, 560], "facing": "e", "label": "Long table",
                         "activity": "chat_regulars"}, ...]},
 "people": [{"id": "dominique", "at": [702, 560], "spot": "table_near_3"}, {"id": "dax", "at": [455, 750], "spot": null}]}
```

- `move_inside {x, y}` → `{"at": [700, 760], "spot": null}`. Refused `not_inside` (outdoors), `no_room` (a place
  without one), `off_floor` (outside the floor, on furniture, or not a number).
- `sit {spot}` → `{"at": [702, 560], "spot": "table_near_3", "label": "Long table"}`. Refused `no_such_spot`,
  `not_a_seat` (only `seat`, `sofa`, `bed` and `stool` spots), `spot_taken` (someone else is in it), and the two
  above. Sitting where you sit already is accepted.
- `stand` → `{"at": [712, 580], "spot": null}`: onto the open floor beside the seat (`not_inside`, `no_room`).
- `activity`, `buy`, `perform` and `work start` there also move you, to the nearest free spot that serves it (the
  activity's spot, a spot serving that offer (a table, a salon chair) else the counter, the stage, a `staff`
  station); their replies carry `room`
  (`activity`, `buy`) with where you are now. When every such spot is taken you stand next to the nearest one.

The `room` event goes to everyone in a room, at the end of a tick and only when something there changed, with each
person who arrived, moved, sat or stood (`here`, with `at` and `spot`) or left (`gone`):

```json
{"event": "room", "data": {"place": "heritage_coffee", "interior": "heritage_coffee", "changes": [
  {"character": "dominique", "state": "here", "at": [702, 560], "spot": "table_near_3"},
  {"character": "dax", "state": "gone"}]}}
```

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
   "target": [431.0, 471.0], "speed_mps": 10.0, "mode": "walk"},
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
  They are not sessions (neither cap counts them). They greet people they meet, sometimes start a chat
  with someone they know, and answer asks by data rules (D-064; never intimacy), all through World
  commands like any client's, still labelled. A script's `play` for one is refused with
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
`--max-scripted N` (default 32, room for every playable character in data, 27 since D-073) caps script sessions in
the world. Either refusal is
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
- Request line limit (16 KB) and outbox limit (1 MB) so a client can't exhaust memory.
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

## Play together in the browser

Until a VPS runs the server, a few friends can share one town through a published Claude artifact
(`web/client/together/`, D-057). It is the same game, rules and refusals (the host's tab runs
the core compiled to WebAssembly through `protocol::LocalTown`, D-056), with a different
"server": one person's browser tab.

**How it works.**
- The **host** is whoever holds the database lease on `town/host` (12 s, renewed every 4 s). Only
  the artifact's admins (its owner and Editors) can take it. The host's tab loads the town from
  `town/save` (or founds a new one when the database is empty), runs it at real time, 10 ticks a
  second, and answers every request: its own player's straight in the tab, each friend's through
  the room. Founders nobody has claimed live their day on autopilot (D-053).
- **Friends** open the same page. It reads `town/host` (the host's room `peer`, the hosting
  session's `epoch` and the host's public key), says `hello` on the room topic `up` with its own
  public key, and from then on talks to the host on a channel encrypted for the two of them:
  ECDH P-256, HKDF-SHA-256 to one AES-GCM key per direction, the key salted with the epoch and
  bound to the friend's page. Everyone in a room hears every message; this is what keeps rule 5.
  The host answers on `down`, which only admins can send on, and a friend also checks that
  `down` messages come from the `peer` that `town/host` names.
- **Who you are** is the platform's id for you (`user.id()`), stamped by the platform on every
  room message (`by`). The host binds a channel to the `peer` and `by` of its `hello`; a message
  from that page with another `by` ends the session; a page with no `by` is turned away
  (`no_identity`). Nothing inside a message or in presence is taken as identity.
- **One person, one character**, as one account plays one character on the server: the first
  `play` (or `create_character`) claims it in `town/claims`, keyed by the person's id. Refusals
  are the server's: `character_taken` (someone else's), `already_has_character` (you have
  another), `character_in_use` (from LocalTown), `already_playing`, `server_full` (16 people, the
  server's default cap). The same person opening a second tab and playing takes the character
  there; the first tab gets `kicked` ("playing in another tab") and can take it back. The host's
  menu lists who plays whom (only the host sees it) and can let someone pick again, the
  equivalent of `--release-character`.
- **Limits** are the server's: 20 requests a second per page (bursts of 40; dropped after 50
  refusals) and a line a second for `say` and `message` (bursts of five).
- **The wire** (`link.js`): messages drop, carry at most 4 KiB and a page sends about 40 a second,
  so items are batched into numbered frames, gzipped, encrypted, split into chunks, acknowledged
  and sent again (from 0.7 s, backing off to 4 s; given up after 30 s, and the receiver is told to
  stop waiting), delivered once and in order; every send waits its turn in one pacer of 25 a
  second.
- **Time and pausing.** The town only moves while the host's tab is visible. Hidden, the host
  stops ticking, saves, and tells everyone (a public status on `down`, and `paused` in
  `town/host` for whoever arrives); players see "Paused: the host's tab is in the background",
  and anything but `look` and `map` is refused with `town_paused` until the host is back. No time
  is caught up.
- **Saving.** Every 20 s, when the host's tab is hidden, when hosting stops, and right after a
  character is made: the whole world (the solo save format) gzipped, base64'd and split into
  parts under the database's 256 KiB per document, written to the slot not in use
  (`town/save/a/<n>` or `town/save/b/<n>`), then the manifest `town/save` (slot, parts, bytes,
  SHA-256) moves over. An interrupted save leaves the previous one whole; a save whose parts
  don't match isn't loaded, and the host is offered a new town instead, with a confirm.
- **When the host leaves.** Closing the tab stops the town: the host saves, marks `town/host`
  stopped and shortens its lease to a second. An admin whose tab has been in the town and is in
  front takes over from the save (handover) and everyone is put back in their character. With no
  such admin the town stops and the page says so: "The host left, so the town has stopped. It
  goes on from its last save when someone hosts it again." A host whose tab crashes loses at most
  the last 20 s; the lease runs out in 12 s and a handover follows. A host who reloads takes the
  town straight back (the lease holder survives a reload).

**Database layout and rules** (declared when publishing; see `web/README.md`, "Play together"):

| Path | Holds | Read | Write |
|---|---|---|---|
| `town/host` | the lease; `state` (starting, hosting, stopped), `uid`, `peer`, `epoch`, `pub`, `paused`, `saved_at` | everyone who can open the page | admin |
| `town/claims` | `{claims: {<user id>: {character, at}}}` | admin | admin |
| `town/save`, `town/save/{a,b}/<n>` | the manifest and the parts of the world | admin | admin |

**What the page says, plainly** (rule 6): on the lobby, the menu and the HUD, that the town runs
in the host's browser, pauses while the host's tab is hidden and stops when it's closed, and that
the host's browser holds everyone's state ("Whoever hosts can see everything in the town: every
person's money, messages and feelings… Play with people you trust.").

**Limits.**
- The town exists only while an admin's tab is open and in front. It is not a server.
- The host can read everything, in their own browser's memory and in the save.
- Latency grows with the number of people: every message to every friend shares the host page's
  budget of about 40 room messages a second. Tested with five people; capped at 16.
- No time skips (`dev_advance` is `forbidden`), no coin purchases (`payments_unavailable`), no
  voice.
- Publishing a new version of the artifact reloads every page: the town stops (the host's tab
  saves on the way out), the host presses Host again, and everyone joins again.
- Tested on a stand-in for the platform (`together/fake_platform.js`: BroadcastChannel and
  IndexedDB across tabs of one browser), not yet on the real artifact platform.

**How to share it.** The owner publishes the artifact (the files and the capabilities in
`web/README.md`, "Play together"), opens it, and presses **Host the town here**. Then they share
it and give each friend **Contributor** access, which lets them send their moves to the host and
nothing more: they can't host, can't read the save or the claims, and can't send as the host.
Viewers and Commenters can open the page but can't play (the page tells them to ask for
Contributor). Where the share menu offers people outside the owner's organization only Viewer or
Editor, an Editor can play too, but can also host and read the save: make Editors only of people
you'd trust as host. Friends open the link, press **Join the town** and pick a character. The
host keeps the tab open and in front while people play.
