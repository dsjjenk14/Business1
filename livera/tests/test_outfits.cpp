// Everyone's own three looks (D-079): everyday, work and going-out clothes that every character owns, changing into
// them, who sees it, what can't be done with them (give, sell), when you can't change, dirt and laundry on them, the
// Items app, and the content checks.
#include <filesystem>
#include <fstream>

#include "TestSupport.h"
#include "core/Clock.h"
#include "core/Serialization.h"

using namespace livera;
using namespace livera::test;

namespace {

// Nobody catches anything and life events stay out of the way, so outcomes are the rules'.
void quiet(Json& doc, const std::string& file) {
  if (file == "conditions.json") {
    for (auto& c : doc["conditions"]) {
      if (c.contains("catch")) c["catch"] = Json{{"hourly_chance", 0.0}};
    }
  }
  if (file == "life_events.json") doc["life_events"]["per_day"] = 1;
}

std::shared_ptr<const ContentDatabase> outfitContent() {
  static auto db = patchedContent([](Json& doc, const std::string& file) { quiet(doc, file); });
  return db;
}

// The real content with a patch, as patchedContent, but the load's refusal comes back instead of throwing.
Result<std::shared_ptr<const ContentDatabase>> loadPatched(const std::function<void(Json&, const std::string&)>& patch) {
  std::vector<std::filesystem::path> files;
  for (const auto& e : std::filesystem::recursive_directory_iterator(LIVERA_DATA_DIR)) {
    if (e.path().extension() == ".json") files.push_back(e.path());
  }
  std::sort(files.begin(), files.end());
  std::vector<std::pair<std::string, Json>> docs;
  for (const auto& f : files) {
    std::ifstream in(f);
    Json doc = Json::parse(in, nullptr, true, true);
    patch(doc, f.filename().string());
    docs.emplace_back(f.filename().string(), std::move(doc));
  }
  return ContentDatabase::loadFromDocuments(docs);
}

// The refusal a patched content load ends in ("" when it loads).
std::string refusalOf(const std::function<void(Json&, const std::string&)>& patch) {
  auto r = loadPatched(patch);
  return r ? std::string() : r.error().message;
}

bool contains(const std::string& s, const std::string& part) { return s.find(part) != std::string::npos; }

Json& itemIn(Json& doc, const std::string& id) {
  for (auto& i : doc["items"]) {
    if (i["id"] == id) return i;
  }
  throw std::runtime_error("no item " + id);
}

Json& outfitsOf(Json& doc) { return doc["characters"][0]["profile"]["appearance"]["outfits"]; }

World townWorld(std::initializer_list<const char*> who = {"dominique", "aaliyah"}) {
  World w = World::createNew(outfitContent());
  for (const char* id : who) REQUIRE(w.connect(id));
  w.advanceMinutes(3 * 60);  // 10:00: the shops are open
  (void)w.drainEvents();
  return w;
}

// The person entry `viewer` was last told about `who` by the people stream (null if none).
Json lastSeen(const std::vector<WorldEvent>& events, const CharacterId& viewer, const CharacterId& who) {
  Json last;
  for (const auto& e : events) {
    if (e.type != "people" || std::find(e.recipients.begin(), e.recipients.end(), viewer) == e.recipients.end()) continue;
    for (const auto& c : e.data["changes"]) {
      if (c["character"] == who) last = c;
    }
  }
  return last;
}

Json lookFor(const World& w, const CharacterId& viewer, const CharacterId& who) {
  const Json seen = w.look(viewer).value();  // kept alive while it's iterated
  for (const auto& p : seen["people"]) {
    if (p["id"] == who) return p;
  }
  return Json();
}

Json looks(World& w, const CharacterId& who) {
  auto app = w.openPhoneApp(who, "items");
  REQUIRE(app);
  return app.value();
}

Json lookIn(const Json& app, const std::string& look) {
  for (const auto& l : app["looks"]) {
    if (l["look"] == look) return l;
  }
  return Json();
}

std::string code(const Result<Json>& r) { return r ? std::string("(ok)") : r.error().code; }

}  // namespace

TEST_CASE("outfits: everyone in town owns their three looks without buying them") {
  World w = World::createNew(outfitContent());
  const ContentDatabase& db = w.content();
  for (const auto& look : kOutfitLooks) {
    const ItemDef* item = db.personalItem(look);
    REQUIRE(item != nullptr);
    CHECK(item->slot == "outfit");
    CHECK(item->look == look);
  }
  CHECK(db.personalItem("work")->id == "outfit_work");
  CHECK(db.personalItem("party") == nullptr);
  REQUIRE(db.characters().size() == 27);
  for (const auto& [id, def] : db.characters()) {
    for (const auto& look : kOutfitLooks) CHECK(w.owns(id, db.personalItem(look)->id));
    CHECK(w.character(id)->inventory.count("outfit_work") == 0);  // owned without being carried around
    CHECK(w.character(id)->outfit.empty());                       // nobody starts in a chosen look (D-079)
  }
  CHECK(!w.owns("nobody", "outfit_work"));
  // Each person's drawn look is the one their art shows.
  CHECK(w.drawnLook("dominique") == "work");
  CHECK(w.drawnLook("andre") == "everyday");
  CHECK(w.drawnLook("imani-clarke") == "work");
}

TEST_CASE("outfits: changing into each look, and everyone who can see you is told") {
  World w = townWorld();
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "aaliyah", "heritage_coffee");
  (void)w.drainEvents();
  // Nothing chosen: she's seen in the clothes she's drawn in, her work look; no label for a look of her own.
  Json seen = lookFor(w, "aaliyah", "dominique");
  CHECK(seen["look"] == "work");
  CHECK(!seen.contains("look_label"));
  CHECK(w.look("dominique").value()["you"]["look"] == "work");

  const double confidence = w.character("dominique")->emotions.at("confidence");
  struct Want {
    const char* item;
    const char* look;
    double style;
  };
  for (const Want& want : {Want{"outfit_everyday", "everyday", 6}, Want{"outfit_evening", "evening", 18},
                           Want{"outfit_work", "work", 12}}) {
    auto r = w.wear("dominique", want.item);
    REQUIRE(r);
    CHECK(r.value()["outfit"] == want.item);
    CHECK(r.value()["look"] == want.look);
    CHECK(r.value()["style"] == want.style);
    CHECK(w.character("dominique")->outfit == want.item);
    w.advanceRealTime(0.1);
    const auto events = w.drainEvents();
    CHECK(lastSeen(events, "aaliyah", "dominique")["look"] == want.look);  // the people stream, at the end of the tick
    CHECK(lastSeen(events, "dominique", "dominique")["look"] == want.look);
    CHECK(lookFor(w, "aaliyah", "dominique")["look"] == want.look);
    CHECK(w.look("dominique").value()["you"]["look"] == want.look);
  }
  CHECK(w.character("dominique")->emotions.at("confidence") > confidence);
  // Changing into what you have on already tells nobody anything new.
  REQUIRE(w.wear("dominique", "outfit_work"));
  w.advanceRealTime(0.1);
  CHECK(lastSeen(w.drainEvents(), "aaliyah", "dominique").is_null());

  // Taking it off: back in the clothes she's drawn in.
  auto off = w.takeOff("dominique", "outfit");
  REQUIRE(off);
  CHECK(off.value()["outfit"] == "");
  CHECK(off.value()["look"] == "work");
  w.advanceRealTime(0.1);
  CHECK(lastSeen(w.drainEvents(), "aaliyah", "dominique")["look"] == "work");

  // A bought outfit is public too, by its name.
  walkInto(w, "dominique", "thread_co");
  REQUIRE(w.buy("dominique", "evening_outfit", "card"));
  auto bought = w.wear("dominique", "evening_outfit");
  REQUIRE(bought);
  CHECK(bought.value()["look"] == "other");
  CHECK(bought.value()["look_label"] == "Evening outfit");
  walkInto(w, "aaliyah", "thread_co");
  seen = lookFor(w, "aaliyah", "dominique");
  CHECK(seen["look"] == "other");
  CHECK(seen["look_label"] == "Evening outfit");
}

TEST_CASE("outfits: someone made in the creator is drawn in their everyday look and has a line for each") {
  World w = World::createNew(outfitContent());
  std::ifstream in(std::string(LIVERA_DATA_DIR) + "/../scripts/demo/nico_vale.json");
  auto id = w.createCharacter(Json::parse(in));
  REQUIRE(id);
  REQUIRE(w.connect(id.value()));
  CHECK(w.drawnLook(id.value()) == "everyday");
  CHECK(w.look(id.value()).value()["you"]["look"] == "everyday");
  const Json app = looks(w, id.value());
  CHECK(app["drawn"] == "everyday");
  for (const auto& look : kOutfitLooks) {
    CHECK(lookIn(app, look)["garments"] == w.content().personalItem(look)->description);
  }
  REQUIRE(w.wear(id.value(), "outfit_evening"));
  CHECK(w.look(id.value()).value()["you"]["look"] == "evening");
}

TEST_CASE("outfits: the Items app lists your three looks: your own garments, which you're in, their condition") {
  World w = townWorld({"dominique"});
  Json app = looks(w, "dominique");
  REQUIRE(app["looks"].size() == 3);
  CHECK(app["looks"][0]["look"] == "everyday");  // in the order they're shown
  CHECK(app["drawn"] == "work");
  CHECK(app["look"] == "work");
  const Json work = lookIn(app, "work");
  CHECK(work["item"] == "outfit_work");
  CHECK(work["label"] == "Work clothes");
  CHECK(contains(work["garments"], "black double-breasted blazer"));
  CHECK(work["wearing"] == true);   // what people see her in, though she hasn't chosen it
  CHECK(work["chosen"] == false);
  CHECK(work["drawn"] == true);
  CHECK(work["condition"] == "clean");
  CHECK(contains(lookIn(app, "everyday")["garments"], "camel coat"));
  CHECK(lookIn(app, "evening")["wearing"] == false);
  for (const auto& i : app["items"]) CHECK(i["id"] != "outfit_work");  // not in the list of things she carries
  REQUIRE(w.wear("dominique", "outfit_evening"));
  app = looks(w, "dominique");
  CHECK(app["look"] == "evening");
  CHECK(app["outfit"] == "outfit_evening");
  CHECK(lookIn(app, "evening")["wearing"] == true);
  CHECK(lookIn(app, "evening")["chosen"] == true);
  CHECK(lookIn(app, "work")["wearing"] == false);
}

TEST_CASE("outfits: your own clothes can't be given away") {
  World w = townWorld();
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "aaliyah", "heritage_coffee");
  for (const auto& look : kOutfitLooks) {
    const std::string item = w.content().personalItem(look)->id;
    CHECK(code(w.giveItem("dominique", "aaliyah", item)) == "personal_item");
    CHECK(w.character("aaliyah")->inventory.count(item) == 0);
  }
  REQUIRE(w.wear("dominique", "outfit_evening"));
  CHECK(code(w.giveItem("dominique", "aaliyah", "outfit_evening")) == "personal_item");
  CHECK(w.character("dominique")->outfit == "outfit_evening");  // still wearing it
  CHECK(code(w.useItem("dominique", "outfit_work")) == "not_usable");
}

TEST_CASE("outfits: no changing on the move, on the bus, in a cell or in a fight") {
  World w = townWorld({"dominique", "dax"});
  REQUIRE(w.exitBuilding("dominique"));
  const LocationDef* cafe = w.content().location("heritage_coffee");
  REQUIRE(w.moveTo("dominique", cafe->door));
  CHECK(code(w.wear("dominique", "outfit_evening")) == "walking");
  CHECK(code(w.takeOff("dominique", "outfit")) == "walking");
  CHECK(w.character("dominique")->outfit.empty());
  {
    WorldState s = w.state();
    s.characters.at("dominique").moveSpeedMps = 40;  // riding the bus
    World x(w.contentPtr(), s);
    CHECK(code(x.wear("dominique", "outfit_evening")) == "riding");
  }
  {
    WorldState s = w.state();
    s.characters.at("dominique").moveTarget.reset();
    s.characters.at("dominique").jailedUntil = s.now + 600;
    World x(w.contentPtr(), s);
    CHECK(code(x.wear("dominique", "outfit_evening")) == "in_jail");
    CHECK(code(x.takeOff("dominique", "outfit")) == "in_jail");
  }
  // Stopped, she can.
  for (int i = 0; i < 2000 && w.character("dominique")->moveTarget; ++i) w.advanceRealTime(0.1);
  REQUIRE(w.wear("dominique", "outfit_evening"));
  // In a fight (Beat Brawl), neither of them can.
  REQUIRE(w.enter("dominique", "heritage_coffee"));
  walkInto(w, "dax", "heritage_coffee");
  auto fight = w.startFight("dominique", "dax");
  REQUIRE(fight);
  REQUIRE(w.respondToFight("dax", fight.value()["fight"].get<std::string>(), "fight_back").value()["status"] == "brawl");
  CHECK(code(w.wear("dax", "outfit_everyday")) == "in_fight");
  CHECK(code(w.takeOff("dominique", "outfit")) == "in_fight");
  CHECK(w.character("dominique")->outfit == "outfit_evening");
}

TEST_CASE("outfits: a personal look gets dirty and ruined, and laundry washes it, like any outfit") {
  World w = townWorld({"dominique"});  // at home
  // With nothing chosen nothing gets worn out: the town is unchanged until someone changes clothes.
  for (int h = 0; h < 18; ++h) {
    (void)w.useActivity("dominique", "toilet");
    w.advanceMinutes(60);
  }
  for (const auto& l : looks(w, "dominique")["looks"]) CHECK(l["condition"] == "clean");
  CHECK(code(w.doLaundry("dominique")) == "nothing_to_wash");
  REQUIRE(w.character("dominique")->inside == "lexington_1204");
  REQUIRE(w.wear("dominique", "outfit_work"));
  CHECK(looks(w, "dominique")["style"] == 12);
  for (int h = 0; h < 17; ++h) {
    (void)w.useActivity("dominique", "toilet");
    w.advanceMinutes(60);
  }
  if (w.character("dominique")->inside != "lexington_1204") walkInto(w, "dominique", "lexington_1204");
  CHECK(w.dirtyOutfit(*w.character("dominique")));
  CHECK(lookIn(looks(w, "dominique"), "work")["condition"] == "dirty");
  CHECK(looks(w, "dominique")["style"] == 0);  // a dirty outfit looks it
  // Ruined: wetting yourself in it.
  WorldState s = w.state();
  s.characters.at("dominique").detail.soiled.push_back("outfit_work");
  World x(w.contentPtr(), s);
  CHECK(lookIn(looks(x, "dominique"), "work")["condition"] == "ruined");
  CHECK(x.soiledOutfit(*x.character("dominique")));
  auto washed = x.doLaundry("dominique");
  REQUIRE(washed);
  CHECK(washed.value()["where"] == "home");
  CHECK(lookIn(looks(x, "dominique"), "work")["condition"] == "clean");
  CHECK(looks(x, "dominique")["style"] == 12);
}

TEST_CASE("outfits: the look you chose is saved with the world") {
  World w = townWorld({"dominique"});
  REQUIRE(w.wear("dominique", "outfit_evening"));
  auto back = worldStateFromJson(Json::parse(worldStateToJson(w.state()).dump()));
  REQUIRE(back);
  World x(w.contentPtr(), back.value());
  CHECK(x.character("dominique")->outfit == "outfit_evening");
  CHECK(x.wornLook(*x.character("dominique")).look == "evening");
}

TEST_CASE("outfits: content checks for the personal looks and everyone's outfits") {
  CHECK(refusalOf([](Json&, const std::string&) {}).empty());
  const auto item = [](const std::string& id, const std::function<void(Json&)>& f) {
    return [id, f](Json& doc, const std::string& file) {
      if (file == "items.json") f(itemIn(doc, id));
    };
  };
  CHECK(contains(refusalOf(item("outfit_work", [](Json& i) { i["slot"] = "accessory"; })), "slot outfit"));
  CHECK(contains(refusalOf(item("outfit_work", [](Json& i) { i["look"] = "party"; })), "everyday, work or evening"));
  CHECK(contains(refusalOf(item("outfit_work", [](Json& i) { i["usable"] = true; })), "nothing to use"));
  CHECK(contains(refusalOf(item("outfit_work", [](Json& i) { i.erase("description"); })), "needs a description"));
  CHECK(contains(refusalOf(item("everyday_outfit", [](Json& i) { i["look"] = "everyday"; })), "only for personal items"));
  CHECK(contains(refusalOf(item("everyday_outfit", [](Json& i) { i["personal"] = true, i["look"] = "work", i["description"] = "x"; })),
                 "the work look needs exactly one item, not 2"));
  CHECK(contains(refusalOf(item("outfit_evening", [](Json& i) { i["personal"] = false, i.erase("look"); })),
                 "the evening look needs exactly one item, not 0"));
  // Nobody sells or uses up what everyone owns.
  CHECK(contains(refusalOf([](Json& doc, const std::string& file) {
                   if (file != "founding_town.json") return;
                   for (auto& l : doc["locations"]) {
                     if (l["id"] == "thread_co") l["offers"][0]["item"] = "outfit_work";
                   }
                 }),
                 "is a personal item, never sold"));
  CHECK(contains(refusalOf([](Json& doc, const std::string& file) {
                   if (file == "coins.json") doc["coin_shop"][0]["item"] = "outfit_evening";
                 }),
                 "is a personal item, never sold"));
  CHECK(contains(refusalOf([](Json& doc, const std::string& file) {
                   if (file == "pets.json") doc["pets"]["actions"][0]["uses_item"] = "outfit_everyday";
                 }),
                 "uses a personal item"));
  // Everyone in data has the three looks and says which one their art shows.
  const auto dominique = [](const std::function<void(Json&)>& f) {
    return [f](Json& doc, const std::string& file) {
      if (file == "dominique.json") f(outfitsOf(doc));
    };
  };
  CHECK(contains(refusalOf(dominique([](Json& o) { o = nullptr; })), "character dominique profile.appearance.outfits: missing"));
  CHECK(contains(refusalOf(dominique([](Json& o) { o.erase("evening"); })), "no evening look"));
  CHECK(contains(refusalOf(dominique([](Json& o) { o["weekend"] = "a camel coat"; })), "unknown look 'weekend'"));
  CHECK(contains(refusalOf(dominique([](Json& o) { o["work"] = ""; })), "the garments, as text"));
  CHECK(contains(refusalOf(dominique([](Json& o) { o.erase("drawn"); })), "no drawn"));
  CHECK(contains(refusalOf(dominique([](Json& o) { o["drawn"] = "gym"; })), ".drawn: the look their art shows"));
}
