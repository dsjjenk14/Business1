#include "core/Serialization.h"

#include <stdexcept>

namespace livera {

Json toJson(const CharacterState& c) {
  Json j{{"id", c.id},
         {"position", {c.position.x, c.position.y}},
         {"inside", c.inside},
         {"needs", c.needs},
         {"emotions", c.emotions},
         {"last_simulated_at", c.lastSimulatedAt},
         {"rent_arrears_cents", c.rentArrearsCents},
         {"skills", c.skills}};
  Json career{{"career_id", c.career.careerId},
              {"level", c.career.level},
              {"hours_at_level", c.career.hoursAtLevel},
              {"performance", c.career.performance},
              {"lifetime_earnings_cents", c.career.lifetimeEarningsCents}};
  j["career"] = career;
  Json conditions = Json::array();
  for (const auto& k : c.conditions)
    conditions.push_back(Json{{"id", k.id}, {"since", k.since}, {"until", k.until}, {"diagnosed", k.diagnosed}, {"recovery", k.recovery}});
  j["body"] = Json{{"born_at", c.bornAt},
                   {"last_birthday_age", c.lastBirthdayAge},
                   {"height_cm", c.heightCm},
                   {"weight_kg", c.weightKg},
                   {"calories_in", c.caloriesIn},
                   {"calories_out", c.caloriesOut}};
  j["conditions"] = conditions;
  j["last_online_at"] = c.lastOnlineAt;
  // Online state, move targets and in-progress shifts are session state: a saved
  // character always loads offline, standing still, off shift (shifts are settled on logout).
  return j;
}

CharacterState characterStateFromJson(const Json& j) {
  CharacterState c;
  c.id = j.at("id").get<std::string>();
  c.position = Vec2{j.at("position").at(0).get<double>(), j.at("position").at(1).get<double>()};
  c.inside = j.value("inside", "");
  c.needs = j.at("needs").get<StatMap>();
  c.emotions = j.at("emotions").get<StatMap>();
  c.lastSimulatedAt = j.at("last_simulated_at").get<GameMinutes>();
  c.rentArrearsCents = j.value("rent_arrears_cents", Cents{0});
  c.skills = j.value("skills", StatMap{});
  const Json& career = j.at("career");
  c.career.careerId = career.at("career_id").get<std::string>();
  c.career.level = career.at("level").get<int>();
  c.career.hoursAtLevel = career.at("hours_at_level").get<double>();
  c.career.performance = career.at("performance").get<double>();
  c.career.lifetimeEarningsCents = career.at("lifetime_earnings_cents").get<Cents>();
  // Saves from before the life update have no body yet; World fills it in from the definition.
  if (j.contains("body")) {
    const Json& b = j.at("body");
    c.bornAt = b.value("born_at", GameMinutes{0});
    c.lastBirthdayAge = b.value("last_birthday_age", 0);
    c.heightCm = b.value("height_cm", 170.0);
    c.weightKg = b.value("weight_kg", 0.0);
    c.caloriesIn = b.value("calories_in", 0.0);
    c.caloriesOut = b.value("calories_out", 0.0);
  }
  for (const auto& k : j.value("conditions", Json::array())) {
    c.conditions.push_back(ConditionState{k.at("id").get<std::string>(), k.at("since").get<GameMinutes>(),
                                          k.at("until").get<GameMinutes>(), k.value("diagnosed", false),
                                          k.value("recovery", 0.0)});
  }
  c.lastOnlineAt = j.value("last_online_at", GameMinutes{-1});
  return c;
}

Json toJson(const RelationshipState& r) {
  return Json{{"dimensions", r.dimensions},
              {"first_met_at", r.firstMetAt},
              {"last_interaction_at", r.lastInteractionAt},
              {"interaction_count", r.interactionCount}};
}

RelationshipState relationshipStateFromJson(const Json& j) {
  RelationshipState r;
  r.dimensions = j.at("dimensions").get<StatMap>();
  r.firstMetAt = j.at("first_met_at").get<GameMinutes>();
  r.lastInteractionAt = j.at("last_interaction_at").get<GameMinutes>();
  r.interactionCount = j.at("interaction_count").get<int>();
  return r;
}

Json toJson(const Memory& m) {
  return Json{{"id", m.id},
              {"owner", m.owner},
              {"at", m.at},
              {"participants", m.participants},
              {"location", m.location},
              {"type", m.type},
              {"emotional_impact", m.emotionalImpact},
              {"importance", m.importance},
              {"about", m.about},
              {"info", m.info},
              {"public", m.isPublic}};
}

Memory memoryFromJson(const Json& j) {
  Memory m;
  m.id = j.at("id").get<std::string>();
  m.owner = j.at("owner").get<std::string>();
  m.at = j.at("at").get<GameMinutes>();
  m.participants = j.at("participants").get<std::vector<std::string>>();
  m.location = j.value("location", "");
  m.type = j.at("type").get<std::string>();
  m.emotionalImpact = j.at("emotional_impact").get<int>();
  m.importance = j.at("importance").get<int>();
  m.about = j.value("about", "");
  m.info = j.value("info", "");
  m.isPublic = j.value("public", false);
  return m;
}

Json toJson(const Song& s) {
  Json tracks = Json::array();
  for (const auto& t : s.tracks) {
    Json notes = Json::array();
    for (const auto& n : t.notes) notes.push_back({n.step, n.pitch, n.length, n.velocity});
    tracks.push_back(Json{{"instrument", t.instrument}, {"notes", notes}});
  }
  return Json{{"id", s.id},       {"owner", s.owner},         {"title", s.title},       {"bpm", s.bpm},
              {"tracks", tracks}, {"created_at", s.createdAt}, {"updated_at", s.updatedAt}, {"released", s.released},
              {"plays", s.plays}};
}

Song songFromJson(const Json& j) {
  Song s;
  s.id = j.at("id").get<std::string>();
  s.owner = j.at("owner").get<std::string>();
  s.title = j.at("title").get<std::string>();
  s.bpm = j.at("bpm").get<int>();
  for (const auto& t : j.at("tracks")) {
    SongTrack track;
    track.instrument = t.at("instrument").get<std::string>();
    for (const auto& n : t.at("notes"))
      track.notes.push_back(Note{n.at(0).get<int>(), n.at(1).get<int>(), n.at(2).get<int>(), n.at(3).get<int>()});
    s.tracks.push_back(std::move(track));
  }
  s.createdAt = j.at("created_at").get<GameMinutes>();
  s.updatedAt = j.at("updated_at").get<GameMinutes>();
  s.released = j.at("released").get<bool>();
  s.plays = j.at("plays").get<int>();
  return s;
}

Json toJson(const CharacterDef& c) {
  Json relationships = Json::array();
  for (const auto& r : c.relationships)
    relationships.push_back(Json{{"to", r.to}, {"dimensions", r.dimensions}, {"history", r.history}});
  return Json{{"id", c.id},
              {"first_name", c.firstName},
              {"last_name", c.lastName},
              {"pronouns", c.pronouns},
              {"gender", c.gender},
              {"age", c.age},
              {"playable", c.playable},
              {"personality", c.personality},
              {"values", c.values},
              {"traits", c.traits},
              {"interests", c.interests},
              {"skills", c.skills},
              {"career", {{"id", c.careerId}, {"level", c.careerLevel}}},
              {"finances", {{"cash_cents", c.startingCashCents}, {"bank_cents", c.startingBankCents}}},
              {"home", {{"property", c.homeProperty}}},
              {"spawn_location", c.spawnLocation},
              {"relationships", relationships},
              {"profile", c.profile}};
}

const char* toString(ConstructionStatus s) {
  switch (s) {
    case ConstructionStatus::Planned: return "planned";
    case ConstructionStatus::Active: return "active";
    case ConstructionStatus::Complete: return "complete";
  }
  return "planned";
}

ConstructionStatus constructionStatusFromString(const std::string& s) {
  if (s == "planned") return ConstructionStatus::Planned;
  if (s == "active") return ConstructionStatus::Active;
  if (s == "complete") return ConstructionStatus::Complete;
  throw std::invalid_argument("unknown construction status " + s);
}

}  // namespace livera
