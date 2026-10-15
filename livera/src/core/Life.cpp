// Everyday life: the body (bathroom, teeth, grooming, weight, aging), the home (housework,
// trash), illness and care, and what happens to a character while their player is away.
// Tuning lives in data/config/life.json and data/health/conditions.json.
#include <algorithm>
#include <cmath>

#include "core/Clock.h"
#include "core/World.h"

namespace livera {

namespace {

constexpr double kStatMin = 0;
constexpr double kStatMax = 100;
constexpr double kMinWeightKg = 30;
constexpr double kHomeDriftPerHour = 5;  // how fast an absent tenant's routine pulls the home toward its target

double averageNeed(const CharacterState& c) {
  if (c.needs.empty()) return 0;
  double sum = 0;
  for (const auto& [k, v] : c.needs) sum += v;
  return sum / static_cast<double>(c.needs.size());
}

double need(const CharacterState& c, const std::string& id, double fallback = 100) {
  auto it = c.needs.find(id);
  return it == c.needs.end() ? fallback : it->second;
}

double toward(double v, double target, double step) {
  if (v < target) return std::min(target, v + step);
  return std::max(target, v - step);
}

// A child's height by age, newborn to grown.
double heightForAge(int age) {
  constexpr double kNewborn = 50, kGrown = 172;
  const double t = std::min(1.0, age / 18.0);
  return kNewborn + (kGrown - kNewborn) * std::pow(t, 0.75);
}

// Spreads birthdays across the year instead of putting everyone's on founding day.
double yearFraction(const std::string& id) {
  std::uint32_t h = 2166136261u;
  for (char ch : id) h = (h ^ static_cast<unsigned char>(ch)) * 16777619u;
  return static_cast<double>(h % 1000) / 1000.0;
}

}  // namespace

// splitmix64: small, fast, and its whole state is one saved number.
double World::roll() {
  std::uint64_t z = (state_.rng += 0x9E3779B97F4A7C15ull);
  z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ull;
  z = (z ^ (z >> 27)) * 0x94D049BB133111EBull;
  z ^= z >> 31;
  return static_cast<double>(z >> 11) * 0x1.0p-53;
}

void World::initBody(CharacterState& c, const CharacterDef& def) {
  const LifeConfig& L = content_->life();
  c.bornAt = state_.now - static_cast<GameMinutes>((def.age + yearFraction(def.id)) * static_cast<double>(kMinutesPerYear));
  c.lastBirthdayAge = def.age;
  const Json& look = def.profile.is_object() && def.profile.contains("appearance") ? def.profile.at("appearance") : Json();
  if (look.is_object() && look.contains("height_cm") && look.at("height_cm").is_number())
    c.heightCm = look.at("height_cm").get<double>();
  const double m = c.heightCm / 100.0;
  c.weightKg = look.is_object() && look.contains("weight_kg") && look.at("weight_kg").is_number()
                   ? look.at("weight_kg").get<double>()
                   : std::round(L.defaultBmi * m * m * 10) / 10;
}

int World::ageOf(const CharacterId& id) const {
  const CharacterState* c = character(id);
  if (!c) return 0;
  if (state_.now < c->bornAt) return 0;
  return static_cast<int>((state_.now - c->bornAt) / kMinutesPerYear);
}

std::string World::lifeStageOf(const CharacterId& id) const {
  const int age = ageOf(id);
  std::string stage = "adult";
  for (const auto& s : content_->life().lifeStages) {
    if (age >= s.minAge) stage = s.id;
  }
  return stage;
}

double World::bmiOf(const CharacterState& c) const {
  const double m = c.heightCm / 100.0;
  return m > 0 ? c.weightKg / (m * m) : 0;
}

bool World::hasCondition(const CharacterId& id, const std::string& condition) const {
  const CharacterState* c = character(id);
  if (!c) return false;
  return std::any_of(c->conditions.begin(), c->conditions.end(), [&](const ConditionState& k) { return k.id == condition; });
}

ConditionState* World::findCondition(CharacterState& c, const std::string& condition) {
  for (auto& k : c.conditions) {
    if (k.id == condition) return &k;
  }
  return nullptr;
}

void World::addCondition(CharacterState& c, const std::string& condition, bool diagnosed) {
  const ConditionDef* def = content_->condition(condition);
  if (!def || findCondition(c, condition)) return;
  ConditionState k;
  k.id = condition;
  k.since = state_.now;
  k.diagnosed = diagnosed;
  if (def->maxHours > 0) {
    const double hours = def->minHours + roll() * (def->maxHours - def->minHours);
    k.until = state_.now + static_cast<GameMinutes>(hours * 60);
  }
  c.conditions.push_back(k);
  if (def->symptomatic) notify(c.id, "health", "You have " + def->name + ".");
}

Status World::devAddCondition(const CharacterId& id, const std::string& condition) {
  CharacterState* c = mutableCharacter(id);
  if (!c) return fail("unknown_character", "no such character");
  if (!content_->condition(condition)) return fail("unknown_condition", "no such condition");
  addCondition(*c, condition, false);
  return okStatus();
}

void World::removeCondition(CharacterState& c, const std::string& condition, const std::string& why) {
  auto it = std::find_if(c.conditions.begin(), c.conditions.end(), [&](const ConditionState& k) { return k.id == condition; });
  if (it == c.conditions.end()) return;
  const bool known = it->diagnosed;
  c.conditions.erase(it);
  const ConditionDef* def = content_->condition(condition);
  if (def && (def->symptomatic || known)) notify(c.id, "health", def->name + ": " + why + ".");
}

double World::performancePenalty(const CharacterState& c) const {
  double p = 0;
  for (const auto& k : c.conditions) {
    const ConditionDef* def = content_->condition(k.id);
    if (!def) continue;
    if (!def->curable && k.recovery >= 100) continue;  // managed
    p += def->performancePenalty;
  }
  return std::min(0.8, p);
}

PropertyState* World::homeOf(const CharacterId& id) {
  for (auto& [pid, p] : state_.properties) {
    if (p.tenant == id) return &p;
  }
  return nullptr;
}

const PropertyState* World::homeOf(const CharacterId& id) const {
  for (const auto& [pid, p] : state_.properties) {
    if (p.tenant == id) return &p;
  }
  return nullptr;
}

void World::eat(CharacterState& c, const StatMap& needEffects, double calories) {
  if (calories <= 0) {
    auto it = needEffects.find("hunger");
    if (it != needEffects.end() && it->second > 0) calories = it->second * content_->life().caloriesPerHungerPoint;
  }
  c.caloriesIn += std::max(0.0, calories);
}

// ---------------------------------------------------------------------------------
// Every simulated minute, for characters in the world.
// ---------------------------------------------------------------------------------
void World::stepBodyMinute(CharacterState& c) {
  const LifeConfig& L = content_->life();
  c.caloriesOut += L.baseBurnPerDay / kMinutesPerDay;

  // A high wears off, and there's a crash.
  if (c.highUntil >= 0 && state_.now >= c.highUntil) {
    if (const SubstanceDef* s = content_->substance(c.highOn)) {
      for (const auto& [n, d] : s->crashNeeds) c.needs[n] = clampd(c.needs[n] + d, kStatMin, kStatMax);
      for (const auto& [e, d] : s->crashEmotions) c.emotions[e] = clampd(c.emotions[e] + d, kStatMin, kStatMax);
    }
    c.highOn.clear();
    c.highUntil = -1;
  }
  // Conditions: symptoms, unless a treatment is managing a lifelong one. Withdrawal stops while high.
  const SubstanceDef* high = content_->substance(c.highOn);
  for (const auto& k : c.conditions) {
    const ConditionDef* def = content_->condition(k.id);
    if (!def || (!def->curable && k.recovery >= 100)) continue;
    if (high && high->addiction == k.id) continue;
    for (const auto& [n, perHour] : def->needsPerHour) c.needs[n] = clampd(c.needs[n] + perHour / 60.0, kStatMin, kStatMax);
    for (const auto& [e, perHour] : def->emotionsPerHour)
      c.emotions[e] = clampd(c.emotions[e] + perHour / 60.0, kStatMin, kStatMax);
  }

  // Pregnancy: tiring, hungry, and a few weeks of morning sickness.
  if (c.pregnancy) {
    const RomanceConfig& R = content_->romance();
    const double days = static_cast<double>(state_.now - c.pregnancy->conceivedAt) / kMinutesPerDay;
    for (const auto& [n, perHour] : R.pregnancyNeedsPerHour) c.needs[n] = clampd(c.needs[n] + perHour / 60.0, kStatMin, kStatMax);
    if (days >= R.symptomsAfterDays && days < R.miscarriageWindowDays) {
      for (const auto& [n, perHour] : R.morningSicknessNeedsPerHour)
        c.needs[n] = clampd(c.needs[n] + perHour / 60.0, kStatMin, kStatMax);
    }
  }
  // Age and weight wear on health.
  double extraHealthLoss = 0;
  for (const auto& n : content_->sim().needs) {
    if (n.id != "health") continue;
    for (const auto& s : L.lifeStages) {
      if (s.id == lifeStageOf(c.id)) extraHealthLoss += (s.healthDecayMultiplier - 1) * n.decayPerHour;
    }
  }
  const double bmi = bmiOf(c);
  if (bmi > 0 && (bmi >= L.highBmi || bmi < L.lowBmi)) extraHealthLoss += L.unhealthyBmiHealthDecay;
  if (extraHealthLoss > 0 && c.needs.count("health"))
    c.needs["health"] = clampd(c.needs["health"] - extraHealthLoss / 60.0, kStatMin, kStatMax);

  // A dirty home is unpleasant to be in.
  if (!c.inside.empty()) {
    for (const auto& [pid, p] : state_.properties) {
      const PropertyDef* def = content_->property(pid);
      if (!def || def->location != c.inside || p.cleanliness >= L.dirtyHomeThreshold) continue;
      for (const auto& [n, perHour] : L.dirtyHomeNeedsPerHour)
        c.needs[n] = clampd(c.needs[n] + perHour / 60.0, kStatMin, kStatMax);
      break;
    }
  }

  // Bathroom. People on shift take breaks; everyone else has to find a restroom.
  if (c.career.shiftStartedAt && c.needs.count("bladder") && c.needs["bladder"] < 40) c.needs["bladder"] = 40;
  if (c.needs.count("bladder") && c.needs["bladder"] <= 0) {
    c.needs["bladder"] = kStatMax;
    c.needs["hygiene"] = clampd(c.needs["hygiene"] - L.accidentHygieneLoss, kStatMin, kStatMax);
    c.emotions["embarrassment"] = clampd(c.emotions["embarrassment"] + L.accidentEmbarrassment, kStatMin, kStatMax);
    notify(c.id, "health", "You couldn't make it to a bathroom in time.");
    emit(presentWith(c), "incident", Json{{"character", c.id}, {"kind", "bathroom_accident"}});
  }
}

// ---------------------------------------------------------------------------------
// Every game hour, for everyone.
// ---------------------------------------------------------------------------------
void World::stepHourly() {
  stepHomes();
  stepCrimeHourly();
  const LifeConfig& L = content_->life();
  for (auto& [id, c] : state_.characters) {
    // Conditions that have run their course.
    std::vector<std::string> over;
    for (const auto& k : c.conditions) {
      if (k.until >= 0 && state_.now >= k.until) over.push_back(k.id);
    }
    for (const auto& k : over) removeCondition(c, k, "you've recovered");
    stepSubstancesHourly(c);
    stepPregnancyHourly(c);
    stepFameHourly(c);
    if (ageOf(id) < L.adultAge) {
      stepChildHourly(c);
      checkBirthday(c);
      continue;
    }
    if (c.online) {
      stepIllness(c);
      updateWeight(c);
      // Depression lifts with good days: needs kept up while you're in the world.
      if (ConditionState* d = findCondition(c, L.depressionCondition); d && averageNeed(c) >= 60) {
        d->recovery += L.depressionRecoveryPerGoodHour;
        if (d->recovery >= 100) removeCondition(c, L.depressionCondition, "it has lifted");
      }
    } else {
      stepOfflineLife(c);
    }
    checkBirthday(c);
  }
}

void World::stepHomes() {
  const LifeConfig& L = content_->life();
  for (auto& [pid, p] : state_.properties) {
    if (p.tenant.empty()) continue;
    const PropertyDef* def = content_->property(pid);
    const CharacterState* t = character(p.tenant);
    if (!def || !t) continue;
    if (t->online) {
      if (t->inside == def->location) {
        p.cleanliness -= L.homeDirtPerHour * (p.trash >= 100 ? L.fullTrashDirtMultiplier : 1);
        p.trash += L.homeTrashPerHour;
      } else {
        p.cleanliness -= L.homeDustPerHour;
      }
    } else {
      // Away: their routine keeps the place up, until they stop caring for themselves.
      const bool depressed = offlineTooLong(*t) || hasCondition(t->id, L.depressionCondition);
      p.cleanliness = toward(p.cleanliness, depressed ? L.depressedHomeCleanliness : L.offlineHomeCleanliness, kHomeDriftPerHour);
      p.trash = toward(p.trash, depressed ? 100 : 10, kHomeDriftPerHour);
    }
    p.cleanliness = clampd(p.cleanliness, kStatMin, kStatMax);
    p.trash = clampd(p.trash, kStatMin, kStatMax);
  }
}

void World::stepIllness(CharacterState& c) {
  const LifeConfig& L = content_->life();
  bool dirtyHome = false;
  if (!c.inside.empty()) {
    for (const auto& [pid, p] : state_.properties) {
      const PropertyDef* def = content_->property(pid);
      if (def && def->location == c.inside && p.cleanliness < L.dirtyHomeThreshold) dirtyHome = true;
    }
  }
  const auto present = presentWith(c, 5);
  for (const auto& [id, def] : content_->conditions()) {
    if (def.hourlyChance <= 0 && def.contagionPerHour <= 0) continue;
    if (findCondition(c, id)) continue;
    double p = def.hourlyChance;
    if (!def.riskNeed.empty() && need(c, def.riskNeed) < def.riskBelow) p *= def.riskMultiplier;
    if (def.dirtyHomeRisk && dirtyHome) p *= def.riskMultiplier;
    if (def.contagionPerHour > 0) {
      for (const auto& other : present) {
        if (hasCondition(other, id)) p += def.contagionPerHour;
      }
    }
    if (p > 0 && roll() < p) addCondition(c, id, false);
  }
}

void World::updateWeight(CharacterState& c) {
  const LifeConfig& L = content_->life();
  c.weightKg = std::max(kMinWeightKg, c.weightKg + (c.caloriesIn - c.caloriesOut) / L.kcalPerKg);
  c.caloriesIn = 0;
  c.caloriesOut = 0;
}

bool World::offlineTooLong(const CharacterState& c) const {
  if (c.online || c.lastOnlineAt < 0) return false;
  const double limit = content_->life().selfCareRealDays * 86400.0 * content_->sim().minutesPerRealSecond;
  return static_cast<double>(state_.now - c.lastOnlineAt) >= limit;
}

void World::stepOfflineLife(CharacterState& c) {
  const LifeConfig& L = content_->life();
  if (!offlineTooLong(c) || findCondition(c, L.depressionCondition)) return;
  addCondition(c, L.depressionCondition, false);
  const CharacterDef* def = definition(c.id);
  notify(c.id, "health",
         "You were away a long time. " + (def ? def->firstName : c.id) +
             " stopped looking after themself and is depressed, keeping up only the very basics.");
}

void World::checkBirthday(CharacterState& c) {
  const int age = ageOf(c.id);
  if (age <= c.lastBirthdayAge) return;
  const std::string before = lifeStageOf(c.id);
  c.lastBirthdayAge = age;
  notify(c.id, "life", "Happy birthday! You're " + std::to_string(age) + ".");
  Memory m;
  m.id = nextId("mem");
  m.owner = c.id;
  m.at = state_.now;
  m.participants = {c.id};
  m.type = "birthday";
  m.importance = 30;
  m.emotionalImpact = 20;
  m.info = "Turned " + std::to_string(age);
  addMemory(std::move(m));
  // A child born in Livéra grows: taller every year, and at adulthood they can be played.
  auto created = state_.createdCharacters.find(c.id);
  if (created != state_.createdCharacters.end() && age < content_->life().adultAge) {
    c.heightCm = heightForAge(age);
    const double metres = c.heightCm / 100.0;
    c.weightKg = std::round(content_->family().childBmi * metres * metres * 10) / 10;
  }
  if (created != state_.createdCharacters.end() && !created->second.playable && age >= content_->life().adultAge) {
    created->second.playable = true;
    created->second.age = age;
    c.heightCm = heightForAge(age);
    const double metres = c.heightCm / 100.0;
    c.weightKg = std::round(content_->life().defaultBmi * metres * metres * 10) / 10;
    graduateSchool(c);
    for (const auto& parent : c.parents) {
      if (character(parent)) notify(parent, "family", created->second.firstName + " is grown up now, and can be played.");
    }
  }
  (void)before;
}

// ---------------------------------------------------------------------------------
// Care: clinics, dentists and therapists.
// ---------------------------------------------------------------------------------
Result<Json> World::runCareService(CharacterState& c, const std::string& service, const LocationDef& where) {
  Json out{{"service", service}, {"place", where.name}};
  if (service == "checkup") {
    Json found = Json::array();
    for (auto& k : c.conditions) {
      k.diagnosed = true;
      if (const ConditionDef* def = content_->condition(k.id)) found.push_back(def->name);
    }
    out["diagnosed"] = found;
    if (c.pregnancy && static_cast<double>(state_.now - c.pregnancy->conceivedAt) / kMinutesPerDay >= 7) {
      c.pregnancy->known = true;
      out["pregnant"] = true;
      out["due"] = formatDateTime(c.pregnancy->dueAt);
    }
    out["weight_kg"] = std::round(c.weightKg * 10) / 10;
    out["bmi"] = std::round(bmiOf(c) * 10) / 10;
    c.needs["health"] = clampd(c.needs["health"] + 5, kStatMin, kStatMax);
    return out;
  }
  if (service == "emergency") {
    // The ER diagnoses and treats in one visit.
    for (auto& k : c.conditions) k.diagnosed = true;
    auto treated = runCareService(c, "treatment", where);
    if (treated) out["treated"] = treated.value().at("treated");
    return out;
  }
  if (service == "treatment") {
    Json treated = Json::array();
    std::vector<std::string> cured;
    for (auto& k : c.conditions) {
      const ConditionDef* def = content_->condition(k.id);
      if (!def || !k.diagnosed) continue;
      if (std::find(def->treatedBy.begin(), def->treatedBy.end(), "treatment") == def->treatedBy.end()) continue;
      treated.push_back(def->name);
      if (def->curable) cured.push_back(k.id);
      else k.recovery = 100;  // managed: no symptoms while it stays managed
    }
    for (const auto& id : cured) removeCondition(c, id, "treated");
    out["treated"] = treated;
    return out;
  }
  if (service == "sti_test") {
    Json found = Json::array();
    for (auto& k : c.conditions) {
      const ConditionDef* def = content_->condition(k.id);
      if (def && def->kind == "sti") {
        k.diagnosed = true;
        found.push_back(def->name);
      }
    }
    out["positive"] = found;
    return out;
  }
  if (service == "prenatal") {
    if (!c.pregnancy) return fail("not_pregnant", "you're not pregnant");
    c.pregnancy->known = true;
    c.pregnancy->prenatalVisits += 1;
    c.needs["health"] = clampd(c.needs["health"] + 5, kStatMin, kStatMax);
    out["due"] = formatDateTime(c.pregnancy->dueAt);
    out["visits"] = c.pregnancy->prenatalVisits;
    return out;
  }
  if (service == "abortion") {
    endPregnancy(c, "abortion");
    return out;
  }
  if (service == "rehab") {
    Json treated = Json::array();
    std::vector<std::string> cured;
    for (const auto& k : c.conditions) {
      const ConditionDef* def = content_->condition(k.id);
      if (def && def->kind == "addiction") {
        treated.push_back(def->name);
        cured.push_back(k.id);
      }
    }
    for (const auto& id : cured) removeCondition(c, id, "treated");
    for (auto& [id, dep] : c.dependency) dep = 0;
    out["treated"] = treated;
    return out;
  }
  if (service == "dental_care") {
    c.needs["dental"] = kStatMax;
    std::vector<std::string> cured;
    for (const auto& k : c.conditions) {
      const ConditionDef* def = content_->condition(k.id);
      if (def && std::find(def->treatedBy.begin(), def->treatedBy.end(), "dental_care") != def->treatedBy.end())
        cured.push_back(k.id);
    }
    for (const auto& id : cured) removeCondition(c, id, "treated");
    return out;
  }
  return fail("unknown_service", "no such service");
}

void World::applyConditionRecovery(CharacterState& c, const StatMap& progress) {
  for (const auto& [id, amount] : progress) {
    ConditionState* k = findCondition(c, id);
    if (!k) continue;
    k->recovery += amount;
    if (k->recovery >= 100) removeCondition(c, id, "it has lifted");
  }
}

Json World::phoneHealth(const CharacterState& c) const {
  const LifeConfig& L = content_->life();
  const double bmi = bmiOf(c);
  Json conditions = Json::array();
  for (const auto& k : c.conditions) {
    const ConditionDef* def = content_->condition(k.id);
    if (!def || (!def->symptomatic && !k.diagnosed)) continue;  // silent until a test finds it
    Json j{{"name", def->name}, {"diagnosed", k.diagnosed}, {"since", formatDateTime(k.since)}};
    if (k.recovery > 0) j["recovery"] = std::round(std::min(100.0, k.recovery));
    if (!def->curable && k.recovery >= 100) j["managed"] = true;
    conditions.push_back(j);
  }
  Json out{{"age", ageOf(c.id)},
           {"life_stage", lifeStageOf(c.id)},
           {"height_cm", c.heightCm},
           {"weight_kg", std::round(c.weightKg * 10) / 10},
           {"bmi", std::round(bmi * 10) / 10},
           {"bmi_category", bmi < L.lowBmi ? "underweight" : bmi < 25 ? "healthy" : bmi < L.highBmi ? "overweight" : "obese"},
           {"conditions", conditions}};
  if (const PropertyState* home = homeOf(c.id))
    out["home"] = Json{{"cleanliness", std::round(home->cleanliness)}, {"trash", std::round(home->trash)}};
  return out;
}

}  // namespace livera
