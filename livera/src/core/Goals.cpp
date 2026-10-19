// Goals: three daily goals drawn per character and game day, and life aspirations (chosen in the creator, or named
// in a founder's data). Which goals exist, their labels and numbers are data (data/goals/goals.json); this file
// knows how to check each kind of goal from records the World already keeps (the ledger, memories, relationships,
// the career, fame, songs, homes, messages) and reads only the character's own. Nothing here is saved: the day's
// draw is a pure function like the work decisions' (D-037), and done-ness is computed when asked. Rewards and
// streaks would need saved state and a migration; they wait (docs/proposals/redesign.md, R2.1).
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <functional>
#include <map>
#include <set>

#include "core/Clock.h"
#include "core/Content.h"
#include "core/ContentParse.h"
#include "core/DayHash.h"
#include "core/World.h"

namespace livera {

using namespace content_parse;

namespace {

// The kinds of check a goal can name. Each is a few lines in World::checkGoal; anything else is refused at load.
const std::set<std::string> kCheckTypes = {
    "ledger_today",       "ledger_net_today",    "purchases_today",    "memories_today",
    "memories",           "promotions",          "people_interacted_today", "messages_sent_today",
    "work_calls_today",   "relationships_at_least", "relationship_status", "children",
    "fame_tier_at_least", "songs_released",      "owns_home",          "bank_at_least",
    "bank_covers_down_payment"};

const std::set<std::string> kRequirements = {"has_career", "has_work_decisions", "has_partner",
                                             "on_team",    "match_today",        "has_phone"};

// Ledger kinds the World writes (World.cpp and the feature files), so a goal can't name a kind that never happens.
const std::set<std::string> kLedgerKinds = {
    "adoption", "bonus",    "care_fee",    "childcare", "fare",    "fine",            "home_purchase",
    "home_sale", "league_fee", "legal",    "livpay",    "livpay_fare", "livpay_purchase", "medical",
    "mortgage", "mortgage_payoff", "opening_balance", "purchase", "rent", "salary",  "salary_away",
    "theft",    "tip",      "tuition",     "vet"};

// Memory types the World writes. Interactions' memory types (data) are allowed too.
const std::set<std::string> kMemoryTypes = {
    "abortion",   "adopted_pet", "arrest",     "attended_wedding", "birth_of_child", "birthday",  "birthday_cake",
    "bought_home", "date",       "first_meeting", "foreclosure",   "graduation",     "heard_gossip", "intimacy",
    "life_change", "lost_pet",   "match",      "miscarriage",      "moved_in_together", "new_job", "overdose",
    "performance", "promotion",  "robbed",     "saw_accident",     "saw_crime",      "wet_myself"};

const std::set<std::string> kStatuses = {"dating", "engaged", "married", "ex", "divorced"};
const std::set<std::string> kPartnerStatuses = {"dating", "engaged", "married"};

GoalCheckDef readCheck(const Json& j) {
  GoalCheckDef c;
  c.type = j.at("type").get<std::string>();
  c.min = j.value("min", 1);
  c.kinds = readStrings(j, "kinds");
  c.direction = j.value("direction", c.direction);
  c.placeTypes = readStrings(j, "place_types");
  c.memory = j.value("memory", "");
  c.bestOnly = j.value("best_only", false);
  c.dimension = j.value("dimension", "");
  c.value = j.value("value", 0.0);
  c.statuses = readStrings(j, "statuses");
  c.tier = j.value("tier", "");
  c.cents = j.value("cents", Cents{0});
  return c;
}

std::string counted(double count, double target) {
  return std::to_string(static_cast<long long>(std::min(count, target))) + "/" +
         std::to_string(static_cast<long long>(target));
}

}  // namespace

// ---- Content -------------------------------------------------------------------------------
Status ContentDatabase::ingestGoals(const std::string& source, const std::string& section, const Json& body,
                                    bool& handled) {
  handled = section == "goals";
  if (!handled) return okStatus();
  if (haveGoals_) return fail("content_duplicate", source + ": 'goals' defined twice");
  haveGoals_ = true;
  try {
    GoalsConfig& G = goals_;
    const Json daily = body.value("daily", Json::object());
    G.perDay = daily.value("per_day", G.perDay);
    for (const auto& g : daily.value("pool", Json::array())) {
      DailyGoalDef d;
      d.id = g.at("id").get<std::string>();
      d.label = g.at("label").get<std::string>();
      d.check = readCheck(g.at("check"));
      d.requirements = readStrings(g, "requires");
      G.daily.push_back(std::move(d));
    }
    for (const auto& a : body.value("aspirations", Json::array())) {
      AspirationDef d;
      d.id = a.at("id").get<std::string>();
      d.label = a.at("label").get<std::string>();
      d.creatorGoal = a.value("creator_goal", "");
      d.tracked = a.value("tracked", true);
      d.untrackedReason = a.value("untracked_reason", "");
      for (const auto& st : a.value("steps", Json::array()))
        d.steps.push_back(AspirationStepDef{st.at("label").get<std::string>(), readCheck(st.at("check"))});
      G.aspirations.push_back(std::move(d));
    }
  } catch (const std::exception& e) {
    return fail("content_invalid", source + ": " + e.what());
  }
  return okStatus();
}

Status ContentDatabase::validateGoals() const {
  const GoalsConfig& G = goals_;
  std::set<std::string> memories = kMemoryTypes, placeTypes, tiers;
  for (const auto& [id, i] : interactions_) memories.insert(i.memoryType);
  for (const auto& [id, l] : locations_) placeTypes.insert(l.type);
  for (const auto& t : fame_.tiers) tiers.insert(t.id);
  const std::set<std::string> dims(sim_.relationshipDimensions.begin(), sim_.relationshipDimensions.end());
  auto checkOk = [&](const GoalCheckDef& c, const std::string& where) -> Status {
    if (!kCheckTypes.count(c.type)) return fail("content_invalid", where + ": unknown check type '" + c.type + "'");
    if (c.min < 1) return fail("content_invalid", where + ": min must be at least 1");
    if (c.type == "ledger_today") {
      if (c.kinds.empty()) return fail("content_invalid", where + ": ledger_today needs kinds");
      for (const auto& k : c.kinds) {
        if (!kLedgerKinds.count(k)) return fail("content_invalid", where + ": unknown ledger kind '" + k + "'");
      }
      if (c.direction != "in" && c.direction != "out")
        return fail("content_invalid", where + ": direction must be in or out");
    }
    if (c.type == "purchases_today") {
      if (c.placeTypes.empty()) return fail("content_invalid", where + ": purchases_today needs place_types");
      for (const auto& t : c.placeTypes) {
        if (!placeTypes.count(t)) return fail("content_invalid", where + ": unknown place type '" + t + "'");
      }
    }
    if ((c.type == "memories_today" || c.type == "memories") && !memories.count(c.memory))
      return fail("content_invalid", where + ": unknown memory type '" + c.memory + "'");
    if (c.type == "relationships_at_least" && !dims.count(c.dimension))
      return fail("content_invalid", where + ": unknown relationship dimension '" + c.dimension + "'");
    if (c.type == "relationship_status") {
      if (c.statuses.empty()) return fail("content_invalid", where + ": relationship_status needs statuses");
      for (const auto& st : c.statuses) {
        if (!kStatuses.count(st)) return fail("content_invalid", where + ": unknown relationship status '" + st + "'");
      }
    }
    if (c.type == "fame_tier_at_least" && !tiers.count(c.tier))
      return fail("content_invalid", where + ": unknown fame tier '" + c.tier + "'");
    if (c.type == "bank_at_least" && c.cents <= 0)
      return fail("content_invalid", where + ": bank_at_least needs cents");
    return okStatus();
  };
  if (haveGoals_ && (G.perDay < 1 || G.perDay > 10))
    return fail("content_invalid", "goals.daily.per_day must be 1 to 10");
  std::set<std::string> ids;
  for (const auto& g : G.daily) {
    const std::string where = "daily goal " + g.id;
    if (!ids.insert(g.id).second) return fail("content_duplicate", "duplicate " + where);
    if (g.label.empty()) return fail("content_invalid", where + ": needs a label");
    if (auto st = checkOk(g.check, where); !st) return st;
    for (const auto& r : g.requirements) {
      if (!kRequirements.count(r)) return fail("content_invalid", where + ": unknown requirement '" + r + "'");
    }
  }
  ids.clear();
  std::map<std::string, std::string> byCreatorGoal;
  for (const auto& a : G.aspirations) {
    const std::string where = "aspiration " + a.id;
    if (!ids.insert(a.id).second) return fail("content_duplicate", "duplicate " + where);
    if (a.label.empty()) return fail("content_invalid", where + ": needs a label");
    if (a.tracked && a.steps.empty()) return fail("content_invalid", where + ": a tracked aspiration needs steps");
    if (!a.tracked && (a.untrackedReason.empty() || !a.steps.empty()))
      return fail("content_invalid", where + ": an untracked aspiration has an untracked_reason and no steps");
    for (std::size_t i = 0; i < a.steps.size(); ++i) {
      if (a.steps[i].label.empty()) return fail("content_invalid", where + ": every step needs a label");
      if (auto st = checkOk(a.steps[i].check, where + " step " + std::to_string(i + 1)); !st) return st;
    }
    if (!a.creatorGoal.empty()) {
      if (!byCreatorGoal.emplace(a.creatorGoal, a.id).second)
        return fail("content_invalid", where + ": creator goal '" + a.creatorGoal + "' already maps to " +
                                           byCreatorGoal[a.creatorGoal]);
      const auto& opts = creator_.goals.options;
      if (haveCreator_ && std::find(opts.begin(), opts.end(), a.creatorGoal) == opts.end())
        return fail("content_invalid", where + ": '" + a.creatorGoal + "' is not a goal the creator offers");
    }
  }
  // Every goal the creator offers is followed, or says why it can't be yet: none is silently ignored.
  if (haveGoals_ && haveCreator_) {
    for (const auto& o : creator_.goals.options) {
      if (!byCreatorGoal.count(o))
        return fail("content_invalid",
                    "goals: the creator goal '" + o + "' has no aspiration (add one, tracked or not)");
    }
  }
  for (const auto& [id, c] : characters_) {
    for (const auto& a : c.aspirations) {
      if (!aspiration(a)) return fail("content_invalid", "character " + id + ": unknown aspiration '" + a + "'");
    }
  }
  return okStatus();
}

const AspirationDef* ContentDatabase::aspiration(const std::string& id) const {
  for (const auto& a : goals_.aspirations) {
    if (a.id == id) return &a;
  }
  return nullptr;
}

const AspirationDef* ContentDatabase::aspirationForCreatorGoal(const std::string& creatorGoal) const {
  for (const auto& a : goals_.aspirations) {
    if (!a.creatorGoal.empty() && a.creatorGoal == creatorGoal) return &a;
  }
  return nullptr;
}

// ---- Checks --------------------------------------------------------------------------------
// Each reads only this character's records: their accounts, memories, side of relationships, messages, career,
// fame, songs and homes. Never anyone else's.
World::GoalProgress World::checkGoal(const CharacterState& c, const GoalCheckDef& k) const {
  const GameMinutes dayStart = state_.now - state_.now % kMinutesPerDay;
  const LedgerAccountId bank = bankAccountOf(c.id), cash = cashAccountOf(c.id);
  auto mine = [&](const LedgerAccountId& a) { return a == bank || a == cash; };
  GoalProgress p;
  p.target = k.min;
  auto count = [&](double n) {
    p.count = n;
    p.done = n >= p.target;
    p.progress = counted(n, p.target);
  };
  auto money = [&](Cents have, Cents need) {
    p.count = static_cast<double>(have);
    p.target = static_cast<double>(need);
    p.done = have >= need;
    p.progress = formatMoney(std::max<Cents>(0, have)) + " of " + formatMoney(need);
  };
  // Today's transactions, newest first, stopping at midnight (the log is in time order).
  auto today = [&](const std::function<void(const LedgerTransaction&)>& f) {
    const auto& txs = state_.ledger.transactions();
    for (auto it = txs.rbegin(); it != txs.rend() && it->at >= dayStart; ++it) f(*it);
  };
  const std::string& t = k.type;
  if (t == "ledger_today") {
    int n = 0;
    today([&](const LedgerTransaction& tx) {
      if (std::find(k.kinds.begin(), k.kinds.end(), tx.kind) == k.kinds.end()) return;
      if (k.direction == "in" ? mine(tx.to) && !mine(tx.from) : mine(tx.from) && !mine(tx.to)) ++n;
    });
    count(n);
  } else if (t == "ledger_net_today") {
    Cents net = 0;
    today([&](const LedgerTransaction& tx) {
      if (tx.kind == "opening_balance") return;  // money brought to Livéra on arrival isn't earned
      if (mine(tx.to) && !mine(tx.from)) net += tx.amountCents;
      if (mine(tx.from) && !mine(tx.to)) net -= tx.amountCents;
    });
    p.count = static_cast<double>(net);
    p.target = static_cast<double>(std::max<Cents>(1, k.cents));
    p.done = net >= std::max<Cents>(1, k.cents);
    p.progress = (net < 0 ? "-" : "+") + formatMoney(net < 0 ? -net : net) + " today";
  } else if (t == "purchases_today") {
    std::set<LedgerAccountId> shops;  // businesses running a place of those types
    for (const auto& [id, loc] : content_->locations()) {
      if (std::find(k.placeTypes.begin(), k.placeTypes.end(), loc.type) != k.placeTypes.end() &&
          !loc.revenueAccount.empty())
        shops.insert(loc.revenueAccount);
    }
    int n = 0;
    today([&](const LedgerTransaction& tx) {
      if ((tx.kind == "purchase" || tx.kind == "livpay_purchase") && mine(tx.from) && shops.count(tx.to)) ++n;
    });
    count(n);
  } else if (t == "memories_today" || t == "memories" || t == "promotions") {
    const std::string type = t == "promotions" ? "promotion" : k.memory;
    int n = 0;
    for (const auto& m : state_.memories) {
      if (m.owner == c.id && m.type == type && (t != "memories_today" || m.at >= dayStart)) ++n;
    }
    count(n);
    if (t == "promotions" && !p.done) {
      // Where the next title stands, from their own career.
      if (const CareerDef* career = content_->career(c.career.careerId)) {
        const auto level = static_cast<std::size_t>(c.career.level);
        if (level + 1 < career->levels.size() && career->levels[level].hoursToPromote > 0) {
          char buf[96];
          std::snprintf(buf, sizeof buf, "%s: %.0f of %.0f hours", career->levels[level + 1].title.c_str(),
                        std::floor(c.career.hoursAtLevel), career->levels[level].hoursToPromote);
          p.detail = buf;
        } else {
          p.detail = "You're at the top of your career.";
        }
      } else {
        p.detail = "You don't have a job.";
      }
    }
  } else if (t == "people_interacted_today") {
    int n = 0;
    for (const auto& [key, rel] : state_.relationships) {
      if (key.first == c.id && rel.lastInteractionAt >= dayStart) ++n;
    }
    count(n);
  } else if (t == "messages_sent_today") {
    int n = 0;
    for (const auto& m : state_.messages) n += m.from == c.id && m.at >= dayStart ? 1 : 0;
    count(n);
  } else if (t == "work_calls_today") {
    const std::int64_t day = toDateTime(state_.now).dayIndex;
    int n = 0;
    for (const auto& a : c.workDecisions.answers) n += a.day == day && (!k.bestOnly || a.score >= 1) ? 1 : 0;
    count(n);
  } else if (t == "relationships_at_least") {
    int n = 0;
    for (const auto& [key, rel] : state_.relationships) {
      if (key.first != c.id) continue;
      const auto it = rel.dimensions.find(k.dimension);
      if (it != rel.dimensions.end() && it->second >= k.value) ++n;
    }
    count(n);
  } else if (t == "relationship_status") {
    int n = 0;
    for (const auto& [key, rel] : state_.relationships) {
      if (key.first == c.id && std::find(k.statuses.begin(), k.statuses.end(), rel.status) != k.statuses.end()) ++n;
    }
    count(n);
  } else if (t == "children") {
    count(static_cast<double>(childrenOf(c.id).size()));
  } else if (t == "fame_tier_at_least") {
    double need = 0;
    for (const auto& tier : content_->fame().tiers) {
      if (tier.id == k.tier) need = tier.minFame;
    }
    p.count = c.fame;
    p.target = need;
    p.done = c.fame >= need;
    p.progress = "fame " + std::to_string(static_cast<int>(std::floor(c.fame))) + " of " +
                 std::to_string(static_cast<int>(need));
  } else if (t == "songs_released") {
    int n = 0;
    for (const auto& [id, s] : state_.songs) n += s.owner == c.id && s.released ? 1 : 0;
    count(n);
  } else if (t == "owns_home") {
    int n = 0;
    for (const auto& [pid, prop] : state_.properties)
      n += std::find(prop.owners.begin(), prop.owners.end(), c.id) != prop.owners.end() ? 1 : 0;
    count(n);
  } else if (t == "bank_at_least") {
    money(state_.ledger.balance(bank), k.cents);
  } else if (t == "bank_covers_down_payment") {
    // The cheapest home on the market now (a for-sale home nobody owns), at the lender's minimum down payment.
    Cents cheapest = 0;
    for (const auto& [pid, prop] : state_.properties) {
      const PropertyDef* def = content_->property(pid);
      if (!def || !def->forSale || !prop.owners.empty()) continue;
      if (cheapest == 0 || def->marketValueCents < cheapest) cheapest = def->marketValueCents;
    }
    if (cheapest == 0) {
      p.target = 0;
      p.progress = "no home for sale";
      p.detail = "No home is for sale right now.";
    } else {
      const auto down = static_cast<Cents>(std::ceil(static_cast<double>(cheapest) * content_->homes().minDownPayment));
      money(state_.ledger.balance(bank), down);
    }
  }
  return p;
}

bool World::goalRequirementMet(const CharacterState& c, const std::string& r) const {
  const CareerDef* career = content_->career(c.career.careerId);
  if (r == "has_career") return career != nullptr;
  if (r == "has_work_decisions") return career && !content_->workTasksFor(career->id).empty();
  if (r == "has_phone") return phoneUsable(c).ok();
  if (r == "on_team") return !c.leisureTeams.empty();
  if (r == "has_partner") {
    for (const auto& [key, rel] : state_.relationships) {
      if (key.first == c.id && kPartnerStatuses.count(rel.status)) return true;
    }
    return false;
  }
  if (r == "match_today") {
    const DateTime d = toDateTime(state_.now);
    for (const auto& team : c.leisureTeams) {
      const LeisureTeamDef* def = content_->leisureTeam(team);
      const LeisureSportDef* sport = def ? content_->leisureSport(def->sport) : nullptr;
      if (!sport || sport->matchWeekday != d.weekday) continue;
      for (const auto& [home, away] : leisureFixtures(*sport, d.dayIndex / kDaysPerWeek)) {
        if (home == team || away == team) return true;
      }
    }
    return false;
  }
  return false;
}

// The day's goals: the pool in a per-(character, day) order, taking each goal the character can do now (or has
// already done today, so finishing a date and then breaking up doesn't take it off the list), up to per_day.
std::vector<const DailyGoalDef*> World::dailyGoals(const CharacterState& c, std::int64_t day) const {
  const GoalsConfig& G = content_->goals();
  std::vector<std::pair<std::uint64_t, const DailyGoalDef*>> ranked;
  for (const auto& g : G.daily) ranked.emplace_back(dayhash::dayKey(c.id, day, "goal|" + g.id), &g);
  std::sort(ranked.begin(), ranked.end(), [](const auto& a, const auto& b) {
    return a.first != b.first ? a.first < b.first : a.second->id < b.second->id;
  });
  std::vector<const DailyGoalDef*> out;
  for (const auto& [key, g] : ranked) {
    if (static_cast<int>(out.size()) >= G.perDay) break;
    const bool can = std::all_of(g->requirements.begin(), g->requirements.end(),
                                 [&](const std::string& r) { return goalRequirementMet(c, r); });
    if (can || checkGoal(c, g->check).done) out.push_back(g);
  }
  return out;
}

// ---- The phone app -------------------------------------------------------------------------
Json World::phoneGoals(const CharacterState& c) const {
  const DateTime d = toDateTime(state_.now);
  Json today = Json::array();
  int done = 0;
  for (const DailyGoalDef* g : dailyGoals(c, d.dayIndex)) {
    const GoalProgress p = checkGoal(c, g->check);
    done += p.done ? 1 : 0;
    today.push_back(Json{{"id", g->id}, {"label", g->label}, {"done", p.done}, {"progress", p.progress}});
  }
  // Aspirations: a founder's from their data, a made character's from the goals picked in the creator.
  const CharacterDef* def = definition(c.id);
  std::vector<std::pair<const AspirationDef*, std::string>> wanted;  // (aspiration, or null: the creator text)
  std::string from = "story";
  if (def && !def->aspirations.empty()) {
    for (const auto& id : def->aspirations) wanted.emplace_back(content_->aspiration(id), id);
  } else if (def && def->profile.is_object() && def->profile.value("goals", Json()).is_array()) {
    from = "creator";
    for (const auto& g : def->profile["goals"]) {
      if (!g.is_string()) continue;
      const std::string text = g.get<std::string>();
      wanted.emplace_back(content_->aspirationForCreatorGoal(text), text);
    }
  }
  Json aspirations = Json::array();
  for (const auto& [a, text] : wanted) {
    if (!a) {
      aspirations.push_back(Json{{"id", nullptr}, {"label", text}, {"tracked", false},
                                 {"reason", "The game doesn't follow this goal."}});
      continue;
    }
    Json j{{"id", a->id}, {"label", a->label}, {"tracked", a->tracked}};
    if (!a->tracked) {
      j["reason"] = a->untrackedReason;
      aspirations.push_back(std::move(j));
      continue;
    }
    Json steps = Json::array();
    Json next;
    std::string detail;
    for (const auto& st : a->steps) {
      const GoalProgress p = checkGoal(c, st.check);
      steps.push_back(Json{{"label", st.label}, {"done", p.done}, {"progress", p.progress}});
      if (!p.done && next.is_null()) {
        next = st.label;
        detail = p.detail;
      }
    }
    j["steps"] = steps;
    j["done"] = next.is_null();
    j["next"] = next;
    if (!detail.empty()) j["detail"] = detail;
    aspirations.push_back(std::move(j));
  }
  return Json{{"day", d.dayIndex},
              {"today", today},
              {"done_today", done},
              {"aspirations", aspirations},
              {"from", from},
              {"note", std::to_string(content_->goals().perDay) +
                           " goals a day, new at midnight. Done-ness comes from what you've actually done; nothing "
                           "here is rewarded yet."}};
}

}  // namespace livera
