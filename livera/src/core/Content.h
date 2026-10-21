#pragma once

#include <algorithm>
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
  // How far you can see other people outdoors. Never below the shout range: you must be able to see
  // whoever you can hear (ContentDatabase refuses content that breaks this).
  double sightRangeMeters = 120;
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
  std::string substance;        // consumed on the spot: a drink at the bar
  bool illegal = false;         // buying it is a crime (drug_purchase) if the police see you
};

// Alcohol and drugs (data/health/substances.json). Illegal ones have fictional names.
struct SubstanceDef {
  std::string id;
  std::string name;
  bool legal = false;
  StatMap needs;               // when taken
  StatMap emotions;
  int effectMinutes = 120;     // how long the high lasts
  StatMap crashNeeds;          // when it wears off
  StatMap crashEmotions;
  double dependencyPerUse = 0; // toward addiction (0-100)
  double dependencyDecayPerDay = 2;
  std::string addiction;       // condition id once dependency reaches the threshold
  int overdoseUses = 0;        // this many uses within the window is an overdose (0 = never)
  int overdoseWindowMinutes = 180;
  std::string possessionCrime; // what the police charge you with
};

// A crime and what getting caught costs (data/society/crimes.json).
struct CrimeDef {
  std::string id;
  std::string label;
  Cents fineCents = 0;
  int jailMinutes = 0;
  double detection = 0.1;    // chance to be caught in the act, before witnesses
  double perWitness = 0.05;  // anyone else present
  double perStaff = 0.2;     // staff on shift where it happens
  double perPolice = 0.5;    // police officers on duty nearby
  double notoriety = 0;      // infamy, counts toward fame
};

struct CrimeConfig {
  std::map<std::string, CrimeDef> crimes;
  LocationId jail;
  double patrolArrestPerHour = 0.03;    // a wanted person outdoors, per hour, even with no police players on
  double policeNearbyMeters = 40;
  Cents pickpocketMaxCents = 20000;
  int pickpocketCooldownMinutes = 1440; // per victim
  double pickpocketNoticeChance = 0.35; // the victim realises who it was
  double addictionThreshold = 50;
  LedgerAccountId finesAccount;
  Cents overdoseBillCents = 45000;
  LocationId hospital;
  std::vector<std::string> shopliftPlaceTypes;  // where steal works (D-069); empty = any shop
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
  std::string substance;     // using it means taking this substance
  bool illegal = false;      // carrying it is possession
  std::string test;          // a home test: "pregnancy"
  bool contraception = false;  // used up during intimacy when protection is chosen
};

// Dating, marriage, intimacy and having children (data/society/romance.json).
struct RomanceConfig {
  int requestMinutes = 15;              // how long an ask stays open
  double conceptionChance = 0.2;        // per unprotected encounter, at peak fertility
  double protectionEffectiveness = 0.98;
  std::vector<std::pair<int, double>> fertilityByAge;  // (from age, multiplier)
  double pregnancyGameDays = 252;
  double symptomsAfterDays = 14;
  double testDetectsAfterDays = 10;
  double miscarriageChance = 0.12;      // over the window, before risk factors
  double miscarriageWindowDays = 84;
  double abortionLimitDays = 168;
  StatMap pregnancyNeedsPerHour;
  StatMap morningSicknessNeedsPerHour;
  std::vector<std::string> girlNames;
  std::vector<std::string> boyNames;
  int namingWindowDays = 7;
  Cents divorceFeeCents = 150000;
  LedgerAccountId divorceFeeAccount;
  double stiProtection = 0.1;           // protection multiplies transmission chances by this
};

struct FameTier {
  std::string id;
  std::string label;
  double minFame = 0;
};

struct FameConfig {
  std::vector<FameTier> tiers;
  double decayPerDay = 0.2;
  double perQualityAudience = 0.002;  // a performance adds quality x audience x this
  double perRelease = 1;
  double perWedding = 2;
  double celebrityAt = 60;            // people present hear when someone this famous walks in
  double receptivityBonus = 0.2;      // strangers warm to celebrities this much more
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

struct OpeningHours {
  int openHour = 0;   // inclusive
  int closeHour = 24; // exclusive; a close earlier than open wraps past midnight
  std::vector<int> days;  // weekdays it opens (0 = Monday); empty = every day
  bool isOpenAt(int hour) const {
    if (openHour == closeHour) return true;
    if (openHour < closeHour) return hour >= openHour && hour < closeHour;
    return hour >= openHour || hour < closeHour;
  }
  bool isOpenOn(int weekday, int hour) const {
    if (!days.empty() && std::find(days.begin(), days.end(), weekday) == days.end()) return false;
    return isOpenAt(hour);
  }
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
  // Away, the routine includes the job (Away.cpp): scheduled work blocks spent offline are paid at this share of
  // the wage, with this share of the hours toward promotion. A character with no work line in their schedule
  // (everyone made in the creator) works the default block.
  double awayPayShare = 0;
  double awayPromotionShare = 0;
  std::vector<int> defaultWorkDays;  // weekdays, 0 = Monday
  int defaultWorkStartHour = 9;
  int defaultWorkEndHour = 17;
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
  // Aging follows the calendar: a birthday once a game year (Clock.h), so a pregnancy is
  // nine months and a child grows up in eighteen years of the same calendar.
  int adultAge = 18;
  std::vector<LifeStageDef> lifeStages;
  // Grooming makes first impressions: physical attraction gains scale between these.
  double groomingAttractionMin = 0.6;
  double groomingAttractionMax = 1.4;
  // Sleep (Sleep.cpp): when you can go to bed at home, and the hour everyone asleep wakes.
  OpeningHours bedHours{21, 3, {}};
  int wakeHour = 7;
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
  std::string onset;          // what you're told when it starts; empty = "You have <name>."
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
  bool weddings = false;           // couples can marry here
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
  bool forSale = false;  // sold (at market value), not rented: see the homes section (Homes.cpp)
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
  std::string requiresDegree;     // hiring requires this degree (data/education)
  bool requiresCleanRecord = false;
  double careFeeShare = 0;        // > 0: a clinician; earns this share of care bought while they're on duty
  bool worksOutdoors = false;     // the shift continues outside the workplace (police on patrol)
  bool atEmployersHome = false;   // a nanny: hired by a family, works in their home, paid by them
};

struct DegreeDef {
  std::string id;
  std::string name;
};

// A course of study at a campus: hours of study sessions, tuition by the hour, a grade bar.
struct ProgramDef {
  std::string id;
  std::string name;
  std::string degree;            // granted on graduation
  std::string requiresDegree;    // e.g. law school needs a bachelor's
  bool requiresCleanRecord = false;
  double hoursRequired = 400;
  Cents tuitionPerHourCents = 0;
  double minGrade = 55;          // average session grade (0-100) needed to graduate
  double maxSessionHours = 8;
  std::vector<LocationId> campuses;
  bool online = false;           // can also be studied at home with a laptop
  StatMap needCostPerHour;
  LedgerAccountId tuitionAccount;
};

struct EducationConfig {
  std::vector<DegreeDef> degrees;
  std::map<std::string, ProgramDef> programs;
  std::map<std::string, std::vector<std::string>> creatorEducation;  // creator answer -> degrees held
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
  std::string status;  // "dating", "engaged" or "married" when they already are (D-073); the other side says the same
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
  std::vector<std::string> degrees;
  std::string sex;           // "female" or "male": only a woman and a man together can conceive, and she carries
  double fame = 0;           // starting fame
  std::vector<StartingRelationship> relationships;
  std::vector<SeedMemory> memories;
  // Aspirations the game can follow (ids from data/goals), beside the free-text profile.goals. Founders name them;
  // a made character's come from the goals picked in the creator.
  std::vector<std::string> aspirations;
  Json profile;  // narrative: appearance, background, goals, secrets, schedule, social media...

  // Who they are to the town (D-073): "founder", "resident" (made in the creator before they were written into data)
  // or "townsperson" (the people who keep its places open). Empty for a character made in a save.
  std::string cast;

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

// "How old are you?" in the creator: 18, your 20s, or your 30s.
struct AgeGroup {
  std::string id;
  std::string label;
  int minAge = 18;
  int maxAge = 18;
};

struct CreatorOptions {
  std::vector<AgeGroup> ageGroups;
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
  CreatorChoice sex;           // female or male; separate from gender identity and pronouns
  double personalityBudget = 400;  // sum of all personality traits may not exceed this
  double valuesBudget = 450;
  int maxBackgroundLength = 400;
};

// A care routine a parent (or a nanny on shift) does with a child at home.
struct CareActionDef {
  std::string id;
  std::string label;
  std::vector<std::string> stages;  // life stages it suits
  StatMap childNeeds;
  StatMap childEmotions;
  StatMap carerNeeds;
  double bond = 0;                  // friendship and familiarity, both ways
  double grade = 0;                 // toward today's school grade (homework, a story)
  int cooldownMinutes = 120;
};

// Children: growth, who looks after them, school and daycare (data/society/family.json).
struct FamilyConfig {
  int superviseUnder = 13;               // younger children need an adult, daycare, school or a nanny
  std::vector<std::string> childNeeds;   // needs that run down for a child in a parent's care
  double childBmi = 16;
  int neglectReportHours = 4;            // unsupervised hours in one day before child services step in
  std::string neglectCrime;
  LocationId school;
  int schoolMinAge = 5;
  int schoolMaxAge = 17;
  std::vector<int> schoolDays;
  int schoolStartHour = 8;
  int schoolEndHour = 15;
  std::string diplomaDegree;             // granted at adulthood with a good enough average
  double diplomaGrade = 60;
  LocationId daycare;
  int daycareMaxAge = 4;
  std::vector<int> daycareDays;
  int daycareStartHour = 7;
  int daycareEndHour = 18;
  Cents daycareFeeCents = 4500;          // per day attended, from the parent who enrolled them
  LedgerAccountId daycareAccount;
  std::vector<CareActionDef> careActions;
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

// ---- M0.8 feature content (each block belongs to one feature; see docs/m08/) ----
// m08:homes content { Buying homes, mortgages, moving in together (Homes.cpp)
// Buying homes: the lender and its one mortgage product, and who it will lend to
// (data/world/homes_places.json).
struct HomesConfig {
  LedgerAccountId lender;               // an org account; pays sellers what down payments don't cover
  double minDownPayment = 0.1;          // fraction of the price
  double annualRate = 0.06;
  int termMonths = 360;                 // game months
  int missedPaymentsToForeclose = 3;
  Cents lateFeeCents = 0;               // added to the arrears for each missed payment
  // The bank lends if your share of the payments is under this share of your monthly pay
  // (career level hourly x work_hours_per_month), or your savings cover reserve_months of them.
  double maxPaymentShareOfPay = 0.4;
  double workHoursPerMonth = 160;
  int reserveMonths = 12;
  int residentsPerBedroom = 2;          // how many adults can live in a home
};
// } m08:homes

// m08:work content { Work decisions during shifts (WorkTasks.cpp)
// One answer to a work decision. `score` and `why` stay on the server until it's answered.
struct WorkOptionDef {
  std::string label;
  std::string detail;  // optional
  double score = 0;    // 0..1; exactly one option of a task scores 1
  std::string why;
};

// A job decision (data/careers/work_tasks.json): a situation and three or four ways to handle it.
struct WorkTaskDef {
  std::string id;
  std::string career;
  std::string prompt;
  std::vector<WorkOptionDef> options;
};

struct WorkDecisionsConfig {
  int perDay = 3;                   // decisions a work day
  // They come up through the shift: one when it starts (or at midnight on a shift that crosses it) and one more
  // every spacing_minutes after. 0 = all of them at once.
  int spacingMinutes = 0;
  double performanceBest = 6;       // performance change for the best call (score 1)
  double performanceWorst = -4;     // and for the worst (score 0); linear in between
  double bonusHoursPerPoint = 1.5;  // promotion hours per point of score
};
// } m08:work

// m08:wallet content { Coins, phones and LivPay (Wallet.cpp)
// Coins: a premium currency bought with real money (data/economy/coins.json). A pack is one store
// product; its price is what the store charges in US cents and is shown, never charged, by the game.
struct CoinPackDef {
  std::string productId;
  std::string label;
  std::int64_t coins = 0;
  Cents priceUsdCents = 0;
};

// Something the coin shop sells. Cosmetic and status only: validation keeps every coin item at or
// below what dollars can already buy in the same slot, so coins never buy an edge.
struct CoinShopEntry {
  std::string item;
  std::int64_t coinPrice = 0;
};

// A phone is an item of category "phone"; its model says how long a full battery lasts.
struct PhoneModelDef {
  std::string item;
  double batteryHours = 40;  // online and away from a charger, from full to dead
  double chargeHours = 3;    // at a charger, from dead to full
};

struct PhonesConfig {
  std::string basicModel;                    // issued to every adult who has no phone; empty = no phones in this world
  double lowBatteryPercent = 20;             // a warning when the battery drops past this
  std::vector<std::string> chargeAtTypes;    // location types with outlets anyone can use (cafés, the campus)
  std::map<std::string, PhoneModelDef> models;  // by item id
};

// LivPay: tap to pay and send money, bank to bank (data/economy/coins.json, "livpay").
struct LivPayConfig {
  Cents perTransferLimitCents = 250000;
  Cents dailyLimitCents = 500000;   // sent per game day
  int dailyTransfers = 20;          // sends per game day
  int maxNoteLength = 140;
};

struct WalletConfig {
  std::vector<CoinPackDef> coinPacks;
  std::vector<CoinShopEntry> coinShop;
  PhonesConfig phones;
  LivPayConfig livpay;
  bool havePacks = false, haveShop = false, havePhones = false, haveLivpay = false;
};
// } m08:wallet

// m08:leisure content { Sports, date spots and the lake park (Leisure.cpp)
// A town league sport (data/leisure/sports.json): where and when its matches are played, and
// how a match's score follows from the two sides' strengths.
struct LeisureSportDef {
  std::string id;
  std::string name;
  LocationId venue;            // an outdoor place; players and spectators stand in it
  int matchWeekday = 5;        // 0 = Monday
  int matchHour = 15;          // kickoff, on the hour
  int durationMinutes = 120;   // the result comes at the first hourly step after this
  int lineup = 11;             // the most players a side fields; the best of those present play
  std::string scoring = "goals";  // goals: counted like soccer goals; points: like basketball
  double perTeam = 1.4;        // a side's expected score in an even match
  double sensitivity = 1.0;    // how far a strength edge moves the expected scores
  double noise = 1.0;          // goals: 1 = Poisson chance, 0 = exact; points: standard deviation
  int maxScore = 9;
  bool draws = true;           // false: a tie goes to overtime
  double overtimeFraction = 0.1;  // an overtime period, as a share of a match
  int pointsWin = 3;
  int pointsDraw = 1;
  int pointsLoss = 0;
};

// A town team. `strength` is its non-player roster: the townsfolk who turn up every week.
struct LeisureTeamDef {
  std::string id;
  std::string name;
  std::string sport;
  double strength = 50;
};

// Something that counts as a date when your partner is there with you: an offer or an activity.
struct LeisureDateSpotDef {
  LocationId place;
  std::string offer;
  std::string activity;
  std::string memory;  // "Dinner at Lumière" -> "Dinner at Lumière with Dax"
};

// An activity that can only be done at some hours (stargazing after dark).
struct LeisureActivityHoursDef {
  LocationId place;
  std::string activity;
  OpeningHours hours;
};

// An activity that trains skills (practice at the field or the court).
struct LeisurePracticeDef {
  LocationId place;
  std::string activity;
  StatMap skills;  // skill -> base gain per session (less the better you already are)
};

struct LeisureConfig {
  LedgerAccountId leagueAccount;
  LocationId clubhouse;           // you sign up here, or at the team's venue
  Cents leagueFeeCents = 0;       // once, when you join a team
  std::string skill = "athletics";
  std::vector<std::string> coachCareers;  // on shift at a venue, they make practice there count for more
  double coachedPracticeBonus = 0.5;
  // A player's worth at kickoff: (base + skill x weight) x (minEnergyFactor .. 1 by energy).
  double playerBase = 4;
  double skillWeight = 0.2;
  std::string energyNeed = "energy";
  double minEnergyFactor = 0.5;
  double luck = 12;               // up to this much is added to each side's strength by chance
  StatMap playerNeeds;            // what a match takes out of (and gives) a player
  double playerCalories = 600;
  double matchSkillGain = 3;
  double fameWin = 0.6;
  double fameDraw = 0.3;
  double fameLoss = 0.15;
  StatMap winEmotions;
  StatMap drawEmotions;
  StatMap lossEmotions;
  StatMap spectatorEmotions;
  StatMap spectatorNeeds;
  int resultsKept = 20;
  // Dates.
  std::vector<std::string> dateStatuses;  // relationship statuses that make it a date
  StatMap dateRelationship;               // both ways
  StatMap dateEmotions;                   // both of you
  int dateImportance = 45;
  int dateImpact = 40;
  std::vector<LeisureDateSpotDef> dateSpots;
  std::vector<LeisureActivityHoursDef> activityHours;
  std::vector<LeisurePracticeDef> practice;
  std::vector<LeisureSportDef> sports;
  std::vector<LeisureTeamDef> teams;
};
// } m08:leisure

// m08:pets content { Pets and medicine (Pets.cpp)
// A pet's life stage by age in calendar months: puppy, adult, senior.
struct PetStageDef {
  std::string id;
  int minAgeMonths = 0;
  double needsMultiplier = 1.0;  // how fast needs run down at this age
  double sickMultiplier = 1.0;   // how often they fall ill
};

struct PetSpeciesDef {
  std::string id;
  std::string label;
  Cents adoptionFeeCents = 0;
  StatMap needsPerHour;          // change per game hour (negative = decay)
  std::vector<PetStageDef> stages;
  int shelterMinAgeMonths = 2;   // ages of the animals the shelter lists
  int shelterMaxAgeMonths = 96;
  std::vector<std::string> breeds;
  std::vector<std::string> names;
};

// Something you do with a pet: feed, play, cuddle, groom at home; walk a dog outdoors.
struct PetActionDef {
  std::string id;
  std::string label;
  std::vector<std::string> species;  // empty = every species
  std::string where = "home";        // "home" or "outdoors"
  std::string usesItem;              // consumed from your inventory (pet food)
  int cooldownMinutes = 60;          // per pet: one feed counts for the whole household
  StatMap petNeeds;
  StatMap yourNeeds;
  StatMap yourEmotions;
  double caloriesBurned = 0;
  double bond = 0;
};

struct PetIllnessDef {
  std::string id;
  std::string name;
  std::vector<std::string> species;  // empty = any
};

struct VetServiceDef {
  std::string id;
  std::string label;
  Cents priceCents = 0;
  StatMap petNeeds;
  bool diagnoses = false;  // says what's wrong
  bool cures = false;      // treats an illness (refused when there is none)
  int vaccinatesDays = 0;  // > 0: vaccines that protect for this long
};

// Pets (data/society/pets.json).
struct PetConfig {
  LocationId shelter;
  LocationId vet;
  std::string foodItem;
  std::vector<std::string> needs;  // a pet's own needs: hunger, fun, hygiene, health
  StatMap adoptedNeeds;            // how an animal leaves the shelter
  int listingsPerWeek = 4;          // animals on show at a time
  int weeklyIntake = 12;            // animals the shelter takes in a week; the next one takes an adopted one's place
  int maxPetsPerHome = 3;
  double initialBond = 10;
  int maxNameLength = 24;
  int adoptionVaccineDays = 336;   // the adoption fee covers shots
  double routineTarget = 70;       // an offline owner's routine keeps needs here (and the shelter's staff)
  double warnBelow = 20;           // the household hears when hunger falls this low
  int neglectHungerHours = 24;     // starving this long and animal control steps in
  double neglectBelow = 20;
  double bondLossPerNeglectedHour = 0.5;
  double companyMinBond = 40;      // a bonded pet at home is company
  StatMap companyEmotionsPerHour;  // for anyone at home with them, online
  StatMap adoptionEmotions;        // the day you bring them home
  double walkRadiusMeters = 250;   // walks start from your street
  double sickChancePerHour = 0.002;
  double sickLowNeedBelow = 25;
  double sickLowNeedMultiplier = 3;
  double sickVaccinatedMultiplier = 0.3;
  StatMap sickNeedsPerHour;
  StatMap takenAwayEmotions;       // the owner, when animal control takes the pet
  std::map<std::string, PetSpeciesDef> species;
  std::vector<PetActionDef> actions;
  std::vector<PetIllnessDef> illnesses;
  std::vector<VetServiceDef> vetServices;
};

// A medicine's dosing rules, keyed by its item (data/items/medicine.json).
struct MedicineDef {
  std::string item;
  int dailyLimit = 0;                 // 0 = no limit
  double overdoseHealthLoss = -1;     // < 0 = the config default
  bool prescription = false;
  std::vector<std::string> prescribedFor;  // conditions a diagnosis writes it for
  int fills = 1;                      // purchases one prescription allows
  int validDays = 28;
  std::string dangerousWith;          // a substance it must not be mixed with
  int dangerWithinMinutes = 240;
  StatMap dangerNeeds;
  StatMap dangerEmotions;
  bool dangerEmergency = false;
};

struct MedicineConfig {
  int doseWindowHours = 24;
  double overdoseHealthLoss = 25;
  int emergencyAfterExtraDoses = 2;   // this many doses over the limit and you're taken to the ER
  double emergencyBelowHealth = 15;   // or an overdose leaves you this unwell
  LocationId hospital;
  Cents emergencyBillCents = 45000;
  double stabilisedHealth = 30;       // the ER gets you at least this far back
  std::map<std::string, MedicineDef> medicines;
};
// } m08:pets

// m08:details content { Accidents as a big deal, laundry, weather, birthdays, hangovers (Details.cpp)
struct WeatherKindDef {
  std::string id;
  std::string label;
  bool warn = false;            // online people hear about it in the morning
  bool umbrellaHalves = false;  // an umbrella only halves it (a storm); otherwise an umbrella keeps you dry
  StatMap outdoorsNeedsPerHour;  // what being out in it does to you, per game hour, without an umbrella
  StatMap outdoorsEmotionsPerHour;
};

struct WeatherSeasonDef {
  std::vector<int> months;  // 1..12
  double tempMin = 10;
  double tempMax = 20;
  std::vector<std::pair<std::string, double>> chances;  // weather kind -> chance (sums to 1)
};

// Small things that make a day (data/society/details.json).
struct DetailsConfig {
  // Wetting yourself.
  std::string humiliatedCondition;
  StatMap accidentEmotions;
  int accidentImportance = 90;
  int accidentImpact = -85;
  int witnessImportance = 70;
  int witnessImpact = -25;
  StatMap witnessRelationship;   // a witness's feelings about the person it happened to
  StatMap partnerRelationship;   // instead, for a witness who is their partner
  StatMap witnessEmotions;       // second-hand embarrassment
  double gossipHours = 24;       // how long witnesses keep telling people
  double gossipChancePerHour = 0.15;  // per witness, per close friend who hasn't heard
  double gossipMinFriendship = 50;
  StatMap gossipRelationship;
  int gossipImportance = 50;
  int gossipImpact = -10;
  double newsMinFame = 60;       // famous enough for the Ledger to run it
  double newsFameLoss = 5;
  double newsRespect = -3;       // everyone who knows them
  double humiliatedReceptivity = 0.6;  // how well social moves land while humiliated, soiled or in dirty clothes
  double soiledReceptivity = 0.7;
  double dirtyReceptivity = 0.9;
  // Laundry.
  double dirtyAfterHours = 16;
  double dirtyHygienePerHour = -1.5;
  double soiledHygieneCap = 50;  // you can't feel clean in soiled clothes
  StatMap homeLaundryNeeds;
  double homeLaundryTrash = 5;
  LocationId laundromat;
  Cents laundromatPriceCents = 800;
  StatMap laundromatNeeds;
  // Weather.
  std::string umbrellaItem;
  int forecastHour = 6;
  std::vector<WeatherKindDef> weatherKinds;
  std::vector<WeatherSeasonDef> seasons;
  // Birthdays.
  double birthdayMinFriendship = 40;
  std::string cakeItem;
  StatMap cakeEmotions;
  StatMap cakeGiverEmotions;
  double cakeFriendship = 8;
  int cakeImportance = 60;
  int cakeImpact = 60;
  // Hangovers.
  std::string hangoverSubstance;
  int hangoverDrinks = 3;
  double hangoverWithinHours = 8;
  std::string hangoverCondition;
  int hangoverCheckHour = 6;
};
// } m08:details

// ---- Redesign content (docs/proposals/redesign.md, Release 2) ----
// Goals (data/goals/goals.json, Goals.cpp). Which goals exist, their labels and numbers are data; how each kind
// of check is computed (from records the World already keeps) is code, so a check names one of those kinds.
struct GoalCheckDef {
  std::string type;                     // ledger_today, memories_today, promotions... (Goals.cpp lists them)
  int min = 1;                          // the count the check needs, where it counts
  std::vector<std::string> kinds;       // ledger_today: transaction kinds
  std::string direction = "in";         // ledger_today: money into ("in") or out of ("out") your accounts
  std::vector<std::string> placeTypes;  // purchases_today: where you bought it
  std::string memory;                   // memories_today, memories: the memory type
  bool bestOnly = false;                // work_calls_today: only best calls count
  std::string dimension;                // relationships_at_least: your side of the relationship
  double value = 0;                     //   ...at or above this
  std::vector<std::string> statuses;    // relationship_status: dating, engaged, married...
  std::string tier;                     // fame_tier_at_least
  Cents cents = 0;                      // bank_at_least, ledger_net_today
};

// A daily goal: three are drawn per character and game day from the pool of those whose `requires` hold.
struct DailyGoalDef {
  std::string id;
  std::string label;
  GoalCheckDef check;
  // `requires` in data: has_career, has_work_decisions, has_partner, on_team, match_today, has_phone.
  std::vector<std::string> requirements;
};

struct AspirationStepDef {
  std::string label;
  GoalCheckDef check;
};

// A life aspiration: chosen in the creator (`creator_goal`) or named in a founder's `aspirations`. One the game
// can't follow yet is `tracked: false` with the reason it says, never a pretend progress bar.
struct AspirationDef {
  std::string id;
  std::string label;
  std::string creatorGoal;
  bool tracked = true;
  std::string untrackedReason;
  std::vector<AspirationStepDef> steps;
};

struct GoalsConfig {
  int perDay = 3;
  std::vector<DailyGoalDef> daily;
  std::vector<AspirationDef> aspirations;
};

// How autopilot founders treat people (data/society/manners.json, Autopilot.cpp). Without the section they keep to
// themselves and decline every ask, as they did before the redesign.
struct AutopilotAskRule {
  std::string kind;  // an ask kind (date, kiss...); never intimacy
  StatMap min;       // their own side of the relationship with the asker: dimension -> at least
};

struct AutopilotReplyRule {
  StatMap min;                     // their own side of the relationship with the writer
  bool known = false;              // only someone they've met
  std::vector<std::string> lines;  // "{first}" is the writer's first name
};

struct AutopilotMannersConfig {
  double greetRangeMeters = 20;             // outdoors (inside: anyone in the building); within say range
  std::vector<std::string> greetKnown;       // to someone they know; "{first}" is that person's first name
  std::vector<std::string> greetStranger;    // to someone they've never met
  std::string chatInteraction;               // the interaction a chat is (empty = they never start one)
  std::string chatTrait;                     // the personality trait that makes them chattier
  double chatBase = 0;                       // chance = base + per_trait x trait/100 + per_friendship x friendship/100
  double chatPerTrait = 0;
  double chatPerFriendship = 0;
  std::vector<AutopilotAskRule> asks;        // kinds not listed are declined
  // Messages (D-074): someone it plays reads a message between read_after_minutes after it arrives (awake, in the
  // world, not on shift) and answers with the first rule whose minimums its own side of the relationship meets.
  int readMinMinutes = 2;
  int readMaxMinutes = 20;
  int repliesPerDay = 3;                     // per person writing to it, so a long thread doesn't get endless replies
  std::vector<AutopilotReplyRule> replies;   // empty = it reads (seen) but never answers
};

// --- town life: evenings out and patrols (TownLife.cpp, D-073) ---
// An evening out the autopilot's people may take when their own day leaves the evening free: where, when, who it
// suits (from their own data) and how likely, drawn once per character (or pair) and day from a hash, as the day's
// goals are (D-061), so it never touches the world's random stream.
struct EveningPlanDef {
  std::string id;
  std::string label;                       // what it is, for the log ("Open mic night at the Copper Tap")
  LocationId place;                        // a public place
  std::string activity;                    // the place's activity done there ("" = none)
  std::string offer;                       // the place's offer bought there ("" = the day's everyday purchase)
  std::vector<int> days;                   // weekdays (0 = Monday)
  int from = 0;                            // minute of the day they head out for it
  int minutes = 120;                       // how long they stay
  StatMap personalityMin;                  // it suits someone with all of these at least...
  StatMap valuesMin;
  std::vector<std::string> interestsAny;   // ...and one of these interests (empty: any)
  std::string with;                        // "" alone, "friend" or "partner": drawn once per pair, so both go
  double minFriendship = 0;                // with a friend: their own friendship toward them at least this
  double chance = 0;                       // 0-1, per character (or pair) and day
};

// A beat walked on shift by a career that works outdoors (the police): out of the base, past these places, back.
struct PatrolDef {
  std::string career;
  LocationId base;                         // a workplace of the career, where a round starts and ends
  std::vector<LocationId> beat;            // public places, walked past in order from a stop drawn by the day
  int everyMinutes = 90;                   // a round starts this long after the last one ended
  int stops = 3;                           // places per round
  int lingerMinutes = 6;                   // time on foot at each one
};

struct TownLifeConfig {
  std::vector<EveningPlanDef> evenings;
  std::vector<PatrolDef> patrols;
};

// --- interiors: rooms you walk around in (Interiors.cpp, D-066) ---
// A place's room, traced from its picture (data/interiors/<id>.json). Coordinates are the picture's pixels, so a
// client draws people straight onto it. `facing` is one of the picture's four iso directions, named for the walls
// the art pack cuts away from the south-west: n (up-left, toward the far-left wall), e (up-right), s (down-right,
// toward the viewer) and w (down-left, toward the viewer).
struct InteriorSpotDef {
  std::string id;
  std::string kind;                 // seat, sofa, bed, stool (you sit there), counter, station, stage, fixture, door,
                                    // cell (where an arrest holds you; nobody takes it by choice)
  Vec2 at;                          // where a person's feet are when they stand or sit there
  std::string facing;
  std::string label;
  std::string activity;             // an activity of the place done here ("" = none); a door with none is the way out
  bool offersAll = false;           // a counter selling everything the place sells...
  std::vector<std::string> offers;  // ...or only these offers (a counter, or a seat they're served at: a table, a salon chair)
  bool staff = false;               // a work station: where starting a shift puts you
  bool isSeat() const { return kind == "seat" || kind == "sofa" || kind == "bed" || kind == "stool"; }
  bool sells(const std::string& offer) const {
    return offersAll || std::find(offers.begin(), offers.end(), offer) != offers.end();
  }
};

// Furniture standing on the floor: nobody walks onto it, and clients draw it in front of whoever stands behind it
// (its footprint raised by `height` pixels is the part of the picture that covers them).
struct InteriorBlockDef {
  std::string label;
  std::vector<Vec2> poly;
  double height = 0;
};

struct InteriorDef {
  std::string id;                   // also the picture's id (art/interiors/<id>.webp)
  std::vector<LocationId> places;   // places this room is the inside of (homes may share one picture)
  double width = 0;
  double height = 0;
  double personPx = 120;            // an adult's height in pixels, for drawing people to the picture's scale
  std::vector<std::vector<Vec2>> floor;
  std::vector<InteriorBlockDef> blocked;
  Vec2 entrance;                    // where you are when you come in (or connect, or load a save)
  std::string entranceFacing;
  std::vector<InteriorSpotDef> spots;
  // Where an offer is served: the spots naming it (a table, a salon chair, an exam bed), or, when none does, the
  // counters selling everything.
  bool servedAt(const InteriorSpotDef& s, const std::string& offer) const;
  bool onFloor(Vec2 p) const;       // inside the room's floor
  bool walkable(Vec2 p) const;      // on the floor and not on furniture
  const InteriorSpotDef* spot(const std::string& id) const;
};

// --- life events: moments that happen to you (data/events/*.json, LifeEvents.cpp, D-068) ---
// Money an outcome moves, always through the ledger. `account` is sys:economy, an org account, or one resolved when
// the event happens: "employer" (your career's), "here" (the place it came up) or "landlord" (who you rent from).
// cents > 0 is paid to you, < 0 by you; `via` is your "cash" or "bank".
struct LifeEventMoneyDef {
  Cents cents = 0;
  std::string account;
  std::string via = "bank";
};

// One way a choice can turn out. A choice with several has a chance on each (they add up to 1), rolled from the
// world's saved random stream.
struct LifeEventOutcomeDef {
  double chance = 1;
  std::string text;                 // what happened; {name}, {founder} and {place} are filled in
  StatMap needs;
  StatMap emotions;
  StatMap you;                      // your side of the relationship with the person in the event
  StatMap them;                     // theirs toward you (never shown to you as numbers: `reaction` is)
  std::string reaction;
  std::optional<LifeEventMoneyDef> money;
  std::string memory;               // the memory it leaves (default: the event's title and your choice)
  int memoryImpact = 0;
  int memoryImportance = -1;        // -1 = life_events.memory_importance
  double fame = 0;
};

struct LifeEventChoiceDef {
  std::string label;
  std::vector<LifeEventOutcomeDef> outcomes;
};

// When an event can come up, from what the World knows about you right then. Unset = no condition.
struct LifeEventWhenDef {
  std::optional<bool> outside;
  std::vector<std::string> placeTypes;   // the type of the place you're at
  std::vector<LocationId> places;        // or these places
  std::optional<OpeningHours> hours;     // [from, to) game hours, wrapping past midnight
  std::vector<int> weekdays;             // 0 = Monday
  int minAge = -1;
  int maxAge = -1;
  std::optional<bool> hasCareer;
  std::vector<std::string> careers;
  bool onShift = false;                  // only on a shift (otherwise never during one)
  std::string relationship;              // "single" or "partnered"
  Cents moneyAtLeast = -1;               // cash + bank
  Cents moneyBelow = -1;
  std::vector<std::string> fameTiers;
  std::optional<bool> hasPet;
  std::optional<bool> hasKids;
  std::optional<bool> hasRecord;
  std::string with;                      // someone with you: anyone, known, stranger, coworker, partner, ex
  CharacterId founder;                   // this founder is with you (and isn't you)
  std::vector<std::string> weather;      // today's weather kind
  std::string home;                      // "renting", "owns" or "none"
};

struct LifeEventDef {
  std::string id;
  std::string category;   // work, money, love, friends, family, health, town, temptation, street
  std::string title;
  std::string prompt;
  LifeEventWhenDef when;
  double weight = 1;
  int cooldownDays = 0;   // days before the same event can come up again for the same character
  int lapseMinutes = -1;  // -1 = life_events.lapse_minutes
  std::vector<LifeEventChoiceDef> choices;
};

struct LifeEventsConfig {
  int perDay = 2;
  OpeningHours hours{8, 23, {}};
  int minGapMinutes = 150;
  int checkEveryMinutes = 10;
  int lapseMinutes = 360;
  int memoryImportance = 30;
};

// --- fist fights (data/society/fights.json, Fights.cpp, D-070) ---
struct FightEffectsDef {
  StatMap needs;
  StatMap emotions;
};

struct FightInjuryDef {
  std::string condition;
  double margin = 0;  // the loser's injury is the last one whose margin the winning score beat theirs by
};

// Beat Brawl (D-077): fighting back is played beat by beat. Each beat one fighter throws (hook, jab or shove; or is
// open after a slip or a parry) and the other answers (duck, block or jab) before the beat ends.
struct BrawlRoundDef {
  int beats = 8;
  double seconds = 1.0;  // real seconds a beat lasts
};

struct BrawlMoveDef {
  double base = 1;
  StatMap traits;  // weight added per trait point: a founder's style
};

struct BrawlConfig {
  bool enabled = false;
  std::vector<BrawlRoundDef> rounds;
  double leadIn = 1.5;            // real seconds before the first beat (the screen opens, both square up)
  double tellAt = 0.25;           // the share of a beat before the tell shows, unless you know how they fight
  double perfectFrom = 0.6;       // answering after this share of what's left of the beat is perfect timing
  double perfectMultiplier = 1.5;  // a perfectly timed answer hits this much harder
  double feintChance = 0.2;       // the tell shows another move
  double knownFeintChance = 0.05;  // ...when you know how they fight
  double knownFamiliarity = 60;   // familiarity at which you know how someone fights (or you've seen them fight)
  double composure = 100;
  double edgeMin = 0.6, edgeMax = 1.6;  // a blow lands harder by the score of who throws it over who takes it
  std::map<std::string, double> damage;  // hook, jab, shove, chip, pushed, counter, stuffed
  double trade = 0.7;              // in a trade, the share of their blow you still take
  std::map<std::string, BrawlMoveDef> moves;  // hook, jab, shove: how likely each is
  double marginPerComposure = 0.5;  // the composure between them, times this, is the margin `injuries` reads
  int maxGameMinutes = 180;         // a brawl nobody's clock moves (a dev skip) ends on points after this
};

struct FightsConfig {
  bool enabled = false;
  BrawlConfig brawl;
  std::string crime = "assault";
  double rangeMeters = 3;
  int windowMinutes = 15;
  int attackerCooldownMinutes = 120;
  int protectedMinutes = 480;
  std::vector<std::string> noFightPlaceTypes;
  bool autopilotAtWork = false;   // whether a founder the autopilot plays can be attacked on shift
  std::string autopilotTrait;     // an autopilot founder fights back when this trait is at least...
  double autopilotFightBackAt = 101;  // ...this; otherwise it walks away
  // A fighter's score: base + each skill x its weight + each need x its weight - per_injury for each injury of
  // `injuries` already carried, plus +-noise from the saved random stream.
  double scoreBase = 40, scorePerInjury = 8, scoreNoise = 20;
  StatMap scoreSkills;
  StatMap scoreNeeds;
  double runBase = 0.55, runPerPoint = 0.006, runMin = 0.15, runMax = 0.9, runDistanceMeters = 30;
  std::vector<FightInjuryDef> injuries;
  FightEffectsDef winner, loser, tookIt, attackerHit, ran, walkedAway, attackerWalkedAway;
  double winnerInjuryChance = 0;
  std::string winnerInjury;
  std::string tookItInjury;
  StatMap victimRelationship;    // the person attacked, toward whoever started it
  StatMap attackerRelationship;  // whoever started it, toward the person they attacked
  StatMap witnessRelationship;   // everyone who saw it, toward whoever started it
  double reportChance = 0.7;
  double witnessReportChance = 0.4;
  int importance = 55;
  int impact = -40;
  int witnessImportance = 35;
  int witnessImpact = -15;
};

// --- Social media (Social.cpp, D-074): data/society/social.json ---
// A voice is how someone writes, picked from their personality: the first voice whose minimums and maximums the
// character's traits meet; lines for a voice a moment doesn't have fall back to its "default" lines.
struct SocialVoiceDef {
  std::string id;
  StatMap min;
  StatMap max;
};

// Something that really happened to someone that a character a script plays posts about: a memory of type `memory`
// (or "checkin": walking into a place of one of auto.checkin_place_types).
struct SocialMomentDef {
  std::string memory;
  std::string topic;
  double chance = 1;
  std::map<std::string, std::vector<std::string>> lines;  // voice -> lines; "default" always there
};

// What the gossip account posts about: a witnessed scene of a kind the World reports (fight, argument, arrest, kiss).
struct SocialGossipKindDef {
  std::string kind;
  std::string topic;
  double chance = 1;
  std::vector<std::string> interactions;  // argument: the interactions that are one
  std::vector<std::string> placeTypes;    // only in these kinds of place (empty = anywhere)
  StatMap relationship;                   // how hearing about it changes the hearer's side toward whoever did it
  std::vector<std::string> lines;         // what happened
  std::vector<std::string> twisted;       // what didn't, quite
};

struct SocialConfig {
  bool enabled = false;
  int postMaxLength = 280, postMinGapMinutes = 10, postsPerDay = 12, maxTags = 4;
  int commentMaxLength = 200, commentMinGapMinutes = 1, commentsPerDay = 40, commentsPerPost = 40;
  int likesPerDay = 150;
  int maxFollowing = 200;
  int feedLimit = 40, keptPosts = 600, commentsShown = 3, activityKept = 60, mapPostHours = 6;
  double famePerFollower = 0.4, famePerLike = 0.05, fameMaxPerDay = 2;
  StatMap likeRelationship, commentRelationship, followRelationship;  // the author's side toward who did it
  int notifyPerHour = 4;
  int gameNotifyPerDay = 1;  // of those, the ones the game caused (a post it wrote tagging you, the gossip account)
  // The morning's "Last night in Livéra": public posts from from_hour last night to to_hour, shown until shown_until.
  int lastNightFromHour = 18, lastNightToHour = 6, lastNightShownUntil = 12, lastNightTop = 3;
  StatMap seedFollowMin;  // at a world's founding, people follow whoever they already know this well
  Cents statusMinPriceCents = 0;
  std::vector<std::string> statusCategories, statusExcept;
  std::map<std::string, std::string> topics;  // topic -> label
  int autoPerDay = 3, autoMinGapMinutes = 90, autoDelayMin = 8, autoDelayMax = 75, autoKeepHours = 18;
  std::string autoTrait;
  double autoBase = 0.3, autoPerTrait = 0.6;
  std::vector<std::string> checkinPlaceTypes;
  double checkinTagMinFriendship = 30;
  std::vector<SocialVoiceDef> voices;
  std::vector<SocialMomentDef> moments;
  // The anonymous gossip account.
  std::string unfilteredHandle, unfilteredName, unfilteredBio, unfilteredSecret;
  CharacterId unfilteredRunner;  // whoever's data holds the secret (resolved at load)
  int unfilteredMinHeard = 1, unfilteredDelayMinutes = 30, unfilteredPerDay = 5;
  double unfilteredTwistChance = 0.3;
  std::vector<SocialGossipKindDef> gossipKinds;
  const SocialMomentDef* moment(const std::string& memory) const;
  const SocialGossipKindDef* gossipKind(const std::string& kind) const;
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
  const EducationConfig& education() const { return education_; }
  const CrimeConfig& crime() const { return crime_; }
  const CrimeDef* crimeDef(const std::string& id) const;
  const std::map<std::string, SubstanceDef>& substances() const { return substances_; }
  const SubstanceDef* substance(const std::string& id) const;
  const RomanceConfig& romance() const { return romance_; }
  const FameConfig& fame() const { return fame_; }
  const FamilyConfig& family() const { return family_; }
  const CareActionDef* careAction(const std::string& id) const;
  // m08:homes accessors { Buying homes, mortgages, moving in together (Homes.cpp)
  const HomesConfig& homes() const { return homes_; }
  // } m08:homes

  // m08:work accessors { Work decisions during shifts (WorkTasks.cpp)
  const WorkDecisionsConfig& workDecisions() const { return workDecisions_; }
  const WorkTaskDef* workTask(const std::string& id) const;
  // A career's decisions in data order; empty if it has none.
  const std::vector<std::string>& workTasksFor(const std::string& career) const;
  // } m08:work

  // m08:wallet accessors { Coins, phones and LivPay (Wallet.cpp)
  const WalletConfig& wallet() const { return wallet_; }
  const CoinPackDef* coinPack(const std::string& productId) const;
  const CoinShopEntry* coinShopEntry(const std::string& item) const;
  const PhoneModelDef* phoneModel(const std::string& item) const;
  // } m08:wallet

  // m08:leisure accessors { Sports, date spots and the lake park (Leisure.cpp)
  const LeisureConfig& leisure() const { return leisure_; }
  const LeisureSportDef* leisureSport(const std::string& id) const;
  const LeisureTeamDef* leisureTeam(const std::string& id) const;
  // } m08:leisure

  // m08:pets accessors { Pets and medicine (Pets.cpp)
  const PetConfig& pets() const { return pets_; }
  const PetSpeciesDef* petSpecies(const std::string& id) const;
  const PetActionDef* petAction(const std::string& id) const;
  const VetServiceDef* vetService(const std::string& id) const;
  const MedicineConfig& medicine() const { return medicine_; }
  const MedicineDef* medicineFor(const std::string& item) const;
  // } m08:pets

  // m08:details accessors { Accidents as a big deal, laundry, weather, birthdays, hangovers (Details.cpp)
  const DetailsConfig& details() const { return details_; }
  const WeatherKindDef* weatherKind(const std::string& id) const;
  // } m08:details
  // Redesign: goals (Goals.cpp) and the autopilot's manners (Autopilot.cpp).
  const AutopilotMannersConfig& autopilotManners() const { return manners_; }
  const TownLifeConfig& townLife() const { return townLife_; }  // evenings out and patrols (D-073)
  const PatrolDef* patrolFor(const std::string& careerId) const;
  // life events (LifeEvents.cpp, D-068) and fist fights (Fights.cpp, D-070)
  const LifeEventsConfig& lifeEventsConfig() const { return lifeEvents_; }
  const std::map<std::string, LifeEventDef>& lifeEvents() const { return lifeEventDefs_; }
  const LifeEventDef* lifeEvent(const std::string& id) const;
  const FightsConfig& fights() const { return fights_; }
  const SocialConfig& social() const { return social_; }  // social media (Social.cpp, D-074)
  const GoalsConfig& goals() const { return goals_; }
  const AspirationDef* aspiration(const std::string& id) const;
  const AspirationDef* aspirationForCreatorGoal(const std::string& creatorGoal) const;
  const ProgramDef* program(const std::string& id) const;
  const DegreeDef* degree(const std::string& id) const;
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
  // interiors (Interiors.cpp, D-066): the room a place has, or nullptr (it keeps the scene card).
  const std::map<std::string, InteriorDef>& interiors() const { return interiors_; }
  const InteriorDef* interiorFor(const LocationId& place) const;

 private:
  Status ingest(const std::string& source, const Json& doc);
  // Sections added in M0.8 and later live in ContentMore.cpp; `handled` says whether one matched.
  Status ingestMore(const std::string& source, const std::string& section, const Json& body, bool& handled);
  Status validateMore() const;
  // m08:homes parsing { Buying homes, mortgages, moving in together (Homes.cpp)
  Status ingestHomes(const std::string& source, const std::string& section, const Json& body, bool& handled);
  Status validateHomes() const;
  // } m08:homes

  // m08:work parsing { Work decisions during shifts (WorkTasks.cpp)
  Status ingestWork(const std::string& source, const std::string& section, const Json& body, bool& handled);
  Status validateWork() const;
  // } m08:work

  // m08:wallet parsing { Coins, phones and LivPay (Wallet.cpp)
  Status ingestWallet(const std::string& source, const std::string& section, const Json& body, bool& handled);
  Status validateWallet() const;
  // } m08:wallet

  // m08:leisure parsing { Sports, date spots and the lake park (Leisure.cpp)
  Status ingestLeisure(const std::string& source, const std::string& section, const Json& body, bool& handled);
  Status validateLeisure() const;
  // } m08:leisure

  // m08:pets parsing { Pets and medicine (Pets.cpp)
  Status ingestPets(const std::string& source, const std::string& section, const Json& body, bool& handled);
  Status validatePets() const;
  // } m08:pets

  // m08:details parsing { Accidents as a big deal, laundry, weather, birthdays, hangovers (Details.cpp)
  Status ingestDetails(const std::string& source, const std::string& section, const Json& body, bool& handled);
  Status validateDetails() const;
  // } m08:details
  Status ingestGoals(const std::string& source, const std::string& section, const Json& body, bool& handled);
  Status validateGoals() const;
  Status ingestManners(const std::string& source, const std::string& section, const Json& body, bool& handled);
  Status validateManners() const;
  Status ingestTownLife(const std::string& source, const std::string& section, const Json& body, bool& handled);
  Status validateTownLife() const;
  Status validateCast() const;  // casts, shared homes and starting partners (D-073)
  Status ingestInteriors(const std::string& source, const std::string& section, const Json& body, bool& handled);
  Status ingestLifeEvents(const std::string& source, const std::string& section, const Json& body, bool& handled);
  Status validateLifeEvents() const;
  Status ingestFights(const std::string& source, const std::string& section, const Json& body, bool& handled);
  Status validateFights() const;
  Status ingestSocial(const std::string& source, const std::string& section, const Json& body, bool& handled);
  Status validateSocial();  // resolves the gossip account's runner from the secret, so not const
  Status validateInteriors() const;
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
  EducationConfig education_;
  CrimeConfig crime_;
  std::map<std::string, SubstanceDef> substances_;
  RomanceConfig romance_;
  FameConfig fame_;
  bool haveFamily_ = false;
  FamilyConfig family_;
  // m08:homes members { Buying homes, mortgages, moving in together (Homes.cpp)
  bool haveHomes_ = false;
  HomesConfig homes_;
  // } m08:homes

  // m08:work members { Work decisions during shifts (WorkTasks.cpp)
  bool haveWorkDecisions_ = false;
  WorkDecisionsConfig workDecisions_;
  std::map<std::string, WorkTaskDef> workTasks_;
  std::map<std::string, std::vector<std::string>> workTasksByCareer_;
  // } m08:work

  // m08:wallet members { Coins, phones and LivPay (Wallet.cpp)
  WalletConfig wallet_;
  // } m08:wallet

  // m08:leisure members { Sports, date spots and the lake park (Leisure.cpp)
  bool haveLeisure_ = false;
  LeisureConfig leisure_;
  // } m08:leisure

  // m08:pets members { Pets and medicine (Pets.cpp)
  bool havePets_ = false;
  PetConfig pets_;
  bool haveMedicine_ = false;
  MedicineConfig medicine_;
  // } m08:pets

  // m08:details members { Accidents as a big deal, laundry, weather, birthdays, hangovers (Details.cpp)
  bool haveDetails_ = false;
  DetailsConfig details_;
  // } m08:details
  bool haveGoals_ = false;
  GoalsConfig goals_;
  bool haveManners_ = false;
  AutopilotMannersConfig manners_;
  bool haveEvenings_ = false;
  bool havePatrols_ = false;
  TownLifeConfig townLife_;
  std::map<std::string, InteriorDef> interiors_;            // interiors (Interiors.cpp)
  std::map<LocationId, std::string> interiorByPlace_;
  bool haveLifeEvents_ = false;                              // life events (LifeEvents.cpp)
  LifeEventsConfig lifeEvents_;
  std::map<std::string, LifeEventDef> lifeEventDefs_;
  FightsConfig fights_;                                      // fist fights (Fights.cpp)
  SocialConfig social_;                                      // social media (Social.cpp)
};

}  // namespace livera
