// The court (D-083): charges and court dates from an arrest or a report, the hearing in the courthouse, pleas, lawyers,
// the odds the court shows and rolls, verdicts and sentences (a fine to the town, community service, probation, a
// cell), the record and who sees it, warrants for a missed hearing, hearings put off while nobody plays the accused,
// and the content checks.

#include <cmath>
#include <fstream>

#include "TestSupport.h"
#include "core/Clock.h"
#include "core/Serialization.h"

using namespace livera;
using namespace livera::test;

namespace {

void setCrime(Json& crime, const std::string& id, double detection) {
  for (auto& c : crime["crimes"]) {
    if (c["id"] == id) c["detection"] = detection, c["per_witness"] = 0.0, c["per_staff"] = 0.0, c["per_police"] = 0.0;
  }
}

// Shoplifting always caught, quiet health; `court` patches data/society/court.json's "court", `extra` any file.
std::shared_ptr<const ContentDatabase> courtContent(const std::function<void(Json&)>& court = {},
                                                    const std::function<void(Json&, const std::string&)>& extra = {}) {
  return patchedContent([&](Json& doc, const std::string& file) {
    if (file == "conditions.json") {
      for (auto& c : doc["conditions"]) {
        if (c.contains("catch")) c["catch"] = Json{{"hourly_chance", 0.0}};
      }
    }
    if (file == "crimes.json") setCrime(doc["crime"], "shoplifting", 1.0);
    if (file == "court.json" && court) court(doc["court"]);
    if (extra) extra(doc, file);
  });
}

Result<std::shared_ptr<const ContentDatabase>> loadWith(const std::function<void(Json&)>& court) {
  std::vector<std::filesystem::path> files;
  for (const auto& e : std::filesystem::recursive_directory_iterator(LIVERA_DATA_DIR)) {
    if (e.path().extension() == ".json") files.push_back(e.path());
  }
  std::sort(files.begin(), files.end());
  std::vector<std::pair<std::string, Json>> docs;
  for (const auto& f : files) {
    std::ifstream in(f);
    Json doc = Json::parse(in);
    if (f.filename() == "court.json") court(doc["court"]);
    docs.emplace_back(f.filename().string(), std::move(doc));
  }
  return ContentDatabase::loadFromDocuments(docs);
}

World courtWorld(std::shared_ptr<const ContentDatabase> db, const std::vector<std::string>& who = {"dominique", "aaliyah", "andre"}) {
  World w = World::createNew(std::move(db));
  for (const auto& id : who) REQUIRE(w.connect(id));
  w.advanceMinutes(3 * 60);  // Monday 10:00
  (void)w.drainEvents();
  return w;
}

void advanceTo(World& w, GameMinutes t) {
  if (t > w.now()) w.advanceMinutes(t - w.now());
}

bool notified(const World& w, const CharacterId& id, const std::string& fragment) {
  for (const auto& n : w.state().notifications) {
    if (n.recipient == id && n.text.find(fragment) != std::string::npos) return true;
  }
  return false;
}

std::vector<Json> eventsFor(const std::vector<WorldEvent>& events, const CharacterId& id, const std::string& type) {
  std::vector<Json> out;
  for (const auto& e : events) {
    if (e.type == type && std::find(e.recipients.begin(), e.recipients.end(), id) != e.recipients.end()) out.push_back(e.data);
  }
  return out;
}

std::string code(const Result<Json>& r) { return r ? std::string("ok") : r.error().code; }

// Andre is caught shoplifting at Thread & Co. (Aaliyah there to see it); returns the case id.
std::string caughtShoplifting(World& w, const CharacterId& thief = "andre", const CharacterId& witness = "aaliyah") {
  if (!witness.empty()) walkInto(w, witness, "thread_co");
  walkInto(w, thief, "thread_co");
  auto r = w.steal(thief, "sunglasses");
  REQUIRE(r);
  REQUIRE(r.value().at("caught") == true);
  return r.value().at("court").at("case").get<std::string>();
}

// Out of the cell when booking ends, into the courthouse, and the clock to the hearing.
void toHearing(World& w, const std::string& caseId, const CharacterId& who = "andre") {
  const CourtCase* k = w.courtCase(caseId);
  REQUIRE(k);
  advanceTo(w, w.character(who)->jailedUntil + 61);  // released on the hour
  REQUIRE(!w.inJail(who));
  advanceTo(w, w.courtCase(caseId)->hearingAt - 50);  // a hearing the next day: go when the courthouse is open
  walkInto(w, who, "courthouse");
  // A long walk can arrive late (within the grace): the court sees you the next minute.
  advanceTo(w, std::max(w.courtCase(caseId)->hearingAt, w.now() + 1));
}

Cents bank(const World& w, const CharacterId& id) { return w.state().ledger.balance(bankAccountOf(id)); }

}  // namespace

TEST_CASE("court: content: the courthouse, the sittings, the lawyers and the sentences are checked") {
  REQUIRE(loadWith([](Json&) {}));
  auto refused = [](const std::function<void(Json&)>& patch, const std::string& fragment) {
    auto r = loadWith(patch);
    if (r) return false;
    if (r.error().message.find(fragment) == std::string::npos) std::fprintf(stderr, "    got: %s\n", r.error().message.c_str());
    return r.error().message.find(fragment) != std::string::npos;
  };
  CHECK(refused([](Json& c) { c["courthouse"] = "nowhere"; }, "the courthouse must be"));
  CHECK(refused([](Json& c) { c["courthouse"] = "police_station"; }, "the courthouse must be"));  // staff only
  CHECK(refused([](Json& c) { c["sitting"]["hours"] = Json::array({7, 17}); }, "only while the courthouse is open"));
  CHECK(refused([](Json& c) { c["fines_account"] = "org:nope"; }, "fines_account"));
  CHECK(refused([](Json& c) { c["evidence"]["per_witness"] = 2; }, "chances from 0 to 1"));
  CHECK(refused([](Json& c) { c["evidence"]["min"] = 0.9; c["evidence"]["max"] = 0.5; }, "evidence.min"));
  CHECK(refused([](Json& c) { c["lawyers"]["lawyer_careers"] = Json::array({"nope"}); }, "unknown lawyer career"));
  CHECK(refused([](Json& c) { c["lawyers"]["firm"]["account"] = "org:nope"; }, "lawyers.firm"));
  CHECK(refused([](Json& c) { c["community_service"]["place"] = "founders_park"; }, "community_service.place"));
  CHECK(refused([](Json& c) { c["sentences"]["jaywalking"] = Json::array({{{"fine_cents", 100}}}); }, "unknown crime 'jaywalking'"));
  CHECK(refused([](Json& c) { c["sentences"]["shoplifting"] = Json::array(); }, "at least one sentence"));
  CHECK(refused([](Json& c) { c["sentences"]["shoplifting"] = Json::array({Json::object()}); }, "must be something"));
  CHECK(refused([](Json& c) { c["guilty_plea_discount"] = 1; }, "guilty_plea_discount"));
}

TEST_CASE("court: caught shoplifting: booked and held, charged with a court date in the sittings; no fine, no record yet") {
  World w = courtWorld(courtContent());
  const Cents before = bank(w, "andre");
  walkInto(w, "aaliyah", "thread_co");
  walkInto(w, "andre", "thread_co");
  const GameMinutes at = w.now();
  auto r = w.steal("andre", "sunglasses");
  REQUIRE(r);
  CHECK(r.value()["caught"] == true);
  CHECK(r.value()["fine_cents"] == 0);
  CHECK(r.value()["jail_minutes"] == 120);  // booked
  const Json& booked = r.value()["court"];
  CHECK(booked["charges"] == Json::array({"Shoplifting"}));
  CHECK(booked["courthouse"] == "Livéra Municipal Court");
  CHECK(booked["remanded"] == false);
  const CourtCase* k = w.courtCase(booked["case"]);
  REQUIRE(k);
  CHECK(k->status == "summoned");
  CHECK(k->how == "caught");
  CHECK(k->place == "thread_co");
  CHECK(k->witnesses == std::vector<CharacterId>{"aaliyah"});
  CHECK(k->staff.empty());
  CHECK(k->police.empty());
  // The court date: a slot of the sittings (Monday to Saturday, 09:00-17:00, every 30 minutes), at least four hours on.
  CHECK(k->hearingAt >= at + 240);
  const DateTime d = toDateTime(k->hearingAt);
  CHECK(d.hour >= 9);
  CHECK(d.hour < 17);
  CHECK(d.minute % 30 == 0);
  CHECK(d.weekday <= 5);
  CHECK(w.inJail("andre"));
  CHECK(w.character("andre")->inside == "police_station");
  CHECK(w.character("andre")->record.empty());  // charged, not convicted
  CHECK(bank(w, "andre") == before);
  CHECK(notified(w, "andre", "You're charged with Shoplifting. Your hearing is"));
  // Your own business: look, the calendar and the court app.
  const Json you = w.look("andre").value()["you"];
  CHECK(you["court"]["case"] == k->id);
  CHECK(you["court"]["status"] == "summoned");
  CHECK(you["court"]["hearing_at"] == k->hearingAt);
  bool listed = false;
  const Json calendar = w.openPhoneApp("andre", "calendar").value();  // kept alive while it's iterated
  for (const auto& u : calendar["upcoming"]) listed |= u.value("kind", "") == "court" && u["at"] == k->hearingAt;
  CHECK(listed);
  const Json app = w.openPhoneApp("andre", "court").value();
  REQUIRE(app["cases"].size() == 1);
  CHECK(app["cases"][0]["odds"]["convicted_if_not_guilty"] == 0.61);  // caught 0.55, one witness 0.06
  CHECK(app["cases"][0]["if_convicted"]["fine_cents"] == 25000);
  CHECK(app["cases"][0]["if_guilty_plea"]["fine_cents"] == 16500);  // a third off
  CHECK(!app.contains("docket"));
  // Released when booking is over, with the date.
  advanceTo(w, w.character("andre")->jailedUntil + 61);
  CHECK(!w.inJail("andre"));
  CHECK(notified(w, "andre", "You're free to go until your hearing"));
  CHECK(w.state().ledger.sumOfBalances() == 0);
}

TEST_CASE("court: plead guilty: convicted at once with the discount, fined to the town, on the record") {
  World w = courtWorld(courtContent());
  const std::string id = caughtShoplifting(w);
  toHearing(w, id);
  const CourtCase* k = w.courtCase(id);
  REQUIRE(k->status == "hearing");
  const auto events = w.drainEvents();
  const auto hearing = eventsFor(events, "andre", "court_hearing");
  REQUIRE(hearing.size() == 1);
  CHECK(hearing[0]["pleas"] == Json::array({"guilty", "not_guilty"}));
  CHECK(hearing[0]["odds"]["final"] == true);
  const Cents before = bank(w, "andre");
  const Cents town = w.state().ledger.balance("org:town_of_livera");
  auto v = w.courtPlea("andre", id, "guilty");
  REQUIRE(v);
  CHECK(v.value()["verdict"] == "convicted");
  CHECK(v.value()["plea"] == "guilty");
  CHECK(v.value()["sentence"]["fine_cents"] == 16500);
  CHECK(bank(w, "andre") == before - 16500);
  CHECK(w.state().ledger.balance("org:town_of_livera") == town + 16500);
  REQUIRE(w.character("andre")->record.size() == 1);
  CHECK(w.character("andre")->record[0].crime == "shoplifting");
  CHECK(w.character("andre")->record[0].caseId == id);
  CHECK(w.character("andre")->record[0].fineCents == 16500);
  CHECK(w.employersSeeRecord(*w.character("andre")));
  const Json rec = w.openPhoneApp("andre", "record").value();
  CHECK(rec["record"][0]["kind"] == "conviction");
  CHECK(rec["record"][0]["employers_see"] == true);
  CHECK(rec["record"][0]["sentence"] == "a $165.00 fine");
  CHECK(k->status == "decided");
  CHECK(w.courtPlea("andre", id, "guilty").error().code == "already_decided");
  CHECK(w.state().ledger.sumOfBalances() == 0);
  const auto verdict = eventsFor(w.drainEvents(), "andre", "court_verdict");
  REQUIRE(!verdict.empty());
  CHECK(verdict[0]["verdict"] == "convicted");
}

TEST_CASE("court: not guilty: the chance shown is the chance ruled on; dismissed leaves nothing on the record") {
  for (const double chance : {0.0, 1.0}) {
    World w = courtWorld(courtContent([&](Json& c) {
      c["evidence"]["min"] = chance;
      c["evidence"]["max"] = chance;
    }));
    const std::string id = caughtShoplifting(w);
    toHearing(w, id);
    const Json view = w.openPhoneApp("andre", "court").value()["cases"][0];
    CHECK(view["odds"]["convicted_if_not_guilty"] == chance);
    auto v = w.courtPlea("andre", id, "not_guilty");
    REQUIRE(v);
    CHECK(v.value()["chance"] == chance);
    CHECK(v.value()["verdict"] == (chance == 1.0 ? "convicted" : "dismissed"));
    CHECK(w.character("andre")->record.size() == (chance == 1.0 ? 1u : 0u));
    if (chance == 1.0) CHECK(v.value()["sentence"]["fine_cents"] == 25000);  // the full sentence
    else CHECK(notified(w, "andre", "is dismissed"));
  }
}

TEST_CASE("court: the odds count who saw it, who came to the hearing, the victim and the lawyer") {
  World w = courtWorld(courtContent());
  const std::string id = caughtShoplifting(w);
  auto odds = [&] { return w.openPhoneApp("andre", "court").value()["cases"][0]["odds"]; };
  CHECK(odds()["convicted_if_not_guilty"] == 0.61);
  CHECK(odds()["with_firm"] == 0.46);
  CHECK(odds()["final"] == false);
  // Aaliyah comes to the hearing: the witness counts again.
  advanceTo(w, w.character("andre")->jailedUntil + 61);
  walkInto(w, "aaliyah", "courthouse");
  toHearing(w, id);
  REQUIRE(w.courtCase(id)->status == "hearing");
  CHECK(w.courtCase(id)->witnessesInCourt == 1);
  CHECK(odds()["convicted_if_not_guilty"] == 0.67);
  CHECK(odds()["final"] == true);
  // The firm, hired at the hearing, is paid now and takes its edge off.
  const Cents before = bank(w, "andre");
  auto hired = w.courtLawyer("andre", id, "firm");
  REQUIRE(hired);
  CHECK(bank(w, "andre") == before - 120000);
  CHECK(hired.value()["odds"]["convicted_if_not_guilty"] == 0.52);
  CHECK(hired.value()["lawyer"]["kind"] == "firm");
  CHECK(w.state().ledger.sumOfBalances() == 0);
}

TEST_CASE("court: a report summons you to court and the victim is told; you're not wanted") {
  World w = courtWorld(patchedContent([](Json& doc, const std::string& file) {
    if (file == "crimes.json") {
      setCrime(doc["crime"], "pickpocketing", 0.0);
      doc["crime"]["pickpocket_notice_chance"] = 1.0;
    }
  }));
  walkInto(w, "andre", "heritage_coffee");
  walkInto(w, "dominique", "heritage_coffee");
  auto r = w.pickpocket("andre", "dominique");
  REQUIRE(r);
  REQUIRE(r.value().contains("reported"));
  CHECK(r.value()["reported"]["summoned"] == true);
  const CourtCase* k = w.courtCase(r.value()["reported"]["case"]);
  REQUIRE(k);
  CHECK(k->how == "reported");
  CHECK(k->victim == "dominique");
  CHECK(w.character("andre")->wantedFor.empty());
  CHECK(!w.inJail("andre"));
  CHECK(notified(w, "dominique", "Andre Campbell is charged with Pickpocketing"));
  // The victim sees the date and the charges, not the defence's odds.
  const Json theirs = w.openPhoneApp("dominique", "court").value()["as_victim"];
  REQUIRE(theirs.size() == 1);
  CHECK(theirs[0]["role"] == "victim");
  CHECK(!theirs[0].contains("odds"));
  bool listed = false;
  const Json calendar = w.openPhoneApp("dominique", "calendar").value();
  for (const auto& u : calendar["upcoming"]) listed |= u.value("kind", "") == "court";
  CHECK(listed);
  // Reported, with the victim's word: 0.30 + 0.10.
  CHECK(w.openPhoneApp("andre", "court").value()["cases"][0]["odds"]["convicted_if_not_guilty"] == 0.4);
}

TEST_CASE("court: lawyers: the firm and a person who's a lawyer, and every refusal") {
  auto db = courtContent({}, [](Json& doc, const std::string& file) {
    if (file == "aaliyah.json") {
      doc["characters"][0]["career"] = Json{{"id", "law"}, {"level", 1}};
      doc["characters"][0]["degrees"].push_back("jd");
    }
  });
  World w = courtWorld(db);
  const std::string id = caughtShoplifting(w, "andre", "dominique");
  CHECK(code(w.courtLawyer("andre", "case-nope", "firm")) == "unknown_case");
  CHECK(code(w.courtLawyer("dominique", id, "firm")) == "unknown_case");  // not her case
  CHECK(code(w.courtLawyer("andre", id, "")) == "not_represented");
  CHECK(code(w.courtLawyer("andre", id, "andre")) == "invalid_target");
  CHECK(code(w.courtLawyer("andre", id, "nobody")) == "unknown_person");
  CHECK(code(w.courtLawyer("andre", id, "dominique")) == "not_a_lawyer");
  w.setScripted("aaliyah", true, "autopilot");
  CHECK(code(w.courtLawyer("andre", id, "aaliyah")) == "not_available");
  w.setScripted("aaliyah", false);
  // Asked: she gets the brief; until she says yes she isn't counted.
  REQUIRE(w.courtLawyer("andre", id, "aaliyah"));
  CHECK(code(w.courtLawyer("andre", id, "aaliyah")) == "already_represented");
  const auto briefs = eventsFor(w.drainEvents(), "aaliyah", "court_brief");
  REQUIRE(briefs.size() == 1);
  CHECK(briefs[0]["role"] == "lawyer");
  CHECK(briefs[0]["fee_cents"] == 120000);
  CHECK(w.openPhoneApp("andre", "court").value()["cases"][0]["odds"]["convicted_if_not_guilty"] == 0.61);
  CHECK(code(w.courtRepresent("dominique", id, true)) == "unknown_case");
  REQUIRE(w.courtRepresent("aaliyah", id, true));
  CHECK(code(w.courtRepresent("aaliyah", id, true)) == "unknown_case");  // already agreed
  // A level-1 lawyer: 0.12 + 0.04.
  CHECK(w.openPhoneApp("andre", "court").value()["cases"][0]["odds"]["convicted_if_not_guilty"] == 0.45);
  CHECK(w.openPhoneApp("aaliyah", "court").value()["defending"].size() == 1);
  // She's paid when the hearing opens with her in the courtroom.
  const Cents hers = bank(w, "aaliyah"), his = bank(w, "andre");
  advanceTo(w, w.character("andre")->jailedUntil + 61);
  walkInto(w, "aaliyah", "courthouse");
  toHearing(w, id);
  REQUIRE(w.courtCase(id)->status == "hearing");
  CHECK(w.courtCase(id)->lawyerPresent);
  CHECK(bank(w, "aaliyah") == hers + 120000);
  CHECK(bank(w, "andre") == his - 120000);
  CHECK(code(w.courtLawyer("andre", id, "firm")) == "already_represented");
  auto v = w.courtPlea("andre", id, "not_guilty");
  REQUIRE(v);
  CHECK(v.value()["chance"] == 0.45);
  CHECK(w.state().ledger.sumOfBalances() == 0);
}

TEST_CASE("court: a lawyer who doesn't come isn't paid or counted; the victim can't defend; the firm can't be afforded") {
  auto db = courtContent(
      [](Json& c) { c["lawyers"]["firm"]["fee_cents"] = 900000000; },
      [](Json& doc, const std::string& file) {
        if (file == "aaliyah.json") {
          doc["characters"][0]["career"] = Json{{"id", "law"}, {"level", 0}};
          doc["characters"][0]["degrees"].push_back("jd");
        }
        if (file == "crimes.json") {
          setCrime(doc["crime"], "pickpocketing", 1.0);
        }
      });
  World w = courtWorld(db);
  walkInto(w, "andre", "heritage_coffee");
  walkInto(w, "dominique", "heritage_coffee");
  auto r = w.pickpocket("andre", "dominique");
  REQUIRE(r);
  REQUIRE(r.value()["caught"] == true);
  const std::string id = r.value()["court"]["case"];
  CHECK(w.courtCase(id)->victim == "dominique");
  CHECK(code(w.courtLawyer("andre", id, "dominique")) == "conflict_of_interest");
  CHECK(code(w.courtLawyer("andre", id, "firm")) == "insufficient_funds");
  REQUIRE(w.courtLawyer("andre", id, "aaliyah"));
  REQUIRE(w.courtRepresent("aaliyah", id, true));
  const Cents hers = bank(w, "aaliyah");
  toHearing(w, id);  // she stays at home
  REQUIRE(w.courtCase(id)->status == "hearing");
  CHECK(!w.courtCase(id)->lawyerPresent);
  CHECK(w.courtCase(id)->lawyer.empty());
  CHECK(bank(w, "aaliyah") == hers);
  CHECK(notified(w, "andre", "isn't in the courtroom"));
  // Once the hearing is open, only a lawyer in the courtroom can step in.
  CHECK(code(w.courtLawyer("andre", id, "aaliyah")) == "not_here");
}

TEST_CASE("court: pleas are refused before the hearing, outside the courtroom and for nonsense") {
  World w = courtWorld(courtContent());
  const std::string id = caughtShoplifting(w);
  CHECK(code(w.courtPlea("andre", "case-nope", "guilty")) == "unknown_case");
  CHECK(code(w.courtPlea("aaliyah", id, "guilty")) == "unknown_case");
  CHECK(code(w.courtPlea("andre", id, "guilty")) == "not_open");  // booked, and the hearing is hours away
  advanceTo(w, w.character("andre")->jailedUntil + 61);
  CHECK(code(w.courtPlea("andre", id, "guilty")) == "not_open");
  toHearing(w, id);
  CHECK(code(w.courtPlea("andre", id, "maybe")) == "bad_plea");
  REQUIRE(w.exitBuilding("andre"));
  CHECK(code(w.courtPlea("andre", id, "guilty")) == "not_here");
}

TEST_CASE("court: no plea by the deadline: the court enters not guilty and rules") {
  World w = courtWorld(courtContent([](Json& c) {
    c["evidence"]["min"] = 1.0;
    c["evidence"]["max"] = 1.0;
  }));
  const std::string id = caughtShoplifting(w);
  toHearing(w, id);
  advanceTo(w, w.courtCase(id)->pleaBy);
  CHECK(w.courtCase(id)->status == "decided");
  CHECK(w.courtCase(id)->plea == "entered");
  CHECK(w.courtCase(id)->verdict == "convicted");
  CHECK(w.character("andre")->record.size() == 1);
}

TEST_CASE("court: miss your hearing and there's a warrant; picked up, you're held until a new hearing and brought to it") {
  World w = courtWorld(courtContent({}, [](Json& doc, const std::string& file) {
    if (file == "crimes.json") doc["crime"]["patrol_arrest_per_hour"] = 0.0;
  }));
  const std::string id = caughtShoplifting(w);
  advanceTo(w, w.character("andre")->jailedUntil + 61);
  REQUIRE(w.exitBuilding("andre"));
  const GameMinutes hearing = w.courtCase(id)->hearingAt;
  advanceTo(w, hearing + 39);
  CHECK(w.courtCase(id)->status == "summoned");  // late is still heard
  advanceTo(w, hearing + 40);
  CHECK(w.courtCase(id)->status == "warrant");
  CHECK(w.character("andre")->wantedFor == "shoplifting");
  CHECK(w.look("andre").value()["you"]["wanted_for"] == "Shoplifting");
  CHECK(notified(w, "andre", "A warrant is out for your arrest"));
  CHECK(w.openPhoneApp("andre", "record").value()["wanted"] == true);
  // A patrol picks him up out in the open.
  World caught(courtContent({}, [](Json& doc, const std::string& file) {
                 if (file == "crimes.json") doc["crime"]["patrol_arrest_per_hour"] = 1.0;
               }),
               w.state());
  caught.advanceMinutes(60);
  REQUIRE(caught.inJail("andre"));
  const CourtCase* k = caught.courtCase(id);
  CHECK(k->status == "summoned");
  CHECK(k->hearingAt > hearing);
  CHECK(caught.character("andre")->wantedFor.empty());
  CHECK(caught.character("andre")->jailedUntil > k->hearingAt);  // held until it
  CHECK(caught.courtCase(id)->charges.size() == 1);
  // Brought from the cell to the courtroom when it's time.
  advanceTo(caught, k->hearingAt);
  CHECK(caught.courtCase(id)->status == "hearing");
  CHECK(caught.character("andre")->inside == "courthouse");
  CHECK(!caught.inJail("andre"));
  REQUIRE(caught.courtPlea("andre", id, "guilty"));
}

TEST_CASE("court: nobody playing the accused puts the hearing off until someone is; too many times and it's a warrant") {
  World w = courtWorld(courtContent());
  const std::string id = caughtShoplifting(w);
  advanceTo(w, w.character("andre")->jailedUntil + 61);
  for (int round = 1; round <= 3; ++round) {
    const GameMinutes hearing = w.courtCase(id)->hearingAt;
    REQUIRE(hearing > w.now());
    w.disconnect("andre");
    advanceTo(w, hearing + 40);
    if (round == 3) break;
    CHECK(w.courtCase(id)->status == "summoned");
    CHECK(w.courtCase(id)->adjournments == round);
    CHECK(w.courtCase(id)->hearingAt == -1);  // set when he's back
    w.advanceMinutes(60);
    CHECK(w.courtCase(id)->hearingAt == -1);
    REQUIRE(w.connect("andre"));
    w.advanceMinutes(1);
    CHECK(w.courtCase(id)->hearingAt > w.now());
    CHECK(notified(w, "andre", "You're back in town."));
  }
  CHECK(w.courtCase(id)->status == "warrant");  // the third time, a warrant, though he's away
  CHECK(w.character("andre")->wantedFor == "shoplifting");
}

TEST_CASE("court: a script playing the accused doesn't answer for them; out cold, a hearing is put off without counting") {
  World w = courtWorld(courtContent());
  const std::string id = caughtShoplifting(w);
  advanceTo(w, w.character("andre")->jailedUntil + 61);
  w.setScripted("andre", true, "autopilot");
  advanceTo(w, w.courtCase(id)->hearingAt + 40);
  CHECK(w.courtCase(id)->adjournments == 1);
  CHECK(w.courtCase(id)->hearingAt == -1);
  w.setScripted("andre", false);
  w.advanceMinutes(1);
  REQUIRE(w.courtCase(id)->hearingAt > w.now());
  WorldState s = w.state();
  s.characters.at("andre").passedOutUntil = w.courtCase(id)->hearingAt + 600;
  World out(w.contentPtr(), s);
  advanceTo(out, out.courtCase(id)->hearingAt);
  CHECK(out.courtCase(id)->adjournments == 1);  // not counted
  CHECK(out.courtCase(id)->status == "summoned");
  CHECK(out.courtCase(id)->hearingAt > out.now());
  CHECK(notified(out, "andre", "you were in no state to come"));
}

TEST_CASE("court: two people get two slots; a new charge before the hearing joins the open case") {
  World w = courtWorld(courtContent({}, [](Json& doc, const std::string& file) {
    if (file == "crimes.json") setCrime(doc["crime"], "drug_purchase", 0.0);
  }));
  const std::string a = caughtShoplifting(w, "andre", "");
  const std::string b = caughtShoplifting(w, "aaliyah", "");
  CHECK(a != b);
  CHECK(w.courtCase(a)->hearingAt != w.courtCase(b)->hearingAt);
  // Dominique buys at the Underpass after dark, then is caught shoplifting with it on her: one case, two charges.
  World night = courtWorld(courtContent({}, [](Json& doc, const std::string& file) {
    if (file == "crimes.json") setCrime(doc["crime"], "drug_purchase", 0.0);
  }));
  night.advanceMinutes(10 * 60);
  walkTo(night, "dominique", "the_underpass");
  REQUIRE(night.buy("dominique", "haze", "cash"));
  night.advanceMinutes(13 * 60);
  const std::string id = caughtShoplifting(night, "dominique", "");
  CHECK(night.courtCase(id)->charges == std::vector<std::string>({"shoplifting", "drug_possession"}));
  CHECK(!night.owns("dominique", "haze"));
  int open = 0;
  for (const auto& k : night.state().court.cases) open += k.accused == "dominique" ? 1 : 0;
  CHECK(open == 1);
}

TEST_CASE("court: the hearing is public; the judge on shift sits on the bench") {
  World w = courtWorld(courtContent(), {"dominique", "aaliyah", "andre", "evelyn-park"});
  const std::string id = caughtShoplifting(w);
  walkInto(w, "evelyn-park", "courthouse");
  REQUIRE(w.startShift("evelyn-park"));
  advanceTo(w, w.character("andre")->jailedUntil + 61);
  walkInto(w, "dominique", "courthouse");
  (void)w.drainEvents();
  toHearing(w, id);
  REQUIRE(w.courtCase(id)->status == "hearing");
  CHECK(w.courtCase(id)->judge == "evelyn-park");
  auto events = w.drainEvents();
  const auto opened = eventsFor(events, "dominique", "court");
  REQUIRE(opened.size() == 1);
  CHECK(opened[0]["stage"] == "opened");
  CHECK(opened[0]["judge"] == "Evelyn Park");
  CHECK(opened[0]["accused_name"] == "Andre Campbell");
  CHECK(eventsFor(events, "aaliyah", "court").empty());  // not in the courtroom
  CHECK(eventsFor(events, "dominique", "court_hearing").empty());  // the courtroom card is the accused's
  // The bench's docket listed it.
  REQUIRE(w.courtPlea("andre", id, "guilty"));
  events = w.drainEvents();
  const auto verdict = eventsFor(events, "evelyn-park", "court");
  REQUIRE(verdict.size() == 1);
  CHECK(verdict[0]["stage"] == "verdict");
  CHECK(verdict[0]["verdict"] == "convicted");
  CHECK(verdict[0]["text"].get<std::string>().find("was convicted of Shoplifting") != std::string::npos);
  CHECK(w.openPhoneApp("evelyn-park", "court").value().contains("docket"));
}

TEST_CASE("court: community service at Common Ground, hour by hour; undone by its date, a warrant and the hours in a cell") {
  auto db = courtContent(
      [](Json& c) {
        c["guilty_plea_discount"] = 0.0;
        c["sentences"]["shoplifting"] = Json::array({{{"service_hours", 2}}});
      },
      [](Json& doc, const std::string& file) {
        if (file == "crimes.json") doc["crime"]["patrol_arrest_per_hour"] = 0.0;
      });
  World w = courtWorld(db);
  CHECK(code(w.communityService("andre", true)) == "nothing_owed");
  CHECK(code(w.communityService("andre", false)) == "not_serving");
  const std::string id = caughtShoplifting(w);
  toHearing(w, id);
  auto v = w.courtPlea("andre", id, "guilty");
  REQUIRE(v);
  CHECK(v.value()["sentence"]["service_hours"] == 2);
  CHECK(w.look("andre").value()["you"]["court"]["service"]["hours_left"] == 2);
  CHECK(code(w.communityService("andre", true)) == "wrong_place");
  walkInto(w, "andre", "common_ground");
  auto started = w.communityService("andre", true);
  REQUIRE(started);
  CHECK(started.value()["hours_left"] == 2);
  CHECK(code(w.communityService("andre", true)) == "already_serving");
  w.advanceMinutes(60);
  CHECK(std::abs(w.courtCase(id)->serviceDone - 1.0) < 1e-6);
  REQUIRE(w.exitBuilding("andre"));
  w.advanceMinutes(1);
  CHECK(code(w.communityService("andre", false)) == "not_serving");  // walking out stopped it
  CHECK(notified(w, "andre", "You stopped your community service"));
  REQUIRE(w.enter("andre", "common_ground"));
  REQUIRE(w.communityService("andre", true));
  w.advanceMinutes(61);
  CHECK(w.courtCase(id)->serviceDone == 2);
  CHECK(notified(w, "andre", "Community service done"));
  CHECK(code(w.communityService("andre", true)) == "nothing_owed");

  // A second sentence left undone: a warrant, and picked up he serves the hours left in a cell.
  World late = courtWorld(db);
  const std::string id2 = caughtShoplifting(late);
  toHearing(late, id2);
  REQUIRE(late.courtPlea("andre", id2, "guilty"));
  REQUIRE(late.exitBuilding("andre"));
  advanceTo(late, late.courtCase(id2)->serviceDue);
  CHECK(late.courtCase(id2)->breached);
  CHECK(late.character("andre")->wantedFor == "shoplifting");
  World caught(courtContent(
                   [](Json& c) {
                     c["guilty_plea_discount"] = 0.0;
                     c["sentences"]["shoplifting"] = Json::array({{{"service_hours", 2}}});
                   },
                   [](Json& doc, const std::string& file) {
                     if (file == "crimes.json") doc["crime"]["patrol_arrest_per_hour"] = 1.0;
                   }),
               late.state());
  if (!caught.character("andre")->inside.empty()) REQUIRE(caught.exitBuilding("andre"));
  const GameMinutes before = caught.now();
  caught.advanceMinutes(60);
  REQUIRE(caught.inJail("andre"));
  const GameMinutes held = caught.character("andre")->jailedUntil - before;
  CHECK(held >= 240);  // two hours left at 120 minutes each
  CHECK(held <= 300);
  CHECK(caught.courtCase(id2)->serviceDone == 2);  // converted
  CHECK(caught.character("andre")->wantedFor.empty());
}

TEST_CASE("court: on probation, convicted again means time in a cell; a second conviction draws the repeat sentence") {
  auto db = courtContent([](Json& c) {
    c["guilty_plea_discount"] = 0.0;
    c["sentences"]["shoplifting"] = Json::array({{{"fine_cents", 1000}, {"probation_days", 3}}, {{"fine_cents", 2000}}});
    c["probation"]["breach_jail_minutes"] = 300;
  });
  World w = courtWorld(db);
  const std::string first = caughtShoplifting(w);
  toHearing(w, first);
  REQUIRE(w.courtPlea("andre", first, "guilty"));
  CHECK(w.look("andre").value()["you"]["court"]["probation_until"] == w.courtCase(first)->probationUntil);
  const std::string second = caughtShoplifting(w, "andre", "");
  const Json view = w.openPhoneApp("andre", "court").value()["cases"][0];
  CHECK(view["priors"] == 1);
  CHECK(view["on_probation"] == true);
  CHECK(view["if_guilty_plea"]["fine_cents"] == 2000);
  CHECK(view["if_guilty_plea"]["jail_minutes"] == 300);
  toHearing(w, second);
  auto v = w.courtPlea("andre", second, "guilty");
  REQUIRE(v);
  CHECK(v.value()["sentence"]["fine_cents"] == 2000);
  CHECK(v.value()["sentence"]["jail_minutes"] == 300);
  CHECK(w.inJail("andre"));
  CHECK(w.character("andre")->inside == "police_station");
}

TEST_CASE("court: a fine you can't pay is time in a cell instead") {
  World w = courtWorld(courtContent([](Json& c) {
    c["sentences"]["shoplifting"] = Json::array({{{"fine_cents", 900000000}}});
    c["unpaid_fine_jail_minutes"] = 360;
  }));
  const std::string id = caughtShoplifting(w);
  toHearing(w, id);
  const Cents before = bank(w, "andre");
  auto v = w.courtPlea("andre", id, "not_guilty");
  REQUIRE(v);
  if (v.value()["verdict"] == "convicted") {
    CHECK(v.value()["sentence"]["fine_unpaid"] == true);
    CHECK(v.value()["sentence"]["fine_cents"] == 0);
    CHECK(v.value()["sentence"]["jail_minutes"] == 360);
    CHECK(bank(w, "andre") == before);
    CHECK(w.inJail("andre"));
  }
  World g = courtWorld(courtContent([](Json& c) {
    c["sentences"]["shoplifting"] = Json::array({{{"fine_cents", 900000000}}});
    c["unpaid_fine_jail_minutes"] = 360;
  }));
  const std::string id2 = caughtShoplifting(g);
  toHearing(g, id2);
  auto gv = g.courtPlea("andre", id2, "guilty");
  REQUIRE(gv);
  CHECK(gv.value()["sentence"]["fine_unpaid"] == true);
  CHECK(gv.value()["sentence"]["jail_minutes"] == 360);
  CHECK(g.inJail("andre"));
}

TEST_CASE("court: employers that need a clean record see a conviction until it's spent, never a charge or an acquittal") {
  auto db = courtContent([](Json& c) { c["record"] = Json{{"penalty_days", 1}, {"conviction_days", 2}, {"jail_days", 3}}; });
  World w = courtWorld(db);
  const std::string id = caughtShoplifting(w);
  advanceTo(w, w.character("andre")->jailedUntil + 61);
  CHECK(!w.employersSeeRecord(*w.character("andre")));  // charged is not convicted
  toHearing(w, id);
  REQUIRE(w.courtPlea("andre", id, "guilty"));
  CHECK(w.employersSeeRecord(*w.character("andre")));
  walkTo(w, "andre", "police_station");
  CHECK(code(w.enroll("andre", "police_academy")) == "criminal_record");
  const Json jobs = w.openPhoneApp("andre", "jobs").value()["jobs"];
  for (const auto& j : jobs) {
    if (j.value("requires_clean_record", false)) CHECK(j["eligible"] == false);
  }
  const Json rec = w.openPhoneApp("andre", "record").value();
  CHECK(rec["employers_see"] == true);
  CHECK(rec["record"][0]["employers_see_until"] == formatDateTime(w.character("andre")->record[0].at + 2 * kMinutesPerDay));
  w.advanceMinutes(2 * kMinutesPerDay);
  CHECK(!w.employersSeeRecord(*w.character("andre")));  // spent: still on his record, not seen
  CHECK(w.character("andre")->record.size() == 1);
  REQUIRE(w.enroll("andre", "police_academy"));
}

TEST_CASE("court: cases and the record's case and sentence are saved") {
  World w = courtWorld(courtContent());
  const std::string id = caughtShoplifting(w);
  toHearing(w, id);
  REQUIRE(w.courtPlea("andre", id, "guilty"));
  const std::string id2 = caughtShoplifting(w, "aaliyah", "dominique");
  const Json saved = worldStateToJson(w.state());
  auto back = worldStateFromJson(saved);
  REQUIRE(back);
  World loaded(w.contentPtr(), back.value());
  const CourtCase* a = loaded.courtCase(id);
  const CourtCase* b = loaded.courtCase(id2);
  REQUIRE(a);
  REQUIRE(b);
  CHECK(a->verdict == "convicted");
  CHECK(a->plea == "guilty");
  CHECK(a->fineCents == 16500);
  CHECK(a->witnesses == std::vector<CharacterId>{"aaliyah"});
  CHECK(b->status == "summoned");
  CHECK(b->hearingAt == w.courtCase(id2)->hearingAt);
  CHECK(b->witnesses == std::vector<CharacterId>{"dominique"});
  REQUIRE(loaded.character("andre")->record.size() == 1);
  CHECK(loaded.character("andre")->record[0].caseId == id);
  CHECK(loaded.character("andre")->record[0].sentence == "a $165.00 fine");
  CHECK(worldStateToJson(loaded.state())["world_parts"]["court"] == saved["world_parts"]["court"]);
}

TEST_CASE("court: crime_risk gives the court's real numbers: the sentence for you, and the odds where you stand") {
  World w = courtWorld(courtContent());
  walkInto(w, "aaliyah", "thread_co");
  walkInto(w, "andre", "thread_co");
  const Json risk = w.crimeRisk("andre", "shoplifting").value();
  const Json& caught = risk["if_caught"];
  CHECK(caught["arrested"] == true);
  CHECK(caught["booking_minutes"] == 120);
  CHECK(!caught.contains("fine_cents"));
  CHECK(caught["court"]["if_convicted"]["fine_cents"] == 25000);
  CHECK(caught["court"]["if_guilty_plea"]["fine_cents"] == 16500);
  CHECK(caught["court"]["odds_if_caught"] == 0.61);
  CHECK(caught["court"]["courthouse"] == "Livéra Municipal Court");
  // Fare dodging is a fixed penalty: no court.
  CHECK(!w.crimeRisk("andre", "fare_evasion").value()["if_caught"].contains("court"));
  // Away from a shop: the sentence, but no odds.
  REQUIRE(w.exitBuilding("andre"));
  const Json away = w.crimeRisk("andre", "shoplifting").value()["if_caught"]["court"];
  CHECK(away.contains("if_convicted"));
  CHECK(!away.contains("odds_if_caught"));
}

TEST_CASE("court: without the court's data, an arrest fines and holds you on the spot as before (D-069)") {
  World w = courtWorld(courtContent({}, [](Json& doc, const std::string& file) {
    if (file == "court.json") doc = Json::object();
  }));
  walkInto(w, "andre", "thread_co");
  auto r = w.steal("andre", "sunglasses");
  REQUIRE(r);
  CHECK(r.value()["fine_cents"] == 25000);
  CHECK(!r.value().contains("court"));
  CHECK(w.character("andre")->record.size() == 1);
  CHECK(w.state().court.cases.empty());
  CHECK(w.openPhoneApp("andre", "court").value()["cases"].empty());
}
