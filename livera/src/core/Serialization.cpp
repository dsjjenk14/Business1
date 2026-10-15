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
         {"rent_arrears_cents", c.rentArrearsCents}};
  Json career{{"career_id", c.career.careerId},
              {"level", c.career.level},
              {"hours_at_level", c.career.hoursAtLevel},
              {"performance", c.career.performance},
              {"lifetime_earnings_cents", c.career.lifetimeEarningsCents}};
  j["career"] = career;
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
  const Json& career = j.at("career");
  c.career.careerId = career.at("career_id").get<std::string>();
  c.career.level = career.at("level").get<int>();
  c.career.hoursAtLevel = career.at("hours_at_level").get<double>();
  c.career.performance = career.at("performance").get<double>();
  c.career.lifetimeEarningsCents = career.at("lifetime_earnings_cents").get<Cents>();
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
