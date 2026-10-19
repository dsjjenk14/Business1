# Data Model

Two kinds of data, kept strictly apart:

- **Content** — what the game *is*. Immutable JSON in `data/`, loaded into `ContentDatabase`.
- **State** — what has *happened*. `WorldState`, owned by `World`, saved to SQLite.

A character's personality lives in content; their hunger lives in state. Changing
content (a price, a new career) never requires touching a save.

## Content files

Every `*.json` under `data/` is loaded (sorted by path) and merged by top-level section.
A file can contain any sections; `$comment` is ignored. Unknown sections, duplicate ids,
unknown stat names and dangling references fail the load with the file and id named.

| Section | Shape (abridged) | Notes |
|---|---|---|
| `simulation` | `skills[]`, `hearing_range_m`, `shout_range_m`, `whisper_range_m`, `sight_range_m` (outdoor sight; the load fails if it is below `shout_range_m`), `max_speech_length`, `minutes_per_real_second`, `start_minute`, `walk_speed_mps`, `entry_radius_m`, `world_bounds`, `needs[] {id, decay_per_hour, initial}`, `emotions[]`, `emotion_baselines{}`, `personality_traits[]`, `values[]`, `relationship_dimensions[]`, `offline_need_target`, `memory_importance_threshold`, `max_message_length` | Exactly one. **Declares every stat name** used anywhere else. |
| `locations` | `id, name, type, district, description, door [x,y], enterable, access (public/residents/staff), hours [open, close], offers[], activities[], outdoor_radius_m, revenue_account, construction_project, stage` | `hours` may wrap midnight (`[21, 3]`). A location with `construction_project` is closed until it completes. |
| offer | `id, label, price_cents, needs{}, emotions{}` | Bought with `buy`; money goes to `revenue_account`. |
| activity | `id, label, cooldown_minutes, needs{}, emotions{}` | Free; `do` in the client. |
| `properties` | `id, location, type, owner_account, rent_monthly_cents, market_value_cents, bedrooms, amenities[], tier` | Tenancy is state. `tier` (starter/luxury) decides which new arrivals can move in. |
| `careers` | `id, name, workplaces[], employer_account, need_cost_per_hour{}, max_shift_hours, min_paid_minutes, entry_level, levels[] {title, hourly_cents, hours_to_promote, min_performance}` | Add a career = add data. Empty `workplaces` = not workable yet. |
| `interactions` | `id, label, range_m, actor_needs{}, target_needs{}, actor_emotions{}, target_emotions{}, actor_to_target{}, target_to_actor{}, receptivity_trait, memory_type, importance, emotional_impact` | Relationship deltas are directional. |
| `characters` | `id, first_name, last_name, pronouns, gender, age, playable, personality{}, values{}, traits[], interests[], career{id, level}, finances{cash_cents, bank_cents}, home{property, tenure}, spawn_location, relationships[] {to, dimensions{}, history}, memories[] {type, participants[], about, importance, emotional_impact, public, info, days_ago}, profile{}` | `profile` holds narrative: appearance, family background, education, goals, ambitions, social preferences, secrets, schedule, starting inventory, social media, reputation, life history, tagline, why_livera. |
| `construction_projects` | `id, name, site, opens_location, worker_hours_required, crew_size, work_hours [start, end], work_days [0..6], starts_after, city_effects{}` | Crews work only in their hours; `starts_after` chains projects. |
| `city_stages` | `stage, name, min_population` | Increasing. |
| `city_initial` | `{stat: value}` | Abstract city statistics. |
| `org_accounts` | `id, name, opening_balance_cents` | Businesses, landlords, employers. |
| `character_creator` | `age [min,max], height_cm [min,max], pronouns, gender, appearance{field: choice}, traits, interests, education, relationship_status, goals, personality_budget, values_budget, max_background_length` | A choice is a list (pick one) or `{options, min, max, allow_custom}`. Exactly one. |
| `origins` | `id, label, description, bank_cents, cash_cents, career_level_bonus, housing_tier, emotions{}` | "Why did you move to Livéra?" |
| `instruments` | `id, label, midi_program, drums` | The phone studio's instruments. |
| `life` | `offline{self_care_real_days, depressed_need_targets, depressed_emotion_targets, depression_condition, recovery_per_good_hour}, bathroom{}, home{}, weight{}, aging{game_days_per_year, adult_age, life_stages[]}, grooming{}` | data/config/life.json. Exactly one. |
| `conditions` | `id, name, kind (illness, dental, mental, addiction, sti), hours [min,max] (0 = until treated), needs_per_hour{}, emotions_per_hour{}, performance_penalty, symptomatic, onset (what you are told when it starts; default "You have <name>."), curable, catch{hourly_chance, risk_need, risk_below, dirty_home, risk_multiplier, contagion_per_hour, sexual_transmission}, treated_by[]` | data/health/conditions.json. Chances are per game hour. |
| `substances` | `id, name, legal, needs{}, emotions{}, effect_minutes, crash_needs{}, crash_emotions{}, dependency_per_use, dependency_decay_per_day, addiction, overdose_uses, overdose_window_minutes, possession_crime` | data/health/substances.json; illegal ones are fictional. |
| `items` | `id, label, category, slot (outfit/accessory), usable, consumable, cooldown_minutes, needs{}, emotions{}, shortens{condition: hours}, condition_recovery{}, unlocks[], style, substance, illegal, test, contraception` | data/items/items.json. |
| `transit` | `operator_account, boarding_radius_m, lines[] {id, name, fare_cents, speed_mps, hours, inspection_chance, evasion_fine_cents, stops[] {id, name, at}}` | data/transit/transit.json. |
| `education` | `degrees[] {id, name}, programs[] {id, name, degree, requires_degree, requires_clean_record, hours_required, tuition_per_hour_cents, min_grade, campuses[], online, need_cost_per_hour, tuition_account}, creator_education{answer: [degrees]}` | data/education/education.json. |
| `crime` | `jail, hospital, fines_account, patrol_arrest_per_hour, police_nearby_m, pickpocket_*, addiction_threshold, overdose_bill_cents, crimes[] {id, label, fine_cents, jail_minutes, detection, per_witness, per_staff, per_police, notoriety}` | data/society/crimes.json. |
| `romance` | `request_minutes, conception_chance, protection_effectiveness, fertility_by_age[[age, x]], pregnancy_game_days, symptoms_after_days, test_detects_after_days, miscarriage_chance, miscarriage_window_days, abortion_limit_days, pregnancy_needs_per_hour{}, morning_sickness_needs_per_hour{}, baby_names{girl[], boy[]}, naming_window_days, divorce_fee_cents, divorce_fee_account, sti_protection` | data/society/romance.json. |
| `fame` | `tiers[] {id, label, min}, decay_per_day, per_quality_audience, per_release, per_wedding, celebrity_at, receptivity_bonus` | data/society/fame.json. |
| `family` | `supervise_under, child_needs[], child_bmi, neglect_report_hours, neglect_crime, school{location, min_age, max_age, days[], start_hour, end_hour, diploma, diploma_grade}, daycare{location, max_age, days[], start_hour, end_hour, fee_per_day_cents, account}, care_actions[] {id, label, stages[], child_needs{}, child_emotions{}, carer_needs{}, bond, grade, cooldown_minutes}` | data/society/family.json (M0.8). |

New fields on existing sections: offers gain `calories`, `calories_burned`, `service`
(checkup, treatment, dental_care, emergency, rehab, sti_test, prenatal, abortion),
`condition_recovery`, `item`, `quantity`, `requires_diagnosis`, `substance`, `illegal`;
activities gain `home_effects{cleanliness, trash}`, `calories`, `calories_burned`;
locations gain `weddings`; careers gain `requires_degree`, `requires_clean_record`,
`care_fee_share`, `works_outdoors`; characters gain `degrees[]`, `fame`.

M0.8: characters have `sex` (female/male; the old `reproduction` carrier/sire is still read
and mapped); the creator has `age_groups[] {id, label, ages[min, max]}` and a required `sex`
question instead of an age range and `reproduction`; `life.aging` lost `game_days_per_year`
(ages follow the calendar); careers gain `at_employers_home` (a nanny: no
`employer_account`, paid by the family); locations gain `open_days[]` (weekdays, 0 =
Monday).

Money is always integer cents (`*_cents`). Coordinates are meters.

### The character sheet (`create_character`)

```json
{
  "first_name": "Sol", "last_name": "Rivera", "age_group": "twenties", "age": 26,
  "pronouns": "they/them", "gender": "non-binary", "sex": "female",
  "appearance": {"skin_tone": "golden brown", "hair_style": "curly afro", "tattoos": ["wrist"], "height_cm": 170, "...": "every single-pick field"},
  "personality": {"sociability": 70, "...": "0-100, missing = 50, total within budget"},
  "values": {"creativity": 70},
  "traits": ["creative", "outgoing"], "interests": ["music", "jazz"],
  "education": "some college", "relationship_status": "single", "goals": ["release an album"],
  "origin": "new_job", "career": "cafe", "background": "optional, up to 400 characters"
}
```

A complete example: `scripts/demo/sol_rivera.json`.

### Character profile conventions

`profile` is free-form narrative, but these keys have meaning:
- `appearance`: `visual_reference` (main art sheet, checked by tests), `reference_sheets`
  {kind: path}, `key_features[]`, `outfits` {occasion: description}, plus hair, face, build...
- `life_stages[]`: `{age, stage, chapter, look{hair, outfit, carrying, jewelry}}`, oldest
  first. The last stage is the character's current age (tested for Dominique).
- `secrets[]`: `{id, truth, known_by[]}`, ready to become Facts in the information system. The id is made from the name
(`sol-rivera`, then `sol-rivera-2`...).

## Runtime state (`WorldState`, src/core/World.h)

| Record | Key fields |
|---|---|
| `CharacterState` | position, move target, inside (location id or empty), needs, emotions, skills, career state (level, hours at level, performance, lifetime earnings, open shift), online, last simulated minute, rent arrears |
| `RelationshipState` keyed `(from, to)` | dimensions (11, from content), first met, last interaction, interaction count. **Directional.** |
| `Memory` | id, **owner**, at, participants, location, type, emotional impact (−100..100), importance (0..100), about (whose relationship it colours), info, public flag |
| `LedgerAccount` | id (`chr:<id>:bank`, `chr:<id>:cash`, `org:...`, `sys:economy`), owner, kind, balance, allow_negative |
| `LedgerTransaction` | id, at, from, to, amount, kind (opening_balance, purchase, salary, rent), memo |
| `Message` | id, from, to, at, body, read |
| `Notification` | id, recipient, at, kind, text, read (200 kept per character) |
| `PropertyState` | id, owner account, tenant |
| `ConstructionState` | id, status (planned/active/complete), worker hours done, completed at |
| `CityState` | stats, stage |
| `createdCharacters` | `CharacterDef` per player-made character, in the content format. Founding characters stay in content. |
| `Song` | id, owner, title, bpm, tracks[] {instrument, notes[] {step, pitch, length, velocity}}, created/updated, released, plays. Steps are sixteenth notes (16 per bar, 256 max); up to 4 tracks of 512 notes. |
| `CharacterState`, everyday life | body (born at, height, weight, calories in/out), conditions [{id, since, until, diagnosed, recovery}], last online at, inventory, outfit, accessory, criminal record, education {program, hours, grades, degrees}, dependency per substance, high, wanted for, jailed until, fame, pregnancy {partner, conceived, due, known, prenatal visits, risk}, parents |
| `RelationshipState` | gains `status` (dating, engaged, married, ex, divorced) and when it started; the same on both sides |
| `PropertyState` | gains cleanliness and trash |
| `WorldState` | gains `rng` (the saved random stream) and pending asks (session only) |

### Designed, not built yet

These shape the current types but have no code yet. They will extend state, not replace it.

- **Information & secrets:** `Fact {id, truth, subject, created_at}`, and per character
  `Belief {fact_id, claim, confidence, source, how (witnessed/told/suspected)}`. Secrets in
  character `profile` become Facts with empty knower lists at world creation.
- **Rumors:** `Rumor {id, source, subject, claim, accuracy, confidence, reach, carriers, reputation_impact, parent_rumor}`. Mutation = a new Rumor whose `parent_rumor` points at the one it came from.
- **Reputation:** per character per domain (professional, social, public), seeded from profile.
- **Ownership:** `PropertyState` gains owners with shares, mortgage, condition; businesses get `BusinessState {owner, employees, payroll, inventory, reputation}`.
- **Inheritance:** parents and life stages exist now; inheritance will move ledger balances
  and property ownership through the same `Ledger::transfer` path.

## Save format (SQLite)

Schema version is `PRAGMA user_version`; migrations are an append-only list in
`SqliteStore.cpp`. A save written by a newer server is refused, never guessed at.

| Table | Contents |
|---|---|
| `meta` | now, clock carry, next id, next tx number, city stage |
| `accounts` | username, salt, hash, iterations, character_id (UNIQUE) |
| `characters` | id, state JSON (`Serialization.cpp`) |
| `relationships` | from_id, to_id, state JSON |
| `memories` | seq, id, owner, body JSON — append-only |
| `ledger_accounts` | id, owner, kind, balance, allow_negative |
| `ledger_transactions` | seq, id, at, from, to, amount (CHECK > 0), kind, memo — append-only |
| `messages` | seq, id, from, to, at, body, read |
| `notifications` | seq, id, recipient, at, kind, text, read |
| `properties` | id, owner account, tenant |
| `construction` | id, status, worker hours done, completed at |
| `city_stats` | key, value |
| `created_characters` | id, def JSON (content format) — v2 |
| `songs` | id, owner, body JSON — v2 |
| `properties.upkeep` | cleanliness and trash JSON — v3 |
| `meta.rng` | the random stream's state — v3 (meta is key/value, no migration needed) |
| `world_parts` | key, body JSON: one row per feature's world state (`homes`, `work`, `wallet`, `leisure`, `pets`, `details`; `src/core/WorldParts.cpp`) — v4 |
| `characters.state` additions | `body.calendar` (true once ages follow the calendar), `childhood{childcare, school_grade_sum, school_days, school_bonus_today, unsupervised_hours_today, childcare_payer, childcare_paid_day}`, `nanny_for` — M0.8, JSON fields only, no migration needed |

Session state is not saved: who is online, move targets, activity cooldowns. Open shifts
are settled on logout and shutdown, so none survive a save.

JSON field names in state blobs are part of the format. Renaming one needs a migration.

Content added after a world was saved joins it on load (`World`'s constructor): new
organisations open their ledger accounts and get their opening balance from the outside
economy, new properties appear unlet, new founding characters move in, and stats, bodies,
degrees and fame missing from older character blobs start from their definitions.

## M0.8 content and save data

Each feature also has a reference page in `docs/m08/` (protocol ops, CLI, what is not done).

### Homes (`docs/m08/homes.md`)

Content sections (in `data/world/homes_places.json`):

| Section | Shape (abridged) | Notes |
|---|---|---|
| `properties` | gains `for_sale` (bool) | A home for sale needs `market_value_cents`, `rent_monthly_cents` 0, no `tier`, an enterable `residents` location, and can't be any character's starting home. |
| `homes` | `lender, min_down_payment, annual_rate, term_months, missed_payments_to_foreclose, late_fee_cents, max_payment_share_of_pay, work_hours_per_month, reserve_months, residents_per_bedroom` | Exactly one when any home is for sale. `lender` must be an org account. Months are game months. |
| `org_accounts` | `org:willow_lane_homes` (developer, $250,000), `org:livera_savings_bank` (lender, $10,000,000) | Funded from `sys:economy` like every org. |

Runtime state:

| Record | Key fields |
|---|---|
| `PropertyState` | gains `residents[]` (adults who live there), `owners[]` (who bought it), `mortgage` {lender, principal, balance, payment, annual rate, term months, months left, missed payments, arrears, started at}. `tenant` = the lease holder; for an owned home, an owner who lives there (else the first owner). `owner_account` = the seller while on the market, the first owner's bank once bought. |
| `PendingRequest` | gains `subject` (the home to buy or sell together); kinds `buy_home`, `move_in`, `sell_home` |
| `createdCharacters[...].homeProperty` | now changes: a child's home follows their parents (saved in the existing `created_characters` def JSON) |

Save format: world part `homes` (table `world_parts`, schema v4; no migration):
`{"properties": {"<property id>": {"residents": [...], "owners": [...], "mortgage": {"lender",
"principal_cents", "balance_cents", "payment_cents", "annual_rate", "term_months",
"months_left", "missed_payments", "arrears_cents", "started_at"}}}}`. Only homes with
residents, owners or a mortgage are written. A save without the part (older saves, new
worlds) loads with each lease holder as the only resident. The `properties` table keeps
owner account and tenant as before. Homes keeps nothing per character (no character key).

### Work decisions (`docs/m08/work.md`)

Content (`data/careers/work_tasks.json`):

| Section | Shape (abridged) | Notes |
|---|---|---|
| `work_tasks` | `[{career, tasks[] {id, prompt, options[] {label, detail?, score, why}}}]` | M0.8. Career ids must exist; task ids unique across all careers; 3–4 options with distinct labels; scores in [0, 1] with exactly one scoring 1 (the best call); every option has a `why`. A career may have any number of decisions, including none. May appear in several files (they add up). |
| `work_decisions` | `per_day, spacing_minutes, performance_best, performance_worst, bonus_hours_per_point` | M0.8. At most one; defaults 3, 0, +6, −4, 1.5 (data: 4, 150, +6, −4, 2.0). `per_day` 1–10; `spacing_minutes` 0–1440, the minutes between decisions coming up on a shift (0 = all at once; redesign R2.3); `performance_best ≥ performance_worst`; bonus ≥ 0. |

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

### Phones, coins and LivPay (`docs/m08/wallet.md`)

Content sections (new):

| Section | Shape (abridged) | Notes |
|---|---|---|
| `coin_packs` | `[{product_id, label, coins, price_usd_cents}]` | data/economy/coins.json. `product_id` is the store product id. Coins and price must be positive; ids unique. At most one section. |
| `coin_shop` | `[{item, coin_price}]` | data/economy/coins.json. `item` must exist and be cosmetic; validation refuses anything that beats the best dollar item in its slot (or category, without a slot), and a coin phone that outlasts or out-charges the dollar phones. |
| `livpay` | `{per_transfer_limit_cents, daily_limit_cents, daily_transfers, max_note_length}` | data/economy/coins.json. Daily limit ≥ per-transfer limit. |
| `phones` | `{basic_model, low_battery_percent, charge_at_types[], models[] {item, battery_hours, charge_hours}}` | data/items/phones.json. `basic_model` is issued to every adult; every item of category `phone` needs a model; every `charge_at_types` entry must be some location's type. No section = a world without phones (nothing is gated). |
| `items` | new categories `phone` and `phone_case` | `use` on either fits it (Wallet.cpp). |

Runtime state:

| Record | Key fields |
|---|---|
| `CharacterState` | gains `phone` {model (item id), battery 0–100, phoneCase} and `spareBatteries` {model: [battery of each used spare]} (a spare with no entry is new in its box) |
| `WorldState` | gains `coins` (a `Ledger`: `coins:<character>`, `sys:coin_store`) and `coinReceipts` {receipt id: {receipt, character, product, coins, price_usd_cents, at, test, tx}} |
| `LedgerTransaction` | new kinds: `livpay`, `livpay_purchase`, `livpay_fare` (dollars); `coin_purchase`, `coin_purchase_test`, `coin_shop` (coins) |

Save keys (no new SQL; world part `wallet` in `world_parts`, character key `wallet`):

| Key | Contents |
|---|---|
| world part `wallet` | `{coins: {accounts: [{id, owner, kind, balance, allow_negative}], transactions: [{id, at, from, to, amount, kind, memo}], next_tx}, receipts: [{receipt, character, product, coins, price_usd_cents, at, test, tx}]}` |
| character `wallet` | `{phone: {model, battery, case}, spare_batteries: {model: [battery, ...]}}` |

A save without these loads as: everyone 18+ gets a full basic phone, an empty coin ledger with
its issuer, no receipts. A phone model removed from content falls back to the basic model.

### Dates, the park and the town league (`docs/m08/leisure.md`)

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

### Pets and medicine (`docs/m08/pets.md`)

| Section | Fields | Notes |
|---|---|---|
| `pets` | `shelter, vet, food_item, needs[], adopted_needs{}, listings_per_week, weekly_intake, max_pets_per_home, initial_bond, max_name_length, adoption_vaccine_days, routine_target, warn_below, neglect_hunger_hours, neglect_below, bond_loss_per_neglected_hour, company{min_bond, emotions_per_hour}, adoption_emotions{}, walk_radius_m, sickness{chance_per_hour, low_need_below, low_need_multiplier, vaccinated_multiplier, needs_per_hour}, taken_away_emotions{}, species[] {id, adoption_fee_cents, needs_per_hour, stages[] {id, min_age_months, needs_multiplier, sick_multiplier}, names, breeds}, actions[] {id, label, species?, where, uses_item?, cooldown_minutes, pet_needs, your_needs, your_emotions, bond, calories_burned?}, illnesses[] {id, name, species?}, vet_services[] {id, label, price_cents}` | data/society/pets.json |
| `medicine` | `dose_window_hours, overdose_health_loss, emergency_after_extra_doses, emergency_below_health, hospital, emergency_bill_cents, stabilised_health, medicines[] {item, daily_limit, overdose_health_loss?, prescription? {for[], fills, valid_days}, dangerous_with? {substance, within_minutes, needs, emotions, emergency}}` | data/items/medicine.json |

Save: world part `pets` (every pet: id, name, species, breed, owner, home, born at, needs,
bond, illness and whether it's known, vaccinated until, adopted at, starving since, warnings,
stage, taken from, cooldowns, and the shelter's state); character key `pets` (prescriptions:
medicine, condition, fills left, written at, expiry, written by; doses within the window).

### Little details (`docs/m08/details.md`)

| Section | Fields | Notes |
|---|---|---|
| `details` | `accident{condition, emotions, importance, impact, witness{importance, impact, relationship, partner_relationship, emotions}, gossip{hours, chance_per_hour, min_friendship, relationship, importance, impact}, news{min_fame, fame_loss, respect}, receptivity{humiliated, soiled, dirty}}, laundry{dirty_after_hours, dirty_hygiene_per_hour, soiled_hygiene_cap, home_needs, home_trash, laundromat, laundromat_price_cents, laundromat_needs}, weather{umbrella, forecast_hour, kinds[] {id, label, warn?, umbrella_halves?, outdoors_needs_per_hour?, outdoors_emotions_per_hour?}, seasons[] {months, temp_c[min,max], chances{kind: p}}}, birthdays{min_friendship, cake, cake_emotions, giver_emotions, friendship, importance, impact}, hangover{substance, drinks, within_hours, condition, check_hour}` | data/society/details.json; each season's chances sum to 1 and the seasons cover all twelve months |

Save: world part `details` (`weather_day`, `today`/`tomorrow` `{kind, temp_c}`, `rumors[]
{about, what, at, until, tellers, knows}`); character key `details` (`worn_hours{item: h}`,
`soiled[]`, `drinks[]` game minutes). Older saves load with no weather (rolled at the next
hour), no rumours and clean clothes.

## Redesign content (`docs/proposals/redesign.md`, Release 2)

No save-format change: everything below is content, or computed from state that was already saved.

### Goals (D-061)

| Section | Fields | Notes |
|---|---|---|
| `goals` | `daily{per_day, pool[] {id, label, check, requires[]}}, aspirations[] {id, label, creator_goal?, tracked?, untracked_reason?, steps[] {label, check}}` | data/goals/goals.json; at most one. `per_day` 1–10 (3). `requires`: `has_career`, `has_work_decisions`, `has_partner`, `on_team`, `match_today`, `has_phone`. Every creator goal maps to exactly one aspiration (`creator_goal`); a tracked aspiration has steps; an untracked one (`tracked: false`) has an `untracked_reason` and no steps. |
| check | `{type, min?, kinds?, direction?, place_types?, memory?, best_only?, dimension?, value?, statuses?, tier?, cents?}` | `type` is one the World computes from what it keeps: `ledger_today` (`kinds` of transaction, `direction` in/out of your accounts, counted today), `ledger_net_today` (money in minus out today, not counting opening balances, at least `cents`), `purchases_today` (purchases at places of `place_types`), `memories_today` / `memories` (your memories of type `memory`, today or ever), `promotions`, `people_interacted_today`, `messages_sent_today`, `work_calls_today` (`best_only`), `relationships_at_least` (your side: `dimension` ≥ `value`, `min` people), `relationship_status` (any of `statuses`), `children`, `fame_tier_at_least` (`tier`), `songs_released`, `owns_home`, `bank_at_least` (`cents`), `bank_covers_down_payment` (the cheapest home for sale at the lender's minimum down payment). `min` defaults to 1. Unknown types, ledger kinds, memory types, place types, dimensions, statuses and tiers fail the load. |
| `characters` | `aspirations[]` | Founders name the aspirations their free-text `profile.goals` map to; ids must exist. A made character's come from the goals picked in the creator (`profile.goals`), so nothing new is stored for them. |

### Sleep (D-062)

| Section | Fields | Notes |
|---|---|---|
| `life.sleep` | `bed_hours [from, to)`, `wake_hour` | data/config/life.json; defaults [21, 3] and 7. The wake hour must fall outside the bed hours. Being asleep is session state (never saved). |

### Away pay (D-063)

| Section | Fields | Notes |
|---|---|---|
| `life.offline.away_work` | `pay_share`, `promotion_share`, `default_block{days[], hours[start, end)}` | data/config/life.json; shares 0–1 (0.8, 0.5); the default block (weekdays 9–17) is for characters whose schedule has no work line. |
| `characters` `profile.schedule` lines | `work: true` | The line the routine works away (founders' weekday job lines). At most one per day key, with an `HH:MM` time; the block runs to the next line (or midnight), at most the career's `max_shift_hours`. |

Ledger kind `salary_away`: away pay, employer to the character's bank.

### Autopilot manners (D-064)

| Section | Fields | Notes |
|---|---|---|
| `autopilot_manners` | `greet{range_m, known[], stranger[]}, chat{interaction, trait, base, per_trait, per_friendship}, asks[] {kind, min{dimension: value}}` | data/society/manners.json; at most one; absent = founders keep to themselves and decline every ask. `range_m` within `hearing_range_m`; greeting lines for people they know (`{first}` = the person's first name) and strangers, both or neither; `interaction` and `trait` must exist; chances 0–1; ask kinds are request kinds except `intimacy`, which is refused; dimensions are relationship dimensions. |
