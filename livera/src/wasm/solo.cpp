// The single-player harness: the core, the shared op dispatch and the autopilot compiled to WebAssembly
// (CMake option LIVERA_WASM, scripts/build_wasm.sh). The page (web/client/solo/) is the only client; it
// calls these C functions with UTF-8 JSON strings and gets JSON strings back, shaped like the server's
// replies and events (docs/MULTIPLAYER.md), so the same client code draws a solo town and a live one.
// Content is read from /data, where the build embeds data/ (MEMFS). The save is the whole world as one
// JSON document (core/Serialization.h); the autopilot's plans are not in it (it re-plans on load).
//
// Every reply string points at one buffer that the next call overwrites: the caller copies it first
// (ccall with a "string" return does).

#include <emscripten/emscripten.h>

#include <algorithm>
#include <cmath>
#include <exception>
#include <memory>
#include <optional>
#include <string>
#include <vector>

#include "core/Autopilot.h"
#include "core/Clock.h"
#include "core/Serialization.h"
#include "protocol/WorldOps.h"

using namespace livera;

namespace {

constexpr const char* kProtocol = "livera/1";
constexpr const char* kDataDir = "/data";
constexpr GameMinutes kMaxDevAdvance = 60 * kMinutesPerDay;
// One slow frame can't teleport everyone: the same cap as the server's tick.
constexpr double kMaxTickSeconds = 1.0;

struct Solo {
  std::shared_ptr<const ContentDatabase> content;
  std::optional<World> world;
  Autopilot autopilot;
  CharacterId human;  // the character the person plays, "" until solo_play
  std::string out;    // the buffer every call answers from
};

Solo& solo() {
  static Solo s;
  return s;
}

Json errorJson(const Error& e) { return Json{{"code", e.code}, {"message", e.message}}; }
Json okReply(Json data) { return Json{{"ok", true}, {"data", std::move(data)}}; }
Json failReply(const Error& e) { return Json{{"ok", false}, {"error", errorJson(e)}}; }
Json failReply(const std::string& code, const std::string& message) { return failReply(fail(code, message)); }

const char* answer(const Json& j) {
  Solo& s = solo();
  s.out = j.dump();
  return s.out.c_str();
}

// A Result<Json> as the server would send it.
const char* answerResult(const Result<Json>& r) { return answer(r ? okReply(r.value()) : failReply(r.error())); }

// Parses an argument without throwing; a null pointer or non-JSON text becomes `discarded`.
Json parseArg(const char* text) {
  if (!text) return Json();
  return Json::parse(text, nullptr, /*allow_exceptions=*/false);
}

Status ensureContent() {
  Solo& s = solo();
  if (s.content) return okStatus();
  auto loaded = ContentDatabase::loadFromDirectory(kDataDir);
  if (!loaded) return loaded.error();
  s.content = loaded.value();
  return okStatus();
}

Error noWorld() { return fail("no_world", "found a town first (solo_new) or load a save (solo_load)"); }

Json helloJson(const World& w) {
  return Json{{"protocol", kProtocol}, {"world_time", formatDateTime(w.now())}, {"rules", w.publicRules()}};
}

// Replaces the world: the autopilot stops (its characters leave), the person is out, nobody is online.
void installWorld(World world) {
  Solo& s = solo();
  if (s.world) s.autopilot.stop(*s.world);
  s.human.clear();
  s.world.emplace(std::move(world));
  s.world->setTestPayments(false);  // no store billing in the browser: the wallet app says coins can't be bought
  for (const auto& [id, c] : s.world->state().characters) {
    if (c.online) s.world->disconnect(id);
  }
  (void)s.world->drainEvents();  // nobody is listening yet
}

Result<Json> newWorld() {
  if (Status st = ensureContent(); !st) return st.error();
  installWorld(World::createNew(solo().content));
  return helloJson(*solo().world);
}

Result<Json> loadWorld(const Json& doc) {
  if (doc.is_discarded()) return fail("bad_request", "the save is not JSON");
  if (Status st = ensureContent(); !st) return st.error();
  auto state = worldStateFromJson(doc);
  if (!state) return state.error();
  installWorld(World(solo().content, std::move(state).value()));
  return helloJson(*solo().world);
}

Result<Json> characters() {
  Solo& s = solo();
  if (!s.world) return noWorld();
  Json list = s.world->playableCharacters();
  for (auto& c : list) {
    const std::string id = c["id"].get<std::string>();
    // Nobody else can hold a character in a solo town: the person may take any founder, the autopilot's included.
    c["available"] = true;
    c["scripted_now"] = s.world->isScripted(id);
    if (s.world->isScripted(id)) c["played_by"] = s.world->playedBy(id);
  }
  for (const auto& [id, def] : s.world->state().createdCharacters) {
    list.push_back(Json{{"id", def.id}, {"name", def.fullName()}, {"age", def.age}, {"pronouns", def.pronouns},
                        {"tagline", def.profile.value("tagline", "")}, {"created", true}, {"available", true}});
  }
  return Json{{"characters", list}, {"can_create", s.world->state().createdCharacters.empty()}};
}

Result<Json> createCharacter(const Json& sheet) {
  Solo& s = solo();
  if (!s.world) return noWorld();
  if (!sheet.is_object()) return fail("bad_request", "send your character sheet as \"character\"");
  // One made character per town, as one account makes one on a server.
  if (!s.world->state().createdCharacters.empty()) return fail("already_has_character", "this town already has your character");
  auto id = s.world->createCharacter(sheet);
  if (!id) return id.error();
  const CharacterDef* def = s.world->definition(id.value());
  return Json{{"id", id.value()}, {"name", def->fullName()}, {"home", s.world->content().location(def->spawnLocation)->name}};
}

Result<Json> play(const CharacterId& id) {
  Solo& s = solo();
  if (!s.world) return noWorld();
  if (!s.human.empty()) return fail("already_playing", "already in the world");
  const CharacterDef* def = s.world->definition(id);
  if (!def || !def->playable) return fail("unknown_character", "that character can't be played");
  // Humans win: the autopilot lets go (plan dropped, label cleared, still in the world) before the person connects.
  if (s.autopilot.runs(id)) s.autopilot.release(*s.world, id);
  if (Status st = s.world->connect(id); !st) return st.error();
  s.human = id;
  return s.world->look(id);
}

Result<Json> leave() {
  Solo& s = solo();
  if (!s.world) return noWorld();
  if (s.human.empty()) return fail("not_playing", "choose a character first");
  s.world->disconnect(s.human);
  s.world->setScripted(s.human, false);
  s.human.clear();
  return Json{{"logged_out", true}};
}

std::vector<CharacterId> playableFounders() {
  Solo& s = solo();
  std::vector<CharacterId> ids;
  for (const auto& [id, def] : s.world->content().characters()) {
    if (def.playable && id != s.human) ids.push_back(id);
  }
  return ids;
}

Result<Json> autopilotStart(const Json& arg) {
  Solo& s = solo();
  if (!s.world) return noWorld();
  std::vector<CharacterId> ids;
  if (arg.is_array()) {
    for (const auto& v : arg) {
      if (v.is_string() && v.get<std::string>() != s.human) ids.push_back(v.get<std::string>());
    }
  } else if (arg.is_null() || arg.is_discarded()) {
    ids = playableFounders();
  } else {
    return fail("bad_request", "send a JSON array of character ids, or null for everyone you don't play");
  }
  s.autopilot.start(*s.world, ids);
  return Json{{"running", s.autopilot.characters()}};
}

Result<Json> autopilotStop() {
  Solo& s = solo();
  if (!s.world) return noWorld();
  s.autopilot.stop(*s.world);
  return Json{{"running", Json::array()}};
}

// The pre-play ops a client sends before and around `play` (the server's "ops for logged-in accounts"),
// so a transport can route every request here; the dedicated solo_* entry points do the same.
Result<Json> dispatch(const std::string& op, const Json& req) {
  Solo& s = solo();
  if (op == "ping") return Json{{"pong", true}};
  if (!s.world) return noWorld();
  if (op == "hello") return helloJson(*s.world);
  if (op == "characters") return characters();
  if (op == "creator_options") return s.world->creatorOptions();
  if (op == "create_character") {
    if (!req.contains("character")) return fail("bad_request", "send your character sheet as \"character\"");
    return createCharacter(req["character"]);
  }
  if (op == "play") return play(protocol::str(req, "character"));
  if (op == "logout") return leave();
  if (op == "dev_advance") {
    // A solo town is the player's own: skipping time is allowed, with the server's bounds.
    const auto minutes = req.at("minutes").get<GameMinutes>();
    if (minutes < 1 || minutes > kMaxDevAdvance) return fail("bad_request", "minutes must be 1..86400");
    s.world->advanceMinutes(minutes);
    return Json{{"now", formatDateTime(s.world->now())}};
  }
  if (s.human.empty()) return fail("not_playing", "choose a character first");
  if (op == "buy_coins")
    return fail("payments_unavailable",
                "Buying coins needs real store billing (App Store / Google Play), which the single-player game "
                "doesn't have. Nothing was charged.");
  return protocol::dispatchWorldOp(*s.world, s.human, op, req);
}

// `solo_play` takes a bare id, a JSON string or {"character": id}.
CharacterId characterArg(const char* text) {
  const Json parsed = parseArg(text);
  if (parsed.is_string()) return parsed.get<std::string>();
  if (parsed.is_object()) return protocol::str(parsed, "character");
  return text ? std::string(text) : std::string();
}

template <class F>
const char* guarded(F&& f) {
  try {
    return f();
  } catch (const std::exception& e) {
    return answer(failReply("internal", e.what()));
  }
}

}  // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE const char* solo_new() {
  return guarded([] { return answerResult(newWorld()); });
}

EMSCRIPTEN_KEEPALIVE const char* solo_load(const char* stateJson) {
  return guarded([&] { return answerResult(loadWorld(parseArg(stateJson))); });
}

// The whole world as one JSON document ("format": 1), or {"ok": false, "error": {"code": "no_world"}}.
EMSCRIPTEN_KEEPALIVE const char* solo_save() {
  return guarded([] {
    Solo& s = solo();
    if (!s.world) return answer(failReply(noWorld()));
    return answer(worldStateToJson(s.world->state()));
  });
}

// The `rules` object clients get in `welcome`, `hello` and `map`; content-only, so it works before a town exists.
EMSCRIPTEN_KEEPALIVE const char* solo_rules() {
  return guarded([] {
    Solo& s = solo();
    if (s.world) return answer(s.world->publicRules());
    if (!ensureContent()) return answer(Json::object());
    return answer(World::createNew(s.content).publicRules());
  });
}

EMSCRIPTEN_KEEPALIVE const char* solo_characters() {
  return guarded([] { return answerResult(characters()); });
}

// The sheet itself, or {"character": sheet} as the `create_character` op takes it.
EMSCRIPTEN_KEEPALIVE const char* solo_create_character(const char* sheetJson) {
  return guarded([&] {
    Json sheet = parseArg(sheetJson);
    if (sheet.is_object() && sheet.contains("character") && sheet["character"].is_object()) sheet = sheet["character"];
    if (sheet.is_discarded()) return answer(failReply("bad_request", "the character sheet is not JSON"));
    return answerResult(createCharacter(sheet));
  });
}

EMSCRIPTEN_KEEPALIVE const char* solo_play(const char* characterId) {
  return guarded([&] { return answerResult(play(characterArg(characterId))); });
}

EMSCRIPTEN_KEEPALIVE const char* solo_leave() {
  return guarded([] { return answerResult(leave()); });
}

// One request line as the server takes it: {"id": ..., "op": ..., ...} -> {"re", "ok", "data"|"error"}.
EMSCRIPTEN_KEEPALIVE const char* solo_request(const char* reqJson) {
  return guarded([&] {
    const Json req = parseArg(reqJson);
    const Json re = req.is_object() && req.contains("id") ? req["id"] : Json();
    Json reply{{"re", re}};
    Result<Json> result = fail("internal", "unhandled");
    if (!req.is_object() || !req.contains("op") || !req["op"].is_string()) {
      result = fail("bad_request", "expected {\"op\": ...}");
    } else {
      try {
        result = dispatch(req["op"].get<std::string>(), req);
      } catch (const std::exception& e) {
        // Malformed argument types land here (e.g. a string where a number belongs).
        result = fail("bad_request", e.what());
      }
    }
    if (result) {
      reply["ok"] = true;
      reply["data"] = result.value();
    } else {
      reply["ok"] = false;
      reply["error"] = errorJson(result.error());
    }
    return answer(reply);
  });
}

// Advances the town by this much real time (capped at 1 s, like the server's tick), lets the autopilot act,
// and returns the events for the person's character: [{"event": ..., "data": ...}, ...]. Events for
// everyone else are dropped; nobody else is listening.
EMSCRIPTEN_KEEPALIVE const char* solo_tick(double realSeconds) {
  return guarded([&] {
    Solo& s = solo();
    Json events = Json::array();
    if (!s.world) return answer(events);
    const double seconds = std::isfinite(realSeconds) ? std::clamp(realSeconds, 0.0, kMaxTickSeconds) : 0.0;
    // As on the server: the autopilot acts first, so this tick's people stream already shows what it did.
    s.autopilot.step(*s.world, seconds);
    s.world->advanceRealTime(seconds);
    const std::vector<WorldEvent> batch = s.world->drainEvents();
    s.autopilot.observe(batch);
    for (const auto& ev : batch) {
      if (s.human.empty()) break;
      if (std::find(ev.recipients.begin(), ev.recipients.end(), s.human) != ev.recipients.end())
        events.push_back(Json{{"event", ev.type}, {"data", ev.data}});
    }
    return answer(events);
  });
}

// Puts these characters (a JSON array of ids), or with null every playable founder the person doesn't play, on
// autopilot. Replies {"running": [ids]}.
EMSCRIPTEN_KEEPALIVE const char* solo_autopilot_start(const char* idsJson) {
  return guarded([&] { return answerResult(autopilotStart(parseArg(idsJson))); });
}

EMSCRIPTEN_KEEPALIVE const char* solo_autopilot_stop() {
  return guarded([] { return answerResult(autopilotStop()); });
}

// What each autopilot character is up to (Autopilot::status), for the page's debug hook.
EMSCRIPTEN_KEEPALIVE const char* solo_autopilot_status() {
  return guarded([] {
    Solo& s = solo();
    if (!s.world) return answer(failReply(noWorld()));
    return answer(okReply(s.autopilot.status()));
  });
}

}  // extern "C"
