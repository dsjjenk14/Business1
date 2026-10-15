# LIVÉRA Game Design

*Everyone has a life. You decide what yours becomes.*

**The fantasy:** you aren't simply living in the city. You're helping create it.

LIVÉRA is a persistent multiplayer life simulation. Players arrive in a town during its
founding: roads are dirt, cranes are up, the first apartment tower just opened. Over years
of simulated time, through systems rather than scripts, the town becomes a city, and the
players' careers, relationships, businesses and developments are part of why.

## Pillars

1. **A living society, not a menu of mechanics.** Needs, schedules, relationships,
   memories and money interact so stories emerge on their own.
2. **The city grows, and you shape it.** Construction is visible and ongoing. Later,
   players become developers and civic actors.
3. **People remember.** Relationships are directional and built from what actually
   happened. Information spreads, and rumours mutate.
4. **Your life compounds.** Careers, property, businesses, reputation and family carry
   forward, across generations.
5. **Shared and persistent.** Other players are part of your story, and the world keeps
   going when you log off.

## Core loop (founding era)

Wake at home → look after needs → go out (coffee, park, church) → meet people → work a
shift → earn → spend → go home. Watch the town change week to week. Over weeks: promotions,
closer relationships, a better apartment. Over months: buy property, start a business.
Over years: develop parcels, raise a family, leave a legacy.

## Systems

| System | Design intent | Status |
|---|---|---|
| Needs & emotions | Hunger, energy, hygiene, social, recreation, comfort, health; 9 emotions | Built |
| Personality & values | 8 traits, 9 values; shape how interactions land and who clicks | Built |
| Relationships | Directional, 11 dimensions | Built |
| Memory | Owned per character; biases future reactions | Built (grudges); deeper influence Phase 4 |
| Information, secrets, gossip | Facts vs beliefs; rumours with source, accuracy, reach; mutation as they spread | Designed (DATA_MODEL.md) |
| Careers | Data-defined ladders; performance from wellbeing; promotions | Built (Recruiting, Construction Management; Law defined, no firm yet) |
| Economy | Cash, bank, income, expenses, rent; later debt, credit, investments, taxes | Partly built |
| Real estate | Rent → buy → mortgage → co-own → renovate → develop parcels | Renting built |
| Businesses | Own, staff (incl. other players), payroll, inventory, reputation, competitors | Phase 8 |
| Social media | Posts, followers, virality, sponsorships; feeds reputation and gossip | Phase 10 |
| Character creator | Make your own resident: look, personality, values, background, origin, career | Built (server + text wizard); 3D preview with the client |
| Talking | Proximity chat (say/shout/whisper); voice later with the same hearing rules | Text built; voice M1 |
| Music | Compose on your phone, release to the town chart, perform on stages, get tipped, build skill | Built; in-world playback with the client |
| Phone | Primary UI for messages, contacts, bank, calendar, map, property, career, notifications, city | Built as server data; UI comes with the client |
| City growth | Construction projects, stages, city stats; secondary effects | Projects & stages built; effects Phase 11 |
| Civic | Mayor, council, planning, elections, zoning | Late; landmarks only today |
| Life events | Data-driven event engine (birthdays, weddings, layoffs, emergencies) | Phase 12 |
| Generations | Life stages, children, inheritance | Phase 13 (state designed to allow it) |

## Why did you move to Livéra?

The character creator asks this. Origins and their starting effects (`data/creator/character_creator.json`):

| Origin | Built today | Planned additions |
|---|---|---|
| New job | $8,000 savings | – |
| Career advancement | Starts one career level up, more stress | – |
| University | $2,500, excited | Student housing, education track |
| Family | $5,000, less lonely | A family member in town |
| Business opportunity | $35,000 to build with | Business licence path |
| Relationship | $4,500, happier | A partner (or ex) in town |
| Fresh start | $1,500, more cash on hand | A secret; bonus to new relationships |
| Real estate investment | $60,000 and a luxury apartment | Property purchase from day one |
| Financial opportunity | $18,000, confident | Debt or leverage options |
| Adventure | $6,000 and $500 cash, excited | – |

Everyone currently starts with a job they pick from the entry-level careers (Café,
Recruiting, Construction Management).

The founding characters already carry `profile.why_livera`.

## The founding cast

Sixteen founding residents. They are not templates: each has their own data file with
personality, values, finances, home, career, relationships, memories, secrets, schedule
and look. **Two are built:** Dominique Ashford and Jaxon Reid (`data/characters/`). The
other fourteen are the plan below. Per the spec, they're added after one character is
complete, then one at a time.

### Why they came: the Livéra Founders' Grant

Livéra was chartered on reclaimed riverfront land by a development consortium betting that
a new town, built right, would pull talent out of crowded cities. To seed it, they offered
the **Founders' Grant**: discounted leases and relocation money for the first residents
who'd commit to two years. Sixteen people took it, for sixteen different reasons. Some
knew each other before. Most didn't. A few wish they didn't.

### Built

- **Dominique Ashford** (29, she/her): Senior Recruiter opening Meridian Talent's Livéra
  office. Career advancement. Polished, perceptive, guarded. Secret: a standing offer to
  go back to Atlanta as a partner.
- **Jaxon Reid** (32, he/him): Assistant PM at Forge Builders, building half the town.
  Fresh start after his Houston contracting firm failed. Secret: $38k of old business debt.
  Already a little sweet on Dominique; she doesn't know (directional relationships).

### Planned (names from the spec; details are proposals to confirm)

| Character | Proposed role & motivation | Proposed hooks |
|---|---|---|
| Aaliyah | Physician opening the clinic → Riverdale Medical Center. Career. | Dominique's college roommate; the friendship is strained by something unsaid. |
| Bri | Lifestyle creator. Wealth & attention: first big influencer in a new town. | Will bring someone Dominique dislikes to her party (spec's emergent-story example). |
| Kailyn | Real-estate agent. Real-estate opportunity. | Competes with Elodie for the same listings. |
| Nia | Teacher at the first school. Community. | Sings in the Greater Hope choir; knows everyone's business. |
| Sienna | Restaurateur. Entrepreneurship. | Wants the riverside parcel Jaxon's crew is preparing. |
| Elodie | Developer's daughter, consortium liaison. Family relocation. | Knows the city plan before anyone else; information as currency. |
| Valentina | Fashion designer opening a boutique. Creativity. | Romantic history with Luca. |
| Malik | Attorney setting up the town's first firm (unlocks the Law career). Career. | Old rivalry with Darian. |
| Chris | Barista turned partner at Heritage Coffee. Escape from a previous life. | Hears everything said at the communal table. |
| Darian | Finance/tech founder. Wealth. | Funding a project that could displace Maple Court tenants. |
| Elijah | Associate pastor at Greater Hope. Community. | Counsels half the cast; holds several secrets. |
| Pluto | DJ and nightlife promoter, waiting for ÉCLAT to open. Adventure. | Brings the nightlife district to life. |
| Luca | Architect on the consortium's master plan. Career. | Valentina's ex; works closely with Jaxon. |
| Mateo | Firefighter, Station 1. Family relocation. | Jaxon's pickup-basketball rival. |

Relationship rule for the cast: not everyone knows everyone equally. Expect 3–5
pre-existing ties per character, a mix of friendship, rivalry, romance, professional and
family, plus at least one secret each, discoverable through play.

## Visual direction

Contemporary, upscale, cinematic, semi-realistic, warm, fashion-forward, diverse. Each
character needs a distinct silhouette, face, wardrobe and palette. Character profiles carry
an `appearance` block. **The previously created character artwork is not in this
repository yet.** Add it under `livera/art/reference/` and link it from each character's
`appearance.visual_reference`.

## Locations in the founding town (data/world/founding_town.json)

Built with gameplay: The Lexington (Dominique), Maple Court (Jaxon), Heritage Coffee Co.,
Greenleaf Market, Meridian Talent Partners, Forge Builders site office, Riverdale Clinic,
Greater Hope Missionary Baptist Church, Founders Park. Under construction: Founders Way,
Body & Balance gym, Maple Court Phase II, ÉCLAT (starts after Founders Way). Landmarks only,
marked as such: police and fire stations.
