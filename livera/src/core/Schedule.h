#pragma once
// Reading a character's `profile.schedule` (data/characters): the lines for one weekday, by minute of the day. The
// autopilot plans a founder's day from them and the away routine finds the work line (`"work": true`) in them, so
// both read a schedule the same way. Internal to src/core.

#include <cctype>
#include <map>
#include <string>
#include <utility>
#include <vector>

#include "core/Clock.h"
#include "core/Types.h"

namespace livera::schedule {

// "08:30" -> 510; -1 if it isn't a time.
inline int minuteOfDay(const std::string& t) {
  const auto colon = t.find(':');
  if (colon == std::string::npos) return -1;
  try {
    const int h = std::stoi(t.substr(0, colon)), m = std::stoi(t.substr(colon + 1));
    return h >= 0 && h < 24 && m >= 0 && m < 60 ? h * 60 + m : -1;
  } catch (const std::exception&) {
    return -1;
  }
}

// The lines for a weekday (0 = Monday): "weekdays" (Mon-Fri) or "weekends" lines (the singular works too), then the
// day's own lines ("thursday"), which win at the same time. Each is {minute, the entry object}, in time order.
inline std::vector<std::pair<int, Json>> entriesFor(const Json& schedule, int weekday) {
  std::map<int, Json> out;
  if (!schedule.is_object()) return {};
  const std::string general = weekday < 5 ? "weekdays" : "weekends";
  std::string day;
  for (const char* ch = weekdayName(weekday); *ch; ++ch)
    day += static_cast<char>(std::tolower(static_cast<unsigned char>(*ch)));
  for (const std::string& name : {general, general.substr(0, general.size() - 1), day}) {
    const auto it = schedule.find(name);
    if (it == schedule.end() || !it->is_array()) continue;
    for (const auto& e : *it) {
      if (!e.is_object() || !e.contains("time") || !e["time"].is_string()) continue;
      const int minute = minuteOfDay(e["time"].get<std::string>());
      if (minute >= 0) out[minute] = e;
    }
  }
  return {out.begin(), out.end()};
}

}  // namespace livera::schedule
