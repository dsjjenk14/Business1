# M0.8 pets and medicine

The product owner asked: "Add pets. Add medicine." Code: `src/core/Pets.cpp`. Data:
`data/society/pets.json`, `data/items/medicine.json`, `data/world/pets_places.json`, offers in
`data/world/founding_town.json` (Riverdale Pharmacy, and pet food at Greenleaf Market).
Tests: `tests/test_pets.cpp`.

## 1. DECISIONS entry

## D-0xx — Pets live at home and depend on the household; medicine has limits and prescriptions
**Decision:** A pet is adopted in person at Paws & Whiskers (a fee), lives at the adopter's home,
and anyone who lives there can care for it. Its needs (hunger, fun, hygiene, health) run down
by the hour; an offline owner's routine keeps it fed and fine, the same rule as for children,
unless the owner has stopped coping. A pet starved for a day, or with its health gone, is taken
back to the shelter by animal control, and the household is told why; the shelter won't give it
back to them. Pets fall ill now and then; the vet diagnoses, vaccinates and treats, for a fee,
and vets on shift earn a share. Pets age on the calendar (puppy, adult, senior) but do not die
in M0.8. The shelter's animals are generated from data and the week number alone, so every
player sees the same animals. Medicine is items with a daily dose limit; prescription medicine
needs a prescription that a doctor writes when a checkup diagnoses a condition it treats, with
a number of fills and an expiry. Going over the limit hurts and, past a point, is an ER visit;
a sleep aid with alcohol in your system is an emergency.
**Why:** Pets and medicine should ask something of the player (feeding, a vet bill, reading the
label) without becoming chores nobody can keep up with; the offline routine and generous
cooldowns keep both fair to people who don't play every day.

## 2. SIMULATION.md section

### Pets
Species in data: dog ($250), cat ($150), rabbit ($80), each with needs per hour, life stages by
age in months (needs and illness multipliers), names and breeds. The shelter lists four animals
a week (a weekly intake of twelve, so an adopted animal's place on show is taken by the next).
`adopt` (in person, open hours 10–18, you need a home, at most three pets per home) pays the
fee to `org:paws_whiskers`, starts the bond at 10 and includes vaccines for a year. Care
(`pet`): feed (uses one `pet_food`), play, cuddle, groom at home; walk (dogs) outdoors within
250 m of home, which also gives you recreation and burns calories. Each has a cooldown, moves
the pet's needs and yours, and grows the bond. A bonded pet (40+) lowers your loneliness while
you're home with it. Hourly: needs decay (an online owner) or settle at 70 (an offline owner's
routine); a pet falls ill with a small hourly chance (three times as likely with a need under
25, half as likely vaccinated); below 20 health the household is warned; hunger at 0 for a day
or health at 0 means animal control. The vet (`vet`): checkup ($65, finds illness), vaccines
($90), treatment ($180, cures), paid from your bank or cash; vets on shift earn a share.

### Medicine
Over the counter at Riverdale Pharmacy: painkillers, cold & flu, allergy relief, antacid, sleep
aid, vitamins. Prescription: antibiotics (strep throat; 2 fills, 28 days), antivirals (flu; 1
fill, 14 days), antidepressants (depression; 3 fills, 84 days). New conditions: seasonal
allergies, heartburn, insomnia, strep throat. A checkup that diagnoses a condition writes the
matching prescription; each purchase uses a fill; without a valid one the pharmacy refuses.
Taking medicine counts doses over 24 hours: at the limit you're warned; over it you lose health
(25 by default, more for painkillers), and two over, or health under 15, is an ER visit (a bill
of up to $450, a memory). A sleep aid within four hours of a drink is an emergency.

## 3. DATA_MODEL rows

| Section | Fields | Notes |
|---|---|---|
| `pets` | `shelter, vet, food_item, needs[], adopted_needs{}, listings_per_week, weekly_intake, max_pets_per_home, initial_bond, max_name_length, adoption_vaccine_days, routine_target, warn_below, neglect_hunger_hours, neglect_below, bond_loss_per_neglected_hour, company{min_bond, emotions_per_hour}, adoption_emotions{}, walk_radius_m, sickness{chance_per_hour, low_need_below, low_need_multiplier, vaccinated_multiplier, needs_per_hour}, taken_away_emotions{}, species[] {id, adoption_fee_cents, needs_per_hour, stages[] {id, min_age_months, needs_multiplier, sick_multiplier}, names, breeds}, actions[] {id, label, species?, where, uses_item?, cooldown_minutes, pet_needs, your_needs, your_emotions, bond, calories_burned?}, illnesses[] {id, name, species?}, vet_services[] {id, label, price_cents}` | data/society/pets.json |
| `medicine` | `dose_window_hours, overdose_health_loss, emergency_after_extra_doses, emergency_below_health, hospital, emergency_bill_cents, stabilised_health, medicines[] {item, daily_limit, overdose_health_loss?, prescription? {for[], fills, valid_days}, dangerous_with? {substance, within_minutes, needs, emotions, emergency}}` | data/items/medicine.json |

Save: world part `pets` (every pet: id, name, species, breed, owner, home, born at, needs,
bond, illness and whether it's known, vaccinated until, adopted at, starving since, warnings,
stage, taken from, cooldowns, and the shelter's state); character key `pets` (prescriptions:
medicine, condition, fills left, written at, expiry, written by; doses within the window).

## 4. ROADMAP bullet

- **Pets and medicine:** adopt a dog, cat or rabbit at Paws & Whiskers; feed, play, cuddle,
  groom and walk them; the vet at Founders Animal Hospital; animal control for neglect. Over-the-
  counter and prescription medicine with daily limits, prescriptions from checkups, overdoses.

## 5. Protocol ops and CLI

| Op | Arguments | Refusals |
|---|---|---|
| `adopt` | `pet` (a listing id from `phone pets`), `name` (optional), `method` (`card` default, or `cash`) | unknown or already adopted animal, closed, not at the shelter, no home, too many pets, can't afford |
| `pet` | `pet`, `action` (`feed`, `play`, `cuddle`, `groom`, `walk`) | not your household's pet, wrong place, not for this species, too soon, no pet food |
| `vet` | `pet`, `service` (`checkup`, `vaccines`, `treatment`), `method` | not at the vet, closed, unknown service, nothing to treat, can't afford |
| `phone` `{app: "pets"}` | | your pets (needs, bond, age, stage, sick or not), the shelter's animals, the vet's services |
| `phone` `{app: "health"}` | | also lists prescriptions and today's doses |

CLI: `adopt ANIMAL [NAME...]`, `pet PET ACTION`, `vet PET SERVICE`, `phone pets`.

## 6. What is NOT done

- Pets don't die, have litters, follow you around town, or appear in other people's views.
- No pet sitters, kennels or giving a pet to someone else; no buying pets from breeders.
- Medicine doesn't interact with other medicine (only the sleep aid with alcohol).
- No pharmacist on shift is required to sell prescription medicine; refills are counted, not
  renewed by phone.
