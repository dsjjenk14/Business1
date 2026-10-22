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
| `characters` | `id, cast, first_name, last_name, pronouns, gender, age, playable, personality{}, values{}, traits[], interests[], career{id, level}, finances{cash_cents, bank_cents}, home{property, tenure}, spawn_location, relationships[] {to, dimensions{}, history, status}, memories[] {type, participants[], about, importance, emotional_impact, public, info, days_ago}, profile{}` | `profile` holds narrative: appearance, family background, education, goals, ambitions, social preferences, secrets, schedule, starting inventory, social media, reputation, life history, tagline, why_livera. |
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
| `items` | `id, label, category, slot (outfit/accessory), usable, consumable, cooldown_minutes, needs{}, emotions{}, shortens{condition: hours}, condition_recovery{}, unlocks[], style, substance, illegal, test, contraception, personal, look, description` | data/items/items.json. `personal` items are everyone's own looks (D-079, below). |
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
  "first_name": "Nico", "last_name": "Vale", "age_group": "twenties", "age": 26,
  "pronouns": "they/them", "gender": "non-binary", "sex": "female",
  "appearance": {"skin_tone": "golden brown", "hair_style": "curly afro", "tattoos": ["wrist"], "height_cm": 170, "...": "every single-pick field"},
  "personality": {"sociability": 70, "...": "0-100, missing = 50, total within budget"},
  "values": {"creativity": 70},
  "traits": ["creative", "outgoing"], "interests": ["music", "jazz"],
  "education": "some college", "relationship_status": "single", "goals": ["release an album"],
  "origin": "new_job", "career": "cafe", "background": "optional, up to 400 characters"
}
```

A complete example: `scripts/demo/nico_vale.json`.

### Character profile conventions

`profile` is free-form narrative, but these keys have meaning:
- `appearance`: `visual_reference` (main art sheet, checked by tests), `reference_sheets`
  {kind: path}, `key_features[]`, `outfits` {everyday, work, evening: garments; drawn: the look their art shows}
  (required, D-079), plus hair, face, build...
- `life_stages[]`: `{age, stage, chapter, look{hair, outfit, carrying, jewelry}}`, oldest
  first. The last stage is the character's current age (tested for Dominique).
- `secrets[]`: `{id, truth, known_by[]}`, ready to become Facts in the information system. The id is made from the name
(`nico-vale`, then `nico-vale-2`...).

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
| `world_parts` | key, body JSON: one row per feature's world state (`homes`, `work`, `wallet`, `leisure`, `pets`, `details`, `social`, `court`; `src/core/WorldParts.cpp`) — v4 |
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
| `life.sleep` | `bed_hours [from, to)`, `wake_hour`, `energy_per_hour`, `nap_below_energy`, `nap_max_hours` | data/config/life.json; defaults [21, 3], 7, 12.5, 40 and 4 (D-081). The wake hour must fall outside the bed hours. Being asleep (and a nap's end) is session state (never saved). |

### Away pay (D-063)

| Section | Fields | Notes |
|---|---|---|
| `life.offline.away_work` | `pay_share`, `promotion_share`, `default_block{days[], hours[start, end)}` | data/config/life.json; shares 0–1 (0.8, 0.5); the default block (weekdays 9–17) is for characters whose schedule has no work line. |
| `characters` `profile.schedule` lines | `work: true` | The line the routine works away (founders' weekday job lines). At most one per day key, with an `HH:MM` time; the block runs to the next line (or midnight), at most the career's `max_shift_hours`. |

Ledger kind `salary_away`: away pay, employer to the character's bank.

### Autopilot manners (D-064)

| Section | Fields | Notes |
|---|---|---|
| `autopilot_manners` | `greet{range_m, known[], stranger[]}, chat{interaction, trait, base, per_trait, per_friendship}, asks[] {kind, min{dimension: value}}, messages{read_after_minutes [min, max], replies_per_day, replies[] {min{dimension: value}, known, lines[]}}` | data/society/manners.json; at most one; absent = founders keep to themselves and decline every ask. `range_m` within `hearing_range_m`; greeting lines for people they know (`{first}` = the person's first name) and strangers, both or neither; `interaction` and `trait` must exist; chances 0–1; ask kinds are request kinds except `intimacy`, which is refused; dimensions are relationship dimensions. `messages` (D-074): 0 ≤ min ≤ max; every reply rule has lines short enough to send; no rules = messages are read (seen) and never answered. |

### Rooms you walk around in (D-066)

One file per room, `data/interiors/<id>.json`, with one `interior` section. Coordinates are the picture's pixels
(`art/interiors/<id>.webp`), not metres.

| Field | Shape | Notes |
|---|---|---|
| `id` | lowercase letters, digits, `_` | Also the picture's name (`art/interiors/<id>.webp`, `web/client/rooms/<id>.webp`). |
| `places` | `[location id]` | The places this room is the inside of: each must exist and be enterable, and has at most one room. Homes the art pack draws alike can share one. |
| `size` | `[width, height]` | The picture's size; `scripts/client_rooms.py` refuses a picture that doesn't match. |
| `person_px` | number | An adult's height in pixels where they stand, so clients draw people to the picture's scale. |
| `floor` | `[[[x, y], …], …]` | The walkable floor: one or more polygons (walls and the open front edge excluded). |
| `blocked` | `[{label, poly: [[x, y], …], height}]` | Furniture standing on the floor: its footprint, which nobody walks onto, and its height in pixels (clients draw the footprint raised by it over whoever stands behind). |
| `entrance` | `{at: [x, y], facing}` | Where you stand when you come in, connect or load a save; must be open floor. |
| `spots` | `[{id, kind, at: [x, y], facing, label, activity?, offers?, staff?}]` | `kind`: `seat`, `sofa`, `bed`, `stool` (sat on with `sit`), `counter`, `station`, `fixture` (stood at; their point must be open floor), `stage`, `door`, `cell` (the bench of a holding cell: an arrest puts you there, nobody takes it with `sit`; its footprint should be furniture so nobody walks in). `at` is where the person's feet are and must be on the floor. `facing`: the picture's direction they face, `n` (up-left), `e` (up-right), `s` (down-right) or `w` (down-left). `activity`: one of the place's activities, done here. `offers`: on a counter, `true` for everything the place sells or a list of its offer ids; on a seat, the offers served there (a restaurant table, a salon chair, an exam bed). A purchase goes to a spot naming the offer first and to a `true` counter only when none does. `staff`: a work station (a station, counter or seat) where starting a shift puts you. |

The load fails unless every activity and offer of each place has a spot, a stage place has a
`stage` spot, the jail's room (`crime.jail`) has a `cell`, and there is a way out (a `door` with no activity). Where people are in a room is session state
(`World::rooms_`), never saved.

### Life events (D-068)

`data/events/*.json`: one `life_events` section (in `life_events.json`) and any number of `events` lists (they add up).

| Section | Fields | Notes |
|---|---|---|
| `life_events` | `per_day, hours [from, to), min_gap_minutes, check_every_minutes, lapse_minutes, memory_importance` | Defaults 2, [8, 23), 150, 10, 360, 30. `per_day` 1–10; hours 0–24 (a `to` before `from` wraps past midnight); `check_every_minutes` 1–60. Unknown keys are refused. |
| `events` | `[{id, category, title, prompt, when, weight, cooldown_days, lapse_minutes?, choices}]` | `category`: work, money, love, friends, family, health, town, temptation, street. Ids unique across files; `weight` > 0; 2–4 choices with distinct labels. |
| `when` | `outside, place_types[], places[], hours [from, to), weekdays[], age [min, max], has_career, careers[], on_shift, relationship ("single" / "partnered"), money_at_least_cents, money_below_cents, fame_tiers[], has_pet, has_kids, has_record, with ("anyone", "known", "stranger", "coworker", "partner", "ex"), founder, weather[], home ("renting", "owns", "none")` | All optional; unknown keys, place types, places, careers, fame tiers, weather kinds and characters are refused. `on_shift` true: only on a shift; otherwise never during one. `with` and `founder` can't both be set. |
| choice | `{label, outcomes[]}` | 1–4 outcomes; with more than one, each has a `chance` and they add up to 1. |
| outcome | `{chance?, text, needs{}, emotions{}, relationship{you{}, them{}, reaction}, money{cents, account, via}, memory{text, impact, importance?}, fame}` | Stats must be declared needs, emotions and relationship dimensions. `relationship` needs `when.with` or `when.founder`. `money.cents` ≠ 0 (+ paid to you, − by you); `via` cash or bank; `account` `sys:economy`, an org account, `employer` (needs a work event), `here` (needs places or place types that all have a revenue account) or `landlord` (needs `home: renting`). `fame` −5..5. Texts may use `{name}` (needs `with`), `{founder}` (needs `founder`) and `{place}`. |

Character JSON key `events` (no SQL change): `{day, offered_today, last_offer_at, pending: [{event, with, place, at,
lapses_at}], last_day: {event: day}, answered}`. A save without it has had no life events. Memories of answered events
have type `life_event`; money moves with ledger kind `life_event`.

### Street life and fist fights (D-069, D-070)

| Section | Fields | Notes |
|---|---|---|
| `crime.shoplift_place_types` | `[place type]` | The kinds of shop where `steal` works (every type must exist); absent = any shop. |
| `crime.crimes` | gains `assault` | Detection like any crime; fine and time when caught. |
| `conditions` (`data/health/injuries.json`) | `bruises`, `black_eye`, `cracked_rib`, kind `injury` | Diagnosed when they happen; `treatment` at the clinic or the ER ends them. |
| `fights` (`data/society/fights.json`) | `crime, range_m, window_minutes, attacker_cooldown_minutes, protected_minutes, no_fight_place_types[], autopilot{at_work, fight_back_trait, fight_back_at}, score{base, skills{}, needs{}, per_injury, noise}, run{base, per_point, min, max, distance_m}, injuries[] {condition, margin}, winner{needs, emotions, injury_chance, injury}, loser{…}, took_it{…, injury}, attacker_hit{…}, ran{…}, walked_away{…}, attacker_walked_away{…}, victim_relationship{}, attacker_relationship{}, witness_relationship{}, report_chance, witness_report_chance, importance, impact, witness_importance, witness_impact, brawl?` | At most one. The crime, conditions, place types, trait, skills, needs, emotions and dimensions must exist; `range_m` within say range; chances 0–1; injury margins increase. Without the section there are no fights (`unavailable`). |

`fights.brawl` (Beat Brawl, D-077; optional: without it fighting back is scored at once): `lead_in_seconds, rounds[]
{beats, seconds}, tell_at, perfect_from, perfect_multiplier, feint_chance, known_feint_chance, known_familiarity,
composure, edge_min, edge_max, damage{hook, jab, shove, chip, pushed, counter, stuffed}, trade, moves{hook, jab, shove:
{base, traits{}}}, margin_per_composure, max_game_minutes`. Rounds need a beat or more of 0.4 to 5 s; shares and
chances are 0 to 1; every blow has a damage; the moves are exactly hook, jab and shove, with known traits and some
weight. A brawl in progress (`WorldState::brawls`) is session state, never saved.

Character JSON key `street` (no SQL change): `{walk_away, fought: {character: day}, next_fight_at, protected_until}`;
a save without it has never been in a fight and doesn't always walk away. A fight waiting for its answer
(`WorldState::fights`) is session state. Memories `fight` and `saw_fight`; a witnessed fight adds a rumour to the
`details` world part.

## Release 5 content (`docs/proposals/golden_hour_build.md`)

### Social media (D-074)

`data/society/social.json`, one `social` section (at most one; absent = no social media: the ops answer `unavailable`).
Unknown top-level keys are refused.

| Key | Fields | Notes |
|---|---|---|
| `post` | `max_length, min_gap_minutes, per_day, max_tags` | Defaults 280, 10, 12, 4. Lengths are characters (UTF-8 code points), 1–2000. |
| `comment` | `max_length, min_gap_minutes, per_day, per_post` | 200, 1, 40, 40. |
| `like`, `follow` | `per_day`; `max_following` | 150; 200. |
| `feed` | `limit, kept_posts, comments_shown, activity_kept, map_post_hours` | 40 posts a view, 600 kept (oldest go), 3 comments on a card, 60 activity entries, a post names where someone is for 6 hours on the Map. |
| `last_night` | `from_hour, to_hour, shown_until_hour, top` | 18 → 6, shown until 12, top 3 (D-076). |
| `fame` | `per_follower, per_like, max_per_day` | 0–100; only a new high of followers or likes counts. |
| `relationship` | `like{}, comment{}, follow{}` | The author's (or followed person's) side toward who did it; relationship dimensions. |
| `notify` | `per_hour, game_per_day` | Toasts a person gets an hour, and how many a day the game may cause. |
| `seed_follows` | `min{dimension: value}` | At a world's founding, who follows whom. |
| `status_purchase` | `min_price_cents, categories[], except[]` | A purchase of an item in these categories at this price or more is a `status_purchase` memory; categories must have items, `except` items must exist. |
| `topics` | `{topic: label}` | Every moment's and gossip kind's topic must be here. |
| `auto` | `per_day, min_gap_minutes, delay_minutes [min, max], keep_hours, trait, base, per_trait, checkin_place_types[], checkin_tag_min_friendship, voices[] {id, min{trait}, max{trait}}, moments[] {memory, topic, chance, lines{voice: [line]}}` | Posts the game writes for characters a script plays: chance = moment chance × clamp(base + per_trait × trait/100). Voice ids unique, not `default`; traits are personality traits; place types must exist. A moment's `memory` is a memory type or `checkin`; it needs `default` lines; other keys must be voices; lines use only `{first}`, `{place}`, `{with}`, `{title}`, `{pet}`, `{item}`. |
| `unfiltered` | `handle, name, bio, run_by_secret, min_heard, delay_minutes, per_day, twist_chance, kinds[] {kind, topic, chance, interactions[], place_types[], relationship{}, lines[], twisted[]}` | The handle has a dot and no `@` (never a character id); `run_by_secret` must be a secret id in some character's `profile.secrets` (that character runs it). Kinds are the scenes the World reports: `fight`, `argument`, `arrest`, `kiss`, `accident`; interactions and place types must exist; `relationship` is what hearing the rumour does to the hearer's side toward whoever did it (else `details.accident.gossip.relationship`); lines use `{about}`, `{with}`, `{place}`. |

World part `social` (a row of `world_parts`, no SQL change): `{seeded, gossip_day, gossip_today, posts: [{id, author,
at, text, place, tags, topic, about, automatic, likes, likes_peak, comments: [{id, author, at, text}], heard_by, there,
truthful}], accounts: {character: {following, followers_peak, moments: [{memory, type, place, with, facts, at, post_at,
until}], activity: [{kind, from, post, at, seen, count}], day, posts_today, comments_today, likes_today, auto_today,
fame_today, last_post_at, last_comment_at, last_auto_at, last_post_text, game_notify_day, game_notified}]}`. A save
without it loads with no posts and `seeded` false, and the World's constructor makes the founding follows. Rumours in
the `details` part gain `{id, kind, with, place, post}` (defaults empty: an older rumour is never posted). Memories
gain the type `status_purchase`. Messages are unchanged in the save; the Messages app adds `seen` to your own messages
and `people: {id: {name, scripted, played_by?, online}}`.

### Everyone's three looks (D-079)

| Section | Fields | Notes |
|---|---|---|
| `items` | `personal: true`, `look` (everyday, work, evening), `description` | Exactly one personal item per look (`outfit_everyday`, `outfit_work`, `outfit_evening`), slot `outfit`, nothing usable, consumable, illegal or unlocking, a `description` (the line for someone whose data has no outfits: made in the creator); `look` only on personal items. No location offer, coin-shop entry or pet action may name one. A world with no personal items skips these checks. |
| `characters` `profile.appearance.outfits` | `{everyday, work, evening, drawn}` | Required for every data character once personal items exist: the three looks' garments as text, and `drawn`, the look their art shows (sprite sheet, model sheet, or a stand-in's colours). No other keys. |
| `characters` `profile.appearance.stand_in.outfits` | `{<look>: {top, bottom, shoes, apron?, headwear?, accent?}}` | Townspeople: the colours of the two looks that aren't `drawn` (the `stand_in` colours are the drawn look); a whole set each, an absent optional one means none; skin, hair and `hair_style` don't change, and a hijab wearer's looks each name `headwear`. Checked by `scripts/client_standins.py --check`, written to `web/client/figures/standins.json` as `drawn` and `looks`. |
| `art/sprites/characters/<id>/<look>/sheet.webp` | a sprite sheet of another look | Cut by `scripts/client_figures.py` into `web/client/figures/<id>/<look>/` and the manifest entry's `looks.<look>` `{from, sha1, recipe, frames}`; never the drawn look, only for someone with art. |

No save format change: `CharacterState::outfit` holds the worn item id as before (a personal item's id included);
empty still means the clothes they're drawn in. Personal items are never in `inventory` (`owns` is true for everyone).
Dirt and soiling are `details.worn_hours` and `details.soiled` by item id, per character, as for bought outfits.

### The town's people and town life (D-073)

| Section | Fields | Notes |
|---|---|---|
| `characters` | gains `cast` (`founder`, `resident`, `townsperson`); `relationships[].status` (`dating`, `engaged`, `married`) | `cast` is required for data characters (made characters have none; the `characters` reply calls them `created`). A status must be named back by the other character, the same. Several characters may name one home: they start as residents of one lease (the first by id holds it), within `bedrooms` × `homes.residents_per_bedroom`, never a home for sale. |
| `characters` `profile.appearance` | gains `avatar`, `art_notes[]`, `art_as_of` (the residents), `stand_in{skin, hair, hair_style, top, bottom, shoes, apron?, headwear?, accent?}` (townspeople) | Art links and notes for the residents, moved from `art/manifest.json`; `stand_in` colours are `#rrggbb`, `hair_style` one of short, buzz, curls, long, bun, bald, cap, hijab (`scripts/client_standins.py` checks them and writes `web/client/figures/standins.json`). |
| `evening_plans` (`data/society/town_life.json`) | `id, label, place, activity?, offer?, days[] (monday…sunday), from (HH:MM), minutes, who{personality_min{}, values_min{}, interests_any[]}?, with? (friend, partner), min_friendship?, chance` | At most one section. Unknown keys refused; the place exists and is public; its activity and offer exist, never contraband; days named and not repeated; from 17:00 and over by midnight, 30–240 minutes; traits, values and interests (the creator's list) exist; `min_friendship` only with a friend; chance in (0, 1]. Order matters: the first plan that comes up for someone is their evening. |
| `patrols` (same file) | `career, base, beat[], every_minutes, stops, linger_minutes` | At most one section, one patrol per career; the career works outdoors and `base` is one of its workplaces; the beat is two or more public places. |
| `data/world/town_homes.json` | `locations`, `properties` | Twelve more units in Maple Court, Riverside Lofts and the Lexington (same doors as their buildings). |

No save format change. On load, content characters missing from the state move in (as before) with their
relationships from data seeded both ways where the world has no record yet (a status included) and their memories;
a made character (`created_characters`) whose id is now a content character's is dropped from `created_characters`
and keeps its state under the data's definition (D-073). The autopilot's plans, evenings and beats are memory only.

### Needs at zero (D-080)

| Section | Fields | Notes |
|---|---|---|
| `needs_at_zero` | `hospital`, `rearm_above`, `pass_out {hours, energy_after, emotions, robbery_chance_outdoors, robbery_max_cash_cents}`, `needs[] {need, rule, hours, bill_cents, after, emotions_per_hour, needs_per_hour, receptivity, condition, summary, text}` | data/health/needs_at_zero.json. One rule per need: `pass_out`, `hospital`, `accident` (bladder, and only bladder) or `notice`. `summary` is the needs card's line and `text` what you're told; `{hospital}`, `{hours}`, `{bill}` and `{where}` are filled in. Optional: a world without it has no rules at 0 (the unit tests' `realContent()`). |
| `conditions[].from_zero` | `need`, `times`, `within_days` | data/health/zero_conditions.json: the made-up illnesses of running a need down to 0 again and again. |

Save data: each character gains `passed_out_until`, `admitted_until` (game minutes, -1 when not), `admitted_for` (the
need), `at_zero` (needs at 0 until they're back above `rearm_above`) and `zero_times` (need → when it hit 0). Older
saves load with none. No SQL migration: they ride in the character JSON.


### The court (D-083)

| Section | Fields | Notes |
|---|---|---|
| `court` | `courthouse`, `fines_account`, `booking_minutes`, `sitting {hours, slot_minutes, notice_minutes, grace_minutes, plea_minutes, max_adjournments}`, `evidence {caught, reported, per_witness, per_staff, per_officer, victim, in_court, victim_in_court, min, max}`, `lawyers {lawyer_careers[], firm {name, place, account, fee_cents, edge}, fee_cents, edge_base, edge_per_level}`, `guilty_plea_discount`, `unpaid_fine_jail_minutes`, `community_service {place, due_days, needs_per_hour, breach_jail_minutes_per_hour}`, `probation {breach_jail_minutes}`, `record {penalty_days, conviction_days, jail_days}`, `sentences {crime: [{fine_cents, service_hours, probation_days, jail_minutes}]}` | data/society/court.json. At most one. The courthouse must be an enterable public place with hours, and the court sits only while it's open; accounts are org accounts; lawyer careers, the firm's place and the service place exist; chances 0–1, min ≤ max; every crime under `sentences` exists and each ladder (by convictions already on the record, the last for that many or more) has at least one sentence, each something. A crime with sentences is tried in court; any other is a fixed penalty. Optional: without it, arrests fine and hold you on the spot (D-069). |

New content for the court: the place `courthouse` (type `courthouse`, data/world/founding_town.json), the career
`judiciary` (data/careers/more_careers.json, workplace `courthouse`, employer `org:town_of_livera`), the org account
`org:town_of_livera` (data/economy/founding_economy.json), the judge `evelyn-park` (data/characters) and her home
`lexington_1406` (data/world/town_homes.json), the bench's work decisions (data/careers/work_tasks.json).

World part `court` (a row of `world_parts`, no SQL change; an older save has none): `{cases: [{id, accused, victim,
charges[], how, place, at, witnesses[], staff[], police[], status (summoned, warrant, hearing, decided), hearing_at (-1:
waiting for the accused to be played again), adjournments, lawyer ("", "firm" or a character), lawyer_agreed, opened_at,
plea_by, lawyer_present, witnesses_in_court, victim_in_court, judge, plea (guilty, not_guilty, entered), verdict
(convicted, dismissed), chance, decided_at, fine_cents, fine_unpaid, service_hours, service_done, service_due,
probation_until, jail_minutes, breached}]}`. Who is doing community service right now is session state (not saved).
Record entries (character key `record`) gain `case` and `sentence` (the sentence in words) when a court convicted them.
