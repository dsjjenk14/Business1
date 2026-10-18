#include <fstream>

#include "TestSupport.h"
#include "core/Clock.h"
#include "core/Serialization.h"
#include "persistence/PasswordHash.h"
#include "persistence/SqliteStore.h"

using namespace livera;
using namespace livera::test;

TEST_CASE("persistence: passwords are salted and verified in constant time") {
  const PasswordRecord a = hashPassword("correct horse", 1000);
  const PasswordRecord b = hashPassword("correct horse", 1000);
  CHECK(a.saltHex != b.saltHex);
  CHECK(a.hashHex != b.hashHex);
  CHECK(verifyPassword("correct horse", a));
  CHECK(!verifyPassword("correct horsf", a));
  CHECK(!verifyPassword("correct horse", PasswordRecord{"zz", a.hashHex, 1000}));
}

TEST_CASE("persistence: a fresh store migrates to the current schema") {
  auto path = tempPath("schema.db");
  auto store = SqliteStore::open(path.string());
  REQUIRE(store);
  CHECK(store.value()->schemaVersion() == 4);
  CHECK(!store.value()->hasWorld());
}

TEST_CASE("persistence: the world survives a save/load round trip") {
  auto path = tempPath("roundtrip.db");
  WorldState saved;
  {
    World w = World::createNew(realContent());
    REQUIRE(w.connect("dominique"));
    REQUIRE(w.connect("dax"));
    walkInto(w, "dominique", "heritage_coffee");
    walkInto(w, "dax", "heritage_coffee");
    REQUIRE(w.buy("dominique", "latte", "card"));
    REQUIRE(w.interact("dominique", "deep_talk", "dax"));
    REQUIRE(w.sendMessage("dax", "dominique", "Good talk."));
    w.advanceMinutes(3 * kMinutesPerDay);
    w.disconnect("dominique");
    w.disconnect("dax");
    auto store = SqliteStore::open(path.string());
    REQUIRE(store);
    REQUIRE(store.value()->saveWorld(w.state()));
    saved = w.state();
  }
  auto store = SqliteStore::open(path.string());
  REQUIRE(store);
  auto loaded = store.value()->loadWorld();
  REQUIRE(loaded);
  const WorldState& s = loaded.value();
  CHECK(s.now == saved.now);
  CHECK(s.nextId == saved.nextId);
  CHECK(s.characters.at("dominique").inside == "heritage_coffee");
  CHECK(s.characters.at("dominique").needs == saved.characters.at("dominique").needs);
  CHECK(s.relationships.size() == saved.relationships.size());
  CHECK(s.relationships.at({"dax", "dominique"}).dimensions == saved.relationships.at({"dax", "dominique"}).dimensions);
  CHECK(s.memories.size() == saved.memories.size());
  CHECK(s.ledger.transactions().size() == saved.ledger.transactions().size());
  CHECK(s.ledger.balance(bankAccountOf("dominique")) == saved.ledger.balance(bankAccountOf("dominique")));
  CHECK(s.ledger.sumOfBalances() == 0);
  CHECK(s.messages.size() == 1);
  CHECK(s.notifications.size() == saved.notifications.size());
  CHECK(s.construction.at("founders_way").workerHoursDone == saved.construction.at("founders_way").workerHoursDone);
  CHECK(s.city.stats == saved.city.stats);
  // Everyday life: bodies, conditions, home upkeep, the random stream.
  const CharacterState& d = s.characters.at("dominique");
  const CharacterState& sd = saved.characters.at("dominique");
  CHECK(d.weightKg == sd.weightKg);
  CHECK(d.bornAt == sd.bornAt);
  CHECK(d.lastOnlineAt == sd.lastOnlineAt);
  CHECK(d.conditions.size() == sd.conditions.size());
  CHECK(s.properties.at("lexington_1204").cleanliness == saved.properties.at("lexington_1204").cleanliness);
  CHECK(s.properties.at("lexington_1204").trash == saved.properties.at("lexington_1204").trash);
  CHECK(s.rng == saved.rng);

  // The loaded world keeps running and keeps saving incrementally.
  World w(realContent(), std::move(loaded).value());
  REQUIRE(w.connect("dominique"));
  REQUIRE(w.exitBuilding("dominique"));
  walkInto(w, "dominique", "greenleaf_market");
  REQUIRE(w.buy("dominique", "ready_meal", "card"));
  REQUIRE(store.value()->saveWorld(w.state()));
  auto again = store.value()->loadWorld();
  REQUIRE(again);
  CHECK(again.value().ledger.transactions().size() == w.state().ledger.transactions().size());
}

TEST_CASE("persistence: an unbalanced ledger is never saved") {
  auto path = tempPath("unbalanced.db");
  auto store = SqliteStore::open(path.string());
  REQUIRE(store);
  World w = World::createNew(realContent());
  WorldState broken = w.state();
  auto accounts = broken.ledger.accounts();
  accounts.at(bankAccountOf("dominique")).balanceCents += 100;  // money from nowhere
  broken.ledger.restore(accounts, broken.ledger.transactions(), broken.ledger.nextTxNumber());
  auto r = store.value()->saveWorld(broken);
  CHECK(!r);
  CHECK(r.error().code == "ledger_unbalanced");
  CHECK(!store.value()->hasWorld());
}

TEST_CASE("persistence: accounts and one-character-per-account claims") {
  auto path = tempPath("accounts.db");
  auto opened = SqliteStore::open(path.string());
  REQUIRE(opened);
  SqliteStore& store = *opened.value();
  REQUIRE(store.createAccount("dom", hashPassword("password1", 1000)));
  REQUIRE(store.createAccount("jax", hashPassword("password2", 1000)));
  CHECK(store.createAccount("dom", hashPassword("x", 1000)).error().code == "username_taken");
  REQUIRE(store.claimCharacter("dom", "dominique"));
  CHECK(store.claimCharacter("dom", "dominique"));  // idempotent
  CHECK(store.claimCharacter("jax", "dominique").error().code == "character_taken");
  CHECK(store.claimCharacter("dom", "dax").error().code == "already_has_character");
  CHECK(*store.characterOf("dom") == "dominique");
  CHECK(*store.claimedBy("dominique") == "dom");
  CHECK(!store.characterOf("jax"));
  CHECK(verifyPassword("password1", *store.credential("dom")));
}

TEST_CASE("persistence: the operator can release a claimed character, even with the server's store open") {
  auto path = tempPath("release.db");
  auto server = SqliteStore::open(path.string());  // the running server's connection
  REQUIRE(server);
  REQUIRE(server.value()->createAccount("dom", hashPassword("password1", 1000)));
  REQUIRE(server.value()->claimCharacter("dom", "dominique"));
  auto admin = SqliteStore::open(path.string());  // livera_server --release-character, at the same time
  REQUIRE(admin);
  auto released = admin.value()->releaseCharacter("dominique");
  REQUIRE(released);
  REQUIRE(released.value().has_value());
  CHECK(*released.value() == "dom");
  CHECK(!server.value()->claimedBy("dominique"));
  CHECK(!server.value()->characterOf("dom"));
  auto again = admin.value()->releaseCharacter("dominique");
  REQUIRE(again);
  CHECK(!again.value().has_value());  // nothing to release
  CHECK(server.value()->claimCharacter("dom", "dax"));  // the account may pick someone else now
}

TEST_CASE("persistence: created characters, skills and songs survive a round trip") {
  auto path = tempPath("created.db");
  std::string songId;
  WorldState saved;
  {
    World w = World::createNew(realContent());
    std::ifstream in(std::string(LIVERA_DATA_DIR) + "/../scripts/demo/sol_rivera.json");
    REQUIRE(w.createCharacter(Json::parse(in)));
    REQUIRE(w.connect("sol-rivera"));
    walkTo(w, "sol-rivera", "founders_park");
    auto song = w.saveSong("sol-rivera", Json::parse(R"({"title": "Park Bench", "bpm": 80,
        "tracks": [{"instrument": "guitar", "notes": [[0,52,4],[4,55,4],[8,59,8]]}]})"), "");
    REQUIRE(song);
    songId = song.value()["id"];
    REQUIRE(w.perform("sol-rivera", songId));
    REQUIRE(w.releaseSong("sol-rivera", songId));
    w.disconnect("sol-rivera");
    auto store = SqliteStore::open(path.string());
    REQUIRE(store);
    REQUIRE(store.value()->saveWorld(w.state()));
    saved = w.state();
  }
  auto store = SqliteStore::open(path.string());
  REQUIRE(store);
  auto loaded = store.value()->loadWorld();
  REQUIRE(loaded);
  World w(realContent(), std::move(loaded).value());
  const CharacterDef* def = w.definition("sol-rivera");
  REQUIRE(def);
  CHECK(def->profile == saved.createdCharacters.at("sol-rivera").profile);
  CHECK(def->personality == saved.createdCharacters.at("sol-rivera").personality);
  CHECK(w.character("sol-rivera")->skills.at("music") == saved.characters.at("sol-rivera").skills.at("music"));
  CHECK(w.character("sol-rivera")->skills.at("music") > 0);
  const Song& song = w.state().songs.at(songId);
  CHECK(song.title == "Park Bench");
  CHECK(song.released);
  CHECK(song.tracks.at(0).notes.size() == 3);
  CHECK(song.tracks.at(0).notes.at(2).length == 8);
  CHECK(w.state().properties.at(def->homeProperty).tenant == "sol-rivera");
  CHECK(w.state().ledger.sumOfBalances() == 0);
  REQUIRE(w.connect("sol-rivera"));  // and they can play again
}

TEST_CASE("persistence: a save from before everyday life loads with bodies, degrees and fame filled in") {
  World w = World::createNew(realContent());
  Json old = toJson(w.state().characters.at("andre"));
  for (const char* key : {"body", "conditions", "fame", "education", "inventory", "record"}) old.erase(key);
  WorldState s = w.state();
  s.characters["andre"] = characterStateFromJson(old);
  World loaded(realContent(), s);
  const CharacterState& a = *loaded.character("andre");
  CHECK(a.weightKg > 40);
  CHECK(a.fame == 30);
  CHECK(loaded.ageOf("andre") == 29);
  CHECK(loaded.hasDegree("dominique", "bachelors"));
}

TEST_CASE("persistence: businesses added after a world was saved open on load, funded, and take payments") {
  World w = World::createNew(realContent());
  WorldState s = w.state();
  // A save from before the bus line: rebuild the ledger without the transit account, with
  // its opening money back in the outside economy.
  Ledger old;
  for (const auto& [id, a] : s.ledger.accounts())
    if (id != "org:livera_transit") REQUIRE(old.openAccount(LedgerAccount{a.id, a.ownerId, a.kind, 0, a.allowNegative}));
  for (const auto& [id, a] : s.ledger.accounts())
    if (id != "org:livera_transit" && a.balanceCents > 0) REQUIRE(old.transfer(kEconomyAccount, id, a.balanceCents, "opening_balance", "", 0));
  s.ledger = old;
  World loaded(realContent(), s);
  CHECK(loaded.state().ledger.balance("org:livera_transit") == w.state().ledger.balance("org:livera_transit"));
  CHECK(loaded.state().ledger.balance("org:livera_transit") > 0);
  CHECK(loaded.state().ledger.sumOfBalances() == 0);
  // Loading the same state again opens nothing twice.
  World again(realContent(), loaded.state());
  CHECK(again.state().ledger.balance("org:livera_transit") == loaded.state().ledger.balance("org:livera_transit"));
}
