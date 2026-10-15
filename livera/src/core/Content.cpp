#include "core/Content.h"

#include <algorithm>
#include <fstream>
#include <set>

namespace livera {

namespace {

StatMap readStats(const Json& j, const char* key) {
  StatMap out;
  if (!j.contains(key)) return out;
  for (const auto& [k, v] : j.at(key).items()) out[k] = v.get<double>();
  return out;
}

std::vector<std::string> readStrings(const Json& j, const char* key) {
  if (!j.contains(key)) return {};
  return j.at(key).get<std::vector<std::string>>();
}

Vec2 readVec2(const Json& j) { return Vec2{j.at(0).get<double>(), j.at(1).get<double>()}; }

AccessRule readAccess(const std::string& s) {
  if (s == "public") return AccessRule::Public;
  if (s == "residents") return AccessRule::Residents;
  if (s == "staff") return AccessRule::Staff;
  throw std::invalid_argument("unknown access rule '" + s + "'");
}

CreatorChoice readChoice(const Json& j) {
  CreatorChoice c;
  if (j.is_array()) {
    c.options = j.get<std::vector<std::string>>();
    return c;
  }
  c.options = j.at("options").get<std::vector<std::string>>();
  c.min = j.value("min", 1);
  c.max = j.value("max", 1);
  c.allowCustom = j.value("allow_custom", false);
  return c;
}

Offer readOffer(const Json& j) {
  Offer o;
  o.id = j.at("id").get<std::string>();
  o.label = j.at("label").get<std::string>();
  o.priceCents = j.at("price_cents").get<Cents>();
  o.needEffects = readStats(j, "needs");
  o.emotionEffects = readStats(j, "emotions");
  return o;
}

template <class Map>
Status insertUnique(Map& map, const std::string& kind, const std::string& id, typename Map::mapped_type value) {
  if (map.count(id)) return fail("content_duplicate", "duplicate " + kind + " id '" + id + "'");
  map.emplace(id, std::move(value));
  return okStatus();
}

Status checkKeys(const StatMap& stats, const std::set<std::string>& allowed, const std::string& where) {
  for (const auto& [k, v] : stats) {
    if (!allowed.count(k)) return fail("content_invalid", where + ": unknown stat '" + k + "'");
  }
  return okStatus();
}

}  // namespace

Result<std::shared_ptr<const ContentDatabase>> ContentDatabase::loadFromDirectory(const std::filesystem::path& dir) {
  namespace fs = std::filesystem;
  std::error_code ec;
  if (!fs::is_directory(dir, ec)) return fail("content_missing", "content directory not found: " + dir.string());
  std::vector<fs::path> files;
  for (const auto& entry : fs::recursive_directory_iterator(dir)) {
    if (entry.is_regular_file() && entry.path().extension() == ".json") files.push_back(entry.path());
  }
  std::sort(files.begin(), files.end());
  std::vector<std::pair<std::string, Json>> docs;
  for (const auto& path : files) {
    std::ifstream in(path);
    Json doc = Json::parse(in, nullptr, /*allow_exceptions=*/false, /*ignore_comments=*/true);
    if (doc.is_discarded()) return fail("content_parse", "invalid JSON in " + path.string());
    docs.emplace_back(fs::relative(path, dir).string(), std::move(doc));
  }
  return loadFromDocuments(docs);
}

Result<std::shared_ptr<const ContentDatabase>> ContentDatabase::loadFromDocuments(
    const std::vector<std::pair<std::string, Json>>& docs) {
  auto db = std::make_shared<ContentDatabase>();
  for (const auto& [source, doc] : docs) {
    Status s = db->ingest(source, doc);
    if (!s) return s.error();
  }
  Status v = db->validate();
  if (!v) return v.error();
  return std::shared_ptr<const ContentDatabase>(std::move(db));
}

Result<CharacterDef> ContentDatabase::parseCharacter(const Json& j) {
  try {
    CharacterDef c;
    c.id = j.at("id").get<std::string>();
    c.firstName = j.at("first_name").get<std::string>();
    c.lastName = j.at("last_name").get<std::string>();
    c.pronouns = j.at("pronouns").get<std::string>();
    c.gender = j.value("gender", "");
    c.age = j.at("age").get<int>();
    c.playable = j.value("playable", false);
    c.personality = readStats(j, "personality");
    c.values = readStats(j, "values");
    c.traits = readStrings(j, "traits");
    c.interests = readStrings(j, "interests");
    c.skills = readStats(j, "skills");
    c.careerId = j.at("career").at("id").get<std::string>();
    c.careerLevel = j.at("career").value("level", 0);
    c.startingCashCents = j.at("finances").at("cash_cents").get<Cents>();
    c.startingBankCents = j.at("finances").at("bank_cents").get<Cents>();
    c.homeProperty = j.at("home").at("property").get<std::string>();
    c.spawnLocation = j.at("spawn_location").get<std::string>();
    if (j.contains("relationships")) {
      for (const auto& r : j.at("relationships")) {
        c.relationships.push_back(
            StartingRelationship{r.at("to").get<std::string>(), readStats(r, "dimensions"), r.value("history", "")});
      }
    }
    if (j.contains("memories")) {
      for (const auto& m : j.at("memories")) {
        SeedMemory sm;
        sm.type = m.at("type").get<std::string>();
        sm.participants = readStrings(m, "participants");
        sm.about = m.value("about", "");
        sm.emotionalImpact = m.value("emotional_impact", 0);
        sm.importance = m.value("importance", 0);
        sm.isPublic = m.value("public", false);
        sm.info = m.value("info", "");
        sm.daysAgo = m.value("days_ago", 0);
        c.memories.push_back(std::move(sm));
      }
    }
    c.profile = j.value("profile", Json::object());
    return c;
  } catch (const std::exception& e) {
    return fail("content_invalid", std::string("character: ") + e.what());
  }
}

Status ContentDatabase::ingest(const std::string& source, const Json& doc) {
  try {
    if (!doc.is_object()) return fail("content_invalid", source + ": top level must be an object");
    for (const auto& [section, body] : doc.items()) {
      if (section == "$comment") continue;
      if (section == "simulation") {
        if (haveSim_) return fail("content_duplicate", source + ": 'simulation' defined twice");
        haveSim_ = true;
        auto& s = sim_;
        s.minutesPerRealSecond = body.value("minutes_per_real_second", s.minutesPerRealSecond);
        s.startMinute = body.value("start_minute", s.startMinute);
        s.walkSpeedMetersPerSecond = body.value("walk_speed_mps", s.walkSpeedMetersPerSecond);
        s.entryRadiusMeters = body.value("entry_radius_m", s.entryRadiusMeters);
        s.worldMin = readVec2(body.at("world_bounds").at("min"));
        s.worldMax = readVec2(body.at("world_bounds").at("max"));
        for (const auto& n : body.at("needs")) {
          s.needs.push_back(NeedDef{n.at("id").get<std::string>(), n.at("decay_per_hour").get<double>(),
                                    n.value("initial", 75.0)});
        }
        s.emotions = readStrings(body, "emotions");
        s.emotionBaselines = readStats(body, "emotion_baselines");
        s.emotionRelaxPerHour = body.value("emotion_relax_per_hour", s.emotionRelaxPerHour);
        s.personalityTraits = readStrings(body, "personality_traits");
        s.values = readStrings(body, "values");
        s.relationshipDimensions = readStrings(body, "relationship_dimensions");
        s.offlineNeedTarget = body.value("offline_need_target", s.offlineNeedTarget);
        s.memoryImportanceThreshold = body.value("memory_importance_threshold", s.memoryImportanceThreshold);
        s.maxMessageLength = body.value("max_message_length", s.maxMessageLength);
        s.skills = readStrings(body, "skills");
        s.hearingRangeMeters = body.value("hearing_range_m", s.hearingRangeMeters);
        s.shoutRangeMeters = body.value("shout_range_m", s.shoutRangeMeters);
        s.whisperRangeMeters = body.value("whisper_range_m", s.whisperRangeMeters);
        s.maxSpeechLength = body.value("max_speech_length", s.maxSpeechLength);
      } else if (section == "locations") {
        for (const auto& j : body) {
          LocationDef l;
          l.id = j.at("id").get<std::string>();
          l.name = j.at("name").get<std::string>();
          l.type = j.at("type").get<std::string>();
          l.district = j.value("district", "");
          l.description = j.value("description", "");
          l.door = readVec2(j.at("door"));
          l.enterable = j.value("enterable", true);
          l.access = readAccess(j.value("access", "public"));
          if (j.contains("hours")) l.hours = OpeningHours{j.at("hours").at(0).get<int>(), j.at("hours").at(1).get<int>()};
          if (j.contains("offers")) {
            for (const auto& o : j.at("offers")) l.offers.push_back(readOffer(o));
          }
          if (j.contains("activities")) {
            for (const auto& a : j.at("activities")) {
              l.activities.push_back(Activity{a.at("id").get<std::string>(), a.at("label").get<std::string>(),
                                              a.value("cooldown_minutes", 30), readStats(a, "needs"),
                                              readStats(a, "emotions")});
            }
          }
          l.outdoorRadius = j.value("outdoor_radius_m", l.outdoorRadius);
          l.revenueAccount = j.value("revenue_account", "");
          l.constructionProject = j.value("construction_project", "");
          l.stage = j.value("stage", false);
          if (auto s = insertUnique(locations_, "location", l.id, l); !s) return s;
        }
      } else if (section == "properties") {
        for (const auto& j : body) {
          PropertyDef p;
          p.id = j.at("id").get<std::string>();
          p.location = j.at("location").get<std::string>();
          p.type = j.at("type").get<std::string>();
          p.ownerAccount = j.at("owner_account").get<std::string>();
          p.rentMonthlyCents = j.value("rent_monthly_cents", Cents{0});
          p.marketValueCents = j.value("market_value_cents", Cents{0});
          p.bedrooms = j.value("bedrooms", 0);
          p.amenities = readStrings(j, "amenities");
          p.tier = j.value("tier", "");
          if (auto s = insertUnique(properties_, "property", p.id, p); !s) return s;
        }
      } else if (section == "careers") {
        for (const auto& j : body) {
          CareerDef c;
          c.id = j.at("id").get<std::string>();
          c.name = j.at("name").get<std::string>();
          c.workplaces = readStrings(j, "workplaces");
          c.employerAccount = j.at("employer_account").get<std::string>();
          for (const auto& lv : j.at("levels")) {
            c.levels.push_back(CareerLevel{lv.at("title").get<std::string>(), lv.at("hourly_cents").get<Cents>(),
                                           lv.value("hours_to_promote", 0.0), lv.value("min_performance", 0.0)});
          }
          c.needCostPerHour = readStats(j, "need_cost_per_hour");
          c.maxShiftHours = j.value("max_shift_hours", c.maxShiftHours);
          c.minPaidMinutes = j.value("min_paid_minutes", c.minPaidMinutes);
          c.entryLevel = j.value("entry_level", false);
          if (auto s = insertUnique(careers_, "career", c.id, c); !s) return s;
        }
      } else if (section == "interactions") {
        for (const auto& j : body) {
          InteractionDef d;
          d.id = j.at("id").get<std::string>();
          d.label = j.at("label").get<std::string>();
          d.rangeMeters = j.value("range_m", d.rangeMeters);
          d.actorNeeds = readStats(j, "actor_needs");
          d.targetNeeds = readStats(j, "target_needs");
          d.actorEmotions = readStats(j, "actor_emotions");
          d.targetEmotions = readStats(j, "target_emotions");
          d.actorToTarget = readStats(j, "actor_to_target");
          d.targetToActor = readStats(j, "target_to_actor");
          d.receptivityTrait = j.value("receptivity_trait", "");
          d.memoryType = j.value("memory_type", d.id);
          d.importance = j.value("importance", 0);
          d.emotionalImpact = j.value("emotional_impact", 0);
          if (auto s = insertUnique(interactions_, "interaction", d.id, d); !s) return s;
        }
      } else if (section == "characters") {
        for (const auto& j : body) {
          auto parsed = parseCharacter(j);
          if (!parsed) return fail("content_invalid", source + ": " + parsed.error().message);
          CharacterDef c = std::move(parsed).value();
          if (auto s = insertUnique(characters_, "character", c.id, c); !s) return s;
        }
      } else if (section == "construction_projects") {
        for (const auto& j : body) {
          ConstructionProjectDef p;
          p.id = j.at("id").get<std::string>();
          p.name = j.at("name").get<std::string>();
          p.site = j.at("site").get<std::string>();
          p.opensLocation = j.value("opens_location", "");
          p.workerHoursRequired = j.at("worker_hours_required").get<double>();
          p.crewSize = j.at("crew_size").get<int>();
          p.startHour = j.at("work_hours").at(0).get<int>();
          p.endHour = j.at("work_hours").at(1).get<int>();
          p.workDays = j.at("work_days").get<std::vector<int>>();
          p.startsAfter = j.value("starts_after", "");
          p.cityEffects = readStats(j, "city_effects");
          construction_.push_back(std::move(p));
        }
      } else if (section == "city_stages") {
        for (const auto& j : body) {
          stages_.push_back(
              CityStageDef{j.at("stage").get<int>(), j.at("name").get<std::string>(), j.at("min_population").get<double>()});
        }
      } else if (section == "city_initial") {
        for (const auto& [k, v] : body.items()) cityInitial_[k] = v.get<double>();
      } else if (section == "org_accounts") {
        for (const auto& j : body) {
          orgAccounts_.push_back(OrgAccountDef{j.at("id").get<std::string>(), j.at("name").get<std::string>(),
                                               j.value("opening_balance_cents", Cents{0})});
        }
      } else if (section == "character_creator") {
        if (haveCreator_) return fail("content_duplicate", source + ": 'character_creator' defined twice");
        haveCreator_ = true;
        auto& c = creator_;
        c.minAge = body.at("age").at(0).get<int>();
        c.maxAge = body.at("age").at(1).get<int>();
        c.minHeightCm = body.at("height_cm").at(0).get<int>();
        c.maxHeightCm = body.at("height_cm").at(1).get<int>();
        c.pronouns = readChoice(body.at("pronouns"));
        c.gender = readChoice(body.at("gender"));
        for (const auto& [field, choice] : body.at("appearance").items()) c.appearance[field] = readChoice(choice);
        c.traits = readChoice(body.at("traits"));
        c.interests = readChoice(body.at("interests"));
        c.education = readChoice(body.at("education"));
        c.relationshipStatus = readChoice(body.at("relationship_status"));
        c.goals = readChoice(body.at("goals"));
        c.personalityBudget = body.value("personality_budget", c.personalityBudget);
        c.valuesBudget = body.value("values_budget", c.valuesBudget);
        c.maxBackgroundLength = body.value("max_background_length", c.maxBackgroundLength);
      } else if (section == "origins") {
        for (const auto& j : body) {
          OriginDef o;
          o.id = j.at("id").get<std::string>();
          o.label = j.at("label").get<std::string>();
          o.description = j.value("description", "");
          o.bankCents = j.at("bank_cents").get<Cents>();
          o.cashCents = j.at("cash_cents").get<Cents>();
          o.careerLevelBonus = j.value("career_level_bonus", 0);
          o.housingTier = j.value("housing_tier", o.housingTier);
          o.emotions = readStats(j, "emotions");
          if (auto st = insertUnique(origins_, "origin", o.id, o); !st) return st;
        }
      } else if (section == "instruments") {
        for (const auto& j : body) {
          InstrumentDef i{j.at("id").get<std::string>(), j.at("label").get<std::string>(), j.value("midi_program", 0),
                          j.value("drums", false)};
          if (auto st = insertUnique(instruments_, "instrument", i.id, i); !st) return st;
        }
      } else {
        return fail("content_invalid", source + ": unknown section '" + section + "'");
      }
    }
  } catch (const std::exception& e) {
    return fail("content_invalid", source + ": " + e.what());
  }
  return okStatus();
}

Status ContentDatabase::validate() const {
  if (!haveSim_) return fail("content_missing", "no 'simulation' section found");
  if (sim_.needs.empty()) return fail("content_invalid", "simulation.needs is empty");
  if (sim_.minutesPerRealSecond <= 0) return fail("content_invalid", "minutes_per_real_second must be > 0");

  std::set<std::string> needs, emotions(sim_.emotions.begin(), sim_.emotions.end()),
      traits(sim_.personalityTraits.begin(), sim_.personalityTraits.end()), values(sim_.values.begin(), sim_.values.end()),
      dims(sim_.relationshipDimensions.begin(), sim_.relationshipDimensions.end()), orgs;
  for (const auto& n : sim_.needs) needs.insert(n.id);
  for (const auto& o : orgAccounts_) {
    if (!orgs.insert(o.id).second) return fail("content_duplicate", "duplicate org account '" + o.id + "'");
  }
  if (auto s = checkKeys(sim_.emotionBaselines, emotions, "simulation.emotion_baselines"); !s) return s;

  for (const auto& [id, l] : locations_) {
    if (!l.offers.empty() && !orgs.count(l.revenueAccount))
      return fail("content_invalid", "location " + id + ": offers require a valid revenue_account");
    for (const auto& o : l.offers) {
      if (o.priceCents < 0) return fail("content_invalid", "location " + id + ": negative price on " + o.id);
      if (auto s = checkKeys(o.needEffects, needs, "location " + id + " offer " + o.id); !s) return s;
      if (auto s = checkKeys(o.emotionEffects, emotions, "location " + id + " offer " + o.id); !s) return s;
    }
    for (const auto& a : l.activities) {
      if (auto s = checkKeys(a.needEffects, needs, "location " + id + " activity " + a.id); !s) return s;
      if (auto s = checkKeys(a.emotionEffects, emotions, "location " + id + " activity " + a.id); !s) return s;
    }
    if (!l.constructionProject.empty() && !constructionProject(l.constructionProject))
      return fail("content_invalid", "location " + id + ": unknown construction_project " + l.constructionProject);
  }
  for (const auto& [id, p] : properties_) {
    if (!location(p.location)) return fail("content_invalid", "property " + id + ": unknown location " + p.location);
    if (!orgs.count(p.ownerAccount)) return fail("content_invalid", "property " + id + ": unknown owner_account");
  }
  for (const auto& [id, c] : careers_) {
    if (c.levels.empty()) return fail("content_invalid", "career " + id + ": no levels");
    if (!orgs.count(c.employerAccount)) return fail("content_invalid", "career " + id + ": unknown employer_account");
    for (const auto& w : c.workplaces) {
      if (!location(w)) return fail("content_invalid", "career " + id + ": unknown workplace " + w);
    }
    if (auto s = checkKeys(c.needCostPerHour, needs, "career " + id); !s) return s;
  }
  for (const auto& [id, d] : interactions_) {
    const std::string where = "interaction " + id;
    if (auto s = checkKeys(d.actorNeeds, needs, where); !s) return s;
    if (auto s = checkKeys(d.targetNeeds, needs, where); !s) return s;
    if (auto s = checkKeys(d.actorEmotions, emotions, where); !s) return s;
    if (auto s = checkKeys(d.targetEmotions, emotions, where); !s) return s;
    if (auto s = checkKeys(d.actorToTarget, dims, where); !s) return s;
    if (auto s = checkKeys(d.targetToActor, dims, where); !s) return s;
    if (!d.receptivityTrait.empty() && !traits.count(d.receptivityTrait))
      return fail("content_invalid", where + ": unknown receptivity_trait");
  }
  for (const auto& [id, c] : characters_) {
    if (auto st = validateCharacter(c, [this](const std::string& other) { return character(other) != nullptr; }); !st)
      return st;
  }
  std::set<std::string> projectIds;
  for (const auto& p : construction_) {
    if (!projectIds.insert(p.id).second) return fail("content_duplicate", "duplicate construction project " + p.id);
  }
  for (const auto& p : construction_) {
    const std::string where = "construction " + p.id;
    if (!location(p.site)) return fail("content_invalid", where + ": unknown site " + p.site);
    if (!p.opensLocation.empty() && !location(p.opensLocation))
      return fail("content_invalid", where + ": unknown opens_location " + p.opensLocation);
    if (!p.startsAfter.empty() && !projectIds.count(p.startsAfter))
      return fail("content_invalid", where + ": unknown starts_after " + p.startsAfter);
    if (p.workerHoursRequired <= 0 || p.crewSize <= 0) return fail("content_invalid", where + ": needs work and crew");
    for (int d : p.workDays) {
      if (d < 0 || d > 6) return fail("content_invalid", where + ": work_days must be 0..6");
    }
  }
  for (std::size_t i = 1; i < stages_.size(); ++i) {
    if (stages_[i].minPopulation <= stages_[i - 1].minPopulation)
      return fail("content_invalid", "city_stages must be in increasing population order");
  }
  for (const auto& [id, o] : origins_) {
    if (o.bankCents < 0 || o.cashCents < 0) return fail("content_invalid", "origin " + id + ": negative money");
    if (auto s = checkKeys(o.emotions, emotions, "origin " + id); !s) return s;
  }
  if (haveCreator_) {
    if (origins_.empty()) return fail("content_invalid", "character_creator needs at least one origin");
    if (creator_.minAge < 18) return fail("content_invalid", "character_creator: minimum age is 18");
  }
  for (const auto& [id, i] : instruments_) {
    if (i.midiProgram < 0 || i.midiProgram > 127) return fail("content_invalid", "instrument " + id + ": midi_program 0..127");
  }
  return okStatus();
}

Status ContentDatabase::validateCharacter(const CharacterDef& c,
                                          const std::function<bool(const std::string&)>& characterExists) const {
  const std::set<std::string> traits(sim_.personalityTraits.begin(), sim_.personalityTraits.end());
  const std::set<std::string> values(sim_.values.begin(), sim_.values.end());
  const std::set<std::string> dims(sim_.relationshipDimensions.begin(), sim_.relationshipDimensions.end());
  const std::string& id = c.id;
  const std::string where = "character " + id;
  if (auto s = checkKeys(c.personality, traits, where + " personality"); !s) return s;
  if (auto s = checkKeys(c.values, values, where + " values"); !s) return s;
  const std::set<std::string> skills(sim_.skills.begin(), sim_.skills.end());
  if (auto s = checkKeys(c.skills, skills, where + " skills"); !s) return s;
  for (const auto& [k, v] : c.skills) {
    if (v < 0 || v > 100) return fail("content_invalid", where + ": skill " + k + " must be 0-100");
  }
  const CareerDef* career = this->career(c.careerId);
  if (!career) return fail("content_invalid", where + ": unknown career " + c.careerId);
  if (c.careerLevel < 0 || c.careerLevel >= static_cast<int>(career->levels.size()))
    return fail("content_invalid", where + ": career level out of range");
  if (!property(c.homeProperty)) return fail("content_invalid", where + ": unknown home property " + c.homeProperty);
  if (!location(c.spawnLocation)) return fail("content_invalid", where + ": unknown spawn_location");
  if (c.startingBankCents < 0 || c.startingCashCents < 0) return fail("content_invalid", where + ": negative money");
  for (const auto& r : c.relationships) {
    if (!characterExists(r.to)) return fail("content_invalid", where + ": relationship to unknown character " + r.to);
    if (r.to == c.id) return fail("content_invalid", where + ": relationship with self");
    if (auto s = checkKeys(r.dimensions, dims, where + " relationship " + r.to); !s) return s;
  }
  for (const auto& m : c.memories) {
    for (const auto& p : m.participants) {
      if (!characterExists(p)) return fail("content_invalid", where + ": memory participant unknown: " + p);
    }
  }
  return okStatus();
}

const LocationDef* ContentDatabase::location(const std::string& id) const {
  auto it = locations_.find(id);
  return it == locations_.end() ? nullptr : &it->second;
}
const PropertyDef* ContentDatabase::property(const std::string& id) const {
  auto it = properties_.find(id);
  return it == properties_.end() ? nullptr : &it->second;
}
const CareerDef* ContentDatabase::career(const std::string& id) const {
  auto it = careers_.find(id);
  return it == careers_.end() ? nullptr : &it->second;
}
const InteractionDef* ContentDatabase::interaction(const std::string& id) const {
  auto it = interactions_.find(id);
  return it == interactions_.end() ? nullptr : &it->second;
}
const CharacterDef* ContentDatabase::character(const std::string& id) const {
  auto it = characters_.find(id);
  return it == characters_.end() ? nullptr : &it->second;
}
const OriginDef* ContentDatabase::origin(const std::string& id) const {
  auto it = origins_.find(id);
  return it == origins_.end() ? nullptr : &it->second;
}
const InstrumentDef* ContentDatabase::instrument(const std::string& id) const {
  auto it = instruments_.find(id);
  return it == instruments_.end() ? nullptr : &it->second;
}
const ConstructionProjectDef* ContentDatabase::constructionProject(const std::string& id) const {
  for (const auto& p : construction_) {
    if (p.id == id) return &p;
  }
  return nullptr;
}

}  // namespace livera
