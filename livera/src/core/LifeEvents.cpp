// Life events (D-068): BitLife-style moments that happen to you. Data in data/events/*.json: a prompt, the
// conditions under which it can come up (only what the World knows about you right then), and two to four choices,
// each with outcomes applied through the World's own rules: needs and emotions, your side of a relationship with the
// person in the event and theirs toward you, money only through Ledger::transfer, a memory, fame. A few a day come
// up at sensible moments; which one is a pure draw (a hash of character, day and slot over the eligible pool, as
// work decisions are, D-037), and a chance outcome rolls the world's saved random stream. What has come up and not
// been answered is saved (character key `events`) until it lapses. The phone app `story` is your life from your
// own memories, answered events among them.
#include <algorithm>
#include <cmath>
#include <set>

#include "core/Clock.h"
#include "core/Content.h"
#include "core/ContentParse.h"
#include "core/DayHash.h"
#include "core/Parts.h"
#include "core/World.h"

namespace livera {

using namespace content_parse;

namespace {

using dayhash::dayKey;

const std::set<std::string> kCategories{"work", "money", "love", "friends", "family", "health", "town", "temptation", "street"};
const std::set<std::string> kWith{"anyone", "known", "stranger", "coworker", "partner", "ex"};
const std::set<std::string> kHome{"renting", "owns", "none"};
const std::set<std::string> kPartner{"dating", "engaged", "married"};
const std::set<std::string> kEx{"ex", "divorced"};
const std::set<std::string> kPlaceholders{"{name}", "{founder}", "{place}"};
constexpr const char* kEconomy = "sys:economy";
constexpr const char* kLedgerKind = "life_event";
constexpr double kStatMin = 0;
constexpr double kStatMax = 100;

bool has(const std::vector<std::string>& v, const std::string& x) { return std::find(v.begin(), v.end(), x) != v.end(); }

// Content is strict: a key the loader doesn't know is a typo that would silently do nothing.
Status onlyKeys(const Json& j, const std::set<std::string>& allowed, const std::string& where) {
  if (!j.is_object()) return fail("content_invalid", where + " must be an object");
  for (const auto& [k, v] : j.items()) {
    if (k != "$comment" && !allowed.count(k)) return fail("content_invalid", where + ": unknown key '" + k + "'");
  }
  return okStatus();
}

std::optional<bool> readFlag(const Json& j, const char* key) {
  if (!j.contains(key)) return std::nullopt;
  return j.at(key).get<bool>();
}

std::string replaceAll(std::string s, const std::string& from, const std::string& to) {
  for (std::size_t at = s.find(from); at != std::string::npos; at = s.find(from, at + to.size())) s.replace(at, from.size(), to);
  return s;
}

// Every {...} in a text is one the World fills in, and the event says who it is.
Status checkPlaceholders(const std::string& text, const LifeEventWhenDef& w, const std::string& where) {
  for (std::size_t at = text.find('{'); at != std::string::npos; at = text.find('{', at + 1)) {
    const std::size_t end = text.find('}', at);
    const std::string token = end == std::string::npos ? text.substr(at) : text.substr(at, end - at + 1);
    if (!kPlaceholders.count(token)) return fail("content_invalid", where + ": unknown placeholder " + token);
    if (token == "{name}" && w.with.empty()) return fail("content_invalid", where + ": {name} needs when.with");
    if (token == "{founder}" && w.founder.empty()) return fail("content_invalid", where + ": {founder} needs when.founder");
  }
  return okStatus();
}

// The most a choice can take from you: checked before it's answered, so an outcome never finds you short.
Cents worstCost(const LifeEventChoiceDef& ch) {
  Cents worst = 0;
  for (const auto& o : ch.outcomes) {
    if (o.money && o.money->cents < 0) worst = std::max(worst, -o.money->cents);
  }
  return worst;
}

std::string costVia(const LifeEventChoiceDef& ch) {
  for (const auto& o : ch.outcomes) {
    if (o.money && o.money->cents < 0) return o.money->via;
  }
  return "bank";
}

double round1(double v) { return std::round(v * 10) / 10; }

}  // namespace

// ---- Content -------------------------------------------------------------------------------
Status ContentDatabase::ingestLifeEvents(const std::string& source, const std::string& section, const Json& body,
                                         bool& handled) {
  handled = section == "life_events" || section == "events";
  if (!handled) return okStatus();
  try {
    if (section == "life_events") {
      if (haveLifeEvents_) return fail("content_duplicate", source + ": 'life_events' defined twice");
      haveLifeEvents_ = true;
      if (auto st = onlyKeys(body, {"per_day", "hours", "min_gap_minutes", "check_every_minutes", "lapse_minutes",
                                    "memory_importance"}, "life_events");
          !st)
        return fail(st.error().code, source + ": " + st.error().message);
      LifeEventsConfig& E = lifeEvents_;
      E.perDay = body.value("per_day", E.perDay);
      if (body.contains("hours")) E.hours = OpeningHours{body.at("hours").at(0).get<int>(), body.at("hours").at(1).get<int>(), {}};
      E.minGapMinutes = body.value("min_gap_minutes", E.minGapMinutes);
      E.checkEveryMinutes = body.value("check_every_minutes", E.checkEveryMinutes);
      E.lapseMinutes = body.value("lapse_minutes", E.lapseMinutes);
      E.memoryImportance = body.value("memory_importance", E.memoryImportance);
      return okStatus();
    }
    if (!body.is_array()) return fail("content_invalid", source + ": 'events' must be a list");
    for (const auto& j : body) {
      LifeEventDef d;
      d.id = j.at("id").get<std::string>();
      const std::string where = source + ": event " + d.id;
      if (auto st = onlyKeys(j, {"id", "category", "title", "prompt", "when", "weight", "cooldown_days", "lapse_minutes",
                                 "choices"}, where);
          !st)
        return st;
      d.category = j.at("category").get<std::string>();
      d.title = j.at("title").get<std::string>();
      d.prompt = j.at("prompt").get<std::string>();
      d.weight = j.value("weight", d.weight);
      d.cooldownDays = j.value("cooldown_days", d.cooldownDays);
      d.lapseMinutes = j.value("lapse_minutes", d.lapseMinutes);
      const Json w = j.value("when", Json::object());
      if (auto st = onlyKeys(w, {"outside", "place_types", "places", "hours", "weekdays", "age", "has_career", "careers",
                                 "on_shift", "relationship", "money_at_least_cents", "money_below_cents", "fame_tiers",
                                 "has_pet", "has_kids", "has_record", "with", "founder", "weather", "home"},
                          where + " when");
          !st)
        return st;
      LifeEventWhenDef& W = d.when;
      W.outside = readFlag(w, "outside");
      W.placeTypes = readStrings(w, "place_types");
      W.places = readStrings(w, "places");
      if (w.contains("hours")) W.hours = OpeningHours{w.at("hours").at(0).get<int>(), w.at("hours").at(1).get<int>(), {}};
      W.weekdays = readInts(w, "weekdays");
      if (w.contains("age")) {
        W.minAge = w.at("age").at(0).get<int>();
        W.maxAge = w.at("age").at(1).get<int>();
      }
      W.hasCareer = readFlag(w, "has_career");
      W.careers = readStrings(w, "careers");
      W.onShift = w.value("on_shift", false);
      W.relationship = w.value("relationship", "");
      W.moneyAtLeast = w.value("money_at_least_cents", Cents{-1});
      W.moneyBelow = w.value("money_below_cents", Cents{-1});
      W.fameTiers = readStrings(w, "fame_tiers");
      W.hasPet = readFlag(w, "has_pet");
      W.hasKids = readFlag(w, "has_kids");
      W.hasRecord = readFlag(w, "has_record");
      W.with = w.value("with", "");
      W.founder = w.value("founder", "");
      W.weather = readStrings(w, "weather");
      W.home = w.value("home", "");
      for (const auto& c : j.at("choices")) {
        if (auto st = onlyKeys(c, {"label", "outcomes"}, where + " choice"); !st) return st;
        LifeEventChoiceDef ch;
        ch.label = c.at("label").get<std::string>();
        for (const auto& o : c.at("outcomes")) {
          if (auto st = onlyKeys(o, {"chance", "text", "needs", "emotions", "relationship", "money", "memory", "fame"},
                                 where + " outcome");
              !st)
            return st;
          LifeEventOutcomeDef out;
          out.chance = o.value("chance", 1.0);
          out.text = o.at("text").get<std::string>();
          out.needs = readStats(o, "needs");
          out.emotions = readStats(o, "emotions");
          if (o.contains("relationship")) {
            const Json& r = o.at("relationship");
            if (auto st = onlyKeys(r, {"you", "them", "reaction"}, where + " relationship"); !st) return st;
            out.you = readStats(r, "you");
            out.them = readStats(r, "them");
            out.reaction = r.value("reaction", "");
          }
          if (o.contains("money")) {
            const Json& m = o.at("money");
            if (auto st = onlyKeys(m, {"cents", "account", "via"}, where + " money"); !st) return st;
            out.money = LifeEventMoneyDef{m.at("cents").get<Cents>(), m.at("account").get<std::string>(), m.value("via", "bank")};
          }
          if (o.contains("memory")) {
            const Json& m = o.at("memory");
            if (auto st = onlyKeys(m, {"text", "impact", "importance"}, where + " memory"); !st) return st;
            out.memory = m.at("text").get<std::string>();
            out.memoryImpact = m.value("impact", 0);
            out.memoryImportance = m.value("importance", -1);
          }
          out.fame = o.value("fame", 0.0);
          ch.outcomes.push_back(std::move(out));
        }
        d.choices.push_back(std::move(ch));
      }
      const std::string id = d.id;
      if (auto st = insertUnique(lifeEventDefs_, "life event", id, std::move(d)); !st)
        return fail(st.error().code, source + ": " + st.error().message);
    }
  } catch (const std::exception& e) {
    return fail("content_invalid", source + ": " + e.what());
  }
  return okStatus();
}

Status ContentDatabase::validateLifeEvents() const {
  const LifeEventsConfig& E = lifeEvents_;
  auto bad = [](const std::string& m) { return fail("content_invalid", m); };
  if (E.perDay < 1 || E.perDay > 10) return bad("life_events.per_day must be 1 to 10");
  if (E.hours.openHour < 0 || E.hours.openHour > 24 || E.hours.closeHour < 0 || E.hours.closeHour > 24)
    return bad("life_events.hours must be [from, to) between 0 and 24");
  if (E.minGapMinutes < 0) return bad("life_events.min_gap_minutes can't be negative");
  if (E.checkEveryMinutes < 1 || E.checkEveryMinutes > 60) return bad("life_events.check_every_minutes must be 1 to 60");
  if (E.lapseMinutes < 1) return bad("life_events.lapse_minutes must be at least 1");
  if (E.memoryImportance < 0 || E.memoryImportance > 100) return bad("life_events.memory_importance must be 0 to 100");
  if (!lifeEventDefs_.empty() && !haveLifeEvents_) return bad("events need a 'life_events' section");

  std::set<std::string> needs, emotions(sim_.emotions.begin(), sim_.emotions.end()),
      dims(sim_.relationshipDimensions.begin(), sim_.relationshipDimensions.end()), orgs, types, tiers, weather;
  for (const auto& n : sim_.needs) needs.insert(n.id);
  for (const auto& o : orgAccounts_) orgs.insert(o.id);
  for (const auto& [id, l] : locations_) types.insert(l.type);
  for (const auto& t : fame_.tiers) tiers.insert(t.id);
  for (const auto& k : details_.weatherKinds) weather.insert(k.id);

  for (const auto& [id, e] : lifeEventDefs_) {
    const std::string where = "event " + id;
    const LifeEventWhenDef& w = e.when;
    if (id.empty()) return bad("an event needs an id");
    if (!kCategories.count(e.category)) return bad(where + ": unknown category '" + e.category + "'");
    if (e.title.empty() || e.prompt.empty()) return bad(where + ": needs a title and a prompt");
    if (!(e.weight > 0)) return bad(where + ": weight must be above 0");
    if (e.cooldownDays < 0) return bad(where + ": cooldown_days can't be negative");
    if (e.lapseMinutes != -1 && e.lapseMinutes < 1) return bad(where + ": lapse_minutes must be at least 1");
    // When: only what the World knows, named as content names it.
    for (const auto& t : w.placeTypes) {
      if (!types.count(t)) return bad(where + ": unknown place type '" + t + "'");
    }
    for (const auto& p : w.places) {
      if (!location(p)) return bad(where + ": unknown place '" + p + "'");
    }
    if (w.hours && (w.hours->openHour < 0 || w.hours->openHour > 24 || w.hours->closeHour < 0 || w.hours->closeHour > 24))
      return bad(where + ": hours must be between 0 and 24");
    for (int d : w.weekdays) {
      if (d < 0 || d > 6) return bad(where + ": weekdays are 0 (Monday) to 6");
    }
    if (w.minAge > w.maxAge || (w.minAge != -1 && w.minAge < 0)) return bad(where + ": age must be [min, max]");
    for (const auto& c : w.careers) {
      if (!career(c)) return bad(where + ": unknown career '" + c + "'");
    }
    if (!w.relationship.empty() && w.relationship != "single" && w.relationship != "partnered")
      return bad(where + ": relationship is single or partnered");
    for (const auto& t : w.fameTiers) {
      if (!tiers.count(t)) return bad(where + ": unknown fame tier '" + t + "'");
    }
    if (!w.with.empty() && !kWith.count(w.with)) return bad(where + ": unknown with '" + w.with + "'");
    if (!w.founder.empty() && !characters_.count(w.founder)) return bad(where + ": unknown founder '" + w.founder + "'");
    if (!w.with.empty() && !w.founder.empty()) return bad(where + ": an event is with someone or with a founder, not both");
    for (const auto& k : w.weather) {
      if (!weather.count(k)) return bad(where + ": unknown weather '" + k + "'");
    }
    if (!w.home.empty() && !kHome.count(w.home)) return bad(where + ": home is renting, owns or none");
    if (w.moneyAtLeast >= 0 && w.moneyBelow >= 0 && w.moneyBelow <= w.moneyAtLeast)
      return bad(where + ": money_below_cents must be above money_at_least_cents");
    if (auto st = checkPlaceholders(e.prompt, w, where + " prompt"); !st) return st;
    // Choices and what they do.
    if (e.choices.size() < 2 || e.choices.size() > 4) return bad(where + ": needs two to four choices");
    std::set<std::string> labels;
    for (const auto& ch : e.choices) {
      if (ch.label.empty()) return bad(where + ": every choice needs a label");
      if (!labels.insert(ch.label).second) return bad(where + ": two choices are labelled '" + ch.label + "'");
      if (ch.outcomes.empty() || ch.outcomes.size() > 4) return bad(where + ": a choice has one to four outcomes");
      double sum = 0;
      for (const auto& o : ch.outcomes) {
        const std::string at = where + " (" + ch.label + ")";
        if (!(o.chance > 0 && o.chance <= 1)) return bad(at + ": an outcome's chance must be above 0 and at most 1");
        sum += o.chance;
        if (o.text.empty()) return bad(at + ": every outcome needs a text");
        if (auto st = checkPlaceholders(o.text, w, at); !st) return st;
        if (auto st = checkPlaceholders(o.memory, w, at + " memory"); !st) return st;
        if (auto st = checkKeys(o.needs, needs, at); !st) return st;
        if (auto st = checkKeys(o.emotions, emotions, at); !st) return st;
        if (auto st = checkKeys(o.you, dims, at); !st) return st;
        if (auto st = checkKeys(o.them, dims, at); !st) return st;
        if ((!o.you.empty() || !o.them.empty() || !o.reaction.empty()) && w.with.empty() && w.founder.empty())
          return bad(at + ": relationship effects need someone in the event (when.with or when.founder)");
        if (o.memoryImpact < -100 || o.memoryImpact > 100) return bad(at + ": memory impact must be -100 to 100");
        if (o.memoryImportance != -1 && (o.memoryImportance < 0 || o.memoryImportance > 100))
          return bad(at + ": memory importance must be 0 to 100");
        if (o.fame < -5 || o.fame > 5) return bad(at + ": fame must be -5 to 5");
        if (o.money) {
          const LifeEventMoneyDef& m = *o.money;
          if (m.cents == 0) return bad(at + ": money needs cents (+ paid to you, - paid by you)");
          if (m.via != "cash" && m.via != "bank") return bad(at + ": money goes via cash or bank");
          if (m.account == "employer") {
            if (!w.onShift && w.hasCareer != true && w.careers.empty())
              return bad(at + ": an `employer` account needs an event about work (on_shift, has_career or careers)");
          } else if (m.account == "landlord") {
            if (w.home != "renting") return bad(at + ": a `landlord` account needs when.home renting");
          } else if (m.account == "here") {
            if (w.places.empty() && w.placeTypes.empty()) return bad(at + ": a `here` account needs places or place_types");
            for (const auto& [lid, l] : locations_) {
              const bool matches = has(w.places, lid) || has(w.placeTypes, l.type);
              if (matches && l.revenueAccount.empty()) return bad(at + ": " + lid + " has no revenue_account to be `here`");
            }
          } else if (m.account != kEconomy && !orgs.count(m.account)) {
            return bad(at + ": unknown account '" + m.account + "' (sys:economy, an org account, employer, here or landlord)");
          }
        }
      }
      if (std::abs(sum - 1.0) > 1e-6) return bad(where + " (" + ch.label + "): the outcomes' chances must add up to 1");
    }
  }
  return okStatus();
}

const LifeEventDef* ContentDatabase::lifeEvent(const std::string& id) const {
  const auto it = lifeEventDefs_.find(id);
  return it == lifeEventDefs_.end() ? nullptr : &it->second;
}

// ---- When an event can come up -------------------------------------------------------------
// A moment for a life event: a person (not a script) in the world, grown up, awake, out of a cell, not on a bus,
// not in a study session or a fight. Shifts are the event's call (when.on_shift).
bool World::lifeEventMoment(const CharacterState& c) const {
  if (!c.online || isScripted(c.id) || c.asleepSince >= 0 || c.jailedUntil > state_.now || c.moveSpeedMps > 0 || inBrawl(c.id))
    return false;
  if (c.education.sessionStartedAt) return false;
  if (ageOf(c.id) < content_->life().adultAge) return false;
  for (const auto& f : state_.fights) {
    if (f.attacker == c.id || f.defender == c.id) return false;
  }
  return true;
}

// Whether `e` holds for `c` right now, and who is in it (`with`: picked by a hash from the people who fit).
bool World::lifeEventHolds(const CharacterState& c, const LifeEventDef& e, std::int64_t day, CharacterId& with) const {
  const LifeEventWhenDef& w = e.when;
  with.clear();
  const bool onShift = c.career.shiftStartedAt.has_value();
  if (w.onShift != onShift) return false;
  if (w.outside && *w.outside != c.inside.empty()) return false;
  if (!w.placeTypes.empty() || !w.places.empty()) {
    const LocationDef* here = currentPlace(c);
    if (!here || (!has(w.placeTypes, here->type) && !has(w.places, here->id))) return false;
  }
  const DateTime now = toDateTime(state_.now);
  if (w.hours && !w.hours->isOpenAt(now.hour)) return false;
  if (!w.weekdays.empty() && std::find(w.weekdays.begin(), w.weekdays.end(), now.weekday) == w.weekdays.end()) return false;
  if (w.minAge >= 0) {
    const int age = ageOf(c.id);
    if (age < w.minAge || age > w.maxAge) return false;
  }
  const bool employed = content_->career(c.career.careerId) != nullptr;
  if (w.hasCareer && *w.hasCareer != employed) return false;
  if (!w.careers.empty() && !has(w.careers, c.career.careerId)) return false;
  if (!w.relationship.empty()) {
    bool partnered = false;
    for (const auto& [key, rel] : state_.relationships) {
      if (key.first == c.id && kPartner.count(rel.status)) partnered = true;
    }
    if (partnered != (w.relationship == "partnered")) return false;
  }
  if (w.moneyAtLeast >= 0 || w.moneyBelow >= 0) {
    const Cents money = state_.ledger.balance(bankAccountOf(c.id)) + state_.ledger.balance(cashAccountOf(c.id));
    if (w.moneyAtLeast >= 0 && money < w.moneyAtLeast) return false;
    if (w.moneyBelow >= 0 && money >= w.moneyBelow) return false;
  }
  if (!w.fameTiers.empty()) {
    std::string tier;
    for (const auto& t : content_->fame().tiers) {
      if (c.fame >= t.minFame) tier = t.id;
    }
    if (!has(w.fameTiers, tier)) return false;
  }
  if (w.hasPet) {
    const bool pet = std::any_of(state_.pets.begin(), state_.pets.end(), [&](const auto& kv) { return livesWithPet(c.id, kv.second); });
    if (pet != *w.hasPet) return false;
  }
  if (w.hasKids && childrenOf(c.id).empty() == *w.hasKids) return false;
  if (w.hasRecord && c.record.empty() == *w.hasRecord) return false;
  if (!w.weather.empty() && (state_.details.weatherDay < 0 || !has(w.weather, weatherToday().kind))) return false;
  if (!w.home.empty()) {
    const PropertyState* home = homeOf(c.id);
    const bool owns = home && std::find(home->owners.begin(), home->owners.end(), c.id) != home->owners.end();
    const PropertyDef* pd = home ? content_->property(home->id) : nullptr;
    const bool renting = home && home->owners.empty() && pd && pd->rentMonthlyCents > 0 && !home->ownerAccount.empty();
    if ((w.home == "renting" && !renting) || (w.home == "owns" && !owns) || (w.home == "none" && home)) return false;
  }
  const double range = content_->sim().hearingRangeMeters;
  if (!w.founder.empty()) {
    const CharacterState* f = character(w.founder);
    if (w.founder == c.id || !f || !f->online || f->asleepSince >= 0 || !together(c, *f, range)) return false;
  }
  if (!w.with.empty()) {
    std::vector<CharacterId> fit;
    for (const auto& id : presentWith(c, range)) {
      const CharacterState* o = character(id);
      if (!o || o->asleepSince >= 0 || ageOf(id) < content_->life().adultAge) continue;
      const RelationshipState* rel = relationship(c.id, id);
      const std::string status = rel ? rel->status : "";
      const bool met = rel && rel->firstMetAt >= 0;
      bool ok = w.with == "anyone";
      if (w.with == "known") ok = met;
      if (w.with == "stranger") ok = !met;
      if (w.with == "partner") ok = kPartner.count(status) > 0;
      if (w.with == "ex") ok = kEx.count(status) > 0;
      if (w.with == "coworker")
        ok = onShift && o->career.shiftStartedAt && o->career.shiftLocation == c.career.shiftLocation;
      if (ok) fit.push_back(id);
    }
    if (fit.empty()) return false;
    std::sort(fit.begin(), fit.end());
    with = fit[dayKey(c.id, day, e.id + "|with") % fit.size()];
  }
  return true;
}

void World::offerLifeEvent(CharacterState& c, std::int64_t day) {
  LifeEventsState& s = c.lifeEvents;
  struct Candidate {
    const LifeEventDef* def;
    CharacterId with;
  };
  std::vector<Candidate> pool;
  double total = 0;
  for (const auto& [id, e] : content_->lifeEvents()) {  // id order: the draw is the same on every machine
    const auto last = s.lastDay.find(id);
    if (last != s.lastDay.end() && day - last->second < std::max(1, e.cooldownDays)) continue;
    CharacterId with;
    if (!lifeEventHolds(c, e, day, with)) continue;
    pool.push_back(Candidate{&e, with});
    total += e.weight;
  }
  if (pool.empty()) return;
  const std::uint64_t h = dayKey(c.id, day, "life_event|" + std::to_string(s.offeredToday));
  double x = static_cast<double>(h % 1000000) / 1000000.0 * total;
  const Candidate* pick = &pool.back();
  for (const auto& k : pool) {
    if (x < k.def->weight) {
      pick = &k;
      break;
    }
    x -= k.def->weight;
  }
  const LifeEventsConfig& E = content_->lifeEventsConfig();
  const LocationDef* here = currentPlace(c);
  LifeEventOffer o;
  o.event = pick->def->id;
  o.with = pick->with;
  o.place = here ? here->id : "";
  o.at = state_.now;
  o.lapsesAt = state_.now + (pick->def->lapseMinutes > 0 ? pick->def->lapseMinutes : E.lapseMinutes);
  s.pending.push_back(o);
  s.offeredToday += 1;
  s.lastOfferAt = state_.now;
  s.lastDay[o.event] = day;
  emit({c.id}, "life_event", lifeEventView(c, o));
}

// Every game minute: unanswered events lapse (everyone's, online or not); and every check_every_minutes, inside the
// day's hours, a person whose next slot has opened gets one, at least min_gap_minutes after the last and never while
// one is still waiting. A day's slots are spread over the hours, each at a per-day hashed minute of its share.
void World::stepLifeEventsMinute() {
  if (content_->lifeEvents().empty()) return;
  for (auto& [id, c] : state_.characters) {
    std::vector<LifeEventOffer>& pending = c.lifeEvents.pending;
    for (auto it = pending.begin(); it != pending.end();) {
      if (it->lapsesAt > state_.now) {
        ++it;
        continue;
      }
      if (c.online) emit({id}, "life_event_lapsed", Json{{"event", it->event}});
      it = pending.erase(it);
    }
  }
  const LifeEventsConfig& E = content_->lifeEventsConfig();
  if (state_.now % E.checkEveryMinutes != 0) return;
  const DateTime now = toDateTime(state_.now);
  if (!E.hours.isOpenAt(now.hour)) return;
  const int from = E.hours.openHour * 60;
  const int span = (E.hours.closeHour - E.hours.openHour + 24) % 24 * 60;
  constexpr int kDay = static_cast<int>(kMinutesPerDay);
  const int window = span == 0 ? kDay : span;
  const int into = ((now.hour * 60 + now.minute) - from + kDay) % kDay;
  const int share = std::max(1, window / E.perDay);
  for (auto& [id, c] : state_.characters) {
    LifeEventsState& s = c.lifeEvents;
    if (s.day != now.dayIndex) {
      s.day = now.dayIndex;
      s.offeredToday = 0;
    }
    if (s.offeredToday >= E.perDay || !s.pending.empty()) continue;
    if (s.lastOfferAt >= 0 && state_.now - s.lastOfferAt < E.minGapMinutes) continue;
    const int opensAt = s.offeredToday * share +
                        static_cast<int>(dayKey(id, now.dayIndex, "life_event_slot|" + std::to_string(s.offeredToday)) %
                                         static_cast<std::uint64_t>(std::max(1, share / 2)));
    if (into < opensAt || !lifeEventMoment(c)) continue;
    offerLifeEvent(c, now.dayIndex);
  }
}

// ---- Showing one ---------------------------------------------------------------------------
std::string World::lifeEventText(const std::string& text, const LifeEventOffer& o, const LifeEventDef& e) const {
  std::string s = text;
  if (const CharacterDef* d = o.with.empty() ? nullptr : definition(o.with)) s = replaceAll(s, "{name}", d->firstName);
  if (const CharacterDef* d = e.when.founder.empty() ? nullptr : definition(e.when.founder))
    s = replaceAll(s, "{founder}", d->firstName);
  const LocationDef* place = content_->location(o.place);
  return replaceAll(s, "{place}", place ? place->name : "the street");
}

Json World::lifeEventView(const CharacterState& c, const LifeEventOffer& o) const {
  const LifeEventDef* e = content_->lifeEvent(o.event);
  if (!e) return Json();
  Json choices = Json::array();
  for (std::size_t i = 0; i < e->choices.size(); ++i) {
    const LifeEventChoiceDef& ch = e->choices[i];
    Json j{{"option", i}, {"label", lifeEventText(ch.label, o, *e)}};
    // What a choice is sure to cost is said up front, like a price; chances and everything else stay unsaid.
    if (const Cents cost = worstCost(ch); cost > 0) {
      j["cost_cents"] = cost;
      j["pay_with"] = costVia(ch);
      // Sure: every way it can go costs exactly this. Otherwise it's the most it can cost.
      j["cost_sure"] = std::all_of(ch.outcomes.begin(), ch.outcomes.end(),
                                   [&](const LifeEventOutcomeDef& x) { return x.money && x.money->cents == -cost; });
    }
    choices.push_back(std::move(j));
  }
  Json v{{"event", e->id},
         {"title", e->title},
         {"category", e->category},
         {"prompt", lifeEventText(e->prompt, o, *e)},
         {"choices", choices},
         {"at", o.at},
         {"lapses_at", o.lapsesAt},
         {"lapses_in_minutes", std::max<GameMinutes>(0, o.lapsesAt - state_.now)}};
  const CharacterId person = !o.with.empty() ? o.with : e->when.founder;
  if (const CharacterDef* d = person.empty() ? nullptr : definition(person)) v["with"] = Json{{"id", person}, {"name", d->fullName()}};
  if (const LocationDef* place = content_->location(o.place)) v["place"] = place->name;
  (void)c;
  return v;
}

LedgerAccountId World::lifeEventAccount(const CharacterState& c, const LifeEventOffer& o, const std::string& account) const {
  if (account == "employer") {
    const CareerDef* career = content_->career(c.career.careerId);
    return career ? career->employerAccount : "";
  }
  if (account == "here") {
    const LocationDef* place = content_->location(o.place);
    return place ? place->revenueAccount : "";
  }
  if (account == "landlord") {
    const PropertyState* home = homeOf(c.id);
    return home && home->owners.empty() ? home->ownerAccount : "";
  }
  return account;
}

// ---- Answering -----------------------------------------------------------------------------
Result<Json> World::answerLifeEvent(const CharacterId& actor, const std::string& eventId, int option) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  if (Status st = freeToAct(c); !st) return st.error();
  std::vector<LifeEventOffer>& pending = c.lifeEvents.pending;
  const auto it = std::find_if(pending.begin(), pending.end(), [&](const LifeEventOffer& o) { return o.event == eventId; });
  if (it == pending.end()) return fail("unknown_event", "that moment has passed");
  const LifeEventOffer offer = *it;
  const LifeEventDef* e = content_->lifeEvent(offer.event);
  if (!e) {
    pending.erase(it);  // the content changed under a saved event
    return fail("unknown_event", "that moment has passed");
  }
  if (option < 0 || option >= static_cast<int>(e->choices.size())) return fail("bad_option", "pick one of the choices");
  const LifeEventChoiceDef& choice = e->choices[static_cast<std::size_t>(option)];

  const LedgerAccountId bank = bankAccountOf(actor), cash = cashAccountOf(actor);
  if (const Cents cost = worstCost(choice); cost > 0) {
    const bool byCash = costVia(choice) == "cash";
    if (state_.ledger.balance(byCash ? cash : bank) < cost)
      return fail("insufficient_funds", "that takes " + formatMoney(cost) + (byCash ? " in cash" : " in the bank"));
  }
  std::size_t pick = choice.outcomes.size() - 1;
  if (choice.outcomes.size() > 1) {
    double x = roll();
    for (std::size_t i = 0; i < choice.outcomes.size(); ++i) {
      if (x < choice.outcomes[i].chance) {
        pick = i;
        break;
      }
      x -= choice.outcomes[i].chance;
    }
  }
  const LifeEventOutcomeDef& out = choice.outcomes[pick];
  pending.erase(it);
  c.lifeEvents.answered += 1;

  Json changes = Json::object();
  // Needs and emotions: what actually changed, after the 0-100 limits.
  auto applyStats = [&](StatMap& stats, const StatMap& deltas, const char* key) {
    Json moved = Json::object();
    for (const auto& [k, d] : deltas) {
      const double before = stats.count(k) ? stats.at(k) : 0;
      stats[k] = clampd(before + d, kStatMin, kStatMax);
      if (std::abs(stats[k] - before) >= 0.05) moved[k] = round1(stats[k] - before);
    }
    if (!moved.empty()) changes[key] = moved;
  };
  applyStats(c.needs, out.needs, "needs");
  applyStats(c.emotions, out.emotions, "emotions");

  // The person in it: your side changes by the numbers you see; theirs only shows as their reaction.
  const CharacterId person = !offer.with.empty() ? offer.with : e->when.founder;
  if (!person.empty() && character(person) && (!out.you.empty() || !out.them.empty())) {
    Json yours = Json::object();
    for (const auto& [dim, d] : out.you) {
      const double before = relationshipValue(actor, person, dim);
      adjustRelationship(actor, person, dim, d);
      yours[dim] = round1(relationshipValue(actor, person, dim) - before);
    }
    for (const auto& [dim, d] : out.them) adjustRelationship(person, actor, dim, d);
    const CharacterDef* pd = definition(person);
    Json rel{{"with", person}, {"name", pd ? pd->fullName() : person}};
    if (!yours.empty()) rel["your_feelings"] = yours;
    if (!out.reaction.empty()) rel["reaction"] = out.reaction;
    changes["relationship"] = rel;
  }

  if (out.money) {
    const LifeEventMoneyDef& m = *out.money;
    const LedgerAccountId other = lifeEventAccount(c, offer, m.account);
    const LedgerAccountId mine = m.via == "cash" ? cash : bank;
    const Cents amount = m.cents > 0 ? m.cents : -m.cents;
    const std::string memo = e->title + ": " + lifeEventText(choice.label, offer, *e);
    bool moved = false;
    if (!other.empty()) {
      moved = m.cents > 0 ? state_.ledger.transfer(other, mine, amount, kLedgerKind, memo, state_.now).ok()
                          : state_.ledger.transfer(mine, other, amount, kLedgerKind, memo, state_.now).ok();
    }
    if (moved) {
      changes["money_cents"] = m.cents;
      changes["account"] = m.via;
    } else {
      changes["money_note"] = m.cents > 0 ? "The money never came: they couldn't pay." : "No money changed hands.";
    }
  }

  if (out.fame > 0) {
    addFame(c, out.fame);
  } else if (out.fame < 0) {
    c.fame = std::max(0.0, c.fame + out.fame);
  }
  if (out.fame != 0) changes["fame"] = out.fame;

  Memory m;
  m.id = nextId("mem");
  m.owner = actor;
  m.at = state_.now;
  m.participants = {actor};
  if (!person.empty()) m.participants.push_back(person);
  m.location = c.inside;
  m.type = "life_event";
  m.importance = out.memoryImportance >= 0 ? out.memoryImportance : content_->lifeEventsConfig().memoryImportance;
  m.emotionalImpact = out.memoryImpact;
  m.about = person;
  m.info = lifeEventText(out.memory.empty() ? e->title + ": " + choice.label : out.memory, offer, *e);
  changes["memory"] = m.info;
  addMemory(std::move(m));

  Json reply{{"event", e->id},
             {"title", e->title},
             {"option", option},
             {"label", lifeEventText(choice.label, offer, *e)},
             {"outcome", lifeEventText(out.text, offer, *e)},
             {"changes", changes}};
  if (out.money) reply["balance_cents"] = Json{{"cash", state_.ledger.balance(cash)}, {"bank", state_.ledger.balance(bank)}};
  return reply;
}

// ---- Your life story (phone app `story`) ---------------------------------------------------
// Only ever your own: the events waiting for you, and your memories newest first, each with how old you were.
Json World::phoneStory(const CharacterState& c) const {
  Json pending = Json::array();
  for (const auto& o : c.lifeEvents.pending) {
    if (Json v = lifeEventView(c, o); !v.is_null()) pending.push_back(std::move(v));
  }
  std::vector<const Memory*> mine = memoriesOf(c.id);
  std::stable_sort(mine.begin(), mine.end(), [](const Memory* a, const Memory* b) { return a->at > b->at; });
  Json story = Json::array();
  for (const Memory* m : mine) {
    if (story.size() >= 80) break;
    const GameMinutes since = m->at - c.bornAt;
    story.push_back(Json{{"at", m->at},
                         {"when", formatDateTime(std::max<GameMinutes>(0, m->at))},
                         {"age", since > 0 ? static_cast<int>(since / kMinutesPerYear) : 0},
                         {"kind", m->type},
                         {"text", m->info},
                         {"impact", m->emotionalImpact},
                         {"life_event", m->type == "life_event"}});
  }
  return Json{{"age", ageOf(c.id)},
              {"pending", pending},
              {"story", story},
              {"answered", c.lifeEvents.answered},
              {"note", "Your life in your own memories, newest first. Only you can see this."}};
}

// ---- Save ----------------------------------------------------------------------------------
void writeLifeEventsCharacter(const CharacterState& c, Json& j) {
  const LifeEventsState& s = c.lifeEvents;
  if (s.day < 0 && s.pending.empty() && s.lastDay.empty() && s.answered == 0) return;
  Json pending = Json::array();
  for (const auto& o : s.pending)
    pending.push_back(Json{{"event", o.event}, {"with", o.with}, {"place", o.place}, {"at", o.at}, {"lapses_at", o.lapsesAt}});
  j["events"] = Json{{"day", s.day},
                     {"offered_today", s.offeredToday},
                     {"last_offer_at", s.lastOfferAt},
                     {"pending", pending},
                     {"last_day", s.lastDay},
                     {"answered", s.answered}};
}

// A save without the key (older, or a new character) has had no life events yet.
void readLifeEventsCharacter(CharacterState& c, const Json& j) {
  const auto it = j.find("events");
  if (it == j.end() || !it->is_object()) return;
  const Json& k = *it;
  LifeEventsState& s = c.lifeEvents;
  s.day = k.value("day", std::int64_t{-1});
  s.offeredToday = k.value("offered_today", 0);
  s.lastOfferAt = k.value("last_offer_at", GameMinutes{-1});
  for (const auto& o : k.value("pending", Json::array())) {
    LifeEventOffer x;
    x.event = o.value("event", "");
    x.with = o.value("with", "");
    x.place = o.value("place", "");
    x.at = o.value("at", GameMinutes{0});
    x.lapsesAt = o.value("lapses_at", GameMinutes{0});
    if (!x.event.empty()) s.pending.push_back(std::move(x));
  }
  s.lastDay = k.value("last_day", std::map<std::string, std::int64_t>{});
  s.answered = k.value("answered", 0);
}

}  // namespace livera
