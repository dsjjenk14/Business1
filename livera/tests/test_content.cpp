#include "TestSupport.h"

using namespace livera;
using livera::test::realContent;

namespace {

Json minimalSim() {
  return Json::parse(R"({"simulation": {
    "world_bounds": {"min": [0,0], "max": [100,100]},
    "needs": [{"id": "hunger", "decay_per_hour": 5}],
    "emotions": ["happiness"], "personality_traits": ["sociability"], "values": ["career"],
    "relationship_dimensions": ["friendship", "familiarity", "compatibility"]
  }})");
}

}  // namespace

TEST_CASE("content: the shipped data loads and validates") {
  auto db = realContent();
  CHECK(db->character("dominique") != nullptr);
  CHECK(db->character("jaxon") != nullptr);
  CHECK(db->career("recruiting")->levels.size() == 6);
  CHECK(db->location("heritage_coffee")->offers.size() >= 3);
  CHECK(db->constructionProjects().size() >= 3);
  CHECK(db->cityStages().size() == 5);
}

TEST_CASE("content: Dominique is a complete character definition") {
  const CharacterDef* d = realContent()->character("dominique");
  REQUIRE(d);
  CHECK(d->playable);
  CHECK(d->personality.size() == realContent()->sim().personalityTraits.size());
  CHECK(d->values.size() == realContent()->sim().values.size());
  for (const char* key : {"appearance", "family_background", "goals", "ambitions", "social_preferences", "secrets",
                          "schedule", "starting_inventory", "social_media", "reputation", "life_history"}) {
    CHECK(d->profile.contains(key));
  }
  CHECK(!d->relationships.empty());
  CHECK(!d->memories.empty());
}

TEST_CASE("content: unknown stat names are rejected") {
  Json bad = Json::parse(R"({"interactions": [{"id": "x", "label": "X", "actor_to_target": {"frendship": 2}}]})");
  auto r = ContentDatabase::loadFromDocuments({{"sim", minimalSim()}, {"bad", bad}});
  CHECK(!r);
  CHECK(r.error().message.find("frendship") != std::string::npos);
}

TEST_CASE("content: dangling references are rejected") {
  Json bad = Json::parse(R"({"properties": [{"id": "p", "location": "nowhere", "type": "apartment", "owner_account": "org:x"}]})");
  auto r = ContentDatabase::loadFromDocuments({{"sim", minimalSim()}, {"bad", bad}});
  CHECK(!r);
  CHECK(r.error().code == "content_invalid");
}

TEST_CASE("content: duplicate ids and unknown sections are rejected") {
  Json loc = Json::parse(R"({"locations": [{"id": "a", "name": "A", "type": "park", "door": [0,0]}]})");
  CHECK(!ContentDatabase::loadFromDocuments({{"sim", minimalSim()}, {"one", loc}, {"two", loc}}));
  CHECK(!ContentDatabase::loadFromDocuments({{"sim", minimalSim()}, {"x", Json::parse(R"({"vehicles": []})")}}));
  CHECK(!ContentDatabase::loadFromDocuments({{"x", loc}}));  // no simulation section
}

TEST_CASE("content: a new career is a data change, not a code change") {
  Json extra = Json::parse(R"({
    "org_accounts": [{"id": "org:studio", "name": "Studio"}],
    "locations": [{"id": "studio", "name": "Studio", "type": "office", "door": [5,5], "access": "staff"}],
    "careers": [{"id": "photography", "name": "Photography", "workplaces": ["studio"], "employer_account": "org:studio",
                 "levels": [{"title": "Assistant", "hourly_cents": 2000, "hours_to_promote": 10}, {"title": "Photographer", "hourly_cents": 4000}]}]
  })");
  auto r = ContentDatabase::loadFromDocuments({{"sim", minimalSim()}, {"extra", extra}});
  REQUIRE(r);
  CHECK(r.value()->career("photography")->levels.at(1).title == "Photographer");
}
