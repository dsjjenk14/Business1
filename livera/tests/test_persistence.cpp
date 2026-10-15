#include <fstream>

#include "TestSupport.h"
#include "core/Clock.h"
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
  CHECK(store.value()->schemaVersion() == 2);
  CHECK(!store.value()->hasWorld());
}

TEST_CASE("persistence: the world survives a save/load round trip") {
  auto path = tempPath("roundtrip.db");
  WorldState saved;
  {
    World w = World::createNew(realContent());
    REQUIRE(w.connect("dominique"));
    REQUIRE(w.connect("jaxon"));
    walkInto(w, "dominique", "heritage_coffee");
    walkInto(w, "jaxon", "heritage_coffee");
    REQUIRE(w.buy("dominique", "latte", "card"));
    REQUIRE(w.interact("dominique", "deep_talk", "jaxon"));
    REQUIRE(w.sendMessage("jaxon", "dominique", "Good talk."));
    w.advanceMinutes(3 * kMinutesPerDay);
    w.disconnect("dominique");
    w.disconnect("jaxon");
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
  CHECK(s.relationships.at({"jaxon", "dominique"}).dimensions == saved.relationships.at({"jaxon", "dominique"}).dimensions);
  CHECK(s.memories.size() == saved.memories.size());
  CHECK(s.ledger.transactions().size() == saved.ledger.transactions().size());
  CHECK(s.ledger.balance(bankAccountOf("dominique")) == saved.ledger.balance(bankAccountOf("dominique")));
  CHECK(s.ledger.sumOfBalances() == 0);
  CHECK(s.messages.size() == 1);
  CHECK(s.notifications.size() == saved.notifications.size());
  CHECK(s.construction.at("founders_way").workerHoursDone == saved.construction.at("founders_way").workerHoursDone);
  CHECK(s.city.stats == saved.city.stats);

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
  CHECK(store.claimCharacter("dom", "jaxon").error().code == "already_has_character");
  CHECK(*store.characterOf("dom") == "dominique");
  CHECK(*store.claimedBy("dominique") == "dom");
  CHECK(!store.characterOf("jax"));
  CHECK(verifyPassword("password1", *store.credential("dom")));
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
