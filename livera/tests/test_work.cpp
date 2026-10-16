// Tests for M0.8 work: see docs/m08/work.md.
#include <atomic>
#include <chrono>
#include <fstream>
#include <set>
#include <thread>

#include "TestSupport.h"
#include "core/Clock.h"
#include "core/Serialization.h"
#include "net/Socket.h"
#include "persistence/SqliteStore.h"
#include "server/Server.h"

using namespace livera;
using namespace livera::test;

namespace {

// Dominique (Senior Recruiter) at Meridian Talent, on shift.
void clockIn(World& w, const CharacterId& who = "dominique", const LocationId& where = "meridian_talent") {
  walkInto(w, who, where);
  REQUIRE(w.startShift(who));
}

// The next day at `hour`.
void nextDayAt(World& w, int hour) {
  const GameMinutes target = (w.now() / kMinutesPerDay + 1) * kMinutesPerDay + hour * kMinutesPerHour;
  w.advanceMinutes(target - w.now());
}

Json tasksOf(World& w, const CharacterId& who = "dominique") {
  auto r = w.workTasks(who);
  if (!r) throw std::runtime_error("work_tasks refused: " + r.error().code);
  return r.value();
}

std::vector<std::string> taskIds(const Json& list) {
  std::vector<std::string> out;
  for (const auto& d : list.at("decisions")) out.push_back(d.at("task").get<std::string>());
  return out;
}

// The bank's version of the option shown at position `i`, found by its label.
const WorkOptionDef& bankOption(const World& w, const Json& view, std::size_t i) {
  const WorkTaskDef* t = w.content().workTask(view.at("task").get<std::string>());
  if (!t) throw std::runtime_error("task not in the bank");
  const std::string label = view.at("options").at(i).at("label").get<std::string>();
  for (const auto& o : t->options) {
    if (o.label == label) return o;
  }
  throw std::runtime_error("option not in the bank: " + label);
}

// Where the best (or the worst) option is shown.
int shownBest(const World& w, const Json& view) {
  for (std::size_t i = 0; i < view.at("options").size(); ++i) {
    if (bankOption(w, view, i).score >= 1) return static_cast<int>(i);
  }
  throw std::runtime_error("no best option shown");
}

int shownWorst(const World& w, const Json& view) {
  int worst = 0;
  for (std::size_t i = 1; i < view.at("options").size(); ++i) {
    if (bankOption(w, view, i).score < bankOption(w, view, static_cast<std::size_t>(worst)).score)
      worst = static_cast<int>(i);
  }
  return worst;
}

std::string answerCode(World& w, const std::string& task, int option, const CharacterId& who = "dominique") {
  auto r = w.answerWorkTask(who, task, option);
  return r ? std::string("(accepted)") : r.error().code;
}

int notifiedCount(const World& w, const CharacterId& id, const std::string& fragment) {
  int n = 0;
  for (const auto& x : w.state().notifications)
    n += x.recipient == id && x.text.find(fragment) != std::string::npos ? 1 : 0;
  return n;
}

// The real content with a patch applied, without throwing when it doesn't load.
Result<std::shared_ptr<const ContentDatabase>> loadPatched(
    const std::function<void(Json& doc, const std::string& file)>& patch) {
  std::vector<std::pair<std::string, Json>> docs;
  std::vector<std::filesystem::path> files;
  for (const auto& e : std::filesystem::recursive_directory_iterator(LIVERA_DATA_DIR)) {
    if (e.path().extension() == ".json") files.push_back(e.path());
  }
  std::sort(files.begin(), files.end());
  for (const auto& f : files) {
    std::ifstream in(f);
    Json doc = Json::parse(in, nullptr, true, true);
    patch(doc, f.filename().string());
    docs.emplace_back(f.filename().string(), std::move(doc));
  }
  return ContentDatabase::loadFromDocuments(docs);
}

std::string loadError(const std::function<void(Json& bank)>& patch) {
  auto r = loadPatched([&](Json& doc, const std::string& file) {
    if (file == "work_tasks.json") patch(doc);
  });
  return r ? std::string("(loaded)") : r.error().message;
}

bool contains(const std::string& s, const std::string& part) { return s.find(part) != std::string::npos; }

}  // namespace

TEST_CASE("work: the real bank has decisions for the cast's careers, and Dominique's are hiring calls") {
  const auto db = realContent();
  for (const auto& [id, def] : db->characters()) CHECK(db->workTasksFor(def.careerId).size() >= 3);
  for (const char* career : {"cafe", "grocery", "nanny", "police", "medicine"})
    CHECK(db->workTasksFor(career).size() >= 3);
  const auto& recruiting = db->workTasksFor("recruiting");
  CHECK(recruiting.size() >= 4);
  for (const auto& id : recruiting) {
    const WorkTaskDef* t = db->workTask(id);
    REQUIRE(t);
    CHECK(t->career == "recruiting");
    CHECK(t->options.size() >= 3);
  }
  CHECK(db->workDecisions().perDay == 3);
  CHECK(db->workTasksFor("no_such_career").empty());
}

TEST_CASE("content: work decisions are validated") {
  CHECK(contains(loadError([](Json& d) { d["work_tasks"][0]["career"] = "astronaut"; }), "unknown career 'astronaut'"));
  CHECK(contains(loadError([](Json& d) { d["work_tasks"][0]["tasks"][0]["options"][0]["score"] = 1.0; }),
                 "exactly one option"));
  CHECK(contains(loadError([](Json& d) {
                   for (auto& o : d["work_tasks"][0]["tasks"][0]["options"]) o["score"] = 0.5;
                 }),
                 "exactly one option"));
  CHECK(contains(loadError([](Json& d) { d["work_tasks"][0]["tasks"][0]["options"][0]["score"] = 1.5; }),
                 "between 0 and 1"));
  CHECK(contains(loadError([](Json& d) { d["work_tasks"][0]["tasks"][0]["options"][0]["score"] = -0.1; }),
                 "between 0 and 1"));
  CHECK(contains(loadError([](Json& d) {
                   auto& opts = d["work_tasks"][0]["tasks"][0]["options"];
                   Json best;
                   for (auto& o : opts) {
                     if (o["score"] == 1.0) best = o;
                   }
                   opts = Json::array({best, Json{{"label", "Shrug"}, {"score", 0.0}, {"why", "No."}}});
                 }),
                 "three or four options"));
  CHECK(contains(loadError([](Json& d) {
                   auto& opts = d["work_tasks"][0]["tasks"][0]["options"];
                   for (int i = 0; i < 2; ++i)
                     opts.push_back(Json{{"label", "Extra " + std::to_string(i)}, {"score", 0.0}, {"why", "No."}});
                 }),
                 "three or four options"));
  CHECK(
      contains(loadError([](Json& d) { d["work_tasks"][0]["tasks"][1]["id"] = d["work_tasks"][0]["tasks"][0]["id"]; }),
               "duplicate work task"));
  CHECK(contains(loadError([](Json& d) { d["work_tasks"][0]["tasks"][0]["options"][1]["why"] = ""; }),
                 "needs a label and a why"));
  CHECK(contains(loadError([](Json& d) {
                   auto& opts = d["work_tasks"][0]["tasks"][0]["options"];
                   opts[1]["label"] = opts[0]["label"];
                 }),
                 "two options are labelled"));
  CHECK(contains(loadError([](Json& d) { d["work_tasks"][0]["tasks"][0].erase("prompt"); }), "prompt"));
  CHECK(contains(loadError([](Json& d) { d["work_decisions"]["per_day"] = 0; }), "per_day"));
  CHECK(contains(loadError([](Json& d) { d["work_decisions"]["performance_best"] = -10; }), "performance_best"));
  CHECK(contains(loadError([](Json& d) { d["work_tasks"] = Json::object(); }), "must be a list"));
  // Any number of tasks per career is fine, including none at all.
  CHECK(loadError([](Json& d) { d["work_tasks"][0]["tasks"] = Json::array(); }) == "(loaded)");
  CHECK(loadError([](Json& d) { d.erase("work_tasks"); }) == "(loaded)");
  CHECK(loadError([](Json& d) { d.erase("work_decisions"); }) == "(loaded)");
}

TEST_CASE("work: decisions only come up on shift, for someone with a job") {
  World w = World::createNew(realContent());
  CHECK(w.workTasks("dominique").error().code == "not_in_world");
  REQUIRE(w.connect("dominique"));
  CHECK(w.workTasks("dominique").error().code == "not_working");
  CHECK(answerCode(w, w.content().workTasksFor("recruiting").front(), 0) == "not_working");
  CHECK(w.workTasks("nobody").error().code == "unknown_character");

  WorldState s = w.state();
  s.characters.at("dax").career.careerId.clear();
  World v(realContent(), s);
  REQUIRE(v.connect("dax"));
  CHECK(v.workTasks("dax").error().code == "no_career");
  CHECK(v.answerWorkTask("dax", "anything", 0).error().code == "no_career");
  const Json phone = v.openPhoneApp("dax", "work").value();
  CHECK(phone.at("career").is_null());
  CHECK(contains(phone.at("note").get<std::string>(), "don't have a job"));

  // On shift: three of her career's decisions.
  clockIn(w);
  const Json list = tasksOf(w);
  REQUIRE(list.at("decisions").size() == 3);
  CHECK(list.at("open") == 3);
  CHECK(list.at("title") == "Senior Recruiter");
  for (const auto& id : taskIds(list)) CHECK(w.content().workTask(id)->career == "recruiting");
  // Off shift again, the questions are gone.
  REQUIRE(w.endShift("dominique"));
  CHECK(w.workTasks("dominique").error().code == "not_working");
}

TEST_CASE("work: the same decisions all day, different ones the next day, never with scores or reasons") {
  World w = World::createNew(realContent());
  REQUIRE(w.connect("dominique"));
  clockIn(w);
  const Json first = tasksOf(w);
  const Json again = tasksOf(w);
  CHECK(first.at("decisions") == again.at("decisions"));  // same tasks, same option order
  // A new shift later the same day brings the same decisions.
  REQUIRE(w.endShift("dominique"));
  w.advanceMinutes(60);
  REQUIRE(w.startShift("dominique"));
  CHECK(tasksOf(w).at("decisions") == first.at("decisions"));

  // Nothing about which option is best is sent before an answer.
  for (const auto& d : first.at("decisions")) {
    CHECK(!d.at("answered").get<bool>());
    CHECK(!d.contains("best") && !d.contains("you_chose") && !d.contains("best_call"));
    const WorkTaskDef* t = w.content().workTask(d.at("task").get<std::string>());
    REQUIRE(t);
    CHECK(d.at("prompt") == t->prompt);
    CHECK(d.at("options").size() == t->options.size());
    std::set<std::string> labels;
    for (std::size_t i = 0; i < d.at("options").size(); ++i) {
      const Json& o = d.at("options")[i];
      CHECK(o.at("option") == i);
      for (const auto& [key, value] : o.items()) CHECK(key == "option" || key == "label" || key == "detail");
      labels.insert(o.at("label").get<std::string>());
    }
    CHECK(labels.size() == t->options.size());
    const std::string text = d.dump();
    CHECK(!contains(text, "score") && !contains(text, "why"));
    for (const auto& o : t->options) CHECK(!contains(text, o.why));
  }

  // A pure function of (character, day): another world on the same day draws the same.
  World twin = World::createNew(realContent());
  REQUIRE(twin.connect("dominique"));
  clockIn(twin);
  CHECK(tasksOf(twin).at("decisions") == first.at("decisions"));

  // The next days work through the whole bank before anything repeats (twelve hiring calls,
  // three a day), and the day's set always changes.
  std::set<std::string> seen;
  for (const auto& id : taskIds(first)) seen.insert(id);
  std::vector<std::string> previous = taskIds(first);
  const std::size_t bank = w.content().workTasksFor("recruiting").size();
  for (int day = 2; day <= 4; ++day) {
    REQUIRE(w.endShift("dominique"));
    nextDayAt(w, 9);
    clockIn(w);
    const auto ids = taskIds(tasksOf(w));
    CHECK(ids.size() == 3);
    CHECK(ids != previous);
    for (const auto& id : ids) {
      if (bank >= 12) CHECK(!seen.count(id));
      seen.insert(id);
    }
    previous = ids;
  }
  if (bank == 12) CHECK(seen.size() == 12);
  // Once everything has come up, the groupings keep changing and no set repeats two days running.
  for (int day = 5; day <= 9; ++day) {
    REQUIRE(w.endShift("dominique"));
    nextDayAt(w, 9);
    clockIn(w);
    const auto ids = taskIds(tasksOf(w));
    std::set<std::string> a(ids.begin(), ids.end()), b(previous.begin(), previous.end());
    CHECK(ids.size() == 3 && a.size() == 3);
    CHECK(a != b);
    previous = ids;
  }
}

TEST_CASE("work: each decision is answered once, and the reply explains the call") {
  World w = World::createNew(realContent());
  REQUIRE(w.connect("dominique"));
  clockIn(w);
  const Json list = tasksOf(w);
  const Json first = list.at("decisions")[0];
  const std::string task = first.at("task").get<std::string>();
  const int best = shownBest(w, first);

  // Unknown tasks and options.
  CHECK(answerCode(w, "not_a_task", 0) == "unknown_task");
  CHECK(answerCode(w, w.content().workTasksFor("cafe").front(), 0) == "not_today");
  std::string notToday;
  for (const auto& id : w.content().workTasksFor("recruiting")) {
    const auto today = taskIds(list);
    if (std::find(today.begin(), today.end(), id) == today.end()) notToday = id;
  }
  REQUIRE(!notToday.empty());
  CHECK(answerCode(w, notToday, 0) == "not_today");
  CHECK(answerCode(w, task, -1) == "unknown_option");
  CHECK(answerCode(w, task, static_cast<int>(first.at("options").size())) == "unknown_option");

  auto r = w.answerWorkTask("dominique", task, best);
  REQUIRE(r);
  const Json& a = r.value();
  const WorkTaskDef* t = w.content().workTask(task);
  const WorkOptionDef& chosen = bankOption(w, first, static_cast<std::size_t>(best));
  CHECK(a.at("task") == task);
  CHECK(a.at("best_call") == true);
  CHECK(a.at("you_chose").at("option") == best);
  CHECK(a.at("you_chose").at("label") == chosen.label);
  CHECK(a.at("you_chose").at("why") == chosen.why);
  CHECK(a.at("best").at("option") == best);
  CHECK(a.at("open") == 2);
  CHECK(a.at("bonus_hours") == 1.5);
  CHECK(!a.contains("score"));
  CHECK(t->options.size() == first.at("options").size());

  // Once per task per day.
  CHECK(answerCode(w, task, best) == "already_answered");
  CHECK(answerCode(w, task, 0) == "already_answered");
  // The list now shows the result for that one, and still keeps the others' scores back.
  const Json after = tasksOf(w);
  CHECK(after.at("open") == 2);
  const Json answered = after.at("decisions")[0];
  CHECK(answered.at("answered") == true);
  CHECK(answered.at("best_call") == true);
  CHECK(answered.at("you_chose").at("why") == chosen.why);
  for (std::size_t i = 1; i < after.at("decisions").size(); ++i) CHECK(!after.at("decisions")[i].contains("best"));

  // A poor call says so, and names the best one with its reason.
  const Json second = after.at("decisions")[1];
  const int worst = shownWorst(w, second);
  const Json b = w.answerWorkTask("dominique", second.at("task").get<std::string>(), worst).value();
  const WorkTaskDef* t2 = w.content().workTask(second.at("task").get<std::string>());
  CHECK(b.at("best_call") == false);
  CHECK(b.at("you_chose").at("why") == bankOption(w, second, static_cast<std::size_t>(worst)).why);
  CHECK(b.at("best").at("option") == shownBest(w, second));
  for (const auto& o : t2->options) {
    if (o.score >= 1) CHECK(b.at("best").at("label") == o.label && b.at("best").at("why") == o.why);
  }

  // The shift's report lists both calls and the bonus they earned.
  w.advanceMinutes(60);
  const Json shift = w.endShift("dominique").value();
  REQUIRE(shift.at("decisions").size() == 2);
  CHECK(shift.at("decisions")[0].at("task") == task);
  CHECK(shift.at("decisions")[0].at("best_call") == true);
  CHECK(shift.at("decisions")[0].at("you_chose") == chosen.label);
  CHECK(shift.at("decisions")[1].at("best_call") == false);
  CHECK_NEAR(shift.at("decision_bonus_hours").get<double>(),
             1.5 + 1.5 * bankOption(w, second, static_cast<std::size_t>(worst)).score, 0.051);
  CHECK(shift.at("best_calls") == 1);
  // A second shift the same day reports only its own decisions.
  REQUIRE(w.startShift("dominique"));
  w.advanceMinutes(60);
  CHECK(w.endShift("dominique").value().at("decisions").empty());
}

TEST_CASE("work: good calls raise performance and add promotion hours; poor ones lower it") {
  World w = World::createNew(realContent());
  REQUIRE(w.connect("dominique"));
  clockIn(w);
  const Json list = tasksOf(w);
  const CareerState& cs = w.character("dominique")->career;
  const auto& W = w.content().workDecisions();

  double perf = cs.performance, hours = cs.hoursAtLevel;
  const Json best = list.at("decisions")[0];
  REQUIRE(w.answerWorkTask("dominique", best.at("task").get<std::string>(), shownBest(w, best)));
  CHECK_NEAR(cs.performance, std::min(100.0, perf + W.performanceBest), 1e-9);
  CHECK_NEAR(cs.hoursAtLevel, hours + W.bonusHoursPerPoint, 1e-9);

  perf = cs.performance, hours = cs.hoursAtLevel;
  const Json poor = list.at("decisions")[1];
  const int worst = shownWorst(w, poor);
  const double score = bankOption(w, poor, static_cast<std::size_t>(worst)).score;
  CHECK(score < 1);
  const Json r = w.answerWorkTask("dominique", poor.at("task").get<std::string>(), worst).value();
  const double expected = W.performanceWorst + (W.performanceBest - W.performanceWorst) * score;
  CHECK_NEAR(cs.performance, perf + expected, 1e-9);
  CHECK_NEAR(cs.hoursAtLevel, hours + score * W.bonusHoursPerPoint, 1e-9);
  CHECK_NEAR(r.at("performance_change").get<double>(), expected, 0.051);
  if (score == 0) CHECK(cs.performance < perf);

  // Performance stays within 0..100. (A copy of the world, mid-shift.)
  WorldState s = w.state();
  s.characters.at("dominique").career.performance = 98;
  World high(realContent(), s);
  const Json last = tasksOf(high).at("decisions")[2];
  REQUIRE(high.answerWorkTask("dominique", last.at("task").get<std::string>(), shownBest(high, last)));
  CHECK(high.character("dominique")->career.performance == 100);
}

TEST_CASE("work: a shift too short to be paid doesn't count toward promotion, decisions included") {
  World w = World::createNew(realContent());
  REQUIRE(w.connect("dominique"));
  clockIn(w);
  const CareerState& cs = w.character("dominique")->career;
  const double hours = cs.hoursAtLevel, perf = cs.performance;
  const Json d = tasksOf(w).at("decisions")[0];
  REQUIRE(w.answerWorkTask("dominique", d.at("task").get<std::string>(), shownBest(w, d)));
  CHECK_NEAR(cs.hoursAtLevel, hours + 1.5, 1e-9);
  w.advanceMinutes(10);
  const Json shift = w.endShift("dominique").value();
  CHECK(shift.at("pay_cents") == 0);
  REQUIRE(shift.at("decisions").size() == 1);
  CHECK(shift.at("decision_bonus_hours") == 0.0);
  CHECK(shift.at("decisions")[0].at("bonus_hours") == 0.0);
  CHECK(shift.contains("decisions_note"));
  CHECK_NEAR(cs.hoursAtLevel, hours, 1e-9);
  CHECK_NEAR(cs.performance, std::min(100.0, perf + 6), 1e-9);  // the call itself still counted
  const Json phone = w.openPhoneApp("dominique", "work").value();
  CHECK(phone.at("decision_bonus_hours") == 0.0);
  CHECK(phone.at("decisions")[0].at("bonus_hours") == 0.0);
  // The decision stays made: it can't be answered again on a longer shift.
  REQUIRE(w.startShift("dominique"));
  CHECK(answerCode(w, d.at("task").get<std::string>(), 0) == "already_answered");
}

TEST_CASE("work: answering well gets you promoted sooner than idling the same hours") {
  // A short rung so the test runs in a few game days; the rule is endShift's, unchanged.
  const auto db = patchedContent([](Json& doc, const std::string& file) {
    if (file != "founding_careers.json") return;
    for (auto& c : doc["careers"]) {
      if (c["id"] == "recruiting") {
        c["levels"][1]["hours_to_promote"] = 30;
        c["levels"][1]["min_performance"] = 0;
      }
    }
  });
  World good = World::createNew(db);
  World idle = World::createNew(db);
  int goodDay = 0, idleDay = 0;
  for (int day = 1; day <= 6 && (!goodDay || !idleDay); ++day) {
    for (World* w : {&good, &idle}) {
      int& promotedOn = w == &good ? goodDay : idleDay;
      if (promotedOn) continue;
      if (day == 1) REQUIRE(w->connect("dominique"));
      else nextDayAt(*w, 9);
      clockIn(*w);
      if (w == &good) {
        const Json list = tasksOf(*w);
        for (const auto& d : list.at("decisions"))
          REQUIRE(w->answerWorkTask("dominique", d.at("task").get<std::string>(), shownBest(*w, d)));
        const Json phone = w->openPhoneApp("dominique", "work").value();
        CHECK_NEAR(phone.at("decision_bonus_hours").get<double>(), 4.5 * day, 0.051);
      }
      w->advanceMinutes(8 * 60);
      const Json shift = w->endShift("dominique").value();
      CHECK(shift.at("minutes_worked") == 8 * 60);
      CHECK(shift.at("pay_cents") == 8 * 4600);  // decisions or not, the same pay
      if (w == &idle) CHECK(shift.at("decisions").empty());
      if (shift.contains("promoted_to")) {
        CHECK(shift.at("promoted_to") == "Recruiting Manager");
        promotedOn = day;
        // The decision bonus starts again for the new title.
        CHECK(w->openPhoneApp("dominique", "work").value().at("decision_bonus_hours") == 0.0);
      }
    }
    if (day == 1)
      CHECK_NEAR(idle.character("dominique")->career.hoursAtLevel, 8.0, 1e-9);  // idling counts as it always has
  }
  CHECK(goodDay == 3);  // 8 + 4.5 hours a day
  CHECK(idleDay == 4);  // 8 hours a day
}

TEST_CASE("work: unanswered decisions lapse at midnight, and a shift past midnight reports both days") {
  World w = World::createNew(realContent());
  REQUIRE(w.connect("dominique"));
  w.advanceMinutes(22 * 60 - w.now() % kMinutesPerDay);  // 22:00
  clockIn(w);
  const Json today = tasksOf(w);
  const Json d0 = today.at("decisions")[0];
  REQUIRE(w.answerWorkTask("dominique", d0.at("task").get<std::string>(), shownBest(w, d0)));
  const std::string lapsed = today.at("decisions")[1].at("task").get<std::string>();
  const double perf = w.character("dominique")->career.performance;
  // Past midnight, still on shift: a new day's decisions; yesterday's open ones are gone.
  nextDayAt(w, 1);
  const Json tomorrow = tasksOf(w);
  CHECK(w.character("dominique")->career.performance == perf);  // no penalty
  CHECK(tomorrow.at("open") == 3);
  for (const auto& id : taskIds(tomorrow)) CHECK(id != lapsed);
  CHECK(answerCode(w, lapsed, 0) == "not_today");
  const Json d1 = tomorrow.at("decisions")[0];
  REQUIRE(w.answerWorkTask("dominique", d1.at("task").get<std::string>(), shownBest(w, d1)));
  const Json shift = w.endShift("dominique").value();
  REQUIRE(shift.at("decisions").size() == 2);
  CHECK(shift.at("decision_bonus_hours") == 3.0);
  // The phone shows today's results only.
  const Json phone = w.openPhoneApp("dominique", "work").value();
  CHECK(phone.at("answered_today") == 1);
  CHECK(phone.at("decisions").size() == 1);
  CHECK(phone.at("decisions_answered") == 2);
  CHECK(phone.at("best_calls") == 2);
}

TEST_CASE("work: the phone shows today's decisions, results and progress, and reminds once a day") {
  World w = World::createNew(realContent());
  REQUIRE(w.connect("dominique"));
  // Off shift: no questions yet, just how many are waiting.
  Json phone = w.openPhoneApp("dominique", "work").value();
  CHECK(phone.at("on_shift") == false);
  CHECK(phone.at("decisions").empty());
  CHECK(phone.at("open") == 3);
  CHECK(phone.at("title") == "Senior Recruiter");
  CHECK(phone.at("next_title") == "Recruiting Manager");
  CHECK(phone.at("hours_to_promote") == 120);
  CHECK(phone.at("decision_bonus_hours") == 0.0);
  CHECK(contains(phone.at("note").get<std::string>(), "on shift"));

  clockIn(w);
  const GameMinutes start = w.now();
  phone = w.openPhoneApp("dominique", "work").value();
  CHECK(phone.at("on_shift") == true);
  REQUIRE(phone.at("decisions").size() == 3);
  CHECK(phone.at("decisions") == tasksOf(w).at("decisions"));  // the phone and the op agree
  CHECK(!contains(phone.dump(), "\"why\""));

  // The phone nudges once in the day when decisions are waiting...
  w.advanceMinutes(60 - start % 60 + 1);
  CHECK(notifiedCount(w, "dominique", "decisions are waiting") == 0);  // she already looked at them
  World v = World::createNew(realContent());
  REQUIRE(v.connect("dominique"));
  clockIn(v);
  v.advanceMinutes(3 * 60);
  CHECK(notifiedCount(v, "dominique", "3 decisions are waiting") == 1);

  const Json d = phone.at("decisions")[2];
  REQUIRE(w.answerWorkTask("dominique", d.at("task").get<std::string>(), shownBest(w, d)));
  phone = w.openPhoneApp("dominique", "work").value();
  CHECK(phone.at("open") == 2);
  CHECK(phone.at("answered_today") == 1);
  CHECK(phone.at("decisions")[2].at("answered") == true);
  CHECK(phone.at("decisions")[2].at("best_call") == true);
  CHECK(phone.at("decision_bonus_hours") == 1.5);
  // Off shift, the result stays; the open questions wait for the next shift.
  REQUIRE(w.endShift("dominique"));
  phone = w.openPhoneApp("dominique", "work").value();
  CHECK(phone.at("decisions").size() == 1);
  CHECK(phone.at("decisions")[0].at("task") == d.at("task"));
  CHECK(phone.at("open") == 2);
}

TEST_CASE("work: a nanny on shift gets nanny decisions") {
  World w = World::createNew(realContent());
  std::ifstream in(std::string(LIVERA_DATA_DIR) + "/../scripts/demo/sol_rivera.json");
  Json sheet = Json::parse(in);
  sheet["career"] = "nanny";
  auto sol = w.createCharacter(sheet);
  REQUIRE(sol);
  const CharacterId nanny = sol.value();
  // Employed by Dominique's family (hiring itself is tested in test_family.cpp).
  WorldState s = w.state();
  s.characters.at(nanny).nannyFor = "dominique";
  World v(realContent(), s);
  REQUIRE(v.connect(nanny));
  CHECK(v.workTasks(nanny).error().code == "not_working");
  clockIn(v, nanny, "lexington_1204");
  const Json list = tasksOf(v, nanny);
  REQUIRE(list.at("decisions").size() == 3);
  CHECK(list.at("career") == "Nanny");
  for (const auto& id : taskIds(list)) CHECK(v.content().workTask(id)->career == "nanny");
  const Json d = list.at("decisions")[0];
  REQUIRE(v.answerWorkTask(nanny, d.at("task").get<std::string>(), shownBest(v, d)));
  v.advanceMinutes(2 * 60);
  const Json shift = v.endShift(nanny).value();
  CHECK(shift.at("decisions").size() == 1);
  CHECK(shift.at("decision_bonus_hours") == 1.5);
}

TEST_CASE("persistence: work decisions survive a save and load in the middle of the day") {
  const auto path = tempPath("work.db");
  Json before;
  std::string answered;
  WorldState saved;
  {
    World w = World::createNew(realContent());
    REQUIRE(w.connect("dominique"));
    clockIn(w);
    before = tasksOf(w);
    const Json d = before.at("decisions")[1];
    answered = d.at("task").get<std::string>();
    REQUIRE(w.answerWorkTask("dominique", answered, shownBest(w, d)));
    before = tasksOf(w);
    w.advanceMinutes(60);
    w.disconnect("dominique");  // settles the shift, as logging out does
    auto store = SqliteStore::open(path.string());
    REQUIRE(store);
    REQUIRE(store.value()->saveWorld(w.state()));
    saved = w.state();
  }
  auto store = SqliteStore::open(path.string());
  REQUIRE(store);
  auto loaded = store.value()->loadWorld();
  REQUIRE(loaded);
  const WorkDecisionsState& a = saved.characters.at("dominique").workDecisions;
  const WorkDecisionsState& b = loaded.value().characters.at("dominique").workDecisions;
  CHECK(a.day == b.day && a.career == b.career && a.tasks == b.tasks && a.drawn == b.drawn);
  CHECK(b.answers.size() == 1 && b.answers[0].task == answered && b.answers[0].score == 1);
  CHECK(b.bonusHours == 1.5 && b.bonusLevel == 1 && b.bonusCareer == "recruiting");
  CHECK(b.answeredTotal == 1 && b.bestTotal == 1);

  World w(realContent(), std::move(loaded).value());
  REQUIRE(w.connect("dominique"));
  clockIn(w);
  const Json after = tasksOf(w);
  CHECK(after.at("decisions") == before.at("decisions"));
  CHECK(after.at("decision_bonus_hours") == 1.5);
  CHECK(answerCode(w, answered, 0) == "already_answered");
  const Json d = after.at("decisions")[0];
  CHECK(answerCode(w, d.at("task").get<std::string>(), shownBest(w, d)) == "(accepted)");

  // An older save, without the key, loads with no decisions made.
  Json old = toJson(*w.character("dominique"));
  old.erase("work");
  const CharacterState fresh = characterStateFromJson(old);
  CHECK(fresh.workDecisions.day == -1 && fresh.workDecisions.answers.empty() && fresh.workDecisions.bonusHours == 0);
}

TEST_CASE("persistence: after a crash mid-shift, the calls already made stay made and aren't reported twice") {
  // Shifts aren't saved (a clean shutdown ends them first), so an autosave taken mid-shift
  // and then a crash loses the shift itself, as it always has. The decision made before the
  // save keeps its effect and stays made for the day.
  const auto path = tempPath("work_midshift.db");
  std::string first;
  double hours = 0;
  {
    World w = World::createNew(realContent());
    REQUIRE(w.connect("dominique"));
    hours = w.character("dominique")->career.hoursAtLevel;
    clockIn(w);
    const Json d = tasksOf(w).at("decisions")[0];
    first = d.at("task").get<std::string>();
    REQUIRE(w.answerWorkTask("dominique", first, shownBest(w, d)));
    auto store = SqliteStore::open(path.string());
    REQUIRE(store);
    REQUIRE(store.value()->saveWorld(w.state()));  // an autosave; then the server dies
  }
  auto store = SqliteStore::open(path.string());
  REQUIRE(store);
  auto loaded = store.value()->loadWorld();
  REQUIRE(loaded);
  World w(realContent(), std::move(loaded).value());
  const CharacterState& c = *w.character("dominique");
  CHECK(!c.career.shiftStartedAt.has_value());
  REQUIRE(c.workDecisions.answers.size() == 1);
  CHECK(c.workDecisions.answers[0].reported);  // settled on load: its shift is gone
  CHECK_NEAR(c.career.hoursAtLevel, hours + 1.5, 1e-9);

  // Back at work the same day, in the very minute the save was taken: the same decisions,
  // the first one still made.
  REQUIRE(w.connect("dominique"));
  clockIn(w);
  const Json list = tasksOf(w);
  CHECK(list.at("decisions")[0].at("task") == first);
  CHECK(list.at("decisions")[0].at("answered") == true);
  CHECK(list.at("open") == 2);
  CHECK(answerCode(w, first, 0) == "already_answered");
  const Json d = list.at("decisions")[1];
  REQUIRE(w.answerWorkTask("dominique", d.at("task").get<std::string>(), shownBest(w, d)));
  w.advanceMinutes(2 * 60);
  // This shift's report has only this shift's call.
  const Json shift = w.endShift("dominique").value();
  REQUIRE(shift.at("decisions").size() == 1);
  CHECK(shift.at("decisions")[0].at("task") == d.at("task"));
  CHECK(shift.at("decision_bonus_hours") == 1.5);
  CHECK(w.openPhoneApp("dominique", "work").value().at("decision_bonus_hours") == 3.0);
  // Which answers have been reported is saved with them.
  const CharacterState back = characterStateFromJson(toJson(*w.character("dominique")));
  REQUIRE(back.workDecisions.answers.size() == 2);
  CHECK(back.workDecisions.answers[0].reported && back.workDecisions.answers[1].reported);

  // A world copied mid-shift (not loaded after a crash) keeps the shift's calls for its report.
  REQUIRE(w.startShift("dominique"));
  WorldState s = w.state();
  CharacterState& mid = s.characters.at("dominique");
  mid.workDecisions.answers[1].reported = false;
  mid.workDecisions.answers[1].at = w.now();
  World copy(realContent(), s);
  CHECK(!copy.character("dominique")->workDecisions.answers[1].reported);
}

// ---- Over the network ----------------------------------------------------------------------
namespace {

std::shared_ptr<const ContentDatabase> fastWalking() {
  static auto db = patchedContent([](Json& doc, const std::string& file) {
    if (file == "simulation.json") doc["simulation"]["walk_speed_mps"] = 400.0;
  });
  return db;
}

class WorkServer {
 public:
  explicit WorkServer(const std::string& db) {
    ServerConfig cfg;
    cfg.port = 0;
    cfg.dbPath = db;
    cfg.content = fastWalking();
    cfg.devCommands = true;
    cfg.passwordIterations = 1000;
    cfg.autosaveSeconds = 3600;
    auto s = Server::create(cfg);
    if (!s) throw std::runtime_error("server failed: " + s.error().message);
    server_ = std::move(s).value();
    port_ = server_->port();
    thread_ = std::thread([this] { server_->run(stop_); });
  }
  ~WorkServer() {
    stop_ = true;
    if (thread_.joinable()) thread_.join();
  }
  std::uint16_t port() const { return port_; }

 private:
  std::unique_ptr<Server> server_;
  std::uint16_t port_ = 0;
  std::atomic<bool> stop_{false};
  std::thread thread_;
};

class WorkClient {
 public:
  explicit WorkClient(std::uint16_t port) {
    auto fd = net::connectTcp("127.0.0.1", port);
    if (!fd) throw std::runtime_error("connect failed");
    fd_ = std::move(fd).value();
  }
  Json call(Json req) {
    req["id"] = ++id_;
    if (!net::sendAll(fd_, req.dump() + "\n")) throw std::runtime_error("send failed");
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(10);
    while (std::chrono::steady_clock::now() < deadline) {
      auto line = net::readLine(fd_, buffer_, 100);
      if (!line) throw std::runtime_error("connection lost: " + line.error().message);
      if (!line.value()) continue;
      Json msg = Json::parse(*line.value());
      if (msg.contains("event")) continue;
      if (msg.value("re", Json()) == Json(id_)) return msg;
    }
    throw std::runtime_error("timed out waiting for reply");
  }
  Json ok(Json req) {
    Json r = call(req);
    if (!r.value("ok", false)) throw std::runtime_error("refused: " + req.dump() + " -> " + r.dump());
    return r["data"];
  }
  std::string refusal(Json req) {
    Json r = call(std::move(req));
    return r.value("ok", false) ? std::string("(accepted)") : r["error"]["code"].get<std::string>();
  }
  void walkTo(const std::string& place) {
    ok({{"op", "move"}, {"location", place}});
    for (int i = 0; i < 200; ++i) {
      if (!ok({{"op", "look"}})["you"]["moving"].get<bool>()) return;
      std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }
    throw std::runtime_error("never arrived at " + place);
  }

 private:
  net::Fd fd_;
  net::LineBuffer buffer_;
  long id_ = 0;
};

}  // namespace

TEST_CASE("server: work decisions over the network") {
  WorkServer server(tempPath("work_server.db").string());
  WorkClient dom(server.port());
  dom.ok({{"op", "register"}, {"username", "dom"}, {"password", "livera-pass-1"}});
  dom.ok({{"op", "login"}, {"username", "dom"}, {"password", "livera-pass-1"}});
  CHECK(dom.refusal({{"op", "work_tasks"}}) == "not_playing");
  dom.ok({{"op", "play"}, {"character", "dominique"}});
  CHECK(dom.refusal({{"op", "work_tasks"}}) == "not_working");
  CHECK(dom.ok({{"op", "phone"}, {"app", "work"}})["open"] == 3);

  dom.ok({{"op", "exit"}});
  dom.walkTo("meridian_talent");
  dom.ok({{"op", "enter"}, {"location", "meridian_talent"}});
  dom.ok({{"op", "work"}, {"action", "start"}});
  const Json list = dom.ok({{"op", "work_tasks"}});
  REQUIRE(list["decisions"].size() == 3);
  CHECK(!contains(list.dump(), "score") && !contains(list.dump(), "\"why\""));
  const std::string task = list["decisions"][0]["task"].get<std::string>();

  CHECK(dom.refusal({{"op", "work_answer"}, {"task", task}}) == "bad_request");
  CHECK(dom.refusal({{"op", "work_answer"}, {"task", task}, {"option", "first"}}) == "bad_request");
  CHECK(dom.refusal({{"op", "work_answer"}, {"task", task}, {"option", 9}}) == "unknown_option");
  CHECK(dom.refusal({{"op", "work_answer"}, {"task", task}, {"option", 4294967296LL}}) == "unknown_option");
  CHECK(dom.refusal({{"op", "work_answer"}, {"task", "nope"}, {"option", 0}}) == "unknown_task");
  const Json answer = dom.ok({{"op", "work_answer"}, {"task", task}, {"option", 0}});
  CHECK(answer["task"] == task);
  CHECK(answer["best_call"].is_boolean());
  CHECK(answer["you_chose"]["option"] == 0);
  CHECK(answer["you_chose"]["label"] == list["decisions"][0]["options"][0]["label"]);
  CHECK(answer["best"]["why"].is_string());
  CHECK(answer["open"] == 2);
  CHECK(dom.refusal({{"op", "work_answer"}, {"task", task}, {"option", 1}}) == "already_answered");

  const Json phone = dom.ok({{"op", "phone"}, {"app", "work"}});
  CHECK(phone["decisions"][0]["answered"] == true);
  CHECK(phone["answered_today"] == 1);
  dom.ok({{"op", "dev_advance"}, {"minutes", 60}});
  const Json shift = dom.ok({{"op", "work"}, {"action", "end"}});
  REQUIRE(shift["decisions"].size() == 1);
  CHECK(shift["decisions"][0]["task"] == task);
  CHECK(shift["decision_bonus_hours"] == answer["bonus_hours"]);
  CHECK(dom.refusal({{"op", "work_answer"}, {"task", list["decisions"][1]["task"]}, {"option", 0}}) == "not_working");
}
