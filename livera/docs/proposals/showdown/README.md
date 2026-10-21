# The redesign showdown (October 2026)

The owner asked for two game studios to compete to redesign LIVÉRA, with every design and play
option open. Two studios worked from one brief (`brief.md`), each playing today's build, then writing
a pitch, building a clickable prototype from the owner's art and the game's data, and writing prompts
for the new pictures it would need. Neither saw the other's work. Nothing here is decided: the owner
chooses what gets built, and anything built gets a decision entry in `docs/DECISIONS.md` first.

| | Studio Kinetic | Studio Ember |
|---|---|---|
| Redesign | **Golden Hour**: "Days are yours. Nights are ours." | **Talk of the Town**: "Walk into any room. Play the scene. Word gets around." |
| Pitch | `golden_hour.md` | `talk_of_the_town.md` |
| New pictures | `golden_hour_art.md` (10 prompts) | `talk_of_the_town_art.md` (10 prompts) |
| Weighted score | **88.5** | 86.5 |
| Panel votes | **4 of 7** | 3 of 7 |

The prototypes (2.8 MB and 11 MB of HTML, scripts and copied art) are not in the repository. They
were published with the results page as a Claude artifact. Both are scripted: no game core runs in
them. Every picture, room layout, card, price and fight rule in them comes from the game; the friends,
the rolls and the scenes are mocked, and each prototype's footer says which is which.

## Scorecard

Criteria and weights were set in the brief before either studio started.

| Criterion | Weight | Golden Hour | Talk of the Town | Why |
|---|---|---|---|---|
| Fun: the first five minutes and the fiftieth hour | 25% | 9.0 | 9.0 | Golden Hour gives you something to do every 10–20 s and the best-feeling fight. Talk of the Town turns one night into a story worth sending a friend. |
| Fits the owner's vision | 20% | 9.5 | 8.5 | Golden Hour is built around five friends and makes the fight something you play; Talk of the Town's friends mode is one mock-up screen and its fight is a slower pick-one-of-three. |
| Easy to use on a phone | 15% | 9.0 | 8.5 | Both one-thumb with big targets; Talk of the Town reads more and stacks names and mood tags over heads. |
| Looks | 15% | 9.0 | 9.0 | Both make the owner's art the star (a close follow camera; push-ins and the morning feed). |
| Buildable | 15% | 8.0 | 7.5 | Both keep the engine, core, data and art. Golden Hour packs a lot into Release 1 and its PvP fight over the browser link is untested; Talk of the Town needs a writer, a knowledge system and a scene director. Ember already built the sprite-sheet frame cutter both need. |
| Original | 10% | 8.0 | 9.5 | Talk of the Town: knowledge sharpens fight tells, rumours with "heard by N" and true/false, a gossip account run by a real player. Golden Hour: secret-pick group moments, the day/night split. |
| **Weighted total** | | **88.5** | **86.5** | |

Panel: UX designer (Golden Hour), product manager (Golden Hour), casual BitLife player (Talk of the
Town), GTA roleplay player (Golden Hour), game developer (Talk of the Town), software engineer (Talk of
the Town), a stand-in for the owner (Golden Hour).

## Where both studios landed independently

- Chores leave the screen: the character's routine (the autopilot the founders already use) handles
  them, and needs show only when they change a story or a fight.
- The day is compressed into a few choices; the evening inside the painted rooms is where you play.
- People are drawn from the new sprite sheets, whole body, walking and sitting, at real heights.
- A fist fight where you read the opponent's tell, keeping every D-070 rule.
- A morning paper and the @livera.unfiltered gossip account (Sienna's secret, in the data) as the
  reason to come back.
- Friends play at different times: days move on without everyone, live play where they overlap,
  absent characters follow their plans and are labelled.
- Keep the engine, the core, the data and every picture; shrink the 26-app phone; money stays
  cosmetic, plus one crew subscription for an always-on hosted town.
- Both change the 1:1 clock (a turn clock for days, or beats with the clock paused in scenes). That is
  the owner's call.

## Recommendation

Build Golden Hour's frame (quick days, live nights, the crew, Beat Brawl) with six of Talk of the
Town's ideas: Ember's sprite-sheet cutter first; knowledge that sharpens tells; rumours with a head
count and true/false; whoever plays Sienna secretly runs the gossip account; standing orders for
when you're away; story threads from the founders' real secrets, and one mood ring in place of ten
need bars.

Open questions for the owner: the clock, chores off the screen, which build, and money.
