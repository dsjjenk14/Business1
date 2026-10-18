#pragma once

#include <cstddef>
#include <deque>
#include <map>
#include <optional>
#include <string>

#include "core/Types.h"

namespace livera {

// Accounts named bot_* belong to scripts (the town director). The server labels what they play and
// never lets them claim a character, so a script can't pass as a person or squat on someone's character.
inline constexpr const char* kScriptAccountPrefix = "bot_";
bool isScriptAccount(const std::string& username);

// The rules `register` and the --add-account admin command share. Script names pass here; `register`
// refuses them separately, because only the server's operator may make a script account.
Status checkUsername(const std::string& username);  // 3-24 lowercase letters, digits or underscores
Status checkPassword(const std::string& password);  // 8-128 characters

// Resume tokens: a client keeps one instead of the password and sends `resume` after a dropped
// connection. 32 random bytes (OpenSSL RAND_bytes) as hex. Held in memory only, so a server restart
// forgets them all and clients fall back to the password. Times are monotonic seconds.
class SessionTokens {
 public:
  SessionTokens(double lifetimeSeconds, std::size_t perUser) : lifetime_(lifetimeSeconds), perUser_(perUser) {}
  // A new token for `username`; the user's oldest is dropped past `perUser`.
  Result<std::string> issue(const std::string& username, double now);
  // The account a live token belongs to; expired tokens are forgotten here.
  std::optional<std::string> resolve(const std::string& token, double now);
  void revoke(const std::string& token);
  std::size_t count() const { return tokens_.size(); }

 private:
  struct Entry {
    std::string username;
    double issuedAt = 0;
  };
  double lifetime_;
  std::size_t perUser_;
  std::map<std::string, Entry> tokens_;
};

// Password guessing, per username: after `maxFailures` wrong passwords within `windowSeconds`, every
// login for that name is refused for `lockSeconds`, right password or not. In memory only.
class LoginThrottle {
 public:
  LoginThrottle(int maxFailures, double windowSeconds, double lockSeconds)
      : maxFailures_(maxFailures), window_(windowSeconds), lock_(lockSeconds) {}
  bool locked(const std::string& username, double now) const;
  void failed(const std::string& username, double now);
  void succeeded(const std::string& username) { records_.erase(username); }
  std::size_t tracked() const { return records_.size(); }

 private:
  struct Record {
    std::deque<double> failures;
    double lockedUntil = -1;
  };
  void sweep(double now);  // bounds memory when someone sprays made-up usernames
  int maxFailures_;
  double window_;
  double lock_;
  std::map<std::string, Record> records_;
};

}  // namespace livera
