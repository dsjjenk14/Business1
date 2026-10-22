#pragma once

#include <algorithm>
#include <filesystem>
#include <fstream>
#include <functional>
#include <string>
#include <unistd.h>

#include "TestHarness.h"
#include "core/Content.h"
#include "core/World.h"

namespace livera::test {

// All of the game content in data/, as a server loads it.
inline std::shared_ptr<const ContentDatabase> fullContent() {
  static std::shared_ptr<const ContentDatabase> db = [] {
    auto r = ContentDatabase::loadFromDirectory(LIVERA_DATA_DIR);
    if (!r) throw std::runtime_error("content failed to load: " + r.error().message);
    return r.value();
  }();
  return db;
}

// The real game content in data/. Tests run against it so content changes that break a rule are caught here, not in
// play. It leaves out what happens when a need runs out (D-080, health/needs_at_zero.json): most tests let the clock
// run for days while nobody eats or sleeps, and would end in the hospital. The tests of D-080 use fullContent().
inline std::shared_ptr<const ContentDatabase> realContent() {
  static std::shared_ptr<const ContentDatabase> db = [] {
    std::vector<std::filesystem::path> files;
    for (const auto& e : std::filesystem::recursive_directory_iterator(LIVERA_DATA_DIR)) {
      if (e.path().extension() == ".json" && e.path().filename() != "needs_at_zero.json") files.push_back(e.path());
    }
    std::sort(files.begin(), files.end());
    std::vector<std::pair<std::string, Json>> docs;
    for (const auto& f : files) {
      std::ifstream in(f);
      docs.emplace_back(f.filename().string(), Json::parse(in, nullptr, true, true));
    }
    auto r = ContentDatabase::loadFromDocuments(docs);
    if (!r) throw std::runtime_error("content failed to load: " + r.error().message);
    return r.value();
  }();
  return db;
}

// The real content with an in-memory patch applied, for tests that need different
// tuning (e.g. a short promotion track) without touching data/. Like realContent(), without needs_at_zero.json
// unless `zero` says to keep it.
inline std::shared_ptr<const ContentDatabase> patchedContent(const std::function<void(Json& doc, const std::string& file)>& patch,
                                                             bool zero = false) {
  std::vector<std::pair<std::string, Json>> docs;
  std::vector<std::filesystem::path> files;
  for (const auto& e : std::filesystem::recursive_directory_iterator(LIVERA_DATA_DIR)) {
    if (e.path().extension() == ".json" && (zero || e.path().filename() != "needs_at_zero.json")) files.push_back(e.path());
  }
  std::sort(files.begin(), files.end());
  for (const auto& f : files) {
    std::ifstream in(f);
    Json doc = Json::parse(in, nullptr, true, true);
    patch(doc, f.filename().string());
    docs.emplace_back(f.filename().string(), std::move(doc));
  }
  auto r = ContentDatabase::loadFromDocuments(docs);
  if (!r) throw std::runtime_error("patched content failed: " + r.error().message);
  return r.value();
}

// Walks a character to a place's door by letting real time pass (no teleporting).
inline void walkTo(World& w, const CharacterId& who, const LocationId& place) {
  const LocationDef* loc = w.content().location(place);
  if (!loc) throw std::runtime_error("no such place " + place);
  if (!w.character(who)->inside.empty()) (void)w.exitBuilding(who);
  auto st = w.moveTo(who, loc->door);
  if (!st) throw std::runtime_error("move failed: " + st.error().message);
  for (int i = 0; i < 2000 && w.character(who)->moveTarget; ++i) w.advanceRealTime(0.1);
}

inline void walkInto(World& w, const CharacterId& who, const LocationId& place) {
  walkTo(w, who, place);
  auto st = w.enter(who, place);
  if (!st) throw std::runtime_error("enter " + place + " failed: " + st.error().message);
}

inline std::filesystem::path tempPath(const std::string& name) {
  auto dir = std::filesystem::temp_directory_path() / "livera_tests";
  std::filesystem::create_directories(dir);
  auto p = dir / (name + "_" + std::to_string(::getpid()));
  std::filesystem::remove(p);
  std::filesystem::remove(p.string() + "-wal");
  std::filesystem::remove(p.string() + "-shm");
  return p;
}

}  // namespace livera::test
