// livera_server: the dedicated authoritative server.
//
//   livera_server --data ./data --db ./livera_world.db [--port 7777] [--bind 127.0.0.1]
//                 [--autosave 30] [--max-players 16] [--max-scripted 32] [--dev] [--closed-registration]
//                 [--test-payments] [--autopilot] [--night-skip] [--pause-when-empty]
//
// Admin commands (run and exit; safe while a server is running on the same database):
//   livera_server --db FILE --add-account USER        (password: first line of stdin)
//   livera_server --db FILE --release-character ID

#include <csignal>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <iostream>
#include <string>

#include "server/Auth.h"
#include "server/Server.h"

namespace {

std::atomic<bool> gStop{false};

void onSignal(int) { gStop.store(true); }

void usage() {
  std::fprintf(stderr,
               "usage: livera_server --data DIR [--db FILE] [--port N] [--bind ADDR] [--autosave SECONDS]\n"
               "                     [--max-players N] [--max-scripted N] [--dev] [--closed-registration]\n"
               "                     [--test-payments] [--autopilot] [--night-skip] [--pause-when-empty]\n"
               "       livera_server --db FILE --add-account USER    (reads the password from stdin)\n"
               "       livera_server --db FILE --release-character ID\n"
               "  --dev  enables dev_advance (time skip). Never use on a public server.\n"
               "  --test-payments  accepts test coin purchases (receipts \"test-...\"; nothing is charged).\n"
               "  --autopilot  founders no account has claimed live their day on the core's autopilot, labelled.\n"
               "  --night-skip  when everyone playing is asleep (the sleep op), the night is skipped to the morning.\n"
               "  --pause-when-empty  the clock stops while nobody (no person; scripts don't count) is in the world.\n"
               "  --max-players  people in the world at once (default 16); --max-scripted  scripts (default 32).\n"
               "  --add-account  makes an account (bot_ names are script accounts for the town director).\n"
               "  --release-character  frees a character from the account that claimed it.\n");
}

int refuse(const livera::Error& e) {
  std::fprintf(stderr, "livera_server: %s (%s)\n", e.message.c_str(), e.code.c_str());
  return 1;
}

// Releasing needs an existing world. Accounts may come first (a fresh install makes the owner's
// account before the server's first start, which then founds the world around it), but say so,
// because a mistyped path would otherwise quietly make a stray database.
livera::Result<std::unique_ptr<livera::SqliteStore>> openStore(const std::string& db, bool mayCreate) {
  if (db.empty()) return livera::fail("bad_request", "admin commands need --db FILE");
  if (!std::filesystem::exists(db)) {
    if (!mayCreate) return livera::fail("no_database", "no database at " + db);
    std::fprintf(stderr,
                 "livera_server: note: %s did not exist; created it (the server founds the world on first start)\n",
                 db.c_str());
  }
  return livera::SqliteStore::open(db);
}

int addAccount(const std::string& db, const std::string& user) {
  std::string pass;
  std::getline(std::cin, pass);
  if (!pass.empty() && pass.back() == '\r') pass.pop_back();
  if (livera::Status st = livera::checkUsername(user); !st) return refuse(st.error());
  if (livera::Status st = livera::checkPassword(pass); !st) return refuse(st.error());
  auto store = openStore(db, /*mayCreate=*/true);
  if (!store) return refuse(store.error());
  if (livera::Status st = store.value()->createAccount(user, livera::hashPassword(pass)); !st)
    return refuse(st.error());
  std::printf("account created: %s\n", user.c_str());
  return 0;
}

int releaseCharacter(const std::string& db, const std::string& id) {
  auto store = openStore(db, /*mayCreate=*/false);
  if (!store) return refuse(store.error());
  auto released = store.value()->releaseCharacter(id);
  if (!released) return refuse(released.error());
  if (released.value())
    std::printf("released %s from account %s (anyone may claim it now; whoever is playing it keeps it until "
                "they leave)\n",
                id.c_str(), released.value()->c_str());
  else
    std::printf("%s was not claimed by any account; nothing changed\n", id.c_str());
  return 0;
}

}  // namespace

int main(int argc, char** argv) {
  livera::ServerConfig cfg;
  std::string addAccountUser, releaseId;
  bool dbGiven = false;
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
    else if (a == "--db") {
      cfg.dbPath = next();
      dbGiven = true;
    } else if (a == "--port") cfg.port = static_cast<std::uint16_t>(std::stoi(next()));
    else if (a == "--bind") cfg.bindAddress = next();
    else if (a == "--autosave") cfg.autosaveSeconds = std::stod(next());
    else if (a == "--max-players") cfg.maxPlayers = static_cast<std::size_t>(std::stoul(next()));
    else if (a == "--max-scripted") cfg.maxScripted = static_cast<std::size_t>(std::stoul(next()));
    else if (a == "--dev") cfg.devCommands = true;
    else if (a == "--closed-registration") cfg.openRegistration = false;
    else if (a == "--test-payments") cfg.testPayments = true;
    else if (a == "--autopilot") cfg.autopilot = true;
    else if (a == "--night-skip") cfg.nightSkip = true;
    else if (a == "--pause-when-empty") cfg.pauseWhenEmpty = true;
    else if (a == "--add-account") addAccountUser = next();
    else if (a == "--release-character") releaseId = next();
    else {
      usage();
      return 2;
    }
  }
  if (!addAccountUser.empty() && !releaseId.empty()) {
    usage();
    return 2;
  }
  if (!addAccountUser.empty()) return addAccount(dbGiven ? cfg.dbPath : "", addAccountUser);
  if (!releaseId.empty()) return releaseCharacter(dbGiven ? cfg.dbPath : "", releaseId);
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
