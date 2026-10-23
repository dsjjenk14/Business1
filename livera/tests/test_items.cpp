#include "TestSupport.h"
#include "core/Clock.h"
#include "core/Serialization.h"

using namespace livera;
using namespace livera::test;

namespace {

std::shared_ptr<const ContentDatabase> quietContent(const std::function<void(Json&, const std::string&)>& extra = {}) {
  return patchedContent([&](Json& doc, const std::string& file) {
    if (file == "conditions.json") {
      for (auto& c : doc["conditions"]) {
        if (c.contains("catch")) c["catch"] = Json{{"hourly_chance", 0.0}};
      }
    }
    if (extra) extra(doc, file);
  });
}

World shopWorld(std::shared_ptr<const ContentDatabase> db = quietContent()) {
  World w = World::createNew(std::move(db));
  REQUIRE(w.connect("dominique"));
  REQUIRE(w.connect("aaliyah"));
  w.advanceMinutes(3 * 60);  // 10:00: every shop is open
  (void)w.drainEvents();
  return w;
}

void walkToPoint(World& w, const CharacterId& who, Vec2 at) {
  if (!w.character(who)->inside.empty()) (void)w.exitBuilding(who);
  REQUIRE(w.moveTo(who, at));
  for (int i = 0; i < 3000 && w.character(who)->moveTarget; ++i) w.advanceRealTime(0.1);
}

}  // namespace

TEST_CASE("items: buying clothes puts them in your closet; wearing them changes how you come across") {
  World w = shopWorld();
  walkInto(w, "dominique", "thread_co");
  auto bought = w.buy("dominique", "evening_outfit", "card");
  REQUIRE(bought);
  CHECK(bought.value().at("owned") == 1);
  CHECK(w.owns("dominique", "evening_outfit"));
  Json items = w.openPhoneApp("dominique", "items").value();
  CHECK(items.at("items").at(0).at("label") == "Evening outfit");
  CHECK(items.at("style") == 0);
  auto worn = w.wear("dominique", "evening_outfit");
  REQUIRE(worn);
  CHECK(worn.value().at("outfit") == "evening_outfit");
  CHECK(worn.value().at("style").get<double>() > 0);
  CHECK(w.wear("dominique", "tailored_blazer").error().code == "not_owned");
  CHECK(w.useItem("dominique", "evening_outfit").error().code == "not_usable");
  REQUIRE(w.takeOff("dominique", "outfit"));
  CHECK(w.character("dominique")->outfit.empty());
}

TEST_CASE("items: headphones and laptops are things you use; they unlock what you can do") {
  World w = shopWorld();
  walkInto(w, "dominique", "circuit_electronics");
  CHECK(!w.unlocked("dominique", "study_online"));
  REQUIRE(w.buy("dominique", "laptop", "card"));
  REQUIRE(w.buy("dominique", "headphones", "card"));
  CHECK(w.unlocked("dominique", "study_online"));
  CHECK(w.unlocked("dominique", "music_on_the_go"));
  REQUIRE(w.exitBuilding("dominique"));
  const double rec = w.character("dominique")->needs.at("recreation");
  auto r = w.useItem("dominique", "headphones");  // works anywhere, even out on the street
  REQUIRE(r);
  CHECK(w.character("dominique")->needs.at("recreation") > rec);
  CHECK(w.useItem("dominique", "headphones").error().code == "too_soon");
  CHECK(w.owns("dominique", "headphones"));  // not used up
}

TEST_CASE("items: medicine eases illness and is used up") {
  World w = shopWorld();
  REQUIRE(w.devAddCondition("dominique", "common_cold"));
  const GameMinutes until = w.character("dominique")->conditions.at(0).until;
  walkInto(w, "dominique", "riverdale_pharmacy");
  auto r = w.buy("dominique", "cold_medicine", "card");
  REQUIRE(r);
  CHECK(r.value().at("owned") == 3);
  auto used = w.useItem("dominique", "cold_medicine");
  REQUIRE(used);
  CHECK(used.value().at("left") == 2);
  if (w.hasCondition("dominique", "common_cold"))
    CHECK(w.character("dominique")->conditions.at(0).until == until - 24 * 60);
}

TEST_CASE("items: prescriptions need a diagnosis") {
  World w = shopWorld();
  walkInto(w, "dominique", "riverdale_pharmacy");
  CHECK(w.buy("dominique", "antidepressants", "card").error().code == "needs_prescription");
  REQUIRE(w.devAddCondition("dominique", "depression"));
  CHECK(w.buy("dominique", "antidepressants", "card").error().code == "needs_prescription");  // not diagnosed yet
  walkInto(w, "dominique", "riverdale_clinic");
  REQUIRE(w.buy("dominique", "checkup", "card"));
  walkInto(w, "dominique", "riverdale_pharmacy");
  REQUIRE(w.buy("dominique", "antidepressants", "card"));
  const double before = w.character("dominique")->conditions.at(0).recovery;  // good hours help a little too
  REQUIRE(w.useItem("dominique", "antidepressants"));
  CHECK(w.character("dominique")->conditions.at(0).recovery == before + 8);
  CHECK(w.useItem("dominique", "antidepressants").error().code == "too_soon");  // once a day
}

TEST_CASE("items: you can give things to someone you're with") {
  World w = shopWorld();
  walkInto(w, "dominique", "ellis_atelier");
  REQUIRE(w.buy("dominique", "silk_scarf", "card"));
  REQUIRE(w.wear("dominique", "silk_scarf"));
  CHECK(w.giveItem("dominique", "aaliyah", "silk_scarf").error().code == "too_far");
  walkInto(w, "aaliyah", "ellis_atelier");
  const double before = w.relationshipValue("aaliyah", "dominique", "friendship");
  REQUIRE(w.giveItem("dominique", "aaliyah", "silk_scarf"));
  CHECK(!w.owns("dominique", "silk_scarf"));
  CHECK(w.character("dominique")->accessory.empty());  // you can't keep wearing what you gave away
  CHECK(w.owns("aaliyah", "silk_scarf"));
  CHECK(w.relationshipValue("aaliyah", "dominique", "friendship") > before);
}

TEST_CASE("items: the salon keeps you groomed") {
  World w = shopWorld();
  walkInto(w, "dominique", "fade_glow");
  const double before = w.character("dominique")->needs.at("grooming");
  REQUIRE(w.buy("dominique", "haircut", "card"));
  CHECK(w.character("dominique")->needs.at("grooming") > before);
}

TEST_CASE("transit: the bus is faster than walking and costs a fare") {
  World w = shopWorld();
  const auto& line = w.content().transit().lines.at(0);
  Vec2 riverside{}, maple{};
  for (const auto& st : line.stops) {
    if (st.id == "stop_riverside") riverside = st.at;
    if (st.id == "stop_maple_court") maple = st.at;
  }
  REQUIRE(w.exitBuilding("dominique"));
  CHECK(w.ride("dominique", "stop_riverside", true).error().code == "not_at_stop");
  walkToPoint(w, "dominique", maple);
  const Cents bank = w.state().ledger.balance(bankAccountOf("dominique"));
  auto r = w.ride("dominique", "stop_riverside", true);
  REQUIRE(r);
  CHECK(w.state().ledger.balance(bankAccountOf("dominique")) == bank - line.fareCents);
  const double walkEta = distance(maple, riverside) / w.content().sim().walkSpeedMetersPerSecond;
  CHECK(r.value().at("eta_seconds").get<double>() < walkEta / 3);
  CHECK(w.moveTo("dominique", maple).error().code == "riding");  // no stepping off a moving bus
  for (int i = 0; i < 400 && w.character("dominique")->moveTarget; ++i) w.advanceRealTime(0.1);
  CHECK(distance(w.character("dominique")->position, riverside) < 0.01);
  CHECK(w.ride("dominique", "stop_riverside", true).error().code == "already_here");
  REQUIRE(w.moveTo("dominique", maple));  // walking again at normal speed
}

TEST_CASE("transit: no buses in the small hours") {
  World w = shopWorld();
  const auto& stop = w.content().transit().lines.at(0).stops.at(2);
  walkToPoint(w, "dominique", stop.at);
  w.advanceMinutes(16 * 60);  // 02:00
  CHECK(w.ride("dominique", "stop_riverside", true).error().code == "no_service");
}

TEST_CASE("transit: riding without paying works until an inspector catches you") {
  auto run = [](double inspection) {
    World w = shopWorld(quietContent([&](Json& doc, const std::string& file) {
      if (file == "transit.json") doc["transit"]["lines"][0]["inspection_chance"] = inspection;
    }));
    walkToPoint(w, "dominique", w.content().transit().lines.at(0).stops.at(2).at);
    const Cents bank = w.state().ledger.balance(bankAccountOf("dominique"));
    auto r = w.ride("dominique", "stop_riverside", false);
    REQUIRE(r);
    return std::tuple{r.value(), bank - w.state().ledger.balance(bankAccountOf("dominique")), w.character("dominique")->record.size(),
                      w.character("dominique")->moveTarget.has_value()};
  };
  auto [free, paidFree, recordFree, movingFree] = run(0.0);
  CHECK(free.at("evaded") == true);
  CHECK(paidFree == 0);
  CHECK(recordFree == 0);
  CHECK(movingFree);
  auto [caught, fine, record, moving] = run(1.0);
  CHECK(caught.at("caught") == true);
  CHECK(fine == 10000);
  CHECK(record == 1);
  CHECK(!moving);  // put off the bus
}

TEST_CASE("items: what you own, what you wear and your record are saved") {
  World w = shopWorld();
  walkInto(w, "dominique", "thread_co");
  REQUIRE(w.buy("dominique", "sunglasses", "card"));
  REQUIRE(w.wear("dominique", "sunglasses"));
  CharacterState c = w.character("dominique") ? *w.character("dominique") : CharacterState{};
  c.record.push_back(CrimeRecordEntry{"fare_evasion", 600, 10000, 0});
  const CharacterState back = characterStateFromJson(toJson(c));
  CHECK(back.inventory == c.inventory);
  CHECK(back.accessory == "sunglasses");
  REQUIRE(back.record.size() == 1);
  CHECK(back.record.at(0).crime == "fare_evasion");
  CHECK(back.record.at(0).fineCents == 10000);
}
