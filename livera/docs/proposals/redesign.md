# Redesign: easier, more playable, more appealing (product spec)

The owner asked for the game to be easier to use, more functional and more appealing, with five
people able to play in one town, reviewed by a UX designer/engineer, two gamers, a game developer
and a software engineer, with a product manager deciding what to build. This page is that
decision. It is built from four reviews of the October 2026 build (the golden-hour restyle with
46 building pictures):

- a casual phone player (three sessions, about 29 minutes),
- a systems-and-social desktop player,
- a UX designer and engineer (119 screenshots at four sizes, with mockups),
- a game developer (a full work day played, plus headless runs of the core over many game days).

The full reports and screenshots were working files of that review; what they found that matters
is below. Nothing here changes the rules in `CLAUDE.md`: the server decides every outcome, the
client only sees what its character may know, and nothing pretends.

## What all four reviews found

1. **Nobody tells you what to do.** The game knows your shift starts at 08:30 at Meridian, that
   three work decisions are waiting, that rent is due Monday, and which life goals you picked in
   the creator. None of it reaches the screen except as raw fields in phone apps. A player left
   alone for 14 game hours skipped work and wet herself without a warning.
2. **The best content can't be played.** Work decisions (186 hiring calls and café crises) show
   as an unreadable dump ending in a command-line hint; there are no buttons. 31 of the 51
   in-world operations have no UI at all (apply for a job, join a team, adopt a pet, buy a home,
   laundry, perform). 19 of the 26 phone apps print developer data that wraps a letter per line.
3. **Actions give no feedback.** The server replies with the new need values, the other person's
   reaction, first meetings, performance and promotions; the client says "done." Payday is two
   identical toasts; the "On shift" badge lags a step; results vanish after 3.5 s with no log.
4. **The screen hides the town.** With a card open, 7–12% of a phone screen is map. Two permanent
   notes and an always-open chat bar take about 200 px; the chat bar covered a bus destination
   and sent a player to the wrong stop. Only the building you stand next to is labelled.
5. **Time is spent waiting.** A shift is 10 minutes of a still screen; a night is 8 minutes with
   nothing to do (there is no Sleep); every need refills in seconds of tapping, so needs are a
   tap-tax rather than a choice.
6. **The town feels empty in single-player.** Autopilot founders never talk to you or answer;
   places say "Nobody else is here" even at the café at 16:30.
7. **Friends can't share a town yet.** On an always-on server the 1:1 clock runs about 60 game
   days per real day: a player who works one shift a day falls behind on rent by real day 5 and
   ages a game year in under a week. "Play together" in the browser isn't built (D-056).

What to keep, by the same reviews: the look (emerald and gold, the night map, the building
pictures, the founders' portraits and one-liners), the honest wording ("Nobody heard you",
"played by a script"), walking to the door then acting, the always-visible Exit, the bus ride, the
ask card with its expiry, save and continue, the BitLife-style writing, 44 px targets, 16 px inputs
and no sideways scroll.

## Decisions

The order is the order of building. Each item names who owns it and the check that proves it.

### Release 1: make the game playable (client first, small server additions)

**R1.1 Work Desk.** Decisions become cards: the prompt, each option as a large button sending the
existing `work_answer`, then the server's verdict ("Best call" or the better choice, the reason,
the performance change, hours toward the next title). On shift, a strip shows time worked, an
estimate of pay so far labelled "estimate, paid at End shift", and decisions waiting. One shift
button, Start or End, refreshed after the reply.

**R1.2 Feedback.** Every reply the server already sends is shown: "Took a shower · Hygiene 85 →
100", the reaction word over the other person, "You met Andre", a pay stub in place of the two
toasts, a promotion banner that stays until tapped, a dimmed activity button with "again in about
40 min". Results and refusals go into an Activity log beside the Speech log. Refusals read as
plain sentences with a next step ("Heritage Coffee is closed. It opens at 06:00.").
Server additions, read-only and public: per activity and offer, the need effects and when it is
ready again (`look`); opening hours per place (`map`); home and workplace names in `characters`.

**R1.3 Next and Today.** A "Next" card under the map built only from the character's own data:
a need below 20, "Start your shift" at your workplace, decisions waiting, the next routine entry
within three hours with [Go] when it names a real place, a bill due within three days. Each line
names its source ("From your Calendar"). Today lists the day's routine.

**R1.4 Map-first layout.** A 44 px status strip (clock, money); need chips only below 35, with
numbers; one attribution line for the sketch and single-player notes (the full sentences stay in
the page and in the menu); a bottom bar: Places, Talk, a context button (Stop while walking or
riding, Exit inside, Go to the Next target), Phone, You. Chat docks above the bar when Talk is open
(always docked on desktop). A "doing now" pill with Stop. Cards get three heights (peek, half,
full). Desktop and tablet get a left column. One SVG icon set replaces the look-alike glyphs.

**R1.5 Finding places and people.** A Places sheet with search and categories, open or closed and
distance; your home, your workplace, the Next target and open everyday places always labelled;
the whole-town view fitted to the buildings; a closer default zoom; a row of faces for people in
sight outdoors (moving people are hard to tap), and people win over buildings when tapped.

**R1.6 Phone apps people can read.** The generic screen stacks fields on phones and hides ids.
Real screens for Work (R1.1), Calendar, Contacts, Jobs (with Apply), Homes (with what you can
afford), Sports (join the league team), Messages (pick a contact, not a typed id). Apps grouped
under Everyday, Life, Ambition and Town.

**R1.7 A first morning.** Three lines of "how it works" on the town screen; a checklist that ticks
itself from real game state (step outside, have breakfast, get to work, start your shift, make a
work call, say hello); three one-time coach marks. The creator gets a quick start (name, why you
moved, job) with the rest under "Customize more", "Surprise me", and every error shown at once.

**Checks:** both e2e suites green, updated where the layout moved (chat behind Talk on phones);
new steps: answer a work decision and see the verdict; an activity shows its need change; the Next
card points at the workplace before a shift; nothing overlaps the bottom bar; no console errors.

### Release 2: give the game a shape (server)

**R2.1 Goals.** `data/goals/goals.json` and `src/core/Goals.cpp`: three daily goals drawn per
character and day (a pure function, like work decisions, D-037) and aspirations mapped from the
creator's goals and the founders' (`aspirations` beside the free-text `profile.goals`), computed
from records the World already keeps (ledger, memories, relationships, career level, fame, songs,
homes). Served read-only as the phone app `goals`; the Today card shows them. Goals the game
can't track yet ("Start a business") are shown as not tracked, with the reason. Rewards and
streaks wait for a later release (they need saved state and a migration).

**R2.2 Sleep.** `World::sleep` at home in the evening; in single-player the night is skipped to
the morning with everyone simulated; in a shared town the night is skipped only when every person
playing is asleep (the bed rule); the live server keeps it off unless started with a flag. A
"Good morning" card shows what happened overnight.

**R2.3 Shifts and pacing.** Work decisions arrive through the shift (about one every 2.5 game
hours, four a day) with a "decision waiting" chime; offices get a break-room coffee; tunings below.

**R2.4 Away and the shared clock.** A character away from the game lives their routine, and the
routine includes their job: offline shifts are paid through the Ledger at a data share of the
wage, with a share of promotion hours and no decisions (amends "their routine doesn't include
shifts"; SIMULATION's tier 3 already promises the routine). The live server gains
`--pause-when-empty`: the owner chooses whether the town runs on with nobody in it.

**R2.5 A social single-player town.** Autopilot founders greet a person they meet (once per pair
per game day), sometimes start a chat when they know you, and answer asks by data rules from
compatibility and friendship (never intimacy). Still labelled "played by a script".

**Tunings (data, each with a test or a run that shows the effect):** bladder decay 10 → 6 an hour;
social decay 3 → 2; sight range 120 → 160 m (still at least shout range, D-051); the start date
moved to spring (Month 4, Monday 07:00); level-2 and level-3 promotion hours 320/500 → 220/300;
the decision bonus 1.5 → 2.0 hours per point; darts social 5 → 8; a "chat with the regulars"
activity at Heritage Coffee.

**Checks:** C++ tests for every new command and refusal and for goals privacy (another character's
goals are never shown), the server and LocalTown tests, ASan, `demo_slice.sh`, and a headless
run showing a once-a-day player stays solvent.

### Release 3: five friends, one town

**R3.1 Play together** (D-056): the host's tab runs the town; friends join from the shared artifact
with Contributor access; honest about the host's tab and the host holding everyone's state.
**R3.2 Things to do together** with rules that exist: league night (basketball is five a side,
Wednesdays 18:00), open mic with tips, the community dinner, darts. **R3.3 Hangouts:** the date
bonus extended to friends who spend time at the same place.

## Not now, and why

- **Timed activities** (a shower takes 15 minutes): a real design change worth prototyping in
  single-player after Release 2; at 1:1 time it risks more waiting, not less.
- **Walking around inside and sitting down**: the interior pictures come first
  (`art/PROMPT_PACK_INTERIORS.md`); the rooms need data and World rules of their own.
- **Sharing your location with a friend**: needs consent state and a migration; after Release 3.
- **Changing the clock rate**: the owner chose 1 game minute per real second. Release 2 changes
  what happens while you're away, not the rate.
