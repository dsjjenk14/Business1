# Work decisions (M0.8, lane `work`)

The product owner asked: "When you go to work you can just be inactive or you can answer 3
job related questions, like for Dominique it would be choosing who to hire out of 3/4
different people for a role each work day, and you get promoted faster that way."

On shift, a character gets up to three job decisions a day from their career's bank
(`data/careers/work_tasks.json`: 186 decisions across all 30 careers; Dominique's
recruiting career has 12, every one a hiring call between three or four candidates). Each
answer moves performance at once and adds promotion hours in proportion to how good the
call was. Promotion still happens when the shift ends, by the same rule as before, so good
calls get you there sooner. Ignoring them costs nothing: the shift pays and counts exactly
as it always did.

**Redesign update (R2.3, D-060):** four decisions a day, and they come up through the shift instead of all at
clock-in: the first when the shift starts (or at midnight, on a shift that crosses it) and one more every
`spacing_minutes` (150), each announced to the worker with a `work_decision` event. A decision answered on an
earlier shift the same day stays up as a result, and the next shift starts with the next one. One that hasn't
come up can't be answered (`not_yet`). The decision bonus is 2.0 hours per point.

Code: `src/core/WorkTasks.cpp` (content, draw, commands, phone app, hourly step, save),
one call in `World::endShift`, the `m08:work` blocks in `World.h`, `Content.h`,
`World.cpp` (on load), `Server.cpp` and `cli_main.cpp`. Tests: `tests/test_work.cpp` (14
tests, one over the network).

---

## 1. DECISIONS entries

## Work decisions speed up promotion; they never replace the shift
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

## Work decision scores stay on the server; the day's draw is a pure function
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

---

## 2. SIMULATION.md section

## Work decisions

- **When:** only while on shift (a nanny on shift in the family's home gets nanny
  decisions). Up to `per_day` a game day, from the character's career bank. A career with
  no decisions in the bank works exactly as before.
- **The draw:** the least-shown decisions first, ties broken by a hash of (character, day,
  task); never the previous work day's exact set when the bank has more. Stored when a
  shift starts or the player first looks (or the hourly step runs while they're on shift),
  so it is fixed for the day. Since the redesign the day's decisions come up one at a time
  through the shift (`spacing_minutes`), each with a `work_decision` event. Options are shown in a per-day shuffled order; `option` in an answer is the
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

---

## 3. DATA_MODEL rows

Content (`data/careers/work_tasks.json`):

| Section | Shape (abridged) | Notes |
|---|---|---|
| `work_tasks` | `[{career, tasks[] {id, prompt, options[] {label, detail?, score, why}}}]` | M0.8. Career ids must exist; task ids unique across all careers; 3–4 options with distinct labels; scores in [0, 1] with exactly one scoring 1 (the best call); every option has a `why`. A career may have any number of decisions, including none. May appear in several files (they add up). |
| `work_decisions` | `per_day, spacing_minutes, performance_best, performance_worst, bonus_hours_per_point` | M0.8. At most one; defaults 3, 0, +6, −4, 1.5 (the data now says 4, 150, +6, −4, 2.0). `per_day` 1–10; `spacing_minutes` 0–1440 (0 = all at once); `performance_best ≥ performance_worst`; bonus ≥ 0. |

State (character JSON, key `work`; no world part, no migration; a save without it loads with
no decisions made):

| Field | Meaning |
|---|---|
| `work.day`, `work.career`, `work.tasks[]` | The game day (day index) and career today's decisions were drawn for, in the order shown. |
| `work.answers[] {task, option, score, performance_change, bonus_hours, at, day, reported}` | Today's answers (and, until it ends, the current shift's). `option` is the index in the bank, not the shown order. `reported`: already in a shift report (missing in older saves: false; every answer of an off-shift character is settled to true on load). |
| `work.drawn {task: n}` | How many days each decision has come up, so the days cycle through the bank. |
| `work.nudged_day` | The day the phone last reminded them. |
| `work.bonus {career, level, hours}` | Decision hours earned toward the current title (shown in the phone). |
| `work.answered_total`, `work.best_total` | Lifetime counts. |

The world part `work` is an empty object (no world-wide state).

---

## 4. ROADMAP bullet

- **Work decisions:** on shift, up to three job decisions a day from the career's bank (186
  across all 30 careers; Dominique's are hiring calls). Good calls raise performance and add
  promotion hours, so attentive players are promoted sooner; idling pays and counts as
  before. Phone app `work`, ops `work_tasks` / `work_answer`, CLI `tasks` / `decide`.

---

## 5. Protocol ops and CLI commands

| Op | Arguments | Reply / refusals |
|---|---|---|
| `work_tasks` | none | `{career, title, performance, hours_at_level, decision_bonus_hours, next_title, hours_to_promote, hours_left, min_performance, per_day, spacing_minutes, open, upcoming, next_at, next_in_minutes, note, decisions[] {task, prompt, options[] {option, label, detail?}, answered, ...outcome when answered}}`. `decisions` are the ones that have come up; `open` how many of them are unanswered; `upcoming` how many more come up this shift if it runs long enough; `next_at` the game minute the next one does (null when none). Refusals: `not_playing`, `no_career`, `not_working`. |
| `work_answer` | `task` (a task id from `work_tasks`), `option` (integer: the option's index in the order sent) | `{task, best_call, you_chose {option, label, why}, best {option, label, why}, performance_change, bonus_hours, open, upcoming, next_at, ...progress}`. Refusals: `bad_request` (no integer `option`), `no_career`, `not_working`, `unknown_task`, `not_today` (a real decision, but not one of today's), `already_answered`, `not_yet` (one of today's that hasn't come up), `unknown_option`. |
| `phone` `{app: "work"}` | | Progress as above plus `on_shift, decisions[], open, upcoming, next_at, answered_today, decisions_answered, best_calls, note`. On shift: the decisions that have come up; off shift: only the answered ones with their results, `open` 0 and `upcoming` the ones still to come today. |
| `work` `{action: "end"}` | (existing) | Now also `decisions[] {task, prompt, you_chose, best_call, performance_change, bonus_hours}`, `decision_bonus_hours`, `best_calls`, and `decisions_note` when a too-short shift took the hours back. |

A notification of kind `career` ("1 decision is waiting for you at work today…") goes
out once a day to an on-shift player who hasn't looked yet.

Event `work_decision` (to the worker only), when a decision comes up:
`{"task": "recruiting_vet_tech", "prompt": "...", "open": 1, "upcoming": 2, "next_at": 121830}`.

CLI:

```
tasks                     today's decisions at work, with numbered options
decide TASK OPTION        make a call: TASK is its number in `tasks` (or its id), OPTION the option's number
phone work                performance, hours toward your next title, today's results
```

The CLI numbers options from 1; the protocol's `option` is 0-based.

---

## 6. What is NOT done

- **Data:** the bank was written separately and copied into `data/careers/work_tasks.json`
  as is; the validator accepted all 186 tasks, so nothing in it was changed. Twelve hiring decisions for
  recruiting and six for every other career means a daily player sees each decision again
  after two to four work days (in a new combination and option order). More decisions are a
  data change.
- **Same decisions at every level:** a Barista and a Café Manager get the same bank. There's
  no per-level difficulty or level-gated decisions yet.
- **The CLI's `work end` line** doesn't print the shift's decisions or bonus (the reply has
  them; that printer is shared code outside this lane). Use `phone work` or `tasks`.
- **Pacing counts from the shift's start:** a decision comes up every `spacing_minutes` of the shift you're on;
  minutes on an earlier shift that day don't carry over (that shift's calls stay made).
- **Offline characters and NPCs** make no decisions (away pay for scheduled work never includes them, D-063).
- **No consequences beyond performance and promotion hours:** a bad hire doesn't come back
  as a bad employee, an upset customer doesn't leave a review, and no money changes hands.
- **Only the player answers:** nobody else sees or reacts to a character's calls; there is
  no manager or colleague in the loop.
- **Rendering:** no UI beyond the protocol, the phone app view and the CLI (M1).
