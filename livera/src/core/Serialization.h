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

// The whole world as one JSON document (the single-player save; "format": 1). Built from the
// same per-record encodings SqliteStore writes to its tables, so a solo save holds exactly what
// a server save holds: session state (online, move targets, shifts, pending asks) is left out.
// Loading refuses an unknown format (`save_version`), a document that doesn't parse as a world
// (`save_corrupt`) and a ledger that doesn't balance (`ledger_unbalanced`).
constexpr int kWorldJsonFormat = 1;
Json worldStateToJson(const WorldState& s);
Result<WorldState> worldStateFromJson(const Json& j);

}  // namespace livera
