// The town's people (D-073): the four residents with art and the townspeople live in every new town, keep its places
// open in their hours, go out in the evening from data, walk a beat in uniform, move into older saves, and can't be
// made twice in the creator. The day is run the way a local town runs it (LocalTown::tick: the autopilot acts, then
// the world moves), in real seconds at the data's clock rate.

#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <map>
#include <set>

#include "TestSupport.h"
#include "core/Autopilot.h"
#include "core/Clock.h"
#include "core/Serialization.h"
#include "protocol/LocalTown.h"

using namespace livera;
using namespace livera::test;

namespace {

struct Town {
  World world;
  Autopilot pilot;
  std::vector<std::string> log;
  explicit Town(std::shared_ptr<const ContentDatabase> db = realContent()) : world(World::createNew(std::move(db))) {
    pilot.setLog([this](const std::string& line) {
      log.push_back(line);
      if (std::getenv("LIVERA_AUTOPILOT_LOG")) std::fprintf(stderr, "%s\n", line.c_str());
    });
  }
  // Everyone in data, as a new local town starts them.
  void startEveryone() {
    std::vector<CharacterId> ids;
    for (const auto& [id, def] : world.content().characters()) ids.push_back(id);
    pilot.start(world, ids);
  }
  // LocalTown::tick's order, in half-second ticks.
  void tick(double seconds = 0.5) {
    pilot.step(world, seconds);
    world.advanceRealTime(seconds);
    pilot.observe(world.drainEvents());
  }
  int minuteOfDay() const { return static_cast<int>(world.now() % kMinutesPerDay); }
  // Runs until the clock reads hh:mm today; `each` is called after every tick.
  void runTo(int hh, int mm, const std::function<void()>& each = {}) {
    const GameMinutes target = (world.now() / kMinutesPerDay) * kMinutesPerDay + hh * 60 + mm;
    while (world.now() < target) {
      tick();
      if (each) each();
    }
  }
  bool logged(const std::string& needle) const {
    return std::any_of(log.begin(), log.end(), [&](const std::string& l) { return l.find(needle) != std::string::npos; });
  }
  const CharacterState& c(const CharacterId& id) const { return *world.character(id); }
  bool onShift(const CharacterId& id) const { return c(id).online && c(id).career.shiftStartedAt.has_value(); }
  std::vector<CharacterId> insideNow(const LocationId& place) const {
    std::vector<CharacterId> out;
    for (const auto& [id, ch] : world.state().characters) {
      if (ch.online && ch.inside == place) out.push_back(id);
    }
    return out;
  }
};

// Who keeps each place open on a weekday, and when (their schedule's work line, data/characters). A worker is
// expected in from half an hour after their shift starts (the walk) to a quarter of an hour before it ends.
struct Shift {
  const char* who;
  const char* place;
  int from;
  int to;
};
const std::vector<Shift> kWeekdayShifts = {
    {"sol-rivera", "heritage_coffee", 5 * 60 + 45, 14 * 60 + 45},
    {"imani-clarke", "heritage_coffee", 11 * 60, 20 * 60},
    {"bernie-walsh", "copper_tap", 15 * 60 + 45, 23 * 60 + 30},
    {"theo-grant", "greenleaf_market", 7 * 60, 15 * 60 + 30},
    {"hamid-sultani", "greenleaf_market", 14 * 60, 22 * 60},
    {"rosa-delgado", "thread_co", 9 * 60, 17 * 60},
    {"noor-haddad", "thread_co", 13 * 60, 21 * 60},
    {"jean-baptiste-moreau", "lumiere_bistro", 16 * 60 + 30, 23 * 60 + 15},
    {"ngozi-adeyemi", "riverdale_clinic", 8 * 60 + 30, 17 * 60 + 30},
    {"tess-osei", "livera_general", 7 * 60, 15 * 60},
    {"rafael-mendes", "livera_general", 15 * 60 + 30, 21 * 60 + 45},
    {"samuel-osei", "founders_school", 7 * 60 + 30, 15 * 60 + 30},
    {"kai-morgan", "low_end_studios", 14 * 60, 22 * 60},
    {"evelyn-park", "courthouse", 8 * 60 + 30, 17 * 60 + 30},  // the bench (D-083)
};
const std::vector<std::string> kPolice = {"aisha-farah", "marcus-bell"};

}  // namespace

TEST_CASE("town life: a new town on autopilot keeps its places staffed, an officer on duty and the bar full at night") {
  Town t;
  t.startEveryone();
  CHECK(t.pilot.characters().size() == t.world.content().characters().size());
  int officerOutdoors = 0;
  const auto watch = [&] {
    for (const auto& id : kPolice) {
      if (t.onShift(id) && t.c(id).inside.empty()) ++officerOutdoors;
    }
  };
  REQUIRE(toDateTime(t.world.now()).weekday == 0);  // a new town opens on a Monday
  for (const int at : {10 * 60, 13 * 60, 19 * 60, 21 * 60}) {
    t.runTo(at / 60, at % 60, watch);
    const std::string when = formatDateTime(t.world.now());
    // Every staffed place that's open has its worker in it, on shift.
    std::set<std::string> staffed;
    for (const auto& s : kWeekdayShifts) {
      if (at < s.from + 30 || at > s.to - 15) continue;
      const LocationDef* place = t.world.content().location(s.place);
      REQUIRE(place);
      staffed.insert(s.place);
      const bool there = t.c(s.who).online && t.c(s.who).inside == s.place && t.onShift(s.who);
      if (!there)
        std::fprintf(stderr, "    %s: %s isn't working at %s (inside '%s', online %d, on shift %d)\n", when.c_str(), s.who,
                     s.place, t.c(s.who).inside.c_str(), t.c(s.who).online, t.onShift(s.who));
      CHECK(there);
    }
    // ... and every place the reviews found empty is staffed whenever it's open (Body & Balance is still being built).
    for (const char* place : {"heritage_coffee", "copper_tap", "greenleaf_market", "lumiere_bistro", "riverdale_clinic",
                              "livera_general", "founders_school", "thread_co"}) {
      const LocationDef* loc = t.world.content().location(place);
      if (t.world.locationStatus(*loc) != "open") continue;
      const bool someone = staffed.count(place) > 0;
      if (!someone) std::fprintf(stderr, "    %s: %s is open with nobody scheduled\n", when.c_str(), place);
      CHECK(someone);
    }
    CHECK(t.world.locationStatus(*t.world.content().location("body_balance")) == "under_construction");
    // A police officer is on duty, in uniform (D-069).
    const bool duty = std::any_of(kPolice.begin(), kPolice.end(), [&](const CharacterId& id) { return t.onShift(id); });
    if (!duty) std::fprintf(stderr, "    %s: no officer on duty\n", when.c_str());
    CHECK(duty);
    // In the evening the Copper Tap has people in it besides whoever works there.
    if (at >= 19 * 60) {
      std::vector<CharacterId> patrons;
      for (const auto& id : t.insideNow("copper_tap")) {
        if (!t.onShift(id)) patrons.push_back(id);
      }
      std::string who;
      for (const auto& id : patrons) who += id + " ";
      std::fprintf(stderr, "    %s: at the Copper Tap: %s\n", when.c_str(), who.c_str());
      CHECK(!patrons.empty());
    }
  }
  // The beat: officers walked it in uniform, out of the station, and the shift carried on.
  CHECK(officerOutdoors > 0);
  CHECK(t.logged("starts a round of the beat"));
  CHECK(t.logged("back at Livéra Police Station from the beat"));
  // Someone took an evening out from data tonight, or their own Monday habit (Bo's darts, Theo's Copper Tap).
  CHECK(t.logged("[evening out: ") || t.logged("Darts at The Copper Tap"));
  CHECK(t.world.state().ledger.sumOfBalances() == 0);
}

TEST_CASE("town life: an evening plan fills a free evening only, from the character's own data, the same all day") {
  // One plan everyone suits, every day, for sure: whoever's evening is free goes; a schedule that books the evening wins.
  auto db = patchedContent([](Json& doc, const std::string& file) {
    if (file != "town_life.json") return;
    doc["evening_plans"] = Json::parse(R"([{"id": "everyone", "label": "Everyone at the Copper Tap", "place": "copper_tap",
      "days": ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"], "from": "19:00",
      "minutes": 120, "chance": 1}])");
  });
  Town t(db);
  t.startEveryone();
  t.runTo(12, 0);
  const Json st = t.pilot.status();
  CHECK(st["dax"]["tonight"] == "everyone");          // 19:00 "Home, cooking": free
  CHECK(st["maya"]["tonight"] == "");                 // 18:00 "Community dinner": her own evening
  CHECK(st["bernie-walsh"]["tonight"] == "");         // behind the bar until 23:30
  CHECK(st["jean-baptiste-moreau"]["tonight"] == "");
  // Nobody suits a plan whose conditions nobody meets.
  auto none = patchedContent([](Json& doc, const std::string& file) {
    if (file != "town_life.json") return;
    doc["evening_plans"] = Json::parse(R"([{"id": "nobody", "label": "Nobody", "place": "copper_tap", "days": ["monday"],
      "from": "19:00", "minutes": 120, "who": {"personality_min": {"patience": 101}}, "chance": 1}])");
  });
  Town n(none);
  n.startEveryone();
  n.runTo(9, 0);
  const Json status = n.pilot.status();  // a named copy: items() must not outlive its json
  for (const auto& [id, s] : status.items()) CHECK(s["tonight"] == "");
}

TEST_CASE("town life: a plan with a partner is drawn once per pair, so both go") {
  auto db = patchedContent([](Json& doc, const std::string& file) {
    if (file != "town_life.json") return;
    doc["evening_plans"] = Json::parse(R"([{"id": "date", "label": "Date night at Lumière", "place": "lumiere_bistro",
      "offer": "dinner", "days": ["monday"], "from": "19:30", "minutes": 120, "with": "partner", "chance": 1}])");
  });
  Town t(db);
  t.startEveryone();
  t.runTo(16, 0);
  const Json st = t.pilot.status();
  CHECK(st["samuel-osei"]["tonight"] == "date");
  CHECK(st["tess-osei"]["tonight"] == "date");
  CHECK(st["dax"]["tonight"] == "");  // single
  t.runTo(20, 30);
  const auto inside = t.insideNow("lumiere_bistro");
  CHECK(std::find(inside.begin(), inside.end(), "samuel-osei") != inside.end());
  CHECK(std::find(inside.begin(), inside.end(), "tess-osei") != inside.end());
  CHECK(t.logged("buys Three-course dinner at Lumière Bistro (Date night at Lumière with"));
}

TEST_CASE("town life content: evening plans and patrols are checked when content loads") {
  const auto bad = [](const std::string& plans, const std::string& patrols = "") {
    auto r = [&]() -> std::string {
      try {
        (void)patchedContent([&](Json& doc, const std::string& file) {
          if (file != "town_life.json") return;
          if (!plans.empty()) doc["evening_plans"] = Json::parse(plans);
          if (!patrols.empty()) doc["patrols"] = Json::parse(patrols);
        });
        return "";
      } catch (const std::exception& e) {
        return e.what();
      }
    }();
    return r;
  };
  const std::string ok = R"({"id": "x", "label": "X", "place": "copper_tap", "days": ["monday"], "from": "19:00",
    "minutes": 120, "chance": 0.5)";
  CHECK(bad("[" + ok + "}]").empty());
  CHECK(bad("[" + ok + ", \"colour\": \"red\"}]").find("unknown key 'colour'") != std::string::npos);
  CHECK(bad(R"([{"id": "x", "label": "X", "place": "nowhere", "days": ["monday"], "from": "19:00", "chance": 0.5}])")
            .find("unknown place") != std::string::npos);
  CHECK(bad(R"([{"id": "x", "label": "X", "place": "maple_court_1a", "days": ["monday"], "from": "19:00", "chance": 0.5}])")
            .find("isn't public") != std::string::npos);
  CHECK(bad("[" + ok + ", \"activity\": \"karaoke\"}]").find("no activity 'karaoke'") != std::string::npos);
  CHECK(bad("[" + ok + ", \"offer\": \"latte\"}]").find("no offer 'latte'") != std::string::npos);
  CHECK(bad(R"([{"id": "x", "label": "X", "place": "the_underpass", "offer": "glint", "days": ["monday"], "from": "20:00",
    "chance": 0.5}])").find("contraband") != std::string::npos);
  CHECK(bad(R"([{"id": "x", "label": "X", "place": "copper_tap", "days": ["funday"], "from": "19:00", "chance": 0.5}])")
            .find("unknown day") != std::string::npos);
  CHECK(bad(R"([{"id": "x", "label": "X", "place": "copper_tap", "days": ["monday"], "from": "12:00", "chance": 0.5}])")
            .find("from 17:00") != std::string::npos);
  CHECK(bad(R"([{"id": "x", "label": "X", "place": "copper_tap", "days": ["monday"], "from": "19:00", "minutes": 10,
    "chance": 0.5}])").find("minutes are 30-240") != std::string::npos);
  CHECK(bad("[" + ok + ", \"who\": {\"personality_min\": {\"charm\": 50}}}]").find("unknown stat 'charm'") !=
        std::string::npos);
  CHECK(bad("[" + ok + ", \"who\": {\"interests_any\": [\"skydiving\"]}}]").find("unknown interest") != std::string::npos);
  CHECK(bad("[" + ok + ", \"with\": \"cousin\"}]").find("friend or partner") != std::string::npos);
  CHECK(bad("[" + ok + ", \"min_friendship\": 40}]").find("evening with a friend") != std::string::npos);
  CHECK(bad(R"([{"id": "x", "label": "X", "place": "copper_tap", "days": ["monday"], "from": "19:00", "chance": 0}])")
            .find("chance") != std::string::npos);
  CHECK(bad("[" + ok + "}, " + ok + "}]").find("unique id") != std::string::npos);
  // Patrols: a career that works outdoors, from one of its workplaces, past public places.
  const std::string beat = R"("beat": ["heritage_coffee", "founders_park"])";
  CHECK(bad("", R"([{"career": "police", "base": "police_station", )" + beat + "}]").empty());
  CHECK(bad("", R"([{"career": "astronaut", "base": "police_station", )" + beat + "}]").find("unknown career") !=
        std::string::npos);
  CHECK(bad("", R"([{"career": "cafe", "base": "heritage_coffee", )" + beat + "}]").find("doesn't work outdoors") !=
        std::string::npos);
  CHECK(bad("", R"([{"career": "police", "base": "heritage_coffee", )" + beat + "}]").find("isn't one of its workplaces") !=
        std::string::npos);
  CHECK(bad("", R"([{"career": "police", "base": "police_station", "beat": ["heritage_coffee"]}])").find("two places") !=
        std::string::npos);
  CHECK(bad("", R"([{"career": "police", "base": "police_station", "beat": ["heritage_coffee", "whitaker_capital"]}])")
            .find("isn't public") != std::string::npos);
  CHECK(bad("", R"([{"career": "police", "base": "police_station", )" + beat + R"(}, {"career": "police",
    "base": "police_station", )" + beat + "}]").find("one patrol per career") != std::string::npos);
}

TEST_CASE("cast content: casts, shared homes and starting partners are checked") {
  const auto bad = [](const std::function<void(Json&, const std::string&)>& patch) -> std::string {
    try {
      (void)patchedContent(patch);
      return "";
    } catch (const std::exception& e) {
      return e.what();
    }
  };
  CHECK(bad([](Json& doc, const std::string& file) {
          if (file == "maya.json") doc["characters"][0]["cast"] = "extra";
        }).find("cast is founder, resident or townsperson") != std::string::npos);
  // A status only one of them states.
  CHECK(bad([](Json& doc, const std::string& file) {
          if (file == "tess-osei.json") doc["characters"][0]["relationships"][0].erase("status");
        }).find("must name the same status back") != std::string::npos);
  CHECK(bad([](Json& doc, const std::string& file) {
          if (file != "tess-osei.json" && file != "samuel-osei.json") return;
          doc["characters"][0]["relationships"][0]["status"] = "situationship";
        }).find("dating, engaged or married") != std::string::npos);
  // Three in a one-bedroom.
  CHECK(bad([](Json& doc, const std::string& file) {
          if (file != "aisha-farah.json" && file != "marcus-bell.json" && file != "bernie-walsh.json") return;
          doc["characters"][0]["home"]["property"] = "maple_court_3a";
          doc["characters"][0]["spawn_location"] = "maple_court_3a";
        }).find("sleeps 2") != std::string::npos);
}

TEST_CASE("creator: a name someone in the town already has is refused (name_taken)") {
  World w = World::createNew(realContent());
  std::ifstream in(std::string(LIVERA_DATA_DIR) + "/../scripts/demo/nico_vale.json");
  const Json sheet = Json::parse(in);
  for (const auto& [first, last] : std::vector<std::pair<std::string, std::string>>{
           {"Kai", "Morgan"}, {"sol", "RIVERA"}, {"Maya", "Bennett"}, {"Bernie", "Walsh"}}) {
    Json s = sheet;
    s["first_name"] = first;
    s["last_name"] = last;
    auto r = w.createCharacter(s);
    REQUIRE(!r);
    CHECK(r.error().code == "name_taken");
  }
  CHECK(w.state().createdCharacters.empty());
  Json s = sheet;
  s["first_name"] = "Kai";
  s["last_name"] = "Moreno";  // a first name in common is fine
  CHECK(w.createCharacter(s));
}

namespace {

// The content as it was before D-073: no residents or townspeople in data, none of their homes (nor those homes'
// rooms), no town life.
std::shared_ptr<const ContentDatabase> beforeTheTownspeople() {
  std::set<std::string> theirHomes;
  std::ifstream in(std::filesystem::path(LIVERA_DATA_DIR) / "world" / "town_homes.json");
  const Json townHomes = Json::parse(in, nullptr, true, true);
  for (const auto& loc : townHomes.at("locations")) theirHomes.insert(loc.at("id").get<std::string>());
  return patchedContent([&](Json& doc, const std::string& file) {
    if (file == "town_homes.json" || file == "town_life.json") {
      doc = Json::object();
      return;
    }
    if (doc.contains("interior")) {
      const Json& places = doc["interior"]["places"];
      const auto theirs = [&](const Json& p) { return theirHomes.count(p.get<std::string>()) > 0; };
      if (std::any_of(places.begin(), places.end(), theirs)) doc = Json::object();
      return;
    }
    if (!doc.contains("characters")) return;
    const std::string cast = doc["characters"][0].value("cast", "");
    if (cast == "resident" || cast == "townsperson") {
      doc = Json::object();
      return;
    }
    // The founders' own data didn't name the new people then.
    Json kept = Json::array();
    for (const auto& r : doc["characters"][0]["relationships"]) {
      const std::string to = r["to"].get<std::string>();
      if (to.find('-') == std::string::npos) kept.push_back(r);
    }
    doc["characters"][0]["relationships"] = kept;
  });
}

}  // namespace

TEST_CASE("saves: an older save loads with the town's people moved in, homes, ties and memories from data") {
  Json old;
  {
    World w = World::createNew(beforeTheTownspeople());
    CHECK(w.character("bernie-walsh") == nullptr);
    REQUIRE(w.connect("dax"));
    walkInto(w, "dax", "heritage_coffee");
    REQUIRE(w.buy("dax", "latte", "card"));
    w.disconnect("dax");
    old = worldStateToJson(w.state());
  }
  auto state = worldStateFromJson(old);
  REQUIRE(state);
  const auto daxBefore = state.value().relationships.size();
  World w(realContent(), std::move(state).value());
  for (const auto& [id, def] : w.content().characters()) {
    REQUIRE(w.character(id));
    if (def.cast != "founder") CHECK(w.character(id)->inside == def.spawnLocation);
  }
  CHECK(w.state().relationships.size() > daxBefore);
  // Their homes, as a new town gives them, shared where the data says.
  CHECK(w.state().properties.at("maple_court_2c").residents ==
        (std::vector<CharacterId>{"samuel-osei", "tess-osei"}));
  CHECK(w.state().properties.at("riverside_lofts_4").residents ==
        (std::vector<CharacterId>{"kai-morgan", "theo-grant"}));
  // Their ties both ways, and a marriage, as data says; the founders' own records from play are untouched.
  REQUIRE(w.relationship("kai-morgan", "andre"));
  CHECK(w.relationshipValue("kai-morgan", "andre", "respect") == 78);
  CHECK(w.relationship("samuel-osei", "tess-osei")->status == "married");
  CHECK(w.relationship("tess-osei", "samuel-osei")->status == "married");
  bool memory = false;
  for (const Memory* m : w.memoriesOf("bernie-walsh")) memory |= m->info.find("Dorchester") != std::string::npos;
  CHECK(memory);
  CHECK(w.state().ledger.sumOfBalances() == 0);
  // The creator's homes stay free for made characters.
  for (const char* free : {"maple_court_2a", "maple_court_2b", "maple_court_4a", "maple_court_4c", "lexington_0807",
                           "lexington_1502"})
    CHECK(w.state().properties.at(free).tenant.empty());
  // Loading it again changes nothing more.
  const auto rels = w.state().relationships.size(), mems = w.state().memories.size();
  auto again = worldStateFromJson(worldStateToJson(w.state()));
  REQUIRE(again);
  World w2(realContent(), std::move(again).value());
  CHECK(w2.state().relationships.size() == rels);
  CHECK(w2.state().memories.size() == mems);
}

TEST_CASE("saves: a Kai Morgan made in the creator before D-073 becomes the town's Kai, keeping what he did") {
  Json old;
  CharacterId kai;
  Cents bank = 0;
  {
    World w = World::createNew(beforeTheTownspeople());
    std::ifstream in(std::string(LIVERA_DATA_DIR) + "/../scripts/demo/nico_vale.json");
    Json sheet = Json::parse(in);
    sheet["first_name"] = "Kai";
    sheet["last_name"] = "Morgan";
    auto id = w.createCharacter(sheet);
    REQUIRE(id);
    kai = id.value();
    REQUIRE(kai == "kai-morgan");
    REQUIRE(w.connect(kai));
    walkInto(w, kai, "heritage_coffee");
    REQUIRE(w.buy(kai, "latte", "card"));
    w.disconnect(kai);
    bank = w.state().ledger.balance(bankAccountOf(kai));
    old = worldStateToJson(w.state());
  }
  protocol::LocalTown town(realContent());
  REQUIRE(town.load(old));
  const World& w = town.world();
  CHECK(w.state().createdCharacters.empty());
  CHECK(w.definition("kai-morgan")->cast == "resident");
  CHECK(w.state().ledger.balance(bankAccountOf("kai-morgan")) == bank);  // what he did stands
  bool arrived = false;
  for (const Memory* m : w.memoriesOf("kai-morgan")) arrived |= m->type == "life_change";  // the creator's arrival
  CHECK(arrived);
  CHECK(w.relationship("kai-morgan", "andre"));  // his ties from data, which he had no record of
  // One Kai in the pick list.
  int kais = 0;
  const Json list = town.characters().value()["characters"];
  for (const auto& c : list) kais += c["id"] == "kai-morgan" ? 1 : 0;
  CHECK(kais == 1);
}

TEST_CASE("saves: a new town with the whole cast round-trips, and the pick list says who is who") {
  protocol::LocalTown town(realContent());
  REQUIRE(town.found());
  REQUIRE(town.autopilotStart());
  for (int i = 0; i < 60; ++i) (void)town.tick(0.5);
  auto saved = town.save();
  REQUIRE(saved);
  protocol::LocalTown again(realContent());
  REQUIRE(again.load(saved.value()));
  CHECK(again.world().state().characters.size() == town.world().state().characters.size());
  CHECK(again.world().state().relationships.size() == town.world().state().relationships.size());
  CHECK(again.world().state().memories.size() == town.world().state().memories.size());
  CHECK(again.world().state().ledger.sumOfBalances() == 0);
  std::map<std::string, int> casts;
  const Json list = again.characters().value()["characters"];
  for (const auto& c : list) ++casts[c["cast"].get<std::string>()];
  CHECK(casts["founder"] == 11);
  CHECK(casts["resident"] == 4);
  CHECK(casts["townsperson"] == 13);  // the twelve of D-073 and the judge (D-083)
}
