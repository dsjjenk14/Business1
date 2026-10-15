#include "TestSupport.h"
#include "core/Clock.h"

using namespace livera;
using namespace livera::test;

namespace {

World onlineWorld(std::shared_ptr<const ContentDatabase> db = realContent()) {
  World w = World::createNew(std::move(db));
  REQUIRE(w.connect("dominique"));
  REQUIRE(w.connect("jaxon"));
  (void)w.drainEvents();
  return w;
}

Cents bank(const World& w, const CharacterId& id) { return w.state().ledger.balance(bankAccountOf(id)); }

// Advance to the next occurrence of `hour`:00 on a given weekday (0 = Monday).
void advanceTo(World& w, int weekday, int hour) {
  for (int i = 0; i < 8 * 24 * 60; ++i) {
    const DateTime d = toDateTime(w.now());
    if (d.weekday == weekday && d.hour == hour && d.minute == 0) return;
    w.advanceMinutes(1);
  }
}

}  // namespace

// --- Founding state ------------------------------------------------------------------

TEST_CASE("world: a new world is founded from content") {
  World w = World::createNew(realContent());
  const CharacterState* dom = w.character("dominique");
  REQUIRE(dom);
  CHECK(!dom->online);
  CHECK(dom->inside == "lexington_1204");
  CHECK(bank(w, "dominique") == 1450000);
  CHECK(w.state().ledger.balance(cashAccountOf("dominique")) == 18000);
  CHECK(w.state().ledger.sumOfBalances() == 0);
  CHECK(w.state().properties.at("lexington_1204").tenant == "dominique");
  CHECK(w.state().city.stage == 1);
  CHECK(toDateTime(w.now()).hour == 7);
}

TEST_CASE("world: relationships are directional from the start") {
  World w = World::createNew(realContent());
  CHECK(w.relationshipValue("dominique", "jaxon", "friendship") == 12);
  CHECK(w.relationshipValue("jaxon", "dominique", "friendship") == 20);
  CHECK(w.relationshipValue("jaxon", "dominique", "romantic_attraction") == 28);
  CHECK(w.relationshipValue("dominique", "jaxon", "romantic_attraction") == 0);
}

TEST_CASE("world: offline characters cannot act") {
  World w = World::createNew(realContent());
  CHECK(w.moveTo("dominique", {100, 100}).error().code == "not_in_world");
  CHECK(w.buy("dominique", "latte", "card").error().code == "not_in_world");
  CHECK(!w.look("dominique"));
}

// --- Movement and access -----------------------------------------------------------

TEST_CASE("movement: the server moves you at walking speed; no teleporting") {
  World w = onlineWorld();
  REQUIRE(w.exitBuilding("dominique"));
  const Vec2 start = w.character("dominique")->position;
  REQUIRE(w.moveTo("dominique", {900, 100}));
  w.advanceRealTime(1.0);
  const double moved = distance(start, w.character("dominique")->position);
  CHECK_NEAR(moved, realContent()->sim().walkSpeedMetersPerSecond, 0.01);
  // Targets outside the town are clamped to its bounds.
  REQUIRE(w.moveTo("dominique", {-5000, 99999}));
  CHECK(w.character("dominique")->moveTarget->x == 0);
  CHECK(w.character("dominique")->moveTarget->y == 800);
  CHECK(w.moveTo("dominique", {std::nan(""), 1}).error().code == "invalid_target");
}

TEST_CASE("movement: you must be at the door to enter, and outside to walk") {
  World w = onlineWorld();
  CHECK(w.moveTo("dominique", {1, 1}).error().code == "inside_building");
  REQUIRE(w.exitBuilding("dominique"));
  CHECK(w.enter("dominique", "heritage_coffee").error().code == "too_far");
  walkInto(w, "dominique", "heritage_coffee");
  CHECK(w.character("dominique")->inside == "heritage_coffee");
}

TEST_CASE("access: homes are for residents, offices for staff") {
  World w = onlineWorld();
  walkTo(w, "jaxon", "lexington_1204");
  CHECK(w.enter("jaxon", "lexington_1204").error().code == "no_access");
  walkTo(w, "dominique", "forge_site_office");
  CHECK(w.enter("dominique", "forge_site_office").error().code == "no_access");
  walkInto(w, "jaxon", "forge_site_office");
}

TEST_CASE("access: shops keep opening hours; unfinished buildings stay shut") {
  World w = onlineWorld();
  walkTo(w, "dominique", "body_balance");
  CHECK(w.enter("dominique", "body_balance").error().code == "under_construction");
  walkTo(w, "dominique", "heritage_coffee");
  advanceTo(w, 0, 21);
  CHECK(w.enter("dominique", "heritage_coffee").error().code == "closed");
}

// --- Social ----------------------------------------------------------------------------

TEST_CASE("social: you have to be with someone to interact") {
  World w = onlineWorld();
  CHECK(w.interact("dominique", "chat", "jaxon").error().code == "too_far");
  CHECK(w.interact("dominique", "chat", "dominique").error().code == "invalid_target");
  CHECK(w.interact("dominique", "serenade", "jaxon").error().code == "unknown_interaction");
}

TEST_CASE("social: interactions change both directions differently") {
  World w = onlineWorld();
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "jaxon", "heritage_coffee");
  const double domBefore = w.relationshipValue("dominique", "jaxon", "trust");
  const double jaxBefore = w.relationshipValue("jaxon", "dominique", "trust");
  auto r = w.interact("dominique", "deep_talk", "jaxon");
  REQUIRE(r);
  CHECK(!r.value()["first_meeting"].get<bool>());  // they already knew each other
  const double domGain = w.relationshipValue("dominique", "jaxon", "trust") - domBefore;
  const double jaxGain = w.relationshipValue("jaxon", "dominique", "trust") - jaxBefore;
  CHECK(domGain > 0);
  CHECK(jaxGain > 0);
  CHECK(domGain != jaxGain);  // Jaxon's empathy (58) scales how he receives it
  // The actor sees only their own feelings, never the target's.
  CHECK(r.value().contains("your_feelings"));
  CHECK(!r.value().contains("their_feelings"));
  // Spamming is refused.
  CHECK(w.interact("dominique", "chat", "jaxon").error().code == "too_soon");
  w.advanceMinutes(5);
  CHECK(w.interact("dominique", "chat", "jaxon"));
}

TEST_CASE("social: the target is told, and only the target") {
  World w = onlineWorld();
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "jaxon", "heritage_coffee");
  (void)w.drainEvents();
  REQUIRE(w.interact("jaxon", "compliment", "dominique"));
  int toDom = 0, toJax = 0;
  for (const auto& e : w.drainEvents()) {
    if (e.type != "interaction") continue;
    for (const auto& r : e.recipients) (r == "dominique" ? toDom : toJax)++;
  }
  CHECK(toDom == 1);
  CHECK(toJax == 0);
}

TEST_CASE("memory: important moments are remembered by both people") {
  World w = onlineWorld();
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "jaxon", "heritage_coffee");
  const auto domBefore = w.memoriesOf("dominique").size();
  const auto jaxBefore = w.memoriesOf("jaxon").size();
  REQUIRE(w.interact("dominique", "chat", "jaxon"));  // below the memory threshold
  CHECK(w.memoriesOf("dominique").size() == domBefore);
  w.advanceMinutes(5);
  REQUIRE(w.interact("dominique", "deep_talk", "jaxon"));
  REQUIRE(w.memoriesOf("dominique").size() == domBefore + 1);
  REQUIRE(w.memoriesOf("jaxon").size() == jaxBefore + 1);
  const Memory* m = w.memoriesOf("jaxon").back();
  CHECK(m->type == "heart_to_heart");
  CHECK(m->location == "heritage_coffee");
  CHECK(m->about == "dominique");
  CHECK(m->participants.size() == 2);
}

TEST_CASE("memory: a remembered argument makes people slower to warm up") {
  auto complimentGain = [](bool argueFirst) {
    World w = onlineWorld();
    walkInto(w, "dominique", "heritage_coffee");
    walkInto(w, "jaxon", "heritage_coffee");
    if (argueFirst) {
      REQUIRE(w.interact("dominique", "argue", "jaxon"));
      w.advanceMinutes(10);
    }
    const double before = w.relationshipValue("jaxon", "dominique", "friendship");
    REQUIRE(w.interact("dominique", "compliment", "jaxon"));
    return w.relationshipValue("jaxon", "dominique", "friendship") - before;
  };
  const double normal = complimentGain(false);
  const double afterArgument = complimentGain(true);
  CHECK(normal > 0);
  CHECK(afterArgument > 0);
  CHECK(afterArgument < normal * 0.75);
}

TEST_CASE("social: strangers meeting for the first time form memories and compatibility") {
  // Two characters with no shared history, made by patching content.
  auto db = patchedContent([](Json& doc, const std::string& file) {
    if (file == "jaxon.json") {
      doc["characters"][0].erase("relationships");
    }
    if (file == "dominique.json") {
      doc["characters"][0].erase("relationships");
      doc["characters"][0]["memories"] = Json::array();
    }
  });
  World w = onlineWorld(db);
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "jaxon", "heritage_coffee");
  auto r = w.interact("jaxon", "chat", "dominique");
  REQUIRE(r);
  CHECK(r.value()["first_meeting"].get<bool>());
  CHECK(w.relationshipValue("dominique", "jaxon", "compatibility") > 0);
  bool remembered = false;
  for (const Memory* m : w.memoriesOf("dominique")) remembered |= m->type == "first_meeting" && m->about == "jaxon";
  CHECK(remembered);
}

TEST_CASE("social: a one-sided acquaintance becomes mutual after they interact") {
  auto db = patchedContent([](Json& doc, const std::string& file) {
    if (file == "jaxon.json") doc["characters"][0].erase("relationships");
  });
  World w = onlineWorld(db);
  CHECK(w.openPhoneApp("jaxon", "contacts").value()["contacts"].empty());
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "jaxon", "heritage_coffee");
  auto r = w.interact("dominique", "chat", "jaxon");
  REQUIRE(r);
  CHECK(!r.value()["first_meeting"].get<bool>());  // Dominique already knew him
  CHECK(w.openPhoneApp("jaxon", "contacts").value()["contacts"].size() == 1);
}

// --- Economy ---------------------------------------------------------------------------

TEST_CASE("economy: buying moves money from you to the business") {
  World w = onlineWorld();
  CHECK(w.buy("dominique", "latte", "card").error().code == "unknown_offer");  // her apartment isn't a cafe
  REQUIRE(w.exitBuilding("dominique"));
  CHECK(w.buy("dominique", "latte", "card").error().code == "not_inside");
  walkInto(w, "dominique", "heritage_coffee");
  const double energyBefore = w.character("dominique")->needs.at("energy");
  auto r = w.buy("dominique", "latte", "card");
  REQUIRE(r);
  CHECK(bank(w, "dominique") == 1450000 - 575);
  CHECK(w.state().ledger.balance("org:heritage_coffee") == 4000000 + 575);
  CHECK(w.character("dominique")->needs.at("energy") > energyBefore);
  CHECK(w.buy("dominique", "cocktail", "card").error().code == "unknown_offer");
  CHECK(w.buy("dominique", "latte", "bitcoin").error().code == "invalid_payment");
  CHECK(w.state().ledger.sumOfBalances() == 0);
}

TEST_CASE("economy: you cannot spend money you don't have") {
  World w = onlineWorld();
  walkInto(w, "dominique", "heritage_coffee");
  int bought = 0;
  while (w.buy("dominique", "croissant", "cash")) ++bought;
  CHECK(bought == 18000 / 450);
  CHECK(w.state().ledger.balance(cashAccountOf("dominique")) == 0);
  CHECK(w.buy("dominique", "croissant", "cash").error().code == "insufficient_funds");
}

TEST_CASE("career: shifts pay by the hour, only at your workplace") {
  World w = onlineWorld();
  CHECK(w.startShift("dominique").error().code == "wrong_place");
  walkInto(w, "dominique", "meridian_talent");
  REQUIRE(w.startShift("dominique"));
  CHECK(w.startShift("dominique").error().code == "already_working");
  const Cents before = bank(w, "dominique");
  w.advanceMinutes(8 * 60);
  auto r = w.endShift("dominique");
  REQUIRE(r);
  CHECK(r.value()["pay_cents"].get<Cents>() == 8 * 4600);  // Senior Recruiter rate
  CHECK(bank(w, "dominique") == before + 8 * 4600);
  CHECK(w.character("dominique")->career.lifetimeEarningsCents == 8 * 4600);
  CHECK(w.state().ledger.sumOfBalances() == 0);
}

TEST_CASE("career: short shifts are unpaid; leaving ends the shift") {
  World w = onlineWorld();
  walkInto(w, "dominique", "meridian_talent");
  REQUIRE(w.startShift("dominique"));
  w.advanceMinutes(10);
  auto r = w.endShift("dominique");
  REQUIRE(r);
  CHECK(r.value()["pay_cents"].get<Cents>() == 0);
  REQUIRE(w.startShift("dominique"));
  w.advanceMinutes(60);
  auto left = w.exitBuilding("dominique");
  REQUIRE(left);
  CHECK(left.value()["shift"]["pay_cents"].get<Cents>() == 4600);
  CHECK(!w.character("dominique")->career.shiftStartedAt);
}

TEST_CASE("career: promotion follows hours and performance") {
  auto db = patchedContent([](Json& doc, const std::string& file) {
    if (file == "founding_careers.json") {
      for (auto& career : doc["careers"]) {
        if (career["id"] != "recruiting") continue;
        career["levels"][1]["hours_to_promote"] = 2;
        career["levels"][1]["min_performance"] = 0;
      }
    }
  });
  World w = onlineWorld(db);
  walkInto(w, "dominique", "meridian_talent");
  REQUIRE(w.startShift("dominique"));
  w.advanceMinutes(3 * 60);
  auto r = w.endShift("dominique");
  REQUIRE(r);
  CHECK(r.value()["promoted_to"] == "Recruiting Manager");
  CHECK(w.character("dominique")->career.level == 2);
  CHECK(w.memoriesOf("dominique").back()->type == "promotion");
}

TEST_CASE("economy: rent is charged monthly; shortfalls become arrears") {
  auto db = patchedContent([](Json& doc, const std::string& file) {
    if (file == "jaxon.json") doc["characters"][0]["finances"]["bank_cents"] = 1000;
  });
  World w = World::createNew(db);
  const Cents domBefore = bank(w, "dominique");
  w.advanceMinutes(kMinutesPerMonth - w.now() % kMinutesPerMonth);
  CHECK(bank(w, "dominique") == domBefore - 245000);
  CHECK(w.state().ledger.balance("org:lexington_props") == 50000000 + 245000);
  CHECK(w.character("jaxon")->rentArrearsCents == 135000);
  CHECK(bank(w, "jaxon") == 1000);
  CHECK(w.state().ledger.sumOfBalances() == 0);
}

// --- City ------------------------------------------------------------------------------

TEST_CASE("city: crews build only during working hours") {
  // Maple Court Phase II takes weeks, so it is still under way on the first Sunday.
  World w = World::createNew(realContent());
  const auto progress = [&] { return w.state().construction.at("maple_court_ii").workerHoursDone; };
  advanceTo(w, 6, 0);  // Sunday midnight
  REQUIRE(w.state().construction.at("maple_court_ii").status == ConstructionStatus::Active);
  const double sunday = progress();
  w.advanceMinutes(24 * 60);
  CHECK(progress() == sunday);  // no Sunday work
  w.advanceMinutes(7 * 60);     // Monday 07:00, crew arrives
  CHECK(progress() == sunday);
  w.advanceMinutes(60);
  CHECK_NEAR(progress() - sunday, 20.0, 1e-6);  // 20 workers x 1 hour
}

TEST_CASE("city: finished projects open places, change the city, and start what was waiting") {
  World w = onlineWorld();
  CHECK(w.state().construction.at("eclat").status == ConstructionStatus::Planned);
  const double pop = w.state().city.stats.at("population");
  w.advanceMinutes(21 * kMinutesPerDay);
  CHECK(w.state().construction.at("founders_way").status == ConstructionStatus::Complete);
  CHECK(w.state().construction.at("body_balance").status == ConstructionStatus::Complete);
  CHECK(w.state().construction.at("eclat").status != ConstructionStatus::Planned);
  CHECK(w.state().city.stats.at("population") > pop);
  CHECK(w.locationStatus(*w.content().location("body_balance")) != "under_construction");
  bool told = false;
  for (const auto& n : w.state().notifications) told |= n.recipient == "dominique" && n.text.find("Body & Balance") != std::string::npos;
  CHECK(told);
}

// --- Needs, tiers, activities --------------------------------------------------------

TEST_CASE("needs: decay while active; activities restore them") {
  World w = onlineWorld();
  const double before = w.character("dominique")->needs.at("hygiene");
  w.advanceMinutes(10 * 60);
  const double after = w.character("dominique")->needs.at("hygiene");
  CHECK(after < before);
  walkInto(w, "dominique", "lexington_1204");
  REQUIRE(w.useActivity("dominique", "shower"));
  CHECK(w.character("dominique")->needs.at("hygiene") > after);
  CHECK(w.useActivity("dominique", "shower").error().code == "too_soon");
  CHECK(w.useActivity("dominique", "jog").error().code == "unknown_activity");
}

TEST_CASE("needs: outdoor places have activities when you're standing in them") {
  World w = onlineWorld();
  walkTo(w, "dominique", "founders_park");
  CHECK(w.useActivity("dominique", "jog"));
}

TEST_CASE("tiers: a dormant character catches up cheaply instead of starving") {
  World w = onlineWorld();
  w.advanceMinutes(12 * 60);
  CHECK(w.character("dominique")->needs.at("hunger") < 10);
  w.disconnect("dominique");
  CHECK(w.character("dominique")->tier() == SimTier::Dormant);
  w.advanceMinutes(3 * kMinutesPerDay);
  REQUIRE(w.connect("dominique"));
  CHECK(w.character("dominique")->tier() == SimTier::Active);
  CHECK(w.character("dominique")->needs.at("hunger") > 60);
}

// --- Phone -------------------------------------------------------------------------------

TEST_CASE("phone: messages reach offline players and are marked read when opened") {
  World w = World::createNew(realContent());
  REQUIRE(w.connect("dominique"));
  REQUIRE(w.sendMessage("dominique", "jaxon", "  Coffee at Heritage?  "));
  CHECK(w.sendMessage("dominique", "jaxon", "   ").error().code == "invalid_message");
  CHECK(w.sendMessage("dominique", "jaxon", std::string(501, 'x')).error().code == "invalid_message");
  CHECK(w.sendMessage("dominique", "nobody", "hi").error().code == "unknown_character");
  REQUIRE(w.connect("jaxon"));
  auto inbox = w.openPhoneApp("jaxon", "messages");
  REQUIRE(inbox);
  const Json& thread = inbox.value()["threads"]["dominique"];
  REQUIRE(thread.size() == 1);
  CHECK(thread[0]["body"] == "Coffee at Heritage?");
  CHECK(thread[0]["unread"] == true);
  CHECK(w.openPhoneApp("jaxon", "messages").value()["threads"]["dominique"][0]["unread"] == false);
}

TEST_CASE("phone: every app opens; contacts show only your own feelings") {
  World w = onlineWorld();
  for (const char* app : {"bank", "messages", "contacts", "calendar", "map", "career", "property", "notifications", "city"}) {
    CHECK(w.openPhoneApp("dominique", app));
  }
  CHECK(w.openPhoneApp("dominique", "tiktok").error().code == "unknown_app");
  const Json contacts = w.openPhoneApp("dominique", "contacts").value()["contacts"];
  REQUIRE(contacts.size() == 1);
  CHECK(contacts[0]["your_feelings"]["romantic_attraction"] == 0);  // not Jaxon's 28
  CHECK(w.openPhoneApp("dominique", "bank").value()["bank_cents"] == 1450000);
}

TEST_CASE("look: shows people who are with you, not their private state") {
  World w = onlineWorld();
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "jaxon", "heritage_coffee");
  auto look = w.look("dominique");
  REQUIRE(look);
  const Json& people = look.value()["people"];
  REQUIRE(people.size() == 1);
  CHECK(people[0]["id"] == "jaxon");
  CHECK(!people[0].contains("needs"));
  CHECK(look.value()["here"]["offers"].size() == 4);
}
