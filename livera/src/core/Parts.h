#pragma once
// Save hooks for the M0.8 features. Each feature keeps its world-wide state in its own "world
// part" (one row of the world_parts table, schema v4) and its per-character state under its
// own key in the character JSON. Each pair of functions lives in the feature's own file, so
// the features never edit each other's save code. Field names are part of the save format.

#include <map>
#include <string>

#include "core/World.h"

namespace livera {

// Homes.cpp
Json homesPartToJson(const WorldState& s);
void homesPartFromJson(WorldState& s, const Json& j);
void writeHomesCharacter(const CharacterState& c, Json& j);
void readHomesCharacter(CharacterState& c, const Json& j);

// WorkTasks.cpp
Json workPartToJson(const WorldState& s);
void workPartFromJson(WorldState& s, const Json& j);
void writeWorkCharacter(const CharacterState& c, Json& j);
void readWorkCharacter(CharacterState& c, const Json& j);

// Wallet.cpp
Json walletPartToJson(const WorldState& s);
void walletPartFromJson(WorldState& s, const Json& j);
void writeWalletCharacter(const CharacterState& c, Json& j);
void readWalletCharacter(CharacterState& c, const Json& j);

// Leisure.cpp
Json leisurePartToJson(const WorldState& s);
void leisurePartFromJson(WorldState& s, const Json& j);
void writeLeisureCharacter(const CharacterState& c, Json& j);
void readLeisureCharacter(CharacterState& c, const Json& j);

// Pets.cpp
Json petsPartToJson(const WorldState& s);
void petsPartFromJson(WorldState& s, const Json& j);
void writePetsCharacter(const CharacterState& c, Json& j);
void readPetsCharacter(CharacterState& c, const Json& j);

// Details.cpp
Json detailsPartToJson(const WorldState& s);
void detailsPartFromJson(WorldState& s, const Json& j);
void writeDetailsCharacter(const CharacterState& c, Json& j);
void readDetailsCharacter(CharacterState& c, const Json& j);

// All parts by key, for the store.
std::map<std::string, Json> worldPartsToJson(const WorldState& s);
void worldPartsFromJson(WorldState& s, const std::map<std::string, Json>& parts);

}  // namespace livera
