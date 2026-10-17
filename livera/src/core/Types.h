#pragma once

#include <cmath>
#include <cstdint>
#include <map>
#include <optional>
#include <string>
#include <utility>

#include <nlohmann/json.hpp>

namespace livera {

using Json = nlohmann::json;

// Minutes since the world epoch (Year 1, Month 1, Day 1, Monday 00:00). See Clock.h.
using GameMinutes = std::int64_t;

// All money is integer cents. Floating point never touches a balance.
using Cents = std::int64_t;

// Content ids are readable strings from data files ("dominique", "heritage_coffee").
using CharacterId = std::string;
using LocationId = std::string;
using LedgerAccountId = std::string;

// Named numeric stats (needs, emotions, personality, values, relationship dimensions).
// Keys come from data/config/simulation.json, never from code, so new stats are data changes.
using StatMap = std::map<std::string, double>;

struct Vec2 {
  double x = 0;
  double y = 0;
  bool operator==(const Vec2&) const = default;
};

inline double distance(Vec2 a, Vec2 b) { return std::hypot(a.x - b.x, a.y - b.y); }

inline double clampd(double v, double lo, double hi) { return v < lo ? lo : (v > hi ? hi : v); }

// An error that crosses the authority boundary. `code` is stable and machine-readable
// (clients branch on it); `message` is for humans.
struct Error {
  std::string code;
  std::string message;
};

struct Unit {};

template <class T>
class [[nodiscard]] Result {
 public:
  Result(T value) : value_(std::move(value)) {}  // NOLINT(google-explicit-constructor)
  Result(Error error) : error_(std::move(error)) {}  // NOLINT(google-explicit-constructor)

  bool ok() const { return value_.has_value(); }
  explicit operator bool() const { return ok(); }
  // Reading the value of an error throws (std::bad_optional_access) rather than reading garbage.
  const T& value() const& { return value_.value(); }
  T& value() & { return value_.value(); }
  T&& value() && { return std::move(value_.value()); }
  const Error& error() const { return error_; }

 private:
  std::optional<T> value_;
  Error error_;
};

using Status = Result<Unit>;

inline Status okStatus() { return Unit{}; }
inline Error fail(std::string code, std::string message) { return Error{std::move(code), std::move(message)}; }

}  // namespace livera
