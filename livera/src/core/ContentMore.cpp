// Content sections added from M0.8 on. Content.cpp hands any section it doesn't know to
// ingestMore, and validate() calls validateMore() for their cross references.
#include <set>

#include "core/Content.h"
#include "core/ContentParse.h"

namespace livera {

using namespace content_parse;

Status ContentDatabase::ingestMore(const std::string& source, const std::string& section, const Json& body,
                                   bool& handled) {
  handled = true;
  try {
    if (section == "family") {
      if (haveFamily_) return fail("content_duplicate", source + ": 'family' defined twice");
      haveFamily_ = true;
      FamilyConfig& F = family_;
      F.superviseUnder = body.value("supervise_under", F.superviseUnder);
      F.childNeeds = readStrings(body, "child_needs");
      F.childBmi = body.value("child_bmi", F.childBmi);
      F.neglectReportHours = body.value("neglect_report_hours", F.neglectReportHours);
      F.neglectCrime = body.value("neglect_crime", "");
      const Json& s = body.at("school");
      F.school = s.at("location").get<std::string>();
      F.schoolMinAge = s.value("min_age", F.schoolMinAge);
      F.schoolMaxAge = s.value("max_age", F.schoolMaxAge);
      F.schoolDays = readInts(s, "days");
      F.schoolStartHour = s.value("start_hour", F.schoolStartHour);
      F.schoolEndHour = s.value("end_hour", F.schoolEndHour);
      F.diplomaDegree = s.value("diploma", "");
      F.diplomaGrade = s.value("diploma_grade", F.diplomaGrade);
      const Json& d = body.at("daycare");
      F.daycare = d.at("location").get<std::string>();
      F.daycareMaxAge = d.value("max_age", F.daycareMaxAge);
      F.daycareDays = readInts(d, "days");
      F.daycareStartHour = d.value("start_hour", F.daycareStartHour);
      F.daycareEndHour = d.value("end_hour", F.daycareEndHour);
      F.daycareFeeCents = d.value("fee_per_day_cents", F.daycareFeeCents);
      F.daycareAccount = d.value("account", "");
      for (const auto& a : body.value("care_actions", Json::array())) {
        CareActionDef c;
        c.id = a.at("id").get<std::string>();
        c.label = a.at("label").get<std::string>();
        c.stages = readStrings(a, "stages");
        c.childNeeds = readStats(a, "child_needs");
        c.childEmotions = readStats(a, "child_emotions");
        c.carerNeeds = readStats(a, "carer_needs");
        c.bond = a.value("bond", 0.0);
        c.grade = a.value("grade", 0.0);
        c.cooldownMinutes = a.value("cooldown_minutes", c.cooldownMinutes);
        F.careActions.push_back(std::move(c));
      }
      return okStatus();
    }
    if (section == "needs_at_zero") {  // D-080
      if (haveNeedsAtZero_) return fail("content_duplicate", source + ": 'needs_at_zero' defined twice");
      haveNeedsAtZero_ = true;
      NeedsAtZeroConfig& Z = needsAtZero_;
      Z.hospital = body.at("hospital").get<std::string>();
      Z.rearmAbove = body.value("rearm_above", Z.rearmAbove);
      const Json& p = body.at("pass_out");
      Z.passOutHours = p.value("hours", Z.passOutHours);
      Z.energyAfterPassOut = p.value("energy_after", Z.energyAfterPassOut);
      Z.passOutEmotions = readStats(p, "emotions");
      Z.robberyChanceOutdoors = p.value("robbery_chance_outdoors", 0.0);
      Z.robberyMaxCashCents = p.value("robbery_max_cash_cents", Cents{0});
      for (const auto& j : body.at("needs")) {
        ZeroRuleDef r;
        r.need = j.at("need").get<std::string>();
        r.rule = j.at("rule").get<std::string>();
        r.hours = j.value("hours", 0.0);
        r.billCents = j.value("bill_cents", Cents{0});
        r.after = readStats(j, "after");
        r.emotionsPerHour = readStats(j, "emotions_per_hour");
        r.needsPerHour = readStats(j, "needs_per_hour");
        r.receptivity = j.value("receptivity", 1.0);
        r.condition = j.value("condition", "");
        r.summary = j.at("summary").get<std::string>();
        r.text = j.value("text", "");
        Z.rules.push_back(std::move(r));
      }
      return okStatus();
    }
  } catch (const std::exception& e) {
    return fail("content_invalid", source + ": " + e.what());
  }
  // M0.8 features parse their own sections.
  if (auto st = ingestHomes(source, section, body, handled); !st || handled) return st;
  if (auto st = ingestWork(source, section, body, handled); !st || handled) return st;
  if (auto st = ingestWallet(source, section, body, handled); !st || handled) return st;
  if (auto st = ingestLeisure(source, section, body, handled); !st || handled) return st;
  if (auto st = ingestPets(source, section, body, handled); !st || handled) return st;
  if (auto st = ingestDetails(source, section, body, handled); !st || handled) return st;
  if (auto st = ingestGoals(source, section, body, handled); !st || handled) return st;
  if (auto st = ingestManners(source, section, body, handled); !st || handled) return st;
  if (auto st = ingestTownLife(source, section, body, handled); !st || handled) return st;  // D-073
  if (auto st = ingestInteriors(source, section, body, handled); !st || handled) return st;
  if (auto st = ingestLifeEvents(source, section, body, handled); !st || handled) return st;  // D-068
  if (auto st = ingestFights(source, section, body, handled); !st || handled) return st;      // D-070
  if (auto st = ingestSocial(source, section, body, handled); !st || handled) return st;      // D-074
  handled = false;
  return okStatus();
}

Status ContentDatabase::validateMore() const {
  std::set<std::string> needs, emotions(sim_.emotions.begin(), sim_.emotions.end()), orgs, stages;
  for (const auto& n : sim_.needs) needs.insert(n.id);
  for (const auto& o : orgAccounts_) orgs.insert(o.id);
  for (const auto& s : life_.lifeStages) stages.insert(s.id);
  if (haveFamily_) {
    const FamilyConfig& F = family_;
    if (!location(F.school)) return fail("content_invalid", "family.school: unknown location " + F.school);
    if (!location(F.daycare)) return fail("content_invalid", "family.daycare: unknown location " + F.daycare);
    if (!orgs.count(F.daycareAccount)) return fail("content_invalid", "family.daycare.account must be an org account");
    if (!F.neglectCrime.empty() && !crimeDef(F.neglectCrime)) return fail("content_invalid", "family: unknown neglect_crime");
    if (!F.diplomaDegree.empty() && !degree(F.diplomaDegree)) return fail("content_invalid", "family.school: unknown diploma degree");
    if (F.schoolMinAge < 0 || F.schoolMaxAge < F.schoolMinAge || F.daycareMaxAge < 0)
      return fail("content_invalid", "family: bad age ranges");
    for (const auto& n : F.childNeeds) {
      if (!needs.count(n)) return fail("content_invalid", "family.child_needs: unknown need " + n);
    }
    std::set<std::string> ids;
    for (const auto& a : F.careActions) {
      const std::string where = "family care action " + a.id;
      if (!ids.insert(a.id).second) return fail("content_duplicate", "duplicate " + where);
      if (auto s = checkKeys(a.childNeeds, needs, where); !s) return s;
      if (auto s = checkKeys(a.childEmotions, emotions, where); !s) return s;
      if (auto s = checkKeys(a.carerNeeds, needs, where); !s) return s;
      for (const auto& st : a.stages) {
        if (!stages.count(st)) return fail("content_invalid", where + ": unknown life stage " + st);
      }
    }
  }
  for (const auto& [id, c] : careers_) {
    if (c.atEmployersHome && !c.employerAccount.empty())
      return fail("content_invalid", "career " + id + ": a job at the employer's home is paid by the family, not an account");
  }
  // What happens when a need runs out (D-080): a rule for every need, and the illnesses running it down brings.
  if (haveNeedsAtZero_) {
    const NeedsAtZeroConfig& Z = needsAtZero_;
    const LocationDef* er = location(Z.hospital);
    if (!er || !er->enterable || er->revenueAccount.empty())
      return fail("content_invalid", "needs_at_zero.hospital must be an enterable place that bills: " + Z.hospital);
    if (Z.passOutHours <= 0 || Z.rearmAbove <= 0 || Z.robberyChanceOutdoors < 0 || Z.robberyChanceOutdoors > 1 ||
        Z.robberyMaxCashCents < 0)
      return fail("content_invalid", "needs_at_zero: pass_out hours, rearm_above and the robbery numbers must make sense");
    if (auto s = checkKeys(Z.passOutEmotions, emotions, "needs_at_zero.pass_out.emotions"); !s) return s;
    static const std::set<std::string> kRules{"pass_out", "hospital", "accident", "notice"};
    std::set<std::string> ruled;
    for (const auto& r : Z.rules) {
      const std::string where = "needs_at_zero " + r.need;
      if (!needs.count(r.need)) return fail("content_invalid", where + ": unknown need");
      if (!ruled.insert(r.need).second) return fail("content_duplicate", where + " is given twice");
      if (!kRules.count(r.rule)) return fail("content_invalid", where + ": rule is pass_out, hospital, accident or notice");
      if ((r.rule == "accident") != (r.need == "bladder"))
        return fail("content_invalid", where + ": bladder's rule is accident (wetting yourself), and only bladder's");
      if (r.rule == "hospital" && (r.hours <= 0 || r.billCents < 0))
        return fail("content_invalid", where + ": a hospital stay needs hours and a bill of 0 or more");
      if (auto s = checkKeys(r.after, needs, where + " after"); !s) return s;
      if (auto s = checkKeys(r.needsPerHour, needs, where + " needs_per_hour"); !s) return s;
      if (auto s = checkKeys(r.emotionsPerHour, emotions, where + " emotions_per_hour"); !s) return s;
      if (r.receptivity <= 0 || r.receptivity > 1) return fail("content_invalid", where + ": receptivity is in (0, 1]");
      if (!r.condition.empty() && !condition(r.condition)) return fail("content_invalid", where + ": unknown condition " + r.condition);
      if (r.summary.empty() || (r.rule != "accident" && r.text.empty()))
        return fail("content_invalid", where + ": summary (the needs card) and text (what you're told) are required");
    }
    for (const auto& n : sim_.needs) {
      if (!ruled.count(n.id)) return fail("content_invalid", "needs_at_zero: no rule for the need " + n.id);
    }
  }
  for (const auto& [id, d] : conditions_) {
    if (d.fromZeroNeed.empty()) continue;
    if (!needs.count(d.fromZeroNeed)) return fail("content_invalid", "condition " + id + ": from_zero names an unknown need");
    if (d.fromZeroTimes < 1 || d.fromZeroWithinDays <= 0)
      return fail("content_invalid", "condition " + id + ": from_zero needs times >= 1 and within_days > 0");
  }
  if (auto st = validateHomes(); !st) return st;
  if (auto st = validateWork(); !st) return st;
  if (auto st = validateWallet(); !st) return st;
  if (auto st = validateLeisure(); !st) return st;
  if (auto st = validatePets(); !st) return st;
  if (auto st = validateDetails(); !st) return st;
  if (auto st = validateGoals(); !st) return st;
  if (auto st = validateManners(); !st) return st;
  if (auto st = validateTownLife(); !st) return st;  // D-073
  if (auto st = validateCast(); !st) return st;      // D-073
  if (auto st = validateInteriors(); !st) return st;
  if (auto st = validateLifeEvents(); !st) return st;  // D-068
  if (auto st = validateFights(); !st) return st;      // D-070
  return okStatus();
}

const CareActionDef* ContentDatabase::careAction(const std::string& id) const {
  for (const auto& a : family_.careActions) {
    if (a.id == id) return &a;
  }
  return nullptr;
}

}  // namespace livera
