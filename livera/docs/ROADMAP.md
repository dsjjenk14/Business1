# Roadmap

Built in small vertical slices. Every milestone leaves the project playable and tested.
Status is kept honest: ✅ done and tested, ⚠️ partial, ⬜ not started.

## M0 — Foundation and headless founding slice ✅ (this milestone)

Covers spec Phase 0, plus the server-side halves of Phases 2–5 that the slice needs.

**Delivered**
- Architecture and docs (this folder), coding rules (`CLAUDE.md`), decision log.
- Engine-agnostic C++20 simulation core: clock and calendar, data-driven content with
  validation, needs, emotions, personality, values, directional relationships, memories,
  careers with promotion, ledger, rent, activities, construction and city stages.
- Dedicated authoritative server: accounts (PBKDF2), login takeover, one character per
  account, rate limiting, size limits, event routing, autosave, graceful shutdown.
- SQLite persistence with migrations and a ledger-balance guard.
- Headless client with a script mode; `scripts/demo_slice.sh`.
- 49 tests, including a two-player network test across a server restart; ASan/UBSan clean. (66 after M0.5.)

**Vertical slice (spec §33) status**

| # | Step | Status |
|---|---|---|
| 1 | Launch LIVÉRA | ⚠️ server + text client; no game client |
| 2 | Enter the founding town | ⚠️ logical town (places, distances, construction); not rendered |
| 3 | Create or select a character | ✅ creator added in M0.5 (no 3D preview) |
| 4 | Walk around | ⚠️ server-authoritative movement; no 3D, camera or animation |
| 5 | Enter an apartment | ✅ |
| 6 | Use the phone | ⚠️ 9 apps as server views; no phone UI |
| 7 | Meet another player | ✅ |
| 8 | Talk to them | ✅ interactions, phone texts, and (M0.5) proximity chat; no voice yet |
| 9 | Build a relationship | ✅ |
| 10–13 | Go to work, earn, spend, return home | ✅ |
| 14 | See the world continue changing | ✅ construction, openings, city stats |
| 15–18 | Save, disconnect, reconnect, state preserved | ✅ including a full server restart |

Every ⚠️ is the same gap: **there was no game client.** M1 is the web client (D-045).

## M0.5 — Make your own character, talk, make music ✅

Requested by the product owner ahead of the spec's phase order (character creation was Phase 7).

- **Character creator** (`data/creator/character_creator.json`): name, age, pronouns and
  gender (custom allowed), 16 appearance fields (skin, face, hair, makeup, tattoos,
  piercings, outfit, accessories...), height, personality and values on a point budget,
  traits, interests, education, relationship status, goals, background, origin
  ("Why did you move to Livéra?") and starting career. Origins set money, career level and
  housing tier; new arrivals move into a vacant home. One created character per account.
- **Proximity chat:** `say` (20 m outdoors / same building), `shout` (60 m), `whisper`
  (one person beside you). Chat has its own flood limit. Talking to people is social contact.
- **Music:** a phone studio with 15 instruments (data), songs up to 16 bars and 4 tracks,
  private drafts, releasing to the town chart, live performance on stages (Heritage Coffee
  open mic, Greater Hope, Founders Park, ÉCLAT), a music skill that grows with practice and
  raises performance quality, audiences who enjoy it and remember great sets, and tips.
  The dev client composes with a text notation and exports MIDI.
- **Also:** an entry-level Café career (Barista → Shift Lead → Café Manager), save format v2,
  66 tests.

## M0.6 — The founding cast ✅

- Character reference art for all 11 founding characters in `art/reference/characters/`,
  linked from each character's data (a test checks every link).
- Jaxon Reid became **Dax Hendrix**, AI Engineer (same face, history and secrets, adapted).
- Nine new playable characters from the art cards: Harper, Andre, Naomi, Graham, Maya,
  Julian, Leila, Aaliyah, Sienna. Each has a home, a career at a real workplace, money,
  personality, values, secrets, a schedule and directional ties to others.
- Nine new places with gameplay (therapy and yoga, a recording studio that's a stage, a
  boutique, a community center with volunteering and dinners...), ten new careers (seven
  open to new players), Founders Row townhouses and Riverside Lofts.
- Staff can always enter their own workplace. Characters can start with skills.
- 71 tests.

**Not in M0.5:** voice chat (needs the engine's voice service, M1), a visual character
creator and 3D preview (M1/M2), song editing UI (the client's job), royalties or music
careers, moderation tools for chat (needed before any public server).

## M0.7 — Everyday life, at the product owner's request ✅

- **Body:** bathroom (accidents if you hold it; breaks on shift), brushing teeth (or a
  toothache), grooming (it shapes first impressions), weight from calories in and out,
  aging with birthdays and life stages.
- **Home:** cleanliness and trash; housework and taking out the trash; a filthy home is
  unpleasant and can make you sick.
- **Illness and care:** colds, flu, food poisoning, toothache, depression, addictions and
  fictional STIs; Livéra General Hospital (ER, maternity, rehab), the clinic, the pharmacy
  (prescriptions need a diagnosis); doctors and nurses on duty earn from the care they give.
- **The offline rule** (D-023): three real weeks of self-care, then depression.
- **Things:** an inventory; clothes and accessories you wear, a laptop and headphones you
  use, medicine, tests; Thread & Co., Circuit Electronics, Riverdale Pharmacy, Lustre
  Jewelers, Fade & Glow Salon; giving gifts.
- **Getting around:** Livéra Transit Line 1, with fares and fare inspectors.
- **School and work:** Livéra University (bachelor's, law school, medical school, nursing)
  and the police academy; degrees gate careers; eleven new careers including doctor, nurse,
  lawyer (Hale & Partners), police, professor, bartender.
- **Crime:** shoplifting, pickpocketing, fare evasion, drugs; detection, fines, jail,
  records, warrants, patrols and police players. Alcohol at The Copper Tap; fictional
  street drugs with highs, crashes, addiction and overdoses.
- **Romance and family:** dating, kissing, engagement, marriage, breakups and divorce;
  consensual, adults-only intimacy that fades to black (D-025); pregnancy, miscarriage,
  abortion care, birth, babies who grow up and become playable at 18.
- **Fame:** from performances, releases, weddings and headlines; celebrity tiers.
- 136 tests when M0.7 was done, sanitizer-clean.

**Not in M0.7:** children's care and childhood gameplay (babies live their routine), any
autonomous NPC behavior (staff, dealers and inspectors are abstract), cheating being found
out (needs the gossip system), moving in together beyond visiting rights, buying a home,
reporting and blocking players (required before a public server), voice, and anything
visual (M1).

## M0.8 — Family, home, work and the town, at the product owner's request ✅ done

- **Who can conceive:** female and male characters (`sex`), asked in the creator; only a
  woman and a man together can start a pregnancy, and she carries it (D-031).
- **Aging on the calendar:** one birthday a game year; old saves keep their ages (D-032).
- **Starting age:** 18, your twenties or your thirties (D-034).
- **Children:** daycare (Little Sprouts) and school (Founders School, K-12) with grades and a
  diploma; supervision and child services; care routines at home; nannies hired and paid by
  families; daycare and school-teaching careers (D-033).
- **Homes:** eight houses and condos for sale on Willow Lane; buy alone or with a partner
  (down payment split, mortgage split, one covers the other), real mortgages from Livéra
  Savings Bank (monthly with the rent, missed payments, late fees, foreclosure); move in
  together (lease ends, rent split, both have a key); move out, move back, sell (mortgage
  paid off, the rest split); children and the nanny's key follow the family; phone `homes`.
- **Work decisions:** on shift, up to three job decisions a day from the career's bank (186
  across all 30 careers; Dominique's are hiring calls). Good calls raise performance and add
  promotion hours, so attentive players are promoted sooner; idling pays and counts as
  before. Phone app `work`, ops `work_tasks` / `work_answer`, CLI `tasks` / `decide`. (Since the
  redesign: four a day, coming up through the shift; D-060.)
- **Coins, phones and LivPay:** a premium currency in its own zero-sum ledger, credited once
  per server-verified store receipt (real store billing not connected yet: refused honestly;
  test payments on dev servers and with `--test-payments`); a cosmetic coin shop enforced by
  validation; a phone for every adult with models, battery, charging, cases and switching; a
  dead phone blocks apps and texts; LivPay tap-to-pay in shops and on the bus and bank-to-bank
  transfers with limits.
- **Leisure:** date spots (Lumière Bistro, the Starlight Cinema, Willow Lake Park with
  rowboats, picnics, the boardwalk and stargazing after dark); doing them with your partner
  counts as a date, once per place per day. A town league (soccer at Riverside Field,
  basketball at Riverside Court) played by the server each week from the teams' rosters and
  the members who turn up; practice builds `athletics`; standings, results and rosters in the
  `sports` app; coaching and restaurant jobs at the clubhouse and Lumière.
- **Pets and medicine:** adopt a dog, cat or rabbit at Paws & Whiskers; feed, play, cuddle,
  groom and walk them; the vet at Founders Animal Hospital; animal control for neglect. Over-the-
  counter and prescription medicine with daily limits, prescriptions from checkups, overdoses.
- **Little details:** wetting yourself is a public, lasting humiliation (witnesses, gossip, a
  partner's reaction, ruined clothes, the paper for the famous); laundry at home or Suds & Spin;
  daily weather with forecasts and umbrellas; birthday notices and cakes; hangovers.
- 238 tests, sanitizer-clean. Each feature's protocol ops, CLI commands and what is not done: `docs/m08/`.

## M1 — Playable web client and live multiplayer (D-045) ⚠️ — in progress

The owner's choices (October 2026): a 2.5D web client grown from the town preview, the clock
kept at 1 game minute per real second, the owner and a few invited friends playing on phones, a
rented VPS with a domain, and proximity voice as soon as possible. Plan and estimates:
`docs/proposals/web_client.md`; voice: `docs/proposals/voice.md`.

**Phase 0 — a link you open and play** (status in the table is kept honest as work lands)

| Step | Status |
|---|---|
| Decision D-045; ROADMAP, ARCHITECTURE and the core-dependency rule updated | ✅ |
| Server: positions and motion of people in sight (`look.people`, the `people` stream), sight range in data (never below shout range), speaker position on speech, `whispering` for onlookers, public rules/transit/interactions in `map`, `re` on every reply, protocol `livera/1` | ✅ |
| Server: session tokens and `resume`, login throttling, admin commands to add accounts and release a character, human-only player cap (16) | ✅ |
| Server: scripted characters labelled (`bot_` accounts), never claiming, giving way to humans | ✅ |
| WebSocket gateway (`web/gateway`) | ✅ |
| Web client (`web/client`): log in, pick or create a character, tap to walk, enter and act, bus, whisper/say/shout with bubbles and a range ring, people cards, phone apps; phone-first layout; Playwright tests | ⚠️ built; Playwright tests in Chromium at phone and desktop sizes; not yet tried on a real iPhone or Android phone (what the tests cover and what's missing: `web/README.md`) |
| Labelled town director (`scripts/town_director.py`) | ✅ (`scripts/test_director.sh`) |
| Autopilot residents: founders nobody plays live their day inside the core (`src/core/Autopilot`, D-053), labelled `played_by: "autopilot"`; server flag `--autopilot` | ✅ (`tests/test_autopilot.cpp`, `tests/test_server.cpp`) |
| Deploy scripts for an Ubuntu VPS (`deploy/`: Caddy HTTPS, systemd, backups, firewall) | ⚠️ written and dry-run in a sandbox; not yet run on a real VPS |
| Running on the owner's VPS | ⬜ needs the owner to rent it and paste one command |
| Five people in one town on the web before the VPS: "Play together", the host's tab runs the town through LocalTown and friends play over the artifact's room, encrypted per person (D-056, D-057, `docs/MULTIPLAYER.md`) | ⚠️ built; five pages on a stand-in for the platform (`web/tests/run_together_e2e.sh`, 15 tests) and five players on the live server (`web/tests/run_e2e.sh five_players.js`); not yet published or tried on the real artifact platform |

**Next: voice v1** right after Phase 0, designed in `docs/proposals/voice.md`: server-decided
hearing with the same whisper/say/shout ranges, a push-to-talk button, a mic indicator, and the
moderation it needs first (mute, block, report, admin kick).

**Phase 1 — feels real (about 4–6 weeks):** real streets and pathfinding, shared buses on a
timetable, residents on autopilot when nobody plays them (✅ `--autopilot`, D-053), drawn bodies from the creator fields,
babies with an appearance and visible children, driving v1, rooms indoors so whisper and shout
differ inside, add-to-home-screen.

**Phase 2 — richer visuals:** a three.js 3D view in the same client, interiors (2.5D rooms from the owner's
pictures are in: D-066, below), animation, and an optional app-store wrapper. The character creator gets a live preview there, and songs play
in the world from their note data.

## Redesign: easier, more playable (`docs/proposals/redesign.md`)

Server and core half (the client half is tracked in `web/README.md`):

| Item | Status |
|---|---|
| R1.2 read-only views: effects and `ready_at` per activity and offer in `look`, opening hours and days in `map` (a place's status now keeps its days), home and workplace in `characters` | ✅ (`tests/test_world.cpp`, `tests/test_server.cpp`) |
| R2.3 decisions through the shift (four a day, one every 150 game minutes, a `work_decision` event each), break-room coffee at offices, `chat_regulars` at Heritage Coffee, and the tunings (D-060) | ✅ (`tests/test_work.cpp`, the tunings test in `tests/test_world.cpp`) |
| R2.1 goals: three daily goals per character and day and aspirations from the creator or a founder's data, phone app `goals`, untracked goals labelled with the reason (D-061) | ✅ (`tests/test_goals.cpp`, `tests/test_server.cpp`) |
| R2.2 sleep (`sleep` op, `good_morning`), the night-skip helper `World::skipNight` for every host, the server's bed rule behind `--night-skip`, and LocalTown's (single-player and Play together) always on (D-062) | ✅ `tests/test_world.cpp`, `tests/test_server.cpp`, `tests/test_localtown.cpp` |
| R2.4 away pay for scheduled work (`salary_away`, data shares, default block for made characters) and the server's `--pause-when-empty` (D-063) | ✅ (`tests/test_world.cpp`, incl. a six-real-day once-a-day player who stays solvent; `tests/test_server.cpp`) |
| R2.5 autopilot manners: greet a person once per day, sometimes chat with someone they know, answer asks by data rules, never intimacy, never each other (D-064) | ✅ (`tests/test_autopilot.cpp`) |
| R2.6 the creator applies the same entry requirements as `apply` (`missing_degree`; `creator_options` marks the educations each career takes); AI Engineering now needs a bachelor's | ✅ (`tests/test_creator.cpp`) |
| Go inside places: rooms traced from the owner's interior pictures (`data/interiors/`, thirty-five so far), `move_inside` / `sit` / `stand`, one person a seat, activities, purchases, performances and shifts at their spots, an arrest holds you on a cell's bench (spot kind `cell`), `look.here.room` and the `room` event, the web client's room view (`interior.js`) (D-066) | ✅ (`tests/test_interiors.cpp`, `tests/test_server.cpp`, `web/tests/interiors_e2e.js`) |
| Life events, the BitLife pillar: 50 scenario cards in `data/events/` (work, money, love, friends, family, health, the town, temptation, the street), up to two a day at sensible moments, a pure weighted draw over what holds right then, outcomes through the World's rules (money only by the ledger), `life_event` / `event_answer` / `life_event_lapsed`, the phone app `story`; the web client's cards and Story app (`moments.js`) (D-068) | ✅ (`tests/test_events.cpp`, `tests/test_server.cpp`, `web/tests/moments_e2e.js`) |
| Street life, the first GTA step: shoplifting only in shops the data names, read-only `crime_risk` (the odds from who could see you, and the consequence ladder), officers in uniform in `look` and the people stream, wanted and held in `look.you` and the Record app; in the client, Shoplift / Pick a pocket / the Underpass after dark with the odds first, the Wanted and Held chips, the cell's card (D-069) | ✅ (`tests/test_street.cpp`, `tests/test_server.cpp`, `web/tests/moments_e2e.js`) |
| Fist fights: `fight` / `fight_respond` / `fight_prefs`, the person attacked chooses (fight back, run, take it) or always walks away, injuries as conditions the clinic treats, assault only when a blow lands, one fight a pair a day, protection afterwards (D-070) | ✅ (`tests/test_street.cpp`, `tests/test_server.cpp`, `web/tests/moments_e2e.js`) |

## Release 5: Golden Hour, with the best of Talk of the Town (D-076, `docs/proposals/golden_hour_build.md`)

| Item | Status |
|---|---|
| A faster clock: 2 game minutes per real second, walking 10 m/s, the bus 40 m/s, units converted where code mixed them (D-075) | ✅ (every suite at the new rate) |

## M2 — Dominique, complete (spec Phase 2) ⬜

- Character art pipeline: the approved artwork as reference, her drawn body in the 2.5D
  client and later a 3D model for Dominique, her wardrobe and silhouette.
- Full phone UI in the web client over the existing phone views.
- Schedule-driven autonomy while she's not being played (her routine in `profile.schedule`).
- Her apartment interior with usable objects instead of abstract activities.

## M3 — Social simulation (spec Phase 4) ⬜

Conversations with choices, memory decay and recall, memory-driven reactions,
information and secrets (facts vs beliefs: the cast's secrets are already in their data,
ready to become Facts), first gossip propagation (starting with @livera.unfiltered).

## M4 — Economy (spec Phase 5) ⬜

Expenses (utilities, food, transport), debt and arrears consequences, credit, buying and
selling property, mortgages, roommates, transaction history UI.

## Later milestones (spec order)

| Milestone | Spec phase | Scope |
|---|---|---|
| M5 | 6 City | New neighbourhoods, roads, services, crews as Tier-2 agents, secondary effects |
| M6 | 7 Player characters | ~~Character creator, origins~~ (done in M0.5); character slots, appearance editing, haircuts and wardrobe changes |
| M7 | 8 Businesses | Ownership, hiring (including players), payroll, inventory |
| M8 | 9 AI citizens | Goals, schedules, jobs, relationships, autonomy (Tier 2) |
| M9 | 10 Social media | Posts, followers, virality, sponsorships |
| M10 | 11 City development | Player developers, permits, financing, property market |
| M11 | 12 Life events | Data-driven event engine |
| M12 | 13 Generations | Life stages, children, inheritance |
| M13 | 14 Polish | Animation, UI, audio, VFX, performance, accessibility, onboarding |

Built for the VPS: transport encryption (Caddy terminates HTTPS in front of the gateway), resume
tokens and per-username login throttling (MULTIPLAYER.md). Still required before voice or any
public server: moderation (mute, block, report, admin kick). Not built either: per-IP login
throttling in the server (MULTIPLAYER.md, "Not yet").
