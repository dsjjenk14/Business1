// Homes for sale, mortgages, buying together and moving in together.
// M0.8 feature file: see docs/m08/homes.md.
#include "core/Content.h"
#include "core/Parts.h"
#include "core/World.h"

namespace livera {

// ---- Content -------------------------------------------------------------------------------
Status ContentDatabase::ingestHomes(const std::string& source, const std::string& section, const Json& body, bool& handled) {
  (void)source;
  (void)section;
  (void)body;
  handled = false;
  return okStatus();
}

Status ContentDatabase::validateHomes() const { return okStatus(); }

// ---- Simulation ----------------------------------------------------------------------------
void World::stepHomesHourly() {}

Json World::phoneHomes(const CharacterState& c) const {
  (void)c;
  return Json::object();
}

// ---- Save ----------------------------------------------------------------------------------
Json homesPartToJson(const WorldState& s) {
  (void)s;
  return Json::object();
}

void homesPartFromJson(WorldState& s, const Json& j) {
  (void)s;
  (void)j;
}

void writeHomesCharacter(const CharacterState& c, Json& j) {
  (void)c;
  (void)j;
}

void readHomesCharacter(CharacterState& c, const Json& j) {
  (void)c;
  (void)j;
}

}  // namespace livera
