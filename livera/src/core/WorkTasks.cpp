// Work decisions: up to three job questions a work day; good answers speed up promotion.
// M0.8 feature file: see docs/m08/work.md.
#include "core/Content.h"
#include "core/Parts.h"
#include "core/World.h"

namespace livera {

// ---- Content -------------------------------------------------------------------------------
Status ContentDatabase::ingestWork(const std::string& source, const std::string& section, const Json& body, bool& handled) {
  (void)source;
  (void)section;
  (void)body;
  handled = false;
  return okStatus();
}

Status ContentDatabase::validateWork() const { return okStatus(); }

// ---- Simulation ----------------------------------------------------------------------------
void World::stepWorkHourly() {}

Json World::phoneWork(const CharacterState& c) const {
  (void)c;
  return Json::object();
}

// ---- Save ----------------------------------------------------------------------------------
Json workPartToJson(const WorldState& s) {
  (void)s;
  return Json::object();
}

void workPartFromJson(WorldState& s, const Json& j) {
  (void)s;
  (void)j;
}

void writeWorkCharacter(const CharacterState& c, Json& j) {
  (void)c;
  (void)j;
}

void readWorkCharacter(CharacterState& c, const Json& j) {
  (void)c;
  (void)j;
}

}  // namespace livera
