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

Eleven founding residents, each with an approved reference sheet in
`art/reference/characters/` and a complete, playable character file in `data/characters/`.
The art cards (name, archetype, age, height, occupation, ethnicity, build, skin tone, key
features, personality) are canon. The rest of each file (family, goals, secrets, history,
ties) is written to fit the cards; edit it freely.

### Why they came: the Livéra Founders' Grant

Livéra was chartered on reclaimed riverfront land by a development consortium led by
Whitaker Capital, betting that a new town, built right, would pull talent out of crowded
cities. To seed it, they offered the **Founders' Grant**: discounted leases and relocation
money for the first residents who'd commit to two years. Eleven people took it, for eleven
different reasons. Some knew each other before. Most didn't. A few wish they didn't.

| Character | Archetype | Work (in game) | Why Livéra | Secret |
|---|---|---|---|---|
| **Dominique Ashford**, 29 (sheets: ages 19, 24, 29; turnaround) | The Closer | Senior Recruiter, Meridian Talent Partners | Career advancement | A standing partner offer back in Atlanta; sees Harper for therapy |
| **Dax Hendrix**, 32 | The Builder | Senior AI Engineer, Parallax Labs | Fresh start | $38k of debt from his failed robotics startup; knows Parallax's demo is hand-tuned |
| **Harper James**, 32 | The Confidante | Practice Owner, James Wellness | Business opportunity | Her studio has about two months of money left |
| **Andre Campbell**, 29 | The Wild Card | Studio Producer, Low End Studios | Financial opportunity | His breakout hit uses an uncleared sample; he moved here because Aaliyah did |
| **Naomi Ellis**, 30 | The Visionary | Label Owner, Ellis Atelier | Business opportunity | If her label misses targets, Whitaker Capital takes her name |
| **Graham Whitaker**, 35 | The Investor | Partner, Whitaker Capital | Real-estate investment | His investors want out; he's under pressure to flip Maple Court |
| **Maya Bennett**, 28 | The Idealist | Founder & CEO, Common Ground | Family | Graham's donation came with conditions her board doesn't know about |
| **Julian Park**, 30 | The Innovator | Founder & CEO, Parallax Labs | Business opportunity | Parallax's consortium demo used results the model can't reproduce |
| **Leila Rahal**, 33 | The Insider | Senior Investigative Reporter, The Livéra Ledger | Career advancement | A source inside Whitaker Capital |
| **Aaliyah Baptiste**, 28 | The Connector | Creative Producer, Baptiste & Co. Events | Business opportunity | Two years with Andre in Miami; nobody here knows |
| **Sienna Brooks**, 27 | The Tastemaker | Creative Director, Lumen Creative | Career advancement | She runs @livera.unfiltered, the town's anonymous gossip account |

Pronouns: Dominique, Harper, Naomi, Maya, Leila, Aaliyah and Sienna are she/her; Dax,
Andre, Graham and Julian are he/him.

### How they're tied together

Not everyone knows everyone. Each character starts with three to five directional ties
(how A feels about B is stored separately from how B feels about A):

- **Dominique**: best friends with Aaliyah · Harper's client (secret) · placed engineers at
  Dax's company · Graham is her biggest client · keeps Leila at arm's length.
- **Dax**: works for Julian, who he doesn't fully trust · Saturday basketball with Andre ·
  a little sweet on Dominique, who doesn't know.
- **Harper and Leila**: college roommates and oldest friends. **Harper and Maya**: close
  friends through Common Ground.
- **Andre and Aaliyah**: exes from Miami. He still carries a torch; she carries a grudge.
  Andre is also drawn to Sienna.
- **Naomi and Sienna**: cousins who grew up sharing a bedroom. Quietly competitive, Sienna
  more than Naomi. **Naomi and Julian**: one summer in New York; she ended it.
- **Graham**: funds Naomi's label, Julian's startup and Maya's nonprofit, each with strings
  attached. Leila is investigating him; he doesn't know how closely.
- **Maya and Leila**: source and reporter. **Sienna and Aaliyah**: collaborators.

Stories these ties are built to produce: Aaliyah producing ÉCLAT's opening with Andre as
resident producer; Leila closing in on Graham through Maya; Naomi's label at risk; Dax
deciding whether to say what he knows about Parallax; Sienna's account posting about
all of them.

## Locations in the founding town (data/world/founding_town.json)

Built with gameplay: The Lexington (Dominique, Naomi, Graham, Aaliyah), Maple Court (Dax,
Maya), Riverside Lofts (Andre, Sienna, Julian), Founders Row (Harper, Leila), James Wellness,
Low End Studios (a stage), Ellis Atelier, Whitaker Capital, Common Ground Community Center,
Parallax Labs, The Livéra Ledger, Baptiste & Co. Events, Lumen Creative, Heritage Coffee Co.,
Greenleaf Market, Meridian Talent Partners, Forge Builders site office, Riverdale Clinic,
Greater Hope Missionary Baptist Church, Founders Park. Under construction: Founders Way,
Body & Balance gym, Maple Court Phase II, ÉCLAT (starts after Founders Way). Landmarks only,
marked as such: police and fire stations.
