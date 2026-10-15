#include "persistence/SqliteStore.h"

#include <sqlite3.h>

#include <map>
#include <string>
#include <vector>

#include "core/Serialization.h"

namespace livera {

namespace {

// Each entry migrates the schema from version i to i+1. Never edit a shipped entry;
// append a new one. PRAGMA user_version records how many have been applied.
const std::vector<const char*> kMigrations = {
    R"sql(
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE accounts (
      username TEXT PRIMARY KEY,
      salt_hex TEXT NOT NULL,
      hash_hex TEXT NOT NULL,
      iterations INTEGER NOT NULL,
      character_id TEXT UNIQUE
    );
    CREATE TABLE characters (id TEXT PRIMARY KEY, state TEXT NOT NULL);
    CREATE TABLE relationships (
      from_id TEXT NOT NULL, to_id TEXT NOT NULL, state TEXT NOT NULL,
      PRIMARY KEY (from_id, to_id)
    );
    CREATE TABLE memories (seq INTEGER PRIMARY KEY, id TEXT UNIQUE NOT NULL, owner_id TEXT NOT NULL, body TEXT NOT NULL);
    CREATE INDEX memories_owner ON memories(owner_id);
    CREATE TABLE ledger_accounts (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, kind TEXT NOT NULL,
      balance_cents INTEGER NOT NULL, allow_negative INTEGER NOT NULL
    );
    CREATE TABLE ledger_transactions (
      seq INTEGER PRIMARY KEY, id TEXT UNIQUE NOT NULL, at INTEGER NOT NULL,
      from_account TEXT NOT NULL, to_account TEXT NOT NULL, amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      kind TEXT NOT NULL, memo TEXT NOT NULL
    );
    CREATE TABLE messages (
      seq INTEGER PRIMARY KEY, id TEXT UNIQUE NOT NULL, from_id TEXT NOT NULL, to_id TEXT NOT NULL,
      at INTEGER NOT NULL, body TEXT NOT NULL, read INTEGER NOT NULL
    );
    CREATE TABLE notifications (
      seq INTEGER PRIMARY KEY, id TEXT UNIQUE NOT NULL, recipient TEXT NOT NULL, at INTEGER NOT NULL,
      kind TEXT NOT NULL, text TEXT NOT NULL, read INTEGER NOT NULL
    );
    CREATE TABLE properties (id TEXT PRIMARY KEY, owner_account TEXT NOT NULL, tenant_id TEXT NOT NULL);
    CREATE TABLE construction (
      id TEXT PRIMARY KEY, status TEXT NOT NULL, worker_hours_done REAL NOT NULL, completed_at INTEGER NOT NULL
    );
    CREATE TABLE city_stats (key TEXT PRIMARY KEY, value REAL NOT NULL);
    )sql",
    // v2: character creator and music.
    R"sql(
    CREATE TABLE created_characters (id TEXT PRIMARY KEY, def TEXT NOT NULL);
    CREATE TABLE songs (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, body TEXT NOT NULL);
    CREATE INDEX songs_owner ON songs(owner_id);
    )sql",
    // v3: everyday life (home upkeep per property; the world's random stream lives in meta).
    R"sql(
    ALTER TABLE properties ADD COLUMN upkeep TEXT NOT NULL DEFAULT '{}';
    )sql",
};

class Stmt {
 public:
  Stmt(sqlite3* db, const char* sql) : db_(db) {
    if (sqlite3_prepare_v2(db, sql, -1, &stmt_, nullptr) != SQLITE_OK) stmt_ = nullptr;
  }
  ~Stmt() { sqlite3_finalize(stmt_); }
  Stmt(const Stmt&) = delete;
  Stmt& operator=(const Stmt&) = delete;

  bool valid() const { return stmt_ != nullptr; }
  Stmt& bind(int i, const std::string& v) {
    sqlite3_bind_text(stmt_, i, v.c_str(), static_cast<int>(v.size()), SQLITE_TRANSIENT);
    return *this;
  }
  Stmt& bind(int i, std::int64_t v) {
    sqlite3_bind_int64(stmt_, i, v);
    return *this;
  }
  Stmt& bind(int i, int v) { return bind(i, static_cast<std::int64_t>(v)); }
  Stmt& bind(int i, bool v) { return bind(i, static_cast<std::int64_t>(v ? 1 : 0)); }
  Stmt& bind(int i, double v) {
    sqlite3_bind_double(stmt_, i, v);
    return *this;
  }
  Stmt& bindNull(int i) {
    sqlite3_bind_null(stmt_, i);
    return *this;
  }
  // Returns SQLITE_ROW, SQLITE_DONE or an error code.
  int step() { return stmt_ ? sqlite3_step(stmt_) : SQLITE_ERROR; }
  bool run() {
    const int rc = step();
    sqlite3_reset(stmt_);
    sqlite3_clear_bindings(stmt_);
    return rc == SQLITE_DONE;
  }
  std::string text(int col) const {
    const auto* p = sqlite3_column_text(stmt_, col);
    return p ? reinterpret_cast<const char*>(p) : "";
  }
  std::int64_t int64(int col) const { return sqlite3_column_int64(stmt_, col); }
  double real(int col) const { return sqlite3_column_double(stmt_, col); }
  bool isNull(int col) const { return sqlite3_column_type(stmt_, col) == SQLITE_NULL; }
  std::string error() const { return sqlite3_errmsg(db_); }

 private:
  sqlite3* db_;
  sqlite3_stmt* stmt_ = nullptr;
};

Error dbError(sqlite3* db, const std::string& what) { return fail("storage_error", what + ": " + sqlite3_errmsg(db)); }

}  // namespace

Result<std::unique_ptr<SqliteStore>> SqliteStore::open(const std::string& path) {
  sqlite3* db = nullptr;
  if (sqlite3_open_v2(path.c_str(), &db, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX, nullptr) !=
      SQLITE_OK) {
    std::string msg = db ? sqlite3_errmsg(db) : "out of memory";
    sqlite3_close(db);
    return fail("storage_error", "cannot open " + path + ": " + msg);
  }
  std::unique_ptr<SqliteStore> store(new SqliteStore(db));
  if (Status s = store->exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;"); !s)
    return s.error();
  if (Status s = store->migrate(); !s) return s.error();
  return store;
}

SqliteStore::~SqliteStore() { sqlite3_close(db_); }

Status SqliteStore::exec(const char* sql) {
  char* err = nullptr;
  if (sqlite3_exec(db_, sql, nullptr, nullptr, &err) != SQLITE_OK) {
    std::string msg = err ? err : "unknown";
    sqlite3_free(err);
    return fail("storage_error", msg);
  }
  return okStatus();
}

int SqliteStore::schemaVersion() const {
  Stmt q(db_, "PRAGMA user_version");
  return q.step() == SQLITE_ROW ? static_cast<int>(q.int64(0)) : -1;
}

Status SqliteStore::migrate() {
  const int current = schemaVersion();
  if (current > static_cast<int>(kMigrations.size()))
    return fail("storage_version", "save was written by a newer server (schema " + std::to_string(current) + ")");
  for (int v = current; v < static_cast<int>(kMigrations.size()); ++v) {
    if (Status s = exec("BEGIN IMMEDIATE"); !s) return s;
    Status applied = exec(kMigrations[static_cast<std::size_t>(v)]);
    if (applied) applied = exec(("PRAGMA user_version = " + std::to_string(v + 1)).c_str());
    if (!applied) {
      (void)exec("ROLLBACK");
      return applied;
    }
    if (Status s = exec("COMMIT"); !s) return s;
  }
  return okStatus();
}

bool SqliteStore::hasWorld() const {
  Stmt q(db_, "SELECT 1 FROM meta WHERE key = 'now'");
  return q.step() == SQLITE_ROW;
}

Status SqliteStore::saveWorld(const WorldState& s) {
  // Refuse to persist a ledger that does not balance: that is a bug, and saving it would
  // make the corruption permanent.
  if (s.ledger.sumOfBalances() != 0) return fail("ledger_unbalanced", "ledger does not balance; save refused");
  if (s.ledger.transactions().size() < persistedTransactions_ || s.memories.size() < persistedMemories_)
    return fail("storage_error", "append-only history shrank; refusing to save over it");

  if (Status b = exec("BEGIN IMMEDIATE"); !b) return b;
  auto rollback = [&](const std::string& what) {
    Error e = dbError(db_, what);
    (void)exec("ROLLBACK");
    return e;
  };

  {
    Stmt up(db_, "INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)");
    const std::pair<const char*, std::string> rows[] = {
        {"now", std::to_string(s.now)},
        {"clock_carry", std::to_string(s.clockCarry)},
        {"next_id", std::to_string(s.nextId)},
        {"next_tx", std::to_string(s.ledger.nextTxNumber())},
        {"city_stage", std::to_string(s.city.stage)},
        {"rng", std::to_string(s.rng)}};
    for (const auto& [k, v] : rows) {
      if (!up.bind(1, std::string(k)).bind(2, v).run()) return rollback("save meta");
    }
  }
  {
    if (!exec("DELETE FROM characters")) return rollback("clear characters");
    Stmt ins(db_, "INSERT INTO characters(id, state) VALUES (?, ?)");
    for (const auto& [id, c] : s.characters) {
      if (!ins.bind(1, id).bind(2, toJson(c).dump()).run()) return rollback("save character");
    }
  }
  {
    if (!exec("DELETE FROM relationships")) return rollback("clear relationships");
    Stmt ins(db_, "INSERT INTO relationships(from_id, to_id, state) VALUES (?, ?, ?)");
    for (const auto& [key, r] : s.relationships) {
      if (!ins.bind(1, key.first).bind(2, key.second).bind(3, toJson(r).dump()).run())
        return rollback("save relationship");
    }
  }
  {
    Stmt ins(db_, "INSERT INTO memories(id, owner_id, body) VALUES (?, ?, ?)");
    for (std::size_t i = persistedMemories_; i < s.memories.size(); ++i) {
      const Memory& m = s.memories[i];
      if (!ins.bind(1, m.id).bind(2, m.owner).bind(3, toJson(m).dump()).run()) return rollback("save memory");
    }
  }
  {
    Stmt ins(db_,
             "INSERT OR REPLACE INTO ledger_accounts(id, owner_id, kind, balance_cents, allow_negative) VALUES (?,?,?,?,?)");
    for (const auto& [id, a] : s.ledger.accounts()) {
      if (!ins.bind(1, id).bind(2, a.ownerId).bind(3, a.kind).bind(4, a.balanceCents).bind(5, a.allowNegative).run())
        return rollback("save ledger account");
    }
    Stmt tx(db_,
            "INSERT INTO ledger_transactions(id, at, from_account, to_account, amount_cents, kind, memo) "
            "VALUES (?,?,?,?,?,?,?)");
    const auto& txs = s.ledger.transactions();
    for (std::size_t i = persistedTransactions_; i < txs.size(); ++i) {
      const LedgerTransaction& t = txs[i];
      if (!tx.bind(1, t.id).bind(2, t.at).bind(3, t.from).bind(4, t.to).bind(5, t.amountCents).bind(6, t.kind)
               .bind(7, t.memo).run())
        return rollback("save ledger transaction");
    }
  }
  {
    Stmt ins(db_,
             "INSERT INTO messages(id, from_id, to_id, at, body, read) VALUES (?,?,?,?,?,?) "
             "ON CONFLICT(id) DO UPDATE SET read = excluded.read");
    for (const auto& m : s.messages) {
      if (!ins.bind(1, m.id).bind(2, m.from).bind(3, m.to).bind(4, m.at).bind(5, m.body).bind(6, m.read).run())
        return rollback("save message");
    }
  }
  {
    // Notifications are pruned in memory, so the table mirrors the current set.
    if (!exec("DELETE FROM notifications")) return rollback("clear notifications");
    Stmt ins(db_, "INSERT INTO notifications(id, recipient, at, kind, text, read) VALUES (?,?,?,?,?,?)");
    for (const auto& n : s.notifications) {
      if (!ins.bind(1, n.id).bind(2, n.recipient).bind(3, n.at).bind(4, n.kind).bind(5, n.text).bind(6, n.read).run())
        return rollback("save notification");
    }
  }
  {
    Stmt ins(db_, "INSERT OR REPLACE INTO properties(id, owner_account, tenant_id, upkeep) VALUES (?,?,?,?)");
    for (const auto& [id, p] : s.properties) {
      const std::string upkeep = Json{{"cleanliness", p.cleanliness}, {"trash", p.trash}}.dump();
      if (!ins.bind(1, id).bind(2, p.ownerAccount).bind(3, p.tenant).bind(4, upkeep).run()) return rollback("save property");
    }
  }
  {
    Stmt ins(db_,
             "INSERT OR REPLACE INTO construction(id, status, worker_hours_done, completed_at) VALUES (?,?,?,?)");
    for (const auto& [id, c] : s.construction) {
      if (!ins.bind(1, id).bind(2, std::string(toString(c.status))).bind(3, c.workerHoursDone).bind(4, c.completedAt)
               .run())
        return rollback("save construction");
    }
  }
  {
    if (!exec("DELETE FROM city_stats")) return rollback("clear city");
    Stmt ins(db_, "INSERT INTO city_stats(key, value) VALUES (?, ?)");
    for (const auto& [k, v] : s.city.stats) {
      if (!ins.bind(1, k).bind(2, v).run()) return rollback("save city");
    }
  }
  {
    // A created character's definition never changes after creation.
    Stmt ins(db_, "INSERT OR IGNORE INTO created_characters(id, def) VALUES (?, ?)");
    for (const auto& [id, def] : s.createdCharacters) {
      if (!ins.bind(1, id).bind(2, toJson(def).dump()).run()) return rollback("save created character");
    }
  }
  {
    Stmt ins(db_, "INSERT OR REPLACE INTO songs(id, owner_id, body) VALUES (?, ?, ?)");
    for (const auto& [id, song] : s.songs) {
      if (!ins.bind(1, id).bind(2, song.owner).bind(3, toJson(song).dump()).run()) return rollback("save song");
    }
  }
  if (Status c = exec("COMMIT"); !c) {
    (void)exec("ROLLBACK");
    return c;
  }
  persistedTransactions_ = s.ledger.transactions().size();
  persistedMemories_ = s.memories.size();
  return okStatus();
}

Result<WorldState> SqliteStore::loadWorld() {
  if (!hasWorld()) return fail("no_world", "no saved world");
  WorldState s;
  try {
    std::map<std::string, std::string> meta;
    {
      Stmt q(db_, "SELECT key, value FROM meta");
      while (q.step() == SQLITE_ROW) meta[q.text(0)] = q.text(1);
    }
    s.now = std::stoll(meta.at("now"));
    s.clockCarry = std::stod(meta.at("clock_carry"));
    s.nextId = std::stoull(meta.at("next_id"));
    s.city.stage = std::stoi(meta.at("city_stage"));
    if (meta.count("rng")) s.rng = std::stoull(meta.at("rng"));
    const std::uint64_t nextTx = std::stoull(meta.at("next_tx"));
    {
      Stmt q(db_, "SELECT state FROM characters");
      while (q.step() == SQLITE_ROW) {
        CharacterState c = characterStateFromJson(Json::parse(q.text(0)));
        s.characters[c.id] = std::move(c);
      }
    }
    {
      Stmt q(db_, "SELECT from_id, to_id, state FROM relationships");
      while (q.step() == SQLITE_ROW)
        s.relationships[{q.text(0), q.text(1)}] = relationshipStateFromJson(Json::parse(q.text(2)));
    }
    {
      Stmt q(db_, "SELECT body FROM memories ORDER BY seq");
      while (q.step() == SQLITE_ROW) s.memories.push_back(memoryFromJson(Json::parse(q.text(0))));
    }
    std::map<LedgerAccountId, LedgerAccount> accounts;
    std::vector<LedgerTransaction> txs;
    {
      Stmt q(db_, "SELECT id, owner_id, kind, balance_cents, allow_negative FROM ledger_accounts");
      while (q.step() == SQLITE_ROW)
        accounts[q.text(0)] = LedgerAccount{q.text(0), q.text(1), q.text(2), q.int64(3), q.int64(4) != 0};
    }
    {
      Stmt q(db_, "SELECT id, at, from_account, to_account, amount_cents, kind, memo FROM ledger_transactions ORDER BY seq");
      while (q.step() == SQLITE_ROW)
        txs.push_back(LedgerTransaction{q.text(0), q.int64(1), q.text(2), q.text(3), q.int64(4), q.text(5), q.text(6)});
    }
    s.ledger.restore(std::move(accounts), std::move(txs), nextTx);
    if (s.ledger.sumOfBalances() != 0) return fail("ledger_unbalanced", "saved ledger does not balance");
    {
      Stmt q(db_, "SELECT id, from_id, to_id, at, body, read FROM messages ORDER BY seq");
      while (q.step() == SQLITE_ROW)
        s.messages.push_back(Message{q.text(0), q.text(1), q.text(2), q.int64(3), q.text(4), q.int64(5) != 0});
    }
    {
      Stmt q(db_, "SELECT id, recipient, at, kind, text, read FROM notifications ORDER BY seq");
      while (q.step() == SQLITE_ROW)
        s.notifications.push_back(
            Notification{q.text(0), q.text(1), q.int64(2), q.text(3), q.text(4), q.int64(5) != 0});
    }
    {
      Stmt q(db_, "SELECT id, owner_account, tenant_id, upkeep FROM properties");
      while (q.step() == SQLITE_ROW) {
        PropertyState p{q.text(0), q.text(1), q.text(2)};
        const Json upkeep = Json::parse(q.text(3));
        p.cleanliness = upkeep.value("cleanliness", p.cleanliness);
        p.trash = upkeep.value("trash", p.trash);
        s.properties[p.id] = p;
      }
    }
    {
      Stmt q(db_, "SELECT id, status, worker_hours_done, completed_at FROM construction");
      while (q.step() == SQLITE_ROW)
        s.construction[q.text(0)] =
            ConstructionState{q.text(0), constructionStatusFromString(q.text(1)), q.real(2), q.int64(3)};
    }
    {
      Stmt q(db_, "SELECT key, value FROM city_stats");
      while (q.step() == SQLITE_ROW) s.city.stats[q.text(0)] = q.real(1);
    }
    {
      Stmt q(db_, "SELECT id, def FROM created_characters");
      while (q.step() == SQLITE_ROW) {
        auto def = ContentDatabase::parseCharacter(Json::parse(q.text(1)));
        if (!def) return fail("storage_corrupt", "created character " + q.text(0) + ": " + def.error().message);
        s.createdCharacters[q.text(0)] = std::move(def).value();
      }
    }
    {
      Stmt q(db_, "SELECT body FROM songs");
      while (q.step() == SQLITE_ROW) {
        Song song = songFromJson(Json::parse(q.text(0)));
        s.songs[song.id] = std::move(song);
      }
    }
  } catch (const std::exception& e) {
    return fail("storage_corrupt", std::string("saved world could not be read: ") + e.what());
  }
  persistedTransactions_ = s.ledger.transactions().size();
  persistedMemories_ = s.memories.size();
  return s;
}

Status SqliteStore::createAccount(const std::string& username, const PasswordRecord& password) {
  Stmt ins(db_, "INSERT INTO accounts(username, salt_hex, hash_hex, iterations) VALUES (?,?,?,?)");
  ins.bind(1, username).bind(2, password.saltHex).bind(3, password.hashHex).bind(4, password.iterations);
  const int rc = ins.step();
  if (rc == SQLITE_CONSTRAINT) return fail("username_taken", "that username is taken");
  if (rc != SQLITE_DONE) return dbError(db_, "create account");
  return okStatus();
}

std::optional<PasswordRecord> SqliteStore::credential(const std::string& username) const {
  Stmt q(db_, "SELECT salt_hex, hash_hex, iterations FROM accounts WHERE username = ?");
  q.bind(1, username);
  if (q.step() != SQLITE_ROW) return std::nullopt;
  return PasswordRecord{q.text(0), q.text(1), static_cast<int>(q.int64(2))};
}

Status SqliteStore::claimCharacter(const std::string& username, const CharacterId& character) {
  // The UNIQUE constraint on character_id makes the claim race-free; the WHERE clause
  // stops an account from swapping characters.
  Stmt up(db_, "UPDATE accounts SET character_id = ? WHERE username = ? AND character_id IS NULL");
  up.bind(1, character).bind(2, username);
  const int rc = up.step();
  if (rc == SQLITE_CONSTRAINT) return fail("character_taken", "someone else is playing that character");
  if (rc != SQLITE_DONE) return dbError(db_, "claim character");
  if (sqlite3_changes(db_) == 0) {
    auto current = characterOf(username);
    if (current && *current == character) return okStatus();
    if (current) return fail("already_has_character", "this account already plays " + *current);
    return fail("unknown_account", "no such account");
  }
  return okStatus();
}

std::optional<CharacterId> SqliteStore::characterOf(const std::string& username) const {
  Stmt q(db_, "SELECT character_id FROM accounts WHERE username = ?");
  q.bind(1, username);
  if (q.step() != SQLITE_ROW || q.isNull(0)) return std::nullopt;
  return q.text(0);
}

std::optional<std::string> SqliteStore::claimedBy(const CharacterId& character) const {
  Stmt q(db_, "SELECT username FROM accounts WHERE character_id = ?");
  q.bind(1, character);
  if (q.step() != SQLITE_ROW) return std::nullopt;
  return q.text(0);
}

}  // namespace livera
