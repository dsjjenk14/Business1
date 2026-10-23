# Proposal: a playable LIVÉRA without Unreal

**Status: accepted as D-045 (October 2026).** The owner chose the 2.5D web client, kept the clock at 1 game minute per real second, wants to play with a few invited friends on phones, will rent the server, and wants proximity voice as soon as possible (`docs/proposals/voice.md`). `docs/ARCHITECTURE.md` and `docs/ROADMAP.md` now follow this report; where they differ, they win.

This report came from a research pass in October 2026. Three independent approaches were compared, and a judge checked their claims against the code:
- a web 2.5D client grown from the town preview;
- Godot 4;
- three.js or React Three Fiber, then an Expo app.

# Verdict: LIVÉRA without Unreal

## In plain words
- **What to build:** grow the town preview you already have into a live, playable web game. It talks to the real C++ server through a WebSocket. It works in any phone or laptop browser.
- **Phase 0 (about 8–10 days of Claude Code work):** a link you open, log in and play. You tap to walk, go into buildings, buy things, ride the bus, and use whisper, say or shout with speech bubbles. You see friends who are logged in at the same time.
- **Later phases:** shared buses on routes, real streets, drawn bodies, babies and driving. After that, a 3D view (three.js) can replace the 2D drawing inside the same web client.
- **Skip for now:** Godot, and an Expo native app.
- **The engine is the smaller part.** About 60% of what you love (seeing other people move, buses on routes, cars, a busy town, baby looks) is server work that every option needs, Unreal included.

---

## 1. Checked against the code, with corrections

| Claim | Verdict | Evidence |
|---|---|---|
| Transport is raw TCP, IPv4, one JSON object per line, 16 KB line cap, no TLS or WebSocket | **True** | `src/net/Socket.cpp:31` (`AF_INET, SOCK_STREAM`), `LineBuffer` at :77-91, `Socket.h:14`. `Socket.h:10-11` still says "production client will use Unreal's replication". |
| `rate_limited` and `bad_request` replies have no `re` | **True** | `src/server/Server.cpp:237,242`. `chat_rate_limited` does carry `re` (:246-251). |
| At most 8 players; the server is one thread | **True** | `Server.h` `maxPlayers = 8`. The single-thread comment is in `Server.h`. |
| `look.people` gives only `{id, name, known, distance_m}`; sight range is a C++ constant of 40 m; offline people are skipped | **True** | `src/core/WorldViews.cpp:16` and the people loop in `World::look`. |
| `presence` events carry no coordinates | **True** | `World.cpp:451,461,501,526`. |
| Walking is a straight line at 6 m/s, moved by the server each tick; `arrived` goes only to the mover | **True** | `World.cpp` `advanceRealTime`: `emit({id}, "arrived", ...)`. Speed is in `simulation.json`. |
| The bus is not a vehicle; the rider slides straight to the destination stop at 24 m/s | **True** | `Items.cpp` `ride`: `c.moveTarget = dest->at; c.moveSpeedMps = line->speedMps`. `transit.json` `speed_mps: 24`. |
| Speech ranges: whisper 2 m, say 20 m, shout 60 m; indoor and outdoor never cross | **True** | `simulation.json`, `World::say`, `together()` at `World.cpp:1122`. |
| Driving does not exist | **True** | A grep of `src` and `data` finds only Dax's "pickup truck keys" (`dax.json:134`), `parking` amenity strings, and the hospital's gravel lot description. |
| `src/core` depends only on nlohmann_json; CMake makes SQLite, OpenSSL and Threads mandatory | **True** | `CMakeLists.txt:30-32` are unconditional. `std::filesystem` appears only in `Content.cpp:73-89`. Core has no threads, chrono, `random_device` or stdout. |
| Core throws exceptions | **True** | `Content.cpp:19`, `Serialization.cpp:282`. `try` appears in 8 core files. |
| WebAssembly toolchain is ready | **False / not yet** | `emcc` is not installed. `clang++`, `node` v22.22.0 and `bun` are. **Godot and Blender are not installed either.** B's "Claude Code can build it in the container" and A/C's "Claude scripts Blender" are unproven until those are downloaded. |
| Children are invisible | **True, and stronger than stated** | Children are never `online`, so `look` skips them even in the same room. Every hour they are placed inside home, school or daycare with no walk (`Family.cpp` `c.inside = where->id`). |
| Babies have no appearance | **True** | `Romance.cpp:416` `giveBirth`: the profile holds only `born_in_livera`, `parents`, `birthplace` and `tagline`. |
| Pets have no position | **True** | `World.h` `PetState` has a `home` field and no x,y. |
| Unreal can't be built in this container | **True** | ROADMAP M1: "This can't be built in the cloud container". D-003. |
| Expo rules apply to a LIVÉRA client (C) | **Conflicts with the project rules** | `livera/CLAUDE.md` says the root Expo guidance "does not apply here". C would have to change that rule. Parent `package.json`: `expo ~57.0.25`, `react-native 0.86.3`, `livekit-client ^2.22.3`, `@shopify/react-native-skia 2.6.2` (C's claims hold). |
| A: "WebAssembly single-player is the first link you can open" | **Corrected** | A's own numbers put the WebAssembly path at 11–15 days, against about 11–13 days for hosted. The WebAssembly path also needs emsdk installed and is **not multiplayer**. The hosted live-server path is about as fast and gives you what you asked for. |
| B: "Godot C# can't export to the web" | **Matches Godot 4 as far as I know, not verified here** | Check against whichever 4.x version gets pinned. |
| C: "about 3 days to walk alone on your phone" | **Optimistic** | It needs Expo web, react-native-web and React Three Fiber set up, plus 3D town building from scratch. The 2D preview reuses about two thirds of its renderer. |

**New findings none of the three proposals raised:**
1. **You can hear people you can't see.** Shout reaches 60 m outdoors but sight is only 40 m. A player can get a `speech` event from someone the client has no position for. Either raise sight range to at least shout range, or put the speaker's position or direction in off-screen speech.
2. **The three volumes only differ outdoors.** Indoors, `together()` ignores distance. Say and shout reach the same people, and whisper reaches your target anywhere in the building. If whisper, normal and loud should feel different inside, buildings need rooms or indoor ranges in data. B touched on this; it matters more than B said.
3. **6 m/s is a run (21.6 km/h).** C flagged this. Walking animations will look wrong unless you play a jog or change the data.
4. **D-013 expected the client to predict movement in M1, and D-004 said the JSON protocol would be replaced.** The new decision should keep movement server-moved and make the JSON protocol the game protocol. Both "revisit" notes need superseding.
5. **The town will be empty.** With an 8-player cap and offline characters frozen, a scripted "town director" (as the recordings use) or server-side autopilot is essential to "seeing people walk". It belongs in Phase 0 or 1, not at the end, and must be labelled.
6. **A server binary is already built in `livera/build/`.** After the recording job ends, Phase 0 can start testing walking alone with no C++ change. Seeing other players still needs the visibility change, about 2 days.

---

## 2. Scores (1–10; for Risk, higher means safer)

| | A: web 2.5D, grown from the preview | B: Godot 4, 3D | C: React Three Fiber web, then Expo native |
|---|---|---|---|
| Fidelity to what you love | 6 | 8 | 8 |
| Time to first playable | **9** | 5 | 6 |
| Cost | 9 | 9 | 8 |
| Solo maintainability with Claude Code | **9** | 6 | 6 |
| Mobile reach | 8 | 6 | 8 |
| Risk | **8** | 5 | 5 |
| **Total** | **49** | 39 | 41 |

**Why I adjusted their self-scores:**
- **A:**
  - About 2/3 of the renderer already exists: isometric maths, bubbles, weather, day and night, tap detection.
  - Playwright and node are already in the container, so Claude can screenshot-test it.
  - Fidelity stays at 6: no 3D, and avatars are small pins until bodies are added.
- **B:**
  - Godot and its export templates aren't installed.
  - Checking visuals without a screen (xvfb with software rendering) is unproven.
  - It adds a second language and a full renderer rewrite.
  - The web export is tens of MB, and iOS needs a Mac.
  - Highest fidelity ceiling, but slowest and riskiest.
- **C:**
  - Strong fidelity and good mobile web reach.
  - React Three Fiber on expo-gl with SDK 57 is unverified, and C couldn't reach the Expo docs.
  - It stacks three fast-changing libraries and breaks the "no Expo in livera" rule.
  - Its 3D web part is worth keeping, but for Phase 2.

---

## 3. Recommendation: one path, in phases

**Path:** one web client in `livera/web/`, grown from the preview, using the same protocol throughout.
- 2.5D canvas now (A).
- A three.js 3D renderer later, behind the same state, transport and UI modules (C's 3D idea, web only).
- An app-store wrapper only at the end.
- Godot stays a fallback. The protocol is engine-neutral, so a Godot client could be added later without server changes.

### Phase 0: playable preview (about 8–10 Claude-days, after the recording job finishes)

**What you can do in it:**
- Open a link on your phone or laptop and log in with an account Claude makes for you (registration closed, invite-only).
- Pick a founding character or make one in the creator.
- Tap the ground to walk. The clock, day and night, and weather all come from the server.
- Tap a building to walk to its door, then Enter. A sheet shows who's inside, offers with prices (Buy), activities, work or study, and Exit.
- Tap a bus stop and pick a destination. Pay by card, cash or LivPay, or dodge the fare. The bus is drawn and labelled as a "single-rider shuttle" until real buses exist.
- Use a chat bar with a **Whisper / Say / Shout** switch:
  - a ring shows how far your voice carries;
  - Whisper only offers people within 2 m;
  - bubbles appear over speakers;
  - after you speak you see "Heard by 3" or "Nobody heard you".
- Tap a person for the 6 interactions, give or tip.
- Use a phone button with all 26 apps, as simple cards first; bank, messages, map, transit and career get proper screens.
- See friends who are logged in walking in real time, within sight range.
- See founding residents moving, played by a clearly labelled script ("played by a script; the server decides every outcome"), like the recordings.

**How you open it:** a web address on a small rented server (VPS), such as `https://livera.<your-domain>`, or a free hostname if you don't buy a domain. Add it to your home screen.
- **You need to:** create and pay for the VPS account, then give Claude SSH access or paste one command.
- **Honest labels stay on the page:** "2.5D preview; street layout and building shapes are sketches", "played by a script", and "placeholder landmark" on the fire station.

**Steps:**

| # | Step | Days |
|---|---|---|
| 0 | Decision D-044 (web client replaces Unreal for M1; the JSON protocol becomes the game protocol); rewrite ROADMAP M1 and ARCHITECTURE's client section | 0.5 |
| 1 | Server visibility: position, moving, target, speed, mode and inside in `look.people`; a `moving` event to onlookers; `arrived`, `entered` and `left` to onlookers; events for forced moves; `sight_range_m` in data (120–150 m, at least the shout range); `re` on every reply; tests | 2 |
| 2 | Node WebSocket-to-TCP gateway, about 100 lines, no server change | 0.5 |
| 3 | Fork the client from `days20_shell.html`: live state (straight-line prediction), transport, login and character pick, tap to walk, enter and action sheet, bus, chat bar, phone cards, feed; full-screen phone layout with tap targets of at least 44 px; Playwright tests at phone and desktop widths | 4 |
| 4 | Hosting: VPS, Caddy (`wss://`, free certificates), systemd, `--closed-registration`, nightly SQLite backup | 1 |
| 5 | Labelled town-director bot, reusing the `rec2` scripts; raise `maxPlayers` (for example to 16) | 1 |

**Hosting:** about $5–12/month. A domain is optional at about $10–15/year.

### Phase 1: live multiplayer that feels real (about 4–6 weeks)
- **Security before more people join:** session tokens, login throttling, minimum moderation (mute, block, report log), and optionally a WebSocket listener built into the server. About 3–5 days.
- **Real streets:** promote the preview's `SHAPES` and `ROADS` into `data/world/town_layout.json` once you approve the layout. Add server pathfinding so `moving` carries a path and nobody walks through walls. About 4–5 days.
- **Shared buses on a timetable:**
  - bus position is a pure function of game time;
  - riders wait, board, ride together and get off at their stop;
  - all buses are drawn town-wide (they are public);
  - riders are drawn only when in sight.
  
  About 3 days.
- **Autopilot residents:** offline founding characters follow `profile.schedule` on the server, labelled "autopilot". This replaces the bot. About 5 days.
- **Bodies:** paper-doll 2.5D avatars from the 16 creator fields, with 4–8 facings and a walk cycle. Photoreal faces stay as the head at close zoom and on cards. Founding cast creator values go into data. About 5–6 days.
- **Babies and children:**
  - babies get an appearance at birth, derived from their parents with the saved random stream, plus a save migration;
  - children become visible in the same building;
  - life-stage proportions by age.
  
  About 3 days.
- **Driving v1:** vehicles in data, a dealer, ownership and parked position, then `buy_vehicle`, `drive {to}` along roads, `park` and `ride_with`. Parking, fuel and insurance costs come from data and go through `Ledger`. You choose where to go and watch the car drive there; there is no free steering. About 6–7 days.
- **Indoor acoustics:** rooms or indoor ranges so whisper, say and shout differ inside. About 2 days.
- **Add to home screen (PWA).** About 0.5 day.

**Hosting:** the same, about $6–12/month.

### Phase 2: richer visuals (about 5–8 weeks, plus an art budget)
- **3D view:** a three.js renderer in the same web client, swapped in behind `state`, `transport` and `ui`:
  - a low-poly town built from the layout data;
  - a glTF modular avatar kit (hire an artist for the base bodies, a few hundred dollars each, estimated);
  - walk, talk, shout and lean-in-to-whisper animations;
  - bus and car models;
  - 3–4 interiors (Heritage Coffee, The Copper Tap, a Maple Court unit, a Lexington unit).
  
  The 2D map stays as the town overview and the fallback for low-end phones.
- **Proximity voice:** LiveKit, with the server deciding who can hear whom using the same 2, 20 and 60 m rules. Only after moderation is in place. About 5–8 days.
- **App stores (optional):** a Capacitor or Expo WebView wrapper, which brings in the Expo rules at that point. Coins need in-app purchase, and adults-only content needs a 17+/18+ rating and an age gate.
- **Offline demo (optional):** a WebAssembly single-player build. It needs `handleOp` pulled out of `Server.cpp:369-500`, emsdk installed, and the CMake guards.

**Hosting:** about $10–30/month, plus LiveKit usage. Stores cost $99/year (Apple) and $25 once (Google).

---

## 4. Server changes needed whatever the client is
1. **Browser transport.**
   - Now: a WebSocket gateway.
   - Later: a WebSocket listener inside `Server::run`, with `wss` through Caddy.
2. **Protocol hygiene.**
   - `re` on every reply (`Server.cpp:237,242`).
   - Protocol renamed `livera/1` with versioning.
   - Session tokens, login throttling, moderation ops.
   - Update the comment at `Socket.h:10-11`.
3. **A stream of nearby movement.**
   - Positions and motion in `look.people`.
   - `moving {character, from or path, speed_mps, mode, started}` sent to onlookers.
   - `arrived`, `entered` and `left` with positions sent to onlookers.
   - Events for forced moves: jail, emergency room, child placement, moving home.
   - `kSightRange` moved into data.
4. **Speech.**
   - Speaker position or direction on `speech` events the hearer can't see (shout is 60 m, sight is 40 m).
   - An optional text-free `whispering {from, to}` event for onlookers.
   - Indoor rooms or ranges.
5. **Public rules sent to clients** in `welcome` or `map`: speech ranges, walk speed, minutes per real second, sight range.
6. **Appearance.**
   - A view of what is physically visible: creator fields and the outfit currently worn.
   - The founding cast mapped to creator options in `data/characters`.
   - Baby appearance written at birth (with a migration).
   - Looks by life stage.
7. **Children and pets.**
   - List children who aren't online when they share your building.
   - Optionally, children walk to school.
   - Pets get a position while being walked.
8. **Town layout in data.** Footprints, heights, roads, footpaths, walk graph, parking points and bus route polylines in `data/world`, validated by `ContentDatabase` and served by `map`.
9. **Pathfinding in core.** Replaces straight lines; the path is recomputed on load, not saved.
10. **Real buses.** Timetable as a pure function of time, waiting at stops, boarding, shared riders, getting off. A migration for the waiting state.
11. **Driving.**
    - `data/vehicles` (models, price in cents, speed, seats), a dealership place.
    - `VehicleState` with a migration.
    - `buy_vehicle`, `drive`, `park`, `ride_with`.
    - Parking fees, fuel and insurance as data through `Ledger`.
    - Drunk-driving and parking-ticket hooks.
    - Tests for every refusal. No positions reported by the client.
12. **A busy town.**
    - Short term: raise `maxPlayers` for labelled bot clients.
    - Long term: server autopilot or Tier-2 NPCs, labelled.
13. **Pace.** Decide on walk speed (6 m/s is a run), and possibly faster travel options.
14. **A town-overview spectator mode, if you want one.** It must be admin-gated, because rule 5 forbids showing everyone's position to a player.
15. **Docs.** D-044 supersedes the engine half of D-002, plus D-003, the revisit notes on D-004 and D-013, and the voice part of D-019. Also update ROADMAP M1 and M2, ARCHITECTURE, and the "Unreal module" line in `livera/CLAUDE.md`.

---

## 5. Other formats you could consider
1. **Isometric "dollhouse" cutaway (The Sims):** the best fit for a life sim with interiors. It is the natural Phase 2 target, but it needs a layout for each building.
2. **Top-down city (GTA 2):** great for driving and bus routes and easy to read on phones. It flatters fashion and avatars less.
3. **Phone-first with a map (Find My or Pokémon Go style):** matches the 26 phone apps you already have and is the cheapest. You lose the feel of watching people walk unless the map shows people in sight.
4. **Text chat plus a map, like Discord:** whisper, say and shout map cleanly onto chat, and moderation tools are easy. It is the weakest on visuals.
5. **Visual-novel scene cards:** when you enter a place, the photoreal art sheets become the characters in a scene. The existing art becomes the star, and it pairs with any map view. Strong add-on.
6. **Isometric rooms (Habbo or Club Penguin style):** proven for social games and scales well. Getting around town becomes hopping between rooms, so the bus is a scene change.
7. **Top-down 2D with proximity voice (Gather.town style):** the volume rules map cleanly onto distance. The art style clashes with the photoreal brand.
8. **Cozy low-poly 3D, third person (Animal Crossing style):** closest to the picture you described, with the same cost and risk as Phase 2.

**Best fit:** a map view (2.5D now, a 3D dollhouse later) plus visual-novel scene cards for the photoreal art. That keeps every layer, and the art stays where it looks best.

---

**Files checked:**
- /home/user/Business1/livera/CLAUDE.md
- /home/user/Business1/livera/CMakeLists.txt
- /home/user/Business1/livera/src/net/Socket.cpp
- /home/user/Business1/livera/src/net/Socket.h
- /home/user/Business1/livera/src/server/Server.h
- /home/user/Business1/livera/src/server/Server.cpp
- /home/user/Business1/livera/src/core/WorldViews.cpp
- /home/user/Business1/livera/src/core/World.cpp
- /home/user/Business1/livera/src/core/World.h
- /home/user/Business1/livera/src/core/Items.cpp
- /home/user/Business1/livera/src/core/Family.cpp
- /home/user/Business1/livera/src/core/Romance.cpp
- /home/user/Business1/livera/data/config/simulation.json
- /home/user/Business1/livera/data/transit/transit.json
- /home/user/Business1/livera/data/characters/dax.json
- /home/user/Business1/livera/docs/DECISIONS.md
- /home/user/Business1/livera/docs/ROADMAP.md
- /home/user/Business1/livera/docs/SIMULATION.md
- /home/user/Business1/package.json
- /tmp/claude-0/-home-user/a38041b1-6431-5559-890a-8639d0c9a5ee/scratchpad/preview/days20_shell.html

Nothing was edited, built or started.