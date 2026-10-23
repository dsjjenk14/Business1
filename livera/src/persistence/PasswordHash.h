#pragma once

#include <string>

namespace livera {

// PBKDF2-HMAC-SHA256 with a per-account random salt. Passwords are never stored or logged.
struct PasswordRecord {
  std::string saltHex;
  std::string hashHex;
  int iterations = 0;
};

inline constexpr int kDefaultPasswordIterations = 210000;

PasswordRecord hashPassword(const std::string& password, int iterations = kDefaultPasswordIterations);
bool verifyPassword(const std::string& password, const PasswordRecord& record);

}  // namespace livera
