#include "server/Auth.h"

#include <openssl/rand.h>

#include <algorithm>

namespace livera {

namespace {

constexpr std::size_t kTokenBytes = 32;
constexpr std::size_t kThrottleSweepAt = 4096;  // tracked usernames before stale records are swept

}  // namespace

bool isScriptAccount(const std::string& username) { return username.rfind(kScriptAccountPrefix, 0) == 0; }

Status checkUsername(const std::string& username) {
  const bool charsOk = std::all_of(username.begin(), username.end(), [](char ch) {
    return (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '_';
  });
  if (!charsOk || username.size() < 3 || username.size() > 24)
    return fail("invalid_username", "use 3-24 lowercase letters, digits or underscores");
  return okStatus();
}

Status checkPassword(const std::string& password) {
  if (password.size() < 8 || password.size() > 128) return fail("invalid_password", "use 8-128 characters");
  return okStatus();
}

Result<std::string> SessionTokens::issue(const std::string& username, double now) {
  unsigned char raw[kTokenBytes];
  // Never fall back to a weaker source: no token is better than a guessable one.
  if (RAND_bytes(raw, static_cast<int>(kTokenBytes)) != 1) return fail("internal", "could not make a session token");
  static const char* kHex = "0123456789abcdef";
  std::string token;
  token.reserve(kTokenBytes * 2);
  for (unsigned char b : raw) {
    token += kHex[b >> 4];
    token += kHex[b & 0xF];
  }
  std::erase_if(tokens_, [&](const auto& kv) { return now - kv.second.issuedAt >= lifetime_; });
  for (;;) {
    std::size_t mine = 0;
    auto oldest = tokens_.end();
    for (auto it = tokens_.begin(); it != tokens_.end(); ++it) {
      if (it->second.username != username) continue;
      ++mine;
      if (oldest == tokens_.end() || it->second.issuedAt < oldest->second.issuedAt) oldest = it;
    }
    if (mine < perUser_ || oldest == tokens_.end()) break;
    tokens_.erase(oldest);
  }
  tokens_[token] = Entry{username, now};
  return token;
}

std::optional<std::string> SessionTokens::resolve(const std::string& token, double now) {
  auto it = tokens_.find(token);
  if (it == tokens_.end()) return std::nullopt;
  if (now - it->second.issuedAt >= lifetime_) {
    tokens_.erase(it);
    return std::nullopt;
  }
  return it->second.username;
}

void SessionTokens::revoke(const std::string& token) { tokens_.erase(token); }

bool LoginThrottle::locked(const std::string& username, double now) const {
  auto it = records_.find(username);
  return it != records_.end() && now < it->second.lockedUntil;
}

void LoginThrottle::failed(const std::string& username, double now) {
  if (records_.size() >= kThrottleSweepAt) sweep(now);
  Record& r = records_[username];
  if (now < r.lockedUntil) return;  // already locked; guesses during a lock don't extend it
  while (!r.failures.empty() && now - r.failures.front() >= window_) r.failures.pop_front();
  r.failures.push_back(now);
  if (static_cast<int>(r.failures.size()) >= maxFailures_) {
    r.lockedUntil = now + lock_;
    r.failures.clear();
  }
}

void LoginThrottle::sweep(double now) {
  std::erase_if(records_, [&](const auto& kv) {
    const Record& r = kv.second;
    return now >= r.lockedUntil && (r.failures.empty() || now - r.failures.back() >= window_);
  });
}

}  // namespace livera
