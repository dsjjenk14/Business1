# LIVÉRA: Talk of the Town

*A redesign pitch by Studio Ember: Imani Okafor (creative director, narrative), Tomas Lindqvist (systems),
Rhea Castellanos (art director), Kenji Mori (gameplay engineer).*

**The hook:** walk into any room in Livéra, play the scene with the people in it (talk, flirt, lie,
throw a punch), and wake up the next morning to find out what the whole town is saying about you.

**The pitch in three sentences.** Your day in Livéra becomes four beats (morning, work, evening, night):
your habits live the boring minutes for you, and the time you spend playing is spent inside the owner's
illustrated rooms with whole-body characters who have secrets, grudges and plans. In a scene you tap a
person and pick a move (warm, bold, secret or rough), including **Square Up**, a fifteen-second fist fight
you win by reading the other person, and everything you do is seen, remembered and passed on. Every morning
the town tells your story back to you (the anonymous gossip account, the paper, rumours with how many people
heard them), and when five friends share one town those stories are about each other.

**Open the prototype:** `prototype/index.html` (works from the folder, offline, phone or desktop; about ten
minutes for the whole day). The footer and its **Details** button say exactly what is real and what is mocked.

---

## 1. Our verdict on today's game (from our own play)

We played the single-player build (`web/client/solo/`) as Dominique at 390×844 and 1440×900 for two game
days, plus a third town to chase a fight, and opened the Play together lobby. Our screenshots of today's game
and the scripts that drove it are in `play/`.

**Five things that work**

1. **The owner's art.** The Copper Tap and Meridian Talent interiors, the building pictures with their lit
   windows at night and the full-body founders already look like a premium game. That is the asset that
   wins this pitch for whoever uses it best.
2. **The writing on the cards.** "Tenant damage" reached us at 11:52 on day one and "The weather in the corner
   office" on shift; both are short, funny, with the cost on the button ("up to $60.00"). That is the BitLife
   voice, and it is already in data (50 cards).
3. **Work decisions are a real mini-game.** Dominique's hiring calls ("Parallax Labs needs an on-site backend
   lead… Priya Nair, 9 years backend…") with a verdict and a reason are the best minute in the current game.
4. **It never pretends.** Before we threw a punch the game showed the odds (5%, "nobody else around"), the
   ladder (24 h held, $600, record) and the 70% report chance. Results say what changed ("Hygiene 85 → 100").
5. **Deep, tested foundations.** A strict money ledger, 30 careers, 11 founders with secrets and directional
   ties, rooms whose seats the server checks, life events, crime, fights, sleep, away pay, and five-player
   Play together with per-person encryption. Nothing needs to be thrown away.

**Five things that don't**

1. **The day is chores and waiting.** At 07:02 the apartment offered nine chores. The shift is a still screen:
   we fast-forwarded six hours and at 19:18 Dominique was at Hunger 0, Energy 13, Recreation 11, with the
   game nagging "do something fun soon".
2. **People never become a scene.** In one town Aaliyah came into Heritage Coffee at 09:26 and said one line; in
   a fresh town nobody came in from 07:07 to 15:26. At the Copper Tap at 20:02 our only company was a hunger
   warning. The founders' secrets (Miami, the Parallax demo, who runs @livera.unfiltered) are in the data and
   never reach the screen.
3. **The fight isn't a fight yet.** We chose "Start a fight with Graham", got an excellent odds card, then he
   walked on while we walked over: "They're not here any more." A fight that does happen is one roll and a
   result card, with a scuffle drawn as an overlay on the map.
4. **Too many surfaces.** A 26-app phone, a Places sheet, a "Things to do" list, a person card with six talk
   verbs plus Give, Ask and Street; on a phone the place card covers most of the screen. The "First morning"
   checklist still said "Have breakfast" at 20:00.
5. **The day has no shape and no end.** The web client has no Sleep button (the core has `sleep`; the client
   never sends it): at 01:48 every need was 0 and bladder 1. And nothing comes back the next morning: the
   event we answered, the shift, the punch. Play together also needs the host's tab open and in front.

---

## 2. The player fantasy and the core loop

**The fantasy:** *you're the person everyone in a new town is talking about.* You arrived on the Founders'
Grant like everyone else; what you do in rooms full of people decides who trusts you, who hates you, what you
know, and whether the story the town tells about you is the one you'd tell.

**A minute: one beat of a scene.** Tap a person (or their face in the "who's here" row). Two to five moves
appear, colour-coded: **warm** (heart), **bold** (lightning), **secret** (gold star, only when you know
something), **rough** (fist, always shows the cost first). They answer in a speech bubble; chips show what
happened ("Secret learned", "Aaliyah warms to you", "−$28.00"); the room reacts (someone turns, someone
murmurs). Never more than one tap from the next interesting thing.

**A session (10–20 minutes on a phone): one day.**

| Beat | What happens | Time |
|---|---|---|
| Morning | Your habits ran the routine (shower, breakfast, out the door) and show you one line each. One or two life cards. | under 1 min |
| Work | The shift is three or four real work decisions in your workplace's room, a coworker moment, a pay stub and a text that sets up tonight. | 1–2 min |
| Evening | The **Tonight map**: the town at dusk, venues lit with the faces of who's inside. Walk in. Play the scene. | 5–12 min |
| Night | How the night ends (walk someone home, one more round, a cell). Overnight, word gets around. | under 1 min |
| Morning after | The **Feed**: @livera.unfiltered's post with a picture of your scene, the Ledger's headline, rumours with "Heard by 14" and whether they're true, who changed toward you, threads advanced. | 1–2 min |

**A week.** Threads move: five-step stories built from the founders' real secrets (Miami, the Maple Court
flip, the Parallax demo, who runs Unfiltered, your biggest client). Reputation tags settle from what people
saw (Cool Head, Hothead, Keeps Secrets, Big Mouth, Generous, Fighter) and open or close doors. Fixed weekly
nights give the town a rhythm: Wednesday league night at Riverside Court (already in the core), Thursday open
mic, Sunday community dinner, and the rematch someone owes you.

**A year.** The town grows (Founders Way paved, ÉCLAT opens, Maple Court Phase II, the gym), and every opening
is a new venue with new scenes. Careers climb the real ladders (Recruiter $34/hr to Chief People Officer
$155/hr), relationships become marriages, feuds and business partnerships, threads finish and new ones start,
and your saved **Moments** become a scrapbook: "Livéra Unfiltered: your year".

---

## 3. What you can do

| Where | Moves |
|---|---|
| Anyone in a scene | Chat, joke, compliment, confide, ask about them (warm); flirt, challenge, ask the hard question, warn someone off (bold); use what you know: "So. Miami." (secret); argue, threaten, square up (rough) |
| Bars, cafés, restaurants | Buy for yourself or treat someone (real prices; treating is a trust move), sit at any seat in the picture, darts, open mic on the stage |
| Work | Answer the shift's decisions (real verdicts), coworker moments, ask for the promotion, quit, apply elsewhere |
| Life cards | The 50 existing BitLife-style cards, plus scene cards drawn from who's in the room |
| Love | Flirt, date, kiss, propose, marry, break up, divorce, move in (all built in the core) |
| Street (GTA) | Square Up, shoplift, pickpocket, dodge the fare, buy at the Underpass after dark; every one shows the odds and the ladder first |
| Gossip | Tip @livera.unfiltered anonymously, deny a rumour, confirm it, start one; tell a reporter (Leila) and live with it |
| Money and life | Rent, buy on Willow Lane (joint mortgages exist), study, pets, kids, fame, music |
| Town | Show up for openings, league nights and council meetings; later, develop parcels |

**How the three games show up**

- **BitLife:** the cards, the costs on the buttons, the one-tap consequences, and the Morning After: your life
  told back to you as a feed you'd screenshot.
- **The Sims:** the owner's rooms as the stage, seats you can take (one person a seat, as the server already
  enforces), whole bodies walking and sitting, needs that still matter, relationships with 11 dimensions and
  memories. Needs become *habits*: the core's autopilot (it already runs the founders) runs your routine, and
  a need only reaches the screen when it becomes story ("too tired to dodge", "too hungry to be nice").
- **GTA, fights:** **Square Up** (below), the crowd that forms, someone always filming, the police ladder,
  Wanted, rematches, rivalries, and later bar brawls at ÉCLAT. No weapons, no cars, as the owner chose.

### Square Up: a fight you win by reading people

Three exchanges. Each exchange the other fighter shows a **tell** ("Andre drops his right shoulder", "bounces
low on his toes", "squares his chest and steps in"). You have six seconds to pick **Swing, Duck or Shove**:
Duck beats Swing, Shove beats Duck, Swing beats Shove; the same move trades blows; freezing takes the hit.
Tells are honest three times in four, so reading matters and luck still bites. The real score formula sets
how hard each blow lands (`fights.json`: base 40 + 0.35 × athletics + 0.15 × energy + 0.15 × health, minus
8 per injury), so a tired, injured fighter loses even when they read well. **Knowledge is a weapon:** Dax told
you at the darts board that Andre drops his shoulder before he swings, and in the fight that tell is honest
19 times in 20. Talking to people changes fights; fights change what people say. That loop is ours.

Every rule of D-070 stays: the person attacked chooses (fight back, run, take it), anyone can set "always walk
away" and nobody can force a fight on them, assault only when a blow lands, self-defence is never a crime, one
fight per pair a day, a cooldown for whoever starts it, protection afterwards, and the odds and the ladder come
first.

---

## 4. Five friends, one town: the Thursday Club

**How it feels.** Five friends each play a founder in one Livéra (or a resident they made). It's a group chat
that turned into a town: you make plans ("Copper Tap tonight"), you show up, and the next morning
@livera.unfiltered has a post about two of you.

**A shared day, not a shared clock.** Friends don't play at the same time, so the town runs on **beats**, not
minutes. Each beat is a window of real time (Morning to 11:00, Work to 15:00, Evening to 23:00); whoever plays
it plays it, live; whoever doesn't, their character follows their plan and standing orders. When everyone has
played the beat, or its window closes, the town moves on. That is the core's own "bed rule" (D-062: the night
is skipped only when every person playing is asleep) applied to every beat, so a group that plays together on
a Friday night can play three days in a sitting, and a group of busy adults gets one day a day.

**Live when it lines up.** When two or more friends are in the same scene at the same time, they *are* the
people in it: their moves replace the script, and Square Up between friends is real (opt-in both ways; either
can always walk away). When they aren't, it's async: Jess (Aaliyah) set "Copper Tap, and if Andre sits at my
table I throw a drink", so when you walk in at 21:00 her Aaliyah is there and will do exactly that.

**Together:** co-op threads (expose Graham: Leila needs a source, Maya has the board, Dax has the demo), throw
ÉCLAT's opening night, league night, lend and owe money, buy a house together (joint mortgages are built).
**Against:** two of you up for the same promotion; two of you after the same founder; a rematch; and the big
one: whoever plays Sienna secretly runs @livera.unfiltered and writes (or approves) the posts about the rest
of you. Nobody else knows who it is. That is the thread "Who is Unfiltered?", played by real people.

**Never played against you.** Standing orders decide for you when you're away (fight back, always walk away,
avoid trouble). Anything big (a proposal, a crime you'd start, a breakup) waits for you. When you come back,
"While you were away" plays you the clip: what happened, who saw, what it cost.

**Where it runs.** Release 3 puts the shared day on the real server (`livera_server`, the VPS the owner is
renting; it already has `--pause-when-empty`, the bed rule, accounts and a 16-player cap). Play together in a
browser tab stays as the free way to try it, with its honest host notices.

---

## 5. Screens and controls

**Phone first, one thumb.** Always on screen: the **day strip** (Morning, Work, Evening, Night, with the
current beat in gold), the clock, money, and one **mood ring** instead of ten need bars. The bottom bar has
five buttons: **Town**, **Feed**, a big gold **context button** in the middle (Go, Leave, Tuesday: whatever
the next step is), **People** and **You**. Every target is at least 44 px; no sideways scroll at 390 px.

- **Move:** on the Tonight map tap a lit venue (or its row in the sheet) and **Walk there**: Dominique walks the
  streets on her own (three seconds). Inside, tap the floor to walk, a gold ring to sit.
- **Act:** tap a person (in the room or in the "who's here" row of faces). Their moves fill the bottom sheet
  as large buttons with a one-line consequence under each; rough moves say "Crime" and show the odds first.
- **Go inside:** you're always walking into a room; there is no "Go inside" button to miss.
- **Cards** (life events, work calls, consequences) rise from the bottom with the scene still visible above.
- **Square Up:** three big buttons under your thumb, the tell at the top, a six-second bar.

**Desktop.** The bar shrinks to the left corner; the sheet becomes a right-hand column that also shows **What
you know**, **Threads** and **Tonight so far**; cards float on the right so the room stays in view; the camera
comes closer. Keys 1–9 pick a move or a choice, Enter continues, 1/2/3 in a fight, Esc closes.

---

## 6. The look

- **Camera.** The town map is the hub (the owner's 52 building pictures on their real doors, the light following
  the clock, street lamps pooling at night, venue markers with the faces of who's inside). The rooms are the
  stage: the owner's interiors with a **film camera** that frames whoever is talking, pushes in with a letterbox
  for confessions and fights, and pulls back when the crowd turns to watch. No engine change: it's the 2.5D
  art the owner already makes.
- **Characters, the whole body.** The ten sprite sheets the owner generated are cut into eleven frames each
  (a four-frame walk toward and away, idle front and back, sitting) with the repository's own BiRefNet cut-out
  model, mirrored for the other directions, at one scale for everyone (175 cm = the room's person size). The
  prototype runs on exactly these frames. Everyone carries a name and a **mood tag** ("on edge", "two drinks
  in", "filming"), readable on a phone. Characters without a sheet yet use the model-sheet cut-outs the live
  game draws.
- **Rooms.** Every seat in the picture is a real seat (the traced data); people sit on bar stools and booths,
  the crowd moves to watch a fight, the bartender works behind the bar. Night versions of the two busiest rooms
  are in `ART_PROMPTS.md`.
- **The town by day and night.** Golden hour as the owner likes it; at night the buildings darken and their own
  lit windows are laid back on top (the live client's method, precomputed), lamps glow along every street, and
  the venues with people in them are the brightest things on the map.

---

## 7. Progression, the long game, the economy and money

**Progression** runs on five tracks, all from records the World keeps: **career** (the real ladders and
decisions), **relationships** (your side as numbers, theirs only as how they act), **reputation tags** (from
witnessed acts; they change who talks to you and how scenes start), **threads** (story arcs with endings you
cause) and **Moments** (your scrapbook). Long term: property on Willow Lane, businesses (Phase 8 of the
roadmap), family and children (built), the town's growth (projects and stages built), generations.

**Economy.** Keep the strict ledger. Money matters because it's social: treating someone is a trust move,
a fine hurts, Dax's $38,000 debt is a thread, rent is due. Wages come from shifts (and away pay, D-063).

**Making money (the game has a coin store).** Keep its honest rules (cosmetic only, coins never become dollars,
validation keeps coin items at or below what dollars buy). Add:

- **Town Pass** (about $4.99 a month, paid by one person): a private, always-on town on our server for up to
  five friends. It's what costs us money to run, so it's the honest thing to charge for.
- **Wardrobe** (coins): outfits as new sprite sheets, made with the owner's existing prompt pipeline.
- **Season pass** (cosmetic only): each season is a town event ("Opening Night at ÉCLAT"); the story is free.
- **Moment frames** for share cards. Sharing itself is free: it's our growth.
- **Never:** energy timers, paid boosts in fights, paying to undo a consequence, loot boxes.

---

## 8. What we keep, change and cut (costed against the codebase)

Team assumed: two engineers (one core, one client), one writer, the owner making pictures, a designer.
Sizes are engineer-weeks unless noted.

**Keep as it is (zero cost):** the C++ core and its rules (World, Ledger, needs, emotions, relationships,
memories, careers, work decisions, life events, crime, fights, injuries, sleep and the night skip, away pay,
autopilot, homes, romance, family), the WebAssembly build, LocalTown and Play together, the server and
gateway, all data, all art, the map renderer (`render2d.js`), the room geometry (`data/interiors`, D-066).

**Change:**

| Piece | Built on | Size |
|---|---|---|
| New client shell: day strip, Tonight map, scene view, cards, Feed, People, You | `render2d.js`, `interior.js`, `figures.js` (extended for sheet frames), `moments.js` | 5–6 |
| Sprite-sheet frames in the game (the cutting script exists in the prototype's `tools/`) | `scripts/client_figures.py` | 1 |
| **Moves**: interactions with `requires` (a fact you know, trust above a value) and `reveals` (a fact) | `data/interactions/social.json`, the life-event outcome format (D-068) | 2 |
| **Facts and knowledge**: who knows which secret; the cast's secrets are already in their data | DATA_MODEL's designed "Information, secrets, gossip" (M3) | 2–3 |
| **Word gets around**: generalise the existing rumours (tellers, who knows, spread through friendship, `Details.cpp`) to every witnessed scene moment; the Morning After view; Unfiltered posts from data templates | `W.rumors`, memories, the `story` app | 2–3 |
| **Square Up**: `fight_respond` becomes up to three `fight_move` exchanges with tells from data traits and the saved random stream; every D-070 refusal and limit kept; tests | `core/Fights.cpp`, `data/society/fights.json` | 2 |
| **Habits**: the autopilot drives *your* character between beats from habits you pick | `core/Autopilot` (D-053) | 1–2 |
| **Beats**: the day as four beats; skip between them as the night skip does; "scene time" while you're in a scene | `World::skipNight`, the bed rule (D-062) | 2 |
| **Scene director**: founders' evening plans from their schedule, traits and threads, so venues fill at night | `profile.schedule`, Autopilot | 3–4 |
| **Threads**: data-defined arcs (steps, conditions, outcomes), saved per character | life events' engine and save key pattern | 2, then about a writer-week per thread |
| **Shared day** on the server, plans, live scenes, "While you were away", push via an installable web app | `Server`, `--pause-when-empty`, LocalTown | 5–6 |

**Cut or shelve:** the 26-app phone as the main way to play (its apps fold into Feed, People and You; the rest
stay one tap deep), the "Things to do" chore list (habits do it), need chips (the mood ring), the always-open
chat bar (talking is moves; free chat stays for friends in a live scene), the bus as a required step (it stays
as a way to travel), voice until moderation exists.

**The engine and the camera.** We stay on the web 2.5D client. Rhea wanted a 3D camera; Kenji showed that every
one of the owner's ~95 pictures is a painted 2D isometric view, so a 3D engine would throw the art away and cost
months. The film camera (pan, push-in, letterbox) gives the cinematic feel for nothing.

**One decision for the owner.** The owner chose 1 game minute per real second. We keep that rate on the map,
but stop the clock inside a scene ("scene time": a move costs 2–10 game minutes) and skip between beats, the
same way the night is already skipped. A scene is a conversation, not a countdown.

---

## 9. Build plan

**Release 1: One Night in Livéra (about 8 weeks).** Single-player, in the browser, on the real core. A day in
four beats with habits; work beats for every career (the 186 decisions exist); the Tonight map; three venues
as full scenes (the Copper Tap, Lumière Bistro, Heritage Coffee) with six founders; moves with secrets;
Square Up; the Morning After with @livera.unfiltered, the Ledger and rumours; two threads (Miami, the Maple
Court flip); the sprite-sheet frames for the ten founders who have sheets. **A player gets:** a ten-minute day
on a phone that ends in a story worth sending to a friend.

**Release 2: The Whole Town (about 6 weeks).** All 23 traced rooms become scenes; the scene director fills them
by schedule and thread; all eleven founders; six threads; reputation tags; standing orders; the remaining sprite
sheets (Maya, Naomi and the residents are already prompted); night rooms. **A player gets:** a town where every
lit window is somewhere to go and something waiting to happen.

**Release 3: The Thursday Club (about 7 weeks).** Five friends on the VPS server with the shared day, live
scenes, plans, the group chat, "While you were away", notifications, a player-run @livera.unfiltered; Play
together kept as the no-server trial. **A player gets:** their friends in the story.

**Release 4: Opening Night (about 6 weeks).** Big events with up to 16 in a room (ÉCLAT's opening, league night,
open mic), bar brawls (Square Up with more than two), share cards, the Town Pass and season one. **A player
gets:** nights the whole group plans for.

**Release 5: Legacy (ongoing).** Property, businesses, the growing city, families and generations, each as
venues and threads.

---

## 10. Risks, and what we'd test first

1. **Writing volume.** Scenes need lines. Mitigation: moves are data templates filled with names and traits; the
   50 life cards and 186 work calls are reused; one writer-week per thread. *Test first:* write one venue's full
   scene set and time it.
2. **Does an unscripted night produce a story?** *Test:* in Release 1, let the scene director fill the Copper Tap
   on 20 random nights; at least 7 should produce a moment someone would screenshot.
3. **Square Up: skill or coin flip?** *Test:* this prototype with ten BitLife players and five GTA roleplayers:
   do they read tells, and do they want a rematch?
4. **Fights between friends turning into harassment.** Mitigation: every D-070 limit stays, opt-in both ways,
   "always walk away". *Test:* five friends, one week, a report button from day one.
5. **The shared day.** Does async feel together? *Test:* five real people for a week on Play together before
   building the server version.
6. **The clock.** "Scene time" changes the owner's 1:1 rule inside scenes; the owner must agree.
7. **Art.** The cut sheets have small flaws (the sitting frames include the generated sofa for some; Dax's and
   Harper's idle frames needed a walking frame instead). We list the fixes and the new pictures in
   `ART_PROMPTS.md`.

---

## 11. The decisions we fought over

**1. Needs: keep them or kill them?** Tomas: "A Sims without needs is a visual novel; hunger and exhaustion are
where emergent stories come from." Imani: "Nobody has ever screenshotted a bladder bar. Today's game makes
Dominique tap nine chores before 07:05." **Where we landed:** the needs stay in the core and keep their
consequences (tired fighters lose, hungry people snap), but they live under *habits* and reach the screen only
as one mood ring and when they become story. The chore list is cut. Tomas kept "they still decide outcomes";
Imani kept "they're never a to-do list".

**2. The fight: a card, a stat roll, or a game?** Imani and Rhea wanted one cinematic tap ("show the result,
beautifully"). Tomas wanted it to stay a pure stat roll ("skill in a life sim favours twitchy players").
Kenji wanted D-070's rules untouched. **Where we landed:** Square Up. Three exchanges of rock, paper and
scissors with tells: fifteen seconds, readable on a phone, no reflex test (six seconds a choice), the real
score formula deciding damage, and *knowledge* as the edge (what Dax told you). Every D-070 rule stays.
The GTA player gets skill and a rematch; the BitLife player gets a fifteen-second story with a crowd and a
camera.

**3. Time.** Kenji: "The owner chose one game minute per real second. Don't break the clock or the save."
Imani: "A whole day has to fit in a phone session." **Where we landed:** the rate stays on the map; scenes run
in scene time; the day skips between beats with the same mechanism as the night skip (D-062); in a shared town
the beats are real-time windows with the bed rule. We flag it as the owner's call.

(Rhea also lost a fight about a 3D camera, and won the one about name and mood tags over every head.)

---

## 12. What the prototype shows, and what's real

Play Monday (title) → the morning card (habits) → a real life card ("Tenant damage") → the work beat at
Meridian Talent with three of Dominique's real hiring calls and a real coworker card → the pay stub and
Aaliyah's text → the Tonight map at dusk → walk to the Copper Tap → the scene (eight people, sit, talk, buy,
learn the Miami secret, Dax gives you Andre's tell) → Andre squares up (or you start it, with the real odds)
→ Square Up → consequences, the law → how the night ends → the walk home → word gets around → the Morning After
→ Tuesday. Also: Lumière Bistro (a quiet night with no fists: overhear Graham, tell a reporter or don't), the
Thursday Club mock-up, People (your side only), You (habits, standing orders, body, money).

**Real:** every picture is the owner's (rooms, buildings, faces, the cut-outs and the ten sprite sheets, cut by
us); room floors and seats are the traced data; buildings stand on their real doors; the cast, their ages,
taglines, secrets and ties; the life cards, work decisions, wages and promotion hours; the menu prices; the
assault odds, ladder, report chance, run odds and injuries. **Mocked:** no game core runs; the day, the scenes,
every line and move, Square Up's exchanges, gossip, threads, reputation and the friends are a script in
`prototype/story.js` and `app.js`.

Tools we used are in `tools/` (cutting the sprite sheets, building `data.js` from the real data, the screenshot
walk-throughs). The screenshots are in `shots/`.
