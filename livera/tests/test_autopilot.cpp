// The autopilot (src/core/Autopilot): founders nobody plays live their day through World commands.
// Everything here is checked through `look` and the autopilot's own counters, the way a client or
// the server log would see it; the only private peeks are the ones other tests already take
// (online, inside).

#include <cstdlib>
#include <cstdio>

#include "TestSupport.h"
#include "core/Autopilot.h"
#include "core/Clock.h"

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
  // Real time passes in half-second ticks, exactly as the server drives it: the world, then the autopilot.
  void tick(double seconds = 0.5) {
    world.advanceRealTime(seconds);
    pilot.step(world, seconds);
    pilot.observe(world.drainEvents());
  }
  // Ticks until `done` holds or `minutes` of game time have passed (the real time they stand for); true if it held.
  bool runUntil(double minutes, const std::function<bool()>& done) {
    const double seconds = minutes / world.content().sim().minutesPerRealSecond;
    for (double t = 0; t < seconds; t += 0.5) {
      if (done()) return true;
      tick();
    }
    return done();
  }
  Json you(const CharacterId& id) const {
    auto r = world.look(id);
    return r ? r.value()["you"] : Json();
  }
  int stat(const CharacterId& id, const char* key) const {
    const Json st = pilot.status();
    return st.contains(id) ? st[id]["stats"].value(key, 0) : -1;
  }
  bool logged(const std::string& needle, std::size_t from = 0) const {
    for (std::size_t i = from; i < log.size(); ++i) {
      if (log[i].find(needle) != std::string::npos) return true;
    }
    return false;
  }
  // Skips the clock to `hour`:`minute` today (or tomorrow if that has passed), as dev_advance would.
  void skipTo(int hour, int minute) {
    const GameMinutes target = (world.now() / kMinutesPerDay) * kMinutesPerDay + hour * 60 + minute;
    const GameMinutes at = target > world.now() ? target : target + kMinutesPerDay;
    world.advanceMinutes(at - world.now());
  }
};

// Dominique's weekday, with her schedule's first line replaced so she heads for Heritage Coffee at 07:30 and a
// coffee shop that opens at `opensAt`.
std::shared_ptr<const ContentDatabase> coffeeContent(int opensAt) {
  return patchedContent([&](Json& doc, const std::string& file) {
    if (file == "dominique.json") {
      doc["characters"][0]["profile"]["schedule"]["weekdays"] = Json::array(
          {Json{{"time", "07:30"}, {"activity", "Coffee at Heritage Coffee"}},
           Json{{"time", "09:00"}, {"activity", "Meridian Talent Partners"}}});
    }
    if (file == "founding_town.json") {
      for (auto& loc : doc["locations"]) {
        if (loc["id"] == "heritage_coffee") loc["hours"] = Json::array({opensAt, 20});
      }
    }
  });
}

}  // namespace

TEST_CASE("autopilot: a weekday morning: Dominique leaves home, reaches her workplace and starts a shift") {
  Town t;
  t.pilot.start(t.world, {"dominique"});
  REQUIRE(t.pilot.runs("dominique"));
  CHECK(t.world.isScripted("dominique"));
  CHECK(t.world.playedBy("dominique") == "autopilot");
  REQUIRE(t.world.look("dominique"));  // in the world at 07:00 on a Monday: her routine says awake
  CHECK(t.you("dominique")["inside"] == "lexington_1204");
  CHECK(t.logged("enters the world as Dominique"));

  // Her 06:30 line is "Gym or a run in Founders Park": the gym is still being built, so the park.
  CHECK(t.runUntil(90, [&] { return t.you("dominique")["inside"] == ""; }));
  // Her 08:30 line names her workplace: she walks there, goes in and clocks on.
  const bool working = t.runUntil(200, [&] { return t.you("dominique").value("on_shift", false); });
  CHECK(working);
  CHECK(t.logged("walks to Founders Park"));
  CHECK(t.logged("Go for a jog"));
  CHECK(t.you("dominique")["inside"] == "meridian_talent");
  const DateTime now = toDateTime(t.world.now());
  CHECK(now.hour >= 8);
  CHECK(now.hour < 10);
  CHECK(t.logged("starts a shift at Meridian Talent Partners"));
  // No command floods: one command per character every two seconds at most, over the whole morning.
  const int commands = t.stat("dominique", "commands");
  CHECK(commands > 0);
  CHECK(commands <= static_cast<int>((t.world.now() - 7 * 60) / 2) + 2);
  CHECK(t.stat("dominique", "refusals") == 0);
}

TEST_CASE("autopilot: a closed shop is not entered: she waits at the door when it opens soon, else stays home") {
  {
    Town t(coffeeContent(8));  // opens at 08:00: she leaves for 07:30 and waits at the door
    t.pilot.start(t.world, {"dominique"});
    CHECK(t.runUntil(120, [&] { return t.logged("is closed; waits at the door"); }));
    CHECK(t.you("dominique")["inside"] == "");
    CHECK(toDateTime(t.world.now()).hour < 8);
    const int entersBefore = t.stat("dominique", "enters");
    CHECK(t.runUntil(40, [&] { return t.you("dominique")["inside"] == "heritage_coffee"; }));
    const DateTime now = toDateTime(t.world.now());
    CHECK(now.hour == 8);
    CHECK(now.minute < 5);
    CHECK(t.stat("dominique", "enters") == entersBefore + 1);
    CHECK(t.stat("dominique", "refusals") < 6);  // a few tries at the door, each after a wait: no spin
  }
  {
    Town t(coffeeContent(9));  // opens at 09:00, too long to wait: the visit is skipped and she stays home
    t.pilot.start(t.world, {"dominique"});
    CHECK(!t.runUntil(110, [&] { return t.you("dominique")["inside"] != "lexington_1204"; }));
    CHECK(toDateTime(t.world.now()).hour == 8);
    CHECK(t.logged("skips Heritage Coffee"));
    CHECK(t.stat("dominique", "enters") == 0);
    CHECK(t.stat("dominique", "walks") == 0);
  }
}

TEST_CASE("autopilot: a refusal backs off: in a cell nothing is tried again within the backoff, then she re-plans") {
  auto db = patchedContent([](Json& doc, const std::string& file) {
    if (file == "crimes.json") {
      for (auto& c : doc["crime"]["crimes"]) {
        if (c["id"] == "shoplifting") c["detection"] = 1.0;
      }
    }
  });
  Town t(db);
  t.pilot.start(t.world, {"dominique"});
  // The world puts her in a cell: caught shoplifting at the coffee shop (the test drives her there itself).
  walkInto(t.world, "dominique", "heritage_coffee");
  auto caught = t.world.steal("dominique", "drip");
  REQUIRE(caught);
  REQUIRE(caught.value().value("caught", false));
  CHECK(t.world.inJail("dominique"));
  CHECK(t.you("dominique")["inside"] == "police_station");

  CHECK(t.runUntil(30, [&] { return t.stat("dominique", "refusals") == 1; }));
  const int commandsAtRefusal = t.stat("dominique", "commands");
  CHECK(t.logged("waits to be let out"));
  // Backoff: no second command within the next 15 real seconds (the jail wait is 21-39 s).
  t.runUntil(15, [] { return false; });
  CHECK(t.stat("dominique", "commands") == commandsAtRefusal);
  CHECK(t.you("dominique")["inside"] == "police_station");

  // Let out (a time skip past the sentence): she leaves the station and gets on with her day at work.
  t.world.advanceMinutes(241);
  CHECK(!t.world.inJail("dominique"));
  CHECK(t.runUntil(120, [&] { return t.you("dominique")["inside"] != "police_station"; }));
  CHECK(t.runUntil(200, [&] { return t.you("dominique").value("on_shift", false); }));
  CHECK(t.you("dominique")["inside"] == "meridian_talent");
}

TEST_CASE("autopilot: bedtime leaves the world and the morning brings her back, labelled") {
  Town t;
  t.pilot.start(t.world, {"dominique"});
  REQUIRE(t.runUntil(200, [&] { return t.you("dominique").value("on_shift", false); }));
  t.skipTo(22, 35);  // past her bedtime (22:30): she clocks off, goes home, and leaves the world (D-050)
  const std::size_t logMark = t.log.size();
  CHECK(t.runUntil(150, [&] { return !t.world.look("dominique"); }));
  CHECK(!t.world.character("dominique")->online);
  CHECK(!t.world.isScripted("dominique"));
  CHECK(t.logged("ends the shift", logMark));
  CHECK(t.logged("goes to bed (at home)", logMark));
  CHECK(t.pilot.runs("dominique"));  // still hers to play tomorrow
  CHECK(t.pilot.status()["dominique"]["asleep"] == true);

  t.skipTo(5, 40);  // her wake time is 05:30
  CHECK(t.runUntil(40, [&] { return t.world.look("dominique").ok(); }));
  CHECK(t.world.character("dominique")->online);
  CHECK(t.world.playedBy("dominique") == "autopilot");
  CHECK(t.you("dominique")["inside"] == "lexington_1204");
  CHECK(toDateTime(t.world.now()).weekday == 1);  // Tuesday
}

TEST_CASE("autopilot: release stops the commands for that character and a person can connect") {
  Town t;
  t.pilot.start(t.world, {"dominique", "dax"});
  CHECK(t.pilot.characters().size() == 2);
  t.runUntil(10, [] { return false; });
  t.pilot.release(t.world, "dominique");
  CHECK(!t.pilot.runs("dominique"));
  CHECK(t.pilot.runs("dax"));
  CHECK(!t.world.isScripted("dominique"));
  CHECK(t.world.character("dominique")->online);  // left where she stands, still in the world
  CHECK(!t.pilot.status().contains("dominique"));
  const std::size_t logMark = t.log.size();
  t.runUntil(30, [] { return false; });
  CHECK(!t.logged(" dominique ", logMark));  // not a word about her since: she's a person's now
  CHECK(t.logged(" dax ", logMark));
  CHECK(t.world.connect("dominique"));  // the person takes over
  CHECK(t.world.look("dominique"));
  t.pilot.release(t.world, "nobody");  // a no-op

  t.pilot.stop(t.world);
  CHECK(!t.pilot.runs("dax"));
  CHECK(!t.world.character("dax")->online);
  CHECK(!t.world.isScripted("dax"));
  CHECK(t.world.character("dominique")->online);  // stop only touches its own
}

TEST_CASE("autopilot: asks addressed to it are declined, and it never takes someone already in the world") {
  Town t;
  REQUIRE(t.world.connect("dax"));  // a person is Dax
  t.pilot.start(t.world, {"dominique", "dax"});
  CHECK(t.pilot.runs("dominique"));
  CHECK(!t.pilot.runs("dax"));
  CHECK(!t.world.isScripted("dax"));
  // Dominique's morning takes her to Founders Park; Dax (the test) meets her there and asks her out.
  REQUIRE(t.runUntil(120, [&] { return t.logged("Go for a jog"); }));  // she's at the park's door now
  walkTo(t.world, "dax", "founders_park");
  (void)t.world.drainEvents();
  auto ask = t.world.request("dax", "date", "dominique");
  if (!ask) std::fprintf(stderr, "    ask refused: %s (%s)\n", ask.error().code.c_str(), ask.error().message.c_str());
  REQUIRE(ask);
  t.pilot.observe(t.world.drainEvents());
  CHECK(t.runUntil(10, [&] { return t.stat("dominique", "asks_declined") == 1; }));
  CHECK(t.logged("declines a 'date' ask from dax"));
  CHECK(t.stat("dominique", "asks_declined") == 1);
}

// ---- Manners (D-064) ---------------------------------------------------------------------------

namespace {

// Dax's weekday starts at Heritage Coffee at 07:00 (it opens at 06:00) and stays there till 10:00, so a person can
// meet him there; `chat` sets the chance he starts a chat with someone he knows (base, nothing else).
std::shared_ptr<const ContentDatabase> cafeContent(double chat, const Json& asks = Json()) {
  return patchedContent([=](Json& doc, const std::string& file) {
    if (file == "dax.json")
      doc["characters"][0]["profile"]["schedule"]["weekdays"] =
          Json::array({Json{{"time", "07:00"}, {"activity", "Heritage Coffee"}},
                       Json{{"time", "13:00"}, {"activity", "Parallax Labs"}, {"work", true}}});
    if (file == "julian.json")
      doc["characters"][0]["profile"]["schedule"]["weekdays"] =
          Json::array({Json{{"time", "07:00"}, {"activity", "Heritage Coffee"}},
                       Json{{"time", "13:00"}, {"activity", "Parallax Labs"}, {"work", true}}});
    if (file == "manners.json") {
      Json& c = doc["autopilot_manners"]["chat"];
      c["base"] = chat;
      c["per_trait"] = 0.0;
      c["per_friendship"] = 0.0;
      if (!asks.is_null()) doc["autopilot_manners"]["asks"] = asks;
    }
  });
}

std::vector<Json> heard(const std::vector<WorldEvent>& events, const CharacterId& listener, const CharacterId& from) {
  std::vector<Json> out;
  for (const auto& e : events) {
    if (e.type == "speech" && e.recipients == std::vector<CharacterId>{listener} && e.data.value("from", "") == from)
      out.push_back(e.data);
  }
  return out;
}

int interactionsFrom(const std::vector<WorldEvent>& events, const CharacterId& to, const CharacterId& from) {
  int n = 0;
  for (const auto& e : events)
    n += e.type == "interaction" && e.recipients.front() == to && e.data.value("from", "") == from;
  return n;
}

// A town where every event is kept (the autopilot still sees them first, as the server's routing does).
struct WatchedTown : Town {
  std::vector<WorldEvent> events;
  using Town::Town;
  void tick(double seconds = 0.5) {
    world.advanceRealTime(seconds);
    pilot.step(world, seconds);
    auto batch = world.drainEvents();
    pilot.observe(batch);
    for (auto& e : batch) events.push_back(std::move(e));
  }
  bool runUntil(double minutes, const std::function<bool()>& done) {  // as above: game minutes
    const double seconds = minutes / world.content().sim().minutesPerRealSecond;
    for (double t = 0; t < seconds; t += 0.5) {
      if (done()) return true;
      tick();
    }
    return done();
  }
};

}  // namespace

TEST_CASE("autopilot manners: a founder greets a person once per game day, by name only if they know them") {
  WatchedTown t(cafeContent(0.0));
  REQUIRE(t.world.connect("dominique"));
  t.pilot.start(t.world, {"dax"});
  REQUIRE(t.runUntil(200, [&] { return t.you("dax").value("inside", "") == "heritage_coffee"; }));
  walkInto(t.world, "dominique", "heritage_coffee");
  REQUIRE(t.runUntil(20, [&] { return !heard(t.events, "dominique", "dax").empty(); }));
  const auto hi = heard(t.events, "dominique", "dax");
  REQUIRE(hi.size() == 1);
  CHECK(hi[0]["text"].get<std::string>().find("Dominique") != std::string::npos);  // they know each other
  CHECK(t.logged("greet"));
  CHECK(t.stat("dax", "greetings") == 1);
  // A stranger is greeted without a name (while Dax is still at the café: the walk over takes game time).
  std::ifstream in(std::string(LIVERA_DATA_DIR) + "/../scripts/demo/sol_rivera.json");
  auto sol = t.world.createCharacter(Json::parse(in));
  REQUIRE(sol);
  REQUIRE(t.world.connect(sol.value()));
  walkInto(t.world, sol.value(), "heritage_coffee");
  REQUIRE(t.runUntil(45, [&] { return !heard(t.events, sol.value(), "dax").empty(); }));  // his next turn: up to kIdleCapSeconds of real time
  for (const auto& line : heard(t.events, sol.value(), "dax"))
    CHECK(line["text"].get<std::string>().find("Sol") == std::string::npos);
  // The rest of the morning together: no second greeting the same day (Dominique overheard the one to Sol).
  t.runUntil(30, [] { return false; });
  CHECK(t.stat("dax", "greetings") == 2);
  // Another day, another greeting. The town lives through the night, as the server runs it, so the autopilot puts
  // Dax to bed and feeds him; leaping the clock instead would wake him exhausted and starving, too late for coffee.
  const GameMinutes morning = (t.world.now() / kMinutesPerDay + 1) * kMinutesPerDay + 6 * 60 + 55;
  REQUIRE(t.runUntil(kMinutesPerDay, [&] { return t.world.now() >= morning; }));
  walkInto(t.world, "dominique", "heritage_coffee");
  const std::size_t before = heard(t.events, "dominique", "dax").size();
  REQUIRE(t.runUntil(300, [&] { return heard(t.events, "dominique", "dax").size() > before; }));
}

TEST_CASE("autopilot manners: founders never greet or chat with each other, only with people") {
  WatchedTown t(cafeContent(1.0));
  t.pilot.start(t.world, {"dax", "julian"});
  REQUIRE(t.runUntil(250, [&] {
    return t.you("dax").value("inside", "") == "heritage_coffee" &&
           t.you("julian").value("inside", "") == "heritage_coffee";
  }));
  t.runUntil(60, [] { return false; });
  CHECK(heard(t.events, "julian", "dax").empty());
  CHECK(heard(t.events, "dax", "julian").empty());
  CHECK(interactionsFrom(t.events, "julian", "dax") == 0);
  CHECK(interactionsFrom(t.events, "dax", "julian") == 0);
  CHECK(t.stat("dax", "greetings") == 0);
  CHECK(t.stat("dax", "chats") == 0);
}

TEST_CASE("autopilot manners: someone they know may get a chat, at most once a day, and never if the data says no") {
  {
    WatchedTown t(cafeContent(1.0));
    REQUIRE(t.world.connect("dominique"));
    t.pilot.start(t.world, {"dax"});
    REQUIRE(t.runUntil(200, [&] { return t.you("dax").value("inside", "") == "heritage_coffee"; }));
    walkInto(t.world, "dominique", "heritage_coffee");
    REQUIRE(t.runUntil(30, [&] { return interactionsFrom(t.events, "dominique", "dax") == 1; }));
    t.runUntil(60, [] { return false; });
    CHECK(interactionsFrom(t.events, "dominique", "dax") == 1);  // once a day
    CHECK(t.stat("dax", "chats") == 1);
    CHECK(t.stat("dax", "refusals") == 0);
    CHECK(t.world.relationship("dax", "dominique")->lastInteractionAt >= 0);  // Dax's move, through the World
  }
  {
    WatchedTown t(cafeContent(0.0));
    REQUIRE(t.world.connect("dominique"));
    t.pilot.start(t.world, {"dax"});
    REQUIRE(t.runUntil(200, [&] { return t.you("dax").value("inside", "") == "heritage_coffee"; }));
    walkInto(t.world, "dominique", "heritage_coffee");
    t.runUntil(60, [] { return false; });
    CHECK(interactionsFrom(t.events, "dominique", "dax") == 0);
    CHECK(t.stat("dax", "greetings") == 1);  // a hello all the same
  }
}

TEST_CASE("autopilot manners: asks are answered by the data's rules, from their own feelings; never intimacy") {
  auto askDax = [](WatchedTown& t, const std::string& kind) {
    REQUIRE(t.world.connect("dominique"));
    t.pilot.start(t.world, {"dax"});
    REQUIRE(t.runUntil(200, [&] { return t.you("dax").value("inside", "") == "heritage_coffee"; }));
    walkInto(t.world, "dominique", "heritage_coffee");
    t.runUntil(6, [] { return false; });  // his hello first
    auto ask = t.world.request("dominique", kind, "dax");
    REQUIRE(ask);
    return ask.value()["request"].get<std::string>();
  };
  {
    // A rule Dax's feelings meet: he says yes, and the World makes them a couple.
    WatchedTown t(cafeContent(0.0, Json::array({Json{{"kind", "date"}, {"min", {{"compatibility", 0}}}}})));
    askDax(t, "date");
    REQUIRE(t.runUntil(10, [&] { return t.stat("dax", "asks_accepted") == 1; }));
    CHECK(t.logged("accepts a 'date' ask from dominique"));
    CHECK(t.world.relationshipStatus("dax", "dominique") == "dating");
  }
  {
    // His own side falls short of the rule: no (the real data: a date needs romantic attraction 15 from him).
    WatchedTown t(cafeContent(0.0, Json::array({Json{{"kind", "date"}, {"min", {{"friendship", 101}}}}})));
    askDax(t, "date");
    REQUIRE(t.runUntil(10, [&] { return t.stat("dax", "asks_declined") == 1; }));
    CHECK(t.logged("friendship"));
    CHECK(t.world.relationshipStatus("dax", "dominique").empty());
  }
  {
    // A kind with no rule (a kiss, here) is declined.
    WatchedTown t(cafeContent(0.0, Json::array({Json{{"kind", "date"}, {"min", {{"compatibility", 0}}}}})));
    askDax(t, "kiss");
    REQUIRE(t.runUntil(10, [&] { return t.stat("dax", "asks_declined") == 1; }));
    CHECK(t.logged("no rule for a 'kiss' ask"));
  }
  // Intimacy can't even be written into the rules.
  auto bad = [](const Json& asks) {
    std::vector<std::pair<std::string, Json>> docs;
    std::vector<std::filesystem::path> files;
    for (const auto& e : std::filesystem::recursive_directory_iterator(LIVERA_DATA_DIR)) {
      if (e.path().extension() == ".json") files.push_back(e.path());
    }
    std::sort(files.begin(), files.end());
    for (const auto& f : files) {
      std::ifstream in(f);
      Json doc = Json::parse(in, nullptr, true, true);
      if (f.filename() == "manners.json") doc["autopilot_manners"]["asks"] = asks;
      docs.emplace_back(f.filename().string(), std::move(doc));
    }
    auto r = ContentDatabase::loadFromDocuments(docs);
    return r ? std::string("(loaded)") : r.error().message;
  };
  CHECK(bad(Json::array({Json{{"kind", "intimacy"}, {"min", {{"friendship", 90}}}}})).find("never intimacy") !=
        std::string::npos);
  CHECK(bad(Json::array({Json{{"kind", "elope"}, {"min", Json::object()}}})).find("unknown ask kind") !=
        std::string::npos);
  CHECK(bad(Json::array({Json{{"kind", "date"}, {"min", {{"vibes", 1}}}}})).find("unknown dimension") !=
        std::string::npos);
  CHECK(bad(Json::array()) == "(loaded)");
}
