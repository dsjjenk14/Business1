#pragma once
// Pure per-day choices (the day's work decisions and their option order, the day's goals): a hash of
// (character, game day, what), so a draw is the same all day, different from one day to the next, the same after
// a restart, and never touches the world's random stream (opening a phone must not change anyone's dice).
// Internal to src/core.

#include <cstdint>
#include <string>

namespace livera::dayhash {

inline std::uint64_t fnv1a(const std::string& s) {
  std::uint64_t h = 0xcbf29ce484222325ull;
  for (const unsigned char ch : s) {
    h ^= ch;
    h *= 0x100000001b3ull;
  }
  return h;
}

inline std::uint64_t mix64(std::uint64_t z) {
  z += 0x9E3779B97F4A7C15ull;
  z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ull;
  z = (z ^ (z >> 27)) * 0x94D049BB133111EBull;
  return z ^ (z >> 31);
}

inline std::uint64_t dayKey(const std::string& who, std::int64_t day, const std::string& what) {
  return mix64(fnv1a(who + "|" + std::to_string(day) + "|" + what));
}

}  // namespace livera::dayhash
