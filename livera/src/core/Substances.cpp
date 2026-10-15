// Alcohol and drugs: the high, the crash, dependency and addiction, overdoses.
// data/health/substances.json; the illegal ones have fictional names.
#include <algorithm>
#include <cmath>

#include "core/Clock.h"
#include "core/World.h"

namespace livera {

namespace {
constexpr double kStatMin = 0;
constexpr double kStatMax = 100;
constexpr double kOverdoseHealthLoss = 60;
}  // namespace

Json World::takeSubstance(CharacterState& c, const std::string& substance) {
  const SubstanceDef* s = content_->substance(substance);
  if (!s) return Json::object();
  const CrimeConfig& cfg = content_->crime();
  applyNeeds(c, s->needs);
  applyEmotions(c, s->emotions);
  c.highOn = s->id;
  c.highUntil = state_.now + s->effectMinutes;
  double& dep = c.dependency[s->id];
  dep = clampd(dep + s->dependencyPerUse, kStatMin, kStatMax);
  if (!s->addiction.empty() && dep >= cfg.addictionThreshold && !findCondition(c, s->addiction))
    addCondition(c, s->addiction, false);
  auto& uses = c.recentUses[s->id];
  uses.push_back(state_.now);
  uses.erase(std::remove_if(uses.begin(), uses.end(), [&](GameMinutes t) { return state_.now - t > s->overdoseWindowMinutes; }),
             uses.end());
  Json out{{"substance", s->name}, {"until", formatDateTime(c.highUntil)}};
  if (s->overdoseUses > 0 && static_cast<int>(uses.size()) >= s->overdoseUses) {
    overdose(c, *s);
    out["overdose"] = true;
  }
  return out;
}

void World::overdose(CharacterState& c, const SubstanceDef& s) {
  const CrimeConfig& cfg = content_->crime();
  c.needs["health"] = clampd(c.needs["health"] - kOverdoseHealthLoss, kStatMin, kStatMax);
  c.recentUses[s.id].clear();
  c.highOn.clear();
  c.highUntil = -1;
  emit(presentWith(c), "incident", Json{{"character", c.id}, {"kind", "overdose"}});
  if (c.career.shiftStartedAt) (void)endShift(c.id);
  if (c.education.sessionStartedAt) (void)endStudy(c.id);
  // Rushed to the hospital; the bill follows.
  if (const LocationDef* er = content_->location(cfg.hospital)) {
    c.moveTarget.reset();
    c.moveSpeedMps = 0;
    c.inside = er->id;
    c.position = er->door;
    const Cents bill = std::min(cfg.overdoseBillCents, state_.ledger.balance(bankAccountOf(c.id)));
    if (bill > 0 && !er->revenueAccount.empty())
      (void)state_.ledger.transfer(bankAccountOf(c.id), er->revenueAccount, bill, "medical", "Emergency care: overdose", state_.now);
    notify(c.id, "health", "You overdosed on " + s.name + " and were rushed to " + er->name + ". Bill: " + formatMoney(bill) + ".");
  }
  Memory m;
  m.id = nextId("mem");
  m.owner = c.id;
  m.at = state_.now;
  m.participants = {c.id};
  m.location = c.inside;
  m.type = "overdose";
  m.importance = 85;
  m.emotionalImpact = -70;
  m.info = "Overdosed on " + s.name;
  addMemory(std::move(m));
}

void World::stepSubstancesHourly(CharacterState& c) {
  const CrimeConfig& cfg = content_->crime();
  for (auto& [id, dep] : c.dependency) {
    const SubstanceDef* s = content_->substance(id);
    if (!s) continue;
    dep = std::max(0.0, dep - s->dependencyDecayPerDay / 24.0);
    // Staying clean long enough, the addiction fades on its own.
    if (!s->addiction.empty() && dep < cfg.addictionThreshold / 2 && findCondition(c, s->addiction))
      removeCondition(c, s->addiction, "you're past the worst of it");
  }
}

}  // namespace livera
