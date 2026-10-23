#include "core/Clock.h"

#include <cstdio>

namespace livera {

DateTime toDateTime(GameMinutes t) {
  if (t < 0) t = 0;
  DateTime d;
  d.dayIndex = t / kMinutesPerDay;
  const GameMinutes inDay = t % kMinutesPerDay;
  d.hour = static_cast<int>(inDay / kMinutesPerHour);
  d.minute = static_cast<int>(inDay % kMinutesPerHour);
  d.weekday = static_cast<int>(d.dayIndex % kDaysPerWeek);
  const std::int64_t daysPerYear = static_cast<std::int64_t>(kDaysPerMonth) * kMonthsPerYear;
  d.year = static_cast<int>(d.dayIndex / daysPerYear) + 1;
  const std::int64_t dayOfYear = d.dayIndex % daysPerYear;
  d.month = static_cast<int>(dayOfYear / kDaysPerMonth) + 1;
  d.day = static_cast<int>(dayOfYear % kDaysPerMonth) + 1;
  return d;
}

GameMinutes fromDateTime(int year, int month, int day, int hour, int minute) {
  return static_cast<GameMinutes>(year - 1) * kMinutesPerYear + static_cast<GameMinutes>(month - 1) * kMinutesPerMonth +
         static_cast<GameMinutes>(day - 1) * kMinutesPerDay + static_cast<GameMinutes>(hour) * kMinutesPerHour + minute;
}

const char* weekdayName(int weekday) {
  static const char* names[] = {"Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"};
  return names[((weekday % 7) + 7) % 7];
}

std::string formatDateTime(GameMinutes t) {
  const DateTime d = toDateTime(t);
  char buf[96];
  std::snprintf(buf, sizeof buf, "%s, Year %d Month %d Day %d, %02d:%02d", weekdayName(d.weekday), d.year, d.month,
                d.day, d.hour, d.minute);
  return buf;
}

DayPhase dayPhase(GameMinutes t) {
  const int h = toDateTime(t).hour;
  if (h >= 5 && h < 7) return DayPhase::Dawn;
  if (h >= 7 && h < 18) return DayPhase::Day;
  if (h >= 18 && h < 20) return DayPhase::Dusk;
  return DayPhase::Night;
}

const char* dayPhaseName(DayPhase p) {
  switch (p) {
    case DayPhase::Night: return "night";
    case DayPhase::Dawn: return "dawn";
    case DayPhase::Day: return "day";
    case DayPhase::Dusk: return "dusk";
  }
  return "day";
}

double daylightLevel(GameMinutes t) {
  const DateTime d = toDateTime(t);
  const double h = d.hour + d.minute / 60.0;
  if (h < 5 || h >= 20) return 0.0;
  if (h < 7) return (h - 5) / 2.0;
  if (h < 18) return 1.0;
  return 1.0 - (h - 18) / 2.0;
}

}  // namespace livera
