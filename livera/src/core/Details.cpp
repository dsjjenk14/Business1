// Wetting yourself as a very big deal, laundry, weather, birthdays and hangovers.
// M0.8 feature file: see docs/m08/details.md. Tuning is data/society/details.json.
//
// Wetting yourself in front of people is public: everyone there remembers it and thinks less
// of you, a partner most of all; the witnesses tell their close friends for a day; at work it
// costs you; and if you're famous the Ledger runs it. You stay humiliated for days, and your
// clothes stay ruined until they're washed.
#include <algorithm>
#include <cmath>
#include <set>
#include <tuple>

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

bool has(const std::vector<std::string>& v, const std::string& x) { return std::find(v.begin(), v.end(), x) != v.end(); }

std::string firstNameOr(const CharacterDef* d, const std::string& id) { return d ? d->firstName : id; }

// "himself", "herself", "themself": from the character's pronouns.
std::string reflexive(const CharacterDef* d) {
  const std::string p = d ? d->pronouns : "";
  if (p.rfind("he", 0) == 0) return "himself";
  if (p.rfind("she", 0) == 0) return "herself";
  return "themself";
}

Json weatherJson(const WeatherDay& w, const WeatherKindDef* def) {
  return Json{{"kind", w.kind}, {"label", def ? def->label : w.kind}, {"temp_c", std::round(w.tempC)}};
}

}  // namespace

// ---- Content -------------------------------------------------------------------------------
Status ContentDatabase::ingestDetails(const std::string& source, const std::string& section, const Json& body, bool& handled) {
  if (section != "details") {
    handled = false;
    return okStatus();
  }
  handled = true;
  if (haveDetails_) return fail("content_duplicate", source + ": 'details' defined twice");
  haveDetails_ = true;
  DetailsConfig& D = details_;
  try {
    const Json& a = body.at("accident");
    D.humiliatedCondition = a.at("condition").get<std::string>();
    D.accidentEmotions = readStats(a, "emotions");
    D.accidentImportance = a.value("importance", D.accidentImportance);
    D.accidentImpact = a.value("impact", D.accidentImpact);
    const Json& w = a.at("witness");
    D.witnessImportance = w.value("importance", D.witnessImportance);
    D.witnessImpact = w.value("impact", D.witnessImpact);
    D.witnessRelationship = readStats(w, "relationship");
    D.partnerRelationship = readStats(w, "partner_relationship");
    D.witnessEmotions = readStats(w, "emotions");
    const Json& g = a.at("gossip");
    D.gossipHours = g.value("hours", D.gossipHours);
    D.gossipChancePerHour = g.value("chance_per_hour", D.gossipChancePerHour);
    D.gossipMinFriendship = g.value("min_friendship", D.gossipMinFriendship);
    D.gossipRelationship = readStats(g, "relationship");
    D.gossipImportance = g.value("importance", D.gossipImportance);
    D.gossipImpact = g.value("impact", D.gossipImpact);
    const Json& n = a.at("news");
    D.newsMinFame = n.value("min_fame", D.newsMinFame);
    D.newsFameLoss = n.value("fame_loss", D.newsFameLoss);
    D.newsRespect = n.value("respect", D.newsRespect);
    const Json& r = a.at("receptivity");
    D.humiliatedReceptivity = r.value("humiliated", D.humiliatedReceptivity);
    D.soiledReceptivity = r.value("soiled", D.soiledReceptivity);
    D.dirtyReceptivity = r.value("dirty", D.dirtyReceptivity);

    const Json& l = body.at("laundry");
    D.dirtyAfterHours = l.value("dirty_after_hours", D.dirtyAfterHours);
    D.dirtyHygienePerHour = l.value("dirty_hygiene_per_hour", D.dirtyHygienePerHour);
    D.soiledHygieneCap = l.value("soiled_hygiene_cap", D.soiledHygieneCap);
    D.homeLaundryNeeds = readStats(l, "home_needs");
    D.homeLaundryTrash = l.value("home_trash", D.homeLaundryTrash);
    D.laundromat = l.at("laundromat").get<std::string>();
    D.laundromatPriceCents = l.value("laundromat_price_cents", D.laundromatPriceCents);
    D.laundromatNeeds = readStats(l, "laundromat_needs");

    const Json& wx = body.at("weather");
    D.umbrellaItem = wx.at("umbrella").get<std::string>();
    D.forecastHour = wx.value("forecast_hour", D.forecastHour);
    for (const auto& k : wx.at("kinds")) {
      WeatherKindDef kd;
      kd.id = k.at("id").get<std::string>();
      kd.label = k.at("label").get<std::string>();
      kd.warn = k.value("warn", false);
      kd.umbrellaHalves = k.value("umbrella_halves", false);
      kd.outdoorsNeedsPerHour = readStats(k, "outdoors_needs_per_hour");
      kd.outdoorsEmotionsPerHour = readStats(k, "outdoors_emotions_per_hour");
      D.weatherKinds.push_back(std::move(kd));
    }
    for (const auto& s : wx.at("seasons")) {
      WeatherSeasonDef sd;
      sd.months = readInts(s, "months");
      sd.tempMin = s.at("temp_c").at(0).get<double>();
      sd.tempMax = s.at("temp_c").at(1).get<double>();
      for (const auto& [kind, p] : s.at("chances").items()) sd.chances.emplace_back(kind, p.get<double>());
      D.seasons.push_back(std::move(sd));
    }

    const Json& b = body.at("birthdays");
    D.birthdayMinFriendship = b.value("min_friendship", D.birthdayMinFriendship);
    D.cakeItem = b.at("cake").get<std::string>();
    D.cakeEmotions = readStats(b, "cake_emotions");
    D.cakeGiverEmotions = readStats(b, "giver_emotions");
    D.cakeFriendship = b.value("friendship", D.cakeFriendship);
    D.cakeImportance = b.value("importance", D.cakeImportance);
    D.cakeImpact = b.value("impact", D.cakeImpact);

    const Json& h = body.at("hangover");
    D.hangoverSubstance = h.at("substance").get<std::string>();
    D.hangoverDrinks = h.value("drinks", D.hangoverDrinks);
    D.hangoverWithinHours = h.value("within_hours", D.hangoverWithinHours);
    D.hangoverCondition = h.at("condition").get<std::string>();
    D.hangoverCheckHour = h.value("check_hour", D.hangoverCheckHour);
  } catch (const std::exception& e) {
    return fail("content_invalid", source + ": details: " + e.what());
  }
  return okStatus();
}

Status ContentDatabase::validateDetails() const {
  if (!haveDetails_) return okStatus();
  const DetailsConfig& D = details_;
  std::set<std::string> needs, emotions(sim_.emotions.begin(), sim_.emotions.end()),
      dims(sim_.relationshipDimensions.begin(), sim_.relationshipDimensions.end());
  for (const auto& n : sim_.needs) needs.insert(n.id);
  if (!condition(D.humiliatedCondition)) return fail("content_invalid", "details: unknown condition " + D.humiliatedCondition);
  if (!condition(D.hangoverCondition)) return fail("content_invalid", "details: unknown condition " + D.hangoverCondition);
  if (!substance(D.hangoverSubstance)) return fail("content_invalid", "details: unknown substance " + D.hangoverSubstance);
  if (!item(D.umbrellaItem)) return fail("content_invalid", "details: unknown umbrella item " + D.umbrellaItem);
  if (!item(D.cakeItem)) return fail("content_invalid", "details: unknown cake item " + D.cakeItem);
  const LocationDef* laundromat = location(D.laundromat);
  if (!laundromat) return fail("content_invalid", "details: unknown laundromat " + D.laundromat);
  if (D.laundromatPriceCents > 0 && laundromat->revenueAccount.empty())
    return fail("content_invalid", "details: the laundromat needs a revenue_account");
  for (const auto& [stats, where, keys] : {std::tuple{&D.accidentEmotions, "accident.emotions", &emotions},
                                           std::tuple{&D.witnessEmotions, "accident.witness.emotions", &emotions},
                                           std::tuple{&D.witnessRelationship, "accident.witness.relationship", &dims},
                                           std::tuple{&D.partnerRelationship, "accident.witness.partner_relationship", &dims},
                                           std::tuple{&D.gossipRelationship, "accident.gossip.relationship", &dims},
                                           std::tuple{&D.homeLaundryNeeds, "laundry.home_needs", &needs},
                                           std::tuple{&D.laundromatNeeds, "laundry.laundromat_needs", &needs},
                                           std::tuple{&D.cakeEmotions, "birthdays.cake_emotions", &emotions},
                                           std::tuple{&D.cakeGiverEmotions, "birthdays.giver_emotions", &emotions}}) {
    if (auto s = checkKeys(*stats, *keys, std::string("details.") + where); !s) return s;
  }
  if (D.weatherKinds.empty() || D.seasons.empty()) return fail("content_invalid", "details.weather needs kinds and seasons");
  for (const auto& k : D.weatherKinds) {
    if (auto s = checkKeys(k.outdoorsNeedsPerHour, needs, "details.weather " + k.id); !s) return s;
    if (auto s = checkKeys(k.outdoorsEmotionsPerHour, emotions, "details.weather " + k.id); !s) return s;
  }
  std::set<int> months;
  for (const auto& s : D.seasons) {
    double sum = 0;
    for (const auto& [kind, p] : s.chances) {
      if (!weatherKind(kind)) return fail("content_invalid", "details.weather: unknown kind " + kind);
      if (p < 0) return fail("content_invalid", "details.weather: negative chance");
      sum += p;
    }
    if (std::abs(sum - 1.0) > 1e-6) return fail("content_invalid", "details.weather: a season's chances must sum to 1");
    if (s.tempMax < s.tempMin) return fail("content_invalid", "details.weather: temp_c must be [min, max]");
    for (int m : s.months) {
      if (m < 1 || m > 12 || !months.insert(m).second) return fail("content_invalid", "details.weather: each month 1-12 exactly once");
    }
  }
  if (months.size() != 12) return fail("content_invalid", "details.weather: seasons must cover all twelve months");
  if (D.hangoverDrinks < 1 || D.hangoverWithinHours <= 0) return fail("content_invalid", "details.hangover: bad tuning");
  if (D.gossipChancePerHour < 0 || D.gossipChancePerHour > 1) return fail("content_invalid", "details.gossip: chance is 0-1");
  return okStatus();
}

const WeatherKindDef* ContentDatabase::weatherKind(const std::string& id) const {
  for (const auto& k : details_.weatherKinds) {
    if (k.id == id) return &k;
  }
  return nullptr;
}

// ---- Wetting yourself ----------------------------------------------------------------------
void World::wetYourself(CharacterState& c) {
  const DetailsConfig& D = content_->details();
  const CharacterDef* def = definition(c.id);
  const std::string name = firstNameOr(def, c.id);
  const LocationDef* here = currentPlace(c);
  const std::string place = here ? here->name : "the street";
  const std::string what = "wet " + reflexive(def) + " at " + place;
  const std::vector<CharacterId> witnesses = presentWith(c);

  c.needs["hygiene"] = 0;
  if (D.accidentEmotions.empty()) {
    applyEmotions(c, StatMap{{"embarrassment", content_->life().accidentEmbarrassment}});
  } else {
    applyEmotions(c, D.accidentEmotions);
  }
  if (!c.outfit.empty() && !has(c.detail.soiled, c.outfit)) c.detail.soiled.push_back(c.outfit);
  if (!D.humiliatedCondition.empty()) {
    if (findCondition(c, D.humiliatedCondition)) removeCondition(c, D.humiliatedCondition, "");
    addCondition(c, D.humiliatedCondition, true);
  }
  Memory m;
  m.id = nextId("mem");
  m.owner = c.id;
  m.at = state_.now;
  m.participants = {c.id};
  m.participants.insert(m.participants.end(), witnesses.begin(), witnesses.end());
  m.location = c.inside;
  m.type = "wet_myself";
  m.importance = D.accidentImportance;
  m.emotionalImpact = D.accidentImpact;
  m.info = "Wet myself at " + place + (witnesses.empty() ? ", alone, thank God" : " in front of " + std::to_string(witnesses.size()) +
                                                                                      (witnesses.size() == 1 ? " person" : " people"));
  m.isPublic = !witnesses.empty();
  addMemory(std::move(m));

  std::string consequences;
  for (const auto& w : witnesses) {
    CharacterState* wc = mutableCharacter(w);
    if (!wc) continue;
    const std::string status = relationshipStatus(w, c.id);
    const bool partner = status == "dating" || status == "engaged" || status == "married";
    for (const auto& [dim, d] : partner ? D.partnerRelationship : D.witnessRelationship) adjustRelationship(w, c.id, dim, d);
    applyEmotions(*wc, D.witnessEmotions);
    Memory wm;
    wm.id = nextId("mem");
    wm.owner = w;
    wm.at = state_.now;
    wm.participants = {c.id, w};
    wm.location = c.inside;
    wm.type = "saw_accident";
    wm.importance = D.witnessImportance;
    wm.emotionalImpact = D.witnessImpact;
    wm.about = c.id;
    wm.info = "Saw " + name + " " + what;
    wm.isPublic = true;
    addMemory(std::move(wm));
    notify(w, "social", name + " just " + what + ". Everyone saw.");
  }
  if (!witnesses.empty()) {
    witnessed("accident", c.id, "", c.inside, witnesses, what);  // the rumour (Social.cpp)
    consequences += " " + std::to_string(witnesses.size()) + (witnesses.size() == 1 ? " person" : " people") +
                    " saw it, and they'll tell their friends.";
  }
  // Famous people make the paper.
  if (c.fame >= D.newsMinFame) {
    c.fame = clampd(c.fame - D.newsFameLoss, 0, 100);
    for (const auto& [key, rel] : state_.relationships) {
      if (key.second == c.id && key.first != c.id) adjustRelationship(key.first, c.id, "respect", D.newsRespect);
    }
    notifyAll("news", "The Livéra Ledger: " + (def ? def->fullName() : c.id) + " " + what + ".");
    consequences += " The Livéra Ledger is running it.";
  }
  notify(c.id, "health", "You couldn't make it to a bathroom in time. You wet yourself" +
                             std::string(witnesses.empty() ? ", and at least nobody saw." : " in front of people.") + consequences +
                             (c.outfit.empty() ? "" : " Your clothes are ruined until they're washed."));
  emit(witnesses, "incident", Json{{"character", c.id}, {"kind", "bathroom_accident"}, {"witnesses", witnesses.size()}});
  emit({c.id}, "incident", Json{{"character", c.id}, {"kind", "bathroom_accident"}, {"witnesses", witnesses.size()}});
}

double World::detailsReceptivity(const CharacterState& actor) const {
  const DetailsConfig& D = content_->details();
  double r = 1.0;
  if (!D.humiliatedCondition.empty() && hasCondition(actor.id, D.humiliatedCondition)) r *= D.humiliatedReceptivity;
  if (soiledOutfit(actor)) r *= D.soiledReceptivity;
  else if (dirtyOutfit(actor)) r *= D.dirtyReceptivity;
  return r;
}

// ---- Clothes and laundry -------------------------------------------------------------------
bool World::soiledOutfit(const CharacterState& c) const { return !c.outfit.empty() && has(c.detail.soiled, c.outfit); }

bool World::dirtyOutfit(const CharacterState& c) const {
  if (c.outfit.empty()) return false;
  auto it = c.detail.wornHours.find(c.outfit);
  return it != c.detail.wornHours.end() && it->second >= content_->details().dirtyAfterHours;
}

bool World::clothingCountsForStyle(const CharacterState& c, const std::string& item) const {
  if (has(c.detail.soiled, item)) return false;
  auto it = c.detail.wornHours.find(item);
  if (it != c.detail.wornHours.end() && it->second >= content_->details().dirtyAfterHours) {
    const ItemDef* def = content_->item(item);
    return !(def && def->slot == "outfit");  // a dirty outfit looks it; an accessory doesn't get dirty
  }
  return true;
}

// "ruined" (wet in), "dirty" (worn too long) or "clean".
std::string World::clothesCondition(const CharacterState& c, const std::string& item) const {
  if (has(c.detail.soiled, item)) return "ruined";
  auto it = c.detail.wornHours.find(item);
  return it != c.detail.wornHours.end() && it->second >= content_->details().dirtyAfterHours ? "dirty" : "clean";
}

Result<Json> World::doLaundry(const CharacterId& actor) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  if (Status st = freeToAct(c); !st) return st.error();
  const DetailsConfig& D = content_->details();
  const PropertyState* home = homeOf(actor);
  const PropertyDef* homeDef = home ? content_->property(home->id) : nullptr;
  const bool atHome = homeDef && !c.inside.empty() && c.inside == homeDef->location;
  const LocationDef* laundromat = content_->location(D.laundromat);
  const bool atLaundromat = laundromat && c.inside == laundromat->id;
  if (!atHome && !atLaundromat)
    return fail("wrong_place", "do laundry at home, or at " + (laundromat ? laundromat->name : std::string("the laundromat")));
  if (atLaundromat && !isLocationOpen(*laundromat)) return fail("closed", laundromat->name + " is closed");
  int washed = 0;
  for (const auto& [item, hours] : c.detail.wornHours) washed += hours > 0 ? 1 : 0;
  for (const auto& item : c.detail.soiled) {
    if (!c.detail.wornHours.count(item)) ++washed;
  }
  if (washed == 0) return fail("nothing_to_wash", "your clothes are all clean");
  Json out{{"washed", washed}};
  if (atLaundromat && D.laundromatPriceCents > 0) {
    auto tx = state_.ledger.transfer(bankAccountOf(actor), laundromat->revenueAccount, D.laundromatPriceCents, "purchase",
                                     "Wash and dry at " + laundromat->name, state_.now);
    if (!tx) return tx.error();
    out["price_cents"] = D.laundromatPriceCents;
    out["balance_cents"] = state_.ledger.balance(bankAccountOf(actor));
    applyNeeds(c, D.laundromatNeeds);
    out["where"] = laundromat->name;
  } else {
    applyNeeds(c, D.homeLaundryNeeds);
    if (PropertyState* h = homeOf(actor)) h->trash = clampd(h->trash + D.homeLaundryTrash, kStatMin, kStatMax);
    out["where"] = "home";
  }
  c.detail.wornHours.clear();
  c.detail.soiled.clear();
  return out;
}

// ---- Weather ---------------------------------------------------------------------------------
WeatherDay World::rollWeatherDay(std::int64_t dayIndex) {
  const DetailsConfig& D = content_->details();
  const int month = toDateTime(dayIndex * kMinutesPerDay).month;
  const WeatherSeasonDef* season = nullptr;
  for (const auto& s : D.seasons) {
    if (std::find(s.months.begin(), s.months.end(), month) != s.months.end()) season = &s;
  }
  WeatherDay w;
  if (!season) return w;
  const double r = roll();
  double acc = 0;
  w.kind = season->chances.empty() ? "" : season->chances.back().first;
  for (const auto& [kind, p] : season->chances) {
    acc += p;
    if (r < acc) {
      w.kind = kind;
      break;
    }
  }
  w.tempC = std::round((season->tempMin + (season->tempMax - season->tempMin) * roll()) * 10) / 10;
  return w;
}

// The forecast becomes today; a new day is forecast. On a new world (or an older save) both are rolled.
void World::rollWeather(bool newDay) {
  if (!content_->details().weatherKinds.size()) return;
  DetailsWorldState& W = state_.details;
  const std::int64_t day = state_.now / kMinutesPerDay;
  if (W.weatherDay < 0 || !newDay) {
    W.today = rollWeatherDay(day);
    W.tomorrow = rollWeatherDay(day + 1);
  } else {
    W.today = W.tomorrow.kind.empty() ? rollWeatherDay(day) : W.tomorrow;
    W.tomorrow = rollWeatherDay(day + 1);
  }
  W.weatherDay = day;
}

// ---- Birthdays -------------------------------------------------------------------------------
bool World::isBirthdayToday(const CharacterState& c) const {
  const int age = ageOf(c.id);
  const GameMinutes last = c.bornAt + static_cast<GameMinutes>(age) * kMinutesPerYear;
  return state_.now / kMinutesPerDay == last / kMinutesPerDay;
}

void World::onBirthday(CharacterState& c, int age) {
  const DetailsConfig& D = content_->details();
  const CharacterDef* def = definition(c.id);
  const std::string name = firstNameOr(def, c.id);
  for (const auto& [key, rel] : state_.relationships) {
    if (key.second != c.id || key.first == c.id) continue;
    auto f = rel.dimensions.find("friendship");
    if (f == rel.dimensions.end() || f->second < D.birthdayMinFriendship) continue;
    if (!character(key.first)) continue;
    notify(key.first, "social", "It's " + name + "'s birthday today: " + std::to_string(age) + ".");
  }
}

void World::onGift(CharacterState& giver, CharacterState& receiver, const std::string& item, Json& out) {
  const DetailsConfig& D = content_->details();
  if (item != D.cakeItem || !isBirthdayToday(receiver)) return;
  applyEmotions(receiver, D.cakeEmotions);
  applyEmotions(giver, D.cakeGiverEmotions);
  adjustRelationship(receiver.id, giver.id, "friendship", D.cakeFriendship);
  adjustRelationship(giver.id, receiver.id, "friendship", D.cakeFriendship / 2);
  const CharacterDef* g = definition(giver.id);
  const CharacterDef* r = definition(receiver.id);
  for (auto [owner, other, info] : {std::tuple{receiver.id, giver.id, firstNameOr(g, giver.id) + " brought me a birthday cake"},
                                    std::tuple{giver.id, receiver.id, "Brought " + firstNameOr(r, receiver.id) + " a birthday cake"}}) {
    Memory m;
    m.id = nextId("mem");
    m.owner = owner;
    m.at = state_.now;
    m.participants = {giver.id, receiver.id};
    m.location = receiver.inside;
    m.type = "birthday_cake";
    m.importance = D.cakeImportance;
    m.emotionalImpact = D.cakeImpact;
    m.about = other;
    m.info = info;
    addMemory(std::move(m));
  }
  notify(receiver.id, "social", firstNameOr(g, giver.id) + " brought you a birthday cake.");
  out["birthday"] = true;
}

// ---- Drinks ----------------------------------------------------------------------------------
void World::onDrink(CharacterState& c, const std::string& substance) {
  const DetailsConfig& D = content_->details();
  if (substance != D.hangoverSubstance) return;
  c.detail.drinks.push_back(state_.now);
  std::erase_if(c.detail.drinks, [&](GameMinutes t) { return state_.now - t > kMinutesPerDay; });
}

// ---- Simulation ----------------------------------------------------------------------------
void World::stepDetailsHourly() {
  const DetailsConfig& D = content_->details();
  if (D.weatherKinds.empty()) return;
  const DateTime d = toDateTime(state_.now);
  DetailsWorldState& W = state_.details;
  const bool forecastHour = d.hour == D.forecastHour;
  if (W.weatherDay < 0 || (forecastHour && W.weatherDay != d.dayIndex)) {
    rollWeather(W.weatherDay >= 0);
    const WeatherKindDef* k = content_->weatherKind(W.today.kind);
    if (k && k->warn) {
      for (const auto& [id, c] : state_.characters) {
        if (!c.online) continue;
        notify(id, "weather", "Today: " + k->label + ", " + std::to_string(static_cast<int>(std::round(W.today.tempC))) + "°C." +
                                  (owns(id, D.umbrellaItem) ? "" : " You don't have an umbrella."));
      }
    }
  }
  const WeatherKindDef* today = content_->weatherKind(W.today.kind);

  for (auto& [id, c] : state_.characters) {
    // The morning after: enough drinks last night and you wake up hungover.
    if (d.hour == D.hangoverCheckHour && !D.hangoverCondition.empty()) {
      const GameMinutes since = state_.now - static_cast<GameMinutes>(D.hangoverWithinHours * 60);
      const auto n = std::count_if(c.detail.drinks.begin(), c.detail.drinks.end(), [&](GameMinutes t) { return t >= since; });
      if (n >= D.hangoverDrinks && !findCondition(c, D.hangoverCondition)) {
        addCondition(c, D.hangoverCondition, true);
        c.detail.drinks.clear();
        notify(id, "health", "You wake up hungover: " + std::to_string(n) + " drinks last night. Painkillers help; so does time.");
      }
    }
    if (!c.online) continue;
    // Out in the weather without an umbrella.
    if (today && c.inside.empty() && (!today->outdoorsNeedsPerHour.empty() || !today->outdoorsEmotionsPerHour.empty())) {
      const bool umbrella = owns(id, D.umbrellaItem);
      if (!umbrella || today->umbrellaHalves) {
        const double k = umbrella ? 0.5 : 1.0;
        StatMap needs, emotions;
        for (const auto& [n, v] : today->outdoorsNeedsPerHour) needs[n] = v * k;
        for (const auto& [e, v] : today->outdoorsEmotionsPerHour) emotions[e] = v * k;
        applyNeeds(c, needs);
        applyEmotions(c, emotions);
      }
    }
    // Clothes: worn hours add up; dirty and soiled clothes tell on you.
    if (!c.outfit.empty()) {
      c.detail.wornHours[c.outfit] += 1;
      if (dirtyOutfit(c)) c.needs["hygiene"] = clampd(c.needs["hygiene"] + D.dirtyHygienePerHour, kStatMin, kStatMax);
      if (soiledOutfit(c) && c.needs["hygiene"] > D.soiledHygieneCap) c.needs["hygiene"] = D.soiledHygieneCap;
    }
  }

  // Gossip: each witness may tell a close friend who hasn't heard yet.
  for (auto& r : W.rumors) {
    if (state_.now > r.until) continue;
    const CharacterDef* aboutDef = definition(r.about);
    const std::string name = firstNameOr(aboutDef, r.about);
    std::vector<std::pair<CharacterId, CharacterId>> told;  // (teller, friend)
    for (const auto& teller : r.tellers) {
      if (!character(teller)) continue;
      for (const auto& [key, rel] : state_.relationships) {
        if (key.first != teller || key.second == r.about || has(r.knows, key.second)) continue;
        auto f = rel.dimensions.find("friendship");
        if (f == rel.dimensions.end() || f->second < D.gossipMinFriendship || !character(key.second)) continue;
        if (std::any_of(told.begin(), told.end(), [&](const auto& t) { return t.second == key.second; })) continue;
        if (roll() < D.gossipChancePerHour) told.emplace_back(teller, key.second);
      }
    }
    // What hearing it does to the hearer's view: by the kind of scene (social.json, D-074), else the accident's.
    const SocialGossipKindDef* kind = content_->social().gossipKind(r.kind);
    const StatMap& heard = kind ? kind->relationship : D.gossipRelationship;
    for (const auto& [teller, friendId] : told) {
      r.knows.push_back(friendId);
      for (const auto& [dim, delta] : heard) adjustRelationship(friendId, r.about, dim, delta);
      const CharacterDef* t = definition(teller);
      Memory m;
      m.id = nextId("mem");
      m.owner = friendId;
      m.at = state_.now;
      m.participants = {teller, friendId, r.about};
      m.type = "heard_gossip";
      m.importance = D.gossipImportance;
      m.emotionalImpact = D.gossipImpact;
      m.about = r.about;
      m.info = "Heard from " + firstNameOr(t, teller) + " that " + name + " " + r.what;
      addMemory(std::move(m));
      notify(friendId, "social", firstNameOr(t, teller) + " told you " + name + " " + r.what + ".");
    }
  }
  std::erase_if(W.rumors, [&](const Rumor& r) { return state_.now > r.until + kMinutesPerDay; });
}

Json World::phoneWeather(const CharacterState& c) const {
  const DetailsWorldState& W = state_.details;
  if (W.weatherDay < 0) return Json{{"today", nullptr}, {"tomorrow", nullptr}};
  const DetailsConfig& D = content_->details();
  return Json{{"today", weatherJson(W.today, content_->weatherKind(W.today.kind))},
              {"tomorrow", weatherJson(W.tomorrow, content_->weatherKind(W.tomorrow.kind))},
              {"umbrella", owns(c.id, D.umbrellaItem)},
              {"changes_at", std::to_string(D.forecastHour) + ":00"}};
}

// ---- Save ----------------------------------------------------------------------------------
Json detailsPartToJson(const WorldState& s) {
  const DetailsWorldState& W = s.details;
  Json rumors = Json::array();
  for (const auto& r : W.rumors)
    rumors.push_back(Json{{"about", r.about}, {"what", r.what}, {"at", r.at}, {"until", r.until}, {"tellers", r.tellers}, {"knows", r.knows},
                          {"id", r.id}, {"kind", r.kind}, {"with", r.with}, {"place", r.place}, {"post", r.post}});  // D-074
  return Json{{"weather_day", W.weatherDay},
              {"today", Json{{"kind", W.today.kind}, {"temp_c", W.today.tempC}}},
              {"tomorrow", Json{{"kind", W.tomorrow.kind}, {"temp_c", W.tomorrow.tempC}}},
              {"rumors", rumors}};
}

void detailsPartFromJson(WorldState& s, const Json& j) {
  DetailsWorldState& W = s.details;
  W = DetailsWorldState{};
  if (!j.is_object()) return;
  W.weatherDay = j.value("weather_day", std::int64_t{-1});
  auto day = [](const Json& d) {
    WeatherDay w;
    if (d.is_object()) {
      w.kind = d.value("kind", "");
      w.tempC = d.value("temp_c", 0.0);
    }
    return w;
  };
  W.today = day(j.value("today", Json::object()));
  W.tomorrow = day(j.value("tomorrow", Json::object()));
  for (const auto& r : j.value("rumors", Json::array())) {
    Rumor x;
    x.about = r.value("about", "");
    x.what = r.value("what", "");
    x.at = r.value("at", GameMinutes{0});
    x.until = r.value("until", GameMinutes{0});
    x.tellers = r.value("tellers", std::vector<std::string>{});
    x.knows = r.value("knows", std::vector<std::string>{});
    // D-074: a rumour saved before social media has no id or kind, and is never posted.
    x.id = r.value("id", "");
    x.kind = r.value("kind", "");
    x.with = r.value("with", "");
    x.place = r.value("place", "");
    x.post = r.value("post", "");
    W.rumors.push_back(std::move(x));
  }
}

void writeDetailsCharacter(const CharacterState& c, Json& j) {
  j["details"] = Json{{"worn_hours", c.detail.wornHours}, {"soiled", c.detail.soiled}, {"drinks", c.detail.drinks}};
}

void readDetailsCharacter(CharacterState& c, const Json& j) {
  c.detail = DetailsCharacterState{};
  if (!j.contains("details") || !j.at("details").is_object()) return;
  const Json& d = j.at("details");
  c.detail.wornHours = d.value("worn_hours", std::map<std::string, double>{});
  c.detail.soiled = d.value("soiled", std::vector<std::string>{});
  c.detail.drinks = d.value("drinks", std::vector<GameMinutes>{});
}

}  // namespace livera
