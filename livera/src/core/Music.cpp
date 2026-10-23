// Music: compose songs on your phone, release them to the town, perform them live.
// Songs are note data (not audio), so they are small, validated like any other input, and
// any client can play them back with its own instruments. The dev client exports MIDI.

#include <algorithm>
#include <cmath>

#include "core/Clock.h"
#include "core/Serialization.h"
#include "core/World.h"

namespace livera {

namespace {

constexpr int kMinBpm = 60;
constexpr int kMaxBpm = 200;
constexpr std::size_t kMaxTitleBytes = 60;
constexpr int kMaxNoteLength = 64;
constexpr int kDrumLow = 27;   // General MIDI percussion range
constexpr int kDrumHigh = 87;
constexpr double kStageAudienceRange = 30;
constexpr GameMinutes kMinPerformanceMinutes = 2;
constexpr const char* kMusicSkill = "music";

int lengthInSteps(const Song& s) {
  int end = 0;
  for (const auto& t : s.tracks) {
    for (const auto& n : t.notes) end = std::max(end, n.step + n.length);
  }
  return end;
}

double durationSeconds(const Song& s) { return lengthInSteps(s) / 4.0 * 60.0 / s.bpm; }

std::size_t noteCount(const Song& s) {
  std::size_t n = 0;
  for (const auto& t : s.tracks) n += t.notes.size();
  return n;
}

// Practice helps less the better you already are.
double skillGain(double current, double base) { return base * std::max(0.1, 1.0 - current / 120.0); }

Result<int> intIn(const Json& v, int lo, int hi, const char* what) {
  if (!v.is_number_integer()) return fail("invalid_song", std::string(what) + " must be a whole number");
  const auto x = v.get<long long>();
  if (x < lo || x > hi) return fail("invalid_song", std::string(what) + " must be " + std::to_string(lo) + "-" + std::to_string(hi));
  return static_cast<int>(x);
}

}  // namespace

// Everything a client sends is checked here; nothing it sends is trusted to be in range.
static Result<Song> parseSongSpec(const ContentDatabase& db, const Json& spec) {
  if (!spec.is_object()) return fail("invalid_song", "expected a song");
  Song song;
  auto title = spec.find("title");
  if (title == spec.end() || !title->is_string()) return fail("invalid_song", "a song needs a title");
  song.title = title->get<std::string>();
  if (song.title.empty() || song.title.size() > kMaxTitleBytes) return fail("invalid_song", "titles are 1-60 characters");
  for (unsigned char ch : song.title) {
    if (ch < 0x20 || ch == 0x7f) return fail("invalid_song", "title contains control characters");
  }
  auto bpm = intIn(spec.value("bpm", Json()), kMinBpm, kMaxBpm, "bpm");
  if (!bpm) return bpm.error();
  song.bpm = bpm.value();

  auto tracks = spec.find("tracks");
  if (tracks == spec.end() || !tracks->is_array() || tracks->empty() || tracks->size() > kSongMaxTracks)
    return fail("invalid_song", "a song has 1-4 tracks");
  for (const auto& t : *tracks) {
    if (!t.is_object()) return fail("invalid_song", "each track is an object");
    auto instrumentId = t.find("instrument");
    const InstrumentDef* inst =
        instrumentId != t.end() && instrumentId->is_string() ? db.instrument(instrumentId->get<std::string>()) : nullptr;
    if (!inst) return fail("invalid_song", "unknown instrument");
    SongTrack track;
    track.instrument = inst->id;
    auto notes = t.find("notes");
    if (notes == t.end() || !notes->is_array() || notes->size() > kSongMaxNotesPerTrack)
      return fail("invalid_song", "a track has up to 512 notes");
    for (const auto& n : *notes) {
      // Compact form [step, pitch, length, velocity?] keeps songs small on the wire.
      if (!n.is_array() || n.size() < 3 || n.size() > 4) return fail("invalid_song", "notes are [step, pitch, length, velocity]");
      auto step = intIn(n[0], 0, kSongMaxSteps - 1, "step");
      if (!step) return step.error();
      auto pitch = inst->drums ? intIn(n[1], kDrumLow, kDrumHigh, "drum sound") : intIn(n[1], 0, 127, "pitch");
      if (!pitch) return pitch.error();
      auto length = intIn(n[2], 1, kMaxNoteLength, "length");
      if (!length) return length.error();
      int velocity = 100;
      if (n.size() == 4) {
        auto v = intIn(n[3], 1, 127, "velocity");
        if (!v) return v.error();
        velocity = v.value();
      }
      if (step.value() + length.value() > kSongMaxSteps) return fail("invalid_song", "songs are at most 16 bars");
      track.notes.push_back(Note{step.value(), pitch.value(), length.value(), velocity});
    }
    std::sort(track.notes.begin(), track.notes.end(), [](const Note& a, const Note& b) { return a.step < b.step; });
    song.tracks.push_back(std::move(track));
  }
  if (noteCount(song) == 0) return fail("invalid_song", "a song needs at least one note");
  return song;
}

static Json songSummary(const Song& s, const CharacterDef* owner) {
  return Json{{"id", s.id},
              {"title", s.title},
              {"by", owner ? owner->fullName() : s.owner},
              {"owner", s.owner},
              {"bpm", s.bpm},
              {"tracks", s.tracks.size()},
              {"notes", noteCount(s)},
              {"duration_seconds", std::round(durationSeconds(s) * 10) / 10},
              {"released", s.released},
              {"plays", s.plays}};
}

Result<Json> World::saveSong(const CharacterId& actor, const Json& spec, const std::string& songId) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  auto parsed = parseSongSpec(*content_, spec);
  if (!parsed) return parsed.error();
  Song song = std::move(parsed).value();

  if (songId.empty()) {
    int owned = 0;
    for (const auto& [id, s] : state_.songs) owned += s.owner == actor ? 1 : 0;
    if (owned >= kMaxSongsPerCharacter) return fail("too_many_songs", "you have 50 songs; delete one first");
    song.id = nextId("song");
    song.owner = actor;
    song.createdAt = state_.now;
  } else {
    auto it = state_.songs.find(songId);
    if (it == state_.songs.end() || it->second.owner != actor) return fail("unknown_song", "no such song of yours");
    if (it->second.released) return fail("song_released", "released songs can't be changed");
    song.id = songId;
    song.owner = actor;
    song.createdAt = it->second.createdAt;
  }
  song.updatedAt = state_.now;
  state_.songs[song.id] = song;
  return songSummary(song, definition(actor));
}

Result<Json> World::releaseSong(const CharacterId& actor, const std::string& songId) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  auto it = state_.songs.find(songId);
  if (it == state_.songs.end() || it->second.owner != actor) return fail("unknown_song", "no such song of yours");
  Song& song = it->second;
  if (song.released) return fail("song_released", "already released");
  song.released = true;
  CharacterState& c = *r.value();
  addFame(c, content_->fame().perRelease);
  if (c.skills.count(kMusicSkill)) c.skills[kMusicSkill] = clampd(c.skills[kMusicSkill] + skillGain(c.skills[kMusicSkill], 2), 0, 100);
  // People who know you hear about it.
  const CharacterDef* me = definition(actor);
  for (const auto& [key, rel] : state_.relationships) {
    if (key.second == actor && rel.firstMetAt >= 0)
      notify(key.first, "music", (me ? me->fullName() : actor) + " released a new song: \"" + song.title + "\"");
  }
  return songSummary(song, me);
}

Result<Json> World::openSong(const CharacterId& actor, const std::string& songId) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  auto it = state_.songs.find(songId);
  if (it == state_.songs.end() || (!it->second.released && it->second.owner != actor))
    return fail("unknown_song", "no such song");
  Song& song = it->second;
  if (song.owner != actor) song.plays += 1;
  Json out = toJson(song);
  out["by"] = definition(song.owner) ? definition(song.owner)->fullName() : song.owner;
  out["duration_seconds"] = std::round(durationSeconds(song) * 10) / 10;
  return out;
}

Json World::songsView(const CharacterState& c) const {
  Json yours = Json::array();
  std::vector<const Song*> released;
  for (const auto& [id, s] : state_.songs) {
    if (s.owner == c.id) yours.push_back(songSummary(s, definition(s.owner)));
    if (s.released) released.push_back(&s);
  }
  std::sort(released.begin(), released.end(), [](const Song* a, const Song* b) {
    return a->plays != b->plays ? a->plays > b->plays : a->id < b->id;
  });
  Json chart = Json::array();
  for (std::size_t i = 0; i < released.size() && i < 10; ++i) chart.push_back(songSummary(*released[i], definition(released[i]->owner)));
  Json instruments = Json::array();
  for (const auto& [id, inst] : content_->instruments()) instruments.push_back(Json{{"id", id}, {"label", inst.label}, {"drums", inst.drums}, {"midi_program", inst.midiProgram}});
  const auto skill = c.skills.find(kMusicSkill);
  return Json{{"yours", yours},
              {"chart", chart},
              {"instruments", instruments},
              {"music_skill", skill == c.skills.end() ? 0.0 : std::round(skill->second * 10) / 10}};
}

Result<Json> World::perform(const CharacterId& actor, const std::string& songId) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  auto it = state_.songs.find(songId);
  if (it == state_.songs.end() || (!it->second.released && it->second.owner != actor))
    return fail("unknown_song", "no such song");
  Song& song = it->second;
  const LocationDef* place = currentPlace(c);
  if (!place || !place->stage) return fail("no_stage", "find a stage: an open mic, the church, the park or a club");
  if (place->enterable && place->access == AccessRule::Public && !isLocationOpen(*place))
    return fail("closed", place->name + " is closed");
  if (state_.now < c.performReadyAt) return fail("too_soon", "you're still performing");

  const GameMinutes minutes =
      std::max<GameMinutes>(kMinPerformanceMinutes, static_cast<GameMinutes>(std::ceil(durationSeconds(song) / 60.0)));
  c.performReadyAt = state_.now + minutes;
  (void)takeRoomSpot(c, [](const InteriorSpotDef& s) { return s.kind == "stage"; });  // interiors: onto the stage

  // Quality: mostly skill, a little for a fuller arrangement.
  const double skill = c.skills.count(kMusicSkill) ? c.skills.at(kMusicSkill) : 0;
  const double arrangement = std::min(15.0, static_cast<double>(song.tracks.size()) * 3.0 +
                                                static_cast<double>(std::min<std::size_t>(noteCount(song), 120)) / 12.0);
  const double quality = std::round(clampd(35 + 0.55 * skill + arrangement, 0, 100));

  const std::vector<CharacterId> audience = presentWith(c, kStageAudienceRange);
  const CharacterDef* me = definition(actor);
  Json payload = toJson(song);
  payload["by"] = definition(song.owner) ? definition(song.owner)->fullName() : song.owner;
  Json event{{"performer", actor}, {"name", me ? me->fullName() : actor}, {"place", place->id}, {"quality", quality},
             {"song", payload}};

  for (const auto& id : audience) {
    CharacterState& listener = *mutableCharacter(id);
    applyNeeds(listener, {{"recreation", quality / 10}});
    applyEmotions(listener, {{"happiness", quality / 25}, {"excitement", quality / 20}});
    adjustRelationship(id, actor, "familiarity", 1);
    adjustRelationship(id, actor, "respect", quality / 50);
    // A great set is remembered, once a day per performer.
    if (quality >= 70) {
      bool recent = false;
      for (const auto& m : state_.memories) {
        recent |= m.owner == id && m.about == actor && m.type == "performance" && state_.now - m.at < kMinutesPerDay;
      }
      if (!recent) {
        Memory m;
        m.id = nextId("mem");
        m.owner = id;
        m.at = state_.now;
        m.participants = {actor, id};
        m.location = place->id;
        m.type = "performance";
        m.importance = 30;
        m.emotionalImpact = 20;
        m.about = actor;
        m.info = "Heard " + (me ? me->firstName : actor) + " perform \"" + song.title + "\"";
        addMemory(std::move(m));
      }
    }
  }
  emit(audience, "performance", event);
  song.plays += static_cast<int>(audience.size());

  if (c.skills.count(kMusicSkill)) {
    const double gain = skillGain(skill, 3) + std::min(2.0, 0.5 * static_cast<double>(audience.size()));
    c.skills[kMusicSkill] = clampd(skill + gain, 0, 100);
  }
  applyEmotions(c, {{"confidence", 3}});
  if (!audience.empty()) applyNeeds(c, {{"social", 5}});
  addFame(c, quality * static_cast<double>(audience.size()) * content_->fame().perQualityAudience);
  return Json{{"song", song.title},
              {"quality", quality},
              {"audience", audience.size()},
              {"music_skill", std::round(c.skills[kMusicSkill] * 10) / 10},
              {"minutes", minutes}};
}

}  // namespace livera
