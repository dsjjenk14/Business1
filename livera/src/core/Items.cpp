// Things people own (clothes, accessories, electronics, medicine) and getting around by bus.
// The catalog is data/items/items.json; shops sell items through offers with an "item" field.
#include <algorithm>
#include <cmath>

#include "core/Clock.h"
#include "core/World.h"

namespace livera {

namespace {
constexpr double kStatMin = 0;
constexpr double kStatMax = 100;
constexpr double kGiveRangeMeters = 3;
}  // namespace

bool World::owns(const CharacterId& id, const std::string& item) const {
  const CharacterState* c = character(id);
  if (!c) return false;
  auto it = c->inventory.find(item);
  return it != c->inventory.end() && it->second > 0;
}

bool World::unlocked(const CharacterId& id, const std::string& capability) const {
  const CharacterState* c = character(id);
  if (!c) return false;
  for (const auto& [itemId, count] : c->inventory) {
    const ItemDef* def = content_->item(itemId);
    if (count > 0 && def && std::find(def->unlocks.begin(), def->unlocks.end(), capability) != def->unlocks.end())
      return true;
  }
  return false;
}

double World::styleOf(const CharacterState& c) const {
  double style = 0;
  for (const std::string* worn : {&c.outfit, &c.accessory}) {
    if (const ItemDef* def = content_->item(*worn)) style += def->style;
  }
  return std::min(100.0, style);
}

Result<Json> World::useItem(const CharacterId& actor, const std::string& item) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  const ItemDef* def = content_->item(item);
  if (!def) return fail("unknown_item", "no such item");
  if (!owns(actor, item)) return fail("not_owned", "you don't have " + def->label);
  if (def->category == "phone" || def->category == "phone_case") return usePhoneItem(c, *def);  // Wallet.cpp
  if (def->contraception) return fail("not_usable", "it's used during intimacy");
  if (!def->usable) {
    if (!def->slot.empty()) return fail("not_usable", "put it on instead");
    return fail("not_usable", "you can't use that by itself");
  }
  auto ready = c.itemReadyAt.find(item);
  if (ready != c.itemReadyAt.end() && state_.now < ready->second) return fail("too_soon", "you just used that");
  c.itemReadyAt[item] = state_.now + def->cooldownMinutes;

  // Using where the police can see it is possession.
  if (def->illegal) {
    const SubstanceDef* sub = content_->substance(def->substance);
    const CrimeDef* crime = sub ? content_->crimeDef(sub->possessionCrime) : nullptr;
    if (crime && roll() < detectionChance(c, *crime)) {
      Json out = arrestCharacter(c, crime->id, "police");
      out["caught"] = true;
      return out;
    }
  }
  applyNeeds(c, def->needEffects);
  applyEmotions(c, def->emotionEffects);
  Json effect = def->substance.empty() ? Json() : takeSubstance(c, def->substance);
  if (def->test == "pregnancy") effect = pregnancyTest(c);
  // Medicine that shortens an illness.
  std::vector<std::string> over;
  for (auto& k : c.conditions) {
    auto it = def->shortens.find(k.id);
    if (it == def->shortens.end() || k.until < 0) continue;
    k.until = std::max(state_.now, k.until - static_cast<GameMinutes>(it->second * 60));
    if (k.until <= state_.now) over.push_back(k.id);
  }
  for (const auto& id : over) removeCondition(c, id, "you're feeling better");
  applyConditionRecovery(c, def->conditionRecovery);

  if (def->consumable && --c.inventory[item] <= 0) c.inventory.erase(item);
  Json needs = Json::object();
  for (const auto& [k, v] : def->needEffects) needs[k] = std::round(c.needs[k]);
  Json out{{"item", item}, {"label", def->label}, {"needs", needs}, {"left", c.inventory.count(item) ? c.inventory[item] : 0}};
  if (!effect.is_null()) out["effect"] = effect;
  if (Json dose = takeMedicineDose(c, *def); !dose.is_null()) out["dose"] = dose;  // m08:pets: daily dose limits (Pets.cpp)
  return out;
}

Result<Json> World::wear(const CharacterId& actor, const std::string& item) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  const ItemDef* def = content_->item(item);
  if (!def) return fail("unknown_item", "no such item");
  if (!owns(actor, item)) return fail("not_owned", "you don't have " + def->label);
  if (def->slot.empty()) return fail("not_wearable", "you can't wear that");
  (def->slot == "outfit" ? c.outfit : c.accessory) = item;
  applyEmotions(c, def->emotionEffects);
  return Json{{"outfit", c.outfit}, {"accessory", c.accessory}, {"style", std::round(styleOf(c))}};
}

Result<Json> World::takeOff(const CharacterId& actor, const std::string& slot) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  if (slot == "outfit") c.outfit.clear();
  else if (slot == "accessory") c.accessory.clear();
  else return fail("bad_request", "slot must be outfit or accessory");
  return Json{{"outfit", c.outfit}, {"accessory", c.accessory}};
}

Result<Json> World::giveItem(const CharacterId& actor, const CharacterId& target, const std::string& item) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  const ItemDef* def = content_->item(item);
  if (!def) return fail("unknown_item", "no such item");
  if (!owns(actor, item)) return fail("not_owned", "you don't have " + def->label);
  if (target == actor) return fail("invalid_target", "you already have it");
  CharacterState* t = mutableCharacter(target);
  if (!t || !t->online) return fail("target_unavailable", "they are not here");
  if (!together(c, *t, kGiveRangeMeters)) return fail("too_far", "you need to be with them");
  if (--c.inventory[item] <= 0) {
    c.inventory.erase(item);
    if (c.outfit == item) c.outfit.clear();
    if (c.accessory == item) c.accessory.clear();
  }
  t->inventory[item] += 1;
  adjustRelationship(target, actor, "friendship", 2);
  const CharacterDef* from = definition(actor);
  notify(target, "gift", (from ? from->firstName : actor) + " gave you " + def->label + ".");
  emit({target}, "gift", Json{{"from", actor}, {"item", item}, {"label", def->label}});
  return Json{{"gave", item}, {"to", target}};
}

// ---------------------------------------------------------------------------------
// Public transport
// ---------------------------------------------------------------------------------
Result<Json> World::ride(const CharacterId& actor, const std::string& toStop, bool pay) {
  return ride(actor, toStop, pay, "card");
}

Result<Json> World::ride(const CharacterId& actor, const std::string& toStop, bool pay, const std::string& payWith) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  const TransitConfig& transit = content_->transit();
  if (Status st = freeToAct(c); !st) return st.error();
  auto [line, dest] = content_->transitStop(toStop);
  if (!line) return fail("unknown_stop", "no such stop");
  if (!c.inside.empty()) return fail("inside_building", "leave the building first");
  if (c.moveTarget) return fail("busy", "you're already on your way somewhere");
  const TransitStop* from = nullptr;
  for (const auto& st : line->stops) {
    if (distance(c.position, st.at) <= transit.boardingRadiusMeters) from = &st;
  }
  if (!from) return fail("not_at_stop", "walk to a " + line->name + " stop first");
  if (from->id == dest->id) return fail("already_here", "you're already at " + dest->name);
  if (!OpeningHours{line->firstHour, line->lastHour, {}}.isOpenAt(toDateTime(state_.now).hour))
    return fail("no_service", line->name + " runs " + std::to_string(line->firstHour) + ":00 to " + std::to_string(line->lastHour) + ":00");

  Json out{{"line", line->name}, {"from", from->name}, {"to", dest->name}};
  if (pay) {
    // Card and LivPay (tap your phone, Wallet.cpp) draw from the bank; cash from your pocket.
    if (payWith != "card" && payWith != "cash" && payWith != "phone")
      return fail("invalid_payment", "pay by card, cash or phone");
    if (payWith == "phone") {
      if (Status st = phoneUsable(c); !st) return st.error();
    }
    auto tx = state_.ledger.transfer(payWith == "cash" ? cashAccountOf(actor) : bankAccountOf(actor),
                                     transit.operatorAccount, line->fareCents,
                                     payWith == "phone" ? "livpay_fare" : "fare", line->name + " fare", state_.now);
    if (!tx) return tx.error();
    out["fare_cents"] = line->fareCents;
    out["paid_with"] = payWith;
  } else if (roll() < line->inspectionChance) {
    // Caught without a ticket: fined and put off the bus.
    auto fine = state_.ledger.transfer(bankAccountOf(actor), transit.operatorAccount, line->evasionFineCents, "fine",
                                       "Fare evasion fine, " + line->name, state_.now);
    recordCrime(c, "fare_evasion", fine ? line->evasionFineCents : 0);
    notify(actor, "transit", "A fare inspector caught you without a ticket" +
                                 (fine ? ": fined " + formatMoney(line->evasionFineCents) + "." : std::string(".")));
    out["caught"] = true;
    out["fine_cents"] = fine ? line->evasionFineCents : 0;
    return out;
  } else {
    out["fare_cents"] = 0;
    out["evaded"] = true;
  }
  c.moveTarget = dest->at;
  c.moveSpeedMps = line->speedMps;
  out["eta_seconds"] = std::ceil(distance(c.position, dest->at) / line->speedMps);
  return out;
}

Json World::phoneItems(const CharacterState& c) const {
  Json items = Json::array();
  for (const auto& [id, count] : c.inventory) {
    const ItemDef* def = content_->item(id);
    if (!def || count <= 0) continue;
    items.push_back(Json{{"id", id}, {"label", def->label}, {"category", def->category}, {"count", count},
                         {"worn", c.outfit == id || c.accessory == id}, {"usable", def->usable}, {"slot", def->slot}});
  }
  return Json{{"items", items}, {"outfit", c.outfit}, {"accessory", c.accessory}, {"style", std::round(styleOf(c))}};
}

Json World::phoneTransit() const {
  Json lines = Json::array();
  for (const auto& line : content_->transit().lines) {
    Json stops = Json::array();
    for (const auto& st : line.stops) stops.push_back(Json{{"id", st.id}, {"name", st.name}, {"at", {st.at.x, st.at.y}}});
    lines.push_back(Json{{"id", line.id}, {"name", line.name}, {"fare_cents", line.fareCents},
                         {"hours", {line.firstHour, line.lastHour}}, {"stops", stops}});
  }
  return Json{{"lines", lines}};
}

}  // namespace livera
