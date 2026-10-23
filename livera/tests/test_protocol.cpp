// The op routing shared by the server and the single-player build (src/protocol/WorldOps.cpp), and the
// whole-world JSON document the single-player build saves (core/Serialization.cpp).

#include <atomic>
#include <chrono>
#include <thread>

#include "TestSupport.h"
#include "core/Clock.h"
#include "core/Serialization.h"
#include "net/Socket.h"
#include "protocol/WorldOps.h"
#include "server/Server.h"

using namespace livera;
using namespace livera::test;

namespace {

// The server catches argument-type exceptions in handleLine; the harness and this test do the same.
Json reply(World& w, const CharacterId& me, Json req) {
  Result<Json> r = fail("internal", "unhandled");
  try {
    r = protocol::dispatchWorldOp(w, me, req.at("op").get<std::string>(), req);
  } catch (const std::exception& e) {
    r = fail("bad_request", e.what());
  }
  if (r) return Json{{"ok", true}, {"data", r.value()}};
  return Json{{"ok", false}, {"error", {{"code", r.error().code}, {"message", r.error().message}}}};
}

std::string code(const Json& reply) { return reply.value("ok", false) ? "(accepted)" : reply["error"]["code"]; }

void advanceTo(World& w, int hour) {
  const GameMinutes target = static_cast<GameMinutes>(hour) * 60;
  const GameMinutes today = w.now() % kMinutesPerDay;
  w.advanceMinutes(today < target ? target - today : kMinutesPerDay - today + target);
}

std::string shelterDog(const World& w) {
  for (const auto& a : w.shelterListings()) {
    if (a.at("species") == "dog" && !a.at("brought_back").get<bool>()) return a.at("id").get<std::string>();
  }
  throw std::runtime_error("no dog at the shelter");
}

// A real server on a free port, for comparing its replies with the shared dispatch (compact copy of
// the harness in test_server.cpp).
class MiniServer {
 public:
  explicit MiniServer(const std::string& db) {
    ServerConfig cfg;
    cfg.port = 0;
    cfg.dbPath = db;
    cfg.content = realContent();
    cfg.devCommands = true;
    cfg.passwordIterations = 1000;
    cfg.autosaveSeconds = 3600;
    auto s = Server::create(cfg);
    if (!s) throw std::runtime_error("server failed: " + s.error().message);
    server_ = std::move(s).value();
    thread_ = std::thread([this] { server_->run(stop_); });
  }
  ~MiniServer() {
    stop_ = true;
    thread_.join();
  }
  std::uint16_t port() const { return server_->port(); }

 private:
  std::unique_ptr<Server> server_;
  std::atomic<bool> stop_{false};
  std::thread thread_;
};

class MiniClient {
 public:
  explicit MiniClient(std::uint16_t port) {
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
      if (!line) throw std::runtime_error("connection lost");
      if (!line.value()) continue;
      Json msg = Json::parse(*line.value());
      if (msg.contains("event")) continue;
      if (msg.value("re", Json()) == Json(id_)) {
        msg.erase("re");
        return msg;
      }
    }
    throw std::runtime_error("timed out");
  }

 private:
  net::Fd fd_;
  net::LineBuffer buffer_;
  int id_ = 0;
};

}  // namespace

TEST_CASE("protocol: dispatchWorldOp routes in-world ops and refusals like the server") {
  World w = World::createNew(realContent());
  REQUIRE(w.connect("dominique"));
  REQUIRE(w.connect("dax"));
  const CharacterId me = "dominique";

  Json look = reply(w, me, {{"op", "look"}});
  REQUIRE(look["ok"] == true);
  CHECK(look["data"].contains("you"));
  CHECK(look["data"]["you"]["id"] == "dominique");
  Json map = reply(w, me, {{"op", "map"}});
  REQUIRE(map["ok"] == true);
  CHECK(map["data"]["rules"] == w.publicRules());

  // A walk: the reply names the target and an ETA, and the world moves her there in real time.
  CHECK(code(reply(w, me, {{"op", "move"}, {"location", "heritage_coffee"}})) == "inside_building");  // still at home
  REQUIRE(reply(w, me, {{"op", "exit"}})["ok"] == true);
  Json move = reply(w, me, {{"op", "move"}, {"location", "heritage_coffee"}});
  REQUIRE(move["ok"] == true);
  CHECK(move["data"]["eta_seconds"].get<double>() > 0);
  const LocationDef* cafe = w.content().location("heritage_coffee");
  CHECK(move["data"]["target"] == Json({cafe->door.x, cafe->door.y}));
  CHECK(code(reply(w, me, {{"op", "move"}, {"location", "nowhere"}})) == "unknown_location");
  CHECK(code(reply(w, me, {{"op", "move"}, {"x", "ten"}, {"y", 10}})) == "bad_request");
  CHECK(code(reply(w, me, {{"op", "enter"}, {"location", "heritage_coffee"}})) == "too_far");
  for (int i = 0; i < 5000 && w.character(me)->moveTarget; ++i) w.advanceRealTime(0.1);
  Json entered = reply(w, me, {{"op", "enter"}, {"location", "heritage_coffee"}});
  REQUIRE(entered["ok"] == true);
  CHECK(entered["data"]["you"]["inside"] == "heritage_coffee");  // `enter` answers with `look`
  CHECK(code(reply(w, me, {{"op", "move"}, {"x", 10}, {"y", 10}})) == "inside_building");

  // Buying moves money through the ledger only.
  const Cents before = w.state().ledger.balance(bankAccountOf(me));
  Json bought = reply(w, me, {{"op", "buy"}, {"offer", "latte"}});
  REQUIRE(bought["ok"] == true);
  CHECK(w.state().ledger.balance(bankAccountOf(me)) < before);
  CHECK(w.state().ledger.sumOfBalances() == 0);
  CHECK(code(reply(w, me, {{"op", "buy"}, {"offer", "lamborghini"}})) == "unknown_offer");

  // Speech, mail, work and the rest reach World with the same argument names the server uses.
  Json said = reply(w, me, {{"op", "say"}, {"text", "hello"}});
  REQUIRE(said["ok"] == true);
  Json mail = reply(w, me, {{"op", "message"}, {"to", "dax"}, {"text", "coffee?"}});
  REQUIRE(mail["ok"] == true);
  CHECK(mail["data"]["id"].is_string());
  CHECK(code(reply(w, me, {{"op", "message"}, {"to", "nobody"}, {"text", "?"}})) == "unknown_character");
  CHECK(code(reply(w, me, {{"op", "work"}, {"action", "dance"}})) == "bad_request");
  CHECK(code(reply(w, me, {{"op", "study"}, {"action", "dance"}})) == "bad_request");
  CHECK(code(reply(w, me, {{"op", "work_answer"}, {"task", "t"}})) == "bad_request");
  CHECK(code(reply(w, me, {{"op", "song_save"}})) == "bad_request");
  CHECK(code(reply(w, me, {{"op", "tip"}, {"to", "dax"}, {"cents", "lots"}})) == "bad_request");
  CHECK(code(reply(w, me, {{"op", "arrest"}, {"target", "dax"}})) == "not_police");
  CHECK(code(reply(w, me, {{"op", "ride"}, {"to", "stop_riverside"}})) == "inside_building");
  CHECK(code(reply(w, me, {{"op", "phone"}, {"app", "bank"}})) == "(accepted)");
  CHECK(code(reply(w, me, {{"op", "exit"}})) == "(accepted)");
  // Pre-play and account ops are not in-world ops: the caller answers them, so here they are unknown.
  CHECK(code(reply(w, me, {{"op", "transfer_money"}, {"to", "dax"}})) == "unknown_op");
  CHECK(code(reply(w, me, {{"op", "buy_coins"}, {"product", "coins_100"}})) == "unknown_op");
  CHECK(code(reply(w, me, {{"op", "play"}, {"character", "dax"}})) == "unknown_op");
  CHECK(code(reply(w, me, {{"op", "characters"}})) == "unknown_op");
  CHECK(reply(w, me, {{"op", "transfer_money"}})["error"]["message"] == "unknown op 'transfer_money'");
}

TEST_CASE("protocol: the server answers the shared dispatch's refusals word for word") {
  // Same fresh world on both sides, same requests: the codes and messages must match.
  const std::vector<Json> requests = {
      {{"op", "move"}, {"location", "nowhere"}},
      {{"op", "move"}, {"x", "ten"}, {"y", 10}},
      {{"op", "enter"}, {"location", "heritage_coffee"}},
      {{"op", "buy"}, {"offer", "latte"}},
      {{"op", "work"}, {"action", "dance"}},
      {{"op", "work_answer"}, {"task", "t"}},
      {{"op", "arrest"}, {"target", "dax"}},
      {{"op", "name_baby"}, {"child", "dax"}, {"name", "X"}},
      {{"op", "transfer_money"}, {"to", "dax"}},
  };
  World w = World::createNew(realContent());
  REQUIRE(w.connect("dominique"));
  std::vector<Json> local;
  for (const auto& r : requests) local.push_back(reply(w, "dominique", r));

  MiniServer server(tempPath("protocol.db").string());
  MiniClient c(server.port());
  REQUIRE(c.call({{"op", "register"}, {"username", "dom"}, {"password", "password123"}}).value("ok", false));
  REQUIRE(c.call({{"op", "login"}, {"username", "dom"}, {"password", "password123"}}).value("ok", false));
  REQUIRE(c.call({{"op", "play"}, {"character", "dominique"}}).value("ok", false));
  for (std::size_t i = 0; i < requests.size(); ++i) {
    const Json remote = c.call(requests[i]);
    CHECK(remote == local[i]);
    if (remote != local[i]) std::fprintf(stderr, "    %s\n    %s\n", remote.dump().c_str(), local[i].dump().c_str());
  }
  // The one wallet op the shared dispatch leaves to the server is still answered by the server.
  const Json coins = c.call({{"op", "buy_coins"}, {"product", "coins_100"}, {"receipt", "nope"}});
  CHECK(coins["error"]["code"] != "unknown_op");
}

TEST_CASE("protocol: the whole world round-trips through one JSON document") {
  World w = World::createNew(realContent());
  REQUIRE(w.connect("dominique"));
  REQUIRE(w.connect("dax"));
  advanceTo(w, 10);
  walkInto(w, "dominique", "heritage_coffee");
  REQUIRE(w.buy("dominique", "latte", "card"));
  REQUIRE(w.sendMessage("dominique", "dax", "Shelter later?"));
  walkInto(w, "dominique", "paws_whiskers");
  REQUIRE(w.adoptPet("dominique", shelterDog(w), "Biscuit", "card"));
  REQUIRE(w.exitBuilding("dominique"));
  REQUIRE(w.moveTo("dominique", w.content().location("greenleaf_market")->door));
  w.advanceRealTime(2.0);  // mid-walk: the save drops the move target, like a server save
  w.advanceMinutes(kMinutesPerDay);
  w.disconnect("dominique");
  w.disconnect("dax");
  CHECK(w.state().ledger.sumOfBalances() == 0);

  const Json once = worldStateToJson(w.state());
  CHECK(once["format"] == 1);
  CHECK(once["characters"].size() == w.state().characters.size());
  CHECK(once["messages"].size() == 1);
  CHECK(once["world_parts"].contains("pets"));
  CHECK(once["rng"].is_string());  // 64 bits don't survive a JavaScript number; the browser keeps it as text
  auto loaded = worldStateFromJson(once);
  REQUIRE(loaded);
  const Json twice = worldStateToJson(loaded.value());
  CHECK(twice.dump() == once.dump());
  CHECK(loaded.value().ledger.sumOfBalances() == 0);
  CHECK(loaded.value().ledger.balance(bankAccountOf("dominique")) == w.state().ledger.balance(bankAccountOf("dominique")));
  CHECK(loaded.value().pets.size() == 1);
  CHECK(loaded.value().characters.at("dominique").position == w.state().characters.at("dominique").position);
  CHECK(loaded.value().rng == w.state().rng);

  // The loaded world keeps playing.
  World again(realContent(), std::move(loaded).value());
  REQUIRE(again.connect("dominique"));
  walkInto(again, "dominique", "greenleaf_market");
  REQUIRE(again.buy("dominique", "ready_meal", "card"));
  CHECK(again.state().ledger.sumOfBalances() == 0);
  CHECK(again.state().ledger.transactions().size() == w.state().ledger.transactions().size() + 1);
}

TEST_CASE("protocol: a save that isn't a world, is from another format or doesn't balance is refused") {
  CHECK(worldStateFromJson(Json::parse("[1,2]")).error().code == "save_corrupt");
  CHECK(worldStateFromJson(Json{{"hello", "world"}}).error().code == "save_corrupt");
  CHECK(worldStateFromJson(Json{{"format", 2}}).error().code == "save_version");
  CHECK(worldStateFromJson(Json{{"format", 1}}).error().code == "save_corrupt");
  World w = World::createNew(realContent());
  Json doc = worldStateToJson(w.state());
  for (auto& a : doc["ledger"]["accounts"]) {
    if (a["id"] == bankAccountOf("dominique")) a["balance_cents"] = a["balance_cents"].get<Cents>() + 100;
  }
  CHECK(worldStateFromJson(doc).error().code == "ledger_unbalanced");
}
