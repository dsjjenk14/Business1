// livera_server: the dedicated authoritative server.
//
//   livera_server --data ./data --db ./livera_world.db [--port 7777] [--bind 127.0.0.1]
//                 [--autosave 30] [--max-players 8] [--dev] [--closed-registration]

#include <csignal>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>

#include "server/Server.h"

namespace {

std::atomic<bool> gStop{false};

void onSignal(int) { gStop.store(true); }

void usage() {
  std::fprintf(stderr,
               "usage: livera_server --data DIR [--db FILE] [--port N] [--bind ADDR] [--autosave SECONDS]\n"
               "                     [--max-players N] [--dev] [--closed-registration]\n"
               "  --dev  enables dev_advance (time skip). Never use on a public server.\n");
}

}  // namespace

int main(int argc, char** argv) {
  livera::ServerConfig cfg;
  for (int i = 1; i < argc; ++i) {
    const std::string a = argv[i];
    auto next = [&]() -> std::string {
      if (i + 1 >= argc) {
        usage();
        std::exit(2);
      }
      return argv[++i];
    };
    if (a == "--data") cfg.dataDir = next();
    else if (a == "--db") cfg.dbPath = next();
    else if (a == "--port") cfg.port = static_cast<std::uint16_t>(std::stoi(next()));
    else if (a == "--bind") cfg.bindAddress = next();
    else if (a == "--autosave") cfg.autosaveSeconds = std::stod(next());
    else if (a == "--max-players") cfg.maxPlayers = static_cast<std::size_t>(std::stoul(next()));
    else if (a == "--dev") cfg.devCommands = true;
    else if (a == "--closed-registration") cfg.openRegistration = false;
    else {
      usage();
      return 2;
    }
  }
  if (cfg.dataDir.empty()) {
    usage();
    return 2;
  }

  std::signal(SIGINT, onSignal);
  std::signal(SIGTERM, onSignal);

  auto server = livera::Server::create(cfg);
  if (!server) {
    std::fprintf(stderr, "livera_server: %s (%s)\n", server.error().message.c_str(), server.error().code.c_str());
    return 1;
  }
  server.value()->run(gStop);
  return 0;
}
