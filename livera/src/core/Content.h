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
  // Aging follows the calendar: a birthday once a game year (Clock.h), so a pregnancy is
  // nine months and a child grows up in eighteen years of the same calendar.
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
};

}  // namespace livera
