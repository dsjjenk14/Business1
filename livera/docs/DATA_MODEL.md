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
| `simulation` | `skills[]`, `hearing_range_m`, `shout_range_m`, `whisper_range_m`, `max_speech_length`, `minutes_per_real_second`, `start_minute`, `walk_speed_mps`, `entry_radius_m`, `world_bounds`, `needs[] {id, decay_per_hour, initial}`, `emotions[]`, `emotion_baselines{}`, `personality_traits[]`, `values[]`, `relationship_dimensions[]`, `offline_need_target`, `memory_importance_threshold`, `max_message_length` | Exactly one. **Declares every stat name** used anywhere else. |
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
| `conditions` | `id, name, kind (illness, dental, mental, addiction, sti), hours [min,max] (0 = until treated), needs_per_hour{}, emotions_per_hour{}, performance_penalty, symptomatic, curable, catch{hourly_chance, risk_need, risk_below, dirty_home, risk_multiplier, contagion_per_hour, sexual_transmission}, treated_by[]` | data/health/conditions.json. Chances are per game hour. |
| `substances` | `id, name, legal, needs{}, emotions{}, effect_minutes, crash_needs{}, crash_emotions{}, dependency_per_use, dependency_decay_per_day, addiction, overdose_uses, overdose_window_minutes, possession_crime` | data/health/substances.json; illegal ones are fictional. |
| `items` | `id, label, category, slot (outfit/accessory), usable, consumable, cooldown_minutes, needs{}, emotions{}, shortens{condition: hours}, condition_recovery{}, unlocks[], style, substance, illegal, test, contraception` | data/items/items.json. |
| `transit` | `operator_account, boarding_radius_m, lines[] {id, name, fare_cents, speed_mps, hours, inspection_chance, evasion_fine_cents, stops[] {id, name, at}}` | data/transit/transit.json. |
| `education` | `degrees[] {id, name}, programs[] {id, name, degree, requires_degree, requires_clean_record, hours_required, tuition_per_hour_cents, min_grade, campuses[], online, need_cost_per_hour, tuition_account}, creator_education{answer: [degrees]}` | data/education/education.json. |
| `crime` | `jail, hospital, fines_account, patrol_arrest_per_hour, police_nearby_m, pickpocket_*, addiction_threshold, overdose_bill_cents, crimes[] {id, label, fine_cents, jail_minutes, detection, per_witness, per_staff, per_police, notoriety}` | data/society/crimes.json. |
| `romance` | `request_minutes, conception_chance, protection_effectiveness, fertility_by_age[[age, x]], pregnancy_game_days, symptoms_after_days, test_detects_after_days, miscarriage_chance, miscarriage_window_days, abortion_limit_days, pregnancy_needs_per_hour{}, morning_sickness_needs_per_hour{}, baby_names{girl[], boy[]}, naming_window_days, divorce_fee_cents, divorce_fee_account, sti_protection` | data/society/romance.json. |
| `fame` | `tiers[] {id, label, min}, decay_per_day, per_quality_audience, per_release, per_wedding, celebrity_at, receptivity_bonus` | data/society/fame.json. |

New fields on existing sections: offers gain `calories`, `calories_burned`, `service`
(checkup, treatment, dental_care, emergency, rehab, sti_test, prenatal, abortion),
`condition_recovery`, `item`, `quantity`, `requires_diagnosis`, `substance`, `illegal`;
activities gain `home_effects{cleanliness, trash}`, `calories`, `calories_burned`;
locations gain `weddings`; careers gain `requires_degree`, `requires_clean_record`,
`care_fee_share`, `works_outdoors`; characters gain `degrees[]`, `reproduction`
(carrier/sire/empty), `fame`; the creator gains an optional `reproduction` question.

Money is always integer cents (`*_cents`). Coordinates are meters.

### The character sheet (`create_character`)

```json
{
  "first_name": "Sol", "last_name": "Rivera", "age": 26,
  "pronouns": "they/them", "gender": "non-binary",
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

Session state is not saved: who is online, move targets, activity cooldowns. Open shifts
are settled on logout and shutdown, so none survive a save.

JSON field names in state blobs are part of the format. Renaming one needs a migration.
