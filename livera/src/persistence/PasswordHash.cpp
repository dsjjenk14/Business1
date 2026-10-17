#include "persistence/PasswordHash.h"

#include <openssl/crypto.h>
#include <openssl/evp.h>
#include <openssl/rand.h>

#include <stdexcept>
#include <vector>

namespace livera {

namespace {

constexpr int kSaltBytes = 16;
constexpr int kHashBytes = 32;

std::string toHex(const unsigned char* data, std::size_t n) {
  static const char* digits = "0123456789abcdef";
  std::string out;
  out.reserve(n * 2);
  for (std::size_t i = 0; i < n; ++i) {
    out.push_back(digits[data[i] >> 4]);
    out.push_back(digits[data[i] & 0xF]);
  }
  return out;
}

std::vector<unsigned char> fromHex(const std::string& hex) {
  auto nibble = [](char c) -> int {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
  };
  std::vector<unsigned char> out;
  if (hex.size() % 2) return out;
  for (std::size_t i = 0; i < hex.size(); i += 2) {
    const int hi = nibble(hex[i]);
    const int lo = nibble(hex[i + 1]);
    if (hi < 0 || lo < 0) return {};
    out.push_back(static_cast<unsigned char>(hi << 4 | lo));
  }
  return out;
}

std::vector<unsigned char> derive(const std::string& password, const std::vector<unsigned char>& salt, int iterations) {
  std::vector<unsigned char> out(kHashBytes);
  if (PKCS5_PBKDF2_HMAC(password.data(), static_cast<int>(password.size()), salt.data(), static_cast<int>(salt.size()),
                        iterations, EVP_sha256(), kHashBytes, out.data()) != 1) {
    throw std::runtime_error("PBKDF2 failed");
  }
  return out;
}

}  // namespace

PasswordRecord hashPassword(const std::string& password, int iterations) {
  std::vector<unsigned char> salt(kSaltBytes);
  if (RAND_bytes(salt.data(), kSaltBytes) != 1) throw std::runtime_error("RAND_bytes failed");
  const auto hash = derive(password, salt, iterations);
  return PasswordRecord{toHex(salt.data(), salt.size()), toHex(hash.data(), hash.size()), iterations};
}

bool verifyPassword(const std::string& password, const PasswordRecord& record) {
  const auto salt = fromHex(record.saltHex);
  const auto expected = fromHex(record.hashHex);
  if (salt.empty() || expected.size() != kHashBytes || record.iterations <= 0) return false;
  const auto actual = derive(password, salt, record.iterations);
  return CRYPTO_memcmp(actual.data(), expected.data(), kHashBytes) == 0;
}

}  // namespace livera
