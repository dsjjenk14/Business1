// Tests for M0.8 details: see docs/m08/details.md.
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <set>
#include <thread>

#include "TestSupport.h"
#include "core/Clock.h"
#include "core/Parts.h"
#include "net/Socket.h"
#include "persistence/SqliteStore.h"
#include "server/Server.h"

using namespace livera;
using namespace livera::test;

namespace {

// Nobody catches anything, so outcomes are the rules', not the dice's. `extra` patches more.
std::shared_ptr<const ContentDatabase> detailsContent(const std::function<void(Json&, const std::string&)>& extra = nullptr) {
  return patchedContent([&](Json& doc, const std::string& file) {
    if (doc.contains("conditions")) {
      for (auto& c : doc["conditions"]) {
        if (c.contains("catch")) c["catch"]["hourly_chance"] = 0.0, c["catch"]["contagion_per_hour"] = 0.0;
      }
    }
    if (extra) extra(doc, file);
  });
}

// Bladders empty three times as fast, and witnesses always pass it on to close friends.
std::shared_ptr<const ContentDatabase> accidentContent() {
  static auto db = detailsContent([](Json& doc, const std::string& file) {
    if (file == "simulation.json") {
      for (auto& n : doc["simulation"]["needs"]) {
        if (n["id"] == "bladder") n["decay_per_hour"] = 30.0;
      }
    }
    if (file == "details.json") {
      doc["details"]["accident"]["gossip"]["chance_per_hour"] = 1.0;
      doc["details"]["accident"]["gossip"]["min_friendship"] = 40;
    }
  });
  return db;
}

// It rains every day of the year.
std::shared_ptr<const ContentDatabase> rainyContent() {
  static auto db = detailsContent([](Json& doc, const std::string& file) {
    if (file != "details.json") return;
    for (auto& s : doc["details"]["weather"]["seasons"]) {
      for (auto& [kind, p] : s["chances"].items()) p = kind == "rain" ? 1.0 : 0.0;
    }
  });
  return db;
}

bool near(double a, double b) { return std::abs(a - b) < 1e-6; }

std::string code(const Result<Json>& r) { return r ? std::string("(ok)") : r.error().code; }

bool notified(const World& w, const CharacterId& id, const std::string& fragment) {
  for (const auto& n : w.state().notifications) {
    if (n.recipient == id && n.text.find(fragment) != std::string::npos) return true;
  }
  return false;
}

bool remembers(const World& w, const CharacterId& id, const std::string& type) {
  for (const Memory* m : w.memoriesOf(id)) {
    if (m->type == type) return true;
  }
  return false;
}

double rel(const World& w, const CharacterId& from, const CharacterId& to, const std::string& dim) {
  return w.relationshipValue(from, to, dim);
}

double need(const World& w, const CharacterId& id, const std::string& n) { return w.character(id)->needs.at(n); }

// Advances the clock to the next time it's `hour`:00.
void advanceTo(World& w, int hour) {
  const GameMinutes target = static_cast<GameMinutes>(hour) * 60;
  const GameMinutes today = w.now() % kMinutesPerDay;
  w.advanceMinutes(today < target ? target - today : kMinutesPerDay - today + target);
}

// Lets time pass, a few minutes at a time, until `who` has wet themself (at most `limit` minutes).
void waitForAccident(World& w, const CharacterId& who, GameMinutes limit) {
  for (GameMinutes t = 0; t < limit && !notified(w, who, "couldn't make it to a bathroom"); t += 5) w.advanceMinutes(5);
  REQUIRE(notified(w, who, "couldn't make it to a bathroom"));
}

void walkToPoint(World& w, const CharacterId& who, Vec2 at) {
  if (!w.character(who)->inside.empty()) REQUIRE(w.exitBuilding(who));
  REQUIRE(w.moveTo(who, at));
  for (int i = 0; i < 5000 && w.character(who)->moveTarget; ++i) w.advanceRealTime(0.1);
}

Cents bank(const World& w, const CharacterId& id) { return w.state().ledger.balance(bankAccountOf(id)); }

Json itemNamed(World& w, const CharacterId& id, const std::string& item) {
  auto app = w.openPhoneApp(id, "items");
  REQUIRE(app);
  for (const auto& i : app.value().at("items")) {
    if (i.at("id") == item) return i;
  }
  return Json();
}

}  // namespace

// ---------------------------------------------------------------------------------
// Wetting yourself
// ---------------------------------------------------------------------------------
TEST_CASE("details: wetting yourself in front of people is a huge deal, and word gets around") {
  World w = World::createNew(accidentContent());
  for (const char* id : {"dominique", "dax", "julian"}) REQUIRE(w.connect(id));
  // Dax and Julian go before they leave home; Dominique doesn't.
  REQUIRE(w.useActivity("dax", "toilet"));
  REQUIRE(w.useActivity("julian", "toilet"));
  for (const char* id : {"dominique", "dax", "julian"}) walkInto(w, id, "heritage_coffee");
  const double daxRespect = rel(w, "dax", "dominique", "respect");
  const double daxAttraction = rel(w, "dax", "dominique", "romantic_attraction");
  const double julianRespect = rel(w, "julian", "dominique", "respect");
  const double andreRespect = rel(w, "andre", "dominique", "respect");

  waitForAccident(w, "dominique", 4 * 60);
  CHECK(!notified(w, "dax", "couldn't make it to a bathroom"));
  const CharacterState& d = *w.character("dominique");
  CHECK(notified(w, "dominique", "in front of people"));
  CHECK(notified(w, "dominique", "they'll tell their friends"));
  CHECK(w.hasCondition("dominique", "humiliated"));
  CHECK(d.needs.at("hygiene") <= 1);
  CHECK(d.emotions.at("embarrassment") >= 90);
  CHECK(remembers(w, "dominique", "wet_myself"));
  // Both witnesses saw it, remember it and think less of her.
  for (const char* id : {"dax", "julian"}) {
    CHECK(remembers(w, id, "saw_accident"));
    CHECK(notified(w, id, "Dominique just wet herself at Heritage Coffee"));
  }
  CHECK(near(rel(w, "dax", "dominique", "respect"), daxRespect - 10));
  CHECK(near(rel(w, "dax", "dominique", "romantic_attraction"), daxAttraction - 10));
  CHECK(near(rel(w, "julian", "dominique", "respect"), julianRespect - 10));
  REQUIRE(w.state().details.rumors.size() == 1);
  CHECK(w.state().details.rumors[0].knows.size() == 2);

  // Within the hour Dax tells Andre (a close friend who wasn't there); Andre thinks less of her too.
  // (Everyone goes home and logs off first, before anyone else has an accident.)
  for (const char* id : {"dominique", "dax", "julian"}) w.disconnect(id);
  w.advanceMinutes(60);
  CHECK(remembers(w, "andre", "heard_gossip"));
  CHECK(notified(w, "andre", "Dax told you Dominique wet herself at Heritage Coffee"));
  CHECK(near(rel(w, "andre", "dominique", "respect"), andreRespect - 5));
  // Nobody hears it twice, and the friend she doesn't share with Dax (Julian's Naomi, 28) never does.
  const auto& knows = w.state().details.rumors[0].knows;
  CHECK(std::count(knows.begin(), knows.end(), "andre") == 1);
  CHECK(std::find(knows.begin(), knows.end(), "naomi") == knows.end());

  // Days later she is still humiliated.
  w.advanceMinutes(48 * 60);
  CHECK(w.hasCondition("dominique", "humiliated"));
  // The rumour runs a day, then is forgotten.
  CHECK(w.state().details.rumors.empty());
}

TEST_CASE("details: a partner who sees it takes it hardest") {
  World w = World::createNew(accidentContent());
  for (const char* id : {"dominique", "dax", "julian"}) REQUIRE(w.connect(id));
  REQUIRE(w.useActivity("dax", "toilet"));
  REQUIRE(w.useActivity("julian", "toilet"));
  for (const char* id : {"dominique", "dax", "julian"}) walkInto(w, id, "heritage_coffee");
  auto asked = w.request("dax", "date", "dominique");
  REQUIRE(asked);
  REQUIRE(w.respond("dominique", asked.value().at("request").get<std::string>(), true));
  REQUIRE(w.relationshipStatus("dax", "dominique") == "dating");
  const double daxAttraction = rel(w, "dax", "dominique", "romantic_attraction");
  const double julianAttraction = rel(w, "julian", "dominique", "romantic_attraction");
  waitForAccident(w, "dominique", 4 * 60);
  CHECK(near(rel(w, "dax", "dominique", "romantic_attraction"), daxAttraction - 20));
  CHECK(near(rel(w, "julian", "dominique", "romantic_attraction"), julianAttraction - 10));
}

TEST_CASE("details: alone, it's still awful, but nobody knows") {
  World w = World::createNew(accidentContent());
  REQUIRE(w.connect("dominique"));
  waitForAccident(w, "dominique", 4 * 60);
  CHECK(notified(w, "dominique", "at least nobody saw"));
  CHECK(notified(w, "dominique", "You're humiliated."));
  CHECK(!notified(w, "dominique", "You have humiliated"));
  CHECK(w.hasCondition("dominique", "humiliated"));
  CHECK(w.state().details.rumors.empty());
  for (const char* id : {"dax", "julian", "aaliyah"}) CHECK(!remembers(w, id, "saw_accident"));
}

// ---------------------------------------------------------------------------------
// Clothes and laundry
// ---------------------------------------------------------------------------------
TEST_CASE("details: clothes you wet are ruined until washed; laundry at home or at Suds & Spin") {
  World w = World::createNew(detailsContent());
  REQUIRE(w.connect("dominique"));
  CHECK(code(w.doLaundry("dominique")) == "nothing_to_wash");  // at home, nothing worn yet
  advanceTo(w, 9);
  REQUIRE(w.useActivity("dominique", "toilet"));  // keep her dry for now
  walkInto(w, "dominique", "thread_co");
  REQUIRE(w.buy("dominique", "everyday_outfit", "card"));
  auto worn = w.wear("dominique", "everyday_outfit");
  REQUIRE(worn);
  const double style = worn.value().at("style").get<double>();
  CHECK(style > 0);
  CHECK(itemNamed(w, "dominique", "everyday_outfit").at("condition") == "clean");
  CHECK(code(w.doLaundry("dominique")) == "wrong_place");
  walkInto(w, "dominique", "lexington_1204");

  waitForAccident(w, "dominique", 12 * 60);
  const CharacterState& d = *w.character("dominique");
  CHECK(w.soiledOutfit(d));
  CHECK(notified(w, "dominique", "Your clothes are ruined until they're washed"));
  CHECK(itemNamed(w, "dominique", "everyday_outfit").at("condition") == "ruined");
  CHECK(w.wear("dominique", "everyday_outfit").value().at("style").get<double>() == 0);
  // A shower doesn't help while you're still in them.
  REQUIRE(w.useActivity("dominique", "shower"));
  w.advanceMinutes(60);
  CHECK(need(w, "dominique", "hygiene") <= 50);

  // Suds & Spin: a wash costs $8, paid to the laundromat.
  walkInto(w, "dominique", "suds_spin");
  const Cents before = bank(w, "dominique");
  const Cents shop = w.state().ledger.balance("org:suds_spin");
  auto washed = w.doLaundry("dominique");
  REQUIRE(washed);
  CHECK(washed.value().at("where") == "Suds & Spin Laundromat");
  CHECK(bank(w, "dominique") == before - 800);
  CHECK(w.state().ledger.balance("org:suds_spin") == shop + 800);
  CHECK(!w.soiledOutfit(d));
  CHECK(near(w.wear("dominique", "everyday_outfit").value().at("style").get<double>(), style));
  CHECK(code(w.doLaundry("dominique")) == "nothing_to_wash");

  // Worn long enough, clothes get dirty: they cost hygiene and style until washed, at home for free.
  walkInto(w, "dominique", "lexington_1204");
  for (int h = 0; h < 17; ++h) {
    (void)w.useActivity("dominique", "toilet");
    w.advanceMinutes(60);
  }
  CHECK(w.dirtyOutfit(d));
  CHECK(itemNamed(w, "dominique", "everyday_outfit").at("condition") != "clean");
  if (w.character("dominique")->inside != "lexington_1204") walkInto(w, "dominique", "lexington_1204");
  const double energy = need(w, "dominique", "energy");
  const Cents broke = bank(w, "dominique");
  auto home = w.doLaundry("dominique");
  REQUIRE(home);
  CHECK(home.value().at("where") == "home");
  CHECK(bank(w, "dominique") == broke);
  CHECK(need(w, "dominique", "energy") <= energy);
  CHECK(!w.dirtyOutfit(d));
  CHECK(itemNamed(w, "dominique", "everyday_outfit").at("condition") == "clean");
}

// ---------------------------------------------------------------------------------
// Weather
// ---------------------------------------------------------------------------------
TEST_CASE("details: the weather changes at 06:00 to yesterday's forecast, and it's in the app") {
  World w = World::createNew(detailsContent());
  REQUIRE(w.connect("dominique"));
  CHECK(w.openPhoneApp("dominique", "weather").value().at("today").is_null());
  w.advanceMinutes(60);
  const DetailsWorldState& W = w.state().details;
  REQUIRE(W.weatherDay == 0);
  Json app = w.openPhoneApp("dominique", "weather").value();
  CHECK(app.at("today").at("kind") == W.today.kind);
  CHECK(app.at("tomorrow").at("kind") == W.tomorrow.kind);
  CHECK(app.at("changes_at") == "6:00");
  CHECK(app.at("umbrella") == false);
  CHECK(w.content().weatherKind(W.today.kind) != nullptr);
  // Month 1 is winter: -4 to 6 degrees.
  CHECK(W.today.tempC >= -4);
  CHECK(W.today.tempC <= 6);
  w.disconnect("dominique");
  advanceTo(w, 5);
  CHECK(W.weatherDay == 0);
  const WeatherDay forecast = W.tomorrow;
  advanceTo(w, 6);
  CHECK(W.weatherDay == 1);
  CHECK(W.today.kind == forecast.kind);
  CHECK(W.today.tempC == forecast.tempC);
  // Over four weeks, more than one kind of weather.
  std::set<std::string> kinds;
  for (int day = 0; day < 28; ++day) {
    w.advanceMinutes(kMinutesPerDay);
    kinds.insert(W.today.kind);
  }
  CHECK(kinds.size() > 1);
}

TEST_CASE("details: out in the rain without an umbrella is miserable; with one it's fine") {
  World w = World::createNew(rainyContent());
  for (const char* id : {"dominique", "aaliyah"}) REQUIRE(w.connect(id));
  w.advanceMinutes(60);
  CHECK(w.weatherToday().kind == "rain");
  CHECK(notified(w, "dominique", "Today: rain"));
  CHECK(notified(w, "dominique", "You don't have an umbrella"));
  advanceTo(w, 9);
  walkInto(w, "aaliyah", "thread_co");
  REQUIRE(w.buy("aaliyah", "umbrella", "card"));
  CHECK(w.openPhoneApp("aaliyah", "weather").value().at("umbrella") == true);
  const Vec2 door = w.content().location("thread_co")->door;
  const Vec2 spot{door.x, door.y + 15};
  walkToPoint(w, "aaliyah", spot);
  walkToPoint(w, "dominique", spot);
  const double domComfort = need(w, "dominique", "comfort"), aaComfort = need(w, "aaliyah", "comfort");
  const double domHygiene = need(w, "dominique", "hygiene"), aaHygiene = need(w, "aaliyah", "hygiene");
  w.advanceMinutes(120 - w.now() % 60);  // two hours on the hour, outdoors
  const double domLost = domComfort - need(w, "dominique", "comfort");
  const double aaLost = aaComfort - need(w, "aaliyah", "comfort");
  CHECK(domLost >= aaLost + 10);
  CHECK(domHygiene - need(w, "dominique", "hygiene") >= aaHygiene - need(w, "aaliyah", "hygiene") + 8);
}

// ---------------------------------------------------------------------------------
// Birthdays
// ---------------------------------------------------------------------------------
TEST_CASE("details: friends hear it's your birthday, and a cake on the day means a lot") {
  World w = World::createNew(detailsContent());
  // The next birthday among the cast (in the shop's hours): someone with a friend who cares (friendship 40+).
  CharacterId who;
  CharacterId friendId;
  GameMinutes when = 0;
  for (const auto& [key, r] : w.state().relationships) {
    auto f = r.dimensions.find("friendship");
    if (f == r.dimensions.end() || f->second < 40) continue;
    const CharacterState* c = w.character(key.second);
    if (!c || w.ageOf(key.second) < 18) continue;
    const GameMinutes next = c->bornAt + static_cast<GameMinutes>(w.ageOf(key.second) + 1) * kMinutesPerYear;
    if (next % kMinutesPerDay >= 21 * 60) continue;
    if (who.empty() || next < when) who = key.second, friendId = key.first, when = next;
  }
  REQUIRE(!who.empty());
  REQUIRE(when - w.now() < 60 * kMinutesPerDay);
  const int age = w.ageOf(who) + 1;
  // The friend buys two cakes first thing (Greenleaf opens at 7) and goes about their day.
  REQUIRE(w.connect(friendId));
  walkInto(w, friendId, "greenleaf_market");
  REQUIRE(w.buy(friendId, "birthday_cake", "card"));
  REQUIRE(w.buy(friendId, "birthday_cake", "card"));
  w.disconnect(friendId);
  // Just past the hour after the birthday; nobody's online until then.
  w.advanceMinutes((when / 60 + 1) * 60 + 1 - w.now());
  CHECK(w.ageOf(who) == age);
  const CharacterDef* def = w.content().character(who);
  REQUIRE(def);
  CHECK(notified(w, who, "Happy birthday! You're " + std::to_string(age)));
  CHECK(notified(w, friendId, "It's " + def->firstName + "'s birthday today: " + std::to_string(age)));
  REQUIRE(w.connect(who));
  REQUIRE(w.connect(friendId));
  const Vec2 door = w.content().location("greenleaf_market")->door;
  walkToPoint(w, who, Vec2{door.x, door.y + 10});
  walkToPoint(w, friendId, Vec2{door.x, door.y + 12});
  const double friendship = rel(w, who, friendId, "friendship");
  auto gave = w.giveItem(friendId, who, "birthday_cake");
  REQUIRE(gave);
  CHECK(gave.value().value("birthday", false));
  CHECK(remembers(w, who, "birthday_cake"));
  CHECK(remembers(w, friendId, "birthday_cake"));
  CHECK(notified(w, who, "brought you a birthday cake"));
  CHECK(rel(w, who, friendId, "friendship") > friendship + 5);  // a plain gift is +2
  // A cake on any other day is just a cake.
  auto plain = w.giveItem(who, friendId, "birthday_cake");
  REQUIRE(plain);
  CHECK(!plain.value().value("birthday", false));
}

// ---------------------------------------------------------------------------------
// Hangovers
// ---------------------------------------------------------------------------------
TEST_CASE("details: three drinks in a night and you wake up hungover; one is fine") {
  World w = World::createNew(detailsContent());
  advanceTo(w, 17);  // the Copper Tap opens at 16
  for (const char* id : {"dominique", "aaliyah"}) {
    REQUIRE(w.connect(id));
    walkInto(w, id, "copper_tap");
  }
  for (int i = 0; i < 3; ++i) REQUIRE(w.buy("dominique", "beer", "card"));
  REQUIRE(w.buy("aaliyah", "beer", "card"));
  CHECK(w.character("dominique")->detail.drinks.size() == 3);
  for (const char* id : {"dominique", "aaliyah"}) w.disconnect(id);
  advanceTo(w, 7);
  CHECK(w.hasCondition("dominique", "hungover"));
  CHECK(notified(w, "dominique", "You wake up hungover: 3 drinks last night"));
  CHECK(!w.hasCondition("aaliyah", "hungover"));
  // It passes by the afternoon.
  w.advanceMinutes(8 * 60);
  CHECK(!w.hasCondition("dominique", "hungover"));
}

// ---------------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------------
TEST_CASE("details: weather, rumours and clothes are saved; older saves load as defaults") {
  auto db = accidentContent();
  World w = World::createNew(db);
  for (const char* id : {"dominique", "dax"}) REQUIRE(w.connect(id));
  REQUIRE(w.useActivity("dax", "toilet"));
  for (const char* id : {"dominique", "dax"}) walkInto(w, id, "heritage_coffee");
  waitForAccident(w, "dominique", 4 * 60);
  for (const char* id : {"dominique", "dax"}) w.disconnect(id);

  auto path = tempPath("details.db");
  {
    auto store = SqliteStore::open(path.string());
    REQUIRE(store);
    REQUIRE(store.value()->saveWorld(w.state()));
  }
  auto store = SqliteStore::open(path.string());
  REQUIRE(store);
  auto loaded = store.value()->loadWorld();
  REQUIRE(loaded);
  const WorldState& s = loaded.value();
  const DetailsWorldState& a = w.state().details;
  const DetailsWorldState& b = s.details;
  CHECK(b.weatherDay == a.weatherDay);
  CHECK(b.today.kind == a.today.kind);
  CHECK(b.today.tempC == a.today.tempC);
  CHECK(b.tomorrow.kind == a.tomorrow.kind);
  REQUIRE(b.rumors.size() == 1);
  CHECK(b.rumors[0].about == "dominique");
  CHECK(b.rumors[0].what == a.rumors[0].what);
  CHECK(b.rumors[0].until == a.rumors[0].until);
  CHECK(b.rumors[0].tellers == a.rumors[0].tellers);
  CHECK(b.rumors[0].knows == a.rumors[0].knows);

  CharacterState c;
  c.detail.wornHours = {{"everyday_outfit", 17}};
  c.detail.soiled = {"everyday_outfit"};
  c.detail.drinks = {100, 160};
  Json j = Json::object();
  writeDetailsCharacter(c, j);
  CharacterState back;
  readDetailsCharacter(back, j);
  CHECK(back.detail.wornHours == c.detail.wornHours);
  CHECK(back.detail.soiled == c.detail.soiled);
  CHECK(back.detail.drinks == c.detail.drinks);

  // The loaded world carries on with the same weather and the same gossip.
  World again(db, s);
  CHECK(again.weatherToday().kind == w.weatherToday().kind);
  CHECK(again.hasCondition("dominique", "humiliated"));

  // Saves from before details existed.
  WorldState old;
  detailsPartFromJson(old, Json::object());
  CHECK(old.details.weatherDay == -1);
  CHECK(old.details.rumors.empty());
  CharacterState none;
  readDetailsCharacter(none, Json::object());
  CHECK(none.detail.soiled.empty());
  CHECK(none.detail.wornHours.empty());
}

// ---------------------------------------------------------------------------------
// Over the network
// ---------------------------------------------------------------------------------
namespace {

class DetailsServer {
 public:
  explicit DetailsServer(const std::string& db) {
    ServerConfig cfg;
    cfg.port = 0;
    cfg.dbPath = db;
    static auto content = detailsContent([](Json& doc, const std::string& file) {
      if (file == "simulation.json") doc["simulation"]["walk_speed_mps"] = 400.0;
    });
    cfg.content = content;
    cfg.devCommands = true;
    cfg.passwordIterations = 1000;
    cfg.autosaveSeconds = 3600;
    auto s = Server::create(cfg);
    if (!s) throw std::runtime_error("server failed: " + s.error().message);
    server_ = std::move(s).value();
    port_ = server_->port();
    thread_ = std::thread([this] { server_->run(stop_); });
  }
  ~DetailsServer() {
    stop_ = true;
    if (thread_.joinable()) thread_.join();
  }
  std::uint16_t port() const { return port_; }

 private:
  std::unique_ptr<Server> server_;
  std::uint16_t port_ = 0;
  std::atomic<bool> stop_{false};
  std::thread thread_;
};

class DetailsClient {
 public:
  explicit DetailsClient(std::uint16_t port) {
    auto fd = net::connectTcp("127.0.0.1", port);
    if (!fd) throw std::runtime_error("connect failed");
    fd_ = std::move(fd).value();
  }
  Json call(Json req) {
    req["id"] = ++id_;
    if (!net::sendAll(fd_, req.dump() + "\n")) throw std::runtime_error("send failed");
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(10);
    while (std::chrono::steady_clock::now() < deadline) {
      auto line = net::readLine(fd_, buffer_, 100);
      if (!line) throw std::runtime_error("connection lost: " + line.error().message);
      if (!line.value()) continue;
      Json msg = Json::parse(*line.value());
      if (msg.contains("event")) continue;
      if (msg.value("re", Json()) == Json(id_)) return msg;
    }
    throw std::runtime_error("timed out waiting for reply");
  }
  Json ok(Json req) {
    Json r = call(req);
    if (!r.value("ok", false)) throw std::runtime_error("refused: " + req.dump() + " -> " + r.dump());
    return r["data"];
  }
  std::string refusal(Json req) {
    Json r = call(std::move(req));
    return r.value("ok", false) ? std::string("(accepted)") : r["error"]["code"].get<std::string>();
  }
  void walkInto(const std::string& place) {
    if (ok({{"op", "look"}})["you"]["inside"] != "") ok({{"op", "exit"}});
    ok({{"op", "move"}, {"location", place}});
    for (int i = 0; i < 100; ++i) {
      std::this_thread::sleep_for(std::chrono::milliseconds(100));
      if (!ok({{"op", "look"}})["you"]["moving"].get<bool>()) break;
    }
    ok({{"op", "enter"}, {"location", place}});
  }

 private:
  net::Fd fd_;
  net::LineBuffer buffer_;
  long id_ = 0;
};

}  // namespace

TEST_CASE("details: laundry and the weather app work over the network") {
  const std::string db = tempPath("details_net.db").string();
  DetailsServer server(db);
  DetailsClient dom(server.port());
  dom.ok({{"op", "register"}, {"username", "dom"}, {"password", "livera-pass-1"}});
  dom.ok({{"op", "login"}, {"username", "dom"}, {"password", "livera-pass-1"}});
  dom.ok({{"op", "play"}, {"character", "dominique"}});
  CHECK(dom.refusal({{"op", "laundry"}}) == "nothing_to_wash");
  dom.ok({{"op", "dev_advance"}, {"minutes", 120}});  // 09:00, Thread & Co opens
  Json weather = dom.ok({{"op", "phone"}, {"app", "weather"}});
  CHECK(weather["today"]["kind"].is_string());
  CHECK(weather["tomorrow"]["label"].is_string());
  dom.walkInto("thread_co");
  dom.ok({{"op", "buy"}, {"offer", "everyday_outfit"}});
  dom.ok({{"op", "wear"}, {"item", "everyday_outfit"}});
  CHECK(dom.refusal({{"op", "laundry"}}) == "wrong_place");
  dom.ok({{"op", "dev_advance"}, {"minutes", 60}});
  dom.walkInto("suds_spin");
  Json washed = dom.ok({{"op", "laundry"}});
  CHECK(washed["price_cents"] == 800);
  CHECK(washed["washed"] == 1);
}
