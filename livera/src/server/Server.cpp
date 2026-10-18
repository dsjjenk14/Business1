#include "server/Server.h"

#include <poll.h>
#include <sys/socket.h>
#include <unistd.h>

#include <cerrno>
#include <cmath>
#include <cstdio>
#include <vector>

#include "core/Clock.h"
#include "protocol/WorldOps.h"

namespace livera {

using protocol::str;

namespace {

constexpr const char* kProtocol = "livera/1";
constexpr std::size_t kMaxOutboxBytes = 1 << 20;
constexpr int kMaxViolations = 50;
constexpr GameMinutes kMaxDevAdvance = 60 * kMinutesPerDay;
// Out of file descriptors, accept() fails but the connection stays queued and the listener stays readable, so polling
// it again at once would spin a core. It is left out of the poll set this long, then tried again.
constexpr double kAcceptBackoffSeconds = 0.5;

void logLine(const std::string& msg) { std::fprintf(stderr, "[livera] %s\n", msg.c_str()); }

// m08:wallet payments { Coins, phones and LivPay (Wallet.cpp)
// The payment verifier: real money is verified here, never trusted from the client. The only
// provider today is the test one (dev servers and --test-payments), which accepts receipts that
// start "test-" and charges nothing. Verifying real App Store / Google Play receipts needs the
// stores' server APIs and credentials, which aren't connected yet, so everything else is refused.
// Returns whether the purchase is a test purchase.
bool testPaymentsOn(const ServerConfig& cfg) { return cfg.devCommands || cfg.testPayments; }

Result<bool> verifyCoinReceipt(const ServerConfig& cfg, const std::string& receipt) {
  if (!testPaymentsOn(cfg))
    return fail("payments_unavailable",
                "Buying coins needs real store billing (App Store / Google Play), which isn't connected to this server "
                "yet. Nothing was charged.");
  if (receipt.rfind("test-", 0) != 0)
    return fail("receipt_rejected", "this server only takes test purchases: the receipt must start with \"test-\"");
  return true;
}
// } m08:wallet

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
      tokens_(config_.tokenLifetimeSeconds, config_.tokensPerUser),
      loginThrottle_(config_.loginMaxFailures, config_.loginWindowSeconds, config_.loginLockSeconds),
      started_(std::chrono::steady_clock::now()) {
  port_ = net::localPort(listener_);
  world_.setTestPayments(testPaymentsOn(config_));  // m08:wallet: the wallet app says whether coins can be bought
  if (config_.autopilot) {
    // Every playable founder no account has claimed lives their day on autopilot (D-053). They aren't
    // sessions: they count toward neither cap, and a person's `play` takes them over at once.
    autopilot_.setLog(logLine);
    std::vector<CharacterId> ids;
    for (const auto& [id, def] : world_.content().characters()) {
      if (def.playable && !store_->claimedBy(id)) ids.push_back(id);
    }
    autopilot_.start(world_, ids);
    logLine("autopilot: playing " + std::to_string(autopilot_.characters().size()) + " unclaimed founder(s)");
  }
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
    // A negative fd is skipped by poll(): while accepts are paused the listener can't wake the loop.
    fds.push_back(pollfd{monotonicSeconds() < acceptPausedUntil_ ? -1 : listener_.get(), POLLIN, 0});
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
  stopping_ = true;
  autopilot_.stop(world_);
  for (auto& [id, s] : sessions_) leaveWorld(s);
  routeEvents();
  sessions_.clear();
  (void)save();
}

void Server::tick(double realSeconds) {
  // Cap catch-up after a stall so one slow frame can't teleport everyone.
  const double seconds = std::min(realSeconds, 1.0);
  // The autopilot acts first, so what it does is in this tick's people stream rather than the next one's: a
  // player who sees an autopilot character in `look` has already been told about them.
  autopilot_.step(world_, seconds);
  world_.advanceRealTime(seconds);
}

void Server::acceptClients() {
  for (;;) {
    const int fd = ::accept(listener_.get(), nullptr, nullptr);
    if (fd < 0) {
      if (errno == EMFILE || errno == ENFILE || errno == ENOBUFS || errno == ENOMEM) {
        if (acceptPausedUntil_ < 0) logLine("out of file descriptors: pausing new connections until some close");
        acceptPausedUntil_ = monotonicSeconds() + kAcceptBackoffSeconds;
      }
      return;
    }
    if (acceptPausedUntil_ >= 0) {
      logLine("accepting new connections again");
      acceptPausedUntil_ = -1;
    }
    Session s;
    s.id = nextSessionId_++;
    s.fd = net::Fd(fd);
    s.limiter = RateLimiter(config_.requestsPerSecond, config_.requestBurst);
    if (!net::setNonBlocking(s.fd)) continue;
    const int id = s.id;
    sessions_.emplace(id, std::move(s));
    send(sessions_.at(id),
         Json{{"event", "welcome"}, {"data", {{"protocol", kProtocol}, {"rules", world_.publicRules()}}}});
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
  // Parse first (it can't throw) so that every reply, refusals included, names the request it answers.
  Json req = Json::parse(line, nullptr, /*allow_exceptions=*/false);
  const Json re = req.is_object() && req.contains("id") ? req["id"] : Json();
  if (!s.limiter.allow(monotonicSeconds())) {
    if (++s.violations > kMaxViolations) {
      closeSession(s, "rate limit");
      return;
    }
    send(s, Json{{"re", re}, {"ok", false}, {"error", {{"code", "rate_limited"}, {"message", "slow down"}}}});
    return;
  }
  if (!req.is_object() || !req.contains("op") || !req["op"].is_string()) {
    send(s, Json{{"re", re},
                 {"ok", false},
                 {"error", {{"code", "bad_request"}, {"message", "expected {\"op\": ...}"}}}});
    return;
  }
  const std::string opName = req["op"].get<std::string>();
  if ((opName == "say" || opName == "message") && !s.chatLimiter.allow(monotonicSeconds())) {
    send(s, Json{{"re", re},
                 {"ok", false},
                 {"error", {{"code", "chat_rate_limited"}, {"message", "you're talking too fast"}}}});
    return;
  }
  Json reply{{"re", re}};
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
  if (op == "hello")
    return Json{{"protocol", kProtocol}, {"world_time", formatDateTime(world_.now())}, {"rules", world_.publicRules()}};
  if (op == "register") {
    if (!config_.openRegistration) return fail("registration_closed", "registration is closed");
    const std::string user = str(req, "username");
    const std::string pass = str(req, "password");
    if (Status st = checkUsername(user); !st) return st.error();
    // Only the operator makes script accounts (--add-account), so a person is never labelled a script
    // and a script never passes as a person.
    if (isScriptAccount(user)) return fail("invalid_username", "names starting with bot_ are reserved for scripts");
    if (Status st = checkPassword(pass); !st) return st.error();
    if (Status st = store_->createAccount(user, hashPassword(pass, config_.passwordIterations)); !st) return st.error();
    logLine("account created: " + user);
    return Json{{"username", user}};
  }
  if (op == "login") {
    const std::string user = str(req, "username");
    // A name `register` refuses is never an account: the same answer as a wrong password, without a store lookup or a
    // throttle record, so made-up names (up to a line long) cost no memory.
    if (!checkUsername(user)) return fail("bad_credentials", "wrong username or password");
    const double now = monotonicSeconds();
    // Checked before the password, so a locked name costs no hashing and a right guess doesn't get in.
    if (loginThrottle_.locked(user, now))
      return fail("login_throttled", "too many wrong passwords for this account; try again in " +
                                         std::to_string(static_cast<int>(std::ceil(config_.loginLockSeconds / 60))) +
                                         " minutes");
    const auto cred = store_->credential(user);
    if (!cred || !verifyPassword(str(req, "password"), *cred)) {
      loginThrottle_.failed(user, now);
      return fail("bad_credentials", "wrong username or password");
    }
    loginThrottle_.succeeded(user);
    if (!s.username.empty()) return fail("already_logged_in", "already logged in");
    auto token = tokens_.issue(user, now);
    if (!token) return token.error();
    return beginSession(s, user, token.value());
  }
  if (op == "resume") {
    const std::string token = str(req, "token");
    const auto user = tokens_.resolve(token, monotonicSeconds());
    if (!user) return fail("bad_token", "that session has ended; log in with your password");
    if (!s.username.empty()) return fail("already_logged_in", "already logged in");
    // An automatic reconnect sends take_over:false: a phone that slept through `kicked` must not take the account
    // back from the device that logged in since. The same token is the same device's half-open old connection,
    // which is still replaced. Omitted (older clients) or true keeps "the newest login wins".
    const auto takeOver = req.find("take_over");
    if (takeOver != req.end() && takeOver->is_boolean() && !takeOver->get<bool>()) {
      for (const auto& [id, other] : sessions_) {
        if (id != s.id && other.username == *user && !other.closing && other.token != token)
          return fail("in_use_elsewhere", "this account is playing on another device");
      }
    }
    return beginSession(s, *user, token);
  }
  if (s.username.empty()) return fail("not_logged_in", "log in first");

  // --- Ops for logged-in accounts ---------------------------------------------------
  if (op == "characters") {
    const bool script = isScriptAccount(s.username);
    Json list = world_.playableCharacters();
    for (auto& c : list) {
      const std::string id = c["id"].get<std::string>();
      const auto owner = store_->claimedBy(id);
      const Session* other = playing(id, s);
      // A person may take a character a script is playing; a script only one nobody has or plays.
      c["available"] = script ? !owner && !other
                              : (!owner || *owner == s.username) && !(other && !isScriptAccount(other->username));
      c["scripted_now"] = world_.isScripted(id);
      if (world_.isScripted(id)) c["played_by"] = world_.playedBy(id);
    }
    // Your own created character, if you have one. Other players' creations aren't listed.
    const auto mine = store_->characterOf(s.username);
    if (mine && !world_.content().character(*mine)) {
      if (const CharacterDef* def = world_.definition(*mine)) {
        list.push_back(Json{{"id", def->id}, {"name", def->fullName()}, {"age", def->age}, {"pronouns", def->pronouns},
                            {"tagline", def->profile.value("tagline", "")}, {"created", true}, {"available", true}});
      }
    }
    return Json{{"characters", list}, {"can_create", !mine.has_value() && !script}};
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
  if (op == "dev_condition") {
    if (!config_.devCommands) return fail("forbidden", "dev commands are disabled on this server");
    if (Status st = world_.devAddCondition(str(req, "character"), str(req, "condition")); !st) return st.error();
    return Json{{"ok", true}};
  }
  if (op == "create_character") {
    // Making a character claims it, and scripts never claim.
    if (isScriptAccount(s.username)) return fail("forbidden", "script accounts can't create characters");
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
  if (op == "play") return play(s, req);
  if (op == "logout") {
    // Leaves the world and ends the account session; the connection stays open.
    leaveWorld(s);
    tokens_.revoke(s.token);
    s.token.clear();
    s.username.clear();
    return Json{{"logged_out", true}};
  }
  if (s.character.empty()) return fail("not_playing", "choose a character first");

  // --- In-world ops: all validated by World -----------------------------------------
  const CharacterId& me = s.character;
  // m08:wallet ops { Coins, phones and LivPay (Wallet.cpp)
  // Buying coins verifies a store receipt with the server's payment config, so it answers here; every other
  // in-world op is routed by the dispatch the single-player build shares (src/protocol/WorldOps.cpp).
  if (op == "buy_coins") {
    const std::string product = str(req, "product");
    const std::string receipt = str(req, "receipt");
    auto verified = verifyCoinReceipt(config_, receipt);
    if (!verified) return verified.error();
    auto credited = world_.creditCoins(me, product, receipt, verified.value());
    if (credited) logLine(s.username + " bought " + product + (verified.value() ? " (test purchase)" : ""));
    return credited;
  }
  // } m08:wallet
  return protocol::dispatchWorldOp(world_, me, op, req);
}

void Server::routeEvents() {
  const auto events = world_.drainEvents();
  autopilot_.observe(events);  // asks addressed to its characters, which it declines
  for (const auto& ev : events) {
    for (const auto& who : ev.recipients) {
      for (auto& [id, s] : sessions_) {
        if (s.character == who) send(s, Json{{"event", ev.type}, {"data", ev.data}});
      }
    }
  }
}

Json Server::beginSession(Session& s, const std::string& username, const std::string& token) {
  // A second login for the same account replaces the first connection.
  for (auto& [id, other] : sessions_) {
    if (id != s.id && other.username == username && !other.closing) {
      send(other, Json{{"event", "kicked"}, {"data", {{"reason", "logged in elsewhere"}}}});
      closeSession(other, "replaced by new login");
    }
  }
  s.username = username;
  s.token = token;
  const auto character = store_->characterOf(username);
  return Json{{"username", username}, {"character", character ? Json(*character) : Json()}, {"token", token}};
}

Result<Json> Server::play(Session& s, const Json& req) {
  if (!s.character.empty()) return fail("already_playing", "already in the world");
  const bool script = isScriptAccount(s.username);
  std::string id = str(req, "character");
  if (id.empty() && !script) id = store_->characterOf(s.username).value_or("");
  const CharacterDef* def = world_.definition(id);
  if (!def || !def->playable) return fail("unknown_character", "that character can't be played");
  Session* current = playing(id, s);
  if (script) {
    // Scripts borrow characters nobody has: no claim is written, and any claim or player stops them.
    if (store_->claimedBy(id)) return fail("character_claimed", "a player has claimed that character");
    if (current || autopilot_.runs(id)) return fail("character_in_use", "someone is playing that character right now");
    if (inWorld(true) >= config_.maxScripted) return fail("server_full", "the server is full");
  } else {
    if (current && !isScriptAccount(current->username)) {
      const auto owner = store_->claimedBy(id);
      if (owner && *owner != s.username) return fail("character_taken", "someone else is playing that character");
      // The operator released the claim, but the player in the world keeps the character until they leave.
      return fail("character_in_use", "someone is playing that character right now");
    }
    if (inWorld(false) >= config_.maxPlayers) return fail("server_full", "the server is full");
    if (Status st = store_->claimCharacter(s.username, id); !st) return st.error();
    if (current) {
      // People always win over scripts. The script steps out (its connection and login stay open).
      send(*current,
           Json{{"event", "released"}, {"data", {{"character", id}, {"reason", "a player took this character"}}}});
      logLine(current->username + " released " + id + " to " + s.username);
      leaveWorld(*current);
    }
    if (autopilot_.runs(id)) {
      // People always win over the autopilot too: it drops the character where they stand, still in the world.
      autopilot_.release(world_, id);
      logLine("autopilot released " + id + " to " + s.username);
    }
  }
  if (Status st = world_.connect(id); !st) return st.error();
  world_.setScripted(id, script);
  s.character = id;
  logLine(s.username + " entered the world as " + id + (script ? " (script)" : ""));
  return world_.look(id);
}

void Server::leaveWorld(Session& s) {
  if (s.character.empty()) return;
  world_.disconnect(s.character);
  world_.setScripted(s.character, false);
  logLine(s.username + " left the world (" + s.character + ")");
  // A founder nobody has claimed (a script's, or one the operator released) goes back on autopilot.
  if (config_.autopilot && !stopping_ && world_.content().character(s.character) && !store_->claimedBy(s.character))
    autopilot_.start(world_, {s.character});
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

std::size_t Server::inWorld(bool scripts) const {
  std::size_t n = 0;
  for (const auto& [id, s] : sessions_) {
    if (!s.character.empty() && !s.closing && isScriptAccount(s.username) == scripts) ++n;
  }
  return n;
}

Server::Session* Server::playing(const CharacterId& id, const Session& except) {
  for (auto& [sid, other] : sessions_) {
    if (sid != except.id && !other.closing && other.character == id) return &other;
  }
  return nullptr;
}

}  // namespace livera
