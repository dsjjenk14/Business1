# M0.8 details: wetting yourself, laundry, weather, birthdays, hangovers

The product owner asked: "Add little details I missed. If you pee on yourself it's super
embarrassing, like way more than Sims; it's a huge deal." Code: `src/core/Details.cpp`, with
one-line hooks in `Life.cpp` (the bladder accident, birthdays), `World.cpp` (`interact`
receptivity), `Substances.cpp` (drinks), `Items.cpp` (style, gifts, the items app). Data:
`data/society/details.json`, `data/health/details_conditions.json` (humiliated, hungover),
`data/items/details_items.json` (umbrella, birthday cake), offers in
`data/world/founding_town.json` (an umbrella at Thread & Co, a cake at Greenleaf Market),
`data/world/details_places.json` (Suds & Spin Laundromat). Tests: `tests/test_details.cpp`.

## 1. DECISIONS entry

## D-0xx — Wetting yourself is public, lasting and costly; small details are real systems
**Decision:** When your bladder runs out you wet yourself (as before), but now it is a big
event: hygiene drops to 0, a strong burst of embarrassment, stress and lost confidence, and a
"humiliated" condition for 60–84 game hours that drains your social life and makes social moves
land worse (receptivity × 0.6). The clothes you had on are ruined until washed (they count for
no style and cap your hygiene at 50). Everyone there sees it: each witness remembers it and
loses respect and attraction for you (a partner loses twice the attraction), and for a day each
witness may tell close friends (friendship 50+) who weren't there, who think less of you too.
Someone famous (fame 60+) also loses fame, and the Livéra Ledger runs it. Alone, it is still
humiliating, but nobody knows. Around it: clothes get dirty after 16 hours worn and need
washing (at home for some energy, or $8 at Suds & Spin); the weather is rolled each day from the
season and changes at 06:00 to the previous day's forecast, and rain, storms and snow wear you
down outdoors without an umbrella; friends are told on your birthday and a cake on the day means
much more than a gift; three or more drinks in the 20 hours before 06:00 mean a hangover.
**Why:** The owner wanted the accident to matter far more than in The Sims. Making it social
(witnesses, gossip, a partner's reaction, the paper) and lasting (days of humiliation, ruined
clothes) makes it a real event in other people's stories, not a status icon. The other details
are small, data-driven and tested, and each touches what people already do.

## 2. SIMULATION.md section

### Accidents
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

### Clothes and laundry
Each hour you're online, your outfit gains a worn hour. At 16 it's dirty: hygiene −1.5/h and it
no longer counts for style. A ruined outfit counts for no style and caps hygiene at 50. `laundry`
washes everything you've worn: at home (energy −5, the home's trash +5) or at Suds & Spin (6–23,
$8 to `org:suds_spin`, social +3). The items app shows each outfit's condition (clean, dirty,
ruined).

### Weather
Each season (by month) has temperatures and chances for sun, cloud, rain, storm and snow
(winter is −4 to 6 °C, 28% snow). The world keeps today's weather and tomorrow's forecast; at
06:00 the forecast becomes today and a new one is rolled. Online players are warned on rain,
storm or snow days (and told if they have no umbrella). Outdoors, per hour: rain hygiene −6,
comfort −8, happiness −3, stress +2; storms worse; snow comfort −8, energy −2. An umbrella
stops rain and snow and halves a storm. Phone app `weather`.

### Birthdays
On a birthday, everyone whose friendship toward you is 40+ is told. A birthday cake given on the
day: the receiver gains happiness, excitement and less loneliness, friendship +8 toward the
giver (+4 the other way), and both remember it. On other days a cake is just a gift.

### Hangovers
Every alcoholic drink is counted. At 06:00, three or more in the previous 20 hours mean a
hangover (5–6 h: energy, comfort and happiness down, a 20% performance penalty; painkillers
shorten it, see pets and medicine).

## 3. DATA_MODEL rows

| Section | Fields | Notes |
|---|---|---|
| `details` | `accident{condition, emotions, importance, impact, witness{importance, impact, relationship, partner_relationship, emotions}, gossip{hours, chance_per_hour, min_friendship, relationship, importance, impact}, news{min_fame, fame_loss, respect}, receptivity{humiliated, soiled, dirty}}, laundry{dirty_after_hours, dirty_hygiene_per_hour, soiled_hygiene_cap, home_needs, home_trash, laundromat, laundromat_price_cents, laundromat_needs}, weather{umbrella, forecast_hour, kinds[] {id, label, warn?, umbrella_halves?, outdoors_needs_per_hour?, outdoors_emotions_per_hour?}, seasons[] {months, temp_c[min,max], chances{kind: p}}}, birthdays{min_friendship, cake, cake_emotions, giver_emotions, friendship, importance, impact}, hangover{substance, drinks, within_hours, condition, check_hour}` | data/society/details.json; each season's chances sum to 1 and the seasons cover all twelve months |

Save: world part `details` (`weather_day`, `today`/`tomorrow` `{kind, temp_c}`, `rumors[]
{about, what, at, until, tellers, knows}`); character key `details` (`worn_hours{item: h}`,
`soiled[]`, `drinks[]` game minutes). Older saves load with no weather (rolled at the next
hour), no rumours and clean clothes.

## 4. ROADMAP bullet

- **Little details:** wetting yourself is a public, lasting humiliation (witnesses, gossip, a
  partner's reaction, ruined clothes, the paper for the famous); laundry at home or Suds & Spin;
  daily weather with forecasts and umbrellas; birthday notices and cakes; hangovers.

## 5. Protocol ops and CLI

| Op | Arguments | Refusals |
|---|---|---|
| `laundry` | | not at home or the laundromat, the laundromat is closed, nothing to wash, can't afford |
| `phone` `{app: "weather"}` | | today, tomorrow (`kind`, `label`, `temp_c`), whether you have an umbrella, when it changes |
| `phone` `{app: "items"}` | | outfits now carry `condition`: `clean`, `dirty` or `ruined` |
| `give` | `item: "birthday_cake"` on their birthday | replies `birthday: true` |

CLI: `laundry`, `phone weather`.

## 6. What is NOT done

- No accidents on shift (shift bathroom breaks prevent them), and none at night for offline
  characters (their routine copes).
- Gossip travels only between people with an existing close friendship; it isn't spread by
  text message, and nobody can deny it.
- The weather is the same everywhere in town; it doesn't affect transit, matches or crops, and
  temperature has no effect yet beyond the label.
- No washing machines to buy, no dry cleaning, and clothes don't wear out.
- No birthday parties as an event type; a party is people meeting and bringing a cake.
