#include "server/Server.h"

#include <poll.h>
#include <sys/socket.h>
#include <unistd.h>

#include <cerrno>
#include <cmath>
#include <cstdio>
#include <vector>

#include "core/Clock.h"

namespace livera {

namespace {

constexpr const char* kProtocol = "livera/1";
constexpr std::size_t kMaxOutboxBytes = 1 << 20;
constexpr int kMaxViolations = 50;
constexpr GameMinutes kMaxDevAdvance = 60 * kMinutesPerDay;

void logLine(const std::string& msg) { std::fprintf(stderr, "[livera] %s\n", msg.c_str()); }

std::string str(const Json& req, const char* key) {
  auto it = req.find(key);
  return it != req.end() && it->is_string() ? it->get<std::string>() : std::string();
}

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
  if (op == "use") return world_.useItem(me, str(req, "item"));
  if (op == "wear") return world_.wear(me, str(req, "item"));
  if (op == "take_off") return world_.takeOff(me, str(req, "slot"));
  if (op == "give") return world_.giveItem(me, str(req, "to"), str(req, "item"));
  if (op == "ride")  // pay_with: card, cash or phone (LivPay)
    return world_.ride(me, str(req, "to"), req.value("pay", true), req.value("pay_with", std::string("card")));
  if (op == "enroll") return world_.enroll(me, str(req, "program"));
  if (op == "study") {
    const std::string action = str(req, "action");
    if (action == "start") {
      if (Status st = world_.startStudy(me); !st) return st.error();
      return Json{{"studying", true}};
    }
    if (action == "end") return world_.endStudy(me);
    return fail("bad_request", "action must be start or end");
  }
  if (op == "apply") return world_.applyForJob(me, str(req, "career"));
  if (op == "steal") return world_.steal(me, str(req, "offer"));
  if (op == "pickpocket") return world_.pickpocket(me, str(req, "target"));
  if (op == "arrest") return world_.arrest(me, str(req, "target"));
  if (op == "request")
    return world_.request(me, str(req, "kind"), str(req, "target"), req.value("protection", false),
                          str(req, "subject"));
  if (op == "respond") return world_.respond(me, str(req, "request"), req.value("accept", false));
  if (op == "end_relationship") return world_.endRelationship(me, str(req, "target"));
  if (op == "name_baby") return world_.nameBaby(me, str(req, "child"), str(req, "name"));
  if (op == "care") return world_.careFor(me, str(req, "child"), str(req, "action"));
  if (op == "enroll_child") return world_.enrollChild(me, str(req, "child"), str(req, "where"));
  if (op == "hire_nanny") return world_.hireNanny(me, str(req, "target"));
  if (op == "dismiss_nanny") return world_.dismissNanny(me);
  // m08:homes ops { Buying homes, mortgages, moving in together (Homes.cpp)
  // Buying together, moving in together and selling a co-owned home are asks: request kind=buy_home|move_in|sell_home.
  if (op == "buy_home") return world_.buyHome(me, str(req, "property"), req.value("down_payment_cents", Cents{0}));
  if (op == "move_out") return world_.moveOut(me);
  if (op == "move_home") return world_.moveHome(me, str(req, "property"));
  if (op == "sell_home") return world_.sellHome(me, str(req, "property"));
  // } m08:homes

  // m08:work ops { Work decisions during shifts (WorkTasks.cpp)
  if (op == "work_tasks") return world_.workTasks(me);
  if (op == "work_answer") {
    // `option` is the option's index in the order work_tasks sent; anything else is no option.
    const auto it = req.find("option");
    if (it == req.end() || !it->is_number_integer())
      return fail("bad_request", "send the option's number as \"option\"");
    const auto n = it->get<std::int64_t>();
    return world_.answerWorkTask(me, str(req, "task"), n < 0 || n > 64 ? -1 : static_cast<int>(n));
  }
  // } m08:work

  // m08:wallet ops { Coins, phones and LivPay (Wallet.cpp)
  if (op == "buy_coins") {
    const std::string product = str(req, "product");
    const std::string receipt = str(req, "receipt");
    auto verified = verifyCoinReceipt(config_, receipt);
    if (!verified) return verified.error();
    auto credited = world_.creditCoins(me, product, receipt, verified.value());
    if (credited) logLine(s.username + " bought " + product + (verified.value() ? " (test purchase)" : ""));
    return credited;
  }
  if (op == "buy_with_coins") return world_.buyWithCoins(me, str(req, "item"));
  if (op == "switch_phone") return world_.switchPhone(me, str(req, "item"));
  if (op == "livpay_send") return world_.livpaySend(me, str(req, "to"), req.at("cents").get<Cents>(), str(req, "note"));
  // } m08:wallet

  // m08:leisure ops { Sports, date spots and the lake park (Leisure.cpp)
  if (op == "join_team") return world_.joinTeam(me, str(req, "team"));
  if (op == "leave_team") return world_.leaveTeam(me, str(req, "team"));
  // } m08:leisure

  // m08:pets ops { Pets and medicine (Pets.cpp)
  if (op == "adopt") return world_.adoptPet(me, str(req, "pet"), str(req, "name"), req.value("method", std::string("card")));
  if (op == "pet") return world_.careForPet(me, str(req, "pet"), str(req, "action"));
  if (op == "vet") return world_.vetVisit(me, str(req, "pet"), str(req, "service"), req.value("method", std::string("card")));
  // } m08:pets

  // m08:details ops { Accidents as a big deal, laundry, weather, birthdays, hangovers (Details.cpp)
  if (op == "laundry") return world_.doLaundry(me);
  // } m08:details
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
    if (current) return fail("character_in_use", "someone is playing that character right now");
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
