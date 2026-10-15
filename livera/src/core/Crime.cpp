// Crime and the police. Shoplifting, pickpocketing, fare evasion and drugs; detection by
// staff, witnesses and officers on duty; fines, jail, warrants and a criminal record.
// Tuning is data/society/crimes.json.
#include <algorithm>
#include <cmath>

#include "core/Clock.h"
#include "core/World.h"

namespace livera {

namespace {
constexpr double kMaxDetection = 0.95;
constexpr double kArrestRangeMeters = 3;
constexpr double kPickpocketRangeMeters = 2;
constexpr Cents kArrestReward = 5000;
}  // namespace

void World::recordCrime(CharacterState& c, const std::string& crime, Cents fineCents, GameMinutes jailMinutes) {
  c.record.push_back(CrimeRecordEntry{crime, state_.now, fineCents, jailMinutes});
}

bool World::inJail(const CharacterId& id) const {
  const CharacterState* c = character(id);
  return c && c->jailedUntil > state_.now;
}

Status World::freeToAct(const CharacterState& c) const {
  if (c.jailedUntil > state_.now)
    return fail("in_jail", "you're in a cell until " + formatDateTime(c.jailedUntil));
  return okStatus();
}

int World::policeNearby(const CharacterState& c) const {
  int n = 0;
  for (const auto& [id, o] : state_.characters) {
    if (id == c.id || !o.online || !o.career.shiftStartedAt || o.career.careerId != "police") continue;
    if (together(c, o, content_->crime().policeNearbyMeters)) ++n;
  }
  return n;
}

double World::detectionChance(const CharacterState& c, const CrimeDef& crime) const {
  int witnesses = 0, staff = 0;
  for (const auto& id : presentWith(c, content_->sim().hearingRangeMeters)) {
    const CharacterState* o = character(id);
    if (!o) continue;
    if (o->career.careerId == "police" && o->career.shiftStartedAt) continue;  // counted below
    if (o->career.shiftStartedAt && !c.inside.empty() && o->career.shiftLocation == c.inside) ++staff;
    else ++witnesses;
  }
  const double p = crime.detection + witnesses * crime.perWitness + staff * crime.perStaff + policeNearby(c) * crime.perPolice;
  return std::min(kMaxDetection, p);
}

void World::dispatchPolice(const std::string& text) {
  for (const auto& [id, o] : state_.characters) {
    if (o.online && o.career.shiftStartedAt && o.career.careerId == "police") notify(id, "dispatch", text);
  }
}

Json World::arrestCharacter(CharacterState& c, const std::string& crime, const std::string& by) {
  const CrimeConfig& cfg = content_->crime();
  const CrimeDef* def = content_->crimeDef(crime);
  Json out{{"crime", def ? def->label : crime}, {"by", by}};
  if (c.career.shiftStartedAt) (void)endShift(c.id);
  if (c.education.sessionStartedAt) (void)endStudy(c.id);
  // Contraband goes, and carrying it is a second charge.
  Json seized = Json::array();
  std::vector<std::string> extra;
  for (auto it = c.inventory.begin(); it != c.inventory.end();) {
    const ItemDef* item = content_->item(it->first);
    if (item && item->illegal) {
      seized.push_back(item->label);
      if (const SubstanceDef* s = content_->substance(item->substance); s && !s->possessionCrime.empty() && s->possessionCrime != crime)
        extra.push_back(s->possessionCrime);
      it = c.inventory.erase(it);
    } else {
      ++it;
    }
  }
  Cents fines = 0;
  GameMinutes jail = 0;
  std::vector<std::string> charges{crime};
  std::sort(extra.begin(), extra.end());
  extra.erase(std::unique(extra.begin(), extra.end()), extra.end());
  charges.insert(charges.end(), extra.begin(), extra.end());
  for (const auto& charge : charges) {
    const CrimeDef* d = content_->crimeDef(charge);
    if (!d) continue;
    Cents fine = d->fineCents;
    GameMinutes time = d->jailMinutes;
    // Can't pay the fine: serve longer instead.
    if (fine > 0 && !state_.ledger.transfer(bankAccountOf(c.id), cfg.finesAccount, fine, "fine", d->label + " fine", state_.now)) {
      fine = 0;
      time = time * 2 + 240;
    }
    recordCrime(c, charge, fine, time);
    fines += fine;
    jail += time;
  }
  if (jail > 0) {
    c.moveTarget.reset();
    c.moveSpeedMps = 0;
    if (const LocationDef* cell = content_->location(cfg.jail)) {
      c.inside = cell->id;
      c.position = cell->door;
    }
    c.jailedUntil = state_.now + jail;
  }
  c.wantedFor.clear();
  applyEmotions(c, {{"embarrassment", 30}, {"stress", 20}, {"sadness", 10}});
  out["fine_cents"] = fines;
  out["jail_minutes"] = jail;
  if (!seized.empty()) out["seized"] = seized;
  std::string text = "Arrested for " + (def ? def->label : crime);
  if (fines > 0) text += ": fined " + formatMoney(fines);
  if (jail > 0) text += (fines > 0 ? ", " : ": ") + std::string("held until ") + formatDateTime(c.jailedUntil);
  notify(c.id, "police", text + ".");
  const CharacterDef* who = definition(c.id);
  dispatchPolice((who ? who->fullName() : c.id) + " was arrested for " + (def ? def->label : crime) + ".");
  emit(presentWith(c), "incident", Json{{"character", c.id}, {"kind", "arrest"}, {"crime", def ? def->label : crime}});
  Memory m;
  m.id = nextId("mem");
  m.owner = c.id;
  m.at = state_.now;
  m.participants = {c.id};
  m.location = c.inside;
  m.type = "arrest";
  m.importance = 70;
  m.emotionalImpact = -50;
  m.info = "Arrested for " + (def ? def->label : crime);
  addMemory(std::move(m));
  return out;
}

Result<Json> World::steal(const CharacterId& actor, const std::string& offerId) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  if (Status st = freeToAct(c); !st) return st.error();
  if (c.inside.empty()) return fail("not_inside", "you need to be inside a shop");
  const LocationDef* loc = content_->location(c.inside);
  const Offer* offer = nullptr;
  for (const auto& o : loc->offers) {
    if (o.id == offerId) offer = &o;
  }
  if (!offer) return fail("unknown_offer", loc->name + " doesn't sell that");
  if (!offer->service.empty()) return fail("cant_steal", "you can't steal a service");
  if (!isLocationOpen(*loc)) return fail("closed", loc->name + " is closed");
  const CrimeDef* crime = content_->crimeDef("shoplifting");
  if (!crime) return fail("unavailable", "crime is not part of this world");

  if (roll() < detectionChance(c, *crime)) {
    // Witnesses remember.
    for (const auto& id : presentWith(c, content_->sim().hearingRangeMeters)) {
      adjustRelationship(id, actor, "trust", -10);
      adjustRelationship(id, actor, "respect", -8);
      Memory m;
      m.id = nextId("mem");
      m.owner = id;
      m.at = state_.now;
      m.participants = {id, actor};
      m.location = loc->id;
      m.type = "saw_crime";
      m.importance = 40;
      m.emotionalImpact = -20;
      m.about = actor;
      m.info = "Saw " + definition(actor)->fullName() + " caught shoplifting at " + loc->name;
      addMemory(std::move(m));
    }
    Json out = arrestCharacter(c, "shoplifting", loc->name + " staff");
    out["caught"] = true;
    return out;
  }
  // Got away with it: you have it, nobody paid.
  applyNeeds(c, offer->needEffects);
  applyEmotions(c, offer->emotionEffects);
  applyEmotions(c, {{"excitement", 8}, {"stress", 5}});
  eat(c, offer->needEffects, offer->calories);
  if (!offer->item.empty()) c.inventory[offer->item] += offer->quantity;
  if (!offer->substance.empty()) (void)takeSubstance(c, offer->substance);
  return Json{{"stolen", offer->label}, {"caught", false}};
}

Result<Json> World::pickpocket(const CharacterId& actor, const CharacterId& target) {
  const CrimeConfig& cfg = content_->crime();
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  if (Status st = freeToAct(c); !st) return st.error();
  if (target == actor) return fail("invalid_target", "that's your own pocket");
  CharacterState* t = mutableCharacter(target);
  if (!t || !t->online) return fail("target_unavailable", "they are not here");
  if (!together(c, *t, kPickpocketRangeMeters)) return fail("too_far", "you need to be right next to them");
  auto last = c.pickpocketedAt.find(target);
  if (last != c.pickpocketedAt.end() && state_.now - last->second < cfg.pickpocketCooldownMinutes)
    return fail("too_soon", "they're keeping a hand on their pocket now");
  const CrimeDef* crime = content_->crimeDef("pickpocketing");
  if (!crime) return fail("unavailable", "crime is not part of this world");
  c.pickpocketedAt[target] = state_.now;
  const CharacterDef* thief = definition(actor);

  if (roll() < detectionChance(c, *crime)) {
    notify(target, "police", (thief ? thief->fullName() : actor) + " tried to pick your pocket and got caught.");
    adjustRelationship(target, actor, "trust", -30);
    adjustRelationship(target, actor, "resentment", 25);
    Json out = arrestCharacter(c, "pickpocketing", "witnesses");
    out["caught"] = true;
    return out;
  }
  const Cents cash = state_.ledger.balance(cashAccountOf(target));
  if (cash <= 0) return Json{{"stolen_cents", 0}, {"caught", false}, {"note", "Their pockets are empty."}};
  const Cents amount = std::min(cash, std::max<Cents>(100, static_cast<Cents>(roll() * static_cast<double>(cfg.pickpocketMaxCents))));
  (void)state_.ledger.transfer(cashAccountOf(target), cashAccountOf(actor), amount, "theft", "Pickpocketed", state_.now);
  applyEmotions(c, {{"excitement", 10}, {"stress", 6}});
  if (roll() < cfg.pickpocketNoticeChance) {
    // They felt it, and saw who. It's reported.
    notify(target, "police", (thief ? thief->fullName() : actor) + " picked your pocket: " + formatMoney(amount) + ". You reported it.");
    adjustRelationship(target, actor, "trust", -40);
    adjustRelationship(target, actor, "resentment", 35);
    Memory m;
    m.id = nextId("mem");
    m.owner = target;
    m.at = state_.now;
    m.participants = {target, actor};
    m.location = c.inside;
    m.type = "robbed";
    m.importance = 60;
    m.emotionalImpact = -50;
    m.about = actor;
    m.info = (thief ? thief->fullName() : actor) + " picked my pocket";
    addMemory(std::move(m));
    c.wantedFor = "pickpocketing";
    dispatchPolice("Pickpocketing reported. Suspect: " + (thief ? thief->fullName() : actor) + ".");
  } else {
    notify(target, "bank", "You're missing " + formatMoney(amount) + " in cash. You don't know where it went.");
  }
  return Json{{"stolen_cents", amount}, {"caught", false}};
}

Result<Json> World::arrest(const CharacterId& officer, const CharacterId& suspect) {
  auto r = activeCharacter(officer);
  if (!r) return r.error();
  CharacterState& o = *r.value();
  if (o.career.careerId != "police") return fail("not_police", "only the police can arrest people");
  if (!o.career.shiftStartedAt) return fail("off_duty", "you're off duty");
  CharacterState* s = mutableCharacter(suspect);
  if (!s || !s->online) return fail("target_unavailable", "they are not here");
  if (s->wantedFor.empty()) return fail("not_wanted", "there's no warrant for them");
  if (!together(o, *s, kArrestRangeMeters)) return fail("too_far", "you need to be right there");
  const CharacterDef* od = definition(officer);
  Json out = arrestCharacter(*s, s->wantedFor, od ? od->fullName() : officer);
  const CareerDef* career = content_->career("police");
  if (career && state_.ledger.transfer(career->employerAccount, bankAccountOf(officer), kArrestReward, "bonus", "Arrest", state_.now))
    out["reward_cents"] = kArrestReward;
  return out;
}

void World::stepCrimeHourly() {
  const CrimeConfig& cfg = content_->crime();
  for (auto& [id, c] : state_.characters) {
    if (c.jailedUntil >= 0 && c.jailedUntil <= state_.now) {
      c.jailedUntil = -1;
      notify(id, "police", "You've served your time. You're free to go.");
    }
    // A wanted person out in the open gets picked up by patrols eventually.
    if (c.online && !c.wantedFor.empty() && c.inside.empty() && c.jailedUntil < 0 && roll() < cfg.patrolArrestPerHour)
      (void)arrestCharacter(c, c.wantedFor, "a patrol");
  }
}

Json World::phoneRecord(const CharacterState& c) const {
  Json entries = Json::array();
  for (const auto& e : c.record) {
    const CrimeDef* d = content_->crimeDef(e.crime);
    entries.push_back(Json{{"crime", d ? d->label : e.crime}, {"when", formatDateTime(e.at)}, {"fine_cents", e.fineCents},
                           {"jail_minutes", e.jailMinutes}});
  }
  Json out{{"record", entries}, {"clean", c.record.empty()}};
  if (!c.wantedFor.empty()) out["wanted"] = true;  // you'd know: it's in the news, and people look at you
  if (c.jailedUntil > state_.now) out["jailed_until"] = formatDateTime(c.jailedUntil);
  return out;
}

}  // namespace livera
