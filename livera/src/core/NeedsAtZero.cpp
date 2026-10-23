// What happens when a need runs out (D-080, data/health/needs_at_zero.json). Energy: you pass out where you stand and
// come to hours later (out in the street, someone may go through your pockets). Hunger and health: you pass out and an
// ambulance takes you to the hospital, which keeps you and bills you. Bladder: you wet yourself (Details.cpp). The
// rest: you're told, and while the need stays at 0 it wears on your feelings and on how people take you. Every time a
// need hits 0 counts; enough of them close together bring one of the made-up illnesses in
// data/health/zero_conditions.json (from_zero). Out cold or kept in the hospital, your needs are on hold and you can't
// act (freeToAct); your phone still works in the hospital.
#include <algorithm>
#include <cmath>
#include <cstdio>

#include "core/Clock.h"
#include "core/World.h"

namespace livera {

namespace {

constexpr double kStatMin = 0;

void replaceAll(std::string& s, const std::string& from, const std::string& to) {
  for (std::size_t at = s.find(from); at != std::string::npos; at = s.find(from, at + to.size())) s.replace(at, from.size(), to);
}

std::string clockTime(GameMinutes t) {
  const DateTime d = toDateTime(t);
  char buf[8];
  std::snprintf(buf, sizeof buf, "%02d:%02d", d.hour, d.minute);
  return buf;
}

}  // namespace

bool World::outCold(const CharacterState& c) const {
  return c.passedOutUntil > state_.now || c.admittedUntil > state_.now;
}

std::string World::zeroText(const std::string& text, const ZeroRuleDef* rule, const std::string& where) const {
  const NeedsAtZeroConfig& Z = content_->needsAtZero();
  std::string out = text;
  const LocationDef* er = content_->location(Z.hospital);
  replaceAll(out, "{hospital}", er ? er->name : "the hospital");
  const double hours = rule && rule->rule == "hospital" ? rule->hours : Z.passOutHours;
  replaceAll(out, "{hours}", std::to_string(std::lround(hours)));
  replaceAll(out, "{bill}", formatMoney(rule ? rule->billCents : 0));
  replaceAll(out, "{where}", where);
  return out;
}

void World::stepNeedsAtZero(CharacterState& c) {
  const NeedsAtZeroConfig& Z = content_->needsAtZero();
  for (const auto& n : content_->sim().needs) {
    const ZeroRuleDef* rule = Z.rule(n.id);
    if (!rule || rule->rule == "accident") continue;  // bladder: wetYourself counts it (Life.cpp)
    const double v = c.needs[n.id];
    if (v > kStatMin) {
      if (v > Z.rearmAbove) c.atZero.erase(n.id);
      continue;
    }
    // Staying at 0 wears on you, every minute.
    StatMap feel, wear;
    for (const auto& [e, perHour] : rule->emotionsPerHour) feel[e] = perHour / 60.0;
    for (const auto& [k, perHour] : rule->needsPerHour) {
      if (k != n.id) wear[k] = perHour / 60.0;
    }
    applyEmotions(c, feel);
    applyNeeds(c, wear);
    if (!c.atZero.insert(n.id).second) continue;  // this time is already counted
    countZero(c, n.id);
    if (rule->rule == "pass_out") { passOut(c); return; }
    if (rule->rule == "hospital") { admitToHospital(c, *rule); return; }
    notify(c.id, "health", zeroText(rule->text, rule));
    if (!rule->condition.empty()) addCondition(c, rule->condition, true);
  }
}

void World::countZero(CharacterState& c, const std::string& need) {
  if (content_->needsAtZero().rules.empty()) return;  // a world without the rules (needs_at_zero.json) counts nothing
  auto& times = c.zeroTimes[need];
  times.push_back(state_.now);
  double longest = 0;
  for (const auto& [id, d] : content_->conditions()) {
    if (d.fromZeroNeed == need) longest = std::max(longest, d.fromZeroWithinDays);
  }
  const auto window = static_cast<GameMinutes>(longest * kMinutesPerDay);
  times.erase(std::remove_if(times.begin(), times.end(), [&](GameMinutes t) { return state_.now - t > window; }), times.end());
  for (const auto& [id, d] : content_->conditions()) {
    if (d.fromZeroNeed != need || findCondition(c, id)) continue;
    const auto within = static_cast<GameMinutes>(d.fromZeroWithinDays * kMinutesPerDay);
    const auto recent = std::count_if(times.begin(), times.end(), [&](GameMinutes t) { return state_.now - t <= within; });
    if (recent < d.fromZeroTimes) continue;
    addCondition(c, id, true);  // tells you (its onset)
    times.clear();              // the count starts again
    return;
  }
}

void World::passOut(CharacterState& c) {
  const NeedsAtZeroConfig& Z = content_->needsAtZero();
  const ZeroRuleDef* rule = Z.rule("energy");
  const LocationDef* here = c.inside.empty() ? nullptr : content_->location(c.inside);
  const std::vector<CharacterId> onlookers = presentWith(c, content_->sim().hearingRangeMeters);
  if (c.career.shiftStartedAt) (void)endShift(c.id);
  if (c.education.sessionStartedAt) (void)endStudy(c.id);
  c.moveTarget.reset();
  c.moveSpeedMps = 0;
  c.passedOutUntil = state_.now + static_cast<GameMinutes>(std::lround(Z.passOutHours * 60));
  applyEmotions(c, Z.passOutEmotions);
  std::string text = zeroText(rule && !rule->text.empty() ? rule->text : "You passed out{where}.", rule,
                              here ? " at " + here->name : " in the street");
  // Out cold in the street: someone may go through your pockets. The cash goes to the outside world.
  if (c.inside.empty() && Z.robberyMaxCashCents > 0 && roll() < Z.robberyChanceOutdoors) {
    const Cents cash = state_.ledger.balance(cashAccountOf(c.id));
    const Cents taken = std::min(cash, static_cast<Cents>(std::llround(static_cast<double>(Z.robberyMaxCashCents) * (0.4 + 0.6 * roll()))));
    if (taken > 0 && state_.ledger.transfer(cashAccountOf(c.id), kEconomyAccount, taken, "theft", "Robbed while passed out", state_.now))
      text += " Someone went through your pockets while you were out: " + formatMoney(taken) + " of your cash is gone.";
  }
  text += " You'll come to around " + clockTime(c.passedOutUntil) + ".";
  notify(c.id, "health", text);
  const CharacterDef* def = definition(c.id);
  const std::string name = def ? def->firstName : c.id;
  for (const auto& id : onlookers) notify(id, "social", name + " passed out" + (here ? " at " + here->name : " in the street") + ".");
  std::vector<CharacterId> told = onlookers;
  told.push_back(c.id);
  emit(told, "incident", Json{{"character", c.id}, {"kind", "passed_out"}, {"until", c.passedOutUntil}});
  Memory m;
  m.id = nextId("mem");
  m.owner = c.id;
  m.at = state_.now;
  m.participants = {c.id};
  m.location = c.inside;
  m.type = "passed_out";
  m.importance = 60;
  m.emotionalImpact = -40;
  m.info = "Passed out from exhaustion";
  addMemory(std::move(m));
}

void World::admitToHospital(CharacterState& c, const ZeroRuleDef& rule) {
  const NeedsAtZeroConfig& Z = content_->needsAtZero();
  const LocationDef* er = content_->location(Z.hospital);
  if (!er) return;  // validated: it exists
  const LocationDef* here = c.inside.empty() ? nullptr : content_->location(c.inside);
  const std::vector<CharacterId> onlookers = presentWith(c, content_->sim().hearingRangeMeters);
  const CharacterDef* def = definition(c.id);
  const std::string name = def ? def->firstName : c.id;
  for (const auto& id : onlookers)
    notify(id, "social", name + " collapsed" + (here ? " at " + here->name : " in the street") + ". An ambulance took them to " + er->name + ".");
  emit(onlookers, "incident", Json{{"character", c.id}, {"kind", "collapsed"}});
  if (c.career.shiftStartedAt) (void)endShift(c.id);
  if (c.education.sessionStartedAt) (void)endStudy(c.id);
  if (c.asleepSince >= 0) c.asleepSince = -1;
  c.moveTarget.reset();
  c.moveSpeedMps = 0;
  c.inside = er->id;
  c.position = er->door;
  (void)takeRoomSpot(c, [](const InteriorSpotDef& s) { return s.kind == "bed"; });  // interiors: into a bed, if it has one
  c.admittedUntil = state_.now + static_cast<GameMinutes>(std::lround(rule.hours * 60));
  c.admittedFor = rule.need;
  // Stabilised on arrival: the drip, the monitors. Needs then wait while you're kept in.
  for (const auto& [n, v] : rule.after) c.needs[n] = std::max(c.needs[n], v);
  const Cents bill = std::min(rule.billCents, state_.ledger.balance(bankAccountOf(c.id)));
  if (bill > 0) (void)state_.ledger.transfer(bankAccountOf(c.id), er->revenueAccount, bill, "medical", "Emergency care: " + rule.need, state_.now);
  std::string text = zeroText(rule.text, &rule);
  if (bill < rule.billCents) text += " You only had " + formatMoney(bill) + " in the bank, so that's what they took.";
  notify(c.id, "health", text);
  emit({c.id}, "incident", Json{{"character", c.id}, {"kind", "hospital"}, {"need", rule.need}, {"until", c.admittedUntil}});
  Memory m;
  m.id = nextId("mem");
  m.owner = c.id;
  m.at = state_.now;
  m.participants = {c.id};
  m.location = er->id;
  m.type = "hospital";
  m.importance = 70;
  m.emotionalImpact = -50;
  m.info = rule.need == "hunger" ? "Passed out from hunger and woke up in the hospital" : "Collapsed and was taken to the hospital";
  addMemory(std::move(m));
}

void World::stepOutColdMinute(CharacterState& c) {
  const NeedsAtZeroConfig& Z = content_->needsAtZero();
  if (c.passedOutUntil >= 0 && c.passedOutUntil <= state_.now) {
    c.passedOutUntil = -1;
    c.needs["energy"] = std::max(c.needs["energy"], Z.energyAfterPassOut);
    notify(c.id, "health", "You came to. You're groggy, but you can get up. Eat, rest and look after yourself.");
    emit({c.id}, "incident", Json{{"character", c.id}, {"kind", "came_to"}});
  }
  if (c.admittedUntil >= 0 && c.admittedUntil <= state_.now) {
    c.admittedUntil = -1;
    c.admittedFor.clear();
    const LocationDef* er = content_->location(Z.hospital);
    notify(c.id, "health", "You've been discharged from " + (er ? er->name : std::string("the hospital")) + ". Take it easy.");
    emit({c.id}, "incident", Json{{"character", c.id}, {"kind", "discharged"}});
  }
}

double World::zeroReceptivity(const CharacterState& c) const {
  double r = 1.0;
  for (const auto& need : c.atZero) {
    const ZeroRuleDef* rule = content_->needsAtZero().rule(need);
    const auto it = c.needs.find(need);
    if (rule && it != c.needs.end() && it->second <= kStatMin) r *= rule->receptivity;
  }
  return r;
}

}  // namespace livera
