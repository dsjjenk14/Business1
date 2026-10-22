// What happens when a need runs out (D-080, data/health/needs_at_zero.json and zero_conditions.json): passing out,
// the hospital, staying at 0, and the made-up illnesses of doing it again and again. These tests load all of data/
// (fullContent): the other tests leave the rules out because they let the clock run for days with nobody eating.
#include "TestSupport.h"
#include "core/Clock.h"
#include "core/Ledger.h"
#include "core/Serialization.h"

using namespace livera;
using namespace livera::test;

namespace {

bool notified(const World& w, const CharacterId& id, const std::string& fragment) {
  for (const auto& n : w.state().notifications) {
    if (n.recipient == id && n.text.find(fragment) != std::string::npos) return true;
  }
  return false;
}

int timesNotified(const World& w, const CharacterId& id, const std::string& fragment) {
  int n = 0;
  for (const auto& x : w.state().notifications) n += x.recipient == id && x.text.find(fragment) != std::string::npos;
  return n;
}

// A town with these people in it, everyone's needs comfortable, then `edit` applied to the saved state (a need about
// to run out, say) and the town loaded from it.
World townWhere(std::shared_ptr<const ContentDatabase> db, const std::vector<CharacterId>& who,
                const std::function<void(World&)>& setUp, const std::function<void(WorldState&)>& edit) {
  World w = World::createNew(db);
  for (const auto& id : who) REQUIRE(w.connect(id));
  if (setUp) setUp(w);
  WorldState s = w.state();
  for (const auto& id : who) {
    for (auto& [n, v] : s.characters.at(id).needs) v = 80;
  }
  edit(s);
  World out(db, s);
  (void)out.drainEvents();
  return out;
}

Cents bankOf(const World& w, const CharacterId& id) { return w.state().ledger.balance(bankAccountOf(id)); }
Cents cashOf(const World& w, const CharacterId& id) { return w.state().ledger.balance(cashAccountOf(id)); }

// The content with one of the D-080 files patched, or the error it fails to load with.
std::string zeroError(const std::function<void(Json& doc, const std::string& file)>& patch) {
  std::vector<std::filesystem::path> files;
  for (const auto& e : std::filesystem::recursive_directory_iterator(LIVERA_DATA_DIR)) {
    if (e.path().extension() == ".json") files.push_back(e.path());
  }
  std::sort(files.begin(), files.end());
  std::vector<std::pair<std::string, Json>> docs;
  for (const auto& f : files) {
    std::ifstream in(f);
    Json doc = Json::parse(in, nullptr, true, true);
    patch(doc, f.filename().string());
    docs.emplace_back(f.filename().string(), std::move(doc));
  }
  auto r = ContentDatabase::loadFromDocuments(docs);
  return r ? std::string("(loaded)") : r.error().message;
}

Json& ruleFor(Json& doc, const std::string& need) {
  for (auto& r : doc["needs_at_zero"]["needs"]) {
    if (r["need"] == need) return r;
  }
  throw std::runtime_error("no rule for " + need);
}

}  // namespace

TEST_CASE("needs at zero: out of energy, you pass out where you stand, can't act, and come to hours later") {
  const auto db = fullContent();
  const NeedsAtZeroConfig& Z = db->needsAtZero();
  World w = townWhere(db, {"dominique"}, {}, [](WorldState& s) { s.characters.at("dominique").needs["energy"] = 0.1; });
  REQUIRE(w.character("dominique")->inside == "lexington_1204");
  w.advanceMinutes(2);
  const CharacterState& c = *w.character("dominique");
  REQUIRE(c.passedOutUntil > w.now());
  CHECK(c.passedOutUntil - w.now() <= static_cast<GameMinutes>(Z.passOutHours * 60));
  CHECK(notified(w, "dominique", "You ran out of energy and passed out at The Lexington, Apt 1204."));
  CHECK(notified(w, "dominique", "You'll come to around"));
  CHECK(c.zeroTimes.at("energy").size() == 1);
  // Out cold: no commands, no speech, and the look says until when.
  CHECK(w.useActivity("dominique", "toilet").error().code == "passed_out");
  CHECK(w.exitBuilding("dominique").error().code == "passed_out");
  CHECK(w.say("dominique", "Hello?", "say", "").error().code == "passed_out");
  CHECK(w.look("dominique").value()["you"]["passed_out_until"] == c.passedOutUntil);
  // Needs wait while you're out.
  const double hunger = c.needs.at("hunger");
  w.advanceMinutes(60);
  CHECK(w.character("dominique")->needs.at("hunger") == hunger);
  // Then you come to, groggy, with energy enough to get home.
  w.advanceMinutes(w.character("dominique")->passedOutUntil - w.now());
  CHECK(w.character("dominique")->passedOutUntil < 0);
  CHECK(notified(w, "dominique", "You came to."));
  CHECK(w.character("dominique")->needs.at("energy") >= Z.energyAfterPassOut);
  CHECK(w.useActivity("dominique", "toilet"));
  CHECK(!w.look("dominique").value()["you"].contains("passed_out_until"));
}

TEST_CASE("needs at zero: passed out in the street, someone may go through your pockets; anyone there sees you go down") {
  const auto db = patchedContent(
      [](Json& doc, const std::string& file) {
        if (file == "needs_at_zero.json") doc["needs_at_zero"]["pass_out"]["robbery_chance_outdoors"] = 1.0;
      },
      true);
  const Cents most = db->needsAtZero().robberyMaxCashCents;
  World w = townWhere(
      db, {"dominique", "dax"},
      [](World& t) {
        walkTo(t, "dominique", "heritage_coffee");
        walkTo(t, "dax", "heritage_coffee");
      },
      [](WorldState& s) { s.characters.at("dominique").needs["energy"] = 0.1; });
  REQUIRE(w.character("dominique")->inside.empty());
  const Cents cash = cashOf(w, "dominique");
  REQUIRE(cash > 0);
  w.advanceMinutes(2);
  REQUIRE(w.character("dominique")->passedOutUntil > w.now());
  CHECK(notified(w, "dominique", "passed out in the street"));
  const Cents taken = cash - cashOf(w, "dominique");
  CHECK(taken > 0);
  CHECK(taken <= most);
  CHECK(notified(w, "dominique", "Someone went through your pockets"));
  CHECK(w.state().ledger.sumOfBalances() == 0);
  // Dax was right there: he's told, and sees her out cold.
  CHECK(notified(w, "dax", "Dominique passed out in the street."));
  bool seen = false;
  const Json daxSees = w.look("dax").value();
  for (const auto& p : daxSees["people"]) seen = seen || (p["id"] == "dominique" && p.value("passed_out", false));
  CHECK(seen);
}

TEST_CASE("needs at zero: out of food, you pass out and wake in the hospital, kept there and billed; then discharged") {
  const auto db = fullContent();
  const ZeroRuleDef& rule = *db->needsAtZero().rule("hunger");
  World w = townWhere(db, {"dominique"}, {}, [](WorldState& s) { s.characters.at("dominique").needs["hunger"] = 0.05; });
  const Cents bank = bankOf(w, "dominique");
  w.advanceMinutes(2);
  const CharacterState& c = *w.character("dominique");
  CHECK(c.inside == db->needsAtZero().hospital);
  CHECK(c.admittedUntil > w.now() + static_cast<GameMinutes>(rule.hours * 60) - 5);
  CHECK(c.admittedUntil <= w.now() + static_cast<GameMinutes>(rule.hours * 60));
  CHECK(c.admittedFor == "hunger");
  CHECK(c.needs.at("hunger") >= rule.after.at("hunger"));
  CHECK(bankOf(w, "dominique") == bank - rule.billCents);
  CHECK(notified(w, "dominique", "You passed out from hunger."));
  CHECK(notified(w, "dominique", "Bill: $380.00."));
  CHECK(w.state().ledger.sumOfBalances() == 0);
  // Kept in: no leaving, but the look says until when.
  CHECK(w.exitBuilding("dominique").error().code == "in_hospital");
  const Json you = w.look("dominique").value()["you"];
  CHECK(you["admitted_until"] == c.admittedUntil);
  CHECK(you["admitted_for"] == "hunger");
  // Discharged when the stay is over.
  w.advanceMinutes(c.admittedUntil - w.now());
  CHECK(w.character("dominique")->admittedUntil < 0);
  CHECK(notified(w, "dominique", "You've been discharged from Livéra General Hospital."));
  CHECK(w.exitBuilding("dominique"));
}

TEST_CASE("needs at zero: health gives out, you collapse in front of people and an ambulance takes you") {
  const auto db = fullContent();
  World w = townWhere(
      db, {"dominique", "dax"},
      [](World& t) {
        walkInto(t, "dominique", "heritage_coffee");
        walkInto(t, "dax", "heritage_coffee");
      },
      [](WorldState& s) { s.characters.at("dominique").needs["health"] = 0.001; });
  w.advanceMinutes(2);
  const CharacterState& c = *w.character("dominique");
  CHECK(c.inside == "livera_general");
  CHECK(c.admittedFor == "health");
  CHECK(c.needs.at("health") >= db->needsAtZero().rule("health")->after.at("health"));
  CHECK(notified(w, "dominique", "Your body gave out and you collapsed."));
  CHECK(notified(w, "dax", "Dominique collapsed at Heritage Coffee Co.. An ambulance took them to Livéra General Hospital.") ||
        notified(w, "dax", "Dominique collapsed at Heritage Coffee"));
}

TEST_CASE("needs at zero: staying at 0 wears on you; you're told once, and again only after it's been back up") {
  const auto db = fullContent();
  World w = townWhere(db, {"dominique"}, {}, [](WorldState& s) {
    auto& n = s.characters.at("dominique").needs;
    n["hygiene"] = 0.01;
    n["social"] = 0.01;
    n["dental"] = 0.01;
  });
  const double lonely = w.character("dominique")->emotions.count("loneliness") ? w.character("dominique")->emotions.at("loneliness") : 0;
  w.advanceMinutes(60);
  CHECK(timesNotified(w, "dominique", "Hygiene is at 0") == 1);
  CHECK(timesNotified(w, "dominique", "Social is at 0") == 1);
  CHECK(w.character("dominique")->emotions.at("loneliness") > lonely);
  CHECK(w.hasCondition("dominique", "toothache"));
  CHECK(w.character("dominique")->atZero.count("hygiene"));
  // Washed: back above rearm_above, and the next time it hits 0 counts again.
  REQUIRE(w.useActivity("dominique", "shower"));
  w.advanceMinutes(1);
  CHECK(!w.character("dominique")->atZero.count("hygiene"));
  CHECK(w.character("dominique")->zeroTimes.at("hygiene").size() == 1);
}

TEST_CASE("needs at zero: run a need down again and again and a made-up illness comes on, and the count starts over") {
  const auto db = fullContent();
  const ConditionDef* fatigue = db->condition("lantern_fatigue");
  REQUIRE(fatigue);
  REQUIRE(fatigue->fromZeroNeed == "energy");
  World w = townWhere(db, {"dominique"}, {}, [&](WorldState& s) {
    auto& c = s.characters.at("dominique");
    c.needs["energy"] = 0.1;
    // Twice already this week, and once long ago (it doesn't count).
    c.zeroTimes["energy"] = {s.now - 9 * kMinutesPerDay, s.now - 2 * kMinutesPerDay, s.now - 60};
  });
  w.advanceMinutes(2);
  CHECK(w.hasCondition("dominique", "lantern_fatigue"));
  CHECK(notified(w, "dominique", "Lantern Fatigue"));
  CHECK(w.character("dominique")->zeroTimes.at("energy").empty());
  // Bladder: two accidents in a week.
  World b = townWhere(db, {"dominique"}, {}, [&](WorldState& s) {
    auto& c = s.characters.at("dominique");
    c.needs["bladder"] = 0.05;
    c.zeroTimes["bladder"] = {s.now - kMinutesPerDay};
  });
  b.advanceMinutes(2);
  CHECK(notified(b, "dominique", "couldn't make it to a bathroom"));
  CHECK(b.hasCondition("dominique", "tidewater_bladder"));
  // Once is not enough.
  World once = townWhere(db, {"dominique"}, {}, [](WorldState& s) { s.characters.at("dominique").needs["energy"] = 0.1; });
  once.advanceMinutes(2);
  CHECK(!once.hasCondition("dominique", "lantern_fatigue"));
}

TEST_CASE("needs at zero: out cold, kept in, and the count are saved; the public rules say what each need does at 0") {
  const auto db = fullContent();
  World w = townWhere(db, {"dominique"}, {}, [](WorldState& s) { s.characters.at("dominique").needs["hunger"] = 0.05; });
  w.advanceMinutes(2);
  const CharacterState& c = *w.character("dominique");
  const CharacterState back = characterStateFromJson(toJson(c));
  CHECK(back.admittedUntil == c.admittedUntil);
  CHECK(back.admittedFor == "hunger");
  CHECK(back.atZero == c.atZero);
  CHECK(back.zeroTimes == c.zeroTimes);
  const Json rules = w.publicRules()["needs_at_zero"];
  for (const auto& n : db->sim().needs) CHECK(rules.contains(n.id));
  CHECK(rules["hunger"]["rule"] == "hospital");
  CHECK(rules["hunger"]["summary"] == "You pass out from hunger and wake up in Livéra General Hospital: kept 8 hours, billed $380.00.");
  CHECK(rules["energy"]["rule"] == "pass_out");
  CHECK(rules["bladder"]["rule"] == "accident");
}

TEST_CASE("needs at zero content: every need has one rule, each makes sense, and illnesses name a real need") {
  CHECK(zeroError([](Json&, const std::string&) {}) == "(loaded)");
  auto patchRule = [](const std::string& need, const std::function<void(Json&)>& f) {
    return zeroError([&](Json& doc, const std::string& file) {
      if (file == "needs_at_zero.json") f(ruleFor(doc, need));
    });
  };
  CHECK(patchRule("energy", [](Json& r) { r["need"] = "luck"; }).find("unknown need") != std::string::npos);
  CHECK(patchRule("energy", [](Json& r) { r["need"] = "hunger"; }).find("given twice") != std::string::npos);
  CHECK(patchRule("energy", [](Json& r) { r["rule"] = "explode"; }).find("rule is pass_out") != std::string::npos);
  CHECK(patchRule("energy", [](Json& r) { r["rule"] = "accident"; }).find("bladder's rule is accident") != std::string::npos);
  CHECK(patchRule("hunger", [](Json& r) { r["hours"] = 0; }).find("hospital stay needs hours") != std::string::npos);
  CHECK(patchRule("dental", [](Json& r) { r["condition"] = "the_vapours"; }).find("unknown condition") != std::string::npos);
  CHECK(patchRule("hygiene", [](Json& r) { r["receptivity"] = 1.5; }).find("receptivity") != std::string::npos);
  CHECK(patchRule("social", [](Json& r) { r["emotions_per_hour"] = {{"glee", 1}}; }) != "(loaded)");
  CHECK(zeroError([](Json& doc, const std::string& file) {
          if (file != "needs_at_zero.json") return;
          auto& list = doc["needs_at_zero"]["needs"];
          list.erase(list.begin());
        }).find("no rule for the need") != std::string::npos);
  CHECK(zeroError([](Json& doc, const std::string& file) {
          if (file == "needs_at_zero.json") doc["needs_at_zero"]["hospital"] = "founders_park";
        }).find("enterable place that bills") != std::string::npos);
  CHECK(zeroError([](Json& doc, const std::string& file) {
          if (file != "zero_conditions.json") return;
          doc["conditions"][0]["from_zero"]["need"] = "luck";
        }).find("from_zero names an unknown need") != std::string::npos);
}

TEST_CASE("dev care: the browser tests' fast-forward hook tops needs up to a floor and leaves higher ones alone") {
  const auto db = fullContent();
  World w = townWhere(db, {"dominique"}, {}, [](WorldState& s) {
    auto& n = s.characters.at("dominique").needs;
    n["hunger"] = 3;
    n["energy"] = 95;
  });
  REQUIRE(w.devCare("dominique"));
  CHECK(w.character("dominique")->needs.at("hunger") == 80);
  CHECK(w.character("dominique")->needs.at("energy") == 95);
  CHECK(w.devCare("nobody").error().code == "unknown_character");
}
