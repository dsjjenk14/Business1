// End-to-end: real server, real sockets, two players, then a server restart.
// This is the founding vertical slice from docs/ROADMAP.md, driven over the wire.

#include <atomic>
#include <fstream>
#include <chrono>
#include <thread>

#include "TestSupport.h"
#include "net/Socket.h"
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
  explicit RunningServer(const std::string& db, bool dev = true) {
    ServerConfig cfg;
    cfg.port = 0;
    cfg.dbPath = db;
    cfg.content = fastContent();
    cfg.devCommands = dev;
    cfg.passwordIterations = 1000;
    cfg.autosaveSeconds = 3600;
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
  double domTrustInJaxon = 0;
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
    CHECK(dom.ok({{"op", "characters"}})["characters"].size() == 2);
    CHECK(dom.refusal({{"op", "look"}}) == "not_playing");
    Json start = dom.ok({{"op", "play"}, {"character", "dominique"}});
    CHECK(start["you"]["inside"] == "lexington_1204");
    CHECK(jax.refusal({{"op", "play"}, {"character", "dominique"}}) == "character_taken");
    jax.ok({{"op", "play"}, {"character", "jaxon"}});

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
    CHECK(seen["people"][0]["id"] == "jaxon");
    Json talk = dom.ok({{"op", "interact"}, {"interaction", "deep_talk"}, {"target", "jaxon"}});
    domTrustInJaxon = talk["your_feelings"]["trust"].get<double>();
    CHECK(domTrustInJaxon > 18);
    jax.pump(0.3);
    CHECK(jax.sawEvent("interaction"));
    dom.ok({{"op", "message"}, {"to", "jaxon"}, {"text", "Lunch next week?"}});
    jax.pump(0.3);
    CHECK(jax.sawEvent("message"));

    // Spend money.
    Json latte = dom.ok({{"op", "buy"}, {"offer", "latte"}, {"method", "card"}});
    CHECK(latte["balance_cents"] == 1450000 - 575);

    // Go to work and earn money.
    jax.ok({{"op", "exit"}});
    jax.walkTo("forge_site_office");
    jax.ok({{"op", "enter"}, {"location", "forge_site_office"}});
    jax.ok({{"op", "work"}, {"action", "start"}});
    jax.ok({{"op", "dev_advance"}, {"minutes", 8 * 60}});
    Json pay = jax.ok({{"op", "work"}, {"action", "end"}});
    CHECK(pay["pay_cents"] == 8 * 4100);
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
    REQUIRE(contacts.size() == 1);
    CHECK(contacts[0]["your_feelings"]["trust"].get<double>() == std::round(domTrustInJaxon));
    Json inbox = dom.ok({{"op", "phone"}, {"app", "messages"}});
    CHECK(inbox["threads"]["jaxon"].size() == 1);

    // Logging in again elsewhere replaces the old connection.
    TestClient again(server.port());
    again.ok({{"op", "login"}, {"username", "dom"}, {"password", "livera-pass-1"}});
    dom.pump(0.3);
    CHECK(dom.sawEvent("kicked"));
  }
}

TEST_CASE("server: rate limiting and dev-command authorization") {
  RunningServer server(tempPath("limits.db").string(), /*dev=*/false);
  TestClient c(server.port());
  c.ok({{"op", "register"}, {"username", "pat"}, {"password", "password123"}});
  c.ok({{"op", "login"}, {"username", "pat"}, {"password", "password123"}});
  c.ok({{"op", "play"}, {"character", "jaxon"}});
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
    TestClient sol(server.port());
    TestClient dom(server.port());
    sol.ok({{"op", "register"}, {"username", "sol"}, {"password", "sol-pass-123"}});
    sol.ok({{"op", "login"}, {"username", "sol"}, {"password", "sol-pass-123"}});
    CHECK(sol.ok({{"op", "characters"}})["can_create"] == true);
    CHECK(sol.ok({{"op", "creator_options"}})["origins"].size() == 10);

    std::ifstream in(std::string(LIVERA_DATA_DIR) + "/../scripts/demo/sol_rivera.json");
    Json sheet = Json::parse(in);
    Json bad = sheet;
    bad["age"] = 12;
    CHECK(sol.refusal({{"op", "create_character"}, {"character", bad}}) == "invalid_character");
    Json made = sol.ok({{"op", "create_character"}, {"character", sheet}});
    CHECK(made["id"] == "sol-rivera");
    CHECK(sol.refusal({{"op", "create_character"}, {"character", sheet}}) == "already_has_character");
    Json mine = sol.ok({{"op", "characters"}});
    CHECK(mine["can_create"] == false);
    CHECK(mine["characters"].back()["id"] == "sol-rivera");
    sol.ok({{"op", "play"}});  // no id needed: plays your own character

    dom.ok({{"op", "register"}, {"username", "dom"}, {"password", "dom-pass-123"}});
    dom.ok({{"op", "login"}, {"username", "dom"}, {"password", "dom-pass-123"}});
    CHECK(dom.refusal({{"op", "play"}, {"character", "sol-rivera"}}) == "character_taken");
    dom.ok({{"op", "play"}, {"character", "dominique"}});

    for (TestClient* c : {&sol, &dom}) {
      c->ok({{"op", "exit"}});
      c->walkTo("heritage_coffee");
      c->ok({{"op", "enter"}, {"location", "heritage_coffee"}});
    }
    // Talk.
    CHECK(dom.ok({{"op", "say"}, {"text", "Is that a keytar?"}})["heard_by"] == 1);
    sol.pump(0.3);
    CHECK(sol.sawEvent("speech"));
    // Make a song, play it for the room, get tipped.
    Json song = Json::parse(R"({"title": "Founders Groove", "bpm": 96, "tracks": [
        {"instrument": "drums", "notes": [[0,36,1],[4,38,1],[8,36,1],[12,38,1]]},
        {"instrument": "electric_piano", "notes": [[0,60,8],[0,64,8],[8,62,8]]}]})");
    songId = sol.ok({{"op", "song_save"}, {"song", song}})["id"];
    Json perf = sol.ok({{"op", "perform"}, {"song", songId}});
    CHECK(perf["audience"] == 1);
    dom.pump(0.3);
    CHECK(dom.sawEvent("performance"));
    dom.ok({{"op", "tip"}, {"to", "sol-rivera"}, {"cents", 500}});
    sol.ok({{"op", "song_release"}, {"song", songId}});
    // Chat has its own flood limit.
    int limited = 0;
    for (int i = 0; i < 12; ++i) limited += dom.refusal({{"op", "say"}, {"text", "la"}}) == "chat_rate_limited" ? 1 : 0;
    CHECK(limited > 0);
  }
  {
    RunningServer server(db);
    TestClient sol(server.port());
    Json login = sol.ok({{"op", "login"}, {"username", "sol"}, {"password", "sol-pass-123"}});
    CHECK(login["character"] == "sol-rivera");
    Json back = sol.ok({{"op", "play"}});
    CHECK(back["you"]["name"] == "Sol Rivera");
    Json studio = sol.ok({{"op", "phone"}, {"app", "studio"}});
    REQUIRE(studio["yours"].size() == 1);
    CHECK(studio["yours"][0]["released"] == true);
    CHECK(studio["music_skill"].get<double>() > 0);
    CHECK(sol.ok({{"op", "phone"}, {"app", "bank"}})["bank_cents"] == 800000 + 500);
  }
}
