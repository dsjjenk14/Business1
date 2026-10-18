#include "protocol/LocalTown.h"

#include <algorithm>
#include <cmath>
#include <exception>

#include "core/Clock.h"
#include "core/Serialization.h"
#include "protocol/WorldOps.h"

namespace livera::protocol {

namespace {

constexpr const char* kProtocol = "livera/1";
// One slow frame can't teleport everyone: the same cap as the server's tick.
constexpr double kMaxTickSeconds = 1.0;
constexpr GameMinutes kMaxAdvance = 60 * kMinutesPerDay;

Error noWorld() { return fail("no_world", "found a town first or load a save"); }

}  // namespace

Json replyLine(const Json& re, const Result<Json>& result) {
  Json reply{{"re", re}};
  if (result) {
    reply["ok"] = true;
    reply["data"] = result.value();
  } else {
    reply["ok"] = false;
    reply["error"] = Json{{"code", result.error().code}, {"message", result.error().message}};
  }
  return reply;
}

LocalTown::LocalTown(std::shared_ptr<const ContentDatabase> content) : LocalTown(std::move(content), Options()) {}

LocalTown::LocalTown(std::shared_ptr<const ContentDatabase> content, Options options)
    : content_(std::move(content)), options_(options) {}

LocalTown::~LocalTown() = default;

World& LocalTown::world() {
  if (!world_) throw std::logic_error("LocalTown has no world");
  return *world_;
}

const World& LocalTown::world() const {
  if (!world_) throw std::logic_error("LocalTown has no world");
  return *world_;
}

void LocalTown::install(World world) {
  if (world_) autopilot_.stop(*world_);
  humans_.clear();
  world_.emplace(std::move(world));
  // No store billing here: the wallet app says coins can't be bought (the server's --test-payments is off).
  world_->setTestPayments(false);
  // Nobody is connected when a town is loaded, whatever the save says (as Server::create does).
  for (const auto& [id, c] : world_->state().characters) {
    if (c.online) world_->disconnect(id);
  }
  (void)world_->drainEvents();  // nobody is listening yet
}

Result<Json> LocalTown::found() {
  install(World::createNew(content_));
  return hello();
}

Result<Json> LocalTown::load(const Json& doc) {
  if (doc.is_discarded()) return fail("bad_request", "the save is not JSON");
  auto state = worldStateFromJson(doc);
  if (!state) return state.error();
  install(World(content_, std::move(state).value()));
  return hello();
}

Result<Json> LocalTown::save() const {
  if (!world_) return noWorld();
  return worldStateToJson(world_->state());
}

Result<Json> LocalTown::hello() const {
  if (!world_) return noWorld();
  return Json{{"protocol", kProtocol}, {"world_time", formatDateTime(world_->now())}, {"rules", world_->publicRules()}};
}

Json LocalTown::rules() const {
  if (world_) return world_->publicRules();
  return World::createNew(content_).publicRules();
}

Result<Json> LocalTown::join(const CharacterId& id) {
  if (!world_) return noWorld();
  const CharacterDef* def = world_->definition(id);
  if (!def || !def->playable) return fail("unknown_character", "that character can't be played");
  if (humans_.count(id)) return fail("character_in_use", "someone is playing that character right now");
  // People always win: the autopilot drops the character where they stand, still in the world, and the
  // person connects in their place (as Server::play does).
  if (autopilot_.runs(id)) autopilot_.release(*world_, id);
  if (Status st = world_->connect(id); !st) return st.error();
  world_->setScripted(id, false);
  humans_.insert(id);
  return world_->look(id);
}

Result<Json> LocalTown::leave(const CharacterId& id, bool autopilotTakesOver) {
  if (!world_) return noWorld();
  if (!humans_.count(id)) return fail("not_playing", "choose a character first");
  humans_.erase(id);
  world_->disconnect(id);
  world_->setScripted(id, false);
  // A founder nobody keeps goes back on autopilot, as Server::leaveWorld does for an unclaimed one.
  if (autopilotTakesOver && world_->content().character(id)) autopilot_.start(*world_, {id});
  return Json{{"logged_out", true}};
}

Result<Json> LocalTown::worldOp(const CharacterId& who, const std::string& op, const Json& req) {
  if (!world_) return noWorld();
  if (!humans_.count(who)) return fail("not_playing", "choose a character first");
  if (op == "buy_coins")
    return fail("payments_unavailable",
                "Buying coins needs real store billing (App Store / Google Play), which a town in the browser doesn't "
                "have. Nothing was charged.");
  return dispatchWorldOp(*world_, who, op, req);
}

Json LocalTown::request(const CharacterId& who, const Json& req) {
  const Json re = req.is_object() && req.contains("id") ? req["id"] : Json();
  Result<Json> result = fail("internal", "unhandled");
  if (!req.is_object() || !req.contains("op") || !req["op"].is_string()) {
    result = fail("bad_request", "expected {\"op\": ...}");
  } else {
    try {
      result = worldOp(who, req["op"].get<std::string>(), req);
    } catch (const std::exception& e) {
      // Malformed argument types land here (a string where a number belongs), as in Server::handleLine.
      result = fail("bad_request", e.what());
    }
  }
  return replyLine(re, result);
}

std::map<CharacterId, Json> LocalTown::tick(double realSeconds) {
  std::map<CharacterId, Json> out;
  if (!world_) return out;
  const double seconds = std::isfinite(realSeconds) ? std::clamp(realSeconds, 0.0, kMaxTickSeconds) : 0.0;
  // As on the server: the autopilot acts first, so this tick's people stream already shows what it did.
  autopilot_.step(*world_, seconds);
  world_->advanceRealTime(seconds);
  const std::vector<WorldEvent> batch = world_->drainEvents();
  autopilot_.observe(batch);  // asks addressed to its characters, which it declines
  for (const auto& ev : batch) {
    // Routed like Server::routeEvents: one copy per listed recipient who is here.
    for (const auto& who : ev.recipients) {
      if (!humans_.count(who)) continue;
      Json& list = out[who];
      if (!list.is_array()) list = Json::array();
      list.push_back(Json{{"event", ev.type}, {"data", ev.data}});
    }
  }
  return out;
}

Result<Json> LocalTown::characters(const CharacterId& forCharacter) const {
  if (!world_) return noWorld();
  const auto mark = [&](Json& c, const CharacterId& id) {
    // Nobody but people here can hold a character in a local town: the autopilot's are free to take.
    c["available"] = !humans_.count(id) || id == forCharacter;
    c["scripted_now"] = world_->isScripted(id);
    if (world_->isScripted(id)) c["played_by"] = world_->playedBy(id);
  };
  Json list = world_->playableCharacters();
  for (auto& c : list) mark(c, c["id"].get<std::string>());
  for (const auto& [id, def] : world_->state().createdCharacters) {
    Json c{{"id", def.id}, {"name", def.fullName()}, {"age", def.age}, {"pronouns", def.pronouns},
           {"tagline", def.profile.value("tagline", "")}, {"created", true}};
    mark(c, id);
    list.push_back(std::move(c));
  }
  const bool canCreate = !options_.oneCreatedCharacter || world_->state().createdCharacters.empty();
  return Json{{"characters", list}, {"can_create", canCreate}};
}

Result<Json> LocalTown::createCharacter(const Json& sheet) {
  if (!world_) return noWorld();
  if (!sheet.is_object()) return fail("bad_request", "send your character sheet as \"character\"");
  if (options_.oneCreatedCharacter && !world_->state().createdCharacters.empty())
    return fail("already_has_character", "this town already has your character");
  auto id = world_->createCharacter(sheet);
  if (!id) return id.error();
  const CharacterDef* def = world_->definition(id.value());
  return Json{{"id", id.value()}, {"name", def->fullName()}, {"home", world_->content().location(def->spawnLocation)->name}};
}

Result<Json> LocalTown::creatorOptions() const {
  if (!world_) return noWorld();
  return world_->creatorOptions();
}

Result<Json> LocalTown::advanceMinutes(GameMinutes minutes) {
  if (!world_) return noWorld();
  if (minutes < 1 || minutes > kMaxAdvance) return fail("bad_request", "minutes must be 1..86400");
  world_->advanceMinutes(minutes);
  return Json{{"now", formatDateTime(world_->now())}};
}

Result<Json> LocalTown::autopilotStart(const std::optional<std::vector<CharacterId>>& ids) {
  if (!world_) return noWorld();
  std::vector<CharacterId> take;
  if (!ids) {
    for (const auto& [id, def] : world_->content().characters()) {
      if (def.playable) take.push_back(id);
    }
  } else {
    take = *ids;
  }
  // People are never handed to the autopilot.
  take.erase(std::remove_if(take.begin(), take.end(), [&](const CharacterId& id) { return humans_.count(id) > 0; }),
             take.end());
  autopilot_.start(*world_, take);
  return Json{{"running", autopilot_.characters()}};
}

Result<Json> LocalTown::autopilotStop() {
  if (!world_) return noWorld();
  autopilot_.stop(*world_);
  return Json{{"running", Json::array()}};
}

Result<Json> LocalTown::autopilotStatus() const {
  if (!world_) return noWorld();
  return autopilot_.status();
}

}  // namespace livera::protocol
