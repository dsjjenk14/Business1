// The founding cast: every character in data/characters must be complete, match their
// reference art, and actually be able to live in the town (home, job, ties).

#include <filesystem>
#include <set>

#include "TestSupport.h"

using namespace livera;
using namespace livera::test;

namespace {

const std::vector<std::string> kCast = {"dominique", "dax",    "harper", "andre",   "naomi", "graham",
                                        "maya",      "julian", "leila",  "aaliyah", "sienna"};

}  // namespace

TEST_CASE("cast: the founding cast is exactly the eleven characters on the art sheets") {
  std::set<std::string> ids;
  for (const auto& [id, def] : realContent()->characters()) ids.insert(id);
  CHECK(ids == std::set<std::string>(kCast.begin(), kCast.end()));
}

TEST_CASE("cast: every character is complete and linked to art that exists") {
  const auto root = std::filesystem::path(LIVERA_DATA_DIR).parent_path();
  const SimulationConfig& sim = realContent()->sim();
  for (const auto& id : kCast) {
    const CharacterDef* d = realContent()->character(id);
    REQUIRE(d);
    CHECK(d->playable);
    CHECK(d->personality.size() == sim.personalityTraits.size());
    CHECK(d->values.size() == sim.values.size());
    CHECK(d->relationships.size() >= 3);
    const Json& p = d->profile;
    for (const char* key : {"tagline", "archetype", "why_livera", "appearance", "family_background", "education", "goals",
                            "ambitions", "social_preferences", "secrets", "schedule", "starting_inventory", "social_media",
                            "reputation", "life_history"}) {
      if (!p.contains(key)) std::fprintf(stderr, "    %s is missing %s\n", id.c_str(), key);
      CHECK(p.contains(key));
    }
    CHECK(!p["secrets"].empty());
    const Json& look = p["appearance"];
    CHECK(look["key_features"].size() >= 4);
    const std::string art = look.value("visual_reference", "");
    if (!std::filesystem::exists(root / art)) std::fprintf(stderr, "    %s: art not found at %s\n", id.c_str(), art.c_str());
    CHECK(std::filesystem::exists(root / art));
  }
}

TEST_CASE("cast: everyone has their own home and a job they can actually work") {
  World w = World::createNew(realContent());
  std::set<std::string> homes;
  for (const auto& id : kCast) {
    const CharacterDef* d = w.definition(id);
    CHECK(homes.insert(d->homeProperty).second);  // nobody shares a home
    CHECK(w.state().properties.at(d->homeProperty).tenant == id);
    CHECK(w.character(id)->inside == d->spawnLocation);
    REQUIRE(w.connect(id));
  }
  for (const auto& id : kCast) {
    const CharacterDef* d = w.definition(id);
    const CareerDef* career = w.content().career(d->careerId);
    REQUIRE(career);
    REQUIRE(!career->workplaces.empty());
    // It's 07:00: shops like Low End Studios are closed, but staff can always get in.
    walkInto(w, id, career->workplaces.front());
    REQUIRE(w.startShift(id));
  }
  w.advanceMinutes(60);
  for (const auto& id : kCast) {
    const CharacterDef* d = w.definition(id);
    const Cents hourly = w.content().career(d->careerId)->levels.at(static_cast<std::size_t>(d->careerLevel)).hourlyCents;
    auto r = w.endShift(id);
    REQUIRE(r);
    // Walking to work takes game time, so everyone clocked in at a different minute.
    const auto minutes = r.value()["minutes_worked"].get<GameMinutes>();
    CHECK(minutes >= 60);
    CHECK(r.value()["pay_cents"].get<Cents>() == std::llround(static_cast<double>(minutes) / 60.0 * static_cast<double>(hourly)));
  }
  CHECK(w.state().ledger.sumOfBalances() == 0);
}

TEST_CASE("cast: their history is directional, as written") {
  World w = World::createNew(realContent());
  // Andre still carries a torch; Aaliyah carries a grudge.
  CHECK(w.relationshipValue("andre", "aaliyah", "romantic_attraction") > w.relationshipValue("aaliyah", "andre", "romantic_attraction"));
  CHECK(w.relationshipValue("aaliyah", "andre", "resentment") > w.relationshipValue("andre", "aaliyah", "resentment"));
  // Cousins: Sienna is the jealous one.
  CHECK(w.relationshipValue("sienna", "naomi", "jealousy") > w.relationshipValue("naomi", "sienna", "jealousy"));
  // Graham doesn't know Leila is investigating him; Leila doesn't trust him at all.
  CHECK(w.relationshipValue("leila", "graham", "trust") < 5);
  // Not everyone knows everyone.
  CHECK(w.relationship("harper", "andre") == nullptr);
  CHECK(w.relationship("graham", "sienna") == nullptr);
  // Old grudges colour first impressions in town: Aaliyah warms to Andre slowly.
  REQUIRE(w.connect("andre"));
  REQUIRE(w.connect("aaliyah"));
  walkInto(w, "andre", "heritage_coffee");
  walkInto(w, "aaliyah", "heritage_coffee");
  const double before = w.relationshipValue("aaliyah", "andre", "friendship");
  REQUIRE(w.interact("andre", "compliment", "aaliyah"));
  CHECK(w.relationshipValue("aaliyah", "andre", "friendship") - before < 3);  // grudge halves the gain
}

TEST_CASE("cast: Andre is already a musician; his sets land better than a beginner's") {
  World w = World::createNew(realContent());
  CHECK(w.character("andre")->skills.at("music") == 72);
  CHECK(w.character("dominique")->skills.at("music") == 0);
  REQUIRE(w.connect("andre"));
  REQUIRE(w.connect("dominique"));
  const Json song = Json::parse(R"({"title": "Riverside", "bpm": 90,
      "tracks": [{"instrument": "electric_piano", "notes": [[0,60,8],[8,62,8]]}]})");
  const std::string andreSong = w.saveSong("andre", song, "").value()["id"];
  const std::string domSong = w.saveSong("dominique", song, "").value()["id"];
  walkInto(w, "andre", "low_end_studios");  // his studio is a stage; staff get in any time
  w.advanceMinutes(6 * 60);                  // the public can come in from noon
  walkInto(w, "dominique", "low_end_studios");
  const double pro = w.perform("andre", andreSong).value()["quality"];
  const double beginner = w.perform("dominique", domSong).value()["quality"];
  CHECK(pro > beginner + 30);
}
