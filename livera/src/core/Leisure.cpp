// Sports teams and fields, date spots and Willow Lake Park.
// M0.8 feature file: see docs/m08/leisure.md.
#include "core/Content.h"
#include "core/Parts.h"
#include "core/World.h"

namespace livera {

// ---- Content -------------------------------------------------------------------------------
Status ContentDatabase::ingestLeisure(const std::string& source, const std::string& section, const Json& body, bool& handled) {
  (void)source;
  (void)section;
  (void)body;
  handled = false;
  return okStatus();
}

Status ContentDatabase::validateLeisure() const { return okStatus(); }

// ---- Simulation ----------------------------------------------------------------------------
void World::stepLeisureHourly() {}

Json World::phoneSports(const CharacterState& c) const {
  (void)c;
  return Json::object();
}

// ---- Save ----------------------------------------------------------------------------------
Json leisurePartToJson(const WorldState& s) {
  (void)s;
  return Json::object();
}

void leisurePartFromJson(WorldState& s, const Json& j) {
  (void)s;
  (void)j;
}

void writeLeisureCharacter(const CharacterState& c, Json& j) {
  (void)c;
  (void)j;
}

void readLeisureCharacter(CharacterState& c, const Json& j) {
  (void)c;
  (void)j;
}

}  // namespace livera
