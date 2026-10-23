#include "net/Socket.h"

#include <arpa/inet.h>
#include <fcntl.h>
#include <netdb.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <poll.h>
#include <sys/socket.h>
#include <unistd.h>

#include <cerrno>
#include <cstring>

namespace livera::net {

void Fd::reset() {
  if (fd_ >= 0) ::close(fd_);
  fd_ = -1;
}

Status setNonBlocking(const Fd& fd) {
  const int flags = ::fcntl(fd.get(), F_GETFL, 0);
  if (flags < 0 || ::fcntl(fd.get(), F_SETFL, flags | O_NONBLOCK) < 0)
    return fail("net_error", std::string("fcntl: ") + std::strerror(errno));
  return okStatus();
}

Result<Fd> listenTcp(const std::string& bindAddress, std::uint16_t port, int backlog) {
  Fd fd(::socket(AF_INET, SOCK_STREAM, 0));
  if (!fd.valid()) return fail("net_error", std::string("socket: ") + std::strerror(errno));
  const int one = 1;
  ::setsockopt(fd.get(), SOL_SOCKET, SO_REUSEADDR, &one, sizeof one);
  sockaddr_in addr{};
  addr.sin_family = AF_INET;
  addr.sin_port = htons(port);
  if (::inet_pton(AF_INET, bindAddress.c_str(), &addr.sin_addr) != 1)
    return fail("net_error", "invalid bind address " + bindAddress);
  if (::bind(fd.get(), reinterpret_cast<sockaddr*>(&addr), sizeof addr) < 0)
    return fail("net_error", std::string("bind: ") + std::strerror(errno));
  if (::listen(fd.get(), backlog) < 0) return fail("net_error", std::string("listen: ") + std::strerror(errno));
  if (Status s = setNonBlocking(fd); !s) return s.error();
  return fd;
}

std::uint16_t localPort(const Fd& fd) {
  sockaddr_in addr{};
  socklen_t len = sizeof addr;
  if (::getsockname(fd.get(), reinterpret_cast<sockaddr*>(&addr), &len) < 0) return 0;
  return ntohs(addr.sin_port);
}

Result<Fd> connectTcp(const std::string& host, std::uint16_t port) {
  addrinfo hints{};
  hints.ai_family = AF_INET;
  hints.ai_socktype = SOCK_STREAM;
  addrinfo* res = nullptr;
  const std::string service = std::to_string(port);
  if (::getaddrinfo(host.c_str(), service.c_str(), &hints, &res) != 0 || !res)
    return fail("net_error", "cannot resolve " + host);
  Fd fd(::socket(res->ai_family, res->ai_socktype, res->ai_protocol));
  const int rc = fd.valid() ? ::connect(fd.get(), res->ai_addr, res->ai_addrlen) : -1;
  ::freeaddrinfo(res);
  if (rc < 0) return fail("net_error", std::string("connect: ") + std::strerror(errno));
  const int one = 1;
  ::setsockopt(fd.get(), IPPROTO_TCP, TCP_NODELAY, &one, sizeof one);
  return fd;
}

bool LineBuffer::append(const char* data, std::size_t n) {
  buf_.append(data, n);
  const auto nl = buf_.find('\n');
  // Over the limit with no complete line in sight: the peer is misbehaving.
  return !(buf_.size() > max_ && (nl == std::string::npos || nl > max_));
}

std::optional<std::string> LineBuffer::nextLine() {
  const auto nl = buf_.find('\n');
  if (nl == std::string::npos) return std::nullopt;
  std::string line = buf_.substr(0, nl);
  buf_.erase(0, nl + 1);
  if (!line.empty() && line.back() == '\r') line.pop_back();
  return line;
}

Status sendAll(const Fd& fd, const std::string& data) {
  std::size_t sent = 0;
  while (sent < data.size()) {
    const ssize_t n = ::send(fd.get(), data.data() + sent, data.size() - sent, MSG_NOSIGNAL);
    if (n < 0) {
      if (errno == EINTR) continue;
      if (errno == EAGAIN || errno == EWOULDBLOCK) {
        pollfd p{fd.get(), POLLOUT, 0};
        ::poll(&p, 1, 1000);
        continue;
      }
      return fail("net_error", std::string("send: ") + std::strerror(errno));
    }
    sent += static_cast<std::size_t>(n);
  }
  return okStatus();
}

Result<std::optional<std::string>> readLine(const Fd& fd, LineBuffer& buffer, int timeoutMs) {
  if (auto line = buffer.nextLine()) return std::optional<std::string>(std::move(line));
  pollfd p{fd.get(), POLLIN, 0};
  const int rc = ::poll(&p, 1, timeoutMs);
  if (rc < 0) return fail("net_error", std::string("poll: ") + std::strerror(errno));
  if (rc == 0) return std::optional<std::string>();
  char buf[4096];
  const ssize_t n = ::recv(fd.get(), buf, sizeof buf, 0);
  if (n == 0) return fail("disconnected", "server closed the connection");
  if (n < 0) return fail("net_error", std::string("recv: ") + std::strerror(errno));
  if (!buffer.append(buf, static_cast<std::size_t>(n))) return fail("protocol_error", "line too long");
  return std::optional<std::string>(buffer.nextLine());
}

}  // namespace livera::net
