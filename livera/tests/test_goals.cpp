// Goals (docs/proposals/redesign.md R2.1, core/Goals.cpp): the daily draw, aspirations, each check, privacy.
#include <fstream>
#include <map>
#include <set>

#include "TestSupport.h"
#include "core/Clock.h"

using namespace livera;
using namespace livera::test;

namespace {

bool contains(const std::string& s, const std::string& part) { return s.find(part) != std::string::npos; }

Result<std::shared_ptr<const ContentDatabase>> loadPatched(
    const std::function<void(Json& doc, const std::string& file)>& patch) {
  std::vector<std::pair<std::string, Json>> docs;
  std::vector<std::filesystem::path> files;
  for (const auto& e : std::filesystem::recursive_directory_iterator(LIVERA_DATA_DIR)) {
    if (e.path().extension() == ".json") files.push_back(e.path());
  }
  std::sort(files.begin(), files.end());
  for (const auto& f : files) {
    std::ifstream in(f);
    Json doc = Json::parse(in, nullptr, true, true);
    patch(doc, f.filename().string());
    docs.emplace_back(f.filename().string(), std::move(doc));
  }
  return ContentDatabase::loadFromDocuments(docs);
}

// The load error for goals.json patched this way ("(loaded)" if it loads).
std::string goalsError(const std::function<void(Json& goals)>& patch) {
  auto r = loadPatched([&](Json& doc, const std::string& file) {
    if (file == "goals.json") patch(doc["goals"]);
  });
  return r ? std::string("(loaded)") : r.error().message;
}

// The real content with one daily goal (this check) and one a day, so the phone shows exactly it.
std::shared_ptr<const ContentDatabase> oneGoal(const Json& check, const Json& needs = Json::array()) {
  static std::map<std::string, std::shared_ptr<const ContentDatabase>> cache;
  const std::string key = check.dump() + needs.dump();
  auto& db = cache[key];
  if (!db) {
    db = patchedContent([&](Json& doc, const std::string& file) {
      if (file != "goals.json") return;
      doc["goals"]["daily"]["per_day"] = 1;
      doc["goals"]["daily"]["pool"] =
          Json::array({Json{{"id", "g"}, {"label", "The goal"}, {"check", check}, {"requires", needs}}});
    });
  }
  return db;
}

Json goalsOf(World& w, const CharacterId& who) {
  auto r = w.openPhoneApp(who, "goals");
  if (!r) throw std::runtime_error("goals refused: " + r.error().code);
  return r.value();
}

// Whether the one daily goal is done (false if it wasn't drawn).
bool done(World& w, const CharacterId& who) {
  const Json g = goalsOf(w, who);
  return !g["today"].empty() && g["today"][0]["done"].get<bool>();
}

Json todayGoal(World& w, const CharacterId& who) {
  const Json g = goalsOf(w, who);
  return g["today"].empty() ? Json() : g["today"][0];
}

std::vector<std::string> todayIds(World& w, const CharacterId& who) {
  std::vector<std::string> out;
  const Json g = goalsOf(w, who);
  for (const auto& x : g["today"]) out.push_back(x["id"].get<std::string>());
  return out;
}

void nextDay(World& w, int hour = 9) {
  const GameMinutes target = (w.now() / kMinutesPerDay + 1) * kMinutesPerDay + hour * kMinutesPerHour;
  w.advanceMinutes(target - w.now());
}

Json solSheet() {
  std::ifstream in(std::string(LIVERA_DATA_DIR) + "/../scripts/demo/sol_rivera.json");
  return Json::parse(in);
}

void paidShift(World& w, const CharacterId& who, const LocationId& where) {
  walkInto(w, who, where);
  REQUIRE(w.startShift(who));
  w.advanceMinutes(60);
  REQUIRE(w.endShift(who).value().at("pay_cents").get<Cents>() > 0);
}

Json aspirationOf(const Json& goals, const std::string& id) {
  for (const auto& a : goals["aspirations"]) {
    if (a["id"] == id) return a;
  }
  return Json();
}

}  // namespace

// ---- Content -------------------------------------------------------------------------------
TEST_CASE("goals: the real data loads, every creator goal has an aspiration, and every founder names theirs") {
  const auto db = realContent();
  const GoalsConfig& G = db->goals();
  CHECK(G.perDay == 3);
  CHECK(G.daily.size() >= 8);
  for (const auto& option : db->creator().goals.options) CHECK(db->aspirationForCreatorGoal(option) != nullptr);
  for (const auto& [id, def] : db->characters()) {
    CHECK(!def.aspirations.empty());
    for (const auto& a : def.aspirations) CHECK(db->aspiration(a) != nullptr);
  }
  // Goals the game can't follow are labelled with a reason, never given steps to fake.
  const AspirationDef* business = db->aspiration("start_a_business");
  REQUIRE(business);
  CHECK(!business->tracked);
  CHECK(!business->untrackedReason.empty());
  CHECK(business->steps.empty());
}

TEST_CASE("goals: content is validated") {
  CHECK(goalsError([](Json&) {}) == "(loaded)");
  CHECK(contains(goalsError([](Json& g) { g["daily"]["pool"][0]["check"]["type"] = "vibes"; }),
                 "unknown check type 'vibes'"));
  CHECK(contains(goalsError([](Json& g) {
                   g["daily"]["pool"][0]["check"] = Json{{"type", "memories_today"}, {"memory", "dragon_slain"}};
                 }),
                 "unknown memory type"));
  CHECK(contains(goalsError([](Json& g) {
                   g["daily"]["pool"][0]["check"] = Json{{"type", "purchases_today"}, {"place_types", {"moon_base"}}};
                 }),
                 "unknown place type"));
  CHECK(contains(goalsError([](Json& g) {
                   g["daily"]["pool"][0]["check"] = Json{{"type", "ledger_today"}, {"kinds", {"lottery"}}};
                 }),
                 "unknown ledger kind"));
  CHECK(contains(goalsError([](Json& g) {
                   g["daily"]["pool"][0]["check"] =
                       Json{{"type", "ledger_today"}, {"kinds", {"salary"}}, {"direction", "up"}};
                 }),
                 "direction"));
  CHECK(contains(goalsError([](Json& g) { g["daily"]["pool"][0]["requires"] = {"has_yacht"}; }),
                 "unknown requirement"));
  CHECK(contains(goalsError([](Json& g) { g["daily"]["pool"][1]["id"] = g["daily"]["pool"][0]["id"]; }),
                 "duplicate daily goal"));
  CHECK(contains(goalsError([](Json& g) { g["daily"]["per_day"] = 0; }), "per_day"));
  CHECK(contains(goalsError([](Json& g) { g["daily"]["pool"][0]["check"]["min"] = 0; }), "min must be at least 1"));
  CHECK(contains(goalsError([](Json& g) {
                   for (auto& a : g["aspirations"]) {
                     if (a["id"] == "get_famous") a["steps"][0]["check"]["tier"] = "demigod";
                   }
                 }),
                 "unknown fame tier"));
  // Every creator goal maps to exactly one aspiration, and only to goals the creator offers.
  CHECK(contains(goalsError([](Json& g) {
                   Json kept = Json::array();
                   for (auto& a : g["aspirations"]) {
                     if (a["id"] != "get_rich") kept.push_back(a);
                   }
                   g["aspirations"] = kept;
                 }),
                 "the creator goal 'get rich' has no aspiration"));
  CHECK(contains(goalsError([](Json& g) { g["aspirations"][0]["creator_goal"] = "become a pirate"; }),
                 "not a goal the creator offers"));
  CHECK(contains(goalsError([](Json& g) { g["aspirations"][1]["creator_goal"] = g["aspirations"][0]["creator_goal"]; }),
                 "already maps to"));
  // A tracked aspiration has steps; an untracked one says why and has none.
  CHECK(contains(goalsError([](Json& g) { g["aspirations"][0]["steps"] = Json::array(); }), "needs steps"));
  CHECK(contains(goalsError([](Json& g) {
                   for (auto& a : g["aspirations"]) {
                     if (a.value("tracked", true) == false) a.erase("untracked_reason");
                   }
                 }),
                 "untracked_reason"));
  // A founder can only name aspirations that exist.
  auto r = loadPatched([](Json& doc, const std::string& file) {
    if (file == "dominique.json") doc["characters"][0]["aspirations"] = {"get_promoted", "conquer_mars"};
  });
  REQUIRE(!r);
  CHECK(contains(r.error().message, "unknown aspiration 'conquer_mars'"));
}

// ---- The daily draw ------------------------------------------------------------------------
TEST_CASE("goals: three a day, the same all day, the same in another world, different over the days") {
  World w = World::createNew(realContent());
  REQUIRE(w.connect("dominique"));
  REQUIRE(w.connect("dax"));
  const std::vector<std::string> first = todayIds(w, "dominique");
  CHECK(first.size() == 3);
  CHECK(std::set<std::string>(first.begin(), first.end()).size() == 3);
  // Opening the phone changes nothing and draws nothing from the world's random stream.
  const std::uint64_t rng = w.state().rng;
  CHECK(todayIds(w, "dominique") == first);
  CHECK(w.state().rng == rng);
  w.advanceMinutes(5 * 60);
  CHECK(todayIds(w, "dominique") == first);
  World twin = World::createNew(realContent());
  REQUIRE(twin.connect("dominique"));
  CHECK(todayIds(twin, "dominique") == first);
  // New at midnight, and not the same every day; characters draw separately.
  std::set<std::vector<std::string>> sets{first};
  bool differs = false;
  for (int day = 0; day < 7; ++day) {
    nextDay(w);
    const auto dom = todayIds(w, "dominique");
    sets.insert(dom);
    differs |= dom != todayIds(w, "dax");
  }
  CHECK(sets.size() > 2);
  CHECK(differs);
  const Json g = goalsOf(w, "dominique");
  CHECK(g["day"] == toDateTime(w.now()).dayIndex);
  CHECK(contains(g["note"].get<std::string>(), "3 goals a day"));
}

TEST_CASE("goals: requires keeps goals someone can't do off their list") {
  World w = World::createNew(realContent());
  REQUIRE(w.connect("dominique"));
  // No partner and no team: never a date or a league match, however many days.
  std::set<std::string> seen;
  for (int day = 0; day < 28; ++day) {
    for (const auto& id : todayIds(w, "dominique")) seen.insert(id);
    nextDay(w);
  }
  CHECK(!seen.count("date_night"));
  CHECK(!seen.count("match_day"));
  CHECK(seen.count("paid_shift"));  // she has a job
  // With a partner, a date can come up.
  WorldState s = w.state();
  for (auto key : {RelationshipKey{"dominique", "dax"}, RelationshipKey{"dax", "dominique"}})
    s.relationships[key].status = "dating";
  World dating(realContent(), s);
  bool date = false;
  for (int day = 0; day < 28 && !date; ++day) {
    for (const auto& id : todayIds(dating, "dominique")) date |= id == "date_night";
    nextDay(dating);
  }
  CHECK(date);
  // Without a job: no paid shift, no work calls.
  WorldState jobless = w.state();
  jobless.characters.at("dominique").career.careerId.clear();
  World idle(realContent(), jobless);
  for (int day = 0; day < 14; ++day) {
    for (const auto& id : todayIds(idle, "dominique")) {
      CHECK(id != "paid_shift");
      CHECK(id != "best_calls");
      CHECK(id != "come_out_ahead");
    }
    nextDay(idle);
  }
  // A requirement is checked per goal: one gated on a partner is never drawn without one.
  World gated =
      World::createNew(oneGoal(Json{{"type", "memories_today"}, {"memory", "date"}}, Json::array({"has_partner"})));
  REQUIRE(gated.connect("dominique"));
  CHECK(goalsOf(gated, "dominique")["today"].empty());
}

// ---- Each check ----------------------------------------------------------------------------
TEST_CASE("goals: ledger checks: paid shifts, money in and out, purchases by kind of place, coming out ahead") {
  {
    World w = World::createNew(oneGoal(Json{{"type", "ledger_today"}, {"kinds", {"salary"}}, {"direction", "in"}}));
    REQUIRE(w.connect("dominique"));
    CHECK(!done(w, "dominique"));
    CHECK(todayGoal(w, "dominique")["progress"] == "0/1");
    paidShift(w, "dominique", "meridian_talent");
    CHECK(done(w, "dominique"));
    CHECK(todayGoal(w, "dominique")["progress"] == "1/1");
    nextDay(w);
    CHECK(!done(w, "dominique"));  // a new day starts again
  }
  {
    World w = World::createNew(oneGoal(Json{{"type", "ledger_today"}, {"kinds", {"tip"}}, {"direction", "out"}}));
    World in = World::createNew(oneGoal(Json{{"type", "ledger_today"}, {"kinds", {"tip"}}, {"direction", "in"}}));
    for (World* x : {&w, &in}) {
      REQUIRE(x->connect("dominique"));
      REQUIRE(x->connect("dax"));
      walkInto(*x, "dominique", "heritage_coffee");
      walkInto(*x, "dax", "heritage_coffee");
      REQUIRE(x->tip("dominique", "dax", 500));
    }
    CHECK(done(w, "dominique"));   // she paid one
    CHECK(!done(w, "dax"));
    CHECK(!done(in, "dominique"));
    CHECK(done(in, "dax"));        // he received one
  }
  {
    World w = World::createNew(oneGoal(Json{{"type", "purchases_today"}, {"place_types", {"coffee_shop"}}}));
    REQUIRE(w.connect("dominique"));
    w.advanceMinutes(2 * 60);  // 09:00: the shops are open
    walkInto(w, "dominique", "thread_co");
    REQUIRE(w.buy("dominique", "umbrella", "card"));
    CHECK(!done(w, "dominique"));  // a shop, but not a café
    walkInto(w, "dominique", "heritage_coffee");
    REQUIRE(w.buy("dominique", "latte", "phone"));  // LivPay counts like a card
    CHECK(done(w, "dominique"));
  }
  {
    World w = World::createNew(oneGoal(Json{{"type", "ledger_net_today"}, {"cents", 1}}));
    REQUIRE(w.connect("dominique"));
    CHECK(!done(w, "dominique"));
    walkInto(w, "dominique", "heritage_coffee");
    REQUIRE(w.buy("dominique", "latte", "card"));
    CHECK(!done(w, "dominique"));
    CHECK(contains(todayGoal(w, "dominique")["progress"].get<std::string>(), "-$5.75"));
    paidShift(w, "dominique", "meridian_talent");
    CHECK(done(w, "dominique"));
  }
}

TEST_CASE("goals: memories, promotions, people, messages and work calls") {
  {
    World w = World::createNew(oneGoal(Json{{"type", "memories_today"}, {"memory", "first_meeting"}}));
    REQUIRE(w.connect("dominique"));
    auto sol = w.createCharacter(solSheet());
    REQUIRE(sol);
    REQUIRE(w.connect(sol.value()));
    walkInto(w, "dominique", "heritage_coffee");
    walkInto(w, sol.value(), "heritage_coffee");
    CHECK(!done(w, "dominique"));
    REQUIRE(w.interact("dominique", "chat", sol.value()).value().at("first_meeting") == true);
    CHECK(done(w, "dominique"));
    CHECK(done(w, sol.value()));  // both remember meeting
  }
  {
    // Promotions count the promotion memories the World keeps; until then, the next title's hours.
    const auto db = patchedContent([](Json& doc, const std::string& file) {
      if (file == "founding_careers.json") {
        for (auto& c : doc["careers"]) {
          if (c["id"] == "recruiting") c["levels"][1]["hours_to_promote"] = 1;
        }
      }
      if (file == "goals.json") {
        doc["goals"]["daily"]["per_day"] = 1;
        doc["goals"]["daily"]["pool"] =
            Json::array({Json{{"id", "g"}, {"label", "G"}, {"check", {{"type", "promotions"}}}}});
      }
    });
    World w = World::createNew(db);
    REQUIRE(w.connect("dominique"));
    const Json before = aspirationOf(goalsOf(w, "dominique"), "get_promoted");
    CHECK(before["next"] == "Earn your next title");
    CHECK(before["detail"] == "Recruiting Manager: 0 of 1 hours");
    CHECK(!done(w, "dominique"));
    paidShift(w, "dominique", "meridian_talent");
    CHECK(done(w, "dominique"));
    const Json after = aspirationOf(goalsOf(w, "dominique"), "get_promoted");
    CHECK(after["steps"][0]["done"] == true);
    CHECK(after["next"] == "Two titles up");
  }
  {
    World w = World::createNew(oneGoal(Json{{"type", "people_interacted_today"}, {"min", 2}}));
    for (const char* id : {"dominique", "dax", "julian"}) REQUIRE(w.connect(id));
    for (const char* id : {"dominique", "dax", "julian"}) walkInto(w, id, "heritage_coffee");
    REQUIRE(w.interact("dominique", "chat", "dax"));
    CHECK(todayGoal(w, "dominique")["progress"] == "1/2");
    CHECK(!done(w, "dominique"));
    REQUIRE(w.interact("dominique", "chat", "julian"));
    CHECK(done(w, "dominique"));
    CHECK(!done(w, "dax"));  // being talked to isn't talking
  }
  {
    World w = World::createNew(oneGoal(Json{{"type", "messages_sent_today"}}));
    REQUIRE(w.connect("dominique"));
    REQUIRE(w.connect("dax"));
    REQUIRE(w.sendMessage("dax", "dominique", "Coffee?"));
    CHECK(!done(w, "dominique"));  // received, not sent
    REQUIRE(w.sendMessage("dominique", "dax", "Sure."));
    CHECK(done(w, "dominique"));
  }
  {
    World w = World::createNew(oneGoal(Json{{"type", "work_calls_today"}, {"best_only", true}}));
    REQUIRE(w.connect("dominique"));
    walkInto(w, "dominique", "meridian_talent");
    REQUIRE(w.startShift("dominique"));
    const Json d = w.workTasks("dominique").value()["decisions"][0];
    const WorkTaskDef* t = w.content().workTask(d["task"].get<std::string>());
    REQUIRE(t);
    int worst = 0;
    for (std::size_t i = 0; i < d["options"].size(); ++i) {
      for (const auto& o : t->options) {
        if (Json(o.label) == d["options"][i]["label"] && o.score < 1) worst = static_cast<int>(i);
      }
    }
    REQUIRE(w.answerWorkTask("dominique", d["task"].get<std::string>(), worst));
    CHECK(!done(w, "dominique"));  // a call, but not the best one
    w.advanceMinutes(150);
    const Json next = w.workTasks("dominique").value()["decisions"][1];
    const WorkTaskDef* t2 = w.content().workTask(next["task"].get<std::string>());
    int best = 0;
    for (std::size_t i = 0; i < next["options"].size(); ++i) {
      for (const auto& o : t2->options) {
        if (Json(o.label) == next["options"][i]["label"] && o.score >= 1) best = static_cast<int>(i);
      }
    }
    REQUIRE(w.answerWorkTask("dominique", next["task"].get<std::string>(), best));
    CHECK(done(w, "dominique"));
  }
}

TEST_CASE("goals: relationships, family, fame, songs, homes and savings") {
  World base = World::createNew(realContent());
  REQUIRE(base.connect("dominique"));
  auto with = [&](const Json& check, const std::function<void(WorldState&)>& change) {
    WorldState s = base.state();
    World before(oneGoal(check), s);
    change(s);
    World after(oneGoal(check), s);
    return std::pair<bool, bool>{done(before, "dominique"), done(after, "dominique")};
  };
  auto friends = with(Json{{"type", "relationships_at_least"}, {"dimension", "friendship"}, {"value", 95}, {"min", 1}},
                      [](WorldState& s) { s.relationships[{"dominique", "dax"}].dimensions["friendship"] = 96; });
  CHECK(!friends.first);
  CHECK(friends.second);
  // Only her own side counts: Dax's feelings about her aren't hers.
  auto theirs = with(Json{{"type", "relationships_at_least"}, {"dimension", "friendship"}, {"value", 95}},
                     [](WorldState& s) { s.relationships[{"dax", "dominique"}].dimensions["friendship"] = 96; });
  CHECK(!theirs.second);
  auto status = with(Json{{"type", "relationship_status"}, {"statuses", {"married"}}},
                     [](WorldState& s) { s.relationships[{"dominique", "dax"}].status = "married"; });
  CHECK(!status.first);
  CHECK(status.second);
  auto child = with(Json{{"type", "children"}}, [](WorldState& s) { s.characters.at("dax").parents = {"dominique"}; });
  CHECK(!child.first);
  CHECK(child.second);
  auto fame = with(Json{{"type", "fame_tier_at_least"}, {"tier", "local_name"}},
                   [](WorldState& s) { s.characters.at("dominique").fame = 20; });
  CHECK(!fame.first);
  CHECK(fame.second);
  auto owner = with(Json{{"type", "owns_home"}},
                    [](WorldState& s) { s.properties.at("willow_lane_2").owners = {"dominique"}; });
  CHECK(!owner.first);
  CHECK(owner.second);
  // Savings: her own bank account, against an amount or the cheapest home's down payment.
  auto rich = with(Json{{"type", "bank_at_least"}, {"cents", 5000000}}, [](WorldState& s) {
    REQUIRE(s.ledger.transfer(kEconomyAccount, bankAccountOf("dominique"), 5000000, "opening_balance", "test", s.now));
  });
  CHECK(!rich.first);
  CHECK(rich.second);
  {
    World w(oneGoal(Json{{"type", "bank_at_least"}, {"cents", 5000000}}), base.state());
    CHECK(todayGoal(w, "dominique")["progress"] == "$14500.00 of $50000.00");
  }
  auto down = with(Json{{"type", "bank_covers_down_payment"}}, [](WorldState& s) {
    REQUIRE(s.ledger.transfer(kEconomyAccount, bankAccountOf("dominique"), 2600000, "opening_balance", "test", s.now));
  });
  CHECK(!down.first);  // $14,500 of the $26,000 the cheapest condo needs down
  CHECK(down.second);
  {
    World w(oneGoal(Json{{"type", "bank_covers_down_payment"}}), base.state());
    CHECK(todayGoal(w, "dominique")["progress"] == "$14500.00 of $26000.00");
  }
  // Songs: released ones only.
  World w = World::createNew(oneGoal(Json{{"type", "songs_released"}}));
  REQUIRE(w.connect("dominique"));
  const Json song =
      Json::parse(R"({"title": "Lexington", "bpm": 96, "tracks": [{"instrument": "drums", "notes": [[0,36,1]]}]})");
  auto saved = w.saveSong("dominique", song, "");
  REQUIRE(saved);
  CHECK(!done(w, "dominique"));
  REQUIRE(w.releaseSong("dominique", saved.value()["id"].get<std::string>()));
  CHECK(done(w, "dominique"));
}

// ---- Aspirations and privacy ---------------------------------------------------------------
TEST_CASE("goals: aspirations come from a founder's data or the creator; untracked ones say why") {
  World w = World::createNew(realContent());
  REQUIRE(w.connect("dominique"));
  const Json dom = goalsOf(w, "dominique");
  CHECK(dom["from"] == "story");
  REQUIRE(dom["aspirations"].size() == 3);
  CHECK(dom["aspirations"][0]["id"] == "get_promoted");
  CHECK(dom["aspirations"][1]["id"] == "buy_a_home");
  CHECK(dom["aspirations"][2]["id"] == "make_friends");
  for (const auto& a : dom["aspirations"]) {
    CHECK(a["tracked"] == true);
    CHECK(!a["steps"].empty());
    CHECK(a["next"].is_string());
  }
  CHECK(aspirationOf(dom, "buy_a_home")["detail"].is_null());
  // Harper wants to give back: the game can't follow that yet, and says so instead of pretending.
  REQUIRE(w.connect("harper"));
  const Json give = aspirationOf(goalsOf(w, "harper"), "give_back");
  CHECK(give["tracked"] == false);
  CHECK(contains(give["reason"].get<std::string>(), "aren't recorded yet"));
  CHECK(!give.contains("steps"));
  // A made character's aspirations are the goals picked in the creator.
  Json sheet = solSheet();
  sheet["goals"] = {"start a business", "get rich"};
  auto sol = w.createCharacter(sheet);
  REQUIRE(sol);
  REQUIRE(w.connect(sol.value()));
  const Json mine = goalsOf(w, sol.value());
  CHECK(mine["from"] == "creator");
  REQUIRE(mine["aspirations"].size() == 2);
  CHECK(mine["aspirations"][0]["id"] == "start_a_business");
  CHECK(mine["aspirations"][0]["tracked"] == false);
  CHECK(mine["aspirations"][1]["id"] == "get_rich");
  CHECK(mine["aspirations"][1]["steps"][0]["progress"] == "$8000.00 of $50000.00");
}

TEST_CASE("goals: only ever your own, from your own records") {
  World w = World::createNew(oneGoal(Json{{"type", "ledger_today"}, {"kinds", {"salary"}}, {"direction", "in"}}));
  REQUIRE(w.connect("dominique"));
  REQUIRE(w.connect("dax"));
  paidShift(w, "dax", "parallax_labs");
  CHECK(done(w, "dax"));
  CHECK(!done(w, "dominique"));  // Dax's paycheck is his
  // Nothing about anyone else is in it, and the app needs you in the world, with a working phone.
  const std::string text = goalsOf(w, "dominique").dump();
  CHECK(!contains(text, "dax"));
  CHECK(!contains(text, "Dax"));
  CHECK(w.openPhoneApp("julian", "goals").error().code == "not_in_world");
  WorldState s = w.state();
  s.characters.at("dominique").phone.battery = 0;
  World dead(w.contentPtr(), s);
  CHECK(dead.openPhoneApp("dominique", "goals").error().code == "phone_dead");
}
