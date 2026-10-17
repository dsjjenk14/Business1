#pragma once

#include <string>

#include "core/Types.h"

namespace livera {

// LIVÉRA uses a simplified calendar so schedules, rent and paydays line up cleanly:
// 60-minute hours, 24-hour days, 7-day weeks, 4-week (28-day) months, 12-month years.
// See docs/DECISIONS.md (D-007).
inline constexpr GameMinutes kMinutesPerHour = 60;
inline constexpr GameMinutes kMinutesPerDay = 24 * kMinutesPerHour;
inline constexpr int kDaysPerWeek = 7;
inline constexpr int kDaysPerMonth = 28;
inline constexpr int kMonthsPerYear = 12;
inline constexpr GameMinutes kMinutesPerWeek = kDaysPerWeek * kMinutesPerDay;
inline constexpr GameMinutes kMinutesPerMonth = kDaysPerMonth * kMinutesPerDay;
inline constexpr GameMinutes kMinutesPerYear = kMonthsPerYear * kMinutesPerMonth;

struct DateTime {
  int year = 1;     // 1-based
  int month = 1;    // 1..12
  int day = 1;      // 1..28
  int weekday = 0;  // 0 = Monday .. 6 = Sunday
  int hour = 0;
  int minute = 0;
  std::int64_t dayIndex = 0;  // days since epoch
};

DateTime toDateTime(GameMinutes t);
GameMinutes fromDateTime(int year, int month, int day, int hour, int minute);
const char* weekdayName(int weekday);
std::string formatDateTime(GameMinutes t);

enum class DayPhase { Night, Dawn, Day, Dusk };
DayPhase dayPhase(GameMinutes t);
const char* dayPhaseName(DayPhase p);
// 0 (full dark) .. 1 (full daylight). Drives lighting in a rendering client.
double daylightLevel(GameMinutes t);

}  // namespace livera
