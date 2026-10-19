#include "core/World.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <set>

#include "core/Clock.h"

namespace livera {

namespace {

constexpr double kStatMin = 0;
constexpr double kStatMax = 100;
constexpr double kRelMin = -100;
constexpr double kRelMax = 100;
constexpr GameMinutes kInteractionCooldown = 5;   // per pair, per direction
constexpr std::size_t kNotificationsKept = 200;  // per character
constexpr double kGrudgeImpact = -30;
constexpr int kGrudgeImportance = 40;
constexpr double kFirstMeetingImportance = 40;

double averageNeed(const CharacterState& c) {
  if (c.needs.empty()) return 0;
  double sum = 0;
  for (const auto& [k, v] : c.needs) sum += v;
  return sum / static_cast<double>(c.needs.size());
}

std::string trim(const std::string& s) {
  const auto b = s.find_first_not_of(" \t\r\n");
  if (b == std::string::npos) return "";
  const auto e = s.find_last_not_of(" \t\r\n");
  return s.substr(b, e - b + 1);
}

}  // namespace

LedgerAccountId bankAccountOf(const CharacterId& id) { return "chr:" + id + ":bank"; }
LedgerAccountId cashAccountOf(const CharacterId& id) { return "chr:" + id + ":cash"; }

std::string formatMoney(Cents cents) {
  const bool neg = cents < 0;
  const Cents a = neg ? -cents : cents;
  char buf[64];
  std::snprintf(buf, sizeof buf, "%s$%lld.%02lld", neg ? "-" : "", static_cast<long long>(a / 100),
                static_cast<long long>(a % 100));
  return buf;
}

// ---------------------------------------------------------------------------------
// Construction of a brand-new founding world from content.
// ---------------------------------------------------------------------------------
World World::createNew(std::shared_ptr<const ContentDatabase> content) {
  const ContentDatabase& db = *content;
  WorldState s;
  s.now = db.sim().startMinute;

  // Ledger: the outside economy. Organisations, properties and characters are added by the constructor.
  (void)s.ledger.openAccount(LedgerAccount{kEconomyAccount, "system", "system", 0, true});

  for (const auto& p : db.constructionProjects()) {
    ConstructionState cs;
    cs.id = p.id;
    cs.status = p.startsAfter.empty() ? ConstructionStatus::Active : ConstructionStatus::Planned;
    s.construction[p.id] = cs;
  }
  s.city.stats = db.cityInitial();

  // The constructor adds every content character (accounts, savings, home).
  World w(std::move(content), std::move(s));
  const ContentDatabase& c = w.content();

  // Seed relationships and pre-founding memories from character data.
  for (const auto& [id, def] : c.characters()) {
    for (const auto& r : def.relationships) {
      RelationshipState& rs = w.relationshipRef(id, r.to);
      rs.dimensions["compatibility"] = w.compatibility(def, *w.definition(r.to));
      for (const auto& [dim, v] : r.dimensions) rs.dimensions[dim] = clampd(v, kRelMin, kRelMax);
      rs.firstMetAt = 0;  // they knew each other before Livéra; the epoch is the earliest representable time
    }
    for (const auto& m : def.memories) {
      Memory mem;
      mem.id = w.nextId("mem");
      mem.owner = id;
      mem.at = std::max<GameMinutes>(0, w.state_.now - m.daysAgo * kMinutesPerDay);
      mem.participants = m.participants;
      mem.type = m.type;
      mem.emotionalImpact = m.emotionalImpact;
      mem.importance = m.importance;
      mem.about = m.about;
      mem.info = m.info;
      mem.isPublic = m.isPublic;
      w.addMemory(std::move(mem));
    }
  }
  w.updateCityStage();
  w.events_.clear();
  return w;
}

World::World(std::shared_ptr<const ContentDatabase> content, WorldState state)
    : content_(std::move(content)), state_(std::move(state)) {
  const ContentDatabase& db = *content_;
  // Businesses and properties added to content after the world was saved open now, funded
  // the same way a new world funds them, so fares, fees and purchases have somewhere to go.
  for (const auto& org : db.orgAccounts()) {
    if (state_.ledger.account(org.id)) continue;
    (void)state_.ledger.openAccount(LedgerAccount{org.id, org.id, "business", 0, false});
    if (org.openingBalanceCents > 0)
      (void)state_.ledger.transfer(kEconomyAccount, org.id, org.openingBalanceCents, "opening_balance", org.name,
                                   state_.now);
  }
  for (const auto& [pid, p] : db.properties()) state_.properties.try_emplace(pid, PropertyState{pid, p.ownerAccount, ""});
  // Founding characters missing from the state (a new world, or content added after the
  // world was saved) move in now.
  for (const auto& [id, def] : db.characters()) {
    if (!state_.characters.count(id)) addCharacterState(def, nullptr);
  }
  // Stats added to content later start at their defaults.
  for (auto& [id, c] : state_.characters) {
    for (const auto& n : db.sim().needs) c.needs.try_emplace(n.id, n.initial);
    for (const auto& e : db.sim().emotions) c.emotions.try_emplace(e, 0);
    for (const auto& k : db.sim().skills) c.skills.try_emplace(k, 0);
    // Saves from before bodies existed: give everyone one from their definition.
    if (c.weightKg <= 0) {
      if (const CharacterDef* def = definition(id)) initBody(c, *def);
      c.rebaseAge = false;
    }
    // Saves from before ages followed the calendar counted 1800 game days a year: keep the
    // age they had reached and how far they were into the year.
    if (c.rebaseAge) {
      const double oldYear = 1800.0 * kMinutesPerDay;
      const double years = static_cast<double>(state_.now - c.bornAt) / oldYear;
      const double fraction = std::max(0.0, years - std::floor(years));
      c.bornAt = state_.now - static_cast<GameMinutes>((c.lastBirthdayAge + fraction) * static_cast<double>(kMinutesPerYear));
      c.rebaseAge = false;
    }
    if (c.education.degrees.empty()) {
      if (const CharacterDef* def = definition(id)) c.education.degrees = def->degrees;
    }
    if (c.fame < 0) {
      const CharacterDef* def = definition(id);
      c.fame = def ? def->fame : 0;
    }
  }
  // M0.8 features fill in what older saves (and new worlds) don't have yet.
  // m08:homes on load { Buying homes, mortgages, moving in together (Homes.cpp)
  // Saves from before M0.8 (and new worlds) only know each home's lease holder: they live there.
  for (auto& [pid, p] : state_.properties) {
    if (p.residents.empty() && p.owners.empty() && !p.tenant.empty()) p.residents.push_back(p.tenant);
  }
  // } m08:homes

  // m08:work on load { Work decisions during shifts (WorkTasks.cpp)
  // Off shift, nothing is waiting for a shift report. An answer that still is belongs to a
  // shift lost to a crash after an autosave (shifts aren't saved; a clean shutdown ends them).
  // Its effects stand; settling it keeps a new shift that starts in the same game minute from
  // reporting it (or, if that shift is too short, taking its hours back).
  for (auto& [id, c] : state_.characters) {
    if (c.career.shiftStartedAt) continue;
    for (auto& a : c.workDecisions.answers) a.reported = true;
  }
  // } m08:work

  // m08:wallet on load { Coins, phones and LivPay (Wallet.cpp)
  if (!state_.coins.account(kCoinIssuerAccount))
    (void)state_.coins.openAccount(LedgerAccount{kCoinIssuerAccount, "system", "system", 0, true});
  for (auto& [id, c] : state_.characters) {
    // A model taken out of content falls back to the basic phone, keeping its charge.
    if (!c.phone.model.empty() && !db.phoneModel(c.phone.model)) c.phone.model = db.wallet().phones.basicModel;
    issuePhone(c);
  }
  // } m08:wallet

  // m08:leisure on load { Sports, date spots and the lake park (Leisure.cpp)
  // Teams taken out of content since the save: their players are free agents again.
  for (auto& [id, c] : state_.characters)
    std::erase_if(c.leisureTeams, [&](const std::string& t) { return db.leisureTeam(t) == nullptr; });
  // } m08:leisure

  // m08:pets on load { Pets and medicine (Pets.cpp)
  // Pet needs added to content later start where the shelter keeps them.
  for (auto& [pid, p] : state_.pets) {
    for (const auto& n : db.pets().needs) p.needs.try_emplace(n, db.pets().routineTarget);
  }
  // } m08:pets

  // m08:details on load { Accidents as a big deal, laundry, weather, birthdays, hangovers (Details.cpp)
  // } m08:details
}

// Gives a character a body in the world: state, bank and cash accounts with their
// starting money, and their home if it is free.
void World::addCharacterState(const CharacterDef& def, const OriginDef* origin) {
  const ContentDatabase& db = *content_;
  const CharacterId& id = def.id;
  CharacterState c;
  c.id = id;
  const LocationDef* spawn = db.location(def.spawnLocation);
  c.position = spawn->door;
  if (spawn->enterable) c.inside = spawn->id;
  for (const auto& n : db.sim().needs) c.needs[n.id] = n.initial;
  for (const auto& e : db.sim().emotions) {
    auto it = db.sim().emotionBaselines.find(e);
    c.emotions[e] = it == db.sim().emotionBaselines.end() ? 0 : it->second;
  }
  if (origin) {
    for (const auto& [e, d] : origin->emotions) c.emotions[e] = clampd(c.emotions[e] + d, kStatMin, kStatMax);
  }
  for (const auto& k : db.sim().skills) {
    auto it = def.skills.find(k);
    c.skills[k] = it == def.skills.end() ? 0 : it->second;
  }
  c.career.careerId = def.careerId;
  c.career.level = def.careerLevel;
  c.education.degrees = def.degrees;
  c.fame = def.fame;
  c.lastSimulatedAt = state_.now;
  initBody(c, def);
  state_.characters[id] = c;

  if (!state_.ledger.account(bankAccountOf(id)))
    (void)state_.ledger.openAccount(LedgerAccount{bankAccountOf(id), id, "bank", 0, false});
  if (!state_.ledger.account(cashAccountOf(id)))
    (void)state_.ledger.openAccount(LedgerAccount{cashAccountOf(id), id, "cash", 0, false});
  if (def.startingBankCents > 0)
    (void)state_.ledger.transfer(kEconomyAccount, bankAccountOf(id), def.startingBankCents, "opening_balance",
                                 "Savings brought to Livéra", state_.now);
  if (def.startingCashCents > 0)
    (void)state_.ledger.transfer(kEconomyAccount, cashAccountOf(id), def.startingCashCents, "opening_balance",
                                 "Cash on hand", state_.now);
  auto home = state_.properties.find(def.homeProperty);
  if (home != state_.properties.end() && home->second.tenant.empty()) home->second.tenant = id;
  CharacterState& made = state_.characters.at(id);
  (void)made;  // M0.8 features set up a newly arrived (or born) character here.
  // m08:homes new character { Buying homes, mortgages, moving in together (Homes.cpp)
  if (home != state_.properties.end() && home->second.tenant == id) {
    PropertyState& p = home->second;
    // A baby whose mother has no home now would otherwise be handed the lease on her old one.
    if (def.age < db.life().adultAge) p.tenant.clear();
    else if (std::find(p.residents.begin(), p.residents.end(), id) == p.residents.end()) p.residents.push_back(id);
  }
  // } m08:homes

  // m08:work new character { Work decisions during shifts (WorkTasks.cpp)
  // } m08:work

  // m08:wallet new character { Coins, phones and LivPay (Wallet.cpp)
  issuePhone(made);
  // } m08:wallet

  // m08:leisure new character { Sports, date spots and the lake park (Leisure.cpp)
  // } m08:leisure

  // m08:pets new character { Pets and medicine (Pets.cpp)
  // } m08:pets

  // m08:details new character { Accidents as a big deal, laundry, weather, birthdays, hangovers (Details.cpp)
  // } m08:details
}

// ---------------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------------
void World::advanceRealTime(double seconds) {
  if (seconds <= 0) return;
  const ContentDatabase& db = *content_;
  moveEveryone(seconds);
  state_.clockCarry += seconds * db.sim().minutesPerRealSecond;
  const auto whole = static_cast<GameMinutes>(state_.clockCarry);
  state_.clockCarry -= static_cast<double>(whole);
  advanceMinutes(whole);
  // Last, so it catches every move this tick made, forced ones included (jail, the ER, being shown out).
  emitPeopleChanges();
}

void World::moveEveryone(double seconds) {
  const ContentDatabase& db = *content_;
  for (auto& [id, c] : state_.characters) {
    if (!c.online || !c.moveTarget || !c.inside.empty()) continue;
    const double step = (c.moveSpeedMps > 0 ? c.moveSpeedMps : db.sim().walkSpeedMetersPerSecond) * seconds;
    const Vec2 target = *c.moveTarget;
    const double d = distance(c.position, target);
    if (d <= step) {
      c.position = target;
      c.moveTarget.reset();
      c.moveSpeedMps = 0;
      emit({id}, "arrived", Json{{"position", {c.position.x, c.position.y}}});
    } else {
      c.position.x += (target.x - c.position.x) / d * step;
      c.position.y += (target.y - c.position.y) / d * step;
    }
  }
}

// Each step simulates the minute [now, now+1), then moves the clock. Things that happen
// at an instant (rent on the first of the month) fire when the clock reaches that instant.
void World::advanceMinutes(GameMinutes minutes) {
  for (GameMinutes i = 0; i < minutes; ++i) {
    stepMinute();
    ++state_.now;
    if (state_.now % 60 == 0) stepHourly();
    if (state_.now % kMinutesPerMonth == 0) chargeRent();
    stepWorkMinute();  // after the hourly step, which rolls the work day over at midnight (WorkTasks.cpp)
  }
}

void World::stepMinute() {
  stepConstruction();
  for (auto& [id, c] : state_.characters) {
    // Asleep, your routine looks after you: you catch up when you wake (Sleep.cpp).
    if (c.online && c.asleepSince < 0) simulateCharacterMinute(c);
  }
}

// Tier 1: full-fidelity, minute-by-minute.
void World::simulateCharacterMinute(CharacterState& c) {
  const SimulationConfig& sim = content_->sim();
  for (const auto& n : sim.needs) {
    c.needs[n.id] = clampd(c.needs[n.id] - n.decayPerHour / 60.0, kStatMin, kStatMax);
  }
  if (c.career.shiftStartedAt) {
    if (const CareerDef* career = content_->career(c.career.careerId)) {
      for (const auto& [need, perHour] : career->needCostPerHour) {
        c.needs[need] = clampd(c.needs[need] + perHour / 60.0, kStatMin, kStatMax);
      }
    }
    c.career.shiftWellbeingSum += averageNeed(c);
    c.career.shiftSamples += 1;
  }
  if (c.education.sessionStartedAt) {
    if (const ProgramDef* program = content_->program(c.education.program)) {
      for (const auto& [need, perHour] : program->needCostPerHour)
        c.needs[need] = clampd(c.needs[need] + perHour / 60.0, kStatMin, kStatMax);
    }
    c.education.sessionWellbeingSum += averageNeed(c);
    c.education.sessionSamples += 1;
  }
  for (auto& [e, v] : c.emotions) {
    const auto it = sim.emotionBaselines.find(e);
    const double base = it == sim.emotionBaselines.end() ? 0 : it->second;
    const double relax = sim.emotionRelaxPerHour / 60.0;
    v = v > base ? std::max(base, v - relax) : std::min(base, v + relax);
  }
  // Unmet needs feed stress: below an average of 40, stress rises up to 6 points/hour.
  const double avg = averageNeed(c);
  if (avg < 40 && c.emotions.count("stress")) {
    c.emotions["stress"] = clampd(c.emotions["stress"] + (40 - avg) / 40 * 6 / 60.0, kStatMin, kStatMax);
  }
  stepBodyMinute(c);
  c.lastSimulatedAt = state_.now + 1;
}

// Tier 3: a character nobody is playing is assumed to live their routine. Instead of
// simulating each minute, needs and emotions converge toward a steady state.
void World::catchUpDormant(CharacterState& c, GameMinutes elapsed) {
  if (elapsed <= 0) return;
  const SimulationConfig& sim = content_->sim();
  const LifeConfig& life = content_->life();
  const double hours = static_cast<double>(elapsed) / 60.0;
  const double k = 1.0 - std::exp(-hours / 8.0);
  // Away too long, a played character stops looking after themself: only the basics get done.
  const bool depressed = offlineTooLong(c) || findCondition(c, life.depressionCondition);
  if (offlineTooLong(c)) stepOfflineLife(c);
  for (auto& [n, v] : c.needs) {
    double target = sim.offlineNeedTarget;
    if (depressed) {
      auto it = life.depressedNeedTargets.find(n);
      if (it != life.depressedNeedTargets.end()) target = it->second;
    }
    v = clampd(v + (target - v) * k, kStatMin, kStatMax);
  }
  for (auto& [e, v] : c.emotions) {
    const auto it = sim.emotionBaselines.find(e);
    double target = it == sim.emotionBaselines.end() ? 0 : it->second;
    if (depressed) {
      auto d = life.depressedEmotionTargets.find(e);
      if (d != life.depressedEmotionTargets.end()) target = d->second;
    }
    v = v + (target - v) * k;
  }
  // Weight holds steady on a routine; a depressed character barely eats.
  if (depressed) c.weightKg = std::max(30.0, c.weightKg - life.depressedWeightLossPerDay * hours / 24.0);
  c.caloriesIn = c.caloriesOut = 0;
  c.lastSimulatedAt = state_.now;
}

void World::stepConstruction() {
  const DateTime d = toDateTime(state_.now);
  for (const auto& def : content_->constructionProjects()) {
    ConstructionState& st = state_.construction[def.id];
    if (st.status != ConstructionStatus::Active) continue;
    const bool workDay = std::find(def.workDays.begin(), def.workDays.end(), d.weekday) != def.workDays.end();
    if (!workDay || d.hour < def.startHour || d.hour >= def.endHour) continue;
    st.workerHoursDone += static_cast<double>(def.crewSize) / 60.0;
    // crewSize / 60 is rarely exact in binary, so the running sum can land a hair under the target
    // on the minute the work is really done. The smallest step is 1/60 h, so 1e-6 never finishes early.
    if (st.workerHoursDone >= def.workerHoursRequired - 1e-6) completeProject(def, st);
  }
}

void World::completeProject(const ConstructionProjectDef& def, ConstructionState& st) {
  st.status = ConstructionStatus::Complete;
  st.workerHoursDone = def.workerHoursRequired;
  st.completedAt = state_.now;
  for (const auto& [k, v] : def.cityEffects) state_.city.stats[k] += v;
  std::string text = def.name + " is complete.";
  if (const LocationDef* opened = content_->location(def.opensLocation)) text += " " + opened->name + " is now open.";
  notifyAll("city", text);
  for (const auto& next : content_->constructionProjects()) {
    if (next.startsAfter != def.id) continue;
    ConstructionState& ns = state_.construction[next.id];
    if (ns.status == ConstructionStatus::Planned) {
      ns.status = ConstructionStatus::Active;
      notifyAll("city", "Construction has started on " + next.name + ".");
    }
  }
  updateCityStage();
}

void World::updateCityStage() {
  const double pop = state_.city.stats.count("population") ? state_.city.stats.at("population") : 0;
  int stage = 1;
  std::string name;
  for (const auto& s : content_->cityStages()) {
    if (pop >= s.minPopulation) {
      stage = s.stage;
      name = s.name;
    }
  }
  if (stage != state_.city.stage) {
    const bool grew = stage > state_.city.stage;
    state_.city.stage = stage;
    if (grew) notifyAll("city", "Livéra has become a " + name + ".");
  }
}

void World::chargeRent() {
  for (auto& [pid, p] : state_.properties) {
    if (p.tenant.empty()) continue;
    const PropertyDef* def = content_->property(pid);
    if (!def || def->rentMonthlyCents <= 0) continue;
    chargeHomeRent(p, *def);  // split evenly between everyone who lives there (Homes.cpp)
  }
  chargeMortgages();  // payments, missed payments and foreclosures (Homes.cpp)
}

// ---------------------------------------------------------------------------------
// Presence
// ---------------------------------------------------------------------------------
Status World::connect(const CharacterId& id) {
  CharacterState* c = mutableCharacter(id);
  if (!c) return fail("unknown_character", "no such character");
  if (c->online) return okStatus();
  catchUpDormant(*c, state_.now - c->lastSimulatedAt);
  c->online = true;
  c->lastOnlineAt = state_.now;
  emit(presentWith(*c), "presence", Json{{"character", id}, {"status", "arrived"}});
  return okStatus();
}

void World::disconnect(const CharacterId& id) {
  CharacterState* c = mutableCharacter(id);
  if (!c || !c->online) return;
  if (c->asleepSince >= 0) wakeUp(*c, false);  // the time asleep catches up before they go
  if (c->career.shiftStartedAt) (void)endShift(id);
  if (c->education.sessionStartedAt) (void)endStudy(id);
  c->moveTarget.reset();
  c->moveSpeedMps = 0;  // or whoever plays next is stuck "on the bus" with nowhere to go
  emit(presentWith(*c), "presence", Json{{"character", id}, {"status", "left"}});
  c->online = false;
  c->lastSimulatedAt = state_.now;
  c->lastOnlineAt = state_.now;
  seen_.erase(id);
  scripted_.erase(id);
}

void World::setScripted(const CharacterId& id, bool scripted, const std::string& playedBy) {
  if (scripted) scripted_[id] = playedBy;
  else scripted_.erase(id);
}

bool World::isScripted(const CharacterId& id) const { return scripted_.count(id) > 0; }

std::string World::playedBy(const CharacterId& id) const {
  auto it = scripted_.find(id);
  return it == scripted_.end() ? std::string() : it->second;
}

// ---------------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------------
Status World::moveTo(const CharacterId& actor, Vec2 target) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  if (!std::isfinite(target.x) || !std::isfinite(target.y)) return fail("invalid_target", "target is not a number");
  if (Status st = freeToAct(c); !st) return st;
  if (!c.inside.empty()) return fail("inside_building", "leave the building first");
  if (c.moveSpeedMps > 0) return fail("riding", "you're on the bus; get off at your stop");
  const SimulationConfig& sim = content_->sim();
  target.x = clampd(target.x, sim.worldMin.x, sim.worldMax.x);
  target.y = clampd(target.y, sim.worldMin.y, sim.worldMax.y);
  c.moveTarget = target;
  return okStatus();
}

Status World::enter(const CharacterId& actor, const LocationId& locationId) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  if (Status st = freeToAct(c); !st) return st;
  const LocationDef* loc = content_->location(locationId);
  if (!loc) return fail("unknown_location", "no such place");
  if (!loc->enterable) return fail("not_enterable", loc->name + " is an outdoor space; walk there instead");
  if (!c.inside.empty()) return fail("inside_building", "leave " + c.inside + " first");
  // Riding past a door isn't standing at it; stepping off mid-ride would also strand the bus speed.
  if (c.moveSpeedMps > 0) return fail("riding", "you're on the bus; get off at your stop");
  if (distance(c.position, loc->door) > content_->sim().entryRadiusMeters)
    return fail("too_far", "you need to be at the entrance of " + loc->name);
  if (Status a = canAccess(actor, *loc); !a) return a;
  c.inside = loc->id;
  c.position = loc->door;
  c.moveTarget.reset();
  const auto here = presentWith(c);
  emit(here, "presence", Json{{"character", actor}, {"status", "entered"}, {"location", loc->id}});
  // A celebrity walking in turns heads.
  if (c.fame >= content_->fame().celebrityAt) {
    const CharacterDef* def = definition(actor);
    for (const auto& id : here) notify(id, "fame", (def ? def->fullName() : actor) + " (" + fameTierOf(actor) + ") just walked in.");
  }
  return okStatus();
}

Result<Json> World::exitBuilding(const CharacterId& actor) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  if (c.inside.empty()) return fail("not_inside", "you are already outside");
  if (Status st = freeToAct(c); !st) return st.error();
  Json out = Json::object();
  const CareerDef* career = content_->career(c.career.careerId);
  if (c.career.shiftStartedAt && !(career && career->worksOutdoors)) {
    auto shift = endShift(actor);
    if (shift) out["shift"] = shift.value();
  }
  if (c.education.sessionStartedAt) {
    auto study = endStudy(actor);
    if (study) out["study"] = study.value();
  }
  emit(presentWith(c), "presence", Json{{"character", actor}, {"status", "left"}, {"location", c.inside}});
  out["left"] = c.inside;
  c.inside.clear();
  return out;
}

Result<Json> World::interact(const CharacterId& actor, const std::string& interactionId, const CharacterId& targetId) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& a = *r.value();
  const InteractionDef* def = content_->interaction(interactionId);
  if (!def) return fail("unknown_interaction", "no such interaction");
  if (targetId == actor) return fail("invalid_target", "you cannot do that with yourself");
  CharacterState* t = mutableCharacter(targetId);
  if (!t || !t->online) return fail("target_unavailable", "they are not here");
  if (!together(a, *t, def->rangeMeters)) return fail("too_far", "you need to be with them");

  RelationshipState& forward = relationshipRef(actor, targetId);
  if (forward.lastInteractionAt >= 0 && state_.now - forward.lastInteractionAt < kInteractionCooldown)
    return fail("too_soon", "give it a moment");

  const CharacterDef* actorDefPtr = definition(actor);
  const CharacterDef* targetDefPtr = definition(targetId);
  if (!actorDefPtr || !targetDefPtr) return fail("unknown_character", "no such character");
  const CharacterDef& actorDef = *actorDefPtr;
  const CharacterDef& targetDef = *targetDefPtr;
  RelationshipState& backward = relationshipRef(targetId, actor);
  const bool firstMeeting = forward.interactionCount == 0 && backward.interactionCount == 0 && forward.firstMetAt < 0;
  const LocationId where = a.inside;

  if (firstMeeting) {
    const double compat = compatibility(actorDef, targetDef);
    forward.firstMetAt = backward.firstMetAt = state_.now;
    forward.dimensions["compatibility"] = backward.dimensions["compatibility"] = compat;
    for (const auto& [owner, other] : {std::pair{actor, targetId}, std::pair{targetId, actor}}) {
      Memory m;
      m.id = nextId("mem");
      m.owner = owner;
      m.at = state_.now;
      m.participants = {actor, targetId};
      m.location = where;
      m.type = "first_meeting";
      m.importance = static_cast<int>(kFirstMeetingImportance);
      m.emotionalImpact = 10;
      m.about = other;
      m.info = "Met " + definition(other)->fullName();
      addMemory(std::move(m));
    }
  }

  // How the target receives it depends on who they are, and on what they remember.
  double receptivity = 1.0;
  if (!def->receptivityTrait.empty()) {
    const auto it = targetDef.personality.find(def->receptivityTrait);
    receptivity = 0.5 + (it == targetDef.personality.end() ? 50 : it->second) / 100.0;
  }
  const bool grudge = holdsGrudge(targetId, actor);
  if (a.fame >= content_->fame().celebrityAt) receptivity *= 1.0 + content_->fame().receptivityBonus;
  receptivity *= detailsReceptivity(a);

  for (const auto& [dim, delta] : def->actorToTarget) adjustRelationship(actor, targetId, dim, delta);
  const LifeConfig& life = content_->life();
  const double grooming = std::min(100.0, (a.needs.count("grooming") ? a.needs.at("grooming") : 50) + styleOf(a));
  const double groomed = life.groomingAttractionMin + (life.groomingAttractionMax - life.groomingAttractionMin) * grooming / 100.0;
  for (const auto& [dim, delta] : def->targetToActor) {
    double d = delta;
    if (d > 0) {
      d *= receptivity;
      if (grudge) d *= 0.5;
      if (dim == "physical_attraction") d *= groomed;  // first impressions: did you look after yourself?
    }
    adjustRelationship(targetId, actor, dim, d);
  }
  applyNeeds(a, def->actorNeeds);
  applyNeeds(*t, def->targetNeeds);
  applyEmotions(a, def->actorEmotions);
  applyEmotions(*t, def->targetEmotions);

  // A one-sided seeded acquaintance becomes mutual once they actually interact.
  if (forward.firstMetAt < 0) forward.firstMetAt = state_.now;
  if (backward.firstMetAt < 0) backward.firstMetAt = state_.now;
  forward.lastInteractionAt = state_.now;
  forward.interactionCount += 1;
  backward.interactionCount += 1;

  if (def->importance >= content_->sim().memoryImportanceThreshold) {
    for (const auto& [owner, other] : {std::pair{targetId, actor}, std::pair{actor, targetId}}) {
      Memory m;
      m.id = nextId("mem");
      m.owner = owner;
      m.at = state_.now;
      m.participants = {actor, targetId};
      m.location = where;
      m.type = def->memoryType;
      m.importance = def->importance;
      m.emotionalImpact = def->emotionalImpact;
      m.about = other;
      m.info = actorDef.firstName + ": " + def->label;
      addMemory(std::move(m));
    }
  }

  emit({targetId}, "interaction", Json{{"from", actor}, {"interaction", def->id}, {"label", def->label}});

  // The actor learns only their own side. The target's private feelings stay private.
  const char* reaction = "neutral";
  const double net = def->targetToActor.count("friendship") ? def->targetToActor.at("friendship") : 0;
  if (net > 0) reaction = grudge ? "guarded" : (receptivity >= 1.0 ? "warm" : "polite");
  if (net < 0) reaction = "hurt";
  Json out{{"interaction", def->id},
           {"target", targetId},
           {"first_meeting", firstMeeting},
           {"reaction", reaction},
           {"your_feelings", forward.dimensions}};
  return out;
}

Result<Json> World::buy(const CharacterId& actor, const std::string& offerId, const std::string& paymentMethod) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  if (Status st = freeToAct(c); !st) return st.error();
  const LocationDef* loc = currentPlace(c);
  if (!loc) return fail("not_inside", "you need to be inside a shop");
  const Offer* offer = nullptr;
  for (const auto& o : loc->offers) {
    if (o.id == offerId) offer = &o;
  }
  if (!offer) return fail("unknown_offer", loc->name + " doesn't sell that");
  if (!isLocationOpen(*loc)) return fail("closed", loc->name + " is closed");
  // An illegal buy in front of the police ends in handcuffs, before any money changes hands.
  if (offer->illegal) {
    if (const CrimeDef* crime = content_->crimeDef("drug_purchase"); crime && roll() < detectionChance(c, *crime)) {
      Json out = arrestCharacter(c, "drug_purchase", "police");
      out["caught"] = true;
      return out;
    }
  }
  LedgerAccountId from;
  if (paymentMethod == "card") from = bankAccountOf(actor);
  else if (paymentMethod == "cash") from = cashAccountOf(actor);
  else if (paymentMethod == "phone") {  // LivPay: tap your phone, paid from your bank (Wallet.cpp)
    if (Status st = phoneUsable(c); !st) return st.error();
    from = bankAccountOf(actor);
  } else return fail("invalid_payment", "pay by card, cash or phone");
  if (!offer->requiresDiagnosis.empty()) {
    const ConditionState* k = findCondition(c, offer->requiresDiagnosis);
    if (!k || !k->diagnosed) return fail("needs_prescription", "a doctor has to diagnose you before you can buy that");
  }
  if (Status rx = checkPrescription(c, *offer); !rx) return rx.error();  // m08:pets: prescriptions (Pets.cpp)
  if (offer->service == "prenatal" && !c.pregnancy) return fail("not_pregnant", "you're not pregnant");
  if (offer->service == "abortion") {
    if (!c.pregnancy || !c.pregnancy->known) return fail("not_pregnant", "a test or a doctor needs to confirm the pregnancy first");
    const double days = static_cast<double>(state_.now - c.pregnancy->conceivedAt) / kMinutesPerDay;
    if (days > content_->romance().abortionLimitDays) return fail("too_late", "it's past the limit for this procedure");
  }
  // Don't charge for treatment there is nothing to give.
  if (offer->service == "treatment") {
    const bool any = std::any_of(c.conditions.begin(), c.conditions.end(), [&](const ConditionState& k) {
      const ConditionDef* d = content_->condition(k.id);
      return d && k.diagnosed && std::find(d->treatedBy.begin(), d->treatedBy.end(), "treatment") != d->treatedBy.end();
    });
    if (!any) return fail("nothing_to_treat", "nothing diagnosed that treatment helps; get a checkup first");
  }

  auto tx = state_.ledger.transfer(from, loc->revenueAccount, offer->priceCents,
                                   paymentMethod == "phone" ? "livpay_purchase" : "purchase",
                                   offer->label + " at " + loc->name, state_.now);
  if (!tx) return tx.error();
  applyNeeds(c, offer->needEffects);
  applyEmotions(c, offer->emotionEffects);
  eat(c, offer->needEffects, offer->calories);
  c.caloriesOut += offer->caloriesBurned;
  Json out{{"tx", tx.value()},
           {"item", offer->label},
           {"price_cents", offer->priceCents},
           {"paid_with", paymentMethod},
           {"balance_cents", state_.ledger.balance(from)}};
  if (!offer->service.empty()) {
    auto care = runCareService(c, offer->service, *loc);
    if (care) out["care"] = care.value();
    payCliniciansOnDuty(actor, *loc, offer->priceCents, out);
  }
  if (!offer->item.empty()) {
    c.inventory[offer->item] += offer->quantity;
    out["owned"] = c.inventory[offer->item];
    fillPrescription(c, *offer, out);  // m08:pets: each fill uses a refill (Pets.cpp)
  }
  if (!offer->substance.empty()) out["effect"] = takeSubstance(c, offer->substance);
  applyConditionRecovery(c, offer->conditionRecovery);
  leisureAfterPurchase(c, *loc, offer->id, out);  // m08:leisure: a date at a date spot (Leisure.cpp)
  return out;
}

Result<Json> World::useActivity(const CharacterId& actor, const std::string& activityId) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  const LocationDef* loc = currentPlace(c);
  if (!loc) return fail("nothing_here", "there is nothing to do here");
  const Activity* act = nullptr;
  for (const auto& a : loc->activities) {
    if (a.id == activityId) act = &a;
  }
  if (!act) return fail("unknown_activity", "you can't do that at " + loc->name);
  if (loc->enterable && !isLocationOpen(*loc) && loc->access == AccessRule::Public)
    return fail("closed", loc->name + " is closed");
  const std::string key = loc->id + "/" + act->id;
  auto ready = c.activityReadyAt.find(key);
  if (ready != c.activityReadyAt.end() && state_.now < ready->second) return fail("too_soon", "you just did that");
  // Housework only counts in your own home.
  PropertyState* home = nullptr;
  if (!act->homeEffects.empty()) {
    PropertyState* mine = homeOf(actor);
    const PropertyDef* def = mine ? content_->property(mine->id) : nullptr;
    if (!def || def->location != loc->id) return fail("not_your_home", "you can only do that in your own home");
    home = mine;
  }
  auto leisure = leisureActivity(c, *loc, *act);  // m08:leisure: hours, practice, dates (Leisure.cpp)
  if (!leisure) return leisure.error();
  c.activityReadyAt[key] = state_.now + act->cooldownMinutes;
  applyNeeds(c, act->needEffects);
  applyEmotions(c, act->emotionEffects);
  eat(c, act->needEffects, act->caloriesEaten);
  c.caloriesOut += act->caloriesBurned;
  Json needs = Json::object();
  for (const auto& [k, v] : act->needEffects) needs[k] = std::round(c.needs[k]);
  Json out{{"activity", act->id}, {"label", act->label}, {"needs", needs}};
  if (home) {
    for (const auto& [k, d] : act->homeEffects) {
      double& v = k == "cleanliness" ? home->cleanliness : home->trash;
      v = clampd(v + d, kStatMin, kStatMax);
    }
    out["home"] = Json{{"cleanliness", std::round(home->cleanliness)}, {"trash", std::round(home->trash)}};
  }
  out.update(leisure.value());  // m08:leisure
  return out;
}

const LocationDef* World::currentPlace(const CharacterState& c) const {
  if (!c.inside.empty()) return content_->location(c.inside);
  const LocationDef* best = nullptr;
  double bestDistance = 0;
  for (const auto& [id, loc] : content_->locations()) {
    if (loc.enterable || locationStatus(loc) == "under_construction") continue;
    const double d = distance(c.position, loc.door);
    if (d <= loc.outdoorRadius && (!best || d < bestDistance)) {
      best = &loc;
      bestDistance = d;
    }
  }
  return best;
}

Status World::startShift(const CharacterId& actor) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  if (Status st = freeToAct(c); !st) return st;
  const CareerDef* career = content_->career(c.career.careerId);
  if (!career) return fail("no_career", "you don't have a job");
  if (c.career.shiftStartedAt) return fail("already_working", "you are already on shift");
  if (career->atEmployersHome) {
    // A nanny works in the home of the family that hired them.
    if (c.nannyFor.empty()) return fail("no_employer", "no family has hired you yet");
    const PropertyState* home = homeOf(c.nannyFor);
    const PropertyDef* def = home ? content_->property(home->id) : nullptr;
    if (!def || c.inside != def->location) return fail("wrong_place", "go to the family's home first");
  } else if (std::find(career->workplaces.begin(), career->workplaces.end(), c.inside) == career->workplaces.end()) {
    return fail("wrong_place", "go to your workplace first");
  }
  c.career.shiftStartedAt = state_.now;
  c.career.shiftLocation = c.inside;
  c.career.shiftWellbeingSum = 0;
  c.career.shiftSamples = 0;
  // The shift's first decision is up at once; say so, as each later one will be (WorkTasks.cpp).
  refreshWorkDay(c);
  const WorkTasksUp up = workTasksUp(c);
  if (up.shown > 0 && !workAnswerToday(c, up.pending.front())) announceWorkTask(c, up, up.pending.front());
  return okStatus();
}

Result<Json> World::endShift(const CharacterId& actor) {
  CharacterState* c = mutableCharacter(actor);
  if (!c) return fail("unknown_character", "no such character");
  if (!c->career.shiftStartedAt) return fail("not_working", "you are not on shift");
  const CareerDef* career = content_->career(c->career.careerId);
  CareerState& cs = c->career;
  const GameMinutes worked = state_.now - *cs.shiftStartedAt;
  const double paidHours = std::min(static_cast<double>(worked) / 60.0, career->maxShiftHours);
  const CareerLevel& level = career->levels.at(static_cast<std::size_t>(cs.level));
  Json out{{"minutes_worked", worked}, {"title", level.title}};
  // Decisions made this shift (WorkTasks.cpp); they count toward promotion only if the shift does.
  workShiftReport(*c, *cs.shiftStartedAt, static_cast<double>(worked) >= career->minPaidMinutes, out);

  cs.shiftStartedAt.reset();
  if (static_cast<double>(worked) < career->minPaidMinutes) {
    out["pay_cents"] = 0;
    out["note"] = "Shift too short to be paid.";
    return out;
  }
  const auto pay = static_cast<Cents>(std::llround(paidHours * static_cast<double>(level.hourlyCents)));
  // A nanny is paid by the family, out of the parent's bank account.
  const LedgerAccountId payer = career->atEmployersHome ? bankAccountOf(c->nannyFor) : career->employerAccount;
  auto tx = state_.ledger.transfer(payer, bankAccountOf(actor), pay, "salary", career->name + " pay: " + level.title, state_.now);
  if (!tx) {
    // The employer could not make payroll. The work still counts toward experience.
    notify(actor, "career", "Payroll failed: your employer could not pay you for this shift.");
    if (career->atEmployersHome && character(c->nannyFor))
      notify(c->nannyFor, "family", "You couldn't pay your nanny " + formatMoney(pay) + " for today's shift.");
    out["pay_cents"] = 0;
    out["note"] = "Employer could not make payroll.";
  } else {
    cs.lifetimeEarningsCents += pay;
    out["pay_cents"] = pay;
    out["tx"] = tx.value();
    notify(actor, "bank", "Paycheck deposited: " + formatMoney(pay) + ".");
  }
  const double shiftScore = (cs.shiftSamples > 0 ? cs.shiftWellbeingSum / cs.shiftSamples : averageNeed(*c)) *
                            (1.0 - performancePenalty(*c));
  cs.performance = clampd(cs.performance * 0.7 + shiftScore * 0.3, 0, 100);
  cs.hoursAtLevel += paidHours;
  out["performance"] = std::round(cs.performance);

  const bool canPromote = cs.level + 1 < static_cast<int>(career->levels.size());
  if (canPromote && level.hoursToPromote > 0 && cs.hoursAtLevel >= level.hoursToPromote &&
      cs.performance >= level.minPerformance) {
    cs.level += 1;
    cs.hoursAtLevel = 0;
    const std::string& title = career->levels.at(static_cast<std::size_t>(cs.level)).title;
    out["promoted_to"] = title;
    notify(actor, "career", "You've been promoted to " + title + "!");
    Memory m;
    m.id = nextId("mem");
    m.owner = actor;
    m.at = state_.now;
    m.participants = {actor};
    m.location = cs.shiftLocation;
    m.type = "promotion";
    m.importance = 70;
    m.emotionalImpact = 60;
    m.info = "Promoted to " + title;
    addMemory(std::move(m));
  }
  return out;
}

Result<std::string> World::sendMessage(const CharacterId& from, const CharacterId& to, const std::string& body) {
  auto r = activeCharacter(from);
  if (!r) return r.error();
  if (Status st = phoneUsable(*r.value()); !st) return st.error();  // texting needs a working phone (Wallet.cpp)
  if (!state_.characters.count(to)) return fail("unknown_character", "no such contact");
  if (to == from) return fail("invalid_target", "you cannot message yourself");
  const std::string text = trim(body);
  if (text.empty()) return fail("invalid_message", "message is empty");
  if (static_cast<int>(text.size()) > content_->sim().maxMessageLength) return fail("invalid_message", "message too long");
  Message m{nextId("msg"), from, to, state_.now, text, false};
  state_.messages.push_back(m);
  emit({to}, "message", Json{{"id", m.id}, {"from", from}, {"body", text}, {"at", m.at}});
  return m.id;
}

Result<Json> World::say(const CharacterId& actor, const std::string& text, const std::string& volume,
                        const CharacterId& whisperTo) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  const SimulationConfig& sim = content_->sim();
  // Control characters could forge lines in a client's chat log; flatten them to spaces.
  std::string clean = text;
  for (char& ch : clean) {
    if (static_cast<unsigned char>(ch) < 0x20 || ch == 0x7f) ch = ' ';
  }
  clean = trim(clean);
  if (clean.empty()) return fail("invalid_speech", "say something");
  if (static_cast<int>(clean.size()) > sim.maxSpeechLength) return fail("invalid_speech", "that's too long to say");

  std::vector<CharacterId> hearers;
  if (volume == "whisper") {
    const CharacterState* t = character(whisperTo);
    if (!t || !t->online || whisperTo == actor) return fail("target_unavailable", "they are not here");
    if (!together(c, *t, sim.whisperRangeMeters)) return fail("too_far", "get closer to whisper");
    hearers.push_back(whisperTo);
  } else if (volume == "say" || volume == "shout") {
    hearers = presentWith(c, volume == "shout" ? sim.shoutRangeMeters : sim.hearingRangeMeters);
  } else {
    return fail("invalid_speech", "volume must be say, shout or whisper");
  }

  const CharacterDef* def = definition(actor);
  Json line{{"from", actor},
            {"name", def ? def->fullName() : actor},
            {"text", clean},
            {"volume", volume},
            {"position", {std::round(c.position.x * 10) / 10, std::round(c.position.y * 10) / 10}}};
  if (volume == "whisper") line["to"] = whisperTo;
  // One event per hearer: how far away the voice is differs for each of them.
  for (const auto& h : hearers) {
    Json heard = line;
    const CharacterState* hs = character(h);
    if (hs && c.inside.empty() && hs->inside.empty())
      heard["distance_m"] = std::round(distance(c.position, hs->position));
    emit({h}, "speech", std::move(heard));
  }
  if (volume == "whisper") {
    // Onlookers see the leaning in, never the words: everyone who would have heard a `say`, except the two.
    std::vector<CharacterId> onlookers;
    for (const auto& id : presentWith(c, sim.hearingRangeMeters)) {
      if (id != whisperTo) onlookers.push_back(id);
    }
    const CharacterDef* toDef = definition(whisperTo);
    if (!onlookers.empty())
      emit(onlookers, "whispering", Json{{"from", actor}, {"from_name", def ? def->fullName() : actor},
                                         {"to", whisperTo}, {"to_name", toDef ? toDef->fullName() : whisperTo}});
  }
  // Talking with people (not to an empty room) is social contact for everyone involved.
  if (!hearers.empty()) {
    applyNeeds(c, {{"social", 1}});
    for (const auto& h : hearers) applyNeeds(*mutableCharacter(h), {{"social", 1}});
  }
  return Json{{"heard_by", hearers.size()}, {"volume", volume}};
}

Result<Json> World::tip(const CharacterId& actor, const CharacterId& target, Cents amount) {
  constexpr Cents kMinTip = 100;
  constexpr Cents kMaxTip = 100000;
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  if (target == actor) return fail("invalid_target", "you can't tip yourself");
  CharacterState* t = mutableCharacter(target);
  if (!t || !t->online) return fail("target_unavailable", "they are not here");
  if (!together(*r.value(), *t, 5)) return fail("too_far", "you need to be with them");
  if (amount < kMinTip || amount > kMaxTip) return fail("invalid_amount", "tips are $1 to $1,000");
  const CharacterDef* from = definition(actor);
  auto tx = state_.ledger.transfer(bankAccountOf(actor), bankAccountOf(target), amount, "tip",
                                   "Tip from " + (from ? from->fullName() : actor), state_.now);
  if (!tx) return tx.error();
  adjustRelationship(target, actor, "friendship", std::min(3.0, static_cast<double>(amount) / 1000.0));
  notify(target, "bank", (from ? from->firstName : actor) + " tipped you " + formatMoney(amount) + ".");
  return Json{{"tx", tx.value()}, {"amount_cents", amount}, {"balance_cents", state_.ledger.balance(bankAccountOf(actor))}};
}

Result<Json> World::openPhoneApp(const CharacterId& actor, const std::string& app) {
  auto r = activeCharacter(actor, /*wakes=*/false);  // reading your phone in bed doesn't get you up
  if (!r) return r.error();
  CharacterState& c = *r.value();
  if (Status st = phoneUsable(c); !st) return st.error();  // a dead phone opens nothing (Wallet.cpp)
  if (app == "bank") return phoneBank(c);
  if (app == "messages") return phoneMessages(c);
  if (app == "contacts") return phoneContacts(c);
  if (app == "calendar") return phoneCalendar(c);
  if (app == "map") return mapView();
  if (app == "career") return phoneCareer(c);
  if (app == "property") return phoneProperty(c);
  if (app == "notifications") return phoneNotifications(c);
  if (app == "city") return phoneCity();
  if (app == "studio") return songsView(c);
  if (app == "health") return phoneHealth(c);
  if (app == "items") return phoneItems(c);
  if (app == "transit") return phoneTransit();
  if (app == "school") return phoneSchool(c);
  if (app == "jobs") return phoneJobs(c);
  if (app == "record") return phoneRecord(c);
  if (app == "romance") return phoneRomance(c);
  if (app == "fame") return phoneFame(c);
  if (app == "family") return phoneFamily(c);
  if (app == "homes") return phoneHomes(c);
  if (app == "work") return phoneWork(c);
  if (app == "wallet") return phoneWallet(c);
  if (app == "store") return phoneStore(c);
  if (app == "sports") return phoneSports(c);
  if (app == "pets") return phonePets(c);
  if (app == "weather") return phoneWeather(c);
  if (app == "goals") return phoneGoals(c);  // only ever your own (Goals.cpp)
  return fail("unknown_app", "no such phone app");
}

// ---------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------
const CharacterState* World::character(const CharacterId& id) const {
  auto it = state_.characters.find(id);
  return it == state_.characters.end() ? nullptr : &it->second;
}

CharacterState* World::mutableCharacter(const CharacterId& id) {
  auto it = state_.characters.find(id);
  return it == state_.characters.end() ? nullptr : &it->second;
}

Result<CharacterState*> World::activeCharacter(const CharacterId& id, bool wakes) {
  CharacterState* c = mutableCharacter(id);
  if (!c) return fail("unknown_character", "no such character");
  if (!c->online) return fail("not_in_world", "character is not in the world");
  if (wakes && c->asleepSince >= 0) wakeUp(*c, false);  // doing anything gets you out of bed (Sleep.cpp)
  return c;
}

const RelationshipState* World::relationship(const CharacterId& from, const CharacterId& to) const {
  auto it = state_.relationships.find({from, to});
  return it == state_.relationships.end() ? nullptr : &it->second;
}

double World::relationshipValue(const CharacterId& from, const CharacterId& to, const std::string& dim) const {
  const RelationshipState* r = relationship(from, to);
  if (!r) return 0;
  auto it = r->dimensions.find(dim);
  return it == r->dimensions.end() ? 0 : it->second;
}

RelationshipState& World::relationshipRef(const CharacterId& from, const CharacterId& to) {
  auto [it, inserted] = state_.relationships.try_emplace({from, to});
  if (inserted) {
    for (const auto& d : content_->sim().relationshipDimensions) it->second.dimensions[d] = 0;
  }
  return it->second;
}

void World::adjustRelationship(const CharacterId& from, const CharacterId& to, const std::string& dim, double delta) {
  double& v = relationshipRef(from, to).dimensions[dim];
  // Positive change saturates: going from 80 to 90 takes more than going from 0 to 10.
  if (delta > 0) delta *= std::max(0.1, 1.0 - std::max(0.0, v) / 150.0);
  v = clampd(v + delta, kRelMin, kRelMax);
}

double World::compatibility(const CharacterDef& a, const CharacterDef& b) const {
  std::set<std::string> ai(a.interests.begin(), a.interests.end());
  int shared = 0;
  for (const auto& i : b.interests) shared += ai.count(i) ? 1 : 0;
  const auto minSize = std::max<std::size_t>(1, std::min(a.interests.size(), b.interests.size()));
  const double interestScore = std::min(1.0, static_cast<double>(shared) / static_cast<double>(minSize)) * 50.0;
  double diff = 0;
  int n = 0;
  for (const auto& [k, v] : a.values) {
    auto it = b.values.find(k);
    if (it == b.values.end()) continue;
    diff += std::abs(v - it->second);
    ++n;
  }
  const double valueScore = n ? (100.0 - diff / n) / 2.0 : 25.0;
  return std::round(clampd(interestScore + valueScore, 0, 100));
}

bool World::holdsGrudge(const CharacterId& owner, const CharacterId& about) const {
  for (const auto& m : state_.memories) {
    if (m.owner == owner && m.about == about && m.emotionalImpact <= kGrudgeImpact && m.importance >= kGrudgeImportance)
      return true;
  }
  return false;
}

std::vector<const Memory*> World::memoriesOf(const CharacterId& owner) const {
  std::vector<const Memory*> out;
  for (const auto& m : state_.memories) {
    if (m.owner == owner) out.push_back(&m);
  }
  return out;
}

void World::addMemory(Memory m) { state_.memories.push_back(std::move(m)); }

void World::applyNeeds(CharacterState& c, const StatMap& deltas) {
  for (const auto& [k, d] : deltas) c.needs[k] = clampd(c.needs[k] + d, kStatMin, kStatMax);
}

void World::applyEmotions(CharacterState& c, const StatMap& deltas) {
  for (const auto& [k, d] : deltas) c.emotions[k] = clampd(c.emotions[k] + d, kStatMin, kStatMax);
}

bool World::isLocationOpen(const LocationDef& loc) const { return locationStatus(loc) == "open"; }

std::string World::locationStatus(const LocationDef& loc) const {
  if (!loc.constructionProject.empty()) {
    auto it = state_.construction.find(loc.constructionProject);
    if (it == state_.construction.end() || it->second.status != ConstructionStatus::Complete) return "under_construction";
  }
  if (loc.hours) {
    const DateTime d = toDateTime(state_.now);
    if (!loc.hours->isOpenOn(d.weekday, d.hour)) return "closed";  // its hours, on the weekdays it opens
  }
  return "open";
}

Status World::canAccess(const CharacterId& actor, const LocationDef& loc) const {
  const std::string status = locationStatus(loc);
  if (status == "under_construction") return fail("under_construction", loc.name + " is still being built");
  // People can always get into their own workplace, whatever the opening hours, and
  // students into their campus.
  if (const CharacterState* c = character(actor)) {
    if (const CareerDef* career = content_->career(c->career.careerId)) {
      if (std::find(career->workplaces.begin(), career->workplaces.end(), loc.id) != career->workplaces.end())
        return okStatus();
    }
    if (const ProgramDef* program = content_->program(c->education.program)) {
      if (std::find(program->campuses.begin(), program->campuses.end(), loc.id) != program->campuses.end() &&
          (loc.access != AccessRule::Public || status == "open"))
        return okStatus();
    }
    // The family's nanny has a key to the home the family lives in now.
    if (!c->nannyFor.empty()) {
      const PropertyState* family = homeOf(c->nannyFor);
      const PropertyDef* def = family ? content_->property(family->id) : nullptr;
      if (def && def->location == loc.id) return okStatus();
    }
  }
  switch (loc.access) {
    case AccessRule::Public:
      if (status == "closed") return fail("closed", loc.name + " is closed right now");
      return okStatus();
    case AccessRule::Residents:
      for (const auto& [pid, p] : state_.properties) {
        const PropertyDef* def = content_->property(pid);
        if (!def || def->location != loc.id) continue;
        if (hasKey(p, actor)) return okStatus();  // residents and owners (Homes.cpp)
        for (const auto& resident : residentsOf(p)) {
          const std::string bond = relationshipStatus(actor, resident);
          // Your partner can come over.
          if (bond == "dating" || bond == "engaged" || bond == "married") return okStatus();
        }
      }
      return fail("no_access", "you don't live here");
    case AccessRule::Staff:
      return fail("no_access", "staff only");  // staff were let in above
  }
  return fail("no_access", "you can't go in");
}

bool World::together(const CharacterState& a, const CharacterState& b, double outdoorRange) const {
  if (!a.inside.empty() || !b.inside.empty()) return a.inside == b.inside;
  return distance(a.position, b.position) <= outdoorRange;
}

std::vector<CharacterId> World::presentWith(const CharacterState& c, double outdoorRange) const {
  std::vector<CharacterId> out;
  for (const auto& [id, o] : state_.characters) {
    if (id != c.id && o.online && together(c, o, outdoorRange)) out.push_back(id);
  }
  return out;
}

const CharacterDef* World::definition(const CharacterId& id) const {
  if (const CharacterDef* d = content_->character(id)) return d;
  auto it = state_.createdCharacters.find(id);
  return it == state_.createdCharacters.end() ? nullptr : &it->second;
}

std::string World::nextId(const char* prefix) { return std::string(prefix) + "-" + std::to_string(state_.nextId++); }

void World::notify(const CharacterId& recipient, const std::string& kind, const std::string& text) {
  Notification n{nextId("ntf"), recipient, state_.now, kind, text, false};
  state_.notifications.push_back(n);
  // Keep each character's inbox bounded; oldest go first.
  std::size_t count = 0;
  for (const auto& x : state_.notifications) count += x.recipient == recipient ? 1 : 0;
  if (count > kNotificationsKept) {
    auto it = std::find_if(state_.notifications.begin(), state_.notifications.end(),
                           [&](const Notification& x) { return x.recipient == recipient; });
    state_.notifications.erase(it);
  }
  emit({recipient}, "notification", Json{{"id", n.id}, {"kind", kind}, {"text", text}, {"at", n.at}});
}

void World::notifyAll(const std::string& kind, const std::string& text) {
  for (const auto& [id, c] : state_.characters) notify(id, kind, text);
}

void World::emit(std::vector<CharacterId> recipients, std::string type, Json data) {
  events_.push_back(WorldEvent{std::move(recipients), std::move(type), std::move(data)});
}

std::vector<WorldEvent> World::drainEvents() {
  std::vector<WorldEvent> out;
  out.swap(events_);
  return out;
}

}  // namespace livera
