// End-to-end: real server, real sockets, two players, then a server restart.
// This is the founding vertical slice from docs/ROADMAP.md, driven over the wire.

#include <arpa/inet.h>
#include <fcntl.h>
#include <netinet/in.h>
#include <sys/resource.h>
#include <sys/socket.h>
#include <unistd.h>

#include <atomic>
#include <ctime>
#include <fstream>
#include <chrono>
#include <thread>

#include "TestSupport.h"
#include "net/Socket.h"
#include "persistence/SqliteStore.h"
#include "server/Auth.h"
#include "server/Server.h"

using namespace livera;
using namespace livera::test;

namespace {

// Fast walking so the test doesn't wait on real-time strolls; every rule is unchanged.
std::shared_ptr<const ContentDatabase> fastContent() {
  static auto db = patchedContent([](Json& doc, const std::string& file) {
    if (file == "simulation.json") doc["simulation"]["walk_speed_mps"] = 400.0;
  });
  return db;
}

class RunningServer {
 public:
  explicit RunningServer(const std::string& db, bool dev = true, const std::function<void(ServerConfig&)>& tweak = {}) {
    ServerConfig cfg;
    cfg.port = 0;
    cfg.dbPath = db;
    cfg.content = fastContent();
    cfg.devCommands = dev;
    cfg.passwordIterations = 1000;
    cfg.autosaveSeconds = 3600;
    if (tweak) tweak(cfg);
    auto s = Server::create(cfg);
    if (!s) throw std::runtime_error("server failed: " + s.error().message);
    server_ = std::move(s).value();
    port_ = server_->port();
    thread_ = std::thread([this] { server_->run(stop_); });
  }
  ~RunningServer() { stop(); }
  void stop() {
    if (thread_.joinable()) {
      stop_ = true;
      thread_.join();
    }
  }
  std::uint16_t port() const { return port_; }

 private:
  std::unique_ptr<Server> server_;
  std::uint16_t port_ = 0;
  std::atomic<bool> stop_{false};
  std::thread thread_;
};

class TestClient {
 public:
  explicit TestClient(std::uint16_t port) {
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
      if (msg.contains("event")) {
        events.push_back(msg);
        continue;
      }
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

  // Waits for real time to pass (the server keeps simulating), collecting events.
  void pump(double seconds) {
    const auto until = std::chrono::steady_clock::now() + std::chrono::duration<double>(seconds);
    while (std::chrono::steady_clock::now() < until) {
      auto line = net::readLine(fd_, buffer_, 20);
      if (line && line.value()) events.push_back(Json::parse(*line.value()));
    }
  }

  bool sawEvent(const std::string& type) const {
    for (const auto& e : events) {
      if (e.value("event", "") == type) return true;
    }
    return false;
  }

  // The latest `people` change this client was told about one character (null if none).
  Json lastSeen(const std::string& character) const {
    Json last;
    for (const auto& e : events) {
      if (e.value("event", "") != "people") continue;
      for (const auto& c : e["data"]["changes"]) {
        if (c["character"] == character) last = c;
      }
    }
    return last;
  }

  void login(const std::string& user, const std::string& pass, bool registerFirst = true) {
    if (registerFirst) ok({{"op", "register"}, {"username", user}, {"password", pass}});
    ok({{"op", "login"}, {"username", user}, {"password", pass}});
  }

  void walkTo(const std::string& place) {
    ok({{"op", "move"}, {"location", place}});
    for (int i = 0; i < 100; ++i) {
      if (!ok({{"op", "look"}})["you"]["moving"].get<bool>()) return;
      pump(0.05);
    }
    throw std::runtime_error("never arrived at " + place);
  }

  std::vector<Json> events;

 private:
  net::Fd fd_;
  net::LineBuffer buffer_;
  long id_ = 0;
};

}  // namespace

TEST_CASE("server: the founding vertical slice works over the network and survives a restart") {
  const std::string db = tempPath("slice.db").string();
  Cents domBank = 0;
  GameMinutes timeBeforeShutdown = 0;
  double domTrustInDax = 0;
  {
    RunningServer server(db);
    TestClient dom(server.port());
    TestClient jax(server.port());

    // Accounts and authentication.
    CHECK(dom.refusal({{"op", "look"}}) == "not_logged_in");
    dom.ok({{"op", "register"}, {"username", "dom"}, {"password", "livera-pass-1"}});
    jax.ok({{"op", "register"}, {"username", "jax"}, {"password", "livera-pass-2"}});
    CHECK(jax.refusal({{"op", "register"}, {"username", "dom"}, {"password", "whatever123"}}) == "username_taken");
    CHECK(dom.refusal({{"op", "login"}, {"username", "dom"}, {"password", "wrong-pass"}}) == "bad_credentials");
    dom.ok({{"op", "login"}, {"username", "dom"}, {"password", "livera-pass-1"}});
    jax.ok({{"op", "login"}, {"username", "jax"}, {"password", "livera-pass-2"}});

    // Select characters; nobody can take a character someone else plays.
    CHECK(dom.ok({{"op", "characters"}})["characters"].size() == 27);  // the town's people: founders, residents, townspeople
    CHECK(dom.refusal({{"op", "look"}}) == "not_playing");
    Json start = dom.ok({{"op", "play"}, {"character", "dominique"}});
    CHECK(start["you"]["inside"] == "lexington_1204");
    CHECK(jax.refusal({{"op", "play"}, {"character", "dominique"}}) == "character_taken");
    jax.ok({{"op", "play"}, {"character", "dax"}});

    // The client sends intent; the server rejects what the rules don't allow.
    CHECK(dom.refusal({{"op", "move"}, {"x", 10}, {"y", 10}}) == "inside_building");
    CHECK(dom.refusal({{"op", "buy"}, {"offer", "latte"}}) == "unknown_offer");
    CHECK(dom.refusal({{"op", "move"}, {"x", "ten"}, {"y", 10}}) == "bad_request");
    CHECK(dom.refusal({{"op", "transfer_money"}, {"to", "dom"}}) == "unknown_op");

    // Use the phone and do something at home.
    CHECK(dom.ok({{"op", "phone"}, {"app", "bank"}})["bank_cents"] == 1450000);
    dom.ok({{"op", "activity"}, {"activity", "shower"}});

    // Meet at Heritage Coffee and talk.
    dom.ok({{"op", "exit"}});
    dom.walkTo("heritage_coffee");
    dom.ok({{"op", "enter"}, {"location", "heritage_coffee"}});
    jax.ok({{"op", "exit"}});
    jax.walkTo("heritage_coffee");
    CHECK(jax.refusal({{"op", "enter"}, {"location", "lexington_1204"}}) == "too_far");
    jax.ok({{"op", "enter"}, {"location", "heritage_coffee"}});
    Json seen = dom.ok({{"op", "look"}});
    REQUIRE(seen["people"].size() == 1);
    CHECK(seen["people"][0]["id"] == "dax");
    Json talk = dom.ok({{"op", "interact"}, {"interaction", "deep_talk"}, {"target", "dax"}});
    domTrustInDax = talk["your_feelings"]["trust"].get<double>();
    CHECK(domTrustInDax > 18);
    jax.pump(0.3);
    CHECK(jax.sawEvent("interaction"));
    dom.ok({{"op", "message"}, {"to", "dax"}, {"text", "Lunch next week?"}});
    jax.pump(0.3);
    CHECK(jax.sawEvent("message"));

    // Spend money.
    Json latte = dom.ok({{"op", "buy"}, {"offer", "latte"}, {"method", "card"}});
    CHECK(latte["balance_cents"] == 1450000 - 575);

    // Go to work and earn money.
    jax.ok({{"op", "exit"}});
    jax.walkTo("parallax_labs");
    jax.ok({{"op", "enter"}, {"location", "parallax_labs"}});
    jax.ok({{"op", "work"}, {"action", "start"}});
    jax.ok({{"op", "dev_advance"}, {"minutes", 8 * 60}});
    Json pay = jax.ok({{"op", "work"}, {"action", "end"}});
    // Senior AI Engineer, by the hour. The server's clock keeps ticking while the skip is handled, so the shift can
    // be a minute or two over eight hours (more under the sanitizers): pay follows the minutes the shift reports.
    const auto worked = pay["minutes_worked"].get<GameMinutes>();
    CHECK(worked >= 8 * 60);
    CHECK(worked <= 8 * 60 + 3);
    CHECK(pay["pay_cents"] == std::llround(static_cast<double>(worked) / 60.0 * 6800));
    jax.pump(0.3);
    CHECK(jax.sawEvent("notification"));  // paycheck deposited

    // Dominique works a shift too, then goes home.
    dom.ok({{"op", "exit"}});
    dom.walkTo("meridian_talent");
    dom.ok({{"op", "enter"}, {"location", "meridian_talent"}});
    dom.ok({{"op", "work"}, {"action", "start"}});
    jax.ok({{"op", "dev_advance"}, {"minutes", 4 * 60}});
    Json domPay = dom.ok({{"op", "work"}, {"action", "end"}});
    CHECK(domPay["pay_cents"].get<Cents>() >= 4 * 4600);
    dom.ok({{"op", "exit"}});
    dom.walkTo("lexington_1204");
    dom.ok({{"op", "enter"}, {"location", "lexington_1204"}});

    // The world keeps changing: crews keep building.
    const double before = dom.ok({{"op", "phone"}, {"app", "city"}})["construction"][0]["progress_pct"].get<double>();
    dom.ok({{"op", "dev_advance"}, {"minutes", 2 * 24 * 60}});
    const double after = dom.ok({{"op", "phone"}, {"app", "city"}})["construction"][0]["progress_pct"].get<double>();
    CHECK(after > before);

    domBank = dom.ok({{"op", "phone"}, {"app", "bank"}})["bank_cents"].get<Cents>();
    timeBeforeShutdown = dom.ok({{"op", "look"}})["time"]["minute"].get<GameMinutes>();
    jax.ok({{"op", "logout"}});
    CHECK(jax.refusal({{"op", "look"}}) == "not_logged_in");
    // Dominique just disconnects (no logout). The server must still save her.
  }

  {
    RunningServer server(db);
    TestClient dom(server.port());
    Json login = dom.ok({{"op", "login"}, {"username", "dom"}, {"password", "livera-pass-1"}});
    CHECK(login["character"] == "dominique");
    Json back = dom.ok({{"op", "play"}, {"character", "dominique"}});
    CHECK(back["you"]["inside"] == "lexington_1204");
    CHECK(back["time"]["minute"].get<GameMinutes>() >= timeBeforeShutdown);
    CHECK(dom.ok({{"op", "phone"}, {"app", "bank"}})["bank_cents"] == domBank);
    Json contacts = dom.ok({{"op", "phone"}, {"app", "contacts"}})["contacts"];
    Json dax;
    for (const auto& c : contacts) {
      if (c["id"] == "dax") dax = c;
    }
    REQUIRE(dax.is_object());
    CHECK(dax["your_feelings"]["trust"].get<double>() == std::round(domTrustInDax));
    Json inbox = dom.ok({{"op", "phone"}, {"app", "messages"}});
    CHECK(inbox["threads"]["dax"].size() == 1);

    // Logging in again elsewhere replaces the old connection.
    TestClient again(server.port());
    again.ok({{"op", "login"}, {"username", "dom"}, {"password", "livera-pass-1"}});
    dom.pump(0.3);
    CHECK(dom.sawEvent("kicked"));
  }
}

TEST_CASE("server: a dev time skip needs a login, not a character in the world") {
  RunningServer server(tempPath("devskip.db").string());
  TestClient c(server.port());
  CHECK(c.refusal({{"op", "dev_advance"}, {"minutes", 60}}) == "not_logged_in");
  c.ok({{"op", "register"}, {"username", "pat"}, {"password", "password123"}});
  c.ok({{"op", "login"}, {"username", "pat"}, {"password", "password123"}});
  const Json r = c.ok({{"op", "dev_advance"}, {"minutes", 24 * 60}});
  CHECK(r["now"].get<std::string>().rfind("Tuesday", 0) == 0);
}

TEST_CASE("server: rate limiting and dev-command authorization") {
  RunningServer server(tempPath("limits.db").string(), /*dev=*/false);
  TestClient c(server.port());
  c.ok({{"op", "register"}, {"username", "pat"}, {"password", "password123"}});
  c.ok({{"op", "login"}, {"username", "pat"}, {"password", "password123"}});
  c.ok({{"op", "play"}, {"character", "dax"}});
  CHECK(c.refusal({{"op", "dev_advance"}, {"minutes", 60}}) == "forbidden");
  std::string burst;
  for (int i = 0; i < 100; ++i) burst += Json{{"op", "ping"}, {"id", i}}.dump() + "\n";
  // Send everything at once; the server must refuse the excess, not process it all.
  auto fd = net::connectTcp("127.0.0.1", server.port());
  REQUIRE(fd);
  REQUIRE(net::sendAll(fd.value(), burst));
  net::LineBuffer buf;
  int refused = 0, answered = 0;
  const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(3);
  while (std::chrono::steady_clock::now() < deadline && refused + answered < 100) {
    auto line = net::readLine(fd.value(), buf, 100);
    if (!line || !line.value()) continue;
    Json m = Json::parse(*line.value());
    if (m.contains("event")) continue;
    if (m.value("ok", false)) ++answered;
    else if (m["error"]["code"] == "rate_limited") ++refused;
  }
  CHECK(refused > 0);
  CHECK(answered <= 45);
}

TEST_CASE("server: make your own character, talk out loud, and play music for the room") {
  const std::string db = tempPath("create.db").string();
  std::string songId;
  {
    RunningServer server(db);
    TestClient nico(server.port());
    TestClient dom(server.port());
    nico.ok({{"op", "register"}, {"username", "nico"}, {"password", "nico-pass-123"}});
    nico.ok({{"op", "login"}, {"username", "nico"}, {"password", "nico-pass-123"}});
    CHECK(nico.ok({{"op", "characters"}})["can_create"] == true);
    CHECK(nico.ok({{"op", "creator_options"}})["origins"].size() == 10);

    std::ifstream in(std::string(LIVERA_DATA_DIR) + "/../scripts/demo/nico_vale.json");
    Json sheet = Json::parse(in);
    Json bad = sheet;
    bad["age"] = 12;
    CHECK(nico.refusal({{"op", "create_character"}, {"character", bad}}) == "invalid_character");
    Json made = nico.ok({{"op", "create_character"}, {"character", sheet}});
    CHECK(made["id"] == "nico-vale");
    CHECK(nico.refusal({{"op", "create_character"}, {"character", sheet}}) == "already_has_character");
    Json mine = nico.ok({{"op", "characters"}});
    CHECK(mine["can_create"] == false);
    CHECK(mine["characters"].back()["id"] == "nico-vale");
    nico.ok({{"op", "play"}});  // no id needed: plays your own character

    dom.ok({{"op", "register"}, {"username", "dom"}, {"password", "dom-pass-123"}});
    dom.ok({{"op", "login"}, {"username", "dom"}, {"password", "dom-pass-123"}});
    CHECK(dom.refusal({{"op", "play"}, {"character", "nico-vale"}}) == "character_taken");
    dom.ok({{"op", "play"}, {"character", "dominique"}});

    for (TestClient* c : {&nico, &dom}) {
      c->ok({{"op", "exit"}});
      c->walkTo("heritage_coffee");
      c->ok({{"op", "enter"}, {"location", "heritage_coffee"}});
    }
    // Talk.
    CHECK(dom.ok({{"op", "say"}, {"text", "Is that a keytar?"}})["heard_by"] == 1);
    nico.pump(0.3);
    CHECK(nico.sawEvent("speech"));
    // Make a song, play it for the room, get tipped.
    Json song = Json::parse(R"({"title": "Founders Groove", "bpm": 96, "tracks": [
        {"instrument": "drums", "notes": [[0,36,1],[4,38,1],[8,36,1],[12,38,1]]},
        {"instrument": "electric_piano", "notes": [[0,60,8],[0,64,8],[8,62,8]]}]})");
    songId = nico.ok({{"op", "song_save"}, {"song", song}})["id"];
    Json perf = nico.ok({{"op", "perform"}, {"song", songId}});
    CHECK(perf["audience"] == 1);
    dom.pump(0.3);
    CHECK(dom.sawEvent("performance"));
    dom.ok({{"op", "tip"}, {"to", "nico-vale"}, {"cents", 500}});
    nico.ok({{"op", "song_release"}, {"song", songId}});
    // Chat has its own flood limit.
    int limited = 0;
    for (int i = 0; i < 12; ++i) limited += dom.refusal({{"op", "say"}, {"text", "la"}}) == "chat_rate_limited" ? 1 : 0;
    CHECK(limited > 0);
  }
  {
    RunningServer server(db);
    TestClient nico(server.port());
    Json login = nico.ok({{"op", "login"}, {"username", "nico"}, {"password", "nico-pass-123"}});
    CHECK(login["character"] == "nico-vale");
    Json back = nico.ok({{"op", "play"}});
    CHECK(back["you"]["name"] == "Nico Vale");
    Json studio = nico.ok({{"op", "phone"}, {"app", "studio"}});
    REQUIRE(studio["yours"].size() == 1);
    CHECK(studio["yours"][0]["released"] == true);
    CHECK(studio["music_skill"].get<double>() > 0);
    CHECK(nico.ok({{"op", "phone"}, {"app", "bank"}})["bank_cents"] == 800000 + 500);
  }
}

TEST_CASE("server: everyday life over the network: phone apps, things, school, the bus, and asking someone out") {
  RunningServer server(tempPath("life_net.db").string());
  TestClient dom(server.port()), dax(server.port());
  for (auto [client, user, who] : {std::tuple{&dom, "dom", "dominique"}, std::tuple{&dax, "dax", "dax"}}) {
    client->ok({{"op", "register"}, {"username", user}, {"password", "password123"}});
    client->ok({{"op", "login"}, {"username", user}, {"password", "password123"}});
    client->ok({{"op", "play"}, {"character", who}});
  }
  dom.ok({{"op", "dev_advance"}, {"minutes", 180}});  // 10:00: the shops are open
  for (const char* app : {"health", "items", "transit", "school", "jobs", "record", "romance", "fame"})
    CHECK(dom.ok({{"op", "phone"}, {"app", app}}).is_object());
  CHECK(dom.ok({{"op", "phone"}, {"app", "school"}})["degrees"][1] == "Bachelor's degree");  // after the school diploma

  dom.ok({{"op", "exit"}});
  dom.walkTo("circuit_electronics");
  dom.ok({{"op", "enter"}, {"location", "circuit_electronics"}});
  CHECK(dom.ok({{"op", "buy"}, {"offer", "headphones"}})["owned"] == 1);
  CHECK(dom.ok({{"op", "use"}, {"item", "headphones"}})["item"] == "headphones");
  CHECK(dom.refusal({{"op", "wear"}, {"item", "headphones"}}) == "not_wearable");
  CHECK(dom.refusal({{"op", "enroll"}, {"program", "law_school"}}) == "wrong_place");
  CHECK(dom.refusal({{"op", "ride"}, {"to", "stop_riverside"}}) == "inside_building");
  CHECK(dom.refusal({{"op", "apply"}, {"career", "teaching"}}) == "wrong_place");

  // Dax asks her out at the café; she answers from her own connection.
  dom.ok({{"op", "exit"}});
  dom.walkTo("heritage_coffee");
  dom.ok({{"op", "enter"}, {"location", "heritage_coffee"}});
  dax.ok({{"op", "exit"}});
  dax.walkTo("heritage_coffee");
  dax.ok({{"op", "enter"}, {"location", "heritage_coffee"}});
  const std::string ask = dax.ok({{"op", "request"}, {"kind", "date"}, {"target", "dominique"}})["request"];
  dom.pump(0.2);
  CHECK(dom.sawEvent("request"));
  for (const auto& e : dom.events) {
    if (e.value("event", "") != "request") continue;
    CHECK(e["data"]["id"] == ask);
    CHECK(e["data"]["expires_in_minutes"] == 15);  // data/society/romance.json request_minutes, so a client can say when
  }
  CHECK(dom.ok({{"op", "respond"}, {"request", ask}, {"accept", true}})["accepted"] == "date");
  dax.pump(0.2);
  CHECK(dax.sawEvent("answer"));
  CHECK(dax.ok({{"op", "phone"}, {"app", "romance"}})["relationships"][0]["status"] == "dating");
  CHECK(dax.refusal({{"op", "arrest"}, {"target", "dominique"}}) == "not_police");
  CHECK(dax.refusal({{"op", "name_baby"}, {"child", "dominique"}, {"name", "X"}}) == "unknown_character");
}

// --- Protocol livera/1: replies, rules, sessions, scripts and caps -----------------------

namespace {

// A bare connection, for lines a well-behaved client never sends (broken JSON, missing ops, floods).
class RawClient {
 public:
  explicit RawClient(std::uint16_t port) {
    auto fd = net::connectTcp("127.0.0.1", port);
    if (!fd) throw std::runtime_error("connect failed");
    fd_ = std::move(fd).value();
  }
  void send(const std::string& lines) { REQUIRE(net::sendAll(fd_, lines)); }
  // Replies (events skipped), in arrival order, until `count` arrive or the time runs out.
  std::vector<Json> replies(std::size_t count, double seconds = 5) {
    std::vector<Json> out;
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::duration<double>(seconds);
    while (out.size() < count && std::chrono::steady_clock::now() < deadline) {
      auto line = net::readLine(fd_, buffer_, 100);
      if (!line || !line.value()) continue;
      Json m = Json::parse(*line.value());
      if (!m.contains("event")) out.push_back(std::move(m));
    }
    return out;
  }

 private:
  net::Fd fd_;
  net::LineBuffer buffer_;
};

void makeAccount(const std::string& db, const std::string& user, const std::string& pass) {
  auto store = SqliteStore::open(db);
  REQUIRE(store);
  REQUIRE(store.value()->createAccount(user, hashPassword(pass, 1000)));
}

Json listed(TestClient& c, const std::string& id) {
  const Json all = c.ok({{"op", "characters"}})["characters"];  // a copy: ranging over a temporary's member dangles
  for (const auto& ch : all) {
    if (ch["id"] == id) return ch;
  }
  return Json();
}

}  // namespace

TEST_CASE("server: look carries effects and cooldowns, map the opening hours, characters homes and workplaces") {
  RunningServer server(tempPath("views_net.db").string());
  TestClient nico(server.port());
  nico.login("nico", "nico-pass-123");
  // The pick list: every founder's home and workplace, by name.
  const Json dom = listed(nico, "dominique");
  CHECK(dom["home"].is_string());
  CHECK(dom["workplace"] == "Meridian Talent Partners");
  // Your own made character is listed with the same fields.
  std::ifstream in(std::string(LIVERA_DATA_DIR) + "/../scripts/demo/nico_vale.json");
  nico.ok({{"op", "create_character"}, {"character", Json::parse(in)}});
  const Json mine = listed(nico, "nico-vale");
  CHECK(mine["created"] == true);
  CHECK(mine["home"].is_string());
  CHECK(mine["workplace"].is_string());
  const Json here = nico.ok({{"op", "play"}})["here"];  // play answers look: Nico starts at home
  REQUIRE(!here["activities"].empty());
  std::string used;
  for (const auto& a : here["activities"]) {
    CHECK(a["needs"].is_object());
    CHECK(a["ready_at"].is_null());
    if (used.empty() && a["id"] != "restroom") used = a["id"].get<std::string>();
  }
  REQUIRE(!used.empty());
  nico.ok({{"op", "activity"}, {"activity", used}});
  Json again;
  const Json after = nico.ok({{"op", "look"}})["here"]["activities"];
  for (const auto& a : after) {
    if (a["id"] == used) again = a;
  }
  REQUIRE(again.is_object());
  CHECK(again["ready_at"].is_number_integer());
  CHECK(again["ready_in_minutes"].get<int>() > 0);
  // The map: opening hours and days per place.
  const Json places = nico.ok({{"op", "map"}})["places"];
  int withHours = 0;
  for (const auto& p : places) {
    CHECK(p.contains("hours") && p.contains("open_days"));
    if (p["id"] == "heritage_coffee") CHECK(p["hours"] == Json::array({6, 20}));
    withHours += p["hours"].is_array() ? 1 : 0;
  }
  CHECK(withHours > 0);
}

TEST_CASE("server: the goals phone app answers about your own character only") {
  RunningServer server(tempPath("goals_net.db").string());
  TestClient dom(server.port()), dax(server.port());
  dom.login("dom", "dom-pass-123");
  dax.login("dax", "dax-pass-123");
  CHECK(dom.refusal({{"op", "phone"}, {"app", "goals"}}) == "not_playing");
  dom.ok({{"op", "play"}, {"character", "dominique"}});
  dax.ok({{"op", "play"}, {"character", "dax"}});
  // Asking about someone else isn't a thing: extra arguments are ignored and the answer is still yours.
  const Json mine = dom.ok({{"op", "phone"}, {"app", "goals"}, {"character", "dax"}});
  REQUIRE(mine["today"].size() == 3);
  for (const auto& g : mine["today"]) {
    CHECK(g["label"].is_string());
    CHECK(g["done"].is_boolean());
    CHECK(g["progress"].is_string());
  }
  CHECK(mine["from"] == "story");
  CHECK(mine["aspirations"][0]["id"] == "get_promoted");
  CHECK(mine == dom.ok({{"op", "phone"}, {"app", "goals"}}));
  const Json his = dax.ok({{"op", "phone"}, {"app", "goals"}});
  CHECK(his["aspirations"] != mine["aspirations"]);
  CHECK(his.dump().find("dominique") == std::string::npos);
}

TEST_CASE("server: --night-skip skips the night only when everyone playing is asleep") {
  RunningServer server(tempPath("night_skip.db").string(), true, [](ServerConfig& cfg) { cfg.nightSkip = true; });
  TestClient dom(server.port()), dax(server.port());
  dom.login("dom", "dom-pass-123");
  dax.login("dax", "dax-pass-123");
  dom.ok({{"op", "play"}, {"character", "dominique"}});
  dax.ok({{"op", "play"}, {"character", "dax"}});  // both start at home
  dom.ok({{"op", "dev_advance"}, {"minutes", 14 * 60 + 30}});  // 21:30
  const Json first = dom.ok({{"op", "sleep"}});
  CHECK(first["asleep"] == true);
  CHECK(first["night_skip"]["on"] == true);
  CHECK(first["night_skip"]["others_awake"] == 1);
  // One person still up: the night goes on at its usual pace.
  dom.pump(1.0);
  CHECK(dom.ok({{"op", "look"}})["time"]["hour"] == 21);
  CHECK(!dom.sawEvent("good_morning"));
  const Json second = dax.ok({{"op", "sleep"}});
  CHECK(second["night_skip"]["others_awake"] == 0);
  // Everyone playing is asleep: the next tick lives the night out, and both wake to a good morning.
  for (int i = 0; i < 40 && !(dom.sawEvent("good_morning") && dax.sawEvent("good_morning")); ++i) {
    dom.pump(0.1);
    dax.pump(0.1);
  }
  CHECK(dom.sawEvent("good_morning"));
  CHECK(dax.sawEvent("good_morning"));
  const Json morning = dom.ok({{"op", "look"}});
  CHECK(morning["time"]["hour"] == 7);
  CHECK(morning["you"]["asleep"] == false);
  for (const auto& e : dom.events) {
    if (e["event"] == "good_morning") CHECK(e["data"]["skipped"] == true);
  }
}

TEST_CASE("server: without --night-skip, going to bed never skips time") {
  RunningServer server(tempPath("no_night_skip.db").string());
  TestClient dom(server.port());
  dom.login("dom", "dom-pass-123");
  dom.ok({{"op", "play"}, {"character", "dominique"}});
  CHECK(dom.refusal({{"op", "sleep"}}) == "not_bedtime");
  dom.ok({{"op", "dev_advance"}, {"minutes", 14 * 60 + 30}});
  const Json slept = dom.ok({{"op", "sleep"}});
  CHECK(slept["night_skip"]["on"] == false);
  CHECK(slept["night_skip"]["others_awake"] == 0);
  dom.pump(1.0);
  const Json look = dom.ok({{"op", "look"}});
  CHECK(look["time"]["hour"] == 21);
  CHECK(look["you"]["asleep"] == true);
  CHECK(!dom.sawEvent("good_morning"));
  dom.ok({{"op", "exit"}});  // any command gets you up
  CHECK(dom.ok({{"op", "look"}})["you"]["asleep"] == false);
}

TEST_CASE("server: --pause-when-empty stops the clock while nobody is in the world") {
  RunningServer paused(tempPath("pause_empty.db").string(), true, [](ServerConfig& cfg) {
    cfg.pauseWhenEmpty = true;
    cfg.autopilot = true;  // the autopilot's founders don't keep the town running on their own
  });
  TestClient dom(paused.port());
  dom.login("dom", "dom-pass-123");  // logged in, not in the world
  const std::string before = dom.ok({{"op", "hello"}})["world_time"].get<std::string>();
  dom.pump(2.5);
  CHECK(dom.ok({{"op", "hello"}})["world_time"] == before);
  // A person in the world: time runs.
  dom.ok({{"op", "play"}, {"character", "dominique"}});
  dom.pump(2.5);
  const std::string playing = dom.ok({{"op", "hello"}})["world_time"].get<std::string>();
  CHECK(playing != before);
  // They leave: it stops again.
  dom.ok({{"op", "logout"}});
  const std::string left = dom.ok({{"op", "hello"}})["world_time"].get<std::string>();
  dom.pump(2.5);
  CHECK(dom.ok({{"op", "hello"}})["world_time"] == left);
  // Without the flag (the default) the town runs on with nobody in it.
  RunningServer running(tempPath("run_empty.db").string());
  TestClient sam(running.port());
  const std::string at = sam.ok({{"op", "hello"}})["world_time"].get<std::string>();
  sam.pump(2.5);
  CHECK(sam.ok({{"op", "hello"}})["world_time"] != at);
}

TEST_CASE("server: every reply names its request, refusals included") {
  RunningServer server(tempPath("re.db").string(), /*dev=*/false);
  RawClient c(server.port());
  c.send("{\"id\": 5}\nnot json at all\n{\"id\": \"abc\", \"op\": 7}\n[1, 2]\n{\"id\": 6, \"op\": \"ping\"}\n");
  const auto r = c.replies(5);
  REQUIRE(r.size() == 5);
  CHECK(r[0]["re"] == 5);
  CHECK(r[0]["error"]["code"] == "bad_request");
  CHECK(r[1].contains("re"));
  CHECK(r[1]["re"].is_null());  // nothing to name: it wasn't JSON
  CHECK(r[1]["error"]["code"] == "bad_request");
  CHECK(r[2]["re"] == "abc");
  CHECK(r[2]["error"]["code"] == "bad_request");
  CHECK(r[3]["re"].is_null());
  CHECK(r[4]["re"] == 6);
  CHECK(r[4]["ok"] == true);
  // A flood on a fresh connection: the refusals say which request they refuse.
  RawClient flood(server.port());
  std::string burst;
  for (int i = 0; i < 60; ++i) burst += Json{{"op", "ping"}, {"id", 100 + i}}.dump() + "\n";
  flood.send(burst);
  const auto answers = flood.replies(60);
  REQUIRE(answers.size() == 60);
  int refused = 0;
  for (std::size_t i = 0; i < answers.size(); ++i) {
    CHECK(answers[i]["re"] == 100 + static_cast<int>(i));  // in order, each with its own id
    if (!answers[i].value("ok", false)) {
      ++refused;
      CHECK(answers[i]["error"]["code"] == "rate_limited");
    }
  }
  CHECK(refused > 0);
}

TEST_CASE("server: welcome and hello carry the protocol name and the public rules") {
  RunningServer server(tempPath("hello.db").string());
  TestClient c(server.port());
  const Json hello = c.ok({{"op", "hello"}});
  CHECK(hello["protocol"] == "livera/1");
  CHECK(hello["rules"]["sight_range_m"] == 160);
  CHECK(hello["rules"]["say_range_m"] == 20);
  CHECK(hello["rules"]["walk_speed_mps"] == 400.0);  // this test server's fast walking, from its data
  REQUIRE(!c.events.empty());
  CHECK(c.events[0]["event"] == "welcome");
  CHECK(c.events[0]["data"]["protocol"] == "livera/1");
  CHECK(c.events[0]["data"]["rules"] == hello["rules"]);
  c.login("pat", "password123");
  c.ok({{"op", "play"}, {"character", "dax"}});
  const Json map = c.ok({{"op", "map"}});
  CHECK(map["rules"] == hello["rules"]);
  CHECK(!map["transit"]["lines"].empty());
  CHECK(!map["interactions"].empty());
}

TEST_CASE("server: a token resumes a session; unknown and logged-out tokens don't") {
  RunningServer server(tempPath("tokens.db").string());
  TestClient a(server.port());
  a.ok({{"op", "register"}, {"username", "dom"}, {"password", "dom-pass-123"}});
  const Json in = a.ok({{"op", "login"}, {"username", "dom"}, {"password", "dom-pass-123"}});
  const std::string token = in["token"];
  CHECK(token.size() == 64);
  CHECK(token.find_first_not_of("0123456789abcdef") == std::string::npos);
  a.ok({{"op", "play"}, {"character", "dominique"}});

  // The phone drops the connection; a new one picks up with the token, no password.
  TestClient b(server.port());
  CHECK(b.refusal({{"op", "resume"}, {"token", "not-a-token"}}) == "bad_token");
  CHECK(b.refusal({{"op", "resume"}}) == "bad_token");
  const Json back = b.ok({{"op", "resume"}, {"token", token}});
  CHECK(back["username"] == "dom");
  CHECK(back["character"] == "dominique");
  CHECK(back["token"] == token);
  a.pump(0.3);
  CHECK(a.sawEvent("kicked"));  // one session per account, as with a password login
  b.ok({{"op", "play"}, {"character", "dominique"}});
  CHECK(b.refusal({{"op", "resume"}, {"token", token}}) == "already_logged_in");

  // Logging out ends that token.
  b.ok({{"op", "logout"}});
  TestClient c(server.port());
  CHECK(c.refusal({{"op", "resume"}, {"token", token}}) == "bad_token");

  // At most five live tokens per account: a sixth login drops the oldest.
  std::vector<std::string> tokens;
  for (int i = 0; i < 6; ++i) {
    TestClient d(server.port());
    tokens.push_back(d.ok({{"op", "login"}, {"username", "dom"}, {"password", "dom-pass-123"}})["token"]);
  }
  TestClient e(server.port());
  CHECK(e.refusal({{"op", "resume"}, {"token", tokens[0]}}) == "bad_token");
  CHECK(e.ok({{"op", "resume"}, {"token", tokens[1]}})["username"] == "dom");
}

TEST_CASE("server: an automatic reconnect (take_over false) never takes the account back from another device") {
  RunningServer server(tempPath("take_over.db").string());
  const Json password{{"op", "login"}, {"username", "dom"}, {"password", "dom-pass-123"}};
  TestClient phone(server.port());
  phone.ok({{"op", "register"}, {"username", "dom"}, {"password", "dom-pass-123"}});
  const std::string phoneToken = phone.ok(password)["token"];
  phone.ok({{"op", "play"}, {"character", "dominique"}});

  // The same device's half-open old connection holds the same token: it is replaced as before.
  TestClient phoneAgain(server.port());
  CHECK(phoneAgain.ok({{"op", "resume"}, {"token", phoneToken}, {"take_over", false}})["username"] == "dom");
  phone.pump(0.3);
  CHECK(phone.sawEvent("kicked"));

  // The laptop logs in with the password while the phone sleeps; the phone never hears `kicked`.
  TestClient laptop(server.port());
  const std::string laptopToken = laptop.ok(password)["token"];
  CHECK(laptopToken != phoneToken);
  laptop.ok({{"op", "play"}, {"character", "dominique"}});

  // The phone wakes and reconnects on its own: refused, nobody kicked, and it isn't logged in.
  TestClient woken(server.port());
  CHECK(woken.refusal({{"op", "resume"}, {"token", phoneToken}, {"take_over", false}}) == "in_use_elsewhere");
  CHECK(woken.refusal({{"op", "characters"}}) == "not_logged_in");
  laptop.pump(0.3);
  CHECK(!laptop.sawEvent("kicked"));
  CHECK(laptop.ok({{"op", "look"}})["you"]["id"] == "dominique");

  // "Play here instead" (or an older client that omits the flag) takes the session over, kicking the laptop.
  CHECK(woken.ok({{"op", "resume"}, {"token", phoneToken}})["character"] == "dominique");
  laptop.pump(0.3);
  CHECK(laptop.sawEvent("kicked"));
  woken.ok({{"op", "play"}, {"character", "dominique"}});
}

TEST_CASE("server: tokens expire") {
  RunningServer server(tempPath("token_expiry.db").string(), true,
                       [](ServerConfig& cfg) { cfg.tokenLifetimeSeconds = 1.0; });
  TestClient a(server.port());
  a.ok({{"op", "register"}, {"username", "dom"}, {"password", "dom-pass-123"}});
  const std::string token = a.ok({{"op", "login"}, {"username", "dom"}, {"password", "dom-pass-123"}})["token"];
  std::this_thread::sleep_for(std::chrono::milliseconds(1200));
  TestClient b(server.port());
  CHECK(b.refusal({{"op", "resume"}, {"token", token}}) == "bad_token");
}

TEST_CASE("server: wrong passwords lock a username's logins for a while, right password or not") {
  RunningServer server(tempPath("throttle.db").string());
  TestClient c(server.port());
  c.ok({{"op", "register"}, {"username", "dom"}, {"password", "dom-pass-123"}});
  c.ok({{"op", "register"}, {"username", "sam"}, {"password", "sam-pass-123"}});
  const Json wrong{{"op", "login"}, {"username", "dom"}, {"password", "guess-guess"}};
  const Json right{{"op", "login"}, {"username", "dom"}, {"password", "dom-pass-123"}};
  for (int i = 0; i < 4; ++i) CHECK(c.refusal(wrong) == "bad_credentials");
  c.ok(right);  // a success clears the count
  c.ok({{"op", "logout"}});
  for (int i = 0; i < 5; ++i) CHECK(c.refusal(wrong) == "bad_credentials");
  CHECK(c.refusal(right) == "login_throttled");
  CHECK(c.refusal(wrong) == "login_throttled");
  c.ok({{"op", "login"}, {"username", "sam"}, {"password", "sam-pass-123"}});  // other accounts are untouched
}

TEST_CASE("server: login throttling and session tokens keep time correctly") {
  LoginThrottle t(5, 600, 600);
  for (int i = 0; i < 4; ++i) t.failed("dom", i);
  CHECK(!t.locked("dom", 4));
  for (int i = 0; i < 4; ++i) t.failed("dom", 700 + i);  // the first four fell out of the window
  CHECK(!t.locked("dom", 704));
  t.failed("dom", 704);
  CHECK(t.locked("dom", 704));
  CHECK(t.locked("dom", 704 + 599));
  CHECK(!t.locked("dom", 704 + 600));
  CHECK(!t.locked("sam", 704));
  t.succeeded("dom");
  CHECK(t.tracked() == 0);
  LoginThrottle spray(5, 600, 600);
  for (int i = 0; i < 5000; ++i) spray.failed("u" + std::to_string(i), 0);
  CHECK(spray.tracked() == LoginThrottle::kDefaultMaxTracked);  // made-up names can't grow memory without end
  spray.failed("late", 1000);  // everything older than the window is swept
  CHECK(spray.tracked() == 1);

  SessionTokens tokens(100, 5);
  std::vector<std::string> mine;
  for (int i = 0; i < 6; ++i) mine.push_back(tokens.issue("dom", i).value());
  CHECK(!tokens.resolve(mine[0], 10));  // the oldest went when the sixth came
  CHECK(*tokens.resolve(mine[1], 10) == "dom");
  const std::string sam = tokens.issue("sam", 10).value();
  CHECK(*tokens.resolve(sam, 109) == "sam");
  CHECK(!tokens.resolve(mine[5], 105));  // 100 s after it was issued
  tokens.revoke(sam);
  CHECK(!tokens.resolve(sam, 10));
  CHECK(mine[1] != mine[2]);

  CHECK(checkUsername("bot_maya"));
  CHECK(isScriptAccount("bot_maya"));
  CHECK(!isScriptAccount("robot_maya"));
  CHECK(checkUsername("ab").error().code == "invalid_username");
  CHECK(checkUsername("Dom").error().code == "invalid_username");
  CHECK(checkUsername(std::string(25, 'a')).error().code == "invalid_username");
  CHECK(checkPassword("short").error().code == "invalid_password");
  CHECK(checkPassword("long enough"));
}

TEST_CASE("server: a flood of made-up usernames is bounded and pushes out its own records first") {
  LoginThrottle t(5, 600, 600, /*maxTracked=*/100);
  t.failed(std::string(10000, 'a'), 0);  // could never be an account
  t.failed("Dom", 0);
  t.failed("", 0);
  CHECK(t.tracked() == 0);
  for (int i = 0; i < 5; ++i) t.failed("dom", 1);  // locked
  for (int i = 0; i < 4; ++i) t.failed("sam", 1);  // one more and he's locked too
  for (int i = 0; i < 1000; ++i) t.failed("spray" + std::to_string(i), 2 + i * 0.1);
  CHECK(t.tracked() == 100);
  CHECK(t.locked("dom", 200));
  t.failed("sam", 200);
  CHECK(t.locked("sam", 200));
  // Only once every record left is a lock does a newcomer take the place of the lock that ends soonest.
  LoginThrottle full(1, 600, 600, 3);
  for (const char* name : {"aaa", "bbb", "ccc", "ddd"}) full.failed(name, name[0] - 'a');
  CHECK(full.tracked() == 3);
  CHECK(!full.locked("aaa", 10));
  CHECK(full.locked("bbb", 10));
  CHECK(full.locked("ddd", 10));
}

TEST_CASE("server: logins for names that can't be accounts are refused alike and never throttled") {
  RunningServer server(tempPath("throttle_names.db").string());
  TestClient c(server.port());
  c.ok({{"op", "register"}, {"username", "dom"}, {"password", "dom-pass-123"}});
  for (const std::string& name : {std::string("Dom"), std::string(10000, 'd'), std::string("d")}) {
    for (int i = 0; i < 7; ++i) CHECK(c.refusal({{"op", "login"}, {"username", name}, {"password", "guess-guess"}}) ==
                                      "bad_credentials");
  }
  c.ok({{"op", "login"}, {"username", "dom"}, {"password", "dom-pass-123"}});
}

// Puts the descriptor limit back however a test ends; every later test needs it.
struct FdLimitGuard {
  rlimit was{};
  FdLimitGuard() { REQUIRE(::getrlimit(RLIMIT_NOFILE, &was) == 0); }
  ~FdLimitGuard() { (void)::setrlimit(RLIMIT_NOFILE, &was); }
  FdLimitGuard(const FdLimitGuard&) = delete;
  FdLimitGuard& operator=(const FdLimitGuard&) = delete;
};

TEST_CASE("server: out of file descriptors, the server waits instead of spinning, then takes the queued connection") {
  RunningServer server(tempPath("emfile.db").string());
  TestClient first(server.port());
  first.ok({{"op", "ping"}});
  sockaddr_in addr{};
  addr.sin_family = AF_INET;
  addr.sin_port = htons(server.port());
  addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);

  FdLimitGuard guard;
  int highest = 0;
  for (int fd = 0; fd < 65536 && static_cast<rlim_t>(fd) < guard.was.rlim_cur; ++fd) {
    if (::fcntl(fd, F_GETFD) != -1) highest = fd;
  }
  rlimit low = guard.was;
  low.rlim_cur = std::min<rlim_t>(guard.was.rlim_cur, static_cast<rlim_t>(highest) + 8);
  REQUIRE(::setrlimit(RLIMIT_NOFILE, &low) == 0);
  // Every descriptor the process may open is taken but one. The next client's socket takes that, so the server (in
  // this same process) can't accept its connection, which waits in the listen queue.
  std::vector<net::Fd> filler;
  for (net::Fd fd(::dup(0)); fd.valid(); fd = net::Fd(::dup(0))) filler.push_back(std::move(fd));
  REQUIRE(!filler.empty());
  filler.pop_back();
  net::Fd queued(::socket(AF_INET, SOCK_STREAM, 0));
  REQUIRE(queued.valid());
  REQUIRE(::connect(queued.get(), reinterpret_cast<const sockaddr*>(&addr), sizeof addr) == 0);

  timespec cpu0{}, cpu1{};
  ::clock_gettime(CLOCK_PROCESS_CPUTIME_ID, &cpu0);
  std::this_thread::sleep_for(std::chrono::milliseconds(800));
  ::clock_gettime(CLOCK_PROCESS_CPUTIME_ID, &cpu1);
  const double busy =
      static_cast<double>(cpu1.tv_sec - cpu0.tv_sec) + static_cast<double>(cpu1.tv_nsec - cpu0.tv_nsec) / 1e9;
  CHECK(busy < 0.25);  // a loop that polls the readable listener over and over burns all 0.8 s
  first.ok({{"op", "ping"}});  // sessions already open are served throughout

  filler.clear();
  REQUIRE(::setrlimit(RLIMIT_NOFILE, &guard.was) == 0);
  // Descriptors free again: the queued connection is accepted and welcomed.
  net::LineBuffer buf;
  auto line = net::readLine(queued, buf, 3000);
  REQUIRE(line);
  REQUIRE(line.value());
  CHECK(Json::parse(*line.value())["event"] == "welcome");
}

TEST_CASE("server: scripts are labelled, never claim, and always give way to a person") {
  const std::string db = tempPath("scripts.db").string();
  makeAccount(db, "bot_dax", "bot-pass-123");
  makeAccount(db, "bot_two", "bot-pass-123");
  RunningServer server(db);
  TestClient bot(server.port()), bot2(server.port()), dom(server.port()), sam(server.port());
  CHECK(dom.refusal({{"op", "register"}, {"username", "bot_maya"}, {"password", "password123"}}) == "invalid_username");
  bot.login("bot_dax", "bot-pass-123", /*registerFirst=*/false);
  bot2.login("bot_two", "bot-pass-123", false);
  CHECK(bot.ok({{"op", "characters"}})["can_create"] == false);
  CHECK(bot.refusal({{"op", "create_character"}, {"character", Json::object()}}) == "forbidden");
  CHECK(bot.refusal({{"op", "play"}}) == "unknown_character");  // a script has no character of its own
  bot.ok({{"op", "play"}, {"character", "dax"}});
  CHECK(bot2.refusal({{"op", "play"}, {"character", "dax"}}) == "character_in_use");
  dom.login("dom", "dom-pass-123");
  dom.ok({{"op", "play"}, {"character", "dominique"}});
  CHECK(bot2.refusal({{"op", "play"}, {"character", "dominique"}}) == "character_claimed");

  // Playing wrote no claim: Dax is still free for a person, and listed as played by a script.
  Json dax = listed(dom, "dax");
  CHECK(dax["available"] == true);
  CHECK(dax["scripted_now"] == true);
  CHECK(listed(dom, "dominique")["scripted_now"] == false);
  CHECK(listed(bot2, "dax")["available"] == false);        // in use
  CHECK(listed(bot2, "dominique")["available"] == false);  // claimed
  CHECK(listed(bot2, "sienna")["available"] == true);

  // Everyone who can see him is told a script is playing him.
  for (TestClient* c : {&bot, &dom}) {
    c->ok({{"op", "exit"}});
    c->walkTo("heritage_coffee");
    c->ok({{"op", "enter"}, {"location", "heritage_coffee"}});
  }
  const Json seen = dom.ok({{"op", "look"}})["people"];
  REQUIRE(seen.size() == 1);
  CHECK(seen[0]["id"] == "dax");
  CHECK(seen[0]["scripted"] == true);
  dom.pump(0.3);
  CHECK(dom.lastSeen("dax")["scripted"] == true);

  // A person takes the character: the script is released and steps out, still logged in.
  sam.login("sam", "sam-pass-123");
  const Json took = sam.ok({{"op", "play"}, {"character", "dax"}});
  CHECK(took["you"]["inside"] == "heritage_coffee");
  CHECK(took["people"][0]["id"] == "dominique");
  bot.pump(0.3);
  Json released;
  for (const auto& e : bot.events) {
    if (e.value("event", "") == "released") released = e["data"];
  }
  REQUIRE(released.is_object());
  CHECK(released["character"] == "dax");
  CHECK(released["reason"] == "a player took this character");
  CHECK(bot.refusal({{"op", "look"}}) == "not_playing");
  CHECK(bot.refusal({{"op", "play"}, {"character", "dax"}}) == "character_claimed");  // Sam's now
  bot.ok({{"op", "play"}, {"character", "sienna"}});  // the script can carry on with someone free
  dom.pump(0.3);
  CHECK(dom.lastSeen("dax")["state"] == "here");
  CHECK(dom.lastSeen("dax")["scripted"] == false);
  dax = listed(dom, "dax");
  CHECK(dax["available"] == false);
  CHECK(dax["scripted_now"] == false);
}

TEST_CASE("server: the player cap counts people; scripts have their own") {
  const std::string db = tempPath("caps.db").string();
  makeAccount(db, "bot_one", "bot-pass-123");
  makeAccount(db, "bot_two", "bot-pass-123");
  RunningServer server(db, true, [](ServerConfig& cfg) {
    cfg.maxPlayers = 1;
    cfg.maxScripted = 1;
  });
  TestClient dom(server.port()), sam(server.port()), b1(server.port()), b2(server.port());
  dom.login("dom", "dom-pass-123");
  dom.ok({{"op", "play"}, {"character", "dominique"}});
  b1.login("bot_one", "bot-pass-123", false);
  b1.ok({{"op", "play"}, {"character", "dax"}});  // a script doesn't take a person's place
  sam.login("sam", "sam-pass-123");
  CHECK(sam.refusal({{"op", "play"}, {"character", "aaliyah"}}) == "server_full");
  CHECK(sam.refusal({{"op", "play"}, {"character", "dax"}}) == "server_full");  // taking over still adds a person
  b2.login("bot_two", "bot-pass-123", false);
  CHECK(b2.refusal({{"op", "play"}, {"character", "aaliyah"}}) == "server_full");
  dom.ok({{"op", "logout"}});
  sam.ok({{"op", "play"}, {"character", "dax"}});
  b1.pump(0.3);
  CHECK(b1.sawEvent("released"));
  b2.ok({{"op", "play"}, {"character", "aaliyah"}});  // the released script freed its slot
}

TEST_CASE("server: a claim released while its player is in the world doesn't hand the character over") {
  const std::string db = tempPath("release_live.db").string();
  RunningServer server(db);
  TestClient dom(server.port()), sam(server.port());
  dom.login("dom", "dom-pass-123");
  dom.ok({{"op", "play"}, {"character", "dominique"}});
  {
    auto admin = SqliteStore::open(db);  // livera_server --release-character, while the server runs
    REQUIRE(admin);
    auto r = admin.value()->releaseCharacter("dominique");
    REQUIRE(r);
    REQUIRE(r.value().has_value());
    CHECK(*r.value() == "dom");
  }
  sam.login("sam", "sam-pass-123");
  CHECK(listed(sam, "dominique")["available"] == false);
  CHECK(sam.refusal({{"op", "play"}, {"character", "dominique"}}) == "character_in_use");
  dom.ok({{"op", "logout"}});
  CHECK(listed(sam, "dominique")["available"] == true);
  sam.ok({{"op", "play"}, {"character", "dominique"}});
  TestClient again(server.port());
  again.login("dom", "dom-pass-123", false);
  CHECK(again.refusal({{"op", "play"}, {"character", "dominique"}}) == "character_taken");
}

TEST_CASE("server: --autopilot runs unclaimed founders, labelled played_by autopilot, and a person takes one over") {
  const std::string db = tempPath("autopilot.db").string();
  makeAccount(db, "bot_one", "bot-pass-123");
  // Fast walking, and Dax's weekday starts with coffee at 07:00 so he turns up where a person can see him.
  static auto content = patchedContent([](Json& doc, const std::string& file) {
    if (file == "simulation.json") doc["simulation"]["walk_speed_mps"] = 400.0;
    if (file == "dax.json")
      doc["characters"][0]["profile"]["schedule"]["weekdays"] =
          Json::array({Json{{"time", "07:00"}, {"activity", "Heritage Coffee"}}});
  });
  RunningServer server(db, true, [](ServerConfig& cfg) {
    cfg.autopilot = true;
    cfg.content = content;
  });
  TestClient dom(server.port()), sam(server.port()), bot(server.port());
  dom.login("dom", "dom-pass-123");
  // Every unclaimed founder is on autopilot from the start, and still free for a person to take.
  Json dax = listed(dom, "dax");
  CHECK(dax["scripted_now"] == true);
  CHECK(dax["played_by"] == "autopilot");
  CHECK(dax["available"] == true);
  CHECK(listed(dom, "dominique")["played_by"] == "autopilot");

  // Taking Dominique releases her from the autopilot before Dom connects; nobody else is labelled differently.
  const Json took = dom.ok({{"op", "play"}, {"character", "dominique"}});
  CHECK(took["you"]["id"] == "dominique");
  CHECK(listed(dom, "dominique")["scripted_now"] == false);
  CHECK(!listed(dom, "dominique").contains("played_by"));

  // Dax walks to Heritage Coffee on his own; Dom gets there and sees him labelled.
  dom.ok({{"op", "exit"}});
  dom.walkTo("heritage_coffee");
  dom.ok({{"op", "enter"}, {"location", "heritage_coffee"}});
  Json seenDax;
  for (int i = 0; i < 80 && seenDax.is_null(); ++i) {
    const Json seen = dom.ok({{"op", "look"}});  // named: a temporary's ["people"] wouldn't outlive the loop
    for (const auto& p : seen["people"]) {
      if (p["id"] == "dax") seenDax = p;
    }
    if (seenDax.is_null()) dom.pump(0.25);
  }
  REQUIRE(seenDax.is_object());
  CHECK(seenDax["scripted"] == true);
  CHECK(seenDax["played_by"] == "autopilot");
  CHECK(dom.lastSeen("dax")["played_by"] == "autopilot");  // the people stream says so too

  // A script account can't borrow a character the autopilot has; a person can, at once.
  bot.login("bot_one", "bot-pass-123", /*registerFirst=*/false);
  CHECK(bot.refusal({{"op", "play"}, {"character", "dax"}}) == "character_in_use");
  sam.login("sam", "sam-pass-123");
  const Json sams = sam.ok({{"op", "play"}, {"character", "dax"}});
  CHECK(sams["you"]["inside"] == "heritage_coffee");
  CHECK(listed(dom, "dax")["scripted_now"] == false);
  CHECK(listed(dom, "dax")["available"] == false);
  Json nowDax;
  const Json after = dom.ok({{"op", "look"}});
  for (const auto& p : after["people"]) {
    if (p["id"] == "dax") nowDax = p;
  }
  REQUIRE(nowDax.is_object());
  CHECK(nowDax["scripted"] == false);
  CHECK(!nowDax.contains("played_by"));
  // The autopilot has let go: Dax stays where Sam found him.
  sam.pump(4.0);
  const Json still = sam.ok({{"op", "look"}})["you"];
  CHECK(still["inside"] == "heritage_coffee");
  CHECK(still["moving"] == false);
  // Sam's claim stays after a logout, so Dax doesn't go back on autopilot: a claimed character is a person's.
  sam.ok({{"op", "logout"}});
  CHECK(listed(dom, "dax")["scripted_now"] == false);
  CHECK(!listed(dom, "dax").contains("played_by"));
  // Once the operator releases the claim and the player leaves, the autopilot takes the character back.
  TestClient again(server.port());
  again.login("sam", "sam-pass-123", /*registerFirst=*/false);
  again.ok({{"op", "play"}, {"character", "dax"}});
  {
    auto admin = SqliteStore::open(db);  // livera_server --release-character dax, while the server runs
    REQUIRE(admin);
    REQUIRE(admin.value()->releaseCharacter("dax"));
  }
  CHECK(listed(dom, "dax")["scripted_now"] == false);  // Sam keeps playing until they leave
  again.ok({{"op", "logout"}});
  CHECK(listed(dom, "dax")["scripted_now"] == true);
  CHECK(listed(dom, "dax")["played_by"] == "autopilot");
}

// interiors (D-066): two people in one café's room over the wire.
TEST_CASE("server: inside a place with a room: look shows it, move_inside / sit / stand, one person a seat, room events") {
  RunningServer server(tempPath("rooms_net.db").string());
  TestClient dom(server.port()), dax(server.port());
  dom.login("domr", "dom-pass-123");
  dax.login("daxr", "dax-pass-123");
  dom.ok({{"op", "play"}, {"character", "dominique"}});
  dax.ok({{"op", "play"}, {"character", "dax"}});
  for (TestClient* c : {&dom, &dax}) {
    c->ok({{"op", "exit"}});
    c->walkTo("heritage_coffee");
  }
  // enter answers look: the room, and you at its entrance.
  const Json entered = dom.ok({{"op", "enter"}, {"location", "heritage_coffee"}});
  const Json room = entered["here"]["room"];
  REQUIRE(room.is_object());
  CHECK(room["interior"]["id"] == "heritage_coffee");
  CHECK(room["interior"]["size"] == Json::array({1536, 1024}));
  CHECK(room["people"].size() == 1);
  CHECK(room["people"][0]["at"] == room["interior"]["entrance"]["at"]);
  dax.ok({{"op", "enter"}, {"location", "heritage_coffee"}});
  std::string seat;
  for (const auto& s : room["interior"]["spots"]) {
    if (s["kind"] == "seat" && seat.empty()) seat = s["id"].get<std::string>();
  }
  REQUIRE(!seat.empty());
  // Refusals keep their codes over the wire.
  CHECK(dom.refusal({{"op", "move_inside"}, {"x", 3}, {"y", 3}}) == "off_floor");
  CHECK(dom.refusal({{"op", "move_inside"}, {"x", "here"}}) == "bad_request");
  CHECK(dom.refusal({{"op", "sit"}, {"spot", "throne"}}) == "no_such_spot");
  CHECK(dom.refusal({{"op", "sit"}, {"spot", "counter"}}) == "not_a_seat");
  const Json moved = dom.ok({{"op", "move_inside"}, {"x", 700}, {"y", 760}});
  CHECK(moved["at"] == Json::array({700, 760}));
  CHECK(moved["spot"].is_null());
  CHECK(dom.ok({{"op", "sit"}, {"spot", seat}})["spot"] == seat);
  CHECK(dax.refusal({{"op", "sit"}, {"spot", seat}}) == "spot_taken");
  // Dax sees her in her seat: in the room event and in his look.
  dax.pump(0.4);
  Json last;
  for (const auto& e : dax.events) {
    if (e.value("event", "") != "room") continue;
    CHECK(e["data"]["place"] == "heritage_coffee");
    for (const auto& c : e["data"]["changes"]) {
      if (c["character"] == "dominique") last = c;
    }
  }
  REQUIRE(last.is_object());
  CHECK(last["spot"] == seat);
  bool seen = false;
  const Json daxLook = dax.ok({{"op", "look"}});
  for (const auto& p : daxLook["here"]["room"]["people"]) seen |= p["id"] == "dominique" && p["spot"] == seat;
  CHECK(seen);
  // She stands; now he can sit there.
  CHECK(dom.ok({{"op", "stand"}})["spot"].is_null());
  CHECK(dax.ok({{"op", "sit"}, {"spot", seat}})["spot"] == seat);
  // A purchase serves you at the counter.
  CHECK(dom.ok({{"op", "buy"}, {"offer", "latte"}, {"method", "card"}})["room"]["spot"] == "counter");
  // Outdoors there's no room.
  dom.ok({{"op", "exit"}});
  CHECK(dom.refusal({{"op", "move_inside"}, {"x", 700}, {"y", 760}}) == "not_inside");
  CHECK(dom.refusal({{"op", "stand"}}) == "not_inside");
  CHECK(!dom.ok({{"op", "look"}})["here"].contains("room"));
}

// Life events and street life over the wire (D-068, D-069, D-070).
TEST_CASE("server: life events: life_event arrives, the story app lists it, event_answer applies it") {
  RunningServer server(tempPath("events_net.db").string());
  TestClient dom(server.port());
  dom.login("domev", "dom-pass-123");
  dom.ok({{"op", "play"}, {"character", "dominique"}});
  CHECK(dom.refusal({{"op", "event_answer"}, {"event", "dropped_wallet"}}) == "bad_request");
  CHECK(dom.refusal({{"op", "event_answer"}, {"event", "dropped_wallet"}, {"option", 0}}) == "unknown_event");
  // A day goes by: something comes up.
  Json offered;
  for (int i = 0; i < 16 && offered.is_null(); ++i) {
    dom.ok({{"op", "dev_advance"}, {"minutes", 60}});
    dom.pump(0.05);
    for (const auto& e : dom.events) {
      if (e.value("event", "") == "life_event") offered = e["data"];
    }
  }
  REQUIRE(offered.is_object());
  CHECK(offered["prompt"].is_string());
  CHECK(offered["choices"].size() >= 2);
  CHECK(offered["choices"][0]["label"].is_string());
  CHECK(offered["lapses_in_minutes"].is_number_integer());
  const Json story = dom.ok({{"op", "phone"}, {"app", "story"}});
  REQUIRE(story["pending"].size() == 1);
  CHECK(story["pending"][0]["event"] == offered["event"]);
  CHECK(story["story"].is_array());
  // Answer with a choice that costs nothing.
  int option = -1;
  for (const auto& c : offered["choices"]) {
    if (!c.contains("cost_cents")) option = c["option"].get<int>();
  }
  REQUIRE(option >= 0);
  CHECK(dom.refusal({{"op", "event_answer"}, {"event", offered["event"]}, {"option", 9}}) == "bad_option");
  const Json r = dom.ok({{"op", "event_answer"}, {"event", offered["event"]}, {"option", option}});
  CHECK(r["outcome"].is_string());
  CHECK(r["changes"]["memory"].is_string());
  const Json after = dom.ok({{"op", "phone"}, {"app", "story"}});
  CHECK(after["pending"].empty());
  CHECK(after["story"][0]["life_event"] == true);
  CHECK(after["story"][0]["text"] == r["changes"]["memory"]);
}

TEST_CASE("server: street life: crime_risk, the wanted line in look, a fight asked and answered over the wire") {
  RunningServer server(tempPath("street_net.db").string());
  TestClient dom(server.port()), dax(server.port());
  dom.login("domst", "dom-pass-123");
  dax.login("daxst", "dax-pass-123");
  dom.ok({{"op", "play"}, {"character", "dominique"}});
  dax.ok({{"op", "play"}, {"character", "dax"}});
  dom.ok({{"op", "dev_advance"}, {"minutes", 3 * 60}});  // 10:00
  dom.ok({{"op", "exit"}});
  dax.ok({{"op", "exit"}});
  dom.walkTo("heritage_coffee");
  dom.ok({{"op", "enter"}, {"location", "heritage_coffee"}});
  dax.walkTo("heritage_coffee");
  dax.ok({{"op", "enter"}, {"location", "heritage_coffee"}});
  const Json risk = dom.ok({{"op", "crime_risk"}, {"crime", "assault"}, {"target", "dax"}});
  CHECK(risk["chance"].is_number());
  CHECK(risk["if_caught"]["fine_cents"].is_number_integer());
  CHECK(risk["self_defence"].is_string());
  CHECK(dom.refusal({{"op", "crime_risk"}, {"crime", "littering"}}) == "unknown_crime");
  CHECK(dom.refusal({{"op", "fight_prefs"}}) == "bad_request");
  CHECK(dom.ok({{"op", "fight_prefs"}, {"walk_away", false}})["walk_away_from_fights"] == false);
  CHECK(dom.refusal({{"op", "fight"}, {"target", "dominique"}}) == "invalid_target");
  const Json started = dom.ok({{"op", "fight"}, {"target", "dax"}});
  CHECK(started["status"] == "waiting");
  dax.pump(0.2);
  Json asked;
  for (const auto& e : dax.events) {
    if (e.value("event", "") == "fight_started") asked = e["data"];
  }
  REQUIRE(asked.is_object());
  CHECK(asked["from"] == "dominique");
  CHECK(dom.refusal({{"op", "fight_respond"}, {"fight", asked["fight"]}, {"choice", "run"}}) == "unknown_fight");
  CHECK(dax.refusal({{"op", "fight_respond"}, {"fight", asked["fight"]}, {"choice", "dance"}}) == "bad_choice");
  // Fighting back is Beat Brawl (D-077): both are told, beats come as events, and either can walk away.
  const Json brawl = dax.ok({{"op", "fight_respond"}, {"fight", asked["fight"]}, {"choice", "fight_back"}});
  CHECK(brawl["status"] == "brawl");
  CHECK(brawl["role"] == "defender");
  CHECK(dax.refusal({{"op", "fight_beat"}, {"fight", asked["fight"]}, {"answer", "kick"}}) == "bad_answer");
  CHECK(dom.refusal({{"op", "fight_beat"}, {"fight", "fight-0"}, {"answer", "duck"}}) == "unknown_fight");
  dom.pump(0.2);
  bool squaredUp = false;
  for (const auto& e : dom.events) squaredUp |= e.value("event", "") == "brawl" && e["data"]["role"] == "attacker";
  CHECK(squaredUp);
  const Json mine = dax.ok({{"op", "fight_beat"}, {"fight", asked["fight"]}, {"answer", "walk_away"}});
  CHECK(mine["role"] == "defender");
  CHECK(mine["text"].is_string());
  dom.pump(0.2);
  Json told;
  for (const auto& e : dom.events) {
    if (e.value("event", "") == "fight_result") told = e["data"];
  }
  REQUIRE(told.is_object());
  CHECK(told["role"] == "attacker");
  CHECK(told["outcome"] == mine["outcome"]);
  // If it was reported, look says so; if she was caught, look says until when.
  const Json you = dom.ok({{"op", "look"}})["you"];
  if (told.contains("crime") && told["crime"].value("arrested", false)) CHECK(you["jailed_until"].is_number_integer());
  if (told.contains("crime") && told["crime"].value("wanted", false)) CHECK(you["wanted_for"] == "Assault");
  CHECK(dom.refusal({{"op", "fight"}, {"target", "dax"}}) != "(accepted)");  // once a pair a day
}

TEST_CASE("server: three looks over the wire: wear, what look and the people stream say, the Items app, give refused") {
  RunningServer server(tempPath("outfits_net.db").string());
  TestClient dom(server.port()), dax(server.port());
  dom.login("domfit", "dom-pass-123");
  dax.login("daxfit", "dax-pass-123");
  dom.ok({{"op", "play"}, {"character", "dominique"}});
  dax.ok({{"op", "play"}, {"character", "dax"}});
  dom.ok({{"op", "dev_advance"}, {"minutes", 3 * 60}});  // 10:00
  dom.ok({{"op", "exit"}});
  dax.ok({{"op", "exit"}});
  dom.walkTo("heritage_coffee");
  dom.ok({{"op", "enter"}, {"location", "heritage_coffee"}});
  dax.walkTo("heritage_coffee");
  dax.ok({{"op", "enter"}, {"location", "heritage_coffee"}});
  // Nothing chosen: each is seen in the look their art shows (D-079).
  const Json look = dom.ok({{"op", "look"}});
  CHECK(look["you"]["look"] == "work");
  Json seen;
  for (const auto& p : look["people"]) {
    if (p["id"] == "dax") seen = p;
  }
  REQUIRE(seen.is_object());
  CHECK(seen["look"] == "work");
  CHECK(!seen.contains("look_label"));
  // Your own three looks, only in your own Items app.
  const Json items = dax.ok({{"op", "phone"}, {"app", "items"}});
  REQUIRE(items["looks"].size() == 3);
  CHECK(items["drawn"] == "work");
  CHECK(items["look"] == "work");
  for (const auto& l : items["looks"]) {
    CHECK(l["garments"].is_string());
    CHECK(l["condition"] == "clean");
    CHECK(l["item"].is_string());
  }
  // He changes; she's told by the people stream.
  const Json worn = dax.ok({{"op", "wear"}, {"item", "outfit_evening"}});
  CHECK(worn["look"] == "evening");
  CHECK(worn["outfit"] == "outfit_evening");
  dom.pump(0.3);
  CHECK(dom.lastSeen("dax")["look"] == "evening");
  CHECK(dax.ok({{"op", "look"}})["you"]["look"] == "evening");
  // His own clothes stay his.
  CHECK(dax.refusal({{"op", "give"}, {"to", "dominique"}, {"item", "outfit_work"}}) == "personal_item");
  const Json off = dax.ok({{"op", "take_off"}, {"slot", "outfit"}});
  CHECK(off["look"] == "work");
  dom.pump(0.3);
  CHECK(dom.lastSeen("dax")["look"] == "work");
}

TEST_CASE("server: the default script cap has room for every playable character in data (D-073)") {
  // The town director plays every character nobody has claimed, one bot_ session each; with the residents and the
  // townspeople that's more than the old cap of 16.
  std::size_t playable = 0;
  for (const auto& [id, def] : realContent()->characters()) playable += def.playable ? 1 : 0;
  CHECK(playable > 16);
  CHECK(ServerConfig{}.maxScripted >= playable);
}

TEST_CASE("server: social media over the wire: post, like, comment, follow, the feeds, a toast, and messages seen") {
  RunningServer server(tempPath("social_net.db").string());
  TestClient dom(server.port()), dax(server.port());
  dom.login("domsocial", "dom-pass-123");
  dax.login("daxsocial", "dax-pass-123");
  dom.ok({{"op", "play"}, {"character", "dominique"}});
  dax.ok({{"op", "play"}, {"character", "dax"}});
  const Json posted = dom.ok({{"op", "post"}, {"text", "Hello, Livéra"}, {"tags", {"dax"}}});
  const std::string pid = posted["post"]["post"].get<std::string>();
  CHECK(posted["post"]["author"]["handle"] == "dom.ashford");
  CHECK(posted["post"]["tags"][0]["account"] == "dax");
  CHECK(dom.refusal({{"op", "post"}, {"text", "Again"}}) == "too_soon");
  CHECK(dom.refusal({{"op", "post"}, {"text", "x"}, {"tags", "dax"}}) == "bad_request");
  CHECK(dom.refusal({{"op", "post"}, {"text", "Hi"}, {"place", "copper_tap"}}) == "not_there");
  CHECK(dax.ok({{"op", "like"}, {"post", pid}})["likes"] == 1);
  CHECK(dax.refusal({{"op", "like"}, {"post", pid}}) == "already_liked");
  CHECK(dom.refusal({{"op", "like"}, {"post", pid}}) == "own_post");
  CHECK(dax.refusal({{"op", "unlike"}, {"post", "post-0"}}) == "unknown_post");
  CHECK(dax.ok({{"op", "comment"}, {"post", pid}, {"text", "Welcome!"}})["post"]["comments"] == 1);
  CHECK(dax.refusal({{"op", "comment"}, {"post", pid}, {"text", ""}}) == "invalid_text");
  CHECK(dax.ok({{"op", "follow"}, {"account", "dominique"}})["following"] == true);
  CHECK(dax.refusal({{"op", "follow"}, {"account", "dominique"}}) == "already_following");
  CHECK(dax.refusal({{"op", "follow"}, {"account", "nobody"}}) == "unknown_account");
  CHECK(dax.refusal({{"op", "unfollow"}, {"account", "livera.unfiltered"}}) == "not_following");
  const Json following = dax.ok({{"op", "social_feed"}, {"tab", "following"}});
  CHECK(following["tab"] == "following");
  CHECK(std::any_of(following["posts"].begin(), following["posts"].end(), [&](const Json& p) { return p["post"] == pid; }));
  CHECK(!dax.ok({{"op", "social_feed"}, {"tab", "town"}})["posts"].empty());
  CHECK(dax.refusal({{"op", "social_feed"}, {"tab", "secret"}}) == "bad_tab");
  CHECK(dax.ok({{"op", "social_profile"}, {"account", "livera.unfiltered"}})["account"]["gossip"] == true);
  CHECK(dax.refusal({{"op", "social_profile"}, {"account", "nobody"}}) == "unknown_account");
  // Dominique heard about the like, the comment and the follow: toasts within the hour's limit.
  dom.pump(0.3);
  int toasts = 0;
  for (const auto& e : dom.events) toasts += e.value("event", "") == "social" ? 1 : 0;
  CHECK(toasts >= 3);
  const Json app = dom.ok({{"op", "phone"}, {"app", "social"}});
  CHECK(app["you"]["handle"] == "dom.ashford");
  CHECK(app["activity"].size() == 3);
  // The map app carries her people; Messages say when something was seen.
  CHECK(dom.ok({{"op", "phone"}, {"app", "map"}})["people"].is_array());
  dax.ok({{"op", "message"}, {"to", "dominique"}, {"text", "Coffee?"}});
  CHECK(dax.ok({{"op", "phone"}, {"app", "messages"}})["threads"]["dominique"][0]["seen"] == false);
  dom.ok({{"op", "phone"}, {"app", "messages"}});
  dax.pump(0.3);
  CHECK(dax.sawEvent("message_seen"));
  CHECK(dax.ok({{"op", "phone"}, {"app", "messages"}})["threads"]["dominique"][0]["seen"] == true);
}
