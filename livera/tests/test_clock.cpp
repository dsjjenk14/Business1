#include "TestHarness.h"
#include "core/Clock.h"
#include "core/Content.h"

using namespace livera;

TEST_CASE("clock: epoch is Year 1, Month 1, Day 1, Monday midnight") {
  const DateTime d = toDateTime(0);
  CHECK(d.year == 1);
  CHECK(d.month == 1);
  CHECK(d.day == 1);
  CHECK(d.weekday == 0);
  CHECK(d.hour == 0);
  CHECK(d.minute == 0);
}

TEST_CASE("clock: calendar arithmetic round-trips") {
  const GameMinutes t = fromDateTime(3, 7, 19, 14, 45);
  const DateTime d = toDateTime(t);
  CHECK(d.year == 3);
  CHECK(d.month == 7);
  CHECK(d.day == 19);
  CHECK(d.hour == 14);
  CHECK(d.minute == 45);
  CHECK(toDateTime(kMinutesPerWeek).weekday == 0);
  CHECK(toDateTime(kMinutesPerDay * 5).weekday == 5);
  CHECK(toDateTime(kMinutesPerMonth).month == 2);
  CHECK(toDateTime(kMinutesPerYear).year == 2);
}

TEST_CASE("clock: day/night cycle") {
  CHECK(dayPhase(fromDateTime(1, 1, 1, 3, 0)) == DayPhase::Night);
  CHECK(dayPhase(fromDateTime(1, 1, 1, 6, 0)) == DayPhase::Dawn);
  CHECK(dayPhase(fromDateTime(1, 1, 1, 12, 0)) == DayPhase::Day);
  CHECK(dayPhase(fromDateTime(1, 1, 1, 19, 0)) == DayPhase::Dusk);
  CHECK(daylightLevel(fromDateTime(1, 1, 1, 0, 0)) == 0.0);
  CHECK(daylightLevel(fromDateTime(1, 1, 1, 12, 0)) == 1.0);
  const double dawn = daylightLevel(fromDateTime(1, 1, 1, 6, 0));
  CHECK(dawn > 0.0 && dawn < 1.0);
}

TEST_CASE("clock: opening hours wrap past midnight") {
  OpeningHours club{21, 3};
  CHECK(club.isOpenAt(22));
  CHECK(club.isOpenAt(1));
  CHECK(!club.isOpenAt(12));
  OpeningHours cafe{6, 20};
  CHECK(cafe.isOpenAt(6));
  CHECK(!cafe.isOpenAt(20));
}
