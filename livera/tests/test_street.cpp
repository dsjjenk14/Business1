// Street life (D-069, D-070): shoplifting where the data allows it, the risk of a crime shown from what anyone can see,
// officers in uniform, being wanted and held, and fist fights: every refusal, the choice window, the outcomes, the
// crime for whoever started it (never for self-defence), walking away, the autopilot's rule and the rate limits.
#include "TestSupport.h"
#include "core/Clock.h"
#include "core/Serialization.h"

using namespace livera;
using namespace livera::test;

namespace {

bool contains(const std::string& s, const std::string& part) { return s.find(part) != std::string::npos; }

// Quiet health; crime and fight tuning per test.
std::shared_ptr<const ContentDatabase> streetContent(const std::function<void(Json& crime)>& crime = {},
                                                     const std::function<void(Json& fights)>& fights = {}) {
  return patchedContent([&](Json& doc, const std::string& file) {
    if (file == "conditions.json") {
      for (auto& c : doc["conditions"]) {
        if (c.contains("catch")) c["catch"] = Json{{"hourly_chance", 0.0}};
      }
    }
    if (file == "crimes.json" && crime) crime(doc["crime"]);
    if (file == "fights.json" && fights) fights(doc["fights"]);
    if (file == "life_events.json") doc["life_events"]["per_day"] = 1;  // keep events out of the way
  });
}

void setCrime(Json& crime, const std::string& id, double detection) {
  for (auto& c : crime["crimes"]) {
    if (c["id"] == id) c["detection"] = detection, c["per_witness"] = 0.0, c["per_staff"] = 0.0, c["per_police"] = 0.0;
  }
}

World streetWorld(std::shared_ptr<const ContentDatabase> db, std::initializer_list<const char*> who = {"dominique", "dax"}) {
  World w = World::createNew(std::move(db));
  for (const char* id : who) REQUIRE(w.connect(id));
  w.advanceMinutes(3 * 60);  // 10:00
  (void)w.drainEvents();
  return w;
}

std::vector<Json> eventsOf(const std::vector<WorldEvent>& evs, const CharacterId& to, const std::string& type) {
  std::vector<Json> out;
  for (const auto& e : evs) {
    if (e.type == type && std::find(e.recipients.begin(), e.recipients.end(), to) != e.recipients.end()) out.push_back(e.data);
  }
  return out;
}

bool injured(const World& w, const CharacterId& id) {
  for (const auto& k : w.character(id)->conditions) {
    const ConditionDef* d = w.content().condition(k.id);
    if (d && d->kind == "injury") return true;
  }
  return false;
}

// Fights with no luck in them: noise 0, no random injury for the winner.
void fair(Json& f) {
  f["score"]["noise"] = 0;
  f["winner"]["injury_chance"] = 0.0;
}

std::string startedFight(World& w, const CharacterId& a, const CharacterId& d) {
  auto r = w.startFight(a, d);
  if (!r) throw std::runtime_error("fight refused: " + r.error().code);
  return r.value()["fight"].get<std::string>();
}

}  // namespace

// ---- Crimes where they happen (D-069) --------------------------------------------------------
TEST_CASE("street: shoplifting only in the kinds of shop the data names") {
  World w = streetWorld(streetContent([](Json& c) { setCrime(c, "shoplifting", 0.0); }));
  CHECK(!w.content().crime().shopliftPlaceTypes.empty());
  walkInto(w, "dominique", "fade_glow");  // a salon: nothing to slip into a pocket
  CHECK(w.steal("dominique", "haircut").error().code == "cant_steal_here");
  walkInto(w, "dominique", "thread_co");
  REQUIRE(w.steal("dominique", "sunglasses"));
  // Content can't name a kind of place that doesn't exist.
  bool refused = false;
  try {
    (void)patchedContent([](Json& doc, const std::string& file) {
      if (file == "crimes.json") doc["crime"]["shoplift_place_types"] = {"moon_base"};
    });
  } catch (const std::exception& e) {
    refused = contains(e.what(), "unknown place type 'moon_base'");
  }
  CHECK(refused);
}

TEST_CASE("street: crime_risk shows the odds from who would see it, and the ladder from data") {
  World w = streetWorld(streetContent(), {"dominique", "dax", "aaliyah"});
  const CrimeDef* shoplifting = w.content().crimeDef("shoplifting");
  REQUIRE(shoplifting);
  // Outside a shop: no number, a note, and the ladder.
  auto out = w.crimeRisk("dominique", "shoplifting");
  REQUIRE(out);
  CHECK(out.value()["chance"].is_null());
  CHECK(out.value().contains("note"));
  CHECK(out.value()["if_caught"]["fine_cents"] == shoplifting->fineCents);
  CHECK(out.value()["if_caught"]["jail_minutes"] == shoplifting->jailMinutes);
  CHECK(out.value()["if_caught"]["jail_if_unpaid_minutes"] == shoplifting->jailMinutes * 2 + 240);
  CHECK(out.value()["if_caught"]["record"] == true);
  // Inside, with one other shopper: the base plus one witness, exactly as steal() would count it.
  walkInto(w, "dominique", "thread_co");
  walkInto(w, "aaliyah", "thread_co");
  auto in = w.crimeRisk("dominique", "shoplifting");
  REQUIRE(in);
  CHECK(in.value()["seen_by"]["witnesses"] == 1);
  CHECK(in.value()["seen_by"]["police"] == 0);
  CHECK_NEAR(in.value()["chance"].get<double>(), shoplifting->detection + shoplifting->perWitness, 0.006);
  bool sunglasses = false;
  for (const auto& o : in.value()["offers"]) sunglasses |= o == "sunglasses";
  CHECK(sunglasses);
  // Pickpocketing: the notice chance and the cash cap; odds once you're with them.
  auto pp = w.crimeRisk("dominique", "pickpocketing", "dax");
  REQUIRE(pp);
  CHECK(pp.value()["chance"].is_null());
  CHECK(pp.value()["notice_chance"] == w.content().crime().pickpocketNoticeChance);
  auto pp2 = w.crimeRisk("dominique", "pickpocketing", "aaliyah");
  REQUIRE(pp2);
  CHECK(pp2.value()["chance"].is_number());
  // Fare dodging: the line's published inspection chance and fine.
  auto fare = w.crimeRisk("dominique", "fare_evasion");
  REQUIRE(fare);
  CHECK(fare.value()["chance"] == w.content().transit().lines.front().inspectionChance);
  CHECK(fare.value()["if_caught"]["fine_cents"] == w.content().transit().lines.front().evasionFineCents);
  // Assault: the ladder, the report chances, the injuries, and that self-defence never is a crime.
  auto hit = w.crimeRisk("dominique", "assault", "aaliyah");
  REQUIRE(hit);
  CHECK(hit.value()["chance"].is_number());
  CHECK(hit.value()["injuries"].size() == w.content().fights().injuries.size());
  CHECK(hit.value().contains("self_defence"));
  CHECK(w.crimeRisk("dominique", "jaywalking").error().code == "unknown_crime");
}

TEST_CASE("street: the Underpass after dark sells contraband; the odds and the possession charge are shown") {
  World w = streetWorld(streetContent(), {"dominique"});
  walkTo(w, "dominique", "the_underpass");
  auto day = w.crimeRisk("dominique", "drug_purchase");
  REQUIRE(day);
  CHECK(day.value()["chance"].is_null());  // closed in daylight: nobody's selling
  w.advanceMinutes(11 * 60);               // 21:00
  auto night = w.crimeRisk("dominique", "drug_purchase");
  REQUIRE(night);
  const CrimeDef* buy = w.content().crimeDef("drug_purchase");
  CHECK_NEAR(night.value()["chance"].get<double>(), buy->detection, 0.006);
  REQUIRE(night.value()["possession"].size() == 3);
  CHECK(night.value()["possession"][0]["crime"] == "Drug possession");
  // look.here marks what's illegal.
  const Json here = w.look("dominique").value()["here"];
  REQUIRE(here["id"] == "the_underpass");
  for (const auto& o : here["offers"]) CHECK(o.value("illegal", false));
}

TEST_CASE("street: an officer on duty is in uniform for anyone who sees them; off duty they aren't") {
  WorldState st = World::createNew(streetContent()).state();
  st.characters.at("dax").career.careerId = "police";
  st.characters.at("dax").career.level = 0;
  World w(streetContent(), st);
  REQUIRE(w.connect("dominique"));
  REQUIRE(w.connect("dax"));
  walkInto(w, "dax", "police_station");
  REQUIRE(w.startShift("dax"));
  REQUIRE(w.exitBuilding("dax"));  // police stay on duty on patrol
  walkTo(w, "dominique", "police_station");
  (void)w.drainEvents();
  const Json people = w.look("dominique").value()["people"];
  bool uniform = false;
  for (const auto& p : people) uniform |= p["id"] == "dax" && p.value("uniform", "") == "police";
  CHECK(uniform);
  // Going off duty is news in the people stream: the uniform is gone.
  REQUIRE(w.endShift("dax"));
  w.advanceRealTime(0.1);
  bool told = false;
  for (const auto& e : eventsOf(w.drainEvents(), "dominique", "people")) {
    for (const auto& c : e["changes"]) told |= c["character"] == "dax" && !c.contains("uniform");
  }
  CHECK(told);
}

TEST_CASE("street: look and the record app say you're wanted, and how long you're held") {
  World w = streetWorld(streetContent([](Json& c) {
    setCrime(c, "pickpocketing", 0.0);
    c["pickpocket_notice_chance"] = 1.0;
    c["patrol_arrest_per_hour"] = 1.0;
  }));
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "dax", "heritage_coffee");
  REQUIRE(w.pickpocket("dominique", "dax"));
  CHECK(w.look("dominique").value()["you"]["wanted_for"] == "Pickpocketing");
  const Json rec = w.openPhoneApp("dominique", "record").value();
  CHECK(rec["wanted"] == true);
  CHECK(rec["wanted_for"] == "Pickpocketing");
  REQUIRE(w.exitBuilding("dominique"));
  w.advanceMinutes(61);  // a patrol picks her up in the open
  REQUIRE(w.inJail("dominique"));
  const Json you = w.look("dominique").value()["you"];
  CHECK(!you.contains("wanted_for"));
  CHECK(you["jailed_until"] == w.character("dominique")->jailedUntil);
  const Json held = w.openPhoneApp("dominique", "record").value();
  CHECK(held["jailed_until_minute"] == w.character("dominique")->jailedUntil);
  CHECK(held["held_at"] == "Livéra Police Station");
}

// ---- Fist fights (D-070) -----------------------------------------------------------------------
TEST_CASE("fights: every refusal") {
  World w = streetWorld(streetContent(), {"dominique", "dax", "aaliyah"});
  CHECK(w.startFight("dominique", "dominique").error().code == "invalid_target");
  CHECK(w.startFight("dominique", "maya").error().code == "target_unavailable");
  CHECK(w.startFight("dominique", "dax").error().code == "too_far");
  walkInto(w, "dominique", "riverdale_clinic");
  walkInto(w, "dax", "riverdale_clinic");
  CHECK(w.startFight("dominique", "dax").error().code == "no_fighting_here");
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "dax", "heritage_coffee");
  walkInto(w, "aaliyah", "heritage_coffee");
  // A founder a script plays, at work: not unless the data allows it.
  w.setScripted("aaliyah", true, "autopilot");
  WorldState st = w.state();
  st.characters.at("aaliyah").career.shiftStartedAt = st.now;
  {
    World x(w.contentPtr(), st);
    x.setScripted("aaliyah", true, "autopilot");
    CHECK(x.startFight("dominique", "aaliyah").error().code == "not_now");
  }
  w.setScripted("aaliyah", false);
  // Asleep, in a cell, a child.
  {
    WorldState s = w.state();
    s.characters.at("dax").asleepSince = s.now;
    World x(w.contentPtr(), s);
    CHECK(x.startFight("dominique", "dax").error().code == "asleep");
  }
  {
    WorldState s = w.state();
    s.characters.at("dax").jailedUntil = s.now + 600;
    World x(w.contentPtr(), s);
    CHECK(x.startFight("dominique", "dax").error().code == "target_in_jail");
    CHECK(x.startFight("dax", "dominique").error().code == "in_jail");
  }
  {
    WorldState s = w.state();
    s.characters.at("dax").bornAt = s.now - 10 * kMinutesPerYear;
    World x(w.contentPtr(), s);
    CHECK(x.startFight("dominique", "dax").error().code == "minor");
  }
  // One at a time; then the attacker's cooldown, the defender's protection, and once a pair a day.
  const std::string id = startedFight(w, "dominique", "dax");
  CHECK(w.startFight("aaliyah", "dax").error().code == "busy");
  CHECK(w.startFight("dominique", "aaliyah").error().code == "busy");
  REQUIRE(w.respondToFight("dax", id, "take_it"));
  CHECK(w.startFight("dominique", "aaliyah").error().code == "cooling_down");
  CHECK(w.startFight("aaliyah", "dax").error().code == "protected");
  // Fights aren't part of a world without the section.
  auto none = patchedContent([](Json& doc, const std::string&) { doc.erase("fights"); });
  World plain = streetWorld(none);
  CHECK(plain.startFight("dominique", "dax").error().code == "unavailable");
  CHECK(plain.setWalkAwayFromFights("dominique", true).error().code == "unavailable");
}

TEST_CASE("fights: the person attacked is asked, with a window; only they answer, once") {
  World w = streetWorld(streetContent());
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "dax", "heritage_coffee");
  (void)w.drainEvents();
  auto r = w.startFight("dominique", "dax");
  REQUIRE(r);
  CHECK(r.value()["status"] == "waiting");
  CHECK(r.value()["expires_in_minutes"] == w.content().fights().windowMinutes);
  const auto evs = w.drainEvents();
  const auto asked = eventsOf(evs, "dax", "fight_started");
  REQUIRE(asked.size() == 1);
  CHECK(asked[0]["from"] == "dominique");
  CHECK(asked[0]["choices"].size() == 3);
  CHECK(eventsOf(evs, "dominique", "fight_started").empty());
  CHECK(eventsOf(evs, "dax", "fight").size() == 1);  // the map shows it start
  const std::string id = r.value()["fight"];
  CHECK(w.respondToFight("dominique", id, "run").error().code == "unknown_fight");  // not hers to answer
  CHECK(w.respondToFight("dax", "fight-0", "run").error().code == "unknown_fight");
  CHECK(w.respondToFight("dax", id, "cry").error().code == "bad_choice");
  REQUIRE(w.respondToFight("dax", id, "take_it"));
  CHECK(w.respondToFight("dax", id, "take_it").error().code == "unknown_fight");
}

TEST_CASE("fights: nobody answers in time: they froze and took it; both hear how it went") {
  World w = streetWorld(streetContent([](Json& c) { setCrime(c, "assault", 0.0); }, [](Json& f) { f["report_chance"] = 0.0; }));
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "dax", "heritage_coffee");
  (void)startedFight(w, "dominique", "dax");
  (void)w.drainEvents();
  w.advanceMinutes(w.content().fights().windowMinutes + 1);
  const auto evs = w.drainEvents();
  const auto mine = eventsOf(evs, "dominique", "fight_result"), his = eventsOf(evs, "dax", "fight_result");
  REQUIRE(mine.size() == 1);
  REQUIRE(his.size() == 1);
  CHECK(his[0]["outcome"] == "froze");
  CHECK(his[0]["won"] == false);
  CHECK(injured(w, "dax"));
  CHECK(w.state().fights.empty());
}

TEST_CASE("fights: fighting back: the stronger wins; the loser's injury follows the margin; a clinic treats it") {
  auto db = streetContent([](Json& c) { setCrime(c, "assault", 0.0); },
                          [](Json& f) {
                            fair(f);
                            f["report_chance"] = 0.0;
                          });
  WorldState st = World::createNew(db).state();
  st.characters.at("dax").skills["athletics"] = 100;
  st.characters.at("dominique").skills["athletics"] = 0;
  for (const char* id : {"dax", "dominique"}) st.characters.at(id).needs["energy"] = st.characters.at(id).needs["health"] = 80;
  World w(db, st);
  REQUIRE(w.connect("dominique"));
  REQUIRE(w.connect("dax"));
  w.advanceMinutes(3 * 60);
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "dax", "heritage_coffee");
  const double energy = w.character("dominique")->needs.at("energy");
  const std::string id = startedFight(w, "dominique", "dax");
  w.advanceMinutes(1);  // the fight's first minute: nobody's needs move enough to matter
  auto r = w.respondToFight("dax", id, "fight_back");
  REQUIRE(r);
  CHECK(r.value()["outcome"] == "defender_won");
  CHECK(r.value()["won"] == true);
  // A 35-point margin (athletics 100 x 0.35): the worst injury the data lists.
  CHECK(w.hasCondition("dominique", "cracked_rib"));
  CHECK(!injured(w, "dax"));
  CHECK(w.character("dominique")->needs.at("energy") < energy);
  CHECK(w.character("dax")->record.empty());  // self-defence is never a crime
  const ConditionState* rib = nullptr;
  for (const auto& k : w.character("dominique")->conditions) {
    if (k.id == "cracked_rib") rib = &k;
  }
  REQUIRE(rib);
  CHECK(rib->diagnosed);
  // Both remember; he trusts her less.
  bool remembers = false;
  for (const Memory* m : w.memoriesOf("dax")) remembers |= m->type == "fight" && m->about == "dominique";
  CHECK(remembers);
  CHECK(w.relationshipValue("dax", "dominique", "trust") < 0);
  // The clinic treats it.
  walkInto(w, "dominique", "riverdale_clinic");
  REQUIRE(w.buy("dominique", "treatment", "card"));
  CHECK(!w.hasCondition("dominique", "cracked_rib"));
}

TEST_CASE("fights: running: a clean break gets distance and nothing lands; a failed one is caught") {
  {
    World w = streetWorld(streetContent({}, [](Json& f) { f["run"]["min"] = 1.0; f["run"]["max"] = 1.0; }));
    walkTo(w, "dominique", "founders_park");
    walkTo(w, "dax", "founders_park");
    const std::string id = startedFight(w, "dominique", "dax");
    auto r = w.respondToFight("dax", id, "run");
    REQUIRE(r);
    CHECK(r.value()["outcome"] == "ran");
    CHECK(!injured(w, "dax"));
    CHECK(w.character("dax")->moveTarget.has_value());
    CHECK(w.character("dominique")->record.empty());  // nothing landed: no assault
    CHECK(w.character("dominique")->wantedFor.empty());
  }
  {
    World w = streetWorld(streetContent([](Json& c) { setCrime(c, "assault", 0.0); },
                                        [](Json& f) { f["run"]["min"] = 0.0; f["run"]["max"] = 0.0; f["report_chance"] = 1.0; }));
    walkInto(w, "dominique", "heritage_coffee");
    walkInto(w, "dax", "heritage_coffee");
    const std::string id = startedFight(w, "dominique", "dax");
    auto r = w.respondToFight("dax", id, "run");
    REQUIRE(r);
    CHECK(r.value()["outcome"] == "caught");
    CHECK(injured(w, "dax"));
    CHECK(w.character("dominique")->wantedFor == "assault");  // reported
    CHECK(r.value()["crime"]["reported"] == true);
  }
}

TEST_CASE("fights: whoever starts it commits assault when a blow lands: caught in the act, or reported and wanted") {
  {
    // Caught in the act (as every crime, at most 95% sure): over a few worlds, nearly always; never the defender.
    int arrested = 0;
    for (std::uint64_t seed = 1; seed <= 10; ++seed) {
      auto db = streetContent([](Json& c) { setCrime(c, "assault", 1.0); }, fair);
      WorldState st = World::createNew(db).state();
      st.rng = seed * 104729;
      World w(db, st);
      REQUIRE(w.connect("dominique"));
      REQUIRE(w.connect("dax"));
      w.advanceMinutes(3 * 60);
      walkInto(w, "dominique", "heritage_coffee");
      walkInto(w, "dax", "heritage_coffee");
      const std::string id = startedFight(w, "dominique", "dax");
      auto r = w.respondToFight("dax", id, "fight_back");
      REQUIRE(r);
      CHECK(w.character("dax")->record.empty());  // fighting back is self-defence
      if (!r.value().contains("crime") || !r.value()["crime"].value("arrested", false)) continue;
      ++arrested;
      CHECK(w.inJail("dominique"));
      REQUIRE(w.character("dominique")->record.size() == 1);
      CHECK(w.character("dominique")->record[0].crime == "assault");
    }
    CHECK(arrested >= 8);
  }
  {
    World w = streetWorld(streetContent([](Json& c) { setCrime(c, "assault", 0.0); }, [](Json& f) { f["report_chance"] = 0.0; }));
    walkInto(w, "dominique", "heritage_coffee");
    walkInto(w, "dax", "heritage_coffee");
    const std::string id = startedFight(w, "dominique", "dax");
    (void)w.drainEvents();
    REQUIRE(w.respondToFight("dax", id, "take_it"));
    CHECK(w.character("dominique")->wantedFor.empty());  // nobody reported it (and nobody saw)
    const auto told = eventsOf(w.drainEvents(), "dominique", "fight_result");
    REQUIRE(told.size() == 1);
    CHECK(told[0]["crime"]["wanted"] == false);
  }
}

TEST_CASE("fights: witnesses see who started it, think less of them, and talk") {
  World w = streetWorld(streetContent([](Json& c) { setCrime(c, "assault", 0.0); },
                                      [](Json& f) { f["report_chance"] = 0.0; f["witness_report_chance"] = 1.0; }),
                        {"dominique", "dax", "aaliyah"});
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "dax", "heritage_coffee");
  walkInto(w, "aaliyah", "heritage_coffee");
  const double trust = w.relationshipValue("aaliyah", "dominique", "trust");
  const std::size_t rumors = w.state().details.rumors.size();
  const std::string id = startedFight(w, "dominique", "dax");
  (void)w.drainEvents();
  REQUIRE(w.respondToFight("dax", id, "take_it"));
  const auto seen = eventsOf(w.drainEvents(), "aaliyah", "fight");
  REQUIRE(seen.size() == 1);
  CHECK(seen[0]["attacker"] == "dominique");
  CHECK(seen[0]["stage"] == "over");
  CHECK(w.relationshipValue("aaliyah", "dominique", "trust") < trust);
  bool saw = false;
  for (const Memory* m : w.memoriesOf("aaliyah")) saw |= m->type == "saw_fight" && m->about == "dominique";
  CHECK(saw);
  REQUIRE(w.state().details.rumors.size() == rumors + 1);
  CHECK(contains(w.state().details.rumors.back().what, "started a fight"));
  CHECK(w.character("dominique")->wantedFor == "assault");  // a witness reported it
}

TEST_CASE("fights: someone who always walks away is never hurt, and nothing lands") {
  World w = streetWorld(streetContent([](Json& c) { setCrime(c, "assault", 1.0); }));
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "dax", "heritage_coffee");
  REQUIRE(w.setWalkAwayFromFights("dax", true));
  CHECK(w.openPhoneApp("dax", "record").value()["walk_away_from_fights"] == true);
  (void)w.drainEvents();
  auto r = w.startFight("dominique", "dax");
  REQUIRE(r);
  CHECK(r.value()["outcome"] == "walked_away");
  CHECK(!injured(w, "dax"));
  CHECK(!w.inJail("dominique"));  // no blow, no assault
  CHECK(w.state().fights.empty());
  CHECK(eventsOf(w.drainEvents(), "dax", "fight_result").size() == 1);
  // The preference is saved.
  auto back = worldStateFromJson(worldStateToJson(w.state()));
  REQUIRE(back);
  CHECK(back.value().characters.at("dax").street.walkAway);
  CHECK(back.value().characters.at("dominique").street.fought.at("dax") == toDateTime(w.now()).dayIndex);
}

TEST_CASE("fights: a founder a script plays answers at once, by its trait: fights back, or walks away") {
  World w = streetWorld(streetContent([](Json& c) { setCrime(c, "assault", 0.0); }, [](Json& f) { f["report_chance"] = 0.0; }),
                        {"dominique", "dax", "andre"});
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "dax", "heritage_coffee");
  walkInto(w, "andre", "heritage_coffee");
  const double at = w.content().fights().autopilotFightBackAt;
  REQUIRE(w.definition("dominique")->personality.at("competitiveness") >= at);
  REQUIRE(w.definition("dax")->personality.at("competitiveness") < at);
  w.setScripted("dominique", true, "autopilot");
  w.setScripted("dax", true, "autopilot");
  auto fought = w.startFight("andre", "dominique");
  REQUIRE(fought);
  CHECK((fought.value()["outcome"] == "attacker_won" || fought.value()["outcome"] == "defender_won"));
  WorldState st = w.state();
  st.characters.at("andre").street.nextFightAt = -1;  // past the cooldown
  World x(w.contentPtr(), st);
  x.setScripted("dax", true, "autopilot");
  auto walked = x.startFight("andre", "dax");
  REQUIRE(walked);
  CHECK(walked.value()["outcome"] == "walked_away");
}

TEST_CASE("fights: once a pair a game day, whoever starts it") {
  World w = streetWorld(streetContent([](Json& c) { setCrime(c, "assault", 0.0); },
                                      [](Json& f) {
                                        f["attacker_cooldown_minutes"] = 0;
                                        f["protected_minutes"] = 0;
                                        f["report_chance"] = 0.0;
                                      }));
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "dax", "heritage_coffee");
  const std::string id = startedFight(w, "dominique", "dax");
  REQUIRE(w.respondToFight("dax", id, "take_it"));
  CHECK(w.startFight("dominique", "dax").error().code == "too_soon");
  CHECK(w.startFight("dax", "dominique").error().code == "too_soon");
  w.advanceMinutes(kMinutesPerDay);
  REQUIRE(w.startFight("dax", "dominique"));
}
