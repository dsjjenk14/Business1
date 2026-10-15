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

  // Ledger: the outside economy, organisations, then every character's accounts.
  (void)s.ledger.openAccount(LedgerAccount{kEconomyAccount, "system", "system", 0, true});
  for (const auto& org : db.orgAccounts()) {
    (void)s.ledger.openAccount(LedgerAccount{org.id, org.id, "business", 0, false});
    if (org.openingBalanceCents > 0)
      (void)s.ledger.transfer(kEconomyAccount, org.id, org.openingBalanceCents, "opening_balance", org.name, s.now);
  }

  for (const auto& [pid, p] : db.properties()) s.properties[pid] = PropertyState{pid, p.ownerAccount, ""};

  for (const auto& [id, def] : db.characters()) {
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
    c.career.careerId = def.careerId;
    c.career.level = def.careerLevel;
    c.lastSimulatedAt = s.now;
    s.characters[id] = c;

    (void)s.ledger.openAccount(LedgerAccount{bankAccountOf(id), id, "bank", 0, false});
    (void)s.ledger.openAccount(LedgerAccount{cashAccountOf(id), id, "cash", 0, false});
    if (def.startingBankCents > 0)
      (void)s.ledger.transfer(kEconomyAccount, bankAccountOf(id), def.startingBankCents, "opening_balance",
                              "Savings brought to Livéra", s.now);
    if (def.startingCashCents > 0)
      (void)s.ledger.transfer(kEconomyAccount, cashAccountOf(id), def.startingCashCents, "opening_balance",
                              "Cash on hand", s.now);
    s.properties[def.homeProperty].tenant = id;
  }

  for (const auto& p : db.constructionProjects()) {
    ConstructionState cs;
    cs.id = p.id;
    cs.status = p.startsAfter.empty() ? ConstructionStatus::Active : ConstructionStatus::Planned;
    s.construction[p.id] = cs;
  }
  s.city.stats = db.cityInitial();

  World w(std::move(content), std::move(s));
  const ContentDatabase& c = w.content();

  // Seed relationships and pre-founding memories from character data.
  for (const auto& [id, def] : c.characters()) {
    for (const auto& r : def.relationships) {
      RelationshipState& rs = w.relationshipRef(id, r.to);
      rs.dimensions["compatibility"] = w.compatibility(def, *c.character(r.to));
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
  // Characters added to content after a world was saved join the existing world.
  const ContentDatabase& db = *content_;
  for (const auto& [id, def] : db.characters()) {
    if (state_.characters.count(id)) continue;
    CharacterState c;
    c.id = id;
    c.position = db.location(def.spawnLocation)->door;
    for (const auto& n : db.sim().needs) c.needs[n.id] = n.initial;
    for (const auto& e : db.sim().emotions) c.emotions[e] = 0;
    c.career.careerId = def.careerId;
    c.career.level = def.careerLevel;
    c.lastSimulatedAt = state_.now;
    state_.characters[id] = c;
    if (!state_.ledger.account(bankAccountOf(id)))
      (void)state_.ledger.openAccount(LedgerAccount{bankAccountOf(id), id, "bank", 0, false});
    if (!state_.ledger.account(cashAccountOf(id)))
      (void)state_.ledger.openAccount(LedgerAccount{cashAccountOf(id), id, "cash", 0, false});
  }
  // Need definitions added later start at their initial value.
  for (auto& [id, c] : state_.characters) {
    for (const auto& n : db.sim().needs) c.needs.try_emplace(n.id, n.initial);
    for (const auto& e : db.sim().emotions) c.emotions.try_emplace(e, 0);
  }
}

// ---------------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------------
void World::advanceRealTime(double seconds) {
  if (seconds <= 0) return;
  const ContentDatabase& db = *content_;
  const double step = db.sim().walkSpeedMetersPerSecond * seconds;
  for (auto& [id, c] : state_.characters) {
    if (!c.online || !c.moveTarget || !c.inside.empty()) continue;
    const Vec2 target = *c.moveTarget;
    const double d = distance(c.position, target);
    if (d <= step) {
      c.position = target;
      c.moveTarget.reset();
      emit({id}, "arrived", Json{{"position", {c.position.x, c.position.y}}});
    } else {
      c.position.x += (target.x - c.position.x) / d * step;
      c.position.y += (target.y - c.position.y) / d * step;
    }
  }
  state_.clockCarry += seconds * db.sim().minutesPerRealSecond;
  const auto whole = static_cast<GameMinutes>(state_.clockCarry);
  state_.clockCarry -= static_cast<double>(whole);
  advanceMinutes(whole);
}

// Each step simulates the minute [now, now+1), then moves the clock. Things that happen
// at an instant (rent on the first of the month) fire when the clock reaches that instant.
void World::advanceMinutes(GameMinutes minutes) {
  for (GameMinutes i = 0; i < minutes; ++i) {
    stepMinute();
    ++state_.now;
    if (state_.now % kMinutesPerMonth == 0) chargeRent();
  }
}

void World::stepMinute() {
  stepConstruction();
  for (auto& [id, c] : state_.characters) {
    if (c.online) simulateCharacterMinute(c);
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
  c.lastSimulatedAt = state_.now + 1;
}

// Tier 3: a character nobody is playing is assumed to live their routine. Instead of
// simulating each minute, needs and emotions converge toward a steady state.
void World::catchUpDormant(CharacterState& c, GameMinutes elapsed) {
  if (elapsed <= 0) return;
  const SimulationConfig& sim = content_->sim();
  const double hours = static_cast<double>(elapsed) / 60.0;
  const double k = 1.0 - std::exp(-hours / 8.0);
  for (auto& [n, v] : c.needs) v = clampd(v + (sim.offlineNeedTarget - v) * k, kStatMin, kStatMax);
  for (auto& [e, v] : c.emotions) {
    const auto it = sim.emotionBaselines.find(e);
    const double base = it == sim.emotionBaselines.end() ? 0 : it->second;
    v = v + (base - v) * k;
  }
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
    if (st.workerHoursDone >= def.workerHoursRequired) completeProject(def, st);
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
    CharacterState* tenant = mutableCharacter(p.tenant);
    if (!tenant) continue;
    const LocationDef* loc = content_->location(def->location);
    auto tx = state_.ledger.transfer(bankAccountOf(p.tenant), p.ownerAccount, def->rentMonthlyCents, "rent",
                                     "Rent: " + (loc ? loc->name : pid), state_.now);
    if (tx) {
      notify(p.tenant, "bank", "Rent of " + formatMoney(def->rentMonthlyCents) + " paid.");
    } else {
      tenant->rentArrearsCents += def->rentMonthlyCents;
      notify(p.tenant, "bank",
             "Rent of " + formatMoney(def->rentMonthlyCents) + " is overdue. Total owed: " +
                 formatMoney(tenant->rentArrearsCents) + ".");
    }
  }
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
  emit(presentWith(*c), "presence", Json{{"character", id}, {"status", "arrived"}});
  return okStatus();
}

void World::disconnect(const CharacterId& id) {
  CharacterState* c = mutableCharacter(id);
  if (!c || !c->online) return;
  if (c->career.shiftStartedAt) (void)endShift(id);
  c->moveTarget.reset();
  emit(presentWith(*c), "presence", Json{{"character", id}, {"status", "left"}});
  c->online = false;
  c->lastSimulatedAt = state_.now;
}

// ---------------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------------
Status World::moveTo(const CharacterId& actor, Vec2 target) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  if (!std::isfinite(target.x) || !std::isfinite(target.y)) return fail("invalid_target", "target is not a number");
  if (!c.inside.empty()) return fail("inside_building", "leave the building first");
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
  const LocationDef* loc = content_->location(locationId);
  if (!loc) return fail("unknown_location", "no such place");
  if (!loc->enterable) return fail("not_enterable", loc->name + " is an outdoor space; walk there instead");
  if (!c.inside.empty()) return fail("inside_building", "leave " + c.inside + " first");
  if (distance(c.position, loc->door) > content_->sim().entryRadiusMeters)
    return fail("too_far", "you need to be at the entrance of " + loc->name);
  if (Status a = canAccess(actor, *loc); !a) return a;
  c.inside = loc->id;
  c.position = loc->door;
  c.moveTarget.reset();
  emit(presentWith(c), "presence", Json{{"character", actor}, {"status", "entered"}, {"location", loc->id}});
  return okStatus();
}

Result<Json> World::exitBuilding(const CharacterId& actor) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  if (c.inside.empty()) return fail("not_inside", "you are already outside");
  Json out = Json::object();
  if (c.career.shiftStartedAt) {
    auto shift = endShift(actor);
    if (shift) out["shift"] = shift.value();
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
  const bool together = a.inside.empty() ? (t->inside.empty() && distance(a.position, t->position) <= def->rangeMeters)
                                         : a.inside == t->inside;
  if (!together) return fail("too_far", "you need to be with them");

  RelationshipState& forward = relationshipRef(actor, targetId);
  if (forward.lastInteractionAt >= 0 && state_.now - forward.lastInteractionAt < kInteractionCooldown)
    return fail("too_soon", "give it a moment");

  const CharacterDef* actorDefPtr = content_->character(actor);
  const CharacterDef* targetDefPtr = content_->character(targetId);
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
      m.info = "Met " + content_->character(other)->fullName();
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

  for (const auto& [dim, delta] : def->actorToTarget) adjustRelationship(actor, targetId, dim, delta);
  for (const auto& [dim, delta] : def->targetToActor) {
    double d = delta;
    if (d > 0) {
      d *= receptivity;
      if (grudge) d *= 0.5;
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
  if (c.inside.empty()) return fail("not_inside", "you need to be inside a shop");
  const LocationDef* loc = content_->location(c.inside);
  const Offer* offer = nullptr;
  for (const auto& o : loc->offers) {
    if (o.id == offerId) offer = &o;
  }
  if (!offer) return fail("unknown_offer", loc->name + " doesn't sell that");
  if (!isLocationOpen(*loc)) return fail("closed", loc->name + " is closed");
  LedgerAccountId from;
  if (paymentMethod == "card") from = bankAccountOf(actor);
  else if (paymentMethod == "cash") from = cashAccountOf(actor);
  else return fail("invalid_payment", "pay by card or cash");

  auto tx = state_.ledger.transfer(from, loc->revenueAccount, offer->priceCents, "purchase",
                                   offer->label + " at " + loc->name, state_.now);
  if (!tx) return tx.error();
  applyNeeds(c, offer->needEffects);
  applyEmotions(c, offer->emotionEffects);
  return Json{{"tx", tx.value()},
              {"item", offer->label},
              {"price_cents", offer->priceCents},
              {"paid_with", paymentMethod},
              {"balance_cents", state_.ledger.balance(from)}};
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
  c.activityReadyAt[key] = state_.now + act->cooldownMinutes;
  applyNeeds(c, act->needEffects);
  applyEmotions(c, act->emotionEffects);
  Json needs = Json::object();
  for (const auto& [k, v] : act->needEffects) needs[k] = std::round(c.needs[k]);
  return Json{{"activity", act->id}, {"label", act->label}, {"needs", needs}};
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
  const CareerDef* career = content_->career(c.career.careerId);
  if (!career) return fail("no_career", "you don't have a job");
  if (c.career.shiftStartedAt) return fail("already_working", "you are already on shift");
  if (std::find(career->workplaces.begin(), career->workplaces.end(), c.inside) == career->workplaces.end())
    return fail("wrong_place", "go to your workplace first");
  c.career.shiftStartedAt = state_.now;
  c.career.shiftLocation = c.inside;
  c.career.shiftWellbeingSum = 0;
  c.career.shiftSamples = 0;
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

  cs.shiftStartedAt.reset();
  if (static_cast<double>(worked) < career->minPaidMinutes) {
    out["pay_cents"] = 0;
    out["note"] = "Shift too short to be paid.";
    return out;
  }
  const auto pay = static_cast<Cents>(std::llround(paidHours * static_cast<double>(level.hourlyCents)));
  auto tx = state_.ledger.transfer(career->employerAccount, bankAccountOf(actor), pay, "salary",
                                   career->name + " pay: " + level.title, state_.now);
  if (!tx) {
    // The employer could not make payroll. The work still counts toward experience.
    notify(actor, "career", "Payroll failed: your employer could not pay you for this shift.");
    out["pay_cents"] = 0;
    out["note"] = "Employer could not make payroll.";
  } else {
    cs.lifetimeEarningsCents += pay;
    out["pay_cents"] = pay;
    out["tx"] = tx.value();
    notify(actor, "bank", "Paycheck deposited: " + formatMoney(pay) + ".");
  }
  const double shiftScore = cs.shiftSamples > 0 ? cs.shiftWellbeingSum / cs.shiftSamples : averageNeed(*c);
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

Result<Json> World::openPhoneApp(const CharacterId& actor, const std::string& app) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  if (app == "bank") return phoneBank(c);
  if (app == "messages") return phoneMessages(c);
  if (app == "contacts") return phoneContacts(c);
  if (app == "calendar") return phoneCalendar(c);
  if (app == "map") return mapView();
  if (app == "career") return phoneCareer(c);
  if (app == "property") return phoneProperty(c);
  if (app == "notifications") return phoneNotifications(c);
  if (app == "city") return phoneCity();
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

Result<CharacterState*> World::activeCharacter(const CharacterId& id) {
  CharacterState* c = mutableCharacter(id);
  if (!c) return fail("unknown_character", "no such character");
  if (!c->online) return fail("not_in_world", "character is not in the world");
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
  if (loc.hours && !loc.hours->isOpenAt(toDateTime(state_.now).hour)) return "closed";
  return "open";
}

Status World::canAccess(const CharacterId& actor, const LocationDef& loc) const {
  const std::string status = locationStatus(loc);
  if (status == "under_construction") return fail("under_construction", loc.name + " is still being built");
  switch (loc.access) {
    case AccessRule::Public:
      if (status == "closed") return fail("closed", loc.name + " is closed right now");
      return okStatus();
    case AccessRule::Residents:
      for (const auto& [pid, p] : state_.properties) {
        const PropertyDef* def = content_->property(pid);
        if (def && def->location == loc.id && p.tenant == actor) return okStatus();
      }
      return fail("no_access", "you don't live here");
    case AccessRule::Staff: {
      const CharacterState* c = character(actor);
      const CareerDef* career = c ? content_->career(c->career.careerId) : nullptr;
      if (career && std::find(career->workplaces.begin(), career->workplaces.end(), loc.id) != career->workplaces.end())
        return okStatus();
      return fail("no_access", "staff only");
    }
  }
  return fail("no_access", "you can't go in");
}

std::vector<CharacterId> World::presentWith(const CharacterState& c) const {
  constexpr double kOutdoorAwareness = 40;
  std::vector<CharacterId> out;
  for (const auto& [id, o] : state_.characters) {
    if (id == c.id || !o.online) continue;
    const bool together = c.inside.empty() ? (o.inside.empty() && distance(c.position, o.position) <= kOutdoorAwareness)
                                           : o.inside == c.inside;
    if (together) out.push_back(id);
  }
  return out;
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
