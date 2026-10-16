// Pets (adoption, care, the vet) and medicine (over the counter and prescription).
// M0.8 feature file: see docs/m08/pets.md.
#include "core/Content.h"
#include "core/Parts.h"
#include "core/World.h"

namespace livera {

// ---- Content -------------------------------------------------------------------------------
Status ContentDatabase::ingestPets(const std::string& source, const std::string& section, const Json& body, bool& handled) {
  (void)source;
  (void)section;
  (void)body;
  handled = false;
  return okStatus();
}

Status ContentDatabase::validatePets() const { return okStatus(); }

// ---- Simulation ----------------------------------------------------------------------------
void World::stepPetsHourly() {}

Json World::phonePets(const CharacterState& c) const {
  (void)c;
  return Json::object();
}

// ---- Save ----------------------------------------------------------------------------------
Json petsPartToJson(const WorldState& s) {
  (void)s;
  return Json::object();
}

void petsPartFromJson(WorldState& s, const Json& j) {
  (void)s;
  (void)j;
}

void writePetsCharacter(const CharacterState& c, Json& j) {
  (void)c;
  (void)j;
}

void readPetsCharacter(CharacterState& c, const Json& j) {
  (void)c;
  (void)j;
}

}  // namespace livera
