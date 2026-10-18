#pragma once

#include <memory>
#include <optional>
#include <string>

#include "core/World.h"
#include "persistence/PasswordHash.h"

struct sqlite3;

namespace livera {

// SQLite-backed persistence for one world shard. Saves are snapshot-consistent: every
// save is one SQL transaction, so a crash leaves the previous complete save intact.
// See docs/DECISIONS.md (D-005) and docs/DATA_MODEL.md ("Save format").
class SqliteStore {
 public:
  static Result<std::unique_ptr<SqliteStore>> open(const std::string& path);
  ~SqliteStore();
  SqliteStore(const SqliteStore&) = delete;
  SqliteStore& operator=(const SqliteStore&) = delete;

  int schemaVersion() const;

  // --- World ---------------------------------------------------------------------
  bool hasWorld() const;
  Result<WorldState> loadWorld();
  Status saveWorld(const WorldState& state);

  // --- Accounts (identity, not game state) ----------------------------------------
  Status createAccount(const std::string& username, const PasswordRecord& password);
  std::optional<PasswordRecord> credential(const std::string& username) const;
  // One account plays one character, and one character belongs to one account.
  Status claimCharacter(const std::string& username, const CharacterId& character);
  std::optional<CharacterId> characterOf(const std::string& username) const;
  std::optional<std::string> claimedBy(const CharacterId& character) const;
  // Frees a character for anyone to claim again (the --release-character admin command, which may run
  // while the server is up). Returns the account that held it, or nothing if nobody did.
  Result<std::optional<std::string>> releaseCharacter(const CharacterId& character);

 private:
  explicit SqliteStore(sqlite3* db) : db_(db) {}
  Status migrate();
  Status exec(const char* sql);

  sqlite3* db_;
  // Ledger transactions and memories are append-only; only rows past these marks are written.
  std::size_t persistedTransactions_ = 0;
  std::size_t persistedMemories_ = 0;
};

}  // namespace livera
