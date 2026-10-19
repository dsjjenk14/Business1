#include "core/Content.h"

#include <algorithm>
#include <cctype>
#include <fstream>
#include <set>

#include "core/ContentParse.h"

namespace livera {

using namespace content_parse;

namespace {

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
  o.calories = j.value("calories", 0.0);
  o.caloriesBurned = j.value("calories_burned", 0.0);
  o.service = j.value("service", "");
  o.conditionRecovery = readStats(j, "condition_recovery");
  o.item = j.value("item", "");
  o.quantity = j.value("quantity", 1);
  o.requiresDiagnosis = j.value("requires_diagnosis", "");
  o.substance = j.value("substance", "");
  o.illegal = j.value("illegal", false);
  return o;
}

Activity readActivity(const Json& a) {
  Activity act;
  act.id = a.at("id").get<std::string>();
  act.label = a.at("label").get<std::string>();
  act.cooldownMinutes = a.value("cooldown_minutes", 30);
  act.needEffects = readStats(a, "needs");
  act.emotionEffects = readStats(a, "emotions");
  act.homeEffects = readStats(a, "home_effects");
  act.caloriesBurned = a.value("calories_burned", 0.0);
  act.caloriesEaten = a.value("calories", 0.0);
  return act;
}

// Services a care provider can run when one of its offers is bought.
const std::set<std::string> kCareServices = {"checkup", "treatment", "dental_care", "emergency", "rehab",
                                             "sti_test", "prenatal", "abortion"};

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
    c.degrees = readStrings(j, "degrees");
    c.sex = j.value("sex", "");
    if (c.sex.empty()) {
      // Characters saved before M0.8 recorded who could carry a pregnancy instead.
      const std::string legacy = j.value("reproduction", "");
      c.sex = legacy == "carrier" ? "female" : legacy == "sire" ? "male" : "";
    }
    c.fame = j.value("fame", 0.0);
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
    c.aspirations = readStrings(j, "aspirations");
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
        s.sightRangeMeters = body.value("sight_range_m", s.sightRangeMeters);
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
          if (j.contains("hours"))
            l.hours = OpeningHours{j.at("hours").at(0).get<int>(), j.at("hours").at(1).get<int>(), readInts(j, "open_days")};
          if (j.contains("offers")) {
            for (const auto& o : j.at("offers")) l.offers.push_back(readOffer(o));
          }
          if (j.contains("activities")) {
            for (const auto& a : j.at("activities")) l.activities.push_back(readActivity(a));
          }
          l.outdoorRadius = j.value("outdoor_radius_m", l.outdoorRadius);
          l.revenueAccount = j.value("revenue_account", "");
          l.constructionProject = j.value("construction_project", "");
          l.stage = j.value("stage", false);
          l.weddings = j.value("weddings", false);
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
          p.forSale = j.value("for_sale", false);
          if (auto s = insertUnique(properties_, "property", p.id, p); !s) return s;
        }
      } else if (section == "careers") {
        for (const auto& j : body) {
          CareerDef c;
          c.id = j.at("id").get<std::string>();
          c.name = j.at("name").get<std::string>();
          c.workplaces = readStrings(j, "workplaces");
          c.atEmployersHome = j.value("at_employers_home", false);
          c.employerAccount = c.atEmployersHome ? j.value("employer_account", "") : j.at("employer_account").get<std::string>();
          for (const auto& lv : j.at("levels")) {
            c.levels.push_back(CareerLevel{lv.at("title").get<std::string>(), lv.at("hourly_cents").get<Cents>(),
                                           lv.value("hours_to_promote", 0.0), lv.value("min_performance", 0.0)});
          }
          c.needCostPerHour = readStats(j, "need_cost_per_hour");
          c.maxShiftHours = j.value("max_shift_hours", c.maxShiftHours);
          c.minPaidMinutes = j.value("min_paid_minutes", c.minPaidMinutes);
          c.entryLevel = j.value("entry_level", false);
          c.requiresDegree = j.value("requires_degree", "");
          c.requiresCleanRecord = j.value("requires_clean_record", false);
          c.careFeeShare = j.value("care_fee_share", 0.0);
          c.worksOutdoors = j.value("works_outdoors", false);
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
        for (const auto& g : body.at("age_groups")) {
          c.ageGroups.push_back(AgeGroup{g.at("id").get<std::string>(), g.at("label").get<std::string>(),
                                         g.at("ages").at(0).get<int>(), g.at("ages").at(1).get<int>()});
        }
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
        c.sex = readChoice(body.at("sex"));
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
      } else if (section == "life") {
        if (haveLife_) return fail("content_duplicate", source + ": 'life' defined twice");
        haveLife_ = true;
        auto& L = life_;
        const Json& off = body.at("offline");
        L.selfCareRealDays = off.value("self_care_real_days", L.selfCareRealDays);
        L.depressedNeedTargets = readStats(off, "depressed_need_targets");
        L.depressedEmotionTargets = readStats(off, "depressed_emotion_targets");
        L.depressionCondition = off.value("depression_condition", L.depressionCondition);
        L.depressionRecoveryPerGoodHour = off.value("recovery_per_good_hour", L.depressionRecoveryPerGoodHour);
        const Json away = off.value("away_work", Json::object());
        L.awayPayShare = away.value("pay_share", L.awayPayShare);
        L.awayPromotionShare = away.value("promotion_share", L.awayPromotionShare);
        const Json block = away.value("default_block", Json::object());
        L.defaultWorkDays = readInts(block, "days");
        if (block.contains("hours")) {
          L.defaultWorkStartHour = block.at("hours").at(0).get<int>();
          L.defaultWorkEndHour = block.at("hours").at(1).get<int>();
        }
        const Json& bath = body.at("bathroom");
        L.accidentHygieneLoss = bath.value("accident_hygiene_loss", L.accidentHygieneLoss);
        L.accidentEmbarrassment = bath.value("accident_embarrassment", L.accidentEmbarrassment);
        const Json& home = body.at("home");
        L.homeDirtPerHour = home.value("dirt_per_hour", L.homeDirtPerHour);
        L.homeDustPerHour = home.value("dust_per_hour", L.homeDustPerHour);
        L.homeTrashPerHour = home.value("trash_per_hour", L.homeTrashPerHour);
        L.fullTrashDirtMultiplier = home.value("full_trash_dirt_multiplier", L.fullTrashDirtMultiplier);
        L.dirtyHomeThreshold = home.value("dirty_below", L.dirtyHomeThreshold);
        L.dirtyHomeNeedsPerHour = readStats(home, "dirty_home_needs_per_hour");
        L.offlineHomeCleanliness = home.value("offline_cleanliness", L.offlineHomeCleanliness);
        L.depressedHomeCleanliness = home.value("depressed_cleanliness", L.depressedHomeCleanliness);
        const Json& w = body.at("weight");
        L.caloriesPerHungerPoint = w.value("calories_per_hunger_point", L.caloriesPerHungerPoint);
        L.baseBurnPerDay = w.value("base_burn_per_day", L.baseBurnPerDay);
        L.kcalPerKg = w.value("kcal_per_kg", L.kcalPerKg);
        L.defaultBmi = w.value("default_bmi", L.defaultBmi);
        L.depressedWeightLossPerDay = w.value("depressed_loss_per_day", L.depressedWeightLossPerDay);
        L.highBmi = w.value("high_bmi", L.highBmi);
        L.lowBmi = w.value("low_bmi", L.lowBmi);
        L.unhealthyBmiHealthDecay = w.value("unhealthy_bmi_health_decay", L.unhealthyBmiHealthDecay);
        const Json& age = body.at("aging");
        L.adultAge = age.value("adult_age", L.adultAge);
        for (const auto& st : age.at("life_stages")) {
          L.lifeStages.push_back(LifeStageDef{st.at("id").get<std::string>(), st.at("min_age").get<int>(),
                                              st.value("health_decay_multiplier", 1.0)});
        }
        const Json& g = body.at("grooming");
        L.groomingAttractionMin = g.value("attraction_min", L.groomingAttractionMin);
        L.groomingAttractionMax = g.value("attraction_max", L.groomingAttractionMax);
        const Json sleep = body.value("sleep", Json::object());
        if (sleep.contains("bed_hours"))
          L.bedHours = OpeningHours{sleep.at("bed_hours").at(0).get<int>(), sleep.at("bed_hours").at(1).get<int>(), {}};
        L.wakeHour = sleep.value("wake_hour", L.wakeHour);
      } else if (section == "conditions") {
        for (const auto& j : body) {
          ConditionDef d;
          d.id = j.at("id").get<std::string>();
          d.name = j.at("name").get<std::string>();
          d.kind = j.at("kind").get<std::string>();
          d.minHours = j.at("hours").at(0).get<double>();
          d.maxHours = j.at("hours").at(1).get<double>();
          d.needsPerHour = readStats(j, "needs_per_hour");
          d.emotionsPerHour = readStats(j, "emotions_per_hour");
          d.performancePenalty = j.value("performance_penalty", 0.0);
          d.symptomatic = j.value("symptomatic", true);
          d.onset = j.value("onset", "");
          d.curable = j.value("curable", true);
          if (j.contains("catch")) {
            const Json& c = j.at("catch");
            d.hourlyChance = c.value("hourly_chance", 0.0);
            d.riskNeed = c.value("risk_need", "");
            d.riskBelow = c.value("risk_below", 0.0);
            d.dirtyHomeRisk = c.value("dirty_home", false);
            d.riskMultiplier = c.value("risk_multiplier", d.riskMultiplier);
            d.contagionPerHour = c.value("contagion_per_hour", 0.0);
            d.sexualTransmission = c.value("sexual_transmission", 0.0);
          }
          d.treatedBy = readStrings(j, "treated_by");
          if (auto st = insertUnique(conditions_, "condition", d.id, d); !st) return st;
        }
      } else if (section == "items") {
        for (const auto& j : body) {
          ItemDef i;
          i.id = j.at("id").get<std::string>();
          i.label = j.at("label").get<std::string>();
          i.category = j.at("category").get<std::string>();
          i.slot = j.value("slot", "");
          i.consumable = j.value("consumable", false);
          i.usable = j.value("usable", false);
          i.cooldownMinutes = j.value("cooldown_minutes", 60);
          i.needEffects = readStats(j, "needs");
          i.emotionEffects = readStats(j, "emotions");
          i.shortens = readStats(j, "shortens");
          i.conditionRecovery = readStats(j, "condition_recovery");
          i.unlocks = readStrings(j, "unlocks");
          i.style = j.value("style", 0.0);
          i.substance = j.value("substance", "");
          i.illegal = j.value("illegal", false);
          i.test = j.value("test", "");
          i.contraception = j.value("contraception", false);
          if (auto st = insertUnique(items_, "item", i.id, i); !st) return st;
        }
      } else if (section == "education") {
        for (const auto& d : body.at("degrees"))
          education_.degrees.push_back(DegreeDef{d.at("id").get<std::string>(), d.at("name").get<std::string>()});
        for (const auto& j : body.at("programs")) {
          ProgramDef p;
          p.id = j.at("id").get<std::string>();
          p.name = j.at("name").get<std::string>();
          p.degree = j.at("degree").get<std::string>();
          p.requiresDegree = j.value("requires_degree", "");
          p.requiresCleanRecord = j.value("requires_clean_record", false);
          p.hoursRequired = j.at("hours_required").get<double>();
          p.tuitionPerHourCents = j.at("tuition_per_hour_cents").get<Cents>();
          p.minGrade = j.value("min_grade", p.minGrade);
          p.maxSessionHours = j.value("max_session_hours", p.maxSessionHours);
          p.campuses = readStrings(j, "campuses");
          p.online = j.value("online", false);
          p.needCostPerHour = readStats(j, "need_cost_per_hour");
          p.tuitionAccount = j.at("tuition_account").get<std::string>();
          if (auto st = insertUnique(education_.programs, "program", p.id, p); !st) return st;
        }
        const Json creatorEducation = body.value("creator_education", Json::object());  // a local: the loop must not outlive it
        for (const auto& [answer, degrees] : creatorEducation.items())
          education_.creatorEducation[answer] = degrees.get<std::vector<std::string>>();
      } else if (section == "crime") {
        auto& C = crime_;
        C.jail = body.at("jail").get<std::string>();
        C.patrolArrestPerHour = body.value("patrol_arrest_per_hour", C.patrolArrestPerHour);
        C.policeNearbyMeters = body.value("police_nearby_m", C.policeNearbyMeters);
        C.pickpocketMaxCents = body.value("pickpocket_max_cents", C.pickpocketMaxCents);
        C.pickpocketCooldownMinutes = body.value("pickpocket_cooldown_minutes", C.pickpocketCooldownMinutes);
        C.pickpocketNoticeChance = body.value("pickpocket_notice_chance", C.pickpocketNoticeChance);
        C.addictionThreshold = body.value("addiction_threshold", C.addictionThreshold);
        C.finesAccount = body.at("fines_account").get<std::string>();
        C.overdoseBillCents = body.value("overdose_bill_cents", C.overdoseBillCents);
        C.hospital = body.at("hospital").get<std::string>();
        for (const auto& j : body.at("crimes")) {
          CrimeDef d;
          d.id = j.at("id").get<std::string>();
          d.label = j.at("label").get<std::string>();
          d.fineCents = j.at("fine_cents").get<Cents>();
          d.jailMinutes = j.value("jail_minutes", 0);
          d.detection = j.value("detection", d.detection);
          d.perWitness = j.value("per_witness", d.perWitness);
          d.perStaff = j.value("per_staff", d.perStaff);
          d.perPolice = j.value("per_police", d.perPolice);
          d.notoriety = j.value("notoriety", 0.0);
          if (auto st = insertUnique(C.crimes, "crime", d.id, d); !st) return st;
        }
      } else if (section == "substances") {
        for (const auto& j : body) {
          SubstanceDef d;
          d.id = j.at("id").get<std::string>();
          d.name = j.at("name").get<std::string>();
          d.legal = j.value("legal", false);
          d.needs = readStats(j, "needs");
          d.emotions = readStats(j, "emotions");
          d.effectMinutes = j.value("effect_minutes", d.effectMinutes);
          d.crashNeeds = readStats(j, "crash_needs");
          d.crashEmotions = readStats(j, "crash_emotions");
          d.dependencyPerUse = j.value("dependency_per_use", 0.0);
          d.dependencyDecayPerDay = j.value("dependency_decay_per_day", d.dependencyDecayPerDay);
          d.addiction = j.value("addiction", "");
          d.overdoseUses = j.value("overdose_uses", 0);
          d.overdoseWindowMinutes = j.value("overdose_window_minutes", d.overdoseWindowMinutes);
          d.possessionCrime = j.value("possession_crime", "");
          if (auto st = insertUnique(substances_, "substance", d.id, d); !st) return st;
        }
      } else if (section == "romance") {
        auto& R = romance_;
        R.requestMinutes = body.value("request_minutes", R.requestMinutes);
        R.conceptionChance = body.value("conception_chance", R.conceptionChance);
        R.protectionEffectiveness = body.value("protection_effectiveness", R.protectionEffectiveness);
        for (const auto& f : body.at("fertility_by_age")) R.fertilityByAge.emplace_back(f.at(0).get<int>(), f.at(1).get<double>());
        R.pregnancyGameDays = body.value("pregnancy_game_days", R.pregnancyGameDays);
        R.symptomsAfterDays = body.value("symptoms_after_days", R.symptomsAfterDays);
        R.testDetectsAfterDays = body.value("test_detects_after_days", R.testDetectsAfterDays);
        R.miscarriageChance = body.value("miscarriage_chance", R.miscarriageChance);
        R.miscarriageWindowDays = body.value("miscarriage_window_days", R.miscarriageWindowDays);
        R.abortionLimitDays = body.value("abortion_limit_days", R.abortionLimitDays);
        R.pregnancyNeedsPerHour = readStats(body, "pregnancy_needs_per_hour");
        R.morningSicknessNeedsPerHour = readStats(body, "morning_sickness_needs_per_hour");
        R.girlNames = body.at("baby_names").at("girl").get<std::vector<std::string>>();
        R.boyNames = body.at("baby_names").at("boy").get<std::vector<std::string>>();
        R.namingWindowDays = body.value("naming_window_days", R.namingWindowDays);
        R.divorceFeeCents = body.value("divorce_fee_cents", R.divorceFeeCents);
        R.divorceFeeAccount = body.at("divorce_fee_account").get<std::string>();
        R.stiProtection = body.value("sti_protection", R.stiProtection);
      } else if (section == "fame") {
        auto& F = fame_;
        for (const auto& t : body.at("tiers"))
          F.tiers.push_back(FameTier{t.at("id").get<std::string>(), t.at("label").get<std::string>(), t.at("min").get<double>()});
        F.decayPerDay = body.value("decay_per_day", F.decayPerDay);
        F.perQualityAudience = body.value("per_quality_audience", F.perQualityAudience);
        F.perRelease = body.value("per_release", F.perRelease);
        F.perWedding = body.value("per_wedding", F.perWedding);
        F.celebrityAt = body.value("celebrity_at", F.celebrityAt);
        F.receptivityBonus = body.value("receptivity_bonus", F.receptivityBonus);
      } else if (section == "transit") {
        transit_.operatorAccount = body.at("operator_account").get<std::string>();
        transit_.boardingRadiusMeters = body.value("boarding_radius_m", transit_.boardingRadiusMeters);
        for (const auto& j : body.at("lines")) {
          TransitLine line;
          line.id = j.at("id").get<std::string>();
          line.name = j.at("name").get<std::string>();
          line.fareCents = j.at("fare_cents").get<Cents>();
          line.speedMps = j.value("speed_mps", line.speedMps);
          line.firstHour = j.at("hours").at(0).get<int>();
          line.lastHour = j.at("hours").at(1).get<int>();
          line.inspectionChance = j.value("inspection_chance", line.inspectionChance);
          line.evasionFineCents = j.value("evasion_fine_cents", line.evasionFineCents);
          for (const auto& st : j.at("stops"))
            line.stops.push_back(TransitStop{st.at("id").get<std::string>(), st.at("name").get<std::string>(), readVec2(st.at("at"))});
          transit_.lines.push_back(std::move(line));
        }
      } else if (section == "instruments") {
        for (const auto& j : body) {
          InstrumentDef i{j.at("id").get<std::string>(), j.at("label").get<std::string>(), j.value("midi_program", 0),
                          j.value("drums", false)};
          if (auto st = insertUnique(instruments_, "instrument", i.id, i); !st) return st;
        }
      } else {
        bool handled = false;
        if (auto st = ingestMore(source, section, body, handled); !st) return st;
        if (!handled) return fail("content_invalid", source + ": unknown section '" + section + "'");
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
  // A shout from someone you can't see would be a voice from nowhere: clients draw speakers from sight.
  if (sim_.sightRangeMeters < sim_.shoutRangeMeters)
    return fail("content_invalid", "sight_range_m must be at least shout_range_m");

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
      if (!o.service.empty() && !kCareServices.count(o.service))
        return fail("content_invalid", "location " + id + " offer " + o.id + ": unknown service " + o.service);
      for (const auto& [cond, v] : o.conditionRecovery) {
        if (!condition(cond)) return fail("content_invalid", "location " + id + " offer " + o.id + ": unknown condition " + cond);
      }
      if (!o.item.empty() && !item(o.item))
        return fail("content_invalid", "location " + id + " offer " + o.id + ": unknown item " + o.item);
      if (o.quantity < 1) return fail("content_invalid", "location " + id + " offer " + o.id + ": quantity must be 1+");
      if (!o.requiresDiagnosis.empty() && !condition(o.requiresDiagnosis))
        return fail("content_invalid", "location " + id + " offer " + o.id + ": unknown requires_diagnosis");
      if (!o.substance.empty() && !substance(o.substance))
        return fail("content_invalid", "location " + id + " offer " + o.id + ": unknown substance " + o.substance);
    }
    for (const auto& a : l.activities) {
      if (auto s = checkKeys(a.needEffects, needs, "location " + id + " activity " + a.id); !s) return s;
      if (auto s = checkKeys(a.emotionEffects, emotions, "location " + id + " activity " + a.id); !s) return s;
      if (auto s = checkKeys(a.homeEffects, {"cleanliness", "trash"}, "location " + id + " activity " + a.id); !s) return s;
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
    if (!c.atEmployersHome && !orgs.count(c.employerAccount)) return fail("content_invalid", "career " + id + ": unknown employer_account");
    for (const auto& w : c.workplaces) {
      if (!location(w)) return fail("content_invalid", "career " + id + ": unknown workplace " + w);
    }
    if (auto s = checkKeys(c.needCostPerHour, needs, "career " + id); !s) return s;
    if (!c.requiresDegree.empty() && !degree(c.requiresDegree))
      return fail("content_invalid", "career " + id + ": unknown requires_degree " + c.requiresDegree);
    if (c.careFeeShare < 0 || c.careFeeShare > 1) return fail("content_invalid", "career " + id + ": care_fee_share 0-1");
  }
  for (const auto& [id, p] : education_.programs) {
    const std::string where = "program " + id;
    if (!degree(p.degree)) return fail("content_invalid", where + ": unknown degree " + p.degree);
    if (!p.requiresDegree.empty() && !degree(p.requiresDegree)) return fail("content_invalid", where + ": unknown requires_degree");
    if (p.hoursRequired <= 0 || p.tuitionPerHourCents < 0) return fail("content_invalid", where + ": bad hours or tuition");
    if (p.campuses.empty()) return fail("content_invalid", where + ": needs a campus");
    for (const auto& c : p.campuses) {
      if (!location(c)) return fail("content_invalid", where + ": unknown campus " + c);
    }
    if (!orgs.count(p.tuitionAccount)) return fail("content_invalid", where + ": unknown tuition_account");
    if (auto s = checkKeys(p.needCostPerHour, needs, where); !s) return s;
  }
  for (const auto& [answer, degrees] : education_.creatorEducation) {
    for (const auto& d : degrees) {
      if (!degree(d)) return fail("content_invalid", "education.creator_education: unknown degree " + d);
    }
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
    if (creator_.ageGroups.empty()) return fail("content_invalid", "character_creator needs age_groups");
    for (const auto& g : creator_.ageGroups) {
      if (g.minAge < 18 || g.maxAge < g.minAge) return fail("content_invalid", "character_creator: age group " + g.id + " must be adult [min, max]");
    }
    for (const auto& o : creator_.sex.options) {
      if (o != "female" && o != "male") return fail("content_invalid", "character_creator: sex options are female and male");
    }
  }
  if (haveLife_) {
    if (life_.selfCareRealDays <= 0) return fail("content_invalid", "life.offline.self_care_real_days must be > 0");
    if (auto s = checkKeys(life_.depressedNeedTargets, needs, "life.offline.depressed_need_targets"); !s) return s;
    if (auto s = checkKeys(life_.depressedEmotionTargets, emotions, "life.offline.depressed_emotion_targets"); !s) return s;
    if (auto s = checkKeys(life_.dirtyHomeNeedsPerHour, needs, "life.home.dirty_home_needs_per_hour"); !s) return s;
    if (!condition(life_.depressionCondition)) return fail("content_invalid", "life: unknown depression_condition");
    if (life_.kcalPerKg <= 0) return fail("content_invalid", "life: bad weight tuning");
    if (life_.lifeStages.empty() || life_.lifeStages.front().minAge != 0)
      return fail("content_invalid", "life.aging.life_stages must start at age 0");
    for (std::size_t i = 1; i < life_.lifeStages.size(); ++i) {
      if (life_.lifeStages[i].minAge <= life_.lifeStages[i - 1].minAge)
        return fail("content_invalid", "life.aging.life_stages must be in increasing age order");
    }
    const auto share = [](double v) { return v >= 0 && v <= 1; };
    if (!share(life_.awayPayShare) || !share(life_.awayPromotionShare))
      return fail("content_invalid", "life.offline.away_work: pay_share and promotion_share are 0-1");
    for (int d : life_.defaultWorkDays) {
      if (d < 0 || d > 6) return fail("content_invalid", "life.offline.away_work.default_block.days must be 0..6");
    }
    if (life_.defaultWorkStartHour < 0 || life_.defaultWorkEndHour > 24 ||
        life_.defaultWorkStartHour >= life_.defaultWorkEndHour)
      return fail("content_invalid", "life.offline.away_work.default_block.hours must be [start, end) within a day");
    const OpeningHours& bed = life_.bedHours;
    if (bed.openHour < 0 || bed.openHour > 23 || bed.closeHour < 0 || bed.closeHour > 24 ||
        bed.openHour == bed.closeHour)
      return fail("content_invalid", "life.sleep.bed_hours must be [from, to) hours of the day");
    if (life_.wakeHour < 0 || life_.wakeHour > 23 || bed.isOpenAt(life_.wakeHour))
      return fail("content_invalid", "life.sleep.wake_hour must be an hour outside bed_hours");
  }
  for (const auto& [id, d] : conditions_) {
    const std::string where = "condition " + id;
    if (auto s = checkKeys(d.needsPerHour, needs, where); !s) return s;
    if (auto s = checkKeys(d.emotionsPerHour, emotions, where); !s) return s;
    if (!d.riskNeed.empty() && !needs.count(d.riskNeed)) return fail("content_invalid", where + ": unknown risk_need");
    if (d.minHours < 0 || d.maxHours < d.minHours) return fail("content_invalid", where + ": hours must be [min, max]");
    for (double p : {d.hourlyChance, d.contagionPerHour, d.sexualTransmission}) {
      if (p < 0 || p > 1) return fail("content_invalid", where + ": chances are 0-1");
    }
  }
  for (const auto& [id, it] : items_) {
    const std::string where = "item " + id;
    if (auto s = checkKeys(it.needEffects, needs, where); !s) return s;
    if (auto s = checkKeys(it.emotionEffects, emotions, where); !s) return s;
    if (!it.slot.empty() && it.slot != "outfit" && it.slot != "accessory")
      return fail("content_invalid", where + ": slot must be outfit or accessory");
    for (const auto& m : {it.shortens, it.conditionRecovery}) {
      for (const auto& [cond, v] : m) {
        if (!condition(cond)) return fail("content_invalid", where + ": unknown condition " + cond);
      }
    }
  }
  for (const auto& [id, it] : items_) {
    if (!it.substance.empty() && !substance(it.substance)) return fail("content_invalid", "item " + id + ": unknown substance");
  }
  for (const auto& [id, d] : substances_) {
    const std::string where = "substance " + id;
    if (auto s = checkKeys(d.needs, needs, where); !s) return s;
    if (auto s = checkKeys(d.crashNeeds, needs, where); !s) return s;
    if (auto s = checkKeys(d.emotions, emotions, where); !s) return s;
    if (auto s = checkKeys(d.crashEmotions, emotions, where); !s) return s;
    if (!d.addiction.empty() && !condition(d.addiction)) return fail("content_invalid", where + ": unknown addiction condition");
    if (!d.possessionCrime.empty() && !crimeDef(d.possessionCrime)) return fail("content_invalid", where + ": unknown possession_crime");
  }
  if (!romance_.divorceFeeAccount.empty() && !orgs.count(romance_.divorceFeeAccount))
    return fail("content_invalid", "romance: unknown divorce_fee_account");
  if (auto s = checkKeys(romance_.pregnancyNeedsPerHour, needs, "romance.pregnancy_needs_per_hour"); !s) return s;
  if (auto s = checkKeys(romance_.morningSicknessNeedsPerHour, needs, "romance.morning_sickness_needs_per_hour"); !s) return s;
  for (std::size_t i = 1; i < fame_.tiers.size(); ++i) {
    if (fame_.tiers[i].minFame <= fame_.tiers[i - 1].minFame) return fail("content_invalid", "fame tiers must increase");
  }
  if (!crime_.crimes.empty()) {
    if (!location(crime_.jail)) return fail("content_invalid", "crime: unknown jail");
    if (!location(crime_.hospital)) return fail("content_invalid", "crime: unknown hospital");
    if (!orgs.count(crime_.finesAccount)) return fail("content_invalid", "crime: unknown fines_account");
  }
  if (!transit_.lines.empty()) {
    if (!orgs.count(transit_.operatorAccount)) return fail("content_invalid", "transit: unknown operator_account");
    std::set<std::string> stopIds;
    for (const auto& line : transit_.lines) {
      if (line.stops.size() < 2) return fail("content_invalid", "transit line " + line.id + ": needs two stops");
      if (line.speedMps <= 0 || line.fareCents < 0) return fail("content_invalid", "transit line " + line.id + ": bad speed or fare");
      for (const auto& st : line.stops) {
        if (!stopIds.insert(st.id).second) return fail("content_duplicate", "duplicate transit stop " + st.id);
      }
    }
  }
  for (const auto& [id, i] : instruments_) {
    if (i.midiProgram < 0 || i.midiProgram > 127) return fail("content_invalid", "instrument " + id + ": midi_program 0..127");
  }
  return validateMore();
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
  // Children born in the world have no job yet.
  if (!(c.careerId.empty() && !c.playable)) {
    const CareerDef* career = this->career(c.careerId);
    if (!career) return fail("content_invalid", where + ": unknown career " + c.careerId);
    if (c.careerLevel < 0 || c.careerLevel >= static_cast<int>(career->levels.size()))
      return fail("content_invalid", where + ": career level out of range");
  }
  if (!property(c.homeProperty)) return fail("content_invalid", where + ": unknown home property " + c.homeProperty);
  if (!location(c.spawnLocation)) return fail("content_invalid", where + ": unknown spawn_location");
  for (const auto& d : c.degrees) {
    if (!education_.degrees.empty() && !degree(d)) return fail("content_invalid", where + ": unknown degree " + d);
  }
  if (!c.sex.empty() && c.sex != "female" && c.sex != "male") return fail("content_invalid", where + ": sex must be female or male");
  if (c.fame < 0 || c.fame > 100) return fail("content_invalid", where + ": fame must be 0-100");
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
  // The away routine pays the schedule line marked "work": it needs a time, and a day has one.
  const Json schedule = c.profile.is_object() ? c.profile.value("schedule", Json::object()) : Json::object();
  if (schedule.is_object()) {
    for (const auto& [day, lines] : schedule.items()) {
      if (!lines.is_array()) continue;
      int work = 0;
      for (const auto& e : lines) {
        if (!e.is_object() || !e.value("work", false)) continue;
        ++work;
        const std::string t = e.value("time", std::string());
        if (t.size() != 5 || t[2] != ':' || !std::isdigit(static_cast<unsigned char>(t[0])))
          return fail("content_invalid", where + ": schedule." + day + ": a work line needs a time like 08:30");
      }
      if (work > 1) return fail("content_invalid", where + ": schedule." + day + " has more than one work line");
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
const CrimeDef* ContentDatabase::crimeDef(const std::string& id) const {
  auto it = crime_.crimes.find(id);
  return it == crime_.crimes.end() ? nullptr : &it->second;
}
const SubstanceDef* ContentDatabase::substance(const std::string& id) const {
  auto it = substances_.find(id);
  return it == substances_.end() ? nullptr : &it->second;
}
const ProgramDef* ContentDatabase::program(const std::string& id) const {
  auto it = education_.programs.find(id);
  return it == education_.programs.end() ? nullptr : &it->second;
}
const DegreeDef* ContentDatabase::degree(const std::string& id) const {
  for (const auto& d : education_.degrees) {
    if (d.id == id) return &d;
  }
  return nullptr;
}
const ItemDef* ContentDatabase::item(const std::string& id) const {
  auto it = items_.find(id);
  return it == items_.end() ? nullptr : &it->second;
}
std::pair<const TransitLine*, const TransitStop*> ContentDatabase::transitStop(const std::string& id) const {
  for (const auto& line : transit_.lines) {
    for (const auto& st : line.stops) {
      if (st.id == id) return {&line, &st};
    }
  }
  return {nullptr, nullptr};
}
const ConditionDef* ContentDatabase::condition(const std::string& id) const {
  auto it = conditions_.find(id);
  return it == conditions_.end() ? nullptr : &it->second;
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
