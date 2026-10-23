// Rooms you walk around in (D-066): the room's content, moving on its floor, seats only one person can hold, spots
// that activities, purchases, performances and shifts take you to, the `room` event, and that none of it is saved.

#include <cmath>
#include <fstream>
#include <set>

#include "TestSupport.h"
#include "core/Serialization.h"

using namespace livera;
using namespace livera::test;

namespace {

World twoOnline() {
  World w = World::createNew(realContent());
  REQUIRE(w.connect("dominique"));
  REQUIRE(w.connect("dax"));
  (void)w.drainEvents();
  return w;
}

const InteriorDef& cafe(const World& w) {
  const InteriorDef* room = w.content().interiorFor("heritage_coffee");
  REQUIRE(room);
  return *room;
}

// The first spot of a kind (and, if given, an activity) in the café's room.
InteriorSpotDef spotOf(const World& w, const std::string& kind, const std::string& activity = "") {
  for (const auto& s : cafe(w).spots) {
    if (s.kind == kind && (activity.empty() || s.activity == activity)) return s;
  }
  throw std::runtime_error("no " + kind + " spot");
}

std::string code(const Result<Json>& r) { return r ? std::string("(accepted)") : r.error().code; }

// The room events one character got, drained.
std::vector<Json> roomEvents(World& w, const CharacterId& who) {
  std::vector<Json> out;
  for (const auto& e : w.drainEvents()) {
    if (e.type == "room" && std::find(e.recipients.begin(), e.recipients.end(), who) != e.recipients.end())
      out.push_back(e.data);
  }
  return out;
}

Json lastChange(const std::vector<Json>& events, const CharacterId& about) {
  Json last;
  for (const auto& e : events) {
    for (const auto& c : e["changes"]) {
      if (c["character"] == about) last = c;
    }
  }
  return last;
}

// The real content with one interior document changed, loaded without throwing.
Result<std::shared_ptr<const ContentDatabase>> withRoom(const std::string& file,
                                                        const std::function<void(Json& interior)>& patch) {
  std::vector<std::pair<std::string, Json>> docs;
  std::vector<std::filesystem::path> files;
  for (const auto& e : std::filesystem::recursive_directory_iterator(LIVERA_DATA_DIR)) {
    if (e.path().extension() == ".json") files.push_back(e.path());
  }
  std::sort(files.begin(), files.end());
  for (const auto& f : files) {
    std::ifstream in(f);
    Json doc = Json::parse(in, nullptr, true, true);
    if (f.filename() == file) patch(doc["interior"]);
    docs.emplace_back(f.filename().string(), std::move(doc));
  }
  return ContentDatabase::loadFromDocuments(docs);
}

Result<std::shared_ptr<const ContentDatabase>> withCafe(const std::function<void(Json& interior)>& patch) {
  return withRoom("heritage_coffee.json", patch);
}

}  // namespace

// --- Content --------------------------------------------------------------------------

TEST_CASE("interiors: every room in data is a place you go inside, with its spots on its floor") {
  const auto db = realContent();
  REQUIRE(!db->interiors().empty());
  for (const auto& [id, room] : db->interiors()) {
    REQUIRE(!room.places.empty());
    CHECK(room.walkable(room.entrance));
    for (const auto& place : room.places) {
      const LocationDef* loc = db->location(place);
      REQUIRE(loc);
      CHECK(loc->enterable);
      CHECK(db->interiorFor(place) == &room);
      // Everything the place offers happens at a spot, and there's a way out.
      for (const auto& a : loc->activities) {
        CHECK(std::any_of(room.spots.begin(), room.spots.end(), [&](const auto& s) { return s.activity == a.id; }));
      }
      for (const auto& o : loc->offers) {
        CHECK(std::any_of(room.spots.begin(), room.spots.end(), [&](const auto& s) { return s.sells(o.id); }));
      }
    }
    std::set<std::string> ids;
    for (const auto& s : room.spots) {
      CHECK(ids.insert(s.id).second);
      CHECK(room.onFloor(s.at));
    }
  }
  CHECK(db->interiorFor("heritage_coffee"));
  CHECK(!db->interiorFor("maple_court_3b"));  // a place with no room keeps the scene card
}

TEST_CASE("interiors: content that breaks a room's rules is refused at load") {
  CHECK(withCafe([](Json&) {}));  // unchanged, it loads
  auto refused = [](const std::function<void(Json&)>& patch) {
    auto r = withCafe(patch);
    return r ? std::string("(loaded)") : r.error().message;
  };
  CHECK(refused([](Json& r) { r["places"] = {"nowhere"}; }).find("unknown place") != std::string::npos);
  CHECK(refused([](Json& r) { r["places"] = {"willow_lake_park"}; }).find("not a place you go inside") !=
        std::string::npos);
  CHECK(refused([](Json& r) { r["spots"][1]["at"] = {5, 5}; }).find("not in the room") != std::string::npos);
  CHECK(refused([](Json& r) { r["spots"][2]["id"] = r["spots"][1]["id"]; }).find("duplicate") != std::string::npos);
  CHECK(refused([](Json& r) {
          for (auto& s : r["spots"])
            if (s["kind"] == "seat") s["activity"] = "jog";
        }).find("no activity 'jog'") != std::string::npos);
  CHECK(refused([](Json& r) {
          for (auto& s : r["spots"])
            if (s.value("activity", "") == "restroom") s.erase("activity");
        }).find("'restroom' has no spot") != std::string::npos);
  CHECK(refused([](Json& r) {
          for (auto& s : r["spots"])
            if (s["kind"] == "counter") s.erase("offers");
        }).find("has no counter or seat") != std::string::npos);
  CHECK(refused([](Json& r) { r["entrance"]["at"] = {1, 1}; }).find("entrance") != std::string::npos);
  CHECK(refused([](Json& r) { r["spots"][0]["facing"] = "up"; }).find("facing") != std::string::npos);
  CHECK(refused([](Json& r) { r["spots"][0]["kind"] = "throne"; }).find("unknown kind") != std::string::npos);
  // Arrested, you're put in a cell: the jail's room must have one.
  const auto noCells = withRoom("police_station.json", [](Json& r) {
    for (auto& s : r["spots"])
      if (s["kind"] == "cell") s["kind"] = "seat";
  });
  REQUIRE(!noCells);
  CHECK(noCells.error().message.find("is the jail but the room has no cell") != std::string::npos);
}

// --- Moving around ----------------------------------------------------------------------

TEST_CASE("interiors: coming in puts you at the entrance, and look shows the room and who's where") {
  World w = twoOnline();
  walkInto(w, "dominique", "heritage_coffee");
  const auto here = w.roomPlaceOf("dominique");
  REQUIRE(here);
  CHECK(here->at == cafe(w).entrance);
  CHECK(here->spot.empty());
  const Json room = w.look("dominique").value()["here"]["room"];
  REQUIRE(room.is_object());
  CHECK(room["interior"]["id"] == "heritage_coffee");
  CHECK(room["interior"]["spots"].size() == cafe(w).spots.size());
  REQUIRE(room["people"].size() == 1);
  CHECK(room["people"][0]["id"] == "dominique");
  CHECK(room["people"][0]["spot"].is_null());
  // Outdoors, or in a place without a room, there's none.
  CHECK(!w.roomPlaceOf("dax"));
  CHECK(!w.look("dax").value()["here"].contains("room"));
}

TEST_CASE("interiors: move_inside walks you to a point of the floor; furniture, walls and outdoors are refused") {
  World w = twoOnline();
  CHECK(code(w.moveInside("dax", {600, 700})) == "no_room");   // he starts at home, which has no room yet
  (void)w.exitBuilding("dominique");
  CHECK(code(w.moveInside("dominique", {600, 700})) == "not_inside");
  walkInto(w, "dominique", "heritage_coffee");
  const InteriorDef& room = cafe(w);
  const Vec2 open{700, 760};
  REQUIRE(room.walkable(open));
  const auto r = w.moveInside("dominique", open);
  REQUIRE(r);
  CHECK(r.value()["at"] == Json::array({700, 760}));
  CHECK(w.roomPlaceOf("dominique")->at == open);
  CHECK(code(w.moveInside("dominique", {5, 5})) == "off_floor");                 // outside the room
  const auto& table = room.blocked.front().poly;                                   // the long table's footprint
  const Vec2 onTable{(table[0].x + table[2].x) / 2, (table[0].y + table[2].y) / 2};
  CHECK(code(w.moveInside("dominique", onTable)) == "off_floor");
  CHECK(code(w.moveInside("dominique", {std::nan(""), 700})) == "off_floor");
  CHECK(w.roomPlaceOf("dominique")->at == open);  // refusals change nothing
  World h = twoOnline();
  CHECK(code(h.sit("dax", "sofa_left")) == "no_room");
  CHECK(code(h.stand("dax")) == "no_room");
  (void)h.exitBuilding("dominique");
  CHECK(code(h.sit("dominique", "sofa_left")) == "not_inside");
  CHECK(code(h.stand("dominique")) == "not_inside");
}

TEST_CASE("interiors: sit takes a seat; one person a seat; standing up frees it") {
  World w = twoOnline();
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "dax", "heritage_coffee");
  const InteriorSpotDef chair = spotOf(w, "seat", "chat_regulars");
  CHECK(code(w.sit("dominique", "throne")) == "no_such_spot");
  CHECK(code(w.sit("dominique", spotOf(w, "counter").id)) == "not_a_seat");
  const auto r = w.sit("dominique", chair.id);
  REQUIRE(r);
  CHECK(r.value()["spot"] == chair.id);
  CHECK(w.roomPlaceOf("dominique")->at == chair.at);
  CHECK(code(w.sit("dominique", chair.id)) == "(accepted)");  // sitting where you sit is fine
  CHECK(code(w.sit("dax", chair.id)) == "spot_taken");
  CHECK(w.roomPlaceOf("dax")->spot.empty());
  // Standing up puts you on the open floor beside the seat; the seat is free again.
  const auto up = w.stand("dominique");
  REQUIRE(up);
  CHECK(up.value()["spot"].is_null());
  CHECK(cafe(w).walkable(w.roomPlaceOf("dominique")->at));
  CHECK(distance(w.roomPlaceOf("dominique")->at, chair.at) < cafe(w).personPx);
  CHECK(code(w.sit("dax", chair.id)) == "(accepted)");
  // Moving away from a seat leaves it too.
  CHECK(code(w.moveInside("dax", {700, 760})) == "(accepted)");
  CHECK(code(w.sit("dominique", chair.id)) == "(accepted)");
}

TEST_CASE("interiors: leaving, logging off or being taken away frees the seat") {
  World w = twoOnline();
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "dax", "heritage_coffee");
  const std::string chair = spotOf(w, "sofa").id;
  REQUIRE(w.sit("dominique", chair));
  REQUIRE(w.exitBuilding("dominique"));
  CHECK(code(w.sit("dax", chair)) == "(accepted)");
  w.disconnect("dax");
  walkInto(w, "dominique", "heritage_coffee");
  CHECK(code(w.sit("dominique", chair)) == "(accepted)");
  // Back in the world, Dax is at the entrance again, not on the sofa.
  REQUIRE(w.connect("dax"));
  CHECK(w.roomPlaceOf("dax")->at == cafe(w).entrance);
  CHECK(w.roomPlaceOf("dax")->spot.empty());
}

TEST_CASE("interiors: a reload starts everyone at the entrance (where you are in a room isn't saved)") {
  World w = twoOnline();
  walkInto(w, "dominique", "heritage_coffee");
  REQUIRE(w.sit("dominique", spotOf(w, "sofa").id));
  const Json save = worldStateToJson(w.state());
  CHECK(save.dump().find(spotOf(w, "sofa").id) == std::string::npos);
  auto state = worldStateFromJson(save);
  REQUIRE(state);
  World loaded(realContent(), std::move(state).value());
  // Saved inside the café, she comes back inside it, at the door.
  CHECK(loaded.character("dominique")->inside == "heritage_coffee");
  REQUIRE(loaded.connect("dominique"));
  const auto at = loaded.roomPlaceOf("dominique");
  REQUIRE(at);
  CHECK(at->at == cafe(loaded).entrance);
  CHECK(at->spot.empty());
}

// --- Spots that things happen at -----------------------------------------------------

TEST_CASE("interiors: a purchase is made at the counter, and the next customer waits beside it") {
  World w = twoOnline();
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "dax", "heritage_coffee");
  const InteriorSpotDef counter = spotOf(w, "counter");
  auto r = w.buy("dominique", "latte", "card");
  REQUIRE(r);
  CHECK(r.value()["room"]["spot"] == counter.id);
  CHECK(w.roomPlaceOf("dominique")->at == counter.at);
  // The counter is taken: Dax is served standing next to it, on the open floor, not on top of her.
  r = w.buy("dax", "drip", "card");
  REQUIRE(r);
  CHECK(r.value()["room"]["spot"].is_null());
  const Vec2 dax = w.roomPlaceOf("dax")->at;
  CHECK(cafe(w).walkable(dax));
  CHECK(distance(dax, counter.at) > 10);
  CHECK(distance(dax, counter.at) < cafe(w).personPx * 2.5);
  // Buying again while at the counter keeps her there.
  REQUIRE(w.buy("dominique", "croissant", "card"));
  CHECK(w.roomPlaceOf("dominique")->spot == counter.id);
}

TEST_CASE("interiors: an activity is done at its spot: chatting with the regulars seats you at the long table") {
  World w = twoOnline();
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "dax", "heritage_coffee");
  auto r = w.useActivity("dominique", "chat_regulars");
  REQUIRE(r);
  const std::string seat = r.value()["room"]["spot"].get<std::string>();
  CHECK(cafe(w).spot(seat)->activity == "chat_regulars");
  CHECK(cafe(w).spot(seat)->isSeat());
  // Dax gets another chair at the same table, never hers.
  r = w.useActivity("dax", "chat_regulars");
  REQUIRE(r);
  CHECK(r.value()["room"]["spot"].is_string());
  CHECK(r.value()["room"]["spot"] != seat);
  // The restroom is a door of its own.
  r = w.useActivity("dominique", "restroom");
  REQUIRE(r);
  CHECK(cafe(w).spot(r.value()["room"]["spot"].get<std::string>())->kind == "door");
  // A refused activity moves nobody.
  const RoomPlace before = *w.roomPlaceOf("dominique");
  CHECK(code(w.useActivity("dominique", "restroom")) == "too_soon");
  CHECK(*w.roomPlaceOf("dominique") == before);
}

TEST_CASE("interiors: going to bed at home puts you in a free bed") {
  World w = World::createNew(realContent());
  REQUIRE(w.connect("dominique"));
  w.advanceMinutes(14 * 60);  // 21:00, bedtime
  walkInto(w, "dominique", "lexington_1204");
  REQUIRE(w.sleep("dominique"));
  const InteriorDef* room = w.content().interiorFor("lexington_1204");
  REQUIRE(room);
  const auto at = w.roomPlaceOf("dominique");
  REQUIRE(at);
  REQUIRE(room->spot(at->spot));
  CHECK(room->spot(at->spot)->kind == "bed");
}

TEST_CASE("interiors: performing puts you on the stage") {
  World w = twoOnline();
  walkInto(w, "dominique", "heritage_coffee");
  auto song = w.saveSong("dominique", Json::parse(R"({"title": "Room Tone", "bpm": 96,
      "tracks": [{"instrument": "drums", "notes": [[0,36,1],[8,36,1]]}]})"), "");
  REQUIRE(song);
  REQUIRE(w.perform("dominique", song.value()["id"].get<std::string>()));
  CHECK(w.roomPlaceOf("dominique")->spot == spotOf(w, "stage").id);
}

// --- Who sees what --------------------------------------------------------------------

TEST_CASE("interiors: people in the room hear who arrived, moved, sat and left, once a tick") {
  World w = twoOnline();
  walkInto(w, "dax", "heritage_coffee");
  w.advanceRealTime(0.1);
  auto events = roomEvents(w, "dax");
  REQUIRE(!events.empty());
  CHECK(events.back()["place"] == "heritage_coffee");
  CHECK(lastChange(events, "dax")["state"] == "here");  // yourself, at the entrance
  walkInto(w, "dominique", "heritage_coffee");
  w.advanceRealTime(0.1);
  events = roomEvents(w, "dax");
  CHECK(lastChange(events, "dominique")["state"] == "here");
  CHECK(lastChange(events, "dominique")["spot"].is_null());
  // Two moves and a seat within one tick: one event, with where she ended up.
  REQUIRE(w.moveInside("dominique", {700, 760}));
  REQUIRE(w.moveInside("dominique", {720, 770}));
  const std::string sofa = spotOf(w, "sofa").id;
  REQUIRE(w.sit("dominique", sofa));
  w.advanceRealTime(0.1);
  events = roomEvents(w, "dax");
  REQUIRE(events.size() == 1);
  CHECK(lastChange(events, "dominique")["spot"] == sofa);
  // Nothing changed: nothing sent.
  w.advanceRealTime(0.1);
  CHECK(roomEvents(w, "dax").empty());
  // She leaves: gone, and the sofa is free.
  REQUIRE(w.exitBuilding("dominique"));
  w.advanceRealTime(0.1);
  events = roomEvents(w, "dax");
  CHECK(lastChange(events, "dominique")["state"] == "gone");
  // Someone outdoors gets no room events.
  for (const auto& e : w.drainEvents()) CHECK(!(e.type == "room" && e.recipients.front() == "dominique"));
  CHECK(code(w.sit("dax", sofa)) == "(accepted)");
}

TEST_CASE("interiors: two people can never hold one seat, whoever asks first") {
  World w = twoOnline();
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "dax", "heritage_coffee");
  // Every seat in the room, both trying: each ends up held by exactly one of them.
  int dom = 0, dax = 0;
  for (const auto& s : cafe(w).spots) {
    if (!s.isSeat()) continue;
    const bool first = static_cast<bool>(w.sit("dominique", s.id));
    const bool second = static_cast<bool>(w.sit("dax", s.id));
    CHECK(first);
    CHECK(!second);
    dom += first;
    dax += second;
    // Then she gets up, and he can.
    REQUIRE(w.stand("dominique"));
    CHECK(static_cast<bool>(w.sit("dax", s.id)));
    REQUIRE(w.stand("dax"));
  }
  CHECK(dom > 10);
  CHECK(dax == 0);
}

TEST_CASE("interiors: starting a shift puts you at a free work station") {
  World w = World::createNew(realContent());
  REQUIRE(w.connect("leila"));
  walkInto(w, "leila", "livera_ledger");  // the newsroom, where she works
  const InteriorDef* room = w.content().interiorFor("livera_ledger");
  REQUIRE(room);
  REQUIRE(w.startShift("leila"));
  const auto at = w.roomPlaceOf("leila");
  REQUIRE(at);
  REQUIRE(!at->spot.empty());
  CHECK(room->spot(at->spot)->staff);
}

TEST_CASE("interiors: what's served at a seat is served there: dinner at a table, wine at the bar, a cut in the chair") {
  World w = twoOnline();
  const InteriorDef* bistro = w.content().interiorFor("lumiere_bistro");
  const InteriorDef* salon = w.content().interiorFor("fade_glow");
  REQUIRE(bistro);
  REQUIRE(salon);
  // A catch-all counter only serves what no spot names.
  for (const auto& s : bistro->spots) {
    if (s.offersAll) CHECK(!bistro->servedAt(s, "dinner"));
  }
  for (int i = 0; i < 24 * 60 && !w.isLocationOpen(*w.content().location("lumiere_bistro")); ++i) w.advanceMinutes(1);
  walkInto(w, "dominique", "lumiere_bistro");
  auto r = w.buy("dominique", "dinner", "card");
  REQUIRE(r);
  const InteriorSpotDef* table = bistro->spot(r.value()["room"]["spot"].get<std::string>());
  REQUIRE(table);
  CHECK(table->isSeat());
  CHECK(bistro->servedAt(*table, "dinner"));
  r = w.buy("dominique", "wine", "card");
  REQUIRE(r);
  CHECK(bistro->spot(r.value()["room"]["spot"].get<std::string>())->kind == "stool");
  for (int i = 0; i < 24 * 60 && !w.isLocationOpen(*w.content().location("fade_glow")); ++i) w.advanceMinutes(1);
  walkInto(w, "dax", "fade_glow");
  r = w.buy("dax", "haircut", "card");
  REQUIRE(r);
  CHECK(salon->spot(r.value()["room"]["spot"].get<std::string>())->label == "Styling chair");
}
