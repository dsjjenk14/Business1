// Romance and family. Everything between two people needs the other person's yes: a date,
// a kiss, a proposal, a wedding, intimacy. Adults only; never within a family. Intimacy is
// private and fades to black: the game tracks what follows (feelings, infections, pregnancy),
// not the act. Tuning is data/society/romance.json.
#include <algorithm>
#include <cctype>
#include <cmath>

#include "core/Clock.h"
#include "core/World.h"

namespace livera {

namespace {

constexpr double kStatMin = 0;
constexpr double kStatMax = 100;
constexpr double kAskRangeMeters = 3;
constexpr double kManagedTransmission = 0.05;
constexpr double kBabyWeightKg = 3.4;
constexpr double kBabyHeightCm = 50;

std::string slug(const std::string& s) {
  std::string out;
  for (unsigned char ch : s) {
    if (std::isalnum(ch)) out += static_cast<char>(std::tolower(ch));
    else if ((ch == ' ' || ch == '-') && !out.empty() && out.back() != '-') out += '-';
  }
  while (!out.empty() && out.back() == '-') out.pop_back();
  return out.empty() ? "baby" : out;
}

bool validName(const std::string& s) {
  if (s.empty() || s.size() > 30) return false;
  for (unsigned char ch : s) {
    if (!(std::isalpha(ch) || ch == ' ' || ch == '-' || ch == '\'' || ch >= 0x80)) return false;
  }
  return true;
}

double daysSince(GameMinutes now, GameMinutes t) { return static_cast<double>(now - t) / kMinutesPerDay; }

}  // namespace

std::string World::relationshipStatus(const CharacterId& a, const CharacterId& b) const {
  const RelationshipState* r = relationship(a, b);
  return r ? r->status : "";
}

bool World::isFamily(const CharacterId& a, const CharacterId& b) const {
  const CharacterState* x = character(a);
  const CharacterState* y = character(b);
  if (!x || !y) return false;
  auto has = [](const std::vector<CharacterId>& v, const CharacterId& id) { return std::find(v.begin(), v.end(), id) != v.end(); };
  if (has(x->parents, b) || has(y->parents, a)) return true;
  for (const auto& p : x->parents) {
    if (has(y->parents, p)) return true;  // siblings
  }
  return false;
}

void World::setStatus(const CharacterId& a, const CharacterId& b, const std::string& status) {
  for (auto [from, to] : {std::pair{a, b}, std::pair{b, a}}) {
    RelationshipState& r = relationshipRef(from, to);
    r.status = status;
    r.statusSince = state_.now;
  }
}

Status World::checkRomanceAllowed(const CharacterState& a, const CharacterState& b) const {
  const int adult = content_->life().adultAge;
  if (ageOf(a.id) < adult || ageOf(b.id) < adult) return fail("not_allowed", "romance is only between adults");
  if (isFamily(a.id, b.id)) return fail("not_allowed", "you're family");
  return okStatus();
}

bool World::inPrivate(const CharacterState& a, const CharacterState& b) const {
  if (a.inside.empty() || a.inside != b.inside) return false;
  // Inside a home together: only its tenant (or their partner) can be in one.
  for (const auto& [pid, def] : content_->properties()) {
    if (def.location == a.inside) return true;
  }
  return false;
}

Result<Json> World::request(const CharacterId& actor, const std::string& kind, const CharacterId& target,
                            bool protection, const std::string& subject) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& a = *r.value();
  if (Status st = freeToAct(a); !st) return st.error();
  if (target == actor) return fail("invalid_target", "not with yourself");
  CharacterState* t = mutableCharacter(target);
  if (!t || !t->online) return fail("target_unavailable", "they are not here");
  if (Status st = checkRomanceAllowed(a, *t); !st) return st.error();
  if (!together(a, *t, kAskRangeMeters)) return fail("too_far", "you need to be with them");
  const std::string status = relationshipStatus(actor, target);
  const CharacterDef* me = definition(actor);
  const std::string name = me ? me->firstName : actor;
  std::string ask;
  if (kind == "date") {
    if (status == "dating" || status == "engaged" || status == "married") return fail("already_together", "you're already together");
    ask = name + " is asking you out.";
  } else if (kind == "kiss") {
    ask = name + " wants to kiss you.";
  } else if (kind == "propose") {
    if (status != "dating") return fail("not_dating", "you need to be dating first");
    if (!owns(actor, "engagement_ring")) return fail("no_ring", "you'll want a ring");
    ask = name + " is down on one knee, asking you to marry them.";
  } else if (kind == "marry") {
    if (status != "engaged") return fail("not_engaged", "you need to be engaged first");
    const LocationDef* here = currentPlace(a);
    if (!here || !here->weddings) return fail("wrong_place", "weddings happen at a venue, like Greater Hope");
    ask = name + " is ready to marry you, here, now.";
  } else if (kind == "intimacy") {
    if (!inPrivate(a, *t)) return fail("not_private", "that's for somewhere private, like home");
    if (protection) {
      bool have = false;
      for (const auto& who : {actor, target}) {
        for (const auto& [item, n] : character(who)->inventory) {
          const ItemDef* def = content_->item(item);
          have |= n > 0 && def && def->contraception;
        }
      }
      if (!have) return fail("no_protection", "neither of you has protection");
    }
    ask = name + " wants to spend the night with you" + (protection ? " (with protection)." : ".");
  } else if (kind == "buy_home" || kind == "move_in" || kind == "sell_home") {
    auto text = homeAsk(a, *t, kind, subject);  // Homes.cpp
    if (!text) return text.error();
    ask = text.value();
  } else {
    return fail("bad_request", "kind must be date, kiss, propose, marry, intimacy, buy_home, move_in or sell_home");
  }
  // One open ask of each kind at a time.
  state_.requests.erase(std::remove_if(state_.requests.begin(), state_.requests.end(),
                                       [&](const PendingRequest& q) { return q.expires <= state_.now; }),
                        state_.requests.end());
  for (const auto& q : state_.requests) {
    if (q.from == actor && q.to == target && q.kind == kind) return fail("already_asked", "you already asked; give them a moment");
  }
  PendingRequest q{nextId("ask"), kind, actor, target, state_.now + content_->romance().requestMinutes, protection,
                   subject};
  state_.requests.push_back(q);
  notify(target, kind == "buy_home" || kind == "move_in" || kind == "sell_home" ? "home" : "romance",
         ask + " (answer with request id " + q.id + ")");
  emit({target}, "request", Json{{"id", q.id}, {"kind", kind}, {"from", actor}, {"text", ask},
                                 {"expires_in_minutes", content_->romance().requestMinutes}});
  return Json{{"request", q.id}, {"kind", kind}, {"waiting_for", target}};
}

Result<Json> World::respond(const CharacterId& actor, const std::string& requestId, bool accept) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& me = *r.value();
  auto it = std::find_if(state_.requests.begin(), state_.requests.end(), [&](const PendingRequest& q) {
    return q.id == requestId && q.to == actor && q.expires > state_.now;
  });
  if (it == state_.requests.end()) return fail("unknown_request", "that ask has passed");
  const PendingRequest q = *it;
  state_.requests.erase(it);
  const CharacterDef* myDef = definition(actor);
  const std::string myName = myDef ? myDef->firstName : actor;
  const bool aboutHome = q.kind == "buy_home" || q.kind == "move_in" || q.kind == "sell_home";  // Homes.cpp
  if (!accept) {
    notify(q.from, aboutHome ? "home" : "romance", myName + " said no.");
    emit({q.from}, "answer", Json{{"request", q.id}, {"kind", q.kind}, {"accepted", false}});
    return Json{{"declined", q.kind}};
  }
  CharacterState* fromPtr = mutableCharacter(q.from);
  if (!fromPtr || !fromPtr->online) return fail("target_unavailable", "they're gone");
  CharacterState& from = *fromPtr;
  if (q.kind == "nanny") {
    // A job offer, not a romance: the family hires you and you work in their home.
    const CareerDef* career = content_->career(me.career.careerId);
    if (!career || !career->atEmployersHome) return fail("not_a_nanny", "you don't work as a nanny anymore");
    if (!me.nannyFor.empty()) return fail("already_employed", "you already work for a family");
    me.nannyFor = q.from;
    const CharacterDef* fromDef = definition(q.from);
    notify(q.from, "family", myName + " is your family's nanny now.");
    emit({q.from}, "answer", Json{{"request", q.id}, {"kind", q.kind}, {"accepted", true}});
    return Json{{"accepted", "nanny"}, {"employer", q.from}, {"family", fromDef ? fromDef->lastName : q.from}};
  }
  if (Status st = checkRomanceAllowed(from, me); !st) return st.error();
  if (!together(from, me, kAskRangeMeters)) return fail("too_far", "you're not together anymore");
  const CharacterDef* fromDef = definition(q.from);
  const std::string fromName = fromDef ? fromDef->firstName : q.from;
  Json out{{"accepted", q.kind}, {"with", q.from}};

  auto remember = [&](const std::string& type, int importance, int impact, const std::string& info, bool isPublic) {
    for (auto [owner, other] : {std::pair{q.from, actor}, std::pair{actor, q.from}}) {
      Memory m;
      m.id = nextId("mem");
      m.owner = owner;
      m.at = state_.now;
      m.participants = {q.from, actor};
      m.location = me.inside;
      m.type = type;
      m.importance = importance;
      m.emotionalImpact = impact;
      m.about = other;
      m.info = info;
      m.isPublic = isPublic;
      addMemory(std::move(m));
    }
  };
  auto bothFeel = [&](const StatMap& rel, const StatMap& emotions) {
    for (const auto& [dim, d] : rel) {
      adjustRelationship(q.from, actor, dim, d);
      adjustRelationship(actor, q.from, dim, d);
    }
    applyEmotions(from, emotions);
    applyEmotions(me, emotions);
  };

  if (q.kind == "date") {
    const std::string s = relationshipStatus(q.from, actor);
    if (s == "dating" || s == "engaged" || s == "married") return fail("already_together", "you're already together");
    setStatus(q.from, actor, "dating");
    bothFeel({{"romantic_attraction", 10}, {"familiarity", 5}}, {{"happiness", 8}, {"excitement", 10}});
    remember("started_dating", 60, 50, fromName + " and " + myName + " started dating", true);
  } else if (q.kind == "kiss") {
    bothFeel({{"romantic_attraction", 6}, {"physical_attraction", 4}}, {{"happiness", 5}, {"excitement", 6}});
    remember("kiss", 35, 30, fromName + " and " + myName + " kissed", false);
  } else if (q.kind == "propose") {
    if (relationshipStatus(q.from, actor) != "dating") return fail("not_dating", "you're not dating anymore");
    if (!owns(q.from, "engagement_ring")) return fail("no_ring", "the ring is gone");
    if (--from.inventory["engagement_ring"] <= 0) from.inventory.erase("engagement_ring");
    if (from.accessory == "engagement_ring") from.accessory.clear();
    me.inventory["engagement_ring"] += 1;
    me.accessory = "engagement_ring";
    setStatus(q.from, actor, "engaged");
    bothFeel({{"romantic_attraction", 10}, {"loyalty", 10}, {"trust", 5}}, {{"happiness", 20}, {"excitement", 20}});
    remember("engagement", 85, 80, fromName + " proposed to " + myName + ". Yes.", true);
  } else if (q.kind == "marry") {
    if (relationshipStatus(q.from, actor) != "engaged") return fail("not_engaged", "you're not engaged anymore");
    setStatus(q.from, actor, "married");
    bothFeel({{"romantic_attraction", 10}, {"loyalty", 15}, {"trust", 10}}, {{"happiness", 30}, {"excitement", 20}});
    remember("wedding", 95, 90, fromName + " and " + myName + " got married", true);
    addFame(from, content_->fame().perWedding);
    addFame(me, content_->fame().perWedding);
    // Everyone there saw it.
    const LocationDef* venue = currentPlace(me);
    for (const auto& guest : presentWith(me, content_->sim().hearingRangeMeters)) {
      if (guest == q.from) continue;
      for (const auto& spouse : {q.from, actor}) adjustRelationship(guest, spouse, "friendship", 3);
      Memory m;
      m.id = nextId("mem");
      m.owner = guest;
      m.at = state_.now;
      m.participants = {q.from, actor, guest};
      m.location = venue ? venue->id : "";
      m.type = "attended_wedding";
      m.importance = 50;
      m.emotionalImpact = 40;
      m.info = "Saw " + fromName + " and " + myName + " get married";
      m.isPublic = true;
      addMemory(std::move(m));
      notify(guest, "romance", fromName + " and " + myName + " just got married.");
    }
  } else if (q.kind == "intimacy") {
    if (!inPrivate(from, me)) return fail("not_private", "that's for somewhere private");
    out["night"] = intimacy(from, me, q.protection);
  } else if (q.kind == "buy_home" || q.kind == "move_in" || q.kind == "sell_home") {
    auto done = homeAnswer(q, from, me);  // Homes.cpp
    if (!done) return done.error();
    out["home"] = done.value();
  }
  notify(q.from, aboutHome ? "home" : "romance", myName + " said yes.");
  emit({q.from}, "answer", Json{{"request", q.id}, {"kind", q.kind}, {"accepted", true}});
  return out;
}

Json World::intimacy(CharacterState& a, CharacterState& b, bool protection) {
  const RomanceConfig& R = content_->romance();
  bool usedProtection = false;
  if (protection) {
    for (CharacterState* who : {&a, &b}) {
      if (usedProtection) break;
      for (auto& [item, n] : who->inventory) {
        const ItemDef* def = content_->item(item);
        if (n > 0 && def && def->contraception) {
          if (--n <= 0) who->inventory.erase(item);
          usedProtection = true;
          break;
        }
      }
    }
  }
  for (CharacterState* who : {&a, &b}) {
    applyNeeds(*who, {{"social", 15}, {"recreation", 15}, {"energy", -10}, {"hygiene", -10}});
    applyEmotions(*who, {{"happiness", 10}, {"stress", -10}, {"loneliness", -10}});
    who->caloriesOut += 150;
  }
  for (auto [x, y] : {std::pair{a.id, b.id}, std::pair{b.id, a.id}}) {
    adjustRelationship(x, y, "romantic_attraction", 4);
    adjustRelationship(x, y, "physical_attraction", 6);
    adjustRelationship(x, y, "familiarity", 3);
    Memory m;
    m.id = nextId("mem");
    m.owner = x;
    m.at = state_.now;
    m.participants = {a.id, b.id};
    m.location = a.inside;
    m.type = "intimacy";
    m.importance = 50;
    m.emotionalImpact = 30;
    m.about = y;
    m.info = "Spent the night together";
    m.isPublic = false;
    addMemory(std::move(m));
  }
  // Infections pass both ways; protection cuts the chance, and so does a managed condition.
  for (auto [giver, taker] : {std::pair{&a, &b}, std::pair{&b, &a}}) {
    std::vector<std::string> caught;
    for (const auto& k : giver->conditions) {
      const ConditionDef* def = content_->condition(k.id);
      if (!def || def->sexualTransmission <= 0 || findCondition(*taker, k.id)) continue;
      double p = def->sexualTransmission * (usedProtection ? R.stiProtection : 1.0);
      if (!def->curable && k.recovery >= 100) p *= kManagedTransmission;
      if (roll() < p) caught.push_back(k.id);
    }
    for (const auto& id : caught) addCondition(*taker, id, false);
  }
  if (a.id != b.id) {
    const CharacterDef* ad = definition(a.id);
    const CharacterDef* bd = definition(b.id);
    if (ad && bd) {
      // Only a woman and a man together can conceive, and she carries the pregnancy.
      if (ad->sex == "female" && bd->sex == "male") tryConception(a, b, usedProtection);
      if (bd->sex == "female" && ad->sex == "male") tryConception(b, a, usedProtection);
    }
    notify(a.id, "romance", "You and " + (bd ? bd->firstName : b.id) + " spent the night together.");
    notify(b.id, "romance", "You and " + (ad ? ad->firstName : a.id) + " spent the night together.");
  }
  return Json{{"protection", usedProtection}};
}

void World::tryConception(CharacterState& carrier, const CharacterState& sire, bool protectedSex) {
  const RomanceConfig& R = content_->romance();
  if (carrier.pregnancy) return;
  double fertility = 1.0;
  const int age = ageOf(carrier.id);
  for (const auto& [from, mult] : R.fertilityByAge) {
    if (age >= from) fertility = mult;
  }
  double p = R.conceptionChance * fertility * (protectedSex ? 1.0 - R.protectionEffectiveness : 1.0);
  if (carrier.needs.count("health") && carrier.needs.at("health") < 40) p *= 0.5;
  if (roll() >= p) return;
  PregnancyState preg;
  preg.partner = sire.id;
  preg.conceivedAt = state_.now;
  preg.dueAt = state_.now + static_cast<GameMinutes>(R.pregnancyGameDays * kMinutesPerDay);
  carrier.pregnancy = preg;  // nobody knows yet
}

void World::stepPregnancyHourly(CharacterState& c) {
  if (!c.pregnancy) return;
  const RomanceConfig& R = content_->romance();
  PregnancyState& p = *c.pregnancy;
  const double days = daysSince(state_.now, p.conceivedAt);
  const double prevDays = days - 1.0 / 24.0;
  if (prevDays < R.symptomsAfterDays && days >= R.symptomsAfterDays)
    notify(c.id, "health", "You've been feeling queasy in the mornings lately.");
  const double dueInDays = daysSince(p.dueAt, state_.now);
  if (dueInDays <= 1 && dueInDays + 1.0 / 24.0 > 1)
    notify(c.id, "health", "Your baby is due within a day. Livéra General has a maternity ward.");
  // Miscarriage: most happen early; risk rises with drugs, illness and poor health, and falls with care.
  if (days < R.miscarriageWindowDays) {
    const double hourly = 1.0 - std::pow(1.0 - R.miscarriageChance, 1.0 / (R.miscarriageWindowDays * 24.0));
    double mult = p.risk * std::max(0.5, std::pow(0.85, p.prenatalVisits));
    if (c.needs.count("health") && c.needs.at("health") < 40) mult *= 2;
    for (const auto& k : c.conditions) {
      const ConditionDef* def = content_->condition(k.id);
      if (def && def->kind == "illness") mult *= 1.5;
    }
    if (roll() < hourly * mult) {
      endPregnancy(c, "miscarriage");
      return;
    }
  }
  if (state_.now >= p.dueAt) giveBirth(c);
}

void World::endPregnancy(CharacterState& c, const std::string& how) {
  if (!c.pregnancy) return;
  const RomanceConfig& R = content_->romance();
  const PregnancyState p = *c.pregnancy;
  c.pregnancy.reset();
  const bool noticed = p.known || daysSince(state_.now, p.conceivedAt) >= R.symptomsAfterDays;
  Memory m;
  m.id = nextId("mem");
  m.owner = c.id;
  m.at = state_.now;
  m.participants = {c.id};
  m.location = c.inside;
  if (how == "miscarriage") {
    if (!noticed) return;  // too early for anyone to have known
    notify(c.id, "health", "You lost the pregnancy.");
    applyEmotions(c, {{"sadness", 40}, {"happiness", -20}, {"stress", 15}});
    m.type = "miscarriage";
    m.importance = 85;
    m.emotionalImpact = -70;
    m.info = "Lost a pregnancy";
  } else {
    // An abortion is private: only the patient is told, and nothing is public.
    notify(c.id, "health", "The procedure went smoothly. Take it easy for a few days.");
    applyNeeds(c, {{"energy", -20}, {"comfort", -10}});
    m.type = "abortion";
    m.importance = 60;
    m.emotionalImpact = 0;
    m.info = "Ended a pregnancy";
  }
  addMemory(std::move(m));
}

void World::giveBirth(CharacterState& c) {
  const RomanceConfig& R = content_->romance();
  const ContentDatabase& db = *content_;
  const PregnancyState p = *c.pregnancy;
  c.pregnancy.reset();
  const CharacterDef* mother = definition(c.id);
  const bool girl = roll() < 0.5;
  const auto& names = girl ? R.girlNames : R.boyNames;
  CharacterDef baby;
  baby.firstName = names.empty() ? "Baby" : names[static_cast<std::size_t>(roll() * static_cast<double>(names.size())) % names.size()];
  baby.lastName = mother ? mother->lastName : "";
  baby.pronouns = girl ? "she/her" : "he/him";
  baby.gender = girl ? "girl" : "boy";
  baby.sex = girl ? "female" : "male";
  baby.age = 0;
  baby.playable = false;
  const PropertyState* home = homeOf(c.id);
  baby.homeProperty = home ? home->id : (mother ? mother->homeProperty : "");
  const PropertyDef* homeDef = db.property(baby.homeProperty);
  if (!homeDef) return;
  baby.spawnLocation = homeDef->location;
  const LocationDef* where = c.inside.empty() ? nullptr : db.location(c.inside);
  const bool atHospital = where && where->id == db.crime().hospital;
  baby.profile = Json{{"born_in_livera", true}, {"parents", {c.id, p.partner}}, {"birthplace", where ? where->name : "home"},
                      {"tagline", "Born in Livéra."}};
  std::string id = slug(baby.firstName + " " + baby.lastName);
  for (int n = 2; definition(id) || state_.characters.count(id); ++n) id = slug(baby.firstName + " " + baby.lastName) + "-" + std::to_string(n);
  baby.id = id;
  state_.createdCharacters[id] = baby;
  addCharacterState(baby, nullptr);
  CharacterState& b = state_.characters.at(id);
  b.bornAt = state_.now;
  b.lastBirthdayAge = 0;
  b.heightCm = kBabyHeightCm;
  b.weightKg = kBabyWeightKg;
  b.parents = {c.id, p.partner};

  applyNeeds(c, {{"energy", -40}, {"health", atHospital ? -10.0 : -20.0}, {"comfort", -20}});
  applyEmotions(c, {{"happiness", 30}, {"excitement", 20}});
  const std::string news = baby.firstName + " " + baby.lastName + " was born" + (where ? " at " + where->name : "") + ": a " +
                           baby.gender + ". You have " + std::to_string(R.namingWindowDays) +
                           " days to choose a different name if you'd like.";
  for (const auto& parent : {c.id, p.partner}) {
    if (!character(parent)) continue;
    notify(parent, "family", news);
    Memory m;
    m.id = nextId("mem");
    m.owner = parent;
    m.at = state_.now;
    m.participants = {c.id, p.partner, id};
    m.location = where ? where->id : "";
    m.type = "birth_of_child";
    m.importance = 95;
    m.emotionalImpact = 85;
    m.about = id;
    m.info = "Became a parent: " + baby.firstName;
    m.isPublic = true;
    addMemory(std::move(m));
  }
}

Json World::pregnancyTest(CharacterState& c) {
  const RomanceConfig& R = content_->romance();
  const bool positive = c.pregnancy && daysSince(state_.now, c.pregnancy->conceivedAt) >= R.testDetectsAfterDays;
  if (positive) c.pregnancy->known = true;
  return Json{{"test", "pregnancy"}, {"positive", positive}};
}

Result<Json> World::endRelationship(const CharacterId& actor, const CharacterId& partner) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& me = *r.value();
  const std::string status = relationshipStatus(actor, partner);
  if (status != "dating" && status != "engaged" && status != "married") return fail("not_together", "you're not together");
  std::string next = "ex";
  if (status == "married") {
    const RomanceConfig& R = content_->romance();
    auto fee = state_.ledger.transfer(bankAccountOf(actor), R.divorceFeeAccount, R.divorceFeeCents, "legal", "Divorce filing", state_.now);
    if (!fee) return fee.error();
    next = "divorced";
  }
  setStatus(actor, partner, next);
  const CharacterDef* myDef = definition(actor);
  const CharacterDef* theirDef = definition(partner);
  for (auto [owner, other] : {std::pair{actor, partner}, std::pair{partner, actor}}) {
    adjustRelationship(owner, other, "romantic_attraction", -30);
    adjustRelationship(owner, other, "trust", -10);
    if (CharacterState* c = mutableCharacter(owner)) applyEmotions(*c, {{"sadness", 25}, {"loneliness", 20}, {"happiness", -15}});
    Memory m;
    m.id = nextId("mem");
    m.owner = owner;
    m.at = state_.now;
    m.participants = {actor, partner};
    m.location = me.inside;
    m.type = next == "divorced" ? "divorce" : "breakup";
    m.importance = 75;
    m.emotionalImpact = -60;
    m.about = other;
    m.info = (next == "divorced" ? "Divorced " : "Broke up with ") + std::string(owner == actor ? (theirDef ? theirDef->fullName() : partner)
                                                                                          : (myDef ? myDef->fullName() : actor));
    addMemory(std::move(m));
  }
  notify(partner, "romance", (myDef ? myDef->firstName : actor) + (next == "divorced" ? " filed for divorce." : " broke up with you."));
  return Json{{"status", next}, {"with", partner}};
}

Result<Json> World::nameBaby(const CharacterId& parent, const CharacterId& babyId, const std::string& firstName) {
  auto r = activeCharacter(parent);
  if (!r) return r.error();
  CharacterState* b = mutableCharacter(babyId);
  auto def = state_.createdCharacters.find(babyId);
  if (!b || def == state_.createdCharacters.end()) return fail("unknown_character", "no such child");
  if (std::find(b->parents.begin(), b->parents.end(), parent) == b->parents.end()) return fail("not_parent", "that's not your child");
  if (daysSince(state_.now, b->bornAt) > content_->romance().namingWindowDays) return fail("too_late", "the name is on the birth certificate now");
  if (!validName(firstName)) return fail("invalid_name", "names are 1-30 letters");
  def->second.firstName = firstName;
  for (const auto& other : b->parents) {
    if (other != parent && character(other)) notify(other, "family", "Your child's name is now " + def->second.fullName() + ".");
  }
  return Json{{"child", babyId}, {"name", def->second.fullName()}};
}

Json World::phoneRomance(const CharacterState& c) const {
  Json partners = Json::array();
  for (const auto& [key, rel] : state_.relationships) {
    if (key.first != c.id || rel.status.empty()) continue;
    const CharacterDef* d = definition(key.second);
    partners.push_back(Json{{"id", key.second}, {"name", d ? d->fullName() : key.second}, {"status", rel.status},
                            {"since", formatDateTime(rel.statusSince)}});
  }
  Json asks = Json::array();
  for (const auto& q : state_.requests) {
    if (q.to != c.id || q.expires <= state_.now) continue;
    const CharacterDef* d = definition(q.from);
    asks.push_back(Json{{"id", q.id}, {"kind", q.kind}, {"from", q.from}, {"name", d ? d->fullName() : q.from}});
  }
  Json children = Json::array();
  for (const auto& [id, o] : state_.characters) {
    if (std::find(o.parents.begin(), o.parents.end(), c.id) == o.parents.end()) continue;
    const CharacterDef* d = definition(id);
    children.push_back(Json{{"id", id}, {"name", d ? d->fullName() : id}, {"age", ageOf(id)}, {"life_stage", lifeStageOf(id)}});
  }
  Json out{{"relationships", partners}, {"waiting_for_your_answer", asks}, {"children", children}};
  if (c.pregnancy && c.pregnancy->known) {
    out["pregnancy"] = Json{{"due", formatDateTime(c.pregnancy->dueAt)}, {"weeks", static_cast<int>(daysSince(state_.now, c.pregnancy->conceivedAt) / 7)},
                            {"prenatal_visits", c.pregnancy->prenatalVisits}};
  }
  return out;
}

}  // namespace livera
