// Fist fights, no weapons (D-070). Someone starts one with a person right next to them; that person has a short
// window to fight back, run or take it (doing nothing is freezing: taking it). Who wins is the World's call from
// what neither side can fake (data/society/fights.json: skills and needs, injuries already carried, noise from the
// saved random stream). Consequences go through the systems that already exist: injuries are health conditions the
// clinic treats, needs and emotions, both sides of the relationship and every witness's view of whoever started it,
// a memory each, a rumour, and assault (crimes.json) for whoever started it when a blow lands: caught in the act,
// or reported and wanted until a patrol or an officer picks them up. Self-defence is never a crime.
//
// Fair play: one fight per pair a game day, a cooldown for whoever starts one, protection for whoever was attacked,
// never in places the data rules out (a clinic, a school), never with a child or someone asleep, and a person can
// always walk away (the You card): then no blow lands at all. A founder a script plays walks away unless its trait
// says it fights back, and isn't fought at work unless the data allows it.
//
// Beat Brawl (D-077): fighting back, with a person in the fight, is played beat by beat in real time. Each beat one
// fighter throws (a hook, a jab or a shove, shown as a tell over their head, sometimes a feint) and the other answers
// before the beat ends: duck, block or jab. A slip or a parry leaves the thrower open for a counter; perfect timing
// (late in the beat) hits harder. How hard a blow lands is the same score as above, theirs over yours, so sleep and
// the gym matter. Knowing how someone fights (you've seen them fight, or you know them well) shows their tell at once
// and they hardly ever feint. A founder a script plays throws every beat, in the style its traits give it; between two
// people the throws alternate. Either can walk away at any beat. Three rounds, faster each time, or until someone's
// composure is gone; then everything above follows (injury by the margin, assault when a blow landed, witnesses).
#include <algorithm>
#include <cmath>
#include <set>

#include "core/Clock.h"
#include "core/Content.h"
#include "core/ContentParse.h"
#include "core/Parts.h"
#include "core/World.h"

namespace livera {

using namespace content_parse;

namespace {

constexpr double kStatMin = 0;
constexpr double kStatMax = 100;

std::int64_t dayOf(GameMinutes t) { return toDateTime(t).dayIndex; }

double round1(double v) { return std::round(v * 10) / 10; }

FightEffectsDef readEffects(const Json& body, const char* key) {
  FightEffectsDef e;
  if (!body.contains(key)) return e;
  e.needs = readStats(body.at(key), "needs");
  e.emotions = readStats(body.at(key), "emotions");
  return e;
}

const char* label(const std::string& choice) {
  if (choice == "fight_back") return "Fight back";
  if (choice == "run") return "Run";
  return "Take it";
}

}  // namespace

// ---- Content -------------------------------------------------------------------------------
Status ContentDatabase::ingestFights(const std::string& source, const std::string& section, const Json& body,
                                     bool& handled) {
  handled = section == "fights";
  if (!handled) return okStatus();
  if (fights_.enabled) return fail("content_duplicate", source + ": 'fights' defined twice");
  try {
    FightsConfig& F = fights_;
    F.enabled = true;
    F.crime = body.value("crime", F.crime);
    F.rangeMeters = body.value("range_m", F.rangeMeters);
    F.windowMinutes = body.value("window_minutes", F.windowMinutes);
    F.attackerCooldownMinutes = body.value("attacker_cooldown_minutes", F.attackerCooldownMinutes);
    F.protectedMinutes = body.value("protected_minutes", F.protectedMinutes);
    F.noFightPlaceTypes = readStrings(body, "no_fight_place_types");
    const Json ap = body.value("autopilot", Json::object());
    F.autopilotAtWork = ap.value("at_work", F.autopilotAtWork);
    F.autopilotTrait = ap.value("fight_back_trait", "");
    F.autopilotFightBackAt = ap.value("fight_back_at", F.autopilotFightBackAt);
    const Json sc = body.value("score", Json::object());
    F.scoreBase = sc.value("base", F.scoreBase);
    F.scoreSkills = readStats(sc, "skills");
    F.scoreNeeds = readStats(sc, "needs");
    F.scorePerInjury = sc.value("per_injury", F.scorePerInjury);
    F.scoreNoise = sc.value("noise", F.scoreNoise);
    const Json run = body.value("run", Json::object());
    F.runBase = run.value("base", F.runBase);
    F.runPerPoint = run.value("per_point", F.runPerPoint);
    F.runMin = run.value("min", F.runMin);
    F.runMax = run.value("max", F.runMax);
    F.runDistanceMeters = run.value("distance_m", F.runDistanceMeters);
    for (const auto& i : body.value("injuries", Json::array()))
      F.injuries.push_back(FightInjuryDef{i.at("condition").get<std::string>(), i.value("margin", 0.0)});
    F.winner = readEffects(body, "winner");
    F.loser = readEffects(body, "loser");
    F.tookIt = readEffects(body, "took_it");
    F.attackerHit = readEffects(body, "attacker_hit");
    F.ran = readEffects(body, "ran");
    F.walkedAway = readEffects(body, "walked_away");
    F.attackerWalkedAway = readEffects(body, "attacker_walked_away");
    if (body.contains("winner")) {
      F.winnerInjuryChance = body.at("winner").value("injury_chance", 0.0);
      F.winnerInjury = body.at("winner").value("injury", "");
    }
    if (body.contains("took_it")) F.tookItInjury = body.at("took_it").value("injury", "");
    F.victimRelationship = readStats(body, "victim_relationship");
    F.attackerRelationship = readStats(body, "attacker_relationship");
    F.witnessRelationship = readStats(body, "witness_relationship");
    F.reportChance = body.value("report_chance", F.reportChance);
    F.witnessReportChance = body.value("witness_report_chance", F.witnessReportChance);
    F.importance = body.value("importance", F.importance);
    F.impact = body.value("impact", F.impact);
    F.witnessImportance = body.value("witness_importance", F.witnessImportance);
    F.witnessImpact = body.value("witness_impact", F.witnessImpact);
    if (body.contains("brawl")) {
      const Json& b = body.at("brawl");
      BrawlConfig& B = F.brawl;
      B.enabled = true;
      for (const auto& r : b.value("rounds", Json::array()))
        B.rounds.push_back(BrawlRoundDef{r.value("beats", 8), r.value("seconds", 1.0)});
      B.leadIn = b.value("lead_in_seconds", B.leadIn);
      B.tellAt = b.value("tell_at", B.tellAt);
      B.perfectFrom = b.value("perfect_from", B.perfectFrom);
      B.perfectMultiplier = b.value("perfect_multiplier", B.perfectMultiplier);
      B.feintChance = b.value("feint_chance", B.feintChance);
      B.knownFeintChance = b.value("known_feint_chance", B.knownFeintChance);
      B.knownFamiliarity = b.value("known_familiarity", B.knownFamiliarity);
      B.composure = b.value("composure", B.composure);
      B.edgeMin = b.value("edge_min", B.edgeMin);
      B.edgeMax = b.value("edge_max", B.edgeMax);
      B.damage = readStats(b, "damage");
      B.trade = b.value("trade", B.trade);
      const Json moves = b.value("moves", Json::object());
      for (const auto& [id, m] : moves.items()) B.moves[id] = BrawlMoveDef{m.value("base", 1.0), readStats(m, "traits")};
      B.marginPerComposure = b.value("margin_per_composure", B.marginPerComposure);
      B.maxGameMinutes = b.value("max_game_minutes", B.maxGameMinutes);
    }
  } catch (const std::exception& e) {
    return fail("content_invalid", source + ": " + e.what());
  }
  return okStatus();
}

Status ContentDatabase::validateFights() const {
  const FightsConfig& F = fights_;
  if (!F.enabled) return okStatus();
  auto bad = [](const std::string& m) { return fail("content_invalid", "fights: " + m); };
  std::set<std::string> needs, emotions(sim_.emotions.begin(), sim_.emotions.end()),
      dims(sim_.relationshipDimensions.begin(), sim_.relationshipDimensions.end()), skills(sim_.skills.begin(), sim_.skills.end()),
      traits(sim_.personalityTraits.begin(), sim_.personalityTraits.end()), types;
  for (const auto& n : sim_.needs) needs.insert(n.id);
  for (const auto& [id, l] : locations_) types.insert(l.type);
  if (!crimeDef(F.crime)) return bad("unknown crime '" + F.crime + "'");
  if (!(F.rangeMeters > 0) || F.rangeMeters > sim_.hearingRangeMeters) return bad("range_m must be above 0 and within say range");
  if (F.windowMinutes < 1) return bad("window_minutes must be at least 1");
  if (F.attackerCooldownMinutes < 0 || F.protectedMinutes < 0) return bad("cooldowns can't be negative");
  for (const auto& t : F.noFightPlaceTypes) {
    if (!types.count(t)) return bad("unknown place type '" + t + "'");
  }
  if (!F.autopilotTrait.empty() && !traits.count(F.autopilotTrait)) return bad("unknown trait '" + F.autopilotTrait + "'");
  if (auto s = checkKeys(F.scoreSkills, skills, "fights.score.skills"); !s) return s;
  if (auto s = checkKeys(F.scoreNeeds, needs, "fights.score.needs"); !s) return s;
  if (F.scoreNoise < 0 || F.scorePerInjury < 0) return bad("score noise and per_injury can't be negative");
  for (double p : {F.runBase, F.runMin, F.runMax, F.reportChance, F.witnessReportChance, F.winnerInjuryChance}) {
    if (p < 0 || p > 1) return bad("chances must be 0 to 1");
  }
  if (F.runMin > F.runMax) return bad("run.min must be at most run.max");
  if (F.injuries.empty()) return bad("needs at least one injury");
  double margin = -1;
  for (const auto& i : F.injuries) {
    if (!condition(i.condition)) return bad("unknown condition '" + i.condition + "'");
    if (i.margin <= margin) return bad("injury margins must increase");
    margin = i.margin;
  }
  for (const auto& c : {F.winnerInjury, F.tookItInjury}) {
    if (!c.empty() && !condition(c)) return bad("unknown condition '" + c + "'");
  }
  for (const auto& [fx, where] : {std::pair{&F.winner, "winner"}, std::pair{&F.loser, "loser"}, std::pair{&F.tookIt, "took_it"},
                                  std::pair{&F.attackerHit, "attacker_hit"}, std::pair{&F.ran, "ran"},
                                  std::pair{&F.walkedAway, "walked_away"}, std::pair{&F.attackerWalkedAway, "attacker_walked_away"}}) {
    if (auto s = checkKeys(fx->needs, needs, std::string("fights.") + where); !s) return s;
    if (auto s = checkKeys(fx->emotions, emotions, std::string("fights.") + where); !s) return s;
  }
  for (const auto& [rel, where] : {std::pair{&F.victimRelationship, "victim_relationship"},
                                   std::pair{&F.attackerRelationship, "attacker_relationship"},
                                   std::pair{&F.witnessRelationship, "witness_relationship"}}) {
    if (auto s = checkKeys(*rel, dims, std::string("fights.") + where); !s) return s;
  }
  for (int v : {F.importance, F.witnessImportance}) {
    if (v < 0 || v > 100) return bad("importance must be 0 to 100");
  }
  for (int v : {F.impact, F.witnessImpact}) {
    if (v < -100 || v > 100) return bad("impact must be -100 to 100");
  }
  if (const BrawlConfig& B = F.brawl; B.enabled) {
    if (B.rounds.empty()) return bad("brawl needs at least one round");
    for (const auto& r : B.rounds) {
      if (r.beats < 1 || !(r.seconds >= 0.4 && r.seconds <= 5)) return bad("brawl rounds: at least one beat, 0.4 to 5 s each");
    }
    if (!(B.leadIn >= 0 && B.leadIn <= 5)) return bad("brawl lead_in_seconds must be 0 to 5");
    if (!(B.tellAt >= 0 && B.tellAt < 0.9) || !(B.perfectFrom >= 0 && B.perfectFrom < 1))
      return bad("brawl tell_at must be 0 to 0.9 and perfect_from 0 to 1");
    if (!(B.perfectMultiplier >= 1)) return bad("brawl perfect_multiplier must be at least 1");
    for (double p : {B.feintChance, B.knownFeintChance, B.trade}) {
      if (!(p >= 0 && p <= 1)) return bad("brawl chances and trade must be 0 to 1");
    }
    if (!(B.knownFamiliarity >= 0 && B.knownFamiliarity <= 100)) return bad("brawl known_familiarity must be 0 to 100");
    if (!(B.composure > 0)) return bad("brawl composure must be above 0");
    if (!(B.edgeMin > 0 && B.edgeMin <= 1 && B.edgeMax >= 1)) return bad("brawl edge_min must be 0 to 1 and edge_max at least 1");
    const std::set<std::string> blows = {"hook", "jab", "shove", "chip", "pushed", "counter", "stuffed"};
    for (const auto& k : blows) {
      if (!B.damage.count(k) || B.damage.at(k) < 0) return bad("brawl damage needs " + k + " (0 or more)");
    }
    for (const auto& [k, v] : B.damage) {
      if (!blows.count(k)) return bad("brawl damage: unknown blow '" + k + "'");
    }
    double weight = 0;
    for (const char* m : {"hook", "jab", "shove"}) {
      if (!B.moves.count(m)) return bad(std::string("brawl moves needs ") + m);
      if (B.moves.at(m).base < 0) return bad("brawl move weights can't be negative");
      weight += B.moves.at(m).base;
      if (auto st = checkKeys(B.moves.at(m).traits, traits, "fights.brawl.moves"); !st) return st;
    }
    if (B.moves.size() != 3) return bad("brawl moves are hook, jab and shove");
    if (!(weight > 0)) return bad("brawl moves need some weight");
    if (!(B.marginPerComposure > 0) || B.maxGameMinutes < 1) return bad("brawl margin_per_composure and max_game_minutes must be above 0");
  }
  return okStatus();
}

// ---- The fight -----------------------------------------------------------------------------
// What a fighter brings, before luck: their skills and needs as the data weighs them, less the injuries they carry.
double World::fightScore(const CharacterState& c) {
  const FightsConfig& F = content_->fights();
  double s = F.scoreBase;
  for (const auto& [skill, w] : F.scoreSkills) s += w * (c.skills.count(skill) ? c.skills.at(skill) : 0);
  for (const auto& [need, w] : F.scoreNeeds) s += w * (c.needs.count(need) ? c.needs.at(need) : 0);
  int injuries = 0;
  for (const auto& k : c.conditions) {
    const bool injury = std::any_of(F.injuries.begin(), F.injuries.end(), [&](const FightInjuryDef& i) { return i.condition == k.id; });
    if (injury) ++injuries;
  }
  return s - F.scorePerInjury * injuries;
}

Result<Json> World::startFight(const CharacterId& actor, const CharacterId& target) {
  const FightsConfig& F = content_->fights();
  if (!F.enabled) return fail("unavailable", "fights aren't part of this world");
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& a = *r.value();
  if (Status st = freeToAct(a); !st) return st.error();
  if (target == actor) return fail("invalid_target", "you can't fight yourself");
  CharacterState* d = mutableCharacter(target);
  if (!d || !d->online) return fail("target_unavailable", "they are not here");
  const int adult = content_->life().adultAge;
  if (ageOf(actor) < adult || ageOf(target) < adult) return fail("minor", "never with a child");
  if (d->jailedUntil > state_.now) return fail("target_in_jail", "they're in a cell");
  if (d->asleepSince >= 0) return fail("asleep", "they're asleep");
  if (!together(a, *d, F.rangeMeters)) return fail("too_far", "you need to be right next to them");
  for (const CharacterState* c : {static_cast<const CharacterState*>(&a), static_cast<const CharacterState*>(d)}) {
    const LocationDef* here = currentPlace(*c);
    if (here && std::find(F.noFightPlaceTypes.begin(), F.noFightPlaceTypes.end(), here->type) != F.noFightPlaceTypes.end())
      return fail("no_fighting_here", "not at " + here->name);
  }
  if (isScripted(target) && d->career.shiftStartedAt && !F.autopilotAtWork) return fail("not_now", "they're at work");
  for (const auto& f : state_.fights) {
    if (f.attacker == actor || f.defender == actor || f.attacker == target || f.defender == target)
      return fail("busy", "one fight at a time");
  }
  if (inBrawl(actor) || inBrawl(target)) return fail("busy", "one fight at a time");
  if (a.street.nextFightAt > state_.now) return fail("cooling_down", "you've only just been in a fight");
  if (d->street.protectedUntil > state_.now) return fail("protected", "they were just in a fight: leave them be");
  const std::int64_t day = dayOf(state_.now);
  if (const auto f = a.street.fought.find(target); f != a.street.fought.end() && f->second == day)
    return fail("too_soon", "not twice in a day with the same person");

  PendingFight pf;
  pf.id = nextId("fight");
  pf.attacker = actor;
  pf.defender = target;
  pf.startedAt = state_.now;
  pf.expires = state_.now + F.windowMinutes;
  a.street.nextFightAt = state_.now + F.attackerCooldownMinutes;
  a.street.fought[target] = day;
  d->street.fought[actor] = day;
  std::erase_if(a.street.fought, [&](const auto& kv) { return kv.second < day; });  // only today's matter
  std::erase_if(d->street.fought, [&](const auto& kv) { return kv.second < day; });

  // Someone who always walks away, and a founder a script plays, answer at once.
  std::string now;
  if (d->street.walkAway) {
    now = "walk_away";
  } else if (isScripted(target)) {
    bool fights = false;
    if (const CharacterDef* def = definition(target); def && !F.autopilotTrait.empty()) {
      const auto trait = def->personality.find(F.autopilotTrait);
      fights = trait != def->personality.end() && trait->second >= F.autopilotFightBackAt;
    }
    now = fights ? "fight_back" : "walk_away";
  }
  const CharacterDef* ad = definition(actor);
  if (!now.empty()) {
    if (now == "fight_back" && brawlFor(pf)) return startBrawl(pf, actor);
    Json res = resolveFight(pf, now);
    emit({target}, "fight_result", res["defender"]);
    return res["attacker"];
  }
  state_.fights.push_back(pf);
  emit({target}, "fight_started",
       Json{{"fight", pf.id},
            {"from", actor},
            {"name", ad ? ad->fullName() : actor},
            {"expires_in_minutes", F.windowMinutes},
            {"choices", Json::array({Json{{"choice", "fight_back"}, {"label", label("fight_back")}},
                                     Json{{"choice", "run"}, {"label", label("run")}},
                                     Json{{"choice", "take_it"}, {"label", label("take_it")}}})},
            {"note", "Fighting back is self-defence, never a crime. Do nothing and you freeze: you take it."}});
  std::vector<CharacterId> around = presentWith(*d);
  if (std::find(around.begin(), around.end(), actor) == around.end()) around.push_back(actor);
  around.push_back(target);
  emit(around, "fight", Json{{"fight", pf.id}, {"attacker", actor}, {"defender", target}, {"stage", "started"},
                             {"position", Json::array({d->position.x, d->position.y})}, {"inside", d->inside}});
  const CharacterDef* dd = definition(target);
  return Json{{"fight", pf.id},
              {"with", target},
              {"name", dd ? dd->fullName() : target},
              {"status", "waiting"},
              {"expires_in_minutes", F.windowMinutes}};
}

Result<Json> World::respondToFight(const CharacterId& actor, const std::string& fightId, const std::string& choice) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  const auto it = std::find_if(state_.fights.begin(), state_.fights.end(),
                               [&](const PendingFight& f) { return f.id == fightId && f.defender == actor; });
  if (it == state_.fights.end()) return fail("unknown_fight", "that fight is over");
  if (choice != "fight_back" && choice != "run" && choice != "take_it") return fail("bad_choice", "fight back, run or take it");
  const PendingFight f = *it;
  state_.fights.erase(it);
  const CharacterState* a = character(f.attacker);
  if (!a || !a->online) return fail("unknown_fight", "they're gone");
  if (choice == "fight_back" && brawlFor(f) && together(*a, *character(f.defender), content_->fights().rangeMeters * 3))
    return startBrawl(f, actor);
  Json res = resolveFight(f, choice);
  emit({f.attacker}, "fight_result", res["attacker"]);
  return res["defender"];
}

Result<Json> World::setWalkAwayFromFights(const CharacterId& actor, bool walkAway) {
  if (!content_->fights().enabled) return fail("unavailable", "fights aren't part of this world");
  auto r = activeCharacter(actor, /*wakes=*/false);  // a setting, like the phone
  if (!r) return r.error();
  r.value()->street.walkAway = walkAway;
  return Json{{"walk_away_from_fights", walkAway}};
}

// Every game minute: a fight nobody answered in time is one the person attacked froze in. If either has left the
// world, it's off.
void World::stepFightsMinute() {
  std::vector<PendingFight> due;
  std::erase_if(state_.fights, [&](const PendingFight& f) {
    const CharacterState* a = character(f.attacker);
    const CharacterState* d = character(f.defender);
    if (!a || !d || !a->online || !d->online) return true;
    if (f.expires > state_.now) return false;
    due.push_back(f);
    return true;
  });
  for (const auto& f : due) {
    Json res = resolveFight(f, "froze");
    emit({f.attacker}, "fight_result", res["attacker"]);
    emit({f.defender}, "fight_result", res["defender"]);
  }
  // A brawl whose fighters left, or that no real time has moved for (a dev skip), ends where it stands.
  std::vector<std::pair<Brawl, std::string>> stale;
  std::erase_if(state_.brawls, [&](const Brawl& b) {
    const CharacterState* a = character(b.attacker);
    const CharacterState* d = character(b.defender);
    const bool gone = !a || !d || !a->online || !d->online;
    if (!gone && state_.now - b.startedAt < content_->fights().brawl.maxGameMinutes) return false;
    stale.emplace_back(b, gone ? "gone" : "points");
    return true;
  });
  for (const auto& [b, how] : stale) {
    if (!character(b.attacker) || !character(b.defender)) continue;
    Json res = finishBrawl(b, how);
    emit({b.attacker}, "fight_result", res["attacker"]);
    emit({b.defender}, "fight_result", res["defender"]);
  }
}

void World::applyFightEffects(CharacterState& c, const FightEffectsDef& fx, Json& changes) {
  for (const auto& [stats, deltas, key] : {std::tuple{&c.needs, &fx.needs, "needs"}, std::tuple{&c.emotions, &fx.emotions, "emotions"}}) {
    for (const auto& [k, dlt] : *deltas) {
      const double before = stats->count(k) ? stats->at(k) : 0;
      (*stats)[k] = clampd(before + dlt, kStatMin, kStatMax);
      const double moved = round1((*stats)[k] - before);
      if (moved == 0) continue;
      if (!changes.contains(key)) changes[key] = Json::object();
      changes[key][k] = round1(changes[key].value(k, 0.0) + moved);
    }
  }
}

void World::injureInFight(CharacterState& c, const std::string& condition, Json& changes) {
  if (condition.empty() || findCondition(c, condition)) return;
  addCondition(c, condition, /*diagnosed=*/true);  // you know you've been hit
  if (const ConditionDef* k = content_->condition(condition)) changes["injuries"].push_back(k->name);
}

// What happened, for both sides: {attacker: their result, defender: theirs}. The choices are the defender's:
// fight_back (scored at once: Beat Brawl plays it instead whenever a person is in the fight), run, take_it, froze
// (= take_it) or walk_away.
Json World::resolveFight(const PendingFight& f, const std::string& choiceIn) {
  const FightsConfig& F = content_->fights();
  CharacterState& a = *mutableCharacter(f.attacker);
  CharacterState& d = *mutableCharacter(f.defender);
  const CharacterDef* ad = definition(a.id);
  const CharacterDef* dd = definition(d.id);
  const std::string aName = ad ? ad->firstName : a.id, dName = dd ? dd->firstName : d.id;
  FightEnd e;
  std::string choice = choiceIn == "froze" ? "take_it" : choiceIn;
  // Already apart (one walked off, or was moved): nothing lands.
  if (choice != "walk_away" && !together(a, d, F.rangeMeters * 3)) choice = "got_away";
  if (choice == "walk_away" || choice == "got_away") {
    e.outcome = choice == "walk_away" ? "walked_away" : "got_away";
    applyFightEffects(d, F.walkedAway, e.dChanges);
    applyFightEffects(a, F.attackerWalkedAway, e.aChanges);
    e.dText = choice == "walk_away" ? aName + " squared up to you. You walked away, and nothing landed."
                                    : "By the time " + aName + " swung, you were gone.";
    e.aText = choice == "walk_away" ? dName + " walked away. Nothing landed, and everyone saw you try."
                                    : dName + " was already out of reach.";
  } else if (choice == "run") {
    const double p = clampd(F.runBase + F.runPerPoint * (fightScore(d) - fightScore(a)), F.runMin, F.runMax);
    if (roll() < p) {
      e.outcome = "ran";
      applyFightEffects(d, F.ran, e.dChanges);
      applyFightEffects(a, F.attackerWalkedAway, e.aChanges);
      e.dText = "You broke away from " + aName + " and ran. Nothing landed.";
      e.aText = dName + " broke away and ran. Nothing landed.";
      // Getting distance: out of the building, or down the street away from them.
      if (!d.inside.empty()) {
        (void)exitBuilding(d.id);
      } else {
        const double dx = d.position.x - a.position.x, dy = d.position.y - a.position.y, len = std::hypot(dx, dy);
        const Vec2 dir = len > 0.01 ? Vec2{dx / len, dy / len} : Vec2{1, 0};
        const SimulationConfig& sim = content_->sim();
        d.moveTarget = Vec2{clampd(d.position.x + dir.x * F.runDistanceMeters, sim.worldMin.x, sim.worldMax.x),
                            clampd(d.position.y + dir.y * F.runDistanceMeters, sim.worldMin.y, sim.worldMax.y)};
        d.moveSpeedMps = 0;
      }
    } else {
      e.outcome = "caught";
      e.landed = true;
      e.winner = a.id;
      applyFightEffects(d, F.ran, e.dChanges);
      applyFightEffects(d, F.tookIt, e.dChanges);
      applyFightEffects(a, F.attackerHit, e.aChanges);
      injureInFight(d, F.tookItInjury, e.dChanges);
      e.dText = "You tried to run. " + aName + " caught you before you got a step.";
      e.aText = dName + " tried to run. You caught them.";
    }
  } else if (choice == "take_it") {
    e.outcome = choiceIn == "froze" ? "froze" : "took_it";
    e.landed = true;
    e.winner = a.id;
    applyFightEffects(d, F.tookIt, e.dChanges);
    applyFightEffects(a, F.attackerHit, e.aChanges);
    injureInFight(d, F.tookItInjury, e.dChanges);
    e.dText = choiceIn == "froze" ? "You froze. " + aName + " hit you, and it was over before you moved."
                                  : "You took it. " + aName + " hit you, and you didn't hit back.";
    e.aText = dName + (choiceIn == "froze" ? " froze" : " didn't fight back") + ". You hit them.";
  } else {  // fight_back, scored at once
    e.landed = true;
    const double noise = F.scoreNoise;
    const double sa = fightScore(a) + noise * (roll() * 2 - 1);
    const double sd = fightScore(d) + noise * (roll() * 2 - 1);
    const bool attackerWins = sa > sd;  // a tie goes to the one defending themself
    CharacterState& w = attackerWins ? a : d;
    CharacterState& l = attackerWins ? d : a;
    Json& wc = attackerWins ? e.aChanges : e.dChanges;
    Json& lc = attackerWins ? e.dChanges : e.aChanges;
    e.winner = w.id;
    e.outcome = attackerWins ? "attacker_won" : "defender_won";
    applyFightEffects(w, F.winner, wc);
    applyFightEffects(l, F.loser, lc);
    const double margin = std::abs(sa - sd);
    std::string injury;
    for (const auto& i : F.injuries) {
      if (margin >= i.margin) injury = i.condition;
    }
    injureInFight(l, injury, lc);
    if (roll() < F.winnerInjuryChance) injureInFight(w, F.winnerInjury, wc);
    e.dText = attackerWins ? "You fought back, but " + aName + " got the better of you." : "You fought back, and " + aName + " came off worse.";
    e.aText = attackerWins ? dName + " fought back. You won." : dName + " fought back, and you came off worse.";
  }
  return concludeFight(f, std::move(e));
}

// What follows any fight, however it went: both remember it, whoever started it pays in trust (theirs and every
// witness's), the witnesses talk, the person attacked is protected for a while, and a blow that landed is assault.
Json World::concludeFight(const PendingFight& f, FightEnd e) {
  const FightsConfig& F = content_->fights();
  CharacterState& a = *mutableCharacter(f.attacker);
  CharacterState& d = *mutableCharacter(f.defender);
  const CharacterDef* ad = definition(a.id);
  const CharacterDef* dd = definition(d.id);
  const std::string aName = ad ? ad->firstName : a.id, dName = dd ? dd->firstName : d.id;
  const LocationDef* place = currentPlace(d);
  const std::string where = place ? place->name : "the street";
  std::vector<CharacterId> witnesses;
  for (const auto& id : presentWith(d)) {
    if (id != a.id) witnesses.push_back(id);
  }
  for (const auto& id : presentWith(a)) {
    if (id != d.id && std::find(witnesses.begin(), witnesses.end(), id) == witnesses.end()) witnesses.push_back(id);
  }
  std::sort(witnesses.begin(), witnesses.end());
  Json aOut{{"fight", f.id}, {"role", "attacker"}, {"with", d.id}, {"name", dd ? dd->fullName() : d.id}};
  Json dOut{{"fight", f.id}, {"role", "defender"}, {"with", a.id}, {"name", ad ? ad->fullName() : a.id}};

  for (const auto& [dim, v] : F.victimRelationship) adjustRelationship(d.id, a.id, dim, v);
  for (const auto& [dim, v] : F.attackerRelationship) adjustRelationship(a.id, d.id, dim, v);
  for (const auto& [owner, other, text] : {std::tuple{a.id, d.id, "Started a fight with " + dName + " at " + where + ": " + e.aText},
                                           std::tuple{d.id, a.id, aName + " attacked me at " + where + ": " + e.dText}}) {
    Memory m;
    m.id = nextId("mem");
    m.owner = owner;
    m.at = state_.now;
    m.participants = {a.id, d.id};
    m.location = d.inside;
    m.type = "fight";
    m.importance = F.importance;
    m.emotionalImpact = F.impact;
    m.about = other;
    m.info = text;
    m.isPublic = !witnesses.empty();
    addMemory(std::move(m));
  }
  for (const auto& w : witnesses) {
    for (const auto& [dim, v] : F.witnessRelationship) adjustRelationship(w, a.id, dim, v);
    Memory m;
    m.id = nextId("mem");
    m.owner = w;
    m.at = state_.now;
    m.participants = {w, a.id, d.id};
    m.location = d.inside;
    m.type = "saw_fight";
    m.importance = F.witnessImportance;
    m.emotionalImpact = F.witnessImpact;
    m.about = a.id;
    m.info = "Saw " + (ad ? ad->fullName() : a.id) + " start a fight with " + (dd ? dd->fullName() : d.id) + " at " + where;
    m.isPublic = true;
    addMemory(std::move(m));
  }
  witnessed("fight", a.id, d.id, d.inside, witnesses, "started a fight at " + where);  // the rumour (Social.cpp)
  d.street.protectedUntil = state_.now + F.protectedMinutes;

  // A blow that landed is assault by whoever started it: caught in the act, or reported and wanted.
  if (e.landed) {
    if (const CrimeDef* crime = content_->crimeDef(F.crime)) {
      const CrimeWitnesses seen = crimeWitnesses(a, d.id);
      const double caught = std::min(0.95, crime->detection + seen.witnesses * crime->perWitness +
                                               seen.staff * crime->perStaff + seen.police * crime->perPolice);
      if (roll() < caught) {
        Json arrest = arrestCharacter(a, crime->id, seen.police > 0 ? "the police" : "people who saw it", d.id);
        arrest["arrested"] = true;
        aOut["crime"] = arrest;
        dOut["crime"] = Json{{"arrested", true}, {"text", aName + " was arrested for " + crime->label + "."}};
      } else {
        double noReport = 1 - F.reportChance;
        for (std::size_t i = 0; i < witnesses.size(); ++i) noReport *= 1 - F.witnessReportChance;
        if (roll() >= noReport) {
          dispatchPolice(crime->label + " reported at " + where + ". Suspect: " + (ad ? ad->fullName() : a.id) + ".");
          const Json report = reportCrime(a, crime->id, d.id);  // a summons to court (D-083), or wanted
          if (report.value("summoned", false)) {
            aOut["crime"] = Json{{"summoned", true}, {"crime", crime->label}, {"case", report["case"]},
                                 {"hearing_at", report["hearing_at"]}, {"hearing_text", report.value("hearing_text", "")},
                                 {"courthouse", report.value("courthouse", "")}};
            dOut["crime"] = Json{{"reported", true},
                                 {"text", "It's been reported. " + aName + " is charged with " + crime->label +
                                              (report.contains("hearing_text") ? ": the hearing is " + report["hearing_text"].get<std::string>() +
                                                                                     " at " + report.value("courthouse", std::string("the courthouse"))
                                                                               : std::string()) + "."}};
          } else {
            notify(a.id, "police", "It was reported. You're wanted for " + crime->label + ".");
            aOut["crime"] = Json{{"wanted", true}, {"crime", crime->label}};
            dOut["crime"] = Json{{"reported", true}, {"text", "It's been reported. The police are looking for " + aName + "."}};
          }
        } else {
          aOut["crime"] = Json{{"wanted", false}, {"crime", crime->label}};
        }
      }
    }
  } else {
    dOut["crime"] = Json{{"self_defence", true}};
  }
  aOut.update(Json{{"outcome", e.outcome}, {"text", e.aText}, {"changes", e.aChanges}});
  dOut.update(Json{{"outcome", e.outcome}, {"text", e.dText}, {"changes", e.dChanges}});
  if (!e.winner.empty()) {
    aOut["won"] = e.winner == a.id;
    dOut["won"] = e.winner == d.id;
  }
  std::vector<CharacterId> around = witnesses;
  around.push_back(a.id);
  around.push_back(d.id);
  Json pub{{"fight", f.id}, {"attacker", a.id}, {"defender", d.id}, {"stage", "over"}, {"outcome", e.outcome},
           {"position", Json::array({d.position.x, d.position.y})}, {"inside", d.inside}};
  if (!e.winner.empty()) pub["winner"] = e.winner;
  emit(around, "fight", pub);
  return Json{{"attacker", aOut}, {"defender", dOut}};
}

// ---- Beat Brawl (D-077) -----------------------------------------------------------------------
bool World::inBrawl(const CharacterId& id) const {
  return std::any_of(state_.brawls.begin(), state_.brawls.end(),
                     [&](const Brawl& b) { return b.attacker == id || b.defender == id; });
}

// Played beat by beat whenever a person is in it; two founders a script plays (nobody to play it) are scored at once.
bool World::brawlFor(const PendingFight& f) const {
  return content_->fights().brawl.enabled && !(isScripted(f.attacker) && isScripted(f.defender));
}

// You know how someone fights if you know them well, or you've fought them or watched them fight before.
bool World::knowsHowTheyFight(const CharacterId& viewer, const CharacterId& fighter) const {
  if (relationshipValue(viewer, fighter, "familiarity") >= content_->fights().brawl.knownFamiliarity) return true;
  for (const Memory* m : memoriesOf(viewer)) {
    if ((m->type == "fight" || m->type == "saw_fight") &&
        std::find(m->participants.begin(), m->participants.end(), fighter) != m->participants.end())
      return true;
  }
  return false;
}

// How hard a blow from `hitter` lands on `receiver`: their scores (the same as a fight scored at once), clamped.
double World::brawlEdge(const CharacterId& hitter, const CharacterId& receiver) {
  const BrawlConfig& B = content_->fights().brawl;
  const double h = fightScore(*character(hitter)), r = fightScore(*character(receiver));
  return clampd(h / std::max(1.0, r), B.edgeMin, B.edgeMax);
}

// A thrower's move, from their style: each move's weight plus their traits' pull toward it.
std::string World::drawBrawlMove(const CharacterId& id) {
  const BrawlConfig& B = content_->fights().brawl;
  const CharacterDef* def = definition(id);
  std::vector<std::pair<std::string, double>> weights;
  double total = 0;
  for (const char* m : {"hook", "jab", "shove"}) {
    const BrawlMoveDef& md = B.moves.at(m);
    double w = md.base;
    if (def) {
      for (const auto& [trait, per] : md.traits) {
        const auto it = def->personality.find(trait);
        if (it != def->personality.end()) w += per * it->second;
      }
    }
    w = std::max(0.0, w);
    weights.emplace_back(m, w);
    total += w;
  }
  double r = roll() * total;
  for (const auto& [m, w] : weights) {
    if (r < w) return m;
    r -= w;
  }
  return weights.back().first;
}

Json World::startBrawl(const PendingFight& f, const CharacterId& caller) {
  const BrawlConfig& B = content_->fights().brawl;
  Brawl b;
  b.id = f.id;
  b.attacker = f.attacker;
  b.defender = f.defender;
  b.startedAt = state_.now;
  for (const auto& id : {f.attacker, f.defender}) {
    b.composure[id] = B.composure;
    b.dealt[id] = 0;
  }
  state_.brawls.push_back(b);
  Json rounds = Json::array();
  for (const auto& r : B.rounds) rounds.push_back(Json{{"beats", r.beats}, {"seconds", r.seconds}});
  auto view = [&](const CharacterId& me, const CharacterId& them, const char* role) {
    const CharacterDef* td = definition(them);
    return Json{{"fight", f.id},
                {"status", "brawl"},
                {"stage", "start"},
                {"role", role},
                {"with", them},
                {"name", td ? td->fullName() : them},
                {"rounds", rounds},
                {"composure", B.composure},
                {"edge", std::round(brawlEdge(me, them) * 100) / 100},
                {"knows_them", knowsHowTheyFight(me, them)},
                {"starts_in_seconds", B.leadIn},
                {"note", "Duck, block or jab before each beat ends. Walk away at any time."}};
  };
  const Json aView = view(f.attacker, f.defender, "attacker"), dView = view(f.defender, f.attacker, "defender");
  const CharacterId other = caller == f.attacker ? f.defender : f.attacker;
  emit({other}, "brawl", other == f.attacker ? aView : dView);
  CharacterState& d = *mutableCharacter(f.defender);
  std::vector<CharacterId> around = presentWith(d);
  for (const auto& id : {f.attacker, f.defender}) {
    if (std::find(around.begin(), around.end(), id) == around.end()) around.push_back(id);
  }
  emit(around, "fight", Json{{"fight", f.id}, {"attacker", f.attacker}, {"defender", f.defender}, {"stage", "brawl"},
                             {"position", Json::array({d.position.x, d.position.y})}, {"inside", d.inside}});
  Brawl& live = state_.brawls.back();
  beginBeat(live);
  live.elapsed = -B.leadIn;
  return caller == f.attacker ? aView : dView;
}

// Who throws this beat and what, and what the one answering is shown.
void World::beginBeat(Brawl& b) {
  const BrawlConfig& B = content_->fights().brawl;
  const double len = B.rounds.at(b.round).seconds;
  if (!b.open.empty()) {
    b.striker = b.open;  // slipped or parried: nothing coming, and a counter is there to take
    b.move = "open";
    b.open.clear();
  } else {
    // A founder a script plays throws every beat; between two people, the throws alternate.
    const bool scriptedA = isScripted(b.attacker), scriptedD = isScripted(b.defender);
    if (scriptedA != scriptedD) b.striker = scriptedA ? b.attacker : b.defender;
    else b.striker = b.count % 2 == 0 ? b.attacker : b.defender;
    b.move = drawBrawlMove(b.striker);
  }
  b.actor = b.striker == b.attacker ? b.defender : b.attacker;
  b.tell = b.move;
  const bool knows = knowsHowTheyFight(b.actor, b.striker);
  if (b.move != "open" && roll() < (knows ? B.knownFeintChance : B.feintChance)) {
    std::vector<std::string> others;
    for (const char* m : {"hook", "jab", "shove"}) {
      if (b.move != m) others.emplace_back(m);
    }
    b.tell = roll() < 0.5 ? others[0] : others[1];
  }
  b.tellDelay = knows || b.move == "open" ? 0 : B.tellAt * len;
  b.elapsed = 0;
  b.shown = false;
  b.answer.clear();
  b.answeredAt = -1;
}

void World::showTell(Brawl& b) {
  const BrawlConfig& B = content_->fights().brawl;
  const BrawlRoundDef& r = B.rounds.at(b.round);
  b.shown = true;
  const double window = r.seconds - b.tellDelay;
  Json beat{{"fight", b.id}, {"round", b.round + 1}, {"rounds", B.rounds.size()}, {"beat", b.beat + 1},
            {"beats", r.beats}, {"striker", b.striker}};
  Json toActor = beat, toStriker = beat;
  toActor.update(Json{{"you", "answer"}, {"tell", b.tell},
                      {"window_seconds", std::round(window * 100) / 100},
                      {"perfect_after_seconds", std::round(window * B.perfectFrom * 100) / 100}});
  toStriker.update(Json{{"you", "throw"}, {"move", b.move}, {"window_seconds", std::round(window * 100) / 100}});
  emit({b.actor}, "brawl_beat", toActor);
  emit({b.striker}, "brawl_beat", toStriker);
}

// The beat is over: what the answer met. Returns how the brawl ends ("ko", "points"), or empty to go on.
std::string World::endBeat(Brawl& b) {
  const BrawlConfig& B = content_->fights().brawl;
  const double window = B.rounds.at(b.round).seconds - b.tellDelay;
  const bool perfect = !b.answer.empty() && b.answeredAt >= b.tellDelay + window * B.perfectFrom;
  const double mult = perfect ? B.perfectMultiplier : 1;
  const CharacterId S = b.striker, A = b.actor;
  Json hits = Json::array();
  auto hit = [&](const CharacterId& to, const CharacterId& from, double base) {
    const double dmg = std::round(base * brawlEdge(from, to) * 10) / 10;
    if (dmg <= 0) return;
    b.composure[to] = std::max(0.0, b.composure[to] - dmg);
    b.dealt[from] += dmg;
    hits.push_back(Json{{"to", to}, {"from", from}, {"damage", dmg}});
  };
  const auto& D = B.damage;
  const std::string& m = b.move;
  const std::string& a = b.answer;
  std::string outcome;
  if (m == "open") {
    if (a == "jab") {
      outcome = "counter";
      hit(S, A, D.at("counter") * mult);
    } else {
      outcome = a.empty() ? "missed" : "wasted";
    }
  } else if (a.empty()) {
    outcome = "hit";
    hit(A, S, D.at(m));
  } else if (m == "hook") {
    if (a == "duck") {
      outcome = "slip";
      b.open = S;
    } else if (a == "block") {
      outcome = "chip";
      hit(A, S, D.at("chip"));
    } else {
      outcome = "trade";
      hit(A, S, D.at("hook") * B.trade);
      hit(S, A, D.at("jab") * mult);
    }
  } else if (m == "jab") {
    if (a == "duck") {
      outcome = perfect ? "slip" : "hit";
      if (perfect) b.open = S;
      else hit(A, S, D.at("jab"));
    } else if (a == "block") {
      outcome = perfect ? "parry" : "blocked";
      if (perfect) b.open = S;
    } else {
      outcome = "clash";
    }
  } else {  // shove
    if (a == "duck") {
      outcome = "grabbed";
      hit(A, S, D.at("shove"));
    } else if (a == "block") {
      outcome = "pushed";
      hit(A, S, D.at("pushed"));
    } else {
      outcome = "stuffed";
      hit(S, A, D.at("stuffed") * mult);
    }
  }
  Json composure = Json::object();
  for (const auto& [id, c] : b.composure) composure[id] = std::round(c * 10) / 10;
  Json result{{"fight", b.id}, {"round", b.round + 1}, {"beat", b.beat + 1}, {"striker", S}, {"move", m},
              {"tell", b.tell}, {"answer", a.empty() ? Json() : Json(a)}, {"perfect", perfect}, {"outcome", outcome},
              {"hits", hits}, {"composure", composure}};
  if (!b.open.empty()) result["open"] = b.open;
  emit({b.attacker, b.defender}, "brawl_hit", result);
  if (b.composure[S] <= 0 || b.composure[A] <= 0) return "ko";
  ++b.count;
  if (++b.beat >= B.rounds.at(b.round).beats) {
    b.beat = 0;
    if (++b.round >= static_cast<int>(B.rounds.size())) return "points";
  }
  beginBeat(b);
  return "";
}

// Real time: tells show, beats end, the next begins. A brawl whose fighter left or was taken away ends where it stands.
void World::stepBrawls(double seconds) {
  const BrawlConfig& B = content_->fights().brawl;
  for (std::size_t i = 0; i < state_.brawls.size();) {
    std::string how;
    {
      Brawl& b = state_.brawls[i];
      const CharacterState* a = character(b.attacker);
      const CharacterState* d = character(b.defender);
      if (!a || !d || !a->online || !d->online || a->jailedUntil > state_.now || d->jailedUntil > state_.now) {
        how = "gone";
      } else {
        double left = seconds;
        while (how.empty()) {
          if (!b.shown && b.elapsed >= b.tellDelay) showTell(b);
          const double next = b.shown ? B.rounds.at(b.round).seconds : b.tellDelay;
          if (b.elapsed + left < next) {
            b.elapsed += left;
            break;
          }
          left -= next - b.elapsed;
          b.elapsed = next;
          if (b.shown) how = endBeat(b);
        }
      }
    }
    if (how.empty()) {
      ++i;
      continue;
    }
    const Brawl done = state_.brawls[i];
    state_.brawls.erase(state_.brawls.begin() + static_cast<std::ptrdiff_t>(i));
    if (!character(done.attacker) || !character(done.defender)) continue;
    Json res = finishBrawl(done, how);
    emit({done.attacker}, "fight_result", res["attacker"]);
    emit({done.defender}, "fight_result", res["defender"]);
  }
}

Result<Json> World::fightBeat(const CharacterId& actor, const std::string& fightId, const std::string& answer) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  const auto it = std::find_if(state_.brawls.begin(), state_.brawls.end(), [&](const Brawl& b) {
    return b.id == fightId && (b.attacker == actor || b.defender == actor);
  });
  if (it == state_.brawls.end()) return fail("unknown_fight", "that fight is over");
  if (answer == "walk_away") {
    const Brawl b = *it;
    state_.brawls.erase(it);
    Json res = finishBrawl(b, "walk_away", actor);
    const bool attacker = actor == b.attacker;
    emit({attacker ? b.defender : b.attacker}, "fight_result", res[attacker ? "defender" : "attacker"]);
    return res[attacker ? "attacker" : "defender"];
  }
  if (answer != "duck" && answer != "block" && answer != "jab") return fail("bad_answer", "duck, block, jab or walk away");
  Brawl& b = *it;
  if (b.actor != actor) return fail("not_your_beat", "this beat is yours to throw, not to answer");
  if (!b.shown) return fail("no_tell_yet", "wait for the tell");
  if (!b.answer.empty()) return fail("already_answered", "one answer a beat");
  b.answer = answer;
  b.answeredAt = b.elapsed;
  return Json{{"fight", b.id}, {"round", b.round + 1}, {"beat", b.beat + 1}, {"answer", answer}};
}

// How a brawl came out: knocked out, on points, one walked away, or it broke up (someone left). Nothing landed either
// way is a walk-away, as before; otherwise the margin between the composure left is the injury's margin.
Json World::finishBrawl(const Brawl& b, const std::string& how, const CharacterId& walker) {
  const FightsConfig& F = content_->fights();
  const BrawlConfig& B = F.brawl;
  CharacterState& a = *mutableCharacter(b.attacker);
  CharacterState& d = *mutableCharacter(b.defender);
  const CharacterDef* ad = definition(a.id);
  const CharacterDef* dd = definition(d.id);
  const std::string aName = ad ? ad->firstName : a.id, dName = dd ? dd->firstName : d.id;
  const PendingFight f{b.id, b.attacker, b.defender, b.startedAt, b.startedAt};
  const double ca = b.composure.at(a.id), cd = b.composure.at(d.id);
  const double byA = b.dealt.at(a.id), byD = b.dealt.at(d.id);
  FightEnd e;
  e.landed = byA > 0;  // whoever started it landed a blow: assault (self-defence never is)
  if (byA <= 0 && byD <= 0) {
    e.outcome = how == "walk_away" ? "walked_away" : "no_contact";
    applyFightEffects(d, F.walkedAway, e.dChanges);
    applyFightEffects(a, F.attackerWalkedAway, e.aChanges);
    if (walker == a.id) {
      e.aText = "You backed off before anything landed.";
      e.dText = aName + " backed off. Nothing landed.";
    } else if (walker == d.id) {
      e.dText = "You walked away from " + aName + ", and nothing landed.";
      e.aText = dName + " walked away. Nothing landed, and everyone saw you try.";
    } else {
      e.aText = e.dText = "Neither of you landed anything.";
    }
  } else {
    bool attackerWins;
    if (how == "walk_away") attackerWins = walker == d.id;
    else attackerWins = ca > cd;  // a tie goes to the one defending themself
    CharacterState& w = attackerWins ? a : d;
    CharacterState& l = attackerWins ? d : a;
    Json& wc = attackerWins ? e.aChanges : e.dChanges;
    Json& lc = attackerWins ? e.dChanges : e.aChanges;
    e.winner = w.id;
    e.outcome = how == "ko" ? "knockout" : how == "walk_away" ? "walked_off" : how == "gone" ? "broke_off" : "on_points";
    applyFightEffects(w, F.winner, wc);
    applyFightEffects(l, F.loser, lc);
    const double margin = std::max(0.0, (attackerWins ? ca - cd : cd - ca) * B.marginPerComposure);
    std::string injury;
    for (const auto& i : F.injuries) {
      if (margin >= i.margin) injury = i.condition;
    }
    injureInFight(l, injury, lc);
    if (roll() < F.winnerInjuryChance) injureInFight(w, F.winnerInjury, wc);
    if (e.outcome == "knockout") {
      e.aText = attackerWins ? dName + " went down. You won." : dName + " fought back and put you on the floor.";
      e.dText = attackerWins ? "You fought back, but " + aName + " put you on the floor." : "You fought back, and " + aName + " went down.";
    } else if (e.outcome == "walked_off") {
      e.aText = walker == a.id ? "You walked away from " + dName + " before it was over." : dName + " walked away. You won.";
      e.dText = walker == d.id ? "You walked away from " + aName + " before it was over." : aName + " walked away. You stood your ground.";
    } else {
      const std::string lead = e.outcome == "broke_off" ? "It broke up before it was over: " : "";
      e.aText = lead + (attackerWins ? dName + " fought back, but you came off better." : dName + " fought back, and you came off worse.");
      e.dText = lead + (attackerWins ? "you fought back, but " + aName + " got the better of you." : "you fought back, and " + aName + " came off worse.");
      if (lead.empty()) e.dText[0] = 'Y';
    }
  }
  Json res = concludeFight(f, std::move(e));
  res["attacker"]["brawl"] = Json{{"composure", std::round(ca)}, {"their_composure", std::round(cd)},
                                  {"landed", std::round(byA)}, {"took", std::round(byD)}};
  res["defender"]["brawl"] = Json{{"composure", std::round(cd)}, {"their_composure", std::round(ca)},
                                  {"landed", std::round(byD)}, {"took", std::round(byA)}};
  return res;
}

// ---- Save ----------------------------------------------------------------------------------
void writeStreetCharacter(const CharacterState& c, Json& j) {
  const StreetState& s = c.street;
  if (!s.walkAway && s.fought.empty() && s.nextFightAt < 0 && s.protectedUntil < 0) return;
  j["street"] = Json{{"walk_away", s.walkAway}, {"fought", s.fought}, {"next_fight_at", s.nextFightAt}, {"protected_until", s.protectedUntil}};
}

// A save without the key: never in a fight, and doesn't always walk away.
void readStreetCharacter(CharacterState& c, const Json& j) {
  const auto it = j.find("street");
  if (it == j.end() || !it->is_object()) return;
  StreetState& s = c.street;
  s.walkAway = it->value("walk_away", false);
  s.fought = it->value("fought", std::map<CharacterId, std::int64_t>{});
  s.nextFightAt = it->value("next_fight_at", GameMinutes{-1});
  s.protectedUntil = it->value("protected_until", GameMinutes{-1});
}

}  // namespace livera
