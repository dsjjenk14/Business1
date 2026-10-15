#pragma once

#include <map>
#include <memory>
#include <optional>
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
  // Session state (not saved):
  std::map<std::string, GameMinutes> activityReadyAt;  // "location/activity" -> minute
  GameMinutes performReadyAt = 0;
  std::map<std::string, GameMinutes> itemReadyAt;
  double moveSpeedMps = 0;  // > 0 while riding: overrides walking speed until arrival

  SimTier tier() const { return online ? SimTier::Active : SimTier::Dormant; }
};

// Directional: A's feelings about B are a different record from B's about A.
struct RelationshipState {
  StatMap dimensions;
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
  LedgerAccountId ownerAccount;
  CharacterId tenant;  // empty = vacant
  double cleanliness = 80;  // 0..100: housework keeps it up
  double trash = 0;         // 0..100: full trash makes a home get dirty faster
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
};

// Something a connected client should hear about. The server routes it; the world
// never knows about sockets.
struct WorldEvent {
  std::vector<CharacterId> recipients;
  std::string type;
  Json data;
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
  // Real time drives movement and the clock (at the configured rate).
  void advanceRealTime(double seconds);
  // Steps the world minute by minute so rent, construction and needs all fire in order.
  void advanceMinutes(GameMinutes minutes);

  // --- Presence ---------------------------------------------------------------------
  Status connect(const CharacterId& id);  // brings a Dormant character back to Active
  void disconnect(const CharacterId& id);

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
  bool unlocked(const CharacterId& id, const std::string& capability) const;  // by an item you own

  // Dev servers only (the server gates it behind --dev): give a character a condition, for testing care and contagion.
  Status devAddCondition(const CharacterId& id, const std::string& condition);

  // --- Queries (WorldViews.cpp) ---------------------------------------------------
  Result<Json> look(const CharacterId& actor) const;
  Json mapView() const;
  Json playableCharacters() const;

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
  CharacterState* mutableCharacter(const CharacterId& id);
  Result<CharacterState*> activeCharacter(const CharacterId& id);
  std::string nextId(const char* prefix);
  void stepMinute();
  void simulateCharacterMinute(CharacterState& c);
  void stepConstruction();
  void completeProject(const ConstructionProjectDef& def, ConstructionState& st);
  void updateCityStage();
  void chargeRent();
  void catchUpDormant(CharacterState& c, GameMinutes elapsed);
  // Life.cpp
  double roll();  // uniform [0, 1) from the world's saved random stream
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
};

std::string formatMoney(Cents cents);

}  // namespace livera
