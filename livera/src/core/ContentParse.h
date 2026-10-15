#pragma once
// Helpers shared by the content parsers (Content.cpp, ContentMore.cpp). Internal to src/core.

#include <set>
#include <string>
#include <vector>

#include "core/Types.h"

namespace livera::content_parse {

inline StatMap readStats(const Json& j, const char* key) {
  StatMap out;
  if (!j.contains(key)) return out;
  for (const auto& [k, v] : j.at(key).items()) out[k] = v.get<double>();
  return out;
}

inline std::vector<std::string> readStrings(const Json& j, const char* key) {
  if (!j.contains(key)) return {};
  return j.at(key).get<std::vector<std::string>>();
}

inline std::vector<int> readInts(const Json& j, const char* key) {
  if (!j.contains(key)) return {};
  return j.at(key).get<std::vector<int>>();
}

inline Vec2 readVec2(const Json& j) { return Vec2{j.at(0).get<double>(), j.at(1).get<double>()}; }

template <class Map>
Status insertUnique(Map& map, const std::string& kind, const std::string& id, typename Map::mapped_type value) {
  if (map.count(id)) return fail("content_duplicate", "duplicate " + kind + " id '" + id + "'");
  map.emplace(id, std::move(value));
  return okStatus();
}

inline Status checkKeys(const StatMap& stats, const std::set<std::string>& allowed, const std::string& where) {
  for (const auto& [k, v] : stats) {
    if (!allowed.count(k)) return fail("content_invalid", where + ": unknown stat '" + k + "'");
  }
  return okStatus();
}

}  // namespace livera::content_parse
