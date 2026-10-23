#include "TestSupport.h"
#include "core/Autopilot.h"
#include "core/Clock.h"

using namespace livera;
using namespace livera::test;

namespace {

World onlineWorld(std::shared_ptr<const ContentDatabase> db = realContent()) {
  World w = World::createNew(std::move(db));
  REQUIRE(w.connect("dominique"));
  REQUIRE(w.connect("dax"));
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
  CHECK(w.relationshipValue("dominique", "dax", "friendship") == 12);
  CHECK(w.relationshipValue("dax", "dominique", "friendship") == 20);
  CHECK(w.relationshipValue("dax", "dominique", "romantic_attraction") == 28);
  CHECK(w.relationshipValue("dominique", "dax", "romantic_attraction") == 0);
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
  walkTo(w, "dax", "lexington_1204");
  CHECK(w.enter("dax", "lexington_1204").error().code == "no_access");
  walkTo(w, "dominique", "parallax_labs");
  CHECK(w.enter("dominique", "parallax_labs").error().code == "no_access");
  walkInto(w, "dax", "parallax_labs");
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
  CHECK(w.interact("dominique", "chat", "dax").error().code == "too_far");
  CHECK(w.interact("dominique", "chat", "dominique").error().code == "invalid_target");
  CHECK(w.interact("dominique", "serenade", "dax").error().code == "unknown_interaction");
}

TEST_CASE("social: interactions change both directions differently") {
  World w = onlineWorld();
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "dax", "heritage_coffee");
  const double domBefore = w.relationshipValue("dominique", "dax", "trust");
  const double jaxBefore = w.relationshipValue("dax", "dominique", "trust");
  auto r = w.interact("dominique", "deep_talk", "dax");
  REQUIRE(r);
  CHECK(!r.value()["first_meeting"].get<bool>());  // they already knew each other
  const double domGain = w.relationshipValue("dominique", "dax", "trust") - domBefore;
  const double jaxGain = w.relationshipValue("dax", "dominique", "trust") - jaxBefore;
  CHECK(domGain > 0);
  CHECK(jaxGain > 0);
  CHECK(domGain != jaxGain);  // Dax's empathy (58) scales how he receives it
  // The actor sees only their own feelings, never the target's.
  CHECK(r.value().contains("your_feelings"));
  CHECK(!r.value().contains("their_feelings"));
  // Spamming is refused.
  CHECK(w.interact("dominique", "chat", "dax").error().code == "too_soon");
  w.advanceMinutes(5);
  CHECK(w.interact("dominique", "chat", "dax"));
}

TEST_CASE("social: the target is told, and only the target") {
  World w = onlineWorld();
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "dax", "heritage_coffee");
  (void)w.drainEvents();
  REQUIRE(w.interact("dax", "compliment", "dominique"));
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
  walkInto(w, "dax", "heritage_coffee");
  const auto domBefore = w.memoriesOf("dominique").size();
  const auto jaxBefore = w.memoriesOf("dax").size();
  REQUIRE(w.interact("dominique", "chat", "dax"));  // below the memory threshold
  CHECK(w.memoriesOf("dominique").size() == domBefore);
  w.advanceMinutes(5);
  REQUIRE(w.interact("dominique", "deep_talk", "dax"));
  REQUIRE(w.memoriesOf("dominique").size() == domBefore + 1);
  REQUIRE(w.memoriesOf("dax").size() == jaxBefore + 1);
  const Memory* m = w.memoriesOf("dax").back();
  CHECK(m->type == "heart_to_heart");
  CHECK(m->location == "heritage_coffee");
  CHECK(m->about == "dominique");
  CHECK(m->participants.size() == 2);
}

TEST_CASE("memory: a remembered argument makes people slower to warm up") {
  auto complimentGain = [](bool argueFirst) {
    World w = onlineWorld();
    walkInto(w, "dominique", "heritage_coffee");
    walkInto(w, "dax", "heritage_coffee");
    if (argueFirst) {
      REQUIRE(w.interact("dominique", "argue", "dax"));
      w.advanceMinutes(10);
    }
    const double before = w.relationshipValue("dax", "dominique", "friendship");
    REQUIRE(w.interact("dominique", "compliment", "dax"));
    return w.relationshipValue("dax", "dominique", "friendship") - before;
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
    if (file == "dax.json") {
      doc["characters"][0].erase("relationships");
    }
    if (file == "dominique.json") {
      doc["characters"][0].erase("relationships");
      doc["characters"][0]["memories"] = Json::array();
    }
  });
  World w = onlineWorld(db);
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "dax", "heritage_coffee");
  auto r = w.interact("dax", "chat", "dominique");
  REQUIRE(r);
  CHECK(r.value()["first_meeting"].get<bool>());
  CHECK(w.relationshipValue("dominique", "dax", "compatibility") > 0);
  bool remembered = false;
  for (const Memory* m : w.memoriesOf("dominique")) remembered |= m->type == "first_meeting" && m->about == "dax";
  CHECK(remembered);
}

TEST_CASE("social: a one-sided acquaintance becomes mutual after they interact") {
  auto db = patchedContent([](Json& doc, const std::string& file) {
    if (file == "dax.json") doc["characters"][0].erase("relationships");
  });
  World w = onlineWorld(db);
  auto knowsDominique = [&] {
    const Json contacts = w.openPhoneApp("dax", "contacts").value()["contacts"];  // copy: the Result is a temporary
    for (const auto& c : contacts) {
      if (c["id"] == "dominique") return true;
    }
    return false;
  };
  CHECK(!knowsDominique());
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "dax", "heritage_coffee");
  auto r = w.interact("dominique", "chat", "dax");
  REQUIRE(r);
  CHECK(!r.value()["first_meeting"].get<bool>());  // Dominique already knew him
  CHECK(knowsDominique());
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
  // Away pay is off: this counts rent alone (away pay has its own tests below).
  auto db = patchedContent([](Json& doc, const std::string& file) {
    if (file == "dax.json") doc["characters"][0]["finances"]["bank_cents"] = 1000;
    if (file == "life.json") doc["life"]["offline"]["away_work"]["pay_share"] = 0.0;
  });
  World w = World::createNew(db);
  const Cents domBefore = bank(w, "dominique");
  w.advanceMinutes(kMinutesPerMonth - w.now() % kMinutesPerMonth);
  CHECK(bank(w, "dominique") == domBefore - 245000);
  bool paidLandlord = false;
  for (const auto& tx : w.state().ledger.transactions()) {
    paidLandlord |= tx.kind == "rent" && tx.from == bankAccountOf("dominique") && tx.to == "org:lexington_props" &&
                    tx.amountCents == 245000;
  }
  CHECK(paidLandlord);
  CHECK(w.character("dax")->rentArrearsCents == 135000);
  CHECK(bank(w, "dax") == 1000);
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

TEST_CASE("city: a project finishes on the minute its last worker-hour is done") {
  // Founders Way: 12 workers, 540 worker-hours, 07:00-16:00 Mon-Sat, so exactly five working days.
  // Float drift once left it just short on Friday afternoon, and it finished Saturday morning instead.
  World w = World::createNew(realContent());
  const auto status = [&] { return w.state().construction.at("founders_way").status; };
  REQUIRE(w.state().construction.at("founders_way").workerHoursDone == 0);
  advanceTo(w, 4, 15);
  w.advanceMinutes(59);  // Friday 15:59: one working minute left
  CHECK(status() == ConstructionStatus::Active);
  w.advanceMinutes(1);
  CHECK(status() == ConstructionStatus::Complete);
  CHECK(toDateTime(w.state().construction.at("founders_way").completedAt).weekday == 4);
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
  REQUIRE(w.sendMessage("dominique", "dax", "  Coffee at Heritage?  "));
  CHECK(w.sendMessage("dominique", "dax", "   ").error().code == "invalid_message");
  CHECK(w.sendMessage("dominique", "dax", std::string(501, 'x')).error().code == "invalid_message");
  CHECK(w.sendMessage("dominique", "nobody", "hi").error().code == "unknown_character");
  REQUIRE(w.connect("dax"));
  auto inbox = w.openPhoneApp("dax", "messages");
  REQUIRE(inbox);
  const Json& thread = inbox.value()["threads"]["dominique"];
  REQUIRE(thread.size() == 1);
  CHECK(thread[0]["body"] == "Coffee at Heritage?");
  CHECK(thread[0]["unread"] == true);
  CHECK(w.openPhoneApp("dax", "messages").value()["threads"]["dominique"][0]["unread"] == false);
}

TEST_CASE("phone: every app opens; contacts show only your own feelings") {
  World w = onlineWorld();
  for (const char* app : {"bank", "messages", "contacts", "calendar", "map", "career", "property", "notifications", "city"}) {
    CHECK(w.openPhoneApp("dominique", app));
  }
  CHECK(w.openPhoneApp("dominique", "tiktok").error().code == "unknown_app");
  const Json contacts = w.openPhoneApp("dominique", "contacts").value()["contacts"];
  Json dax;
  for (const auto& c : contacts) {
    if (c["id"] == "dax") dax = c;
  }
  REQUIRE(dax.is_object());
  CHECK(dax["your_feelings"]["romantic_attraction"] == 0);  // not Dax's 28
  CHECK(w.openPhoneApp("dominique", "bank").value()["bank_cents"] == 1450000);
}

TEST_CASE("look: shows people who are with you, not their private state") {
  World w = onlineWorld();
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "dax", "heritage_coffee");
  auto look = w.look("dominique");
  REQUIRE(look);
  const Json& people = look.value()["people"];
  REQUIRE(people.size() == 1);
  CHECK(people[0]["id"] == "dax");
  CHECK(!people[0].contains("needs"));
  CHECK(look.value()["here"]["offers"].size() == 4);
}

TEST_CASE("look: each offer and activity says what it does, and when you can do it again") {
  World w = onlineWorld();
  const ContentDatabase& db = w.content();
  walkInto(w, "dominique", "lexington_1204");
  auto find = [](const Json& list, const std::string& id) {
    for (const auto& x : list) {
      if (x["id"] == id) return x;
    }
    return Json();
  };
  const LocationDef& home = *db.location("lexington_1204");
  const Activity* shower = nullptr;
  for (const auto& a : home.activities) {
    if (a.id == "shower") shower = &a;
  }
  REQUIRE(shower);
  Json act = find(w.look("dominique").value()["here"]["activities"], "shower");
  REQUIRE(act.is_object());
  // Public content, as it is in data (like a price).
  CHECK(act["needs"] == Json(shower->needEffects));
  CHECK(act["emotions"].is_object());
  CHECK(act["cooldown_minutes"] == shower->cooldownMinutes);
  // Your own cooldown: ready now...
  CHECK(act["ready_at"].is_null());
  CHECK(act["ready_in_minutes"] == 0);
  REQUIRE(w.useActivity("dominique", "shower"));
  const GameMinutes used = w.now();
  act = find(w.look("dominique").value()["here"]["activities"], "shower");
  CHECK(act["ready_at"] == used + shower->cooldownMinutes);
  CHECK(act["ready_in_minutes"] == shower->cooldownMinutes);
  w.advanceMinutes(10);
  act = find(w.look("dominique").value()["here"]["activities"], "shower");
  CHECK(act["ready_in_minutes"] == shower->cooldownMinutes - 10);
  CHECK(w.useActivity("dominique", "shower").error().code == "too_soon");  // the world agrees with the view
  w.advanceMinutes(shower->cooldownMinutes - 10);
  act = find(w.look("dominique").value()["here"]["activities"], "shower");
  CHECK(act["ready_at"].is_null());
  CHECK(w.useActivity("dominique", "shower"));

  // Offers carry their effects; a cooldown is only ever the viewer's own.
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "dax", "heritage_coffee");
  const Json offers = w.look("dominique").value()["here"]["offers"];
  for (const auto& o : db.location("heritage_coffee")->offers) {
    const Json shown = find(offers, o.id);
    REQUIRE(shown.is_object());
    CHECK(shown["needs"] == Json(o.needEffects));
    CHECK(shown["emotions"] == Json(o.emotionEffects));
    CHECK(shown["price_cents"] == o.priceCents);
  }
  REQUIRE(w.useActivity("dax", "restroom"));
  CHECK(find(w.look("dominique").value()["here"]["activities"], "restroom")["ready_at"].is_null());
  CHECK(!find(w.look("dax").value()["here"]["activities"], "restroom")["ready_at"].is_null());

  // An activity kept to some hours says which.
  walkTo(w, "dominique", "willow_lake_park");
  const Json star = find(w.look("dominique").value()["here"]["activities"], "stargazing");
  REQUIRE(star.is_object());
  CHECK(star["hours"] == Json::array({20, 2}));
  CHECK(!find(w.look("dominique").value()["here"]["activities"], "picnic").contains("hours"));
}

TEST_CASE("map: each place's opening hours and days, and the status keeps the days too") {
  World w = World::createNew(realContent());
  const Json m = w.mapView();
  auto place = [&](const std::string& id) {
    for (const auto& p : m["places"]) {
      if (p["id"] == id) return p;
    }
    return Json();
  };
  CHECK(place("heritage_coffee")["hours"] == Json::array({6, 20}));
  CHECK(place("heritage_coffee")["open_days"] == Json::array());
  CHECK(place("meridian_talent")["hours"].is_null());  // never closes
  CHECK(place("founders_school")["open_days"] == Json::array({0, 1, 2, 3, 4}));
  CHECK(place("copper_tap")["hours"] == Json::array({16, 2}));
  // Where performers can play is public too: a stage at the café and the bar, none at the bank's office.
  CHECK(place("heritage_coffee")["stage"] == true);
  CHECK(place("copper_tap")["stage"] == true);
  CHECK(place("meridian_talent")["stage"] == false);
  // The school keeps its weekdays: open on a Tuesday morning, closed on a Saturday morning.
  advanceTo(w, 1, 10);
  CHECK(w.locationStatus(*w.content().location("founders_school")) == "open");
  advanceTo(w, 5, 10);
  CHECK(w.locationStatus(*w.content().location("founders_school")) == "closed");
  CHECK(w.locationStatus(*w.content().location("heritage_coffee")) == "open");
}

TEST_CASE("characters: the pick list names each character's home and workplace") {
  World w = World::createNew(realContent());
  auto entry = [&](const std::string& id) {
    for (const auto& c : w.playableCharacters()) {
      if (c["id"] == id) return c;
    }
    return Json();
  };
  const Json dom = entry("dominique");
  CHECK(dom["home"] == w.content().location("lexington_1204")->name);
  CHECK(dom["workplace"] == "Meridian Talent Partners");
  CHECK(dom["career"] == "Senior Recruiter");
  for (const auto& c : w.playableCharacters()) {
    CHECK(c["home"].is_string());
    CHECK(c["workplace"].is_string());
  }
  // As things are now: someone who moved out has no home to name.
  REQUIRE(w.connect("dominique"));
  walkInto(w, "dominique", "lexington_1204");
  REQUIRE(w.moveOut("dominique"));
  CHECK(entry("dominique")["home"].is_null());
  // A made character's card has the same fields.
  std::ifstream in(std::string(LIVERA_DATA_DIR) + "/../scripts/demo/nico_vale.json");
  auto nico = w.createCharacter(Json::parse(in));
  REQUIRE(nico);
  const Json card = w.characterCard(nico.value());
  CHECK(card["name"] == "Nico Vale");
  CHECK(card["home"].is_string());
  CHECK(card["workplace"].is_string());
  CHECK(w.characterCard("nobody").is_null());
}

TEST_CASE("tunings: the redesign's numbers, and what each one does") {
  World w = onlineWorld();
  const ContentDatabase& db = w.content();
  // A new world starts in spring: Month 4, Day 1, a Monday, at 07:00.
  const DateTime start = toDateTime(w.now());
  CHECK(start.month == 4);
  CHECK(start.day == 1);
  CHECK(start.weekday == 0);
  CHECK(start.hour == 7);
  CHECK(start.minute == 0);
  // Bladder empties at 6 an hour and social at 2 (an hour online, nothing else touching either).
  const double bladder = w.character("dominique")->needs.at("bladder");
  const double social = w.character("dominique")->needs.at("social");
  w.advanceMinutes(60);
  CHECK_NEAR(bladder - w.character("dominique")->needs.at("bladder"), 6.0, 1e-6);
  CHECK_NEAR(social - w.character("dominique")->needs.at("social"), 2.0, 1e-6);
  // Sight is 160 m (still at least the shout range): from Lexington's door you can see someone at Maple Court's.
  CHECK(db.sim().sightRangeMeters == 160);
  CHECK(db.sim().sightRangeMeters >= db.sim().shoutRangeMeters);
  REQUIRE(w.exitBuilding("dominique"));
  REQUIRE(w.exitBuilding("dax"));
  CHECK(distance(w.character("dominique")->position, w.character("dax")->position) > 120);
  const Json seen = w.look("dominique").value()["people"];
  CHECK(seen.size() == 1);
  // Promotion hours: level 2 and level 3 are 220 and 300 where they were 320 and 500 (Aaliyah is at level 3).
  const CareerDef* events = db.career("event_production");
  REQUIRE(events);
  CHECK(events->levels.at(2).hoursToPromote == 220);
  CHECK(events->levels.at(3).hoursToPromote == 300);
  REQUIRE(w.connect("aaliyah"));
  CHECK(w.openPhoneApp("aaliyah", "career").value()["hours_to_promote"] == 300);
  // Work decisions: four a day, one every 150 minutes, 2 promotion hours per point (tests/test_work.cpp).
  CHECK(db.workDecisions().perDay == 4);
  CHECK(db.workDecisions().spacingMinutes == 150);
  CHECK(db.workDecisions().bonusHoursPerPoint == 2.0);
  // Offices have a break-room coffee, usable on shift without ending it.
  walkInto(w, "dominique", "meridian_talent");
  REQUIRE(w.startShift("dominique"));
  const double energy = w.character("dominique")->needs.at("energy");
  auto coffee = w.useActivity("dominique", "break_coffee");
  REQUIRE(coffee);
  CHECK(w.character("dominique")->needs.at("energy") == std::min(100.0, energy + 8));
  CHECK(w.character("dominique")->career.shiftStartedAt.has_value());
  for (const char* office : {"meridian_talent", "parallax_labs", "whitaker_capital", "lumen_creative"}) {
    bool has = false;
    for (const auto& a : db.location(office)->activities) has |= a.id == "break_coffee";
    CHECK(has);
  }
  REQUIRE(w.endShift("dominique"));
  // Chatting with the regulars at Heritage Coffee: social +6.
  walkInto(w, "dominique", "heritage_coffee");
  double before = w.character("dominique")->needs.at("social");
  REQUIRE(w.useActivity("dominique", "chat_regulars"));
  CHECK_NEAR(w.character("dominique")->needs.at("social"), std::min(100.0, before + 6), 1e-9);
  // Darts at The Copper Tap: social +8 (it opens at 16:00).
  advanceTo(w, 0, 17);
  walkInto(w, "dominique", "copper_tap");
  before = w.character("dominique")->needs.at("social");
  REQUIRE(w.useActivity("dominique", "darts"));
  CHECK_NEAR(w.character("dominique")->needs.at("social"), std::min(100.0, before + 8), 1e-9);
}

// --- Sleep and the night skip ------------------------------------------------------------

namespace {

bool notified(const World& w, const CharacterId& id, const std::string& fragment) {
  for (const auto& n : w.state().notifications) {
    if (n.recipient == id && n.text.find(fragment) != std::string::npos) return true;
  }
  return false;
}

// To `hour`:00 today, or tomorrow if that's past.
void atHour(World& w, int hour) {
  const GameMinutes target = (w.now() / kMinutesPerDay) * kMinutesPerDay + hour * kMinutesPerHour;
  w.advanceMinutes(target > w.now() ? target - w.now() : target + kMinutesPerDay - w.now());
}

std::vector<Json> eventsOf(const std::vector<WorldEvent>& events, const std::string& type, const CharacterId& who) {
  std::vector<Json> out;
  for (const auto& e : events) {
    if (e.type == type && std::find(e.recipients.begin(), e.recipients.end(), who) != e.recipients.end())
      out.push_back(e.data);
  }
  return out;
}

}  // namespace

TEST_CASE("sleep: only at home, in the evening, and not at work; each refusal has its code") {
  World w = World::createNew(realContent());
  CHECK(w.sleep("dominique").error().code == "not_in_world");
  CHECK(w.sleep("nobody").error().code == "unknown_character");
  REQUIRE(w.connect("dominique"));
  CHECK(w.sleep("dominique").error().code == "not_bedtime");  // 07:00 at home
  atHour(w, 21);
  walkTo(w, "dominique", "heritage_coffee");  // on the street at the café's door
  CHECK(w.sleep("dominique").error().code == "not_home");
  walkTo(w, "dominique", "founders_park");
  CHECK(w.sleep("dominique").error().code == "not_home");
  // Someone else's home isn't yours to sleep in, even with a key-holding partner: Dominique at Meridian on shift.
  walkInto(w, "dominique", "meridian_talent");
  REQUIRE(w.startShift("dominique"));
  CHECK(w.sleep("dominique").error().code == "on_shift");
  REQUIRE(w.endShift("dominique"));
  // In a cell, nothing.
  WorldState s = w.state();
  s.characters.at("dominique").jailedUntil = w.now() + 60;
  World jailed(realContent(), s);
  CHECK(jailed.sleep("dominique").error().code == "in_jail");
  // At home from 21:00 to 03:00.
  walkInto(w, "dominique", "lexington_1204");
  auto r = w.sleep("dominique");
  REQUIRE(r);
  CHECK(r.value()["asleep"] == true);
  CHECK(r.value()["wake_time"] == "07:00");
  CHECK(r.value()["wake_at"] == w.nextWakeAt());
  CHECK(w.isAsleep("dominique"));
  CHECK(w.sleepers() == std::vector<CharacterId>{"dominique"});
  CHECK(w.look("dominique").value()["you"]["asleep"] == true);
  // By day, still rested, it's not bedtime (tired, it would be a nap: the next test).
  World late = World::createNew(realContent());
  REQUIRE(late.connect("dominique"));
  atHour(late, 10);
  REQUIRE(late.character("dominique")->needs.at("energy") >= late.content().life().napBelowEnergy);
  CHECK(late.sleep("dominique").error().code == "not_bedtime");
  atHour(late, 2);
  CHECK(late.sleep("dominique"));
}

TEST_CASE("sleep: tired by day, a nap until you're rested; asleep, energy comes back, and a full night fills it") {
  const LifeConfig& L = realContent()->life();
  World w = World::createNew(realContent());
  REQUIRE(w.connect("dominique"));
  // Up all night (needs_at_zero.json isn't in these tests' content: nothing happens at 0), home by 15:00, worn out.
  atHour(w, 15);
  atHour(w, 14);
  const double tired = w.character("dominique")->needs.at("energy");
  REQUIRE(tired < L.napBelowEnergy);
  auto r = w.sleep("dominique");
  REQUIRE(r);
  CHECK(r.value()["nap"] == true);
  const GameMinutes wake = r.value()["wake_at"].get<GameMinutes>();
  const double hours = std::clamp((100 - tired) / L.sleepEnergyPerHour, 0.5, L.napMaxHours);
  CHECK(wake == w.now() + static_cast<GameMinutes>(std::lround(hours * 60)));
  CHECK(w.isAsleep("dominique"));
  w.advanceMinutes(wake - w.now());
  CHECK(!w.isAsleep("dominique"));  // up when rested, not at the morning's wake hour
  CHECK(notified(w, "dominique", "You woke up from your nap, rested."));
  CHECK_NEAR(w.character("dominique")->needs.at("energy"), std::min(100.0, tired + hours * L.sleepEnergyPerHour), 1e-6);
  // A night from 22:00 to the wake hour fills energy from nothing.
  atHour(w, 22);
  REQUIRE(w.sleep("dominique"));
  atHour(w, L.wakeHour);
  CHECK(!w.isAsleep("dominique"));
  CHECK(w.character("dominique")->needs.at("energy") == 100);
  // Night skips stop when the first nap ends.
  World s = World::createNew(realContent());
  REQUIRE(s.connect("dominique"));
  atHour(s, 15);
  atHour(s, 14);
  REQUIRE(s.sleep("dominique"));
  const GameMinutes napEnd = s.character("dominique")->napUntil;
  auto skipped = s.skipNight();
  REQUIRE(skipped);
  CHECK(s.now() == napEnd);
  CHECK(!s.isAsleep("dominique"));
}

TEST_CASE("sleep: your routine looks after you in bed; any command but look and the phone gets you up") {
  World w = World::createNew(realContent());
  REQUIRE(w.connect("dominique"));
  atHour(w, 22);
  walkInto(w, "dominique", "lexington_1204");
  REQUIRE(w.sleep("dominique"));
  const StatMap before = w.character("dominique")->needs;
  w.advanceMinutes(120);
  CHECK(w.character("dominique")->needs == before);  // not running down minute by minute
  // Looking around and reading the phone in bed don't wake you.
  REQUIRE(w.look("dominique"));
  REQUIRE(w.openPhoneApp("dominique", "goals"));
  REQUIRE(w.openPhoneApp("dominique", "bank"));
  CHECK(w.isAsleep("dominique"));
  // Doing anything does, and the time asleep catches up as an away character's would (toward the routine's 70).
  const double hunger = before.at("hunger");
  REQUIRE(w.useActivity("dominique", "toilet"));
  CHECK(!w.isAsleep("dominique"));
  CHECK(w.look("dominique").value()["you"]["asleep"] == false);
  const double k = 1 - std::exp(-2.0 / 8.0);
  CHECK_NEAR(w.character("dominique")->needs.at("hunger"), hunger + (70 - hunger) * k, 1e-6);
  // Back to bed, then logging off: the night so far catches up first.
  REQUIRE(w.sleep("dominique"));
  w.advanceMinutes(60);
  w.disconnect("dominique");
  CHECK(!w.isAsleep("dominique"));
  CHECK(w.sleepers().empty());
}

TEST_CASE("sleep: at the wake hour everyone asleep gets up, with what happened overnight") {
  World w = World::createNew(realContent());
  REQUIRE(w.connect("dominique"));
  REQUIRE(w.connect("dax"));
  atHour(w, 22);
  walkInto(w, "dominique", "lexington_1204");
  REQUIRE(w.sleep("dominique"));
  const GameMinutes slept = w.now();
  REQUIRE(w.sendMessage("dax", "dominique", "You up?"));
  REQUIRE(w.livpaySend("dax", "dominique", 2000, "for the cab"));
  (void)w.drainEvents();
  atHour(w, 6);
  CHECK(w.isAsleep("dominique"));
  atHour(w, 7);
  CHECK(!w.isAsleep("dominique"));
  const auto morning = eventsOf(w.drainEvents(), "good_morning", "dominique");
  REQUIRE(morning.size() == 1);
  const Json& m = morning[0];
  CHECK(m["minutes"] == w.now() - slept);
  CHECK(m["skipped"] == false);
  CHECK(m["money_change_cents"] == 2000);
  CHECK(m["needs"]["hunger"].is_number());
  CHECK(m["weather"]["label"].is_string());
  bool heard = false;
  for (const auto& n : m["notifications"])
    heard |= n["text"].get<std::string>().find("for the cab") != std::string::npos;
  CHECK(heard);
  CHECK(eventsOf(w.drainEvents(), "good_morning", "dax").empty());  // only sleepers get a morning
}

TEST_CASE("sleep: skipping the night lives it out: the awake minute by minute, sleepers on their routine") {
  World start = World::createNew(realContent());
  CHECK(start.skipNight().error().code == "nobody_asleep");
  REQUIRE(start.connect("dominique"));
  REQUIRE(start.connect("dax"));
  atHour(start, 22);
  walkInto(start, "dominique", "lexington_1204");
  REQUIRE(start.exitBuilding("dax"));
  CHECK(start.skipNight().error().code == "nobody_asleep");
  REQUIRE(start.sleep("dominique"));
  WorldState state = start.state();
  state.characters.at("dax").needs["hunger"] = 100;  // so nine hours awake show, unclamped
  World w(realContent(), state);
  const double domHunger = w.character("dominique")->needs.at("hunger");
  const double daxHunger = w.character("dax")->needs.at("hunger");
  const GameMinutes from = w.now();
  const GameMinutes julianLast = w.character("julian")->lastSimulatedAt;
  (void)w.drainEvents();
  int calls = 0;
  double seconds = 0;
  auto r = w.skipNight([&](double s) {
    ++calls;
    seconds += s;
  });
  REQUIRE(r);
  const Json& out = r.value();
  CHECK(out["from"] == from);
  CHECK(out["to"] == w.now());
  CHECK(out["minutes"] == 9 * 60);
  CHECK(out["woke"] == Json::array({"dominique"}));
  CHECK(toDateTime(w.now()).hour == 7);
  CHECK(toDateTime(w.now()).minute == 0);
  CHECK(calls == 9 * 60);  // once per game minute, with the real time a minute stands for
  CHECK_NEAR(seconds, 9 * 60 / w.content().sim().minutesPerRealSecond, 1e-6);
  // Dax was awake: nine hours of hunger. Dominique slept: her routine's night (toward 70).
  CHECK(w.character("dax")->needs.at("hunger") < daxHunger - 40);
  const double k = 1 - std::exp(-9.0 / 8.0);
  CHECK_NEAR(w.character("dominique")->needs.at("hunger"), domHunger + (70 - domHunger) * k, 1e-6);
  CHECK(!w.isAsleep("dominique"));
  // Julian, offline, is untouched until he comes back (the usual catch-up).
  CHECK(w.character("julian")->lastSimulatedAt == julianLast);
  const auto events = w.drainEvents();
  const auto morning = eventsOf(events, "good_morning", "dominique");
  REQUIRE(morning.size() == 1);
  CHECK(morning[0]["skipped"] == true);
  CHECK(morning[0]["minutes"] == 9 * 60);
  // The people stream comes once, at the end, not once a minute.
  CHECK(eventsOf(events, "people", "dax").size() <= 1);
  // The clock goes on normally afterwards.
  w.advanceRealTime(1.0 / w.content().sim().minutesPerRealSecond);  // one game minute of real time
  CHECK(w.now() == out["to"].get<GameMinutes>() + 1);
}

TEST_CASE("sleep: with the autopilot stepped through the skip, its founders go to bed and get up on time") {
  // Dax at home all day (no shift to wear him out), up from 09:00 until bed at 22:30.
  static const auto homeDay = patchedContent([](Json& doc, const std::string& file) {
    if (file == "dax.json")
      doc["characters"][0]["profile"]["schedule"] =
          Json{{"weekdays", Json::array({Json{{"time", "19:00"}, {"activity", "Home, cooking"}}})}};
  });
  World w = World::createNew(homeDay);
  Autopilot pilot;
  REQUIRE(w.connect("dominique"));
  pilot.start(w, {"dax"});
  // Real time to 21:00 with the autopilot playing Dax.
  for (int i = 0; i < 20000 && toDateTime(w.now()).hour != 21; ++i) {
    w.advanceRealTime(1.0);
    pilot.step(w, 1.0);
    pilot.observe(w.drainEvents());
  }
  walkInto(w, "dominique", "lexington_1204");
  REQUIRE(w.sleep("dominique"));
  REQUIRE(w.character("dax")->online);  // up until his bedtime (22:30 at the earliest)
  (void)w.drainEvents();
  GameMinutes daxLeft = -1;
  bool daxBack = false;
  REQUIRE(w.skipNight([&](double s) {
    pilot.step(w, s);
    const CharacterState* dax = w.character("dax");
    if (!dax->online && daxLeft < 0) daxLeft = w.now();
    if (daxLeft >= 0 && dax->online) daxBack = true;
  }));
  // He went to bed (left the world) between 22:30 and 23:45, as on any night, and wasn't simulated awake all night.
  REQUIRE(daxLeft >= 0);
  const int at = toDateTime(daxLeft).hour * 60 + toDateTime(daxLeft).minute;
  CHECK(at >= 22 * 60 + 30);
  CHECK(at <= 23 * 60 + 47);
  // He gets up at 09:00, after the skip (07:00), and then comes back as on any morning.
  CHECK(!daxBack);
  for (int i = 0; i < 3 * 3600 && !w.character("dax")->online; ++i) {
    w.advanceRealTime(1.0);
    pilot.step(w, 1.0);
  }
  CHECK(w.character("dax")->online);
  CHECK(toDateTime(w.now()).hour == 9);
  CHECK(pilot.runs("dax"));
}

// --- Away: the routine includes the job ----------------------------------------------------

namespace {

std::vector<LedgerTransaction> awayPay(const World& w, const CharacterId& who) {
  std::vector<LedgerTransaction> out;
  for (const auto& tx : w.state().ledger.transactions()) {
    if (tx.kind == "salary_away" && tx.to == bankAccountOf(who)) out.push_back(tx);
  }
  return out;
}

bool told(const World& w, const CharacterId& id, const std::string& fragment) {
  for (const auto& n : w.state().notifications) {
    if (n.recipient == id && n.text.find(fragment) != std::string::npos) return true;
  }
  return false;
}

}  // namespace

TEST_CASE("away: a scheduled work block spent away is paid by the employer at the data share, with promotion hours") {
  World w = World::createNew(realContent());
  const LifeConfig& L = w.content().life();
  CHECK(L.awayPayShare == 0.8);
  CHECK(L.awayPromotionShare == 0.5);
  REQUIRE(w.connect("dominique"));
  w.disconnect("dominique");  // Monday 07:00: away all day
  const double hours = w.character("dominique")->career.hoursAtLevel;
  const Cents employer = w.state().ledger.balance("org:meridian_talent");
  // Her work line is 08:30 Meridian, until her next line at 18:30: ten hours, paid in the hour it ends.
  atHour(w, 18);
  CHECK(awayPay(w, "dominique").empty());
  atHour(w, 19);
  const auto paid = awayPay(w, "dominique");
  REQUIRE(paid.size() == 1);
  CHECK(paid[0].from == "org:meridian_talent");
  CHECK(paid[0].amountCents == std::llround(10 * 4600 * 0.8));
  CHECK(paid[0].at == w.now());
  CHECK(w.state().ledger.balance("org:meridian_talent") == employer - paid[0].amountCents);
  CHECK_NEAR(w.character("dominique")->career.hoursAtLevel, hours + 10 * 0.5, 1e-9);
  CHECK(w.character("dominique")->career.lifetimeEarningsCents == paid[0].amountCents);
  CHECK(told(w, "dominique", "While you were away you worked your usual hours at Meridian Talent Partners"));
  CHECK(w.state().ledger.sumOfBalances() == 0);
  // No decisions came up for her, and nothing on the weekend (her work line is a weekday one).
  CHECK(w.character("dominique")->workDecisions.answers.empty());
  advanceTo(w, 5, 0);
  const std::size_t beforeWeekend = awayPay(w, "dominique").size();
  advanceTo(w, 0, 0);
  CHECK(awayPay(w, "dominique").size() == beforeWeekend);
  CHECK(beforeWeekend == 5);  // Monday to Friday
  // The bank app shows it like any pay.
  REQUIRE(w.connect("dominique"));
  bool shown = false;
  const Json bankApp = w.openPhoneApp("dominique", "bank").value();
  for (const auto& tx : bankApp["recent"]) shown |= tx["kind"] == "salary_away";
  CHECK(shown);
}

TEST_CASE("away: only time actually spent away, never without a job, from a broke employer, or while depressed") {
  // Logged off at noon: paid for 12:00-18:30 only (she could have worked the morning in person).
  World w = World::createNew(realContent());
  REQUIRE(w.connect("dominique"));
  atHour(w, 12);
  w.disconnect("dominique");
  atHour(w, 19);
  REQUIRE(awayPay(w, "dominique").size() == 1);
  CHECK(awayPay(w, "dominique")[0].amountCents == std::llround(6.5 * 4600 * 0.8));
  // In the world all day: no away pay (a shift in person is how you're paid then).
  World online = World::createNew(realContent());
  REQUIRE(online.connect("dominique"));
  atHour(online, 20);
  CHECK(awayPay(online, "dominique").empty());
  // No job, no pay.
  WorldState s = World::createNew(realContent()).state();
  s.characters.at("dax").career.careerId.clear();
  World jobless(realContent(), s);
  atHour(jobless, 20);
  CHECK(awayPay(jobless, "dax").empty());
  CHECK(!awayPay(jobless, "dominique").empty());  // never played, still lives her routine
  // An employer that can't pay pays nothing; the hours count, as they would for a shift in person.
  World broke = World::createNew(realContent());
  REQUIRE(broke.connect("dominique"));
  broke.disconnect("dominique");
  WorldState b = broke.state();
  const Cents all = b.ledger.balance("org:meridian_talent");
  REQUIRE(b.ledger.transfer("org:meridian_talent", kEconomyAccount, all, "opening_balance", "test", b.now));
  World poor(realContent(), b);
  const double hours = poor.character("dominique")->career.hoursAtLevel;
  atHour(poor, 19);
  CHECK(awayPay(poor, "dominique").empty());
  CHECK(told(poor, "dominique", "couldn't pay you for your hours while you were away"));
  CHECK_NEAR(poor.character("dominique")->career.hoursAtLevel, hours + 5, 1e-9);
  CHECK(poor.state().ledger.sumOfBalances() == 0);
  // Depressed, a character keeps up only the basics: no work.
  World low = World::createNew(realContent());
  REQUIRE(low.devAddCondition("dominique", "depression"));
  atHour(low, 19);
  CHECK(awayPay(low, "dominique").empty());
}

TEST_CASE("away: someone made in the creator works the default block on weekdays") {
  World w = World::createNew(realContent());
  std::ifstream in(std::string(LIVERA_DATA_DIR) + "/../scripts/demo/nico_vale.json");
  auto nico = w.createCharacter(Json::parse(in));
  REQUIRE(nico);
  // A barista with no schedule: 09:00-17:00 on weekdays (data), at the café's $21 an hour, paid as it ends.
  atHour(w, 16);
  CHECK(awayPay(w, nico.value()).empty());
  atHour(w, 17);
  const auto paid = awayPay(w, nico.value());
  REQUIRE(paid.size() == 1);
  CHECK(paid[0].from == "org:heritage_coffee");
  CHECK(paid[0].amountCents == std::llround(8 * 2100 * 0.8));
}

TEST_CASE("away: a once-a-day player on an always-on clock stays solvent; without away pay they fall behind") {
  // One 10-hour shift a real day; the rest of the real day (60 game days at 1:1) she's away. Six real days.
  const auto noAwayPay = patchedContent([](Json& doc, const std::string& file) {
    if (file == "life.json") doc["life"]["offline"]["away_work"]["pay_share"] = 0.0;
  });
  auto run = [](std::shared_ptr<const ContentDatabase> db) {
    World w = World::createNew(std::move(db));
    for (int realDay = 0; realDay < 6; ++realDay) {
      const GameMinutes start = w.now();
      REQUIRE(w.connect("dominique"));
      walkInto(w, "dominique", "meridian_talent");
      REQUIRE(w.startShift("dominique"));
      w.advanceMinutes(10 * 60);
      REQUIRE(w.endShift("dominique"));
      w.disconnect("dominique");
      w.advanceMinutes(start + 60 * kMinutesPerDay - w.now());
    }
    CHECK(w.state().ledger.sumOfBalances() == 0);
    return std::pair<Cents, Cents>{w.state().ledger.balance(bankAccountOf("dominique")),
                                   w.character("dominique")->rentArrearsCents};
  };
  const auto [bank, arrears] = run(realContent());
  CHECK(arrears == 0);
  CHECK(bank > 1450000);  // ahead of what she arrived with
  const auto [bankWithout, arrearsWithout] = run(noAwayPay);
  CHECK(arrearsWithout > 0);  // the review's finding: rent outruns one shift a real day
  CHECK(bankWithout < bank);
}

// --- What you can see: look, the people stream, speech, the public rules -----------------

namespace {

// Every `people` change one character was told, oldest first. Each event has exactly one viewer.
std::vector<Json> changesFor(const std::vector<WorldEvent>& events, const CharacterId& viewer) {
  std::vector<Json> out;
  for (const auto& e : events) {
    if (e.type != "people") continue;
    CHECK(e.recipients.size() == 1);
    if (e.recipients.front() != viewer) continue;
    for (const auto& c : e.data["changes"]) out.push_back(c);
  }
  return out;
}

std::vector<Json> about(const std::vector<Json>& changes, const CharacterId& who) {
  std::vector<Json> out;
  for (const auto& c : changes) {
    if (c["character"] == who) out.push_back(c);
  }
  return out;
}

std::vector<WorldEvent> tick(World& w, int ticks = 1) {
  std::vector<WorldEvent> all;
  for (int i = 0; i < ticks; ++i) {
    w.advanceRealTime(0.1);
    for (auto& e : w.drainEvents()) all.push_back(std::move(e));
  }
  return all;
}

// Lets real time pass until `done` (or a long time), keeping every event.
std::vector<WorldEvent> tickUntil(World& w, const std::function<bool()>& done) {
  std::vector<WorldEvent> all;
  for (int i = 0; i < 5000 && !done(); ++i) {
    for (auto& e : tick(w)) all.push_back(std::move(e));
  }
  return all;
}

bool stopped(const World& w, const CharacterId& id) { return !w.character(id)->moveTarget; }

double apart(const World& w, const CharacterId& a, const CharacterId& b) {
  return distance(w.character(a)->position, w.character(b)->position);
}

}  // namespace

TEST_CASE("people: on arrival you are told about yourself; then nothing until something changes") {
  World w = onlineWorld();
  const auto first = tick(w);
  const auto dom = changesFor(first, "dominique");
  REQUIRE(dom.size() == 1);  // Dax is home at Maple Court: not in sight
  CHECK(dom[0]["character"] == "dominique");
  CHECK(dom[0]["self"] == true);
  CHECK(dom[0]["state"] == "here");
  CHECK(dom[0]["inside"] == "lexington_1204");
  CHECK(dom[0]["moving"] == false);
  CHECK(dom[0]["target"].is_null());
  CHECK(dom[0]["speed_mps"] == 0);
  CHECK(dom[0]["mode"] == "walk");
  CHECK(dom[0]["scripted"] == false);
  CHECK(dom[0]["name"] == "Dominique Ashford");
  CHECK(changesFor(tick(w, 10), "dominique").empty());
  // Starting to walk is news, even to yourself.
  REQUIRE(w.exitBuilding("dominique"));
  REQUIRE(w.moveTo("dominique", {600, 470}));
  const auto self = about(changesFor(tick(w), "dominique"), "dominique");
  REQUIRE(self.size() == 1);
  CHECK(self[0]["self"] == true);
  CHECK(self[0]["inside"] == "");
  CHECK(self[0]["moving"] == true);
  CHECK(self[0]["target"] == Json::array({600.0, 470.0}));
  CHECK(self[0]["speed_mps"] == realContent()->sim().walkSpeedMetersPerSecond);
}

TEST_CASE("people: someone walking into sight appears with their target; walking straight on is silent") {
  // Lexington's and Maple Court's doors are 139 m apart: in sight at the real 160 m, so this test of crossing into
  // sight keeps the earlier 120 m (the rule is the same at any range).
  static const auto shortSight = patchedContent([](Json& doc, const std::string& file) {
    if (file == "simulation.json") doc["simulation"]["sight_range_m"] = 120;
  });
  World w = onlineWorld(shortSight);
  REQUIRE(w.exitBuilding("dominique"));  // Lexington's door
  REQUIRE(w.exitBuilding("dax"));        // Maple Court's door, 139 m away
  const double sight = w.content().sim().sightRangeMeters;
  REQUIRE(apart(w, "dominique", "dax") > sight);
  CHECK(about(changesFor(tick(w), "dominique"), "dax").empty());
  CHECK(w.look("dominique").value()["people"].empty());
  REQUIRE(w.moveTo("dax", {450, 470}));
  std::vector<Json> told;
  std::vector<double> whenApart;
  for (int i = 0; i < 1000 && !(i > 0 && stopped(w, "dax")); ++i) {
    const auto evs = tick(w);
    int events = 0;
    for (const auto& e : evs) events += e.type == "people" && e.recipients.front() == "dominique";
    CHECK(events <= 1);  // at most one people event per viewer per tick
    for (const auto& c : about(changesFor(evs, "dominique"), "dax")) {
      told.push_back(c);
      whenApart.push_back(apart(w, "dominique", "dax"));
    }
  }
  REQUIRE(told.size() == 2);  // came into sight, arrived: nothing in between
  CHECK(told[0]["state"] == "here");
  CHECK(told[0]["self"] == false);
  CHECK(told[0]["known"] == true);
  CHECK(told[0]["name"] == "Dax Hendrix");
  CHECK(told[0]["moving"] == true);
  CHECK(told[0]["target"] == Json::array({450.0, 470.0}));
  CHECK(told[0]["speed_mps"] == w.content().sim().walkSpeedMetersPerSecond);
  CHECK(told[0]["mode"] == "walk");
  CHECK(told[0]["inside"] == "");
  CHECK(whenApart[0] <= sight);
  CHECK(whenApart[0] > sight - 1);  // the tick they crossed into range, not later
  const Vec2 at{told[0]["position"][0].get<double>(), told[0]["position"][1].get<double>()};
  CHECK(distance(at, w.character("dominique")->position) <= sight + 0.1);
  CHECK(told[1]["moving"] == false);
  CHECK(told[1]["target"].is_null());
  CHECK(told[1]["speed_mps"] == 0);
  CHECK(told[1]["position"] == Json::array({450.0, 470.0}));
  // What `look` shows matches the stream.
  const Json people = w.look("dominique").value()["people"];
  REQUIRE(people.size() == 1);
  CHECK(people[0]["id"] == "dax");
  CHECK(people[0]["position"] == Json::array({450.0, 470.0}));
  CHECK(people[0]["distance_m"] == 20);
  CHECK(people[0]["scripted"] == false);
  CHECK(people[0]["mode"] == "walk");
}

TEST_CASE("people: who is gone, and why: inside, outside, logged off, out of sight") {
  World w = onlineWorld();
  REQUIRE(w.exitBuilding("dominique"));
  walkTo(w, "dax", "heritage_coffee");  // 56 m from Dominique, in plain sight
  (void)tick(w);
  REQUIRE(w.enter("dax", "heritage_coffee"));
  auto dax = about(changesFor(tick(w), "dominique"), "dax");
  REQUIRE(dax.size() == 1);
  CHECK(dax[0]["state"] == "gone");
  CHECK(dax[0]["reason"] == "went_inside");
  CHECK(dax[0]["location"] == "heritage_coffee");
  // Walls work both ways: outdoors you don't see in, inside you don't see out.
  CHECK(w.look("dominique").value()["people"].empty());
  CHECK(w.look("dax").value()["people"].empty());

  walkInto(w, "dominique", "heritage_coffee");
  (void)w.drainEvents();
  dax = about(changesFor(tick(w), "dominique"), "dax");
  REQUIRE(dax.size() == 1);
  CHECK(dax[0]["state"] == "here");
  CHECK(dax[0]["inside"] == "heritage_coffee");
  CHECK(w.look("dominique").value()["people"][0].count("distance_m") == 0);  // indoors: no distances

  REQUIRE(w.exitBuilding("dax"));
  dax = about(changesFor(tick(w), "dominique"), "dax");
  REQUIRE(dax.size() == 1);
  CHECK(dax[0]["reason"] == "went_outside");

  REQUIRE(w.exitBuilding("dominique"));
  REQUIRE(about(changesFor(tick(w), "dominique"), "dax").size() == 1);  // there he is, by the door
  w.disconnect("dax");
  dax = about(changesFor(tick(w), "dominique"), "dax");
  REQUIRE(dax.size() == 1);
  CHECK(dax[0]["reason"] == "left_world");

  REQUIRE(w.connect("dax"));
  auto evs = tick(w);
  REQUIRE(about(changesFor(evs, "dominique"), "dax").size() == 1);
  CHECK(about(changesFor(evs, "dax"), "dominique").size() == 1);  // back in the world: everyone in sight again
  CHECK(about(changesFor(evs, "dax"), "dax").size() == 1);
  REQUIRE(w.moveTo("dax", {900, 100}));
  const double sight = realContent()->sim().sightRangeMeters;
  evs = tickUntil(w, [&] { return apart(w, "dominique", "dax") > sight + 1; });
  dax = about(changesFor(evs, "dominique"), "dax");
  REQUIRE(dax.size() == 2);
  CHECK(dax[0]["state"] == "here");  // set off
  CHECK(dax[1]["state"] == "gone");
  CHECK(dax[1]["reason"] == "out_of_sight");
  // Never anyone out of sight: nothing more about him while he walks on.
  CHECK(about(changesFor(tick(w, 50), "dominique"), "dax").empty());
}

TEST_CASE("people: through a front door several homes share, onlookers see someone go in, not which flat") {
  World w = onlineWorld();
  REQUIRE(w.connect("naomi"));  // in 1801, up the same Lexington stairs as Dominique's 1204
  REQUIRE(w.exitBuilding("dominique"));
  REQUIRE(w.exitBuilding("naomi"));
  REQUIRE(w.character("naomi")->position == w.character("dominique")->position);
  REQUIRE(about(changesFor(tick(w), "dominique"), "naomi").size() == 1);
  REQUIRE(w.enter("naomi", "lexington_1801"));
  const auto naomi = about(changesFor(tick(w), "dominique"), "naomi");
  REQUIRE(naomi.size() == 1);
  CHECK(naomi[0]["state"] == "gone");
  CHECK(naomi[0]["reason"] == "went_inside");
  CHECK(!naomi[0].contains("location"));
}

namespace {

// The target a `people` entry (or `look` person) gave, as a point.
Vec2 targetOf(const Json& p) { return {p["target"][0].get<double>(), p["target"][1].get<double>()}; }

// How far `p` is off the straight line from `a` through `b`.
double offLine(Vec2 a, Vec2 b, Vec2 p) {
  return std::abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / distance(a, b);
}

}  // namespace

TEST_CASE("people: someone else's far destination shows only to the edge of your sight") {
  World w = onlineWorld();
  REQUIRE(w.connect("naomi"));
  REQUIRE(w.exitBuilding("dominique"));
  REQUIRE(w.exitBuilding("naomi"));
  (void)tick(w);
  const double sight = realContent()->sim().sightRangeMeters;
  const Vec2 door = realContent()->location("willow_lane_6")->door;  // a house 340 m away
  const Vec2 dom = w.character("dominique")->position;
  REQUIRE(distance(dom, door) > 2 * sight);
  const Vec2 from = w.character("naomi")->position;
  REQUIRE(w.moveTo("naomi", door));
  auto evs = tick(w);
  const auto self = about(changesFor(evs, "naomi"), "naomi");
  REQUIRE(self.size() == 1);
  CHECK(targetOf(self[0]) == door);  // she knows where she's going
  CHECK(targetOf(w.look("naomi").value()["you"]) == door);
  auto seen = about(changesFor(evs, "dominique"), "naomi");
  REQUIRE(seen.size() == 1);
  CHECK(seen[0]["moving"] == true);
  const Vec2 cut = targetOf(seen[0]);
  CHECK(cut != door);
  CHECK(distance(dom, cut) > sight);         // past where Dominique can see her...
  CHECK(distance(dom, cut) < sight + 45);    // ...but nowhere near the house
  CHECK(offLine(from, door, cut) < 0.5);     // on her way, which Dominique can see
  CHECK(distance(cut, door) < distance(from, door));
  const Json people = w.look("dominique").value()["people"];
  REQUIRE(people.size() == 1);
  CHECK(distance(targetOf(people[0]), cut) < 1);
  // She walks out of sight before she'd reach that point: the cut is never re-sent to a viewer standing still.
  evs = tickUntil(w, [&] { return apart(w, "dominique", "naomi") > sight + 1; });
  seen = about(changesFor(evs, "dominique"), "naomi");
  REQUIRE(seen.size() == 1);
  CHECK(seen[0]["state"] == "gone");
  CHECK(seen[0]["reason"] == "out_of_sight");
}

TEST_CASE("people: walking alongside someone, their cut-off target moves ahead before they could reach it") {
  World w = onlineWorld();
  REQUIRE(w.connect("naomi"));
  REQUIRE(w.exitBuilding("dominique"));
  REQUIRE(w.exitBuilding("naomi"));
  (void)tick(w);
  const double sight = realContent()->sim().sightRangeMeters;
  const Vec2 door = realContent()->location("willow_lane_6")->door;
  REQUIRE(w.moveTo("naomi", door));
  REQUIRE(w.moveTo("dominique", door));
  int ticks = 0;
  std::vector<Json> told;
  Json last;
  while (!stopped(w, "naomi") && ticks < 5000) {
    for (const auto& c : about(changesFor(tick(w), "dominique"), "naomi")) {
      told.push_back(c);
      last = c;
    }
    ++ticks;
    REQUIRE(last.is_object());
    REQUIRE(last["state"] == "here");  // together the whole way
    if (!last["moving"].get<bool>()) continue;
    // What Dominique's client predicts is never wrong while Naomi is in sight: the point it walks her to is either
    // her real destination or out of Dominique's sight and still ahead of her.
    const Vec2 t = targetOf(last);
    if (distance(t, door) < 0.1) continue;
    CHECK(distance(t, w.character("dominique")->position) > sight);
    CHECK(distance(w.character("naomi")->position, door) > distance(t, door));
  }
  REQUIRE(stopped(w, "naomi"));
  CHECK(told.size() > 3);            // re-cut as they went...
  CHECK(told.size() * 20 < static_cast<std::size_t>(ticks));  // ...but not every tick
  // Once the house is in reach of sight, the real door is what she's walking to.
  CHECK(distance(targetOf(told[told.size() - 2]), door) < 0.1);
  CHECK(told.back()["moving"] == false);
}

TEST_CASE("people: the stop a bus rider gets off at is hidden when it's out of sight") {
  World w = onlineWorld();
  REQUIRE(w.exitBuilding("dominique"));
  REQUIRE(w.exitBuilding("dax"));
  REQUIRE(w.moveTo("dominique", {290, 535}));
  REQUIRE(w.moveTo("dax", {300, 535}));  // the Maple Court stop
  (void)tickUntil(w, [&] { return stopped(w, "dominique") && stopped(w, "dax"); });
  (void)tick(w);
  const Vec2 riverside{760, 575};
  REQUIRE(w.ride("dax", "stop_riverside", true, "card"));
  const auto evs = tick(w);
  const auto dax = about(changesFor(evs, "dominique"), "dax");
  REQUIRE(dax.size() == 1);
  CHECK(dax[0]["mode"] == "bus");
  const Vec2 cut = targetOf(dax[0]);
  CHECK(distance(cut, riverside) > 250);
  CHECK(distance(w.character("dominique")->position, cut) > realContent()->sim().sightRangeMeters);
  CHECK(targetOf(about(changesFor(evs, "dax"), "dax")[0]) == riverside);
  CHECK(targetOf(w.look("dax").value()["you"]) == riverside);
}

TEST_CASE("people: a forced move to jail is news to the prisoner and to the onlookers") {
  auto db = patchedContent([](Json& doc, const std::string& file) {
    if (file != "crimes.json") return;
    for (auto& c : doc["crime"]["crimes"]) {
      if (c["id"] == "shoplifting") c["detection"] = 1.0;
    }
  });
  World w = onlineWorld(db);
  w.advanceMinutes(3 * 60);  // 10:00: Thread & Co. is open
  walkInto(w, "dominique", "thread_co");
  walkInto(w, "dax", "thread_co");
  (void)w.drainEvents();
  (void)tick(w);
  auto r = w.steal("dax", "sunglasses");
  REQUIRE(r);
  REQUIRE(r.value()["caught"] == true);
  REQUIRE(w.character("dax")->inside == "police_station");
  const auto evs = tick(w);
  const auto seen = about(changesFor(evs, "dominique"), "dax");
  REQUIRE(seen.size() == 1);
  CHECK(seen[0]["state"] == "gone");
  CHECK(seen[0]["reason"] == "moved_away");  // taken away; where to isn't something she saw
  CHECK(!seen[0].contains("location"));
  const auto self = about(changesFor(evs, "dax"), "dax");
  REQUIRE(self.size() == 1);
  CHECK(self[0]["self"] == true);
  CHECK(self[0]["inside"] == "police_station");
  CHECK(self[0]["position"] == Json::array({650.0, 300.0}));
}

TEST_CASE("people: a bus rider shows as mode bus at the line's speed; you can't step off mid-ride") {
  World w = onlineWorld();
  REQUIRE(w.exitBuilding("dominique"));
  REQUIRE(w.exitBuilding("dax"));
  REQUIRE(w.moveTo("dominique", {380, 520}));
  REQUIRE(w.moveTo("dax", {300, 535}));  // the Maple Court stop
  (void)tickUntil(w, [&] { return stopped(w, "dominique") && stopped(w, "dax"); });
  REQUIRE(w.ride("dax", "stop_founders_main", true, "card"));
  auto evs = tick(w);
  auto dax = about(changesFor(evs, "dominique"), "dax");
  REQUIRE(dax.size() == 1);
  CHECK(dax[0]["mode"] == "bus");
  CHECK(dax[0]["speed_mps"] == w.content().transit().lines.at(0).speedMps);
  CHECK(dax[0]["moving"] == true);
  CHECK(dax[0]["target"] == Json::array({465.0, 575.0}));
  const auto self = about(changesFor(evs, "dax"), "dax");
  REQUIRE(self.size() == 1);
  CHECK(self[0]["mode"] == "bus");
  const Json you = w.look("dax").value()["you"];
  CHECK(you["mode"] == "bus");
  CHECK(you["speed_mps"] == w.content().transit().lines.at(0).speedMps);
  CHECK(you["target"] == Json::array({465.0, 575.0}));
  CHECK(w.enter("dax", "fade_glow").error().code == "riding");
  evs = tickUntil(w, [&] { return stopped(w, "dax"); });
  dax = about(changesFor(evs, "dominique"), "dax");
  REQUIRE(dax.size() == 1);  // the stop is in her sight the whole way
  CHECK(dax[0]["mode"] == "walk");
  CHECK(dax[0]["moving"] == false);
  CHECK(dax[0]["speed_mps"] == 0);
}

TEST_CASE("people: a character played by a script is labelled for everyone who sees them") {
  World w = onlineWorld();
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "dax", "heritage_coffee");
  (void)w.drainEvents();
  (void)tick(w);
  w.setScripted("dax", true);
  CHECK(w.isScripted("dax"));
  const auto evs = tick(w);
  const auto dax = about(changesFor(evs, "dominique"), "dax");
  REQUIRE(dax.size() == 1);
  CHECK(dax[0]["scripted"] == true);
  CHECK(about(changesFor(evs, "dax"), "dax")[0]["scripted"] == true);
  CHECK(w.look("dominique").value()["people"][0]["scripted"] == true);
  w.disconnect("dax");
  CHECK(!w.isScripted("dax"));  // the label goes with the session
}

TEST_CASE("speech: hearers get where the speaker is, and how far outdoors") {
  World w = onlineWorld();
  REQUIRE(w.exitBuilding("dominique"));
  REQUIRE(w.exitBuilding("dax"));
  REQUIRE(w.moveTo("dominique", {400, 350}));
  REQUIRE(w.moveTo("dax", {415, 350}));
  (void)tickUntil(w, [&] { return stopped(w, "dominique") && stopped(w, "dax"); });
  REQUIRE(w.say("dominique", "Over here", "say"));
  int heard = 0;
  for (const auto& e : w.drainEvents()) {
    if (e.type != "speech") continue;
    ++heard;
    CHECK(e.recipients == std::vector<CharacterId>{"dax"});
    CHECK(e.data["position"] == Json::array({400.0, 350.0}));
    CHECK(e.data["distance_m"] == 15);
  }
  CHECK(heard == 1);
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "dax", "heritage_coffee");
  (void)w.drainEvents();
  REQUIRE(w.say("dax", "Inside voice", "say"));
  for (const auto& e : w.drainEvents()) {
    if (e.type != "speech") continue;
    CHECK(e.data["position"] == Json::array({470.0, 430.0}));
    CHECK(!e.data.contains("distance_m"));
  }
}

TEST_CASE("speech: onlookers see a whisper happen, never what was said, and the listener isn't told twice") {
  World w = World::createNew(realContent());
  for (const char* id : {"dominique", "dax", "aaliyah"}) REQUIRE(w.connect(id));
  for (const char* id : {"dominique", "dax", "aaliyah"}) walkInto(w, id, "heritage_coffee");
  (void)w.drainEvents();
  REQUIRE(w.say("dominique", "Don't tell anyone.", "whisper", "dax"));
  int whispering = 0;
  for (const auto& e : w.drainEvents()) {
    if (e.type == "speech") CHECK(e.recipients == std::vector<CharacterId>{"dax"});
    if (e.type != "whispering") continue;
    ++whispering;
    CHECK(e.recipients == std::vector<CharacterId>{"aaliyah"});
    CHECK(e.data["from"] == "dominique");
    CHECK(e.data["from_name"] == "Dominique Ashford");
    CHECK(e.data["to"] == "dax");
    CHECK(e.data["to_name"] == "Dax Hendrix");
    CHECK(!e.data.contains("text"));
    CHECK(e.data.dump().find("tell anyone") == std::string::npos);
  }
  CHECK(whispering == 1);
  // Outdoors, only people within say range notice.
  for (const char* id : {"dominique", "dax", "aaliyah"}) REQUIRE(w.exitBuilding(id));
  REQUIRE(w.moveTo("aaliyah", {470, 460}));  // 30 m from the door: further than a say carries
  (void)tickUntil(w, [&] { return stopped(w, "aaliyah"); });
  REQUIRE(w.say("dominique", "Later.", "whisper", "dax"));
  for (const auto& e : w.drainEvents()) CHECK(e.type != "whispering");
}

TEST_CASE("map: the public rules, transit lines and interactions come from data") {
  World w = World::createNew(realContent());
  const ContentDatabase& db = *realContent();
  const Json m = w.mapView();
  const Json& rules = m["rules"];
  CHECK(rules == w.publicRules());
  CHECK(rules["whisper_range_m"] == db.sim().whisperRangeMeters);
  CHECK(rules["say_range_m"] == db.sim().hearingRangeMeters);
  CHECK(rules["shout_range_m"] == db.sim().shoutRangeMeters);
  CHECK(rules["sight_range_m"] == 160);
  CHECK(rules["walk_speed_mps"] == db.sim().walkSpeedMetersPerSecond);
  CHECK(rules["minutes_per_real_second"] == db.sim().minutesPerRealSecond);
  CHECK(rules["entry_radius_m"] == db.sim().entryRadiusMeters);
  CHECK(rules["boarding_radius_m"] == db.transit().boardingRadiusMeters);
  CHECK(rules["needs_at_zero"].is_object());  // what each need does at 0 (D-080): none without needs_at_zero.json
  CHECK(rules["sleep"]["wake_hour"] == db.life().wakeHour);  // and when you can go to bed or nap
  CHECK(rules["sleep"]["nap_below_energy"] == db.life().napBelowEnergy);
  CHECK(rules["court"]["courthouse"] == db.court().courthouse);  // the court's sittings, lawyers and record (D-083)
  CHECK(rules["court"]["sitting_hours"] == Json::array({db.court().sitFrom, db.court().sitTo}));
  CHECK(rules.size() == 11);
  REQUIRE(m["transit"]["lines"].size() == db.transit().lines.size());
  const Json& line = m["transit"]["lines"][0];
  CHECK(line["id"] == "line_1");
  CHECK(line["fare_cents"] == 275);
  CHECK(line["speed_mps"] == db.transit().lines.at(0).speedMps);
  CHECK(line["first_hour"] == 5);
  CHECK(line["last_hour"] == 1);
  CHECK(line["stops"].size() == db.transit().lines[0].stops.size());
  CHECK(line["stops"][0]["at"] == Json::array({760.0, 575.0}));
  REQUIRE(m["interactions"].size() == db.interactions().size());
  for (const auto& i : m["interactions"]) {
    const InteractionDef* def = db.interaction(i["id"].get<std::string>());
    REQUIRE(def);
    CHECK(i["label"] == def->label);
    CHECK(i["range_m"] == def->rangeMeters);
  }
  CHECK(!m["places"].empty());
}
