#include "TestSupport.h"
#include "core/Clock.h"
#include "core/Serialization.h"

using namespace livera;
using namespace livera::test;

namespace {

// Quiet health; crime detection and chances set per test.
std::shared_ptr<const ContentDatabase> crimeContent(const std::function<void(Json&)>& crimes = {},
                                                    const std::function<void(Json&, const std::string&)>& extra = {}) {
  return patchedContent([&](Json& doc, const std::string& file) {
    if (file == "conditions.json") {
      for (auto& c : doc["conditions"]) {
        if (c.contains("catch")) c["catch"] = Json{{"hourly_chance", 0.0}};
      }
    }
    if (file == "crimes.json" && crimes) crimes(doc["crime"]);
    if (extra) extra(doc, file);
  });
}

void setCrime(Json& crime, const std::string& id, double detection) {
  for (auto& c : crime["crimes"]) {
    if (c["id"] == id) c["detection"] = detection, c["per_witness"] = 0.0, c["per_staff"] = 0.0, c["per_police"] = 0.0;
  }
}

World crimeWorld(std::shared_ptr<const ContentDatabase> db) {
  World w = World::createNew(std::move(db));
  for (const char* id : {"dominique", "aaliyah", "andre"}) REQUIRE(w.connect(id));
  w.advanceMinutes(3 * 60);  // 10:00
  (void)w.drainEvents();
  return w;
}

bool notified(const World& w, const CharacterId& id, const std::string& fragment) {
  for (const auto& n : w.state().notifications) {
    if (n.recipient == id && n.text.find(fragment) != std::string::npos) return true;
  }
  return false;
}

}  // namespace

TEST_CASE("crime: shoplifting you get away with costs nothing") {
  World w = crimeWorld(crimeContent([](Json& c) { setCrime(c, "shoplifting", 0.0); }));
  walkInto(w, "andre", "thread_co");
  const Cents bank = w.state().ledger.balance(bankAccountOf("andre"));
  auto r = w.steal("andre", "sunglasses");
  REQUIRE(r);
  CHECK(r.value().at("caught") == false);
  CHECK(w.owns("andre", "sunglasses"));
  CHECK(w.state().ledger.balance(bankAccountOf("andre")) == bank);
  CHECK(w.character("andre")->record.empty());
}

TEST_CASE("crime: caught shoplifting means a fine, a cell, a record, and witnesses who remember") {
  World w = crimeWorld(crimeContent([](Json& c) { setCrime(c, "shoplifting", 1.0); }));
  walkInto(w, "andre", "thread_co");
  walkInto(w, "aaliyah", "thread_co");
  const Cents bank = w.state().ledger.balance(bankAccountOf("andre"));
  const double trust = w.relationshipValue("aaliyah", "andre", "trust");
  auto r = w.steal("andre", "streetwear_set");
  REQUIRE(r);
  CHECK(r.value().at("caught") == true);
  CHECK(r.value().at("fine_cents") == 25000);
  CHECK(!w.owns("andre", "streetwear_set"));
  CHECK(w.state().ledger.balance(bankAccountOf("andre")) == bank - 25000);
  CHECK(w.character("andre")->record.size() == 1);
  CHECK(w.inJail("andre"));
  CHECK(w.character("andre")->inside == "police_station");
  CHECK(w.exitBuilding("andre").error().code == "in_jail");
  CHECK(w.moveTo("andre", Vec2{500, 500}).error().code == "in_jail");
  CHECK(w.relationshipValue("aaliyah", "andre", "trust") < trust);
  bool saw = false;
  for (const Memory* m : w.memoriesOf("aaliyah")) saw |= m->type == "saw_crime" && m->about == "andre";
  CHECK(saw);
  CHECK(w.openPhoneApp("andre", "record").value().at("clean") == false);
  w.advanceMinutes(5 * 60);  // four hours served
  CHECK(!w.inJail("andre"));
  CHECK(notified(w, "andre", "served your time"));
  REQUIRE(w.exitBuilding("andre"));
}

TEST_CASE("crime: if you can't pay the fine you serve longer") {
  World w = crimeWorld(crimeContent([](Json& c) {
    setCrime(c, "shoplifting", 1.0);
    for (auto& k : c["crimes"]) {
      if (k["id"] == "shoplifting") k["fine_cents"] = 100000000;
    }
  }));
  walkInto(w, "andre", "thread_co");
  auto r = w.steal("andre", "sunglasses");
  REQUIRE(r);
  CHECK(r.value().at("fine_cents") == 0);
  CHECK(r.value().at("jail_minutes") == 240 * 2 + 240);
}

TEST_CASE("crime: pickpocketing; a victim who notices reports you, and patrols find you") {
  World w = crimeWorld(crimeContent([](Json& c) {
    setCrime(c, "pickpocketing", 0.0);
    c["pickpocket_notice_chance"] = 1.0;
    c["patrol_arrest_per_hour"] = 1.0;
  }));
  walkInto(w, "andre", "heritage_coffee");
  CHECK(w.pickpocket("andre", "dominique").error().code == "too_far");
  walkInto(w, "dominique", "heritage_coffee");
  const Cents cash = w.state().ledger.balance(cashAccountOf("dominique"));
  auto r = w.pickpocket("andre", "dominique");
  REQUIRE(r);
  const Cents taken = r.value().at("stolen_cents").get<Cents>();
  CHECK(taken > 0);
  CHECK(w.state().ledger.balance(cashAccountOf("dominique")) == cash - taken);
  CHECK(w.pickpocket("andre", "dominique").error().code == "too_soon");
  CHECK(notified(w, "dominique", "Andre Campbell picked your pocket"));
  CHECK(w.character("andre")->wantedFor == "pickpocketing");
  CHECK(w.relationshipValue("dominique", "andre", "trust") < 0);
  // Out in the open, a patrol picks him up.
  REQUIRE(w.exitBuilding("andre"));
  w.advanceMinutes(60);
  CHECK(w.inJail("andre"));
  CHECK(w.character("andre")->wantedFor.empty());
  CHECK(w.state().ledger.sumOfBalances() == 0);
}

TEST_CASE("crime: an unnoticed theft leaves the victim guessing") {
  World w = crimeWorld(crimeContent([](Json& c) {
    setCrime(c, "pickpocketing", 0.0);
    c["pickpocket_notice_chance"] = 0.0;
  }));
  walkInto(w, "andre", "heritage_coffee");
  walkInto(w, "dominique", "heritage_coffee");
  REQUIRE(w.pickpocket("andre", "dominique"));
  CHECK(notified(w, "dominique", "You don't know where it went"));
  CHECK(w.character("andre")->wantedFor.empty());
}

TEST_CASE("police: officers on duty patrol outdoors and arrest wanted people") {
  auto db = crimeContent(
      [](Json& c) {
        setCrime(c, "pickpocketing", 0.0);
        c["pickpocket_notice_chance"] = 1.0;
        c["patrol_arrest_per_hour"] = 0.0;
      },
      [](Json& doc, const std::string& file) {
        if (file == "more_careers.json") {
          for (auto& car : doc["careers"]) {
            if (car["id"] == "police") car.erase("requires_degree");
          }
        }
      });
  World w = crimeWorld(db);
  walkTo(w, "aaliyah", "police_station");
  REQUIRE(w.applyForJob("aaliyah", "police"));
  REQUIRE(w.enter("aaliyah", "police_station"));
  REQUIRE(w.startShift("aaliyah"));
  REQUIRE(w.exitBuilding("aaliyah"));
  CHECK(w.character("aaliyah")->career.shiftStartedAt.has_value());  // still on duty outside
  // Andre lifts Dominique's cash on the street; she sees him.
  walkTo(w, "andre", "heritage_coffee");
  walkTo(w, "dominique", "heritage_coffee");
  REQUIRE(w.pickpocket("andre", "dominique"));
  CHECK(notified(w, "aaliyah", "Pickpocketing reported"));
  CHECK(w.arrest("aaliyah", "andre").error().code == "too_far");
  walkTo(w, "aaliyah", "heritage_coffee");
  CHECK(w.arrest("aaliyah", "dominique").error().code == "not_wanted");
  CHECK(w.arrest("andre", "dominique").error().code == "not_police");
  const Cents pay = w.state().ledger.balance(bankAccountOf("aaliyah"));
  auto r = w.arrest("aaliyah", "andre");
  REQUIRE(r);
  CHECK(w.inJail("andre"));
  CHECK(r.value().at("by") == "Aaliyah Baptiste");
  CHECK(w.state().ledger.balance(bankAccountOf("aaliyah")) > pay);
}

TEST_CASE("drugs: bought on the street after dark, they hit, then they crash") {
  World w = crimeWorld(crimeContent([](Json& c) { setCrime(c, "drug_purchase", 0.0); }));
  walkTo(w, "andre", "the_underpass");
  CHECK(w.buy("andre", "glint", "cash").error().code == "closed");  // nobody's selling in daylight
  w.advanceMinutes(10 * 60);  // 20:00
  REQUIRE(w.buy("andre", "glint", "cash"));
  CHECK(w.owns("andre", "glint"));
  const double energy = w.character("andre")->needs.at("energy");
  auto used = w.useItem("andre", "glint");
  REQUIRE(used);
  CHECK(used.value().at("effect").at("substance") == "Glint");
  CHECK(w.character("andre")->needs.at("energy") > energy);
  CHECK(w.character("andre")->highOn == "glint");
  CHECK(!w.owns("andre", "glint"));
  const double high = w.character("andre")->needs.at("energy");
  w.advanceMinutes(181);
  CHECK(w.character("andre")->highOn.empty());
  CHECK(w.character("andre")->needs.at("energy") < high - 30);  // the crash
}

TEST_CASE("drugs: the police catch buyers in the act") {
  World w = crimeWorld(crimeContent([](Json& c) { setCrime(c, "drug_purchase", 1.0); }));
  w.advanceMinutes(10 * 60);
  walkTo(w, "andre", "the_underpass");
  const Cents cash = w.state().ledger.balance(cashAccountOf("andre"));
  auto r = w.buy("andre", "velvet", "cash");
  REQUIRE(r);
  CHECK(r.value().at("caught") == true);
  CHECK(!w.owns("andre", "velvet"));
  CHECK(w.state().ledger.balance(cashAccountOf("andre")) == cash);  // the deal never happened
  CHECK(w.inJail("andre"));
}

TEST_CASE("drugs: dependency becomes addiction; rehab treats it; overdoses send you to the ER") {
  World w = crimeWorld(crimeContent([](Json& c) { setCrime(c, "drug_purchase", 0.0); }));
  w.advanceMinutes(10 * 60);
  walkTo(w, "andre", "the_underpass");
  for (int i = 0; i < 5; ++i) REQUIRE(w.buy("andre", "glint", "cash"));
  // A dose every few hours: 12 dependency each, addiction at 50.
  for (int i = 0; i < 5; ++i) {
    REQUIRE(w.useItem("andre", "glint"));
    w.advanceMinutes(4 * 60 + 1);  // outside the overdose window
  }
  CHECK(w.hasCondition("andre", "glint_addiction"));
  // Two doses of Velvet close together is an overdose.
  w.advanceMinutes(5 * 60);  // about 21:00 the next night
  walkTo(w, "andre", "the_underpass");
  REQUIRE(w.buy("andre", "velvet", "cash"));
  REQUIRE(w.buy("andre", "velvet", "cash"));
  REQUIRE(w.useItem("andre", "velvet"));
  w.advanceMinutes(31);
  auto od = w.useItem("andre", "velvet");
  REQUIRE(od);
  CHECK(od.value().at("effect").at("overdose") == true);
  CHECK(w.character("andre")->inside == "livera_general");
  CHECK(notified(w, "andre", "rushed to Livéra General"));
  // Rehab, at the hospital he's already in.
  w.advanceMinutes(6 * 60);
  auto rehab = w.buy("andre", "rehab", "card");
  REQUIRE(rehab);
  CHECK(!w.hasCondition("andre", "glint_addiction"));
  CHECK(w.character("andre")->dependency.at("glint") == 0);
}

TEST_CASE("drugs: alcohol is legal at the bar, and too much of it is an emergency too") {
  World w = crimeWorld(crimeContent());
  w.advanceMinutes(7 * 60);  // 17:00, the bar is open
  walkInto(w, "dominique", "copper_tap");
  auto beer = w.buy("dominique", "beer", "card");
  REQUIRE(beer);
  CHECK(w.character("dominique")->highOn == "alcohol");
  CHECK(w.character("dominique")->record.empty());
  for (int i = 0; i < 5; ++i) REQUIRE(w.buy("dominique", "cocktail", "card"));
  auto seventh = w.buy("dominique", "cocktail", "card");
  REQUIRE(seventh);
  CHECK(seventh.value().at("effect").at("overdose") == true);
  CHECK(w.character("dominique")->inside == "livera_general");
}

TEST_CASE("crime: getting arrested with drugs on you adds a possession charge") {
  World w = crimeWorld(crimeContent([](Json& c) {
    setCrime(c, "drug_purchase", 0.0);
    setCrime(c, "shoplifting", 1.0);
  }));
  w.advanceMinutes(10 * 60);
  walkTo(w, "andre", "the_underpass");
  REQUIRE(w.buy("andre", "haze", "cash"));
  w.advanceMinutes(13 * 60);  // the next morning, after Thread & Co. opens
  walkInto(w, "andre", "thread_co");
  auto r = w.steal("andre", "sunglasses");
  REQUIRE(r);
  CHECK(r.value().at("seized").at(0) == "Haze (one dose)");
  CHECK(!w.owns("andre", "haze"));
  REQUIRE(w.character("andre")->record.size() == 2);
  CHECK(w.character("andre")->record.at(1).crime == "drug_possession");
}

TEST_CASE("crime: jail time, warrants, highs and dependency are saved") {
  World w = crimeWorld(crimeContent());
  CharacterState c = *w.character("andre");
  c.jailedUntil = 5000;
  c.wantedFor = "pickpocketing";
  c.dependency["glint"] = 42;
  c.highOn = "glint";
  c.highUntil = 4321;
  const CharacterState back = characterStateFromJson(toJson(c));
  CHECK(back.jailedUntil == 5000);
  CHECK(back.wantedFor == "pickpocketing");
  CHECK(back.dependency.at("glint") == 42);
  CHECK(back.highOn == "glint");
  CHECK(back.highUntil == 4321);
}
