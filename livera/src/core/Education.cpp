// School and work: enrolling in a program, study sessions (tuition by the hour, a grade from
// how well you're doing), graduating with a degree, and applying for jobs that need one.
// Programs and degrees are data/education/education.json; careers carry their requirements.
#include <algorithm>
#include <cmath>

#include "core/Clock.h"
#include "core/World.h"

namespace livera {

namespace {
constexpr double kStatMin = 0;
constexpr double kStatMax = 100;
constexpr double kMinStudyMinutes = 30;

double averageNeed(const CharacterState& c) {
  if (c.needs.empty()) return 0;
  double sum = 0;
  for (const auto& [k, v] : c.needs) sum += v;
  return sum / static_cast<double>(c.needs.size());
}
}  // namespace

bool World::hasDegree(const CharacterId& id, const std::string& degree) const {
  const CharacterState* c = character(id);
  if (!c) return false;
  return std::find(c->education.degrees.begin(), c->education.degrees.end(), degree) != c->education.degrees.end();
}

Result<Json> World::enroll(const CharacterId& actor, const std::string& programId) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  EducationState& e = c.education;
  if (programId.empty()) {  // drop out
    if (e.program.empty()) return fail("not_enrolled", "you aren't enrolled in anything");
    if (e.sessionStartedAt) return fail("studying", "finish your study session first");
    const std::string was = e.program;
    e.program.clear();
    e.hours = e.gradeSum = 0;
    e.sessions = 0;
    return Json{{"dropped", was}};
  }
  const ProgramDef* p = content_->program(programId);
  if (!p) return fail("unknown_program", "no such program");
  // Enroll in person: inside a campus, or at its door (the academy is behind a staff-only door).
  bool atCampus = false;
  for (const auto& campus : p->campuses) {
    const LocationDef* loc = content_->location(campus);
    atCampus |= c.inside == campus ||
                (loc && c.inside.empty() && distance(c.position, loc->door) <= content_->sim().entryRadiusMeters);
  }
  if (!atCampus) return fail("wrong_place", "enroll in person at " + content_->location(p->campuses.front())->name);
  if (e.program == programId) return fail("already_enrolled", "you're already enrolled");
  if (!e.program.empty()) return fail("already_enrolled", "drop your current program first");
  if (hasDegree(actor, p->degree)) return fail("already_graduated", "you already have that degree");
  if (!p->requiresDegree.empty() && !hasDegree(actor, p->requiresDegree))
    return fail("missing_degree", "you need a " + content_->degree(p->requiresDegree)->name + " first");
  if (p->requiresCleanRecord && !c.record.empty())
    return fail("criminal_record", p->name + " doesn't accept applicants with a criminal record");
  e.program = programId;
  e.hours = e.gradeSum = 0;
  e.sessions = 0;
  notify(actor, "school", "You're enrolled in " + p->name + ".");
  return Json{{"program", p->name}, {"hours_required", p->hoursRequired}, {"tuition_per_hour_cents", p->tuitionPerHourCents},
              {"min_grade", p->minGrade}};
}

Status World::startStudy(const CharacterId& actor) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  EducationState& e = c.education;
  const ProgramDef* p = content_->program(e.program);
  if (!p) return fail("not_enrolled", "enroll in a program first");
  if (e.sessionStartedAt) return fail("already_studying", "you're already studying");
  if (Status st = freeToAct(c); !st) return st;
  if (c.career.shiftStartedAt) return fail("on_shift", "you're at work");
  const bool onCampus = std::find(p->campuses.begin(), p->campuses.end(), c.inside) != p->campuses.end();
  bool atHomeOnline = false;
  if (!onCampus && p->online && unlocked(actor, "study_online")) {
    const PropertyState* home = homeOf(actor);
    const PropertyDef* def = home ? content_->property(home->id) : nullptr;
    atHomeOnline = def && def->location == c.inside;
  }
  if (!onCampus && !atHomeOnline) {
    std::string where = "go to " + content_->location(p->campuses.front())->name;
    if (p->online) where += ", or study at home on a laptop";
    return fail("wrong_place", where);
  }
  e.sessionStartedAt = state_.now;
  e.sessionPlace = c.inside;
  e.sessionWellbeingSum = 0;
  e.sessionSamples = 0;
  return okStatus();
}

Result<Json> World::endStudy(const CharacterId& actor) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  EducationState& e = c.education;
  if (!e.sessionStartedAt) return fail("not_studying", "you aren't studying");
  const ProgramDef* p = content_->program(e.program);
  const GameMinutes minutes = state_.now - *e.sessionStartedAt;
  e.sessionStartedAt.reset();
  Json out{{"minutes", minutes}};
  if (!p || static_cast<double>(minutes) < kMinStudyMinutes) {
    out["hours_credited"] = 0;
    out["note"] = "Too short to count.";
    return out;
  }
  const double hours = std::min(static_cast<double>(minutes) / 60.0, p->maxSessionHours);
  const double wellbeing = e.sessionSamples > 0 ? e.sessionWellbeingSum / e.sessionSamples : averageNeed(c);
  const double grade = std::round(clampd(wellbeing * (1.0 - performancePenalty(c)), kStatMin, kStatMax));
  const Cents tuition = static_cast<Cents>(std::llround(hours * static_cast<double>(p->tuitionPerHourCents)));
  if (tuition > 0) {
    auto tx = state_.ledger.transfer(bankAccountOf(actor), p->tuitionAccount, tuition, "tuition", p->name + " tuition", state_.now);
    if (!tx) {
      notify(actor, "school", "Your tuition payment didn't go through, so the session didn't count.");
      out["hours_credited"] = 0;
      out["note"] = "Tuition unpaid.";
      return out;
    }
  }
  e.hours += hours;
  e.gradeSum += grade * hours;
  e.sessions += 1;
  const double average = e.gradeSum / e.hours;
  out["hours_credited"] = std::round(hours * 10) / 10;
  out["grade"] = grade;
  out["average_grade"] = std::round(average);
  out["hours"] = std::round(e.hours * 10) / 10;
  out["hours_required"] = p->hoursRequired;
  out["tuition_cents"] = tuition;
  if (e.hours + 1e-9 >= p->hoursRequired) {
    if (average >= p->minGrade) {
      const DegreeDef* d = content_->degree(p->degree);
      e.degrees.push_back(p->degree);
      e.program.clear();
      e.hours = e.gradeSum = 0;
      e.sessions = 0;
      out["graduated"] = d ? d->name : p->degree;
      notify(actor, "school", "You graduated! " + (d ? d->name : p->degree) + ".");
      Memory m;
      m.id = nextId("mem");
      m.owner = actor;
      m.at = state_.now;
      m.participants = {actor};
      m.location = c.inside;
      m.type = "graduation";
      m.importance = 80;
      m.emotionalImpact = 60;
      m.info = "Graduated: " + p->name;
      addMemory(std::move(m));
      applyEmotions(c, {{"happiness", 20}, {"confidence", 15}});
    } else {
      out["note"] = "All the hours are done, but your average is below " + std::to_string(static_cast<int>(p->minGrade)) +
                    ". Keep studying to raise it.";
    }
  }
  return out;
}

Result<Json> World::applyForJob(const CharacterId& actor, const std::string& careerId) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  const CareerDef* career = content_->career(careerId);
  if (!career) return fail("unknown_career", "no such job");
  if (career->workplaces.empty()) return fail("not_hiring", career->name + " has nowhere to work yet");
  if (c.career.careerId == careerId) return fail("already_hired", "you already work in " + career->name);
  if (Status st = freeToAct(c); !st) return st.error();
  if (c.career.shiftStartedAt) return fail("on_shift", "finish your shift first");
  // Apply in person: inside the workplace, or at its door.
  const LocationDef* at = nullptr;
  for (const auto& w : career->workplaces) {
    const LocationDef* loc = content_->location(w);
    if (!loc) continue;
    if (c.inside == w || (c.inside.empty() && distance(c.position, loc->door) <= content_->sim().entryRadiusMeters)) at = loc;
  }
  if (!at) return fail("wrong_place", "apply in person at " + content_->location(career->workplaces.front())->name);
  if (!career->requiresDegree.empty() && !hasDegree(actor, career->requiresDegree))
    return fail("missing_degree", "this job needs a " + content_->degree(career->requiresDegree)->name);
  if (career->requiresCleanRecord && !c.record.empty())
    return fail("criminal_record", career->name + " won't hire someone with a criminal record");
  c.career.careerId = careerId;
  c.career.level = 0;
  c.career.hoursAtLevel = 0;
  c.career.performance = 60;
  const std::string& title = career->levels.front().title;
  notify(actor, "career", "You're hired: " + title + " at " + at->name + ".");
  Memory m;
  m.id = nextId("mem");
  m.owner = actor;
  m.at = state_.now;
  m.participants = {actor};
  m.location = at->id;
  m.type = "new_job";
  m.importance = 60;
  m.emotionalImpact = 40;
  m.info = "Hired as " + title;
  addMemory(std::move(m));
  return Json{{"career", career->name}, {"title", title}, {"hourly_cents", career->levels.front().hourlyCents},
              {"workplace", at->name}};
}

void World::payCliniciansOnDuty(const CharacterId& patient, const LocationDef& where, Cents price, Json& out) {
  Json seen = Json::array();
  CharacterState* p = mutableCharacter(patient);
  for (auto& [id, c] : state_.characters) {
    if (id == patient || !c.online || !c.career.shiftStartedAt || c.career.shiftLocation != where.id) continue;
    const CareerDef* career = content_->career(c.career.careerId);
    if (!career || career->careFeeShare <= 0) continue;
    const Cents fee = static_cast<Cents>(std::llround(static_cast<double>(price) * career->careFeeShare));
    if (fee > 0 && state_.ledger.transfer(career->employerAccount, bankAccountOf(id), fee, "care_fee",
                                          "Patient care at " + where.name, state_.now)) {
      const CharacterDef* pd = definition(patient);
      notify(id, "career", "You saw " + (pd ? pd->fullName() : patient) + ": +" + formatMoney(fee) + ".");
    }
    // Being seen by a person, not just the front desk, helps.
    if (p) applyNeeds(*p, {{"health", 5}});
    adjustRelationship(patient, id, "respect", 2);
    const CharacterDef* cd = definition(id);
    seen.push_back(cd ? cd->fullName() : id);
  }
  if (!seen.empty()) out["seen_by"] = seen;
}

Json World::phoneSchool(const CharacterState& c) const {
  const EducationConfig& ed = content_->education();
  Json degrees = Json::array();
  for (const auto& d : c.education.degrees) {
    const DegreeDef* def = content_->degree(d);
    degrees.push_back(def ? def->name : d);
  }
  Json out{{"degrees", degrees}};
  if (const ProgramDef* p = content_->program(c.education.program)) {
    out["enrolled"] = Json{{"program", p->name},
                           {"hours", std::round(c.education.hours * 10) / 10},
                           {"hours_required", p->hoursRequired},
                           {"average_grade", c.education.hours > 0 ? std::round(c.education.gradeSum / c.education.hours) : 0},
                           {"min_grade", p->minGrade},
                           {"studying", c.education.sessionStartedAt.has_value()}};
  }
  Json programs = Json::array();
  for (const auto& [id, p] : ed.programs) {
    Json campuses = Json::array();
    for (const auto& l : p.campuses) campuses.push_back(content_->location(l)->name);
    const bool eligible = !hasDegree(c.id, p.degree) && (p.requiresDegree.empty() || hasDegree(c.id, p.requiresDegree)) &&
                          (!p.requiresCleanRecord || c.record.empty());
    programs.push_back(Json{{"id", id}, {"name", p.name}, {"hours_required", p.hoursRequired},
                            {"tuition_per_hour_cents", p.tuitionPerHourCents}, {"campuses", campuses}, {"online", p.online},
                            {"requires", p.requiresDegree}, {"eligible", eligible}});
  }
  out["programs"] = programs;
  return out;
}

Json World::phoneJobs(const CharacterState& c) const {
  Json jobs = Json::array();
  for (const auto& [id, career] : content_->careers()) {
    if (career.workplaces.empty() || career.levels.empty()) continue;
    Json places = Json::array();
    for (const auto& w : career.workplaces) places.push_back(content_->location(w)->name);
    const bool eligible = id != c.career.careerId && (career.requiresDegree.empty() || hasDegree(c.id, career.requiresDegree)) &&
                          (!career.requiresCleanRecord || c.record.empty());
    Json j{{"id", id}, {"career", career.name}, {"starting_title", career.levels.front().title},
           {"starting_hourly_cents", career.levels.front().hourlyCents}, {"workplaces", places}, {"eligible", eligible}};
    if (!career.requiresDegree.empty()) j["requires_degree"] = content_->degree(career.requiresDegree)->name;
    if (career.requiresCleanRecord) j["requires_clean_record"] = true;
    jobs.push_back(j);
  }
  return Json{{"current", c.career.careerId}, {"jobs", jobs}};
}

}  // namespace livera
