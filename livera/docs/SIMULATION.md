# Simulation

How the world moves forward, and what is (and isn't) simulated today. Numbers live in
`data/`; this explains the rules that use them.

## Time

- One clock for the whole world, in **game minutes since the epoch** (Year 1, Month 1,
  Day 1, Monday 00:00). A new world starts at 07:00 on day 1 (`start_minute`).
- Calendar: 60-minute hours, 24-hour days, 7-day weeks, **28-day months**, 12-month years
  (DECISIONS.md D-007).
- Rate: `minutes_per_real_second` (default 1.0, so a game day is 24 real minutes).
- The server converts real time into whole game minutes, carrying fractions, and steps
  the world **one minute at a time**. Each step simulates the minute `[now, now+1)`; then
  instants fire (rent on the 1st at 00:00). Per-minute stepping keeps schedules exact: a
  crew working 07:00–16:00 works exactly 540 minutes.
- Day phases: night, dawn (05–07), day (07–18), dusk (18–20). `daylightLevel` gives 0..1
  for lighting.
- Dev servers can skip time (`dev_advance`). Movement is real-time, so a skip doesn't move
  anyone.

## Simulation tiers

| Tier | Who | How |
|---|---|---|
| 1 Active | Characters a player is controlling | Every minute: needs decay, shift costs, emotions relax, stress feedback. |
| 2 Background | Autonomous NPCs near activity (Phase 9) | *Not built.* Planned: hourly ticks, schedule-driven moves between places, no per-minute needs. |
| 3 Dormant / statistical | Characters nobody is playing; the abstract population | No per-minute work. On reconnect, needs and emotions **converge** toward a steady state (`offline_need_target`, emotion baselines) with weight `1 − e^(−hours/8)`: a character who was away three days comes back fed and rested, not dead. City population, jobs and housing are numbers, not agents. |

Things that are world-level, not character-level, run regardless of who is online: rent,
construction, city growth.

## Characters

- **Needs** (data: `simulation.needs`): 0–100, decay per hour. Restored by offers (buying
  food), activities (shower, nap, jog) and social interactions.
- **Emotions**: 0–100, relax toward baselines at `emotion_relax_per_hour`. Interactions and
  purchases push them. Average need below 40 raises stress by up to 6/hour.
- **Personality** and **values**: static, from content. Personality scales how people
  receive interactions; values drive compatibility.

## Relationships

Directional records `A → B` with 11 dimensions (data: `relationship_dimensions`), each
clamped to −100..100.

An interaction (data: `interactions`) applies:
1. `actor_to_target` deltas to A's feelings about B.
2. `target_to_actor` deltas to B's feelings about A, with positive deltas scaled by B's
   **receptivity** (`0.5 + trait/100`; e.g. sociability for a chat, empathy for a deep talk)
   and halved if B **holds a grudge** (a memory about A with impact ≤ −30 and importance ≥ 40).
3. Positive gains saturate: `delta × max(0.1, 1 − current/150)`. Close friendships take work.
4. Needs and emotions for both.

Rules: both must be online and together (same building, or outdoors within `range_m`); a
5-minute cooldown per direction; the actor learns only their own feelings plus a coarse
reaction (warm, polite, guarded, hurt).

**First meeting:** if A and B have never met, both get a `first_meeting` memory and a
**compatibility** score: shared interests (up to 50) + value similarity (up to 50).
Relationships seeded in content get compatibility at founding.

## Memory

Each memory belongs to one character. Two people at the same event remember it
separately and can feel differently about it. Created when:
- two characters meet for the first time (importance 40);
- an interaction's `importance` ≥ `memory_importance_threshold` (25): deep talks, arguments;
- a promotion (importance 70);
- content seeds a backstory memory (`days_ago`).

Memories influence behaviour today through grudges. Planned (Phase 4): memories bias
autonomous choices (who to approach, who to avoid), feed gossip, and fade by importance.

## Economy

- All money moves by `Ledger::transfer`, integer cents, atomic, zero-sum (`sys:economy`
  is the outside world and the only account that can go negative).
- **Income:** shifts. `work start` inside a workplace; `work end` (or leaving the building,
  or logging out) pays `min(hours, max_shift_hours) × hourly` from the employer's account.
  Under `min_paid_minutes` is unpaid. An employer that can't pay triggers a payroll-failure
  notification; the hours still count.
- **Performance:** while on shift the average need is sampled each minute; at shift end
  `performance = 0.7 × performance + 0.3 × shift wellbeing`. Look after yourself and you
  get promoted.
- **Promotion:** `hours_at_level ≥ hours_to_promote` and `performance ≥ min_performance`.
- **Spending:** offers in places, by card (bank) or cash, only while open, never beyond
  your balance.
- **Rent:** charged from the bank on the 1st of each month. A shortfall becomes arrears
  and a notification. (Consequences of arrears come in Phase 5.)

## City growth

- Construction projects (data) progress by `crew_size` worker-hours per hour, only on
  `work_days` within `work_hours`. `look` shows the crew on site while they're working.
- On completion: the opened location becomes usable, `city_effects` are added to city
  stats, everyone is notified, projects with `starts_after` begin.
- City stage follows population thresholds (Founding Town → … → Metropolis).
- **Today crews are abstract:** a count and a schedule, not walking NPCs. Phase 6/9 makes
  them Tier-2 agents who arrive, work and leave, driven by the same project data.
- **Not yet:** secondary effects (a university raising rents, cafés following students).
  The planned model: city stats feed demand curves in data, and demand spawns
  construction projects and moves property values.

## Talking

`say`, `shout` and `whisper` reach whoever the server says can hear: the same building, or
outdoors within `hearing_range_m` / `shout_range_m` / `whisper_range_m` (one listener).
Every line that someone hears gives the speaker and each listener +1 social. Free chat
doesn't change relationship numbers: those move through interactions (chat, compliment,
deep talk...) so the simulation stays predictable and can't be gamed by typing.

## Music

- **Songs** are note data: up to 4 tracks (instruments from data), 16 bars of sixteenth
  notes. Drafts are private and editable; releasing makes a song public and final, notifies
  people who know you, and puts it on the town chart (ranked by plays).
- **Performing** needs a stage (`stage: true` places) that's open. The set lasts the song's
  length (at least 2 game minutes) before you can perform again.
- **Quality** = 35 + 0.55 × music skill + up to 15 for a fuller arrangement (tracks and notes).
- **Audience** (everyone with you; 30 m outdoors): recreation + quality/10, happiness +
  quality/25, excitement + quality/20, familiarity +1 and respect + quality/50 toward the
  performer. A set of quality ≥ 70 becomes a memory (once a day per performer).
- **Skill** grows with practice: +3 per performance (+0.5 per listener, up to +2), +2 per
  release, each scaled by `max(0.1, 1 − skill/120)` so mastery takes time.
- **Tips**: $1–$1,000 from your bank to someone you're with; the tipped person warms to you.

## Body and home

Needs now include **bladder** (use a bathroom or have an accident; people on shift take
breaks), **dental** (brush or risk a toothache) and **grooming** (physical-attraction gains
from your interactions scale from 0.6x to 1.4x with it, plus the style of what you wear).
Weight follows calories: food adds energy (a stated `calories`, or 14 kcal per point of
hunger restored), a base 2,000 kcal a day is burned plus workouts and housework, and 7,700
kcal is a kilogram. A BMI outside 18.5–30 wears on health. Homes have **cleanliness** (a
resident at home makes mess at 1 point an hour; full trash triples it) and **trash**
(cooking adds 15); below 30 a home is unpleasant to be in and food poisoning gets likely.

## Illness and care

Conditions are data (data/health/conditions.json): caught hourly from a base chance
multiplied by risks (a low need, a dirty home), plus contagion per infected person sharing
a space; symptoms apply per hour; most run their course; some last until treated. A
condition you can't feel stays hidden until a test or a checkup finds it. Being ill takes
a share off work and study performance. Care is bought: checkups diagnose, treatment
cures what's diagnosed (or manages what can't be cured), the ER does both, dentists fix
teeth, therapy and antidepressants help depression, rehab treats addiction.

## Away from the game

An offline character's needs converge on a self-care baseline (Tier 3). A character whose
player has been away for `self_care_real_days` (21) is depressed instead: needs converge on
`depressed_need_targets`, mood on `depressed_emotion_targets`, weight drifts down and the
home goes untended. Coming back, depression is a condition like any other.

## Aging

Age = (now − born at) / one calendar year (336 game days; D-032). Birthdays are
notifications and memories. Life stages: baby 0, toddler 1, child 4, teen 13, young adult
18, adult 30, elder 60 (health declines 1.5x), senior 75 (2.5x). Children born in the world
grow taller each birthday and become playable at 18.

## Children

Nobody plays a child (D-033). Each game hour a child is placed (home, daycare, school), their
needs drift toward 70 when someone responsible is around and toward 20 when not, and
unsupervised hours are counted. `supervised` is true when the child is thirteen or older,
at school or daycare, a parent is home (or offline and coping), or the family's nanny is
on shift in the home. Four unsupervised hours in a day (`neglect_report_hours`) bring child
services: the `child_neglect` crime on each parent's record and its fine. Care routines
(`care`) are data: feed, bathe, play, story, homework, bedtime, talk, each for certain
stages, with child and carer effects, a bond and a grade bonus. Daycare charges its fee when
the doors open; no payment, no place that day. School days end with a grade (average needs
plus the day's bonus); at eighteen an average of `diploma_grade` earns the `high_school`
degree, which the bachelor's program now requires. A nanny (`at_employers_home` career) is
hired with an ask the nanny accepts, has a key to the family's home, clocks in there and is
paid from the parent's bank account.

## Substances

A dose applies its effects and starts a high; when it wears off there's a crash.
Dependency rises per use and decays per day; past 50 it's an addiction with withdrawal
symptoms (paused while high), which fades again below 25. Too many uses inside the window
is an overdose: health drops, you're taken to the ER and billed.

## Crime

See DECISIONS.md D-028. Jail time is game time (240 minutes = 4 real minutes).

## Romance and family

See DECISIONS.md D-025 and D-027. Conception: `conception_chance` x fertility by age (1.0
to 35, then 0.6, 0.25, 0.02 from 45) x 0.02 if protected. Miscarriage risk is spread
over the first 84 days (12% before risk factors); drugs and alcohol during pregnancy
(x1.5 each), illness and poor health raise it, prenatal visits lower it.

## Fame

Fame (0–100) grows with performances (quality x audience x 0.002), releases, weddings and
headlines (including arrests), and fades 0.2 a day. Tiers: Resident, Local name (15),
Rising star (35), Celebrity (60), Icon (85).

## Homes

Houses and condos marked `for_sale` are on the market whenever no character owns them, at
their `market_value_cents`; the seller is whoever holds them (the developer at first, the
bank after a foreclosure, the market after a sale). Buying (`buy_home`, in person at the door
or inside) needs the down payment in your bank account (at least `min_down_payment` of the
price; 0 or no amount = the minimum) and, if anything is borrowed, the lender's yes: your
share of all your mortgage payments under `max_payment_share_of_pay` of your monthly pay
(career level hourly x `work_hours_per_month`), or savings after the down payment covering
`reserve_months` of them. The lender must have the cash to lend (a bank selling a home it
foreclosed on lends against it without cash changing hands). The monthly payment is the
standard amortization `P·r / (1 − (1 + r)^−n)` with `r` = annual rate / 12 and `n` =
`term_months`, fixed at purchase; each month's interest is the balance x r, and the last
payment clears the balance.

On the first of the month (`now % kMinutesPerMonth == 0`), right after rent, each mortgage
is due: this month's payment plus any arrears. Owners pay it together, split evenly; whoever
can't pay their share pays what they can and a co-owner covers the rest. If together they
can't pay it all but can pay this month's, they pay that and stay behind. If they can't pay
this month's either, nothing is taken, the payment and `late_fee_cents` are added to the
arrears and the missed count goes up; the schedule moves on regardless, so the balance plus
arrears is what's owed. Catching up (paying everything due) clears the count. At
`missed_payments_to_foreclose` the bank forecloses: it owns the home and lists it for sale,
owners and residents lose it (owners get a memory, stress and sadness), and anyone inside
who no longer has a key steps outside. A day before a payment the owners are warned if
there isn't enough between them. Paying off the last month ends the mortgage.

Rent on a rental is split evenly between its residents; whoever is short is covered by the
others if they can, otherwise each pays their own share and a share that can't be paid is
that person's rent arrears. A home holds `residents_per_bedroom` adults per bedroom (a studio
counts as one bedroom); children don't count.

Moving: buying a home moves you (and children who lived with you) in. `request kind=move_in`
(the inviter must own the home or hold its lease; both at the door or inside) moves your
partner in. Leaving a rental passes the lease to whoever still lives there, or ends it and
the home is vacant for new arrivals. Leaving a home you own keeps you an owner (`move_home`
takes you back). Selling (`sell_home` alone, or `request kind=sell_home` with a co-owner)
pays off the mortgage from the sale and splits the rest evenly; everyone who lived there
moves out. Whoever is left behind is told. Without a home you can still play (work, go out,
see people); home activities (shower, nap, cooking, housework) need a home to go to, and the
replies and the phone say so.

Children follow the parent they lived with (their `homeProperty` in `createdCharacters`): when
that parent moves, so do they, unless their other parent stays on in the old home. A parent
who leaves with nowhere to go sends them to the other parent's home if there is one. A child
inside the old home is moved into the new one at once; otherwise their hourly routine takes
them there. Care routines, supervision and the nanny's shift happen at the family's current
home, and the nanny's key is to the home their employer lives in now.

Access: residents and owners have a key (an owner who moved out can still let themselves
in); a resident's partner can come over; a child has a key to the family home while a parent
lives there; the family's nanny has a key to the employer's current home.

## Work decisions

- **When:** only while on shift (a nanny on shift in the family's home gets nanny
  decisions). Up to `per_day` a game day, from the character's career bank. A career with
  no decisions in the bank works exactly as before.
- **The draw:** the least-shown decisions first, ties broken by a hash of (character, day,
  task); never the previous work day's exact set when the bank has more. Stored when the
  player first looks (or the hourly step runs while they're on shift), so it is fixed for
  the day. Options are shown in a per-day shuffled order; `option` in an answer is the
  index in that order.
- **An answer:** once per decision per day, only today's. Performance changes at once by
  `worst + (best − worst) × score`, clamped 0–100. `hours_at_level` gains `score ×
  bonus_hours_per_point`. The reply says whether it was the best call, the reason for the
  option chosen, and the best option with its reason. At the end of the shift performance
  is blended with the shift's wellbeing as it always has been (70% kept), so a call's
  effect carries forward like any other performance: a best call's +6 is a lasting +4.2
  after that shift.
- **Promotion:** unchanged and still at `endShift`. The decision hours are part of
  `hours_at_level`, so a character who answers well reaches `hours_to_promote` sooner. The
  bonus earned toward the current title is shown separately in the phone, and starts again
  at zero after a promotion or a new job.
- **End of shift:** the reply lists the shift's decisions (`decisions`), the promotion
  hours they earned (`decision_bonus_hours`) and how many were the best call. A shift too
  short to be paid takes its decisions' promotion hours back (performance changes stay).
- **Midnight:** unanswered decisions lapse; no penalty. A shift that runs past midnight
  gets the new day's decisions, and its report covers both days.
- **Reminder:** once a day, an hourly check tells an on-shift player how many decisions
  are waiting, unless they've already looked.
- **Offline characters** don't make decisions; their routine doesn't include shifts.
- **Restarts:** a clean shutdown ends every shift (and reports it) before the last save. A
  crash after an autosave loses the shift in progress, as it always has for pay; the calls
  made in it keep their effects and stay made for the day. On load they are marked
  reported (nothing is left to report them), so a new shift, even one starting in the
  same game minute, reports only its own calls.

## Phones, coins and LivPay

See the DECISIONS entries above.

- **Phones.** Battery is 0–100, stepped once a game hour for every character:
  `+100 / charge_hours` at a charger (or offline), `−100 / battery_hours` online away from one.
  Someone who logged in partway through the hour charges for the part they were away and
  drains for the rest. The hour's location decides: where you are at the top of the hour is
  where the phone spent it. A notification at the low-battery threshold (20%) and when it dies
  (online players only). Models: Lyra One 40 h / 3 h (issued free; $199 at Circuit
  Electronics), Lyra Air 60 h / 2.5 h ($499), Lyra Pro 80 h / 2 h ($1,099), Lyra Pro Gold
  Edition 80 h / 2 h (3,000 coins). Cases (clear $19.99; marble, glitter 150 coins; gold-leaf
  400 coins) are cosmetic and move with you when you switch phones. Spare phones keep the
  charge they had when put away. Children have no phone; one is issued at 18.
- **Coins.** Packs: 100 coins $0.99, 550 $4.99, 1,200 $9.99, 2,500 $19.99, 6,500 $49.99.
  The coin shop (phone app `store`, usable anywhere) delivers to your inventory: designer
  outfits (Atelier Nuit couture gown, Midnight couture suit, a velour tracksuit), Riviera
  designer sunglasses, a Meridian luxury chronograph, the Lyra Pro Gold Edition, phone cases.
  Coin outfits match the best dollar outfits in style; they never exceed them.
- **LivPay.** Tap to pay in any shop and on the bus; send money bank to bank. Daily limits
  reset at midnight (game time). The wallet app shows cash, bank and coin balances, the phone
  (model, battery, hours left, where it's charging, case), spare phones, LivPay's limits and
  recent activity (from the ledger), your coin purchases, the coin packs with prices, and
  whether coins can actually be bought on this server.

## Dates, the lake park and the town league

**Dates.** `leisure.date_spots` lists `{place, offer | activity, memory}`. After a purchase
(`buy`) or an activity (`activity`) that matches, every online partner of yours whose current
place is the same place (same building, or inside the same outdoor place) and whose
relationship status with you is in `date.statuses` (dating, engaged, married), and who is not
family, shares a date: both of you get `date.relationship` (+4 romantic attraction, +3
familiarity, both ways, saturating like every relationship gain), `date.emotions` (+6
happiness, −5 loneliness), and a `date` memory (importance 45, impact +40) about the other.
A couple can have one date per place per game day (`"a|b|place"` → day in the world part);
dinner and then dessert is one date, dinner and then the cinema is two. The partner only has
to be there; they don't have to buy anything.

**Activity hours.** `leisure.activity_hours` limits an activity to some hours even where the
place never closes: stargazing at Willow Lake is 20:00–02:00 (`not_now` otherwise).

**Practice.** `leisure.practice` lists activities that train skills: soccer practice at
Riverside Field and drills at Riverside Court (energy −15/−12, hygiene −20/−15, 450/380 kcal)
grow `athletics` by 2 per session, less the better you are (`2 × max(0.1, 1 − skill/120)`,
the same curve as music). A coach (a `coach_careers` career) on shift at the venue makes it
count 50% more.

**The league.** Soccer: Livéra Lions (52) and Riverside Rovers (48), Saturdays 15:00 at
Riverside Field, two hours, eleven a side. Basketball: Founders Five (50) and River City
Hoops (50), Wednesdays 18:00 at Riverside Court, one hour, five a side. Fixtures rotate by the
circle method (every pairing once per round, home and away swapped the next round; an odd
team out sits the week out); with two teams per sport, home alternates weekly. An hour before
kickoff every member of both teams is told. At kickoff (the hourly step on the match hour):

- Lineup: online members standing at the venue, best first, up to the sport's `lineup`.
- Player value: `(base 4 + athletics × 0.2) × (0.5 + 0.5 × energy/100)`.
- Strength: team strength + player values + `luck × roll()` (luck 12). Fixed at kickoff.

At full time (the first hourly step at or after kickoff + duration), with `share` = a side's
strength / both sides' strength, a side's expected score is
`per_team × (1 + sensitivity × (2 × share − 1))`: soccer 1.4 goals and sensitivity 1, drawn
from a Poisson distribution; basketball 68 points and sensitivity 0.4, normal with a 9-point
standard deviation. A level basketball game gets up to three overtime periods (10% of a game
each), then a last free throw to the stronger side by chance. Points: soccer 3/1/0, basketball
2 for a win and 1 for a loss (FIBA style). The table keeps played, won, drawn, lost, for,
against and points.

- Lineup players still at the venue at full time: −25 energy, −30 hygiene, +20 recreation,
  +10 social, 700 kcal, athletics +3 (same curve), fame +0.6 for a win / +0.3 draw / +0.15
  loss, win/draw/loss emotions, a public `match` memory, and a notification. A lineup player
  who left before the whistle still counted for their side's strength but gets nothing for it.
- Everyone else at the venue (spectators, and members who turned up but didn't make the
  lineup) gets +10 excitement, +5 happiness, +20 recreation, +8 social. Watching is free.
- Every member of both teams hears the result; everyone at the venue gets the `match` event
  at kickoff and full time.

The latest 20 results are kept (`results_kept`); matches in play are saved and finish after a
restart.

**Workplaces.** Coaching (`works_outdoors`) clocks in at Riverside Clubhouse and keeps
working out on the field and court; restaurant staff clock in at Lumière, whose doors they can
use before it opens (the existing workplace rule).

## Pets
Species in data: dog ($250), cat ($150), rabbit ($80), each with needs per hour, life stages by
age in months (needs and illness multipliers), names and breeds. The shelter lists four animals
a week (a weekly intake of twelve, so an adopted animal's place on show is taken by the next).
`adopt` (in person, open hours 10–18, you need a home, at most three pets per home) pays the
fee to `org:paws_whiskers`, starts the bond at 10 and includes vaccines for a year. Care
(`pet`): feed (uses one `pet_food`), play, cuddle, groom at home; walk (dogs) outdoors within
250 m of home, which also gives you recreation and burns calories. Each has a cooldown, moves
the pet's needs and yours, and grows the bond. A bonded pet (40+) lowers your loneliness while
you're home with it. Hourly: needs decay (an online owner) or settle at 70 (an offline owner's
routine); a pet falls ill with a small hourly chance (three times as likely with a need under
25, half as likely vaccinated); below 20 health the household is warned; hunger at 0 for a day
or health at 0 means animal control. The vet (`vet`): checkup ($65, finds illness), vaccines
($90), treatment ($180, cures), paid from your bank or cash; vets on shift earn a share.

## Medicine
Over the counter at Riverdale Pharmacy: painkillers, cold & flu, allergy relief, antacid, sleep
aid, vitamins. Prescription: antibiotics (strep throat; 2 fills, 28 days), antivirals (flu; 1
fill, 14 days), antidepressants (depression; 3 fills, 84 days). New conditions: seasonal
allergies, heartburn, insomnia, strep throat. A checkup that diagnoses a condition writes the
matching prescription; each purchase uses a fill; without a valid one the pharmacy refuses.
Taking medicine counts doses over 24 hours: at the limit you're warned; over it you lose health
(25 by default, more for painkillers), and two over, or health under 15, is an ER visit (a bill
of up to $450, a memory). A sleep aid within four hours of a drink is an emergency.

## Accidents
When the bladder reaches 0 (people on shift take breaks, so it never happens on shift), you wet
yourself. You: hygiene 0; embarrassment +100, confidence −40, happiness −30, stress +30; the
"humiliated" condition (60–84 h: social −1/h, embarrassment +3/h, confidence −1/h, a 10%
performance penalty); a memory (importance 90, impact −85); your outfit is ruined. Everyone
present (inside the same place, or within 40 m outdoors): a "saw_accident" memory, embarrassment
+10, and respect −10, physical and romantic attraction −10 each toward you (a partner: respect
−12, attractions −20). If anyone saw, a rumour runs for 24 game hours: each hour, each person
who knows may tell each close friend (friendship 50+) who hasn't heard, with a 15% chance; the
friend gets a "heard_gossip" memory and respect −5, physical attraction −3. Fame 60+: fame −5,
everyone who knows you respect −3, and a news notification to everyone online. While
humiliated, wearing ruined clothes or dirty clothes, social interactions land worse
(× 0.6, × 0.7, × 0.9).

## Clothes and laundry
Each hour you're online, your outfit gains a worn hour. At 16 it's dirty: hygiene −1.5/h and it
no longer counts for style. A ruined outfit counts for no style and caps hygiene at 50. `laundry`
washes everything you've worn: at home (energy −5, the home's trash +5) or at Suds & Spin (6–23,
$8 to `org:suds_spin`, social +3). The items app shows each outfit's condition (clean, dirty,
ruined).

## Weather
Each season (by month) has temperatures and chances for sun, cloud, rain, storm and snow
(winter is −4 to 6 °C, 28% snow). The world keeps today's weather and tomorrow's forecast; at
06:00 the forecast becomes today and a new one is rolled. Online players are warned on rain,
storm or snow days (and told if they have no umbrella). Outdoors, per hour: rain hygiene −6,
comfort −8, happiness −3, stress +2; storms worse; snow comfort −8, energy −2. An umbrella
stops rain and snow and halves a storm. Phone app `weather`.

## Birthdays
On a birthday, everyone whose friendship toward you is 40+ is told. A birthday cake given on the
day: the receiver gains happiness, excitement and less loneliness, friendship +8 toward the
giver (+4 the other way), and both remember it. On other days a cake is just a gift.

## Hangovers
Every alcoholic drink is counted. At 06:00, three or more in the previous 20 hours mean a
hangover (5–6 h: energy, comfort and happiness down, a 20% performance penalty; painkillers
shorten it, see pets and medicine).
