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
| Needs & emotions | Hunger, energy, hygiene, social, recreation, comfort, health, bladder, dental, grooming; 9 emotions | Built |
| Body | Bathroom, teeth, grooming, weight from calories, aging and life stages | Built |
| Home upkeep | Cleanliness, trash, housework; filth makes you sick | Built |
| Illness & care | Illnesses, contagion, checkups, treatment, ER, dentist, therapy, rehab; doctors and nurses on duty | Built |
| The offline rule | Three real weeks of self-care, then depression (D-023) | Built |
| Things | Inventory, clothes and accessories you wear, electronics and medicine you use, gifts | Built |
| Public transport | A bus line with fares and inspectors | Built |
| School | University, law/medical/nursing school, police academy; degrees gate careers | Built |
| Crime & police | Shoplifting, pickpocketing, fare evasion, drugs; fines, jail, records, warrants, police players | Built |
| Substances | Alcohol; fictional street drugs; highs, crashes, addiction, overdose | Built |
| Dating & marriage | Asks that need a yes; dating, engagement, weddings, breakups, divorce | Built |
| Intimacy & family | Adults-only, consensual, fade to black (D-025); fictional STIs; pregnancy, miscarriage, abortion care, birth, children | Built (children's care is abstract) |
| Fame | Performances, releases, weddings and headlines; celebrity tiers | Built |
| Personality & values | 8 traits, 9 values; shape how interactions land and who clicks | Built |
| Relationships | Directional, 11 dimensions | Built |
| Memory | Owned per character; biases future reactions | Built (grudges); deeper influence Phase 4 |
| Information, secrets, gossip | Facts vs beliefs; rumours with source, accuracy, reach; mutation as they spread | Designed (DATA_MODEL.md) |
| Careers | Data-defined ladders; performance from wellbeing; promotions; apply in person; degree and record requirements | Built (24 careers incl. medicine, nursing, law, police, teaching) |
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

## The town's people (D-073)

The founders aren't alone. Every new town also has the four **residents** whose model sheets came from the
town-preview recording (`art/reference/residents/`; made in the creator then, data characters now, their cards canon)
and twelve **townspeople** who keep the places open. All of them are playable; whoever nobody plays lives their day
on autopilot, labelled, and goes out in the evening from `data/society/town_life.json`.

| Character | Cast | Work (in game) | Lives | A thread |
|---|---|---|---|---|
| **Kai Morgan**, 22, he/him · The Upstart | resident | Beatmaker, Low End Studios (2 pm–10 pm) | Riverside Lofts 4, with his cousin Theo | Found Andre's uncleared 'Golden Hour' session; quit Bernie's bar mid-shift |
| **Rosa Delgado**, 27, she/her · The Guardian | resident | Assistant Manager, Thread & Co. (9–5) | Maple Court 3C | Wants the police academy; half her pay goes to her brother in prison |
| **Sol Rivera**, 26, they/them · The Free Spirit | resident | Shift Lead, Heritage Coffee (5:45 am–2:45 pm) | Riverside Lofts 1, with Imani | Thursday open mic at the Copper Tap; their old band kept their song |
| **Theo Grant**, 24, he/him · The Fresh Start | resident | Shift Supervisor, Greenleaf Market (7–3:30) | Riverside Lofts 4 | Left Atlanta owing the wrong people over a friend's debt |
| **Bernie Walsh**, 54, she/her · The Keeper | townsperson | Bar Manager, The Copper Tap (3:45 pm–11:30 pm) | Maple Court 4B | Has seen the letter of intent: the Tap is being sold to a Whitaker-backed buyer |
| **Marcus Bell**, 47, he/him · The Steady Hand | townsperson | Sergeant, Livéra PD (evenings, and the beat) | Maple Court 3A | Testified against his partner in Chicago; the partner is out and called |
| **Aisha Farah**, 31, she/her · The Sentinel | townsperson | Police Officer, Livéra PD (days, and the beat) | The Lexington 0305 | Has an FBI application in |
| **Samuel Osei**, 39, he/him · The Mentor | townsperson | Senior Teacher, Founders School | Maple Court 2C, married to Tess | Offered the principal's job if he backs the charter |
| **Tess Osei**, 36, she/her · The Rock | townsperson | Charge Nurse, Livéra General (7–3) | Maple Court 2C | Two rounds of IVF; nobody here knows |
| **Ngozi Adeyemi**, 41, she/her · The Healer | townsperson | Attending Physician, Riverdale Clinic | The Lexington 0602 | Treats people who can't pay and logs them as follow-ups |
| **Rafael Mendes**, 29, he/him · The Resident | townsperson | Medical Resident, Livéra General (evenings) | Riverside Lofts 6, with Bo | Tess caught his wrong dose and never wrote it up |
| **Imani Clarke**, 23, she/her · The Observer | townsperson | Barista, Heritage Coffee (11–8) | Riverside Lofts 1 | Sends photos from behind the counter to @livera.unfiltered |
| **Hamid Sultani**, 41, he/him · The Survivor | townsperson | Cashier, Greenleaf Market (2–10) | Maple Court 1C | Pays a man in Peshawar who says he can get his brother out |
| **Noor Haddad**, 20, she/her · The Hustler | townsperson | Sales Associate, Thread & Co. (1–9) | Maple Court 1B | Sells copies of Ellis Atelier pieces online |
| **Jean-Baptiste Moreau**, 44, he/him · The Maître d' | townsperson | Restaurant Manager, Lumière Bistro (4:30–11:15) | The Lexington 1103 | Fired in Paris for refilling a famous vintage |
| **Bo Thornton**, 35, he/him · The Comeback | townsperson | Personal Trainer, Body & Balance (when it opens) | Riverside Lofts 6 | Four years sober; called Bernie the night he nearly wasn't |

Nine founders know one of them (Andre gave Kai the studio's late slot, Maya trusts Rosa with Common Ground's keys,
Dax plays Saturday ball with Theo, Leila watches over Noor, Harper and Ngozi trade patients, Graham made Samuel an
offer, Sienna reposted Imani, Sol makes Dominique's latte, Aaliyah books Jean-Baptiste's back room). The townspeople
have no picture yet: the client draws them as a labelled stand-in in their own colours until their model sheets are
made from `art/prompts_needed.html`.

## Locations in the founding town (data/world/founding_town.json)

Built with gameplay: The Lexington (Dominique, Naomi, Graham, Aaliyah), Maple Court (Dax,
Maya), Riverside Lofts (Andre, Sienna, Julian), Founders Row (Harper, Leila), James Wellness,
Low End Studios (a stage), Ellis Atelier, Whitaker Capital, Common Ground Community Center,
Parallax Labs, The Livéra Ledger, Baptiste & Co. Events, Lumen Creative, Heritage Coffee Co.,
Greenleaf Market, Meridian Talent Partners, Forge Builders site office, Riverdale Clinic,
Greater Hope Missionary Baptist Church, Founders Park. Under construction: Founders Way,
Body & Balance gym, Maple Court Phase II, ÉCLAT (starts after Founders Way). Landmarks only,
marked as such: police and fire stations.
