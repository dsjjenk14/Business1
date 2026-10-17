// Children. A child born in Livéra lives at home, grows up on the calendar, goes to daycare
// or school, and needs an adult around until they're old enough: a parent, the family's
// nanny on shift, or the staff where they're enrolled. Nobody plays a child until they are
// an adult (checkBirthday in Life.cpp), so their day is a routine stepped once an hour.
// Tuning is data/society/family.json.
#include <algorithm>
#include <cmath>

#include "core/Clock.h"
#include "core/World.h"

namespace livera {

namespace {

constexpr double kStatMin = 0;
constexpr double kStatMax = 100;
constexpr double kCaredForTarget = 70;    // a looked-after child's needs settle here
constexpr double kNeglectedTarget = 20;   // and an unattended child's fall toward this
constexpr double kRoutineRatePerHour = 1.0 - 0.8824969;  // 1 - e^(-1/8): the same pace as an adult's routine
constexpr double kAdultHeightCm = 172;
constexpr double kNewbornHeightCm = 50;

bool has(const std::vector<CharacterId>& v, const CharacterId& id) { return std::find(v.begin(), v.end(), id) != v.end(); }

}  // namespace

bool World::isParentOf(const CharacterId& parent, const CharacterId& child) const {
  const CharacterState* c = character(child);
  return c && has(c->parents, parent);
}

std::vector<CharacterId> World::childrenOf(const CharacterId& parent) const {
  std::vector<CharacterId> out;
  for (const auto& [id, c] : state_.characters) {
    if (has(c.parents, parent)) out.push_back(id);
  }
  return out;
}

bool World::atSchoolNow(const CharacterState& c) const {
  const FamilyConfig& F = content_->family();
  if (c.childcare != "school") return false;
  const int age = ageOf(c.id);
  if (age < F.schoolMinAge || age > F.schoolMaxAge) return false;
  const DateTime d = toDateTime(state_.now);
  if (!F.schoolDays.empty() && std::find(F.schoolDays.begin(), F.schoolDays.end(), d.weekday) == F.schoolDays.end()) return false;
  return d.hour >= F.schoolStartHour && d.hour < F.schoolEndHour;
}

bool World::atDaycareNow(const CharacterState& c) const {
  const FamilyConfig& F = content_->family();
  if (c.childcare != "daycare" || ageOf(c.id) > F.daycareMaxAge) return false;
  const DateTime d = toDateTime(state_.now);
  if (!F.daycareDays.empty() && std::find(F.daycareDays.begin(), F.daycareDays.end(), d.weekday) == F.daycareDays.end()) return false;
  if (d.hour < F.daycareStartHour || d.hour >= F.daycareEndHour) return false;
  return c.childcarePaidDay == d.dayIndex;  // today's fee went through
}

// Someone responsible is with the child: a parent at home (an offline parent's routine
// includes their children, unless they've stopped coping), the family's nanny on shift
// there, or the staff at school or daycare.
bool World::supervised(const CharacterState& child) const {
  const FamilyConfig& F = content_->family();
  if (ageOf(child.id) >= F.superviseUnder) return true;
  if (atSchoolNow(child) || atDaycareNow(child)) return true;
  const PropertyDef* home = familyHomeOf(child);  // follows the family when they move (Homes.cpp)
  const LocationId homeLoc = home ? home->location : "";
  for (const auto& p : child.parents) {
    const CharacterState* parent = character(p);
    if (!parent) continue;
    if (parent->online) {
      if (parent->inside == homeLoc) return true;
    } else if (!inJail(p) && !hasCondition(p, content_->life().depressionCondition)) {
      return true;
    }
  }
  for (const auto& [id, c] : state_.characters) {
    if (c.nannyFor.empty() || !has(child.parents, c.nannyFor) || !c.career.shiftStartedAt) continue;
    if (c.inside == homeLoc) return true;
  }
  return false;
}

// Once a game hour, for everyone under the adult age.
void World::stepChildHourly(CharacterState& c) {
  const FamilyConfig& F = content_->family();
  const SimulationConfig& sim = content_->sim();
  const DateTime d = toDateTime(state_.now);
  const CharacterDef* def = definition(c.id);
  const PropertyDef* home = familyHomeOf(c);  // follows the family when they move (Homes.cpp)
  const LocationDef* homeLoc = home ? content_->location(home->location) : nullptr;

  // Daycare charges by the day, when the doors open. No payment, no place that day.
  if (c.childcare == "daycare" && d.hour == F.daycareStartHour && c.childcarePaidDay != d.dayIndex && ageOf(c.id) <= F.daycareMaxAge &&
      (F.daycareDays.empty() || std::find(F.daycareDays.begin(), F.daycareDays.end(), d.weekday) != F.daycareDays.end())) {
    const CharacterId payer = c.childcarePayer.empty() ? (c.parents.empty() ? "" : c.parents.front()) : c.childcarePayer;
    auto tx = state_.ledger.transfer(bankAccountOf(payer), F.daycareAccount, F.daycareFeeCents, "childcare",
                                     "Daycare: " + (def ? def->firstName : c.id), state_.now);
    if (tx) {
      c.childcarePaidDay = d.dayIndex;
    } else if (character(payer)) {
      notify(payer, "family", "The daycare fee of " + formatMoney(F.daycareFeeCents) + " for " + (def ? def->firstName : c.id) +
                                  " didn't go through, so there's no place for them today.");
    }
  }
  // Where they are.
  const LocationDef* where = atSchoolNow(c) ? content_->location(F.school) : atDaycareNow(c) ? content_->location(F.daycare) : homeLoc;
  if (where) {
    c.inside = where->id;
    c.position = where->door;
  }
  // Needs follow the care they get.
  const bool cared = supervised(c);
  for (const auto& n : F.childNeeds) {
    double& v = c.needs[n];
    v = clampd(v + ((cared ? kCaredForTarget : kNeglectedTarget) - v) * kRoutineRatePerHour, kStatMin, kStatMax);
  }
  for (const auto& n : sim.needs) {
    if (std::find(F.childNeeds.begin(), F.childNeeds.end(), n.id) != F.childNeeds.end()) continue;
    double& v = c.needs[n.id];
    v = clampd(v + (sim.offlineNeedTarget - v) * kRoutineRatePerHour, kStatMin, kStatMax);
  }
  for (auto& [e, v] : c.emotions) {
    const auto it = sim.emotionBaselines.find(e);
    const double base = it == sim.emotionBaselines.end() ? 0 : it->second;
    v = clampd(v + (base - v) * kRoutineRatePerHour, kStatMin, kStatMax);
  }
  c.caloriesIn = c.caloriesOut = 0;

  // Left alone too long in a day, and child services hear about it.
  if (d.hour == 0) c.unsupervisedHoursToday = 0;
  if (!cared) {
    c.unsupervisedHoursToday += 1;
    if (c.unsupervisedHoursToday >= F.neglectReportHours && !F.neglectCrime.empty()) {
      c.unsupervisedHoursToday = 0;
      const CrimeDef* crime = content_->crimeDef(F.neglectCrime);
      for (const auto& p : c.parents) {
        CharacterState* parent = mutableCharacter(p);
        if (!parent) continue;
        recordCrime(*parent, F.neglectCrime, crime ? crime->fineCents : 0, 0);
        notify(p, "family", (def ? def->firstName : c.id) + " was left alone for hours. Child services have opened a file on you" +
                                (crime && crime->fineCents > 0 ? " and fined you " + formatMoney(crime->fineCents) + "." : "."));
      }
      applyEmotions(c, {{"sadness", 20}, {"loneliness", 20}});
    }
  }
  // A school day ends: today's grade is how they're doing, plus the help they got at home.
  if (c.childcare == "school" && d.hour == F.schoolEndHour && ageOf(c.id) >= F.schoolMinAge && ageOf(c.id) <= F.schoolMaxAge &&
      (F.schoolDays.empty() || std::find(F.schoolDays.begin(), F.schoolDays.end(), d.weekday) != F.schoolDays.end())) {
    double sum = 0;
    for (const auto& [n, v] : c.needs) sum += v;
    const double grade = clampd(sum / static_cast<double>(std::max<std::size_t>(1, c.needs.size())) + c.schoolBonusToday, kStatMin, kStatMax);
    c.schoolGradeSum += grade;
    c.schoolDays += 1;
    c.schoolBonusToday = 0;
  }
}

// At the adult birthday: a diploma if the years of school added up.
void World::graduateSchool(CharacterState& c) {
  const FamilyConfig& F = content_->family();
  if (F.diplomaDegree.empty() || c.schoolDays <= 0) return;
  const double average = c.schoolGradeSum / c.schoolDays;
  const CharacterDef* def = definition(c.id);
  const std::string name = def ? def->firstName : c.id;
  if (average >= F.diplomaGrade && !hasDegree(c.id, F.diplomaDegree)) {
    c.education.degrees.push_back(F.diplomaDegree);
    notify(c.id, "school", "You graduated from school with an average of " + std::to_string(static_cast<int>(average)) + ".");
    for (const auto& p : c.parents) {
      if (character(p)) notify(p, "family", name + " graduated from school.");
    }
  } else {
    for (const auto& p : c.parents) {
      if (character(p)) notify(p, "family", name + " finished school without a diploma (average " + std::to_string(static_cast<int>(average)) + ").");
    }
  }
  c.childcare.clear();
}

Result<Json> World::careFor(const CharacterId& actor, const CharacterId& childId, const std::string& action) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& me = *r.value();
  if (Status st = freeToAct(me); !st) return st.error();
  CharacterState* child = mutableCharacter(childId);
  if (!child) return fail("unknown_character", "no such child");
  if (ageOf(childId) >= content_->life().adultAge) return fail("not_a_child", "they're grown up");
  const CareerDef* career = content_->career(me.career.careerId);
  const bool asNanny = career && career->atEmployersHome && me.career.shiftStartedAt && has(child->parents, me.nannyFor);
  if (!isParentOf(actor, childId) && !asNanny) return fail("not_parent", "that's not your child, and you're not their nanny on shift");
  const CareActionDef* act = content_->careAction(action);
  if (!act) return fail("unknown_action", "no such care routine");
  const PropertyDef* home = familyHomeOf(*child);  // follows the family when they move (Homes.cpp)
  if (!home || me.inside != home->location) return fail("wrong_place", "you need to be home with them");
  if (atSchoolNow(*child) || atDaycareNow(*child))
    return fail("not_home", std::string("they're at ") + (atSchoolNow(*child) ? "school" : "daycare") + " right now");
  const std::string stage = lifeStageOf(childId);
  if (!act->stages.empty() && std::find(act->stages.begin(), act->stages.end(), stage) == act->stages.end())
    return fail("not_for_this_age", act->label + " isn't for a " + stage);
  const std::string key = "care/" + childId + "/" + action;
  auto ready = child->activityReadyAt.find(key);
  if (ready != child->activityReadyAt.end() && state_.now < ready->second) return fail("too_soon", "not again so soon");
  child->activityReadyAt[key] = state_.now + act->cooldownMinutes;
  applyNeeds(*child, act->childNeeds);
  applyEmotions(*child, act->childEmotions);
  applyNeeds(me, act->carerNeeds);
  for (const auto& dim : {"friendship", "familiarity"}) {
    adjustRelationship(actor, childId, dim, act->bond);
    adjustRelationship(childId, actor, dim, act->bond);
  }
  child->schoolBonusToday += act->grade;
  Json needs = Json::object();
  for (const auto& [k, v] : act->childNeeds) needs[k] = std::round(child->needs[k]);
  return Json{{"child", childId}, {"action", act->label}, {"child_needs", needs}, {"bond", relationshipValue(childId, actor, "friendship")}};
}

Result<Json> World::enrollChild(const CharacterId& parent, const CharacterId& childId, const std::string& where) {
  auto r = activeCharacter(parent);
  if (!r) return r.error();
  CharacterState& me = *r.value();
  if (Status st = freeToAct(me); !st) return st.error();
  CharacterState* child = mutableCharacter(childId);
  if (!child) return fail("unknown_character", "no such child");
  if (!isParentOf(parent, childId)) return fail("not_parent", "that's not your child");
  const FamilyConfig& F = content_->family();
  const CharacterDef* def = definition(childId);
  const std::string name = def ? def->firstName : childId;
  if (where.empty()) {
    if (child->childcare.empty()) return fail("not_enrolled", name + " isn't enrolled anywhere");
    const std::string was = child->childcare;
    child->childcare.clear();
    return Json{{"child", childId}, {"withdrawn_from", was}};
  }
  if (where != "school" && where != "daycare") return fail("bad_request", "where must be school or daycare");
  const LocationDef* place = content_->location(where == "school" ? F.school : F.daycare);
  if (!place) return fail("unavailable", "there is no " + where + " in town yet");
  const int age = ageOf(childId);
  if (where == "school" && (age < F.schoolMinAge || age > F.schoolMaxAge))
    return fail("wrong_age", "school takes children aged " + std::to_string(F.schoolMinAge) + " to " + std::to_string(F.schoolMaxAge));
  if (where == "daycare" && age > F.daycareMaxAge) return fail("wrong_age", "daycare takes children up to " + std::to_string(F.daycareMaxAge));
  if (me.inside != place->id && !(me.inside.empty() && distance(me.position, place->door) <= content_->sim().entryRadiusMeters))
    return fail("wrong_place", "enrol in person at " + place->name);
  if (!isLocationOpen(*place)) return fail("closed", place->name + " is closed");
  if (child->childcare == where) return fail("already_enrolled", name + " is already enrolled there");
  child->childcare = where;
  child->childcarePayer = parent;
  Json out{{"child", childId}, {"enrolled", where}, {"place", place->name}};
  if (where == "daycare") out["fee_per_day_cents"] = F.daycareFeeCents;
  for (const auto& other : child->parents) {
    if (other != parent && character(other)) notify(other, "family", name + " is enrolled at " + place->name + ".");
  }
  return out;
}

Result<Json> World::hireNanny(const CharacterId& parent, const CharacterId& nannyId) {
  auto r = activeCharacter(parent);
  if (!r) return r.error();
  CharacterState& me = *r.value();
  if (Status st = freeToAct(me); !st) return st.error();
  if (childrenOf(parent).empty()) return fail("no_children", "you have no children to look after");
  CharacterState* n = mutableCharacter(nannyId);
  if (!n || !n->online) return fail("target_unavailable", "they are not here");
  if (nannyId == parent) return fail("invalid_target", "not yourself");
  const CareerDef* career = content_->career(n->career.careerId);
  if (!career || !career->atEmployersHome) return fail("not_a_nanny", "they don't work as a nanny");
  if (!n->nannyFor.empty()) return fail("already_employed", "they already work for a family");
  if (!together(me, *n, 3)) return fail("too_far", "you need to be with them");
  for (const auto& c : state_.characters) {
    if (c.second.nannyFor == parent) return fail("already_have_nanny", "you already employ a nanny");
  }
  const CharacterDef* myDef = definition(parent);
  const std::string ask = (myDef ? myDef->firstName : parent) + " wants to hire you as their family's nanny, " +
                          formatMoney(career->levels.at(static_cast<std::size_t>(n->career.level)).hourlyCents) + " an hour.";
  state_.requests.erase(std::remove_if(state_.requests.begin(), state_.requests.end(),
                                       [&](const PendingRequest& q) { return q.expires <= state_.now; }),
                        state_.requests.end());
  for (const auto& q : state_.requests) {
    if (q.from == parent && q.to == nannyId && q.kind == "nanny") return fail("already_asked", "you already asked");
  }
  PendingRequest q{nextId("ask"), "nanny", parent, nannyId, state_.now + content_->romance().requestMinutes, false};
  state_.requests.push_back(q);
  notify(nannyId, "career", ask + " (answer with request id " + q.id + ")");
  emit({nannyId}, "request", Json{{"id", q.id}, {"kind", "nanny"}, {"from", parent}, {"text", ask}});
  return Json{{"request", q.id}, {"kind", "nanny"}, {"waiting_for", nannyId}};
}

Result<Json> World::dismissNanny(const CharacterId& parent) {
  auto r = activeCharacter(parent);
  if (!r) return r.error();
  for (auto& [id, c] : state_.characters) {
    if (c.nannyFor != parent) continue;
    if (c.career.shiftStartedAt) (void)endShift(id);
    c.nannyFor.clear();
    const CharacterDef* myDef = definition(parent);
    notify(id, "career", (myDef ? myDef->firstName : parent) + " no longer needs a nanny.");
    return Json{{"dismissed", id}};
  }
  return fail("no_nanny", "you don't employ a nanny");
}

Json World::phoneFamily(const CharacterState& c) const {
  const FamilyConfig& F = content_->family();
  Json children = Json::array();
  for (const auto& id : childrenOf(c.id)) {
    const CharacterState* k = character(id);
    const CharacterDef* d = definition(id);
    if (!k || !d) continue;
    const LocationDef* where = content_->location(k->inside);
    Json needs = Json::object();
    for (const auto& [n, v] : k->needs) needs[n] = std::round(v);
    children.push_back(Json{{"id", id},
                            {"name", d->fullName()},
                            {"age", ageOf(id)},
                            {"stage", lifeStageOf(id)},
                            {"where", where ? where->name : "home"},
                            {"enrolled", k->childcare},
                            {"supervised", supervised(*k)},
                            {"school_days", k->schoolDays},
                            {"school_average", k->schoolDays > 0 ? std::round(k->schoolGradeSum / k->schoolDays) : 0.0},
                            {"needs", needs},
                            {"bond", std::round(relationshipValue(id, c.id, "friendship"))}});
  }
  Json nanny;
  for (const auto& [id, n] : state_.characters) {
    if (n.nannyFor != c.id) continue;
    const CharacterDef* d = definition(id);
    nanny = Json{{"id", id}, {"name", d ? d->fullName() : id}, {"on_shift", n.career.shiftStartedAt.has_value()}};
  }
  Json parents = Json::array();
  for (const auto& p : c.parents) {
    const CharacterDef* d = definition(p);
    parents.push_back(Json{{"id", p}, {"name", d ? d->fullName() : p}});
  }
  Json routines = Json::array();
  for (const auto& a : F.careActions) routines.push_back(Json{{"id", a.id}, {"label", a.label}, {"for", a.stages}});
  const LocationDef* school = content_->location(F.school);
  const LocationDef* daycare = content_->location(F.daycare);
  return Json{{"children", children},
              {"nanny", nanny},
              {"parents", parents},
              {"employer", c.nannyFor},
              {"care_routines", routines},
              {"school", Json{{"name", school ? school->name : ""}, {"ages", {F.schoolMinAge, F.schoolMaxAge}}, {"hours", {F.schoolStartHour, F.schoolEndHour}}}},
              {"daycare", Json{{"name", daycare ? daycare->name : ""}, {"max_age", F.daycareMaxAge}, {"hours", {F.daycareStartHour, F.daycareEndHour}},
                               {"fee_per_day_cents", F.daycareFeeCents}}}};
}

}  // namespace livera
