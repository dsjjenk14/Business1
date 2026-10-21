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
}

// What happened, for both sides: {attacker: their result, defender: theirs}. The choices are the defender's:
// fight_back, run, take_it, froze (= take_it) or walk_away.
Json World::resolveFight(const PendingFight& f, const std::string& choiceIn) {
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
  Json aChanges = Json::object(), dChanges = Json::object();
  auto apply = [&](CharacterState& c, const FightEffectsDef& fx, Json& changes) {
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
  };
  auto injure = [&](CharacterState& c, const std::string& condition, Json& changes) {
    if (condition.empty() || findCondition(c, condition)) return;
    addCondition(c, condition, /*diagnosed=*/true);  // you know you've been hit
    if (const ConditionDef* k = content_->condition(condition)) changes["injuries"].push_back(k->name);
  };

  std::string choice = choiceIn == "froze" ? "take_it" : choiceIn;
  // Already apart (one walked off, or was moved): nothing lands.
  if (choice != "walk_away" && !together(a, d, F.rangeMeters * 3)) choice = "got_away";
  bool landed = false;
  std::string outcome, aText, dText, winner;
  if (choice == "walk_away" || choice == "got_away") {
    outcome = choice == "walk_away" ? "walked_away" : "got_away";
    apply(d, F.walkedAway, dChanges);
    apply(a, F.attackerWalkedAway, aChanges);
    dText = choice == "walk_away" ? aName + " squared up to you. You walked away, and nothing landed."
                                  : "By the time " + aName + " swung, you were gone.";
    aText = choice == "walk_away" ? dName + " walked away. Nothing landed, and everyone saw you try."
                                  : dName + " was already out of reach.";
  } else if (choice == "run") {
    const double p = clampd(F.runBase + F.runPerPoint * (fightScore(d) - fightScore(a)), F.runMin, F.runMax);
    if (roll() < p) {
      outcome = "ran";
      apply(d, F.ran, dChanges);
      apply(a, F.attackerWalkedAway, aChanges);
      dText = "You broke away from " + aName + " and ran. Nothing landed.";
      aText = dName + " broke away and ran. Nothing landed.";
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
      outcome = "caught";
      landed = true;
      winner = a.id;
      apply(d, F.ran, dChanges);
      apply(d, F.tookIt, dChanges);
      apply(a, F.attackerHit, aChanges);
      injure(d, F.tookItInjury, dChanges);
      dText = "You tried to run. " + aName + " caught you before you got a step.";
      aText = dName + " tried to run. You caught them.";
    }
  } else if (choice == "take_it") {
    outcome = choiceIn == "froze" ? "froze" : "took_it";
    landed = true;
    winner = a.id;
    apply(d, F.tookIt, dChanges);
    apply(a, F.attackerHit, aChanges);
    injure(d, F.tookItInjury, dChanges);
    dText = choiceIn == "froze" ? "You froze. " + aName + " hit you, and it was over before you moved."
                                : "You took it. " + aName + " hit you, and you didn't hit back.";
    aText = dName + (choiceIn == "froze" ? " froze" : " didn't fight back") + ". You hit them.";
  } else {  // fight_back
    landed = true;
    const double noise = F.scoreNoise;
    const double sa = fightScore(a) + noise * (roll() * 2 - 1);
    const double sd = fightScore(d) + noise * (roll() * 2 - 1);
    const bool attackerWins = sa > sd;  // a tie goes to the one defending themself
    CharacterState& w = attackerWins ? a : d;
    CharacterState& l = attackerWins ? d : a;
    Json& wc = attackerWins ? aChanges : dChanges;
    Json& lc = attackerWins ? dChanges : aChanges;
    winner = w.id;
    outcome = attackerWins ? "attacker_won" : "defender_won";
    apply(w, F.winner, wc);
    apply(l, F.loser, lc);
    const double margin = std::abs(sa - sd);
    std::string injury;
    for (const auto& i : F.injuries) {
      if (margin >= i.margin) injury = i.condition;
    }
    injure(l, injury, lc);
    if (roll() < F.winnerInjuryChance) injure(w, F.winnerInjury, wc);
    dText = attackerWins ? "You fought back, but " + aName + " got the better of you." : "You fought back, and " + aName + " came off worse.";
    aText = attackerWins ? dName + " fought back. You won." : dName + " fought back, and you came off worse.";
  }

  // Everyone involved remembers; whoever started it pays in trust, theirs and every witness's.
  for (const auto& [dim, v] : F.victimRelationship) adjustRelationship(d.id, a.id, dim, v);
  for (const auto& [dim, v] : F.attackerRelationship) adjustRelationship(a.id, d.id, dim, v);
  for (const auto& [owner, other, text] : {std::tuple{a.id, d.id, "Started a fight with " + dName + " at " + where + ": " + aText},
                                           std::tuple{d.id, a.id, aName + " attacked me at " + where + ": " + dText}}) {
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
  if (landed) {
    if (const CrimeDef* crime = content_->crimeDef(F.crime)) {
      const CrimeWitnesses seen = crimeWitnesses(a, d.id);
      const double caught = std::min(0.95, crime->detection + seen.witnesses * crime->perWitness +
                                               seen.staff * crime->perStaff + seen.police * crime->perPolice);
      if (roll() < caught) {
        Json arrest = arrestCharacter(a, crime->id, seen.police > 0 ? "the police" : "people who saw it");
        arrest["arrested"] = true;
        aOut["crime"] = arrest;
        dOut["crime"] = Json{{"arrested", true}, {"text", aName + " was arrested for " + crime->label + "."}};
      } else {
        double noReport = 1 - F.reportChance;
        for (std::size_t i = 0; i < witnesses.size(); ++i) noReport *= 1 - F.witnessReportChance;
        if (roll() >= noReport) {
          a.wantedFor = crime->id;
          dispatchPolice(crime->label + " reported at " + where + ". Suspect: " + (ad ? ad->fullName() : a.id) + ".");
          notify(a.id, "police", "It was reported. You're wanted for " + crime->label + ".");
          aOut["crime"] = Json{{"wanted", true}, {"crime", crime->label}};
          dOut["crime"] = Json{{"reported", true}, {"text", "It's been reported. The police are looking for " + aName + "."}};
        } else {
          aOut["crime"] = Json{{"wanted", false}, {"crime", crime->label}};
        }
      }
    }
  } else {
    dOut["crime"] = Json{{"self_defence", true}};
  }
  aOut.update(Json{{"outcome", outcome}, {"text", aText}, {"changes", aChanges}});
  dOut.update(Json{{"outcome", outcome}, {"text", dText}, {"changes", dChanges}});
  if (!winner.empty()) {
    aOut["won"] = winner == a.id;
    dOut["won"] = winner == d.id;
  }
  std::vector<CharacterId> around = witnesses;
  around.push_back(a.id);
  around.push_back(d.id);
  Json pub{{"fight", f.id}, {"attacker", a.id}, {"defender", d.id}, {"stage", "over"}, {"outcome", outcome},
           {"position", Json::array({d.position.x, d.position.y})}, {"inside", d.inside}};
  if (!winner.empty()) pub["winner"] = winner;
  emit(around, "fight", pub);
  return Json{{"attacker", aOut}, {"defender", dOut}};
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
