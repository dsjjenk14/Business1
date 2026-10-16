// Pets (adoption, care, the vet) and medicine (over the counter and prescription).
// M0.8 feature file: see docs/m08/pets.md. Tuning is data/society/pets.json and data/items/medicine.json.
//
// A pet lives at its owner's home and everyone who lives there can look after it. Its needs run
// down by the hour; an offline owner's routine keeps it fed and fine (like a child), unless they've
// stopped coping. Starved for a day, or with its health gone, animal control takes it back to the
// shelter. The shelter lists a few animals each week, generated from data and the week number
// alone, so every player sees the same animals and nothing about them depends on play history.
#include <algorithm>
#include <cctype>
#include <cmath>
#include <set>

#include "core/Clock.h"
#include "core/Content.h"
#include "core/ContentParse.h"
#include "core/Parts.h"
#include "core/World.h"

namespace livera {

using namespace content_parse;

namespace {

constexpr double kStatMin = 0;
constexpr double kStatMax = 100;
constexpr double kRoutineRatePerHour = 1.0 - 0.8824969;  // 1 - e^(-1/8): the pace of an adult's (and a child's) routine
constexpr int kAdoptionImportance = 55;
constexpr int kAdoptionImpact = 40;
constexpr int kLostPetImportance = 65;
constexpr int kLostPetImpact = -55;
constexpr int kOverdoseImportance = 80;
constexpr int kOverdoseImpact = -60;

// splitmix64 finaliser: the shelter's listings are a pure function of the week and the slot.
std::uint64_t mix(std::uint64_t z) {
  z += 0x9E3779B97F4A7C15ull;
  z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ull;
  z = (z ^ (z >> 27)) * 0x94D049BB133111EBull;
  return z ^ (z >> 31);
}

std::string trim(const std::string& s) {
  const auto b = s.find_first_not_of(" \t\r\n");
  if (b == std::string::npos) return "";
  const auto e = s.find_last_not_of(" \t\r\n");
  return s.substr(b, e - b + 1);
}

std::string lower(std::string s) {
  for (char& ch : s) ch = static_cast<char>(std::tolower(static_cast<unsigned char>(ch)));
  return s;
}

std::string ageText(int months) {
  const int years = months / kMonthsPerYear;
  const int rest = months % kMonthsPerYear;
  auto part = [](int n, const char* unit) { return std::to_string(n) + " " + unit + (n == 1 ? "" : "s"); };
  if (years == 0) return part(rest, "month");
  if (rest == 0) return part(years, "year");
  return part(years, "year") + " " + part(rest, "month");
}

std::string withArticle(const std::string& word) {
  const bool vowel = !word.empty() && std::string("aeiou").find(word[0]) != std::string::npos;
  return (vowel ? "an " : "a ") + word;
}

double need(const StatMap& needs, const std::string& id) {
  auto it = needs.find(id);
  return it == needs.end() ? 0 : it->second;
}

std::int64_t weekOf(GameMinutes t) { return toDateTime(t).dayIndex / kDaysPerWeek; }

}  // namespace

// ---- Content -------------------------------------------------------------------------------
Status ContentDatabase::ingestPets(const std::string& source, const std::string& section, const Json& body, bool& handled) {
  handled = section == "pets" || section == "medicine";
  if (!handled) return okStatus();
  try {
    if (section == "pets") {
      if (havePets_) return fail("content_duplicate", source + ": 'pets' defined twice");
      havePets_ = true;
      PetConfig& P = pets_;
      P.shelter = body.at("shelter").get<std::string>();
      P.vet = body.at("vet").get<std::string>();
      P.foodItem = body.value("food_item", "");
      P.needs = readStrings(body, "needs");
      P.adoptedNeeds = readStats(body, "adopted_needs");
      P.listingsPerWeek = body.value("listings_per_week", P.listingsPerWeek);
      P.maxPetsPerHome = body.value("max_pets_per_home", P.maxPetsPerHome);
      P.initialBond = body.value("initial_bond", P.initialBond);
      P.maxNameLength = body.value("max_name_length", P.maxNameLength);
      P.adoptionVaccineDays = body.value("adoption_vaccine_days", P.adoptionVaccineDays);
      P.routineTarget = body.value("routine_target", P.routineTarget);
      P.warnBelow = body.value("warn_below", P.warnBelow);
      P.neglectHungerHours = body.value("neglect_hunger_hours", P.neglectHungerHours);
      P.neglectBelow = body.value("neglect_below", P.neglectBelow);
      P.bondLossPerNeglectedHour = body.value("bond_loss_per_neglected_hour", P.bondLossPerNeglectedHour);
      if (body.contains("company")) {
        const Json& c = body.at("company");
        P.companyMinBond = c.value("min_bond", P.companyMinBond);
        P.companyEmotionsPerHour = readStats(c, "emotions_per_hour");
      }
      P.adoptionEmotions = readStats(body, "adoption_emotions");
      P.walkRadiusMeters = body.value("walk_radius_m", P.walkRadiusMeters);
      if (body.contains("sickness")) {
        const Json& s = body.at("sickness");
        P.sickChancePerHour = s.value("chance_per_hour", P.sickChancePerHour);
        P.sickLowNeedBelow = s.value("low_need_below", P.sickLowNeedBelow);
        P.sickLowNeedMultiplier = s.value("low_need_multiplier", P.sickLowNeedMultiplier);
        P.sickVaccinatedMultiplier = s.value("vaccinated_multiplier", P.sickVaccinatedMultiplier);
        P.sickNeedsPerHour = readStats(s, "needs_per_hour");
      }
      P.takenAwayEmotions = readStats(body, "taken_away_emotions");
      for (const auto& j : body.at("species")) {
        PetSpeciesDef s;
        s.id = j.at("id").get<std::string>();
        s.label = j.at("label").get<std::string>();
        s.adoptionFeeCents = j.at("adoption_fee_cents").get<Cents>();
        s.needsPerHour = readStats(j, "needs_per_hour");
        for (const auto& st : j.at("stages")) {
          s.stages.push_back(PetStageDef{st.at("id").get<std::string>(), st.at("min_age_months").get<int>(),
                                         st.value("needs_multiplier", 1.0), st.value("sick_multiplier", 1.0)});
        }
        if (j.contains("shelter_age_months")) {
          s.shelterMinAgeMonths = j.at("shelter_age_months").at(0).get<int>();
          s.shelterMaxAgeMonths = j.at("shelter_age_months").at(1).get<int>();
        }
        s.breeds = readStrings(j, "breeds");
        s.names = readStrings(j, "names");
        if (auto st = insertUnique(P.species, "pet species", s.id, s); !st) return st;
      }
      for (const auto& j : body.value("actions", Json::array())) {
        PetActionDef a;
        a.id = j.at("id").get<std::string>();
        a.label = j.at("label").get<std::string>();
        a.species = readStrings(j, "species");
        a.where = j.value("where", a.where);
        a.usesItem = j.value("uses_item", "");
        a.cooldownMinutes = j.value("cooldown_minutes", a.cooldownMinutes);
        a.petNeeds = readStats(j, "pet_needs");
        a.yourNeeds = readStats(j, "your_needs");
        a.yourEmotions = readStats(j, "your_emotions");
        a.caloriesBurned = j.value("calories_burned", 0.0);
        a.bond = j.value("bond", 0.0);
        P.actions.push_back(std::move(a));
      }
      for (const auto& j : body.value("illnesses", Json::array())) {
        P.illnesses.push_back(
            PetIllnessDef{j.at("id").get<std::string>(), j.at("name").get<std::string>(), readStrings(j, "species")});
      }
      for (const auto& j : body.value("vet_services", Json::array())) {
        VetServiceDef v;
        v.id = j.at("id").get<std::string>();
        v.label = j.at("label").get<std::string>();
        v.priceCents = j.at("price_cents").get<Cents>();
        v.petNeeds = readStats(j, "pet_needs");
        v.diagnoses = j.value("diagnoses", false);
        v.cures = j.value("cures", false);
        v.vaccinatesDays = j.value("vaccinates_days", 0);
        P.vetServices.push_back(std::move(v));
      }
    } else {
      if (haveMedicine_) return fail("content_duplicate", source + ": 'medicine' defined twice");
      haveMedicine_ = true;
      MedicineConfig& M = medicine_;
      M.doseWindowHours = body.value("dose_window_hours", M.doseWindowHours);
      M.overdoseHealthLoss = body.value("overdose_health_loss", M.overdoseHealthLoss);
      M.emergencyAfterExtraDoses = body.value("emergency_after_extra_doses", M.emergencyAfterExtraDoses);
      M.emergencyBelowHealth = body.value("emergency_below_health", M.emergencyBelowHealth);
      M.hospital = body.at("hospital").get<std::string>();
      M.emergencyBillCents = body.value("emergency_bill_cents", M.emergencyBillCents);
      M.stabilisedHealth = body.value("stabilised_health", M.stabilisedHealth);
      for (const auto& j : body.at("medicines")) {
        MedicineDef m;
        m.item = j.at("item").get<std::string>();
        m.dailyLimit = j.value("daily_limit", 0);
        m.overdoseHealthLoss = j.value("overdose_health_loss", -1.0);
        if (j.contains("prescription")) {
          const Json& rx = j.at("prescription");
          m.prescription = true;
          m.prescribedFor = readStrings(rx, "for");
          m.fills = rx.value("fills", m.fills);
          m.validDays = rx.value("valid_days", m.validDays);
        }
        if (j.contains("dangerous_with")) {
          const Json& d = j.at("dangerous_with");
          m.dangerousWith = d.at("substance").get<std::string>();
          m.dangerWithinMinutes = d.value("within_minutes", m.dangerWithinMinutes);
          m.dangerNeeds = readStats(d, "needs");
          m.dangerEmotions = readStats(d, "emotions");
          m.dangerEmergency = d.value("emergency", false);
        }
        if (auto st = insertUnique(M.medicines, "medicine", m.item, m); !st) return st;
      }
    }
  } catch (const std::exception& e) {
    return fail("content_invalid", source + ": " + e.what());
  }
  return okStatus();
}

Status ContentDatabase::validatePets() const {
  std::set<std::string> needs, emotions(sim_.emotions.begin(), sim_.emotions.end()), orgs;
  for (const auto& n : sim_.needs) needs.insert(n.id);
  for (const auto& o : orgAccounts_) orgs.insert(o.id);
  auto placeWithTill = [&](const LocationId& id, const std::string& what) -> Status {
    const LocationDef* l = location(id);
    if (!l) return fail("content_invalid", what + ": unknown location " + id);
    if (!orgs.count(l->revenueAccount)) return fail("content_invalid", what + ": " + id + " needs a revenue_account");
    return okStatus();
  };
  if (havePets_) {
    const PetConfig& P = pets_;
    if (auto s = placeWithTill(P.shelter, "pets.shelter"); !s) return s;
    if (auto s = placeWithTill(P.vet, "pets.vet"); !s) return s;
    if (!P.foodItem.empty() && !item(P.foodItem)) return fail("content_invalid", "pets: unknown food_item " + P.foodItem);
    const std::set<std::string> petNeeds(P.needs.begin(), P.needs.end());
    if (!petNeeds.count("hunger") || !petNeeds.count("health"))
      return fail("content_invalid", "pets.needs must include hunger and health (neglect is judged by them)");
    if (auto s = checkKeys(P.adoptedNeeds, petNeeds, "pets.adopted_needs"); !s) return s;
    if (auto s = checkKeys(P.sickNeedsPerHour, petNeeds, "pets.sickness.needs_per_hour"); !s) return s;
    if (auto s = checkKeys(P.takenAwayEmotions, emotions, "pets.taken_away_emotions"); !s) return s;
    if (auto s = checkKeys(P.companyEmotionsPerHour, emotions, "pets.company.emotions_per_hour"); !s) return s;
    if (auto s = checkKeys(P.adoptionEmotions, emotions, "pets.adoption_emotions"); !s) return s;
    if (P.listingsPerWeek < 0 || P.maxPetsPerHome < 1 || P.maxNameLength < 1 || P.neglectHungerHours < 1 ||
        P.adoptionVaccineDays < 0)
      return fail("content_invalid", "pets: bad limits");
    for (double p : {P.sickChancePerHour, P.sickVaccinatedMultiplier}) {
      if (p < 0 || p > 1) return fail("content_invalid", "pets.sickness: chances are 0-1");
    }
    if (P.species.empty()) return fail("content_invalid", "pets: no species");
    for (const auto& [id, s] : P.species) {
      const std::string where = "pet species " + id;
      if (auto st = checkKeys(s.needsPerHour, petNeeds, where); !st) return st;
      if (s.adoptionFeeCents < 0) return fail("content_invalid", where + ": negative adoption fee");
      if (s.stages.empty() || s.stages.front().minAgeMonths != 0) return fail("content_invalid", where + ": stages must start at 0 months");
      for (std::size_t i = 1; i < s.stages.size(); ++i) {
        if (s.stages[i].minAgeMonths <= s.stages[i - 1].minAgeMonths)
          return fail("content_invalid", where + ": stages must be in increasing age order");
      }
      if (s.names.empty() || s.breeds.empty()) return fail("content_invalid", where + ": needs names and breeds");
      if (s.shelterMinAgeMonths < 0 || s.shelterMaxAgeMonths < s.shelterMinAgeMonths)
        return fail("content_invalid", where + ": shelter_age_months must be [min, max]");
    }
    std::set<std::string> ids;
    for (const auto& a : P.actions) {
      const std::string where = "pet action " + a.id;
      if (!ids.insert(a.id).second) return fail("content_duplicate", "duplicate " + where);
      if (a.where != "home" && a.where != "outdoors") return fail("content_invalid", where + ": where must be home or outdoors");
      for (const auto& sp : a.species) {
        if (!P.species.count(sp)) return fail("content_invalid", where + ": unknown species " + sp);
      }
      if (!a.usesItem.empty() && !item(a.usesItem)) return fail("content_invalid", where + ": unknown item " + a.usesItem);
      if (a.cooldownMinutes < 0) return fail("content_invalid", where + ": negative cooldown");
      if (auto s = checkKeys(a.petNeeds, petNeeds, where); !s) return s;
      if (auto s = checkKeys(a.yourNeeds, needs, where); !s) return s;
      if (auto s = checkKeys(a.yourEmotions, emotions, where); !s) return s;
    }
    ids.clear();
    for (const auto& i : P.illnesses) {
      if (!ids.insert(i.id).second) return fail("content_duplicate", "duplicate pet illness " + i.id);
      for (const auto& sp : i.species) {
        if (!P.species.count(sp)) return fail("content_invalid", "pet illness " + i.id + ": unknown species " + sp);
      }
    }
    ids.clear();
    for (const auto& v : P.vetServices) {
      const std::string where = "vet service " + v.id;
      if (!ids.insert(v.id).second) return fail("content_duplicate", "duplicate " + where);
      if (v.priceCents < 0 || v.vaccinatesDays < 0) return fail("content_invalid", where + ": negative price or days");
      if (auto s = checkKeys(v.petNeeds, petNeeds, where); !s) return s;
    }
  }
  if (haveMedicine_) {
    const MedicineConfig& M = medicine_;
    if (auto s = placeWithTill(M.hospital, "medicine.hospital"); !s) return s;
    if (M.doseWindowHours < 1 || M.emergencyAfterExtraDoses < 1 || M.emergencyBillCents < 0)
      return fail("content_invalid", "medicine: bad dose window, emergency threshold or bill");
    for (const auto& [id, m] : M.medicines) {
      const std::string where = "medicine " + id;
      const ItemDef* it = item(id);
      if (!it || !it->usable) return fail("content_invalid", where + ": must be a usable item");
      if (m.dailyLimit < 0) return fail("content_invalid", where + ": negative daily_limit");
      if (m.prescription) {
        if (m.fills < 1 || m.validDays < 1) return fail("content_invalid", where + ": a prescription needs fills and valid_days");
        if (m.prescribedFor.empty()) return fail("content_invalid", where + ": a prescription is written for a condition");
        for (const auto& c : m.prescribedFor) {
          if (!condition(c)) return fail("content_invalid", where + ": unknown condition " + c);
        }
      }
      if (!m.dangerousWith.empty() && !substance(m.dangerousWith))
        return fail("content_invalid", where + ": unknown substance " + m.dangerousWith);
      if (auto s = checkKeys(m.dangerNeeds, needs, where); !s) return s;
      if (auto s = checkKeys(m.dangerEmotions, emotions, where); !s) return s;
    }
  }
  return okStatus();
}

const PetSpeciesDef* ContentDatabase::petSpecies(const std::string& id) const {
  auto it = pets_.species.find(id);
  return it == pets_.species.end() ? nullptr : &it->second;
}

const PetActionDef* ContentDatabase::petAction(const std::string& id) const {
  for (const auto& a : pets_.actions) {
    if (a.id == id) return &a;
  }
  return nullptr;
}

const VetServiceDef* ContentDatabase::vetService(const std::string& id) const {
  for (const auto& v : pets_.vetServices) {
    if (v.id == id) return &v;
  }
  return nullptr;
}

const MedicineDef* ContentDatabase::medicineFor(const std::string& item) const {
  auto it = medicine_.medicines.find(item);
  return it == medicine_.medicines.end() ? nullptr : &it->second;
}

// ---- Who lives with whom -------------------------------------------------------------------
std::string World::residenceOf(const CharacterId& id) const {
  if (const PropertyState* mine = homeOf(id)) return mine->id;
  // A grown child still living in the home they grew up in.
  const CharacterState* c = character(id);
  const CharacterDef* def = definition(id);
  if (!c || !def) return "";
  auto it = state_.properties.find(def->homeProperty);
  if (it == state_.properties.end() || it->second.tenant.empty()) return "";
  return std::find(c->parents.begin(), c->parents.end(), it->second.tenant) != c->parents.end() ? it->first : "";
}

std::string World::petHomeOf(const PetState& p) const {
  if (p.owner.empty()) return "";
  const std::string home = residenceOf(p.owner);
  return home.empty() ? p.home : home;
}

bool World::livesWithPet(const CharacterId& id, const PetState& p) const {
  if (p.owner.empty()) return false;
  if (id == p.owner) return true;
  const std::string home = petHomeOf(p);
  return !home.empty() && residenceOf(id) == home;
}

std::vector<CharacterId> World::householdOf(const PetState& p) const {
  std::vector<CharacterId> out;
  for (const auto& [id, c] : state_.characters) {
    if (livesWithPet(id, p)) out.push_back(id);
  }
  return out;
}

PetState* World::householdPet(const CharacterId& actor, const std::string& idOrName) {
  auto it = state_.pets.find(idOrName);
  if (it != state_.pets.end()) return livesWithPet(actor, it->second) ? &it->second : nullptr;
  const std::string wanted = lower(trim(idOrName));
  for (auto& [id, p] : state_.pets) {
    if (lower(p.name) == wanted && livesWithPet(actor, p)) return &p;
  }
  return nullptr;
}

const PetState* World::pet(const std::string& id) const {
  auto it = state_.pets.find(id);
  return it == state_.pets.end() ? nullptr : &it->second;
}

int World::petAgeMonths(const PetState& p) const {
  if (state_.now <= p.bornAt) return 0;
  return static_cast<int>((state_.now - p.bornAt) / kMinutesPerMonth);
}

std::string World::petStageOf(const PetState& p) const {
  const PetSpeciesDef* s = content_->petSpecies(p.species);
  if (!s) return "";
  const int months = petAgeMonths(p);
  std::string stage;
  for (const auto& st : s->stages) {
    if (months >= st.minAgeMonths) stage = st.id;
  }
  return stage;
}

// ---- The shelter ---------------------------------------------------------------------------
std::vector<PetState> World::shelterAnimals(std::int64_t week) const {
  const PetConfig& P = content_->pets();
  std::vector<PetState> out;
  if (P.species.empty() || week < 0) return out;
  std::vector<const PetSpeciesDef*> kinds;
  for (const auto& [id, s] : P.species) kinds.push_back(&s);
  const GameMinutes weekStart = week * kMinutesPerWeek;
  std::vector<std::string> taken;
  for (int slot = 0; slot < P.listingsPerWeek; ++slot) {
    const std::uint64_t h = mix(static_cast<std::uint64_t>(week) * 7919u + static_cast<std::uint64_t>(slot) + 1);
    // Species rotate through the slots, so every week has some of each.
    const PetSpeciesDef& s = *kinds[static_cast<std::size_t>(week + slot) % kinds.size()];
    PetState p;
    p.id = "w" + std::to_string(week) + "-" + std::to_string(slot + 1);
    p.species = s.id;
    p.breed = s.breeds[h % s.breeds.size()];
    std::size_t n = (h >> 16) % s.names.size();
    for (std::size_t tries = 0; tries < s.names.size() && std::find(taken.begin(), taken.end(), s.names[n]) != taken.end(); ++tries)
      n = (n + 1) % s.names.size();
    p.name = s.names[n];
    taken.push_back(p.name);
    const auto span = static_cast<std::uint64_t>(s.shelterMaxAgeMonths - s.shelterMinAgeMonths + 1);
    const int months = s.shelterMinAgeMonths + static_cast<int>((h >> 32) % span);
    p.bornAt = weekStart - months * kMinutesPerMonth - static_cast<GameMinutes>((h >> 8) % kDaysPerMonth) * kMinutesPerDay;
    p.needs = P.adoptedNeeds;
    for (const auto& need : P.needs) p.needs.try_emplace(need, P.routineTarget);
    out.push_back(std::move(p));
  }
  return out;
}

Json World::shelterListings() const {
  Json out = Json::array();
  for (const auto& p : shelterAnimals(weekOf(state_.now))) {
    if (!state_.adoptedListings.count(p.id)) out.push_back(petView(p, ""));
  }
  for (const auto& [id, p] : state_.pets) {
    if (p.owner.empty()) out.push_back(petView(p, ""));
  }
  return out;
}

Json World::petView(const PetState& p, const CharacterId& viewer) const {
  const PetSpeciesDef* s = content_->petSpecies(p.species);
  const int months = petAgeMonths(p);
  Json out{{"id", p.id},     {"name", p.name},          {"species", p.species}, {"kind", s ? s->label : p.species},
           {"breed", p.breed}, {"age_months", months}, {"age", ageText(months)}, {"stage", petStageOf(p)}};
  if (p.owner.empty()) {
    out["fee_cents"] = s ? s->adoptionFeeCents : 0;
    out["brought_back"] = state_.pets.count(p.id) > 0;
    return out;
  }
  Json needs = Json::object();
  for (const auto& [k, v] : p.needs) needs[k] = std::round(v);
  out["needs"] = needs;
  auto mine = p.bond.find(viewer);
  out["bond"] = mine == p.bond.end() ? 0.0 : std::round(mine->second);
  const CharacterDef* owner = definition(p.owner);
  out["owner"] = owner ? owner->fullName() : p.owner;
  out["yours"] = viewer == p.owner;
  out["sick"] = !p.illness.empty();
  if (!p.illness.empty() && p.illnessKnown) {
    for (const auto& i : content_->pets().illnesses) {
      if (i.id == p.illness) out["illness"] = i.name;
    }
  }
  out["vaccinated"] = p.vaccinatedUntil > state_.now;
  if (p.vaccinatedUntil > state_.now) out["vaccinated_until"] = formatDateTime(p.vaccinatedUntil);
  const PropertyDef* home = content_->property(petHomeOf(p));
  const LocationDef* loc = home ? content_->location(home->location) : nullptr;
  out["home"] = loc ? loc->name : "";
  Json waits = Json::object();
  for (const auto& [action, at] : p.readyAt) {
    if (at > state_.now) waits[action] = at - state_.now;
  }
  out["ready_in_minutes"] = waits;
  return out;
}

// ---- Commands ------------------------------------------------------------------------------
Result<Json> World::adoptPet(const CharacterId& actor, const std::string& petId, const std::string& name,
                             const std::string& paymentMethod) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  if (Status st = freeToAct(c); !st) return st.error();
  const PetConfig& P = content_->pets();
  const LocationDef* shelter = content_->location(P.shelter);
  if (!shelter || P.species.empty()) return fail("unavailable", "there's no animal shelter in town");
  if (c.inside != shelter->id) return fail("wrong_place", "adopt in person at " + shelter->name);
  if (!isLocationOpen(*shelter)) return fail("closed", shelter->name + " is closed");

  // The animal: one of this week's listings, or one brought back to the shelter. By id or name.
  const std::int64_t week = weekOf(state_.now);
  const std::string wanted = lower(trim(petId));
  std::optional<PetState> listing;
  PetState* returned = nullptr;
  for (auto& [id, p] : state_.pets) {
    if (p.owner.empty() && (id == petId || lower(p.name) == wanted)) returned = &p;
  }
  if (!returned) {
    for (auto& p : shelterAnimals(week)) {
      if (!listing && !state_.adoptedListings.count(p.id) && (p.id == petId || lower(p.name) == wanted)) listing = p;
    }
  }
  if (!returned && !listing) return fail("unknown_pet", "the shelter has no animal by that name or id (phone pets lists them)");
  const PetState& animal = returned ? *returned : *listing;
  if (animal.takenFrom == actor)
    return fail("refused", "the shelter won't let you adopt " + animal.name + " again after animal control took them from you");
  const PetSpeciesDef* species = content_->petSpecies(animal.species);
  if (!species) return fail("unknown_pet", "the shelter can't place that animal right now");

  const std::string home = residenceOf(actor);
  if (home.empty()) return fail("no_home", "you need a home to bring a pet to");
  int atHome = 0;
  for (const auto& [id, p] : state_.pets) atHome += !p.owner.empty() && petHomeOf(p) == home ? 1 : 0;
  if (atHome >= P.maxPetsPerHome)
    return fail("too_many_pets", "your home already has " + std::to_string(atHome) + " pets; the shelter won't place another");
  const std::string newName = trim(name);
  if (static_cast<int>(newName.size()) > P.maxNameLength ||
      std::any_of(newName.begin(), newName.end(), [](char ch) { return static_cast<unsigned char>(ch) < 0x20; }))
    return fail("bad_name", "a pet's name is up to " + std::to_string(P.maxNameLength) + " characters");

  LedgerAccountId from;
  if (paymentMethod == "card") from = bankAccountOf(actor);
  else if (paymentMethod == "cash") from = cashAccountOf(actor);
  else return fail("invalid_payment", "pay by card or cash");
  auto tx = state_.ledger.transfer(from, shelter->revenueAccount, species->adoptionFeeCents, "adoption",
                                   "Adopting " + animal.name + " at " + shelter->name, state_.now);
  if (!tx) return tx.error();

  PetState p = animal;
  if (!returned) {
    p.id = nextId("pet");
    state_.adoptedListings[animal.id] = actor;
    state_.shelterWeek = week;
  }
  if (!newName.empty()) p.name = newName;
  p.owner = actor;
  p.home = home;
  p.bond.clear();
  p.bond[actor] = P.initialBond;
  p.adoptedAt = state_.now;
  p.takenFrom.clear();
  p.starvingSince = -1;
  p.hungerWarned = false;
  p.readyAt.clear();
  p.stage = petStageOf(p);
  if (P.adoptionVaccineDays > 0)
    p.vaccinatedUntil = std::max(p.vaccinatedUntil, state_.now + P.adoptionVaccineDays * kMinutesPerDay);
  const std::string id = p.id;
  state_.pets[id] = std::move(p);
  const PetState& mine = state_.pets.at(id);

  applyEmotions(c, P.adoptionEmotions);
  Memory m;
  m.id = nextId("mem");
  m.owner = actor;
  m.at = state_.now;
  m.participants = {actor};
  m.location = shelter->id;
  m.type = "adopted_pet";
  m.importance = kAdoptionImportance;
  m.emotionalImpact = kAdoptionImpact;
  m.info = "Adopted " + mine.name + ", " + withArticle(lower(species->label));
  addMemory(std::move(m));
  const CharacterDef* me = definition(actor);
  for (const auto& other : householdOf(mine)) {
    if (other != actor)
      notify(other, "pets", (me ? me->firstName : actor) + " adopted " + mine.name + ", " + withArticle(lower(species->label)) + ". They live with you now.");
  }
  const PropertyDef* homeDef = content_->property(home);
  const LocationDef* homeLoc = homeDef ? content_->location(homeDef->location) : nullptr;
  Json out = petView(mine, actor);
  out["tx"] = tx.value();
  out["fee_cents"] = species->adoptionFeeCents;
  out["paid_with"] = paymentMethod;
  out["balance_cents"] = state_.ledger.balance(from);
  out["home"] = homeLoc ? homeLoc->name : home;
  return out;
}

Result<Json> World::careForPet(const CharacterId& actor, const std::string& petId, const std::string& action) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  if (Status st = freeToAct(c); !st) return st.error();
  PetState* p = householdPet(actor, petId);
  if (!p) return fail("not_your_pet", "no pet by that name or id lives with you");
  const PetActionDef* act = content_->petAction(action);
  if (!act) return fail("unknown_action", "no such pet care (phone pets lists them)");
  const PetSpeciesDef* species = content_->petSpecies(p->species);
  if (!act->species.empty() && std::find(act->species.begin(), act->species.end(), p->species) == act->species.end())
    return fail("wrong_species", "you can't " + lower(act->label) + " " + withArticle(species ? lower(species->label) : p->species));
  const PropertyDef* home = content_->property(petHomeOf(*p));
  const LocationDef* homeLoc = home ? content_->location(home->location) : nullptr;
  if (!homeLoc) return fail("no_home", p->name + " has no home to be looked after in");
  if (act->where == "home") {
    if (c.inside != homeLoc->id) return fail("wrong_place", "you need to be home with " + p->name);
  } else {
    if (!c.inside.empty()) return fail("go_outside", "go outside first: a " + lower(act->label) + " is outdoors");
    if (distance(c.position, homeLoc->door) > content_->pets().walkRadiusMeters)
      return fail("too_far", p->name + " is at home: start from your street");
  }
  auto ready = p->readyAt.find(act->id);
  if (ready != p->readyAt.end() && state_.now < ready->second)
    return fail("too_soon", p->name + " has just had that; try again in " + std::to_string(ready->second - state_.now) + " minutes");
  if (!act->usesItem.empty()) {
    if (!owns(actor, act->usesItem)) {
      const ItemDef* food = content_->item(act->usesItem);
      return fail("missing_item", "you need " + lower(food ? food->label : act->usesItem) + " (Greenleaf Market and the shelter sell it)");
    }
    if (--c.inventory[act->usesItem] <= 0) c.inventory.erase(act->usesItem);
  }
  p->readyAt[act->id] = state_.now + act->cooldownMinutes;
  for (const auto& [k, d] : act->petNeeds) p->needs[k] = clampd(p->needs[k] + d, kStatMin, kStatMax);
  if (need(p->needs, "hunger") > 0) p->starvingSince = -1;
  if (need(p->needs, "hunger") >= content_->pets().warnBelow) p->hungerWarned = false;
  applyNeeds(c, act->yourNeeds);
  applyEmotions(c, act->yourEmotions);
  c.caloriesOut += act->caloriesBurned;
  // Attachment grows fast at first and slowly once it's deep, like a relationship.
  double& bond = p->bond[actor];
  if (act->bond > 0) bond = clampd(bond + act->bond * std::max(0.1, 1.0 - bond / 150.0), kStatMin, kStatMax);
  Json needs = Json::object();
  for (const auto& [k, v] : p->needs) needs[k] = std::round(v);
  Json yours = Json::object();
  for (const auto& [k, d] : act->yourNeeds) yours[k] = std::round(c.needs[k]);
  Json out{{"pet", p->id}, {"name", p->name}, {"action", act->label}, {"needs", needs}, {"bond", std::round(bond)}};
  if (!yours.empty()) out["your_needs"] = yours;
  if (!act->usesItem.empty()) out["left"] = c.inventory.count(act->usesItem) ? c.inventory[act->usesItem] : 0;
  return out;
}

Result<Json> World::vetVisit(const CharacterId& actor, const std::string& petId, const std::string& service,
                             const std::string& paymentMethod) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  if (Status st = freeToAct(c); !st) return st.error();
  PetState* p = householdPet(actor, petId);
  if (!p) return fail("not_your_pet", "no pet by that name or id lives with you");
  const VetServiceDef* svc = content_->vetService(service);
  if (!svc) return fail("unknown_service", "the vet doesn't offer that (phone pets lists the services)");
  const LocationDef* vet = content_->location(content_->pets().vet);
  if (!vet) return fail("unavailable", "there's no vet in town");
  if (c.inside != vet->id) return fail("wrong_place", "bring " + p->name + " to " + vet->name);
  if (!isLocationOpen(*vet)) return fail("closed", vet->name + " is closed");
  if (svc->vaccinatesDays > 0 && p->vaccinatedUntil > state_.now)
    return fail("already_vaccinated", p->name + "'s vaccines are good until " + formatDateTime(p->vaccinatedUntil));
  if (svc->cures && p->illness.empty()) return fail("not_sick", p->name + " isn't ill; there's nothing to treat");
  LedgerAccountId from;
  if (paymentMethod == "card") from = bankAccountOf(actor);
  else if (paymentMethod == "cash") from = cashAccountOf(actor);
  else return fail("invalid_payment", "pay by card or cash");
  auto tx = state_.ledger.transfer(from, vet->revenueAccount, svc->priceCents, "vet", svc->label + " for " + p->name + " at " + vet->name,
                                   state_.now);
  if (!tx) return tx.error();
  for (const auto& [k, d] : svc->petNeeds) p->needs[k] = clampd(p->needs[k] + d, kStatMin, kStatMax);
  Json out{{"pet", p->id}, {"name", p->name}, {"service", svc->label}, {"price_cents", svc->priceCents}, {"tx", tx.value()},
           {"balance_cents", state_.ledger.balance(from)}};
  std::string illnessName;
  for (const auto& i : content_->pets().illnesses) {
    if (i.id == p->illness) illnessName = i.name;
  }
  if (svc->diagnoses) {
    p->illnessKnown = !p->illness.empty();
    out["diagnosis"] = p->illness.empty() ? "healthy" : illnessName;
    out["vaccinated"] = p->vaccinatedUntil > state_.now;
  }
  if (svc->cures) {
    out["treated"] = illnessName;
    p->illness.clear();
    p->illnessKnown = false;
    for (const auto& id : householdOf(*p)) {
      if (id != actor) notify(id, "pets", p->name + " saw the vet for " + illnessName + " and is on the mend.");
    }
  }
  if (svc->vaccinatesDays > 0) {
    p->vaccinatedUntil = state_.now + svc->vaccinatesDays * kMinutesPerDay;
    out["vaccinated_until"] = formatDateTime(p->vaccinatedUntil);
  }
  Json needs = Json::object();
  for (const auto& [k, v] : p->needs) needs[k] = std::round(v);
  out["needs"] = needs;
  payVetsOnDuty(actor, *vet, svc->priceCents, out);
  return out;
}

// Vets on shift earn their share of what's paid while they're on duty (career care_fee_share).
void World::payVetsOnDuty(const CharacterId& client, const LocationDef& where, Cents price, Json& out) {
  Json seen = Json::array();
  for (auto& [id, c] : state_.characters) {
    if (id == client || !c.online || !c.career.shiftStartedAt || c.career.shiftLocation != where.id) continue;
    const CareerDef* career = content_->career(c.career.careerId);
    if (!career || career->careFeeShare <= 0) continue;
    const Cents fee = static_cast<Cents>(std::llround(static_cast<double>(price) * career->careFeeShare));
    if (fee > 0 && state_.ledger.transfer(career->employerAccount, bankAccountOf(id), fee, "care_fee", "Patient care at " + where.name,
                                          state_.now)) {
      const CharacterDef* cd = definition(client);
      notify(id, "career", "You saw " + (cd ? cd->fullName() : client) + "'s pet: +" + formatMoney(fee) + ".");
    }
    adjustRelationship(client, id, "respect", 2);
    const CharacterDef* vd = definition(id);
    seen.push_back(vd ? vd->fullName() : id);
  }
  if (!seen.empty()) out["seen_by"] = seen;
}

// ---- Simulation ----------------------------------------------------------------------------
void World::stepPetsHourly() {
  for (auto& [id, c] : state_.characters) stepMedicineHourly(c);
  if (content_->pets().species.empty()) return;
  // A new week, a new set of listings: last week's adoption records can go.
  const std::int64_t week = weekOf(state_.now);
  if (state_.shelterWeek != week) {
    const std::string prefix = "w" + std::to_string(week) + "-";
    std::erase_if(state_.adoptedListings, [&](const auto& kv) { return kv.first.rfind(prefix, 0) != 0; });
    state_.shelterWeek = week;
  }
  for (auto& [id, p] : state_.pets) stepPet(p);
}

void World::stepPet(PetState& p) {
  const PetConfig& P = content_->pets();
  const PetSpeciesDef* species = content_->petSpecies(p.species);
  if (!species) return;  // a species taken out of content: leave the record alone
  if (p.owner.empty()) {
    // At the shelter the staff feed, clean, play with and treat them.
    for (const auto& n : P.needs) {
      double& v = p.needs[n];
      v = clampd(v + (P.routineTarget - v) * kRoutineRatePerHour, kStatMin, kStatMax);
    }
    p.illness.clear();
    p.illnessKnown = false;
    return;
  }
  if (!character(p.owner)) {
    petToShelter(p, "their owner is gone", false);
    return;
  }
  const std::string home = residenceOf(p.owner);
  const PropertyDef* homeDef = content_->property(home);
  const LocationDef* homeLoc = homeDef ? content_->location(homeDef->location) : nullptr;
  if (!homeLoc) {
    petToShelter(p, "there was no home to keep them in", false);
    return;
  }
  if (home != p.home) {
    p.home = home;
    notify(p.owner, "pets", p.name + " moved with you to " + homeLoc->name + ".");
  }
  const std::vector<CharacterId> household = householdOf(p);

  // Growing up.
  const std::string stage = petStageOf(p);
  if (stage != p.stage) {
    const bool told = !p.stage.empty();
    p.stage = stage;
    if (told) {
      for (const auto& id : household) notify(id, "pets", p.name + " is growing up: " + withArticle(stage) + " now.");
    }
  }
  const PetStageDef* stageDef = nullptr;
  for (const auto& st : species->stages) {
    if (st.id == stage) stageDef = &st;
  }

  // Someone at home who's away and coping keeps them fed and fine; otherwise their needs run down.
  const LifeConfig& L = content_->life();
  bool routine = false;
  for (const auto& id : household) {
    const CharacterState* who = character(id);
    if (!who || who->online || ageOf(id) < L.adultAge || inJail(id) || hasCondition(id, L.depressionCondition) || offlineTooLong(*who))
      continue;
    routine = true;
  }
  if (routine) {
    for (const auto& n : P.needs) {
      double& v = p.needs[n];
      v = clampd(v + (P.routineTarget - v) * kRoutineRatePerHour, kStatMin, kStatMax);
    }
    p.hungerWarned = false;
  } else {
    const double mult = stageDef ? stageDef->needsMultiplier : 1.0;
    for (const auto& [n, perHour] : species->needsPerHour) p.needs[n] = clampd(p.needs[n] + perHour * mult, kStatMin, kStatMax);
  }
  if (!p.illness.empty()) {
    for (const auto& [n, perHour] : P.sickNeedsPerHour) p.needs[n] = clampd(p.needs[n] + perHour, kStatMin, kStatMax);
  }

  // Hunger: a warning, then a day of starving, then animal control.
  const double hunger = need(p.needs, "hunger");
  if (hunger < P.warnBelow && hunger > 0 && !p.hungerWarned) {
    p.hungerWarned = true;
    for (const auto& id : household) notify(id, "pets", p.name + " is hungry.");
  }
  if (hunger <= 0) {
    if (p.starvingSince < 0) {
      p.starvingSince = state_.now;
      for (const auto& id : household)
        notify(id, "pets", p.name + " is starving. If nobody feeds them within " + std::to_string(P.neglectHungerHours) +
                               " hours, animal control will take them.");
    } else if (state_.now - p.starvingSince >= static_cast<GameMinutes>(P.neglectHungerHours) * 60) {
      petToShelter(p, "nobody fed them for " + std::to_string(P.neglectHungerHours) + " hours", true);
      return;
    }
  } else {
    p.starvingSince = -1;
  }
  if (need(p.needs, "health") <= 0) {
    petToShelter(p, "they were left too ill for too long", true);
    return;
  }

  // Neglect wears on the bond.
  const bool neglected = std::any_of(P.needs.begin(), P.needs.end(), [&](const std::string& n) { return need(p.needs, n) < P.neglectBelow; });
  if (neglected) {
    for (auto& [who, b] : p.bond) b = std::max(kStatMin, b - P.bondLossPerNeglectedHour);
  }

  // Falling ill, now and then: more often when neglected or old, less often when vaccinated.
  if (p.illness.empty()) {
    double chance = P.sickChancePerHour * (stageDef ? stageDef->sickMultiplier : 1.0);
    if (std::any_of(P.needs.begin(), P.needs.end(), [&](const std::string& n) { return need(p.needs, n) < P.sickLowNeedBelow; }))
      chance *= P.sickLowNeedMultiplier;
    if (p.vaccinatedUntil > state_.now) chance *= P.sickVaccinatedMultiplier;
    if (chance > 0 && roll() < chance) {
      std::vector<const PetIllnessDef*> options;
      for (const auto& i : P.illnesses) {
        if (i.species.empty() || std::find(i.species.begin(), i.species.end(), p.species) != i.species.end()) options.push_back(&i);
      }
      if (!options.empty()) {
        const auto pick = std::min(options.size() - 1, static_cast<std::size_t>(roll() * static_cast<double>(options.size())));
        p.illness = options[pick]->id;
        p.illnessKnown = false;
        const LocationDef* vet = content_->location(P.vet);
        for (const auto& id : household)
          notify(id, "pets", p.name + " seems unwell: off their food and sleeping a lot. " + (vet ? vet->name : std::string("The vet")) +
                                 " can see what's wrong.");
      }
    }
  }

  // A pet you're close to is company when you're home together.
  for (const auto& id : household) {
    CharacterState* who = mutableCharacter(id);
    if (!who || !who->online || who->inside != homeLoc->id) continue;
    auto b = p.bond.find(id);
    if (b != p.bond.end() && b->second >= P.companyMinBond) applyEmotions(*who, P.companyEmotionsPerHour);
  }
}

// Back to the shelter: taken by animal control (neglect), or because there's no home for them.
void World::petToShelter(PetState& p, const std::string& why, bool neglect) {
  const PetConfig& P = content_->pets();
  const LocationDef* shelter = content_->location(P.shelter);
  const std::string place = shelter ? shelter->name : "the shelter";
  const CharacterId owner = p.owner;
  for (const auto& id : householdOf(p)) {
    notify(id, "pets", (neglect ? "Animal control took " + p.name + " back to " : p.name + " went back to ") + place + ": " + why + ".");
  }
  if (neglect) {
    if (CharacterState* o = mutableCharacter(owner)) {
      applyEmotions(*o, P.takenAwayEmotions);
      Memory m;
      m.id = nextId("mem");
      m.owner = owner;
      m.at = state_.now;
      m.participants = {owner};
      m.type = "lost_pet";
      m.importance = kLostPetImportance;
      m.emotionalImpact = kLostPetImpact;
      m.info = "Animal control took " + p.name;
      addMemory(std::move(m));
    }
    p.takenFrom = owner;
  }
  p.owner.clear();
  p.home.clear();
  p.bond.clear();
  p.starvingSince = -1;
  p.hungerWarned = false;
  p.readyAt.clear();
}

Json World::phonePets(const CharacterState& c) const {
  const PetConfig& P = content_->pets();
  Json pets = Json::array();
  for (const auto& [id, p] : state_.pets) {
    if (livesWithPet(c.id, p)) pets.push_back(petView(p, c.id));
  }
  Json care = Json::array();
  for (const auto& a : P.actions) {
    Json kinds = Json::array();
    for (const auto& s : a.species) kinds.push_back(s);
    care.push_back(Json{{"id", a.id}, {"label", a.label}, {"where", a.where}, {"species", kinds}, {"cooldown_minutes", a.cooldownMinutes}});
  }
  auto place = [&](const LocationId& id) {
    const LocationDef* loc = content_->location(id);
    if (!loc) return Json();
    Json j{{"id", loc->id}, {"name", loc->name}, {"open", isLocationOpen(*loc)}};
    if (loc->hours) j["hours"] = {loc->hours->openHour, loc->hours->closeHour};
    return j;
  };
  Json shelter = place(P.shelter);
  if (shelter.is_object()) shelter["animals"] = shelterListings();
  Json vet = place(P.vet);
  if (vet.is_object()) {
    Json services = Json::array();
    for (const auto& v : P.vetServices) services.push_back(Json{{"id", v.id}, {"label", v.label}, {"price_cents", v.priceCents}});
    vet["services"] = services;
  }
  return Json{{"pets", pets}, {"care", care}, {"shelter", shelter}, {"vet", vet}};
}

// ---- Medicine ------------------------------------------------------------------------------
Status World::checkPrescription(const CharacterState& c, const Offer& offer) const {
  const MedicineDef* med = content_->medicineFor(offer.item);
  if (!med || !med->prescription) return okStatus();
  const ItemDef* item = content_->item(offer.item);
  const std::string label = item ? item->label : offer.item;
  bool expired = false;
  bool usedUp = false;
  for (const auto& rx : c.prescriptions) {
    if (rx.medicine != offer.item) continue;
    if (rx.expiresAt <= state_.now) expired = true;
    else if (rx.refillsLeft <= 0) usedUp = true;
    else return okStatus();
  }
  if (usedUp) return fail("no_refills_left", "your prescription for " + label + " has no fills left; see a doctor again");
  if (expired) return fail("prescription_expired", "your prescription for " + label + " has expired; see a doctor again");
  return fail("needs_prescription", label + " needs a prescription: a doctor writes one when a checkup finds what it treats");
}

void World::fillPrescription(CharacterState& c, const Offer& offer, Json& out) {
  const MedicineDef* med = content_->medicineFor(offer.item);
  if (!med || !med->prescription) return;
  for (auto& rx : c.prescriptions) {
    if (rx.medicine != offer.item || rx.expiresAt <= state_.now || rx.refillsLeft <= 0) continue;
    rx.refillsLeft -= 1;
    out["prescription"] = Json{{"refills_left", rx.refillsLeft}, {"expires", formatDateTime(rx.expiresAt)}};
    return;
  }
}

// A doctor who has diagnosed something a prescription medicine treats writes one, unless
// you already have a good one for it.
Json World::writePrescriptions(CharacterState& c, const LocationDef& where) {
  Json written = Json::array();
  for (const auto& [itemId, med] : content_->medicine().medicines) {
    if (!med.prescription) continue;
    std::string forCondition;
    for (const auto& cond : med.prescribedFor) {
      for (const auto& k : c.conditions) {
        if (k.id == cond && k.diagnosed && forCondition.empty()) forCondition = cond;
      }
    }
    if (forCondition.empty()) continue;
    auto it = std::find_if(c.prescriptions.begin(), c.prescriptions.end(), [&](const PrescriptionState& rx) { return rx.medicine == itemId; });
    if (it != c.prescriptions.end() && it->expiresAt > state_.now && it->refillsLeft > 0) continue;
    PrescriptionState rx{itemId, forCondition, med.fills, state_.now, state_.now + med.validDays * kMinutesPerDay, where.name};
    if (it != c.prescriptions.end()) *it = rx;
    else c.prescriptions.push_back(rx);
    const ItemDef* item = content_->item(itemId);
    const ConditionDef* cond = content_->condition(forCondition);
    const std::string label = item ? item->label : itemId;
    notify(c.id, "health", "The doctor at " + where.name + " prescribed " + label + " for " + (cond ? cond->name : forCondition) + ": " +
                               std::to_string(med.fills) + (med.fills == 1 ? " fill" : " fills") + " at the pharmacy, until " +
                               formatDateTime(rx.expiresAt) + ".");
    written.push_back(Json{{"medicine", itemId}, {"label", label}, {"for", cond ? cond->name : forCondition}, {"refills_left", rx.refillsLeft},
                           {"expires", formatDateTime(rx.expiresAt)}});
  }
  return written;
}

// After a medicine is taken (useItem): count the dose against the daily limit, and check what
// else is in your system.
Json World::takeMedicineDose(CharacterState& c, const ItemDef& item) {
  const MedicineDef* med = content_->medicineFor(item.id);
  if (!med) return Json();
  const MedicineConfig& M = content_->medicine();
  auto& doses = c.medicineDoses[item.id];
  const GameMinutes window = static_cast<GameMinutes>(M.doseWindowHours) * 60;
  std::erase_if(doses, [&](GameMinutes t) { return state_.now - t >= window; });
  doses.push_back(state_.now);
  const int taken = static_cast<int>(doses.size());
  Json out{{"doses_today", taken}};
  if (med->dailyLimit > 0) out["daily_limit"] = med->dailyLimit;
  std::string emergency;
  if (med->dailyLimit > 0 && taken > med->dailyLimit) {
    const double loss = med->overdoseHealthLoss >= 0 ? med->overdoseHealthLoss : M.overdoseHealthLoss;
    c.needs["health"] = clampd(c.needs["health"] - loss, kStatMin, kStatMax);
    out["overdose"] = true;
    if (taken - med->dailyLimit >= M.emergencyAfterExtraDoses || c.needs["health"] <= M.emergencyBelowHealth)
      emergency = "an overdose of " + lower(item.label);
    else
      notify(c.id, "health", "That's more " + lower(item.label) + " than is safe in a day (" + std::to_string(med->dailyLimit) +
                                 "). You feel awful.");
  } else if (med->dailyLimit > 0 && taken == med->dailyLimit) {
    out["warning"] = "that's the most " + lower(item.label) + " that's safe in a day";
  }
  // Some medicine must not be mixed: a sleep aid on top of a drink.
  if (!med->dangerousWith.empty()) {
    bool inSystem = c.highOn == med->dangerousWith;
    auto uses = c.recentUses.find(med->dangerousWith);
    if (uses != c.recentUses.end()) {
      for (GameMinutes t : uses->second) inSystem = inSystem || state_.now - t <= med->dangerWithinMinutes;
    }
    if (inSystem) {
      const SubstanceDef* s = content_->substance(med->dangerousWith);
      const std::string what = s ? s->name : med->dangerousWith;
      applyNeeds(c, med->dangerNeeds);
      applyEmotions(c, med->dangerEmotions);
      out["mixed_with"] = what;
      if (med->dangerEmergency) emergency = lower(item.label) + " with " + what + " in your system";
      else notify(c.id, "health", "Taking " + lower(item.label) + " with " + what + " in your system was a bad idea.");
    }
  }
  if (!emergency.empty()) {
    medicineEmergency(c, emergency);
    out["emergency"] = true;
  }
  return out;
}

// Like a drug overdose (Substances.cpp): the ER, a bill, a memory you won't forget.
void World::medicineEmergency(CharacterState& c, const std::string& what) {
  const MedicineConfig& M = content_->medicine();
  emit(presentWith(c), "incident", Json{{"character", c.id}, {"kind", "overdose"}});
  if (c.career.shiftStartedAt) (void)endShift(c.id);
  if (c.education.sessionStartedAt) (void)endStudy(c.id);
  const LocationDef* er = content_->location(M.hospital);
  if (er) {
    c.moveTarget.reset();
    c.moveSpeedMps = 0;
    c.inside = er->id;
    c.position = er->door;
    Cents bill = std::max<Cents>(0, std::min(M.emergencyBillCents, state_.ledger.balance(bankAccountOf(c.id))));
    if (bill > 0 && !state_.ledger.transfer(bankAccountOf(c.id), er->revenueAccount, bill, "medical", "Emergency care: " + what, state_.now))
      bill = 0;
    c.needs["health"] = std::max(c.needs["health"], M.stabilisedHealth);
    notify(c.id, "health", "You took " + what + " and were rushed to " + er->name + ". Bill: " + formatMoney(bill) + ".");
  }
  Memory m;
  m.id = nextId("mem");
  m.owner = c.id;
  m.at = state_.now;
  m.participants = {c.id};
  m.location = c.inside;
  m.type = "overdose";
  m.importance = kOverdoseImportance;
  m.emotionalImpact = kOverdoseImpact;
  m.info = "Rushed to the ER after " + what;
  addMemory(std::move(m));
}

void World::addMedicineToHealth(const CharacterState& c, Json& out) const {
  Json rx = Json::array();
  for (const auto& p : c.prescriptions) {
    const ItemDef* item = content_->item(p.medicine);
    const ConditionDef* cond = content_->condition(p.condition);
    rx.push_back(Json{{"medicine", p.medicine},
                      {"label", item ? item->label : p.medicine},
                      {"for", cond ? cond->name : p.condition},
                      {"refills_left", p.refillsLeft},
                      {"written_by", p.writtenBy},
                      {"expires", formatDateTime(p.expiresAt)},
                      {"status", p.expiresAt <= state_.now ? "expired" : p.refillsLeft <= 0 ? "used_up" : "valid"}});
  }
  out["prescriptions"] = rx;
  Json doses = Json::array();
  const GameMinutes window = static_cast<GameMinutes>(content_->medicine().doseWindowHours) * 60;
  for (const auto& [itemId, times] : c.medicineDoses) {
    const auto n = std::count_if(times.begin(), times.end(), [&](GameMinutes t) { return state_.now - t < window; });
    if (n == 0) continue;
    const ItemDef* item = content_->item(itemId);
    const MedicineDef* med = content_->medicineFor(itemId);
    doses.push_back(Json{{"medicine", itemId}, {"label", item ? item->label : itemId}, {"doses", n}, {"daily_limit", med ? med->dailyLimit : 0}});
  }
  out["medicine_today"] = doses;
}

void World::stepMedicineHourly(CharacterState& c) {
  std::vector<PrescriptionState> kept;
  for (auto& rx : c.prescriptions) {
    if (rx.expiresAt > state_.now) {
      kept.push_back(rx);
      continue;
    }
    if (rx.refillsLeft > 0) {
      const ItemDef* item = content_->item(rx.medicine);
      notify(c.id, "health", "Your prescription for " + (item ? item->label : rx.medicine) + " expired with " +
                                 std::to_string(rx.refillsLeft) + (rx.refillsLeft == 1 ? " fill" : " fills") + " unused.");
    }
  }
  c.prescriptions = std::move(kept);
  const GameMinutes window = static_cast<GameMinutes>(content_->medicine().doseWindowHours) * 60;
  for (auto& [item, times] : c.medicineDoses) std::erase_if(times, [&](GameMinutes t) { return state_.now - t >= window; });
  std::erase_if(c.medicineDoses, [](const auto& kv) { return kv.second.empty(); });
}

// ---- Save ----------------------------------------------------------------------------------
namespace {

Json petToJson(const PetState& p) {
  return Json{{"id", p.id},
              {"name", p.name},
              {"species", p.species},
              {"breed", p.breed},
              {"owner", p.owner},
              {"home", p.home},
              {"born_at", p.bornAt},
              {"needs", p.needs},
              {"bond", p.bond},
              {"illness", p.illness},
              {"illness_known", p.illnessKnown},
              {"vaccinated_until", p.vaccinatedUntil},
              {"adopted_at", p.adoptedAt},
              {"starving_since", p.starvingSince},
              {"hunger_warned", p.hungerWarned},
              {"stage", p.stage},
              {"taken_from", p.takenFrom},
              {"ready_at", p.readyAt}};
}

PetState petFromJson(const Json& j) {
  PetState p;
  p.id = j.value("id", "");
  p.name = j.value("name", "");
  p.species = j.value("species", "");
  p.breed = j.value("breed", "");
  p.owner = j.value("owner", "");
  p.home = j.value("home", "");
  p.bornAt = j.value("born_at", GameMinutes{0});
  p.needs = j.value("needs", StatMap{});
  p.bond = j.value("bond", std::map<CharacterId, double>{});
  p.illness = j.value("illness", "");
  p.illnessKnown = j.value("illness_known", false);
  p.vaccinatedUntil = j.value("vaccinated_until", GameMinutes{-1});
  p.adoptedAt = j.value("adopted_at", GameMinutes{-1});
  p.starvingSince = j.value("starving_since", GameMinutes{-1});
  p.hungerWarned = j.value("hunger_warned", false);
  p.stage = j.value("stage", "");
  p.takenFrom = j.value("taken_from", "");
  p.readyAt = j.value("ready_at", std::map<std::string, GameMinutes>{});
  return p;
}

}  // namespace

Json petsPartToJson(const WorldState& s) {
  Json pets = Json::array();
  for (const auto& [id, p] : s.pets) pets.push_back(petToJson(p));
  return Json{{"pets", pets}, {"adopted_listings", s.adoptedListings}, {"shelter_week", s.shelterWeek}};
}

void petsPartFromJson(WorldState& s, const Json& j) {
  s.pets.clear();
  s.adoptedListings.clear();
  s.shelterWeek = -1;
  if (!j.is_object()) return;
  for (const auto& pj : j.value("pets", Json::array())) {
    PetState p = petFromJson(pj);
    if (!p.id.empty()) s.pets[p.id] = std::move(p);
  }
  s.adoptedListings = j.value("adopted_listings", std::map<std::string, CharacterId>{});
  s.shelterWeek = j.value("shelter_week", std::int64_t{-1});
}

void writePetsCharacter(const CharacterState& c, Json& j) {
  if (c.prescriptions.empty() && c.medicineDoses.empty()) return;
  Json rx = Json::array();
  for (const auto& p : c.prescriptions) {
    rx.push_back(Json{{"medicine", p.medicine},
                      {"condition", p.condition},
                      {"refills_left", p.refillsLeft},
                      {"written_at", p.writtenAt},
                      {"expires_at", p.expiresAt},
                      {"written_by", p.writtenBy}});
  }
  j["pets"] = Json{{"prescriptions", rx}, {"medicine_doses", c.medicineDoses}};
}

void readPetsCharacter(CharacterState& c, const Json& j) {
  c.prescriptions.clear();
  c.medicineDoses.clear();
  auto it = j.find("pets");
  if (it == j.end() || !it->is_object()) return;
  for (const auto& p : it->value("prescriptions", Json::array())) {
    c.prescriptions.push_back(PrescriptionState{p.value("medicine", ""), p.value("condition", ""), p.value("refills_left", 0),
                                                p.value("written_at", GameMinutes{0}), p.value("expires_at", GameMinutes{0}),
                                                p.value("written_by", "")});
  }
  c.medicineDoses = it->value("medicine_doses", std::map<std::string, std::vector<GameMinutes>>{});
}

}  // namespace livera
