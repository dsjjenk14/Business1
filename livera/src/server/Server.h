#pragma once

#include <atomic>
#include <chrono>
#include <cstdint>
#include <map>
#include <memory>
#include <optional>
#include <string>

#include "core/World.h"
#include "net/Socket.h"
#include "persistence/SqliteStore.h"
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
  int passwordIterations = kDefaultPasswordIterations;
  std::size_t maxPlayers = 8;
  double requestsPerSecond = 20;
  double requestBurst = 40;
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
    net::LineBuffer in;
    std::string out;
    std::string username;
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
  void routeEvents();
  void send(Session& s, const Json& message);
  void leaveWorld(Session& s);
  void closeSession(Session& s, const std::string& reason);
  double monotonicSeconds() const;
  std::size_t playersInWorld() const;

  ServerConfig config_;
  std::unique_ptr<SqliteStore> store_;
  World world_;
  net::Fd listener_;
  std::uint16_t port_ = 0;
  std::map<int, Session> sessions_;
  int nextSessionId_ = 1;
  std::chrono::steady_clock::time_point started_;
};

}  // namespace livera
