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
// Anyone can send made-up usernames, so memory is bounded whatever arrives: only names checkUsername accepts are
// tracked, and at most `maxTracked` of them. When full, the record that protects least is forgotten (a stale one,
// then the unlocked one with the fewest recent failures, then the lock that ends soonest), so a flood of fresh names
// pushes out its own records before a real account's count or lock.
class LoginThrottle {
 public:
  static constexpr std::size_t kDefaultMaxTracked = 4096;
  LoginThrottle(int maxFailures, double windowSeconds, double lockSeconds, std::size_t maxTracked = kDefaultMaxTracked)
      : maxFailures_(maxFailures), window_(windowSeconds), lock_(lockSeconds), maxTracked_(maxTracked) {}
  bool locked(const std::string& username, double now) const;
  void failed(const std::string& username, double now);
  void succeeded(const std::string& username) { records_.erase(username); }
  std::size_t tracked() const { return records_.size(); }

 private:
  struct Record {
    std::deque<double> failures;
    double lockedUntil = -1;
  };
  void sweep(double now);       // drops stale records; at most once a window, so a spray costs no scan per guess
  void forgetOne(double now);   // makes room when full
  int maxFailures_;
  double window_;
  double lock_;
  std::size_t maxTracked_;
  double lastSweep_ = -1e300;
  std::map<std::string, Record> records_;
};

}  // namespace livera
