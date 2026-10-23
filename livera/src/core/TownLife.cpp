// Town life (D-073): the content that lets the town's people live it on autopilot. Evenings out
// (data/society/town_life.json `evening_plans`) and patrols (`patrols`) are read here and used by the autopilot
// (core/Autopilot.cpp); the cast checks (who is a founder, resident or townsperson, homes shared by data characters,
// partners who start together) live here too because they are about the same people.

#include <algorithm>
#include <cctype>
#include <map>
#include <set>
#include <string>

#include "core/Clock.h"
#include "core/Content.h"
#include "core/ContentParse.h"
#include "core/Schedule.h"

namespace livera {

using namespace content_parse;

namespace {

Status onlyTownKeys(const Json& j, const std::set<std::string>& allowed, const std::string& where) {
  if (!j.is_object()) return fail("content_invalid", where + " must be an object");
  for (const auto& [k, v] : j.items()) {
    if (k != "$comment" && !allowed.count(k)) return fail("content_invalid", where + ": unknown key '" + k + "'");
  }
  return okStatus();
}

// "monday" -> 0 ... "sunday" -> 6; -1 otherwise.
int weekdayIndex(const std::string& name) {
  for (int d = 0; d < 7; ++d) {
    std::string w;
    for (const char* ch = weekdayName(d); *ch; ++ch) w += static_cast<char>(std::tolower(static_cast<unsigned char>(*ch)));
    if (w == name) return d;
  }
  return -1;
}

}  // namespace

Status ContentDatabase::ingestTownLife(const std::string& source, const std::string& section, const Json& body,
                                       bool& handled) {
  handled = section == "evening_plans" || section == "patrols";
  if (!handled) return okStatus();
  try {
    if (!body.is_array()) return fail("content_invalid", source + ": '" + section + "' must be a list");
    if (section == "evening_plans") {
      if (haveEvenings_) return fail("content_duplicate", source + ": 'evening_plans' defined twice");
      haveEvenings_ = true;
      for (const auto& j : body) {
        const std::string where = source + ": evening plan " + j.value("id", std::string("?"));
        if (auto st = onlyTownKeys(j, {"id", "label", "place", "activity", "offer", "days", "from", "minutes", "who",
                                       "with", "min_friendship", "chance"}, where);
            !st)
          return st;
        EveningPlanDef e;
        e.id = j.at("id").get<std::string>();
        e.label = j.value("label", "");
        e.place = j.at("place").get<std::string>();
        e.activity = j.value("activity", "");
        e.offer = j.value("offer", "");
        for (const auto& d : readStrings(j, "days")) {
          const int idx = weekdayIndex(d);
          if (idx < 0) return fail("content_invalid", where + ": unknown day '" + d + "' (monday to sunday)");
          e.days.push_back(idx);
        }
        e.from = schedule::minuteOfDay(j.at("from").get<std::string>());
        if (e.from < 0) return fail("content_invalid", where + ": 'from' is a time like 19:30");
        e.minutes = j.value("minutes", e.minutes);
        const Json who = j.value("who", Json::object());
        if (auto st = onlyTownKeys(who, {"personality_min", "values_min", "interests_any"}, where + ".who"); !st) return st;
        e.personalityMin = readStats(who, "personality_min");
        e.valuesMin = readStats(who, "values_min");
        e.interestsAny = readStrings(who, "interests_any");
        e.with = j.value("with", "");
        e.minFriendship = j.value("min_friendship", 0.0);
        e.chance = j.at("chance").get<double>();
        townLife_.evenings.push_back(std::move(e));
      }
    } else {
      if (havePatrols_) return fail("content_duplicate", source + ": 'patrols' defined twice");
      havePatrols_ = true;
      for (const auto& j : body) {
        const std::string where = source + ": patrol for " + j.value("career", std::string("?"));
        if (auto st = onlyTownKeys(j, {"career", "base", "beat", "every_minutes", "stops", "linger_minutes"}, where); !st)
          return st;
        PatrolDef p;
        p.career = j.at("career").get<std::string>();
        p.base = j.at("base").get<std::string>();
        p.beat = readStrings(j, "beat");
        p.everyMinutes = j.value("every_minutes", p.everyMinutes);
        p.stops = j.value("stops", p.stops);
        p.lingerMinutes = j.value("linger_minutes", p.lingerMinutes);
        townLife_.patrols.push_back(std::move(p));
      }
    }
  } catch (const std::exception& e) {
    return fail("content_invalid", source + ": " + section + ": " + e.what());
  }
  return okStatus();
}

Status ContentDatabase::validateTownLife() const {
  const std::set<std::string> traits(sim_.personalityTraits.begin(), sim_.personalityTraits.end());
  const std::set<std::string> values(sim_.values.begin(), sim_.values.end());
  const std::set<std::string> interests(creator_.interests.options.begin(), creator_.interests.options.end());
  std::set<std::string> ids;
  for (const auto& e : townLife_.evenings) {
    const std::string where = "evening plan " + e.id;
    if (e.id.empty() || !ids.insert(e.id).second) return fail("content_duplicate", where + ": a unique id is needed");
    if (e.label.empty()) return fail("content_invalid", where + ": needs a label");
    const LocationDef* loc = location(e.place);
    if (!loc) return fail("content_invalid", where + ": unknown place '" + e.place + "'");
    // An evening out is somewhere anyone may go: not someone's home or a staff-only office.
    if (loc->access != AccessRule::Public) return fail("content_invalid", where + ": " + e.place + " isn't public");
    if (!e.activity.empty() && std::none_of(loc->activities.begin(), loc->activities.end(),
                                            [&](const Activity& a) { return a.id == e.activity; }))
      return fail("content_invalid", where + ": " + e.place + " has no activity '" + e.activity + "'");
    if (!e.offer.empty()) {
      const auto o = std::find_if(loc->offers.begin(), loc->offers.end(), [&](const Offer& x) { return x.id == e.offer; });
      if (o == loc->offers.end()) return fail("content_invalid", where + ": " + e.place + " has no offer '" + e.offer + "'");
      if (o->illegal) return fail("content_invalid", where + ": an evening out never buys contraband");
    }
    if (e.days.empty()) return fail("content_invalid", where + ": needs days");
    if (std::set<int>(e.days.begin(), e.days.end()).size() != e.days.size())
      return fail("content_invalid", where + ": a day is listed twice");
    if (e.minutes < 30 || e.minutes > 240) return fail("content_invalid", where + ": minutes are 30-240");
    // Out after dinner and home by bedtime: the autopilot's people leave the world at night (D-050).
    if (e.from < 17 * 60 || e.from + e.minutes > 24 * 60)
      return fail("content_invalid", where + ": an evening starts from 17:00 and ends by midnight");
    if (auto s = checkKeys(e.personalityMin, traits, where + " who.personality_min"); !s) return s;
    if (auto s = checkKeys(e.valuesMin, values, where + " who.values_min"); !s) return s;
    for (const auto& i : e.interestsAny) {
      if (!interests.empty() && !interests.count(i))
        return fail("content_invalid", where + ": unknown interest '" + i + "' (the creator's list)");
    }
    if (e.with != "" && e.with != "friend" && e.with != "partner")
      return fail("content_invalid", where + ": 'with' is friend or partner");
    if (e.with != "friend" && e.minFriendship != 0)
      return fail("content_invalid", where + ": min_friendship is for an evening with a friend");
    if (e.minFriendship < 0 || e.minFriendship > 100) return fail("content_invalid", where + ": min_friendship is 0-100");
    if (e.chance <= 0 || e.chance > 1) return fail("content_invalid", where + ": chance is above 0 and at most 1");
  }
  std::set<std::string> careers;
  for (const auto& p : townLife_.patrols) {
    const std::string where = "patrol for " + p.career;
    const CareerDef* c = career(p.career);
    if (!c) return fail("content_invalid", where + ": unknown career");
    if (!careers.insert(p.career).second) return fail("content_duplicate", where + ": one patrol per career");
    // Only a shift that carries on outside its workplace can walk a beat (World::exitBuilding ends any other).
    if (!c->worksOutdoors) return fail("content_invalid", where + ": the career doesn't work outdoors");
    if (std::find(c->workplaces.begin(), c->workplaces.end(), p.base) == c->workplaces.end())
      return fail("content_invalid", where + ": base '" + p.base + "' isn't one of its workplaces");
    if (p.beat.size() < 2) return fail("content_invalid", where + ": a beat needs two places");
    for (const auto& b : p.beat) {
      const LocationDef* loc = location(b);
      if (!loc) return fail("content_invalid", where + ": unknown place '" + b + "'");
      if (loc->access != AccessRule::Public) return fail("content_invalid", where + ": " + b + " isn't public");
    }
    if (p.everyMinutes < 15 || p.stops < 1 || p.lingerMinutes < 1)
      return fail("content_invalid", where + ": every_minutes is at least 15, stops and linger_minutes at least 1");
  }
  return okStatus();
}

const PatrolDef* ContentDatabase::patrolFor(const std::string& careerId) const {
  for (const auto& p : townLife_.patrols) {
    if (p.career == careerId) return &p;
  }
  return nullptr;
}

Status ContentDatabase::validateCast() const {
  std::map<std::string, std::vector<CharacterId>> homes;
  for (const auto& [id, c] : characters_) {
    const std::string where = "character " + id;
    if (c.cast != "founder" && c.cast != "resident" && c.cast != "townsperson")
      return fail("content_invalid", where + ": cast is founder, resident or townsperson");
    homes[c.homeProperty].push_back(id);
    for (const auto& r : c.relationships) {
      if (r.status.empty()) continue;
      if (r.status != "dating" && r.status != "engaged" && r.status != "married")
        return fail("content_invalid", where + ": relationship status is dating, engaged or married");
      // A status is the same on both sides (World's RelationshipState): the other character must say it too.
      const CharacterDef* other = character(r.to);
      const auto back = other ? std::find_if(other->relationships.begin(), other->relationships.end(),
                                             [&](const StartingRelationship& x) { return x.to == id; })
                              : std::vector<StartingRelationship>::const_iterator();
      if (!other || back == other->relationships.end() || back->status != r.status)
        return fail("content_invalid", where + ": " + r.to + " must name the same status back");
    }
  }
  // People who start in one home share it as residents; it must have the room (bedrooms x residents_per_bedroom).
  for (const auto& [pid, who] : homes) {
    if (who.size() < 2) continue;
    const PropertyDef* p = property(pid);
    if (!p) continue;  // validateCharacter reports it
    const int capacity = std::max(1, p->bedrooms) * homes_.residentsPerBedroom;
    if (static_cast<int>(who.size()) > capacity)
      return fail("content_invalid", "property " + pid + " is home to " + std::to_string(who.size()) +
                                         " characters but sleeps " + std::to_string(capacity));
    if (p->forSale) return fail("content_invalid", "property " + pid + ": a home for sale can't be a starting home");
  }
  return okStatus();
}

}  // namespace livera
