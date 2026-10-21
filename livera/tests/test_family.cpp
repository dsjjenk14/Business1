#include <cmath>
#include <fstream>

#include "TestSupport.h"
#include "core/Clock.h"
#include "core/Serialization.h"

using namespace livera;
using namespace livera::test;

namespace {

// Nobody catches anything, every unprotected night conceives, and a pregnancy lasts a day.
std::shared_ptr<const ContentDatabase> familyContent() {
  return patchedContent([](Json& doc, const std::string& file) {
    if (file == "conditions.json") {
      for (auto& c : doc["conditions"]) {
        if (c.contains("catch")) c["catch"]["hourly_chance"] = 0.0, c["catch"]["contagion_per_hour"] = 0.0;
      }
    }
    if (file == "romance.json") {
      doc["romance"]["conception_chance"] = 1.0;
      doc["romance"]["miscarriage_chance"] = 0.0;
      doc["romance"]["pregnancy_game_days"] = 1;
    }
  });
}

bool notified(const World& w, const CharacterId& id, const std::string& fragment) {
  for (const auto& n : w.state().notifications) {
    if (n.recipient == id && n.text.find(fragment) != std::string::npos) return true;
  }
  return false;
}

std::string ask(World& w, const CharacterId& from, const std::string& kind, const CharacterId& to) {
  auto r = w.request(from, kind, to, false);
  if (!r) throw std::runtime_error(kind + " refused: " + r.error().message);
  return r.value().at("request").get<std::string>();
}

// Two people start dating at the café, then go to her place.
void dateThenHome(World& w, const CharacterId& a, const CharacterId& b, const LocationId& home) {
  walkInto(w, a, "heritage_coffee");
  walkInto(w, b, "heritage_coffee");
  REQUIRE(w.respond(a, ask(w, b, "date", a), true));
  walkInto(w, a, home);
  walkInto(w, b, home);
}

const CharacterId kChild = "kai-ashford";

// A world where Dominique and Dax have a child of `age`, living in Dominique's apartment.
World withChild(std::shared_ptr<const ContentDatabase> db, int age) {
  World w = World::createNew(db);
  WorldState s = w.state();
  Json sheet = toJson(*w.definition("dominique"));
  sheet["id"] = kChild;
  sheet["first_name"] = "Kai";
  sheet["age"] = age;
  sheet["sex"] = "male";
  sheet["pronouns"] = "he/him";
  sheet["playable"] = false;
  sheet["career"] = Json{{"id", ""}, {"level", 0}};
  sheet["finances"] = Json{{"cash_cents", 0}, {"bank_cents", 0}};
  sheet["degrees"] = Json::array();
  sheet["relationships"] = Json::array();
  sheet["fame"] = 0;
  auto def = ContentDatabase::parseCharacter(sheet);
  REQUIRE(def);
  s.createdCharacters[kChild] = def.value();
  CharacterState k;
  k.id = kChild;
  k.parents = {"dominique", "dax"};
  k.bornAt = s.now - age * kMinutesPerYear - 3 * kMinutesPerDay;
  k.lastBirthdayAge = age;
  k.heightCm = 100;
  k.weightKg = 16;
  k.inside = "lexington_1204";
  k.position = db->location("lexington_1204")->door;
  s.characters[kChild] = k;
  World out(db, s);
  REQUIRE(out.ageOf(kChild) == age);
  return out;
}

Cents bank(const World& w, const CharacterId& id) { return w.state().ledger.balance(bankAccountOf(id)); }

}  // namespace

TEST_CASE("family: only a woman and a man can conceive, and she carries the pregnancy") {
  World w = World::createNew(familyContent());
  for (const char* id : {"dominique", "dax", "harper"}) REQUIRE(w.connect(id));
  w.advanceMinutes(3 * 60);
  CHECK(w.definition("dominique")->sex == "female");
  CHECK(w.definition("dax")->sex == "male");
  dateThenHome(w, "dominique", "dax", "lexington_1204");
  REQUIRE(w.respond("dominique", ask(w, "dax", "intimacy", "dominique"), true));
  CHECK(w.character("dominique")->pregnancy.has_value());
  CHECK(!w.character("dax")->pregnancy.has_value());

  // Two women: a night together, and nobody is pregnant.
  World v = World::createNew(familyContent());
  for (const char* id : {"dominique", "harper"}) REQUIRE(v.connect(id));
  v.advanceMinutes(3 * 60);
  dateThenHome(v, "harper", "dominique", "founders_row_3");
  REQUIRE(v.respond("harper", ask(v, "dominique", "intimacy", "harper"), true));
  CHECK(!v.character("dominique")->pregnancy.has_value());
  CHECK(!v.character("harper")->pregnancy.has_value());
}

TEST_CASE("life: ages follow the calendar, one birthday a game year") {
  World w = World::createNew(realContent());
  CHECK(w.ageOf("dominique") == 29);
  CHECK(w.ageOf("graham") == 35);
  // Her thirtieth birthday is in two hours.
  WorldState s = w.state();
  s.characters.at("dominique").bornAt = s.now + 120 - 30 * kMinutesPerYear;
  World v(realContent(), s);
  CHECK(v.ageOf("dominique") == 29);
  v.advanceMinutes(180);
  CHECK(v.ageOf("dominique") == 30);
  CHECK(notified(v, "dominique", "Happy birthday! You're 30"));
  v.advanceMinutes(kMinutesPerYear);
  CHECK(v.ageOf("dominique") == 31);
}

TEST_CASE("persistence: a save from the old aging rule keeps everyone's age") {
  World w = World::createNew(realContent());
  Json old = toJson(w.state().characters.at("graham"));
  // The old rule counted 1800 game days a year; Graham was 35 and a half under it.
  old["body"].erase("calendar");
  old["body"]["born_at"] = w.now() - static_cast<GameMinutes>(35.5 * 1800 * kMinutesPerDay);
  old["body"]["last_birthday_age"] = 35;
  WorldState s = w.state();
  s.characters["graham"] = characterStateFromJson(old);
  World loaded(realContent(), s);
  CHECK(loaded.ageOf("graham") == 35);
  const GameMinutes untilBirthday = loaded.character("graham")->bornAt + 36 * kMinutesPerYear - loaded.now();
  CHECK(untilBirthday > 0);
  CHECK(untilBirthday < kMinutesPerYear);  // still halfway through the year
}

TEST_CASE("creator: you start at 18, in your twenties or in your thirties") {
  World w = World::createNew(realContent());
  const Json options = w.creatorOptions();
  CHECK(options.at("age_groups").size() == 3);
  CHECK(options.at("sex").at("options").size() == 2);
  std::ifstream in(std::string(LIVERA_DATA_DIR) + "/../scripts/demo/nico_vale.json");
  Json sheet = Json::parse(in);
  auto nico = w.createCharacter(sheet);
  REQUIRE(nico);
  CHECK(w.definition(nico.value())->age == 26);
  CHECK(w.ageOf(nico.value()) == 26);
  sheet["first_name"] = "Rae";
  sheet.erase("age");
  auto rae = w.createCharacter(sheet);  // somewhere in their twenties
  REQUIRE(rae);
  CHECK(w.definition(rae.value())->age >= 20);
  CHECK(w.definition(rae.value())->age <= 29);
  sheet["first_name"] = "Kit";
  sheet["age_group"] = "thirties";
  sheet["age"] = 26;
  CHECK(w.createCharacter(sheet).error().code == "invalid_character");
  sheet["age"] = 34;
  REQUIRE(w.createCharacter(sheet));
  sheet["first_name"] = "Lou";
  sheet["age_group"] = "forties";
  CHECK(!w.createCharacter(sheet));
  sheet["age_group"] = "18";
  sheet.erase("age");
  auto lou = w.createCharacter(sheet);
  REQUIRE(lou);
  CHECK(w.definition(lou.value())->age == 18);
}

TEST_CASE("family: a small child needs an adult around, or child services get involved") {
  World w = withChild(familyContent(), 2);
  for (const char* id : {"dominique", "dax"}) REQUIRE(w.connect(id));
  walkInto(w, "dominique", "lexington_1204");
  CHECK(w.supervised(*w.character(kChild)));
  // Both parents out, nobody else: the toddler is home alone.
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "dax", "heritage_coffee");
  CHECK(!w.supervised(*w.character(kChild)));
  w.advanceMinutes(5 * 60);
  CHECK(notified(w, "dominique", "was left alone for hours"));
  CHECK(w.character("dominique")->record.size() == 1);
  CHECK(w.character("dominique")->record.front().crime == "child_neglect");
  CHECK(w.character("dax")->record.size() == 1);
  CHECK(w.character(kChild)->needs.at("hunger") < 70);

  // Daycare: enrol in person, pay by the day, and the hours are covered.
  CHECK(w.enrollChild("dominique", kChild, "daycare").error().code == "wrong_place");
  walkTo(w, "dominique", "little_sprouts");
  auto enrolled = w.enrollChild("dominique", kChild, "daycare");
  REQUIRE(enrolled);
  CHECK(enrolled.value().at("place") == "Little Sprouts Daycare");
  CHECK(w.enrollChild("dominique", kChild, "daycare").error().code == "already_enrolled");
  CHECK(w.enrollChild("dax", kChild, "school").error().code == "wrong_age");
  const Cents before = bank(w, "dominique");
  const Cents daycareBefore = w.state().ledger.balance("org:little_sprouts");
  // The next weekday morning at 09:00: paid, there, and looked after.
  const GameMinutes toNine = (w.now() / kMinutesPerDay + 1) * kMinutesPerDay + 9 * 60 - w.now();
  w.advanceMinutes(toNine);
  CHECK(bank(w, "dominique") == before - 4500);
  CHECK(w.state().ledger.balance("org:little_sprouts") == daycareBefore + 4500);
  CHECK(w.character(kChild)->inside == "little_sprouts");
  CHECK(w.supervised(*w.character(kChild)));
  // Withdrawn, they stay home.
  REQUIRE(w.enrollChild("dominique", kChild, ""));
  w.advanceMinutes(60);
  CHECK(w.character(kChild)->inside == "lexington_1204");
}

TEST_CASE("family: parents look after their children at home") {
  World w = withChild(familyContent(), 2);
  for (const char* id : {"dominique", "dax", "harper"}) REQUIRE(w.connect(id));
  walkInto(w, "dominique", "lexington_1204");
  const double hungerBefore = w.character(kChild)->needs.at("hunger");
  auto fed = w.careFor("dominique", kChild, "feed");
  REQUIRE(fed);
  CHECK(w.character(kChild)->needs.at("hunger") > hungerBefore);
  CHECK(w.relationshipValue(kChild, "dominique", "friendship") > 0);
  CHECK(w.careFor("dominique", kChild, "feed").error().code == "too_soon");
  CHECK(w.careFor("dominique", kChild, "homework").error().code == "not_for_this_age");
  CHECK(w.careFor("dax", kChild, "play").error().code == "wrong_place");  // he's not here
  CHECK(w.careFor("harper", kChild, "play").error().code == "not_parent");
  const Json app = w.openPhoneApp("dominique", "family").value();
  REQUIRE(app.at("children").size() == 1);
  CHECK(app.at("children").at(0).at("name") == "Kai Ashford");
  CHECK(app.at("children").at(0).at("age") == 2);
  CHECK(app.at("children").at(0).at("stage") == "toddler");
  CHECK(app.at("children").at(0).at("supervised") == true);
  CHECK(app.at("care_routines").size() == 7);
}

TEST_CASE("family: a nanny is hired by the family, works in their home and is paid by them") {
  World w = withChild(familyContent(), 2);
  for (const char* id : {"dominique", "dax"}) REQUIRE(w.connect(id));
  std::ifstream in(std::string(LIVERA_DATA_DIR) + "/../scripts/demo/nico_vale.json");
  Json sheet = Json::parse(in);
  sheet["career"] = "nanny";
  auto nico = w.createCharacter(sheet);
  REQUIRE(nico);
  const CharacterId nanny = nico.value();
  REQUIRE(w.connect(nanny));
  CHECK(w.startShift(nanny).error().code == "no_employer");
  walkTo(w, "dominique", "little_sprouts");
  walkTo(w, nanny, "little_sprouts");
  CHECK(w.hireNanny("dax", nanny).error().code == "too_far");
  auto offer = w.hireNanny("dominique", nanny);
  REQUIRE(offer);
  REQUIRE(w.respond(nanny, offer.value().at("request").get<std::string>(), true));
  CHECK(w.character(nanny)->nannyFor == "dominique");
  CHECK(notified(w, "dominique", "is your family's nanny now"));
  // The nanny has a key; the parents can go out while they're on shift.
  walkInto(w, nanny, "lexington_1204");
  REQUIRE(w.startShift(nanny));
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "dax", "heritage_coffee");
  CHECK(w.supervised(*w.character(kChild)));
  REQUIRE(w.careFor(nanny, kChild, "play"));
  const Cents parentBefore = bank(w, "dominique"), nannyBefore = bank(w, nanny);
  w.advanceMinutes(3 * 60);
  auto shift = w.endShift(nanny);
  REQUIRE(shift);
  // The parents' walk to the café took game time too, so the shift is a little over three hours.
  const double hours = shift.value().at("minutes_worked").get<double>() / 60.0;
  CHECK(hours >= 3);
  const Cents pay = shift.value().at("pay_cents").get<Cents>();
  CHECK(pay == static_cast<Cents>(std::llround(hours * 1800)));
  CHECK(bank(w, nanny) == nannyBefore + pay);
  CHECK(bank(w, "dominique") == parentBefore - pay);
  CHECK(!w.supervised(*w.character(kChild)));  // off shift, and the parents are still out
  REQUIRE(w.dismissNanny("dominique"));
  CHECK(w.character(nanny)->nannyFor.empty());
  CHECK(w.dismissNanny("dominique").error().code == "no_nanny");
}

TEST_CASE("family: school days add up, help at home counts, and a diploma comes at 18") {
  World w = withChild(familyContent(), 7);
  REQUIRE(w.connect("dominique"));
  walkTo(w, "dominique", "founders_school");
  REQUIRE(w.enrollChild("dominique", kChild, "school"));
  CHECK(w.enrollChild("dominique", kChild, "daycare").error().code == "wrong_age");
  // Monday: school lets out at 15:00.
  w.advanceMinutes(15 * 60 + 30 - (w.now() % kMinutesPerDay));
  CHECK(w.character(kChild)->schoolDays == 1);
  const double firstGrade = w.character(kChild)->schoolGradeSum;
  CHECK(firstGrade > 0);
  // That evening: homework help, then a better day tomorrow.
  walkInto(w, "dominique", "lexington_1204");
  REQUIRE(w.careFor("dominique", kChild, "homework"));
  w.advanceMinutes(kMinutesPerDay);
  CHECK(w.character(kChild)->schoolDays == 2);
  CHECK(w.character(kChild)->schoolGradeSum - firstGrade > firstGrade + 5);
  // Years later, with a solid average: the diploma arrives on the eighteenth birthday.
  WorldState s = w.state();
  s.characters.at(kChild).bornAt = s.now + 120 - 18 * kMinutesPerYear;
  s.characters.at(kChild).schoolGradeSum = 75 * 200;
  s.characters.at(kChild).schoolDays = 200;
  World grown(w.contentPtr(), s);
  grown.advanceMinutes(180);
  CHECK(grown.ageOf(kChild) == 18);
  CHECK(grown.hasDegree(kChild, "high_school"));
  CHECK(grown.definition(kChild)->playable);
  CHECK(notified(grown, "dominique", "graduated from school"));
  CHECK(grown.character(kChild)->childcare.empty());
}
