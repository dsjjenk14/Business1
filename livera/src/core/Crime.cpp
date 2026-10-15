// Crime and the police. Everything a character is caught doing goes on their record.
#include "core/World.h"

namespace livera {

void World::recordCrime(CharacterState& c, const std::string& crime, Cents fineCents, GameMinutes jailMinutes) {
  c.record.push_back(CrimeRecordEntry{crime, state_.now, fineCents, jailMinutes});
}

}  // namespace livera
