# The LIVÉRA redesign showdown: brief for both studios

Two studios compete to redesign LIVÉRA. **All design and play options are open**: genre emphasis,
camera, controls, the loop, progression, multiplayer, monetisation, even the engine. A panel judges
both pitches against the criteria below, picks a winner, and the owner decides what gets built.
You are one studio. The other studio works in parallel on the same brief; you never see its work.

## The game today (read and play it before you design)

LIVÉRA is a life sim set in a founding town that grows into a city. Repository:
`/home/user/Business1/livera` (read-only for you). Read, in this order:
- `docs/GAME_DESIGN.md`: the fantasy, pillars, systems table (what is built).
- `docs/proposals/redesign.md`: the last review, what players found broken, Releases 1–4.
- `docs/ROADMAP.md` (status), `docs/DECISIONS.md` (skim the headings; D-065 to D-070 are the latest:
  map-first client, walk-in rooms, whole-body figures, life events, street crime, fist fights).
- `web/README.md`: the web client, how it looks and why.
- `data/`: all content is data (characters, places, careers, events, items, interiors).

What exists, in short: an authoritative C++20 simulation core (`src/core`: needs, emotions, body, home
upkeep, illness, careers with shifts and decisions, university, money via a strict ledger, shops,
transit, romance, family and kids, pets, music and performing, sports, fame, crime, police, jail,
fist fights, life-event cards, goals, a growing city with construction projects), compiled to
WebAssembly so the whole game runs in the browser (`web/client/solo/`), and "Play together" where up
to five friends share one town hosted in one person's browser tab (`web/client/together/`). There is
also a native server with a WebSocket gateway. The client is a 2.5D isometric map in an
emerald-and-gold golden-hour look, with 23 places you can walk into as illustrated rooms, people
drawn as full-body cut-outs, a phone with apps, and BitLife-style event cards.

**Play it.** Serve the client and drive it with Playwright (Chromium is installed; run node with
`NODE_PATH=$(npm root -g)`):
- `python3 -m http.server <PORT> --directory /home/user/Business1/livera/web/client` (Studio Ember uses
  port 18971, Studio Kinetic 18972), then open `http://127.0.0.1:<PORT>/solo/index.html`: New town,
  pick a founder (Dominique is the default lead), play.
- Debug hooks: `window.__livera` (world, phase(), project(x,y), look()), `window.__liveraSolo.advance(minutes)`
  fast-forwards the clock, `window.__liveraRoom` (rooms). A working example that enters a room and sits:
  `(a Playwright script that entered a room and sat; scratch, not kept)`.
- Take screenshots at 390×844 (phone) and 1440×900 (desktop) and form your own opinion: what is fun,
  what is confusing, what looks great, what is dead weight.

## What the owner has asked for, over time (in their words where possible)

- "The game needs to be easier to use and more functional and look more appealing."
- "The web version needs 5 people to be able to login into one server."
- "Think BitLife meets Sims meets GTA and you can go inside places … you should see the entire character too."
- Asked which GTA part mattered most, they chose **fights** (cars and police chases were not chosen).
- They generate every picture themselves with an image generator, from the prompt packs
  (`art/PROMPT_PACK_*.md`, made by `scripts/*_prompts.py`), and send them in batches. They have made
  about 52 building pictures, 43 room pictures, ground tiles, bus stops, the bus, and 10 character
  sprite sheets (walk front/back, idle, sit on chair and sofa; `art/sprites/characters/*/sheet.webp`).
  Your redesign can ask for new art: write the prompts (see deliverable 4).
- The look they like: emerald and gold, golden hour, luxury-but-warm, photoreal isometric.

## Assets you can use in your prototype

Copy (don't link) what you need into your prototype folder. Client-ready copies:
- `web/client/sprites/*.webp`: building pictures for the map (640 px, transparent).
- `web/client/rooms/*.webp` + `rooms/manifest.json`, with the traced room data in `data/interiors/*.json`
  (floor, furniture, seats, counters, in the picture's pixels).
- `web/client/figures/<id>/*.webp`: full-body cut-outs of the 15 people; `web/client/faces/*.jpg`: portraits.
- `web/client/tiles/*.webp`: ground textures, the crane, the bridge, bus shelters.
- `web/client/fonts/`: Cinzel and Cormorant Garamond (OFL).
- Masters: `art/places`, `art/interiors`, `art/transit`, `art/sprites/characters/*/sheet.webp` (sprite sheets
  on a dark gradient, not transparent), `art/reference/` (model sheets).
- The real game core: `web/client/solo/livera_solo.js` (WebAssembly, ES module; see `solo/transport_local.js`
  and `src/wasm/solo.cpp` for its API). A prototype may drive the real simulation, or be a scripted mock.

## Deliverables (all inside your studio folder)

1. `PITCH.md`: your redesign, written for the owner (plain English, no jargon) and the panel:
   - The name of your redesign, a one-sentence hook, and the three-sentence pitch.
   - Your verdict on today's game: the 5 things that work, the 5 that don't (from your own play).
   - The player fantasy and the core loop at four scales: a minute, a session (10–20 min on a phone), a
     week of play, a year of play.
   - What you can do: the full menu of play options, and how BitLife, The Sims and GTA (fights) each show up.
   - Five friends in one town: how it feels, what they do together and against each other, how sessions
     line up when people play at different times.
   - Screens and controls: phone first, then desktop. How you move, how you act, how you go inside, what's
     always on screen.
   - The look: camera, characters (the whole body, animation), rooms, the town by day and night.
   - Progression and the long game; the economy; whether and how money is made (the game has a coin store).
   - What you keep, change and cut from what exists, honestly costed against the codebase (the C++ core,
     the wasm build, the data, the art). If you'd change engine or camera, say what it costs and why it pays.
   - A build plan in 3–5 releases, each with what a player gets and a rough size.
   - Risks and what you'd test first.
2. `prototype/index.html` (+ its files in `prototype/`): a clickable prototype of your redesign's key
   experience, mobile-first (works at 390×844, no sideways scroll, 44 px targets) and good on desktop,
   using the real art. It must run offline from that folder (no network: no CDNs, fonts copied from
   `web/client/fonts`), stay under 15 MB, and say plainly in a small footer what is real and what is
   mocked (the game's rule is "never pretend"). Make it feel like your game, not a slideshow: the panel
   will click through it.
3. `shots/`: at least 10 screenshots of your prototype (phone and desktop) that walk through your key
   flow in order, named `01_….png`, `02_….png`; plus `shots/README.md` with one line per shot.
4. `ART_PROMPTS.md` (optional): up to 12 new pictures your redesign needs, each a ready-to-paste prompt in
   the style of `art/PROMPT_PACK_INTERIORS.md` / `PROMPT_PACK_CHARACTERS.md`, with the file name to save it as.

## Rules

- Write only inside your studio folder. Never modify the repository, never run git, cmake or the tests.
- Don't open the other studio's folder (`showdown/studio_ember` or `showdown/studio_kinetic`, whichever
  isn't yours).
- Everything you claim about today's game must be something you read or saw. Everything your prototype
  shows must be labelled real or mocked.
- Work as a studio: your members argue, and the pitch records the two or three decisions you fought over
  and why you landed where you did.

## How you'll be judged (the panel: a UX designer, a product manager, a casual phone player who loves
BitLife, a GTA roleplay player, a game developer, a software engineer, and a stand-in for the owner)

| Criterion | Weight |
|---|---|
| Fun: the first five minutes, and the fiftieth hour | 25% |
| Fits the owner's vision: BitLife × Sims × GTA fights, go inside places, the whole character, 5 friends in one town | 20% |
| Easy to use on a phone | 15% |
| Looks: does the prototype make you want to play | 15% |
| Buildable: honest cost against what exists, a plan that ships something good early | 15% |
| Original: something no other life sim does | 10% |

## When you're done

Reply with: your folder's path, the name and hook, your top five features, Release 1 in one paragraph,
your biggest risk, and the path to open the prototype.
