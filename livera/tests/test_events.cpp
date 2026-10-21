// Life events (D-068, core/LifeEvents.cpp): content validation, when one comes up, the deterministic draw, each kind
// of effect, money through the ledger only, lapsing, privacy, and the save.
#include <fstream>
#include <map>
#include <set>

#include "TestSupport.h"
#include "core/Clock.h"
#include "core/Serialization.h"

using namespace livera;
using namespace livera::test;

namespace {

bool contains(const std::string& s, const std::string& part) { return s.find(part) != std::string::npos; }

// The real content with data/events/ patched: `patch` gets the life_events config and the list of events.
Result<std::shared_ptr<const ContentDatabase>> loadEvents(const std::function<void(Json& config, Json& events)>& patch) {
  std::vector<std::pair<std::string, Json>> docs;
  std::vector<std::filesystem::path> files;
  for (const auto& e : std::filesystem::recursive_directory_iterator(LIVERA_DATA_DIR)) {
    if (e.path().extension() == ".json") files.push_back(e.path());
  }
  std::sort(files.begin(), files.end());
  Json all = Json::array();
  for (const auto& f : files) {
    std::ifstream in(f);
    Json doc = Json::parse(in, nullptr, true, true);
    if (doc.contains("events")) {
      for (auto& e : doc["events"]) all.push_back(e);
      doc.erase("events");
    }
    docs.emplace_back(f.filename().string(), std::move(doc));
  }
  for (auto& [name, doc] : docs) {
    if (!doc.contains("life_events")) continue;
    patch(doc["life_events"], all);
    doc["events"] = all;
  }
  return ContentDatabase::loadFromDocuments(docs);
}

std::string eventsError(const std::function<void(Json& config, Json& events)>& patch) {
  auto r = loadEvents(patch);
  return r ? std::string("(loaded)") : r.error().message;
}

// The patched event with this id, in a load patch.
Json& eventIn(Json& events, const std::string& id) {
  for (auto& e : events) {
    if (e["id"] == id) return e;
  }
  throw std::runtime_error("no event " + id);
}

// Content with only these events, checked every minute, all day, no gap, several a day.
std::shared_ptr<const ContentDatabase> only(const Json& events, const Json& config = Json::object()) {
  static std::map<std::string, std::shared_ptr<const ContentDatabase>> cache;
  auto& db = cache[events.dump() + config.dump()];
  if (!db) {
    auto r = loadEvents([&](Json& c, Json& all) {
      c["check_every_minutes"] = 1;
      c["min_gap_minutes"] = 0;
      c["hours"] = {0, 0};
      c["per_day"] = 10;
      c["lapse_minutes"] = 120;
      c.update(config);
      all = events;
    });
    if (!r) throw std::runtime_error("events content failed: " + r.error().message);
    db = r.value();
  }
  return db;
}

// A simple event: two choices, the first with the given outcome, the second does nothing much.
Json event(const std::string& id, const Json& when, const Json& outcome, const std::string& prompt = "Something happens.") {
  return Json{{"id", id},
              {"category", "town"},
              {"title", "Title of " + id},
              {"prompt", prompt},
              {"when", when},
              {"choices", Json::array({Json{{"label", "Do it"}, {"outcomes", Json::array({outcome})}},
                                       Json{{"label", "Don't"}, {"outcomes", Json::array({Json{{"text", "You don't."}}})}}})}};
}

World townWith(std::shared_ptr<const ContentDatabase> db, std::initializer_list<const char*> who = {"dominique"}) {
  World w = World::createNew(std::move(db));
  for (const char* id : who) REQUIRE(w.connect(id));
  (void)w.drainEvents();
  return w;
}

const std::vector<LifeEventOffer>& pending(const World& w, const char* id) { return w.character(id)->lifeEvents.pending; }

std::vector<Json> eventsOf(const std::vector<WorldEvent>& evs, const CharacterId& to, const std::string& type) {
  std::vector<Json> out;
  for (const auto& e : evs) {
    if (e.type == type && std::find(e.recipients.begin(), e.recipients.end(), to) != e.recipients.end()) out.push_back(e.data);
  }
  return out;
}

bool hasMemory(const World& w, const CharacterId& who, const std::string& type, const std::string& part) {
  for (const Memory* m : w.memoriesOf(who)) {
    if (m->type == type && contains(m->info, part)) return true;
  }
  return false;
}

}  // namespace

// ---- Content -------------------------------------------------------------------------------
TEST_CASE("events: the real data loads with at least forty events across every category") {
  const auto db = realContent();
  CHECK(db->lifeEvents().size() >= 40);
  std::set<std::string> categories;
  for (const auto& [id, e] : db->lifeEvents()) {
    categories.insert(e.category);
    CHECK(e.choices.size() >= 2);
    CHECK(e.choices.size() <= 4);
  }
  for (const char* c : {"work", "money", "love", "friends", "family", "health", "town", "temptation", "street"})
    CHECK(categories.count(c) == 1);
  CHECK(db->lifeEventsConfig().perDay >= 1);
}

TEST_CASE("events: content is validated: unknown conditions, effects, places and people are refused") {
  CHECK(eventsError([](Json&, Json&) {}) == "(loaded)");
  auto with = [](const std::function<void(Json& e)>& f) {
    return eventsError([&](Json&, Json& all) { f(eventIn(all, "dropped_wallet")); });
  };
  CHECK(contains(with([](Json& e) { e["when"]["moon_phase"] = "full"; }), "unknown key 'moon_phase'"));
  CHECK(contains(with([](Json& e) { e["when"]["place_types"] = {"moon_base"}; }), "unknown place type 'moon_base'"));
  CHECK(contains(with([](Json& e) { e["when"]["places"] = {"atlantis"}; }), "unknown place 'atlantis'"));
  CHECK(contains(with([](Json& e) { e["when"]["careers"] = {"astronaut"}; }), "unknown career 'astronaut'"));
  CHECK(contains(with([](Json& e) { e["when"]["founder"] = "gandalf"; }), "unknown founder 'gandalf'"));
  CHECK(contains(with([](Json& e) { e["when"]["with"] = "nemesis"; }), "unknown with 'nemesis'"));
  CHECK(contains(with([](Json& e) { e["when"]["weather"] = {"locusts"}; }), "unknown weather 'locusts'"));
  CHECK(contains(with([](Json& e) { e["when"]["fame_tiers"] = {"demigod"}; }), "unknown fame tier 'demigod'"));
  CHECK(contains(with([](Json& e) { e["when"]["relationship"] = "complicated"; }), "single or partnered"));
  CHECK(contains(with([](Json& e) { e["when"]["home"] = "castle"; }), "renting, owns or none"));
  CHECK(contains(with([](Json& e) { e["category"] = "space"; }), "unknown category"));
  CHECK(contains(with([](Json& e) { e["choices"].erase(1); e["choices"].erase(1); }), "two to four choices"));
  CHECK(contains(with([](Json& e) { e["choices"][0]["outcomes"][0]["needs"] = {{"mana", 5}}; }), "unknown stat 'mana'"));
  CHECK(contains(with([](Json& e) { e["choices"][0]["outcomes"][0]["emotions"] = {{"glee", 5}}; }), "unknown stat 'glee'"));
  CHECK(contains(with([](Json& e) { e["choices"][0]["outcomes"][0]["teleport"] = true; }), "unknown key 'teleport'"));
  CHECK(contains(with([](Json& e) { e["choices"][0]["outcomes"][0]["money"]["account"] = "org:nowhere"; }), "unknown account"));
  CHECK(contains(with([](Json& e) { e["choices"][0]["outcomes"][0]["money"]["via"] = "crypto"; }), "via cash or bank"));
  CHECK(contains(with([](Json& e) { e["choices"][0]["outcomes"][0]["money"]["account"] = "employer"; }), "`employer`"));
  CHECK(contains(with([](Json& e) { e["choices"][0]["outcomes"][0]["money"]["account"] = "here"; }), "`here`"));
  CHECK(contains(with([](Json& e) { e["choices"][0]["outcomes"][0]["money"]["account"] = "landlord"; }), "`landlord`"));
  CHECK(contains(with([](Json& e) { e["choices"][1]["outcomes"][0]["chance"] = 0.5; }), "add up to 1"));
  CHECK(contains(with([](Json& e) { e["choices"][0]["outcomes"][0]["relationship"] = {{"you", {{"trust", 5}}}}; }),
                 "need someone in the event"));
  CHECK(contains(with([](Json& e) { e["choices"][0]["outcomes"][0]["relationship"] = {{"you", {{"vibes", 5}}}}; }),
                 "unknown stat 'vibes'"));
  CHECK(contains(with([](Json& e) { e["prompt"] = "{name} waves."; }), "{name} needs when.with"));
  CHECK(contains(with([](Json& e) { e["prompt"] = "{weather} again."; }), "unknown placeholder {weather}"));
  CHECK(contains(with([](Json& e) { e["choices"][1]["label"] = e["choices"][0]["label"]; }), "two choices are labelled"));
  CHECK(contains(with([](Json& e) { e["weight"] = 0; }), "weight must be above 0"));
  CHECK(contains(eventsError([](Json&, Json& all) { all.push_back(all[0]); }), "duplicate life event id"));
  CHECK(contains(eventsError([](Json& c, Json&) { c["per_day"] = 0; }), "per_day"));
  CHECK(contains(eventsError([](Json& c, Json&) { c["haste"] = 2; }), "unknown key 'haste'"));
}

// ---- When one comes up ---------------------------------------------------------------------
TEST_CASE("events: one comes up as a life_event with its choices, and the draw is the same in another world") {
  const Json ev = event("e_one", Json::object(), Json{{"text", "Done."}});
  World a = townWith(only(Json::array({ev})));
  a.advanceMinutes(1);
  REQUIRE(pending(a, "dominique").size() == 1);
  const auto sent = eventsOf(a.drainEvents(), "dominique", "life_event");
  REQUIRE(sent.size() == 1);
  CHECK(sent[0]["event"] == "e_one");
  CHECK(sent[0]["prompt"] == "Something happens.");
  CHECK(sent[0]["choices"].size() == 2);
  CHECK(sent[0]["choices"][0]["label"] == "Do it");
  CHECK(sent[0]["lapses_in_minutes"] == 120);

  // A pure draw over the pool: worlds with different random streams pick the same events at the same minutes.
  Json pool = Json::array();
  for (int i = 0; i < 6; ++i) pool.push_back(event("e_" + std::to_string(i), Json::object(), Json{{"text", "Done."}}));
  auto run = [&](std::uint64_t rng) {
    WorldState st = World::createNew(only(pool)).state();
    st.rng = rng;
    World w(only(pool), st);
    REQUIRE(w.connect("dominique"));
    std::vector<std::pair<GameMinutes, std::string>> seen;
    for (int i = 0; i < 600; ++i) {
      w.advanceMinutes(1);
      const auto& p = pending(w, "dominique");
      if (p.empty()) continue;
      seen.emplace_back(p[0].at, p[0].event);
      REQUIRE(w.answerLifeEvent("dominique", p[0].event, 1));
    }
    return seen;
  };
  const auto one = run(1), two = run(987654321);
  CHECK(one.size() >= 3);
  CHECK(one == two);
}

TEST_CASE("events: at most per_day a day, min_gap apart, one waiting at a time, within the day's hours") {
  Json pool = Json::array();
  for (int i = 0; i < 8; ++i) pool.push_back(event("e_" + std::to_string(i), Json::object(), Json{{"text", "Done."}}));
  const auto db = only(pool, Json{{"per_day", 2}, {"min_gap_minutes", 60}, {"hours", {8, 22}}});
  World w = townWith(db);
  std::vector<GameMinutes> at;
  for (int i = 0; i < 24 * 60; ++i) {
    w.advanceMinutes(1);
    const auto& p = pending(w, "dominique");
    if (p.empty()) continue;
    CHECK(p.size() == 1);
    at.push_back(p[0].at);
    const int hour = toDateTime(p[0].at).hour;
    CHECK(hour >= 8);
    CHECK(hour < 22);
    REQUIRE(w.answerLifeEvent("dominique", p[0].event, 1));
  }
  // From 07:00 on the first day to 07:00 on the next: two on the first day, and none yet on the second (before 08:00).
  CHECK(at.size() == 2);
  if (at.size() == 2) CHECK(at[1] - at[0] >= 60);
  // While one waits, no other comes up.
  World x = townWith(db);
  for (int i = 0; i < 15 * 60 && pending(x, "dominique").empty(); ++i) x.advanceMinutes(1);
  REQUIRE(pending(x, "dominique").size() == 1);
  const GameMinutes first = pending(x, "dominique")[0].at;
  x.advanceMinutes(100);
  REQUIRE(pending(x, "dominique").size() == 1);
  CHECK(pending(x, "dominique")[0].at == first);
}

TEST_CASE("events: never asleep, in a cell, on a shift unless it's about work, or for someone a script plays") {
  const Json any = event("e_any", Json::object(), Json{{"text", "Done."}});
  const Json work = event("e_work", Json{{"on_shift", true}}, Json{{"text", "Done."}});
  {
    World w = townWith(only(Json::array({any})));
    w.setScripted("dominique", true, "autopilot");
    w.advanceMinutes(30);
    CHECK(pending(w, "dominique").empty());
    w.setScripted("dominique", false);
    w.advanceMinutes(1);
    CHECK(pending(w, "dominique").size() == 1);
  }
  {
    // On shift: only the work event; off shift: only the other.
    World w = townWith(only(Json::array({any, work})));
    w.advanceMinutes(60);  // 08:00
    REQUIRE(pending(w, "dominique").size() == 1);
    CHECK(pending(w, "dominique")[0].event == "e_any");
    REQUIRE(w.answerLifeEvent("dominique", "e_any", 1));
    walkInto(w, "dominique", "meridian_talent");
    REQUIRE(w.startShift("dominique"));
    w.advanceMinutes(2);
    REQUIRE(pending(w, "dominique").size() == 1);
    CHECK(pending(w, "dominique")[0].event == "e_work");
  }
  {
    // In bed at night: nothing comes up (and a fresh day's first slot waits for morning).
    World w = townWith(only(Json::array({any}), Json{{"hours", {0, 0}}}));
    w.advanceMinutes(14 * 60 + 30);  // 21:30
    while (!pending(w, "dominique").empty()) REQUIRE(w.answerLifeEvent("dominique", pending(w, "dominique")[0].event, 1));
    REQUIRE(w.sleep("dominique"));
    w.advanceMinutes(60);
    CHECK(pending(w, "dominique").empty());
  }
}

TEST_CASE("events: conditions read what the World knows: place, outside, hours, money, career, people") {
  // Outside only.
  {
    World w = townWith(only(Json::array({event("e_out", Json{{"outside", true}}, Json{{"text", "Done."}})})));
    w.advanceMinutes(2);
    CHECK(pending(w, "dominique").empty());  // she starts at home, inside
    walkTo(w, "dominique", "founders_park");
    w.advanceMinutes(2);
    CHECK(pending(w, "dominique").size() == 1);
  }
  // A place type.
  {
    World w = townWith(only(Json::array({event("e_cafe", Json{{"place_types", {"coffee_shop"}}}, Json{{"text", "Done."}})})));
    w.advanceMinutes(2);
    CHECK(pending(w, "dominique").empty());
    walkInto(w, "dominique", "heritage_coffee");
    w.advanceMinutes(2);
    CHECK(pending(w, "dominique").size() == 1);
  }
  // Hours and weekdays (the world starts on a Monday at 07:00).
  {
    World w = townWith(only(Json::array({event("e_hours", Json{{"hours", {9, 10}}, {"weekdays", {0}}}, Json{{"text", "Done."}})})));
    w.advanceMinutes(60);
    CHECK(pending(w, "dominique").empty());
    w.advanceMinutes(65);
    CHECK(pending(w, "dominique").size() == 1);
  }
  // Money bands: cash + bank.
  {
    World w = townWith(only(Json::array({event("e_rich", Json{{"money_at_least_cents", 100000000}}, Json{{"text", "Done."}}),
                                         event("e_poor", Json{{"money_below_cents", 100000000}}, Json{{"text", "Done."}})})));
    w.advanceMinutes(2);
    REQUIRE(pending(w, "dominique").size() == 1);
    CHECK(pending(w, "dominique")[0].event == "e_poor");
  }
  // A career, and having none.
  {
    World w = townWith(only(Json::array({event("e_law", Json{{"careers", {"law"}}}, Json{{"text", "Done."}}),
                                         event("e_none", Json{{"has_career", false}}, Json{{"text", "Done."}}),
                                         event("e_rec", Json{{"careers", {"recruiting"}}}, Json{{"text", "Done."}})})));
    w.advanceMinutes(2);
    REQUIRE(pending(w, "dominique").size() == 1);
    CHECK(pending(w, "dominique")[0].event == "e_rec");
  }
  // Single (Dominique has no partner).
  {
    World w = townWith(only(Json::array({event("e_partnered", Json{{"relationship", "partnered"}}, Json{{"text", "Done."}}),
                                         event("e_single", Json{{"relationship", "single"}}, Json{{"text", "Done."}})})));
    w.advanceMinutes(2);
    REQUIRE(pending(w, "dominique").size() == 1);
    CHECK(pending(w, "dominique")[0].event == "e_single");
  }
  // Someone with you, and a named founder with you (never yourself).
  {
    const Json withSomeone = event("e_with", Json{{"with", "anyone"}}, Json{{"text", "{name} nods."}}, "{name} is here.");
    World w = townWith(only(Json::array({withSomeone})), {"dominique", "dax"});
    w.advanceMinutes(2);
    CHECK(pending(w, "dominique").empty());
    walkInto(w, "dominique", "heritage_coffee");
    walkInto(w, "dax", "heritage_coffee");
    w.advanceMinutes(2);
    REQUIRE(pending(w, "dominique").size() == 1);
    CHECK(pending(w, "dominique")[0].with == "dax");
    const Json view = w.openPhoneApp("dominique", "story").value()["pending"][0];
    CHECK(view["prompt"] == "Dax is here.");
    CHECK(view["with"]["id"] == "dax");
  }
  {
    const Json founder = event("e_founder", Json{{"founder", "dax"}}, Json{{"text", "{founder} grins."}}, "{founder} waves.");
    World w = townWith(only(Json::array({founder})), {"dominique", "dax"});
    walkInto(w, "dominique", "heritage_coffee");
    walkInto(w, "dax", "heritage_coffee");
    w.advanceMinutes(2);
    REQUIRE(pending(w, "dominique").size() == 1);
    CHECK(pending(w, "dax").empty());  // never about yourself
  }
}

TEST_CASE("events: a cooldown keeps one event from coming back too soon") {
  Json a = event("e_a", Json::object(), Json{{"text", "Done."}});
  a["cooldown_days"] = 3;
  World w = townWith(only(Json::array({a})));
  w.advanceMinutes(1);
  REQUIRE(pending(w, "dominique").size() == 1);
  const std::int64_t day = toDateTime(w.now()).dayIndex;
  REQUIRE(w.answerLifeEvent("dominique", "e_a", 1));
  std::int64_t next = -1;
  for (int i = 0; i < 4 * kMinutesPerDay && next < 0; ++i) {
    w.advanceMinutes(1);
    if (!pending(w, "dominique").empty()) next = toDateTime(w.now()).dayIndex;
  }
  CHECK(next == day + 3);
}

// ---- What an answer does -------------------------------------------------------------------
TEST_CASE("events: needs, emotions, memory and fame, with the reply saying what changed") {
  const Json ev = event("e_fx", Json{{"place_types", {"coffee_shop"}}},
                        Json{{"text", "At {place}, it went well."},
                             {"needs", {{"hunger", 10}}},
                             {"emotions", {{"happiness", 12}}},
                             {"memory", {{"text", "A good moment at {place}"}, {"impact", 20}, {"importance", 40}}},
                             {"fame", 2.0}});
  World w = townWith(only(Json::array({ev})));
  walkInto(w, "dominique", "heritage_coffee");
  w.advanceMinutes(2);
  REQUIRE(pending(w, "dominique").size() == 1);
  const double hunger = w.character("dominique")->needs.at("hunger");
  const double fame = w.character("dominique")->fame;
  auto r = w.answerLifeEvent("dominique", "e_fx", 0);
  REQUIRE(r);
  const Json& d = r.value();
  CHECK(d["outcome"] == "At Heritage Coffee Co., it went well.");
  CHECK(d["label"] == "Do it");
  CHECK_NEAR(d["changes"]["needs"]["hunger"].get<double>(), std::min(10.0, 100 - hunger), 0.11);
  CHECK(d["changes"]["emotions"].contains("happiness"));
  CHECK(d["changes"]["memory"] == "A good moment at Heritage Coffee Co.");
  CHECK_NEAR(w.character("dominique")->fame, fame + 2.0, 1e-9);
  CHECK(hasMemory(w, "dominique", "life_event", "A good moment at Heritage Coffee Co."));
  CHECK(pending(w, "dominique").empty());
  CHECK(w.answerLifeEvent("dominique", "e_fx", 0).error().code == "unknown_event");
}

TEST_CASE("events: relationship changes with the person in it: your side in numbers, theirs only as a reaction") {
  const Json ev = event("e_rel", Json{{"with", "anyone"}},
                        Json{{"text", "{name} smiles."},
                             {"relationship", {{"you", {{"trust", 6}}}, {"them", {{"friendship", 9}}}, {"reaction", "pleased"}}}},
                        "{name} needs a hand.");
  World w = townWith(only(Json::array({ev})), {"dominique", "dax"});
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "dax", "heritage_coffee");
  w.advanceMinutes(2);
  REQUIRE(pending(w, "dominique").size() == 1);
  const double mine = w.relationshipValue("dominique", "dax", "trust");
  const double theirs = w.relationshipValue("dax", "dominique", "friendship");
  auto r = w.answerLifeEvent("dominique", "e_rel", 0);
  REQUIRE(r);
  const Json rel = r.value()["changes"]["relationship"];
  CHECK(rel["with"] == "dax");
  CHECK(rel["reaction"] == "pleased");
  CHECK(rel["your_feelings"].contains("trust"));
  CHECK(!rel.contains("their_feelings"));
  CHECK(r.value().dump().find("friendship") == std::string::npos);  // their side never shows
  CHECK(w.relationshipValue("dominique", "dax", "trust") > mine);
  CHECK(w.relationshipValue("dax", "dominique", "friendship") > theirs);
}

TEST_CASE("events: money moves only through the ledger, zero-sum, to and from economy, orgs, employer, here and landlord") {
  auto money = [](Cents cents, const std::string& account, const std::string& via) {
    return Json{{"text", "Money moved."}, {"money", {{"cents", cents}, {"account", account}, {"via", via}}}};
  };
  // Paid to you from the outside world, into your cash.
  {
    World w = townWith(only(Json::array({event("e_find", Json::object(), money(2000, "sys:economy", "cash"))})));
    w.advanceMinutes(1);
    const Cents cash = w.state().ledger.balance(cashAccountOf("dominique"));
    const Cents economy = w.state().ledger.balance("sys:economy");
    auto r = w.answerLifeEvent("dominique", "e_find", 0);
    REQUIRE(r);
    CHECK(r.value()["changes"]["money_cents"] == 2000);
    CHECK(w.state().ledger.balance(cashAccountOf("dominique")) == cash + 2000);
    CHECK(w.state().ledger.balance("sys:economy") == economy - 2000);
    CHECK(w.state().ledger.sumOfBalances() == 0);
    CHECK(w.state().ledger.transactions().back().kind == "life_event");
  }
  // Paid by you to an org, from the bank; the choice says what it costs before you answer.
  {
    World w = townWith(only(Json::array({event("e_give", Json::object(), money(-1500, "org:common_ground", "bank"))})));
    w.advanceMinutes(1);
    const Json view = w.openPhoneApp("dominique", "story").value()["pending"][0];
    CHECK(view["choices"][0]["cost_cents"] == 1500);
    CHECK(view["choices"][0]["pay_with"] == "bank");
    CHECK(!view["choices"][1].contains("cost_cents"));
    const Cents org = w.state().ledger.balance("org:common_ground");
    REQUIRE(w.answerLifeEvent("dominique", "e_give", 0));
    CHECK(w.state().ledger.balance("org:common_ground") == org + 1500);
    CHECK(w.state().ledger.sumOfBalances() == 0);
  }
  // Can't afford it: refused before anything happens, and the event still waits.
  {
    World w = townWith(only(Json::array({event("e_dear", Json::object(), money(-900000000, "sys:economy", "cash"))})));
    w.advanceMinutes(1);
    const auto r = w.answerLifeEvent("dominique", "e_dear", 0);
    CHECK(r.error().code == "insufficient_funds");
    CHECK(pending(w, "dominique").size() == 1);
    REQUIRE(w.answerLifeEvent("dominique", "e_dear", 1));  // the other choice is free
  }
  // `employer` (on shift), `here` (the place it came up) and `landlord` (who you rent from).
  {
    World w = townWith(only(Json::array({event("e_bonus", Json{{"on_shift", true}}, money(4000, "employer", "bank"))})));
    walkInto(w, "dominique", "meridian_talent");
    REQUIRE(w.startShift("dominique"));
    w.advanceMinutes(2);
    const Cents employer = w.state().ledger.balance("org:meridian_talent");
    REQUIRE(w.answerLifeEvent("dominique", "e_bonus", 0));
    CHECK(w.state().ledger.balance("org:meridian_talent") == employer - 4000);
  }
  {
    World w = townWith(only(Json::array({event("e_tab", Json{{"place_types", {"coffee_shop"}}}, money(-600, "here", "bank"))})));
    walkInto(w, "dominique", "heritage_coffee");
    w.advanceMinutes(2);
    const Cents cafe = w.state().ledger.balance("org:heritage_coffee");
    REQUIRE(w.answerLifeEvent("dominique", "e_tab", 0));
    CHECK(w.state().ledger.balance("org:heritage_coffee") == cafe + 600);
  }
  {
    World w = townWith(only(Json::array({event("e_rent", Json{{"home", "renting"}}, money(-1200, "landlord", "bank"))})));
    w.advanceMinutes(2);
    REQUIRE(pending(w, "dominique").size() == 1);
    const LedgerAccountId landlord = w.state().properties.at("lexington_1204").ownerAccount;
    const Cents before = w.state().ledger.balance(landlord);
    REQUIRE(w.answerLifeEvent("dominique", "e_rent", 0));
    CHECK(w.state().ledger.balance(landlord) == before + 1200);
    CHECK(w.state().ledger.sumOfBalances() == 0);
  }
}

TEST_CASE("events: chance outcomes roll the world's saved stream; the same save answers the same way") {
  Json ev = event("e_coin", Json::object(), Json{{"text", "x"}});
  ev["choices"][0]["outcomes"] = Json::array({Json{{"chance", 0.5}, {"text", "Heads."}}, Json{{"chance", 0.5}, {"text", "Tails."}}});
  std::set<std::string> seen;
  for (std::uint64_t seed = 1; seed <= 24; ++seed) {
    WorldState st = World::createNew(only(Json::array({ev}))).state();
    st.rng = seed * 7919;
    World a(only(Json::array({ev})), st), b(only(Json::array({ev})), st);
    for (World* w : {&a, &b}) {
      REQUIRE(w->connect("dominique"));
      w->advanceMinutes(1);
    }
    const auto ra = a.answerLifeEvent("dominique", "e_coin", 0), rb = b.answerLifeEvent("dominique", "e_coin", 0);
    REQUIRE(ra);
    REQUIRE(rb);
    CHECK(ra.value()["outcome"] == rb.value()["outcome"]);
    seen.insert(ra.value()["outcome"].get<std::string>());
  }
  CHECK(seen.size() == 2);
}

TEST_CASE("events: unanswered ones lapse, and say so") {
  World w = townWith(only(Json::array({event("e_lapse", Json::object(), Json{{"text", "Done."}})}), Json{{"per_day", 1}}));
  w.advanceMinutes(1);
  REQUIRE(pending(w, "dominique").size() == 1);
  (void)w.drainEvents();
  w.advanceMinutes(120);
  CHECK(pending(w, "dominique").empty());
  CHECK(eventsOf(w.drainEvents(), "dominique", "life_event_lapsed").size() == 1);
  CHECK(w.answerLifeEvent("dominique", "e_lapse", 0).error().code == "unknown_event");
  CHECK(w.memoriesOf("dominique").size() == w.memoriesOf("dominique").size());
  CHECK(!hasMemory(w, "dominique", "life_event", "Title of e_lapse"));
}

TEST_CASE("events: only ever your own: another's event can't be answered, and the story is your own memories") {
  World w = townWith(only(Json::array({event("e_mine", Json::object(), Json{{"text", "Done."}, {"memory", {{"text", "Mine alone."}}}})})),
                     {"dominique", "dax"});
  w.advanceMinutes(1);
  REQUIRE(pending(w, "dominique").size() == 1);
  REQUIRE(pending(w, "dax").size() == 1);
  REQUIRE(w.answerLifeEvent("dominique", "e_mine", 0));
  CHECK(w.answerLifeEvent("dominique", "e_mine", 0).error().code == "unknown_event");
  CHECK(pending(w, "dax").size() == 1);  // answering hers never answers his
  const Json mine = w.openPhoneApp("dominique", "story").value();
  const Json his = w.openPhoneApp("dax", "story").value();
  CHECK(mine["pending"].empty());
  CHECK(his["pending"].size() == 1);
  bool found = false;
  for (const auto& s : mine["story"]) found |= s["text"] == "Mine alone." && s["life_event"] == true;
  CHECK(found);
  for (const auto& s : his["story"]) CHECK(s["text"] != "Mine alone.");
  for (const auto& s : mine["story"]) CHECK(s.contains("age"));
  CHECK(w.answerLifeEvent("dominique", "e_mine", 7).error().code == "unknown_event");
  CHECK(w.answerLifeEvent("dax", "e_mine", 7).error().code == "bad_option");
}

TEST_CASE("events: a waiting event survives the save and a reload; one that lapsed while away is gone") {
  World w = townWith(only(Json::array({event("e_save", Json::object(), Json{{"text", "Done."}})})));
  w.advanceMinutes(1);
  REQUIRE(pending(w, "dominique").size() == 1);
  auto loaded = worldStateFromJson(worldStateToJson(w.state()));
  REQUIRE(loaded);
  World back(only(Json::array({event("e_save", Json::object(), Json{{"text", "Done."}})})), loaded.value());
  REQUIRE(pending(back, "dominique").size() == 1);
  CHECK(pending(back, "dominique")[0].event == "e_save");
  CHECK(back.character("dominique")->lifeEvents.offeredToday == 1);
  REQUIRE(back.connect("dominique"));
  REQUIRE(back.answerLifeEvent("dominique", "e_save", 0));
  // An older save (no `events` key) loads with none.
  Json doc = worldStateToJson(w.state());
  for (auto& c : doc["characters"]) c.erase("events");
  auto old = worldStateFromJson(doc);
  REQUIRE(old);
  CHECK(old.value().characters.at("dominique").lifeEvents.pending.empty());
}

TEST_CASE("events: in a cell you can't answer one") {
  const Json ev = event("e_cell", Json::object(), Json{{"text", "Done."}});
  World w = townWith(only(Json::array({ev})));
  w.advanceMinutes(1);
  REQUIRE(pending(w, "dominique").size() == 1);
  WorldState st = w.state();
  st.characters.at("dominique").jailedUntil = st.now + 600;
  st.characters.at("dominique").online = false;
  World cell(only(Json::array({ev})), st);
  REQUIRE(cell.connect("dominique"));
  CHECK(cell.answerLifeEvent("dominique", "e_cell", 0).error().code == "in_jail");
  cell.advanceMinutes(30);
  CHECK(pending(cell, "dominique").size() == 1);  // nothing new comes up in a cell either
}

TEST_CASE("events: the real events come up in a played day, and money stays zero-sum") {
  World w = townWith(realContent());
  int offered = 0;
  for (int i = 0; i < 16 * 60; ++i) {
    w.advanceMinutes(1);
    const auto& p = pending(w, "dominique");
    if (p.empty()) continue;
    ++offered;
    const LifeEventDef* def = w.content().lifeEvent(p[0].event);
    REQUIRE(def);
    // Answer the last choice (never the one that costs most), the way a careful player might.
    auto r = w.answerLifeEvent("dominique", p[0].event, static_cast<int>(def->choices.size()) - 1);
    if (!r) CHECK(r.error().code == "insufficient_funds");
    if (!r) REQUIRE(w.answerLifeEvent("dominique", p[0].event, 0));
  }
  CHECK(offered >= 1);
  CHECK(offered <= w.content().lifeEventsConfig().perDay);
  CHECK(w.state().ledger.sumOfBalances() == 0);
}
