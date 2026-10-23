// The court (D-083, data/society/court.json). A crime the court tries isn't punished on the spot any more: an arrest
// books you (held a short while at the jail) and a report summons you, and either way you're charged and given a
// court date, a slot of the court's sittings. Be in the courthouse then. The hearing opens, everyone in the courtroom
// sees it, and you plead: guilty (convicted, a lighter sentence) or not guilty (the World rolls the chance it showed
// you, from the evidence: how it came to court, who saw it, the victim, who came to the hearing, and your lawyer).
// The verdict is dismissed or convicted; a conviction is a fine to the town, community service, probation or time in
// a cell, by the crime and the convictions already on your record, and it goes on the record. Miss the hearing while
// you're playing and there's a warrant (Wanted): a patrol or an officer picks you up and you're held until a new
// hearing, brought to court from the cell. Nobody is tried without a person to answer: a hearing nobody is playing the
// accused for is put off until someone is (only so many times).
//
// The judge is a townsperson (data/characters) who sits at the courthouse on shift; the ruling is the World's, so a
// person playing the judge can't change it, and a hearing goes ahead when no judge is on the bench.
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <set>

#include "core/Clock.h"
#include "core/Content.h"
#include "core/ContentParse.h"
#include "core/Parts.h"
#include "core/World.h"

namespace livera {

using namespace content_parse;

namespace {

constexpr std::size_t kDecidedKept = 120;  // decided cases kept for the Court app once nothing is left to serve

bool has(const std::vector<std::string>& v, const std::string& x) { return std::find(v.begin(), v.end(), x) != v.end(); }

std::string hhmm(GameMinutes t) {
  const DateTime d = toDateTime(t);
  char buf[8];
  std::snprintf(buf, sizeof buf, "%02d:%02d", d.hour, d.minute);
  return buf;
}

// "Tuesday 10:30": a court date, said the way the summons says it.
std::string whenText(GameMinutes t) { return std::string(weekdayName(toDateTime(t).weekday)) + " " + hhmm(t); }

std::string joinAnd(const std::vector<std::string>& items) {
  std::string out;
  for (std::size_t i = 0; i < items.size(); ++i) {
    if (i > 0) out += i + 1 == items.size() ? " and " : ", ";
    out += items[i];
  }
  return out;
}

double round2(double v) { return std::round(v * 100) / 100; }

CourtSentenceDef discounted(CourtSentenceDef s, double discount) {
  const double keep = 1 - discount;
  if (s.fineCents > 0) s.fineCents = std::max<Cents>(100, std::llround(static_cast<double>(s.fineCents) * keep / 100.0) * 100);
  if (s.serviceHours > 0) s.serviceHours = std::max(1.0, std::round(s.serviceHours * keep));
  if (s.probationDays > 0) s.probationDays = std::max(1, static_cast<int>(std::lround(s.probationDays * keep)));
  if (s.jailMinutes > 0) s.jailMinutes = std::max<GameMinutes>(10, std::llround(static_cast<double>(s.jailMinutes) * keep / 10.0) * 10);
  return s;
}

std::string hoursText(double h) {
  char buf[32];
  if (std::abs(h - std::round(h)) < 1e-9) std::snprintf(buf, sizeof buf, "%d", static_cast<int>(std::lround(h)));
  else std::snprintf(buf, sizeof buf, "%.1f", h);
  return buf;
}

std::string spanText(GameMinutes m) {
  const GameMinutes h = m / 60, rest = m % 60;
  if (h && rest) return std::to_string(h) + " h " + std::to_string(rest) + " min";
  if (h) return std::to_string(h) + " h";
  return std::to_string(rest) + " min";
}

}  // namespace

// ---- Content -------------------------------------------------------------------------------
Status ContentDatabase::ingestCourt(const std::string& source, const std::string& section, const Json& body,
                                    bool& handled) {
  handled = section == "court";
  if (!handled) return okStatus();
  if (court_.enabled) return fail("content_duplicate", source + ": 'court' defined twice");
  try {
    CourtConfig& C = court_;
    C.enabled = true;
    C.courthouse = body.at("courthouse").get<std::string>();
    C.finesAccount = body.at("fines_account").get<std::string>();
    C.bookingMinutes = body.value("booking_minutes", C.bookingMinutes);
    const Json s = body.value("sitting", Json::object());
    if (s.contains("hours")) {
      C.sitFrom = s.at("hours").at(0).get<int>();
      C.sitTo = s.at("hours").at(1).get<int>();
    }
    C.slotMinutes = s.value("slot_minutes", C.slotMinutes);
    C.noticeMinutes = s.value("notice_minutes", C.noticeMinutes);
    C.graceMinutes = s.value("grace_minutes", C.graceMinutes);
    C.pleaMinutes = s.value("plea_minutes", C.pleaMinutes);
    C.maxAdjournments = s.value("max_adjournments", C.maxAdjournments);
    const Json e = body.value("evidence", Json::object());
    C.caught = e.value("caught", C.caught);
    C.reported = e.value("reported", C.reported);
    C.perWitness = e.value("per_witness", C.perWitness);
    C.perStaff = e.value("per_staff", C.perStaff);
    C.perOfficer = e.value("per_officer", C.perOfficer);
    C.victim = e.value("victim", C.victim);
    C.inCourt = e.value("in_court", C.inCourt);
    C.victimInCourt = e.value("victim_in_court", C.victimInCourt);
    C.minChance = e.value("min", C.minChance);
    C.maxChance = e.value("max", C.maxChance);
    const Json l = body.value("lawyers", Json::object());
    C.lawyerCareers = readStrings(l, "lawyer_careers");
    const Json firm = l.value("firm", Json::object());
    C.firmName = firm.value("name", "");
    C.firmPlace = firm.value("place", "");
    C.firmAccount = firm.value("account", "");
    C.firmFeeCents = firm.value("fee_cents", Cents{0});
    C.firmEdge = firm.value("edge", 0.0);
    C.lawyerFeeCents = l.value("fee_cents", Cents{0});
    C.lawyerEdgeBase = l.value("edge_base", 0.0);
    C.lawyerEdgePerLevel = l.value("edge_per_level", 0.0);
    C.guiltyPleaDiscount = body.value("guilty_plea_discount", 0.0);
    C.unpaidFineJailMinutes = body.value("unpaid_fine_jail_minutes", C.unpaidFineJailMinutes);
    const Json cs = body.value("community_service", Json::object());
    C.servicePlace = cs.value("place", "");
    C.serviceDueDays = cs.value("due_days", C.serviceDueDays);
    C.serviceNeedsPerHour = readStats(cs, "needs_per_hour");
    C.breachJailMinutesPerHour = cs.value("breach_jail_minutes_per_hour", C.breachJailMinutesPerHour);
    C.probationBreachJailMinutes = body.value("probation", Json::object()).value("breach_jail_minutes", C.probationBreachJailMinutes);
    const Json r = body.value("record", Json::object());
    C.penaltyDays = r.value("penalty_days", C.penaltyDays);
    C.convictionDays = r.value("conviction_days", C.convictionDays);
    C.jailDays = r.value("jail_days", C.jailDays);
    for (const auto& [crime, ladder] : body.at("sentences").items()) {
      std::vector<CourtSentenceDef>& out = C.sentences[crime];
      for (const auto& j : ladder) {
        CourtSentenceDef d;
        d.fineCents = j.value("fine_cents", Cents{0});
        d.serviceHours = j.value("service_hours", 0.0);
        d.probationDays = j.value("probation_days", 0);
        d.jailMinutes = j.value("jail_minutes", GameMinutes{0});
        out.push_back(d);
      }
    }
  } catch (const std::exception& e) {
    return fail("content_invalid", source + ": " + e.what());
  }
  return okStatus();
}

Status ContentDatabase::validateCourt() const {
  const CourtConfig& C = court_;
  if (!C.enabled) return okStatus();
  auto bad = [](const std::string& m) { return fail("content_invalid", "court: " + m); };
  std::set<std::string> orgs, needs;
  for (const auto& o : orgAccounts_) orgs.insert(o.id);
  for (const auto& n : sim_.needs) needs.insert(n.id);
  const LocationDef* house = location(C.courthouse);
  if (!house || !house->enterable || house->access != AccessRule::Public || !house->hours)
    return bad("the courthouse must be an enterable public place with opening hours: " + C.courthouse);
  if (C.sitFrom < 0 || C.sitTo > 24 || C.sitFrom >= C.sitTo) return bad("sitting.hours must be [from, to) within a day");
  for (int h = C.sitFrom; h < C.sitTo; ++h) {
    if (!house->hours->isOpenAt(h)) return bad("the court sits only while the courthouse is open");
  }
  if (C.slotMinutes < 5 || C.noticeMinutes < 0 || C.graceMinutes < 0 || C.pleaMinutes < 1 || C.maxAdjournments < 0 ||
      C.bookingMinutes < 0 || C.graceMinutes >= C.slotMinutes * 4)
    return bad("slot, notice, grace, plea, booking and adjournments must make sense");
  if (!orgs.count(C.finesAccount)) return bad("fines_account must be an org account");
  for (double p : {C.caught, C.reported, C.perWitness, C.perStaff, C.perOfficer, C.victim, C.inCourt, C.victimInCourt,
                   C.minChance, C.maxChance, C.firmEdge, C.lawyerEdgeBase, C.lawyerEdgePerLevel}) {
    if (p < 0 || p > 1) return bad("evidence and lawyers' edges are chances from 0 to 1");
  }
  if (C.minChance > C.maxChance) return bad("evidence.min must be at most evidence.max");
  if (C.guiltyPleaDiscount < 0 || C.guiltyPleaDiscount >= 1) return bad("guilty_plea_discount is from 0 to under 1");
  if (C.lawyerCareers.empty()) return bad("lawyers.lawyer_careers names the careers that can defend someone");
  for (const auto& id : C.lawyerCareers) {
    if (!career(id)) return bad("unknown lawyer career '" + id + "'");
  }
  if (C.firmName.empty() || !orgs.count(C.firmAccount) || (!C.firmPlace.empty() && !location(C.firmPlace)))
    return bad("lawyers.firm needs a name, an org account and (if given) a real place");
  if (C.firmFeeCents < 0 || C.lawyerFeeCents < 0) return bad("lawyers' fees can't be negative");
  const LocationDef* service = location(C.servicePlace);
  if (!service || !service->enterable) return bad("community_service.place must be a place you can go into");
  if (C.serviceDueDays < 1 || C.breachJailMinutesPerHour < 0 || C.probationBreachJailMinutes < 0 || C.unpaidFineJailMinutes < 0)
    return bad("community service, probation and unpaid fines must make sense");
  if (auto s = checkKeys(C.serviceNeedsPerHour, needs, "court.community_service.needs_per_hour"); !s) return s;
  if (C.penaltyDays < 0 || C.convictionDays < 0 || C.jailDays < 0) return bad("record days can't be negative");
  if (C.sentences.empty()) return bad("sentences: the court needs crimes to try");
  if (!location(crime_.jail)) return bad("the court needs the jail (crime.jail) to hold people");
  for (const auto& [crime, ladder] : C.sentences) {
    if (!crimeDef(crime)) return bad("sentences: unknown crime '" + crime + "'");
    if (ladder.empty()) return bad("sentences." + crime + " needs at least one sentence");
    for (const auto& s : ladder) {
      if (s.fineCents < 0 || s.serviceHours < 0 || s.probationDays < 0 || s.jailMinutes < 0)
        return bad("sentences." + crime + ": nothing can be negative");
      if (s.fineCents == 0 && s.serviceHours == 0 && s.probationDays == 0 && s.jailMinutes == 0)
        return bad("sentences." + crime + ": a sentence must be something");
    }
  }
  return okStatus();
}

// ---- Save ------------------------------------------------------------------------------------
Json courtPartToJson(const WorldState& s) {
  Json cases = Json::array();
  for (const auto& k : s.court.cases) {
    cases.push_back(Json{{"id", k.id},
                         {"accused", k.accused},
                         {"victim", k.victim},
                         {"charges", k.charges},
                         {"how", k.how},
                         {"place", k.place},
                         {"at", k.at},
                         {"witnesses", k.witnesses},
                         {"staff", k.staff},
                         {"police", k.police},
                         {"status", k.status},
                         {"hearing_at", k.hearingAt},
                         {"adjournments", k.adjournments},
                         {"lawyer", k.lawyer},
                         {"lawyer_agreed", k.lawyerAgreed},
                         {"opened_at", k.openedAt},
                         {"plea_by", k.pleaBy},
                         {"lawyer_present", k.lawyerPresent},
                         {"witnesses_in_court", k.witnessesInCourt},
                         {"victim_in_court", k.victimInCourt},
                         {"judge", k.judge},
                         {"plea", k.plea},
                         {"verdict", k.verdict},
                         {"chance", k.chance},
                         {"decided_at", k.decidedAt},
                         {"fine_cents", k.fineCents},
                         {"fine_unpaid", k.fineUnpaid},
                         {"service_hours", k.serviceHours},
                         {"service_done", k.serviceDone},
                         {"service_due", k.serviceDue},
                         {"probation_until", k.probationUntil},
                         {"jail_minutes", k.jailMinutes},
                         {"breached", k.breached}});
  }
  return Json{{"cases", cases}};
}

void courtPartFromJson(WorldState& s, const Json& j) {
  s.court = CourtWorldState{};
  for (const auto& c : j.value("cases", Json::array())) {
    CourtCase k;
    k.id = c.at("id").get<std::string>();
    k.accused = c.at("accused").get<std::string>();
    k.victim = c.value("victim", "");
    k.charges = c.value("charges", std::vector<std::string>{});
    k.how = c.value("how", "caught");
    k.place = c.value("place", "");
    k.at = c.value("at", GameMinutes{0});
    k.witnesses = c.value("witnesses", std::vector<std::string>{});
    k.staff = c.value("staff", std::vector<std::string>{});
    k.police = c.value("police", std::vector<std::string>{});
    k.status = c.value("status", "summoned");
    k.hearingAt = c.value("hearing_at", GameMinutes{-1});
    k.adjournments = c.value("adjournments", 0);
    k.lawyer = c.value("lawyer", "");
    k.lawyerAgreed = c.value("lawyer_agreed", false);
    k.openedAt = c.value("opened_at", GameMinutes{-1});
    k.pleaBy = c.value("plea_by", GameMinutes{-1});
    k.lawyerPresent = c.value("lawyer_present", false);
    k.witnessesInCourt = c.value("witnesses_in_court", 0);
    k.victimInCourt = c.value("victim_in_court", false);
    k.judge = c.value("judge", "");
    k.plea = c.value("plea", "");
    k.verdict = c.value("verdict", "");
    k.chance = c.value("chance", 0.0);
    k.decidedAt = c.value("decided_at", GameMinutes{-1});
    k.fineCents = c.value("fine_cents", Cents{0});
    k.fineUnpaid = c.value("fine_unpaid", false);
    k.serviceHours = c.value("service_hours", 0.0);
    k.serviceDone = c.value("service_done", 0.0);
    k.serviceDue = c.value("service_due", GameMinutes{-1});
    k.probationUntil = c.value("probation_until", GameMinutes{-1});
    k.jailMinutes = c.value("jail_minutes", GameMinutes{0});
    k.breached = c.value("breached", false);
    s.court.cases.push_back(std::move(k));
  }
}

// ---- Who's who ---------------------------------------------------------------------------------
bool World::playedByPerson(const CharacterState& c) const { return c.online && !isScripted(c.id); }

std::vector<CharacterId> World::inCourtroom() const {
  std::vector<CharacterId> out;
  const LocationId& house = content_->court().courthouse;
  for (const auto& [id, o] : state_.characters) {
    if (o.online && o.inside == house) out.push_back(id);
  }
  return out;
}

CourtCase* World::openCaseOf(const CharacterId& accused) {
  for (auto& k : state_.court.cases) {
    if (k.accused == accused && k.status != "decided") return &k;
  }
  return nullptr;
}

const CourtCase* World::courtCase(const std::string& id) const {
  for (const auto& k : state_.court.cases) {
    if (k.id == id) return &k;
  }
  return nullptr;
}

CourtCase* World::serviceOwed(const CharacterId& id) {
  for (auto& k : state_.court.cases) {
    if (k.accused == id && k.status == "decided" && !k.breached && k.serviceDone + 1e-9 < k.serviceHours) return &k;
  }
  return nullptr;
}

int World::convictionsOf(const CharacterState& c) const {
  const CourtConfig& C = content_->court();
  return static_cast<int>(std::count_if(c.record.begin(), c.record.end(), [&](const CrimeRecordEntry& e) { return C.tries(e.crime); }));
}

bool World::onProbation(const CharacterState& c) const {
  return std::any_of(state_.court.cases.begin(), state_.court.cases.end(),
                     [&](const CourtCase& k) { return k.accused == c.id && k.probationUntil > state_.now; });
}

// The record employers see (D-083): only employers that need a clean record look (careers and programmes in data), and
// only at entries not yet spent. A fixed penalty is spent soonest, a conviction later, one with time in a cell latest.
bool World::employersSeeRecord(const CharacterState& c) const {
  const CourtConfig& C = content_->court();
  if (!C.enabled) return !c.record.empty();
  for (const auto& e : c.record) {
    const int days = !C.tries(e.crime) ? C.penaltyDays : e.jailMinutes > 0 ? C.jailDays : C.convictionDays;
    if (state_.now - e.at < static_cast<GameMinutes>(days) * kMinutesPerDay) return true;
  }
  return false;
}

// ---- Charges and court dates ---------------------------------------------------------------------
// One open case a person: a charge before the hearing joins it, and they're heard together. Who saw it is taken from
// where the accused stands, as crimeWitnesses counts them (Crime.cpp), by name: the World knows who saw what.
CourtCase& World::chargeCase(CharacterState& c, const std::string& crime, const CharacterId& victim, const std::string& how,
                             bool& fresh) {
  CourtCase* k = nullptr;  // an open case whose hearing hasn't begun
  for (auto& x : state_.court.cases) {
    if (x.accused == c.id && (x.status == "summoned" || x.status == "warrant")) k = &x;
  }
  fresh = !k;
  if (fresh) {
    CourtCase n;
    n.id = nextId("case");
    n.accused = c.id;
    n.victim = victim;
    n.how = how;
    n.place = c.inside;
    n.at = state_.now;
    n.status = "summoned";
    state_.court.cases.push_back(std::move(n));
    k = &state_.court.cases.back();
  }
  if (!has(k->charges, crime)) k->charges.push_back(crime);
  if (k->victim.empty()) k->victim = victim;
  if (how == "caught") k->how = "caught";  // the stronger evidence stands
  auto add = [](std::vector<CharacterId>& v, const CharacterId& id) {
    if (!has(v, id)) v.push_back(id);
  };
  for (const auto& id : presentWith(c, content_->sim().hearingRangeMeters)) {
    const CharacterState* o = character(id);
    if (!o || id == victim || onDutyPolice(*o)) continue;  // officers are counted below, as policeNearby does
    if (o->career.shiftStartedAt && !c.inside.empty() && o->career.shiftLocation == c.inside) add(k->staff, id);
    else add(k->witnesses, id);
  }
  for (const auto& [id, o] : state_.characters) {
    if (id != c.id && onDutyPolice(o) && together(c, o, content_->crime().policeNearbyMeters)) add(k->police, id);
  }
  return *k;
}

// The first slot of the court's sittings at or after `from` that no other case has: the courthouse's open days, the
// sitting hours, one case a slot.
GameMinutes World::nextSitting(GameMinutes from, const std::string& besides) const {
  const CourtConfig& C = content_->court();
  const LocationDef* house = content_->location(C.courthouse);
  const GameMinutes day0 = from / kMinutesPerDay * kMinutesPerDay;
  for (int d = 0; d < 60; ++d) {
    const GameMinutes day = day0 + d * kMinutesPerDay;
    const int weekday = toDateTime(day).weekday;
    if (house && house->hours && !house->hours->days.empty() &&
        std::find(house->hours->days.begin(), house->hours->days.end(), weekday) == house->hours->days.end())
      continue;
    for (GameMinutes t = day + C.sitFrom * 60; t + C.slotMinutes <= day + C.sitTo * 60; t += C.slotMinutes) {
      if (t < from) continue;
      const bool taken = std::any_of(state_.court.cases.begin(), state_.court.cases.end(), [&](const CourtCase& k) {
        return k.id != besides && (k.status == "summoned" || k.status == "hearing") && k.hearingAt == t;
      });
      if (!taken) return t;
    }
  }
  return from;  // never: validated data always has sitting days
}

void World::summon(CourtCase& k, const std::string& why) {
  const CourtConfig& C = content_->court();
  const LocationDef* house = content_->location(C.courthouse);
  const std::string where = house ? house->name : "the courthouse";
  std::vector<std::string> labels;
  for (const auto& id : k.charges) {
    const CrimeDef* d = content_->crimeDef(id);
    labels.push_back(d ? d->label : id);
  }
  const std::string charges = joinAnd(labels);
  std::string text = (why.empty() ? "" : why + " ") + "You're charged with " + charges + ".";
  const CharacterState* held = character(k.accused);
  if (k.hearingAt >= 0 && held && held->jailedUntil > k.hearingAt)
    text += " Your hearing is " + whenText(k.hearingAt) + " at " + where + ".";
  else if (k.hearingAt >= 0)
    text += " Your hearing is " + whenText(k.hearingAt) + " at " + where + ". Be there: miss it and a warrant goes out for your arrest.";
  else
    text += " Your hearing will be set when you're back in town.";
  notify(k.accused, "court", text);
  if (const CharacterState* c = character(k.accused); c && c->online) {
    Json view = courtCaseView(k, *c);
    view["summons"] = true;
    emit({k.accused}, "court_summons", view);
  }
  if (!k.victim.empty() && k.hearingAt >= 0) {
    const CharacterDef* ad = definition(k.accused);
    notify(k.victim, "court", (ad ? ad->fullName() : k.accused) + " is charged with " + charges + ". The hearing is " +
                                  whenText(k.hearingAt) + " at " + where + ", and anyone may come.");
  }
}

Json World::reportCrime(CharacterState& c, const std::string& crime, const CharacterId& victim) {
  const CourtConfig& C = content_->court();
  if (!C.tries(crime)) {
    c.wantedFor = crime;  // no court for it: wanted until the police pick you up (D-069)
    return Json{{"wanted", true}};
  }
  bool fresh = false;
  CourtCase& k = chargeCase(c, crime, victim, "reported", fresh);
  const std::string id = k.id;
  if (fresh) k.hearingAt = playedByPerson(c) ? nextSitting(state_.now + C.noticeMinutes, k.id) : -1;
  if (k.status == "warrant") {
    notify(c.id, "police", "It was reported: one more charge on the warrant out for you.");
  } else {
    summon(k, "It was reported.");
  }
  Json out{{"summoned", true}, {"case", id}, {"hearing_at", k.hearingAt >= 0 ? Json(k.hearingAt) : Json()}};
  if (k.hearingAt >= 0) out["hearing_text"] = whenText(k.hearingAt);
  if (const LocationDef* house = content_->location(C.courthouse)) out["courthouse"] = house->name;
  return out;
}

void World::holdInCell(CharacterState& c, GameMinutes minutes) {
  if (c.career.shiftStartedAt) (void)endShift(c.id);
  if (c.education.sessionStartedAt) (void)endStudy(c.id);
  state_.court.serving.erase(c.id);
  c.moveTarget.reset();
  c.moveSpeedMps = 0;
  if (const LocationDef* cell = content_->location(content_->crime().jail)) {
    c.inside = cell->id;
    c.position = cell->door;
  }
  c.jailedUntil = std::max(c.jailedUntil, state_.now + minutes);
  (void)takeRoomSpot(c, [](const InteriorSpotDef& s) { return s.kind == "cell"; });  // interiors: into a cell
}

// ---- The odds and the sentence ---------------------------------------------------------------------
// The chance of a conviction on a not-guilty plea before a lawyer: how it came to court, who saw it, the victim's word,
// and (`inCourt`) who of them came to the hearing.
double World::evidenceOf(const CourtCase& k, bool inCourt) const {
  const CourtConfig& C = content_->court();
  double p = (k.how == "caught" ? C.caught : C.reported) + static_cast<double>(k.witnesses.size()) * C.perWitness +
             static_cast<double>(k.staff.size()) * C.perStaff + static_cast<double>(k.police.size()) * C.perOfficer +
             (k.victim.empty() ? 0 : C.victim);
  if (inCourt) p += k.witnessesInCourt * C.inCourt + (k.victimInCourt ? C.victimInCourt : 0);
  return p;
}

double World::lawyerEdge(const CourtCase& k, const std::string& lawyer) const {
  (void)k;
  const CourtConfig& C = content_->court();
  if (lawyer.empty()) return 0;
  if (lawyer == "firm") return C.firmEdge;
  const CharacterState* l = character(lawyer);
  return C.lawyerEdgeBase + C.lawyerEdgePerLevel * (l ? l->career.level : 0);
}

// Shown and used alike, to the hundredth: the number on the card is the number the court rolls.
double World::clampChance(double p) const {
  const CourtConfig& C = content_->court();
  return round2(std::clamp(p, C.minChance, C.maxChance));
}

CourtSentenceDef World::sentenceFor(const CourtCase& k, const CharacterState& c, bool guiltyPlea) const {
  const CourtConfig& C = content_->court();
  const auto priors = static_cast<std::size_t>(convictionsOf(c));
  CourtSentenceDef total;
  for (const auto& crime : k.charges) {
    const auto it = C.sentences.find(crime);
    if (it == C.sentences.end() || it->second.empty()) continue;
    const CourtSentenceDef& s = it->second[std::min(priors, it->second.size() - 1)];
    total.fineCents += s.fineCents;
    total.serviceHours += s.serviceHours;
    total.probationDays = std::max(total.probationDays, s.probationDays);
    total.jailMinutes += s.jailMinutes;
  }
  if (guiltyPlea) total = discounted(total, C.guiltyPleaDiscount);
  if (onProbation(c)) total.jailMinutes += C.probationBreachJailMinutes;  // convicted again while on probation
  return total;
}

std::string World::sentenceText(const CourtSentenceDef& s) const {
  std::vector<std::string> parts;
  if (s.fineCents > 0) parts.push_back("a " + formatMoney(s.fineCents) + " fine");
  if (s.serviceHours > 0) parts.push_back(hoursText(s.serviceHours) + " h of community service");
  if (s.probationDays > 0) parts.push_back(std::to_string(s.probationDays) + (s.probationDays == 1 ? " day" : " days") + " on probation");
  if (s.jailMinutes > 0) parts.push_back(spanText(s.jailMinutes) + " in a cell");
  return parts.empty() ? "nothing" : joinAnd(parts);
}

Json World::sentenceJson(const CourtSentenceDef& s) const {
  return Json{{"fine_cents", s.fineCents},
              {"service_hours", s.serviceHours},
              {"probation_days", s.probationDays},
              {"jail_minutes", s.jailMinutes},
              {"text", sentenceText(s)}};
}

// ---- What each person may see of a case ---------------------------------------------------------------
// The accused and their lawyer see everything the defence needs, the odds included (computed from who saw it, which
// the accused was there for, and public rules). The victim sees the charges, the date and the outcome. Everyone in
// the courtroom sees the hearing happen (the `court` event).
Json World::courtCaseView(const CourtCase& k, const CharacterState& viewer) const {
  const CourtConfig& C = content_->court();
  const LocationDef* house = content_->location(C.courthouse);
  const bool accused = viewer.id == k.accused;
  const bool lawyer = !k.lawyer.empty() && k.lawyer == viewer.id;
  const CharacterDef* ad = definition(k.accused);
  Json charges = Json::array();
  for (const auto& id : k.charges) {
    const CrimeDef* d = content_->crimeDef(id);
    charges.push_back(Json{{"crime", id}, {"label", d ? d->label : id}});
  }
  Json out{{"case", k.id},
           {"status", k.status},
           {"role", accused ? "accused" : lawyer ? "lawyer" : k.victim == viewer.id ? "victim" : "public"},
           {"accused", k.accused},
           {"accused_name", ad ? ad->fullName() : k.accused},
           {"charges", charges},
           {"how", k.how},
           {"at", k.at},
           {"courthouse", house ? house->name : C.courthouse},
           {"courthouse_id", C.courthouse}};
  if (const LocationDef* p = content_->location(k.place)) out["place"] = p->name;
  if (!k.victim.empty()) {
    const CharacterDef* vd = definition(k.victim);
    out["victim_name"] = vd ? vd->fullName() : k.victim;
  }
  out["hearing_at"] = k.hearingAt >= 0 ? Json(k.hearingAt) : Json();
  if (k.hearingAt >= 0) out["hearing_text"] = whenText(k.hearingAt);
  if (k.status == "summoned" && k.hearingAt >= 0) out["late_until"] = k.hearingAt + C.graceMinutes;
  if (k.status == "hearing") {
    out["opened_at"] = k.openedAt;
    out["plea_by"] = k.pleaBy;
  }
  if (!k.judge.empty()) {
    const CharacterDef* jd = definition(k.judge);
    out["judge"] = jd ? jd->fullName() : k.judge;
  }
  if (k.status == "warrant") out["warrant"] = true;
  if ((accused || lawyer) && k.status != "decided") {
    const bool open = k.status == "hearing";
    const double evidence = evidenceOf(k, open);
    // Before it opens, the lawyer who said yes is counted as coming; once it's open, only one who came.
    const std::string counted = open ? (k.lawyerPresent ? k.lawyer : "") : (k.lawyerAgreed ? k.lawyer : "");
    out["odds"] = Json{{"convicted_if_not_guilty", clampChance(evidence - lawyerEdge(k, counted))},
                       {"without_lawyer", clampChance(evidence)},
                       {"with_firm", clampChance(evidence - C.firmEdge)},
                       {"final", open}};
    Json ev{{"how", k.how},
            {"witnesses", k.witnesses.size()},
            {"staff", k.staff.size()},
            {"police", k.police.size()},
            {"victim", !k.victim.empty()}};
    if (open) {
      ev["in_court"] = k.witnessesInCourt;
      ev["victim_in_court"] = k.victimInCourt;
    } else {
      ev["each_in_court_adds"] = C.inCourt;  // who comes to the hearing counts again
      if (!k.victim.empty()) ev["victim_in_court_adds"] = C.victimInCourt;
    }
    out["evidence"] = ev;
    if (const CharacterState* a = character(k.accused)) {
      out["if_convicted"] = sentenceJson(sentenceFor(k, *a, false));
      out["if_guilty_plea"] = sentenceJson(sentenceFor(k, *a, true));
      out["priors"] = convictionsOf(*a);
      out["on_probation"] = onProbation(*a);
    }
    Json counsel{{"kind", k.lawyer.empty() ? "none" : k.lawyer == "firm" ? "firm" : "person"}};
    if (k.lawyer == "firm") {
      counsel.update(Json{{"name", C.firmName}, {"agreed", true}, {"edge", C.firmEdge}, {"fee_cents", C.firmFeeCents}, {"paid", true}});
    } else if (!k.lawyer.empty()) {
      const CharacterDef* ld = definition(k.lawyer);
      counsel.update(Json{{"id", k.lawyer},
                          {"name", ld ? ld->fullName() : k.lawyer},
                          {"agreed", k.lawyerAgreed},
                          {"edge", round2(lawyerEdge(k, k.lawyer))},
                          {"fee_cents", C.lawyerFeeCents},
                          {"paid", k.lawyerPresent}});
      if (open) counsel["present"] = k.lawyerPresent;
    }
    out["lawyer"] = counsel;
    Json careers = Json::array();
    for (const auto& id : C.lawyerCareers) {
      if (const CareerDef* cd = content_->career(id)) careers.push_back(cd->name);
    }
    out["lawyers"] = Json{{"firm", Json{{"name", C.firmName}, {"fee_cents", C.firmFeeCents}, {"edge", C.firmEdge}}},
                          {"person", Json{{"fee_cents", C.lawyerFeeCents},
                                          {"edge_base", C.lawyerEdgeBase},
                                          {"edge_per_level", C.lawyerEdgePerLevel},
                                          {"careers", careers}}}};
    if (open && accused) out["pleas"] = Json::array({"guilty", "not_guilty"});
    out["guilty_plea_discount"] = C.guiltyPleaDiscount;
  }
  if (k.status == "decided") {
    out["verdict"] = k.verdict;
    out["plea"] = k.plea;
    out["chance"] = k.chance;
    out["decided_at"] = k.decidedAt;
    if (k.verdict == "convicted") {
      CourtSentenceDef s;
      s.fineCents = k.fineCents;
      s.serviceHours = k.serviceHours;
      s.jailMinutes = k.jailMinutes;
      if (k.probationUntil >= 0) s.probationDays = static_cast<int>((k.probationUntil - k.decidedAt) / kMinutesPerDay);
      Json sentence = sentenceJson(s);
      sentence["fine_unpaid"] = k.fineUnpaid;
      if (k.serviceHours > 0) {
        sentence["service_done"] = std::round(k.serviceDone * 10) / 10;
        sentence["service_due"] = k.serviceDue;
        sentence["breached"] = k.breached;
      }
      if (k.probationUntil >= 0) sentence["probation_until"] = k.probationUntil;
      out["sentence"] = sentence;
    }
  }
  return out;
}

// What everyone in the courtroom sees: a hearing is public.
void World::courtPublic(const CourtCase& k, const std::string& stage, Json extra) {
  std::vector<CharacterId> room = inCourtroom();
  if (room.empty()) return;
  const CharacterDef* ad = definition(k.accused);
  Json labels = Json::array();
  for (const auto& id : k.charges) {
    const CrimeDef* d = content_->crimeDef(id);
    labels.push_back(d ? d->label : id);
  }
  Json data{{"case", k.id}, {"stage", stage}, {"accused", k.accused}, {"accused_name", ad ? ad->fullName() : k.accused},
            {"charges", labels}};
  data.update(extra);
  emit(std::move(room), "court", data);
}

// ---- The day in court -----------------------------------------------------------------------------
void World::openHearing(CourtCase& k, CharacterState& c) {
  const CourtConfig& C = content_->court();
  k.status = "hearing";
  k.openedAt = state_.now;
  k.pleaBy = state_.now + C.pleaMinutes;
  const std::vector<CharacterId> room = inCourtroom();
  auto here = [&](const CharacterId& id) { return has(room, id); };
  k.witnessesInCourt = 0;
  for (const auto* group : {&k.witnesses, &k.staff, &k.police}) {
    for (const auto& id : *group) k.witnessesInCourt += here(id) ? 1 : 0;
  }
  k.victimInCourt = !k.victim.empty() && here(k.victim);
  // Whoever is on shift at the courthouse in a career whose work is there sits on the bench (the judge); the World rules.
  k.judge.clear();
  for (const auto& id : room) {
    const CharacterState* o = character(id);
    const CareerDef* career = o ? content_->career(o->career.careerId) : nullptr;
    if (!o || !career) continue;
    if (id != k.accused && o->career.shiftStartedAt && o->career.shiftLocation == C.courthouse &&
        !has(C.lawyerCareers, career->id)) {
      k.judge = id;
      break;
    }
  }
  // A lawyer who said yes is paid now, if they came.
  k.lawyerPresent = k.lawyer == "firm";
  if (!k.lawyer.empty() && k.lawyer != "firm") {
    const CharacterDef* ld = definition(k.lawyer);
    const std::string name = ld ? ld->fullName() : k.lawyer;
    const bool came = k.lawyerAgreed && here(k.lawyer);
    if (came && state_.ledger.transfer(bankAccountOf(k.accused), bankAccountOf(k.lawyer), C.lawyerFeeCents, "legal_fee",
                                       "Legal fee: defending " + (definition(k.accused) ? definition(k.accused)->fullName() : k.accused),
                                       state_.now)) {
      k.lawyerPresent = true;
      notify(k.lawyer, "court", "You're defending " + (definition(k.accused) ? definition(k.accused)->firstName : k.accused) +
                                    ": " + formatMoney(C.lawyerFeeCents) + " paid.");
    } else {
      notify(k.accused, "court", came ? "You couldn't pay " + name + "'s fee, so you're on your own."
                                      : name + " isn't in the courtroom. You're on your own.");
      if (k.lawyerAgreed) notify(k.lawyer, "court", came ? "Your client couldn't pay your fee." : "You missed the hearing you'd agreed to.");
      k.lawyer.clear();
      k.lawyerAgreed = false;
    }
  }
  notify(c.id, "court", "Your hearing has begun. Plead guilty or not guilty by " + hhmm(k.pleaBy) + ".");
  emit({c.id}, "court_hearing", courtCaseView(k, c));
  if (k.lawyerPresent && k.lawyer != "firm") {
    if (const CharacterState* l = character(k.lawyer)) emit({k.lawyer}, "court_hearing", courtCaseView(k, *l));
  }
  Json extra = Json::object();
  if (!k.judge.empty()) extra["judge"] = definition(k.judge) ? definition(k.judge)->fullName() : k.judge;
  courtPublic(k, "opened", extra);
}

Json World::ruleOnCase(CourtCase& k, const std::string& plea) {
  const CourtConfig& C = content_->court();
  CharacterState& c = *mutableCharacter(k.accused);
  const LocationDef* house = content_->location(C.courthouse);
  const CharacterDef* ad = definition(k.accused);
  const std::string name = ad ? ad->fullName() : k.accused;
  std::vector<std::string> labels;
  for (const auto& id : k.charges) {
    const CrimeDef* d = content_->crimeDef(id);
    labels.push_back(d ? d->label : id);
  }
  const std::string charges = joinAnd(labels);
  const double chance = clampChance(evidenceOf(k, true) - lawyerEdge(k, k.lawyerPresent ? k.lawyer : ""));
  const bool guilty = plea == "guilty";
  // Computed before the conviction goes on the record (priors) and before probation is changed.
  const CourtSentenceDef s = sentenceFor(k, c, guilty);
  const bool convicted = guilty || roll() < chance;
  k.plea = plea;
  k.chance = guilty ? 1.0 : chance;
  k.verdict = convicted ? "convicted" : "dismissed";
  k.decidedAt = state_.now;
  k.status = "decided";
  std::string text;
  if (convicted) {
    Cents fine = s.fineCents;
    GameMinutes jail = s.jailMinutes;
    if (fine > 0 && !state_.ledger.transfer(bankAccountOf(c.id), C.finesAccount, fine, "fine", "Court fine: " + charges, state_.now)) {
      k.fineUnpaid = true;  // can't pay: held instead, as an unpaid fine always was (D-069)
      fine = 0;
      jail += C.unpaidFineJailMinutes;
    }
    k.fineCents = fine;
    k.jailMinutes = jail;
    k.serviceHours = s.serviceHours;
    if (s.serviceHours > 0) k.serviceDue = state_.now + static_cast<GameMinutes>(C.serviceDueDays) * kMinutesPerDay;
    if (s.probationDays > 0) k.probationUntil = state_.now + static_cast<GameMinutes>(s.probationDays) * kMinutesPerDay;
    CourtSentenceDef served = s;
    served.fineCents = fine;
    served.jailMinutes = jail;
    const std::string said = sentenceText(served) + (k.fineUnpaid ? " (you couldn't pay the fine, so the time is longer)" : "");
    // Each charge goes on the record; the case's fine and time are on its first entry.
    for (std::size_t i = 0; i < k.charges.size(); ++i)
      c.record.push_back(CrimeRecordEntry{k.charges[i], state_.now, i == 0 ? fine : 0, i == 0 ? jail : 0, k.id, said});
    text = "Convicted of " + charges + (guilty ? " on your guilty plea" : "") + ": " + said + ".";
    if (s.serviceHours > 0) {
      const LocationDef* place = content_->location(C.servicePlace);
      text += " Do your community service at " + (place ? place->name : C.servicePlace) + " by " + formatDateTime(k.serviceDue) + ".";
    }
    applyEmotions(c, {{"stress", 15}, {"sadness", 10}, {"embarrassment", 12}});
    if (jail > 0) holdInCell(c, jail);
  } else {
    text = "Not guilty: the case against you for " + charges + " is dismissed. Nothing goes on your record.";
    applyEmotions(c, {{"happiness", 15}, {"stress", -20}});
  }
  notify(c.id, "court", text);
  Memory m;
  m.id = nextId("mem");
  m.owner = c.id;
  m.at = state_.now;
  m.participants = {c.id};
  m.location = C.courthouse;
  m.type = "court";
  m.importance = convicted ? 65 : 55;
  m.emotionalImpact = convicted ? -40 : 35;
  m.info = convicted ? "Convicted of " + charges + " at " + (house ? house->name : "court")
                     : "Walked out of " + (house ? house->name : "court") + " cleared of " + charges;
  addMemory(std::move(m));
  Json view = courtCaseView(k, c);
  view["text"] = text;
  emit({c.id}, "court_verdict", view);
  std::string told;
  if (convicted) {
    CourtSentenceDef said = s;
    said.fineCents = k.fineCents;
    said.jailMinutes = k.jailMinutes;
    told = name + " was convicted of " + charges + ": " + sentenceText(said) + ".";
  } else {
    told = "The case against " + name + " for " + charges + " was dismissed.";
  }
  for (const auto& who : {k.victim, k.lawyer == "firm" ? std::string() : k.lawyer}) {
    if (who.empty() || who == c.id) continue;
    notify(who, "court", told);
    if (const CharacterState* o = character(who); o && o->online) {
      Json v = courtCaseView(k, *o);
      v["text"] = told;
      emit({who}, "court_verdict", v);
    }
  }
  CourtSentenceDef pub = s;
  pub.fineCents = k.fineCents;
  pub.jailMinutes = k.jailMinutes;
  courtPublic(k, "verdict", Json{{"verdict", k.verdict}, {"plea", plea}, {"text", told},
                                 {"sentence", convicted ? sentenceText(pub) : std::string()}});
  std::vector<CharacterId> saw;
  for (const auto& id : inCourtroom()) {
    if (id != c.id) saw.push_back(id);
  }
  witnessed("court", c.id, "", C.courthouse, saw, convicted ? "was convicted of " + charges : "was cleared of " + charges);
  return view;
}

void World::issueWarrant(CourtCase& k, CharacterState& c, const std::string& why) {
  const CrimeDef* d = content_->crimeDef(k.charges.front());
  const std::string label = d ? d->label : k.charges.front();
  k.status = "warrant";
  c.wantedFor = k.charges.front();
  notify(c.id, "police", why + " A warrant is out for your arrest: you're wanted for " + label + ".");
  const CharacterDef* ad = definition(c.id);
  const std::string name = ad ? ad->fullName() : c.id;
  dispatchPolice("Warrant: " + name + " didn't come to court for " + label + ".");
  if (!k.victim.empty()) notify(k.victim, "court", name + " didn't come to court. There's a warrant out for their arrest.");
  courtPublic(k, "warrant", Json::object());
}

void World::adjourn(CourtCase& k, CharacterState& c, bool counts, const std::string& why) {
  const CourtConfig& C = content_->court();
  if (counts) ++k.adjournments;
  k.hearingAt = playedByPerson(c) ? nextSitting(state_.now + C.noticeMinutes, k.id) : -1;
  const std::string when = k.hearingAt >= 0 ? "The new date is " + whenText(k.hearingAt) + "." : "A new date will be set when you're back in town.";
  notify(c.id, "court", "Your hearing was put off: " + why + ". " + when);
  if (!k.victim.empty()) {
    const CharacterDef* ad = definition(c.id);
    notify(k.victim, "court", "The hearing for " + (ad ? ad->fullName() : c.id) + " was put off." +
                                  (k.hearingAt >= 0 ? " The new date is " + whenText(k.hearingAt) + "." : ""));
  }
  courtPublic(k, "adjourned", Json{{"why", why}});
}

void World::stepCourtMinute() {
  const CourtConfig& C = content_->court();
  if (!C.enabled) return;
  // Once an hour, forget decided cases nobody needs any more (their convictions are on the records).
  if (state_.now % 60 == 0) {
    auto& cases = state_.court.cases;
    std::size_t decided = 0;
    for (const auto& k : cases) decided += k.status == "decided" ? 1 : 0;
    for (auto it = cases.begin(); it != cases.end() && decided > kDecidedKept;) {
      const bool done = it->status == "decided" && it->serviceDone + 1e-9 >= it->serviceHours && it->probationUntil <= state_.now;
      if (done) {
        it = cases.erase(it);
        --decided;
      } else {
        ++it;
      }
    }
  }
  for (std::size_t i = 0; i < state_.court.cases.size(); ++i) {
    CourtCase& k = state_.court.cases[i];
    CharacterState* c = mutableCharacter(k.accused);
    if (!c) continue;
    if (k.status == "decided") {
      if (k.probationUntil == state_.now) notify(c->id, "court", "Your probation is over.");
      continue;
    }
    if (k.status == "hearing") {
      if (state_.now >= k.pleaBy) ruleOnCase(k, "entered");  // no plea: the court enters not guilty and rules
      continue;
    }
    if (k.status != "summoned") continue;
    if (k.hearingAt < 0) {  // waiting for someone to answer it
      if (playedByPerson(*c)) {
        k.hearingAt = nextSitting(state_.now + C.noticeMinutes, k.id);
        summon(k, "You're back in town.");
      }
      continue;
    }
    if (state_.now < k.hearingAt) continue;
    if (c->jailedUntil > state_.now) {
      // Held for this hearing (remanded on a warrant): brought from the cell to the courtroom.
      if (c->online && c->jailedUntil <= k.hearingAt + C.graceMinutes + 1) {
        c->jailedUntil = -1;
        resetRoomPlace(c->id);
        if (const LocationDef* house = content_->location(C.courthouse)) {
          c->inside = house->id;
          c->position = house->door;
        }
        openHearing(k, *c);
      } else {
        adjourn(k, *c, false, "you're being held");
      }
      continue;
    }
    if (c->online && c->inside == C.courthouse && freeToAct(*c)) {
      openHearing(k, *c);
      continue;
    }
    if (outCold(*c)) {
      adjourn(k, *c, false, "you were in no state to come");
      continue;
    }
    if (state_.now < k.hearingAt + C.graceMinutes) continue;  // late is still heard
    if (playedByPerson(*c) || k.adjournments >= C.maxAdjournments)
      issueWarrant(k, *c, "You missed your hearing at " + hhmm(k.hearingAt) + ".");
    else
      adjourn(k, *c, true, "nobody was there to answer it");
  }
  stepServiceMinute();
}

// ---- Community service ------------------------------------------------------------------------------
void World::stepServiceMinute() {
  const CourtConfig& C = content_->court();
  const LocationDef* place = content_->location(C.servicePlace);
  for (auto it = state_.court.serving.begin(); it != state_.court.serving.end();) {
    CharacterState* c = mutableCharacter(it->first);
    CourtCase* k = c ? serviceOwed(c->id) : nullptr;
    const bool ok = c && k && c->online && c->inside == C.servicePlace && place && isLocationOpen(*place) && freeToAct(*c);
    if (!ok) {
      if (c && k)
        notify(c->id, "court", "You stopped your community service: " + hoursText(std::ceil((k->serviceHours - k->serviceDone) * 10) / 10) +
                                   " h left, due " + formatDateTime(k->serviceDue) + ".");
      it = state_.court.serving.erase(it);
      continue;
    }
    k->serviceDone += 1.0 / 60.0;
    StatMap wear;
    for (const auto& [n, perHour] : C.serviceNeedsPerHour) wear[n] = perHour / 60.0;
    applyNeeds(*c, wear);
    if (k->serviceDone + 1e-9 >= k->serviceHours) {
      k->serviceDone = k->serviceHours;
      notify(c->id, "court", "Community service done: " + hoursText(k->serviceHours) + " h at " + place->name + ".");
      emit({c->id}, "court_service", Json{{"case", k->id}, {"done", true}, {"hours", k->serviceHours}});
      Memory m;
      m.id = nextId("mem");
      m.owner = c->id;
      m.at = state_.now;
      m.participants = {c->id};
      m.location = place->id;
      m.type = "community_service";
      m.importance = 40;
      m.emotionalImpact = 10;
      m.info = "Finished " + hoursText(k->serviceHours) + " hours of community service at " + place->name;
      addMemory(std::move(m));
      it = state_.court.serving.erase(it);
      continue;
    }
    ++it;
  }
  // Undone by its date: a warrant. Not while nobody is playing them: they get a day once someone is.
  for (auto& k : state_.court.cases) {
    if (k.status != "decided" || k.breached || k.serviceDone + 1e-9 >= k.serviceHours || k.serviceDue < 0 || state_.now < k.serviceDue)
      continue;
    CharacterState* c = mutableCharacter(k.accused);
    if (!c) continue;
    if (!playedByPerson(*c)) {
      k.serviceDue = state_.now + kMinutesPerDay;
      continue;
    }
    k.breached = true;
    c->wantedFor = k.charges.front();
    state_.court.serving.erase(c->id);
    notify(c->id, "police", "Your community service wasn't done by " + formatDateTime(k.serviceDue) +
                                ". A warrant is out for your arrest: picked up, you'll serve the hours left in a cell.");
    const CharacterDef* ad = definition(c->id);
    dispatchPolice("Warrant: " + (ad ? ad->fullName() : c->id) + " didn't do their community service.");
  }
}

Result<Json> World::communityService(const CharacterId& actor, bool start) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  const CourtConfig& C = content_->court();
  if (!C.enabled) return fail("unavailable", "there's no court in this world");
  CourtCase* k = serviceOwed(actor);
  const bool serving = state_.court.serving.count(actor) > 0;
  if (!start) {
    if (!serving) return fail("not_serving", "you aren't doing community service right now");
    state_.court.serving.erase(actor);
    Json out{{"serving", false}};
    if (k) {
      out["hours_done"] = std::round(k->serviceDone * 10) / 10;
      out["hours_left"] = std::round((k->serviceHours - k->serviceDone) * 10) / 10;
      out["due"] = k->serviceDue;
    }
    return out;
  }
  if (!k) return fail("nothing_owed", "you don't owe any community service");
  if (serving) return fail("already_serving", "you're already doing your community service");
  if (Status st = freeToAct(c); !st) return st.error();
  if (c.career.shiftStartedAt) return fail("on_shift", "you're at work");
  if (c.education.sessionStartedAt) return fail("studying", "you're studying");
  const LocationDef* place = content_->location(C.servicePlace);
  if (c.inside != C.servicePlace) return fail("wrong_place", "community service is done at " + (place ? place->name : C.servicePlace));
  if (!place || !isLocationOpen(*place)) return fail("closed", (place ? place->name : C.servicePlace) + " is closed");
  state_.court.serving[actor] = state_.now;
  return Json{{"serving", true},
              {"place", place->name},
              {"hours_done", std::round(k->serviceDone * 10) / 10},
              {"hours_left", std::round((k->serviceHours - k->serviceDone) * 10) / 10},
              {"due", k->serviceDue}};
}

// ---- Commands -------------------------------------------------------------------------------------------
Result<Json> World::courtPlea(const CharacterId& actor, const std::string& caseId, const std::string& plea) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  const CourtConfig& C = content_->court();
  CourtCase* k = nullptr;
  for (auto& x : state_.court.cases) {
    if (x.id == caseId && x.accused == actor) k = &x;
  }
  if (!k) return fail("unknown_case", "you have no such case");
  if (k->status == "decided") return fail("already_decided", "that case is over");
  if (k->status != "hearing")
    return fail("not_open", k->hearingAt >= 0 ? "your hearing hasn't begun: it's " + whenText(k->hearingAt) : "your hearing hasn't been set yet");
  if (plea != "guilty" && plea != "not_guilty") return fail("bad_plea", "plead guilty or not guilty");
  if (Status st = freeToAct(c); !st) return st.error();
  const LocationDef* house = content_->location(C.courthouse);
  if (c.inside != C.courthouse) return fail("not_here", "you plead in the courtroom at " + (house ? house->name : C.courthouse));
  return ruleOnCase(*k, plea);
}

Result<Json> World::courtLawyer(const CharacterId& actor, const std::string& caseId, const std::string& lawyer) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  const CourtConfig& C = content_->court();
  CourtCase* k = nullptr;
  for (auto& x : state_.court.cases) {
    if (x.id == caseId && x.accused == actor) k = &x;
  }
  if (!k) return fail("unknown_case", "you have no such case");
  if (k->status == "decided") return fail("already_decided", "that case is over");
  const bool open = k->status == "hearing";
  const std::string was = k->lawyer;
  auto dropPerson = [&](const std::string& why) {
    if (!was.empty() && was != "firm") {
      const CharacterDef* ad = definition(actor);
      notify(was, "court", (ad ? ad->fullName() : actor) + " " + why + ".");
    }
  };
  if (lawyer.empty()) {
    if (was.empty()) return fail("not_represented", "nobody is defending you");
    if (open && k->lawyerPresent) return fail("already_decided", "your lawyer is already arguing your case");
    dropPerson("doesn't need you to defend them any more");
    k->lawyer.clear();
    k->lawyerAgreed = false;
    k->lawyerPresent = false;
    Json out = courtCaseView(*k, c);
    if (was == "firm") out["note"] = C.firmName + "'s fee isn't refunded.";
    return out;
  }
  if (lawyer == was && (lawyer == "firm" || k->lawyerAgreed || !open))
    return fail("already_represented", lawyer == "firm" ? C.firmName + " is already defending you" : "you've already asked them");
  if (was == "firm") return fail("already_represented", C.firmName + " is already defending you (and has been paid)");
  if (open && k->lawyerPresent) return fail("already_represented", "your lawyer is already here");
  if (lawyer == "firm") {
    auto tx = state_.ledger.transfer(bankAccountOf(actor), C.firmAccount, C.firmFeeCents, "legal_fee", C.firmName + ": your defence",
                                     state_.now);
    if (!tx) return tx.error();
    dropPerson("hired " + C.firmName + " instead");
    k->lawyer = "firm";
    k->lawyerAgreed = true;
    k->lawyerPresent = open;
    notify(actor, "court", C.firmName + " will defend you: " + formatMoney(C.firmFeeCents) + " paid.");
    return courtCaseView(*k, c);
  }
  if (lawyer == actor) return fail("invalid_target", "you can't defend yourself here");
  const CharacterState* l = character(lawyer);
  const CharacterDef* ld = definition(lawyer);
  if (!l || !ld) return fail("unknown_person", "no such person");
  if (lawyer == k->victim) return fail("conflict_of_interest", ld->firstName + " is the victim in this case");
  if (!has(C.lawyerCareers, l->career.careerId)) return fail("not_a_lawyer", ld->firstName + " isn't a lawyer");
  if (!playedByPerson(*l)) return fail("not_available", ld->firstName + " isn't taking clients right now; " + C.firmName + " can defend you");
  if (open && l->inside != C.courthouse) return fail("not_here", "your hearing has begun: only a lawyer in the courtroom can step in");
  if (state_.ledger.balance(bankAccountOf(actor)) < C.lawyerFeeCents)
    return fail("insufficient_funds", "a lawyer's fee is " + formatMoney(C.lawyerFeeCents) + ", paid when they stand up for you");
  dropPerson("asked someone else to defend them");
  k->lawyer = lawyer;
  k->lawyerAgreed = false;
  k->lawyerPresent = false;
  const CharacterDef* ad = definition(actor);
  notify(lawyer, "court", (ad ? ad->fullName() : actor) + " asks you to defend them" +
                              (k->hearingAt >= 0 ? " at their hearing, " + whenText(k->hearingAt) : "") + ". Your fee: " +
                              formatMoney(C.lawyerFeeCents) + ".");
  Json brief = courtCaseView(*k, *l);
  brief["asked_by"] = ad ? ad->fullName() : actor;
  brief["fee_cents"] = C.lawyerFeeCents;
  emit({lawyer}, "court_brief", brief);
  return courtCaseView(*k, c);
}

Result<Json> World::courtRepresent(const CharacterId& actor, const std::string& caseId, bool accept) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& me = *r.value();
  const CourtConfig& C = content_->court();
  CourtCase* k = nullptr;
  for (auto& x : state_.court.cases) {
    if (x.id == caseId && x.lawyer == actor && !x.lawyerAgreed) k = &x;
  }
  if (!k) return fail("unknown_case", "nobody has asked you to defend them in that case");
  if (k->status == "decided") return fail("already_decided", "that case is over");
  const CharacterDef* md = definition(actor);
  const std::string name = md ? md->fullName() : actor;
  if (!accept) {
    k->lawyer.clear();
    notify(k->accused, "court", name + " won't defend you.");
    return Json{{"case", k->id}, {"accepted", false}};
  }
  if (k->status == "hearing") {
    // Stepping in at an open hearing: here, and paid now.
    if (me.inside != C.courthouse) return fail("not_here", "the hearing has begun: be in the courtroom to step in");
    auto tx = state_.ledger.transfer(bankAccountOf(k->accused), bankAccountOf(actor), C.lawyerFeeCents, "legal_fee",
                                     "Legal fee", state_.now);
    if (!tx) return fail("insufficient_funds", "your client can't pay your fee");
    k->lawyerPresent = true;
  }
  k->lawyerAgreed = true;
  notify(k->accused, "court", name + " will defend you.");
  if (const CharacterState* a = character(k->accused); a && a->online) {
    Json v = courtCaseView(*k, *a);
    emit({k->accused}, "court_lawyer", v);
  }
  Json out = courtCaseView(*k, me);
  out["accepted"] = true;
  return out;
}

// ---- Views ------------------------------------------------------------------------------------------------
Json World::courtYou(const CharacterState& c) const {
  if (!content_->court().enabled) return Json();
  Json out = Json::object();
  for (const auto& k : state_.court.cases) {
    if (k.accused == c.id && k.status != "decided") {
      out["case"] = k.id;
      out["status"] = k.status;
      out["hearing_at"] = k.hearingAt >= 0 ? Json(k.hearingAt) : Json();
      if (k.hearingAt >= 0) out["late_until"] = k.hearingAt + content_->court().graceMinutes;
      if (k.status == "hearing") out["plea_by"] = k.pleaBy;
    }
    if (k.lawyer == c.id && k.status != "decided") {
      Json b{{"case", k.id}, {"agreed", k.lawyerAgreed}, {"hearing_at", k.hearingAt >= 0 ? Json(k.hearingAt) : Json()}};
      if (const CharacterDef* ad = definition(k.accused)) b["client"] = ad->fullName();
      out["defending"] = b;
    }
    if (k.accused == c.id && k.status == "decided" && !k.breached && k.serviceDone + 1e-9 < k.serviceHours && !out.contains("service"))
      out["service"] = Json{{"case", k.id},
                            {"hours_left", std::round((k.serviceHours - k.serviceDone) * 10) / 10},
                            {"due", k.serviceDue},
                            {"serving", state_.court.serving.count(c.id) > 0}};
    if (k.accused == c.id && k.probationUntil > state_.now)
      out["probation_until"] = std::max(out.value("probation_until", GameMinutes{-1}), k.probationUntil);
  }
  return out.empty() ? Json() : out;
}

void World::courtCalendar(const CharacterState& c, Json& upcoming) const {
  const CourtConfig& C = content_->court();
  if (!C.enabled) return;
  const LocationDef* house = content_->location(C.courthouse);
  const std::string where = house ? house->name : C.courthouse;
  for (const auto& k : state_.court.cases) {
    if (k.status == "decided") {
      if (k.accused == c.id && !k.breached && k.serviceDone + 1e-9 < k.serviceHours && k.serviceDue > state_.now) {
        const LocationDef* place = content_->location(C.servicePlace);
        upcoming.push_back(Json{{"at", k.serviceDue}, {"when", formatDateTime(k.serviceDue)}, {"kind", "service"},
                                {"place", C.servicePlace},
                                {"title", "Community service due: " + hoursText(std::ceil((k.serviceHours - k.serviceDone) * 10) / 10) +
                                              " h left at " + (place ? place->name : C.servicePlace)}});
      }
      continue;
    }
    if (k.hearingAt < 0 || k.status != "summoned") continue;
    std::vector<std::string> labels;
    for (const auto& id : k.charges) {
      const CrimeDef* d = content_->crimeDef(id);
      labels.push_back(d ? d->label : id);
    }
    const CharacterDef* ad = definition(k.accused);
    std::string title;
    if (k.accused == c.id) title = "Court: your hearing (" + joinAnd(labels) + ")";
    else if (k.lawyer == c.id && k.lawyerAgreed) title = "Court: defending " + (ad ? ad->fullName() : k.accused);
    else if (k.victim == c.id) title = "Court: " + (ad ? ad->fullName() : k.accused) + "'s hearing (" + joinAnd(labels) + ")";
    else continue;
    upcoming.push_back(Json{{"at", k.hearingAt}, {"when", formatDateTime(k.hearingAt)}, {"kind", "court"}, {"case", k.id},
                            {"place", C.courthouse}, {"title", title + ", " + where}});
  }
}

Json World::phoneCourt(const CharacterState& c) const {
  const CourtConfig& C = content_->court();
  if (!C.enabled) return Json{{"cases", Json::array()}, {"note", "There's no court in this town."}};
  Json mine = Json::array(), victim = Json::array(), defending = Json::array(), docket = Json::array();
  const CareerDef* career = content_->career(c.career.careerId);
  const bool bench = career && has(career->workplaces, C.courthouse) && !has(C.lawyerCareers, career->id);
  for (auto it = state_.court.cases.rbegin(); it != state_.court.cases.rend(); ++it) {
    const CourtCase& k = *it;
    const bool recent = k.status != "decided" || state_.now - k.decidedAt < 7 * kMinutesPerDay ||
                        (k.serviceDone + 1e-9 < k.serviceHours && !k.breached) || k.probationUntil > state_.now;
    if (k.accused == c.id && (recent || mine.size() < 5)) mine.push_back(courtCaseView(k, c));
    else if (k.lawyer == c.id && k.status != "decided") defending.push_back(courtCaseView(k, c));
    else if (k.victim == c.id && recent) victim.push_back(courtCaseView(k, c));
    // The bench's docket: the hearings to come and under way, the day's business (D-083).
    if (bench && (k.status == "summoned" || k.status == "hearing") && k.hearingAt >= 0) {
      const CharacterDef* ad = definition(k.accused);
      Json labels = Json::array();
      for (const auto& id : k.charges) {
        const CrimeDef* d = content_->crimeDef(id);
        labels.push_back(d ? d->label : id);
      }
      docket.push_back(Json{{"case", k.id}, {"accused_name", ad ? ad->fullName() : k.accused}, {"charges", labels},
                            {"hearing_at", k.hearingAt}, {"hearing_text", whenText(k.hearingAt)}, {"status", k.status}});
    }
  }
  std::sort(docket.begin(), docket.end(), [](const Json& a, const Json& b) { return a["hearing_at"] < b["hearing_at"]; });
  Json out{{"cases", mine}, {"as_victim", victim}, {"defending", defending}, {"rules", courtRules()}};
  if (bench) out["docket"] = docket;
  if (Json you = courtYou(c); !you.is_null()) out["you"] = you;
  return out;
}

Json World::courtRules() const {
  const CourtConfig& C = content_->court();
  if (!C.enabled) return Json();
  const LocationDef* house = content_->location(C.courthouse);
  const LocationDef* service = content_->location(C.servicePlace);
  const LocationDef* firm = content_->location(C.firmPlace);
  Json days = Json::array();
  if (house && house->hours) {
    for (int d : house->hours->days) days.push_back(weekdayName(d));
  }
  Json careers = Json::array();
  for (const auto& id : C.lawyerCareers) {
    if (const CareerDef* cd = content_->career(id)) careers.push_back(cd->name);
  }
  return Json{{"courthouse", C.courthouse},
              {"courthouse_name", house ? house->name : C.courthouse},
              {"sitting_hours", {C.sitFrom, C.sitTo}},
              {"sitting_days", days},
              {"booking_minutes", C.bookingMinutes},
              {"notice_minutes", C.noticeMinutes},
              {"grace_minutes", C.graceMinutes},
              {"plea_minutes", C.pleaMinutes},
              {"guilty_plea_discount", C.guiltyPleaDiscount},
              {"firm", Json{{"name", C.firmName}, {"fee_cents", C.firmFeeCents}, {"edge", C.firmEdge},
                            {"place", firm ? Json(firm->name) : Json()}}},
              {"lawyer", Json{{"fee_cents", C.lawyerFeeCents}, {"edge_base", C.lawyerEdgeBase},
                              {"edge_per_level", C.lawyerEdgePerLevel}, {"careers", careers}}},
              {"community_service", Json{{"place", C.servicePlace}, {"place_name", service ? service->name : C.servicePlace},
                                         {"due_days", C.serviceDueDays}}},
              {"record_days", Json{{"penalty", C.penaltyDays}, {"conviction", C.convictionDays}, {"jail", C.jailDays}}}};
}

// crime_risk's court part (D-069's rule: only the server's own numbers). The sentence is yours now (the convictions
// on your record, probation); the odds are for where you stand, with who would see it now.
Json World::courtRisk(const CharacterState& c, const CrimeDef& crime, const CharacterId& victim, bool here) const {
  const CourtConfig& C = content_->court();
  CourtCase k;
  k.charges = {crime.id};
  k.victim = victim;
  const LocationDef* house = content_->location(C.courthouse);
  Json out{{"courthouse", house ? house->name : C.courthouse},
           {"booking_minutes", C.bookingMinutes},
           {"notice_minutes", C.noticeMinutes},
           {"if_convicted", sentenceJson(sentenceFor(k, c, false))},
           {"if_guilty_plea", sentenceJson(sentenceFor(k, c, true))},
           {"priors", convictionsOf(c)},
           {"on_probation", onProbation(c)},
           {"firm", Json{{"name", C.firmName}, {"fee_cents", C.firmFeeCents}, {"edge", C.firmEdge}}}};
  if (!here) return out;
  const CrimeWitnesses w = crimeWitnesses(c, victim);
  k.witnesses.resize(static_cast<std::size_t>(w.witnesses));
  k.staff.resize(static_cast<std::size_t>(w.staff));
  k.police.resize(static_cast<std::size_t>(w.police));
  k.how = "caught";
  out["odds_if_caught"] = clampChance(evidenceOf(k, false));
  k.how = "reported";
  out["odds_if_reported"] = clampChance(evidenceOf(k, false));
  return out;
}

void World::recordEntryCourt(const CrimeRecordEntry& e, Json& out) const {
  const CourtConfig& C = content_->court();
  if (!C.enabled) return;
  const bool conviction = C.tries(e.crime);
  out["kind"] = conviction ? "conviction" : "penalty";
  const int days = !conviction ? C.penaltyDays : e.jailMinutes > 0 ? C.jailDays : C.convictionDays;
  const GameMinutes until = e.at + static_cast<GameMinutes>(days) * kMinutesPerDay;
  out["employers_see"] = state_.now < until;
  out["employers_see_until"] = formatDateTime(until);
  if (!e.caseId.empty()) out["case"] = e.caseId;
  if (!e.sentence.empty()) out["sentence"] = e.sentence;
}

void World::addCourtToRecord(const CharacterState& c, Json& out) const {
  if (!content_->court().enabled) return;
  out["employers_see"] = employersSeeRecord(c);  // only employers that need a clean record look
  if (Json you = courtYou(c); !you.is_null()) out["court"] = you;
}

}  // namespace livera
