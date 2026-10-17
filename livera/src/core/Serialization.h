#pragma once

#include "core/World.h"

// JSON encodings of runtime state records, used by persistence. Field names are part of
// the save format: renaming one requires a migration (docs/DATA_MODEL.md, "Save format").
namespace livera {

Json toJson(const CharacterState& c);
CharacterState characterStateFromJson(const Json& j);

Json toJson(const RelationshipState& r);
RelationshipState relationshipStateFromJson(const Json& j);

Json toJson(const Memory& m);
Memory memoryFromJson(const Json& j);

Json toJson(const Song& s);
Song songFromJson(const Json& j);

// Player-created characters are saved in the same format as content character files.
Json toJson(const CharacterDef& c);

const char* toString(ConstructionStatus s);
ConstructionStatus constructionStatusFromString(const std::string& s);

}  // namespace livera
