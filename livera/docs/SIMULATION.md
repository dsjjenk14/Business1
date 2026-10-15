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
