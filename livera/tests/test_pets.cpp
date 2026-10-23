// Tests for M0.8 pets: see docs/m08/pets.md.
#include <atomic>
#include <chrono>
#include <set>
#include <thread>

#include "TestSupport.h"
#include "core/Clock.h"
#include "core/Parts.h"
#include "core/Serialization.h"
#include "net/Socket.h"
#include "persistence/SqliteStore.h"
#include "server/Server.h"

using namespace livera;
using namespace livera::test;

namespace {

// Nobody catches anything and pets stay well unless a test says otherwise, so outcomes are
// the rules', not the dice's.
std::shared_ptr<const ContentDatabase> quietContent(const std::function<void(Json&, const std::string&)>& extra = nullptr) {
  return patchedContent([&](Json& doc, const std::string& file) {
    if (doc.contains("conditions")) {
      for (auto& c : doc["conditions"]) {
        if (c.contains("catch")) c["catch"]["hourly_chance"] = 0.0, c["catch"]["contagion_per_hour"] = 0.0;
      }
    }
    if (file == "pets.json") doc["pets"]["sickness"]["chance_per_hour"] = 0.0;
    if (extra) extra(doc, file);
  });
}

std::shared_ptr<const ContentDatabase> petContent() {
  static auto db = quietContent();
  return db;
}

std::string code(const Result<Json>& r) { return r ? std::string("(ok)") : r.error().code; }

bool notified(const World& w, const CharacterId& id, const std::string& fragment) {
  for (const auto& n : w.state().notifications) {
    if (n.recipient == id && n.text.find(fragment) != std::string::npos) return true;
  }
  return false;
}

bool remembers(const World& w, const CharacterId& id, const std::string& type) {
  for (const Memory* m : w.memoriesOf(id)) {
    if (m->type == type) return true;
  }
  return false;
}

// Advances the clock to the next time it's `hour`:00.
void advanceTo(World& w, int hour) {
  const GameMinutes target = static_cast<GameMinutes>(hour) * 60;
  const GameMinutes today = w.now() % kMinutesPerDay;
  w.advanceMinutes(today < target ? target - today : kMinutesPerDay - today + target);
}

// A new world at 10:00 on the first day (the shelter has just opened) with these people in it.
World morningWorld(std::shared_ptr<const ContentDatabase> db, const std::vector<CharacterId>& who = {"dominique"}) {
  World w = World::createNew(std::move(db));
  for (const auto& id : who) REQUIRE(w.connect(id));
  advanceTo(w, 10);
  return w;
}

std::string listingOf(const World& w, const std::string& species) {
  for (const auto& a : w.shelterListings()) {
    if (a.at("species") == species && !a.at("brought_back").get<bool>()) return a.at("id").get<std::string>();
  }
  throw std::runtime_error("no " + species + " at the shelter");
}

// `who` adopts one of the shelter's animals of that species, in person.
std::string adopt(World& w, const CharacterId& who, const std::string& species = "dog") {
  walkInto(w, who, "paws_whiskers");
  auto r = w.adoptPet(who, listingOf(w, species), "", "card");
  if (!r) throw std::runtime_error("adopt failed: " + r.error().message);
  return r.value().at("id").get<std::string>();
}

void walkToPoint(World& w, const CharacterId& who, Vec2 at) {
  if (!w.character(who)->inside.empty()) REQUIRE(w.exitBuilding(who));
  REQUIRE(w.moveTo(who, at));
  for (int i = 0; i < 5000 && w.character(who)->moveTarget; ++i) w.advanceRealTime(0.1);
}

Cents bank(const World& w, const CharacterId& id) { return w.state().ledger.balance(bankAccountOf(id)); }

}  // namespace

// ---------------------------------------------------------------------------------
// The shelter and adopting
// ---------------------------------------------------------------------------------
TEST_CASE("pets: the shelter lists a few animals a week, the same for everyone") {
  World a = World::createNew(petContent());
  World b = World::createNew(petContent());
  const Json week0 = a.shelterListings();
  CHECK(week0 == b.shelterListings());
  CHECK(week0.size() == 4);
  std::set<std::string> kinds, names;
  for (const auto& x : week0) {
    kinds.insert(x.at("species").get<std::string>());
    names.insert(x.at("name").get<std::string>());
    CHECK(x.at("fee_cents").get<Cents>() > 0);
    CHECK(!x.at("breed").get<std::string>().empty());
    CHECK(x.at("age_months").get<int>() >= 2);
  }
  CHECK((kinds == std::set<std::string>{"cat", "dog", "rabbit"}));
  CHECK(names.size() == 4);
  a.advanceMinutes(kMinutesPerWeek);
  const Json week1 = a.shelterListings();
  CHECK(week1.size() == 4);
  CHECK(week1.at(0).at("id") != week0.at(0).at("id"));
}

TEST_CASE("pets: adopting is in person at the shelter, in its hours, with the fee to the shelter") {
  World w = World::createNew(petContent());
  REQUIRE(w.connect("dominique"));
  const std::string dog = listingOf(w, "dog");
  CHECK(code(w.adoptPet("dominique", dog, "", "card")) == "wrong_place");
  CHECK(code(w.adoptPet("dax", dog, "", "card")) == "not_in_world");
  walkTo(w, "dominique", "paws_whiskers");
  CHECK(w.enter("dominique", "paws_whiskers").error().code == "closed");  // opens at 10
  advanceTo(w, 10);
  REQUIRE(w.enter("dominique", "paws_whiskers"));
  CHECK(code(w.adoptPet("dominique", "w0-99", "", "card")) == "unknown_pet");
  CHECK(code(w.adoptPet("dominique", dog, "", "bitcoin")) == "invalid_payment");
  CHECK(code(w.adoptPet("dominique", dog, std::string(40, 'x'), "card")) == "bad_name");

  const Cents before = bank(w, "dominique");
  const Cents shelter = w.state().ledger.balance("org:paws_whiskers");
  const Cents fee = w.content().petSpecies("dog")->adoptionFeeCents;
  auto r = w.adoptPet("dominique", dog, "  Sir Wiggles ", "card");
  REQUIRE(r);
  CHECK(r.value().at("name") == "Sir Wiggles");
  CHECK(r.value().at("fee_cents") == fee);
  CHECK(bank(w, "dominique") == before - fee);
  CHECK(w.state().ledger.balance("org:paws_whiskers") == shelter + fee);
  const PetState* p = w.pet(r.value().at("id").get<std::string>());
  REQUIRE(p);
  CHECK(p->owner == "dominique");
  CHECK(p->home == "lexington_1204");
  CHECK(p->species == "dog");
  CHECK(p->bond.at("dominique") > 0);
  CHECK(p->vaccinatedUntil > w.now());  // the fee covers shots
  CHECK(remembers(w, "dominique", "adopted_pet"));
  // That animal is spoken for, and the next of the week's intake takes its place on show.
  CHECK(code(w.adoptPet("dominique", dog, "", "card")) == "unknown_pet");
  CHECK(w.shelterListings().size() == 4);
  for (const auto& a : w.shelterListings()) CHECK(a.at("id") != dog);
  // Ask for one by name, in any case.
  std::string catName;
  for (const auto& a : w.shelterListings()) {
    if (a.at("species") == "cat") catName = a.at("name").get<std::string>();
  }
  REQUIRE(!catName.empty());
  std::string shouted = catName;
  for (char& ch : shouted) ch = static_cast<char>(std::toupper(static_cast<unsigned char>(ch)));
  auto cat = w.adoptPet("dominique", shouted, "", "cash");
  REQUIRE(cat);
  CHECK(cat.value().at("name") == catName);
  CHECK(cat.value().at("paid_with") == "cash");
  // Closing time.
  advanceTo(w, 18);
  CHECK(code(w.adoptPet("dominique", listingOf(w, "rabbit"), "", "card")) == "closed");
}

TEST_CASE("pets: no home, no pet; and a home has room for only so many") {
  auto db = quietContent([](Json& doc, const std::string& file) {
    if (file == "pets.json") doc["pets"]["max_pets_per_home"] = 1;
  });
  WorldState s = World::createNew(db).state();
  for (auto& [pid, p] : s.properties) {
    if (p.tenant == "dax") p.tenant.clear();
    std::erase(p.residents, "dax");
  }
  World w(db, s);
  REQUIRE(w.connect("dominique"));
  REQUIRE(w.connect("dax"));
  advanceTo(w, 10);
  walkInto(w, "dax", "paws_whiskers");
  CHECK(code(w.adoptPet("dax", listingOf(w, "cat"), "", "card")) == "no_home");
  walkInto(w, "dominique", "paws_whiskers");
  REQUIRE(w.adoptPet("dominique", listingOf(w, "cat"), "", "card"));
  CHECK(code(w.adoptPet("dominique", listingOf(w, "rabbit"), "", "card")) == "too_many_pets");
}

// ---------------------------------------------------------------------------------
// Looking after them
// ---------------------------------------------------------------------------------
TEST_CASE("pets: care at home has cooldowns; the bond grows and you feel less lonely") {
  World w = morningWorld(petContent(), {"dominique", "dax"});
  const std::string dog = adopt(w, "dominique", "dog");
  CHECK(code(w.careForPet("dominique", dog, "feed")) == "wrong_place");  // the dog's at home
  walkInto(w, "dominique", "lexington_1204");
  CHECK(code(w.careForPet("dominique", dog, "feed")) == "missing_item");
  walkInto(w, "dominique", "paws_whiskers");
  REQUIRE(w.buy("dominique", "pet_food", "card"));
  walkInto(w, "dominique", "lexington_1204");

  const double hunger = w.pet(dog)->needs.at("hunger");
  auto fed = w.careForPet("dominique", dog, "feed");
  REQUIRE(fed);
  CHECK(w.pet(dog)->needs.at("hunger") > hunger);
  CHECK(fed.value().at("left") == 4);  // one meal of five
  CHECK(code(w.careForPet("dominique", dog, "feed")) == "too_soon");

  const double bond = w.pet(dog)->bond.at("dominique");
  const double lonely = w.character("dominique")->emotions.at("loneliness");
  const double recreation = w.character("dominique")->needs.at("recreation");
  const double fun = w.pet(dog)->needs.at("fun");
  REQUIRE(w.careForPet("dominique", dog, "play"));
  REQUIRE(w.careForPet("dominique", w.pet(dog)->name, "cuddle"));  // by name works too
  const double hygiene = w.pet(dog)->needs.at("hygiene");
  REQUIRE(w.careForPet("dominique", dog, "groom"));
  CHECK(w.pet(dog)->needs.at("fun") > fun);
  CHECK(w.pet(dog)->needs.at("hygiene") > hygiene);
  CHECK(w.pet(dog)->bond.at("dominique") > bond);
  CHECK(w.character("dominique")->emotions.at("loneliness") < lonely);
  CHECK(w.character("dominique")->needs.at("recreation") > recreation);

  CHECK(code(w.careForPet("dominique", dog, "dance")) == "unknown_action");
  CHECK(code(w.careForPet("dominique", "pet-999", "cuddle")) == "not_your_pet");
  CHECK(code(w.careForPet("dax", dog, "cuddle")) == "not_your_pet");  // he doesn't live here
  w.advanceMinutes(120);
  CHECK(w.careForPet("dominique", dog, "feed"));
}

TEST_CASE("pets: a dog walk is outdoors near home, and good exercise; cats don't do walks") {
  World w = morningWorld(petContent());
  const std::string dog = adopt(w, "dominique", "dog");
  const std::string cat = adopt(w, "dominique", "cat");  // while the shelter is open
  walkInto(w, "dominique", "lexington_1204");
  CHECK(code(w.careForPet("dominique", dog, "walk")) == "go_outside");
  REQUIRE(w.exitBuilding("dominique"));
  const double fun = w.pet(dog)->needs.at("fun");
  const double recreation = w.character("dominique")->needs.at("recreation");
  const double burned = w.character("dominique")->caloriesOut;
  auto walked = w.careForPet("dominique", dog, "walk");
  REQUIRE(walked);
  CHECK(w.pet(dog)->needs.at("fun") > fun);
  CHECK(w.character("dominique")->needs.at("recreation") > recreation);
  CHECK(w.character("dominique")->caloriesOut >= burned + 180);
  CHECK(code(w.careForPet("dominique", dog, "walk")) == "too_soon");
  w.advanceMinutes(180);
  walkToPoint(w, "dominique", {900, 100});
  CHECK(code(w.careForPet("dominique", dog, "walk")) == "too_far");

  walkToPoint(w, "dominique", w.content().location("lexington_1204")->door);
  CHECK(code(w.careForPet("dominique", cat, "walk")) == "wrong_species");
}

TEST_CASE("pets: everyone who lives in the home can look after the pet") {
  World base = World::createNew(petContent());
  WorldState s = base.state();
  // Noor, Dominique's grown daughter, still lives at home.
  Json sheet = toJson(*base.definition("dominique"));
  sheet["id"] = "noor-reyes";
  sheet["first_name"] = "Noor";
  sheet["age"] = 19;
  sheet["career"] = Json{{"id", ""}, {"level", 0}};
  sheet["finances"] = Json{{"cash_cents", 0}, {"bank_cents", 0}};
  sheet["degrees"] = Json::array();
  sheet["relationships"] = Json::array();
  sheet["fame"] = 0;
  auto def = ContentDatabase::parseCharacter(sheet);
  REQUIRE(def);
  s.createdCharacters["noor-reyes"] = def.value();
  CharacterState noor;
  noor.id = "noor-reyes";
  noor.parents = {"dominique"};
  noor.bornAt = s.now - 19 * kMinutesPerYear - 40 * kMinutesPerDay;
  noor.lastBirthdayAge = 19;
  noor.heightCm = 168;
  noor.weightKg = 62;
  noor.inside = "lexington_1204";
  noor.position = base.content().location("lexington_1204")->door;
  s.characters["noor-reyes"] = noor;
  World w(petContent(), s);
  REQUIRE(w.connect("dominique"));
  REQUIRE(w.connect("noor-reyes"));
  REQUIRE(w.connect("dax"));
  advanceTo(w, 10);
  CHECK(w.residenceOf("noor-reyes") == "lexington_1204");
  const std::string dog = adopt(w, "dominique", "dog");
  CHECK(notified(w, "noor-reyes", "adopted"));
  REQUIRE(w.careForPet("noor-reyes", dog, "cuddle"));
  CHECK(w.pet(dog)->bond.at("noor-reyes") > 0);
  auto app = w.openPhoneApp("noor-reyes", "pets");
  REQUIRE(app);
  REQUIRE(app.value().at("pets").size() == 1);
  CHECK(app.value().at("pets").at(0).at("yours") == false);
  CHECK(app.value().at("pets").at(0).at("owner") == w.definition("dominique")->fullName());
  CHECK(code(w.careForPet("dax", dog, "cuddle")) == "not_your_pet");
  CHECK(w.openPhoneApp("dax", "pets").value().at("pets").empty());  // nobody else sees them
}

// ---------------------------------------------------------------------------------
// The hours go by
// ---------------------------------------------------------------------------------
TEST_CASE("pets: needs run down by the hour while nobody looks after them") {
  World w = morningWorld(petContent());
  const std::string dog = adopt(w, "dominique", "dog");
  const StatMap before = w.pet(dog)->needs;
  w.advanceMinutes(6 * 60);
  for (const char* n : {"hunger", "fun", "hygiene", "health"}) CHECK(w.pet(dog)->needs.at(n) < before.at(n));
  CHECK(w.pet(dog)->needs.at("hunger") <= before.at("hunger") - 6 * 3 * 0.9 + 1e-9);
}

TEST_CASE("pets: an offline owner's routine keeps the pet fed and fine, unless they've stopped coping") {
  World w = morningWorld(petContent());
  const std::string dog = adopt(w, "dominique", "dog");
  w.disconnect("dominique");
  w.advanceMinutes(4 * kMinutesPerDay);
  const PetState* p = w.pet(dog);
  CHECK(p->owner == "dominique");
  for (const char* n : {"hunger", "fun", "hygiene", "health"}) CHECK(p->needs.at(n) > 50);
  // Depressed, she keeps up only the basics for herself, and the dog goes hungry.
  REQUIRE(w.devAddCondition("dominique", "depression"));
  w.advanceMinutes(3 * kMinutesPerDay);
  CHECK(p->owner.empty());
  CHECK(notified(w, "dominique", "Animal control took"));
}

TEST_CASE("pets: starved for a day, the pet goes back to the shelter, and not to you") {
  World w = morningWorld(petContent(), {"dominique", "dax"});
  const std::string dog = adopt(w, "dominique", "dog");
  walkInto(w, "dominique", "lexington_1204");
  int hours = 0;
  while (!w.pet(dog)->owner.empty() && hours < 120) {
    w.advanceMinutes(60);
    ++hours;
  }
  const PetState* p = w.pet(dog);
  CHECK(p->owner.empty());
  CHECK(p->takenFrom == "dominique");
  CHECK(hours > 24);  // a day of hunger first, then a day starving
  CHECK(notified(w, "dominique", "is hungry"));
  CHECK(notified(w, "dominique", "is starving"));
  CHECK(notified(w, "dominique", "Animal control took " + p->name));
  CHECK(remembers(w, "dominique", "lost_pet"));
  CHECK(w.character("dominique")->emotions.at("sadness") >= 25);
  bool listed = false;
  for (const auto& a : w.shelterListings()) listed = listed || (a.at("id") == dog && a.at("brought_back") == true);
  CHECK(listed);
  advanceTo(w, 10);
  walkInto(w, "dominique", "paws_whiskers");
  CHECK(code(w.adoptPet("dominique", dog, "", "card")) == "refused");
  walkInto(w, "dax", "paws_whiskers");
  REQUIRE(w.adoptPet("dax", dog, "", "card"));
  CHECK(p->owner == "dax");
  CHECK(p->home == "maple_court_3b");
  CHECK(p->takenFrom.empty());
}

TEST_CASE("pets: left to waste away, the pet is taken too; the household is warned first") {
  // Hunger holds steady here; it's the pet's health that gives out.
  auto db = quietContent([](Json& doc, const std::string& file) {
    if (file != "pets.json") return;
    for (auto& s : doc["pets"]["species"]) s["needs_per_hour"] = Json{{"health", -8}};
  });
  World w = morningWorld(db);
  const std::string dog = adopt(w, "dominique", "dog");
  walkInto(w, "dominique", "lexington_1204");
  int hours = 0;
  while (!w.pet(dog)->owner.empty() && hours < 48) {
    w.advanceMinutes(60);
    ++hours;
    if (!w.pet(dog)->owner.empty()) CHECK(w.pet(dog)->needs.at("hunger") > 0);
  }
  const PetState* p = w.pet(dog);
  CHECK(p->owner.empty());
  CHECK(p->takenFrom == "dominique");
  CHECK(!p->healthWarned);
  CHECK(notified(w, "dominique", p->name + " is very weak"));
  CHECK(notified(w, "dominique", "too ill for too long"));
  CHECK(!notified(w, "dominique", "is starving"));
  CHECK(remembers(w, "dominique", "lost_pet"));
}

TEST_CASE("pets: pets fall ill now and then; the vet diagnoses, vaccinates and treats, for a fee") {
  auto db = quietContent([](Json& doc, const std::string& file) {
    if (file != "pets.json") return;
    doc["pets"]["sickness"]["chance_per_hour"] = 1.0;
    doc["pets"]["sickness"]["vaccinated_multiplier"] = 1.0;
    doc["pets"]["adoption_vaccine_days"] = 0;
  });
  World w = World::createNew(db);
  REQUIRE(w.connect("dominique"));
  REQUIRE(w.connect("dax"));
  // Dax takes a job at the animal hospital, which opens at 8.
  advanceTo(w, 8);
  walkInto(w, "dax", "founders_animal_hospital");
  REQUIRE(w.applyForJob("dax", "veterinary"));
  REQUIRE(w.startShift("dax"));
  advanceTo(w, 10);
  const std::string dog = adopt(w, "dominique", "dog");
  CHECK(code(w.vetVisit("dominique", dog, "checkup", "card")) == "wrong_place");
  walkInto(w, "dominique", "founders_animal_hospital");
  REQUIRE(w.pet(dog)->illness.empty());
  CHECK(code(w.vetVisit("dominique", dog, "treatment", "card")) == "not_sick");
  CHECK(code(w.vetVisit("dominique", dog, "surgery", "card")) == "unknown_service");
  CHECK(code(w.vetVisit("dominique", dog, "checkup", "bitcoin")) == "invalid_payment");
  CHECK(code(w.vetVisit("dax", dog, "checkup", "card")) == "not_your_pet");
  REQUIRE(w.vetVisit("dominique", dog, "vaccines", "card"));
  CHECK(w.pet(dog)->vaccinatedUntil > w.now() + 300 * kMinutesPerDay);
  CHECK(code(w.vetVisit("dominique", dog, "vaccines", "card")) == "already_vaccinated");
  auto healthy = w.vetVisit("dominique", dog, "checkup", "card");
  REQUIRE(healthy);
  CHECK(healthy.value().at("diagnosis") == "healthy");

  // On the hour, they come down with something (every hour, in this test).
  w.advanceMinutes(60 - w.now() % 60);
  REQUIRE(!w.pet(dog)->illness.empty());
  CHECK(notified(w, "dominique", "seems unwell"));
  Json mine = w.openPhoneApp("dominique", "pets").value().at("pets").at(0);
  CHECK(mine.at("sick") == true);
  CHECK(!mine.contains("illness"));  // nobody knows what it is yet

  const Cents before = bank(w, "dominique");
  const Cents till = w.state().ledger.balance("org:founders_animal_hospital");
  const Cents daxBefore = bank(w, "dax");
  auto diagnosis = w.vetVisit("dominique", dog, "checkup", "card");
  REQUIRE(diagnosis);
  CHECK(diagnosis.value().at("diagnosis") != "healthy");
  mine = w.openPhoneApp("dominique", "pets").value().at("pets").at(0);
  CHECK(mine.at("illness") == diagnosis.value().at("diagnosis"));
  const double health = w.pet(dog)->needs.at("health");
  auto treated = w.vetVisit("dominique", dog, "treatment", "card");
  REQUIRE(treated);
  CHECK(treated.value().at("treated") == diagnosis.value().at("diagnosis"));
  CHECK(w.pet(dog)->illness.empty());
  CHECK(w.pet(dog)->needs.at("health") >= std::min(100.0, health + 29));
  const Cents paid = 6500 + 18000;
  const Cents share = 650 + 1800;  // Dax's 10% on duty
  CHECK(bank(w, "dominique") == before - paid);
  CHECK(w.state().ledger.balance("org:founders_animal_hospital") == till + paid - share);
  CHECK(bank(w, "dax") == daxBefore + share);
  CHECK(treated.value().contains("seen_by"));
  advanceTo(w, 20);
  CHECK(code(w.vetVisit("dominique", dog, "checkup", "card")) == "closed");
}

TEST_CASE("pets: pets grow up on the calendar") {
  auto db = quietContent([](Json& doc, const std::string& file) {
    if (file != "pets.json") return;
    for (auto& s : doc["pets"]["species"]) s["shelter_age_months"] = Json::array({11, 11});
  });
  World w = morningWorld(db);
  const std::string dog = adopt(w, "dominique", "dog");
  CHECK(w.petAgeMonths(*w.pet(dog)) == 11);
  CHECK(w.petStageOf(*w.pet(dog)) == "puppy");
  w.disconnect("dominique");
  for (int d = 0; d < 30 && w.petStageOf(*w.pet(dog)) == "puppy"; ++d) w.advanceMinutes(kMinutesPerDay);
  w.advanceMinutes(60);
  CHECK(w.petStageOf(*w.pet(dog)) == "adult");
  CHECK(w.petAgeMonths(*w.pet(dog)) == 12);
  CHECK(notified(w, "dominique", "growing up"));
  CHECK(w.pet(dog)->owner == "dominique");
}

// ---------------------------------------------------------------------------------
// Medicine
// ---------------------------------------------------------------------------------
TEST_CASE("medicine: over-the-counter medicine eases what it's for and counts toward a daily limit") {
  World w = World::createNew(petContent());
  REQUIRE(w.connect("dominique"));
  advanceTo(w, 9);
  REQUIRE(w.devAddCondition("dominique", "seasonal_allergies"));
  const GameMinutes until = w.character("dominique")->conditions.at(0).until;
  walkInto(w, "dominique", "riverdale_pharmacy");
  auto bought = w.buy("dominique", "allergy_relief", "card");
  REQUIRE(bought);
  CHECK(bought.value().at("owned") == 10);
  CHECK(!bought.value().contains("prescription"));  // over the counter
  auto used = w.useItem("dominique", "allergy_relief");
  REQUIRE(used);
  CHECK(used.value().at("dose").at("doses_today") == 1);
  CHECK(used.value().at("dose").at("daily_limit") == 2);
  if (w.hasCondition("dominique", "seasonal_allergies")) CHECK(w.character("dominique")->conditions.at(0).until == until - 48 * 60);
  Json health = w.openPhoneApp("dominique", "health").value();
  REQUIRE(health.at("medicine_today").size() == 1);
  CHECK(health.at("medicine_today").at(0).at("doses") == 1);
  // Antacid for heartburn, which never lasts more than ten hours.
  REQUIRE(w.devAddCondition("dominique", "heartburn"));
  REQUIRE(w.buy("dominique", "antacid", "card"));
  GameMinutes burnsUntil = -1;
  for (const auto& k : w.character("dominique")->conditions) {
    if (k.id == "heartburn") burnsUntil = k.until;
  }
  REQUIRE(w.useItem("dominique", "antacid"));
  bool stillBurns = false;
  for (const auto& k : w.character("dominique")->conditions) {
    if (k.id == "heartburn") {
      stillBurns = true;
      CHECK(k.until == burnsUntil - 6 * 60);
    }
  }
  if (!stillBurns) CHECK(notified(w, "dominique", "heartburn: you're feeling better"));
}

TEST_CASE("medicine: prescription medicine needs a prescription, written when a doctor diagnoses what it treats") {
  World w = World::createNew(petContent());
  REQUIRE(w.connect("dominique"));
  advanceTo(w, 9);
  walkInto(w, "dominique", "riverdale_pharmacy");
  CHECK(code(w.buy("dominique", "antibiotics", "card")) == "needs_prescription");
  REQUIRE(w.devAddCondition("dominique", "strep_throat"));
  const Cents before = bank(w, "dominique");
  CHECK(code(w.buy("dominique", "antibiotics", "card")) == "needs_prescription");  // nobody has diagnosed it
  CHECK(bank(w, "dominique") == before);
  walkInto(w, "dominique", "riverdale_clinic");
  auto checkup = w.buy("dominique", "checkup", "card");
  REQUIRE(checkup);
  const Json& rx = checkup.value().at("care").at("prescriptions");
  REQUIRE(rx.size() == 1);
  CHECK(rx.at(0).at("medicine") == "antibiotics");
  CHECK(rx.at(0).at("refills_left") == 2);
  CHECK(notified(w, "dominique", "prescribed Antibiotics for strep throat"));
  // A second checkup doesn't stack another one on top.
  auto again = w.buy("dominique", "checkup", "card");
  REQUIRE(again);
  CHECK(!again.value().at("care").contains("prescriptions"));
  CHECK(w.character("dominique")->prescriptions.size() == 1);

  walkInto(w, "dominique", "riverdale_pharmacy");
  auto filled = w.buy("dominique", "antibiotics", "card");
  REQUIRE(filled);
  CHECK(filled.value().at("owned") == 6);
  CHECK(filled.value().at("prescription").at("refills_left") == 1);
  // A course of antibiotics clears it up.
  for (int i = 0; i < 3 && w.hasCondition("dominique", "strep_throat"); ++i) {
    auto dose = w.useItem("dominique", "antibiotics");
    REQUIRE(dose);
    CHECK(!dose.value().at("dose").contains("overdose"));
    w.advanceMinutes(480);
  }
  CHECK(!w.hasCondition("dominique", "strep_throat"));
  Json health = w.openPhoneApp("dominique", "health").value();
  REQUIRE(health.at("prescriptions").size() == 1);
  CHECK(health.at("prescriptions").at(0).at("label") == "Antibiotics");
  CHECK(health.at("prescriptions").at(0).at("refills_left") == 1);
  CHECK(health.at("prescriptions").at(0).at("status") == "valid");
  CHECK(health.at("prescriptions").at(0).at("written_by") == "Riverdale Clinic");
}

TEST_CASE("medicine: refills run out, and prescriptions expire") {
  World w = World::createNew(petContent());
  REQUIRE(w.connect("dominique"));
  advanceTo(w, 9);
  REQUIRE(w.devAddCondition("dominique", "strep_throat"));
  REQUIRE(w.devAddCondition("dominique", "flu"));
  walkInto(w, "dominique", "riverdale_clinic");
  auto checkup = w.buy("dominique", "checkup", "card");
  REQUIRE(checkup);
  CHECK(checkup.value().at("care").at("prescriptions").size() == 2);  // antibiotics and antivirals
  walkInto(w, "dominique", "riverdale_pharmacy");
  REQUIRE(w.buy("dominique", "antibiotics", "card"));
  REQUIRE(w.buy("dominique", "antibiotics", "card"));
  CHECK(code(w.buy("dominique", "antibiotics", "card")) == "no_refills_left");
  // The antivirals go unfilled for more than the two weeks they're good for.
  w.disconnect("dominique");
  w.advanceMinutes(15 * kMinutesPerDay);
  REQUIRE(w.connect("dominique"));
  advanceTo(w, 10);
  CHECK(code(w.buy("dominique", "antivirals", "card")) == "prescription_expired");
  CHECK(notified(w, "dominique", "Antivirals expired with 1 fill unused"));
  // A week later it's off the books altogether.
  w.advanceMinutes(8 * kMinutesPerDay);
  advanceTo(w, 10);
  CHECK(code(w.buy("dominique", "antivirals", "card")) == "needs_prescription");
}

TEST_CASE("medicine: more than the daily limit is an overdose; keep going and it's the ER") {
  World w = World::createNew(petContent());
  REQUIRE(w.connect("dominique"));
  advanceTo(w, 8);
  walkInto(w, "dominique", "riverdale_pharmacy");
  REQUIRE(w.buy("dominique", "painkillers", "card"));  // six
  for (int i = 0; i < 4; ++i) {
    auto r = w.useItem("dominique", "painkillers");
    REQUIRE(r);
    CHECK(!r.value().at("dose").contains("overdose"));
    CHECK(r.value().at("dose").contains("warning") == (i == 3));  // the fourth is the limit
    w.advanceMinutes(240);
  }
  const double health = w.character("dominique")->needs.at("health");
  auto fifth = w.useItem("dominique", "painkillers");
  REQUIRE(fifth);
  CHECK(fifth.value().at("dose").at("overdose") == true);
  CHECK(!fifth.value().at("dose").contains("emergency"));
  CHECK(w.character("dominique")->needs.at("health") <= health - 29);
  CHECK(notified(w, "dominique", "than is safe in a day"));
  CHECK(w.character("dominique")->inside == "riverdale_pharmacy");
  w.advanceMinutes(240);
  const Cents before = bank(w, "dominique");
  const Cents er = w.state().ledger.balance("org:livera_general");
  auto sixth = w.useItem("dominique", "painkillers");
  REQUIRE(sixth);
  CHECK(sixth.value().at("dose").at("emergency") == true);
  CHECK(w.character("dominique")->inside == "livera_general");
  CHECK(bank(w, "dominique") == before - 45000);
  CHECK(w.state().ledger.balance("org:livera_general") == er + 45000);
  CHECK(w.character("dominique")->needs.at("health") >= 30);
  CHECK(notified(w, "dominique", "rushed to"));
  CHECK(remembers(w, "dominique", "overdose"));
  // A day on (at home, where her phone charges), the count starts over.
  walkInto(w, "dominique", "lexington_1204");
  w.advanceMinutes(kMinutesPerDay);
  CHECK(w.openPhoneApp("dominique", "health").value().at("medicine_today").empty());
  w.advanceMinutes(60);
  CHECK(w.character("dominique")->medicineDoses.empty());  // and the old doses are forgotten
}

TEST_CASE("medicine: a sleep aid is fine on its own, but after a drink it knocks you out and lands you in the ER") {
  {
    World w = World::createNew(petContent());
    REQUIRE(w.connect("dominique"));
    advanceTo(w, 16);
    walkInto(w, "dominique", "riverdale_pharmacy");
    REQUIRE(w.buy("dominique", "sleep_aid", "card"));
    auto r = w.useItem("dominique", "sleep_aid");
    REQUIRE(r);
    CHECK(!r.value().at("dose").contains("mixed_with"));
    CHECK(w.character("dominique")->inside == "riverdale_pharmacy");
  }
  World w = World::createNew(petContent());
  REQUIRE(w.connect("dominique"));
  advanceTo(w, 16);
  walkInto(w, "dominique", "riverdale_pharmacy");
  REQUIRE(w.buy("dominique", "sleep_aid", "card"));
  walkInto(w, "dominique", "copper_tap");
  REQUIRE(w.buy("dominique", "beer", "card"));
  const double energy = w.character("dominique")->needs.at("energy");
  const double health = w.character("dominique")->needs.at("health");
  auto r = w.useItem("dominique", "sleep_aid");
  REQUIRE(r);
  CHECK(r.value().at("dose").at("mixed_with") == "alcohol");
  CHECK(r.value().at("dose").at("emergency") == true);
  CHECK(w.character("dominique")->inside == "livera_general");
  CHECK(w.character("dominique")->needs.at("energy") <= std::max(0.0, energy - 55));
  CHECK(w.character("dominique")->needs.at("health") < health);
  CHECK(notified(w, "dominique", "sleep aid with alcohol in your system"));
}

// ---------------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------------
TEST_CASE("pets and medicine: saved and loaded with the world; older saves load as defaults") {
  auto db = petContent();
  World w = morningWorld(db);
  const std::string dog = adopt(w, "dominique", "dog");
  REQUIRE(w.buy("dominique", "pet_food", "card"));
  REQUIRE(w.devAddCondition("dominique", "strep_throat"));
  walkInto(w, "dominique", "riverdale_clinic");
  REQUIRE(w.buy("dominique", "checkup", "card"));
  walkInto(w, "dominique", "riverdale_pharmacy");
  REQUIRE(w.buy("dominique", "antibiotics", "card"));
  REQUIRE(w.useItem("dominique", "antibiotics"));
  walkInto(w, "dominique", "lexington_1204");
  REQUIRE(w.careForPet("dominique", dog, "feed"));  // last, so the dog was just fed when the world is saved
  w.disconnect("dominique");

  auto path = tempPath("pets.db");
  {
    auto store = SqliteStore::open(path.string());
    REQUIRE(store);
    REQUIRE(store.value()->saveWorld(w.state()));
  }
  auto store = SqliteStore::open(path.string());
  REQUIRE(store);
  auto loaded = store.value()->loadWorld();
  REQUIRE(loaded);
  const WorldState& s = loaded.value();
  REQUIRE(s.pets.count(dog));
  const PetState& a = w.state().pets.at(dog);
  const PetState& b = s.pets.at(dog);
  CHECK(b.name == a.name);
  CHECK(b.species == a.species);
  CHECK(b.breed == a.breed);
  CHECK(b.owner == "dominique");
  CHECK(b.home == a.home);
  CHECK(b.bornAt == a.bornAt);
  CHECK(b.needs == a.needs);
  CHECK(b.bond == a.bond);
  CHECK(b.vaccinatedUntil == a.vaccinatedUntil);
  CHECK(b.readyAt == a.readyAt);
  CHECK(b.stage == a.stage);
  CHECK(s.adoptedListings == w.state().adoptedListings);
  CHECK(s.shelterWeek == w.state().shelterWeek);
  const CharacterState& before = w.state().characters.at("dominique");
  const CharacterState& after = s.characters.at("dominique");
  REQUIRE(after.prescriptions.size() == 1);
  CHECK(after.prescriptions.at(0).medicine == "antibiotics");
  CHECK(after.prescriptions.at(0).refillsLeft == before.prescriptions.at(0).refillsLeft);
  CHECK(after.prescriptions.at(0).expiresAt == before.prescriptions.at(0).expiresAt);
  CHECK(after.prescriptions.at(0).writtenBy == "Riverdale Clinic");
  CHECK(after.medicineDoses == before.medicineDoses);
  CHECK(after.medicineDoses.at("antibiotics").size() == 1);
  // Every field of a pet survives the world part, the ones left at defaults above too.
  PetState odd = a;
  odd.illness = "kennel_cough";
  odd.illnessKnown = true;
  odd.adoptedAt = 77;
  odd.starvingSince = 123;
  odd.hungerWarned = true;
  odd.healthWarned = true;
  odd.takenFrom = "dax";
  WorldState full;
  full.pets[odd.id] = odd;
  WorldState back;
  petsPartFromJson(back, petsPartToJson(full));
  REQUIRE(back.pets.count(odd.id));
  const PetState& r = back.pets.at(odd.id);
  CHECK(r.illness == "kennel_cough");
  CHECK(r.illnessKnown);
  CHECK(r.adoptedAt == 77);
  CHECK(r.starvingSince == 123);
  CHECK(r.hungerWarned);
  CHECK(r.healthWarned);
  CHECK(r.takenFrom == "dax");

  // The loaded world carries on: the dog still knows it was just fed.
  World again(db, s);
  REQUIRE(again.connect("dominique"));
  walkInto(again, "dominique", "lexington_1204");
  CHECK(code(again.careForPet("dominique", dog, "feed")) == "too_soon");
  CHECK(code(again.careForPet("dominique", dog, "play")) == "(ok)");

  // Saves from before pets and prescriptions existed.
  WorldState old;
  petsPartFromJson(old, Json::object());
  CHECK(old.pets.empty());
  CHECK(old.adoptedListings.empty());
  CHECK(old.shelterWeek == -1);
  CharacterState c;
  readPetsCharacter(c, Json::object());
  CHECK(c.prescriptions.empty());
  CHECK(c.medicineDoses.empty());
  Json none = Json::object();
  writePetsCharacter(c, none);
  CHECK(!none.contains("pets"));  // nothing to save, nothing written
}

// ---------------------------------------------------------------------------------
// Over the network
// ---------------------------------------------------------------------------------
namespace {

std::shared_ptr<const ContentDatabase> fastPetContent() {
  static auto db = quietContent([](Json& doc, const std::string& file) {
    if (file == "simulation.json") doc["simulation"]["walk_speed_mps"] = 400.0;
  });
  return db;
}

class PetServer {
 public:
  explicit PetServer(const std::string& db) {
    ServerConfig cfg;
    cfg.port = 0;
    cfg.dbPath = db;
    cfg.content = fastPetContent();
    cfg.devCommands = true;
    cfg.passwordIterations = 1000;
    cfg.autosaveSeconds = 3600;
    auto s = Server::create(cfg);
    if (!s) throw std::runtime_error("server failed: " + s.error().message);
    server_ = std::move(s).value();
    port_ = server_->port();
    thread_ = std::thread([this] { server_->run(stop_); });
  }
  ~PetServer() {
    stop_ = true;
    if (thread_.joinable()) thread_.join();
  }
  std::uint16_t port() const { return port_; }

 private:
  std::unique_ptr<Server> server_;
  std::uint16_t port_ = 0;
  std::atomic<bool> stop_{false};
  std::thread thread_;
};

class PetClient {
 public:
  explicit PetClient(std::uint16_t port) {
    auto fd = net::connectTcp("127.0.0.1", port);
    if (!fd) throw std::runtime_error("connect failed");
    fd_ = std::move(fd).value();
  }
  Json call(Json req) {
    req["id"] = ++id_;
    if (!net::sendAll(fd_, req.dump() + "\n")) throw std::runtime_error("send failed");
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(10);
    while (std::chrono::steady_clock::now() < deadline) {
      auto line = net::readLine(fd_, buffer_, 100);
      if (!line) throw std::runtime_error("connection lost: " + line.error().message);
      if (!line.value()) continue;
      Json msg = Json::parse(*line.value());
      if (msg.contains("event")) continue;
      if (msg.value("re", Json()) == Json(id_)) return msg;
    }
    throw std::runtime_error("timed out waiting for reply");
  }
  Json ok(Json req) {
    Json r = call(req);
    if (!r.value("ok", false)) throw std::runtime_error("refused: " + req.dump() + " -> " + r.dump());
    return r["data"];
  }
  std::string refusal(Json req) {
    Json r = call(std::move(req));
    return r.value("ok", false) ? std::string("(accepted)") : r["error"]["code"].get<std::string>();
  }
  // Walks over and goes in, polling gently (the server rate-limits each connection).
  void walkInto(const std::string& place) {
    if (ok({{"op", "look"}})["you"]["inside"] != "") ok({{"op", "exit"}});
    ok({{"op", "move"}, {"location", place}});
    for (int i = 0; i < 100; ++i) {
      std::this_thread::sleep_for(std::chrono::milliseconds(100));
      if (!ok({{"op", "look"}})["you"]["moving"].get<bool>()) break;
    }
    ok({{"op", "enter"}, {"location", place}});
  }

 private:
  net::Fd fd_;
  net::LineBuffer buffer_;
  long id_ = 0;
};

}  // namespace

TEST_CASE("pets: adopting, caring and the vet work over the network") {
  const std::string db = tempPath("pets_net.db").string();
  PetServer server(db);
  PetClient dom(server.port());
  dom.ok({{"op", "register"}, {"username", "dom"}, {"password", "livera-pass-1"}});
  dom.ok({{"op", "login"}, {"username", "dom"}, {"password", "livera-pass-1"}});
  dom.ok({{"op", "play"}, {"character", "dominique"}});
  CHECK(dom.refusal({{"op", "adopt"}, {"pet", "w0-2"}}) == "wrong_place");
  dom.ok({{"op", "dev_advance"}, {"minutes", 180}});  // 10:00, the shelter opens
  dom.walkInto("paws_whiskers");
  Json app = dom.ok({{"op", "phone"}, {"app", "pets"}});
  CHECK(app["pets"].empty());
  CHECK(app["shelter"]["open"] == true);
  REQUIRE(app["shelter"]["animals"].size() == 4);
  std::string dogId;
  for (const auto& a : app["shelter"]["animals"]) {
    if (a["species"] == "dog") dogId = a["id"].get<std::string>();
  }
  REQUIRE(!dogId.empty());
  dom.ok({{"op", "buy"}, {"offer", "pet_food"}});
  Json adopted = dom.ok({{"op", "adopt"}, {"pet", dogId}, {"name", "Rocket"}});
  CHECK(adopted["name"] == "Rocket");
  CHECK(adopted["yours"] == true);
  CHECK(dom.refusal({{"op", "adopt"}, {"pet", dogId}}) == "unknown_pet");
  dom.walkInto("lexington_1204");
  Json fed = dom.ok({{"op", "pet"}, {"pet", "Rocket"}, {"action", "feed"}});
  CHECK(fed["action"] == "Feed");
  CHECK(dom.refusal({{"op", "pet"}, {"pet", "Rocket"}, {"action", "feed"}}) == "too_soon");
  CHECK(dom.refusal({{"op", "pet"}, {"pet", "Rocket"}, {"action", "walk"}}) == "go_outside");
  dom.walkInto("founders_animal_hospital");
  Json seen = dom.ok({{"op", "vet"}, {"pet", "Rocket"}, {"service", "checkup"}});
  CHECK(seen["diagnosis"] == "healthy");
  CHECK(dom.refusal({{"op", "vet"}, {"pet", "Rocket"}, {"service", "treatment"}}) == "not_sick");
  app = dom.ok({{"op", "phone"}, {"app", "pets"}});
  REQUIRE(app["pets"].size() == 1);
  CHECK(app["pets"][0]["name"] == "Rocket");
  CHECK(app["pets"][0]["stage"].is_string());
  CHECK(dom.ok({{"op", "phone"}, {"app", "health"}})["prescriptions"].is_array());
}
