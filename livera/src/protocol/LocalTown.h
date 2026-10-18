#pragma once

#include <map>
#include <memory>
#include <optional>
#include <set>
#include <string>
#include <vector>

#include "core/Autopilot.h"
#include "core/World.h"

// A whole town run in one process for the people playing in it, with nobody else to ask: the
// single-player build (one person, src/wasm/solo.cpp) and "Play together" in the browser (the host's
// tab serving its friends, web/client/together/). It holds the World, the Autopilot that plays the
// founders nobody plays, and the set of characters people are playing right now ("humans").
//
// It is the part of Server that doesn't need sockets, accounts or SQLite: the same order of a tick
// (the autopilot acts first, then the world), the same in-world dispatch (protocol/WorldOps.cpp), the
// same refusal codes, and "people always win" (joining releases the autopilot first). Accounts and
// claims stay with the caller, as they stay in Server: the solo page has none, the host page keeps
// them in the artifact's database and decides who may join as whom before it calls join().
namespace livera::protocol {

// The server's reply line: {"re": re, "ok": true, "data": ...} or {"re": re, "ok": false, "error": {code, message}}.
Json replyLine(const Json& re, const Result<Json>& result);

class LocalTown {
 public:
  struct Options {
    // One character may be made per town (the solo page: one person, one made character). Off, the caller
    // enforces its own rule (the host page: one per account).
    bool oneCreatedCharacter = false;
  };

  explicit LocalTown(std::shared_ptr<const ContentDatabase> content);
  LocalTown(std::shared_ptr<const ContentDatabase> content, Options options);
  ~LocalTown();
  LocalTown(const LocalTown&) = delete;
  LocalTown& operator=(const LocalTown&) = delete;

  // --- The world ---------------------------------------------------------------------------------
  // A new world, or one loaded from worldStateToJson's document. Either replaces the town: the autopilot
  // stops, every person is out, nobody is online. Both answer `hello` ({protocol, world_time, rules}).
  Result<Json> found();
  Result<Json> load(const Json& doc);
  // The whole world as one JSON document (core/Serialization.h); `no_world` before found() or load().
  Result<Json> save() const;
  bool hasWorld() const { return world_.has_value(); }
  World& world();
  const World& world() const;
  Result<Json> hello() const;
  Json rules() const;  // the public rules; content-only, so it works before a town exists

  // --- People ------------------------------------------------------------------------------------
  // Puts a person in the world as this character and answers `look`. The autopilot lets go first (people
  // always win). Refused with `character_in_use` while a person plays them already (the caller knows which
  // person is which: the server's `already_playing` is its check), `unknown_character` for anyone who isn't
  // playable.
  Result<Json> join(const CharacterId& id);
  // Takes the person out (they go dormant, as on logout). With `autopilotTakesOver`, a founder goes back
  // on autopilot, as the server does for a founder nobody has claimed; the caller passes false for a
  // character someone keeps (a claim, or the solo page's "change who you play").
  Result<Json> leave(const CharacterId& id, bool autopilotTakesOver = true);
  bool playing(const CharacterId& id) const { return humans_.count(id) > 0; }
  std::vector<CharacterId> humans() const { return {humans_.begin(), humans_.end()}; }

  // One in-world op for a person who is playing: the shared dispatch, `not_playing` for anyone else.
  // Argument types are not checked here (dispatchWorldOp may throw); request() turns that into bad_request.
  Result<Json> worldOp(const CharacterId& who, const std::string& op, const Json& req);
  // A whole request line for this person, answered like Server::handleLine (rate limits aside, which stay
  // with the caller): {"re", "ok", "data" | "error"}.
  Json request(const CharacterId& who, const Json& req);

  // Advances the town by this much real time (capped at 1 s, like the server's tick): the autopilot acts,
  // then the world moves on. Returns each person's events, [{"event", "data"}...], keyed by character;
  // people who got nothing are left out. Events for nobody here are dropped.
  std::map<CharacterId, Json> tick(double realSeconds);

  // The pick list as `forCharacter` (or nobody) sees it: founders and made characters, `available` false for
  // characters other people are playing, `scripted_now` / `played_by` as the server reports them, and
  // `can_create`.
  Result<Json> characters(const CharacterId& forCharacter = {}) const;
  Result<Json> createCharacter(const Json& sheet);
  Result<Json> creatorOptions() const;
  // A time skip (the solo page's dev_advance), with the server's bounds.
  Result<Json> advanceMinutes(GameMinutes minutes);

  // --- The autopilot -----------------------------------------------------------------------------
  // These characters (or, with no list, every playable founder) live on autopilot; people are never handed
  // to it, nor is anyone already in the world. Answers {"running": [ids]}.
  Result<Json> autopilotStart(const std::optional<std::vector<CharacterId>>& ids = std::nullopt);
  Result<Json> autopilotStop();
  Result<Json> autopilotStatus() const;
  bool onAutopilot(const CharacterId& id) const { return autopilot_.runs(id); }

 private:
  void install(World world);

  std::shared_ptr<const ContentDatabase> content_;
  Options options_;
  std::optional<World> world_;
  Autopilot autopilot_;
  std::set<CharacterId> humans_;
};

}  // namespace livera::protocol
