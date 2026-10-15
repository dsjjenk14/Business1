#include <fstream>

#include "TestSupport.h"
#include "core/Clock.h"
#include "core/Serialization.h"

using namespace livera;
using namespace livera::test;

namespace {

std::shared_ptr<const ContentDatabase> schoolContent(double bachelorsHours = 400, double minGrade = 55) {
  return patchedContent([=](Json& doc, const std::string& file) {
    if (file == "conditions.json") {
      for (auto& c : doc["conditions"]) {
        if (c.contains("catch")) c["catch"] = Json{{"hourly_chance", 0.0}};
      }
    }
    if (file == "education.json") {
      for (auto& p : doc["education"]["programs"]) {
        if (p["id"] == "bachelors") p["hours_required"] = bachelorsHours, p["min_grade"] = minGrade;
      }
    }
  });
}

World schoolWorld(std::shared_ptr<const ContentDatabase> db = schoolContent()) {
  World w = World::createNew(std::move(db));
  for (const char* id : {"dominique", "andre"}) REQUIRE(w.connect(id));
  w.advanceMinutes(60);  // 08:00
  (void)w.drainEvents();
  return w;
}

Json sheet(const std::string& first, const std::string& education) {
  std::ifstream in(std::string(LIVERA_DATA_DIR) + "/../scripts/demo/sol_rivera.json");
  Json s = Json::parse(in);
  s["first_name"] = first;
  s["education"] = education;
  return s;
}

}  // namespace

TEST_CASE("school: enroll in person; programs have prerequisites") {
  World w = schoolWorld();
  CHECK(w.hasDegree("dominique", "bachelors"));  // from her background
  CHECK(!w.hasDegree("andre", "bachelors"));      // left college to tour
  CHECK(w.enroll("dominique", "law_school").error().code == "wrong_place");
  walkInto(w, "dominique", "livera_university");
  walkInto(w, "andre", "livera_university");
  CHECK(w.enroll("andre", "law_school").error().code == "missing_degree");
  CHECK(w.enroll("dominique", "bachelors").error().code == "already_graduated");
  auto r = w.enroll("dominique", "law_school");
  REQUIRE(r);
  CHECK(r.value().at("hours_required") == 300);
  CHECK(w.enroll("dominique", "medical_school").error().code == "already_enrolled");
  REQUIRE(w.enroll("andre", "bachelors"));
  auto dropped = w.enroll("andre", "");
  REQUIRE(dropped);
  CHECK(w.character("andre")->education.program.empty());
}

TEST_CASE("school: study sessions cost tuition, earn hours and a grade") {
  World w = schoolWorld();
  walkInto(w, "andre", "livera_university");
  REQUIRE(w.enroll("andre", "bachelors"));
  REQUIRE(w.startStudy("andre"));
  CHECK(w.startStudy("andre").error().code == "already_studying");
  const Cents bank = w.state().ledger.balance(bankAccountOf("andre"));
  w.advanceMinutes(3 * 60);
  auto r = w.endStudy("andre");
  REQUIRE(r);
  CHECK(r.value().at("hours_credited") == 3);
  CHECK(r.value().at("tuition_cents") == 3 * 4000);
  CHECK(w.state().ledger.balance(bankAccountOf("andre")) == bank - 12000);
  CHECK(r.value().at("grade").get<double>() > 0);
  CHECK(w.character("andre")->education.hours == 3);
  // Leaving campus ends a session.
  REQUIRE(w.startStudy("andre"));
  w.advanceMinutes(45);
  auto left = w.exitBuilding("andre");
  REQUIRE(left);
  CHECK(left.value().contains("study"));
  CHECK(!w.character("andre")->education.sessionStartedAt);
}

TEST_CASE("school: some programs can be studied at home, with a laptop") {
  World w = schoolWorld();
  walkInto(w, "andre", "livera_university");
  REQUIRE(w.enroll("andre", "bachelors"));
  walkInto(w, "andre", "riverside_lofts_2");
  CHECK(w.startStudy("andre").error().code == "wrong_place");  // no laptop yet
  w.advanceMinutes(60);  // Circuit opens at 10
  walkInto(w, "andre", "circuit_electronics");
  REQUIRE(w.buy("andre", "laptop", "card"));
  walkInto(w, "andre", "riverside_lofts_2");
  REQUIRE(w.startStudy("andre"));
}

TEST_CASE("school: finish the hours with good grades and you graduate") {
  World w = schoolWorld(schoolContent(/*bachelorsHours=*/2));
  walkInto(w, "andre", "livera_university");
  REQUIRE(w.enroll("andre", "bachelors"));
  REQUIRE(w.startStudy("andre"));
  w.advanceMinutes(2 * 60 + 5);
  auto r = w.endStudy("andre");
  REQUIRE(r);
  CHECK(r.value().at("graduated") == "Bachelor's degree");
  CHECK(w.hasDegree("andre", "bachelors"));
  CHECK(w.character("andre")->education.program.empty());
  bool remembered = false;
  for (const Memory* m : w.memoriesOf("andre")) remembered |= m->type == "graduation";
  CHECK(remembered);
}

TEST_CASE("school: low grades keep you from graduating until you bring them up") {
  World w = schoolWorld(schoolContent(/*bachelorsHours=*/1, /*minGrade=*/99));
  walkInto(w, "andre", "livera_university");
  REQUIRE(w.enroll("andre", "bachelors"));
  REQUIRE(w.startStudy("andre"));
  w.advanceMinutes(70);
  auto r = w.endStudy("andre");
  REQUIRE(r);
  CHECK(!r.value().contains("graduated"));
  CHECK(r.value().at("note").get<std::string>().find("below 99") != std::string::npos);
  CHECK(!w.hasDegree("andre", "bachelors"));
}

TEST_CASE("jobs: apply in person; some jobs need a degree or a clean record") {
  World w = schoolWorld();
  CHECK(w.applyForJob("andre", "retail").error().code == "wrong_place");
  w.advanceMinutes(60);  // 09:00: Thread & Co. opens
  walkTo(w, "andre", "thread_co");
  auto hired = w.applyForJob("andre", "retail");  // at the door is enough
  REQUIRE(hired);
  CHECK(hired.value().at("title") == "Sales Associate");
  CHECK(w.character("andre")->career.careerId == "retail");
  CHECK(w.character("andre")->career.level == 0);
  CHECK(w.applyForJob("andre", "retail").error().code == "already_hired");
  walkTo(w, "andre", "livera_university");
  CHECK(w.applyForJob("andre", "teaching").error().code == "missing_degree");
  walkTo(w, "dominique", "livera_university");
  REQUIRE(w.applyForJob("dominique", "teaching"));  // she has a bachelor's
  walkTo(w, "dominique", "hale_partners");
  CHECK(w.applyForJob("dominique", "law").error().code == "missing_degree");
  // Work the new job: paid at the new rate.
  walkInto(w, "andre", "thread_co");
  REQUIRE(w.startShift("andre"));
  w.advanceMinutes(2 * 60);
  auto shift = w.endShift("andre");
  REQUIRE(shift);
  CHECK(shift.value().at("pay_cents") == 2 * 1700);
}

TEST_CASE("jobs: the police academy and the police want a clean record") {
  World w = schoolWorld(schoolContent());
  // Andre gets caught riding without a ticket.
  World caught(patchedContent([](Json& doc, const std::string& file) {
                 if (file == "transit.json") doc["transit"]["lines"][0]["inspection_chance"] = 1.0;
               }),
               w.state());
  const auto& stop = caught.content().transit().lines.at(0).stops.at(0);
  REQUIRE(caught.exitBuilding("andre"));
  REQUIRE(caught.moveTo("andre", stop.at));
  for (int i = 0; i < 3000 && caught.character("andre")->moveTarget; ++i) caught.advanceRealTime(0.1);
  REQUIRE(caught.ride("andre", "stop_maple_court", false));
  REQUIRE(caught.character("andre")->record.size() == 1);
  walkTo(caught, "andre", "police_station");
  CHECK(caught.enroll("andre", "police_academy").error().code == "criminal_record");
  walkTo(caught, "dominique", "police_station");
  CHECK(caught.applyForJob("dominique", "police").error().code == "missing_degree");
  CHECK(caught.enter("dominique", "police_station").error().code == "no_access");  // staff only
  REQUIRE(caught.enroll("dominique", "police_academy"));                              // enrolling happens at the door
  REQUIRE(caught.enter("dominique", "police_station"));                               // cadets can get in
  REQUIRE(caught.startStudy("dominique"));
}

TEST_CASE("jobs: the character creator's education counts") {
  World w = World::createNew(schoolContent());
  auto doc = w.createCharacter(sheet("Ana", "medical degree"));
  REQUIRE(doc);
  CHECK(w.hasDegree(doc.value(), "md"));
  CHECK(w.hasDegree(doc.value(), "bachelors"));
  auto hs = w.createCharacter(sheet("Bo", "high school"));
  REQUIRE(hs);
  CHECK(!w.hasDegree(hs.value(), "bachelors"));
}

TEST_CASE("jobs: a doctor on duty sees patients and earns a share of the care") {
  World w = World::createNew(schoolContent());
  auto doc = w.createCharacter(sheet("Ana", "medical degree"));
  REQUIRE(doc);
  const CharacterId ana = doc.value();
  REQUIRE(w.connect(ana));
  REQUIRE(w.connect("dominique"));
  walkTo(w, ana, "livera_general");
  REQUIRE(w.applyForJob(ana, "medicine"));
  walkInto(w, ana, "livera_general");
  REQUIRE(w.startShift(ana));
  const Cents before = w.state().ledger.balance(bankAccountOf(ana));
  REQUIRE(w.devAddCondition("dominique", "flu"));
  walkInto(w, "dominique", "livera_general");
  auto er = w.buy("dominique", "emergency_care", "card");  // the ER diagnoses and treats in one visit
  REQUIRE(er);
  CHECK(!w.hasCondition("dominique", "flu"));
  CHECK(er.value().at("seen_by").at(0) == "Ana Rivera");
  CHECK(w.state().ledger.balance(bankAccountOf(ana)) == before + 45000 * 15 / 100);
  CHECK(w.state().ledger.sumOfBalances() == 0);
}

TEST_CASE("school: education is saved") {
  World w = schoolWorld();
  walkInto(w, "andre", "livera_university");
  REQUIRE(w.enroll("andre", "bachelors"));
  CharacterState c = *w.character("andre");
  c.education.hours = 12.5;
  c.education.gradeSum = 800;
  const CharacterState back = characterStateFromJson(toJson(c));
  CHECK(back.education.program == "bachelors");
  CHECK(back.education.hours == 12.5);
  CHECK(back.education.gradeSum == 800);
  CHECK(back.education.degrees == c.education.degrees);
}
