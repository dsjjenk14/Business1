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
**Amended by D-046:** founders nobody has claimed can be played by labelled scripts that write
no claim, which answers part of the open question, and the operator can release a claim.

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

## D-021 — The art cards define the founding cast
**Context:** The product owner supplied reference sheets for 11 characters. Only Aaliyah
and Sienna matched the spec's original 16 names.
**Decision (product owner):** These 11 are the founding cast; the spec's other names are
dropped. Jaxon Reid becomes Dax Hendrix, AI Engineer (his sheet was drawn from Jaxon's
description). The unnamed sheet is Dominique. All 11 are playable now.
**How:** Card facts (name, age, height, occupation, ethnicity, build, skin tone, features,
personality) are canon and copied into each character's data. Backstories, secrets and ties
were written to fit the cards and are meant to be edited. Pronouns were confirmed by the
product owner.

## D-022 — Staff can always enter their own workplace
**Why:** Opening hours are for customers. Andre must be able to open his own studio at
9 a.m. even though the public can't come in until noon.

## D-023 — The offline rule: three real weeks of self-care, then depression
**Decision (product owner):** A character whose player stops logging in keeps looking after
themself for 21 real days. After that they are depressed and only keep up the very basics:
needs, mood, weight and their home all slide toward low targets
(`life.offline` in data/config/life.json). Depression is a condition: it lifts with good
days in the world, therapy and antidepressants.
**How:** "Real days" are measured on the world clock at its configured rate (1 game minute
per real second), so time the server is down doesn't count. Characters nobody has ever
played are exempt: they just live their routine.

## D-024 — Aging and pregnancy run on their own clocks
**Decision:** One year of age per 1,800 game days (one birthday per real month at the
current clock). Pregnancy lasts 252 game days (nine months on the in-game calendar, about
four real days).
**Why:** The world clock runs 60x real time. Aging on calendar years would age everyone
65 years per real year; nine real months of pregnancy would never be seen. Both are data
(`life.aging`, `romance.pregnancy_game_days`) and can be retuned together.

## D-025 — Mature content: adults only, consent at every step, fade to black
**Decision:** Romance and intimacy are only between adults and never within a family; this
is enforced in code (`World::checkRomanceAllowed`), not data. Every step between two people
(a date, a kiss, a proposal, a wedding, intimacy) is an ask the other player must accept,
and asks expire. Intimacy is private (only inside a home) and fades to black: the game
tracks its consequences (feelings, private memories, infections, pregnancy), not the act.
Sexually transmitted infections and illegal drugs have fictional names. An abortion is
private to the patient: no one else is notified and nothing is public.
**Why:** These are product-owner requests for a life sim aimed at adults. The rules above
keep them about consequences and choices, keep players from being drawn into anything they
didn't agree to, and keep minors out entirely. A public server will also need reporting,
blocking and moderation (MULTIPLAYER.md), and a store rating decision.

## D-026 — One saved random stream
**Decision:** Every chance roll (illness, conception, detection, miscarriage...) comes from
a splitmix64 stream whose state is saved with the world.
**Why:** Outcomes are reproducible from a save, and tests force outcomes by setting chances
to 0 or 1 in patched content instead of mocking randomness.

## D-027 — Reproduction is its own character field
**Decision:** `reproduction` is `carrier`, `sire` or empty, separate from gender and
pronouns. The character creator asks it as an optional question; the founding cast's is set
in their data (and can be edited).
**Why:** Pregnancy needs to know who can become pregnant; gender identity and pronouns
don't say that, and shouldn't be used to guess it.

## D-028 — Crime is a chance you can see coming
**Decision:** Being caught = a base chance + one per witness + one per staff member on
shift + one per police officer on duty nearby (data/society/crimes.json). Caught means a
fine, jail time (a state that blocks movement and actions until served, in the police
station's cells), a record entry and contraband seized with a possession charge. Can't pay
the fine: serve longer. Reported crimes make you wanted; patrols and police players arrest.
**Why:** Players can read the room: stealing in an empty shop is safer than in front of
staff or an officer. Jail is time, not a lost character.

## D-029 — Apply in person; enroll at the door; police patrol on the clock
**Decision:** Job applications and enrollment happen at the workplace or campus (inside or
at the door, since some are staff-only). Leaving a building ends a shift, except for
careers that work outdoors (police), who stay on duty while patrolling.
**Why:** It keeps the town's places meaningful, and the academy is behind a staff-only door.

## D-031 — Only a woman and a man can conceive, and she carries
**Decision:** Every character is `female` or `male` (`sex`), separate from gender identity
and pronouns. The creator asks it. A pregnancy can only start between a female and a male
character, and the woman carries it. The earlier carrier/sire field is read from old saves
and mapped (carrier → female, sire → male).
**Why:** The product owner's rule. Keeping sex apart from gender and pronouns lets players
present however they like without the game guessing about their bodies.

## D-032 — Ages follow the calendar
**Decision:** One birthday a game year: twelve months of twenty-eight days (D-007), 336
game days. At one game minute a real second that is a year every 5.6 real days. Saves from
the old rule (1800 game days a year) load with the age each character had reached and how
far into the year they were.
**Why:** Under the old rule a nine-month pregnancy (252 game days) and an eighteen-year
childhood (32,400 game days) lived on different clocks, and a birthday never fell on a
date. Now a pregnancy, a school year and a birthday all read off the same calendar, and a
child born in Livéra is an adult in about a hundred real days. If that feels fast, the knob
is the clock rate (`minutes_per_real_second`), not a second aging rule.

## D-033 — Children are routines, with consequences
**Decision:** Nobody plays a child. Children live at home, go to daycare (under five, paid by
the day) or school (five to seventeen, weekdays), and are stepped once a game hour. Under
thirteen they need an adult: a parent at home (an offline parent's routine covers them,
unless they've stopped coping), the family's nanny on shift, or the staff where they're
enrolled. Hours alone add up to a child-services report: a fine and a record for each
parent. Parents (and the nanny) do care routines at home that lift the child's needs,
build the bond and help with school. School days produce grades; a diploma at eighteen
needs an average of 60. A nanny is a career hired by a family (the parent asks, the nanny
says yes) and paid from the parent's bank account for shifts worked in the family's home.
**Why:** Children have to matter without being a second game. Supervision, money and grades
are the three things a parent actually decides about, so those are what the simulation
tracks. Children stay home rather than tagging along; carrying a baby around town is M1 work.

## D-034 — You start at 18, in your twenties or in your thirties
**Decision:** The creator asks for an age group (`18`, `twenties`, `thirties`) and an
optional exact age inside it; otherwise one is rolled from the world's random stream.
**Why:** The product owner's choice. Three groups are enough to pick a life stage without a
slider full of numbers nobody feels strongly about.

## D-030 — Clinicians earn from care given on their shift
**Decision:** Care is bought as offers (checkups, treatment, STI tests, prenatal visits,
the ER, rehab, abortion care). A doctor or nurse on shift where it's bought earns a share
from their employer, and the patient recovers a little more.
**Why:** The clinic works with nobody playing a doctor, and playing one matters.

## D-035 — Homes are bought with real mortgages, and a home belongs to everyone who lives there
**Decision:** Eight new homes on Willow Lane (four 3-bedroom houses, $420,000–$520,000; four
2-bedroom Lakeview condos, $260,000–$320,000) are marked `for_sale` and sold at their market
value, first by their developer (Willow Lane Homes). A buyer pays at least the minimum down
payment (10%) and one lender, Livéra Savings Bank, pays the seller the rest as a mortgage
with one product in data (6% a year, 360 game months, standard amortization). The bank lends
only if your share of all your mortgage payments stays under 40% of your monthly pay (your
career level's hourly rate x 160 hours), or your savings left after the down payment cover
12 months of them; the refusal says which numbers fell short. Payments come out with the rent
on the first of the month. A payment that can't be made is owed as arrears plus a $50 late
fee; three behind and the bank forecloses: it owns the home, lists it again, and everyone who
lived there has to leave and is told why. Selling goes to the outside market at market value:
the mortgage is paid off first and the owners split the rest. Partners (dating, engaged or
married) buy together through an ask (`request kind=buy_home`): the down payment and every
monthly payment are split evenly, each must qualify for their half, and if one can't pay
their half the other covers it if they can. A home has a list of residents (adults) and of
owners; `tenant` stays as the lease holder (or an owner who lives there) for older code.
Partners move in together with an ask (`request kind=move_in`): a renter's lease ends and that
home is free for newcomers, an owner keeps what they own, and rent is split evenly between
residents. Children move with the parent they live with; the nanny's key follows the family.
**Why:** The product owner wants partners to share a home, and a home is the biggest money
decision a character makes, so it has to be real money: every cent is a `Ledger::transfer`
(down payments to the seller, the loan from the bank to the seller, payments to the bank,
sales paid by `sys:economy`), nothing is created, and missing payments has the consequence it
has in life. The 40%-of-pay-or-a-year-of-savings rule is the simplest lending rule that can
be explained in one sentence of a refusal. Rentals stay rentals; there is no landlord play.

## D-036 — Work decisions speed up promotion; they never replace the shift
**Decision:** On shift, up to `work_decisions.per_day` (3) decisions a day come up from the
character's career bank. Answering is optional and once per decision per day. An answer
changes performance immediately by `performance_worst + (performance_best -
performance_worst) × score` (−4 to +6, clamped 0–100) and adds `score ×
bonus_hours_per_point` (1.5) hours toward the next title. Promotion is still decided at
`endShift` by the unchanged rule (`hours_at_level ≥ hours_to_promote` and `performance ≥
min_performance`). A shift too short to be paid (`min_paid_minutes`) doesn't count toward
promotion, and neither do the hours its decisions added: they are taken back when it ends,
and the reply says so. What the calls did to performance stands. Unanswered decisions lapse
at midnight with no penalty.
**Why:** The product owner wanted attentive players promoted faster and idle ones left
exactly where they were. Crediting hours (not promotions) keeps one rule for promotion.
Without the short-shift rule, clocking in for a minute a day to answer three questions would
earn up to 4.5 promotion hours a day without working, which is the opposite of "when you go
to work". At the defaults a full 8-hour shift with three best calls is worth 12.5 hours
instead of 8: about a third faster.

## D-037 — Work decision scores stay on the server; the day's draw is a pure function
**Decision:** The server never sends an option's score or explanation before it is
answered: the list carries the prompt, the labels and optional details, in an order
shuffled per character and day. After an answer the reply (and the list, and the phone)
says whether it was the best call, why the chosen option was or wasn't, and which option
was best and why. The day's draw and the option order are a hash of (character, game day,
task), not the world's random stream: the same all day, the same after a restart, and
opening the phone never changes anyone's dice. Among the career's decisions, the ones that
have come up least often go first, so the days work through the whole bank before
repeating, and the day's set is never the same as the previous work day's when the bank has
more to give.
**Why:** A score in the reply would let a client pick the best option every time; the
point is the player's judgment. A pure draw makes the phone (a read-only view) and the
command agree without saving anything until the player actually looks.

## D-038 — Coins are their own currency, verified by the server, and buy looks, not an edge
**Decision:** Coins live in a second zero-sum `Ledger` (`WorldState::coins`), apart from
dollars: accounts `coins:<character>` and the issuer `sys:coin_store`, the only account
allowed below zero (it holds minus every coin in circulation). Coins come only from coin packs
bought with real money. The client never says it paid: it sends a store receipt with
`buy_coins`, the server's payment verifier checks it, and only then does
`World::creditCoins` credit the pack, exactly once per receipt id (every credited receipt is
kept forever in the world save; a repeat is refused with `duplicate_receipt`, for any
character). Real App Store / Google Play verification isn't connected, so a production server
refuses every `buy_coins` with `payments_unavailable` and says why; dev servers (`--dev`) and
servers started with `--test-payments` use a test verifier that accepts receipts starting
`test-`, records them as test purchases and charges nothing. Coins never turn into dollars and
can't be sent to another player. The coin shop sells only cosmetic and status items, and
content validation enforces it: a coin item can't be usable, consumable, unlock anything,
change needs, be medicine or a drug, and can't beat (in style, feel-good emotion or, for a
phone, battery life and charge time) the best thing dollars buy in the same slot or category.
**Why:** Real money must never be trusted from a client (rule 1), and a receipt that could be
replayed would print coins. A separate ledger keeps the dollar economy honest: nothing bought
with real money can enter wages, rent or prices, so there's no pay-to-win and no laundering
real money into the town economy (or coins between accounts, which is how stolen cards and
gold-selling work in other games). Saying "payments unavailable" is the honest state today
(rule 6): the store integrations need the stores' server APIs and credentials, which is
platform work for the M1 client.

## D-039 — Every adult carries a phone, and its battery matters
**Decision:** Phones are items (category `phone`) with a model in `phones.models`: hours a full
battery lasts online away from a charger, and hours from dead to full. Every adult has one in
hand (`CharacterState::phone`): the basic model is issued to anyone 18 or over who has none, on
load, on arrival and on their 18th birthday. Once a game hour the phone in your hand drains
while you're online and away from a charger, and charges in a home you're welcome in, at your
workplace while on shift, in a study session, at places with public outlets (`charge_at_types`:
the café, Circuit Electronics, the university, Common Ground) and while you're logged out (your
routine plugs it in). At 0% it's dead: every phone app and texting refuse with `phone_dead`
("Your phone is dead. Charge it at home or at work."), as do LivPay and the coin shop. Cash and
card still work, and others can still text you. Switching phones (`use` a phone, or
`switch_phone`) puts the old one in your inventory with its charge remembered; a phone still
in its box is full.
**Why:** A phone that can die makes it a thing you look after, like hunger, without making a
normal day hard: the basic Lyra One lasts 40 hours away from a charger (a long day out uses
about 40%), and a low-battery warning comes at 20%. Better phones are a real reason to spend
dollars (60 and 80 hours). The coin-only Gold Edition is exactly as good as the Pro, by rule.

## D-040 — LivPay pays from your bank, with limits
**Decision:** LivPay is your phone paying from your bank account. Tap to pay: `buy` with
`method: "phone"` (ledger kind `livpay_purchase`) and `ride` with `pay_with: "phone"` (kind
`livpay_fare`). Send money: `livpay_send` moves dollars bank to bank, anywhere in town, to
anyone who has a phone (online or not), with a note; kind `livpay`; the recipient is notified
with the note. Limits from data: $2,500 a transfer, $5,000 and 20 transfers a game day (counted
from the ledger, so they survive restarts), notes up to 140 characters. All LivPay needs a
working phone.
**Why:** It's the "Apple Pay like system" the product owner asked for, built on the one ledger
so it can't create money. Limits make a stolen session or a scam cost something bounded. And
because LivPay pays from the bank, a pickpocket (who only ever takes cash) gets nothing from it.

## D-041 — Dates count, and the town league plays itself
**Decision:** A date is not a new command. Some offers and activities at date spots are listed
in data as date activities; doing one while your partner (dating, engaged or married; never an
ex, a stranger or family) is online and at the same place gives both of you a romance bonus,
happiness and a shared memory ("Dinner at Lumière with Dax"), once per couple per place per
game day. Sports are a town league the server runs: each team has a baseline strength (its
townsfolk roster), players join in person, and at the scheduled kickoff each side's strength
is that baseline plus the members standing at the venue (by athletics and energy) plus a
little luck. The score follows from the strengths (Poisson goals for soccer; points around an
expected total for basketball, which goes to overtime instead of drawing). Results go to the
members, the players and whoever is watching; the table is kept in the world.
**Why:** Players already do these things (buy dinner, walk in the park); the date is what
happens when they do them together, so it needs no ask-and-answer and no new verbs. A league
that only ran when enough players showed up would never run in a small town, so the town
fields its own teams and players change the result by turning up. Results have to be the
server's (rule 1), deterministic from the saved random stream, and testable with chance
turned off in data.

## D-042 — Pets live at home and depend on the household; medicine has limits and prescriptions
**Decision:** A pet is adopted in person at Paws & Whiskers (a fee), lives at the adopter's home,
and anyone who lives there can care for it. Its needs (hunger, fun, hygiene, health) run down
by the hour; an offline owner's routine keeps it fed and fine, the same rule as for children,
unless the owner has stopped coping. A pet starved for a day, or with its health gone, is taken
back to the shelter by animal control, and the household is told why; the shelter won't give it
back to them. Pets fall ill now and then; the vet diagnoses, vaccinates and treats, for a fee,
and vets on shift earn a share. Pets age on the calendar (puppy, adult, senior) but do not die
in M0.8. The shelter's animals are generated from data and the week number alone, so every
player sees the same animals. Medicine is items with a daily dose limit; prescription medicine
needs a prescription that a doctor writes when a checkup diagnoses a condition it treats, with
a number of fills and an expiry. Going over the limit hurts and, past a point, is an ER visit;
a sleep aid with alcohol in your system is an emergency.
**Why:** Pets and medicine should ask something of the player (feeding, a vet bill, reading the
label) without becoming chores nobody can keep up with; the offline routine and generous
cooldowns keep both fair to people who don't play every day.

## D-043 — Wetting yourself is public, lasting and costly; small details are real systems
**Decision:** When your bladder runs out you wet yourself (as before), but now it is a big
event: hygiene drops to 0, a strong burst of embarrassment, stress and lost confidence, and a
"humiliated" condition for 60–84 game hours that drains your social life and makes social moves
land worse (receptivity × 0.6). The clothes you had on are ruined until washed (they count for
no style and cap your hygiene at 50). Everyone there sees it: each witness remembers it and
loses respect and attraction for you (a partner loses twice the attraction), and for a day each
witness may tell close friends (friendship 50+) who weren't there, who think less of you too.
Someone famous (fame 60+) also loses fame, and the Livéra Ledger runs it. Alone, it is still
humiliating, but nobody knows. Around it: clothes get dirty after 16 hours worn and need
washing (at home for some energy, or $8 at Suds & Spin); the weather is rolled each day from the
season and changes at 06:00 to the previous day's forecast, and rain, storms and snow wear you
down outdoors without an umbrella; friends are told on your birthday and a cake on the day means
much more than a gift; three or more drinks in the 20 hours before 06:00 mean a hangover.
**Why:** The owner wanted the accident to matter far more than in The Sims. Making it social
(witnesses, gossip, a partner's reaction, the paper) and lasting (days of humiliation, ruined
clothes) makes it a real event in other people's stories, not a status icon. The other details
are small, data-driven and tested, and each touches what people already do.

## D-044 — Art for what lives in a save is listed in art/manifest.json
**Decision:** Residents made in the character creator and named pets exist only in a save, not
in `data/characters`, so their art cannot be linked from data the way the founders' sheets are.
`art/manifest.json` lists it instead: residents by character id (sheet, avatar, card title),
pets by owner id and name, plus pictures of places, the bus and stops, the city stages and
concept posters, each keyed by the game's own ids. A test checks that every path exists, that no
founder is listed there, that pet keys are `owner:name` with a real species, and that place and
stop ids are the game's. Each entry carries `notes` for
anything the picture gets wrong about the game (a pet's age on its card, a job that changed),
so the art never claims a state the game doesn't have. `art/concept/` holds posters whose
districts and layout are not the game's; they are labelled as concept and never used as a map.
`art/_incoming/` is where new images land before they are checked, and it is not committed.
**Why:** Content is data, and the server never serves images, so a manifest beside the art is
the smallest honest link: nothing in `src/core` changes, the test keeps the links true, and the
"never pretend" rule is kept by writing down what each card gets wrong instead of hiding it.

## D-045 — The first game client is a 2.5D web client; the JSON protocol is the game protocol
**Decision:** M1 is a playable web client in `web/`, grown from the town preview: an isometric
2.5D canvas in any phone or desktop browser, talking to the C++ server through a small WebSocket
gateway. The newline-JSON protocol (renamed `livera/1`) is the game protocol, not a dev-only one.
Movement stays server-moved along straight lines; the client only predicts those lines to draw
them smoothly. The clock stays at 1 game minute per real second (D-015). Proximity voice is
planned for the web client right after Phase 0 (`docs/proposals/voice.md`), with the server
deciding who hears whom by the same whisper/say/shout ranges as text. A three.js 3D view can
later replace the 2D renderer inside the same client, behind the same transport and state.
Unreal is no longer the M1 client.
**Supersedes:** the engine half of D-002 (the core stays engine-agnostic, so an engine client is
still possible later), D-003, the "replaced by UE replication" note on D-004, the "UE client-side
prediction" note on D-013, and the "voice with the engine" half of D-019.
**Why:** The owner chose it (October 2026) after a three-way comparison
(`docs/proposals/web_client.md`): Unreal can't be built or tested in the cloud container this
project is made in, while a web client can be built, screenshot-tested with Playwright and played
on a phone within days. About 60% of what makes the town feel alive (seeing people move, buses,
a busy town) is server work every client needs, so the server changes come first.

## D-046 — Script accounts never claim a character, and people always win
**Decision:** Accounts named `bot_*` are scripts (the town director, `scripts/town_director.py`).
Only the operator makes them (`livera_server --add-account`); `register` refuses the prefix. A
script's `play` writes no claim and is refused with `character_claimed` if any account has claimed
the character, or `character_in_use` if anyone is playing it; scripts can't `create_character`
(`forbidden`). While a script plays a character, everyone who sees them gets `scripted: true` and
`characters` shows `scripted_now` (kept in `World` memory, never saved). When a person plays a
character a script is playing, the script gets `released` and leaves the world, and the person
plays and claims it. The operator can free a claim with `livera_server --release-character ID`;
whoever is playing that character keeps it until they leave. `--max-players` (default raised from
8 to 16) counts people only; `--max-scripted` (default 16) caps scripts.
**Amends:** D-010. One account still plays one character and a claim still belongs to one
account, but founders nobody has claimed can now be run by scripts with no claim written.
**Why:** The town shouldn't feel empty with three friends online, but a script must never pass as
a person (rule 6) or keep a character from one. Writing no claim keeps the accounts table the only
record of who owns whom.

## D-047 — Resume tokens live in server memory only
**Decision:** `login` returns a token (32 bytes from OpenSSL `RAND_bytes`, as 64 hex characters);
`resume {token}` logs a connection in like `login`. Tokens expire 7 days after issue, at most 5 per
account (oldest dropped), `logout` revokes the session's own, and a restart forgets them all. No
save-format change.
**Why:** Phones drop connections constantly; a token reconnects them without the browser ever
storing the password, and keeping tokens in memory needs no migration and no table of secrets to
protect.
**Trade-off:** Every restart (each `livera-update`, a crash, a reboot) sends every player back to
the password screen.
**Revisit:** When that annoys players, or tokens need revoking from a settings screen: store hashed
tokens with a migration.

## D-048 — Login throttling is per username, in memory
**Decision:** After 5 wrong passwords for one username within 10 minutes, every `login` for it is
refused with `login_throttled` for 10 minutes, the right password included. The lock is checked
before hashing; a success clears the count; `resume` is unaffected.
**Why:** The server only sees the gateway's loopback connections, so it can't limit by IP;
per-name limits stop guessing against the few real accounts.
**Trade-off:** Anyone can lock a known name (including the predictable `bot_<character>` names)
out of password login for 10 minutes at a time. A player who still has a token can `resume`.
**Revisit:** Before any public server: per-IP limits (MULTIPLAYER.md, "Not yet").

## D-049 — The VPS install: tested releases behind a `current` link
**Decision:** `deploy/setup.sh` builds on the server and runs `livera_tests`; if they fail nothing
is installed. Each commit goes to `/opt/livera/releases/<commit>` (the three newest kept) and
`/opt/livera/current` points at the live one; systemd runs the server, the gateway and (unless
turned off) the director from it. The server runs `--bind 127.0.0.1 --closed-registration`, never
`--dev` or `--test-payments`; Caddy terminates HTTPS, serves the client and proxies `/ws` to the
gateway; UFW allows SSH, 80/tcp, 443/tcp and 443/udp (HTTP/3). Accounts are made with
`--add-account`. `backup.sh` keeps the newest 14 nightly SQLite `.backup` copies and the newest 5
taken before updates.
**Why:** A failed build or test can never half-update a running server, and going back to an
older release is re-pointing a link.
**Trade-off:** Re-pointing the link is not enough after an update that added a save migration:
the older server refuses the newer schema (`storage_version`) and systemd keeps restarting it.
Going back past such an update means restoring the backup taken just before it too, and losing
what was played since.

## D-050 — Scripted founders leave the world at night
**Decision:** The town director logs each character out at bedtime (two hours after the last
thing in their schedule, between 22:30 and 23:45) and back in at their wake time; offline life
(D-011) covers the night. Its two habits that aren't data (coffee before some work days, an outing
on free days) are logged as `[director habit]`.
**Why:** Offline life already models a night at home; scripting sleep a second time would
duplicate it and hold sessions for nothing.
**Trade-off:** Players see scripted founders leave (`left_world`) in the evening.

## D-051 — Sight range is data, 120 m, never below shout range
**Decision:** `simulation.sight_range_m` (120) replaces the 40 m constant in `WorldViews.cpp`;
`ContentDatabase` refuses content where it is below `shout_range_m`. Only online characters can be
in sight: outdoors, other people outdoors within that range; inside, everyone in the same building
at any distance; never anyone else. `look.people` and the per-viewer `people` stream carry their
position and motion (MULTIPLAYER.md, "What a player can see").
**Why:** Clients draw whoever they hear; a shout from someone out of sight would be a voice from
nowhere.

## D-052 — An automatic reconnect never takes the account back
**Decision:** `resume` takes an optional `take_over` (default true). The web client sends false on
its automatic reconnects and true when the page opens or the player taps "Play here instead".
With false, if another connection holding a different token is logged in to the account, the
reply is `in_use_elsewhere` and nobody is kicked; the same token's half-open old connection is
still replaced.
**Why:** A phone that slept through `kicked` would otherwise wake, resume and kick the laptop the
player had moved to, and the two devices would take turns. Only the server knows whether another
session is open.
**Trade-off:** Older clients omit the flag and keep "the newest login wins".

## D-053 — Founders nobody plays run on autopilot in the core, labelled
**Decision:** `src/core/Autopilot` ports the town director's behaviour into the core: a day
built from the career and `profile.schedule`, opening hours, bus or walk, needs at home, bed by
leaving the world (D-050). It drives characters only through World commands and decides only
from the views a client of that character gets, with its plan in memory (never saved). The
server runs it with `--autopilot` for every playable founder no account has claimed, steps it
from its tick, releases a character the instant a person `play`s them (before `World::connect`)
and takes a founder back when their player leaves unclaimed. The single-player WebAssembly build
uses the same class. Autopilot characters are labelled `scripted` with `played_by: "autopilot"`
(a `bot_` session's: `played_by: "script"`); they are not sessions and count toward neither cap.
**Why:** The owner wants a town that lives whether or not anyone else is online, in the browser
alone too. The director already behaves well over the wire; putting the same behaviour inside
the core means one simulation and one set of rules, no second process, no script accounts to
provision, and no way for the autopilot to cheat since it goes through the authority boundary
like everyone else.
**Trade-off:** The autopilot draws its jitter from the world's random stream, so a world with
it on rolls differently from one without. Script sessions (`bot_`) can't borrow a character the
autopilot has (`character_in_use`); with `--autopilot` on, the Python director has nobody to
play, which is fine: they are alternatives, not partners.

## D-054 — Single-player runs the real core in the browser
**Decision:** The single-player game is the same C++ core compiled to WebAssembly
(`src/wasm/solo.cpp`, `scripts/build_wasm.sh`), driven by the same web client through a local
transport (`web/client/solo/`). In-world ops go through the dispatch the server uses
(`src/protocol/WorldOps.cpp`), so replies and error codes are identical. The world is saved as
JSON in the browser (`worldStateToJson`, `"format": 1`, with the random stream as a decimal string
so JavaScript can't round it). The other founders run on the core's autopilot (D-053). The clock
stops while the tab is hidden and never catches up. The module inlines its wasm as base64 so it
is one plain-text file any static host, including a Claude artifact, can serve.
**Why:** The owner asked for a game where they are the only player and everyone else is played by
the game. Running the real core keeps one set of rules for single-player and multiplayer; a
second, simplified simulation would drift and would be a pretend version of the game. Saving in
the browser means no server and no account, at the cost that a save lives on one device unless
it is exported to a file.

## D-055 — The Livéra look comes from the owner's reference art
**Decision:** The town, its buildings and the game's screens follow `art/STYLE.md`, drawn from
four pictures the owner chose as the inspiration: the Line 1 route poster, the transit card, the
gold laptop's golden-hour river and the law-office interior. That means golden-hour light,
ivory and sand stone, champagne gold, deep emerald, sage trees with warm lights, and a river with
an arched stone bridge. The web client's palette and light follow it, and so does every map-sprite
prompt (`scripts/town_prompts.py`). The bus livery is the poster's emerald and gold.
**Why:** The owner said this is how the town and everything should look. Writing it down once
keeps the client, the prompts and future art consistent. The one limit is honesty: the
pictures' skylines are the future city, so the founding town never gains towers the data doesn't
have, and people in reference art are not game characters unless the cast sheets say so.

