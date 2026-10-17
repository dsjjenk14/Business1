#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

#include "core/Types.h"

// Thin POSIX TCP helpers for the development transport (newline-delimited JSON).
// The production client will use Unreal's replication; see docs/MULTIPLAYER.md.
namespace livera::net {

inline constexpr std::size_t kMaxLineBytes = 16 * 1024;

class Fd {
 public:
  Fd() = default;
  explicit Fd(int fd) : fd_(fd) {}
  ~Fd() { reset(); }
  Fd(Fd&& o) noexcept : fd_(o.fd_) { o.fd_ = -1; }
  Fd& operator=(Fd&& o) noexcept {
    if (this != &o) {
      reset();
      fd_ = o.fd_;
      o.fd_ = -1;
    }
    return *this;
  }
  Fd(const Fd&) = delete;
  Fd& operator=(const Fd&) = delete;
  int get() const { return fd_; }
  bool valid() const { return fd_ >= 0; }
  void reset();

 private:
  int fd_ = -1;
};

Result<Fd> listenTcp(const std::string& bindAddress, std::uint16_t port, int backlog = 16);
std::uint16_t localPort(const Fd& fd);
Result<Fd> connectTcp(const std::string& host, std::uint16_t port);
Status setNonBlocking(const Fd& fd);

// Accumulates bytes and splits them into lines. Rejects lines over kMaxLineBytes so a
// client cannot make the server buffer unbounded data.
class LineBuffer {
 public:
  // Returns false if the peer exceeded the line limit.
  bool append(const char* data, std::size_t n);
  std::optional<std::string> nextLine();

 private:
  std::string buf_;
};

// Blocking helpers for clients and tests.
Status sendAll(const Fd& fd, const std::string& data);
// Reads one line, waiting up to timeoutMs. Returns empty optional on timeout; error on close.
Result<std::optional<std::string>> readLine(const Fd& fd, LineBuffer& buffer, int timeoutMs);

}  // namespace livera::net
