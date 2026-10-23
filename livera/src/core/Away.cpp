// Away from the game, a character lives their routine (SIMULATION.md, tier 3), and since the redesign the routine
// includes their job: each scheduled work block they spend offline is paid, through the ledger, at a share of the
// wage from their employer, with a share of the hours toward the next title and no work decisions. It is the
// dormant routine's work, done once a game hour for blocks that ended in that hour, so the pay is in the bank
// before the rent it is meant for. Tuning: life.offline.away_work (data/config/life.json); the block is the
// schedule line marked "work": true in a founder's data, or the default block for a character without one.
#include <algorithm>
#include <cmath>

#include "core/Clock.h"
#include "core/Schedule.h"
#include "core/World.h"

namespace livera {

// The block a character works on a weekday: from their work line to the next line (or midnight), at most the
// career's longest shift. A schedule with no work line anywhere (everyone made in the creator) works the default.
World::WorkBlock World::scheduledWorkBlock(const CharacterState& c, int weekday) const {
  WorkBlock b;
  const CareerDef* career = content_->career(c.career.careerId);
  const CharacterDef* def = definition(c.id);
  if (!career || !def) return b;
  const auto cap = static_cast<int>(career->maxShiftHours * 60);
  const Json schedule = def->profile.is_object() ? def->profile.value("schedule", Json::object()) : Json::object();
  bool anyWorkLine = false;
  if (schedule.is_object()) {
    for (const auto& [day, lines] : schedule.items()) {
      if (!lines.is_array()) continue;
      for (const auto& e : lines) anyWorkLine |= e.is_object() && e.value("work", false);
    }
  }
  if (!anyWorkLine) {
    const LifeConfig& L = content_->life();
    if (std::find(L.defaultWorkDays.begin(), L.defaultWorkDays.end(), weekday) == L.defaultWorkDays.end()) return b;
    b.start = L.defaultWorkStartHour * 60;
    b.end = std::min(L.defaultWorkEndHour * 60, b.start + cap);
    return b;
  }
  const auto lines = schedule::entriesFor(schedule, weekday);
  for (std::size_t i = 0; i < lines.size(); ++i) {
    if (!lines[i].second.value("work", false)) continue;
    b.start = lines[i].first;
    b.end = std::min(i + 1 < lines.size() ? lines[i + 1].first : static_cast<int>(kMinutesPerDay), b.start + cap);
    break;
  }
  return b;
}

void World::stepAwayWorkHourly() {
  const LifeConfig& L = content_->life();
  if (L.awayPayShare <= 0 && L.awayPromotionShare <= 0) return;
  const GameMinutes now = state_.now;  // on the hour: blocks that ended in (now - 60, now] are paid
  const GameMinutes ended = now - 1;   // the day the hour that just ended belongs to
  const GameMinutes dayStart = ended - ended % kMinutesPerDay;
  const int weekday = toDateTime(ended).weekday;
  for (auto& [id, c] : state_.characters) {
    // Only someone away, living their routine: not in the world, grown up, free, and still looking after themself.
    if (c.online || ageOf(id) < L.adultAge || inJail(id)) continue;
    if (offlineTooLong(c) || findCondition(c, L.depressionCondition)) continue;
    const CareerDef* career = content_->career(c.career.careerId);
    // A nanny works in a family's home for a parent who hires them in person: not something a routine does.
    if (!career || career->atEmployersHome || career->employerAccount.empty()) continue;
    if (c.career.level < 0 || c.career.level >= static_cast<int>(career->levels.size())) continue;
    const WorkBlock block = scheduledWorkBlock(c, weekday);
    if (block.start < 0 || block.end <= block.start) continue;
    const GameMinutes blockEnd = dayStart + block.end;
    if (blockEnd <= now - kMinutesPerHour || blockEnd > now) continue;
    // Only the part of the block spent away (they may have worked the start of it in person, then logged off).
    const GameMinutes from = std::max(dayStart + block.start, c.lastSimulatedAt);
    const GameMinutes minutes = blockEnd - from;
    if (static_cast<double>(minutes) < career->minPaidMinutes) continue;
    const double hours = static_cast<double>(minutes) / 60.0;
    const CareerLevel& level = career->levels[static_cast<std::size_t>(c.career.level)];
    const auto pay = static_cast<Cents>(std::llround(hours * static_cast<double>(level.hourlyCents) * L.awayPayShare));
    const LocationDef* where = career->workplaces.empty() ? nullptr : content_->location(career->workplaces.front());
    const std::string at = where ? where->name : career->name;
    const bool told = c.lastOnlineAt >= 0;  // nobody has ever played them: nobody to tell
    if (pay > 0) {
      auto tx = state_.ledger.transfer(career->employerAccount, bankAccountOf(id), pay, "salary_away",
                                       career->name + " pay (away): " + level.title, now);
      if (!tx) {
        // The employer can't pay: nothing is paid. The hours still count, as they do for a shift in person.
        if (told)
          notify(id, "career", "Payroll failed: " + at + " couldn't pay you for your hours while you were away.");
      } else {
        c.career.lifetimeEarningsCents += pay;
        if (told)
          notify(id, "bank", "While you were away you worked your usual hours at " + at + ": " + formatMoney(pay) +
                                 " (your routine's share of the wage).");
      }
    }
    c.career.hoursAtLevel += hours * L.awayPromotionShare;
  }
}

}  // namespace livera
