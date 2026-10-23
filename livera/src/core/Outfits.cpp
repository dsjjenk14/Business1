// Everyone's own three looks (D-079): everyday, work and going-out clothes that every character always owns, and
// which clothes someone is seen in. The looks are the personal items in data/items/items.json (worn, washed and soiled
// like any outfit: Items.cpp, Details.cpp); what each one is on a person is their profile.appearance.outfits, with
// `drawn`, the look their art shows. An empty outfit keeps meaning "the clothes they're drawn in".
#include <algorithm>
#include <map>

#include "core/World.h"

namespace livera {

namespace {

bool isLook(const std::string& s) { return std::find(kOutfitLooks.begin(), kOutfitLooks.end(), s) != kOutfitLooks.end(); }

// profile.appearance.outfits, or null (someone made in the creator has none).
const Json* outfitsOf(const CharacterDef* def) {
  if (!def || !def->profile.is_object()) return nullptr;
  auto a = def->profile.find("appearance");
  if (a == def->profile.end() || !a->is_object()) return nullptr;
  auto o = a->find("outfits");
  return o != a->end() && o->is_object() ? &*o : nullptr;
}

std::string text(const Json* o, const std::string& key) {
  if (!o) return "";
  auto it = o->find(key);
  return it != o->end() && it->is_string() ? it->get<std::string>() : std::string();
}

}  // namespace

// ---- Content ---------------------------------------------------------------------------------
const ItemDef* ContentDatabase::personalItem(const std::string& look) const {
  for (const auto& [id, it] : items_) {
    if (it.personal && it.look == look) return &it;
  }
  return nullptr;
}

Status ContentDatabase::validateOutfits() const {
  std::map<std::string, int> perLook;
  for (const auto& [id, it] : items_) {
    const std::string where = "item " + id;
    if (!it.look.empty() && !it.personal) return fail("content_invalid", where + ": look is only for personal items");
    if (!it.personal) continue;
    if (it.slot != "outfit") return fail("content_invalid", where + ": a personal item is an outfit (slot outfit)");
    if (!isLook(it.look)) return fail("content_invalid", where + ": a personal item's look is everyday, work or evening");
    if (it.usable || it.consumable || it.illegal || it.contraception || !it.substance.empty() || !it.test.empty() ||
        !it.unlocks.empty())
      return fail("content_invalid", where + ": a personal item is clothes: nothing to use, use up or unlock");
    if (it.description.empty())
      return fail("content_invalid", where + ": a personal item needs a description (for someone whose data has none)");
    ++perLook[it.look];
  }
  if (perLook.empty()) return okStatus();  // a world without personal looks (a test's minimal content)
  for (const auto& look : kOutfitLooks) {
    if (perLook[look] != 1)
      return fail("content_invalid", "personal items: the " + look + " look needs exactly one item, not " +
                                         std::to_string(perLook[look]));
  }
  // Nobody sells, stocks or uses up what everyone already owns.
  const auto personal = [&](const std::string& item) {
    const ItemDef* it = this->item(item);
    return it && it->personal;
  };
  for (const auto& [id, l] : locations_) {
    for (const auto& o : l.offers) {
      if (personal(o.item))
        return fail("content_invalid", "location " + id + " offer " + o.id + ": " + o.item + " is a personal item, never sold");
    }
  }
  for (const auto& e : wallet_.coinShop) {
    if (personal(e.item)) return fail("content_invalid", "coin_shop item '" + e.item + "' is a personal item, never sold");
  }
  for (const auto& a : pets_.actions) {
    if (personal(a.usesItem)) return fail("content_invalid", "pet action " + a.id + ": uses a personal item");
  }
  // Everyone in data says what their three looks are, and which one their art shows.
  for (const auto& [id, c] : characters_) {
    const std::string where = "character " + id + " profile.appearance.outfits";
    const Json* o = outfitsOf(&c);
    if (!o) return fail("content_invalid", where + ": missing (everyday, work, evening and drawn)");
    for (const auto& [key, v] : o->items()) {
      if (key == "drawn") {
        if (!v.is_string() || !isLook(v.get<std::string>()))
          return fail("content_invalid", where + ".drawn: the look their art shows, everyday, work or evening");
      } else if (!isLook(key)) {
        return fail("content_invalid", where + ": unknown look '" + key + "'");
      } else if (!v.is_string() || v.get<std::string>().empty()) {
        return fail("content_invalid", where + "." + key + ": the garments, as text");
      }
    }
    for (const auto& look : kOutfitLooks) {
      if (!o->contains(look)) return fail("content_invalid", where + ": no " + look + " look");
    }
    if (!o->contains("drawn")) return fail("content_invalid", where + ": no drawn (the look their art shows)");
  }
  return okStatus();
}

// ---- Who wears what --------------------------------------------------------------------------
std::string World::drawnLook(const CharacterId& id) const {
  const std::string drawn = text(outfitsOf(definition(id)), "drawn");
  return isLook(drawn) ? drawn : "everyday";
}

WornLook World::wornLook(const CharacterState& c) const {
  if (c.outfit.empty()) return {drawnLook(c.id), ""};
  const ItemDef* def = content_->item(c.outfit);
  if (def && def->personal) return {def->look, ""};
  return {"other", def ? def->label : c.outfit};
}

void World::addLook(const CharacterState& c, Json& out) const {
  const WornLook w = wornLook(c);
  out["look"] = w.look;
  if (!w.label.empty()) out["look_label"] = w.label;
}

// Changing clothes takes a moment where you stand: not in a cell or a fight (freeToAct), not while walking or riding.
Status World::changingAllowed(const CharacterState& c, const std::string& slot) const {
  if (Status st = freeToAct(c); !st) return st;
  if (slot == "outfit" && c.moveTarget && c.inside.empty()) {
    if (c.moveSpeedMps > 0) return fail("riding", "you're on the bus: change when you get off");
    return fail("walking", "stop walking first: you can't change clothes on the move");
  }
  return okStatus();
}

// Your three looks for the Items app and the wardrobe: what each one is on you, whether it's what people see you in
// (with nothing chosen, that's your drawn look) and its condition. Only ever your own (a phone app).
Json World::phoneLooks(const CharacterState& c) const {
  const Json* mine = outfitsOf(definition(c.id));
  const std::string drawn = drawnLook(c.id), worn = wornLook(c).look;
  Json looks = Json::array();
  for (const auto& look : kOutfitLooks) {
    const ItemDef* def = content_->personalItem(look);
    if (!def) continue;
    const std::string garments = text(mine, look);
    looks.push_back(Json{{"look", look},
                         {"item", def->id},
                         {"label", def->label},
                         {"garments", garments.empty() ? def->description : garments},
                         {"wearing", worn == look},
                         {"chosen", c.outfit == def->id},
                         {"drawn", look == drawn},
                         {"condition", clothesCondition(c, def->id)}});
  }
  return looks;
}

}  // namespace livera
