// Work decisions. On shift, a character can make up to three job decisions a work day (who
// to hire, how to handle an upset customer, which fix to ship), drawn from their career's
// bank in data/careers/work_tasks.json. Each answer moves performance at once and adds
// promotion hours in proportion to how good the call was. Promotion itself still happens
// when the shift ends (World::endShift), so good calls get you there sooner. Doing nothing
// still pays and counts toward promotion exactly as before. See docs/m08/work.md.
#include <algorithm>
#include <cmath>
#include <numeric>
#include <set>

#include "core/Clock.h"
#include "core/Content.h"
#include "core/ContentParse.h"
#include "core/Parts.h"
#include "core/World.h"

namespace livera {

using namespace content_parse;

namespace {

// Draws and option orders are a pure function of (character, day, task): the same all day,
// different from one day to the next, the same after a restart, and they never touch the
// world's random stream (opening a phone must not change anyone's dice).
std::uint64_t fnv1a(const std::string& s) {
  std::uint64_t h = 0xcbf29ce484222325ull;
  for (const unsigned char ch : s) {
    h ^= ch;
    h *= 0x100000001b3ull;
  }
  return h;
}

std::uint64_t mix64(std::uint64_t z) {
  z += 0x9E3779B97F4A7C15ull;
  z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ull;
  z = (z ^ (z >> 27)) * 0x94D049BB133111EBull;
  return z ^ (z >> 31);
}

std::uint64_t dayKey(const CharacterId& who, std::int64_t day, const std::string& what) {
  return mix64(fnv1a(who + "|" + std::to_string(day) + "|" + what));
}

std::int64_t dayOf(GameMinutes t) { return toDateTime(t).dayIndex; }

double round1(double v) { return std::round(v * 10) / 10; }

// order[i] is the bank index of the option shown at position i.
std::vector<int> optionOrder(const CharacterId& who, std::int64_t day, const WorkTaskDef& t) {
  std::vector<int> order(t.options.size());
  std::iota(order.begin(), order.end(), 0);
  std::uint64_t s = dayKey(who, day, "options|" + t.id);
  for (std::size_t i = order.size(); i > 1; --i) {
    s = mix64(s);
    std::swap(order[i - 1], order[static_cast<std::size_t>(s % i)]);
  }
  return order;
}

int shownAt(const std::vector<int>& order, int bankIndex) {
  const auto it = std::find(order.begin(), order.end(), bankIndex);
  return it == order.end() ? -1 : static_cast<int>(it - order.begin());
}

int bestOption(const WorkTaskDef& t) {
  for (std::size_t i = 0; i < t.options.size(); ++i) {
    if (t.options[i].score >= 1) return static_cast<int>(i);
  }
  return 0;
}

bool validOption(const WorkTaskDef& t, int bankIndex) {
  return bankIndex >= 0 && bankIndex < static_cast<int>(t.options.size());
}

// What an answer did: whether it was the best call, why the chosen option was good or not,
// and which option was best. Scores themselves stay on the server.
Json outcomeJson(const WorkTaskDef& t, const std::vector<int>& order, const WorkAnswer& a) {
  Json out{{"best_call", a.score >= 1},
           {"performance_change", round1(a.performanceChange)},
           {"bonus_hours", round1(a.bonusHours)}};
  if (validOption(t, a.option)) {
    const WorkOptionDef& o = t.options[static_cast<std::size_t>(a.option)];
    out["you_chose"] = Json{{"option", shownAt(order, a.option)}, {"label", o.label}, {"why", o.why}};
  }
  const int best = bestOption(t);
  const WorkOptionDef& b = t.options[static_cast<std::size_t>(best)];
  out["best"] = Json{{"option", shownAt(order, best)}, {"label", b.label}, {"why", b.why}};
  return out;
}

}  // namespace

// ---- Content -------------------------------------------------------------------------------
Status ContentDatabase::ingestWork(const std::string& source, const std::string& section, const Json& body,
                                   bool& handled) {
  handled = section == "work_tasks" || section == "work_decisions";
  if (!handled) return okStatus();
  try {
    if (section == "work_decisions") {
      if (haveWorkDecisions_) return fail("content_duplicate", source + ": 'work_decisions' defined twice");
      haveWorkDecisions_ = true;
      WorkDecisionsConfig& W = workDecisions_;
      W.perDay = body.value("per_day", W.perDay);
      W.performanceBest = body.value("performance_best", W.performanceBest);
      W.performanceWorst = body.value("performance_worst", W.performanceWorst);
      W.bonusHoursPerPoint = body.value("bonus_hours_per_point", W.bonusHoursPerPoint);
      return okStatus();
    }
    if (!body.is_array()) return fail("content_invalid", source + ": 'work_tasks' must be a list of careers");
    for (const auto& group : body) {
      const std::string careerId = group.at("career").get<std::string>();
      std::vector<std::string>& list = workTasksByCareer_[careerId];
      for (const auto& t : group.at("tasks")) {
        WorkTaskDef d;
        d.id = t.at("id").get<std::string>();
        d.career = careerId;
        d.prompt = t.at("prompt").get<std::string>();
        for (const auto& o : t.at("options")) {
          d.options.push_back(WorkOptionDef{o.at("label").get<std::string>(), o.value("detail", ""),
                                            o.at("score").get<double>(), o.at("why").get<std::string>()});
        }
        const std::string id = d.id;
        if (auto st = insertUnique(workTasks_, "work task", id, std::move(d)); !st)
          return fail(st.error().code, source + ": " + st.error().message);
        list.push_back(id);
      }
    }
  } catch (const std::exception& e) {
    return fail("content_invalid", source + ": " + e.what());
  }
  return okStatus();
}

Status ContentDatabase::validateWork() const {
  const WorkDecisionsConfig& W = workDecisions_;
  if (W.perDay < 1 || W.perDay > 10) return fail("content_invalid", "work_decisions.per_day must be 1 to 10");
  if (W.performanceBest < W.performanceWorst)
    return fail("content_invalid", "work_decisions: performance_best must be at least performance_worst");
  if (W.bonusHoursPerPoint < 0)
    return fail("content_invalid", "work_decisions.bonus_hours_per_point can't be negative");
  for (const auto& [careerId, ids] : workTasksByCareer_) {
    if (!career(careerId)) return fail("content_invalid", "work_tasks: unknown career '" + careerId + "'");
  }
  for (const auto& [id, t] : workTasks_) {
    const std::string where = "work task " + id;
    if (id.empty()) return fail("content_invalid", "work_tasks (" + t.career + "): a task needs an id");
    if (t.prompt.empty()) return fail("content_invalid", where + ": needs a prompt");
    if (t.options.size() < 3 || t.options.size() > 4)
      return fail("content_invalid", where + ": needs three or four options");
    int best = 0;
    std::set<std::string> labels;
    for (const auto& o : t.options) {
      if (!(o.score >= 0 && o.score <= 1))
        return fail("content_invalid", where + ": option scores must be between 0 and 1");
      if (o.score == 1.0) ++best;
      if (o.label.empty() || o.why.empty())
        return fail("content_invalid", where + ": every option needs a label and a why");
      if (!labels.insert(o.label).second)
        return fail("content_invalid", where + ": two options are labelled '" + o.label + "'");
    }
    if (best != 1) return fail("content_invalid", where + ": exactly one option must score 1 (the best call)");
  }
  return okStatus();
}

const WorkTaskDef* ContentDatabase::workTask(const std::string& id) const {
  const auto it = workTasks_.find(id);
  return it == workTasks_.end() ? nullptr : &it->second;
}

const std::vector<std::string>& ContentDatabase::workTasksFor(const std::string& careerId) const {
  static const std::vector<std::string> kNone;
  const auto it = workTasksByCareer_.find(careerId);
  return it == workTasksByCareer_.end() ? kNone : it->second;
}

// ---- Drawing the day's decisions ------------------------------------------------------------
// The tasks that have come up least often go first, in a per-day order among equals, so the
// days work through the whole bank and the groupings change. Never the same set two work days
// running when the bank has more to give.
std::vector<std::string> World::drawWorkTasks(const CharacterState& c, std::int64_t day) const {
  const std::vector<std::string>& bank = content_->workTasksFor(c.career.careerId);
  const WorkDecisionsState& w = c.workDecisions;
  struct Candidate {
    int drawn;
    std::uint64_t order;
    const std::string* id;
  };
  std::vector<Candidate> pool;
  pool.reserve(bank.size());
  for (const auto& id : bank) {
    const auto it = w.drawn.find(id);
    pool.push_back(Candidate{it == w.drawn.end() ? 0 : it->second, dayKey(c.id, day, id), &id});
  }
  std::sort(pool.begin(), pool.end(), [](const Candidate& a, const Candidate& b) {
    if (a.drawn != b.drawn) return a.drawn < b.drawn;
    if (a.order != b.order) return a.order < b.order;
    return *a.id < *b.id;
  });
  const std::size_t n = std::min(pool.size(), static_cast<std::size_t>(content_->workDecisions().perDay));
  std::vector<Candidate> chosen(pool.begin(), pool.begin() + static_cast<std::ptrdiff_t>(n));
  if (w.day != day && w.career == c.career.careerId && pool.size() > n) {
    const std::set<std::string> before(w.tasks.begin(), w.tasks.end());
    const bool same =
        std::all_of(chosen.begin(), chosen.end(), [&](const Candidate& k) { return before.count(*k.id) > 0; });
    if (same && before.size() == n) chosen.back() = pool[n];
  }
  std::sort(chosen.begin(), chosen.end(), [](const Candidate& a, const Candidate& b) { return a.order < b.order; });
  std::vector<std::string> out;
  for (const auto& k : chosen) out.push_back(*k.id);
  return out;
}

std::vector<std::string> World::workTasksToday(const CharacterState& c) const {
  const std::int64_t day = dayOf(state_.now);
  const WorkDecisionsState& w = c.workDecisions;
  if (w.day == day && w.career == c.career.careerId) return w.tasks;
  return drawWorkTasks(c, day);
}

void World::refreshWorkDay(CharacterState& c) {
  WorkDecisionsState& w = c.workDecisions;
  const std::int64_t day = dayOf(state_.now);
  if (w.day == day && w.career == c.career.careerId) return;
  if (w.career != c.career.careerId) {
    // A new job: the decision bonus belonged to the old title.
    w.bonusCareer.clear();
    w.bonusLevel = -1;
    w.bonusHours = 0;
  }
  // Yesterday's unanswered decisions lapse. Answers made on the shift still in progress stay
  // until it ends, so its report has them.
  const std::optional<GameMinutes> shift = c.career.shiftStartedAt;
  std::erase_if(w.answers,
                [&](const WorkAnswer& a) { return a.day != day && !(shift && !a.reported && a.at >= *shift); });
  w.tasks = drawWorkTasks(c, day);
  w.day = day;
  w.career = c.career.careerId;
  for (const auto& t : w.tasks) ++w.drawn[t];
  std::erase_if(w.drawn, [&](const auto& kv) { return content_->workTask(kv.first) == nullptr; });
}

const WorkAnswer* World::workAnswerToday(const CharacterState& c, const std::string& task) const {
  const std::int64_t day = dayOf(state_.now);
  for (const auto& a : c.workDecisions.answers) {
    if (a.day == day && a.task == task) return &a;
  }
  return nullptr;
}

// One decision as the player sees it: options in today's order, without scores or reasons;
// once answered, the outcome too.
Json World::workTaskView(const CharacterState& c, const std::string& task) const {
  const WorkTaskDef* t = content_->workTask(task);
  if (!t) return Json();  // the bank changed under a saved draw
  const std::int64_t day = dayOf(state_.now);
  const std::vector<int> order = optionOrder(c.id, day, *t);
  Json options = Json::array();
  for (std::size_t i = 0; i < order.size(); ++i) {
    const WorkOptionDef& o = t->options[static_cast<std::size_t>(order[i])];
    Json opt{{"option", i}, {"label", o.label}};
    if (!o.detail.empty()) opt["detail"] = o.detail;
    options.push_back(std::move(opt));
  }
  Json v{{"task", t->id}, {"prompt", t->prompt}, {"options", options}};
  const WorkAnswer* a = workAnswerToday(c, task);
  v["answered"] = a != nullptr;
  if (a) v.update(outcomeJson(*t, order, *a));
  return v;
}

// Where the character stands: performance, and hours toward the next title with the part the
// decisions earned.
Json World::workProgress(const CharacterState& c) const {
  const CareerDef* career = content_->career(c.career.careerId);
  if (!career) return Json{{"career", nullptr}};
  const auto level = static_cast<std::size_t>(c.career.level);
  const CareerLevel& lv = career->levels.at(level);
  const WorkDecisionsState& w = c.workDecisions;
  const double bonus = w.bonusCareer == c.career.careerId && w.bonusLevel == c.career.level
                           ? std::min(w.bonusHours, c.career.hoursAtLevel)
                           : 0.0;
  Json out{{"career", career->name},
           {"title", lv.title},
           {"performance", std::round(c.career.performance)},
           {"hours_at_level", round1(c.career.hoursAtLevel)},
           {"decision_bonus_hours", round1(bonus)}};
  if (level + 1 < career->levels.size() && lv.hoursToPromote > 0) {
    out["next_title"] = career->levels[level + 1].title;
    out["hours_to_promote"] = lv.hoursToPromote;
    out["hours_left"] = round1(std::max(0.0, lv.hoursToPromote - c.career.hoursAtLevel));
    out["min_performance"] = lv.minPerformance;
  } else {
    out["next_title"] = nullptr;
  }
  return out;
}

// ---- Commands ------------------------------------------------------------------------------
Result<Json> World::workTasks(const CharacterId& actor) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  if (!content_->career(c.career.careerId)) return fail("no_career", "you don't have a job");
  if (!c.career.shiftStartedAt) return fail("not_working", "decisions come up on shift; start one at work first");
  refreshWorkDay(c);
  c.workDecisions.nudgedDay = c.workDecisions.day;  // they've looked: no need for the phone to remind them
  Json decisions = Json::array();
  int open = 0;
  for (const auto& id : c.workDecisions.tasks) {
    Json v = workTaskView(c, id);
    if (v.is_null()) continue;
    if (!v.value("answered", false)) ++open;
    decisions.push_back(std::move(v));
  }
  Json out = workProgress(c);
  out["per_day"] = content_->workDecisions().perDay;
  out["decisions"] = decisions;
  out["open"] = open;
  if (decisions.empty()) out["note"] = "There are no decisions for this job yet. Your shift counts as it always has.";
  else if (open == 0) out["note"] = "That's all of today's decisions.";
  else out["note"] = "Optional: a shift counts either way, but good calls get you promoted sooner.";
  return out;
}

Result<Json> World::answerWorkTask(const CharacterId& actor, const std::string& task, int option) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  if (!content_->career(c.career.careerId)) return fail("no_career", "you don't have a job");
  if (!c.career.shiftStartedAt) return fail("not_working", "decisions are made on shift; start one at work first");
  refreshWorkDay(c);
  WorkDecisionsState& w = c.workDecisions;
  const WorkTaskDef* t = content_->workTask(task);
  if (!t) return fail("unknown_task", "there's no such decision");
  if (std::find(w.tasks.begin(), w.tasks.end(), task) == w.tasks.end())
    return fail("not_today", "that isn't one of today's decisions");
  if (workAnswerToday(c, task)) return fail("already_answered", "you've already made that call today");
  if (option < 0 || option >= static_cast<int>(t->options.size()))
    return fail("unknown_option", "pick one of the " + std::to_string(t->options.size()) + " options shown");

  const std::vector<int> order = optionOrder(c.id, w.day, *t);
  const int chosen = order[static_cast<std::size_t>(option)];
  const WorkOptionDef& o = t->options[static_cast<std::size_t>(chosen)];
  const WorkDecisionsConfig& W = content_->workDecisions();
  CareerState& cs = c.career;
  const double before = cs.performance;
  cs.performance =
      clampd(cs.performance + W.performanceWorst + (W.performanceBest - W.performanceWorst) * o.score, 0, 100);
  // Promotion hours count toward the current title; endShift promotes as it always has.
  const double bonus = o.score * W.bonusHoursPerPoint;
  cs.hoursAtLevel += bonus;
  if (w.bonusCareer != cs.careerId || w.bonusLevel != cs.level) {
    w.bonusCareer = cs.careerId;
    w.bonusLevel = cs.level;
    w.bonusHours = 0;
  }
  w.bonusHours += bonus;
  WorkAnswer a;
  a.task = task;
  a.option = chosen;
  a.score = o.score;
  a.performanceChange = cs.performance - before;
  a.bonusHours = bonus;
  a.at = state_.now;
  a.day = w.day;
  w.answers.push_back(a);
  w.answeredTotal += 1;
  if (o.score >= 1) w.bestTotal += 1;

  Json out = outcomeJson(*t, order, a);
  out["task"] = task;
  out.update(workProgress(c));
  int open = 0;
  for (const auto& id : w.tasks) open += workAnswerToday(c, id) ? 0 : 1;
  out["open"] = open;
  return out;
}

// ---- Simulation ----------------------------------------------------------------------------
// Once a game hour: the day rolls over for everyone on shift (yesterday's open decisions
// lapse, no penalty), and the phone says once a day that decisions are waiting.
void World::stepWorkHourly() {
  for (auto& [id, c] : state_.characters) {
    if (!c.online || !c.career.shiftStartedAt || !content_->career(c.career.careerId)) continue;
    refreshWorkDay(c);
    WorkDecisionsState& w = c.workDecisions;
    if (w.nudgedDay == w.day) continue;
    int open = 0;
    for (const auto& t : w.tasks) open += workAnswerToday(c, t) ? 0 : 1;
    if (open == 0) continue;
    w.nudgedDay = w.day;
    notify(id, "career",
           std::to_string(open) + (open == 1 ? " decision is" : " decisions are") +
               " waiting for you at work today. Open the work app: good calls get you promoted sooner.");
  }
}

// A shift too short to be paid doesn't count toward promotion, and neither do the promotion
// hours its decisions added (otherwise clocking in for a minute to answer would replace work).
// What the calls did to performance stands.
void World::workShiftReport(CharacterState& c, GameMinutes shiftStart, bool counts, Json& out) {
  WorkDecisionsState& w = c.workDecisions;
  Json decisions = Json::array();
  double bonus = 0;
  int best = 0;
  for (auto& a : w.answers) {
    if (a.reported || a.at < shiftStart) continue;
    a.reported = true;
    if (!counts && a.bonusHours > 0) {
      c.career.hoursAtLevel = std::max(0.0, c.career.hoursAtLevel - a.bonusHours);
      if (w.bonusCareer == c.career.careerId && w.bonusLevel == c.career.level)
        w.bonusHours = std::max(0.0, w.bonusHours - a.bonusHours);
      a.bonusHours = 0;
    }
    const WorkTaskDef* t = content_->workTask(a.task);
    Json d{{"task", a.task},
           {"best_call", a.score >= 1},
           {"performance_change", round1(a.performanceChange)},
           {"bonus_hours", round1(a.bonusHours)}};
    if (t) d["prompt"] = t->prompt;
    if (t && validOption(*t, a.option)) d["you_chose"] = t->options[static_cast<std::size_t>(a.option)].label;
    decisions.push_back(std::move(d));
    bonus += a.bonusHours;
    best += a.score >= 1 ? 1 : 0;
  }
  out["decisions"] = decisions;
  out["decision_bonus_hours"] = round1(bonus);
  out["best_calls"] = best;
  if (!counts && !decisions.empty())
    out["decisions_note"] = "The shift was too short to count, so its decisions' promotion hours don't either.";
}

Json World::phoneWork(const CharacterState& c) const {
  Json out = workProgress(c);
  if (!content_->career(c.career.careerId)) {
    out["note"] = "You don't have a job. Apply in person where you'd like to work (phone jobs).";
    return out;
  }
  const bool onShift = c.career.shiftStartedAt.has_value();
  const std::vector<std::string> tasks = workTasksToday(c);
  Json decisions = Json::array();
  int open = 0;
  for (const auto& id : tasks) {
    const bool answered = workAnswerToday(c, id) != nullptr;
    open += answered ? 0 : 1;
    // Off shift, only the results: the questions themselves come up at work.
    if (!onShift && !answered) continue;
    Json v = workTaskView(c, id);
    if (!v.is_null()) decisions.push_back(std::move(v));
  }
  const WorkDecisionsState& w = c.workDecisions;
  out["on_shift"] = onShift;
  out["per_day"] = content_->workDecisions().perDay;
  out["decisions"] = decisions;
  out["open"] = open;
  out["answered_today"] = static_cast<int>(tasks.size()) - open;
  out["decisions_answered"] = w.answeredTotal;
  out["best_calls"] = w.bestTotal;
  if (tasks.empty())
    out["note"] = "There are no decisions for this job yet. Shifts pay and count toward promotion as always.";
  else if (open == 0) out["note"] = "That's all of today's decisions.";
  else if (!onShift)
    out["note"] = std::to_string(open) + (open == 1 ? " decision comes" : " decisions come") +
                  " up when you're on shift today. Unanswered ones lapse at midnight.";
  else out["note"] = "Answer with work_answer {task, option}. Optional: a shift counts either way.";
  return out;
}

// ---- Save ----------------------------------------------------------------------------------
// Work decisions keep no world-wide state.
Json workPartToJson(const WorldState& s) {
  (void)s;
  return Json::object();
}

void workPartFromJson(WorldState& s, const Json& j) {
  (void)s;
  (void)j;
}

void writeWorkCharacter(const CharacterState& c, Json& j) {
  const WorkDecisionsState& w = c.workDecisions;
  Json answers = Json::array();
  for (const auto& a : w.answers) {
    answers.push_back(Json{{"task", a.task},
                           {"option", a.option},
                           {"score", a.score},
                           {"performance_change", a.performanceChange},
                           {"bonus_hours", a.bonusHours},
                           {"at", a.at},
                           {"day", a.day},
                           {"reported", a.reported}});
  }
  j["work"] = Json{{"day", w.day},
                   {"career", w.career},
                   {"tasks", w.tasks},
                   {"answers", answers},
                   {"drawn", w.drawn},
                   {"nudged_day", w.nudgedDay},
                   {"bonus", Json{{"career", w.bonusCareer}, {"level", w.bonusLevel}, {"hours", w.bonusHours}}},
                   {"answered_total", w.answeredTotal},
                   {"best_total", w.bestTotal}};
}

// A save without the key (older, or a new character) starts with no decisions made.
void readWorkCharacter(CharacterState& c, const Json& j) {
  const auto it = j.find("work");
  if (it == j.end() || !it->is_object()) return;
  const Json& k = *it;
  WorkDecisionsState& w = c.workDecisions;
  w.day = k.value("day", std::int64_t{-1});
  w.career = k.value("career", "");
  w.tasks = k.value("tasks", std::vector<std::string>{});
  for (const auto& a : k.value("answers", Json::array())) {
    WorkAnswer x;
    x.task = a.value("task", "");
    x.option = a.value("option", 0);
    x.score = a.value("score", 0.0);
    x.performanceChange = a.value("performance_change", 0.0);
    x.bonusHours = a.value("bonus_hours", 0.0);
    x.at = a.value("at", GameMinutes{0});
    x.day = a.value("day", std::int64_t{-1});
    x.reported = a.value("reported", false);
    w.answers.push_back(std::move(x));
  }
  w.drawn = k.value("drawn", std::map<std::string, int>{});
  w.nudgedDay = k.value("nudged_day", std::int64_t{-1});
  const Json bonus = k.value("bonus", Json::object());
  w.bonusCareer = bonus.value("career", "");
  w.bonusLevel = bonus.value("level", -1);
  w.bonusHours = bonus.value("hours", 0.0);
  w.answeredTotal = k.value("answered_total", 0);
  w.bestTotal = k.value("best_total", 0);
}

}  // namespace livera
