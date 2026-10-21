#include <fstream>

#include "TestSupport.h"
#include "core/Clock.h"
#include "core/Serialization.h"

using namespace livera;
using namespace livera::test;

namespace {

std::shared_ptr<const ContentDatabase> romanceContent(const std::function<void(Json&)>& romance = {},
                                                      const std::function<void(Json&, const std::string&)>& extra = {}) {
  return patchedContent([&](Json& doc, const std::string& file) {
    if (file == "conditions.json") {
      for (auto& c : doc["conditions"]) {
        if (c.contains("catch")) c["catch"]["hourly_chance"] = 0.0, c["catch"]["contagion_per_hour"] = 0.0;
      }
    }
    if (file == "romance.json" && romance) romance(doc["romance"]);
    if (extra) extra(doc, file);
  });
}

World loveWorld(std::shared_ptr<const ContentDatabase> db = romanceContent()) {
  World w = World::createNew(std::move(db));
  for (const char* id : {"dominique", "dax", "aaliyah"}) REQUIRE(w.connect(id));
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

std::string ask(World& w, const CharacterId& from, const std::string& kind, const CharacterId& to, bool protection = false) {
  auto r = w.request(from, kind, to, protection);
  if (!r) throw std::runtime_error(kind + " refused: " + r.error().message);
  return r.value().at("request").get<std::string>();
}

// Dax and Dominique: dating, then at her place.
void datingAtHome(World& w) {
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "dax", "heritage_coffee");
  REQUIRE(w.respond("dominique", ask(w, "dax", "date", "dominique"), true));
  walkInto(w, "dominique", "lexington_1204");
  walkInto(w, "dax", "lexington_1204");  // her partner can come over
}

}  // namespace

TEST_CASE("romance: asking someone out needs their yes") {
  World w = loveWorld();
  CHECK(w.request("dax", "date", "dominique").error().code == "too_far");
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "dax", "heritage_coffee");
  CHECK(w.request("dax", "date", "dax").error().code == "invalid_target");
  CHECK(w.request("dax", "elope", "dominique").error().code == "bad_request");
  const std::string first = ask(w, "dax", "date", "dominique");
  CHECK(notified(w, "dominique", "Dax is asking you out"));
  CHECK(w.request("dax", "date", "dominique").error().code == "already_asked");
  REQUIRE(w.respond("dominique", first, false));
  CHECK(notified(w, "dax", "Dominique said no."));
  CHECK(w.relationshipStatus("dax", "dominique").empty());
  CHECK(w.respond("dominique", first, true).error().code == "unknown_request");  // already answered
  const std::string second = ask(w, "dax", "date", "dominique");
  REQUIRE(w.respond("dominique", second, true));
  CHECK(w.relationshipStatus("dax", "dominique") == "dating");
  CHECK(w.relationshipStatus("dominique", "dax") == "dating");
  CHECK(w.request("dax", "date", "dominique").error().code == "already_together");
}

TEST_CASE("romance: asks expire") {
  World w = loveWorld();
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "dax", "heritage_coffee");
  const std::string id = ask(w, "dax", "kiss", "dominique");
  w.advanceMinutes(20);
  CHECK(w.respond("dominique", id, true).error().code == "unknown_request");
}

TEST_CASE("romance: propose with a ring, marry at a venue, and the guests remember") {
  World w = loveWorld();
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "dax", "heritage_coffee");
  CHECK(w.request("dax", "propose", "dominique").error().code == "not_dating");
  REQUIRE(w.respond("dominique", ask(w, "dax", "date", "dominique"), true));
  CHECK(w.request("dax", "propose", "dominique").error().code == "no_ring");
  walkInto(w, "dax", "lustre_jewelers");
  REQUIRE(w.buy("dax", "engagement_ring", "card"));
  walkInto(w, "dax", "heritage_coffee");
  REQUIRE(w.respond("dominique", ask(w, "dax", "propose", "dominique"), true));
  CHECK(w.relationshipStatus("dax", "dominique") == "engaged");
  CHECK(!w.owns("dax", "engagement_ring"));
  CHECK(w.owns("dominique", "engagement_ring"));
  CHECK(w.character("dominique")->accessory == "engagement_ring");
  CHECK(w.request("dax", "marry", "dominique").error().code == "wrong_place");
  for (const char* who : {"dax", "dominique", "aaliyah"}) walkInto(w, who, "greater_hope");
  const double fame = w.character("dax")->fame;
  REQUIRE(w.respond("dominique", ask(w, "dax", "marry", "dominique"), true));
  CHECK(w.relationshipStatus("dominique", "dax") == "married");
  CHECK(w.character("dax")->fame > fame);
  CHECK(notified(w, "aaliyah", "Dax and Dominique just got married."));
  bool guest = false;
  for (const Memory* m : w.memoriesOf("aaliyah")) guest |= m->type == "attended_wedding";
  CHECK(guest);
}

TEST_CASE("romance: intimacy is private, needs a yes, and protection needs something to use") {
  World w = loveWorld();
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "dax", "heritage_coffee");
  REQUIRE(w.respond("dominique", ask(w, "dax", "date", "dominique"), true));
  CHECK(w.request("dax", "intimacy", "dominique").error().code == "not_private");
  walkInto(w, "dominique", "lexington_1204");
  walkInto(w, "dax", "lexington_1204");
  CHECK(w.request("dax", "intimacy", "dominique", true).error().code == "no_protection");
  auto night = w.respond("dominique", ask(w, "dax", "intimacy", "dominique"), true);
  REQUIRE(night);
  CHECK(night.value().at("night").at("protection") == false);
  CHECK(notified(w, "dominique", "spent the night together"));
  bool privateMemory = false;
  for (const Memory* m : w.memoriesOf("dax")) privateMemory |= m->type == "intimacy" && !m->isPublic;
  CHECK(privateMemory);
  // Aaliyah, not his partner, can't get into Dominique's place.
  walkTo(w, "aaliyah", "lexington_1204");
  CHECK(w.enter("aaliyah", "lexington_1204").error().code == "no_access");
}

TEST_CASE("romance: infections pass between partners; protection and treatment change the odds") {
  auto db = romanceContent({}, [](Json& doc, const std::string& file) {
    if (file == "conditions.json") {
      for (auto& c : doc["conditions"]) {
        if (c["kind"] == "sti") c["catch"]["sexual_transmission"] = 1.0;
      }
    }
    if (file == "romance.json") doc["romance"]["sti_protection"] = 0.0;
  });
  World w = loveWorld(db);
  REQUIRE(w.devAddCondition("dax", "crimson_bloom"));
  REQUIRE(w.devAddCondition("dax", "silent_lace"));
  datingAtHome(w);
  walkInto(w, "dax", "riverdale_pharmacy");
  REQUIRE(w.buy("dax", "condoms", "card"));
  walkInto(w, "dax", "lexington_1204");
  REQUIRE(w.respond("dominique", ask(w, "dax", "intimacy", "dominique", true), true));
  CHECK(!w.hasCondition("dominique", "crimson_bloom"));  // protected
  CHECK(w.character("dax")->inventory.at("condoms") == 2);
  w.advanceMinutes(10);
  REQUIRE(w.respond("dominique", ask(w, "dax", "intimacy", "dominique"), true));
  CHECK(w.hasCondition("dominique", "crimson_bloom"));
  CHECK(notified(w, "dominique", "You have Crimson Bloom."));
  CHECK(w.hasCondition("dominique", "silent_lace"));
  CHECK(!notified(w, "dominique", "Silent Lace"));  // no symptoms: only a test finds it
  walkInto(w, "dominique", "riverdale_clinic");
  auto test = w.buy("dominique", "sti_test", "card");
  REQUIRE(test);
  CHECK(test.value().at("care").at("positive").size() == 2);
  REQUIRE(w.buy("dominique", "treatment", "card"));
  CHECK(!w.hasCondition("dominique", "crimson_bloom"));
  CHECK(!w.hasCondition("dominique", "silent_lace"));
}

TEST_CASE("romance: lifelong infections are managed, not cured") {
  World w = loveWorld();
  REQUIRE(w.devAddCondition("dax", "hollow_fever"));
  walkInto(w, "dax", "riverdale_clinic");
  REQUIRE(w.buy("dax", "sti_test", "card"));
  REQUIRE(w.buy("dax", "treatment", "card"));
  CHECK(w.hasCondition("dax", "hollow_fever"));
  CHECK(w.character("dax")->conditions.at(0).recovery == 100);  // managed
}

TEST_CASE("family: pregnancy, tests, prenatal care and the due date") {
  auto db = romanceContent([](Json& r) {
    r["conception_chance"] = 1.0;
    r["miscarriage_chance"] = 0.0;
    r["pregnancy_game_days"] = 20;
  });
  World w = loveWorld(db);
  datingAtHome(w);
  REQUIRE(w.respond("dominique", ask(w, "dax", "intimacy", "dominique"), true));
  REQUIRE(w.character("dominique")->pregnancy);
  CHECK(!w.character("dax")->pregnancy);  // Dax can't carry
  CHECK(w.character("dominique")->pregnancy->partner == "dax");
  walkInto(w, "dominique", "riverdale_pharmacy");
  REQUIRE(w.buy("dominique", "pregnancy_test", "card"));
  auto early = w.useItem("dominique", "pregnancy_test");
  REQUIRE(early);
  CHECK(early.value().at("effect").at("positive") == false);  // too soon to show
  w.advanceMinutes(11 * kMinutesPerDay);
  walkInto(w, "dominique", "riverdale_pharmacy");
  REQUIRE(w.buy("dominique", "pregnancy_test", "card"));
  auto later = w.useItem("dominique", "pregnancy_test");
  REQUIRE(later);
  CHECK(later.value().at("effect").at("positive") == true);
  walkInto(w, "dominique", "riverdale_clinic");
  auto visit = w.buy("dominique", "prenatal", "card");
  REQUIRE(visit);
  CHECK(w.character("dominique")->pregnancy->prenatalVisits == 1);
  walkInto(w, "dominique", "lexington_1204");  // 11 days out ran her phone flat: charge it at home first
  w.advanceMinutes(60);
  CHECK(w.openPhoneApp("dominique", "romance").value().contains("pregnancy"));
  walkInto(w, "dax", "riverdale_clinic");
  CHECK(w.buy("dax", "prenatal", "card").error().code == "not_pregnant");  // and not charged for it
}

TEST_CASE("family: a baby is born, named by a parent, and lives at home") {
  auto db = romanceContent([](Json& r) {
    r["conception_chance"] = 1.0;
    r["miscarriage_chance"] = 0.0;
    r["pregnancy_game_days"] = 2;
  });
  World w = loveWorld(db);
  datingAtHome(w);
  REQUIRE(w.respond("dominique", ask(w, "dax", "intimacy", "dominique"), true));
  REQUIRE(w.exitBuilding("dominique"));
  walkInto(w, "dominique", "livera_general");
  w.advanceMinutes(2 * kMinutesPerDay + 60);
  CHECK(!w.character("dominique")->pregnancy);
  CharacterId baby;
  for (const auto& [id, c] : w.state().characters) {
    if (!c.parents.empty()) baby = id;
  }
  REQUIRE(!baby.empty());
  CHECK(w.ageOf(baby) == 0);
  CHECK(w.lifeStageOf(baby) == "baby");
  CHECK((w.character(baby)->parents == std::vector<CharacterId>{"dominique", "dax"}));
  CHECK(w.definition(baby)->lastName == "Ashford");
  CHECK(!w.definition(baby)->playable);
  CHECK(notified(w, "dominique", "was born at Livéra General"));
  CHECK(notified(w, "dax", "was born"));
  CHECK(w.isFamily("dominique", baby));
  CHECK(w.nameBaby("aaliyah", baby, "Zara").error().code == "not_parent");
  CHECK(w.nameBaby("dax", baby, "Z@ra!").error().code == "invalid_name");
  auto named = w.nameBaby("dax", baby, "Zara");
  REQUIRE(named);
  CHECK(w.definition(baby)->firstName == "Zara");
  CHECK(notified(w, "dominique", "Your child's name is now Zara Ashford."));
  // Children are never part of romance.
  REQUIRE(w.connect(baby));
  walkInto(w, "dominique", "lexington_1204");
  CHECK(w.character(baby)->inside == "lexington_1204");
  CHECK(w.request("dominique", "kiss", baby).error().code == "not_allowed");
}

TEST_CASE("family: miscarriage and abortion end a pregnancy; an abortion stays private") {
  auto miscarry = romanceContent([](Json& r) {
    r["conception_chance"] = 1.0;
    r["miscarriage_chance"] = 1.0;
    r["symptoms_after_days"] = 0;
  });
  World w = loveWorld(miscarry);
  datingAtHome(w);
  REQUIRE(w.respond("dominique", ask(w, "dax", "intimacy", "dominique"), true));
  w.advanceMinutes(61);
  CHECK(!w.character("dominique")->pregnancy);
  CHECK(notified(w, "dominique", "You lost the pregnancy."));

  auto choice = romanceContent([](Json& r) {
    r["conception_chance"] = 1.0;
    r["miscarriage_chance"] = 0.0;
    r["test_detects_after_days"] = 0;
  });
  World v = loveWorld(choice);
  datingAtHome(v);
  REQUIRE(v.respond("dominique", ask(v, "dax", "intimacy", "dominique"), true));
  walkInto(v, "dominique", "riverdale_clinic");
  CHECK(v.buy("dominique", "abortion", "card").error().code == "not_pregnant");  // not confirmed yet
  auto check = v.buy("dominique", "checkup", "card");
  REQUIRE(check);
  CHECK(!check.value().at("care").contains("pregnant"));  // a checkup can't see it this early
  walkInto(v, "dominique", "riverdale_pharmacy");
  REQUIRE(v.buy("dominique", "pregnancy_test", "card"));
  REQUIRE(v.useItem("dominique", "pregnancy_test"));
  walkInto(v, "dominique", "riverdale_clinic");
  const std::size_t daxNotes = std::count_if(v.state().notifications.begin(), v.state().notifications.end(),
                                             [](const Notification& n) { return n.recipient == "dax"; });
  REQUIRE(v.buy("dominique", "abortion", "card"));
  CHECK(!v.character("dominique")->pregnancy);
  CHECK(notified(v, "dominique", "The procedure went smoothly"));
  CHECK(std::count_if(v.state().notifications.begin(), v.state().notifications.end(),
                      [](const Notification& n) { return n.recipient == "dax"; }) == static_cast<long>(daxNotes));
}

TEST_CASE("romance: breaking up and divorcing") {
  World w = loveWorld();
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "dax", "heritage_coffee");
  CHECK(w.endRelationship("dax", "dominique").error().code == "not_together");
  REQUIRE(w.respond("dominique", ask(w, "dax", "date", "dominique"), true));
  auto r = w.endRelationship("dominique", "dax");
  REQUIRE(r);
  CHECK(r.value().at("status") == "ex");
  CHECK(notified(w, "dax", "Dominique broke up with you."));
  // Married couples divorce, and it costs a filing fee.
  REQUIRE(w.respond("dominique", ask(w, "dax", "date", "dominique"), true));
  walkInto(w, "dax", "lustre_jewelers");
  REQUIRE(w.buy("dax", "engagement_ring", "card"));
  walkInto(w, "dax", "heritage_coffee");
  REQUIRE(w.respond("dominique", ask(w, "dax", "propose", "dominique"), true));
  walkInto(w, "dax", "greater_hope");
  walkInto(w, "dominique", "greater_hope");
  REQUIRE(w.respond("dominique", ask(w, "dax", "marry", "dominique"), true));
  const Cents bank = w.state().ledger.balance(bankAccountOf("dax"));
  auto d = w.endRelationship("dax", "dominique");
  REQUIRE(d);
  CHECK(d.value().at("status") == "divorced");
  CHECK(w.state().ledger.balance(bankAccountOf("dax")) == bank - 150000);
}

TEST_CASE("fame: performing makes you known; celebrities turn heads") {
  auto db = romanceContent({}, [](Json& doc, const std::string& file) {
    if (file == "fame.json") doc["fame"]["celebrity_at"] = 29;  // Andre starts at 30; a little fades on the walk over
  });
  World w = World::createNew(db);
  for (const char* id : {"andre", "dominique"}) REQUIRE(w.connect(id));
  CHECK(w.character("andre")->fame == 30);
  CHECK(w.fameTierOf("andre") == "Local name");
  CHECK(w.openPhoneApp("andre", "fame").value().at("next_tier").at("label") == "Rising star");
  walkInto(w, "dominique", "heritage_coffee");
  walkTo(w, "andre", "heritage_coffee");
  REQUIRE(w.enter("andre", "heritage_coffee"));
  CHECK(notified(w, "dominique", "Andre Campbell (Local name) just walked in."));
  Json song{{"title", "Test"}, {"bpm", 100}, {"tracks", {{{"instrument", "piano"}, {"notes", {{0, 60, 4}, {4, 64, 4}}}}}}};
  auto saved = w.saveSong("andre", song, "");
  REQUIRE(saved);
  const double before = w.character("andre")->fame;
  REQUIRE(w.perform("andre", saved.value().at("id").get<std::string>()));
  CHECK(w.character("andre")->fame > before);
  w.advanceMinutes(10 * kMinutesPerDay);
  CHECK(w.character("andre")->fame < before);  // it fades without new reasons
}

TEST_CASE("family: the creator asks whether you are female or male") {
  World w = World::createNew(romanceContent());
  std::ifstream in(std::string(LIVERA_DATA_DIR) + "/../scripts/demo/sol_rivera.json");
  Json sheet = Json::parse(in);
  auto sol = w.createCharacter(sheet);
  REQUIRE(sol);
  CHECK(w.definition(sol.value())->sex == "female");
  sheet["first_name"] = "Rae";
  sheet["sex"] = "male";
  auto rae = w.createCharacter(sheet);
  REQUIRE(rae);
  CHECK(w.definition(rae.value())->sex == "male");
  sheet["first_name"] = "Kit";
  sheet["sex"] = "sometimes";
  CHECK(!w.createCharacter(sheet));
  sheet.erase("sex");
  CHECK(!w.createCharacter(sheet));  // it decides who can carry a pregnancy, so it has to be answered
}

TEST_CASE("romance: relationships, pregnancies, family and fame are saved") {
  World w = loveWorld();
  CharacterState c = *w.character("dominique");
  c.fame = 42;
  c.parents = {"a", "b"};
  c.pregnancy = PregnancyState{"dax", 100, 5000, true, 2, 1.5};
  const CharacterState back = characterStateFromJson(toJson(c));
  CHECK(back.fame == 42);
  CHECK(back.parents == c.parents);
  REQUIRE(back.pregnancy);
  CHECK(back.pregnancy->partner == "dax");
  CHECK(back.pregnancy->dueAt == 5000);
  CHECK(back.pregnancy->prenatalVisits == 2);
  RelationshipState r;
  r.status = "married";
  r.statusSince = 77;
  const RelationshipState rb = relationshipStateFromJson(toJson(r));
  CHECK(rb.status == "married");
  CHECK(rb.statusSince == 77);
}

TEST_CASE("family: children grow up, and become playable as adults") {
  auto db = romanceContent([](Json& r) {
    r["conception_chance"] = 1.0;
    r["miscarriage_chance"] = 0.0;
    r["pregnancy_game_days"] = 1;
  });
  World w = World::createNew(db);
  for (const char* id : {"dominique", "dax"}) REQUIRE(w.connect(id));
  datingAtHome(w);
  REQUIRE(w.respond("dominique", ask(w, "dax", "intimacy", "dominique"), true));
  w.advanceMinutes(kMinutesPerDay + 60);
  CharacterId child;
  for (const auto& [id, c] : w.state().characters) {
    if (!c.parents.empty()) child = id;
  }
  REQUIRE(!child.empty());
  CHECK(!w.definition(child)->playable);
  CHECK(w.ageOf(child) == 0);
  // Eighteen years is a long wait for a test: bring the birthday forward.
  WorldState s = w.state();
  s.characters.at(child).bornAt = s.now + 120 - 18 * kMinutesPerYear;
  World grown(db, s);
  grown.advanceMinutes(180);
  CHECK(grown.ageOf(child) == 18);
  CHECK(grown.lifeStageOf(child) == "young_adult");
  CHECK(grown.definition(child)->playable);
  CHECK(notified(grown, "dominique", "is grown up now"));
}
