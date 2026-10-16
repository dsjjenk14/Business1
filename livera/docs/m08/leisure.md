# M0.8 — Leisure: sports teams and fields, date spots, Willow Lake Park

The product owner asked: "Add sports teams and sports fields and add date spots a park."

Code: `src/core/Leisure.cpp` (and the `m08:leisure` blocks). Data: `data/leisure/sports.json`
(the league, dates, activity hours, practice) and `data/world/leisure_places.json` (the places,
their offers and activities). Tests: `tests/test_leisure.cpp` (16 tests, including a save/load
round trip through SQLite and a server-level test over the network; clean under ASan/UBSan).

What a player can do now:

- **Take someone out.** Lumière Bistro (17:00–23:00: dinner, dessert, wine), the Starlight
  Cinema (12:00–24:00: a movie, popcorn) and Willow Lake Park (outdoors, always open: rent a
  rowboat, a picnic basket from the boathouse, walk the boardwalk, stargaze from 20:00 to 02:00).
  With your partner there with you, dinner, dessert, wine, the movie, the rowboat, the picnic,
  the boardwalk and the stars count as a date.
- **Play for a town team.** Sign up at Riverside Clubhouse (or at the team's field or court),
  practice at the venue to build `athletics`, and be there at kickoff: the server plays the
  match with whoever turned up. Or just come and watch.
- **Work there.** Coaches clock in at the clubhouse and work out on the field and court; staff
  at Lumière clock in before the doors open.

## 1. DECISIONS entry

## Dates count, and the town league plays itself
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

## 2. SIMULATION.md section

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

## 3. DATA_MODEL rows

Content (`data/leisure/sports.json`):

| Section | Fields | Notes |
|---|---|---|
| `leisure` | `league_account, clubhouse, league_fee_cents, skill, coach_careers[], coached_practice_bonus, luck, results_kept, player{base, skill_weight, energy_need, min_energy_factor}, match{player_needs{}, player_calories, skill_gain, fame_win, fame_draw, fame_loss, win_emotions{}, draw_emotions{}, loss_emotions{}, spectator_emotions{}, spectator_needs{}}, date{statuses[], relationship{}, emotions{}, importance, impact}, date_spots[] {place, offer \| activity, memory}, activity_hours[] {place, activity, hours[from, to]}, practice[] {place, activity, skills{}}, sports[] {id, name, venue, match_day, match_hour, duration_minutes, lineup, scoring{model: goals\|points, per_team, sensitivity, noise, max, draws, overtime_fraction}, points{win, draw, loss}}, teams[] {id, name, sport, strength}` | M0.8. Validated: accounts, places, offers and activities exist; stat names are declared; venues are outdoor places; every sport has two or more teams; two sports at one venue can't overlap. |
| `simulation.skills` | gains `athletics` | |
| `locations` (leisure_places.json) | Willow Lake Park gains `revenue_account: org:willow_lake_boathouse`, offers and activities; Lumière, the Starlight, the field, the court and the clubhouse gain offers/activities | New org account `org:willow_lake_boathouse`. No new location fields. |

Runtime state:

| Record | Fields |
|---|---|
| `CharacterState` | gains `leisureTeams[]` (team ids, one per sport), `leisureMatchesPlayed`, `leisureMatchesWon` |
| `WorldState` | gains `leisureStandings` (team → played, won, drawn, lost, scored, conceded, points), `leisureMatches[]` (id, sport, home, away, kickoff, ends at, home/away lineup, home/away strength, finished, home/away score, overtime; in play plus the latest results), `leisureDates` (`"a\|b\|place"` → game day of the last date there) |

Save format (no new SQL; schema v4 world parts):

| Where | Key | Contents |
|---|---|---|
| character JSON | `leisure` | `{teams[], matches_played, matches_won}`; missing = no teams |
| `world_parts` row | `leisure` | `{standings{team: {played, won, drawn, lost, for, against, points}}, matches[] {id, sport, home, away, kickoff, ends_at, home_lineup[], away_lineup[], home_strength, away_strength, finished, home_score, away_score, overtime}, dates{"a\|b\|place": day}}`; missing = empty table, no matches, no dates |

Teams removed from content since a save are dropped from characters on load; matches whose
sport or teams are gone are dropped at the next hourly step.

## 4. ROADMAP bullet

- **Leisure:** date spots (Lumière Bistro, the Starlight Cinema, Willow Lake Park with
  rowboats, picnics, the boardwalk and stargazing after dark); doing them with your partner
  counts as a date, once per place per day. A town league (soccer at Riverside Field,
  basketball at Riverside Court) played by the server each week from the teams' rosters and
  the members who turn up; practice builds `athletics`; standings, results and rosters in the
  `sports` app; coaching and restaurant jobs at the clubhouse and Lumière.

## 5. Protocol ops and CLI

Ops (all validated by `World`; errors are `{code, message}`):

| Op | Arguments | Reply | Refusals |
|---|---|---|---|
| `join_team` | `team` | `{team, name, sport, fee_cents, tx, balance_cents, next_kickoff, next_kickoff_text, venue}` | `unknown_team`, `already_on_team`, `one_team_per_sport`, `wrong_place` (not at the clubhouse or the team's venue), `closed` (the league office, 07:00–22:00), `insufficient_funds`, `in_jail`, `not_in_world` |
| `leave_team` | `team` | `{left, name}` | `unknown_team`, `not_on_team`, `not_in_world` |
| `phone` | `app: "sports"` | `{sports[] {id, name, venue, venue_name, match_day, match_hour, duration_minutes, teams[] {id, name, members[] (names only)}, table[] {team, name, played, won, drawn, lost, for, against, points}, next{kickoff, when, fixtures[] {home, home_name, away, away_name}}}, your_teams[] {id, name, sport, venue, next_kickoff, when, opponent}, in_play[], results[] (newest first), you{athletics, matches_played, matches_won}, league{fee_cents, sign_up_at}}` | |
| `buy`, `activity` | unchanged | replies gain `dates[] {with, name, counted, memory \| note}` at a date spot with a partner there; `activity` gains `skills{athletics}` and `coached_by` for practice | `activity` gains `not_now` (outside an activity's hours) |

Events: `match` `{status: kickoff | full_time, match, sport, venue, home, home_name, away,
away_name, kickoff, kickoff_text, home_players[], away_players[], finished, home_score,
away_score, overtime | full_time_at}` to people at the venue (and at full time to both teams'
members); `date` `{with, place, memory}` to the partner. Notifications of kind `sports` (team
news, the reminder an hour before kickoff, kickoff, results) and `romance` ("That was a date:
Dinner at Lumière with Dax.").

CLI (`help` lists them):

- `team join TEAM`, `team leave TEAM`
- `phone sports`
- `do practice_soccer` (Riverside Field), `do practice_basketball` (Riverside Court),
  `do locker_shower` (the clubhouse), `do boardwalk_walk`, `do stargazing` (Willow Lake Park)
- `buy dinner | dessert | wine` (Lumière), `buy movie_ticket | popcorn` (the Starlight),
  `buy rowboat | picnic` (Willow Lake), `buy sports_drink` (the clubhouse)

Edits outside this feature's blocks: `World::buy` (one call to `leisureAfterPurchase`),
`World::useActivity` (one call to `leisureActivity` before the activity takes effect, and one
line merging its reply), `data/config/simulation.json` (`athletics`).

## 6. What is NOT done

- **No seasons.** The table accumulates for ever: no season end, champions, playoffs, trophies
  for the clubhouse shelf, or promotion. Fixtures repeat week after week.
- **Matches are resolved, not played out.** Strength is fixed at kickoff and the score is
  drawn at full time; there is no live score, play-by-play, positions, tactics, substitutions
  or injuries. `in_play` shows the lineups only.
- **Town rosters are a number.** A team's non-player roster is its `strength`, not simulated
  townsfolk. Founding characters nobody is playing never join or play (offline characters
  are never at a venue).
- **Bench.** If more members turn up than a side fields, the extras are treated as spectators.
- **One venue per sport.** With more than three teams in a sport, two matches would share the
  same field at the same hour (and spectators there would get both matches' effects). The
  data has two teams per sport, so one match per sport per week.
- **Result timing.** Results arrive at the first hourly step after kickoff + duration; the
  data uses whole hours so they arrive on time.
- **The league fee** is a one-time sign-up fee paid from your bank account (no cash, no dues,
  no refund when you leave). There's no age limit beyond who can be played (adults).
- **Coaches** aren't attached to teams and don't affect matches; their effect is the practice
  bonus at a venue while on shift.
- **Dates** need the partner to be online and at the same place; there's no date planning or
  invitation (the existing `ask date` is asking someone out), no jealousy if your partner sees
  you on a date with someone else, and no extra effect from what you bought for them.
- **Athletics** only matters for team strength; it doesn't affect the gym, health, looks or
  anything else yet.
- **CLI output.** The `buy` printout is shared code: a date shows up through the "That was a
  date" notification; `match` and `date` events print as raw JSON through the CLI's generic
  event printer.
- **The demo slice** (`scripts/demo/*.txt`, not this feature's files) doesn't exercise
  leisure; the tests and a scripted CLI run do.
