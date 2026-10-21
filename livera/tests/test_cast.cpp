// The town's people: every character in data/characters (the founders, the four residents with art, the
// townspeople: D-073) must be complete, match their reference art where it exists, and actually be able to live in
// the town (home, job, ties).

#include <filesystem>
#include <fstream>
#include <functional>
#include <map>
#include <set>

#include "TestSupport.h"

using namespace livera;
using namespace livera::test;

namespace {

const std::vector<std::string> kFounders = {"dominique", "dax",    "harper", "andre",   "naomi", "graham",
                                            "maya",      "julian", "leila",  "aaliyah", "sienna"};
// The four made in the creator for the town-preview recording, whose sheets are art/reference/residents (D-073).
const std::vector<std::string> kResidents = {"kai-morgan", "rosa-delgado", "sol-rivera", "theo-grant"};
// The people who keep the town's places open (D-073). No art yet: the client draws them as a labelled stand-in.
const std::vector<std::string> kTownspeople = {"bernie-walsh",  "marcus-bell", "aisha-farah",   "samuel-osei",
                                               "tess-osei",     "ngozi-adeyemi", "rafael-mendes", "imani-clarke",
                                               "hamid-sultani", "noor-haddad", "jean-baptiste-moreau", "bo-thornton"};

std::vector<std::string> everyone() {
  std::vector<std::string> all = kFounders;
  all.insert(all.end(), kResidents.begin(), kResidents.end());
  all.insert(all.end(), kTownspeople.begin(), kTownspeople.end());
  return all;
}

}  // namespace

TEST_CASE("cast: the town's people are the eleven founders, the four residents with art and the townspeople") {
  std::set<std::string> ids;
  for (const auto& [id, def] : realContent()->characters()) ids.insert(id);
  const auto all = everyone();
  CHECK(ids == std::set<std::string>(all.begin(), all.end()));
  for (const auto& id : kFounders) CHECK(realContent()->character(id)->cast == "founder");
  for (const auto& id : kResidents) CHECK(realContent()->character(id)->cast == "resident");
  for (const auto& id : kTownspeople) CHECK(realContent()->character(id)->cast == "townsperson");
}

TEST_CASE("cast: every character is complete, and founders and residents link art that exists") {
  const auto root = std::filesystem::path(LIVERA_DATA_DIR).parent_path();
  const SimulationConfig& sim = realContent()->sim();
  for (const auto& id : everyone()) {
    const CharacterDef* d = realContent()->character(id);
    REQUIRE(d);
    CHECK(d->playable);
    CHECK(d->personality.size() == sim.personalityTraits.size());
    CHECK(d->values.size() == sim.values.size());
    CHECK(d->relationships.size() >= 3);
    const Json& p = d->profile;
    for (const char* key : {"tagline", "archetype", "why_livera", "appearance", "family_background", "education", "goals",
                            "ambitions", "social_preferences", "secrets", "schedule", "starting_inventory", "social_media",
                            "reputation", "life_history", "card"}) {
      if (!p.contains(key)) std::fprintf(stderr, "    %s is missing %s\n", id.c_str(), key);
      CHECK(p.contains(key));
    }
    CHECK(!p["secrets"].empty());
    const Json& look = p["appearance"];
    CHECK(look["key_features"].size() >= 4);
    CHECK(look.value("height_cm", 0) == p["card"].value("height_cm", -1));  // the prompt pack draws them at this height
    // Every schedule has a weekday work line (the away routine pays it, the autopilot clocks on with it).
    bool works = false;
    for (const auto& e : p["schedule"].value("weekdays", Json::array())) works |= e.value("work", false);
    CHECK(works);
    const std::string art = look.value("visual_reference", "");
    if (d->cast == "townsperson") {
      CHECK(art.empty());  // until their sheet is drawn (scripts/character_prompts.py asks for it)
      continue;
    }
    if (!std::filesystem::exists(root / art)) std::fprintf(stderr, "    %s: art not found at %s\n", id.c_str(), art.c_str());
    CHECK(std::filesystem::exists(root / art));
    if (look.contains("avatar")) CHECK(std::filesystem::exists(root / look["avatar"].get<std::string>()));
    const Json sheets = look.value("reference_sheets", Json::object());  // a local: items() must not outlive it
    for (const auto& [kind, sheet] : sheets.items()) {
      if (!std::filesystem::exists(root / sheet.get<std::string>())) std::fprintf(stderr, "    %s: %s sheet missing\n", id.c_str(), kind.c_str());
      CHECK(std::filesystem::exists(root / sheet.get<std::string>()));
    }
  }
}

TEST_CASE("cast: everyone has a home of their own or shared as the data says, and a job they can actually work") {
  World w = World::createNew(realContent());
  std::map<std::string, std::vector<std::string>> homes;
  for (const auto& id : everyone()) homes[w.definition(id)->homeProperty].push_back(id);
  for (auto& [pid, who] : homes) {
    std::sort(who.begin(), who.end());
    const PropertyState& p = w.state().properties.at(pid);
    CHECK(p.tenant == who.front());  // the first to move in (by id) holds the lease
    CHECK(p.residents.size() == who.size());
    for (const auto& id : who) CHECK(std::find(p.residents.begin(), p.residents.end(), id) != p.residents.end());
    // Only a couple, cousins or roommates the data put together share: never a founder.
    if (who.size() > 1) {
      for (const auto& id : who) CHECK(w.definition(id)->cast != "founder");
    }
  }
  for (const auto& id : everyone()) {
    CHECK(w.character(id)->inside == w.definition(id)->spawnLocation);
    REQUIRE(w.connect(id));
  }
  // Everyone walks to work at once (one after another, the first would have worked past their longest shift).
  std::vector<std::string> working;
  std::map<std::string, LocationId> workplace;
  for (const auto& id : everyone()) {
    const CareerDef* career = w.content().career(w.definition(id)->careerId);
    REQUIRE(career);
    REQUIRE(!career->workplaces.empty());
    workplace[id] = career->workplaces.front();
    REQUIRE(w.exitBuilding(id));
    REQUIRE(w.moveTo(id, w.content().location(workplace[id])->door));
  }
  for (int i = 0; i < 4000; ++i) {
    bool moving = false;
    for (const auto& id : everyone()) moving |= w.character(id)->moveTarget.has_value();
    if (!moving) break;
    w.advanceRealTime(0.1);
  }
  for (const auto& id : everyone()) {
    const LocationId& where = workplace[id];
    // Body & Balance is still being built in a new town: its trainer can't get in until it opens.
    if (w.locationStatus(*w.content().location(where)) == "under_construction") {
      CHECK(w.enter(id, where).error().code == "under_construction");
      continue;
    }
    // Shops like Low End Studios are closed this early, but staff can always get in.
    REQUIRE(w.enter(id, where));
    REQUIRE(w.startShift(id));
    working.push_back(id);
  }
  CHECK(working.size() == everyone().size() - 1);  // everyone but the trainer
  w.advanceMinutes(60);
  for (const auto& id : working) {
    const CharacterDef* d = w.definition(id);
    const Cents hourly = w.content().career(d->careerId)->levels.at(static_cast<std::size_t>(d->careerLevel)).hourlyCents;
    auto r = w.endShift(id);
    REQUIRE(r);
    // Walking to work takes game time, so everyone clocked in at a different minute.
    const auto minutes = r.value()["minutes_worked"].get<GameMinutes>();
    CHECK(minutes >= 60);
    CHECK(r.value()["pay_cents"].get<Cents>() == std::llround(static_cast<double>(minutes) / 60.0 * static_cast<double>(hourly)));
  }
  CHECK(w.state().ledger.sumOfBalances() == 0);
}

TEST_CASE("cast: Samuel and Tess Osei start married, on both sides, and live together") {
  World w = World::createNew(realContent());
  REQUIRE(w.relationship("samuel-osei", "tess-osei"));
  CHECK(w.relationship("samuel-osei", "tess-osei")->status == "married");
  CHECK(w.relationship("tess-osei", "samuel-osei")->status == "married");
  REQUIRE(w.connect("tess-osei"));
  const Json romance = w.openPhoneApp("tess-osei", "romance").value();
  REQUIRE(romance["relationships"].size() == 1);
  CHECK(romance["relationships"][0]["id"] == "samuel-osei");
  CHECK(romance["relationships"][0]["status"] == "married");
  // Kai and Theo are cousins, not a couple: no status.
  CHECK(w.relationship("kai-morgan", "theo-grant")->status.empty());
}

TEST_CASE("cast: their history is directional, as written") {
  World w = World::createNew(realContent());
  // Andre still carries a torch; Aaliyah carries a grudge.
  CHECK(w.relationshipValue("andre", "aaliyah", "romantic_attraction") > w.relationshipValue("aaliyah", "andre", "romantic_attraction"));
  CHECK(w.relationshipValue("aaliyah", "andre", "resentment") > w.relationshipValue("andre", "aaliyah", "resentment"));
  // Cousins: Sienna is the jealous one.
  CHECK(w.relationshipValue("sienna", "naomi", "jealousy") > w.relationshipValue("naomi", "sienna", "jealousy"));
  // Graham doesn't know Leila is investigating him; Leila doesn't trust him at all.
  CHECK(w.relationshipValue("leila", "graham", "trust") < 5);
  // Not everyone knows everyone.
  CHECK(w.relationship("harper", "andre") == nullptr);
  CHECK(w.relationship("graham", "sienna") == nullptr);
  // Old grudges colour first impressions in town: Aaliyah warms to Andre slowly.
  REQUIRE(w.connect("andre"));
  REQUIRE(w.connect("aaliyah"));
  walkInto(w, "andre", "heritage_coffee");
  walkInto(w, "aaliyah", "heritage_coffee");
  const double before = w.relationshipValue("aaliyah", "andre", "friendship");
  REQUIRE(w.interact("andre", "compliment", "aaliyah"));
  CHECK(w.relationshipValue("aaliyah", "andre", "friendship") - before < 3);  // grudge halves the gain
}

TEST_CASE("cast: Andre is already a musician; his sets land better than a beginner's") {
  World w = World::createNew(realContent());
  CHECK(w.character("andre")->skills.at("music") == 72);
  CHECK(w.character("dominique")->skills.at("music") == 0);
  REQUIRE(w.connect("andre"));
  REQUIRE(w.connect("dominique"));
  const Json song = Json::parse(R"({"title": "Riverside", "bpm": 90,
      "tracks": [{"instrument": "electric_piano", "notes": [[0,60,8],[8,62,8]]}]})");
  const std::string andreSong = w.saveSong("andre", song, "").value()["id"];
  const std::string domSong = w.saveSong("dominique", song, "").value()["id"];
  walkInto(w, "andre", "low_end_studios");  // his studio is a stage; staff get in any time
  w.advanceMinutes(6 * 60);                  // the public can come in from noon
  walkInto(w, "dominique", "low_end_studios");
  const double pro = w.perform("andre", andreSong).value()["quality"];
  const double beginner = w.perform("dominique", domSong).value()["quality"];
  CHECK(pro > beginner + 30);
}

TEST_CASE("cast: Dominique's life stages follow her reference sheet (19, 24, 29)") {
  const CharacterDef* d = realContent()->character("dominique");
  REQUIRE(d);
  const Json& stages = d->profile["life_stages"];
  REQUIRE(stages.size() == 3);
  CHECK(stages[0]["age"] == 19);
  CHECK(stages[1]["age"] == 24);
  CHECK(stages[2]["age"] == 29);
  CHECK(stages.back()["age"] == d->age);  // the last stage is who she is now
  for (const auto& s : stages) CHECK(s["look"]["jewelry"].get<std::string>().find("gold coin pendant") != std::string::npos);
  CHECK(d->profile["appearance"]["visual_reference"] == "art/reference/characters/dominique_ages.jpg");
  World w = World::createNew(realContent());
  bool heirloom = false;
  for (const Memory* m : w.memoriesOf("dominique")) heirloom |= m->type == "heirloom";
  CHECK(heirloom);
}

// Art for what lives in a save (created residents, named pets) and for places is listed in
// art/manifest.json (D-044). Every path must exist, nobody listed as a resident may be a data character,
// and place and stop ids must be the game's own.
TEST_CASE("art: the manifest links to files that exist and to real ids") {
  const auto root = std::filesystem::path(LIVERA_DATA_DIR).parent_path();
  std::ifstream in(root / "art" / "manifest.json");
  REQUIRE(in.good());
  const Json m = Json::parse(in);
  std::vector<std::string> paths;
  std::function<void(const Json&)> collect = [&](const Json& j) {
    if (j.is_string()) {
      const std::string s = j.get<std::string>();
      if (s.rfind("art/", 0) == 0) paths.push_back(s);
    } else if (j.is_object()) {
      for (const auto& [k, v] : j.items()) {
        if (k != "notes" && k != "$comment") collect(v);
      }
    } else if (j.is_array()) {
      for (const auto& v : j) collect(v);
    }
  };
  collect(m);
  CHECK(paths.size() >= 20);
  for (const auto& p : paths) {
    if (!std::filesystem::exists(root / p)) std::fprintf(stderr, "    art missing: %s\n", p.c_str());
    CHECK(std::filesystem::exists(root / p));
  }
  const auto content = realContent();
  const auto isEntry = [](const std::string& key) { return key != "notes" && key.rfind("$", 0) != 0; };
  for (const auto& [id, r] : m["residents"].items()) {
    if (!isEntry(id)) continue;
    CHECK(content->character(id) == nullptr);  // data characters link their art from data/characters
    CHECK(r.contains("sheet"));
    CHECK(r.contains("avatar"));
  }
  // A sprite sheet is of a founder or of a created resident listed above.
  for (const auto& [id, s] : m["sprite_sheets"].items()) {
    if (!isEntry(id)) continue;
    CHECK((content->character(id) != nullptr || m["residents"].contains(id)));
    CHECK(s.contains("sheet"));
  }
  for (const auto& [key, p] : m["pets"].items()) {
    if (!isEntry(key)) continue;
    const auto colon = key.find(':');
    REQUIRE(colon != std::string::npos);
    CHECK(p["owner"] == key.substr(0, colon));
    CHECK(content->petSpecies(p["species"].get<std::string>()) != nullptr);
  }
  for (const auto& [id, p] : m["places"].items()) {
    if (isEntry(id)) CHECK(content->location(id) != nullptr);
  }
  // An interior is the inside of a real place someone can enter.
  for (const auto& [id, i] : m["interiors"].items()) {
    if (!isEntry(id)) continue;
    const auto* loc = content->location(id);
    REQUIRE(loc != nullptr);
    CHECK(loc->enterable);
  }
  // A unit building is the client's grouping, not a place: what must be real is every unit it stands for.
  for (const auto& [id, b] : m["unit_buildings"].items()) {
    if (!isEntry(id)) continue;
    REQUIRE(b.contains("units"));
    CHECK(!b["units"].empty());
    for (const auto& u : b["units"]) {
      const std::string unit = u.get<std::string>();
      CHECK(unit.rfind(id, 0) == 0);
      CHECK(content->location(unit) != nullptr);
    }
  }
  for (const auto& [id, p] : m["items"].items()) {
    if (isEntry(id)) CHECK(content->item(id) != nullptr);
  }
  std::set<std::string> stops;
  for (const auto& line : content->transit().lines)
    for (const auto& s : line.stops) stops.insert(s.id);
  for (const auto& [id, p] : m["transit"]["stops"].items()) {
    if (isEntry(id)) CHECK(stops.count(id) == 1);
  }
}
