#include <fstream>

#include "TestSupport.h"

using namespace livera;
using namespace livera::test;

namespace {

Json nicoSheet() {
  std::ifstream in(std::string(LIVERA_DATA_DIR) + "/../scripts/demo/nico_vale.json");
  return Json::parse(in);
}

std::string refusal(World& w, const Json& sheet) {
  auto r = w.createCharacter(sheet);
  return r ? "(accepted)" : r.error().message;
}

}  // namespace

TEST_CASE("creator: a new resident is created from a valid character sheet") {
  World w = World::createNew(realContent());
  auto id = w.createCharacter(nicoSheet());
  REQUIRE(id);
  CHECK(id.value() == "nico-vale");
  const CharacterDef* def = w.definition("nico-vale");
  REQUIRE(def);
  CHECK(def->fullName() == "Nico Vale");
  CHECK(def->pronouns == "they/them");
  CHECK(def->profile["appearance"]["hair_style"] == "curly afro");
  CHECK(def->profile["appearance"]["tattoos"].size() == 2);
  CHECK(def->profile["why_livera"] == "new_job");
  CHECK(def->careerId == "cafe");
  CHECK(def->careerLevel == 0);
  // The origin sets the money; housing comes from a vacant home of the origin's tier.
  CHECK(w.state().ledger.balance(bankAccountOf("nico-vale")) == 800000);
  CHECK(w.state().ledger.balance(cashAccountOf("nico-vale")) == 15000);
  CHECK(w.state().ledger.sumOfBalances() == 0);
  const CharacterState* st = w.character("nico-vale");
  REQUIRE(st);
  CHECK(w.content().property(def->homeProperty)->tier == "starter");
  CHECK(w.state().properties.at(def->homeProperty).tenant == "nico-vale");
  CHECK(st->inside == def->spawnLocation);
  CHECK(st->skills.count("music") == 1);
  CHECK(w.memoriesOf("nico-vale").size() == 1);
}

TEST_CASE("creator: a created character lives a normal life") {
  World w = World::createNew(realContent());
  REQUIRE(w.createCharacter(nicoSheet()));
  REQUIRE(w.connect("nico-vale"));
  REQUIRE(w.connect("dominique"));
  walkInto(w, "nico-vale", "heritage_coffee");
  walkInto(w, "dominique", "heritage_coffee");
  auto r = w.interact("dominique", "chat", "nico-vale");
  REQUIRE(r);
  CHECK(r.value()["first_meeting"].get<bool>());
  CHECK(w.relationshipValue("dominique", "nico-vale", "compatibility") > 0);
  REQUIRE(w.startShift("nico-vale"));  // a barista works at the café
  w.advanceMinutes(60);
  CHECK(w.endShift("nico-vale").value()["pay_cents"] == 2100);
  // Their home is theirs alone.
  const std::string home = w.definition("nico-vale")->spawnLocation;
  walkTo(w, "dominique", home);
  CHECK(w.enter("dominique", home).error().code == "no_access");
  walkInto(w, "nico-vale", home);
}

TEST_CASE("creator: origins change where you start") {
  World w = World::createNew(realContent());
  Json investor = nicoSheet();
  investor["first_name"] = "Rémy";
  investor["origin"] = "real_estate_investment";
  investor["career"] = "recruiting";
  auto id = w.createCharacter(investor);
  REQUIRE(id);
  CHECK(id.value() == "remy-vale");
  CHECK(w.state().ledger.balance(bankAccountOf(id.value())) == 6000000);
  CHECK(w.content().property(w.definition(id.value())->homeProperty)->tier == "luxury");

  Json climber = nicoSheet();
  climber["first_name"] = "Ana";
  climber["origin"] = "career_advancement";
  climber["career"] = "recruiting";
  auto c = w.createCharacter(climber);
  REQUIRE(c);
  CHECK(w.definition(c.value())->careerLevel == 1);
}

TEST_CASE("creator: only the options the game offers are accepted") {
  World w = World::createNew(realContent());
  auto with = [](const char* key, Json v) {
    Json s = nicoSheet();
    s[key] = std::move(v);
    return s;
  };
  CHECK(refusal(w, with("first_name", "")) != "(accepted)");
  CHECK(refusal(w, with("first_name", "<script>")) != "(accepted)");
  CHECK(refusal(w, with("first_name", "R2D2")) != "(accepted)");
  CHECK(refusal(w, with("age", 17)) != "(accepted)");
  CHECK(refusal(w, with("age", "twenty")) != "(accepted)");
  CHECK(refusal(w, with("traits", Json::array({"creative", "outgoing", "witty", "bold"}))) != "(accepted)");
  CHECK(refusal(w, with("traits", Json::array({"telepathic"}))) != "(accepted)");
  CHECK(refusal(w, with("interests", Json::array({"music"}))) != "(accepted)");  // at least 2
  CHECK(refusal(w, with("career", "law")) != "(accepted)");       // no firm in town yet
  CHECK(refusal(w, with("career", "construction_management_ceo")) != "(accepted)");
  CHECK(refusal(w, with("origin", "lottery_win")) != "(accepted)");
  Json hair = nicoSheet();
  hair["appearance"]["hair_color"] = "invisible";
  CHECK(refusal(w, hair) != "(accepted)");
  Json tall = nicoSheet();
  tall["appearance"]["height_cm"] = 260;
  CHECK(refusal(w, tall) != "(accepted)");
  Json missing = nicoSheet();
  missing["appearance"].erase("skin_tone");
  CHECK(refusal(w, missing) != "(accepted)");
  // Personality is a budget, not a wish list.
  Json maxed = nicoSheet();
  for (auto& [k, v] : maxed["personality"].items()) v = 100;
  CHECK(refusal(w, maxed).find("budget") != std::string::npos);
  // Nothing was created by any of those.
  CHECK(w.state().createdCharacters.empty());
}

TEST_CASE("creator: custom pronouns and gender identity are allowed, within reason") {
  World w = World::createNew(realContent());
  Json s = nicoSheet();
  s["pronouns"] = "xe/xem";
  s["gender"] = "genderfluid";
  REQUIRE(w.createCharacter(s));
  Json bad = nicoSheet();
  bad["first_name"] = "Kai";
  bad["pronouns"] = "<b>hi</b>";
  CHECK(!w.createCharacter(bad));
}

TEST_CASE("creator: same names get distinct ids; homes run out") {
  World w = World::createNew(realContent());
  REQUIRE(w.createCharacter(nicoSheet()));
  auto second = w.createCharacter(nicoSheet());
  REQUIRE(second);
  CHECK(second.value() == "nico-vale-2");
  int made = 2;
  while (w.createCharacter(nicoSheet())) ++made;
  CHECK(made == 4);  // four vacant starter homes in the founding town
  CHECK(w.createCharacter(nicoSheet()).error().code == "no_housing");
  CHECK(w.state().ledger.sumOfBalances() == 0);
}

TEST_CASE("creator: options are served from data") {
  World w = World::createNew(realContent());
  const Json o = w.creatorOptions();
  CHECK(o["origins"].size() == 10);
  CHECK(o["appearance"].contains("hair_style"));
  CHECK(o["pronouns"]["allow_custom"] == true);
  bool hasCafe = false, hasLaw = false;
  for (const auto& c : o["careers"]) {
    hasCafe |= c["id"] == "cafe";
    hasLaw |= c["id"] == "law";
  }
  CHECK(hasCafe);
  CHECK(!hasLaw);
}

TEST_CASE("creator: a starting job needs what applying for it would (missing_degree), and the options say which") {
  World w = World::createNew(realContent());
  // Machine learning needs a bachelor's: a high-school graduate can't start there, from the creator or by applying.
  Json hs = nicoSheet();
  hs["education"] = "high school";
  hs["career"] = "ai_engineering";
  auto refused = w.createCharacter(hs);
  REQUIRE(!refused);
  CHECK(refused.error().code == "missing_degree");
  CHECK(refused.error().message.find("Bachelor") != std::string::npos);
  CHECK(w.state().createdCharacters.empty());  // nothing was made
  Json grad = hs;
  grad["education"] = "bachelor's degree";
  auto made = w.createCharacter(grad);
  REQUIRE(made);
  CHECK(w.character(made.value())->career.careerId == "ai_engineering");
  // `apply` keeps the same rule: Julian (high school) can't become a machine learning engineer either.
  REQUIRE(w.connect("julian"));
  walkTo(w, "julian", "parallax_labs");
  CHECK(w.applyForJob("julian", "ai_engineering").error().code == "missing_degree");
  // Jobs without a requirement stay open to every education.
  hs["career"] = "cafe";
  hs["first_name"] = "Bo";
  CHECK(w.createCharacter(hs));

  // creator_options marks, for each career, the education answers that qualify, by the same rule.
  const Json o = w.creatorOptions();
  const std::vector<std::string> answers = o["education"]["options"].get<std::vector<std::string>>();
  for (const auto& c : o["careers"]) {
    const CareerDef* career = w.content().career(c["id"].get<std::string>());
    REQUIRE(career);
    for (const auto& answer : answers) {
      const auto held = w.content().education().creatorEducation.find(answer);
      const std::vector<std::string> degrees =
          held == w.content().education().creatorEducation.end() ? std::vector<std::string>{} : held->second;
      const Json& open = c["educations"];
      const bool listed = std::find(open.begin(), open.end(), Json(answer)) != open.end();
      CHECK(listed == static_cast<bool>(w.meetsEntryRequirements(*career, degrees, false)));
    }
    if (c["id"] == "ai_engineering") {
      CHECK(c["requires_degree"] == "Bachelor's degree");
      CHECK(std::find(c["educations"].begin(), c["educations"].end(), Json("high school")) == c["educations"].end());
      CHECK(std::find(c["educations"].begin(), c["educations"].end(), Json("doctorate")) != c["educations"].end());
    }
    if (c["id"] == "cafe") {
      CHECK(c["requires_degree"].is_null());
      CHECK(c["educations"].size() == answers.size());
    }
  }
}
