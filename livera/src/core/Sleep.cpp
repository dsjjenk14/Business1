// Sleep and the night. Going to bed at home in the evening keeps you in the world, asleep: your routine looks
// after you as it does while you're away (needs catch up when you wake instead of running down minute by
// minute), and at the wake hour everyone asleep gets up with a "good morning" of what happened overnight. Whether
// the night is skipped is the caller's decision (the server's bed rule, a solo town's one player); skipNight then
// lives it out minute by minute in one go. Tuning: life.sleep in data/config/life.json. Nothing here is saved:
// a restart finds everyone out of the world, which is awake.
#include <algorithm>
#include <cmath>
#include <cstdio>

#include "core/Clock.h"
#include "core/World.h"

namespace livera {

namespace {

std::string hhmm(GameMinutes t) {
  const DateTime d = toDateTime(t);
  char buf[8];
  std::snprintf(buf, sizeof buf, "%02d:%02d", d.hour, d.minute);
  return buf;
}

}  // namespace

bool World::isAsleep(const CharacterId& id) const {
  const CharacterState* c = character(id);
  return c && c->online && c->asleepSince >= 0;
}

std::vector<CharacterId> World::sleepers() const {
  std::vector<CharacterId> out;
  for (const auto& [id, c] : state_.characters) {
    if (c.online && c.asleepSince >= 0) out.push_back(id);
  }
  return out;
}

GameMinutes World::nextWakeAt() const {
  const GameMinutes dayStart = state_.now - state_.now % kMinutesPerDay;
  GameMinutes wake = dayStart + content_->life().wakeHour * kMinutesPerHour;
  if (wake <= state_.now) wake += kMinutesPerDay;
  return wake;
}

Result<Json> World::sleep(const CharacterId& actor) {
  auto r = activeCharacter(actor);  // already asleep: that wakes you, and you go back to bed below
  if (!r) return r.error();
  CharacterState& c = *r.value();
  if (Status st = freeToAct(c); !st) return st.error();
  if (c.career.shiftStartedAt) return fail("on_shift", "you're on shift; end it first");
  if (c.education.sessionStartedAt) return fail("studying", "finish studying first");
  const PropertyState* home = homeOf(actor);
  const PropertyDef* def = home ? content_->property(home->id) : nullptr;
  if (!def || c.inside != def->location) return fail("not_home", "you can only go to bed in your own home");
  const LifeConfig& L = content_->life();
  const OpeningHours& bed = L.bedHours;
  const double energy = c.needs.count("energy") ? c.needs.at("energy") : 0;
  // At night you sleep until the wake hour; by day, tired enough, you nap until you're rested.
  const bool night = bed.isOpenAt(toDateTime(state_.now).hour);
  if (!night && energy >= L.napBelowEnergy)
    return fail("not_bedtime", "it's too early for bed: you can go to bed from " + hhmm(bed.openHour * kMinutesPerHour) +
                                   " until " + hhmm(bed.closeHour * kMinutesPerHour) + ", or nap any time your energy is below " +
                                   std::to_string(static_cast<int>(L.napBelowEnergy)));
  c.asleepSince = state_.now;
  c.energyAtBed = energy;
  c.napUntil = -1;
  if (!night) {
    const double hours = std::clamp((100 - energy) / L.sleepEnergyPerHour, 0.5, L.napMaxHours);
    c.napUntil = state_.now + static_cast<GameMinutes>(std::lround(hours * 60));
  }
  (void)takeRoomSpot(c, [](const InteriorSpotDef& s) { return s.kind == "bed"; });  // interiors: into a free bed
  const GameMinutes wake = night ? nextWakeAt() : c.napUntil;
  return Json{{"asleep", true},
              {"nap", !night},
              {"since", state_.now},
              {"wake_at", wake},
              {"wake_time", hhmm(wake)},
              {"note", (night ? "You're in bed. Your routine looks after you until " + hhmm(wake)
                              : "A nap: you'll wake up rested around " + hhmm(wake)) +
                           "; doing anything gets you up (looking around and your phone don't)."}};
}

void World::wakeUp(CharacterState& c, bool morning) {
  if (c.asleepSince < 0) return;
  const GameMinutes since = c.asleepSince;
  catchUpDormant(c, state_.now - c.lastSimulatedAt);  // the routine's night: needs settle as an away character's
  // Sleep brings your energy back from where it was when you lay down: a full night fills it.
  if (c.needs.count("energy")) {
    const double slept = static_cast<double>(state_.now - since) / 60.0;
    c.needs["energy"] = std::max(c.needs["energy"], std::min(100.0, c.energyAtBed + slept * content_->life().sleepEnergyPerHour));
  }
  c.asleepSince = -1;
  c.napUntil = -1;
  if (!morning) return;
  // What happened while they slept, from their own records only.
  Json notes = Json::array();
  for (const auto& n : state_.notifications) {
    if (n.recipient == c.id && n.at >= since)
      notes.push_back(Json{{"kind", n.kind}, {"text", n.text}, {"when", formatDateTime(n.at)}});
  }
  const LedgerAccountId bank = bankAccountOf(c.id), cash = cashAccountOf(c.id);
  Cents money = 0;
  const auto& txs = state_.ledger.transactions();
  for (auto it = txs.rbegin(); it != txs.rend() && it->at >= since; ++it) {
    const bool in = it->to == bank || it->to == cash, out = it->from == bank || it->from == cash;
    if (in && !out) money += it->amountCents;
    if (out && !in) money -= it->amountCents;
  }
  Json needs = Json::object();
  for (const auto& [k, v] : c.needs) needs[k] = std::round(v);
  Json data{{"slept_from", formatDateTime(since)},
            {"woke_at", formatDateTime(state_.now)},
            {"minutes", state_.now - since},
            {"skipped", skipping_},
            {"needs", needs},
            {"money_change_cents", money},
            {"notifications", notes}};
  if (const WeatherKindDef* w = content_->weatherKind(state_.details.today.kind))
    data["weather"] = Json{{"kind", w->id}, {"label", w->label}, {"temp_c", state_.details.today.tempC}};
  emit({c.id}, "good_morning", std::move(data));
}

// A nap ends when you're rested (World::sleep set when).
void World::stepNapMinute(CharacterState& c) {
  if (!c.online || c.asleepSince < 0 || c.napUntil < 0 || c.napUntil > state_.now) return;
  wakeUp(c, false);
  notify(c.id, "sleep", "You woke up from your nap, rested.");
}

void World::stepSleepHourly() {
  if (toDateTime(state_.now).hour != content_->life().wakeHour) return;
  for (auto& [id, c] : state_.characters) {
    if (c.online && c.asleepSince >= 0) wakeUp(c, true);
  }
}

Result<Json> World::skipNight(const std::function<void(double realSeconds)>& beforeEachMinute) {
  const std::vector<CharacterId> asleep = sleepers();
  if (asleep.empty()) return fail("nobody_asleep", "nobody is asleep");
  const GameMinutes from = state_.now;
  // To the wake hour, or sooner when someone napping wakes before it.
  GameMinutes to = nextWakeAt();
  for (const auto& id : asleep) {
    const CharacterState* c = character(id);
    if (c && c->napUntil >= 0 && c->napUntil > state_.now) to = std::min(to, c->napUntil);
  }
  const double secondsPerMinute = 1.0 / content_->sim().minutesPerRealSecond;
  skipping_ = true;
  // One game minute at a time, as real time would pass it: the hook (the autopilot) acts, people walk, the minute
  // is simulated. The clock's fractional carry is left alone, so the next real tick goes on from where it was.
  while (state_.now < to) {
    if (beforeEachMinute) beforeEachMinute(secondsPerMinute);
    moveEveryone(secondsPerMinute);
    advanceMinutes(1);
  }
  skipping_ = false;
  emitPeopleChanges();
  emitRoomChanges();  // interiors (Interiors.cpp)
  return Json{{"from", from}, {"to", to}, {"minutes", to - from}, {"woke", asleep}};
}

}  // namespace livera
