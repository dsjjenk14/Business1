#include "server/Server.h"

#include <poll.h>
#include <sys/socket.h>
#include <unistd.h>

#include <cerrno>
#include <cmath>
#include <cstdio>
#include <regex>
#include <vector>

#include "core/Clock.h"

namespace livera {

namespace {

constexpr const char* kProtocol = "livera-dev/1";
constexpr std::size_t kMaxOutboxBytes = 1 << 20;
constexpr int kMaxViolations = 50;
constexpr GameMinutes kMaxDevAdvance = 60 * kMinutesPerDay;

void logLine(const std::string& msg) { std::fprintf(stderr, "[livera] %s\n", msg.c_str()); }

std::string str(const Json& req, const char* key) {
  auto it = req.find(key);
  return it != req.end() && it->is_string() ? it->get<std::string>() : std::string();
}

}  // namespace

Result<std::unique_ptr<Server>> Server::create(ServerConfig config) {
  auto content = config.content ? Result<std::shared_ptr<const ContentDatabase>>(config.content)
                                : ContentDatabase::loadFromDirectory(config.dataDir);
  if (!content) return content.error();
  auto store = SqliteStore::open(config.dbPath);
  if (!store) return store.error();

  std::optional<World> world;
  if (store.value()->hasWorld()) {
    auto state = store.value()->loadWorld();
    if (!state) return state.error();
    world.emplace(content.value(), std::move(state).value());
    logLine("loaded world at " + formatDateTime(world->now()) + " from " + config.dbPath);
  } else {
    world.emplace(World::createNew(content.value()));
    if (Status s = store.value()->saveWorld(world->state()); !s) return s.error();
    logLine("founded a new world at " + formatDateTime(world->now()) + " in " + config.dbPath);
  }
  // Nobody is connected when the server starts, whatever the save says.
  for (const auto& [id, c] : world->state().characters) {
    if (c.online) world->disconnect(id);
  }

  auto listener = net::listenTcp(config.bindAddress, config.port);
  if (!listener) return listener.error();
  std::unique_ptr<Server> server(
      new Server(std::move(config), std::move(store).value(), std::move(*world), std::move(listener).value()));
  return server;
}

Server::Server(ServerConfig config, std::unique_ptr<SqliteStore> store, World world, net::Fd listener)
    : config_(std::move(config)),
      store_(std::move(store)),
      world_(std::move(world)),
      listener_(std::move(listener)),
      started_(std::chrono::steady_clock::now()) {
  port_ = net::localPort(listener_);
}

Server::~Server() = default;

double Server::monotonicSeconds() const {
  return std::chrono::duration<double>(std::chrono::steady_clock::now() - started_).count();
}

Status Server::save() {
  Status s = store_->saveWorld(world_.state());
  if (!s) logLine("SAVE FAILED: " + s.error().message);
  return s;
}

void Server::run(const std::atomic<bool>& stop) {
  logLine("listening on " + config_.bindAddress + ":" + std::to_string(port_));
  const double tickInterval = 1.0 / config_.tickHz;
  double lastTick = monotonicSeconds();
  double lastSave = lastTick;

  while (!stop.load()) {
    std::vector<pollfd> fds;
    std::vector<int> ids;
    fds.push_back(pollfd{listener_.get(), POLLIN, 0});
    ids.push_back(0);
    for (auto& [id, s] : sessions_) {
      short events = POLLIN;
      if (!s.out.empty()) events |= POLLOUT;
      fds.push_back(pollfd{s.fd.get(), events, 0});
      ids.push_back(id);
    }
    const double untilTick = std::max(0.0, lastTick + tickInterval - monotonicSeconds());
    ::poll(fds.data(), fds.size(), static_cast<int>(untilTick * 1000));

    if (fds[0].revents & POLLIN) acceptClients();
    for (std::size_t i = 1; i < fds.size(); ++i) {
      auto it = sessions_.find(ids[i]);
      if (it == sessions_.end()) continue;
      if (fds[i].revents & (POLLIN | POLLHUP | POLLERR)) readFrom(it->second);
      if (!it->second.closing && (fds[i].revents & POLLOUT)) writeTo(it->second);
    }

    const double now = monotonicSeconds();
    if (now - lastTick >= tickInterval) {
      tick(now - lastTick);
      lastTick = now;
    }
    routeEvents();
    for (auto& [id, s] : sessions_) {
      if (!s.out.empty() && !s.closing) writeTo(s);
    }
    for (auto it = sessions_.begin(); it != sessions_.end();) {
      if (!it->second.closing) {
        ++it;
        continue;
      }
      // Best effort: let the client see why it was dropped. Never block on it.
      if (!it->second.out.empty())
        (void)::send(it->second.fd.get(), it->second.out.data(), it->second.out.size(), MSG_NOSIGNAL | MSG_DONTWAIT);
      it = sessions_.erase(it);
    }
    if (now - lastSave >= config_.autosaveSeconds) {
      (void)save();
      lastSave = now;
    }
  }

  logLine("shutting down");
  for (auto& [id, s] : sessions_) leaveWorld(s);
  routeEvents();
  sessions_.clear();
  (void)save();
}

void Server::tick(double realSeconds) {
  // Cap catch-up after a stall so one slow frame can't teleport everyone.
  world_.advanceRealTime(std::min(realSeconds, 1.0));
}

void Server::acceptClients() {
  for (;;) {
    const int fd = ::accept(listener_.get(), nullptr, nullptr);
    if (fd < 0) return;
    Session s;
    s.id = nextSessionId_++;
    s.fd = net::Fd(fd);
    s.limiter = RateLimiter(config_.requestsPerSecond, config_.requestBurst);
    if (!net::setNonBlocking(s.fd)) continue;
    const int id = s.id;
    sessions_.emplace(id, std::move(s));
    send(sessions_.at(id), Json{{"event", "welcome"}, {"data", {{"protocol", kProtocol}}}});
  }
}

void Server::readFrom(Session& s) {
  char buf[4096];
  for (;;) {
    const ssize_t n = ::recv(s.fd.get(), buf, sizeof buf, 0);
    if (n > 0) {
      if (!s.in.append(buf, static_cast<std::size_t>(n))) {
        closeSession(s, "line too long");
        return;
      }
      continue;
    }
    if (n == 0) {
      closeSession(s, "client disconnected");
      return;
    }
    if (errno == EAGAIN || errno == EWOULDBLOCK) break;
    if (errno == EINTR) continue;
    closeSession(s, "read error");
    return;
  }
  while (!s.closing) {
    auto line = s.in.nextLine();
    if (!line) break;
    if (!line->empty()) handleLine(s, *line);
  }
}

void Server::writeTo(Session& s) {
  while (!s.out.empty()) {
    const ssize_t n = ::send(s.fd.get(), s.out.data(), s.out.size(), MSG_NOSIGNAL);
    if (n > 0) {
      s.out.erase(0, static_cast<std::size_t>(n));
      continue;
    }
    if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) return;
    if (n < 0 && errno == EINTR) continue;
    closeSession(s, "write error");
    return;
  }
}

void Server::send(Session& s, const Json& message) {
  if (s.closing) return;
  s.out += message.dump() + "\n";
  if (s.out.size() > kMaxOutboxBytes) closeSession(s, "client not reading");
}

void Server::handleLine(Session& s, const std::string& line) {
  if (!s.limiter.allow(monotonicSeconds())) {
    if (++s.violations > kMaxViolations) {
      closeSession(s, "rate limit");
      return;
    }
    send(s, Json{{"ok", false}, {"error", {{"code", "rate_limited"}, {"message", "slow down"}}}});
    return;
  }
  Json req = Json::parse(line, nullptr, /*allow_exceptions=*/false);
  if (!req.is_object() || !req.contains("op") || !req["op"].is_string()) {
    send(s, Json{{"ok", false}, {"error", {{"code", "bad_request"}, {"message", "expected {\"op\": ...}"}}}});
    return;
  }
  const std::string opName = req["op"].get<std::string>();
  if ((opName == "say" || opName == "message") && !s.chatLimiter.allow(monotonicSeconds())) {
    send(s, Json{{"re", req.value("id", Json())},
                 {"ok", false},
                 {"error", {{"code", "chat_rate_limited"}, {"message", "you're talking too fast"}}}});
    return;
  }
  Json reply{{"re", req.value("id", Json())}};
  Result<Json> result = fail("internal", "unhandled");
  try {
    result = dispatch(s, req["op"].get<std::string>(), req);
  } catch (const std::exception& e) {
    // Malformed argument types land here (e.g. a string where a number belongs).
    result = fail("bad_request", e.what());
  }
  if (result) {
    reply["ok"] = true;
    reply["data"] = result.value();
  } else {
    reply["ok"] = false;
    reply["error"] = Json{{"code", result.error().code}, {"message", result.error().message}};
  }
  send(s, reply);
}

Result<Json> Server::dispatch(Session& s, const std::string& op, const Json& req) {
  // --- Ops available before login -------------------------------------------------
  if (op == "ping") return Json{{"pong", true}};
  if (op == "hello") return Json{{"protocol", kProtocol}, {"world_time", formatDateTime(world_.now())}};
  if (op == "register") {
    if (!config_.openRegistration) return fail("registration_closed", "registration is closed");
    const std::string user = str(req, "username");
    const std::string pass = str(req, "password");
    static const std::regex kUsername("^[a-z0-9_]{3,24}$");
    if (!std::regex_match(user, kUsername))
      return fail("invalid_username", "use 3-24 lowercase letters, digits or underscores");
    if (pass.size() < 8 || pass.size() > 128) return fail("invalid_password", "use 8-128 characters");
    if (Status st = store_->createAccount(user, hashPassword(pass, config_.passwordIterations)); !st) return st.error();
    logLine("account created: " + user);
    return Json{{"username", user}};
  }
  if (op == "login") {
    const std::string user = str(req, "username");
    const auto cred = store_->credential(user);
    if (!cred || !verifyPassword(str(req, "password"), *cred)) return fail("bad_credentials", "wrong username or password");
    if (!s.username.empty()) return fail("already_logged_in", "already logged in");
    // A second login for the same account replaces the first connection.
    for (auto& [id, other] : sessions_) {
      if (id != s.id && other.username == user && !other.closing) {
        send(other, Json{{"event", "kicked"}, {"data", {{"reason", "logged in elsewhere"}}}});
        closeSession(other, "replaced by new login");
      }
    }
    s.username = user;
    const auto character = store_->characterOf(user);
    return Json{{"username", user}, {"character", character ? Json(*character) : Json()}};
  }
  if (s.username.empty()) return fail("not_logged_in", "log in first");

  // --- Ops for logged-in accounts ---------------------------------------------------
  if (op == "characters") {
    Json list = world_.playableCharacters();
    for (auto& c : list) {
      const auto owner = store_->claimedBy(c["id"].get<std::string>());
      c["available"] = !owner || *owner == s.username;
    }
    // Your own created character, if you have one. Other players' creations aren't listed.
    const auto mine = store_->characterOf(s.username);
    if (mine && !world_.content().character(*mine)) {
      if (const CharacterDef* def = world_.definition(*mine)) {
        list.push_back(Json{{"id", def->id}, {"name", def->fullName()}, {"age", def->age}, {"pronouns", def->pronouns},
                            {"tagline", def->profile.value("tagline", "")}, {"created", true}, {"available", true}});
      }
    }
    return Json{{"characters", list}, {"can_create", !mine.has_value()}};
  }
  if (op == "creator_options") return world_.creatorOptions();
  // Time skips are world-wide, so they don't need a character: skipping a night with everyone
  // logged off lets the whole cast live their routine offline, as it would on a live server.
  if (op == "dev_advance") {
    if (!config_.devCommands) return fail("forbidden", "dev commands are disabled on this server");
    const auto minutes = req.at("minutes").get<GameMinutes>();
    if (minutes < 1 || minutes > kMaxDevAdvance) return fail("bad_request", "minutes must be 1..86400");
    world_.advanceMinutes(minutes);
    return Json{{"now", formatDateTime(world_.now())}};
  }
  if (op == "create_character") {
    if (store_->characterOf(s.username)) return fail("already_has_character", "this account already has a character");
    if (!req.contains("character")) return fail("bad_request", "send your character sheet as \"character\"");
    auto id = world_.createCharacter(req["character"]);
    if (!id) return id.error();
    if (Status st = store_->claimCharacter(s.username, id.value()); !st) return st.error();
    // Save now so the account's claim never points at a character the save doesn't have.
    (void)save();
    logLine(s.username + " created " + id.value());
    const CharacterDef* def = world_.definition(id.value());
    return Json{{"id", id.value()}, {"name", def->fullName()}, {"home", world_.content().location(def->spawnLocation)->name}};
  }
  if (op == "play") {
    if (!s.character.empty()) return fail("already_playing", "already in the world");
    std::string id = str(req, "character");
    if (id.empty()) id = store_->characterOf(s.username).value_or("");
    const CharacterDef* def = world_.definition(id);
    if (!def || !def->playable) return fail("unknown_character", "that character can't be played");
    if (playersInWorld() >= config_.maxPlayers) return fail("server_full", "the server is full");
    if (Status st = store_->claimCharacter(s.username, id); !st) return st.error();
    if (Status st = world_.connect(id); !st) return st.error();
    s.character = id;
    logLine(s.username + " entered the world as " + id);
    return world_.look(id);
  }
  if (op == "logout") {
    // Leaves the world and ends the account session; the connection stays open.
    leaveWorld(s);
    s.username.clear();
    return Json{{"logged_out", true}};
  }
  if (s.character.empty()) return fail("not_playing", "choose a character first");

  // --- In-world ops: all validated by World -----------------------------------------
  const CharacterId& me = s.character;
  if (op == "look") return world_.look(me);
  if (op == "map") return world_.mapView();
  if (op == "move") {
    Vec2 target;
    if (req.contains("location")) {
      const LocationDef* loc = world_.content().location(str(req, "location"));
      if (!loc) return fail("unknown_location", "no such place");
      target = loc->door;
    } else {
      target = Vec2{req.at("x").get<double>(), req.at("y").get<double>()};
    }
    if (Status st = world_.moveTo(me, target); !st) return st.error();
    const CharacterState* c = world_.character(me);
    const double meters = distance(c->position, *c->moveTarget);
    return Json{{"target", {c->moveTarget->x, c->moveTarget->y}},
                {"eta_seconds", std::ceil(meters / world_.content().sim().walkSpeedMetersPerSecond)}};
  }
  if (op == "enter") {
    if (Status st = world_.enter(me, str(req, "location")); !st) return st.error();
    return world_.look(me);
  }
  if (op == "exit") return world_.exitBuilding(me);
  if (op == "interact") return world_.interact(me, str(req, "interaction"), str(req, "target"));
  if (op == "buy") return world_.buy(me, str(req, "offer"), req.value("method", std::string("card")));
  if (op == "activity") return world_.useActivity(me, str(req, "activity"));
  if (op == "say") return world_.say(me, str(req, "text"), req.value("volume", std::string("say")), str(req, "to"));
  if (op == "tip") return world_.tip(me, str(req, "to"), req.at("cents").get<Cents>());
  // "id" is reserved for request/reply matching, so songs are named by "song" / "song_id".
  if (op == "song_save") {
    if (!req.contains("song") || !req["song"].is_object()) return fail("bad_request", "send the song as \"song\"");
    return world_.saveSong(me, req["song"], str(req, "song_id"));
  }
  if (op == "song_release") return world_.releaseSong(me, str(req, "song"));
  if (op == "song") return world_.openSong(me, str(req, "song"));
  if (op == "perform") return world_.perform(me, str(req, "song"));
  if (op == "work") {
    const std::string action = str(req, "action");
    if (action == "start") {
      if (Status st = world_.startShift(me); !st) return st.error();
      return Json{{"on_shift", true}};
    }
    if (action == "end") return world_.endShift(me);
    return fail("bad_request", "action must be start or end");
  }
  if (op == "phone") return world_.openPhoneApp(me, str(req, "app"));
  if (op == "message") {
    auto id = world_.sendMessage(me, str(req, "to"), str(req, "text"));
    if (!id) return id.error();
    return Json{{"id", id.value()}};
  }
  return fail("unknown_op", "unknown op '" + op + "'");
}

void Server::routeEvents() {
  for (auto& ev : world_.drainEvents()) {
    for (const auto& who : ev.recipients) {
      for (auto& [id, s] : sessions_) {
        if (s.character == who) send(s, Json{{"event", ev.type}, {"data", ev.data}});
      }
    }
  }
}

void Server::leaveWorld(Session& s) {
  if (s.character.empty()) return;
  world_.disconnect(s.character);
  logLine(s.username + " left the world (" + s.character + ")");
  s.character.clear();
  // Persist right away so a crash after logout never loses the session.
  (void)save();
}

void Server::closeSession(Session& s, const std::string& reason) {
  if (s.closing) return;
  leaveWorld(s);
  s.closing = true;
  if (!s.username.empty()) logLine("connection closed for " + s.username + ": " + reason);
}

std::size_t Server::playersInWorld() const {
  std::size_t n = 0;
  for (const auto& [id, s] : sessions_) n += (!s.character.empty() && !s.closing) ? 1 : 0;
  return n;
}

}  // namespace livera
