// Fame: performances, releases, weddings and headlines make you known. Fame fades without
// new reasons. Celebrities turn heads when they walk in, and strangers warm to them faster.
// Tiers and rates are data/society/fame.json.
#include <algorithm>
#include <cmath>

#include "core/World.h"

namespace livera {

std::string World::fameTierOf(const CharacterId& id) const {
  const CharacterState* c = character(id);
  std::string tier;
  for (const auto& t : content_->fame().tiers) {
    if (c && c->fame >= t.minFame) tier = t.label;
  }
  return tier;
}

void World::addFame(CharacterState& c, double amount) {
  if (amount <= 0) return;
  const std::string before = fameTierOf(c.id);
  c.fame = std::min(100.0, c.fame + amount);
  const std::string after = fameTierOf(c.id);
  if (after != before) notify(c.id, "fame", "People know your name now: " + after + ".");
}

void World::stepFameHourly(CharacterState& c) { c.fame = std::max(0.0, c.fame - content_->fame().decayPerDay / 24.0); }

Json World::phoneFame(const CharacterState& c) const {
  Json out{{"fame", std::round(c.fame * 10) / 10}, {"tier", fameTierOf(c.id)}};
  for (const auto& t : content_->fame().tiers) {
    if (t.minFame > c.fame) {
      out["next_tier"] = Json{{"label", t.label}, {"at", t.minFame}};
      break;
    }
  }
  return out;
}

}  // namespace livera
