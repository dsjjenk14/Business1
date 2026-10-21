// Rooms you walk around in (D-066). A place whose interior is in data (data/interiors/<id>.json) has a room traced
// from its picture: the walkable floor, the furniture on it and the spots people take. Everyone inside has a point
// in that room and maybe a spot; the server decides both, so two people never hold one seat. Where someone is in a
// room is session state, like the people stream: never saved, and on connect, on load and on coming in you stand at
// the entrance.

#include <algorithm>
#include <cmath>
#include <set>

#include "core/ContentParse.h"
#include "core/World.h"

namespace livera {

using namespace content_parse;

namespace {

const std::set<std::string> kSpotKinds = {"seat",    "sofa",  "bed",     "stool", "counter",
                                          "station", "stage", "fixture", "door"};
const std::set<std::string> kFacings = {"n", "e", "s", "w"};
// Kinds you stand at on the open floor; the others are on furniture (a chair, the stage) or in a doorway, and only
// have to be in the room.
const std::set<std::string> kFloorKinds = {"counter", "station", "fixture"};
constexpr double kMaxImageSide = 8192;

// Even-odd rule: whether p is inside the polygon.
bool inPolygon(const std::vector<Vec2>& poly, Vec2 p) {
  bool in = false;
  for (std::size_t i = 0, j = poly.size() - 1; i < poly.size(); j = i++) {
    const Vec2 a = poly[i], b = poly[j];
    if ((a.y > p.y) != (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) in = !in;
  }
  return in;
}

std::vector<Vec2> readPoly(const Json& j) {
  std::vector<Vec2> out;
  for (const auto& p : j) out.push_back(readVec2(p));
  return out;
}

Json pt(Vec2 p) { return Json::array({std::round(p.x * 10) / 10, std::round(p.y * 10) / 10}); }

Json polyJson(const std::vector<Vec2>& poly) {
  Json out = Json::array();
  for (const auto& p : poly) out.push_back(pt(p));
  return out;
}

// What a client needs to draw the room and offer its spots: all of it is content, public like a price.
Json interiorJson(const InteriorDef& room) {
  Json floor = Json::array();
  for (const auto& poly : room.floor) floor.push_back(polyJson(poly));
  Json blocked = Json::array();
  for (const auto& b : room.blocked)
    blocked.push_back(Json{{"label", b.label}, {"poly", polyJson(b.poly)}, {"height", b.height}});
  Json spots = Json::array();
  for (const auto& s : room.spots) {
    Json j{{"id", s.id}, {"kind", s.kind}, {"at", pt(s.at)}, {"facing", s.facing}, {"label", s.label}};
    if (!s.activity.empty()) j["activity"] = s.activity;
    if (s.offersAll) j["offers"] = true;
    else if (!s.offers.empty()) j["offers"] = s.offers;
    if (s.staff) j["staff"] = true;
    spots.push_back(std::move(j));
  }
  return Json{{"id", room.id},
              {"size", Json::array({room.width, room.height})},
              {"person_px", room.personPx},
              {"floor", floor},
              {"blocked", blocked},
              {"entrance", Json{{"at", pt(room.entrance)}, {"facing", room.entranceFacing}}},
              {"spots", spots}};
}

Json placeJson(const RoomPlace& rp) {
  return Json{{"at", pt(rp.at)}, {"spot", rp.spot.empty() ? Json() : Json(rp.spot)}};
}

// The walkable point nearest to `p`, looking outward in rings; `p` itself when nothing is found.
Vec2 nearestWalkable(const InteriorDef& room, Vec2 p, const std::vector<Vec2>& avoid = {}, double clearance = 0) {
  auto ok = [&](Vec2 q) {
    if (!room.walkable(q)) return false;
    return std::none_of(avoid.begin(), avoid.end(), [&](Vec2 o) { return distance(o, q) < clearance; });
  };
  if (ok(p)) return p;
  const double step = std::max(4.0, room.personPx / 20);
  for (double r = step; r <= room.personPx * 2.5; r += step) {
    for (int k = 0; k < 16; ++k) {
      const double a = k * 3.14159265358979 / 8;
      // Flattened 2:1 like the floor itself, so "near" means near on the floor.
      const Vec2 q{p.x + r * std::cos(a), p.y + r * 0.5 * std::sin(a)};
      if (ok(q)) return q;
    }
  }
  return p;
}

}  // namespace

// ---------------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------------
bool InteriorDef::onFloor(Vec2 p) const {
  return std::any_of(floor.begin(), floor.end(), [&](const auto& poly) { return inPolygon(poly, p); });
}

bool InteriorDef::servedAt(const InteriorSpotDef& s, const std::string& offer) const {
  const auto named = [&](const InteriorSpotDef& x) {
    return std::find(x.offers.begin(), x.offers.end(), offer) != x.offers.end();
  };
  if (named(s)) return true;
  return s.offersAll && std::none_of(spots.begin(), spots.end(), named);
}

bool InteriorDef::walkable(Vec2 p) const {
  return onFloor(p) &&
         std::none_of(blocked.begin(), blocked.end(), [&](const auto& b) { return inPolygon(b.poly, p); });
}

const InteriorSpotDef* InteriorDef::spot(const std::string& spotId) const {
  for (const auto& s : spots) {
    if (s.id == spotId) return &s;
  }
  return nullptr;
}

const InteriorDef* ContentDatabase::interiorFor(const LocationId& place) const {
  auto it = interiorByPlace_.find(place);
  return it == interiorByPlace_.end() ? nullptr : &interiors_.at(it->second);
}

Status ContentDatabase::ingestInteriors(const std::string& source, const std::string& section, const Json& body,
                                       bool& handled) {
  handled = section == "interior";
  if (!handled) return okStatus();
  try {
    InteriorDef r;
    r.id = body.at("id").get<std::string>();
    r.places = readStrings(body, "places");
    r.width = body.at("size").at(0).get<double>();
    r.height = body.at("size").at(1).get<double>();
    r.personPx = body.value("person_px", r.personPx);
    for (const auto& poly : body.at("floor")) r.floor.push_back(readPoly(poly));
    for (const auto& b : body.value("blocked", Json::array()))
      r.blocked.push_back(InteriorBlockDef{b.value("label", ""), readPoly(b.at("poly")), b.value("height", 0.0)});
    r.entrance = readVec2(body.at("entrance").at("at"));
    r.entranceFacing = body.at("entrance").at("facing").get<std::string>();
    for (const auto& j : body.at("spots")) {
      InteriorSpotDef s;
      s.id = j.at("id").get<std::string>();
      s.kind = j.at("kind").get<std::string>();
      s.at = readVec2(j.at("at"));
      s.facing = j.at("facing").get<std::string>();
      s.label = j.at("label").get<std::string>();
      s.activity = j.value("activity", "");
      if (j.contains("offers")) {
        if (j.at("offers").is_boolean()) s.offersAll = j.at("offers").get<bool>();
        else s.offers = readStrings(j, "offers");
      }
      s.staff = j.value("staff", false);
      r.spots.push_back(std::move(s));
    }
    for (const auto& place : r.places) {
      if (!interiorByPlace_.emplace(place, r.id).second) return fail("content_duplicate", place + " has two interiors");
    }
    const std::string id = r.id;  // not r.id: the argument after it moves r
    return insertUnique(interiors_, "interior", id, std::move(r));
  } catch (const std::exception& e) {
    return fail("content_invalid", source + ": interior: " + e.what());
  }
}

Status ContentDatabase::validateInteriors() const {
  for (const auto& [id, r] : interiors_) {
    const std::string where = "interior " + id;
    auto bad = [&](const std::string& why) { return fail("content_invalid", where + ": " + why); };
    // The id names the picture's file on every client.
    const auto idChar = [](char ch) { return (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '_'; };
    if (id.empty() || !std::all_of(id.begin(), id.end(), idChar))
      return bad("id must be lowercase letters, digits and _");
    if (!(r.width > 0 && r.height > 0 && r.width <= kMaxImageSide && r.height <= kMaxImageSide))
      return bad("size must be the picture's [width, height]");
    if (!(r.personPx > 0 && r.personPx < r.height)) return bad("person_px must be a person's height in the picture");
    auto inImage = [&](Vec2 p) { return p.x >= 0 && p.y >= 0 && p.x <= r.width && p.y <= r.height; };
    if (r.floor.empty()) return bad("no floor");
    for (const auto& poly : r.floor) {
      if (poly.size() < 3) return bad("a floor polygon needs at least 3 points");
      if (!std::all_of(poly.begin(), poly.end(), inImage)) return bad("the floor goes outside the picture");
    }
    for (const auto& b : r.blocked) {
      if (b.poly.size() < 3) return bad("furniture '" + b.label + "' needs at least 3 points");
      if (!std::all_of(b.poly.begin(), b.poly.end(), inImage))
        return bad("furniture '" + b.label + "' is outside the picture");
      if (b.height < 0) return bad("furniture '" + b.label + "' has a negative height");
    }
    if (!kFacings.count(r.entranceFacing)) return bad("entrance facing must be n, e, s or w");
    if (!r.walkable(r.entrance)) return bad("the entrance must be on the open floor");
    if (r.places.empty()) return bad("names no places");
    std::set<std::string> spotIds;
    for (const auto& s : r.spots) {
      const std::string at = "spot " + s.id;
      if (s.id.empty() || !spotIds.insert(s.id).second) return fail("content_duplicate", where + ": duplicate " + at);
      if (!kSpotKinds.count(s.kind)) return bad(at + ": unknown kind '" + s.kind + "'");
      if (!kFacings.count(s.facing)) return bad(at + ": facing must be n, e, s or w");
      if (s.label.empty()) return bad(at + " has no label");
      if (!inImage(s.at) || !r.onFloor(s.at)) return bad(at + " is not in the room");
      if (kFloorKinds.count(s.kind) && !r.walkable(s.at))
        return bad(at + " (" + s.kind + ") must be on the open floor");
      if ((s.offersAll || !s.offers.empty()) && s.kind != "counter" && !s.isSeat())
        return bad(at + ": offers are sold at a counter or served at a seat");
      if (s.staff && s.kind != "station" && s.kind != "counter" && !s.isSeat())
        return bad(at + ": staff work at a station, a counter or a seat");
    }
    for (const auto& placeId : r.places) {
      const LocationDef* loc = location(placeId);
      if (!loc) return bad("unknown place '" + placeId + "'");
      if (!loc->enterable) return bad(placeId + " is not a place you go inside");
      for (const auto& s : r.spots) {
        if (!s.activity.empty() &&
            std::none_of(loc->activities.begin(), loc->activities.end(),
                         [&](const Activity& a) { return a.id == s.activity; }))
          return bad("spot " + s.id + ": " + placeId + " has no activity '" + s.activity + "'");
        for (const auto& o : s.offers) {
          if (std::none_of(loc->offers.begin(), loc->offers.end(), [&](const Offer& x) { return x.id == o; }))
            return bad("spot " + s.id + ": " + placeId + " doesn't sell '" + o + "'");
        }
      }
      // A room is the whole place: everything it offers happens somewhere in it, and there's a way out.
      auto has = [&](auto pred) { return std::any_of(r.spots.begin(), r.spots.end(), pred); };
      for (const auto& a : loc->activities) {
        if (!has([&](const InteriorSpotDef& s) { return s.activity == a.id; }))
          return bad(placeId + "'s activity '" + a.id + "' has no spot");
      }
      for (const auto& o : loc->offers) {
        if (!has([&](const InteriorSpotDef& s) { return s.sells(o.id); }))
          return bad(placeId + "'s offer '" + o.id + "' has no counter or seat");
      }
      if (loc->stage && !has([](const InteriorSpotDef& s) { return s.kind == "stage"; }))
        return bad(placeId + " is a stage but the room has none");
      if (!has([](const InteriorSpotDef& s) { return s.kind == "door" && s.activity.empty(); }))
        return bad("no door out (a door spot with no activity)");
    }
  }
  return okStatus();
}

// ---------------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------------
std::optional<RoomPlace> World::roomPlaceOf(const CharacterId& id) const {
  const CharacterState* c = character(id);
  if (!c || !c->online || c->inside.empty()) return std::nullopt;
  const InteriorDef* room = content_->interiorFor(c->inside);
  if (!room) return std::nullopt;
  auto it = rooms_.find(id);
  if (it != rooms_.end() && it->second.place == c->inside) return it->second;
  return RoomPlace{c->inside, room->entrance, ""};
}

void World::resetRoomPlace(const CharacterId& id) { rooms_.erase(id); }

namespace {

// Who holds a spot of a place's room right now ("" = nobody). Entries of people who left are ignored, so a seat is
// free the moment its holder is gone, before the tick tidies up.
template <class PlaceOf>
CharacterId holderOf(const std::map<CharacterId, RoomPlace>& rooms, const LocationId& place, const std::string& spot,
                     PlaceOf placeOf) {
  for (const auto& [id, rp] : rooms) {
    if (rp.place != place || rp.spot != spot) continue;
    const auto now = placeOf(id);
    if (now && now->place == place && now->spot == spot) return id;
  }
  return "";
}

}  // namespace

Result<Json> World::moveInside(const CharacterId& actor, Vec2 at) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  if (Status st = freeToAct(c); !st) return st.error();
  if (c.inside.empty()) return fail("not_inside", "you're outdoors; go inside somewhere first");
  const InteriorDef* room = content_->interiorFor(c.inside);
  if (!room) return fail("no_room", "there's no room to walk around in here yet");
  if (!std::isfinite(at.x) || !std::isfinite(at.y) || !room->walkable(at))
    return fail("off_floor", "you can't stand there: that's not open floor");
  rooms_[actor] = RoomPlace{c.inside, at, ""};
  return placeJson(rooms_[actor]);
}

Result<Json> World::sit(const CharacterId& actor, const std::string& spotId) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  if (Status st = freeToAct(c); !st) return st.error();
  if (c.inside.empty()) return fail("not_inside", "you're outdoors; go inside somewhere first");
  const InteriorDef* room = content_->interiorFor(c.inside);
  if (!room) return fail("no_room", "there's no room to walk around in here yet");
  const InteriorSpotDef* s = room->spot(spotId);
  if (!s) return fail("no_such_spot", "there's no such seat here");
  if (!s->isSeat()) return fail("not_a_seat", s->label + " isn't somewhere to sit");
  const CharacterId holder = holderOf(rooms_, c.inside, s->id, [&](const CharacterId& id) { return roomPlaceOf(id); });
  if (!holder.empty() && holder != actor) return fail("spot_taken", "someone is already sitting there");
  rooms_[actor] = RoomPlace{c.inside, s->at, s->id};
  Json out = placeJson(rooms_[actor]);
  out["label"] = s->label;
  return out;
}

Result<Json> World::stand(const CharacterId& actor) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  if (Status st = freeToAct(c); !st) return st.error();
  if (c.inside.empty()) return fail("not_inside", "you're outdoors; go inside somewhere first");
  const InteriorDef* room = content_->interiorFor(c.inside);
  if (!room) return fail("no_room", "there's no room to walk around in here yet");
  const RoomPlace now = *roomPlaceOf(actor);
  // A seat's point is on its furniture: you get up onto the floor next to it.
  rooms_[actor] = RoomPlace{c.inside, now.spot.empty() ? now.at : nearestWalkable(*room, now.at), ""};
  return placeJson(rooms_[actor]);
}

Json World::takeRoomSpot(CharacterState& c, const std::function<bool(const InteriorSpotDef&)>& serves) {
  const InteriorDef* room = c.inside.empty() ? nullptr : content_->interiorFor(c.inside);
  if (!room || !c.online) return Json();
  const RoomPlace now = *roomPlaceOf(c.id);
  if (const InteriorSpotDef* held = now.spot.empty() ? nullptr : room->spot(now.spot); held && serves(*held))
    return placeJson(now);
  auto placeOf = [&](const CharacterId& id) { return roomPlaceOf(id); };
  // The free spot that serves it nearest to where you are, else you wait beside the nearest taken one.
  const InteriorSpotDef* freeSpot = nullptr;
  const InteriorSpotDef* takenSpot = nullptr;
  for (const auto& s : room->spots) {
    if (!serves(s)) continue;
    const bool free = holderOf(rooms_, c.inside, s.id, placeOf).empty();
    const InteriorSpotDef*& best = free ? freeSpot : takenSpot;
    if (!best || distance(now.at, s.at) < distance(now.at, best->at)) best = &s;
  }
  if (freeSpot) {
    rooms_[c.id] = RoomPlace{c.inside, freeSpot->at, freeSpot->id};
  } else if (takenSpot) {
    std::vector<Vec2> others;
    for (const auto& [id, o] : state_.characters) {
      if (id == c.id || !o.online || o.inside != c.inside) continue;
      if (const auto p = roomPlaceOf(id)) others.push_back(p->at);
    }
    rooms_[c.id] = RoomPlace{c.inside, nearestWalkable(*room, takenSpot->at, others, room->personPx * 0.3), ""};
  } else {
    return Json();
  }
  return placeJson(rooms_[c.id]);
}

Json World::roomView(const CharacterState& viewer) const {
  const InteriorDef* room = viewer.inside.empty() ? nullptr : content_->interiorFor(viewer.inside);
  if (!room) return Json();
  Json people = Json::array();
  for (const auto& [id, o] : state_.characters) {
    if (!o.online || o.inside != viewer.inside) continue;
    const auto rp = roomPlaceOf(id);
    if (!rp) continue;
    Json p = placeJson(*rp);
    p["id"] = id;
    people.push_back(std::move(p));
  }
  return Json{{"interior", interiorJson(*room)}, {"people", people}};
}

void World::emitRoomChanges() {
  // Forget whoever left the room they were in (a seat frees with them), and put whoever came in at the entrance.
  std::erase_if(rooms_, [&](const auto& kv) {
    const CharacterState* c = character(kv.first);
    return !c || !c->online || c->inside != kv.second.place;
  });
  for (const auto& [id, c] : state_.characters) {
    if (!c.online || c.inside.empty() || rooms_.count(id)) continue;
    if (const InteriorDef* room = content_->interiorFor(c.inside)) rooms_[id] = RoomPlace{c.inside, room->entrance, ""};
  }
  std::erase_if(roomSeen_, [&](const auto& kv) {
    const CharacterState* v = character(kv.first);
    return !v || !v->online || v->inside.empty() || !content_->interiorFor(v->inside);
  });
  // Once a tick, to each person in a room, what changed there: who arrived, moved, sat, stood up or left.
  for (const auto& [viewerId, viewer] : state_.characters) {
    if (!viewer.online || viewer.inside.empty()) continue;
    const InteriorDef* room = content_->interiorFor(viewer.inside);
    if (!room) continue;
    auto& seen = roomSeen_[viewerId];
    if (!seen.empty() && seen.begin()->second.place != viewer.inside) seen.clear();  // a different room now
    Json changes = Json::array();
    std::set<CharacterId> present;
    for (const auto& [id, o] : state_.characters) {
      if (!o.online || o.inside != viewer.inside) continue;
      present.insert(id);
      const RoomPlace& now = rooms_.at(id);
      auto it = seen.find(id);
      if (it != seen.end() && it->second == now) continue;
      Json entry = placeJson(now);
      entry["character"] = id;
      entry["state"] = "here";
      changes.push_back(std::move(entry));
      seen[id] = now;
    }
    for (auto it = seen.begin(); it != seen.end();) {
      if (present.count(it->first)) {
        ++it;
        continue;
      }
      changes.push_back(Json{{"character", it->first}, {"state", "gone"}});
      it = seen.erase(it);
    }
    if (!changes.empty())
      emit({viewerId}, "room", Json{{"place", viewer.inside}, {"interior", room->id}, {"changes", std::move(changes)}});
  }
}

}  // namespace livera
