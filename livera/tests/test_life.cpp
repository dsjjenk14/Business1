#include "TestSupport.h"
#include "core/Clock.h"

using namespace livera;
using namespace livera::test;

namespace {

World lifeWorld(std::shared_ptr<const ContentDatabase> db = realContent()) {
  World w = World::createNew(std::move(db));
  REQUIRE(w.connect("dominique"));
  (void)w.drainEvents();
  return w;
}

double needOf(const World& w, const CharacterId& id, const std::string& need) { return w.character(id)->needs.at(need); }

bool notified(const World& w, const CharacterId& id, const std::string& fragment) {
  for (const auto& n : w.state().notifications) {
    if (n.recipient == id && n.text.find(fragment) != std::string::npos) return true;
  }
  return false;
}

Json health(World& w, const CharacterId& id) { return w.openPhoneApp(id, "health").value(); }

bool listsCondition(const Json& h, const std::string& name) {
  for (const auto& c : h.at("conditions")) {
    if (c.at("name") == name) return true;
  }
  return false;
}

// Content where one condition is certain to be caught every hour, and nothing else is caught at all.
std::shared_ptr<const ContentDatabase> onlyCatching(const std::string& id, double hourly, double contagion = 0) {
  return patchedContent([&](Json& doc, const std::string& file) {
    if (file != "conditions.json") return;
    for (auto& c : doc["conditions"]) {
      if (!c.contains("catch")) continue;
      c["catch"]["hourly_chance"] = c["id"] == id ? hourly : 0.0;
      c["catch"]["contagion_per_hour"] = c["id"] == id ? contagion : 0.0;
      c["catch"].erase("risk_need");
      c["catch"].erase("dirty_home");
    }
  });
}

}  // namespace

// --- Body ---------------------------------------------------------------------------------

TEST_CASE("life: everyone needs the bathroom, and holding it too long ends badly") {
  World w = lifeWorld(onlyCatching("none", 0));
  CHECK(needOf(w, "dominique", "bladder") > 0);
  w.advanceMinutes(9 * 60);  // bladder starts at 80 and empties at 10 an hour
  CHECK(notified(w, "dominique", "couldn't make it to a bathroom"));
  CHECK(w.character("dominique")->emotions.at("embarrassment") > 20);
  auto r = w.useActivity("dominique", "toilet");
  REQUIRE(r);
  CHECK(needOf(w, "dominique", "bladder") == 100);
  CHECK(w.useActivity("dominique", "toilet").error().code == "too_soon");
}

TEST_CASE("life: people on shift take bathroom breaks") {
  World w = lifeWorld(onlyCatching("none", 0));
  walkInto(w, "dominique", "meridian_talent");
  REQUIRE(w.startShift("dominique"));
  w.advanceMinutes(10 * 60);
  CHECK(!notified(w, "dominique", "couldn't make it"));
  CHECK(needOf(w, "dominique", "bladder") >= 40);
}

TEST_CASE("life: teeth need brushing, and neglected teeth ache until a dentist fixes them") {
  World w = lifeWorld(onlyCatching("toothache", 1.0));
  const double before = needOf(w, "dominique", "dental");
  w.advanceMinutes(60);
  CHECK(needOf(w, "dominique", "dental") < before);
  REQUIRE(w.useActivity("dominique", "brush_teeth"));
  CHECK(needOf(w, "dominique", "dental") > before);
  CHECK(w.hasCondition("dominique", "toothache"));
  CHECK(listsCondition(health(w, "dominique"), "a toothache"));
  w.advanceMinutes(60);  // the clinic opens at 8
  walkInto(w, "dominique", "riverdale_clinic");
  auto r = w.buy("dominique", "dental_care", "card");
  REQUIRE(r);
  CHECK(!w.hasCondition("dominique", "toothache"));
  CHECK(needOf(w, "dominique", "dental") == 100);
}

TEST_CASE("life: grooming changes first impressions") {
  // Dax grooms; Julian doesn't. Both compliment Naomi the same way.
  auto db = onlyCatching("none", 0);
  World w = World::createNew(db);
  for (const char* id : {"dax", "julian", "naomi"}) REQUIRE(w.connect(id));
  walkInto(w, "naomi", "heritage_coffee");
  walkTo(w, "dax", "maple_court_3b");
  REQUIRE(w.enter("dax", "maple_court_3b"));
  REQUIRE(w.useActivity("dax", "groom"));
  walkInto(w, "dax", "heritage_coffee");
  walkInto(w, "julian", "heritage_coffee");
  CHECK(needOf(w, "dax", "grooming") > needOf(w, "julian", "grooming"));
  const double daxBefore = w.relationshipValue("naomi", "dax", "physical_attraction");
  const double julianBefore = w.relationshipValue("naomi", "julian", "physical_attraction");
  REQUIRE(w.interact("dax", "compliment", "naomi"));
  REQUIRE(w.interact("julian", "compliment", "naomi"));
  CHECK(w.relationshipValue("naomi", "dax", "physical_attraction") - daxBefore >
        w.relationshipValue("naomi", "julian", "physical_attraction") - julianBefore);
}

TEST_CASE("life: weight follows what you eat and how much you move") {
  World w = lifeWorld(onlyCatching("none", 0));
  const double start = w.character("dominique")->weightKg;
  CHECK(start > 40);
  CHECK(health(w, "dominique").at("bmi_category") == "healthy");
  REQUIRE(w.exitBuilding("dominique"));
  walkInto(w, "dominique", "greenleaf_market");
  for (int i = 0; i < 12; ++i) REQUIRE(w.buy("dominique", "ready_meal", "card"));  // 7,800 kcal at once
  w.advanceMinutes(60);
  const double after = w.character("dominique")->weightKg;
  CHECK(after - start > 0.8);
  // Then nothing to eat for three days.
  w.advanceMinutes(3 * kMinutesPerDay);
  CHECK(w.character("dominique")->weightKg < after - 0.5);
}

TEST_CASE("life: characters age, have birthdays, and move through life stages") {
  auto db = patchedContent([](Json& doc, const std::string& file) {
    if (file == "life.json") doc["life"]["aging"]["game_days_per_year"] = 2;
  });
  World w = World::createNew(db);
  CHECK(w.ageOf("dominique") == 29);
  CHECK(w.lifeStageOf("dominique") == "young_adult");
  CHECK(w.ageOf("graham") == 35);
  CHECK(w.lifeStageOf("graham") == "adult");
  w.advanceMinutes(2 * kMinutesPerDay);
  CHECK(w.ageOf("dominique") == 30);
  CHECK(w.lifeStageOf("dominique") == "adult");
  CHECK(notified(w, "dominique", "Happy birthday! You're 30."));
}

TEST_CASE("life: the real aging clock gives one birthday per real month") {
  World w = World::createNew(realContent());
  CHECK(w.content().life().gameDaysPerYear == 1800);
  w.advanceMinutes(10 * kMinutesPerDay);
  CHECK(w.ageOf("dominique") == 29);
}

// --- Home -----------------------------------------------------------------------------------

TEST_CASE("life: homes get messy, trash piles up, and housework fixes it") {
  World w = lifeWorld(onlyCatching("none", 0));
  auto home = [&] { return w.openPhoneApp("dominique", "health").value().at("home"); };
  const double clean0 = home().at("cleanliness").get<double>();
  REQUIRE(w.useActivity("dominique", "cook"));
  CHECK(home().at("trash").get<double>() >= 15);
  w.advanceMinutes(10 * 60);
  CHECK(home().at("cleanliness").get<double>() <= clean0 - 9);
  auto cleaned = w.useActivity("dominique", "clean_home");
  REQUIRE(cleaned);
  CHECK(cleaned.value().at("home").at("cleanliness").get<double>() > clean0 - 9);
  auto trash = w.useActivity("dominique", "take_out_trash");
  REQUIRE(trash);
  CHECK(trash.value().at("home").at("trash") == 0);
}

TEST_CASE("life: a filthy home is unpleasant and can make you sick") {
  World w = lifeWorld(patchedContent([](Json& doc, const std::string& file) {
    if (file == "conditions.json") {
      for (auto& c : doc["conditions"]) {
        if (c.contains("catch")) c["catch"] = Json{{"hourly_chance", c["id"] == "food_poisoning" ? 0.02 : 0.0},
                                                   {"dirty_home", c["id"] == "food_poisoning"}, {"risk_multiplier", 50}};
      }
    }
  }));
  w.advanceMinutes(80 * 60);  // never cleaning, never taking out the trash
  const Json h = health(w, "dominique");
  CHECK(h.at("home").at("cleanliness").get<double>() < 30);
  CHECK(w.hasCondition("dominique", "food_poisoning"));
}

// --- Illness and care -------------------------------------------------------------------------

TEST_CASE("life: illnesses are caught, diagnosed by a doctor, and treated") {
  World w = lifeWorld(onlyCatching("common_cold", 1.0));
  w.advanceMinutes(60);
  REQUIRE(w.hasCondition("dominique", "common_cold"));
  CHECK(notified(w, "dominique", "You have a cold."));
  Json h = health(w, "dominique");
  REQUIRE(listsCondition(h, "a cold"));
  CHECK(h.at("conditions").at(0).at("diagnosed") == false);
  walkInto(w, "dominique", "riverdale_clinic");
  const Cents bank0 = w.state().ledger.balance(bankAccountOf("dominique"));
  CHECK(w.buy("dominique", "treatment", "card").error().code == "nothing_to_treat");
  CHECK(w.state().ledger.balance(bankAccountOf("dominique")) == bank0);  // not charged for nothing
  auto check = w.buy("dominique", "checkup", "card");
  REQUIRE(check);
  CHECK(check.value().at("care").at("diagnosed").at(0) == "a cold");
  REQUIRE(w.buy("dominique", "treatment", "card"));
  CHECK(!w.hasCondition("dominique", "common_cold"));
}

TEST_CASE("life: untreated illnesses run their course") {
  World w = lifeWorld(onlyCatching("common_cold", 1.0));
  w.advanceMinutes(60);
  REQUIRE(w.hasCondition("dominique", "common_cold"));
  const auto patched = onlyCatching("none", 0);
  World later(patched, w.state());
  later.advanceMinutes(121 * 60);  // colds last 48-120 hours
  CHECK(!later.hasCondition("dominique", "common_cold"));
  CHECK(notified(later, "dominique", "a cold: you've recovered"));
}

TEST_CASE("life: being sick hurts your work") {
  auto run = [](bool sick) {
    World w = lifeWorld(onlyCatching("none", 0));
    if (sick) REQUIRE(w.devAddCondition("dominique", "flu"));
    walkInto(w, "dominique", "meridian_talent");
    REQUIRE(w.startShift("dominique"));
    w.advanceMinutes(8 * 60);
    return w.endShift("dominique").value().at("performance").get<double>();
  };
  CHECK(run(true) < run(false));
}

TEST_CASE("life: contagious illnesses spread to people nearby") {
  World w = World::createNew(onlyCatching("common_cold", 0, 1.0));
  REQUIRE(w.connect("dominique"));
  REQUIRE(w.connect("aaliyah"));
  REQUIRE(w.devAddCondition("dominique", "common_cold"));
  w.advanceMinutes(60);  // different apartments in the same tower: no contact
  CHECK(!w.hasCondition("aaliyah", "common_cold"));
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "aaliyah", "heritage_coffee");
  w.advanceMinutes(60);
  CHECK(w.hasCondition("aaliyah", "common_cold"));
}

// --- Away from the game ---------------------------------------------------------------------

TEST_CASE("life: offline, a character looks after themself for three real weeks, then gets depressed") {
  const auto& life = realContent()->life();
  CHECK(life.selfCareRealDays == 21);
  // Three real weeks is 1.8 million game minutes; test the rule at 0.05 real days (72 game hours).
  auto db = patchedContent([](Json& doc, const std::string& file) {
    if (file == "life.json") doc["life"]["offline"]["self_care_real_days"] = 0.05;
    if (file == "conditions.json") {
      for (auto& c : doc["conditions"]) {
        if (c.contains("catch")) c["catch"]["hourly_chance"] = 0.0, c["catch"]["contagion_per_hour"] = 0.0;
      }
    }
  });
  World w = World::createNew(db);
  REQUIRE(w.connect("dominique"));
  w.disconnect("dominique");
  w.advanceMinutes(60 * 60);  // 60 game hours: still within the window
  CHECK(!w.hasCondition("dominique", "depression"));
  w.advanceMinutes(13 * 60);  // past 72
  CHECK(w.hasCondition("dominique", "depression"));
  CHECK(notified(w, "dominique", "stopped looking after themself"));
  CHECK(!w.hasCondition("graham", "depression"));  // never played: an unplayed character just lives their routine
  w.advanceMinutes(24 * 60);
  REQUIRE(w.connect("dominique"));
  CHECK(needOf(w, "dominique", "social") < 30);
  CHECK(needOf(w, "dominique", "grooming") < 30);
  CHECK(w.character("dominique")->emotions.at("sadness") > 40);
  const Json h = health(w, "dominique");
  CHECK(listsCondition(h, "depression"));
  CHECK(h.at("home").at("trash").get<double>() > 50);  // the place shows it too
}

TEST_CASE("life: depression lifts with care") {
  auto db = patchedContent([](Json& doc, const std::string& file) {
    if (file == "life.json") doc["life"]["offline"]["self_care_real_days"] = 0.01;
  });
  World w = World::createNew(db);
  REQUIRE(w.connect("dominique"));
  w.disconnect("dominique");
  w.advanceMinutes(24 * 60);  // back the next morning, when James Wellness is open
  REQUIRE(w.connect("dominique"));
  REQUIRE(w.hasCondition("dominique", "depression"));
  walkInto(w, "dominique", "james_wellness");
  for (int i = 0; i < 4; ++i) REQUIRE(w.buy("dominique", "therapy_session", "card"));
  CHECK(!w.hasCondition("dominique", "depression"));
  CHECK(notified(w, "dominique", "depression: it has lifted"));
}
