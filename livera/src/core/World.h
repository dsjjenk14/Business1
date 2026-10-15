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
  std::map<std::string, GameMinutes> activityReadyAt;  // "location/activity" -> minute; session state

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
};

enum class ConstructionStatus { Planned, Active, Complete };

struct ConstructionState {
  std::string id;
  ConstructionStatus status = ConstructionStatus::Planned;
  double workerHoursDone = 0;
  GameMinutes completedAt = -1;
};

struct CityState {
  StatMap stats;  // population, housing_units, jobs, businesses...
  int stage = 1;
};

struct WorldState {
  GameMinutes now = 0;
  double clockCarry = 0;  // fractional game minutes not yet applied
  std::uint64_t nextId = 1;
  std::map<CharacterId, CharacterState> characters;
  std::map<RelationshipKey, RelationshipState> relationships;
  std::vector<Memory> memories;
  Ledger ledger;
  std::vector<Message> messages;
  std::vector<Notification> notifications;
  std::map<std::string, PropertyState> properties;
  std::map<std::string, ConstructionState> construction;
  CityState city;
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
  // Opening some apps has effects (messages/notifications are marked read).
  Result<Json> openPhoneApp(const CharacterId& actor, const std::string& app);

  // --- Queries (WorldViews.cpp) ---------------------------------------------------
  Result<Json> look(const CharacterId& actor) const;
  Json mapView() const;
  Json playableCharacters() const;

  const CharacterState* character(const CharacterId& id) const;
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
  std::vector<CharacterId> presentWith(const CharacterState& c) const;  // online characters sharing a space
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
