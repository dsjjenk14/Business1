// Collects the M0.8 features' world parts for the store (see Parts.h).
#include "core/Parts.h"

namespace livera {

std::map<std::string, Json> worldPartsToJson(const WorldState& s) {
  std::map<std::string, Json> out;
  out["homes"] = homesPartToJson(s);
  out["work"] = workPartToJson(s);
  out["wallet"] = walletPartToJson(s);
  out["leisure"] = leisurePartToJson(s);
  out["pets"] = petsPartToJson(s);
  out["details"] = detailsPartToJson(s);
  out["social"] = socialPartToJson(s);  // D-074
  out["court"] = courtPartToJson(s);    // D-083
  return out;
}

void worldPartsFromJson(WorldState& s, const std::map<std::string, Json>& parts) {
  auto part = [&](const char* key) {
    auto it = parts.find(key);
    return it == parts.end() ? Json::object() : it->second;
  };
  homesPartFromJson(s, part("homes"));
  workPartFromJson(s, part("work"));
  walletPartFromJson(s, part("wallet"));
  leisurePartFromJson(s, part("leisure"));
  petsPartFromJson(s, part("pets"));
  detailsPartFromJson(s, part("details"));
  socialPartFromJson(s, part("social"));  // D-074: an older save has none (World's constructor seeds the follows)
  courtPartFromJson(s, part("court"));    // D-083: an older save has no cases
}

}  // namespace livera
