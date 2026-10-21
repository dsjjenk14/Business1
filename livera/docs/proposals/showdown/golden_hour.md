# LIVÉRA: Golden Hour

**Studio Kinetic's redesign of LIVÉRA**
Marcus Reyes (creative director, multiplayer) · Sofia Brandt (action) · Jun Park (mobile UX) · Priya Nair (netcode and platform)

> **Days are yours. Nights are ours.**
> Plan your day in two minutes on the bus. At golden hour the town goes live: you and four friends walk into the same bar as your whole character, and anything can happen, including a fist fight you'll read about in the morning paper.

**The pitch in three sentences.**
Every game day has two halves: a fast, BitLife-style **Day** that you plan on your phone in a minute (work, the gym, a date, a scheme), which the town then plays out while you answer the moments that come up. Every evening is **Golden Hour**: the town goes live and you and up to four friends walk into one of the owner's painted rooms as your whole character, to sit, drink, play darts, sing, flirt, face group moments where everyone picks in secret, and settle scores with **Beat Brawl**, a fist fight played on the beat. Next morning, **The Livéra Ledger** and an anonymous gossip account tell the whole town what happened, so the friend who missed it comes back tonight, while your career, home, family and reputation build up over a year of play.

**Open the prototype:** `prototype/index.html` (works straight from the folder, offline; best on a phone or a phone-sized window, with sound on). It takes about four minutes: plan Monday, live it, walk into the Copper Tap, and decide what to do when Andre gets in your face. The footer on every screen says what is real and what is mocked; tap it for the full list.

---

## 1. What we think of today's game

We played the single-player build at 390×844 (phone) and 1440×900 (desktop), as Dominique, through a morning, a shift, an afternoon and an evening. We also opened the Play together lobby. Our screenshots are in `play/`. What we saw:

### Five things that work

1. **It already looks expensive.** The painted rooms are the best thing in the game. The Copper Tap, Heritage Coffee and Meridian open up as golden cutaways you want to walk around in, and the emerald-and-gold chrome with Cinzel and Cormorant type looks like a premium app, not a prototype.
2. **The writing is BitLife-good.** The Little Sprouts hire ("…but he declined to complete the background check") with its *Best call* verdict, "Tenant damage", and "The weather in the corner office" (*"Cowardly. Effective."*) are funny and specific, and they really change your money, feelings and promotion hours. There are 50 of these life events and 186 work decisions.
3. **One honest simulation.** The C++ core runs in the browser with the same rules as the server: a ledger that has to balance, 30 careers, homes with real mortgages, illness, crime that shows you the odds before you try it, autopilot founders. Nothing on screen is a fake button.
4. **The first minute is easy.** The Next card ("Meridian Talent Partners · Go") and the first-morning checklist got us to work, on shift and making a hiring call in under a minute without reading anything. The pay stub ("Paid $192.43 · 4 h 11 min") felt good.
5. **Fights are fair.** The person attacked chooses to fight back, run or take it; anyone can switch on "always walk away"; the risk card shows the whole ladder ($600 fine, 24 h held, 70% report chance) *before* you swing. We want to keep all of that.

### Five things that don't

1. **You never play your body.** On the phone map Dominique is a gold "You" label over a figure a few pixels tall. Inside Heritage Coffee she is about 40 px tall in the corner of a big picture, and a sheet covers half the screen. Nearly everything you do is tapping a list ("Things to do", "Buy"). The whole character is in the art, but she never ends up in your hands.
2. **The fight isn't a fight.** "Start a fight with Graham…" opens a confirm card, then one roll on the server. The one time we tried, Graham walked out of range on the way over: *"They're not here any more."* Fights were the owner's one GTA choice, and right now there's no moment-to-moment play in them at all.
3. **The clock doesn't fit a phone or a group of friends.** One game minute per real second makes a game day 24 real minutes. A 15-minute bus ride is half a day, mostly spent walking and topping up needs. Fast-forwarding through an afternoon of cards, we wet ourselves at 17:34: *"You couldn't make it to a bathroom in time."* For friends it's worse: everyone has to be online at once, in the host's visible tab.
4. **The town feels empty.** At 15:00 on a weekday there was exactly one other person in sight (Graham, played by a script, 90 m away). Heritage Coffee said *"Nobody else is here"* at 07:21, while Graham was greeting us from outside, and again at 08:25. The founders' stories (Andre and Aaliyah's past, Dax's crush, Sienna's secret account) are written in the data but never act themselves out.
5. **Warnings cover the town.** At 17:34 on the phone, a bladder warning, a hunger warning, the humiliation toast and the Next card stacked up over about 60% of the screen. Needs are a tap-tax you pay to be allowed to play.

---

## 2. The player fantasy and the core loop

**The fantasy:** *you are the main character of a small town's best year: the one everybody talks about at breakfast.* Your Day is ambition (BitLife). Your Night is your social life and its drama (The Sims rooms, GTA fists). The Morning is the consequences (the paper, the gossip, the bruise).

### At four scales

| Scale | What you do | How it feels |
|---|---|---|
| **A minute** | In Golden Hour: tap the floor and walk to the bar, order (the real menu), a friend's bubble pops up, a group card hits the table and you pick in secret; or a round of Beat Brawl: read his tell, duck the hook, counter. In the Day: one card, one choice, an outcome with numbers. | Something happens every 10–20 seconds. You always have a thumb on something. |
| **A session (10–20 min on a phone)** | Read the **Morning Ledger** (1 min) → **plan the day**: three slots (1 min) → **the day plays out**: 2–4 cards, pay, a walk across town (2–3 min) → **Golden Hour**: one room, live, one big beat (a song, a date, a deal, a fight) (8–12 min) → **Last call**. | It always ends at a natural stop (closing time), and tomorrow's callouts are already waiting. |
| **A week of play** (one game day per real day in a shared town) | The crew's week has a shape: the promotion review, league night on Wednesday (the core's basketball is five a side, Wednesdays at 18:00), the rematch Andre called for Friday, a date that turns into a relationship, rent on Monday. Callouts from friends fill in the diary. | Appointment play with friends, like a weekly game night, but you can do your day whenever you like. |
| **A year of play** | A game year is 336 days (12 months of 28), so at one day per real day **a year of play is a year of her life**. Recruiter at $46/hr to Chief People Officer at $155/hr; save the $42,000 down payment on 2 Willow Lane; marry, have a baby; Founders Way gets paved and ÉCLAT opens; a fight record and a fame tier. At the end of each season the crew can vote a **chapter break** (BitLife's "age up"): a run of cards skips a year, so the long game reaches marriage, children and the next generation. | Your life compounds. Your crew has a shared history. |

---

## 3. What you can do

### The menu of play

| Pillar | Where it shows up | What's already in the core | What's new |
|---|---|---|---|
| **BitLife: life choices** | The Day planner; work decisions; life-event cards; chapter breaks that "age up" a year; the Story app; the Morning Ledger | 50 life events, 186 work decisions, careers, school, homes and mortgages, romance, family, fame, crime | Planning the day as three choices; group moments (one card for the whole table, secret picks); chapter breaks |
| **The Sims: rooms and needs** | Golden Hour in 23 painted rooms: walk on the traced floor, sit in a real seat, order at the bar, darts, the stage, booths for dates; your apartment in the morning | Needs and emotions, interiors with floors, seats, counters and stages (D-066), activities with their effects | A close camera that follows you; walk cycles from the owner's sprite sheets; pathfinding around the furniture; needs as *consequences of your plan*, not chores |
| **GTA: fights** | **Beat Brawl**, in any room that allows it, on the street at night, in the alley behind the Copper Tap | Who can fight whom, consent (fight back / run / take it / always walk away), the stat formula, injuries by margin, assault, witnesses, reports, police, jail | Fights played beat by beat; a fight record; rematches as callouts; the Ledger headline; "Heat" as a reputation |
| **The whole character** | Every screen: full-body figures at their real heights (Dax 188 cm, Aaliyah 168 cm) with walk cycles; a bruise or black eye shown for the days it lasts | The cast's art, heights, outfits, sprite sheets (10 of 15) | Fight and social poses (ART_PROMPTS) |
| **Five friends in one town** | The crew, Golden Hour, group moments, callouts, the Ledger | Play together (LocalTown, encrypted per person, D-056/57), the live server, autopilot for the absent | Turn-clock days, scheduled live evenings, callouts |

Everyday life also stays in: the bus, shops, the clinic, school, pets, music, homes. They become **choices in the Day planner** and **places to be at night**, instead of buttons you have to keep pressing.

### Beat Brawl (the fight, in detail)

A fight is a short series of **beats** (three rounds of seven or eight beats, about a second each, getting faster each round). On every beat the other fighter shows a **tell** above their head as they wind up: **HOOK**, **JAB** or **SHOVE**. You answer with one of three big thumb buttons before the ring closes:

| Their move | Duck | Block | Jab |
|---|---|---|---|
| **Hook** | Slip it; they're **open** next beat | Chip damage | You trade: both hit |
| **Jab** | Hurts unless timed perfectly | **Blocked** (perfect = parry, they're open) | Clash |
| **Shove** | They grab you | Pushed back | **You stuff it** |
| **Open** (after a slip or a parry) | wasted | wasted | **Counter!** |

Perfect timing gives 1.5× damage. Each fighter's **edge** comes from the core's own formula (`40 + 0.35×athletics + 0.15×energy + 0.15×health − 8 per injury`, `data/society/fights.json`), so jogging in the morning and sleeping properly really do matter at night. **Walk away** is always on screen. Everything after the fight already exists in the core: the injury depends on the margin (bruises, a black eye, a cracked rib), assault applies only to whoever started it, fighting back is never a crime, the report chances are 70% for the victim and 40% for each witness, and there's one fight per pair per day. Sofia's rule: *every input gets a hit-stop, a shake, a flash, sparks and a sound.* Priya's rule: *one input per fighter per beat, judged by the host at the end of the beat.* That's why it plays well on phones on a shared town (see the decisions below).

### Group moments (the original bit)

A **group moment** is a life-event card that lands on **everyone in the room at once**. Each person picks in secret, and the faces flip over one by one to reveal the picks. The outcome comes from the combination. In the prototype it's the real "One more round" card: if two people choose *Buy the round*, there's a bidding war and the whole bar cheers; if only one does, they're the best person in the bar for a minute. Later cards write themselves: the bill arrives at Lumière and everyone secretly picks *I've got it*, *Split it* or *Go to the restroom*. If all five go to the restroom, it's a dine-and-dash: a new entry in `crimes.json`, handled by the police, fines and records the core already has. It's BitLife's choices, made social, and they cost very little to build (see the plan).

---

## 4. Five friends in one town

**How it feels.** It's your crew's town. Each friend plays one founder or a character they made. Founders nobody plays live their routine on autopilot and are always labelled. The group chat on the Day screen is where the crew plans tonight, and the faces row in a room shows who's here *live* (a green dot) and who's *autopilot* (a grey dot, with "Sam is offline").

**Days apart, nights together.**
- **Days are asynchronous.** Each friend plans and plays their Day whenever they like (two minutes on the bus). In a shared town, days move on a **turn clock**: the town advances one game day at dawn. A friend who didn't plan lives their routine, paid by the away rules the core already has (D-063). If everyone has finished their day early, the crew can tap *Next day*, the same idea as the bed rule (D-062).
- **Nights are live.** The crew sets a **Golden Hour** time (say 21:00 their time). Whoever turns up plays live in one room for 10–20 minutes. Friends who don't come either stay home (and read about it) or come on autopilot, labelled.
- **The morning brings you back.** The Ledger reports what really happened (fights, songs, who bought the round, who left with whom), alongside the anonymous **@livera.unfiltered** account, which is Sienna's player if Sienna is played. **Callouts** ("Rematch, Friday", "Brunch at Lumière?", "League night Wednesday") are friends asking you, never the game nagging you.

**Together:** group moments, the open mic and duets, darts, league night (basketball is five a side), dates (asks still need a yes), the community dinner, buying a home together (already built), and later running a business together.
**Against:** Beat Brawl (with consent rules and limits), outbidding a friend on a house, competing for the same promotion, the gossip account, rivalries that show up in the Ledger.

**Notifications (Jun's rules):** at most one a day from the game ("The Ledger is out"). Everything else comes from a friend (a callout, a reply), with a limit per friend. Never "your hunger is low". Golden Hour reminders are opt-in and per crew.

---

## 5. Screens and controls

### Phone first (one thumb)

| Screen | Layout | Controls |
|---|---|---|
| **Morning / Day planner** | Top strip: you, the day, money, *Your life*. The crew chat. Three slot cards (Morning, Afternoon, Tonight), each with 2–3 big picture options showing what they'll do (+$184, Energy −10). A row of needs. A full-width **Live my day** button at the thumb. | Tap to choose; one big button. No walking, no menus. |
| **The day plays out** | The town as a diorama (the owner's building pictures and ground tiles), your figure walking with a gold ring and a "You" tag, the clock spinning, a 3-part progress bar. Cards slide up from the bottom. | Answer cards; **Skip ahead**. |
| **Golden Hour (a room)** | The room fills the screen, with a close camera that follows you (a person is about 105 px tall). Top: the live dot, clock, money, sound; the faces row (who's here, live or autopilot); the room's vibe. Bottom right: the context button (64 px: *Sit down*, *Talk to Dax*, *Stand up*) above *Order* and *Darts*. Bottom left: quick lines to say. | Tap the floor to walk (with pathfinding); tap a seat to sit; tap the bar to order; tap a person or a face for their card (chat, buy a drink, darts, start a fight). Drag to look around, pinch to zoom. |
| **Beat Brawl** | Letterbox; the two composure bars and your edge at the top; the fighters big in the middle, with the tell over their head and the ring closing between you; **Duck / Block / Jab** as three 76 px buttons; *Walk away* always visible. The first round shows the right answer under the ring. | Three thumbs-width buttons, or A / S / D and the arrow keys. |
| **The Morning Ledger** | A newspaper page: the headline, a photo of last night, the story, the gossip posts, *Your night* (relationships, money, injuries, heat, fame), *Around town*, and tonight's callouts with *Accept*. **Plan Tuesday**. | Scroll, accept, go. |

Always on screen in play: the clock, money, who is live, and one context button. Never on screen: chores.

### Desktop

The same screens. Cards sit in a right-hand column so the room stays visible. The whole room fits the window, WASD walks, A/S/D fights, Escape closes. The Day planner shows its three slots side by side.

---

## 6. The look

- **Camera:** keep the 2.5D isometric 30° view that all the owner's art is painted for. Two distances: the **town diorama** (the day montage and the map) and the **room camera** (close and following, the Golden Hour view). We change the distance, not the angle.
- **Characters:** whole bodies at their real heights from the data, cut from the owner's **sprite sheets** (4 × 3: walk toward, walk away, idle, sitting), which the game doesn't use yet. In the prototype they walk with the four-frame cycle and face the way they move. Fights add procedural lunges, crouches, recoils and a fall until the **fight sheets** we ask for arrive (`ART_PROMPTS.md`).
- **Rooms:** the 23 painted interiors as they are, with three additions: furniture drawn back over people standing behind it (using the traced footprints and heights), a stage spotlight, and a pool of warm light around a fight.
- **Town by day and night:** the building pictures over the re-projected ground tiles, lit by the clock: champagne by day, a peach golden hour from 16:00, then an emerald-navy night with lit windows and lamps, glowing brightest at the Copper Tap.
- **Juice (Sofia):** hit-stop, camera shake, white flash on a hit, gold sparks and dust, knockback, slow motion on a knockout, phone vibration, a synthesised punch, a crowd "ooh", a bell. All of it respects *reduce motion*.

---

## 7. Progression, the economy and money

**Progression.** Three reputations that anyone can read at a glance in *Your life*:
- **Heart:** friends, love and family (relationships, a wedding, kids). Unlocks hosting at home and moving in together.
- **Hustle:** work, money and homes (career level, savings, property). Unlocks a business, the developer path and the civic path later.
- **Heat:** the street (fights, crimes, police interest). Unlocks the back-room card game (a real event) and the Underpass after dark, and brings police attention with it.

Underneath sit the core's real ladders: the careers (Dominique's runs Recruiter $34 → Senior $46 → Manager $60 → Director $82 → VP $110 → Chief People Officer $155 an hour), skills (practice basketball at Riverside Court gives athletics +2, which feeds your fight edge), fame tiers, homes and mortgages, and each character's own goals from the data ("Make Recruiting Manager within a year", "Buy, not rent, before thirty-one", "Build a circle in a town where she knows almost nobody"), shown with progress bars in *Your life*.

**The in-game economy** stays the core's: dollars in integer cents through the ledger, wages for shifts, away pay, rent, bars, shops, fines. Golden Hour adds natural sinks (rounds, outfits for the night, bail) and keeps the sources honest.

**Making money.** Keep the coin store **cosmetic only**, as D-038 already enforces. Add two things, and never sell power:
1. **Golden Hour Pass** (a season of about 8 weeks, $4.99): a cosmetic track you earn by playing nights. Outfits for the night, apartment decor, emotes, entrance and victory poses, taunts. No stat boosts, no fight edge, no way round consent.
2. **Town Pass** ($5.99 a month, paid by **one** person for the whole crew): an always-on hosted town (the native server and the VPS deploy scripts already exist), so days move on without anyone's tab, with push notifications and up to five crew slots. The free tier stays Play together in a host's tab.

---

## 8. Keep, change, cut, costed against what exists

We **keep the engine**: the C++20 core, the wasm build and the 2.5D canvas client. Priya's case: the core already has every rule we need; the client already draws the owner's rooms and people; a 3D engine would cost months, throw away 52 building pictures, 43 room pictures and 10 sprite sheets painted for this camera, and play worse on mid-range phones. **No engine change.**

| | What | Where it lives today | Cost (one developer who knows the code) |
|---|---|---|---|
| **Keep as is** | World, needs, emotions, careers and work decisions, life events (D-068), ledger, homes, crime and police, fights' consent, injuries and consequences (D-069/70), interiors and seats (D-066), autopilot (D-053), LocalTown and Play together encryption (D-056/57), the native server and VPS scripts, all data and art | `src/core`, `src/protocol`, `web/client`, `data/`, `art/` | 0 |
| **Change: the day** | A `plan` op that queues three routine blocks for *your own* character, which the autopilot then carries out at speed (single player can already fast-forward: `advance`), stopping for cards | `Autopilot`, `WorldOps`, `LocalTown` | 2 weeks core + 1 week client |
| **Change: the clock** | Shared towns: a turn clock for days (one per real day, or *Next day* when everyone's done) and a live window for the evening at 1:1 | `LocalTown` / `Server` tick, `skipNight` already exists | 2–3 weeks |
| **Change: fights** | `fight_beat`: a beat loop on the host; each beat takes the attacker's intent and the defender's answer, applies damage scaled by the existing score formula, and ends in the existing result path (injury by margin, crime, witnesses). PvP: both players pick each beat; PvE: the founder's traits pick (Andre impulsive, Harper careful). | `core/Fights.cpp`, `fights.json`, `moments.js` | 3 weeks core + 2 weeks client |
| **Change: group moments** | Life events with `with: "room"`: one card to everyone present, picks collected until a deadline, outcome rules by combination, in data | `core/LifeEvents.cpp`, `data/events` | 2 weeks |
| **Change: the Ledger** | A morning page built from the day's public events (fights seen by witnesses, performances, purchases at bars, promotions, construction), gossip from memories (the designed rumour system, started small with templates) | new `core/Ledger` (news, not money), `DATA_MODEL.md` rumours | 3 weeks |
| **Change: the room client** | A close follow camera, pathfinding on the traced floor (the client walks in straight lines today), sprite-sheet walk cycles, furniture drawn over people, the context button, the faces row | `interior.js`, `figures.js` | 3–4 weeks |
| **Cut from the main screens** | Needs as chores (bathroom, teeth, grooming and laundry buttons) become automatic in your routine. The systems stay, so a reckless plan (a double shift with no break) still has consequences. | `ui.js` sheets, `today.js` | saves time |
| **Cut back** | The 26-app phone as the main way around: keep Crew, Ledger, Life, Bank, Work and Map; the rest go under *More* | `phone.js` | 1 week |
| **Cut** | The always-on 1:1 clock for shared towns; walking across the whole map in real time as the default way to get somewhere (travel happens in the Day; free roam at night comes later) | `transport`, the tick | — |

---

## 9. Build plan

| Release | What a player gets | Size |
|---|---|---|
| **R1: Golden Hour, solo** | The Day planner and the montage; Golden Hour in the Copper Tap, Heritage Coffee, Lumière and Low End Studios, with the close camera, walk cycles and pathfinding; Beat Brawl against founders (PvE) with real consequences; needs made automatic; the Morning Ledger v1 (templates). Ships in the existing single-player page. The founders' data now stages their stories (Andre's open mic, Aaliyah avoiding him), so playing alone is fun. | 6–8 weeks |
| **R2: The crew** | Golden Hour in Play together: the host opens the night, friends join; group moments with secret picks; PvP Beat Brawl; the crew chat and callouts; the Ledger for everyone. | 5–6 weeks |
| **R3: Days apart** | The always-on town on the VPS (the server, gateway and deploy scripts exist) with the turn clock; plan your day any time; one notification a day plus friends' callouts; the Town Pass. | 4–6 weeks |
| **R4: The long game** | Heart, Hustle and Heat with what they unlock; chapter breaks ("age up" a year, for generations); more venues (league night at Riverside Court, dates at Lumière, the Underpass back room, the alley behind the Copper Tap); fight and social sprite sheets; the first Golden Hour Pass season. | 6–8 weeks |
| **R5 (later): The city** | Businesses run with friends, the developer and civic paths, the town's later growth stages. | — |

R1 alone is a better single-player game than today, because the day takes two minutes and the night is a scene you play. R2 is the owner's five friends in one town.

---

## 10. Risks and what we'd test first

1. **Beat Brawl over the Play together relay.** The room carries about 40 messages a second per page, with frames encrypted and split into 4 KiB chunks, and the host ticks at 10 Hz. *First test:* two phones on 4G, one beat a second, measuring the time from a press to the host's verdict. Fallback: PvP beats widen to 1.4 s and inputs lock at the ring.
2. **The crew never lines up for Golden Hour.** *Test:* five real friends for one real week; count the nights with three or more people live. Fallback: Golden Hour opens whenever two people are in, and autopilot founders keep the room busy.
3. **Fights as harassment.** The consent rules exist; we'd add a town-wide "fights off" setting, block and report (already required before any public server). *Test* with the owner's friends before anyone else plays.
4. **Fast days bending the core.** Needs, shifts paid by the minute and decisions spaced 150 minutes apart all assume 1:1. *Test:* a planned day at 60× in the wasm build, checking the ledger, pay and needs against the same day at 1:1.
5. **Fight poses.** Lunging photographs look stiff up close. *Order first:* the five fight sheets in `ART_PROMPTS.md`.
6. **Phones.** A 1,536 px room picture and six animated people at 60 fps on a mid-range Android. The prototype runs smoothly in Chromium; *test* on real devices (today's client hasn't been tried on one either).

---

## 11. The fights inside the studio

**1. A real-time brawler, or beats?**
*Sofia* wanted GTA-style brawling: a stick to move, a button to punch, hitboxes, free movement round the bar. *Priya* said no: in Play together the host's browser relays encrypted, chunked frames through the artifact room at about 40 messages a second per page and simulates at 10 Hz, so a hitbox fight between browsers would rubber-band, the slower phone would always lose, and the World couldn't referee it. *Marcus* sided with Priya on fairness, because a fight among friends that feels rigged ends friendships. **We landed on Beat Brawl:** one decision per fighter per beat, judged by the host at the end of the beat, with all the feel added on the client (hit-stop, shake, flash, sparks, sound, vibration). Sofia's conditions, which we kept: the tell has to be readable, timing has to matter (a perfect read does 1.5× damage), and the third round has to be faster than the first.

**2. An always-live town, or sessions?**
*Marcus* wanted an RP-server town that's always live, because that's where his best stories happened. *Jun:* "A phone player has fifteen minutes on a bus and can't be online at nine every night." *Priya:* the Play together town stops when the host's tab is hidden, and at 1:1 the old live server aged a character a game year in under a week (the redesign review found exactly that). **We landed on "days are yours, nights are ours":** asynchronous days on a turn clock, live evenings when the crew opens one, autopilot for anyone absent (always labelled), and the Ledger as the bridge.

**3. Do needs survive?**
*Jun* wanted needs gone ("a tap-tax"). *Marcus* and *Sofia* wanted the Sims feeling of a body that matters. **We landed** on needs as *consequences of your plan*, never chores: the core's needs and accidents stay, your routine looks after them, and they reach the screen only when a choice you made caused them (a double shift with no break, three rounds and no dinner). They also feed your fight edge, which is how energy ends up mattering at night.

---

## 12. Why this is original

- **The day/night split:** asynchronous BitLife days and live Sims-and-GTA nights in one life sim. Nobody else does both halves in one game.
- **Group moments with secret picks:** a BitLife card for the whole table, revealed face by face.
- **Beat Brawl:** a rhythm-read fist fight with built-in consent ("always walk away"), whose result feeds a full simulation (injuries, assault, witnesses, police, gossip).
- **A newspaper written from what actually happened** to you and your friends last night, which is also the reason to come back tonight.

---

## Appendix: what the prototype is

`prototype/index.html` (42 files, 2.8 MB) runs offline from the folder (`file://` or any static server). The footer on every screen says what's real; tap it for the full list.

**Real (from the repository):** every picture (the Copper Tap and Meridian rooms, nine building pictures, ground tiles, faces, and six characters cut from the owner's sprite sheets with their walk cycles); the Copper Tap's traced floor, furniture, 46 seats, bar, darts and stage (you walk on that floor and sit in those seats); the card text of the work decision and six life events, word for word; Dominique's wage, the Copper Tap's menu and prices, the park jog and therapy effects, darts (+12 fun, +8 social); the fight rules and formula (`fights.json`), injuries (`injuries.json`); heights, ties and personalities (`data/characters`); her goals, the recruiting ladder, and the price of 2 Willow Lane with its 10% down payment.

**Mocked:** the four friends and their players, and everything they say or pick; every roll (the browser rolls instead of the core's saved stream); the planner and the montage's timing; the group moment's reveal; Beat Brawl's combat; the vibe meter; the Ledger and its posts; the layout of the nine-building block. Nothing is saved.

**Debug links** for the panel: `index.html#day`, `#town`, `#room`, `#fight`, `#ledger` jump straight to a screen.
