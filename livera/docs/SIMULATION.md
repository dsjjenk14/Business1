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

Age = (now − born at) / `game_days_per_year`. Birthdays are notifications and memories.
Life stages: baby 0, toddler 1, child 4, teen 13, young adult 18, adult 30, elder 60
(health declines 1.5x), senior 75 (2.5x). Children born in the world become playable at 18.

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
