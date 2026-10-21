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


## D-056 — One town process for the browser: LocalTown, for one player or several
**Decision:** The part of `Server` that needs no sockets, accounts or SQLite is
`protocol::LocalTown` (`src/protocol/LocalTown.h`): the World, the autopilot, and the set of
characters people are playing right now, with the server's tick order (autopilot first), its
in-world dispatch (`WorldOps`), its refusal codes and "people always win" (joining releases the
autopilot first). The single-player module now runs on it (`solo_*` exports), and the same module
exports `town_*` functions for several people in one town: join, leave, request, tick, characters,
create a character, the people present. Accounts and claims stay with the caller, as they do in
`Server`. Tested in `tests/test_localtown.cpp` (five people see each other, hear a say only within
range, and keep their own money; a played character can't be taken; the save round-trips) and in
`web/tests/town_smoke.mjs` against the built module.
**Status:** The browser page that hosts friends through it is built: "Play together"
(`web/client/together/`, D-057), tested with five pages on a stand-in for the artifact platform
(`web/tests/run_together_e2e.sh`). It has not been published as an artifact yet, so nobody has
played it on the real platform.
**Why:** The owner asked for five people in one town on the web. A second copy of the server's
rules for the browser would drift from the real ones; one process type for "one player" and
"several players in a browser" keeps a single set of rules, and the real server (D-045) stays the
way to play on a VPS.

## D-057 — Play together: the host's tab is the server, and only admins host
**Decision:** "Play together" (`web/client/together/`) is a published artifact page where one
person's tab runs the town for everyone (LocalTown, D-056) and the others play through the same
web client over the artifact's room. The host is whoever holds the database lease on `town/host`,
and only the artifact's admins (its owner and Editors) can take it: the page declares
`town` admin-only in the database (the save, `town/save`, and the claims, `town/claims`) except
`town/host`, which everyone who can open the page reads (to find the host), and leaves the host's room topic (`down`)
undeclared, so it stays admin-only; friends, at Contributor, send on `up` only. Who a person is
comes from the platform's stamp on their messages (`by`, their `user.id()`), never from anything
inside them; one person plays one character, kept in `town/claims` as the server keeps it in
SQLite (`character_taken`, `already_has_character`, the newer tab wins). Everything one person
may know travels encrypted for them alone (ECDH P-256 per friend, HKDF, AES-GCM per direction;
the host's public key pinned in `town/host`), because everyone in the room hears every message.
The host applies the server's request and chat limits. The town ticks only while the host's tab
is visible; hidden, it pauses, tells everyone and saves; closed, it stops, and an admin who has
played in this page and has it in front takes over from the last save (handover); with no such
admin it stops and says so. Saves go to the database every 20 s, on hide and on stop, gzipped,
split under the 256 KiB document limit into two alternating slots behind a manifest with a
SHA-256, so an interrupted save leaves the previous one whole.
**Why:** The owner wants five people in one town on the web before a VPS exists. Letting any
Contributor host would let any friend read everyone's money, messages and feelings from the save
and act as any character, which rule 5 and "a friend can only act as the character they claimed"
forbid; admins can already change the artifact itself, so trusting them to host adds no new
power. Encrypting per person is the only way to keep rule 5 on a channel everyone hears.
**Trade-off:** The host's browser holds everyone's state; the page says so on the lobby, the menu
and the HUD. The town stops whenever no admin's tab is open and in front, and progress since the
last save (at most 20 s) is lost if the host's tab crashes. On a personal plan, people outside
the owner's organization may be offered only Viewer (they can't play: the page says so) or Editor
(they can play, and could also host and read the save), so the owner should make Editors only of
people they'd trust as host. Latency grows with the number of people because the room carries
about 40 messages a second per page; tested with five, capped at the server's 16.

## D-058 — What a place offers, when it's open, and which jobs a newcomer can take, are public
**Decision:** `look.here` lists each offer's and activity's `needs` and `emotions` effects (content,
like the price) and, per activity, the viewer's own `ready_at` / `ready_in_minutes`; `map` gives each
place's `hours` and `open_days`, and a place's `status` now keeps its open days (the school and the
daycare are closed at weekends, as their data always said; before, only the hours were checked);
`characters` names each character's `home` and `workplace` as they are now. The character creator
applies the career entry rule `apply` uses (`World::meetsEntryRequirements`): a starting career your
education doesn't qualify for is refused with `missing_degree`, and `creator_options` marks the
education answers each career takes. AI Engineering now needs a bachelor's degree, in the creator and
when applying.
**Why:** The redesign (R1.2, R2.6) asks the client to show what an action will do and when it's
possible again, which needs numbers only the server has; none of them is anyone's private state.
A shown `open_days` the world ignored would have been a pretend rule. A high-school graduate starting
as a machine learning engineer at $50 an hour broke the story the creator asks you to tell, and the
creator and `apply` disagreeing about the same job was a bug.

## D-059 — The owner's ground tiles: re-projected textures, a cached ground, set pieces placed by the sketch
**Decision:** The web client draws the owner's ground tiles and set pieces (`art/tiles/`, the bus
shelters) from client copies in `web/client/tiles/`, made by `scripts/client_tiles.py`: the 2:1
diamonds are turned back into top-down squares (the inverse of each diamond's affine map, its top
corner being world (0, 0) under `P()`), their painted light taken out, graded toward the palette and
made to repeat, and laid flat with `CanvasPattern` transforms through the projection; set pieces
carry anchor points measured on the art. The flat ground is drawn into an offscreen canvas and
copied in each frame, re-drawn when the zoom, the light (in steps), the places, the projects or the
pictures change or the view pans past its margin. Construction sites show their site's picture
(bare, or framed from 35% of an active project); the crane marker stands over active projects whose
picture paints none; Founders Way's works are laid at one spot on the road while it's active (the
bare site, then the framed stage from 35%). Where each piece goes (the bridge's span, Willow Lake's
lot, the works' fit) is in `layout.js` with the rest of the sketch. Without `tiles/manifest.json` the
hand-drawn ground stays. A picture drawn from a flatter angle than the map's (the bare works) keeps
its proportions within a small stretch and is sheared, verticals upright, to lie along the road:
stretched to fit it came out nearly twice as tall. The Founders Park stop moved from inside the park
(420, 330) to Main Street's kerb opposite its gate (465, 350), where the other stops stand about 10 m
off a road, so its shelter isn't hidden under the park's picture and the bus stops on a street.
**Why:** The tiles were painted for a 2:1 view and the map is 30°, so drawing them as pictures would
misalign every diamond; re-projected they lie flat at any zoom. Textured strokes and fills cost
several milliseconds a frame in software canvases (headless Chromium, low-end phones), and the
ground almost never changes between frames, so caching it makes the textured map no slower than the
flat one. The art's state follows the game's: a site picture only while the building is under
construction, framed only from the project's real progress, no crane over a planned project. The
corner, crossroad and river-edge tiles don't fit the sketch's streets and quay (web/README.md, "The
look").

## D-060 — Work decisions arrive through the shift, and the redesign's tunings
**Decision:** Four work decisions a day (`work_decisions.per_day`), and they come up through the
shift: the first when it starts (or at midnight on a shift that crosses it) and one more every
`spacing_minutes` (150), each announced to the worker with a `work_decision` event; one that hasn't
come up is refused with `not_yet`, and a decision answered on an earlier shift that day stays up as a
result, so the next shift starts with the next one. Which are up is a pure function of the shift's
start, the clock and the answers (like the draw, D-037), so nothing new is saved. The decision bonus
is 2.0 promotion hours per point (was 1.5). Tunings, all data: bladder decays 6 an hour (was 10),
social 2 (was 3); sight range 160 m (was 120, D-051; still at least the shout range); a new world
starts in spring, Monday of Month 4 at 07:00 (was midwinter, Month 1); level-2 and level-3 promotion
hours are 220 and 300 where they were 320 and 500 (the eleven careers on that ladder; recruiting, law
and the M0.7 careers keep theirs); darts gives 8 social (was 5); offices (the staff-only office,
agency, newsroom, law firm and site office workplaces) get a break-room coffee (energy +8, bladder
−5, every 3 hours), and Heritage Coffee gets "chat with the regulars" (social +6, hourly).
**Why:** The redesign's reviews found a shift was ten still minutes with every decision waiting at
clock-in, needs were a tap-tax (a bathroom every eight real minutes), solo players had few ways to
be social, the five founders on level 3 needed about 35 perfect shifts for a title, and every town
opened in a storm at 0 °C. Pacing the calls gives a shift something to wait for without changing
what a shift pays or how promotion is decided.
**Trade-off:** A shift shorter than 7.5 game hours sees fewer than four decisions; the ones that
don't come up lapse at midnight like unanswered ones, and they still count as drawn for the cycle
through the bank.

## D-061 — Goals are read from what the World already records, and say when they can't be
**Decision:** `data/goals/goals.json` defines daily goals and life aspirations; `src/core/Goals.cpp`
checks them. Three daily goals per character and game day are a pure draw (a hash of character, day
and goal, D-037) over the goals whose `requires` hold now (no partner, no date goal), keeping any
already done today. Aspirations are a founder's `aspirations` (beside the free-text `profile.goals`)
or, for a made character, the goals picked in the creator, mapped by `creator_goal`; every creator
goal maps to exactly one aspiration or the content doesn't load. Each check is one of a fixed set of
kinds computed only from the character's own records: their accounts, memories, side of each
relationship, messages, work answers, career, fame, songs and homes. Aspirations the game can't
follow (start a business, give back, build something that lasts) are `tracked: false` with the
reason, shown as such. The phone app `goals` answers only for the character asking. Nothing is
saved: no rewards, no streaks.
**Why:** The reviews found the game never said what to do, while the creator asked for life goals
and then ignored them. Reading goals off records the World already keeps answers "what next?"
without new state, so nothing can drift from what actually happened, and a goal is never shown done
unless the record says so. An untracked goal with a reason is honest; a bar that never moves would
be a pretend system.
**Revisit:** Rewards (emotions, never money) and streaks need a per-character record and a
migration; volunteering and giving need records before "give back" can be followed.

## D-062 — Sleep is your routine's night; skipping it is the host's call, and the server's needs everyone asleep
**Decision:** `World::sleep` puts a character to bed in their own home between `life.sleep.bed_hours`
(21:00–03:00), not on shift or studying (stable codes `not_home`, `not_bedtime`, `on_shift`,
`studying`, `in_jail`). Asleep, they stay in the world, but their needs and emotions aren't
simulated minute by minute: when they wake they catch up with the Tier-3 rule, as if they'd logged
off for the night. Any command except `look`, `map` and the phone apps wakes them; so does the wake
hour (07:00), which sends `good_morning` with what happened overnight from their own records.
`World::skipNight(beforeEachMinute)` advances the world to the wake hour minute by minute, with
everyone awake simulated and moving, sleepers on their routine, and the caller's hook run before
each minute (the Autopilot's step, so its founders still go to bed and get up); the people stream is
sent once at the end. The World never decides whether a skip happens: the server does it only when
started with `--night-skip` (off by default) and at least one person is playing and everyone playing
is asleep; scripts neither count nor block it. A LocalTown (single-player and Play together) applies
the same bed rule always: it has nobody else to wait for. Being asleep is session state, never saved.
**Why:** A night was eight real minutes with nothing to do. Sleeping as "the routine looks after
you" reuses the offline model D-050 already relies on, so a slept night and a logged-off night end
the same way and nobody wets the bed during a skip. Keeping the skip decision outside the World
lets the server, a solo town and Play together each apply their own rule to one helper, and keeps a
24/7 town shared with strangers from being fast-forwarded by a few of them.
**Trade-off:** Reading your phone in bed doesn't wake you (so a client refreshing goals or messages
doesn't block the bed rule), but it is a command; the exception is deliberate. The skip runs on the
server loop (about 600 minute-steps), a fraction of a second once a night.

## D-063 — Away, the routine includes the job; the server can pause when nobody is in town
**Decision:** Amends "offline characters don't make decisions; their routine doesn't include
shifts" (D-036, SIMULATION.md): a character away from the game works their scheduled hours. Once a
game hour, for each character offline, grown up, out of jail and still looking after themself, with
a job that isn't a family's (a nanny), a scheduled work block that ended in that hour (the schedule
line marked `"work": true` up to the next line, at most the career's longest shift; the default
weekday 09:00–17:00 block for a character without one, such as everyone made in the creator) is paid
for the part of it they were away: `Ledger::transfer` from the employer to their bank, kind
`salary_away`, at `life.offline.away_work.pay_share` (0.8) of the wage, plus `promotion_share` (0.5)
of the hours toward the next title, with no work decisions; promotion itself still happens at the
end of a shift in person. An employer that can't pay pays nothing (the hours still count, as for a
shift in person). Never-played founders live this routine too (D-023), and are not notified. Nothing
new is saved: the block comes from content and the time away from `lastSimulatedAt`. Separately, the
server gains `--pause-when-empty` (off by default): with no person in the world, the clock and the
autopilot don't run.
**Why:** On an always-on server the 1:1 clock runs sixty game days a real day; a player who works one
shift a real day fell behind on rent by the fifth real day (the redesign's review). SIMULATION's
tier 3 already promised that a dormant character lives their routine; paying the job at a share
keeps playing worth more than being away, keeps the ledger zero-sum, and pays in the hour the work
ends so it's there for the rent. Pausing an empty town is the owner's choice for a small private
server, not a rule.
**Trade-off:** Employers with no revenue (offices) run down faster with everyone's away pay; when
one runs dry its people's pay fails, away or in person, as it always could. A test runs a
once-a-day player for six real days: solvent with away pay, in arrears without.

## D-064 — Autopilot founders have manners: they greet, sometimes chat, and answer asks by data rules
**Decision:** Amends D-053 ("it never chats... declines every ask"). From `data/society/manners.json`,
an autopilot founder greets a person it meets (outdoors within say range, or in the same building)
once per person per game day with a `say` (by first name only if it knows them), may start a chat
(`interact`, the data's interaction) once a day with someone it knows, with a chance from its
personality trait and its own friendship toward them, and answers each ask by the rule for its kind:
minimums on its own side of the relationship with the asker (a date: compatibility 60, friendship 30,
romantic attraction 15; a kiss: 60, 40, 30). A kind with no rule is declined; intimacy is always
declined in code and refused in the data at load. It never greets or chats with another autopilot
founder or a script (anyone `scripted` in its look), acts only through World commands within its
one-command-every-two-seconds rule (an incoming ask brings its next turn forward within that rule so
it's answered before it lapses), keeps who it has greeted in memory only, and stays labelled
`played_by: "autopilot"`.
**Why:** In single-player the town felt empty: founders walked past without a word and refused every
ask. Greeting and the occasional chat make the town answer you without the autopilot pretending to
be a person (it's still labelled, and every action is a World command with the World's rules,
grudges and receptivity applying). Data thresholds keep a founder's yes tied to how they feel about
you, never automatic, and consent to intimacy is something a script must never give for a character
(D-025).
**Trade-off:** A restart forgets who was greeted that day, so a founder may say hello twice. Accepting
a date makes a founder someone's partner; the person can end it as with anyone.

## D-065 — The web client is map-first, says what's next, and puts every verb where it happens
**Decision:** Release 1 of `docs/proposals/redesign.md`. The screen is the town: a status strip
(clock, money, menu), need chips only when a need is low (with its number), the faces of people in
sight, and a bottom bar (Places, Talk, a context button that is Stop while you walk or ride, Exit
inside, Go to what's next, otherwise Today; Phone; You). Chat docks above the bar when Talk is open
(always on desktop). The sketch and single-player / Play-together notices became one attribution
line that keeps their full sentences. A Next card says what's next from your own data only (a low
need, your shift, decisions waiting, your routine, a bill due) and names its source. Results show
what changed ("Hygiene 85 → 100", a pay stub, a promotion banner) and are logged; refusals read as
sentences with a next step. Work decisions are cards answered with `work_answer`, showing the
server's verdict. Every verb the server has is reachable where a player looks for it
(`verbs.js`): join a team at the clubhouse, adopt at the shelter, buy a house for sale, apply at
an employer's door, wear and use in Items; a verb walks you there first and steps you out of the
building you're in unless you're on shift or studying. The browser towns (single-player, Play
together) show no coin store, and say why. The creator's quick start asks for name, pronouns and
gender, why you moved, education and job, and fills the rest with legal values it shows on screen.
**Why:** Four reviews of the restyled build (two players, a UX designer and a game developer)
found the same things: no goal, the best content (work decisions) unplayable, results with no
feedback, and panels covering the town. All of it was data the server already sent.
**Trade-off:** Everything the client shows is still the server's answer; where a number would be a
guess (pay so far) it is labelled an estimate. The nearest fix for a low need points only at places
you've been inside, because `map` doesn't say what each place offers.

## D-066 — Rooms you walk around in: traced from the owner's pictures, positions are the server's and not saved
**Decision:** A place whose interior is in data (`data/interiors/<id>.json`, the `interior` section, checked by
`ContentDatabase`) has a room: the picture's size and the scale of a person in it, the walkable floor (polygons in
the picture's pixels), the furniture standing on it (footprints and heights), the entrance, and its spots (`seat`,
`sofa`, `bed`, `stool` you sit on; `counter`, `station`, `stage`, `fixture`, `door` you stand at), each with where a
person's feet are, which of the picture's four directions they face, a label, and optionally the place's activity
done there, the offers sold or served there (a counter; a seat such as a restaurant table, a salon chair or an
exam bed) or `staff` (a work station). Content is refused unless the place
exists and is enterable, every spot is in the room (counters, stations and fixtures on open floor), ids are unique,
each spot's activity and offers are that place's, every activity and offer of the place has a spot, a stage place
has a stage, and there's a way out (a door with no activity). Twenty-one rooms are traced (all of the owner's
interior pictures so far, the primary picture where there are two). Inside such a place each character has a point in the room and maybe a spot, kept in `World` as
session state like the people stream (`rooms_`), never saved: connecting, loading and coming in put you at the
entrance; leaving, logging off or being taken away frees your spot at once. Three World commands change it:
`move_inside {x, y}` (refusals `not_inside`, `no_room`, `off_floor`: outside the floor or on furniture), `sit
{spot}` (`no_such_spot`, `not_a_seat`, `spot_taken`; sitting where you already sit is fine) and `stand` (onto the
open floor beside the seat). The server sets the position at once; clients animate the walk. An activity, a
purchase, a performance and starting a shift there move you to the nearest free spot that serves it (the
activity's spot, a spot naming that offer, else a counter selling everything, the stage, a staff station); you keep a
spot that already serves
it; when every such spot is held you stand on the open floor next to the nearest one, clear of other people. None
of this adds a refusal to those commands: they work anywhere in the place, as before. `look.here.room` carries the
interior (its geometry, public content like a price) and everyone inside with `{id, at, spot}`; a `room` event
goes to the people inside, at most once a tick and only when something changed (who arrived, moved, sat, stood or
left), like `people`. The web client draws the room from its own copy of the picture (`scripts/client_rooms.py`,
`web/client/rooms/`) in `interior.js`; a place without data or without a picture keeps the scene card.
**Why:** The owner's direction ("you can go inside places") and the interiors pack's plan. Positions inside are
presentation-sized state with a rule that matters (one person a seat), so they live in the World and go through
commands like everything else, and two people asking for one chair are answered one after the other on the
single loop. Not saving them needs no migration and loses nothing anyone would miss: a reload, like a reconnect,
finds you at the door. Putting an activity at its spot without refusing it elsewhere makes the room show what
people are doing without changing a rule every other client and the autopilot already rely on.
**Trade-off:** Walking inside is a teleport the client animates: there is no pathfinding around furniture and no
travel time, so the server never says someone is between two points. The floor and spots are traced by hand from
pictures; a picture that changes needs its data checked again (`scripts/client_rooms.py` refuses a picture whose
size no longer matches its data). Rooms with stools for an activity show one person per stool even though the
activity has no limit; the rest stand beside it.

## D-067 — People are drawn whole, from the owner's model sheets, at real scale
**Decision:** The web client draws every person as a full-body figure instead of a face badge
(the owner: "you should see the entire character too"). `web/client/figures.js` is the one way a
whole person is drawn, on the map and inside buildings: `drawFigure(ctx, person, x, y, {height,
facing, mirror, pose, phase, night, selected, scripted})`, feet at (x, y), `height` being a 1.75 m
person at that spot and everyone at their own height relative to it. The pictures are cut-outs of
the full-body views on the model sheets (`scripts/client_figures.py`: BiRefNet through `rembg`,
offline once its model is downloaded, then a cleaned, colour-decontaminated edge, one scale of
360 px for 1.75 m, the feet found); the client picks the view from the direction someone walks on
screen and mirrors it for the other side, falling back to the nearest view a character has.
Walking is a bob and a sway; sitting lowers the standing figure so its hips meet the seat and clips
it at the seat line, so the furniture drawn in front reads as the seat; `fight` and `flinch` lean,
crouch and bounce or shake the standing figure (a photograph can't raise its fists; the stand-in
body does). On the map people stand at
real scale against the building pictures (which paint their buildings about 2.2 times the sketch's
metres), face their way, carry their name plate and speech above their heads and keep a tap target
of at least 44 px around the whole figure; the zoom goes in to 14 so a person can be seen close up.
Characters with no sheet (made in the creator) are a stand-in body in neutral colours with an
outfit colour picked from the town's palette by id, because the protocol doesn't tell other players
what anyone chose in the creator; the code and the README say it is a stand-in. The faces row,
cards and the phone keep the face crops.
**Why:** The sheets are the approved look of each character; cutting them out shows the owner's art
today, while `scripts/character_prompts.py` (`art/PROMPT_PACK_CHARACTERS.md`) asks for proper
isometric sprite sheets (a walk cycle each way, standing, sitting on a chair and a sofa) to replace
them. One drawing function keeps the map and the interiors consistent.
**Trade-off:** The cut-outs are photographs from eye level, not the town's 30° camera, and nine
founders' sheets are collages with only a walking shot and one from behind, so those founders look
the same from the side as from the front. At real scale a person was about 8 px tall at the
default zoom, a speck under their name, so (like most isometric games) people are drawn larger than
the buildings would make them at the usual zooms: at least 26 px, at most three times real scale,
reaching true scale as you zoom in (`personHeight()` in `render2d.js`); the default zoom moved
closer too (2.8 on a phone, 3.0 wider). A readability choice of the sketch, not anyone's height. A
classical matte (keying out the studio grey) can't cut the collages' lobby backgrounds, hence a
segmentation model; its 224 MB weights are downloaded once and kept outside the repository.

## D-068 — Life events: scenario cards from data, a pure draw at sensible moments, outcomes through the World's rules
**Decision:** `data/events/*.json` holds BitLife-style scenario cards (`core/LifeEvents.cpp`): a prompt in the second
person, `when` conditions read only from what the World knows (outside or in, the type of place or the place, hours,
weekdays, age band, career, single or partnered, money band, fame tier, a pet, children, a record, today's weather,
renting / owning / no home, someone with you of a kind — anyone, someone you know, a stranger, a coworker on shift
with you, your partner, an ex — or a named founder with you), a weight, a cooldown in days, and two to four choices.
Each choice has one outcome, or several with chances adding up to 1 rolled from the saved random stream (D-026). An
outcome applies needs and emotions, your side of the relationship with the person in the event and theirs toward you
(theirs is never shown as numbers: the reply carries a data `reaction`), money only by `Ledger::transfer` to or from
`sys:economy`, an org account, or one resolved when it happens (`employer`, `here`, `landlord`), a memory (type
`life_event`) and fame. The loader refuses unknown keys, conditions, places, careers, founders, stats, accounts,
placeholders (`{name}`, `{founder}`, `{place}` only, and only when the event says who they are) and chances that don't
add up. Up to `life_events.per_day` (2) come up per character and game day, inside `hours` ([8, 23)), at least
`min_gap_minutes` (150) apart, never while one is waiting, never asleep, in a cell, on a bus, studying, in a fight, or
for a character a script plays, and never during a shift unless the event is about work (`when.on_shift`). Slot *k*
of a day opens at a hashed minute of its share of the hours; when it does and the moment is right, the event is a
weighted pure draw (a hash of character, day and slot, as D-037) over the events whose conditions hold right then and
whose cooldown has passed. It reaches the character as `life_event {event, title, category, prompt, choices:[{option,
label, cost_cents?, cost_sure?, pay_with?}], lapses_at, with?, place?}`; what a choice can cost is shown on it, like a
price, and a choice you can't afford is refused (`insufficient_funds`) before anything happens. `event_answer {event,
option}` replies with `outcome` and `changes`; an unanswered event lapses after `lapse_minutes` (360) with
`life_event_lapsed`. The phone app `story` is your own: the events waiting for you and your memories, newest first,
each with your age then. Saved: the character key `events` (what's waiting, the day's count, the last offer, each
event's last day for its cooldown); JSON fields only, no SQL change, as the `work` key; a save without it loads with
none.
**Why:** The owner's new direction, "BitLife meets The Sims meets GTA", needs life to happen to you. Cards that read
only the World's own state can't pretend (a stray dog needs you outside, a coworker's secret needs a coworker on shift
with you), and outcomes through the World's rules keep the ledger zero-sum and a relationship the same record
interactions move. A pure draw keeps the Story app (a read-only view) and the minute step in agreement and keeps
opening the phone from changing anyone's dice; what has come up must be saved, because it waits for an answer.
**Trade-off:** The draw is a function of character and day, not of the world: Dominique's first event on day one is the
same in every new town. A lapsed event still counts toward the day's two and its cooldown. Someone else's feelings move
because of a choice they didn't see, as an interaction's do, by small data amounts.

## D-069 — Street life is played where it happens, with the odds and the ladder shown first
**Decision:** `crimes.json` names the kinds of shop where something can be pocketed (`shoplift_place_types`);
`steal` elsewhere is refused (`cant_steal_here`). A read-only op, `crime_risk {crime, target?}`, gives the chance of
being caught in the act exactly as the crime computes it (its base, plus each witness, each member of staff on shift
there and each officer on duty nearby, at most 95%) from who could see you right now, with `seen_by` counts, and the
consequence ladder from data (fine, time held and where, the longer time if the fine can't be paid, the record,
notoriety, contraband seized); `chance` is null where you aren't where it would happen, so a client says "risky" and
never makes a number up. It also gives a pickpocket's notice chance and cash cap, an assault's report chances and the
injuries a fight can bring, the possession charge for what the Underpass sells, and the bus line's own inspection
chance and fine. An officer on duty is in uniform: `uniform: "police"` on people in `look` and in the `people` stream
(a change of uniform is news). Your own standing is yours to know: `look.you.wanted_for` and `jailed_until`, and the
Record app's `wanted_for`, `jailed_until_minute` and `held_at`. `look.here.offers[].illegal` marks contraband. The web
client puts each crime where it happens (`verbs.js`): Shoplift in a shop that allows it, Pick a pocket and Start a
fight on a person's card, what's sold at an open-air place while it's open (the Underpass after dark), and the
fare-dodge box with the line's odds; each opens the risk card first (`moments.js`), and Back sends nothing. Wanted and
Held are chips under the strip; an arrest brings the cell's card (time left, what you can do), and release a card of
its own.
**Why:** The crime system existed (D-028) but no client could reach most of it, and "a chance you can see coming" was
only true for someone who knew the data. The odds are computed from what anyone in the room could count and from public
content, so showing them gives nothing away; the uniform is the one fact about an officer people can see.
**Trade-off:** The odds are for where you stand now; walking up to someone can change who sees you. The map's officer
badge is drawn over the portrait by the client's overlay, not by the figure renderer, until the figures have a uniform.

## D-070 — Fist fights: the person attacked chooses, the World decides, assault only when a blow lands, and anyone can walk away
**Decision:** `fight {target}` starts a fight with someone within `fights.range_m` (3 m; `core/Fights.cpp`,
`data/society/fights.json`). Refused (stable codes): yourself (`invalid_target`), someone not here
(`target_unavailable`), too far (`too_far`), a child either side (`minor`), someone asleep (`asleep`) or in a cell
(`target_in_jail`, and `in_jail` for you), a place whose type the data rules out (`no_fighting_here`: clinic,
hospital, school, daycare, church, the police station), a founder a script plays while they're at work (`not_now`,
unless `autopilot.at_work`), either of you already in one (`busy`), your own cooldown after starting one
(`cooling_down`, 120 min), their protection after being attacked (`protected`, 480 min), and a second fight between
the same two people in a game day (`too_soon`). The person attacked gets `fight_started` and `window_minutes` (15) to
`fight_respond` with `fight_back`, `run` or `take_it`; no answer means they froze and took it. Someone who has chosen
to always walk away (`fight_prefs {walk_away}`, the You card) and a founder a script plays answer at once: the founder
fights back if its data trait (`competitiveness`) is at least `fight_back_at` (70), otherwise walks away. The World
decides from what neither side can fake: each fighter's score is the data base plus weighted skills and needs, less
`per_injury` for each fight injury already carried, plus noise from the saved stream; running gets away with a chance
from the difference of the scores (clamped). The loser's injury follows the margin (bruises, a black eye, a cracked
rib: conditions diagnosed at once, healing on their own or treated at the clinic or the ER), the winner may be bruised,
needs and emotions move for both, both remember it, the person attacked trusts and likes whoever started it less and
everyone who saw it thinks less of them, and the witnesses start a rumour (the details' gossip). When a blow lands
(fought back, took it, froze, or caught running) it's `assault` (crimes.json) for whoever started it: caught in the act
by the crime's own detection over who saw it (the person attacked aside), else reported by them (`report_chance`) or a
witness (`witness_report_chance` each) and wanted. Fighting back is never a crime. Walking away, a clean break and
getting away mean no blow landed: no injury and no crime, but the relationship damage and the witnesses' view stand.
Everyone present sees `fight` (started, then over, with who won) and both get `fight_result`. Saved: the character key
`street` (walk away, today's fights, the cooldown, the protection); the waiting fight itself is session state.
**Why:** The owner asked for fist fights as part of the street. The person attacked deciding (and a person being able
to opt out entirely) keeps a fight from being something done to a player without a say, and the pair limit, the
cooldown and the protection stop anyone from being harassed. Scoring from stats and the saved stream keeps outcomes on
the server and reproducible; consequences through injuries, relationships, memories, rumours and the crime system mean
nothing new had to be invented to make a fight matter.
**Trade-off:** Walking away is a full opt-out from being hurt: an attacker can't force a fight on someone who chose
not to fight, which is the point. A founder nobody plays can be beaten up and carries the injury into whoever plays it
next. The scuffle on the map is an overlay and floating text until the figures have a fighting pose.

## D-071 — Release 5 builds Talk of the Town the owner's way: open world, chores kept, social media, a faster clock
**Decision:** After the redesign showdown (`docs/proposals/showdown/`), the owner chose Studio Ember's Talk of the Town,
changed: chores stay on screen and playable; the day is not cut into skipped beats; the town map stays open to roam;
the town's story comes back through a social media app, not a newspaper; days move faster than one game minute per
real second; more people live in the town; the phone becomes useful; sitting is drawn from the owner's seated sprite
frames; money follows Ember's cosmetic-only model. The plan is `docs/proposals/talk_of_the_town_build.md`; each piece
gets its own decision entry when it is built.
**Why:** The owner's words. The showdown's panel scored both pitches; the owner picked the deeper one and kept what
they like about today's game (the open map, chores as part of a life).
**Trade-off:** Keeping chores and the full day means a session is longer than either studio proposed; the faster clock
and a speed control are how a phone session still fits.

## D-075 — A faster clock: 2 game minutes per real second, walking at 10 m/s and the bus at 40 m/s
**Decision:** `simulation.minutes_per_real_second` goes from 1 to 2 (a game day is 12 real minutes), with
`walk_speed_mps` 6 → 10 and the bus line's `speed_mps` 24 → 40, all in data. Walking speed rises less than the clock,
so a walk costs a little more game time than before (5 m a game minute instead of 6): crossing town is still part of the
day, not instant. Code that mixed the two units now converts: the autopilot's wait at a closed door is the game minutes
until it opens turned into real seconds (clamped to 1.5–15), and the tests run the town in game minutes at the data's
rate instead of assuming one a second. The people stream's cut margin follows the faster bus (40 m, one capped server
tick), and a cut is renewed 2 m before the viewer could see where it ends, since at 10 m/s a viewer covers the old
margin's slack within a tick. Supersedes D-015's rate; the rate stays data-tunable.
**Why:** The owner said yes to faster days (D-071): a 24-minute day doesn't fit a phone session or a few friends'
evening. Doubling the rate halves the day; raising walk and bus speeds keeps the autopilot's visits and a player's
errands inside the hours places are open.
**Trade-off:** Needs decay per game hour, so they fall twice as fast in real time: a player looks after their character
more often. 10 m/s is a sprint if you think in metres, but the town is drawn small; the walk cycle sells it. The speed
control (1×, 2×, 3× for the single-player and Play together hosts) is a separate step.

## D-076 — Release 5 is Golden Hour, combined with the best of Talk of the Town
**Decision:** The owner now prefers Studio Kinetic's Golden Hour and asked for the two pitches combined as well as
possible. Release 5 follows `docs/proposals/golden_hour_build.md`: Golden Hour's frame ("days are yours, nights are
ours": a live golden hour every evening, Beat Brawl, group moments secretly picked, the close room camera, Heart,
Hustle and Heat, the crew and callouts, an optional day planner, the Golden Hour Pass and Town Pass), with Talk of the
Town's social media as the morning, scenes and secrets, knowledge that sharpens fight tells, story threads, standing
orders and the scene director. The owner's D-071 changes still win where Golden Hour differs: chores stay, the day is
lived hour by hour on the open map (the planner is optional), and the town's story comes through social media, not a
newspaper. Supersedes D-071's choice of studio, not its changes.
**Why:** The owner's words. The showdown's panel had already scored Golden Hour higher (88.5 to 86.5, four votes of
seven) and recommended its frame with six of Ember's ideas; this keeps those six and the owner's own changes.
**Trade-off:** Beat Brawl replaces Square Up, so the fight becomes a timing game played beat by beat; the World judges
each beat, which keeps it fair across phones but asks more of the Play together relay than a three-choice exchange.
The work already in flight (figures, more people, the social app, the clock, rooms) serves both pitches and carries on.
