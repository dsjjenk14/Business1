#pragma once

#include <functional>
#include <map>
#include <memory>
#include <optional>
#include <set>
#include <string>
#include <utility>
#include <vector>

#include "core/Content.h"
#include "core/Ledger.h"
#include "core/Types.h"

namespace livera {

// ---------------------------------------------------------------------------------
// Runtime state. Everything here is authoritative, server-owned, and persisted.
// Static descriptions (names, personality, prices) stay in ContentDatabase.
// ---------------------------------------------------------------------------------

// Simulation fidelity tiers (docs/SIMULATION.md). Tier 2 is reserved for autonomous
// NPCs, which arrive in Phase 9; the founding slice only has Active and Dormant.
enum class SimTier { Active = 1, Background = 2, Dormant = 3 };

struct CareerState {
  std::string careerId;
  int level = 0;
  double hoursAtLevel = 0;
  double performance = 60;  // 0..100
  Cents lifetimeEarningsCents = 0;
  std::optional<GameMinutes> shiftStartedAt;
  LocationId shiftLocation;
  double shiftWellbeingSum = 0;  // per-minute samples of average need while on shift
  int shiftSamples = 0;
};

// An illness, infection, addiction or depression a character has right now.
struct ConditionState {
  std::string id;
  GameMinutes since = 0;
  GameMinutes until = -1;  // -1 = until treated
  bool diagnosed = false;  // a doctor (or a test) has named it
  double recovery = 0;     // 0..100 toward recovery, for conditions cured by care over time
};

// A conviction: what the police caught you doing (data/society/crimes.json).
struct CrimeRecordEntry {
  std::string crime;
  GameMinutes at = 0;
  Cents fineCents = 0;
  GameMinutes jailMinutes = 0;
};

struct EducationState {
  std::string program;          // enrolled program, empty = not enrolled
  double hours = 0;             // study hours credited toward it
  double gradeSum = 0;          // per-session grades, averaged for graduation
  int sessions = 0;
  std::vector<std::string> degrees;
  // Session state (not saved): a study session in progress.
  std::optional<GameMinutes> sessionStartedAt;
  LocationId sessionPlace;
  double sessionWellbeingSum = 0;
  int sessionSamples = 0;
};

struct PregnancyState {
  CharacterId partner;
  GameMinutes conceivedAt = 0;
  GameMinutes dueAt = 0;
  bool known = false;       // a test or a doctor confirmed it
  int prenatalVisits = 0;
  double risk = 1.0;        // multiplier on miscarriage risk from what happened along the way
};

// ---- M0.8 feature state (each block belongs to one feature; see docs/m08/) ----
// m08:homes state { Buying homes, mortgages, moving in together (Homes.cpp)
// A home loan from the lender in data (homes.lender). The schedule moves on every month; a
// payment that couldn't be made is owed on top of it as arrears, and enough of those in a row
// and the bank takes the home.
struct MortgageState {
  LedgerAccountId lender;
  Cents principalCents = 0;  // borrowed at purchase
  Cents balanceCents = 0;    // still owed on the schedule
  Cents paymentCents = 0;    // the monthly payment (standard amortization), fixed at purchase
  double annualRate = 0;
  int termMonths = 0;
  int monthsLeft = 0;
  int missedPayments = 0;    // payments behind
  Cents arrearsCents = 0;    // what those missed payments and their late fees add up to
  GameMinutes startedAt = 0;
};
// } m08:homes

// m08:work state { Work decisions during shifts (WorkTasks.cpp)
// One answered work decision, as it was applied.
struct WorkAnswer {
  std::string task;
  int option = 0;                // the option's index in the bank (the order shown is shuffled per day)
  double score = 0;              // 0..1; 1 is the best call
  double performanceChange = 0;  // after clamping to 0..100
  double bonusHours = 0;         // promotion hours it added
  GameMinutes at = 0;
  std::int64_t day = -1;         // the game day it was one of the decisions for
  bool reported = false;         // already in a shift report (so a report never repeats it)
};

// A character's decisions at work: today's draw from the career's bank, the answers, how
// often each task has come up (so the days work through the whole bank), and the decision
// bonus counted toward the current title.
struct WorkDecisionsState {
  std::int64_t day = -1;                     // the game day `tasks` were drawn for
  std::string career;                        // and the career they were drawn from
  std::vector<std::string> tasks;            // today's decisions, in the order they're shown
  std::vector<WorkAnswer> answers;           // today's (and, until the shift ends, the shift's)
  std::map<std::string, int> drawn;          // task id -> how many days it has come up
  std::int64_t nudgedDay = -1;               // the day the phone last said decisions were waiting
  std::string bonusCareer;                   // the bonus belongs to this career and level only
  int bonusLevel = -1;
  double bonusHours = 0;
  int answeredTotal = 0;                     // lifetime
  int bestTotal = 0;
};
// } m08:work

// m08:wallet state { Coins, phones and LivPay (Wallet.cpp)
// Coins live in their own zero-sum ledger, apart from dollars: accounts "coins:<character>", and
// the issuer "sys:coin_store" (the only account allowed below zero: minus the coins in circulation).
inline constexpr const char* kCoinIssuerAccount = "sys:coin_store";
LedgerAccountId coinAccountOf(const CharacterId& id);

// A store receipt that has been credited. Kept forever, so a receipt can never be credited twice.
struct CoinReceipt {
  std::string receipt;
  CharacterId character;
  std::string product;
  std::int64_t coins = 0;
  Cents priceUsdCents = 0;
  GameMinutes at = 0;
  bool test = false;  // a test purchase (test payment provider): no real money changed hands
  std::string tx;     // the coin ledger transaction
};

// The phone in your hand. Spare phones are ordinary inventory items.
struct PhoneState {
  std::string model;     // item id; empty = no phone
  double battery = 100;  // 0..100; at 0 the phone is dead
  std::string phoneCase; // a fitted case (item id), cosmetic
};
// } m08:wallet

// m08:leisure state { Sports, date spots and the lake park (Leisure.cpp)
// A team's row in the league table.
struct LeisureStanding {
  int played = 0;
  int won = 0;
  int drawn = 0;
  int lost = 0;
  int scored = 0;
  int conceded = 0;
  int points = 0;
};

// A league match: in play from kickoff, then a result kept for the sports app.
struct LeisureMatch {
  std::string id;
  std::string sport;
  std::string home;  // team ids
  std::string away;
  GameMinutes kickoff = 0;
  GameMinutes endsAt = 0;
  std::vector<CharacterId> homeLineup;  // players at the venue at kickoff
  std::vector<CharacterId> awayLineup;
  double homeStrength = 0;  // fixed at kickoff
  double awayStrength = 0;
  bool finished = false;
  int homeScore = 0;
  int awayScore = 0;
  bool overtime = false;
};
// } m08:leisure

// m08:pets state { Pets and medicine (Pets.cpp)
// An animal in Livéra: someone's pet, or back at the shelter (owner empty) after animal control
// took it. Animals the shelter lists each week aren't in the state until they're adopted.
struct PetState {
  std::string id;
  std::string name;
  std::string species;
  std::string breed;
  CharacterId owner;            // empty = at the shelter
  std::string home;             // property id it lives at; empty at the shelter
  GameMinutes bornAt = 0;
  StatMap needs;                // hunger, fun, hygiene, health (0..100)
  std::map<CharacterId, double> bond;  // with the owner, and anyone else at home who cares for it (0..100)
  std::string illness;          // empty = healthy
  bool illnessKnown = false;    // a vet has said what it is
  GameMinutes vaccinatedUntil = -1;
  GameMinutes adoptedAt = -1;
  GameMinutes starvingSince = -1;  // hunger at 0 since then
  bool hungerWarned = false;
  bool healthWarned = false;    // the household was told it's very weak
  std::string stage;            // last life stage the household was told about
  CharacterId takenFrom;        // animal control took it from them; the shelter won't give it back
  std::map<std::string, GameMinutes> readyAt;  // care action -> next minute it helps again
};

// Written by a doctor at a diagnosis; filled at the pharmacy.
struct PrescriptionState {
  std::string medicine;  // item id
  std::string condition; // what it was written for
  int refillsLeft = 0;   // fills left
  GameMinutes writtenAt = 0;
  GameMinutes expiresAt = 0;
  std::string writtenBy; // the clinic or hospital
};
// } m08:pets

// m08:details state { Accidents as a big deal, laundry, weather, birthdays, hangovers (Details.cpp)
// Clothes, drinks: the small things a character carries around.
struct DetailsCharacterState {
  std::map<std::string, double> wornHours;  // clothing item -> hours worn since its last wash
  std::vector<std::string> soiled;          // clothing ruined until washed
  std::vector<GameMinutes> drinks;          // recent alcoholic drinks, for the morning after
};

struct WeatherDay {
  std::string kind;
  double tempC = 0;
};

// Something people saw and keep telling their friends about.
struct Rumor {
  CharacterId about;
  std::string what;                 // "wet himself at The Copper Tap"
  GameMinutes at = 0;
  GameMinutes until = 0;            // witnesses stop spreading it after this
  std::vector<CharacterId> tellers; // the witnesses
  std::vector<CharacterId> knows;   // everyone who knows: witnesses and those they told
};

struct DetailsWorldState {
  std::int64_t weatherDay = -1;  // the game day `today` is for; -1 = not rolled yet
  WeatherDay today;
  WeatherDay tomorrow;
  std::vector<Rumor> rumors;
};
// } m08:details

// Life events (LifeEvents.cpp, D-068): one that has come up and waits for your answer until it lapses.
struct LifeEventOffer {
  std::string event;
  CharacterId with;    // the person in it, picked from who was with you when it came up ("" = nobody)
  LocationId place;    // where it came up ("" = out on the street)
  GameMinutes at = 0;
  GameMinutes lapsesAt = 0;
};

struct LifeEventsState {
  std::int64_t day = -1;                         // the game day `offeredToday` counts
  int offeredToday = 0;
  GameMinutes lastOfferAt = -1;
  std::vector<LifeEventOffer> pending;
  std::map<std::string, std::int64_t> lastDay;   // event -> the game day it last came up (its cooldown)
  int answered = 0;                              // lifetime
};

// Street life (Fights.cpp, D-070): your own rules for fights, and the limits that keep anyone from being harassed.
struct StreetState {
  bool walkAway = false;                       // always walk away from a fight (chosen in the You card)
  std::map<CharacterId, std::int64_t> fought;  // the other person -> the game day of your last fight together
  GameMinutes nextFightAt = -1;                // having started one, you can't start another before this
  GameMinutes protectedUntil = -1;             // having been attacked, nobody can start one with you before this
};

struct CharacterState {
  CharacterId id;
  Vec2 position;
  std::optional<Vec2> moveTarget;
  LocationId inside;  // empty = outdoors
  StatMap needs;
  StatMap emotions;
  CareerState career;
  bool online = false;
  GameMinutes lastSimulatedAt = 0;
  Cents rentArrearsCents = 0;
  StatMap skills;  // keys from simulation.skills; 0..100, grow with practice
  // Body and life.
  GameMinutes bornAt = 0;     // age is derived from this and life.aging.game_days_per_year
  int lastBirthdayAge = 0;
  double heightCm = 170;
  double weightKg = 0;        // 0 = not set yet (filled in from height and a healthy BMI)
  double caloriesIn = 0;      // eaten since the last hourly body update
  double caloriesOut = 0;     // burned since the last hourly body update
  std::vector<ConditionState> conditions;
  GameMinutes lastOnlineAt = -1;  // -1 = never played: an unplayed character just lives their routine
  std::map<std::string, int> inventory;  // item id -> how many
  std::string outfit;     // worn item ids
  std::string accessory;
  std::vector<CrimeRecordEntry> record;  // criminal record
  EducationState education;
  StatMap dependency;        // substance id -> 0..100; addiction past the threshold
  std::string highOn;        // a substance still in effect
  GameMinutes highUntil = -1;
  std::string wantedFor;     // a reported crime the police haven't arrested you for yet
  GameMinutes jailedUntil = -1;
  double fame = 0;           // 0..100
  std::optional<PregnancyState> pregnancy;
  std::vector<CharacterId> parents;  // family: who you were born to (in the world)
  // Childhood: where a child is enrolled, how school is going, and who is looking after them.
  std::string childcare;             // "school", "daycare" or empty
  double schoolGradeSum = 0;         // per school day attended
  int schoolDays = 0;
  double schoolBonusToday = 0;       // homework help and bedtime stories count toward today's grade
  double unsupervisedHoursToday = 0; // a child under the supervision age left alone
  CharacterId childcarePayer;        // the parent who enrolled them and pays the daycare
  std::int64_t childcarePaidDay = -1;
  CharacterId nannyFor;              // a nanny: the parent whose family employs them
  bool rebaseAge = false;            // session: born_at was saved under the old aging rule (fixed on load)
  // m08:homes character { Buying homes, mortgages, moving in together (Homes.cpp)
  // } m08:homes

  // m08:work character { Work decisions during shifts (WorkTasks.cpp)
  WorkDecisionsState workDecisions;
  // } m08:work

  // m08:wallet character { Coins, phones and LivPay (Wallet.cpp)
  PhoneState phone;
  // Battery left in spare phones you've put away, per model. A spare without an entry is new in the box (full).
  std::map<std::string, std::vector<double>> spareBatteries;
  // } m08:wallet

  // m08:leisure character { Sports, date spots and the lake park (Leisure.cpp)
  std::vector<std::string> leisureTeams;  // town teams you play for, at most one per sport
  int leisureMatchesPlayed = 0;
  int leisureMatchesWon = 0;
  // } m08:leisure

  // m08:pets character { Pets and medicine (Pets.cpp)
  std::vector<PrescriptionState> prescriptions;
  std::map<std::string, std::vector<GameMinutes>> medicineDoses;  // item -> doses within the dose window
  // } m08:pets

  // m08:details character { Accidents as a big deal, laundry, weather, birthdays, hangovers (Details.cpp)
  DetailsCharacterState detail;
  // } m08:details
  LifeEventsState lifeEvents;  // life events (LifeEvents.cpp, D-068)
  StreetState street;           // fights (Fights.cpp, D-070)
  // Session state (not saved):
  std::map<std::string, GameMinutes> activityReadyAt;  // "location/activity" -> minute
  GameMinutes performReadyAt = 0;
  std::map<std::string, GameMinutes> itemReadyAt;
  double moveSpeedMps = 0;  // > 0 while riding: overrides walking speed until arrival
  std::map<std::string, std::vector<GameMinutes>> recentUses;  // substance -> when, for overdoses
  std::map<CharacterId, GameMinutes> pickpocketedAt;           // victim -> when
  GameMinutes asleepSince = -1;  // in bed (World::sleep) since then; -1 = awake (Sleep.cpp)

  SimTier tier() const { return online ? SimTier::Active : SimTier::Dormant; }
};

// Directional: A's feelings about B are a different record from B's about A.
struct RelationshipState {
  StatMap dimensions;
  std::string status;       // dating, engaged, married, ex, divorced; the same on both sides
  GameMinutes statusSince = -1;
  GameMinutes firstMetAt = -1;
  GameMinutes lastInteractionAt = -1;
  int interactionCount = 0;
};
using RelationshipKey = std::pair<CharacterId, CharacterId>;  // (from, to)

// A memory belongs to one character: two people at the same event remember it separately.
struct Memory {
  std::string id;
  CharacterId owner;
  GameMinutes at = 0;
  std::vector<CharacterId> participants;
  LocationId location;
  std::string type;
  int emotionalImpact = 0;  // -100..100
  int importance = 0;       // 0..100
  CharacterId about;        // the relationship this memory colours, if any
  std::string info;
  bool isPublic = false;
};

struct Message {
  std::string id;
  CharacterId from;
  CharacterId to;
  GameMinutes at = 0;
  std::string body;
  bool read = false;
};

struct Notification {
  std::string id;
  CharacterId recipient;
  GameMinutes at = 0;
  std::string kind;
  std::string text;
  bool read = false;
};

struct PropertyState {
  std::string id;
  LedgerAccountId ownerAccount;  // paid the rent; for a home a character bought, the first owner's bank
  CharacterId tenant;  // the lease holder; an owned home's owner who lives there (else its first owner); empty = vacant
  double cleanliness = 80;  // 0..100: housework keeps it up
  double trash = 0;         // 0..100: full trash makes a home get dirty faster
  // Homes (Homes.cpp; saved in the homes world part). A home for sale is on the market while no
  // character owns it.
  std::vector<CharacterId> residents = {};  // the adults who live here (children: their homeProperty)
  std::vector<CharacterId> owners = {};     // characters who bought it, alone or together
  std::optional<MortgageState> mortgage = {};
};

enum class ConstructionStatus { Planned, Active, Complete };

struct ConstructionState {
  std::string id;
  ConstructionStatus status = ConstructionStatus::Planned;
  double workerHoursDone = 0;
  GameMinutes completedAt = -1;
};

// Music. Time is in sixteenth-note steps: 4 steps per beat, 16 per bar, 256 max (16 bars).
struct Note {
  int step = 0;
  int pitch = 60;  // MIDI note number; for drums, a General MIDI drum sound
  int length = 1;  // in steps
  int velocity = 100;
};

struct SongTrack {
  std::string instrument;
  std::vector<Note> notes;
};

struct Song {
  std::string id;
  CharacterId owner;
  std::string title;
  int bpm = 100;
  std::vector<SongTrack> tracks;
  GameMinutes createdAt = 0;
  GameMinutes updatedAt = 0;
  bool released = false;  // released songs are public and can no longer be edited
  int plays = 0;          // listens by others plus audience members at performances
};

inline constexpr int kSongMaxSteps = 256;
inline constexpr int kSongMaxTracks = 4;
inline constexpr int kSongMaxNotesPerTrack = 512;
inline constexpr int kMaxSongsPerCharacter = 50;

struct CityState {
  StatMap stats;  // population, housing_units, jobs, businesses...
  int stage = 1;
};

// An ask that needs the other person's yes: a date, a proposal, a wedding, intimacy.
struct PendingRequest {
  std::string id;
  std::string kind;
  CharacterId from;
  CharacterId to;
  GameMinutes expires = 0;
  bool protection = false;
  std::string subject = {};  // what it's about: the home to buy or sell together
};

// A fight someone started: the person attacked has until `expires` to fight back, run or take it (Fights.cpp, D-070).
struct PendingFight {
  std::string id;
  CharacterId attacker;
  CharacterId defender;
  GameMinutes startedAt = 0;
  GameMinutes expires = 0;
};

// A fight being fought, beat by beat (Fights.cpp, D-077): session state, like the fight it came from.
struct Brawl {
  std::string id;                  // the fight's id
  CharacterId attacker, defender;  // who started it, who was attacked
  GameMinutes startedAt = 0;
  int round = 0, beat = 0;         // where it is, from 0
  int count = 0;                   // beats so far: between two people, whose turn it is to throw
  double elapsed = 0;              // real seconds into this beat
  double tellDelay = 0;            // real seconds into the beat when the tell shows
  bool shown = false;              // the tell is out
  CharacterId striker, actor;      // who throws this beat, who answers
  std::string move;                // what the striker really throws: hook, jab, shove, or open
  std::string tell;                // what the one answering is shown
  std::string answer;              // duck, block, jab, or empty: no answer yet
  double answeredAt = -1;          // real seconds into the beat
  CharacterId open;                // who is open next beat (they were slipped or parried)
  std::map<CharacterId, double> composure;
  std::map<CharacterId, double> dealt;  // what each has landed
};

struct WorldState {
  GameMinutes now = 0;
  double clockCarry = 0;  // fractional game minutes not yet applied
  std::uint64_t nextId = 1;
  std::uint64_t rng = 0x9E3779B97F4A7C15ull;  // the world's random stream: saved, so outcomes replay the same
  std::map<CharacterId, CharacterState> characters;
  std::map<RelationshipKey, RelationshipState> relationships;
  std::vector<Memory> memories;
  Ledger ledger;
  std::vector<Message> messages;
  std::vector<Notification> notifications;
  std::map<std::string, PropertyState> properties;
  std::map<std::string, ConstructionState> construction;
  CityState city;
  // Characters made in the character creator. Founding characters live in content.
  std::map<CharacterId, CharacterDef> createdCharacters;
  std::map<std::string, Song> songs;
  std::vector<PendingRequest> requests;  // session state: asks expire in minutes and aren't saved
  std::vector<PendingFight> fights;      // session state: fights waiting for an answer (Fights.cpp)
  std::vector<Brawl> brawls;             // session state: fights being fought, beat by beat (Fights.cpp)
  // m08:homes world { Buying homes, mortgages, moving in together (Homes.cpp)
  // } m08:homes

  // m08:work world { Work decisions during shifts (WorkTasks.cpp)
  // } m08:work

  // m08:wallet world { Coins, phones and LivPay (Wallet.cpp)
  Ledger coins;
  std::map<std::string, CoinReceipt> coinReceipts;  // by receipt id
  // } m08:wallet

  // m08:leisure world { Sports, date spots and the lake park (Leisure.cpp)
  std::map<std::string, LeisureStanding> leisureStandings;  // team id -> league table row
  std::vector<LeisureMatch> leisureMatches;                 // in play, then the latest results (oldest first)
  std::map<std::string, std::int64_t> leisureDates;         // "a|b|place" -> the game day a date there last counted
  // } m08:leisure

  // m08:pets world { Pets and medicine (Pets.cpp)
  std::map<std::string, PetState> pets;
  std::map<std::string, CharacterId> adoptedListings;  // this week's shelter listings already adopted -> by whom
  std::int64_t shelterWeek = -1;                       // the week those listings belong to
  // } m08:pets

  // m08:details world { Accidents as a big deal, laundry, weather, birthdays, hangovers (Details.cpp)
  DetailsWorldState details;
  // } m08:details
};

// Something a connected client should hear about. The server routes it; the world
// never knows about sockets.
struct WorldEvent {
  std::vector<CharacterId> recipients;
  std::string type;
  Json data;
};

// What a viewer was last told about someone in sight, for the `people` stream (World::emitPeopleChanges).
// Session state: never saved, rebuilt from nothing when a viewer connects.
struct SeenPerson {
  LocationId inside;
  Vec2 position;
  std::optional<Vec2> target;  // only while actually travelling (outdoors with a move target); for someone
                               // else, cut short where they would leave the viewer's sight (World::seenBy)
  std::optional<Vec2> trueTarget;  // where they are really going: a new destination is news even if `target` isn't
  double speedMps = 0;         // 0 when still
  bool bus = false;            // riding (moveSpeedMps > 0)
  bool scripted = false;
  std::string uniform;  // a police officer on duty (D-069): anyone can see the uniform
};

// interiors: where someone is in the room of the place they're inside (Interiors.cpp, D-066). Session state, never
// saved: on connect, on loading a save and on coming in you're at the entrance.
struct RoomPlace {
  LocationId place;
  Vec2 at;           // the room picture's pixels
  std::string spot;  // the seat, counter, stage... they hold; "" = standing on the floor
  bool operator==(const RoomPlace&) const = default;
};

LedgerAccountId bankAccountOf(const CharacterId& id);
LedgerAccountId cashAccountOf(const CharacterId& id);

// ---------------------------------------------------------------------------------
// World: the authoritative simulation. Every mutation a player can cause goes through
// one of the command methods below, each of which validates the request against the
// current state first. Clients only ever express intent.
// ---------------------------------------------------------------------------------
class World {
 public:
  static World createNew(std::shared_ptr<const ContentDatabase> content);
  World(std::shared_ptr<const ContentDatabase> content, WorldState state);

  const ContentDatabase& content() const { return *content_; }
  std::shared_ptr<const ContentDatabase> contentPtr() const { return content_; }
  const WorldState& state() const { return state_; }
  GameMinutes now() const { return state_.now; }

  // --- Time -----------------------------------------------------------------------
  // Real time drives movement and the clock (at the configured rate). Each call ends by telling every
  // online character what changed among the people they can see (the `people` event).
  void advanceRealTime(double seconds);
  // Steps the world minute by minute so rent, construction and needs all fire in order.
  void advanceMinutes(GameMinutes minutes);

  // --- Presence ---------------------------------------------------------------------
  Status connect(const CharacterId& id);  // brings a Dormant character back to Active
  void disconnect(const CharacterId& id);
  // A script is playing this character right now: a bot_* account's session ("script") or the core's
  // Autopilot ("autopilot"). Set by whoever drives them when they enter the world and cleared when they
  // leave; shown to everyone who can see them as `scripted` plus `played_by`. Not saved.
  void setScripted(const CharacterId& id, bool scripted, const std::string& playedBy = "script");
  bool isScripted(const CharacterId& id) const;
  std::string playedBy(const CharacterId& id) const;  // "" when nobody scripted plays them
  // Uniform [0, 1) from the world's saved random stream (so outcomes replay the same from a save).
  // Public so the Autopilot can jitter its waits from the same stream instead of a second one.
  double roll();

  // --- Commands (the authority boundary) -------------------------------------------
  Status moveTo(const CharacterId& actor, Vec2 target);
  Status enter(const CharacterId& actor, const LocationId& location);
  Result<Json> exitBuilding(const CharacterId& actor);
  Result<Json> interact(const CharacterId& actor, const std::string& interactionId, const CharacterId& target);
  Result<Json> buy(const CharacterId& actor, const std::string& offerId, const std::string& paymentMethod);
  Result<Json> useActivity(const CharacterId& actor, const std::string& activityId);
  Status startShift(const CharacterId& actor);
  Result<Json> endShift(const CharacterId& actor);
  Result<std::string> sendMessage(const CharacterId& from, const CharacterId& to, const std::string& body);
  // Proximity chat. volume: "say" (people near you), "shout" (further), "whisper" (one person).
  Result<Json> say(const CharacterId& actor, const std::string& text, const std::string& volume,
                   const CharacterId& whisperTo = "");
  Result<Json> tip(const CharacterId& actor, const CharacterId& target, Cents amount);

  // --- Character creator (CharacterCreator.cpp) -------------------------------------
  // Validates a creator submission against content and founds a new resident. Returns its id.
  Result<CharacterId> createCharacter(const Json& spec);
  Json creatorOptions() const;

  // --- Music (Music.cpp) -------------------------------------------------------------
  // Creates a song (empty songId) or updates an unreleased song you own.
  Result<Json> saveSong(const CharacterId& actor, const Json& spec, const std::string& songId);
  Result<Json> releaseSong(const CharacterId& actor, const std::string& songId);
  // Full note data, for playback or export. Listening to someone else's song counts a play.
  Result<Json> openSong(const CharacterId& actor, const std::string& songId);
  Result<Json> perform(const CharacterId& actor, const std::string& songId);
  // Opening some apps has effects (messages/notifications are marked read).
  Result<Json> openPhoneApp(const CharacterId& actor, const std::string& app);

  // --- Body and life (Life.cpp) --------------------------------------------------------
  int ageOf(const CharacterId& id) const;
  std::string lifeStageOf(const CharacterId& id) const;
  bool hasCondition(const CharacterId& id, const std::string& condition) const;
  double bmiOf(const CharacterState& c) const;
  // --- Things and getting around (Items.cpp) ------------------------------------------
  Result<Json> useItem(const CharacterId& actor, const std::string& item);
  Result<Json> wear(const CharacterId& actor, const std::string& item);
  Result<Json> takeOff(const CharacterId& actor, const std::string& slot);
  Result<Json> giveItem(const CharacterId& actor, const CharacterId& target, const std::string& item);
  // Board at the stop you're standing at and ride to another stop. pay = false is fare evasion.
  Result<Json> ride(const CharacterId& actor, const std::string& toStop, bool pay);
  bool owns(const CharacterId& id, const std::string& item) const;

  // --- School and work (Education.cpp) ---------------------------------------------------
  Result<Json> enroll(const CharacterId& actor, const std::string& program);
  Status startStudy(const CharacterId& actor);
  Result<Json> endStudy(const CharacterId& actor);
  // Apply in person at the workplace; hired at the first level if you meet the requirements.
  Result<Json> applyForJob(const CharacterId& actor, const std::string& career);
  bool hasDegree(const CharacterId& id, const std::string& degree) const;
  // A career's entry requirements, the one rule `apply` and the character creator share: the degree it needs
  // (missing_degree) and a clean record (criminal_record).
  Status meetsEntryRequirements(const CareerDef& career, const std::vector<std::string>& degrees,
                                bool hasRecord) const;

  // --- Crime and the police (Crime.cpp) ---------------------------------------------------
  Result<Json> steal(const CharacterId& actor, const std::string& offer);
  Result<Json> pickpocket(const CharacterId& actor, const CharacterId& target);
  // A police officer on duty arrests a wanted person they're with.
  Result<Json> arrest(const CharacterId& officer, const CharacterId& suspect);
  bool inJail(const CharacterId& id) const;
  // What a crime risks right now, from what anyone could see (D-069): the chance of being caught in the act (null
  // where you aren't where it would happen), who would see it, and the consequence ladder from data. Read-only.
  // crime: shoplifting (offer optional), pickpocketing (target), drug_purchase, fare_evasion, assault (target).
  Result<Json> crimeRisk(const CharacterId& actor, const std::string& crime, const CharacterId& target = "") const;
  // A police officer on shift, whom anyone can see in uniform.
  bool onDutyPolice(const CharacterState& c) const;

  // --- Life events (LifeEvents.cpp, D-068) ------------------------------------------------
  // Answer an event that came up (`life_event`): the choice's outcome is applied through the World's own rules
  // (money only by Ledger::transfer). Refusals: unknown_event (not yours, answered or lapsed), bad_option,
  // insufficient_funds (what the choice costs, before anything happens), in_jail.
  Result<Json> answerLifeEvent(const CharacterId& actor, const std::string& event, int option);

  // --- Fist fights (Fights.cpp, D-070) ------------------------------------------------------
  // Start a fight with someone within fights.range_m. They answer with respondToFight within the window, unless
  // they always walk away or a script plays them (then it's decided at once). See Fights.cpp for every refusal.
  Result<Json> startFight(const CharacterId& actor, const CharacterId& target);
  // choice: fight_back, run, take_it.
  Result<Json> respondToFight(const CharacterId& actor, const std::string& fight, const std::string& choice);
  Result<Json> setWalkAwayFromFights(const CharacterId& actor, bool walkAway);
  // Beat Brawl (D-077): your answer to this beat's tell (duck, block, jab), or walk_away at any beat.
  Result<Json> fightBeat(const CharacterId& actor, const std::string& fight, const std::string& answer);
  bool inBrawl(const CharacterId& id) const;
  // You know how someone fights (their tell shows at once, they hardly feint) if you know them well or have seen them
  // fight before.
  bool knowsHowTheyFight(const CharacterId& viewer, const CharacterId& fighter) const;

  // --- Romance and family (Romance.cpp) ---------------------------------------------------
  // kind: date, kiss, propose, marry, intimacy; buy_home, move_in, sell_home (Homes.cpp; `subject`
  // is the home to buy or sell). The other person answers with respond().
  Result<Json> request(const CharacterId& actor, const std::string& kind, const CharacterId& target,
                       bool protection = false, const std::string& subject = "");
  Result<Json> respond(const CharacterId& actor, const std::string& requestId, bool accept);
  // Break up (dating or engaged) or divorce (married). One person can end it.
  Result<Json> endRelationship(const CharacterId& actor, const CharacterId& partner);
  Result<Json> nameBaby(const CharacterId& parent, const CharacterId& baby, const std::string& firstName);
  // --- Children (Family.cpp): care, school and daycare, a nanny -------------------------------
  // A parent (or the family's nanny on shift) at home with a child: feed, bathe, play, read, homework.
  Result<Json> careFor(const CharacterId& actor, const CharacterId& child, const std::string& action);
  // A parent enrols a child in school or daycare, in person; "" withdraws them.
  Result<Json> enrollChild(const CharacterId& parent, const CharacterId& child, const std::string& where);
  // A parent hires a nanny (who must have the nanny career and say yes), or lets one go.
  Result<Json> hireNanny(const CharacterId& parent, const CharacterId& nanny);
  Result<Json> dismissNanny(const CharacterId& parent);
  bool isParentOf(const CharacterId& parent, const CharacterId& child) const;
  bool supervised(const CharacterState& child) const;
  std::vector<CharacterId> childrenOf(const CharacterId& parent) const;

  // m08:homes commands { Buying homes, mortgages, moving in together (Homes.cpp)
  // Buy a home for sale on your own, in person at its door. downPaymentCents 0 = the minimum;
  // the lender covers the rest with a mortgage. You move in. (Together: request kind=buy_home.)
  Result<Json> buyHome(const CharacterId& actor, const std::string& property, Cents downPaymentCents = 0);
  // Stop living where you live. A co-owner stays an owner; a lease passes to whoever stays.
  Result<Json> moveOut(const CharacterId& actor);
  // Move (back) into a home you own, in person.
  Result<Json> moveHome(const CharacterId& actor, const std::string& property);
  // Sell a home you own alone to the market at its value; the mortgage is paid off first.
  // A co-owned home needs the other owner's yes: request kind=sell_home.
  Result<Json> sellHome(const CharacterId& actor, const std::string& property);
  // } m08:homes

  // m08:work commands { Work decisions during shifts (WorkTasks.cpp)
  // Today's decisions at work, on shift only: up to work_decisions.per_day, options shuffled
  // per day, scores and explanations kept back until answered.
  Result<Json> workTasks(const CharacterId& actor);
  // Answer one of today's decisions, once. `option` is its index in the order workTasks sent.
  Result<Json> answerWorkTask(const CharacterId& actor, const std::string& task, int option);
  // } m08:work

  // m08:wallet commands { Coins, phones and LivPay (Wallet.cpp)
  // Credits a coin pack bought with real money, exactly once per store receipt id. The caller (the
  // server's payment verifier) has already verified the receipt; `test` marks a test purchase.
  Result<Json> creditCoins(const CharacterId& actor, const std::string& productId, const std::string& receiptId,
                           bool test);
  // The coin shop (phone app "store"): delivered to your inventory.
  Result<Json> buyWithCoins(const CharacterId& actor, const std::string& item);
  // Takes a phone out of your inventory and puts the one in your hand away. (`use` on a phone does the same.)
  Result<Json> switchPhone(const CharacterId& actor, const std::string& item);
  // LivPay: bank to bank, anywhere, with a working phone. The recipient is notified with the note.
  Result<Json> livpaySend(const CharacterId& actor, const CharacterId& to, Cents cents, const std::string& note);
  // ride() paying with "card" (the default), "cash" or "phone" (LivPay).
  Result<Json> ride(const CharacterId& actor, const std::string& toStop, bool pay, const std::string& payWith);
  // Refuses with phone_dead (or no_phone) unless the character's phone works.
  Status phoneUsable(const CharacterState& c) const;
  // Whether this server can take coin purchases (its payment verifier). Display only: the wallet app
  // says so. Set by the server; creditCoins is only ever called after a verified receipt.
  void setTestPayments(bool enabled) { testPayments_ = enabled; }
  // } m08:wallet

  // m08:leisure commands { Sports, date spots and the lake park (Leisure.cpp)
  // Join a town team in person at the clubhouse or the team's venue (one team per sport; a league fee).
  Result<Json> joinTeam(const CharacterId& actor, const std::string& team);
  Result<Json> leaveTeam(const CharacterId& actor, const std::string& team);
  std::vector<CharacterId> leisureTeamMembers(const std::string& team) const;
  // The next kickoff of a sport strictly after `after`.
  GameMinutes leisureNextKickoff(const LeisureSportDef& sport, GameMinutes after) const;
  // This week's fixtures for a sport (home, away), rotating through every pairing week by week.
  std::vector<std::pair<std::string, std::string>> leisureFixtures(const LeisureSportDef& sport,
                                                                   std::int64_t week) const;
  // } m08:leisure

  // m08:pets commands { Pets and medicine (Pets.cpp)
  // In person at the shelter while it's open: one of this week's listings (or an animal brought
  // back). The fee goes to the shelter and the pet lives at your home. `name` (optional) renames it.
  Result<Json> adoptPet(const CharacterId& actor, const std::string& pet, const std::string& name,
                        const std::string& paymentMethod);
  // feed, play, cuddle, groom at home; walk (dogs) outdoors near home. Anyone who lives with the pet.
  Result<Json> careForPet(const CharacterId& actor, const std::string& pet, const std::string& action);
  // checkup, vaccines, treatment: bring the pet to the vet.
  Result<Json> vetVisit(const CharacterId& actor, const std::string& pet, const std::string& service,
                        const std::string& paymentMethod);
  const PetState* pet(const std::string& id) const;
  // The animals the shelter has right now: a few of this week's intake, and pets brought back.
  Json shelterListings() const;
  int petAgeMonths(const PetState& p) const;
  std::string petStageOf(const PetState& p) const;
  // The property someone lives at: the home they rent, or (a grown child) the parent's home they grew up in.
  std::string residenceOf(const CharacterId& id) const;
  bool livesWithPet(const CharacterId& id, const PetState& p) const;
  // } m08:pets

  // m08:details commands { Accidents as a big deal, laundry, weather, birthdays, hangovers (Details.cpp)
  // Wash all your clothes: at home (it takes some energy) or at the laundromat (it costs a wash).
  Result<Json> doLaundry(const CharacterId& actor);
  const WeatherDay& weatherToday() const { return state_.details.today; }
  bool soiledOutfit(const CharacterState& c) const;
  bool dirtyOutfit(const CharacterState& c) const;
  // } m08:details
  std::string relationshipStatus(const CharacterId& a, const CharacterId& b) const;
  bool isFamily(const CharacterId& a, const CharacterId& b) const;
  // --- Fame (Fame.cpp)
  std::string fameTierOf(const CharacterId& id) const;
  bool unlocked(const CharacterId& id, const std::string& capability) const;  // by an item you own

  // --- Sleep and the night (Sleep.cpp) -------------------------------------------------
  // Go to bed: in your own home, in the evening window (life.sleep.bed_hours, 21:00-03:00), not on shift or
  // studying. You stay in the world, asleep, until the wake hour (life.sleep.wake_hour, 07:00) or until you do
  // anything else: every command wakes you except `look`, `map` and the phone apps. Asleep, your routine looks
  // after you: needs and emotions aren't simulated minute by minute but catch up as an away character's do
  // (catchUpDormant) when you wake. Waking at the wake hour sends you `good_morning` (what happened overnight).
  // Refusals: not_in_world, in_jail, on_shift, studying, not_home, not_bedtime.
  Result<Json> sleep(const CharacterId& actor);
  bool isAsleep(const CharacterId& id) const;
  std::vector<CharacterId> sleepers() const;  // characters in the world and asleep, in id order
  GameMinutes nextWakeAt() const;             // the next wake hour strictly after now

  // THE NIGHT SKIP. Advances the world to nextWakeAt() as if the night had been lived: minute by minute in order,
  // so rent, construction, the hourly steps and work all fire exactly as they would; characters in the world and
  // awake are simulated minute by minute and move along their paths; those asleep (and everyone offline) are
  // looked after by their routine and catch up when they wake. At the wake hour every sleeper wakes with a
  // `good_morning` event (`skipped: true`). The people stream is sent once, at the end.
  //
  // It never decides whether a skip is allowed: the caller does, and calls it then. The server's rule
  // (`--night-skip`): at least one person is playing and everyone playing is asleep. A single-player town: its
  // one person is asleep. Refused with `nobody_asleep` when no character is asleep.
  //
  // `beforeEachMinute(realSeconds)` runs before each simulated minute with the real time one game minute stands
  // for (1 / minutes_per_real_second). Pass the town's Autopilot step so autopilot founders still walk home, go
  // to bed and get up on time during the skip:
  //     world.skipNight([&](double s) { autopilot.step(world, s); });
  // Then drain the events and route them as after any tick (Autopilot::observe first).
  // Returns {from, to, minutes, woke: [ids]} (game minutes; `woke` = who was asleep).
  Result<Json> skipNight(const std::function<void(double realSeconds)>& beforeEachMinute = {});

  // --- Rooms you walk around in (Interiors.cpp, D-066) -----------------------------------
  // Inside a place whose interior is in data. The server decides where everyone is: these move you on the floor
  // (`not_inside`, `no_room`, `off_floor`), sit you down (`no_such_spot`, `not_a_seat`, `spot_taken`: one person a
  // seat) and stand you up. An activity, a purchase, a performance or a shift there puts you at its spot.
  Result<Json> moveInside(const CharacterId& actor, Vec2 at);
  Result<Json> sit(const CharacterId& actor, const std::string& spot);
  Result<Json> stand(const CharacterId& actor);
  // Where someone is in their place's room (the entrance until they move); nullopt outside or where there's none.
  std::optional<RoomPlace> roomPlaceOf(const CharacterId& id) const;

  // Dev servers only (the server gates it behind --dev): give a character a condition, for testing care and contagion.
  Status devAddCondition(const CharacterId& id, const std::string& condition);

  // --- Queries (WorldViews.cpp) ---------------------------------------------------
  Result<Json> look(const CharacterId& actor) const;
  // The town plus the public rules, transit lines and interactions, so a client can draw ranges and
  // predict motion without hard-coding numbers that live in data.
  Json mapView() const;
  Json publicRules() const;
  Json playableCharacters() const;
  // One entry of the pick list: {id, name, age, pronouns, career (title), tagline, home, workplace}. Home and
  // workplace are place names (null when there is none). Founders and made characters alike.
  Json characterCard(const CharacterId& id) const;

  const CharacterState* character(const CharacterId& id) const;
  // Definition of any character: founding (content) or created (state).
  const CharacterDef* definition(const CharacterId& id) const;
  const RelationshipState* relationship(const CharacterId& from, const CharacterId& to) const;
  double relationshipValue(const CharacterId& from, const CharacterId& to, const std::string& dim) const;
  std::vector<const Memory*> memoriesOf(const CharacterId& owner) const;
  bool isLocationOpen(const LocationDef& loc) const;
  std::string locationStatus(const LocationDef& loc) const;  // open, closed, under_construction
  Status canAccess(const CharacterId& actor, const LocationDef& loc) const;
  // The place a character is "at": the building they are inside, or an outdoor place they stand in.
  const LocationDef* currentPlace(const CharacterState& c) const;

  std::vector<WorldEvent> drainEvents();

 private:
  // The people stream (WorldViews.cpp). Others are in sight outdoors within sight range when both
  // are outdoors, or in the same building; never anyone else.
  bool inSight(const CharacterState& viewer, const CharacterState& other) const;
  SeenPerson seenNow(const CharacterState& c) const;
  // seenNow as `viewer` may know it: someone else's destination only as far as the viewer can see.
  SeenPerson seenBy(const CharacterState& viewer, const CharacterState& other) const;
  Json personJson(const CharacterState& viewer, const CharacterState& other) const;
  void emitPeopleChanges();
  CharacterState* mutableCharacter(const CharacterId& id);
  // The actor of a command, who must be in the world. A command wakes them if they're asleep (`wakes` false:
  // reading the phone in bed doesn't).
  Result<CharacterState*> activeCharacter(const CharacterId& id, bool wakes = true);
  // Sleep.cpp: wake one sleeper (their routine's catch-up for the time asleep); at the wake hour, with good_morning.
  void wakeUp(CharacterState& c, bool morning);
  void stepSleepHourly();  // called once a game hour from stepHourly (Life.cpp): the wake hour wakes everyone
  // Away.cpp: a character's scheduled work block on a weekday (minutes of the day; start < 0 = none), and the
  // routine paying blocks that ended in the last hour for characters who spent them offline.
  struct WorkBlock {
    int start = -1;
    int end = -1;
  };
  WorkBlock scheduledWorkBlock(const CharacterState& c, int weekday) const;
  void stepAwayWorkHourly();
  void moveEveryone(double seconds);  // advanceRealTime's movement, shared with skipNight
  // interiors (Interiors.cpp): forget where someone was in a room (they come in, leave, connect or disconnect).
  void resetRoomPlace(const CharacterId& id);
  // Puts `c` at the first free spot of their room that `serves` (or next to one when they're all taken), unless
  // they hold one already. Returns {at, spot}, or null where there's no room or no such spot.
  Json takeRoomSpot(CharacterState& c, const std::function<bool(const InteriorSpotDef&)>& serves);
  Json roomView(const CharacterState& viewer) const;  // look.here.room
  void emitRoomChanges();                              // the `room` event, once a tick, to people in a room
  bool skipping_ = false;  // inside skipNight (good_morning says the night was skipped)
  std::string nextId(const char* prefix);
  void stepMinute();
  void simulateCharacterMinute(CharacterState& c);
  void stepConstruction();
  void completeProject(const ConstructionProjectDef& def, ConstructionState& st);
  void updateCityStage();
  void chargeRent();
  void catchUpDormant(CharacterState& c, GameMinutes elapsed);
  // Life.cpp
  void initBody(CharacterState& c, const CharacterDef& def);
  void stepBodyMinute(CharacterState& c);
  void stepHourly();
  void stepHomes();
  void stepIllness(CharacterState& c);
  void stepOfflineLife(CharacterState& c);
  void checkBirthday(CharacterState& c);
  void updateWeight(CharacterState& c);
  bool offlineTooLong(const CharacterState& c) const;
  void addCondition(CharacterState& c, const std::string& condition, bool diagnosed);
  void removeCondition(CharacterState& c, const std::string& condition, const std::string& why);
  ConditionState* findCondition(CharacterState& c, const std::string& condition);
  double performancePenalty(const CharacterState& c) const;
  PropertyState* homeOf(const CharacterId& id);
  const PropertyState* homeOf(const CharacterId& id) const;
  // Applies food energy from something eaten (an offer or activity).
  void eat(CharacterState& c, const StatMap& needEffects, double calories);
  Result<Json> runCareService(CharacterState& c, const std::string& service, const LocationDef& where);
  void applyConditionRecovery(CharacterState& c, const StatMap& progress);
  Json phoneHealth(const CharacterState& c) const;
  Json phoneItems(const CharacterState& c) const;
  Json phoneSchool(const CharacterState& c) const;
  Json phoneJobs(const CharacterState& c) const;
  void payCliniciansOnDuty(const CharacterId& patient, const LocationDef& where, Cents price, Json& out);
  // Crime.cpp
  void recordCrime(CharacterState& c, const std::string& crime, Cents fineCents, GameMinutes jailMinutes = 0);
  Status freeToAct(const CharacterState& c) const;  // refuses while in jail
  struct CrimeWitnesses {
    int witnesses = 0;
    int staff = 0;   // on shift where it happens
    int police = 0;  // on duty nearby
  };
  CrimeWitnesses crimeWitnesses(const CharacterState& c, const CharacterId& besides = "") const;
  double detectionChance(const CharacterState& c, const CrimeDef& crime) const;
  int policeNearby(const CharacterState& c) const;
  // Caught: fine, jail, record, contraband confiscated, the police told. Returns what happened.
  Json arrestCharacter(CharacterState& c, const std::string& crime, const std::string& by);
  void dispatchPolice(const std::string& text);
  void stepCrimeHourly();
  Json takeSubstance(CharacterState& c, const std::string& substance);
  void overdose(CharacterState& c, const SubstanceDef& s);
  void stepSubstancesHourly(CharacterState& c);
  Json phoneRecord(const CharacterState& c) const;
  // Romance.cpp
  void setStatus(const CharacterId& a, const CharacterId& b, const std::string& status);
  Status checkRomanceAllowed(const CharacterState& a, const CharacterState& b) const;
  bool inPrivate(const CharacterState& a, const CharacterState& b) const;
  Json intimacy(CharacterState& a, CharacterState& b, bool protection);
  void tryConception(CharacterState& carrier, const CharacterState& sire, bool protectedSex);
  void stepPregnancyHourly(CharacterState& c);
  void endPregnancy(CharacterState& c, const std::string& how);
  void giveBirth(CharacterState& c);
  Json pregnancyTest(CharacterState& c);
  Json phoneRomance(const CharacterState& c) const;
  // Family.cpp
  void stepChildHourly(CharacterState& c);
  bool atSchoolNow(const CharacterState& c) const;
  bool atDaycareNow(const CharacterState& c) const;
  void graduateSchool(CharacterState& c);
  Json phoneFamily(const CharacterState& c) const;

  // m08:homes helpers { Buying homes, mortgages, moving in together (Homes.cpp)
  void stepHomesHourly();  // called once a game hour from stepHourly (Life.cpp)
  Json phoneHomes(const CharacterState& c) const;
  // Who has a key: residents, owners, the lease holder, and children whose family home it is.
  bool hasKey(const PropertyState& p, const CharacterId& id) const;
  // The adults who live in a home (saves from before M0.8 only knew the lease holder).
  std::vector<CharacterId> residentsOf(const PropertyState& p) const;
  // A child's home: the family home they moved with, or wherever a parent lives now.
  const PropertyDef* familyHomeOf(const CharacterState& child) const;
  // From chargeRent (World.cpp), on the first of the month: rent split between the residents,
  // then mortgage payments split between the owners, missed payments and foreclosures.
  void chargeHomeRent(PropertyState& p, const PropertyDef& def);
  void chargeMortgages();
  // From request()/respond() (Romance.cpp): the asks buy_home, move_in and sell_home.
  Result<std::string> homeAsk(const CharacterState& a, const CharacterState& t, const std::string& kind,
                              const std::string& subject);
  Result<Json> homeAnswer(const PendingRequest& q, CharacterState& from, CharacterState& me);
  // The work behind a yes; homeAnswer tells the asker when it can't go through.
  Result<Json> settleHomeAsk(const PendingRequest& q, CharacterState& from, CharacterState& me);
  Status checkBuyer(const CharacterState& c, Cents downShare, Cents paymentShare, bool together) const;
  Result<Json> closePurchase(const std::vector<CharacterId>& buyers, const std::vector<Cents>& downShares,
                             PropertyState& p, const PropertyDef& def);
  Result<Json> completeSale(PropertyState& p, const PropertyDef& def);
  bool roomFor(const PropertyState& p, const PropertyDef& def) const;  // one more adult can live here
  // Returns what happened to the home they left; who still lives there is told (except `movingToo`).
  Json moveIn(const CharacterId& id, PropertyState& to, const std::vector<CharacterId>& movingToo = {});
  Json leaveHome(const CharacterId& id, PropertyState& from, PropertyState* to);
  void showOut(const PropertyDef& def);  // people inside who no longer have a key step outside
  void foreclose(PropertyState& p, const PropertyDef& def);
  Cents mortgageShareOf(const CharacterId& id) const;  // your share of the payments you already carry
  Cents monthlyPayOf(const CharacterState& c) const;   // at your career level
  // } m08:homes

  // m08:work helpers { Work decisions during shifts (WorkTasks.cpp)
  void stepWorkHourly();  // called once a game hour from stepHourly (Life.cpp)
  Json phoneWork(const CharacterState& c) const;
  // Today's decisions for a character: the stored draw if it's today's, else the draw it would be.
  std::vector<std::string> workTasksToday(const CharacterState& c) const;
  std::vector<std::string> drawWorkTasks(const CharacterState& c, std::int64_t day) const;
  // On shift: which of today's decisions have come up (in today's order) and, if more are still to come this
  // shift, the minute the next one does (else -1). Off shift: nothing has come up.
  struct WorkTasksUp {
    std::vector<std::string> up;
    std::vector<std::string> pending;  // not answered before this shift, in the order they come up
    std::size_t shown = 0;             // how many of `pending` have come up
    GameMinutes nextAt = -1;
  };
  WorkTasksUp workTasksUp(const CharacterState& c) const;
  void stepWorkMinute();  // called every game minute from advanceMinutes: a decision comes up (`work_decision`)
  void announceWorkTask(const CharacterState& c, const WorkTasksUp& u, const std::string& task);
  void addWorkPacing(const WorkTasksUp& u, Json& out) const;
  // Stores today's draw; yesterday's unanswered decisions lapse.
  void refreshWorkDay(CharacterState& c);
  const WorkAnswer* workAnswerToday(const CharacterState& c, const std::string& task) const;
  Json workTaskView(const CharacterState& c, const std::string& task) const;
  Json workProgress(const CharacterState& c) const;
  // Adds the decisions made since `shiftStart` and their bonus to endShift's reply. A shift
  // that doesn't count (too short to be paid) takes its decisions' promotion hours back.
  void workShiftReport(CharacterState& c, GameMinutes shiftStart, bool counts, Json& out);
  // } m08:work

  // m08:wallet helpers { Coins, phones and LivPay (Wallet.cpp)
  // Where the phone in your hand is charging right now ("home", "work", "campus", "outlet"), or "".
  std::string chargingAt(const CharacterState& c) const;
  void issuePhone(CharacterState& c);  // a basic phone for an adult who has none
  Result<Json> usePhoneItem(CharacterState& c, const ItemDef& def);  // `use` on a phone or a phone case
  Json livpayActivity(const CharacterState& c, std::size_t limit) const;
  Json coinPacksView() const;
  Json paymentsView() const;
  bool testPayments_ = false;
  void stepWalletHourly();  // called once a game hour from stepHourly (Life.cpp)
  Json phoneWallet(const CharacterState& c) const;
  Json phoneStore(const CharacterState& c) const;
  // } m08:wallet

  // m08:leisure helpers { Sports, date spots and the lake park (Leisure.cpp)
  void stepLeisureHourly();  // called once a game hour from stepHourly (Life.cpp)
  Json phoneSports(const CharacterState& c) const;
  // Hooks from buy and useActivity (World.cpp): a purchase at a date spot may count as a date;
  // an activity may have hours (stargazing), train a skill (practice) or count as a date.
  void leisureAfterPurchase(CharacterState& c, const LocationDef& place, const std::string& offer, Json& out);
  Result<Json> leisureActivity(CharacterState& c, const LocationDef& place, const Activity& activity);
  Json leisureDate(CharacterState& c, const LocationDef& place, const std::string& memory);
  double leisurePlayerValue(const CharacterState& c) const;
  void leisureKickoff(const LeisureSportDef& sport, const std::string& home, const std::string& away);
  void leisureFinish(LeisureMatch& m);
  // } m08:leisure

  // m08:pets helpers { Pets and medicine (Pets.cpp)
  void stepPetsHourly();  // called once a game hour from stepHourly (Life.cpp)
  Json phonePets(const CharacterState& c) const;
  std::vector<PetState> shelterAnimals(std::int64_t week) const;  // the week's intake, generated from data
  std::vector<PetState> shelterOnShow() const;                     // the first few of it not yet adopted
  void stepPet(PetState& p);
  void petToShelter(PetState& p, const std::string& why, bool neglect);
  std::vector<CharacterId> householdOf(const PetState& p) const;  // everyone living with the pet
  std::string petHomeOf(const PetState& p) const;  // the owner's home (a pet moves with its owner)
  PetState* householdPet(const CharacterId& actor, const std::string& idOrName);  // a pet you live with
  Json petView(const PetState& p, const CharacterId& viewer) const;
  void payVetsOnDuty(const CharacterId& client, const LocationDef& where, Cents price, Json& out);
  // Medicine. Hooks: World::buy (check, fill), runCareService (write), useItem (doses), phoneHealth (view).
  Status checkPrescription(const CharacterState& c, const Offer& offer) const;
  void fillPrescription(CharacterState& c, const Offer& offer, Json& out);
  Json writePrescriptions(CharacterState& c, const LocationDef& where);
  Json takeMedicineDose(CharacterState& c, const ItemDef& item);
  void medicineEmergency(CharacterState& c, const std::string& what);
  void addMedicineToHealth(const CharacterState& c, Json& out) const;
  void stepMedicineHourly(CharacterState& c);
  // } m08:pets

  // Goals (Goals.cpp): computed from the character's own records only; nothing is saved.
  struct GoalProgress {
    bool done = false;
    double count = 0;
    double target = 1;
    std::string progress;  // "1/3", "$14,960.00 of $52,000.00"
    std::string detail;    // what's next, where the check knows ("Recruiting Manager: 58 of 120 hours")
  };
  GoalProgress checkGoal(const CharacterState& c, const GoalCheckDef& check) const;
  bool goalRequirementMet(const CharacterState& c, const std::string& requirement) const;
  // Today's daily goals for a character: a pure function of (character, day) over the goals they can do.
  std::vector<const DailyGoalDef*> dailyGoals(const CharacterState& c, std::int64_t day) const;
  Json phoneGoals(const CharacterState& c) const;
  // Life events (LifeEvents.cpp, D-068).
  void stepLifeEventsMinute();  // called every game minute from advanceMinutes: lapses, and a new one when it's time
  bool lifeEventMoment(const CharacterState& c) const;  // awake, free, not riding or studying, played by a person
  bool lifeEventHolds(const CharacterState& c, const LifeEventDef& e, std::int64_t day, CharacterId& with) const;
  void offerLifeEvent(CharacterState& c, std::int64_t day);
  std::string lifeEventText(const std::string& text, const LifeEventOffer& o, const LifeEventDef& e) const;
  LedgerAccountId lifeEventAccount(const CharacterState& c, const LifeEventOffer& o, const std::string& account) const;
  Json lifeEventView(const CharacterState& c, const LifeEventOffer& o) const;
  Json phoneStory(const CharacterState& c) const;
  // Fights (Fights.cpp, D-070).
  void stepFightsMinute();  // fights nobody answered in time: they froze and took it
  Json resolveFight(const PendingFight& f, const std::string& choice);  // returns the defender's result
  double fightScore(const CharacterState& c);
  // How a fight ended, for concludeFight: the outcome, who won (empty: nobody), whether whoever started it landed a
  // blow (assault), each side's text and what changed for them.
  struct FightEnd {
    std::string outcome, winner, aText, dText;
    bool landed = false;
    Json aChanges = Json::object(), dChanges = Json::object();
  };
  Json concludeFight(const PendingFight& f, FightEnd end);  // memories, witnesses, rumour, crime; both results
  void applyFightEffects(CharacterState& c, const FightEffectsDef& fx, Json& changes);
  void injureInFight(CharacterState& c, const std::string& condition, Json& changes);
  // Beat Brawl (D-077).
  bool brawlFor(const PendingFight& f) const;  // fighting back is played beat by beat (a person is in it)
  Json startBrawl(const PendingFight& f, const CharacterId& caller);  // the caller's view; the other is told
  void stepBrawls(double seconds);             // real time: tells show, beats end, rounds speed up
  void beginBeat(Brawl& b);
  void showTell(Brawl& b);
  std::string endBeat(Brawl& b);  // how it ends (ko, points), or empty to go on
  Json finishBrawl(const Brawl& b, const std::string& how, const CharacterId& walker = "");
  std::string drawBrawlMove(const CharacterId& id);
  double brawlEdge(const CharacterId& hitter, const CharacterId& receiver);

  // m08:details helpers { Accidents as a big deal, laundry, weather, birthdays, hangovers (Details.cpp)
  void stepDetailsHourly();  // called once a game hour from stepHourly (Life.cpp)
  Json phoneWeather(const CharacterState& c) const;
  // Hooks the rest of the world calls (each is one line where it happens).
  void wetYourself(CharacterState& c);                          // Life.cpp: bladder hit 0
  double detailsReceptivity(const CharacterState& actor) const; // World::interact
  void onDrink(CharacterState& c, const std::string& substance); // Substances.cpp
  void onBirthday(CharacterState& c, int age);                   // Life.cpp checkBirthday
  void onGift(CharacterState& giver, CharacterState& receiver, const std::string& item, Json& out);  // Items.cpp giveItem
  bool clothingCountsForStyle(const CharacterState& c, const std::string& item) const;  // Items.cpp styleOf
  std::string clothesCondition(const CharacterState& c, const std::string& item) const;  // Items.cpp phoneItems
  void rollWeather(bool newDay);
  WeatherDay rollWeatherDay(std::int64_t dayIndex);
  bool isBirthdayToday(const CharacterState& c) const;
  // } m08:details
  // Fame.cpp
  void addFame(CharacterState& c, double amount);
  void stepFameHourly(CharacterState& c);
  Json phoneFame(const CharacterState& c) const;
  Json phoneTransit() const;
  double styleOf(const CharacterState& c) const;  // worn items' style, 0..100
  void applyNeeds(CharacterState& c, const StatMap& deltas);
  void applyEmotions(CharacterState& c, const StatMap& deltas);
  void adjustRelationship(const CharacterId& from, const CharacterId& to, const std::string& dim, double delta);
  RelationshipState& relationshipRef(const CharacterId& from, const CharacterId& to);
  double compatibility(const CharacterDef& a, const CharacterDef& b) const;
  bool holdsGrudge(const CharacterId& owner, const CharacterId& about) const;
  void addMemory(Memory m);
  void notify(const CharacterId& recipient, const std::string& kind, const std::string& text);
  void notifyAll(const std::string& kind, const std::string& text);
  void emit(std::vector<CharacterId> recipients, std::string type, Json data);
  // Online characters sharing a space: same building, or outdoors within `outdoorRange`.
  std::vector<CharacterId> presentWith(const CharacterState& c, double outdoorRange = 40) const;
  bool together(const CharacterState& a, const CharacterState& b, double outdoorRange) const;
  void addCharacterState(const CharacterDef& def, const OriginDef* origin);
  void seedFromContent(const std::set<CharacterId>& arrived);  // ties and memories from character data (D-073)
  Json songsView(const CharacterState& c) const;
  Json phoneBank(const CharacterState& c) const;
  Json phoneMessages(const CharacterState& c);
  Json phoneContacts(const CharacterState& c) const;
  Json phoneCalendar(const CharacterState& c) const;
  Json phoneCareer(const CharacterState& c) const;
  Json phoneProperty(const CharacterState& c) const;
  Json phoneNotifications(const CharacterState& c);
  Json phoneCity() const;

  std::shared_ptr<const ContentDatabase> content_;
  WorldState state_;
  std::vector<WorldEvent> events_;
  // Session state, deliberately outside WorldState so it is never saved.
  std::map<CharacterId, std::string> scripted_;  // character -> who plays them ("script", "autopilot")
  std::map<CharacterId, std::map<CharacterId, SeenPerson>> seen_;  // viewer -> person -> last told
  std::map<CharacterId, RoomPlace> rooms_;                             // interiors: where people are in rooms
  std::map<CharacterId, std::map<CharacterId, RoomPlace>> roomSeen_;  // viewer -> person -> last told (`room`)
};

std::string formatMoney(Cents cents);

}  // namespace livera
