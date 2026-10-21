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
  if (auto st = ingestInteriors(source, section, body, handled); !st || handled) return st;
  if (auto st = ingestLifeEvents(source, section, body, handled); !st || handled) return st;  // D-068
  if (auto st = ingestFights(source, section, body, handled); !st || handled) return st;      // D-070
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
  if (auto st = validateHomes(); !st) return st;
  if (auto st = validateWork(); !st) return st;
  if (auto st = validateWallet(); !st) return st;
  if (auto st = validateLeisure(); !st) return st;
  if (auto st = validatePets(); !st) return st;
  if (auto st = validateDetails(); !st) return st;
  if (auto st = validateGoals(); !st) return st;
  if (auto st = validateManners(); !st) return st;
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
