// LocalTown (src/protocol/LocalTown): a whole town in one process for several people at once, the core of the
// single-player build and of "Play together" in the browser. Everything is checked through what each person
// would get: replies, `look`, and the events tick() hands each of them.

#include <algorithm>
#include <fstream>

#include "TestSupport.h"
#include "core/Clock.h"
#include "core/Serialization.h"
#include "protocol/LocalTown.h"

using namespace livera;
using namespace livera::protocol;
using namespace livera::test;

namespace {

Json ask(LocalTown& town, const CharacterId& who, Json req) { return town.request(who, std::move(req)); }
std::string code(const Json& reply) { return reply.value("ok", false) ? "(accepted)" : reply["error"]["code"].get<std::string>(); }
std::string code(const Result<Json>& r) { return r ? "(accepted)" : r.error().code; }

// Ticks at 10 Hz (as the pages do) and collects everyone's events, until `done` or `seconds` of real time.
struct Heard {
  std::map<CharacterId, std::vector<Json>> events;
  bool got(const CharacterId& who, const std::string& type, const std::function<bool(const Json&)>& match = {}) const {
    auto it = events.find(who);
    if (it == events.end()) return false;
    return std::any_of(it->second.begin(), it->second.end(), [&](const Json& e) {
      return e["event"] == type && (!match || match(e["data"]));
    });
  }
};
Heard run(LocalTown& town, double seconds, const std::function<bool(const Heard&)>& done = {}) {
  Heard h;
  for (double t = 0; t < seconds; t += 0.1) {
    for (auto& [who, list] : town.tick(0.1)) {
      for (const auto& e : list) h.events[who].push_back(e);
    }
    if (done && done(h)) break;
  }
  return h;
}

// Walks a person to a place's door through requests and ticks, as a client would; true once they arrived.
bool walk(LocalTown& town, const CharacterId& who, const LocationId& place) {
  const Json moved = ask(town, who, {{"op", "move"}, {"location", place}});
  if (!moved.value("ok", false)) return false;
  run(town, 600, [&](const Heard& h) { return h.got(who, "arrived"); });
  return !town.world().character(who)->moveTarget.has_value();
}

std::set<std::string> peopleSeenBy(LocalTown& town, const CharacterId& who) {
  std::set<std::string> ids;
  const Json look = ask(town, who, {{"op", "look"}});
  if (!look.value("ok", false)) return ids;
  for (const auto& p : look["data"]["people"]) ids.insert(p["id"].get<std::string>());
  return ids;
}

Cents bank(LocalTown& town, const CharacterId& who) {
  const Json r = ask(town, who, {{"op", "phone"}, {"app", "bank"}});
  return r.value("ok", false) ? r["data"]["bank_cents"].get<Cents>() : -1;
}

}  // namespace

TEST_CASE("localtown: nothing works before a town exists, and the rules still do") {
  LocalTown town(realContent());
  CHECK(!town.hasWorld());
  CHECK(code(town.join("dominique")) == "no_world");
  CHECK(code(town.characters()) == "no_world");
  CHECK(code(town.save()) == "no_world");
  CHECK(town.tick(0.1).empty());
  CHECK(code(ask(town, "dominique", {{"op", "look"}})) == "no_world");
  CHECK(town.rules().contains("say_range_m"));
  const auto hello = town.found();
  REQUIRE(hello);
  CHECK(hello.value()["protocol"] == "livera/1");
  CHECK(hello.value()["rules"] == town.rules());
}

TEST_CASE("localtown: two people in one town see each other, and a say reaches the hearer") {
  LocalTown town(realContent());
  REQUIRE(town.found());
  const auto domLook = town.join("dominique");
  REQUIRE(domLook);
  CHECK(domLook.value()["you"]["id"] == "dominique");
  REQUIRE(town.join("naomi"));
  CHECK(town.playing("dominique"));
  CHECK(town.humans() == std::vector<CharacterId>({"dominique", "naomi"}));

  // Both live in the Lexington: out on the street they stand at the same door.
  REQUIRE(ask(town, "dominique", {{"op", "exit"}})["ok"] == true);
  REQUIRE(ask(town, "naomi", {{"op", "exit"}})["ok"] == true);
  Heard first = run(town, 0.5);
  const auto sawHere = [](const CharacterId& id) {
    return [id](const Json& d) {
      for (const auto& c : d["changes"]) {
        if (c["character"] == id && c["state"] == "here") return true;
      }
      return false;
    };
  };
  CHECK(first.got("dominique", "people", sawHere("naomi")));
  CHECK(first.got("naomi", "people", sawHere("dominique")));
  CHECK(peopleSeenBy(town, "dominique").count("naomi"));
  CHECK(peopleSeenBy(town, "naomi").count("dominique"));

  // Speech: the hearer gets a `speech` event with the words; the speaker hears it counted in the reply.
  const Json said = ask(town, "dominique", {{"op", "say"}, {"text", "Morning, Naomi"}, {"id", 41}});
  REQUIRE(said["ok"] == true);
  CHECK(said["re"] == 41);
  Heard after = run(town, 0.3);
  CHECK(after.got("naomi", "speech", [](const Json& d) { return d["from"] == "dominique" && d["text"] == "Morning, Naomi"; }));
  CHECK(!after.got("dominique", "speech"));

  // Someone nobody plays here can't act through the town.
  CHECK(code(ask(town, "graham", {{"op", "look"}})) == "not_playing");
  CHECK(code(town.worldOp("graham", "look", Json::object())) == "not_playing");
}

TEST_CASE("localtown: a character someone plays can't be joined again; unplayable ids are refused") {
  LocalTown town(realContent());
  REQUIRE(town.found());
  REQUIRE(town.join("dax"));
  const auto again = town.join("dax");
  CHECK(code(again) == "character_in_use");
  CHECK(code(town.join("nobody")) == "unknown_character");
  CHECK(code(town.leave("maya")) == "not_playing");

  // The pick list: taken for everyone else, free for the one playing them.
  const auto forMaya = town.characters("maya");
  REQUIRE(forMaya);
  for (const auto& c : forMaya.value()["characters"]) {
    if (c["id"] == "dax") CHECK(c["available"] == false);
    if (c["id"] == "maya") CHECK(c["available"] == true);
  }
  const auto forDax = town.characters("dax");
  REQUIRE(forDax);
  for (const auto& c : forDax.value()["characters"]) CHECK(c["available"] == true);

  // Once Dax's person leaves, someone else can take him.
  REQUIRE(town.leave("dax", false));
  CHECK(!town.playing("dax"));
  CHECK(town.join("dax"));
}

TEST_CASE("localtown: joining takes a founder from the autopilot; leaving hands them back") {
  LocalTown town(realContent());
  REQUIRE(town.found());
  REQUIRE(town.join("dominique"));
  const auto started = town.autopilotStart();
  REQUIRE(started);
  const Json running = started.value()["running"];
  CHECK(!running.empty());
  CHECK(std::find(running.begin(), running.end(), "dominique") == running.end());  // people are never handed over
  REQUIRE(town.onAutopilot("dax"));

  // People always win: the autopilot lets go before the person connects, and the label clears.
  const auto took = town.join("dax");
  REQUIRE(took);
  CHECK(!town.onAutopilot("dax"));
  CHECK(!town.world().isScripted("dax"));
  CHECK(took.value()["you"]["id"] == "dax");

  // A founder nobody keeps goes back on autopilot when their person leaves...
  REQUIRE(town.leave("dax"));
  CHECK(town.onAutopilot("dax"));
  // ...and one somebody keeps (a claim) stays with nobody, dormant.
  REQUIRE(town.join("dax"));
  REQUIRE(town.leave("dax", false));
  CHECK(!town.onAutopilot("dax"));
  CHECK(!town.world().character("dax")->online);
  // Starting the autopilot again for everyone still skips the people playing.
  REQUIRE(town.autopilotStart(std::vector<CharacterId>{"dominique", "dax"}));
  CHECK(!town.onAutopilot("dominique"));
  CHECK(town.onAutopilot("dax"));
  REQUIRE(town.autopilotStop());
  CHECK(!town.onAutopilot("dax"));
  CHECK(town.playing("dominique"));
}

TEST_CASE("localtown: five people: everyone sees the other four, a say reaches only those in range, money is each one's own") {
  LocalTown town(realContent());
  REQUIRE(town.found());
  REQUIRE(town.autopilotStart());
  const std::vector<CharacterId> five = {"aaliyah", "dominique", "graham", "naomi", "maya"};
  for (const auto& id : five) REQUIRE(town.join(id));
  CHECK(town.humans().size() == 5);
  for (const auto& id : five) CHECK(!town.onAutopilot(id));

  // Four live in the Lexington; Maya walks over from Maple Court.
  for (const auto& id : five) REQUIRE(ask(town, id, {{"op", "exit"}})["ok"] == true);
  REQUIRE(walk(town, "maya", "lexington_1204"));
  run(town, 0.5);
  for (const auto& id : five) {
    const auto seen = peopleSeenBy(town, id);
    for (const auto& other : five) {
      if (other != id) CHECK(seen.count(other));
    }
  }
  // Each one's pick list: the other four are taken, their own is free.
  const auto list = town.characters("graham");
  REQUIRE(list);
  for (const auto& c : list.value()["characters"]) {
    const std::string id = c["id"];
    const bool human = std::find(five.begin(), five.end(), id) != five.end();
    CHECK(c["available"] == (!human || id == "graham"));
  }

  // Naomi goes to Heritage Coffee's door, about 57 m away: past say range, still in sight.
  REQUIRE(walk(town, "naomi", "heritage_coffee"));
  const double away = distance(town.world().character("naomi")->position, town.world().character("aaliyah")->position);
  CHECK(away > town.world().content().sim().hearingRangeMeters);
  REQUIRE(ask(town, "aaliyah", {{"op", "say"}, {"text", "Who's up for lunch?"}})["ok"] == true);
  Heard h = run(town, 0.3);
  const auto lunch = [](const Json& d) { return d["text"] == "Who's up for lunch?"; };
  CHECK(h.got("dominique", "speech", lunch));
  CHECK(h.got("graham", "speech", lunch));
  CHECK(h.got("maya", "speech", lunch));
  CHECK(!h.got("naomi", "speech", lunch));
  // A shout reaches her.
  REQUIRE(ask(town, "aaliyah", {{"op", "say"}, {"text", "NAOMI!"}, {"volume", "shout"}})["ok"] == true);
  h = run(town, 0.3);
  CHECK(h.got("naomi", "speech", [](const Json& d) { return d["text"] == "NAOMI!" && d["volume"] == "shout"; }));
  // Events are grouped by person, and only people get any.
  for (const auto& [who, list2] : h.events) CHECK(town.playing(who));

  // Naomi buys a latte: her bank balance drops, nobody else's moves.
  std::map<CharacterId, Cents> before;
  for (const auto& id : five) before[id] = bank(town, id);
  REQUIRE(ask(town, "naomi", {{"op", "enter"}, {"location", "heritage_coffee"}})["ok"] == true);
  REQUIRE(ask(town, "naomi", {{"op", "buy"}, {"offer", "latte"}, {"method", "card"}})["ok"] == true);
  CHECK(bank(town, "naomi") < before["naomi"]);
  for (const auto& id : five) {
    if (id != "naomi") CHECK(bank(town, id) == before[id]);
  }
  CHECK(town.world().state().ledger.sumOfBalances() == 0);
}

TEST_CASE("localtown: the save round-trips; a loaded town starts with nobody in it") {
  LocalTown town(realContent());
  REQUIRE(town.found());
  REQUIRE(town.autopilotStart());
  REQUIRE(town.join("dominique"));
  REQUIRE(town.join("dax"));
  REQUIRE(ask(town, "dominique", {{"op", "exit"}})["ok"] == true);
  REQUIRE(ask(town, "dominique", {{"op", "move"}, {"location", "heritage_coffee"}})["ok"] == true);
  run(town, 5);
  const auto saved = town.save();
  REQUIRE(saved);
  CHECK(saved.value()["format"] == kWorldJsonFormat);

  LocalTown other(realContent());
  const auto loaded = other.load(Json::parse(saved.value().dump()));
  REQUIRE(loaded);
  CHECK(loaded.value()["protocol"] == "livera/1");
  CHECK(other.humans().empty());
  CHECK(!other.onAutopilot("maya"));
  const auto resaved = other.save();
  REQUIRE(resaved);
  CHECK(resaved.value() == saved.value());
  // Everyone is where they were, and their money is theirs.
  const Vec2 where = town.world().character("dominique")->position;
  const auto look = other.join("dominique");
  REQUIRE(look);
  CHECK(distance(other.world().character("dominique")->position, where) < 0.01);
  CHECK(bank(other, "dominique") == bank(town, "dominique"));

  // A save from another format, or not a world at all, is refused and the town stays.
  CHECK(code(other.load(Json{{"format", 99}})) == "save_version");
  CHECK(code(other.load(Json::parse("nope", nullptr, false))) == "bad_request");
  CHECK(other.playing("dominique"));
  CHECK(ask(other, "dominique", {{"op", "look"}})["ok"] == true);
  // Founding again replaces the town: nobody is playing.
  REQUIRE(other.found());
  CHECK(other.humans().empty());
}

TEST_CASE("localtown: requests are answered like the server's lines") {
  LocalTown town(realContent());
  REQUIRE(town.found());
  REQUIRE(town.join("dominique"));
  CHECK(ask(town, "dominique", {{"op", "look"}, {"id", "abc"}})["re"] == "abc");
  const Json noOp = town.request("dominique", Json{{"id", 3}});
  CHECK(code(noOp) == "bad_request");
  CHECK(noOp["re"] == 3);
  CHECK(town.request("dominique", Json::parse("not json", nullptr, false))["re"].is_null());
  CHECK(code(ask(town, "dominique", {{"op", "fly"}})) == "unknown_op");
  CHECK(code(ask(town, "dominique", {{"op", "tip"}, {"to", "dax"}, {"cents", "lots"}})) == "bad_request");
  CHECK(code(ask(town, "dominique", {{"op", "buy_coins"}, {"product", "coins_100"}})) == "payments_unavailable");
  CHECK(code(ask(town, "dominique", {{"op", "move"}, {"location", "heritage_coffee"}})) == "inside_building");
  CHECK(code(town.advanceMinutes(0)) == "bad_request");
  const GameMinutes before = town.world().now();
  REQUIRE(town.advanceMinutes(30));
  CHECK(town.world().now() == before + 30);
}

TEST_CASE("localtown: made characters: one per town when asked, listed with created, playable") {
  LocalTown solo(realContent(), LocalTown::Options{.oneCreatedCharacter = true});
  REQUIRE(solo.found());
  const auto opts = solo.creatorOptions();
  REQUIRE(opts);
  CHECK(code(solo.createCharacter(Json::array())) == "bad_request");
  CHECK(code(solo.createCharacter(Json{{"first_name", ""}})) != "(accepted)");
  CHECK(opts.value().is_object());

  // The demo sheet the creator tests use (scripts/demo/sol_rivera.json).
  std::ifstream in(std::string(LIVERA_DATA_DIR) + "/../scripts/demo/sol_rivera.json");
  const Json sheet = Json::parse(in);
  auto made = solo.createCharacter(sheet);
  if (!made) std::fprintf(stderr, "    create_character: %s %s\n", made.error().code.c_str(), made.error().message.c_str());
  REQUIRE(made);
  const std::string id = made.value()["id"];
  CHECK(code(solo.createCharacter(sheet)) == "already_has_character");
  const auto list = solo.characters();
  REQUIRE(list);
  CHECK(list.value()["can_create"] == false);
  bool listed = false;
  for (const auto& c : list.value()["characters"]) listed = listed || (c["id"] == id && c["created"] == true);
  CHECK(listed);
  CHECK(solo.join(id));

  // Without the option the caller keeps its own rule (the host page: one per account).
  LocalTown shared(realContent());
  REQUIRE(shared.found());
  CHECK(shared.characters().value()["can_create"] == true);
}
