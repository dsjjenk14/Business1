// Tests for M0.8 leisure: see docs/m08/leisure.md.
#include <atomic>
#include <chrono>
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

// The real content with fast walking, so getting around town barely moves the clock.
std::shared_ptr<const ContentDatabase> fastContent() {
  static auto db = patchedContent([](Json& doc, const std::string& file) {
    if (file == "simulation.json") doc["simulation"]["walk_speed_mps"] = 400.0;
  });
  return db;
}

// League matches without chance: no luck in the strengths and exact expected scores. A player
// is worth 20-40 strength (by energy), so one member turning up decides a match.
std::shared_ptr<const ContentDatabase> leagueContent() {
  static auto db = patchedContent([](Json& doc, const std::string& file) {
    if (file == "simulation.json") doc["simulation"]["walk_speed_mps"] = 400.0;
    if (file == "sports.json") {
      Json& L = doc["leisure"];
      L["luck"] = 0;
      L["player"]["base"] = 40;
      for (auto& s : L["sports"]) s["scoring"]["noise"] = 0;
    }
  });
  return db;
}

bool notified(const World& w, const CharacterId& id, const std::string& fragment) {
  for (const auto& n : w.state().notifications) {
    if (n.recipient == id && n.text.find(fragment) != std::string::npos) return true;
  }
  return false;
}

int memoriesOfType(const World& w, const CharacterId& id, const std::string& type, const std::string& info = "") {
  int n = 0;
  for (const Memory* m : w.memoriesOf(id)) n += m->type == type && (info.empty() || m->info == info) ? 1 : 0;
  return n;
}

// Lets the world run until the next `hour`:00 (any day), or the next one on `weekday`.
void advanceToHour(World& w, int hour, int weekday = -1) {
  GameMinutes t = (w.now() / kMinutesPerDay) * kMinutesPerDay + hour * kMinutesPerHour;
  while (t <= w.now() || (weekday >= 0 && toDateTime(t).weekday != weekday)) t += kMinutesPerDay;
  w.advanceMinutes(t - w.now());
}

void startDating(World& w, const CharacterId& a, const CharacterId& b, const LocationId& where) {
  walkInto(w, a, where);
  walkInto(w, b, where);
  auto q = w.request(b, "date", a);
  REQUIRE(q);
  REQUIRE(w.respond(a, q.value().at("request").get<std::string>(), true));
  REQUIRE(w.relationshipStatus(a, b) == "dating");
}

// The latest match of a sport (the league plays soccer and basketball in the same weeks).
const LeisureMatch& lastMatch(const World& w, const char* sport) {
  const auto& all = w.state().leisureMatches;
  for (auto it = all.rbegin(); it != all.rend(); ++it) {
    if (it->sport == sport) return *it;
  }
  throw std::runtime_error(std::string("no ") + sport + " matches");
}

int matchesOf(const World& w, const std::string& sport) {
  return static_cast<int>(std::count_if(w.state().leisureMatches.begin(), w.state().leisureMatches.end(),
                                        [&](const LeisureMatch& m) { return m.sport == sport; }));
}

LeisureStanding standing(const World& w, const std::string& team) {
  auto it = w.state().leisureStandings.find(team);
  return it == w.state().leisureStandings.end() ? LeisureStanding{} : it->second;
}

}  // namespace

// ---- Dates ---------------------------------------------------------------------------------
TEST_CASE("leisure: dinner at Lumière with your partner is a date, once per place per day") {
  World w = World::createNew(fastContent());
  REQUIRE(w.connect("dominique"));
  REQUIRE(w.connect("dax"));
  startDating(w, "dominique", "dax", "heritage_coffee");
  advanceToHour(w, 17);  // Lumière opens
  walkInto(w, "dominique", "lumiere_bistro");
  // A partner who isn't there yet doesn't make it a date.
  auto early = w.buy("dominique", "wine", "card");
  REQUIRE(early);
  CHECK(!early.value().contains("dates"));
  walkInto(w, "dax", "lumiere_bistro");
  (void)w.drainEvents();
  const double mine = w.relationshipValue("dominique", "dax", "romantic_attraction");
  const double theirs = w.relationshipValue("dax", "dominique", "romantic_attraction");
  const double familiar = w.relationshipValue("dax", "dominique", "familiarity");
  const double happy = w.character("dax")->emotions.at("happiness");

  auto dinner = w.buy("dominique", "dinner", "card");
  REQUIRE(dinner);
  REQUIRE(dinner.value().contains("dates"));
  const Json date = dinner.value()["dates"][0];
  CHECK(date["with"] == "dax");
  CHECK(date["counted"] == true);
  CHECK(date["memory"] == "Dinner at Lumière with Dax");
  CHECK(w.relationshipValue("dominique", "dax", "romantic_attraction") > mine);
  CHECK(w.relationshipValue("dax", "dominique", "romantic_attraction") > theirs);
  CHECK(w.relationshipValue("dax", "dominique", "familiarity") > familiar);
  CHECK(w.character("dax")->emotions.at("happiness") > happy);  // the partner feels it too, without buying anything
  CHECK(memoriesOfType(w, "dominique", "date", "Dinner at Lumière with Dax") == 1);
  CHECK(memoriesOfType(w, "dax", "date", "Dinner at Lumière with Dominique") == 1);
  CHECK(notified(w, "dax", "That was a date: Dinner at Lumière with Dominique"));
  bool told = false;
  for (const auto& e : w.drainEvents()) {
    if (e.type == "date" && e.recipients == std::vector<CharacterId>{"dax"}) told = e.data["with"] == "dominique";
  }
  CHECK(told);

  // Dessert the same evening is the same date, not a second one.
  const double afterDinner = w.relationshipValue("dominique", "dax", "romantic_attraction");
  auto dessert = w.buy("dax", "dessert", "card");
  REQUIRE(dessert);
  CHECK(dessert.value()["dates"][0]["counted"] == false);
  CHECK(w.relationshipValue("dominique", "dax", "romantic_attraction") == afterDinner);
  CHECK(memoriesOfType(w, "dax", "date") == 1);

  // A movie afterwards is a date somewhere else.
  walkInto(w, "dominique", "starlight_cinema");
  walkInto(w, "dax", "starlight_cinema");
  auto movie = w.buy("dax", "movie_ticket", "card");
  REQUIRE(movie);
  CHECK(movie.value()["dates"][0]["counted"] == true);
  CHECK(movie.value()["dates"][0]["memory"] == "A movie at the Starlight with Dominique");
  auto popcorn = w.buy("dominique", "popcorn", "cash");  // not a date spot by itself
  REQUIRE(popcorn);
  CHECK(!popcorn.value().contains("dates"));

  // The next evening, Lumière counts again.
  advanceToHour(w, 18, 1);
  walkInto(w, "dominique", "lumiere_bistro");
  walkInto(w, "dax", "lumiere_bistro");
  auto again = w.buy("dominique", "wine", "card");
  REQUIRE(again);
  CHECK(again.value()["dates"][0]["counted"] == true);
  CHECK(memoriesOfType(w, "dominique", "date") == 3);
}

TEST_CASE("leisure: a walk or the stars at Willow Lake count as dates outdoors too") {
  World w = World::createNew(fastContent());
  REQUIRE(w.connect("dominique"));
  REQUIRE(w.connect("dax"));
  startDating(w, "dominique", "dax", "heritage_coffee");
  walkTo(w, "dominique", "willow_lake_park");
  walkTo(w, "dax", "willow_lake_park");
  auto walk = w.useActivity("dax", "boardwalk_walk");
  REQUIRE(walk);
  CHECK(walk.value()["dates"][0]["memory"] == "A walk on the Willow Lake boardwalk with Dominique");
  CHECK(walk.value().contains("needs"));  // the activity itself still happened
  // A rowboat at the same lake the same day is the same date.
  auto boat = w.buy("dominique", "rowboat", "card");
  REQUIRE(boat);
  CHECK(boat.value()["dates"][0]["counted"] == false);
  CHECK(memoriesOfType(w, "dominique", "date") == 1);
}

TEST_CASE("leisure: no date alone, with a stranger or with an ex") {
  World w = World::createNew(fastContent());
  for (const auto* id : {"dominique", "dax", "graham"}) REQUIRE(w.connect(id));
  advanceToHour(w, 17);
  walkInto(w, "dominique", "lumiere_bistro");
  auto alone = w.buy("dominique", "dinner", "card");
  REQUIRE(alone);
  CHECK(!alone.value().contains("dates"));
  walkInto(w, "graham", "lumiere_bistro");  // someone she's not seeing
  auto stranger = w.buy("dominique", "dessert", "card");
  REQUIRE(stranger);
  CHECK(!stranger.value().contains("dates"));
  // Dax and Dominique get together and break up the same night: an ex isn't a date.
  walkInto(w, "dax", "lumiere_bistro");
  auto q = w.request("dax", "date", "dominique");
  REQUIRE(q);
  REQUIRE(w.respond("dominique", q.value().at("request").get<std::string>(), true));
  REQUIRE(w.endRelationship("dominique", "dax"));
  CHECK(w.relationshipStatus("dax", "dominique") == "ex");
  auto ex = w.buy("dax", "dinner", "card");
  REQUIRE(ex);
  CHECK(!ex.value().contains("dates"));
  CHECK(memoriesOfType(w, "dominique", "date") == 0);
  CHECK(memoriesOfType(w, "dax", "date") == 0);
}

TEST_CASE("leisure: family is never a date") {
  World base = World::createNew(fastContent());
  WorldState s = base.state();
  // A state the romance rules would never allow, to be sure the date check stands on its own.
  s.characters.at("dax").parents = {"graham"};
  for (const auto& [a, b] : {std::pair{"graham", "dax"}, std::pair{"dax", "graham"}})
    s.relationships[{a, b}].status = "dating";
  World w(fastContent(), s);
  REQUIRE(w.connect("dax"));
  REQUIRE(w.connect("graham"));
  CHECK(w.isFamily("dax", "graham"));
  advanceToHour(w, 17);
  walkInto(w, "dax", "lumiere_bistro");
  walkInto(w, "graham", "lumiere_bistro");
  auto dinner = w.buy("graham", "dinner", "card");
  REQUIRE(dinner);
  CHECK(!dinner.value().contains("dates"));
}

TEST_CASE("leisure: stargazing only after dark, and Lumière keeps its hours") {
  World w = World::createNew(fastContent());
  REQUIRE(w.connect("dominique"));
  // A morning at the park: the boathouse and the boardwalk, but no stars.
  walkTo(w, "dominique", "willow_lake_park");
  auto stars = w.useActivity("dominique", "stargazing");
  REQUIRE(!stars);
  CHECK(stars.error().code == "not_now");
  CHECK(w.useActivity("dominique", "boardwalk_walk"));
  const Cents bank = w.state().ledger.balance(bankAccountOf("dominique"));
  auto picnic = w.buy("dominique", "picnic", "card");
  REQUIRE(picnic);
  CHECK(w.state().ledger.balance(bankAccountOf("dominique")) == bank - picnic.value()["price_cents"].get<Cents>());
  CHECK(w.character("dominique")->caloriesIn >= 900);
  // Lumière is closed in the morning, open from 17:00 and closed again at 23:00.
  walkTo(w, "dominique", "lumiere_bistro");
  auto early = w.enter("dominique", "lumiere_bistro");
  REQUIRE(!early);
  CHECK(early.error().code == "closed");
  advanceToHour(w, 22);
  REQUIRE(w.enter("dominique", "lumiere_bistro"));
  REQUIRE(w.buy("dominique", "dessert", "card"));
  advanceToHour(w, 23);
  auto late = w.buy("dominique", "dinner", "card");
  REQUIRE(!late);
  CHECK(late.error().code == "closed");
  // Stars from 20:00 to 02:00.
  walkTo(w, "dominique", "willow_lake_park");
  CHECK(w.useActivity("dominique", "stargazing"));
  advanceToHour(w, 2);
  auto dawn = w.useActivity("dominique", "stargazing");
  REQUIRE(!dawn);
  CHECK(dawn.error().code == "not_now");
  advanceToHour(w, 20);
  CHECK(w.useActivity("dominique", "stargazing"));
}

// ---- Teams ---------------------------------------------------------------------------------
TEST_CASE("leisure: join a team in person, pay the league, one team per sport, leave") {
  auto db = fastContent();
  World w = World::createNew(db);
  REQUIRE(w.connect("dominique"));
  REQUIRE(w.connect("dax"));
  auto home = w.joinTeam("dominique", "livera_lions");
  REQUIRE(!home);
  CHECK(home.error().code == "wrong_place");
  CHECK(w.joinTeam("dominique", "nope").error().code == "unknown_team");

  walkInto(w, "dominique", "riverside_clubhouse");
  const Cents fee = db->leisure().leagueFeeCents;
  CHECK(fee > 0);
  const Cents bank = w.state().ledger.balance(bankAccountOf("dominique"));
  const Cents league = w.state().ledger.balance("org:livera_league");
  auto joined = w.joinTeam("dominique", "livera_lions");
  REQUIRE(joined);
  CHECK(joined.value()["fee_cents"] == fee);
  CHECK(joined.value()["next_kickoff"].get<GameMinutes>() > w.now());
  CHECK(w.state().ledger.balance(bankAccountOf("dominique")) == bank - fee);
  CHECK(w.state().ledger.balance("org:livera_league") == league + fee);
  CHECK(w.joinTeam("dominique", "livera_lions").error().code == "already_on_team");
  CHECK(w.joinTeam("dominique", "riverside_rovers").error().code == "one_team_per_sport");
  REQUIRE(w.joinTeam("dominique", "founders_five"));  // basketball is another sport
  CHECK(w.character("dominique")->leisureTeams.size() == 2);
  CHECK(w.leisureTeamMembers("livera_lions") == std::vector<CharacterId>{"dominique"});

  walkInto(w, "dax", "riverside_clubhouse");
  REQUIRE(w.joinTeam("dax", "livera_lions"));
  CHECK(notified(w, "dominique", "Dax Hendrix joined the Livéra Lions"));

  REQUIRE(w.leaveTeam("dominique", "livera_lions"));
  CHECK(w.leaveTeam("dominique", "livera_lions").error().code == "not_on_team");
  CHECK(w.leaveTeam("dominique", "nope").error().code == "unknown_team");
  CHECK(notified(w, "dax", "Dominique Ashford left the Livéra Lions"));

  // At a venue: the field signs up soccer players, the court basketball players.
  walkTo(w, "dominique", "riverside_court");
  CHECK(w.joinTeam("dominique", "riverside_rovers").error().code == "wrong_place");
  walkTo(w, "dominique", "riverside_field");
  REQUIRE(w.joinTeam("dominique", "riverside_rovers"));

  // The league office closes at 22:00.
  REQUIRE(w.leaveTeam("dax", "livera_lions"));
  advanceToHour(w, 22);
  REQUIRE(w.character("dax")->inside == "riverside_clubhouse");
  CHECK(w.joinTeam("dax", "riverside_rovers").error().code == "closed");
}

TEST_CASE("leisure: no league fee, no team") {
  auto db = patchedContent([](Json& doc, const std::string& file) {
    if (file == "simulation.json") doc["simulation"]["walk_speed_mps"] = 400.0;
    if (file == "sports.json") doc["leisure"]["league_fee_cents"] = 1000000000000LL;
  });
  World w = World::createNew(db);
  REQUIRE(w.connect("dominique"));
  walkInto(w, "dominique", "riverside_clubhouse");
  auto r = w.joinTeam("dominique", "livera_lions");
  REQUIRE(!r);
  CHECK(r.error().code == "insufficient_funds");
  CHECK(w.character("dominique")->leisureTeams.empty());
}

TEST_CASE("leisure: practice grows athletics, more with a coach on shift") {
  World w = World::createNew(fastContent());
  REQUIRE(w.connect("dominique"));
  REQUIRE(w.connect("dax"));
  walkTo(w, "dominique", "riverside_field");
  const CharacterState* d = w.character("dominique");
  CHECK(d->skills.at("athletics") == 0);
  const double energy = d->needs.at("energy");
  const double hygiene = d->needs.at("hygiene");
  const double burned = d->caloriesOut;
  auto r = w.useActivity("dominique", "practice_soccer");
  REQUIRE(r);
  CHECK_NEAR(d->skills.at("athletics"), 2.0, 1e-9);
  CHECK(r.value()["skills"]["athletics"] == 2.0);
  CHECK(!r.value().contains("coached_by"));
  CHECK(d->needs.at("energy") < energy);
  CHECK(d->needs.at("hygiene") < hygiene);
  CHECK(d->caloriesOut >= burned + 450 - 1e-9);
  CHECK(w.useActivity("dominique", "practice_soccer").error().code == "too_soon");
  CHECK(w.useActivity("dominique", "practice_basketball").error().code == "unknown_activity");  // that's at the court

  // Dax takes the coaching job, starts his shift at the clubhouse and walks out to the field on it.
  walkInto(w, "dax", "riverside_clubhouse");
  REQUIRE(w.applyForJob("dax", "coaching"));
  REQUIRE(w.startShift("dax"));
  walkTo(w, "dax", "riverside_field");
  CHECK(w.character("dax")->career.shiftStartedAt.has_value());  // coaches work outdoors
  w.advanceMinutes(90);
  const double skill = d->skills.at("athletics");
  auto coached = w.useActivity("dominique", "practice_soccer");
  REQUIRE(coached);
  CHECK(coached.value()["coached_by"] == "Dax Hendrix");
  CHECK_NEAR(d->skills.at("athletics") - skill, 2.0 * (1.0 - skill / 120.0) * 1.5, 1e-9);
  auto shift = w.endShift("dax");
  REQUIRE(shift);
  CHECK(shift.value()["pay_cents"].get<Cents>() > 0);
}

TEST_CASE("leisure: Lumière staff start their shift before the doors open") {
  World w = World::createNew(fastContent());
  REQUIRE(w.connect("maya"));
  walkTo(w, "maya", "lumiere_bistro");
  REQUIRE(w.applyForJob("maya", "restaurant"));  // at the door, in the morning
  advanceToHour(w, 16);
  REQUIRE(w.enter("maya", "lumiere_bistro"));  // staff get in before opening
  REQUIRE(w.startShift("maya"));
  w.advanceMinutes(4 * kMinutesPerHour);
  auto shift = w.endShift("maya");
  REQUIRE(shift);
  CHECK(shift.value()["pay_cents"] == 4 * 1500);
}

// ---- Matches -------------------------------------------------------------------------------
TEST_CASE("leisure: fixtures rotate through every pairing, home and away") {
  World two = World::createNew(fastContent());
  const LeisureSportDef* soccer = two.content().leisureSport("soccer");
  REQUIRE(soccer);
  auto week0 = two.leisureFixtures(*soccer, 0);
  auto week1 = two.leisureFixtures(*soccer, 1);
  REQUIRE(week0.size() == 1);
  REQUIRE(week1.size() == 1);
  CHECK((week0[0] == std::pair<std::string, std::string>{"livera_lions", "riverside_rovers"}));
  CHECK((week1[0] == std::pair<std::string, std::string>{"riverside_rovers", "livera_lions"}));

  auto db = patchedContent([](Json& doc, const std::string& file) {
    if (file == "sports.json")
      doc["leisure"]["teams"].push_back(
          Json{{"id", "willow_wanderers"}, {"name", "Willow Wanderers"}, {"sport", "soccer"}, {"strength", 45}});
  });
  World three = World::createNew(db);
  std::map<std::pair<std::string, std::string>, int> seen;
  std::map<std::string, int> byes;
  for (int week = 0; week < 6; ++week) {
    auto f = three.leisureFixtures(*db->leisureSport("soccer"), week);
    REQUIRE(f.size() == 1);  // one team sits each week out
    seen[f[0]] += 1;
    for (const auto* t : {"livera_lions", "riverside_rovers", "willow_wanderers"}) {
      if (f[0].first != t && f[0].second != t) byes[t] += 1;
    }
  }
  CHECK(seen.size() == 6);  // every pairing, both ways round, in six weeks
  for (const auto& [t, n] : byes) CHECK(n == 2);
}

TEST_CASE("leisure: the league plays at kickoff, and the members who turn up change the result") {
  auto db = leagueContent();
  World w = World::createNew(db);
  // Week one: nobody turns up. The town rosters (52 v 48) play to an exact 1-1.
  advanceToHour(w, 15, 5);
  REQUIRE(matchesOf(w, "soccer") == 1);
  {
    const LeisureMatch& m = lastMatch(w, "soccer");
    CHECK(m.sport == "soccer");
    CHECK(m.home == "livera_lions");
    CHECK(m.away == "riverside_rovers");
    CHECK(!m.finished);
    CHECK(m.homeLineup.empty());
    CHECK(m.homeStrength == 52);
    CHECK(m.awayStrength == 48);
  }
  w.advanceMinutes(119);
  CHECK(!lastMatch(w, "soccer").finished);
  w.advanceMinutes(1);  // 17:00, full time
  CHECK(lastMatch(w, "soccer").finished);
  CHECK(lastMatch(w, "soccer").homeScore == 1);
  CHECK(lastMatch(w, "soccer").awayScore == 1);
  CHECK(standing(w, "livera_lions").played == 1);
  CHECK(standing(w, "livera_lions").drawn == 1);
  CHECK(standing(w, "livera_lions").points == 1);
  CHECK(standing(w, "riverside_rovers").scored == 1);
  CHECK(standing(w, "riverside_rovers").conceded == 1);

  // Dominique signs for the Rovers at the field, Dax for the Lions at the clubhouse.
  REQUIRE(w.connect("dominique"));
  REQUIRE(w.connect("dax"));
  walkTo(w, "dominique", "riverside_field");
  REQUIRE(w.joinTeam("dominique", "riverside_rovers"));
  walkInto(w, "dax", "riverside_clubhouse");
  REQUIRE(w.joinTeam("dax", "livera_lions"));
  w.disconnect("dominique");
  w.disconnect("dax");

  // Week two, an hour before kickoff: the teams hear about it. Dominique comes back to the
  // field to play, Sienna comes to watch, Dax stays away.
  advanceToHour(w, 14, 5);
  CHECK(notified(w, "dominique", "Kickoff in an hour: Riverside Rovers vs Livéra Lions at Riverside Field"));
  CHECK(notified(w, "dax", "Kickoff in an hour"));
  REQUIRE(w.connect("dominique"));
  REQUIRE(w.connect("sienna"));
  walkTo(w, "sienna", "riverside_field");
  advanceToHour(w, 15);
  REQUIRE(matchesOf(w, "soccer") == 2);
  {
    const LeisureMatch& m = lastMatch(w, "soccer");
    CHECK(m.home == "riverside_rovers");  // home and away swap the second time round
    CHECK(m.homeLineup == std::vector<CharacterId>{"dominique"});
    CHECK(m.awayLineup.empty());
    CHECK(m.homeStrength >= 48 + 20);  // a player is worth 20-40 here
    CHECK(m.awayStrength == 52);
  }
  CHECK(notified(w, "dominique", "Kickoff at Riverside Field"));
  auto during = w.openPhoneApp("sienna", "sports");
  REQUIRE(during);
  REQUIRE(during.value()["in_play"].size() == 1);
  CHECK(during.value()["in_play"][0]["home_players"] == Json::array({"Dominique Ashford"}));
  CHECK(!during.value()["in_play"][0].contains("home_score"));  // no live score: the result comes at full time
  (void)w.drainEvents();
  w.advanceMinutes(119);
  const CharacterState* dom = w.character("dominique");
  const double fame = dom->fame;
  const double energy = dom->needs.at("energy");
  const double excitement = w.character("sienna")->emotions.at("excitement");
  w.advanceMinutes(1);  // full time

  const LeisureMatch& m = lastMatch(w, "soccer");
  CHECK(m.finished);
  CHECK(m.homeScore == 2);  // Rovers 2-1 Lions
  CHECK(m.awayScore == 1);
  // The player: athletics, a little fame, a memory, tired.
  CHECK_NEAR(dom->skills.at("athletics"), 3.0, 1e-9);
  CHECK(dom->fame > fame + 0.5);
  CHECK(dom->needs.at("energy") < energy - 20);
  CHECK(dom->leisureMatchesPlayed == 1);
  CHECK(dom->leisureMatchesWon == 1);
  CHECK(memoriesOfType(w, "dominique", "match") == 1);
  CHECK(notified(w, "dominique", "Full time: Riverside Rovers 2-1 Livéra Lions. You won!"));
  // The spectator enjoyed it; the absent member heard about it.
  CHECK(w.character("sienna")->emotions.at("excitement") > excitement + 5);
  CHECK(notified(w, "sienna", "Full time at Riverside Field: Riverside Rovers 2-1 Livéra Lions"));
  CHECK(notified(w, "dax", "Your team played: Riverside Rovers 2-1 Livéra Lions"));
  CHECK(w.character("dax")->leisureMatchesPlayed == 0);
  bool event = false;
  for (const auto& e : w.drainEvents()) {
    if (e.type != "match" || e.data.value("status", "") != "full_time") continue;
    event = true;
    for (const auto* id : {"dominique", "sienna", "dax"})
      CHECK(std::find(e.recipients.begin(), e.recipients.end(), id) != e.recipients.end());
    CHECK(e.data["home_players"] == Json::array({"Dominique Ashford"}));
  }
  CHECK(event);
  // The table.
  const LeisureStanding rovers = standing(w, "riverside_rovers");
  const LeisureStanding lions = standing(w, "livera_lions");
  CHECK(rovers.played == 2);
  CHECK(rovers.won == 1);
  CHECK(rovers.drawn == 1);
  CHECK(rovers.points == 4);
  CHECK(rovers.scored == 3);
  CHECK(rovers.conceded == 2);
  CHECK(lions.lost == 1);
  CHECK(lions.points == 1);
  // The app shows it all.
  auto app = w.openPhoneApp("dominique", "sports");
  REQUIRE(app);
  const Json& soccer = app.value()["sports"][0];
  CHECK(soccer["id"] == "soccer");
  CHECK(soccer["table"][0]["team"] == "riverside_rovers");
  CHECK(soccer["table"][0]["points"] == 4);
  CHECK(app.value()["results"][0]["home_score"] == 2);
  CHECK(app.value()["your_teams"][0]["id"] == "riverside_rovers");
  CHECK(app.value()["your_teams"][0]["opponent"] == "Livéra Lions");
  CHECK(app.value()["you"]["matches_won"] == 1);
  bool listed = false;
  for (const auto& t : soccer["teams"]) {
    if (t["id"] == "livera_lions") listed = t["members"] == Json::array({"Dax Hendrix"});
  }
  CHECK(listed);
}

TEST_CASE("leisure: basketball never ends level, and leaving early doesn't count") {
  auto db = leagueContent();
  World w = World::createNew(db);
  // Wednesday 18:00, two even rosters: level after regulation, so overtime settles it.
  advanceToHour(w, 18, 2);
  w.advanceMinutes(60);
  {
    const LeisureMatch& m = lastMatch(w, "basketball");
    CHECK(m.sport == "basketball");
    CHECK(m.finished);
    CHECK(m.overtime);
    CHECK(m.homeScore != m.awayScore);
    CHECK(m.homeScore >= 68);
    const LeisureStanding home = standing(w, m.home);
    const LeisureStanding away = standing(w, m.away);
    CHECK(home.drawn + away.drawn == 0);
    CHECK(home.points + away.points == 3);  // two for the win, one for the loss
  }
  // Week two: Dominique starts for the Founders Five but walks off at half time.
  REQUIRE(w.connect("dominique"));
  walkTo(w, "dominique", "riverside_court");
  REQUIRE(w.joinTeam("dominique", "founders_five"));
  w.disconnect("dominique");
  advanceToHour(w, 17, 2);
  REQUIRE(w.connect("dominique"));
  advanceToHour(w, 18);
  CHECK(std::find(lastMatch(w, "basketball").awayLineup.begin(), lastMatch(w, "basketball").awayLineup.end(),
                  "dominique") != lastMatch(w, "basketball").awayLineup.end() ||
        std::find(lastMatch(w, "basketball").homeLineup.begin(), lastMatch(w, "basketball").homeLineup.end(),
                  "dominique") != lastMatch(w, "basketball").homeLineup.end());
  w.advanceMinutes(30);
  walkTo(w, "dominique", "heritage_coffee");
  advanceToHour(w, 19);
  CHECK(lastMatch(w, "basketball").finished);
  CHECK(notified(w, "dominique", "You left before the final whistle"));
  CHECK(w.character("dominique")->leisureMatchesPlayed == 0);
  CHECK(w.character("dominique")->skills.at("athletics") == 0);
  CHECK(memoriesOfType(w, "dominique", "match") == 0);
  const LeisureStanding five = standing(w, "founders_five");
  CHECK(five.played == 2);
  // She still played the first half, so her side was the stronger one and won.
  const LeisureMatch& m = lastMatch(w, "basketball");
  const bool home = m.home == "founders_five";
  CHECK((home ? m.homeScore : m.awayScore) > (home ? m.awayScore : m.homeScore));
}

// ---- Saving --------------------------------------------------------------------------------
TEST_CASE("leisure: persistence: league table, a match in play, teams and dates survive a save and load") {
  auto db = leagueContent();
  auto path = tempPath("leisure.db");
  WorldState saved;
  {
    World w = World::createNew(db);
    REQUIRE(w.connect("dominique"));
    REQUIRE(w.connect("dax"));
    startDating(w, "dominique", "dax", "heritage_coffee");
    walkTo(w, "dominique", "riverside_field");
    REQUIRE(w.joinTeam("dominique", "riverside_rovers"));
    w.disconnect("dominique");
    w.disconnect("dax");
    advanceToHour(w, 13, 5);  // Saturday: a walk by the lake first, then the match
    REQUIRE(w.connect("dominique"));
    REQUIRE(w.connect("dax"));
    walkTo(w, "dominique", "willow_lake_park");
    walkTo(w, "dax", "willow_lake_park");
    REQUIRE(w.useActivity("dominique", "boardwalk_walk").value().contains("dates"));
    w.disconnect("dax");
    walkTo(w, "dominique", "riverside_field");
    advanceToHour(w, 16);  // mid-match, Dominique playing; the server goes down
    REQUIRE(matchesOf(w, "soccer") == 1);
    REQUIRE(!lastMatch(w, "soccer").finished);
    REQUIRE(lastMatch(w, "soccer").awayLineup == std::vector<CharacterId>{"dominique"});
    REQUIRE(!w.state().leisureDates.empty());      // today's date
    REQUIRE(!w.state().leisureStandings.empty());  // Wednesday's basketball
    auto store = SqliteStore::open(path.string());
    REQUIRE(store);
    REQUIRE(store.value()->saveWorld(w.state()));
    saved = w.state();
  }
  auto store = SqliteStore::open(path.string());
  REQUIRE(store);
  auto loaded = store.value()->loadWorld();
  if (!loaded) std::fprintf(stderr, "    load failed: %s\n", loaded.error().message.c_str());
  REQUIRE(loaded);
  const WorldState& s = loaded.value();
  CHECK(s.characters.at("dominique").leisureTeams == std::vector<std::string>{"riverside_rovers"});
  CHECK(s.leisureDates == saved.leisureDates);
  REQUIRE(s.leisureStandings.size() == saved.leisureStandings.size());
  for (const auto& [team, row] : saved.leisureStandings) {
    const LeisureStanding& got = s.leisureStandings.at(team);
    CHECK(got.played == row.played);
    CHECK(got.points == row.points);
    CHECK(got.scored == row.scored);
    CHECK(got.conceded == row.conceded);
  }
  REQUIRE(s.leisureMatches.size() == saved.leisureMatches.size());
  for (std::size_t i = 0; i < s.leisureMatches.size(); ++i) {
    const LeisureMatch& a = s.leisureMatches[i];
    const LeisureMatch& b = saved.leisureMatches[i];
    CHECK(a.id == b.id);
    CHECK(a.home == b.home);
    CHECK(a.homeLineup == b.homeLineup);
    CHECK(a.awayLineup == b.awayLineup);
    CHECK(a.homeStrength == b.homeStrength);
    CHECK(a.endsAt == b.endsAt);
    CHECK(a.finished == b.finished);
    CHECK(a.homeScore == b.homeScore);
  }
  // The server comes back up; Dominique reconnects at the field and the match finishes.
  World w(db, s);
  REQUIRE(w.connect("dominique"));
  advanceToHour(w, 17);
  CHECK(lastMatch(w, "soccer").finished);
  CHECK(w.character("dominique")->leisureMatchesPlayed == 1);
  CHECK(standing(w, "riverside_rovers").played == 1);
  // Today's date at the lake is still counted after the restart.
  REQUIRE(w.connect("dax"));
  walkTo(w, "dominique", "willow_lake_park");
  auto again = w.useActivity("dax", "boardwalk_walk");
  REQUIRE(again);
  CHECK(again.value()["dates"][0]["counted"] == false);
}

TEST_CASE("leisure: persistence: a save from before the league loads with no teams, table or dates") {
  World w = World::createNew(fastContent());
  Json old = toJson(w.state().characters.at("dominique"));
  CHECK(old.contains("leisure"));
  old.erase("leisure");
  CharacterState c = characterStateFromJson(old);
  CHECK(c.leisureTeams.empty());
  CHECK(c.leisureMatchesPlayed == 0);
  WorldState s = w.state();
  s.leisureStandings["livera_lions"].points = 9;
  leisurePartFromJson(s, Json::object());
  CHECK(s.leisureStandings.empty());
  CHECK(s.leisureMatches.empty());
  CHECK(s.leisureDates.empty());
  // A team taken out of content: its players become free agents when the world loads.
  WorldState gone = w.state();
  gone.characters.at("dominique").leisureTeams = {"livera_lions", "disbanded_dragons"};
  World reloaded(fastContent(), gone);
  CHECK(reloaded.character("dominique")->leisureTeams == std::vector<std::string>{"livera_lions"});
}

TEST_CASE("leisure: content: the league is checked when content loads") {
  auto broken = [](const std::function<void(Json&)>& change) {
    std::string error;
    try {
      (void)patchedContent([&](Json& doc, const std::string& file) {
        if (file == "sports.json") change(doc["leisure"]);
      });
    } catch (const std::exception& e) {
      error = e.what();
    }
    return error;
  };
  CHECK(broken([](Json& L) { L["teams"].erase(1); }).find("at least two teams") != std::string::npos);
  CHECK(broken([](Json& L) { L["sports"][0]["venue"] = "lumiere_bistro"; }).find("outdoor") != std::string::npos);
  CHECK(broken([](Json& L) { L["date_spots"][0]["offer"] = "caviar"; }).find("no offer") != std::string::npos);
  CHECK(broken([](Json& L) { L["skill"] = "juggling"; }).find("simulation.skills") != std::string::npos);
  CHECK(broken([](Json& L) {
          L["sports"][1]["venue"] = "riverside_field";
          L["sports"][1]["match_day"] = 5;
          L["sports"][1]["match_hour"] = 16;
        }).find("overlap") != std::string::npos);
  CHECK(broken([](Json& L) { L["league_account"] = "org:nobody"; }).find("league_account") != std::string::npos);
  CHECK(broken([](Json&) {}).empty());
}

// ---- Over the network ------------------------------------------------------------------------
namespace {

class LeisureServer {
 public:
  explicit LeisureServer(const std::string& db) {
    ServerConfig cfg;
    cfg.port = 0;
    cfg.dbPath = db;
    cfg.content = fastContent();
    cfg.devCommands = true;
    cfg.passwordIterations = 1000;
    cfg.autosaveSeconds = 3600;
    auto s = Server::create(cfg);
    if (!s) throw std::runtime_error("server failed: " + s.error().message);
    server_ = std::move(s).value();
    port_ = server_->port();
    thread_ = std::thread([this] { server_->run(stop_); });
  }
  ~LeisureServer() {
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

class LeisureClient {
 public:
  explicit LeisureClient(std::uint16_t port) {
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
  void walkTo(const std::string& place) {
    ok({{"op", "move"}, {"location", place}});
    for (int i = 0; i < 200; ++i) {
      if (!ok({{"op", "look"}})["you"]["moving"].get<bool>()) return;
      std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }
    throw std::runtime_error("never arrived at " + place);
  }

 private:
  net::Fd fd_;
  net::LineBuffer buffer_;
  long id_ = 0;
};

}  // namespace

TEST_CASE("leisure: server: joining and leaving a team, the sports app and the park's hours over the network") {
  LeisureServer server(tempPath("leisure_server.db").string());
  LeisureClient dom(server.port());
  dom.ok({{"op", "register"}, {"username", "dom"}, {"password", "livera-pass-1"}});
  dom.ok({{"op", "login"}, {"username", "dom"}, {"password", "livera-pass-1"}});
  dom.ok({{"op", "play"}, {"character", "dominique"}});

  Json app = dom.ok({{"op", "phone"}, {"app", "sports"}});
  CHECK(app["sports"].size() == 2);
  CHECK(app["your_teams"].empty());
  CHECK(app["league"]["sign_up_at"] == "Riverside Clubhouse");
  CHECK(dom.refusal({{"op", "join_team"}, {"team", "livera_lions"}}) == "wrong_place");

  dom.ok({{"op", "exit"}});
  dom.walkTo("riverside_clubhouse");
  dom.ok({{"op", "enter"}, {"location", "riverside_clubhouse"}});
  Json joined = dom.ok({{"op", "join_team"}, {"team", "livera_lions"}});
  CHECK(joined["name"] == "Livéra Lions");
  CHECK(dom.refusal({{"op", "join_team"}, {"team", "riverside_rovers"}}) == "one_team_per_sport");
  CHECK(dom.refusal({{"op", "join_team"}, {"team", "no_such_team"}}) == "unknown_team");
  app = dom.ok({{"op", "phone"}, {"app", "sports"}});
  REQUIRE(app["your_teams"].size() == 1);
  CHECK(app["your_teams"][0]["id"] == "livera_lions");
  CHECK(app["sports"][0]["teams"][0]["members"] == Json::array({"Dominique Ashford"}));
  dom.ok({{"op", "leave_team"}, {"team", "livera_lions"}});
  CHECK(dom.refusal({{"op", "leave_team"}, {"team", "livera_lions"}}) == "not_on_team");

  dom.ok({{"op", "exit"}});
  dom.walkTo("willow_lake_park");
  CHECK(dom.refusal({{"op", "activity"}, {"activity", "stargazing"}}) == "not_now");
  Json walk = dom.ok({{"op", "activity"}, {"activity", "boardwalk_walk"}});
  CHECK(walk["activity"] == "boardwalk_walk");
}
