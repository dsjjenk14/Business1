// Sports teams and fields, date spots and Willow Lake Park.
//
// Dates: some offers and activities at date spots (data/leisure/sports.json `date_spots`) count
// as a date when your partner is there with you: both of you feel it, both remember it. Once per
// couple per place per game day, so a second dessert doesn't make a second date.
//
// Sports: town teams play a weekly league match at their venue. The server plays it at kickoff:
// a side's strength is its townsfolk roster plus the members standing at the venue, by athletics
// and energy, plus a little luck; the score follows from the strengths. Full time comes at the
// first hourly step after the match's length. M0.8 feature file: see docs/m08/leisure.md.
#include <algorithm>
#include <cmath>
#include <numbers>
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
constexpr int kMaxOvertimes = 3;

bool contains(const std::vector<std::string>& v, const std::string& x) { return std::find(v.begin(), v.end(), x) != v.end(); }

// Practice helps less the better you already are (the same curve as music).
double skillGain(double current, double base) { return base * std::max(0.1, 1.0 - current / 120.0); }

std::string coupleKey(const CharacterId& a, const CharacterId& b, const LocationId& place) {
  return (a < b ? a + "|" + b : b + "|" + a) + "|" + place;
}

std::string hourText(int h) { return (h % 24 < 10 ? "0" : "") + std::to_string(h % 24) + ":00"; }

std::string nameOf(const World& w, const CharacterId& id) {
  const CharacterDef* d = w.definition(id);
  return d ? d->fullName() : id;
}

std::string firstNameOf(const World& w, const CharacterId& id) {
  const CharacterDef* d = w.definition(id);
  return d ? d->firstName : id;
}

std::string teamName(const ContentDatabase& db, const std::string& id) {
  const LeisureTeamDef* t = db.leisureTeam(id);
  return t ? t->name : id;
}

Json matchJson(const World& w, const LeisureMatch& m) {
  const ContentDatabase& db = w.content();
  const LeisureSportDef* sport = db.leisureSport(m.sport);
  const LocationDef* venue = sport ? db.location(sport->venue) : nullptr;
  auto names = [&](const std::vector<CharacterId>& ids) {
    Json out = Json::array();
    for (const auto& id : ids) out.push_back(nameOf(w, id));
    return out;
  };
  Json j{{"match", m.id},
         {"sport", m.sport},
         {"venue", venue ? venue->name : ""},
         {"home", m.home},
         {"home_name", teamName(db, m.home)},
         {"away", m.away},
         {"away_name", teamName(db, m.away)},
         {"kickoff", m.kickoff},
         {"kickoff_text", formatDateTime(m.kickoff)},
         {"home_players", names(m.homeLineup)},
         {"away_players", names(m.awayLineup)},
         {"finished", m.finished}};
  if (m.finished) {
    j["home_score"] = m.homeScore;
    j["away_score"] = m.awayScore;
    j["overtime"] = m.overtime;
  } else {
    j["full_time_at"] = m.endsAt;
  }
  return j;
}

Json standingJson(const LeisureStanding& s) {
  return Json{{"played", s.played}, {"won", s.won},       {"drawn", s.drawn},   {"lost", s.lost},
              {"for", s.scored},    {"against", s.conceded}, {"points", s.points}};
}

}  // namespace

// ---- Content -------------------------------------------------------------------------------
Status ContentDatabase::ingestLeisure(const std::string& source, const std::string& section, const Json& body, bool& handled) {
  handled = section == "leisure";
  if (!handled) return okStatus();
  if (haveLeisure_) return fail("content_duplicate", source + ": 'leisure' defined twice");
  haveLeisure_ = true;
  try {
    LeisureConfig& L = leisure_;
    L.leagueAccount = body.at("league_account").get<std::string>();
    L.clubhouse = body.at("clubhouse").get<std::string>();
    L.leagueFeeCents = body.value("league_fee_cents", L.leagueFeeCents);
    L.skill = body.value("skill", L.skill);
    L.coachCareers = readStrings(body, "coach_careers");
    L.coachedPracticeBonus = body.value("coached_practice_bonus", L.coachedPracticeBonus);
    L.luck = body.value("luck", L.luck);
    L.resultsKept = body.value("results_kept", L.resultsKept);
    const Json player = body.value("player", Json::object());
    L.playerBase = player.value("base", L.playerBase);
    L.skillWeight = player.value("skill_weight", L.skillWeight);
    L.energyNeed = player.value("energy_need", L.energyNeed);
    L.minEnergyFactor = player.value("min_energy_factor", L.minEnergyFactor);
    const Json match = body.value("match", Json::object());
    L.playerNeeds = readStats(match, "player_needs");
    L.playerCalories = match.value("player_calories", L.playerCalories);
    L.matchSkillGain = match.value("skill_gain", L.matchSkillGain);
    L.fameWin = match.value("fame_win", L.fameWin);
    L.fameDraw = match.value("fame_draw", L.fameDraw);
    L.fameLoss = match.value("fame_loss", L.fameLoss);
    L.winEmotions = readStats(match, "win_emotions");
    L.drawEmotions = readStats(match, "draw_emotions");
    L.lossEmotions = readStats(match, "loss_emotions");
    L.spectatorEmotions = readStats(match, "spectator_emotions");
    L.spectatorNeeds = readStats(match, "spectator_needs");
    const Json date = body.value("date", Json::object());
    L.dateStatuses = readStrings(date, "statuses");
    L.dateRelationship = readStats(date, "relationship");
    L.dateEmotions = readStats(date, "emotions");
    L.dateImportance = date.value("importance", L.dateImportance);
    L.dateImpact = date.value("impact", L.dateImpact);
    for (const auto& d : body.value("date_spots", Json::array())) {
      LeisureDateSpotDef spot;
      spot.place = d.at("place").get<std::string>();
      spot.offer = d.value("offer", "");
      spot.activity = d.value("activity", "");
      spot.memory = d.at("memory").get<std::string>();
      L.dateSpots.push_back(std::move(spot));
    }
    for (const auto& h : body.value("activity_hours", Json::array())) {
      LeisureActivityHoursDef w;
      w.place = h.at("place").get<std::string>();
      w.activity = h.at("activity").get<std::string>();
      w.hours.openHour = h.at("hours").at(0).get<int>();
      w.hours.closeHour = h.at("hours").at(1).get<int>();
      L.activityHours.push_back(std::move(w));
    }
    for (const auto& p : body.value("practice", Json::array())) {
      LeisurePracticeDef d;
      d.place = p.at("place").get<std::string>();
      d.activity = p.at("activity").get<std::string>();
      d.skills = readStats(p, "skills");
      L.practice.push_back(std::move(d));
    }
    for (const auto& s : body.value("sports", Json::array())) {
      LeisureSportDef d;
      d.id = s.at("id").get<std::string>();
      d.name = s.at("name").get<std::string>();
      d.venue = s.at("venue").get<std::string>();
      d.matchWeekday = s.at("match_day").get<int>();
      d.matchHour = s.at("match_hour").get<int>();
      d.durationMinutes = s.value("duration_minutes", d.durationMinutes);
      d.lineup = s.value("lineup", d.lineup);
      const Json sc = s.value("scoring", Json::object());
      d.scoring = sc.value("model", d.scoring);
      d.perTeam = sc.value("per_team", d.perTeam);
      d.sensitivity = sc.value("sensitivity", d.sensitivity);
      d.noise = sc.value("noise", d.noise);
      d.maxScore = sc.value("max", d.maxScore);
      d.draws = sc.value("draws", d.draws);
      d.overtimeFraction = sc.value("overtime_fraction", d.overtimeFraction);
      const Json pts = s.value("points", Json::object());
      d.pointsWin = pts.value("win", d.pointsWin);
      d.pointsDraw = pts.value("draw", d.pointsDraw);
      d.pointsLoss = pts.value("loss", d.pointsLoss);
      L.sports.push_back(std::move(d));
    }
    for (const auto& t : body.value("teams", Json::array())) {
      LeisureTeamDef d;
      d.id = t.at("id").get<std::string>();
      d.name = t.at("name").get<std::string>();
      d.sport = t.at("sport").get<std::string>();
      d.strength = t.value("strength", d.strength);
      L.teams.push_back(std::move(d));
    }
  } catch (const std::exception& e) {
    return fail("content_invalid", source + ": leisure: " + e.what());
  }
  return okStatus();
}

Status ContentDatabase::validateLeisure() const {
  if (!haveLeisure_) return okStatus();
  const LeisureConfig& L = leisure_;
  std::set<std::string> needs, emotions(sim_.emotions.begin(), sim_.emotions.end()), orgs,
      skills(sim_.skills.begin(), sim_.skills.end()),
      dims(sim_.relationshipDimensions.begin(), sim_.relationshipDimensions.end());
  for (const auto& n : sim_.needs) needs.insert(n.id);
  for (const auto& o : orgAccounts_) orgs.insert(o.id);
  auto bad = [](const std::string& msg) { return fail("content_invalid", "leisure: " + msg); };
  if (!orgs.count(L.leagueAccount)) return bad("league_account must be an org account");
  if (!location(L.clubhouse)) return bad("unknown clubhouse " + L.clubhouse);
  if (L.leagueFeeCents < 0) return bad("league_fee_cents must not be negative");
  if (!skills.count(L.skill)) return bad("skill " + L.skill + " is not in simulation.skills");
  if (!needs.count(L.energyNeed)) return bad("player.energy_need: unknown need " + L.energyNeed);
  for (const auto& c : L.coachCareers) {
    if (!career(c)) return bad("unknown coach career " + c);
  }
  if (L.minEnergyFactor < 0 || L.minEnergyFactor > 1) return bad("player.min_energy_factor must be 0..1");
  if (L.luck < 0 || L.playerBase < 0 || L.skillWeight < 0 || L.coachedPracticeBonus < 0) return bad("negative tuning");
  if (L.resultsKept < 1) return bad("results_kept must be at least 1");
  if (auto s = checkKeys(L.playerNeeds, needs, "leisure match player_needs"); !s) return s;
  if (auto s = checkKeys(L.spectatorNeeds, needs, "leisure match spectator_needs"); !s) return s;
  for (const StatMap* m : {&L.winEmotions, &L.drawEmotions, &L.lossEmotions, &L.spectatorEmotions, &L.dateEmotions}) {
    if (auto s = checkKeys(*m, emotions, "leisure emotions"); !s) return s;
  }
  if (auto s = checkKeys(L.dateRelationship, dims, "leisure date relationship"); !s) return s;

  auto findActivity = [&](const LocationDef& loc, const std::string& id) {
    return std::any_of(loc.activities.begin(), loc.activities.end(), [&](const Activity& a) { return a.id == id; });
  };
  auto findOffer = [&](const LocationDef& loc, const std::string& id) {
    return std::any_of(loc.offers.begin(), loc.offers.end(), [&](const Offer& o) { return o.id == id; });
  };
  std::set<std::string> spots;
  for (const auto& d : L.dateSpots) {
    const LocationDef* loc = location(d.place);
    if (!loc) return bad("date spot: unknown place " + d.place);
    if (d.offer.empty() == d.activity.empty()) return bad("date spot at " + d.place + " needs exactly one of offer or activity");
    if (!d.offer.empty() && !findOffer(*loc, d.offer)) return bad("date spot: " + loc->name + " has no offer " + d.offer);
    if (!d.activity.empty() && !findActivity(*loc, d.activity))
      return bad("date spot: " + loc->name + " has no activity " + d.activity);
    if (d.memory.empty()) return bad("date spot at " + d.place + " needs a memory");
    if (!spots.insert(d.place + "/" + d.offer + "/" + d.activity).second) return bad("duplicate date spot at " + d.place);
  }
  for (const auto& h : L.activityHours) {
    const LocationDef* loc = location(h.place);
    if (!loc || !findActivity(*loc, h.activity)) return bad("activity_hours: no activity " + h.place + "/" + h.activity);
    if (h.hours.openHour < 0 || h.hours.openHour > 23 || h.hours.closeHour < 0 || h.hours.closeHour > 24)
      return bad("activity_hours: hours must be 0-24");
  }
  for (const auto& p : L.practice) {
    const LocationDef* loc = location(p.place);
    if (!loc || !findActivity(*loc, p.activity)) return bad("practice: no activity " + p.place + "/" + p.activity);
    if (auto s = checkKeys(p.skills, skills, "leisure practice " + p.activity); !s) return s;
  }
  std::set<std::string> sportIds;
  for (const auto& s : L.sports) {
    const std::string where = "sport " + s.id;
    if (!sportIds.insert(s.id).second) return fail("content_duplicate", "leisure: duplicate " + where);
    const LocationDef* venue = location(s.venue);
    if (!venue) return bad(where + ": unknown venue " + s.venue);
    if (venue->enterable) return bad(where + ": the venue must be an outdoor place people stand in");
    if (s.matchWeekday < 0 || s.matchWeekday > 6) return bad(where + ": match_day must be 0 (Monday) to 6");
    if (s.matchHour < 0 || s.matchHour > 23) return bad(where + ": match_hour must be 0-23");
    if (s.durationMinutes < 1 || s.durationMinutes > 24 * 60) return bad(where + ": duration_minutes must be 1-1440");
    if (s.lineup < 1) return bad(where + ": lineup must be at least 1");
    if (s.scoring != "goals" && s.scoring != "points") return bad(where + ": scoring model must be goals or points");
    if (s.perTeam <= 0 || s.sensitivity < 0 || s.noise < 0 || s.maxScore < 1) return bad(where + ": bad scoring");
    if (!s.draws && (s.overtimeFraction <= 0 || s.overtimeFraction > 1)) return bad(where + ": overtime_fraction must be in (0, 1]");
    int teams = 0;
    for (const auto& t : L.teams) teams += t.sport == s.id ? 1 : 0;
    if (teams < 2) return bad(where + " needs at least two teams");
    // Two sports at one venue can't play at the same time.
    for (const auto& o : L.sports) {
      if (&o == &s || o.venue != s.venue || o.matchWeekday != s.matchWeekday) continue;
      const int a0 = s.matchHour * 60, a1 = a0 + s.durationMinutes, b0 = o.matchHour * 60, b1 = b0 + o.durationMinutes;
      if (a0 < b1 && b0 < a1) return bad(where + " and " + o.id + " overlap at " + venue->name);
    }
  }
  std::set<std::string> teamIds;
  for (const auto& t : L.teams) {
    if (!teamIds.insert(t.id).second) return fail("content_duplicate", "leisure: duplicate team " + t.id);
    if (!sportIds.count(t.sport)) return bad("team " + t.id + ": unknown sport " + t.sport);
    if (t.strength < 0) return bad("team " + t.id + ": strength must not be negative");
  }
  return okStatus();
}

const LeisureSportDef* ContentDatabase::leisureSport(const std::string& id) const {
  for (const auto& s : leisure_.sports) {
    if (s.id == id) return &s;
  }
  return nullptr;
}

const LeisureTeamDef* ContentDatabase::leisureTeam(const std::string& id) const {
  for (const auto& t : leisure_.teams) {
    if (t.id == id) return &t;
  }
  return nullptr;
}

// ---- Teams ---------------------------------------------------------------------------------
std::vector<CharacterId> World::leisureTeamMembers(const std::string& team) const {
  std::vector<CharacterId> out;
  for (const auto& [id, c] : state_.characters) {
    if (contains(c.leisureTeams, team)) out.push_back(id);
  }
  return out;
}

GameMinutes World::leisureNextKickoff(const LeisureSportDef& sport, GameMinutes after) const {
  const std::int64_t today = std::max<GameMinutes>(0, after) / kMinutesPerDay;
  for (std::int64_t day = today; day <= today + kDaysPerWeek; ++day) {
    if (day % kDaysPerWeek != sport.matchWeekday) continue;
    const GameMinutes t = day * kMinutesPerDay + sport.matchHour * kMinutesPerHour;
    if (t > after) return t;
  }
  return after + kMinutesPerWeek;  // not reached: some day in the next eight is the match day
}

// A round robin by the circle method: the first team stays put, the others rotate a seat each
// week, so every pairing comes round once every (teams - 1) weeks; the next time round, home
// and away swap. With an odd number of teams, one sits the week out.
std::vector<std::pair<std::string, std::string>> World::leisureFixtures(const LeisureSportDef& sport, std::int64_t week) const {
  std::vector<std::string> ids;
  for (const auto& t : content_->leisure().teams) {
    if (t.sport == sport.id) ids.push_back(t.id);
  }
  std::vector<std::pair<std::string, std::string>> out;
  if (ids.size() < 2) return out;
  if (ids.size() % 2 == 1) ids.emplace_back();  // the bye
  const std::size_t n = ids.size();
  const std::size_t rounds = n - 1;
  const auto w = static_cast<std::size_t>(std::max<std::int64_t>(0, week));
  const std::size_t round = w % rounds;
  std::vector<std::string> seats{ids[0]};
  for (std::size_t i = 0; i < rounds; ++i) seats.push_back(ids[1 + (i + round) % rounds]);
  const bool secondLeg = (w / rounds) % 2 == 1;
  for (std::size_t i = 0; i < n / 2; ++i) {
    std::string home = seats[i];
    std::string away = seats[n - 1 - i];
    if (home.empty() || away.empty()) continue;
    if (((i + round) % 2 == 1) != secondLeg) std::swap(home, away);
    out.emplace_back(home, away);
  }
  return out;
}

Result<Json> World::joinTeam(const CharacterId& actor, const std::string& teamId) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  if (Status st = freeToAct(c); !st) return st.error();
  const LeisureConfig& L = content_->leisure();
  const LeisureTeamDef* team = content_->leisureTeam(teamId);
  if (!team) return fail("unknown_team", "no such team");
  const LeisureSportDef* sport = content_->leisureSport(team->sport);
  if (contains(c.leisureTeams, teamId)) return fail("already_on_team", "you already play for " + team->name);
  for (const auto& t : c.leisureTeams) {
    const LeisureTeamDef* other = content_->leisureTeam(t);
    if (other && other->sport == team->sport)
      return fail("one_team_per_sport", "you already play " + sport->name + " for " + other->name + "; leave them first");
  }
  const LocationDef* clubhouse = content_->location(L.clubhouse);
  const LocationDef* venue = content_->location(sport->venue);
  const LocationDef* here = currentPlace(c);
  const bool atClubhouse = here && here->id == L.clubhouse;
  if (!atClubhouse && !(here && here->id == sport->venue))
    return fail("wrong_place", "sign up in person at " + clubhouse->name + " or " + venue->name);
  if (atClubhouse && !isLocationOpen(*clubhouse)) return fail("closed", "the league office at " + clubhouse->name + " is closed");
  Json out{{"team", team->id}, {"name", team->name}, {"sport", sport->name}, {"fee_cents", L.leagueFeeCents}};
  if (L.leagueFeeCents > 0) {
    auto tx = state_.ledger.transfer(bankAccountOf(actor), L.leagueAccount, L.leagueFeeCents, "league_fee",
                                     "League fee: " + team->name, state_.now);
    if (!tx) return tx.error();
    out["tx"] = tx.value();
    out["balance_cents"] = state_.ledger.balance(bankAccountOf(actor));
  }
  for (const auto& mate : leisureTeamMembers(teamId)) notify(mate, "sports", nameOf(*this, actor) + " joined the " + team->name + ".");
  c.leisureTeams.push_back(teamId);
  const GameMinutes next = leisureNextKickoff(*sport, state_.now);
  out["next_kickoff"] = next;
  out["next_kickoff_text"] = formatDateTime(next);
  out["venue"] = venue->name;
  notify(actor, "sports", "You're on the " + team->name + ". Matches are " + weekdayName(sport->matchWeekday) + "s at " +
                              hourText(sport->matchHour) + " at " + venue->name + ": be there at kickoff to play.");
  return out;
}

Result<Json> World::leaveTeam(const CharacterId& actor, const std::string& teamId) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  const LeisureTeamDef* team = content_->leisureTeam(teamId);
  if (!team && !contains(c.leisureTeams, teamId)) return fail("unknown_team", "no such team");
  const std::string name = team ? team->name : teamId;
  if (!contains(c.leisureTeams, teamId)) return fail("not_on_team", "you don't play for " + name);
  std::erase(c.leisureTeams, teamId);
  for (const auto& mate : leisureTeamMembers(teamId)) notify(mate, "sports", nameOf(*this, actor) + " left the " + name + ".");
  return Json{{"left", teamId}, {"name", name}};
}

// ---- Dates, hours and practice (hooks from buy and useActivity) -----------------------------
Json World::leisureDate(CharacterState& c, const LocationDef& place, const std::string& memory) {
  const LeisureConfig& L = content_->leisure();
  const std::int64_t today = state_.now / kMinutesPerDay;
  Json dates = Json::array();
  for (auto& [id, p] : state_.characters) {
    if (id == c.id || !p.online) continue;
    const LocationDef* at = currentPlace(p);
    if (!at || at->id != place.id) continue;
    // Only with a partner: not an ex, not a stranger, never family.
    if (!contains(L.dateStatuses, relationshipStatus(c.id, id)) || isFamily(c.id, id)) continue;
    const std::string key = coupleKey(c.id, id, place.id);
    auto it = state_.leisureDates.find(key);
    if (it != state_.leisureDates.end() && it->second == today) {
      dates.push_back(Json{{"with", id}, {"name", nameOf(*this, id)}, {"counted", false},
                           {"note", "you've already had a date at " + place.name + " today"}});
      continue;
    }
    state_.leisureDates[key] = today;
    for (const auto& [dim, delta] : L.dateRelationship) {
      adjustRelationship(c.id, id, dim, delta);
      adjustRelationship(id, c.id, dim, delta);
    }
    applyEmotions(c, L.dateEmotions);
    applyEmotions(p, L.dateEmotions);
    const std::string mine = memory + " with " + firstNameOf(*this, id);
    const std::string theirs = memory + " with " + firstNameOf(*this, c.id);
    for (const auto& [owner, about, info] : {std::tuple{c.id, id, mine}, std::tuple{id, c.id, theirs}}) {
      Memory m;
      m.id = nextId("mem");
      m.owner = owner;
      m.at = state_.now;
      m.participants = {c.id, id};
      m.location = place.id;
      m.type = "date";
      m.emotionalImpact = L.dateImpact;
      m.importance = L.dateImportance;
      m.about = about;
      m.info = info;
      addMemory(std::move(m));
    }
    notify(c.id, "romance", "That was a date: " + mine + ".");
    notify(id, "romance", "That was a date: " + theirs + ".");
    emit({id}, "date", Json{{"with", c.id}, {"place", place.id}, {"memory", theirs}});
    dates.push_back(Json{{"with", id}, {"name", nameOf(*this, id)}, {"counted", true}, {"memory", mine}});
  }
  return dates;
}

void World::leisureAfterPurchase(CharacterState& c, const LocationDef& place, const std::string& offer, Json& out) {
  for (const auto& spot : content_->leisure().dateSpots) {
    if (spot.place != place.id || spot.offer != offer) continue;
    Json dates = leisureDate(c, place, spot.memory);
    if (!dates.empty()) out["dates"] = dates;
    return;
  }
}

Result<Json> World::leisureActivity(CharacterState& c, const LocationDef& place, const Activity& act) {
  const LeisureConfig& L = content_->leisure();
  // Some things have their hours, even in a park that never closes.
  for (const auto& h : L.activityHours) {
    if (h.place == place.id && h.activity == act.id && !h.hours.isOpenAt(toDateTime(state_.now).hour))
      return fail("not_now", act.label + " is only from " + hourText(h.hours.openHour) + " to " + hourText(h.hours.closeHour));
  }
  Json out = Json::object();
  for (const auto& p : L.practice) {
    if (p.place != place.id || p.activity != act.id) continue;
    // A coach on shift here makes practice count for more.
    CharacterId coach;
    for (const auto& [id, o] : state_.characters) {
      if (id == c.id || !o.online || !o.career.shiftStartedAt || !contains(L.coachCareers, o.career.careerId)) continue;
      const LocationDef* at = currentPlace(o);
      if (at && at->id == place.id) {
        coach = id;
        break;
      }
    }
    Json skills = Json::object();
    for (const auto& [skill, base] : p.skills) {
      double& v = c.skills[skill];
      v = clampd(v + skillGain(v, base) * (coach.empty() ? 1.0 : 1.0 + L.coachedPracticeBonus), kStatMin, kStatMax);
      skills[skill] = std::round(v * 10) / 10;
    }
    out["skills"] = skills;
    if (!coach.empty()) out["coached_by"] = nameOf(*this, coach);
  }
  for (const auto& spot : L.dateSpots) {
    if (spot.place != place.id || spot.activity != act.id) continue;
    Json dates = leisureDate(c, place, spot.memory);
    if (!dates.empty()) out["dates"] = dates;
  }
  return out;
}

// ---- Matches -------------------------------------------------------------------------------
double World::leisurePlayerValue(const CharacterState& c) const {
  const LeisureConfig& L = content_->leisure();
  const auto skill = c.skills.find(L.skill);
  const auto energy = c.needs.find(L.energyNeed);
  const double fitness = clampd((energy == c.needs.end() ? 0 : energy->second) / kStatMax, 0, 1);
  const double factor = L.minEnergyFactor + (1.0 - L.minEnergyFactor) * fitness;
  return (L.playerBase + (skill == c.skills.end() ? 0 : skill->second) * L.skillWeight) * factor;
}

void World::leisureKickoff(const LeisureSportDef& sport, const std::string& home, const std::string& away) {
  const LeisureConfig& L = content_->leisure();
  for (const auto& m : state_.leisureMatches) {
    if (m.kickoff == state_.now && m.sport == sport.id && m.home == home && m.away == away) return;  // already under way
  }
  LeisureMatch m;
  m.id = nextId("match");
  m.sport = sport.id;
  m.home = home;
  m.away = away;
  m.kickoff = state_.now;
  m.endsAt = state_.now + sport.durationMinutes;
  // Members standing at the venue play, the best of them if more turn up than a side fields.
  auto lineup = [&](const std::string& team, std::vector<CharacterId>& players) {
    std::vector<std::pair<double, CharacterId>> present;
    for (const auto& [id, c] : state_.characters) {
      if (!c.online || !contains(c.leisureTeams, team)) continue;
      const LocationDef* at = currentPlace(c);
      if (at && at->id == sport.venue) present.emplace_back(leisurePlayerValue(c), id);
    }
    std::sort(present.begin(), present.end(), [](const auto& a, const auto& b) { return a.first != b.first ? a.first > b.first : a.second < b.second; });
    if (present.size() > static_cast<std::size_t>(sport.lineup)) present.resize(static_cast<std::size_t>(sport.lineup));
    const LeisureTeamDef* def = content_->leisureTeam(team);
    double strength = def ? def->strength : 0;
    for (const auto& [value, id] : present) {
      strength += value;
      players.push_back(id);
    }
    return strength + L.luck * roll();
  };
  m.homeStrength = lineup(home, m.homeLineup);
  m.awayStrength = lineup(away, m.awayLineup);
  const LocationDef* venue = content_->location(sport.venue);
  const std::string fixture = teamName(*content_, home) + " vs " + teamName(*content_, away);
  for (const auto& side : {std::pair{&m.homeLineup, home}, std::pair{&m.awayLineup, away}}) {
    for (const auto& id : *side.first)
      notify(id, "sports", "Kickoff at " + venue->name + ": " + fixture + ". You're playing for the " + teamName(*content_, side.second) + ".");
  }
  std::vector<CharacterId> there;
  for (const auto& [id, c] : state_.characters) {
    const LocationDef* at = c.online ? currentPlace(c) : nullptr;
    if (at && at->id == sport.venue) there.push_back(id);
  }
  Json event = matchJson(*this, m);
  event["status"] = "kickoff";
  if (!there.empty()) emit(there, "match", event);
  state_.leisureMatches.push_back(std::move(m));
}

void World::leisureFinish(LeisureMatch& m) {
  m.finished = true;
  const LeisureConfig& L = content_->leisure();
  const LeisureSportDef* sport = content_->leisureSport(m.sport);
  const LeisureTeamDef* home = content_->leisureTeam(m.home);
  const LeisureTeamDef* away = content_->leisureTeam(m.away);
  if (!sport || !home || !away) return;  // taken out of content mid-match: void, dropped by the hourly step

  // The score follows the strengths: an even match scores about perTeam each; an edge moves it.
  const double total = std::max(1e-9, m.homeStrength + m.awayStrength);
  const double homeShare = m.homeStrength / total;
  auto expected = [&](double share, double fraction) {
    return std::max(0.0, sport->perTeam * fraction * (1.0 + sport->sensitivity * (2.0 * share - 1.0)));
  };
  auto score = [&](double mean, double fraction) {
    double v = std::round(mean);
    if (sport->noise > 0 && sport->scoring == "goals") {
      // Goals are rare events: Poisson around the expected count.
      const double limit = std::exp(-mean);
      double p = 1;
      int k = 0;
      do {
        ++k;
        p *= roll();
      } while (p > limit && k <= sport->maxScore);
      v = k - 1;
    } else if (sport->noise > 0) {
      const double u = 1.0 - roll();
      const double z = std::sqrt(-2.0 * std::log(u)) * std::cos(2.0 * std::numbers::pi * roll());
      v = std::round(mean + sport->noise * std::sqrt(fraction) * z);
    }
    return static_cast<int>(clampd(v, 0, sport->maxScore));
  };
  m.homeScore = score(expected(homeShare, 1), 1);
  m.awayScore = score(expected(1 - homeShare, 1), 1);
  if (!sport->draws && m.homeScore == m.awayScore) {
    m.overtime = true;
    const double f = sport->overtimeFraction;
    for (int period = 0; period < kMaxOvertimes && m.homeScore == m.awayScore; ++period) {
      m.homeScore += score(expected(homeShare, f), f);
      m.awayScore += score(expected(1 - homeShare, f), f);
    }
    if (m.homeScore == m.awayScore) (roll() < homeShare ? m.homeScore : m.awayScore) += 1;  // a last free throw
  }

  // The table.
  LeisureStanding& H = state_.leisureStandings[m.home];
  LeisureStanding& A = state_.leisureStandings[m.away];
  for (auto [us, mine, theirs] : {std::tuple{&H, m.homeScore, m.awayScore}, std::tuple{&A, m.awayScore, m.homeScore}}) {
    us->played += 1;
    us->scored += mine;
    us->conceded += theirs;
    if (mine > theirs) {
      us->won += 1;
      us->points += sport->pointsWin;
    } else if (mine < theirs) {
      us->lost += 1;
      us->points += sport->pointsLoss;
    } else {
      us->drawn += 1;
      us->points += sport->pointsDraw;
    }
  }

  // Players who saw it through get the game; spectators get the show; members hear the result.
  const LocationDef* venue = content_->location(sport->venue);
  const std::string scoreline = home->name + " " + std::to_string(m.homeScore) + "-" + std::to_string(m.awayScore) + " " +
                                away->name + (m.overtime ? " (after overtime)" : "");
  auto atVenue = [&](const CharacterState& c) {
    const LocationDef* at = c.online ? currentPlace(c) : nullptr;
    return at && at->id == sport->venue;
  };
  std::set<CharacterId> told;
  std::set<CharacterId> players;
  for (const auto& [lineup, team, mine, theirs] : {std::tuple{&m.homeLineup, home, m.homeScore, m.awayScore},
                                                   std::tuple{&m.awayLineup, away, m.awayScore, m.homeScore}}) {
    const bool won = mine > theirs;
    const bool drew = mine == theirs;
    for (const auto& id : *lineup) {
      players.insert(id);
      CharacterState* c = mutableCharacter(id);
      if (!c) continue;
      told.insert(id);
      if (!atVenue(*c)) {
        notify(id, "sports", "Full time: " + scoreline + ". You left before the final whistle, so the game doesn't count for you.");
        continue;
      }
      applyNeeds(*c, L.playerNeeds);
      c->caloriesOut += L.playerCalories;
      double& skill = c->skills[L.skill];
      skill = clampd(skill + skillGain(skill, L.matchSkillGain), kStatMin, kStatMax);
      addFame(*c, won ? L.fameWin : drew ? L.fameDraw : L.fameLoss);
      applyEmotions(*c, won ? L.winEmotions : drew ? L.drawEmotions : L.lossEmotions);
      c->leisureMatchesPlayed += 1;
      if (won) c->leisureMatchesWon += 1;
      Memory mem;
      mem.id = nextId("mem");
      mem.owner = id;
      mem.at = state_.now;
      mem.participants = m.homeLineup;
      mem.participants.insert(mem.participants.end(), m.awayLineup.begin(), m.awayLineup.end());
      mem.location = sport->venue;
      mem.type = "match";
      mem.importance = won ? 50 : 40;
      mem.emotionalImpact = won ? 35 : drew ? 10 : -15;
      mem.isPublic = true;
      mem.info = "Played " + sport->name + " for the " + team->name + ": " + scoreline;
      addMemory(std::move(mem));
      notify(id, "sports", "Full time: " + scoreline + ". " + (won ? "You won!" : drew ? "A draw." : "You lost this one."));
    }
  }
  std::vector<CharacterId> recipients(players.begin(), players.end());
  for (auto& [id, c] : state_.characters) {
    if (players.count(id) || !atVenue(c)) continue;
    applyEmotions(c, L.spectatorEmotions);
    applyNeeds(c, L.spectatorNeeds);
    notify(id, "sports", "Full time at " + venue->name + ": " + scoreline + ".");
    told.insert(id);
    recipients.push_back(id);
  }
  for (const auto& team : {m.home, m.away}) {
    for (const auto& id : leisureTeamMembers(team)) {
      if (!told.insert(id).second) continue;
      notify(id, "sports", "Your team played: " + scoreline + ".");
      recipients.push_back(id);
    }
  }
  Json event = matchJson(*this, m);
  event["status"] = "full_time";
  if (!recipients.empty()) emit(recipients, "match", event);
}

void World::stepLeisureHourly() {
  const LeisureConfig& L = content_->leisure();
  // Full time.
  for (auto& m : state_.leisureMatches) {
    if (!m.finished && state_.now >= m.endsAt) leisureFinish(m);
  }
  // Kickoffs, and a reminder to the teams an hour before.
  const DateTime d = toDateTime(state_.now);
  for (const auto& sport : L.sports) {
    if (d.weekday == sport.matchWeekday && d.hour == sport.matchHour && d.minute == 0) {
      for (const auto& [home, away] : leisureFixtures(sport, d.dayIndex / kDaysPerWeek)) leisureKickoff(sport, home, away);
    }
    const GameMinutes next = leisureNextKickoff(sport, state_.now);
    if (next - state_.now == kMinutesPerHour) {
      const LocationDef* venue = content_->location(sport.venue);
      for (const auto& [home, away] : leisureFixtures(sport, next / kMinutesPerDay / kDaysPerWeek)) {
        const std::string fixture = teamName(*content_, home) + " vs " + teamName(*content_, away);
        for (const auto& team : {home, away}) {
          for (const auto& id : leisureTeamMembers(team))
            notify(id, "sports", "Kickoff in an hour: " + fixture + " at " + venue->name + ". Be there to play.");
        }
      }
    }
  }
  // Keep the matches in play and the latest results; forget void matches and old dates.
  std::erase_if(state_.leisureMatches, [&](const LeisureMatch& m) {
    return !content_->leisureSport(m.sport) || !content_->leisureTeam(m.home) || !content_->leisureTeam(m.away);
  });
  auto finished = static_cast<int>(std::count_if(state_.leisureMatches.begin(), state_.leisureMatches.end(),
                                                 [](const LeisureMatch& m) { return m.finished; }));
  for (auto it = state_.leisureMatches.begin(); it != state_.leisureMatches.end() && finished > L.resultsKept;) {
    if (it->finished) {
      it = state_.leisureMatches.erase(it);
      --finished;
    } else {
      ++it;
    }
  }
  std::erase_if(state_.leisureDates, [&](const auto& kv) { return kv.second < d.dayIndex; });
}

// ---- Phone ---------------------------------------------------------------------------------
Json World::phoneSports(const CharacterState& c) const {
  const LeisureConfig& L = content_->leisure();
  const ContentDatabase& db = *content_;
  Json sports = Json::array();
  for (const auto& sport : L.sports) {
    const LocationDef* venue = db.location(sport.venue);
    Json teams = Json::array();
    std::vector<std::pair<const LeisureTeamDef*, LeisureStanding>> rows;
    for (const auto& t : L.teams) {
      if (t.sport != sport.id) continue;
      Json members = Json::array();  // names only: a roster is public, nothing else about them is
      for (const auto& id : leisureTeamMembers(t.id)) members.push_back(nameOf(*this, id));
      teams.push_back(Json{{"id", t.id}, {"name", t.name}, {"members", members}});
      auto it = state_.leisureStandings.find(t.id);
      rows.emplace_back(&t, it == state_.leisureStandings.end() ? LeisureStanding{} : it->second);
    }
    std::stable_sort(rows.begin(), rows.end(), [](const auto& a, const auto& b) {
      if (a.second.points != b.second.points) return a.second.points > b.second.points;
      const int diffA = a.second.scored - a.second.conceded;
      const int diffB = b.second.scored - b.second.conceded;
      if (diffA != diffB) return diffA > diffB;
      return a.second.scored > b.second.scored;
    });
    Json table = Json::array();
    for (const auto& [t, s] : rows) {
      Json row = standingJson(s);
      row["team"] = t->id;
      row["name"] = t->name;
      table.push_back(row);
    }
    const GameMinutes next = leisureNextKickoff(sport, state_.now);
    Json fixtures = Json::array();
    for (const auto& [home, away] : leisureFixtures(sport, next / kMinutesPerDay / kDaysPerWeek))
      fixtures.push_back(Json{{"home", home}, {"home_name", teamName(db, home)}, {"away", away}, {"away_name", teamName(db, away)}});
    sports.push_back(Json{{"id", sport.id},
                          {"name", sport.name},
                          {"venue", sport.venue},
                          {"venue_name", venue ? venue->name : ""},
                          {"match_day", weekdayName(sport.matchWeekday)},
                          {"match_hour", sport.matchHour},
                          {"duration_minutes", sport.durationMinutes},
                          {"teams", teams},
                          {"table", table},
                          {"next", Json{{"kickoff", next}, {"when", formatDateTime(next)}, {"fixtures", fixtures}}}});
  }
  Json mine = Json::array();
  for (const auto& id : c.leisureTeams) {
    const LeisureTeamDef* t = db.leisureTeam(id);
    const LeisureSportDef* sport = t ? db.leisureSport(t->sport) : nullptr;
    if (!sport) continue;
    const GameMinutes next = leisureNextKickoff(*sport, state_.now);
    std::string opponent;
    for (const auto& [home, away] : leisureFixtures(*sport, next / kMinutesPerDay / kDaysPerWeek)) {
      if (home == id) opponent = away;
      if (away == id) opponent = home;
    }
    const LocationDef* venue = db.location(sport->venue);
    mine.push_back(Json{{"id", id},
                        {"name", t->name},
                        {"sport", sport->name},
                        {"venue", venue ? venue->name : ""},
                        {"next_kickoff", next},
                        {"when", formatDateTime(next)},
                        {"opponent", opponent.empty() ? "" : teamName(db, opponent)}});
  }
  Json inPlay = Json::array();
  Json results = Json::array();
  for (auto it = state_.leisureMatches.rbegin(); it != state_.leisureMatches.rend(); ++it)
    (it->finished ? results : inPlay).push_back(matchJson(*this, *it));
  const auto skill = c.skills.find(L.skill);
  const LocationDef* clubhouse = db.location(L.clubhouse);
  return Json{{"sports", sports},
              {"your_teams", mine},
              {"in_play", inPlay},
              {"results", results},
              {"you", Json{{L.skill, skill == c.skills.end() ? 0.0 : std::round(skill->second * 10) / 10},
                           {"matches_played", c.leisureMatchesPlayed},
                           {"matches_won", c.leisureMatchesWon}}},
              {"league", Json{{"fee_cents", L.leagueFeeCents}, {"sign_up_at", clubhouse ? clubhouse->name : ""}}}};
}

// ---- Save ----------------------------------------------------------------------------------
Json leisurePartToJson(const WorldState& s) {
  Json standings = Json::object();
  for (const auto& [id, row] : s.leisureStandings) standings[id] = standingJson(row);
  Json matches = Json::array();
  for (const auto& m : s.leisureMatches) {
    matches.push_back(Json{{"id", m.id},
                           {"sport", m.sport},
                           {"home", m.home},
                           {"away", m.away},
                           {"kickoff", m.kickoff},
                           {"ends_at", m.endsAt},
                           {"home_lineup", m.homeLineup},
                           {"away_lineup", m.awayLineup},
                           {"home_strength", m.homeStrength},
                           {"away_strength", m.awayStrength},
                           {"finished", m.finished},
                           {"home_score", m.homeScore},
                           {"away_score", m.awayScore},
                           {"overtime", m.overtime}});
  }
  Json dates = Json::object();
  for (const auto& [key, day] : s.leisureDates) dates[key] = day;
  return Json{{"standings", standings}, {"matches", matches}, {"dates", dates}};
}

void leisurePartFromJson(WorldState& s, const Json& j) {
  s.leisureStandings.clear();
  s.leisureMatches.clear();
  s.leisureDates.clear();
  if (!j.is_object()) return;
  // Bound to locals: items() of a temporary would dangle inside the loop.
  const Json standings = j.value("standings", Json::object());
  const Json matches = j.value("matches", Json::array());
  const Json dates = j.value("dates", Json::object());
  for (const auto& [id, r] : standings.items()) {
    LeisureStanding row;
    row.played = r.value("played", 0);
    row.won = r.value("won", 0);
    row.drawn = r.value("drawn", 0);
    row.lost = r.value("lost", 0);
    row.scored = r.value("for", 0);
    row.conceded = r.value("against", 0);
    row.points = r.value("points", 0);
    s.leisureStandings[id] = row;
  }
  for (const auto& x : matches) {
    LeisureMatch m;
    m.id = x.value("id", "");
    m.sport = x.value("sport", "");
    m.home = x.value("home", "");
    m.away = x.value("away", "");
    m.kickoff = x.value("kickoff", GameMinutes{0});
    m.endsAt = x.value("ends_at", GameMinutes{0});
    m.homeLineup = x.value("home_lineup", std::vector<CharacterId>{});
    m.awayLineup = x.value("away_lineup", std::vector<CharacterId>{});
    m.homeStrength = x.value("home_strength", 0.0);
    m.awayStrength = x.value("away_strength", 0.0);
    m.finished = x.value("finished", false);
    m.homeScore = x.value("home_score", 0);
    m.awayScore = x.value("away_score", 0);
    m.overtime = x.value("overtime", false);
    s.leisureMatches.push_back(std::move(m));
  }
  for (const auto& [key, day] : dates.items()) s.leisureDates[key] = day.get<std::int64_t>();
}

void writeLeisureCharacter(const CharacterState& c, Json& j) {
  j["leisure"] = Json{{"teams", c.leisureTeams}, {"matches_played", c.leisureMatchesPlayed}, {"matches_won", c.leisureMatchesWon}};
}

void readLeisureCharacter(CharacterState& c, const Json& j) {
  if (!j.contains("leisure") || !j.at("leisure").is_object()) return;
  const Json& l = j.at("leisure");
  c.leisureTeams = l.value("teams", std::vector<std::string>{});
  c.leisureMatchesPlayed = l.value("matches_played", 0);
  c.leisureMatchesWon = l.value("matches_won", 0);
}

}  // namespace livera
