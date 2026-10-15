// Read-only projections of world state for clients. Each view shows a character only
// what that character is entitled to know: their own needs and money, their own side of
// each relationship, and what is physically around them.

#include <algorithm>
#include <cmath>

#include "core/Clock.h"
#include "core/Serialization.h"
#include "core/World.h"

namespace livera {

namespace {

constexpr double kSightRange = 40;        // other people outdoors
constexpr double kLandmarkRange = 120;    // buildings and sites listed by `look`

Json roundedStats(const StatMap& m) {
  Json j = Json::object();
  for (const auto& [k, v] : m) j[k] = std::round(v);
  return j;
}

Json timeJson(GameMinutes now) {
  const DateTime d = toDateTime(now);
  return Json{{"minute", now},
              {"text", formatDateTime(now)},
              {"year", d.year},
              {"month", d.month},
              {"day", d.day},
              {"weekday", weekdayName(d.weekday)},
              {"hour", d.hour},
              {"phase", dayPhaseName(dayPhase(now))},
              {"daylight", daylightLevel(now)}};
}

}  // namespace

Result<Json> World::look(const CharacterId& actor) const {
  const CharacterState* c = character(actor);
  if (!c || !c->online) return fail("not_in_world", "character is not in the world");
  const ContentDatabase& db = *content_;
  const CharacterDef& def = *db.character(actor);

  Json you{{"id", actor},
           {"name", def.fullName()},
           {"position", {std::round(c->position.x * 10) / 10, std::round(c->position.y * 10) / 10}},
           {"moving", c->moveTarget.has_value()},
           {"inside", c->inside},
           {"needs", roundedStats(c->needs)},
           {"emotions", roundedStats(c->emotions)},
           {"on_shift", c->career.shiftStartedAt.has_value()}};

  Json people = Json::array();
  for (const auto& [id, o] : state_.characters) {
    if (id == actor || !o.online) continue;
    const bool visible = c->inside.empty() ? (o.inside.empty() && distance(c->position, o.position) <= kSightRange)
                                           : o.inside == c->inside;
    if (!visible) continue;
    const CharacterDef* od = db.character(id);
    const RelationshipState* rel = relationship(actor, id);
    Json p{{"id", id}, {"name", od ? od->fullName() : id}, {"known", rel && rel->firstMetAt >= 0}};
    if (c->inside.empty()) p["distance_m"] = std::round(distance(c->position, o.position));
    people.push_back(p);
  }

  Json here = Json::object();
  if (const LocationDef* loc = currentPlace(*c)) {
    Json offers = Json::array();
    for (const auto& o : loc->offers) offers.push_back(Json{{"id", o.id}, {"label", o.label}, {"price_cents", o.priceCents}});
    Json activities = Json::array();
    for (const auto& a : loc->activities) activities.push_back(Json{{"id", a.id}, {"label", a.label}});
    here = Json{{"id", loc->id}, {"name", loc->name}, {"type", loc->type}, {"description", loc->description},
                {"status", locationStatus(*loc)}, {"offers", offers}, {"activities", activities}};
  }

  Json nearby = Json::array();
  if (c->inside.empty()) {
    std::vector<std::pair<double, const LocationDef*>> found;
    for (const auto& [id, loc] : db.locations()) {
      const double d = distance(c->position, loc.door);
      if (d <= kLandmarkRange) found.emplace_back(d, &loc);
    }
    std::sort(found.begin(), found.end(), [](const auto& a, const auto& b) { return a.first < b.first; });
    for (const auto& [d, loc] : found) {
      Json l{{"id", loc->id}, {"name", loc->name}, {"type", loc->type}, {"distance_m", std::round(d)},
             {"status", locationStatus(*loc)}};
      for (const auto& p : db.constructionProjects()) {
        if (p.site != loc->id) continue;
        const ConstructionState& st = state_.construction.at(p.id);
        if (st.status != ConstructionStatus::Active) continue;
        const DateTime now = toDateTime(state_.now);
        const bool workDay = std::find(p.workDays.begin(), p.workDays.end(), now.weekday) != p.workDays.end();
        const bool working = workDay && now.hour >= p.startHour && now.hour < p.endHour;
        l["construction"] = Json{{"project", p.name},
                                 {"progress_pct", std::floor(st.workerHoursDone / p.workerHoursRequired * 1000) / 10},
                                 {"crew_on_site", working ? p.crewSize : 0},
                                 {"crew_hours", std::to_string(p.startHour) + ":00-" + std::to_string(p.endHour) + ":00"}};
      }
      nearby.push_back(l);
    }
  }

  return Json{{"time", timeJson(state_.now)}, {"you", you}, {"here", here}, {"people", people}, {"nearby", nearby}};
}

Json World::mapView() const {
  Json places = Json::array();
  for (const auto& [id, loc] : content_->locations()) {
    places.push_back(Json{{"id", id},
                          {"name", loc.name},
                          {"type", loc.type},
                          {"district", loc.district},
                          {"door", {loc.door.x, loc.door.y}},
                          {"enterable", loc.enterable},
                          {"status", locationStatus(loc)}});
  }
  const SimulationConfig& sim = content_->sim();
  return Json{{"bounds", {{"min", {sim.worldMin.x, sim.worldMin.y}}, {"max", {sim.worldMax.x, sim.worldMax.y}}}},
              {"places", places}};
}

Json World::playableCharacters() const {
  Json out = Json::array();
  for (const auto& [id, def] : content_->characters()) {
    if (!def.playable) continue;
    const CareerDef* career = content_->career(def.careerId);
    const CharacterState* c = character(id);
    const int level = c ? c->career.level : def.careerLevel;
    out.push_back(Json{{"id", id},
                       {"name", def.fullName()},
                       {"age", def.age},
                       {"pronouns", def.pronouns},
                       {"career", career ? career->levels.at(static_cast<std::size_t>(level)).title : ""},
                       {"tagline", def.profile.value("tagline", "")}});
  }
  return out;
}

Json World::phoneBank(const CharacterState& c) const {
  const LedgerAccountId bank = bankAccountOf(c.id);
  const LedgerAccountId cash = cashAccountOf(c.id);
  Json txs = Json::array();
  for (const auto& acct : {bank, cash}) {
    for (const auto& tx : state_.ledger.history(acct, 15)) {
      const bool outgoing = tx.from == acct;
      txs.push_back(Json{{"id", tx.id},
                         {"at", tx.at},
                         {"when", formatDateTime(tx.at)},
                         {"account", acct == bank ? "bank" : "cash"},
                         {"amount_cents", outgoing ? -tx.amountCents : tx.amountCents},
                         {"kind", tx.kind},
                         {"memo", tx.memo}});
    }
  }
  std::sort(txs.begin(), txs.end(), [](const Json& a, const Json& b) { return a["at"] > b["at"]; });
  if (txs.size() > 15) txs.erase(txs.begin() + 15, txs.end());
  return Json{{"bank_cents", state_.ledger.balance(bank)},
              {"cash_cents", state_.ledger.balance(cash)},
              {"rent_arrears_cents", c.rentArrearsCents},
              {"recent", txs}};
}

Json World::phoneMessages(const CharacterState& c) {
  Json threads = Json::object();
  for (auto& m : state_.messages) {
    if (m.from != c.id && m.to != c.id) continue;
    const CharacterId other = m.from == c.id ? m.to : m.from;
    Json entry{{"id", m.id}, {"from", m.from}, {"body", m.body}, {"at", m.at}, {"when", formatDateTime(m.at)},
               {"unread", m.to == c.id && !m.read}};
    threads[other].push_back(entry);
    if (m.to == c.id) m.read = true;
  }
  return Json{{"threads", threads}};
}

Json World::phoneContacts(const CharacterState& c) const {
  Json contacts = Json::array();
  for (const auto& [key, rel] : state_.relationships) {
    if (key.first != c.id || rel.firstMetAt < 0) continue;
    const CharacterDef* od = content_->character(key.second);
    const CharacterState* os = character(key.second);
    contacts.push_back(Json{{"id", key.second},
                            {"name", od ? od->fullName() : key.second},
                            {"online", os && os->online},
                            {"interactions", rel.interactionCount},
                            {"your_feelings", roundedStats(rel.dimensions)}});
  }
  return Json{{"contacts", contacts}};
}

Json World::phoneCalendar(const CharacterState& c) const {
  const CharacterDef* def = content_->character(c.id);
  const GameMinutes nextMonth = (state_.now / kMinutesPerMonth + 1) * kMinutesPerMonth;
  Json events = Json::array();
  for (const auto& [pid, p] : state_.properties) {
    if (p.tenant != c.id) continue;
    const PropertyDef* pd = content_->property(pid);
    if (pd && pd->rentMonthlyCents > 0)
      events.push_back(Json{{"at", nextMonth}, {"when", formatDateTime(nextMonth)},
                            {"title", "Rent due: " + formatMoney(pd->rentMonthlyCents)}});
  }
  return Json{{"now", timeJson(state_.now)},
              {"routine", def ? def->profile.value("schedule", Json::object()) : Json::object()},
              {"upcoming", events}};
}

Json World::phoneCareer(const CharacterState& c) const {
  const CareerDef* career = content_->career(c.career.careerId);
  if (!career) return Json{{"career", nullptr}};
  const CareerLevel& lv = career->levels.at(static_cast<std::size_t>(c.career.level));
  Json ladder = Json::array();
  for (const auto& l : career->levels) ladder.push_back(l.title);
  Json workplaces = Json::array();
  for (const auto& w : career->workplaces) workplaces.push_back(content_->location(w)->name);
  return Json{{"career", career->name},
              {"title", lv.title},
              {"level", c.career.level},
              {"ladder", ladder},
              {"hourly_cents", lv.hourlyCents},
              {"hours_at_level", std::round(c.career.hoursAtLevel * 10) / 10},
              {"hours_to_promote", lv.hoursToPromote},
              {"min_performance", lv.minPerformance},
              {"performance", std::round(c.career.performance)},
              {"lifetime_earnings_cents", c.career.lifetimeEarningsCents},
              {"workplaces", workplaces},
              {"on_shift", c.career.shiftStartedAt.has_value()}};
}

Json World::phoneProperty(const CharacterState& c) const {
  Json homes = Json::array();
  for (const auto& [pid, p] : state_.properties) {
    if (p.tenant != c.id) continue;
    const PropertyDef* pd = content_->property(pid);
    const LocationDef* loc = content_->location(pd->location);
    homes.push_back(Json{{"id", pid},
                         {"location", pd->location},
                         {"name", loc ? loc->name : pd->location},
                         {"type", pd->type},
                         {"tenure", "renting"},
                         {"bedrooms", pd->bedrooms},
                         {"amenities", pd->amenities},
                         {"rent_monthly_cents", pd->rentMonthlyCents},
                         {"market_value_cents", pd->marketValueCents}});
  }
  return Json{{"properties", homes}};
}

Json World::phoneNotifications(const CharacterState& c) {
  Json out = Json::array();
  for (auto it = state_.notifications.rbegin(); it != state_.notifications.rend() && out.size() < 30; ++it) {
    if (it->recipient != c.id) continue;
    out.push_back(Json{{"id", it->id}, {"kind", it->kind}, {"text", it->text}, {"when", formatDateTime(it->at)},
                       {"unread", !it->read}});
    it->read = true;
  }
  return Json{{"notifications", out}};
}

Json World::phoneCity() const {
  Json projects = Json::array();
  for (const auto& p : content_->constructionProjects()) {
    const ConstructionState& st = state_.construction.at(p.id);
    projects.push_back(Json{{"id", p.id},
                            {"name", p.name},
                            {"status", toString(st.status)},
                            {"progress_pct", std::floor(st.workerHoursDone / p.workerHoursRequired * 1000) / 10}});
  }
  std::string stageName;
  for (const auto& s : content_->cityStages()) {
    if (s.stage == state_.city.stage) stageName = s.name;
  }
  return Json{{"stage", state_.city.stage}, {"stage_name", stageName}, {"stats", roundedStats(state_.city.stats)},
              {"construction", projects}};
}

}  // namespace livera
