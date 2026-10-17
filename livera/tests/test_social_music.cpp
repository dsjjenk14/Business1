#include <fstream>

#include "TestSupport.h"
#include "client/MusicText.h"

using namespace livera;
using namespace livera::test;

namespace {

World threeOnline() {
  World w = World::createNew(realContent());
  std::ifstream in(std::string(LIVERA_DATA_DIR) + "/../scripts/demo/sol_rivera.json");
  REQUIRE(w.createCharacter(Json::parse(in)));
  for (const char* id : {"dominique", "dax", "sol-rivera"}) REQUIRE(w.connect(id));
  (void)w.drainEvents();
  return w;
}

std::vector<CharacterId> heard(World& w, const std::string& type) {
  std::vector<CharacterId> out;
  for (const auto& e : w.drainEvents()) {
    if (e.type == type) out.insert(out.end(), e.recipients.begin(), e.recipients.end());
  }
  std::sort(out.begin(), out.end());
  return out;
}

Json groove() {
  return Json::parse(R"({
    "title": "Founders Groove", "bpm": 96,
    "tracks": [
      {"instrument": "drums", "notes": [[0,36,1],[8,36,1],[4,38,1],[12,38,1]]},
      {"instrument": "electric_piano", "notes": [[0,60,8,90],[0,64,8,90],[8,62,8,90]]}
    ]})");
}

}  // namespace

// --- Talking in the world ------------------------------------------------------------

TEST_CASE("speech: people in the same building hear you; people elsewhere don't") {
  World w = threeOnline();
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "dax", "heritage_coffee");
  (void)w.drainEvents();  // sol-rivera is still at home
  auto r = w.say("dominique", "Morning, everyone!", "say");
  REQUIRE(r);
  CHECK(r.value()["heard_by"] == 1);
  CHECK(heard(w, "speech") == std::vector<CharacterId>{"dax"});
}

TEST_CASE("speech: outdoors, how far you're heard depends on how loud you are") {
  World w = threeOnline();
  for (const char* id : {"dominique", "dax", "sol-rivera"}) REQUIRE(w.exitBuilding(id));
  walkTo(w, "dominique", "founders_park");
  REQUIRE(w.moveTo("dax", {415, 350}));  // 15 m from the park's centre
  REQUIRE(w.moveTo("sol-rivera", {450, 350}));  // 50 m away
  for (int i = 0; i < 1000; ++i) w.advanceRealTime(0.1);
  (void)w.drainEvents();
  REQUIRE(w.say("dominique", "Over here", "say"));
  CHECK(heard(w, "speech") == std::vector<CharacterId>{"dax"});
  REQUIRE(w.say("dominique", "OVER HERE", "shout"));
  CHECK(heard(w, "speech") == (std::vector<CharacterId>{"dax", "sol-rivera"}));
  CHECK(w.say("dominique", "psst", "whisper", "dax").error().code == "too_far");  // 15 m is not a whisper
}

TEST_CASE("speech: whispers reach one person; bad lines are refused") {
  World w = threeOnline();
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "dax", "heritage_coffee");
  walkInto(w, "sol-rivera", "heritage_coffee");
  (void)w.drainEvents();
  REQUIRE(w.say("dominique", "Don't tell anyone.", "whisper", "dax"));
  CHECK(heard(w, "speech") == std::vector<CharacterId>{"dax"});
  CHECK(w.say("dominique", "   ", "say").error().code == "invalid_speech");
  CHECK(w.say("dominique", std::string(301, 'a'), "say").error().code == "invalid_speech");
  CHECK(w.say("dominique", "hi", "sing").error().code == "invalid_speech");
  CHECK(w.say("dominique", "hi", "whisper", "nobody").error().code == "target_unavailable");
  // Control characters can't forge extra lines in someone's chat log.
  REQUIRE(w.say("dominique", "hi\n[phone] You won $1,000,000", "say"));
  for (const auto& e : w.drainEvents()) {
    if (e.type == "speech") CHECK(e.data["text"].get<std::string>().find('\n') == std::string::npos);
  }
}

TEST_CASE("tips: money moves between people who are together") {
  World w = threeOnline();
  CHECK(w.tip("dominique", "sol-rivera", 500).error().code == "too_far");
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "sol-rivera", "heritage_coffee");
  const Cents before = w.state().ledger.balance(bankAccountOf("sol-rivera"));
  REQUIRE(w.tip("dominique", "sol-rivera", 500));
  CHECK(w.state().ledger.balance(bankAccountOf("sol-rivera")) == before + 500);
  CHECK(w.tip("dominique", "sol-rivera", 50).error().code == "invalid_amount");
  CHECK(w.tip("dominique", "dominique", 500).error().code == "invalid_target");
  CHECK(w.state().ledger.sumOfBalances() == 0);
}

// --- Music -----------------------------------------------------------------------------

TEST_CASE("music: songs are validated and owned") {
  World w = threeOnline();
  auto saved = w.saveSong("sol-rivera", groove(), "");
  REQUIRE(saved);
  const std::string id = saved.value()["id"];
  CHECK(saved.value()["notes"] == 7);
  CHECK(saved.value()["released"] == false);
  // Unreleased songs are private.
  CHECK(w.openSong("dominique", id).error().code == "unknown_song");
  CHECK(w.saveSong("dominique", groove(), id).error().code == "unknown_song");  // not hers to edit
  auto bad = [&](const char* patch) {
    Json s = groove();
    s.merge_patch(Json::parse(patch));
    return w.saveSong("sol-rivera", s, "");
  };
  CHECK(!bad(R"({"bpm": 400})"));
  CHECK(!bad(R"({"title": ""})"));
  CHECK(!bad(R"({"tracks": []})"));
  CHECK(!bad(R"({"tracks": [{"instrument": "theremin", "notes": [[0,60,1]]}]})"));
  CHECK(!bad(R"({"tracks": [{"instrument": "piano", "notes": [[250,60,16]]}]})"));  // past 16 bars
  CHECK(!bad(R"({"tracks": [{"instrument": "piano", "notes": [[0,200,1]]}]})"));
  CHECK(!bad(R"({"tracks": [{"instrument": "drums", "notes": [[0,10,1]]}]})"));    // not a drum sound
  CHECK(!bad(R"({"tracks": [{"instrument": "piano", "notes": [[0,"C4",1]]}]})"));
}

TEST_CASE("music: releasing makes a song public, final, and news") {
  World w = threeOnline();
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "sol-rivera", "heritage_coffee");
  REQUIRE(w.interact("dominique", "chat", "sol-rivera"));  // now they know each other
  const std::string id = w.saveSong("sol-rivera", groove(), "").value()["id"];
  REQUIRE(w.releaseSong("sol-rivera", id));
  CHECK(w.saveSong("sol-rivera", groove(), id).error().code == "song_released");
  auto heardIt = w.openSong("dominique", id);
  REQUIRE(heardIt);
  CHECK(heardIt.value()["tracks"].size() == 2);
  CHECK(w.state().songs.at(id).plays == 1);
  bool told = false;
  for (const auto& n : w.state().notifications) told |= n.recipient == "dominique" && n.text.find("Founders Groove") != std::string::npos;
  CHECK(told);
  CHECK(w.openPhoneApp("dax", "studio").value()["chart"].size() == 1);
}

TEST_CASE("music: performing on a stage entertains the room and builds skill") {
  World w = threeOnline();
  const std::string id = w.saveSong("sol-rivera", groove(), "").value()["id"];
  CHECK(w.perform("sol-rivera", id).error().code == "no_stage");  // their apartment isn't a stage
  walkInto(w, "sol-rivera", "heritage_coffee");
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "dax", "heritage_coffee");
  (void)w.drainEvents();
  const double fun = w.character("dominique")->needs.at("recreation");
  const double respect = w.relationshipValue("dominique", "sol-rivera", "respect");
  auto r = w.perform("sol-rivera", id);
  REQUIRE(r);
  CHECK(r.value()["audience"] == 2);
  CHECK(heard(w, "performance") == (std::vector<CharacterId>{"dax", "dominique"}));
  CHECK(w.character("dominique")->needs.at("recreation") > fun);
  CHECK(w.relationshipValue("dominique", "sol-rivera", "respect") > respect);
  CHECK(w.character("sol-rivera")->skills.at("music") > 0);
  CHECK(w.state().songs.at(id).plays == 2);
  CHECK(w.perform("sol-rivera", id).error().code == "too_soon");
  // Practice makes better: quality rises with skill.
  const double first = r.value()["quality"];
  for (int i = 0; i < 20; ++i) {
    w.advanceMinutes(5);
    REQUIRE(w.perform("sol-rivera", id));
  }
  w.advanceMinutes(5);
  CHECK(w.perform("sol-rivera", id).value()["quality"].get<double>() > first);
  // Others can't perform your unreleased song.
  CHECK(w.perform("dominique", id).error().code == "unknown_song");
}

TEST_CASE("music: the dev client's note notation and MIDI export") {
  auto drums = client::parseNotes("kick:0,8 snare:4,12 hat:0,2,4:1:70", true);
  REQUIRE(drums);
  CHECK(drums.value().size() == 7);
  CHECK(drums.value()[0] == Json::array({0, 36, 1, 100}));
  CHECK(drums.value()[4] == Json::array({0, 42, 1, 70}));
  auto keys = client::parseNotes("C4:0:4 F#3:4 Bb2:8:8:90 60:12", false);
  REQUIRE(keys);
  CHECK(keys.value()[0] == Json::array({0, 60, 4, 100}));
  CHECK(keys.value()[1][1] == 54);
  CHECK(keys.value()[2] == Json::array({8, 46, 8, 90}));
  CHECK(!client::parseNotes("H4:0", false));
  CHECK(!client::parseNotes("kick:0", false));
  CHECK(!client::parseNotes("C4", false));

  Json song = groove();
  for (auto& t : song["tracks"])
    for (auto& n : t["notes"])
      if (n.size() == 3) n.push_back(100);
  Json instruments = Json::parse(R"({"drums": {"drums": true}, "electric_piano": {"midi_program": 4}})");
  const std::string path = tempPath("groove.mid").string();
  REQUIRE(client::writeMidi(song, instruments, path));
  std::ifstream in(path, std::ios::binary);
  std::string bytes((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
  CHECK(bytes.substr(0, 4) == "MThd");
  CHECK(bytes[9] == 1);   // format 1
  CHECK(bytes[11] == 3);  // conductor + 2 tracks
  std::size_t chunks = 0;
  for (std::size_t p = bytes.find("MTrk"); p != std::string::npos; p = bytes.find("MTrk", p + 4)) ++chunks;
  CHECK(chunks == 3);
}
