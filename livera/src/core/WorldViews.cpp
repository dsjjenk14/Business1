// Read-only projections of world state for clients. Each view shows a character only
// what that character is entitled to know: their own needs and money, their own side of
// each relationship, and what is physically around them.

#include <algorithm>
#include <cmath>
#include <set>

#include "core/Clock.h"
#include "core/Serialization.h"
#include "core/World.h"

namespace livera {

namespace {

constexpr double kLandmarkRange = 120;    // buildings and sites listed by `look`
// Standing still, someone who shifts further than this was moved (jail, the ER, shown out of a home):
// the onlookers' clients are told. Smaller drifts are rounding, not news.
constexpr double kStillMoveThreshold = 0.5;
// Someone else's far destination is cut where their path leaves the viewer's sight, plus this margin: about what a bus
// covers in one capped tick (Server::tick), so the client is told they've gone before its prediction would stop them
// short, and a viewer on the move isn't sent a new cut every tick.
constexpr double kSightCutMarginMeters = 25;

Json point(Vec2 p) { return Json::array({std::round(p.x * 10) / 10, std::round(p.y * 10) / 10}); }

// Where someone is and how they're moving, as a client predicts it: straight toward `target` at
// `speed_mps` until the next update.
Json motionJson(const SeenPerson& m) {
  return Json{{"position", point(m.position)},
              {"inside", m.inside},
              {"moving", m.target.has_value()},
              {"target", m.target ? point(*m.target) : Json()},
              {"speed_mps", m.speedMps},
              {"mode", m.bus ? "bus" : "walk"}};
}

bool sameTarget(const std::optional<Vec2>& a, const std::optional<Vec2>& b) {
  return a.has_value() == b.has_value() && (!a || *a == *b);
}

// Where the straight path from `from` (inside the circle) toward `to` (outside it) crosses the circle.
Vec2 leaveCircle(Vec2 centre, double radius, Vec2 from, Vec2 to) {
  const double dx = to.x - from.x, dy = to.y - from.y;
  const double fx = from.x - centre.x, fy = from.y - centre.y;
  const double a = dx * dx + dy * dy;
  if (a == 0) return from;
  const double b = 2 * (fx * dx + fy * dy);
  const double c = fx * fx + fy * fy - radius * radius;
  const double s = (-b + std::sqrt(std::max(0.0, b * b - 4 * a * c))) / (2 * a);
  return {from.x + clampd(s, 0, 1) * dx, from.y + clampd(s, 0, 1) * dy};
}

// A cut target the viewer was told stands while the walker must leave sight before reaching it. Once the viewer can
// see that spot, or the walker gets there, it no longer says where they stop and is cut again from where both are now.
bool cutTargetStale(const SeenPerson& was, Vec2 walker, Vec2 viewer, double sight) {
  if (!was.target || !was.trueTarget || *was.target == *was.trueTarget) return false;
  return distance(viewer, *was.target) <= sight ||
         distance(walker, *was.trueTarget) <= distance(*was.target, *was.trueTarget);
}

// Whether `id`'s door leads only there. Several flats share a building's front door, and someone watching that door
// sees a person go into the building, not which flat.
bool ownDoor(const ContentDatabase& db, const LocationId& id) {
  const LocationDef* loc = db.location(id);
  if (!loc) return false;
  for (const auto& [otherId, other] : db.locations()) {
    if (otherId != id && other.enterable && other.door == loc->door) return false;
  }
  return true;
}

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
  const CharacterDef& def = *definition(actor);

  Json you = motionJson(seenNow(*c));
  you.erase("inside");  // set below, in its usual place
  you.update(Json{{"id", actor},
                  {"name", def.fullName()},
                  {"inside", c->inside},
                  {"needs", roundedStats(c->needs)},
                  {"emotions", roundedStats(c->emotions)},
                  {"on_shift", c->career.shiftStartedAt.has_value()},
                  {"asleep", c->asleepSince >= 0}});
  // Your own standing with the police (D-069): you'd know you're wanted, and where you're held.
  if (!c->wantedFor.empty()) {
    const CrimeDef* crime = db.crimeDef(c->wantedFor);
    you["wanted_for"] = crime ? crime->label : c->wantedFor;
  }
  if (c->jailedUntil > state_.now) you["jailed_until"] = c->jailedUntil;

  Json people = Json::array();
  for (const auto& [id, o] : state_.characters) {
    if (!inSight(*c, o)) continue;
    Json p = personJson(*c, o);
    p["id"] = p["character"];
    p.erase("character");
    if (c->inside.empty()) p["distance_m"] = std::round(distance(c->position, o.position));
    people.push_back(p);
  }

  Json here = Json::object();
  if (const LocationDef* loc = currentPlace(*c)) {
    // What each offer and activity does is public content, like its price. When an activity can be done again is
    // the viewer's own state (their cooldown there).
    Json offers = Json::array();
    for (const auto& o : loc->offers) {
      offers.push_back(Json{{"id", o.id},
                            {"label", o.label},
                            {"price_cents", o.priceCents},
                            {"needs", o.needEffects},
                            {"emotions", o.emotionEffects}});
      if (o.illegal) offers.back()["illegal"] = true;  // buying it is a crime if the police see (D-069)
    }
    Json activities = Json::array();
    for (const auto& a : loc->activities) {
      const auto ready = c->activityReadyAt.find(loc->id + "/" + a.id);
      const bool cooling = ready != c->activityReadyAt.end() && ready->second > state_.now;
      Json act{{"id", a.id},
               {"label", a.label},
               {"needs", a.needEffects},
               {"emotions", a.emotionEffects},
               {"cooldown_minutes", a.cooldownMinutes},
               {"ready_at", cooling ? Json(ready->second) : Json()},
               {"ready_in_minutes", cooling ? ready->second - state_.now : 0}};
      for (const auto& h : db.leisure().activityHours) {  // some can only be done at some hours (stargazing)
        if (h.place == loc->id && h.activity == a.id) act["hours"] = Json::array({h.hours.openHour, h.hours.closeHour});
      }
      activities.push_back(std::move(act));
    }
    here = Json{{"id", loc->id}, {"name", loc->name}, {"type", loc->type}, {"description", loc->description},
                {"status", locationStatus(*loc)}, {"offers", offers}, {"activities", activities}, {"stage", loc->stage}};
    if (Json room = roomView(*c); !room.is_null()) here["room"] = room;  // interiors: the room and who's where (D-066)
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
    // Opening hours are public: [open, close) with a close before the open running past midnight, and the
    // weekdays it opens (0 = Monday; empty = every day). null hours = never closes.
    places.push_back(Json{{"id", id},
                          {"name", loc.name},
                          {"type", loc.type},
                          {"district", loc.district},
                          {"door", {loc.door.x, loc.door.y}},
                          {"enterable", loc.enterable},
                          {"status", locationStatus(loc)},
                          {"hours", loc.hours ? Json::array({loc.hours->openHour, loc.hours->closeHour}) : Json()},
                          {"open_days", loc.hours ? Json(loc.hours->days) : Json::array()},
                          {"stage", loc.stage}});  // performers can play here (perform)
  }
  const SimulationConfig& sim = content_->sim();
  Json lines = Json::array();
  for (const auto& line : content_->transit().lines) {
    Json stops = Json::array();
    for (const auto& st : line.stops)
      stops.push_back(Json{{"id", st.id}, {"name", st.name}, {"at", {st.at.x, st.at.y}}});
    lines.push_back(Json{{"id", line.id},
                         {"name", line.name},
                         {"fare_cents", line.fareCents},
                         {"speed_mps", line.speedMps},
                         {"first_hour", line.firstHour},
                         {"last_hour", line.lastHour},
                         {"stops", stops}});
  }
  Json interactions = Json::array();
  for (const auto& [id, i] : content_->interactions())
    interactions.push_back(Json{{"id", id}, {"label", i.label}, {"range_m", i.rangeMeters}});
  return Json{{"bounds", {{"min", {sim.worldMin.x, sim.worldMin.y}}, {"max", {sim.worldMax.x, sim.worldMax.y}}}},
              {"places", places},
              {"rules", publicRules()},
              {"transit", {{"lines", lines}}},
              {"interactions", interactions}};
}

Json World::publicRules() const {
  const SimulationConfig& sim = content_->sim();
  return Json{{"whisper_range_m", sim.whisperRangeMeters},
              {"say_range_m", sim.hearingRangeMeters},
              {"shout_range_m", sim.shoutRangeMeters},
              {"sight_range_m", sim.sightRangeMeters},
              {"walk_speed_mps", sim.walkSpeedMetersPerSecond},
              {"minutes_per_real_second", sim.minutesPerRealSecond},
              {"entry_radius_m", sim.entryRadiusMeters},
              {"boarding_radius_m", content_->transit().boardingRadiusMeters}};
}

// ---------------------------------------------------------------------------------
// The people stream. Clients predict straight-line motion, so the server only speaks when a
// prediction would go wrong: someone comes into or out of sight, starts, stops, turns, boards,
// is labelled differently, or is moved while standing still.
// ---------------------------------------------------------------------------------
bool World::inSight(const CharacterState& viewer, const CharacterState& other) const {
  if (other.id == viewer.id || !other.online) return false;
  if (!viewer.inside.empty()) return other.inside == viewer.inside;
  return other.inside.empty() && distance(viewer.position, other.position) <= content_->sim().sightRangeMeters;
}

SeenPerson World::seenNow(const CharacterState& c) const {
  SeenPerson m;
  m.inside = c.inside;
  m.position = c.position;
  // Only outdoors does a move target move anyone (advanceRealTime), so only then is it motion.
  if (c.moveTarget && c.inside.empty()) {
    m.target = m.trueTarget = c.moveTarget;
    m.speedMps = c.moveSpeedMps > 0 ? c.moveSpeedMps : content_->sim().walkSpeedMetersPerSecond;
  }
  m.bus = c.moveSpeedMps > 0;
  m.scripted = isScripted(c.id);
  if (onDutyPolice(c)) m.uniform = "police";
  return m;
}

SeenPerson World::seenBy(const CharacterState& viewer, const CharacterState& other) const {
  SeenPerson m = seenNow(other);
  if (other.id == viewer.id || !m.target) return m;
  // A character sees which way someone is heading, not where they'll stop once out of sight: a far door or the stop a
  // bus rider gets off at stays theirs.
  const double reach = content_->sim().sightRangeMeters + kSightCutMarginMeters;
  if (distance(viewer.position, *m.target) > reach)
    m.target = leaveCircle(viewer.position, reach, m.position, *m.target);
  return m;
}

Json World::personJson(const CharacterState& viewer, const CharacterState& other) const {
  const CharacterDef* od = definition(other.id);
  const RelationshipState* rel = relationship(viewer.id, other.id);
  const bool self = other.id == viewer.id;
  Json p{{"character", other.id},
         {"name", od ? od->fullName() : other.id},
         {"known", self || (rel && rel->firstMetAt >= 0)},
         {"scripted", isScripted(other.id)}};
  if (isScripted(other.id)) p["played_by"] = playedBy(other.id);  // "script" (a bot_ account) or "autopilot"
  // A police officer on duty is in uniform: anyone who can see them can tell (D-069). Off duty (no key) they look
  // like anyone; each `people` entry is whole, so a client clears it when the key is missing.
  if (onDutyPolice(other)) p["uniform"] = "police";
  p.update(motionJson(seenBy(viewer, other)));
  return p;
}

void World::emitPeopleChanges() {
  // Viewers who left are dropped in disconnect(); this catches any that went offline another way.
  std::erase_if(seen_, [&](const auto& kv) {
    const CharacterState* v = character(kv.first);
    return !v || !v->online;
  });
  const double sight = content_->sim().sightRangeMeters;
  for (const auto& [viewerId, viewer] : state_.characters) {
    if (!viewer.online) continue;
    auto& seen = seen_[viewerId];
    Json changes = Json::array();
    // You first, then everyone in sight in id order, then whoever dropped out of sight.
    std::vector<const CharacterState*> visible{&viewer};
    std::set<CharacterId> visibleIds{viewerId};
    for (const auto& [id, o] : state_.characters) {
      if (!inSight(viewer, o)) continue;
      visible.push_back(&o);
      visibleIds.insert(id);
    }
    for (const CharacterState* o : visible) {
      const SeenPerson now = seenBy(viewer, *o);
      auto it = seen.find(o->id);
      bool changed = it == seen.end();
      if (!changed) {
        // Real destinations are compared: a cut target shifts whenever the viewer moves, and that alone isn't news.
        const SeenPerson& was = it->second;
        changed = now.inside != was.inside || !sameTarget(now.trueTarget, was.trueTarget) ||
                  now.speedMps != was.speedMps || now.bus != was.bus || now.scripted != was.scripted || now.uniform != was.uniform ||
                  (!now.target && distance(now.position, was.position) > kStillMoveThreshold) ||
                  cutTargetStale(was, now.position, viewer.position, sight);
      }
      if (!changed) continue;
      Json entry = personJson(viewer, *o);
      entry["self"] = o == &viewer;
      entry["state"] = "here";
      changes.push_back(std::move(entry));
      seen[o->id] = now;
    }
    for (auto it = seen.begin(); it != seen.end();) {
      if (visibleIds.count(it->first)) {
        ++it;
        continue;
      }
      const SeenPerson& was = it->second;
      const CharacterState* o = character(it->first);
      Json gone{{"character", it->first}, {"state", "gone"}};
      if (!o || !o->online) {
        gone["reason"] = "left_world";
      } else if (o->inside == was.inside) {
        gone["reason"] = "out_of_sight";  // they're where they were; one of you walked or stepped out of view
      } else if (viewer.inside.empty() && was.inside.empty() && distance(viewer.position, o->position) <= sight) {
        // Entering puts you at the door, and the viewer can see that door: they watched them go in. Through a door
        // several homes share, that's all they saw.
        gone["reason"] = "went_inside";
        if (ownDoor(*content_, o->inside)) gone["location"] = o->inside;
      } else if (!viewer.inside.empty() && was.inside == viewer.inside && o->inside.empty()) {
        gone["reason"] = "went_outside";
      } else {
        gone["reason"] = "moved_away";  // taken somewhere the viewer can't see (jail, the ER, a new home)
      }
      changes.push_back(std::move(gone));
      it = seen.erase(it);
    }
    if (!changes.empty()) emit({viewerId}, "people", Json{{"changes", std::move(changes)}});
  }
}

Json World::characterCard(const CharacterId& id) const {
  const CharacterDef* def = definition(id);
  if (!def) return Json();
  const CharacterState* c = character(id);
  // Their job and home as they are now (people change jobs and move house), else as content founded them.
  const CareerDef* career = content_->career(c ? c->career.careerId : def->careerId);
  const int level = c ? c->career.level : def->careerLevel;
  const bool hasLevel = career && level >= 0 && level < static_cast<int>(career->levels.size());
  LocationId homeAt = def->spawnLocation;
  if (const PropertyState* home = homeOf(id)) {
    if (const PropertyDef* pd = content_->property(home->id)) homeAt = pd->location;
  } else if (c) {
    homeAt.clear();  // in the world with nowhere to live
  }
  const LocationDef* homeLoc = content_->location(homeAt);
  const LocationDef* work =
      career && !career->workplaces.empty() ? content_->location(career->workplaces.front()) : nullptr;
  return Json{{"id", id},
              {"name", def->fullName()},
              {"age", def->age},
              {"pronouns", def->pronouns},
              {"career", hasLevel ? career->levels.at(static_cast<std::size_t>(level)).title : ""},
              {"tagline", def->profile.value("tagline", "")},
              {"home", homeLoc ? Json(homeLoc->name) : Json()},
              {"workplace", work ? Json(work->name) : Json()},
              // Who they are to the town (D-073): founder, resident, townsperson; "created" for one made in this save.
              {"cast", def->cast.empty() ? "created" : def->cast}};
}

Json World::playableCharacters() const {
  Json out = Json::array();
  for (const auto& [id, def] : content_->characters()) {
    if (def.playable) out.push_back(characterCard(id));
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
    const CharacterDef* od = definition(key.second);
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
  const CharacterDef* def = definition(c.id);
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
  const PropertyState* home = homeOf(c.id);
  for (const auto& [pid, p] : state_.properties) {
    // Where you live, and homes you own (alone or together; phone homes has the mortgage).
    const bool owner = std::find(p.owners.begin(), p.owners.end(), c.id) != p.owners.end();
    if (&p != home && !owner) continue;
    const char* tenure = owner ? (p.owners.size() > 1 ? "co-owner" : "owner")
                               : (p.owners.empty() ? "renting" : "living with the owner");
    const PropertyDef* pd = content_->property(pid);
    const LocationDef* loc = content_->location(pd->location);
    homes.push_back(Json{{"id", pid},
                         {"location", pd->location},
                         {"name", loc ? loc->name : pd->location},
                         {"type", pd->type},
                         {"tenure", tenure},
                         {"lives_here", &p == home},
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
