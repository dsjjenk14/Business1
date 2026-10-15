#pragma once

#include <filesystem>
#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

#include "core/Types.h"

namespace livera {

// ---------------------------------------------------------------------------------
// Content definitions: the immutable, data-driven description of the game.
// Loaded from data/**/*.json. Runtime state lives in WorldState (World.h), never here.
// See docs/DATA_MODEL.md for the file format.
// ---------------------------------------------------------------------------------

struct NeedDef {
  std::string id;
  double decayPerHour = 0;  // points lost per game hour while simulated at full fidelity
  double initial = 75;
};

struct SimulationConfig {
  double minutesPerRealSecond = 1.0;
  GameMinutes startMinute = 7 * 60;
  double walkSpeedMetersPerSecond = 6.0;
  double entryRadiusMeters = 5.0;
  Vec2 worldMin{0, 0};
  Vec2 worldMax{1000, 1000};
  std::vector<NeedDef> needs;
  std::vector<std::string> emotions;
  StatMap emotionBaselines;              // emotions relax toward these
  double emotionRelaxPerHour = 4.0;
  std::vector<std::string> personalityTraits;
  std::vector<std::string> values;
  std::vector<std::string> relationshipDimensions;
  double offlineNeedTarget = 70;        // offline characters are assumed to look after themselves (Tier 3)
  int memoryImportanceThreshold = 25;   // interactions below this are not remembered individually
  int maxMessageLength = 500;
  std::vector<std::string> skills;      // e.g. music; grow through practice
  double hearingRangeMeters = 20;       // `say` outdoors
  double shoutRangeMeters = 60;         // `shout` outdoors
  double whisperRangeMeters = 2;        // `whisper` outdoors
  int maxSpeechLength = 300;
};

struct Offer {
  std::string id;
  std::string label;
  Cents priceCents = 0;
  StatMap needEffects;
  StatMap emotionEffects;
  double calories = 0;          // food energy; 0 = derived from the hunger it restores
  double caloriesBurned = 0;    // a class or a workout
  std::string service;          // a care service run on purchase (checkup, treatment, dental_care...)
  StatMap conditionRecovery;    // progress toward curing a condition, e.g. therapy for depression
  std::string item;             // buying it puts this item (from data/items) in your inventory
  int quantity = 1;
  std::string requiresDiagnosis;  // prescription: only sold to people diagnosed with this condition
};

// Things people own: clothes, accessories, electronics, medicine (data/items/items.json).
struct ItemDef {
  std::string id;
  std::string label;
  std::string category;      // clothing, accessory, electronics, jewelry, medicine, health, contraception
  std::string slot;          // "outfit" or "accessory" if it can be worn
  bool consumable = false;   // used up when used
  bool usable = false;       // can be used directly (headphones, a laptop, medicine)
  int cooldownMinutes = 60;
  StatMap needEffects;       // when used (or put on)
  StatMap emotionEffects;
  StatMap shortens;          // condition id -> hours taken off how long it lasts
  StatMap conditionRecovery; // condition id -> recovery progress per use
  std::vector<std::string> unlocks;  // what owning it lets you do: study_online, health_tracking...
  double style = 0;          // while worn, counts toward how put-together you look
};

struct TransitStop {
  std::string id;
  std::string name;
  Vec2 at;
};

struct TransitLine {
  std::string id;
  std::string name;
  std::vector<TransitStop> stops;
  Cents fareCents = 275;
  double speedMps = 24;      // real-time speed, like walking: a bus is four times faster on foot
  int firstHour = 5;
  int lastHour = 1;          // service runs [firstHour, lastHour), wrapping past midnight
  double inspectionChance = 0.15;
  Cents evasionFineCents = 10000;
};

struct TransitConfig {
  LedgerAccountId operatorAccount;
  double boardingRadiusMeters = 15;
  std::vector<TransitLine> lines;
};

// Something you can do at a place without paying: shower at home, jog in the park.
struct Activity {
  std::string id;
  std::string label;
  int cooldownMinutes = 30;  // game minutes before the same character can repeat it
  StatMap needEffects;
  StatMap emotionEffects;
  StatMap homeEffects;       // changes to your home's upkeep (cleanliness, trash); only in your own home
  double caloriesBurned = 0;
  double caloriesEaten = 0;  // 0 = derived from the hunger it restores
};

// A life stage by age (baby, child, teen, young adult, adult, elder).
struct LifeStageDef {
  std::string id;
  int minAge = 0;
  double healthDecayMultiplier = 1.0;
};

// Everyday-life tuning (data/config/life.json). See docs/SIMULATION.md.
struct LifeConfig {
  // Offline: a played character looks after themselves for this long (in real days, at
  // the configured clock rate), then becomes depressed and keeps up only the basics.
  double selfCareRealDays = 21;
  StatMap depressedNeedTargets;
  StatMap depressedEmotionTargets;
  std::string depressionCondition = "depression";
  double depressionRecoveryPerGoodHour = 1;  // online hours with needs averaging 60+ help
  // Bathroom: when bladder hits 0.
  double accidentHygieneLoss = 40;
  double accidentEmbarrassment = 40;
  // Home upkeep, per game hour.
  double homeDirtPerHour = 1.0;     // a resident at home makes mess
  double homeDustPerHour = 0.2;     // an empty home slowly gathers dust
  double homeTrashPerHour = 0.5;    // a resident at home makes trash
  double fullTrashDirtMultiplier = 3;
  double dirtyHomeThreshold = 30;
  StatMap dirtyHomeNeedsPerHour;    // applied to people inside a dirty home
  double offlineHomeCleanliness = 80;   // what self-care keeps a home at
  double depressedHomeCleanliness = 10;
  // Body weight.
  double caloriesPerHungerPoint = 14;
  double baseBurnPerDay = 2000;
  double kcalPerKg = 7700;
  double defaultBmi = 23;
  double depressedWeightLossPerDay = 0.1;
  double highBmi = 30;
  double lowBmi = 18.5;
  double unhealthyBmiHealthDecay = 0.5;  // extra health loss per hour outside the healthy range
  // Aging.
  double gameDaysPerYear = 1800;
  int adultAge = 18;
  std::vector<LifeStageDef> lifeStages;
  // Grooming makes first impressions: physical attraction gains scale between these.
  double groomingAttractionMin = 0.6;
  double groomingAttractionMax = 1.4;
};

// A condition a character can have: an illness, an infection, depression, an addiction.
struct ConditionDef {
  std::string id;
  std::string name;
  std::string kind;           // illness, dental, mental, sti, addiction
  double minHours = 24;       // how long it lasts untreated; 0 = until treated
  double maxHours = 72;
  StatMap needsPerHour;
  StatMap emotionsPerHour;
  double performancePenalty = 0;  // fraction taken off work performance while ill
  bool symptomatic = true;    // you can tell you have it; otherwise only a test finds it
  bool curable = true;        // false = a treatment manages it but it never goes away
  // How you catch it.
  double hourlyChance = 0;
  std::string riskNeed;       // e.g. "hygiene": chance multiplied while that need is low
  double riskBelow = 0;
  bool dirtyHomeRisk = false;
  double riskMultiplier = 3;
  double contagionPerHour = 0;  // per infected person sharing a space
  double sexualTransmission = 0;
  std::vector<std::string> treatedBy;  // care services (or items) that cure or manage it
};

struct OpeningHours {
  int openHour = 0;   // inclusive
  int closeHour = 24; // exclusive; a close earlier than open wraps past midnight
  bool isOpenAt(int hour) const {
    if (openHour == closeHour) return true;
    if (openHour < closeHour) return hour >= openHour && hour < closeHour;
    return hour >= openHour || hour < closeHour;
  }
};

enum class AccessRule { Public, Residents, Staff };

struct LocationDef {
  LocationId id;
  std::string name;
  std::string type;       // apartment, coffee_shop, office, construction_site, park, church...
  std::string district;
  std::string description;
  Vec2 door;              // where the building meets the street; entry is checked against this point
  bool enterable = true;  // false for outdoor places (parks, sites) you stand in rather than enter
  AccessRule access = AccessRule::Public;
  std::optional<OpeningHours> hours;
  std::vector<Offer> offers;
  std::vector<Activity> activities;
  double outdoorRadius = 30;       // for non-enterable places: how close counts as "here"
  LedgerAccountId revenueAccount;  // who is paid for offers
  std::string constructionProject; // if set, closed until that project completes
  bool stage = false;              // music can be performed here (open mic, church, park, club)
};

struct PropertyDef {
  std::string id;
  LocationId location;
  std::string type;  // apartment, townhouse, house, parcel
  LedgerAccountId ownerAccount;
  Cents rentMonthlyCents = 0;
  Cents marketValueCents = 0;
  int bedrooms = 0;
  std::vector<std::string> amenities;
  std::string tier;  // starter, luxury: which new arrivals can be housed here
};

struct CareerLevel {
  std::string title;
  Cents hourlyCents = 0;
  double hoursToPromote = 0;  // 0 = top of track
  double minPerformance = 0;
};

struct CareerDef {
  std::string id;
  std::string name;
  std::vector<LocationId> workplaces;
  LedgerAccountId employerAccount;
  std::vector<CareerLevel> levels;
  StatMap needCostPerHour;      // applied while on shift (negative = drain)
  double maxShiftHours = 10;
  double minPaidMinutes = 30;
  bool entryLevel = false;  // new characters can start in this career
};

struct InteractionDef {
  std::string id;
  std::string label;
  double rangeMeters = 3;
  StatMap actorNeeds;
  StatMap targetNeeds;
  StatMap actorEmotions;
  StatMap targetEmotions;
  StatMap actorToTarget;   // relationship deltas, actor's feelings about target
  StatMap targetToActor;   // relationship deltas, target's feelings about actor
  std::string receptivityTrait;  // target personality trait that scales targetToActor
  std::string memoryType;
  int importance = 0;
  int emotionalImpact = 0;  // -100..100, from the target's point of view
};

struct StartingRelationship {
  CharacterId to;
  StatMap dimensions;
  std::string history;
};

struct SeedMemory {
  std::string type;
  std::vector<CharacterId> participants;
  CharacterId about;
  int emotionalImpact = 0;
  int importance = 0;
  bool isPublic = false;
  std::string info;
  int daysAgo = 0;  // seed memories predate the founding; stored relative to world start
};

struct CharacterDef {
  CharacterId id;
  std::string firstName;
  std::string lastName;
  std::string pronouns;
  std::string gender;
  int age = 0;
  bool playable = false;
  StatMap personality;
  StatMap values;
  std::vector<std::string> traits;
  std::vector<std::string> interests;
  StatMap skills;  // starting skill levels (e.g. a producer starts good at music)
  std::string careerId;
  int careerLevel = 0;
  Cents startingCashCents = 0;
  Cents startingBankCents = 0;
  std::string homeProperty;
  LocationId spawnLocation;
  std::vector<StartingRelationship> relationships;
  std::vector<SeedMemory> memories;
  Json profile;  // narrative: appearance, background, goals, secrets, schedule, social media...

  std::string fullName() const { return firstName + " " + lastName; }
};

struct ConstructionProjectDef {
  std::string id;
  std::string name;
  LocationId site;          // where the crew works (a construction_site location)
  LocationId opensLocation; // the location that opens on completion
  double workerHoursRequired = 0;
  int crewSize = 0;
  int startHour = 7;
  int endHour = 16;
  std::vector<int> workDays;  // 0 = Monday
  std::string startsAfter;    // another project id, or empty = starts at founding
  StatMap cityEffects;        // added to city stats on completion
};

// "Why did you move to Livéra?" Sets a created character's starting conditions.
struct OriginDef {
  std::string id;
  std::string label;
  std::string description;
  Cents bankCents = 0;
  Cents cashCents = 0;
  int careerLevelBonus = 0;
  std::string housingTier = "starter";
  StatMap emotions;  // starting emotion offsets
};

// A choice in the character creator: pick one (max 1) or several (max N) of `options`.
struct CreatorChoice {
  std::vector<std::string> options;
  int min = 1;
  int max = 1;
  bool allowCustom = false;  // free text allowed (pronouns, gender identity)
};

struct CreatorOptions {
  int minAge = 18;
  int maxAge = 80;
  int minHeightCm = 145;
  int maxHeightCm = 210;
  CreatorChoice pronouns;
  CreatorChoice gender;
  std::map<std::string, CreatorChoice> appearance;  // skin_tone, hair_style, tattoos...
  CreatorChoice traits;
  CreatorChoice interests;
  CreatorChoice education;
  CreatorChoice relationshipStatus;
  CreatorChoice goals;
  double personalityBudget = 400;  // sum of all personality traits may not exceed this
  double valuesBudget = 450;
  int maxBackgroundLength = 400;
};

struct InstrumentDef {
  std::string id;
  std::string label;
  int midiProgram = 0;  // General MIDI program number (0-127)
  bool drums = false;   // percussion: pitches are drum sounds, played on MIDI channel 10
};

struct CityStageDef {
  int stage = 1;
  std::string name;
  double minPopulation = 0;
};

struct OrgAccountDef {
  LedgerAccountId id;
  std::string name;
  Cents openingBalanceCents = 0;
};

class ContentDatabase {
 public:
  // Loads every *.json under `dir` (recursively, sorted for determinism) and merges them.
  // Validates all cross references; returns an error naming the offending file/id.
  static Result<std::shared_ptr<const ContentDatabase>> loadFromDirectory(const std::filesystem::path& dir);
  // Same, from an in-memory bundle of documents (used by tests).
  static Result<std::shared_ptr<const ContentDatabase>> loadFromDocuments(const std::vector<std::pair<std::string, Json>>& docs);
  // Parses one character in the content format. Also used for player-created characters,
  // which are stored in the save in the same format.
  static Result<CharacterDef> parseCharacter(const Json& j);
  // Checks a character against this content (stat names, career, home, relationships).
  Status validateCharacter(const CharacterDef& c, const std::function<bool(const std::string&)>& characterExists) const;

  const SimulationConfig& sim() const { return sim_; }
  const std::map<LocationId, LocationDef>& locations() const { return locations_; }
  const std::map<std::string, PropertyDef>& properties() const { return properties_; }
  const std::map<std::string, CareerDef>& careers() const { return careers_; }
  const std::map<std::string, InteractionDef>& interactions() const { return interactions_; }
  const std::map<CharacterId, CharacterDef>& characters() const { return characters_; }
  const std::vector<ConstructionProjectDef>& constructionProjects() const { return construction_; }
  const std::vector<CityStageDef>& cityStages() const { return stages_; }
  const StatMap& cityInitial() const { return cityInitial_; }
  const std::vector<OrgAccountDef>& orgAccounts() const { return orgAccounts_; }
  const CreatorOptions& creator() const { return creator_; }
  const std::map<std::string, OriginDef>& origins() const { return origins_; }
  const std::map<std::string, InstrumentDef>& instruments() const { return instruments_; }
  const OriginDef* origin(const std::string& id) const;
  const InstrumentDef* instrument(const std::string& id) const;
  const LifeConfig& life() const { return life_; }
  const std::map<std::string, ItemDef>& items() const { return items_; }
  const ItemDef* item(const std::string& id) const;
  const TransitConfig& transit() const { return transit_; }
  // The line and stop for a stop id, or {nullptr, nullptr}.
  std::pair<const TransitLine*, const TransitStop*> transitStop(const std::string& id) const;
  const std::map<std::string, ConditionDef>& conditions() const { return conditions_; }
  const ConditionDef* condition(const std::string& id) const;

  const LocationDef* location(const std::string& id) const;
  const PropertyDef* property(const std::string& id) const;
  const CareerDef* career(const std::string& id) const;
  const InteractionDef* interaction(const std::string& id) const;
  const CharacterDef* character(const std::string& id) const;
  const ConstructionProjectDef* constructionProject(const std::string& id) const;

 private:
  Status ingest(const std::string& source, const Json& doc);
  Status validate() const;

  bool haveSim_ = false;
  SimulationConfig sim_;
  std::map<LocationId, LocationDef> locations_;
  std::map<std::string, PropertyDef> properties_;
  std::map<std::string, CareerDef> careers_;
  std::map<std::string, InteractionDef> interactions_;
  std::map<CharacterId, CharacterDef> characters_;
  std::vector<ConstructionProjectDef> construction_;
  std::vector<CityStageDef> stages_;
  StatMap cityInitial_;
  std::vector<OrgAccountDef> orgAccounts_;
  bool haveCreator_ = false;
  CreatorOptions creator_;
  std::map<std::string, OriginDef> origins_;
  std::map<std::string, InstrumentDef> instruments_;
  bool haveLife_ = false;
  LifeConfig life_;
  std::map<std::string, ConditionDef> conditions_;
  std::map<std::string, ItemDef> items_;
  TransitConfig transit_;
};

}  // namespace livera
