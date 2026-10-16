// Wetting yourself as a very big deal, laundry, weather, birthdays and hangovers.
// M0.8 feature file: see docs/m08/details.md.
#include "core/Content.h"
#include "core/Parts.h"
#include "core/World.h"

namespace livera {

// ---- Content -------------------------------------------------------------------------------
Status ContentDatabase::ingestDetails(const std::string& source, const std::string& section, const Json& body, bool& handled) {
  (void)source;
  (void)section;
  (void)body;
  handled = false;
  return okStatus();
}

Status ContentDatabase::validateDetails() const { return okStatus(); }

// ---- Simulation ----------------------------------------------------------------------------
void World::stepDetailsHourly() {}

Json World::phoneWeather(const CharacterState& c) const {
  (void)c;
  return Json::object();
}

// ---- Save ----------------------------------------------------------------------------------
Json detailsPartToJson(const WorldState& s) {
  (void)s;
  return Json::object();
}

void detailsPartFromJson(WorldState& s, const Json& j) {
  (void)s;
  (void)j;
}

void writeDetailsCharacter(const CharacterState& c, Json& j) {
  (void)c;
  (void)j;
}

void readDetailsCharacter(CharacterState& c, const Json& j) {
  (void)c;
  (void)j;
}

}  // namespace livera
