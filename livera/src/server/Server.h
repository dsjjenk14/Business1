#pragma once

#include <atomic>
#include <chrono>
#include <cstdint>
#include <map>
#include <memory>
#include <optional>
#include <string>

#include "core/Autopilot.h"
#include "core/World.h"
#include "net/Socket.h"
#include "persistence/SqliteStore.h"
#include "server/Auth.h"
#include "server/RateLimiter.h"

namespace livera {

struct ServerConfig {
  std::string bindAddress = "127.0.0.1";
  std::uint16_t port = 7777;          // 0 = pick a free port (tests)
  std::string dataDir;                // content directory (data/)
  std::shared_ptr<const ContentDatabase> content;  // if set, used instead of loading dataDir (tests)
  std::string dbPath = "livera_world.db";
  double tickHz = 10;
  double autosaveSeconds = 30;
  bool openRegistration = true;       // dev servers let anyone create an account
  bool devCommands = false;           // enables dev_advance (time skip); never on in production
  // Founders no account has claimed live their day on the core's Autopilot (D-053). They aren't sessions
  // and count toward neither cap; a person's `play` takes one over at once.
  bool autopilot = false;
  // The bed rule (--night-skip): when at least one person is playing and everyone playing is asleep, the night is
  // skipped to the wake hour (World::skipNight). Off by default: a town shared with strangers shouldn't let a few
  // people skip time for everyone.
  bool nightSkip = false;
  // --pause-when-empty: the clock (and the autopilot) only runs while at least one person is in the world, so a
  // town friends visit now and then doesn't live sixty game days a real day without them. Off by default.
  bool pauseWhenEmpty = false;
  // m08:wallet config { Coins, phones and LivPay (Wallet.cpp)
  // Accept test coin purchases (receipts "test-..."; no money is charged). Dev servers always do.
  // Real store billing isn't connected, so without this every coin purchase is refused.
  bool testPayments = false;
  // } m08:wallet
  int passwordIterations = kDefaultPasswordIterations;
  std::size_t maxPlayers = 16;    // people in the world; scripts don't count against it
  std::size_t maxScripted = 16;   // script sessions (bot_* accounts) in the world
  double requestsPerSecond = 20;
  double requestBurst = 40;
  double tokenLifetimeSeconds = 7 * 24 * 3600.0;  // resume tokens (in memory only)
  std::size_t tokensPerUser = 5;
  int loginMaxFailures = 5;           // wrong passwords for one username within the window...
  double loginWindowSeconds = 600;
  double loginLockSeconds = 600;      // ...lock that username's logins this long
};

// The dedicated, authoritative server. Single-threaded by design: one loop owns the
// World, the store and every socket, so no game state is ever touched concurrently.
// See docs/MULTIPLAYER.md.
class Server {
 public:
  static Result<std::unique_ptr<Server>> create(ServerConfig config);
  ~Server();

  std::uint16_t port() const { return port_; }
  // Runs until `stop` becomes true, then settles every session and saves.
  void run(const std::atomic<bool>& stop);
  Status save();

 private:
  struct Session {
    int id = 0;
    net::Fd fd;
    net::LineBuffer in{net::kMaxLineBytes};  // a client's request lines: small
    std::string out;
    std::string username;
    std::string token;  // the resume token this session logged in with; logout revokes it
    CharacterId character;
    RateLimiter limiter{20, 40};
    RateLimiter chatLimiter{1, 5};  // speech and texts: a line a second, bursts of five
    int violations = 0;
    bool closing = false;
  };

  Server(ServerConfig config, std::unique_ptr<SqliteStore> store, World world, net::Fd listener);

  void acceptClients();
  void readFrom(Session& s);
  void writeTo(Session& s);
  void handleLine(Session& s, const std::string& line);
  Result<Json> dispatch(Session& s, const std::string& op, const Json& req);
  void tick(double realSeconds);
  void skipNightIfAllAsleep();
  int peopleAwake() const;  // people playing (not scripts) who aren't asleep; -1 when nobody is playing
  void routeEvents();
  void send(Session& s, const Json& message);
  // Logs a session in as `username` (password or token checked by the caller); another session for
  // the same account is kicked.
  Json beginSession(Session& s, const std::string& username, const std::string& token);
  Result<Json> play(Session& s, const Json& req);
  void leaveWorld(Session& s);
  void closeSession(Session& s, const std::string& reason);
  double monotonicSeconds() const;
  std::size_t inWorld(bool scripts) const;  // sessions in the world: scripts, or people
  Session* playing(const CharacterId& id, const Session& except);

  ServerConfig config_;
  std::unique_ptr<SqliteStore> store_;
  World world_;
  Autopilot autopilot_;
  bool stopping_ = false;  // shutting down: characters leaving the world don't go back on autopilot
  net::Fd listener_;
  std::uint16_t port_ = 0;
  std::map<int, Session> sessions_;
  int nextSessionId_ = 1;
  double acceptPausedUntil_ = -1;  // monotonic seconds; set while out of file descriptors (acceptClients)
  SessionTokens tokens_;
  LoginThrottle loginThrottle_;
  std::chrono::steady_clock::time_point started_;
};

}  // namespace livera
