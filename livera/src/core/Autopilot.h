#pragma once

#include <functional>
#include <memory>
#include <string>
#include <vector>

#include "core/World.h"

namespace livera {

// Plays founding characters nobody is playing, inside the core, as the town director
// (scripts/town_director.py) does over the wire: a day built from data (the career's workplace
// and hours, the character's profile.schedule matched to places by name, opening hours), walking
// or riding the bus, needs looked after at home, one everyday purchase a day, and bed by leaving
// the world at night (D-050). It drives characters only through World commands and decides only
// from what a client of that character would see (look, the phone apps, the map), so it can never
// cheat. Characters it runs are labelled `scripted` with `played_by: "autopilot"` (D-053).
//
// Manners (D-064, data/society/manners.json): it greets a person it meets once per person per game day, now and
// then starts a chat with someone it knows, and answers asks by the data's rules from its own feelings (never
// intimacy; a kind with no rule is declined). People only: never another autopilot founder or a script. It never
// sends asks and answers nothing at work.
// Town life (D-073, data/society/town_life.json): a free evening may become an evening out (the first plan that suits
// the character's own data and comes up in a pure draw of character or pair and day); an officer on shift walks the
// beat, in uniform, and comes back; people rest and eat before a shift or an evening out, take a coffee or the break
// room when flagging on shift, and eat at work without ending the shift where the workplace sells food.
// Refusals back off with jitter drawn from the world's saved random stream; a character sends at
// most one command every two real seconds. Plan state lives here, in memory only: a loaded world
// re-plans. Humans win: release() drops a character without disconnecting them so the caller can
// connect the person.
class Autopilot {
 public:
  static constexpr const char* kLabel = "autopilot";  // the `played_by` value

  Autopilot();
  ~Autopilot();
  Autopilot(Autopilot&&) noexcept;
  Autopilot& operator=(Autopilot&&) noexcept;

  // Takes over these characters (ids it doesn't know; unknown or unplayable ids, and anyone already in the
  // world, are skipped). Each is connected now if their routine says they're awake, else at their wake time.
  void start(World& world, const std::vector<CharacterId>& ids);
  // Stops everyone: shifts end, characters leave the world, labels clear, plans are forgotten.
  void stop(World& world);
  // Drops one character's plan and clears their label without disconnecting them; the caller then
  // connects the person. A no-op for a character it doesn't run.
  void release(World& world, const CharacterId& id);
  bool runs(const CharacterId& id) const;
  std::vector<CharacterId> characters() const;
  // Advances the autopilot's real clock and lets every character whose turn it is look and act once.
  // Call it after World::advanceRealTime with the same seconds.
  void step(World& world, double realSeconds);
  // Shows it the events the world emitted (the batch from World::drainEvents, before the host routes
  // them): asks addressed to its characters are answered (by data/society/manners.json) on their next
  // turn. Optional; without it asks just expire.
  void observe(const std::vector<WorldEvent>& events);
  // Where the log lines go (the server's log, a debug hook). Nothing is printed otherwise.
  void setLog(std::function<void(const std::string&)> log);
  // What each character is up to: {"<id>": {"playing", "asleep", "plan", "goal", "stats": {...}}}.
  Json status() const;

 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace livera
