// The browser harness: the core, the shared op dispatch and the autopilot compiled to WebAssembly (CMake
// option LIVERA_WASM, scripts/build_wasm.sh), around one protocol::LocalTown. Two pages use it:
//   - single-player (web/client/solo/): the solo_* functions, one person;
//   - "Play together" (web/client/together/): the host's tab calls the town_* functions for everyone it
//     serves, several people at once, each named by the character they play.
// Pages call these C functions with UTF-8 JSON strings and get JSON strings back, shaped like the server's
// replies and events (docs/MULTIPLAYER.md), so the same client code draws a solo town, a shared one and a
// live one. Content is read from /data, where the build embeds data/ (MEMFS). The save is the whole world as
// one JSON document (core/Serialization.h); the autopilot's plans are not in it (it re-plans on load).
//
// Every reply string points at one buffer that the next call overwrites: the caller copies it first
// (ccall with a "string" return does, and so do the wrappers in solo_post.js).

#include <emscripten/emscripten.h>

#include <exception>
#include <memory>
#include <optional>
#include <string>
#include <vector>

#include "core/Clock.h"
#include "core/Serialization.h"
#include "protocol/LocalTown.h"
#include "protocol/WorldOps.h"

using namespace livera;
using protocol::LocalTown;
using protocol::replyLine;

namespace {

constexpr const char* kDataDir = "/data";

struct Harness {
  std::optional<LocalTown> town;  // built once content has loaded
  CharacterId human;              // the single-player page's character, "" until solo_play
  std::string out;                // the buffer every call answers from
};

Harness& harness() {
  static Harness h;
  return h;
}

Json okReply(Json data) { return Json{{"ok", true}, {"data", std::move(data)}}; }
Json failReply(const Error& e) { return Json{{"ok", false}, {"error", {{"code", e.code}, {"message", e.message}}}}; }
Json failReply(const std::string& code, const std::string& message) { return failReply(fail(code, message)); }

const char* answer(const Json& j) {
  Harness& h = harness();
  h.out = j.dump();
  return h.out.c_str();
}

// A Result<Json> as {"ok": true, "data"} or {"ok": false, "error"}.
const char* answerResult(const Result<Json>& r) { return answer(r ? okReply(r.value()) : failReply(r.error())); }

// Parses an argument without throwing; a null pointer or non-JSON text becomes `discarded`.
Json parseArg(const char* text) {
  if (!text) return Json();
  return Json::parse(text, nullptr, /*allow_exceptions=*/false);
}

// The town, with content loaded from /data on first use (one made character per town: the solo rule; the
// together host keeps its own per-account rule on top, as the server does).
Result<LocalTown*> town() {
  Harness& h = harness();
  if (!h.town) {
    auto loaded = ContentDatabase::loadFromDirectory(kDataDir);
    if (!loaded) return loaded.error();
    h.town.emplace(loaded.value(), LocalTown::Options{.oneCreatedCharacter = false});
  }
  return &*h.town;
}

// A town that has a world in it, or `no_world`.
Result<LocalTown*> liveTown() {
  auto t = town();
  if (!t) return t.error();
  if (!t.value()->hasWorld()) return fail("no_world", "found a town first (solo_new) or load a save (solo_load)");
  return t;
}

// A character argument: a bare id, a JSON string, or {"character": id}.
CharacterId characterArg(const char* text) {
  const Json parsed = parseArg(text);
  if (parsed.is_string()) return parsed.get<std::string>();
  if (parsed.is_object()) return protocol::str(parsed, "character");
  return text ? std::string(text) : std::string();
}

// A character sheet argument: the sheet itself, or {"character": sheet} as the `create_character` op takes it.
Json sheetArg(const char* text) {
  Json sheet = parseArg(text);
  if (sheet.is_object() && sheet.contains("character") && sheet["character"].is_object()) sheet = sheet["character"];
  return sheet;
}

template <class F>
const char* guarded(F&& f) {
  try {
    return f();
  } catch (const std::exception& e) {
    return answer(failReply("internal", e.what()));
  }
}

// ---------------------------------------------------------------------------- single-player (solo_*)

// One person, so nobody else can hold a character: every founder is free (the autopilot's included), and one
// character may be made per town.
Result<Json> soloCharacters() {
  auto t = liveTown();
  if (!t) return t.error();
  auto list = t.value()->characters(harness().human);
  if (!list) return list;
  Json data = list.value();
  for (auto& c : data["characters"]) c["available"] = true;
  data["can_create"] = t.value()->world().state().createdCharacters.empty();
  return data;
}

Result<Json> soloCreateCharacter(const Json& sheet) {
  auto t = liveTown();
  if (!t) return t.error();
  if (!sheet.is_object()) return fail("bad_request", "send your character sheet as \"character\"");
  // One made character per town, as one account makes one on a server.
  if (!t.value()->world().state().createdCharacters.empty())
    return fail("already_has_character", "this town already has your character");
  return t.value()->createCharacter(sheet);
}

Result<Json> soloPlay(const CharacterId& id) {
  auto t = liveTown();
  if (!t) return t.error();
  Harness& h = harness();
  if (!h.human.empty()) return fail("already_playing", "already in the world");
  auto look = t.value()->join(id);
  if (look) h.human = id;
  return look;
}

Result<Json> soloLeave() {
  auto t = liveTown();
  if (!t) return t.error();
  Harness& h = harness();
  if (h.human.empty()) return fail("not_playing", "choose a character first");
  // "Change who you play": the one left goes on autopilot when the next one starts it, not before.
  auto r = t.value()->leave(h.human, /*autopilotTakesOver=*/false);
  h.human.clear();
  return r;
}

Result<Json> autopilotStart(const Json& arg) {
  auto t = liveTown();
  if (!t) return t.error();
  if (arg.is_null() || arg.is_discarded()) return t.value()->autopilotStart();  // every playable founder nobody plays
  if (!arg.is_array()) return fail("bad_request", "send a JSON array of character ids, or null for everyone nobody plays");
  std::vector<CharacterId> ids;
  for (const auto& v : arg) {
    if (v.is_string()) ids.push_back(v.get<std::string>());
  }
  return t.value()->autopilotStart(ids);
}

// The pre-play ops a client sends before and around `play` (the server's "ops for logged-in accounts"), so the
// solo transport can route every request here; the dedicated solo_* entry points do the same.
Result<Json> soloDispatch(const std::string& op, const Json& req) {
  if (op == "ping") return Json{{"pong", true}};
  auto t = liveTown();
  if (!t) return t.error();
  LocalTown& lt = *t.value();
  if (op == "hello") return lt.hello();
  if (op == "characters") return soloCharacters();
  if (op == "creator_options") return lt.creatorOptions();
  if (op == "create_character") {
    if (!req.contains("character")) return fail("bad_request", "send your character sheet as \"character\"");
    return soloCreateCharacter(req["character"]);
  }
  if (op == "play") return soloPlay(protocol::str(req, "character"));
  if (op == "logout") return soloLeave();
  // A solo town is the player's own: skipping time is allowed, with the server's bounds.
  if (op == "dev_advance") return lt.advanceMinutes(req.at("minutes").get<GameMinutes>());
  return lt.worldOp(harness().human, op, req);
}

}  // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE const char* solo_new() {
  return guarded([] {
    auto t = town();
    if (!t) return answer(failReply(t.error()));
    harness().human.clear();
    return answerResult(t.value()->found());
  });
}

EMSCRIPTEN_KEEPALIVE const char* solo_load(const char* stateJson) {
  return guarded([&] {
    auto t = town();
    if (!t) return answer(failReply(t.error()));
    const Json doc = parseArg(stateJson);
    auto r = t.value()->load(doc);
    if (r) harness().human.clear();  // a refused load leaves the town (and whoever plays it) as it was
    return answerResult(r);
  });
}

// The whole world as one JSON document ("format": 1), or {"ok": false, "error": {"code": "no_world"}}.
EMSCRIPTEN_KEEPALIVE const char* solo_save() {
  return guarded([] {
    auto t = liveTown();
    if (!t) return answer(failReply(t.error()));
    auto doc = t.value()->save();
    return doc ? answer(doc.value()) : answer(failReply(doc.error()));
  });
}

// The `rules` object clients get in `welcome`, `hello` and `map`; content-only, so it works before a town exists.
EMSCRIPTEN_KEEPALIVE const char* solo_rules() {
  return guarded([] {
    auto t = town();
    if (!t) return answer(Json::object());
    return answer(t.value()->rules());
  });
}

EMSCRIPTEN_KEEPALIVE const char* solo_characters() {
  return guarded([] { return answerResult(soloCharacters()); });
}

EMSCRIPTEN_KEEPALIVE const char* solo_create_character(const char* sheetJson) {
  return guarded([&] {
    const Json sheet = sheetArg(sheetJson);
    if (sheet.is_discarded()) return answer(failReply("bad_request", "the character sheet is not JSON"));
    return answerResult(soloCreateCharacter(sheet));
  });
}

EMSCRIPTEN_KEEPALIVE const char* solo_play(const char* characterId) {
  return guarded([&] { return answerResult(soloPlay(characterArg(characterId))); });
}

EMSCRIPTEN_KEEPALIVE const char* solo_leave() {
  return guarded([] { return answerResult(soloLeave()); });
}

// One request line as the server takes it: {"id": ..., "op": ..., ...} -> {"re", "ok", "data"|"error"}.
EMSCRIPTEN_KEEPALIVE const char* solo_request(const char* reqJson) {
  return guarded([&] {
    const Json req = parseArg(reqJson);
    const Json re = req.is_object() && req.contains("id") ? req["id"] : Json();
    Result<Json> result = fail("internal", "unhandled");
    if (!req.is_object() || !req.contains("op") || !req["op"].is_string()) {
      result = fail("bad_request", "expected {\"op\": ...}");
    } else {
      try {
        result = soloDispatch(req["op"].get<std::string>(), req);
      } catch (const std::exception& e) {
        // Malformed argument types land here (e.g. a string where a number belongs).
        result = fail("bad_request", e.what());
      }
    }
    return answer(replyLine(re, result));
  });
}

// Advances the town by this much real time (capped at 1 s, like the server's tick), lets the autopilot act,
// and returns the events for the person's character: [{"event": ..., "data": ...}, ...]. Events for
// everyone else are dropped; nobody else is listening.
EMSCRIPTEN_KEEPALIVE const char* solo_tick(double realSeconds) {
  return guarded([&] {
    Json events = Json::array();
    auto t = liveTown();
    if (!t) return answer(events);
    auto all = t.value()->tick(realSeconds);
    const Harness& h = harness();
    if (!h.human.empty()) {
      auto it = all.find(h.human);
      if (it != all.end()) events = it->second;
    }
    return answer(events);
  });
}

// Puts these characters (a JSON array of ids), or with null every playable founder nobody plays, on autopilot.
// Replies {"running": [ids]}.
EMSCRIPTEN_KEEPALIVE const char* solo_autopilot_start(const char* idsJson) {
  return guarded([&] { return answerResult(autopilotStart(parseArg(idsJson))); });
}

EMSCRIPTEN_KEEPALIVE const char* solo_autopilot_stop() {
  return guarded([] {
    auto t = liveTown();
    return answerResult(t ? t.value()->autopilotStop() : Result<Json>(t.error()));
  });
}

// What each autopilot character is up to (Autopilot::status), for the page's debug hook.
EMSCRIPTEN_KEEPALIVE const char* solo_autopilot_status() {
  return guarded([] {
    auto t = liveTown();
    return answerResult(t ? t.value()->autopilotStatus() : Result<Json>(t.error()));
  });
}

// ---------------------------------------------------------------------------- several people (town_*)
// The host page calls these after it has decided who may play whom (accounts and claims are its business,
// as they are the server's, not the World's). The town is the same one solo_new / solo_load / solo_save
// found, load and save; a page uses either the solo_* people functions or the town_* ones, not both.

// Puts a person in as this character (bare id, JSON string or {"character": id}) -> {"ok", "data": look}.
EMSCRIPTEN_KEEPALIVE const char* town_join(const char* characterId) {
  return guarded([&] {
    auto t = liveTown();
    return answerResult(t ? t.value()->join(characterArg(characterId)) : Result<Json>(t.error()));
  });
}

// Takes a person out. {"character": id, "autopilot": false} keeps the character off the autopilot (someone
// keeps them: a claim); a bare id hands a founder back to it.
EMSCRIPTEN_KEEPALIVE const char* town_leave(const char* arg) {
  return guarded([&] {
    auto t = liveTown();
    if (!t) return answer(failReply(t.error()));
    const Json parsed = parseArg(arg);
    const bool handBack = !(parsed.is_object() && parsed.contains("autopilot") && parsed["autopilot"] == false);
    return answerResult(t.value()->leave(characterArg(arg), handBack));
  });
}

// One request line for one person: (character, {"id", "op", ...}) -> {"re", "ok", "data"|"error"}.
EMSCRIPTEN_KEEPALIVE const char* town_request(const char* characterId, const char* reqJson) {
  return guarded([&] {
    const Json req = parseArg(reqJson);
    auto t = liveTown();
    if (!t) return answer(replyLine(req.is_object() && req.contains("id") ? req["id"] : Json(), t.error()));
    return answer(t.value()->request(characterArg(characterId), req));
  });
}

// Advances the town (capped at 1 s) and returns everyone's events: {"<character>": [{"event", "data"}...]}.
EMSCRIPTEN_KEEPALIVE const char* town_tick(double realSeconds) {
  return guarded([&] {
    Json out = Json::object();
    auto t = liveTown();
    if (!t) return answer(out);
    for (auto& [who, events] : t.value()->tick(realSeconds)) out[who] = std::move(events);
    return answer(out);
  });
}

// The pick list as this character (or, with null or "", nobody) sees it -> {"ok", "data": {characters, can_create}}.
EMSCRIPTEN_KEEPALIVE const char* town_characters(const char* characterId) {
  return guarded([&] {
    auto t = liveTown();
    if (!t) return answer(failReply(t.error()));
    return answerResult(t.value()->characters(characterId ? characterArg(characterId) : CharacterId()));
  });
}

EMSCRIPTEN_KEEPALIVE const char* town_create_character(const char* sheetJson) {
  return guarded([&] {
    const Json sheet = sheetArg(sheetJson);
    if (sheet.is_discarded()) return answer(failReply("bad_request", "the character sheet is not JSON"));
    auto t = liveTown();
    return answerResult(t ? t.value()->createCharacter(sheet) : Result<Json>(t.error()));
  });
}

EMSCRIPTEN_KEEPALIVE const char* town_creator_options() {
  return guarded([] {
    auto t = liveTown();
    return answerResult(t ? t.value()->creatorOptions() : Result<Json>(t.error()));
  });
}

// Tests only: the person's needs topped up (World::devCare), for fast-forwards that are about something else.
EMSCRIPTEN_KEEPALIVE const char* solo_care() {
  return guarded([] {
    auto t = liveTown();
    if (!t) return answer(failReply(t.error()));
    const Harness& h = harness();
    if (h.human.empty()) return answer(failReply(fail("not_playing", "nobody is playing")));
    Status st = t.value()->world().devCare(h.human);
    return answer(st ? Json{{"ok", true}} : failReply(st.error()));
  });
}

// Tests only: everyone playing has their needs topped up (World::devCare).
EMSCRIPTEN_KEEPALIVE const char* town_care() {
  return guarded([] {
    auto t = liveTown();
    if (!t) return answer(failReply(t.error()));
    for (const auto& id : t.value()->humans()) (void)t.value()->world().devCare(id);
    return answer(Json{{"ok", true}});
  });
}

// Who is playing right now -> {"ok", "data": [ids]}.
EMSCRIPTEN_KEEPALIVE const char* town_humans() {
  return guarded([] {
    auto t = liveTown();
    return answerResult(t ? Result<Json>(Json(t.value()->humans())) : Result<Json>(t.error()));
  });
}

}  // extern "C"
